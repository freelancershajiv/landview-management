"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { landViewApi, type FinanceSheetData } from "@/lib/api";
import {
  buildSheetInvoices,
  mergeBillingWorkspaceBills,
  normalizeFileId,
  verifySheetInvoicesWithPayments,
  type SheetInvoices,
} from "@/lib/sheet-invoices";
import ProjectBillingDocument, {
  billingVerificationSnapshot,
  hasBillingData,
  printBillingPdf,
} from "@/components/project-billing-document";
import EmailInvoiceButton from "@/components/email-invoice-button";
import WhatsAppInvoiceButton from "@/components/whatsapp-invoice-button";
import { saveBillingJpg } from "@/lib/save-document-jpg";
import styles from "./invoice.module.css";

const BILLING_SNAPSHOT_PREFIX = "landview_billing_snapshot_v3:";
const BILLING_SNAPSHOT_TTL_MS = 10 * 60 * 1000;

type BillingSnapshot = { savedAt: number; billing: SheetInvoices };
type ProjectBillingBundle = {
  projectId: string;
  sheets: FinanceSheetData[];
  payments: Record<string, unknown>[];
  updatedAt?: string;
  mode?: string;
};
type FileListProject = { id: string; name: string; type: string; floor: string };

function snapshotKey(id: string) {
  return `${BILLING_SNAPSHOT_PREFIX}LV-${id}`;
}

function readBillingSnapshot(id: string): SheetInvoices | null {
  try {
    const raw = sessionStorage.getItem(snapshotKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BillingSnapshot;
    if (!parsed?.billing?.id || !parsed.savedAt || Date.now() - parsed.savedAt > BILLING_SNAPSHOT_TTL_MS) {
      sessionStorage.removeItem(snapshotKey(id));
      return null;
    }
    return parsed.billing;
  } catch { return null; }
}

function saveBillingSnapshot(id: string, billing: SheetInvoices) {
  try { sessionStorage.setItem(snapshotKey(id), JSON.stringify({ savedAt: Date.now(), billing } satisfies BillingSnapshot)); }
  catch {}
}

function singleBillLabel(name: string) {
  if (name === "Engineering") return "Engineering Bill";
  if (name === "Design Books") return "Design Books Bill";
  if (name === "Supervision") return "Supervision Bill";
  if (name === "Others") return "Other Services Bill";
  return `${name} Bill`;
}

function buildSingleBill(result: SheetInvoices, categoryName: string): SheetInvoices | null {
  const category = result.invoices.find((item) => item.name === categoryName && hasBillingData(item));
  if (!category) return null;
  return {
    ...result,
    invoices: [category],
    totals: {
      ...result.totals,
      gross: Number(category.gross || 0),
      discount: Number(category.discount || 0),
      paid: Number(category.paid || 0),
      due: Number(category.due || 0),
    },
  };
}

async function loadProjectBillingBundle(id: string): Promise<ProjectBillingBundle> {
  const response = await fetch(`/api/project-billing?fileId=${encodeURIComponent(`LV-${id}`)}`, {
    method: "GET", credentials: "same-origin", cache: "no-store",
  });
  let json: any = null;
  try { json = await response.json(); }
  catch { throw new Error("The billing service returned an invalid response."); }
  if (!response.ok || !json?.success || !json?.data) throw new Error(String(json?.error || "Could not load project billing."));
  if (!Array.isArray(json.data.sheets)) throw new Error("The billing service returned incomplete finance data.");
  return {
    projectId: String(json.data.projectId || `LV-${id}`),
    sheets: json.data.sheets as FinanceSheetData[],
    payments: Array.isArray(json.data.payments) ? json.data.payments : [],
    updatedAt: String(json.data.updatedAt || ""),
    mode: String(json.data.mode || ""),
  };
}

export default function ProjectBillingPage() {
  const [fileId, setFileId] = useState("");
  const [result, setResult] = useState<SheetInvoices | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [verificationUrl, setVerificationUrl] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [dueOnly, setDueOnly] = useState(false);
  const [singleBillOpen, setSingleBillOpen] = useState(false);
  const [singleBillCategory, setSingleBillCategory] = useState("");
  const [singleBillPrint, setSingleBillPrint] = useState<SheetInvoices | null>(null);
  const [fileListProjects, setFileListProjects] = useState<FileListProject[]>([]);
  const [fileListLoading, setFileListLoading] = useState(true);
  const [fileListError, setFileListError] = useState("");
  const request = useRef(0);

  useEffect(() => {
    let active = true;
    async function loadProjects() {
      setFileListLoading(true); setFileListError("");
      try {
        const sheet = await landViewApi.getFinanceSheet("File List");
        if (!active) return;
        const projects = (sheet.rows || []).map((row): FileListProject | null => {
          const normalized = normalizeFileId(String(row[0] || ""));
          if (!normalized) return null;
          return { id: `LV-${normalized}`, name: String(row[1] || "").trim(), floor: String(row[4] || "").trim(), type: String(row[5] || "").trim() };
        }).filter((item): item is FileListProject => Boolean(item)).sort((a, b) => Number(b.id.replace("LV-", "")) - Number(a.id.replace("LV-", "")));
        setFileListProjects(projects);
      } catch (err) {
        if (active) setFileListError(err instanceof Error ? err.message : "Could not load projects from File List.");
      } finally { if (active) setFileListLoading(false); }
    }
    void loadProjects();
    return () => { active = false; };
  }, []);

  async function createVerification(billing: SheetInvoices, version: number) {
    try {
      const response = await fetch("/api/billing-verification", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: billing.id, billing: billingVerificationSnapshot(billing) }),
      });
      const json = await response.json();
      if (!response.ok || !json?.success || !json?.url) throw new Error(json?.error || "Could not create verification link.");
      if (request.current === version) setVerificationUrl(String(json.url));
    } catch (err) {
      if (request.current === version) setVerificationError(err instanceof Error ? err.message : "Could not create verification link.");
    }
  }

  async function fetchFreshBilling(id: string) {
    const [bundle, databaseBills] = await Promise.all([
      loadProjectBillingBundle(id),
      landViewApi.getBillingRecords(`LV-${id}`).catch(() => [] as Record<string, unknown>[]),
    ]);
    const billing = mergeBillingWorkspaceBills(buildSheetInvoices(bundle.sheets, id), databaseBills);
    return verifySheetInvoicesWithPayments(billing, bundle.payments || []);
  }

  async function refreshBilling(id: string, version: number, background: boolean) {
    try {
      const billing = await fetchFreshBilling(id);
      if (version !== request.current) return;
      saveBillingSnapshot(id, billing);
      setResult(billing);
      setVerificationUrl(""); setVerificationError("");
      void createVerification(billing, version);
      setError("");
    } catch (err) {
      if (version !== request.current) return;
      if (!background) setError(err instanceof Error ? err.message : "Could not load project billing.");
    } finally {
      if (version === request.current) { setBusy(false); setRefreshing(false); }
    }
  }

  async function openBilling(rawId: string) {
    const id = normalizeFileId(rawId);
    if (!id) return setError("Select a project from File List or enter a File ID such as LV-209.");
    const version = ++request.current;
    setFileId(`LV-${id}`);
    setError(""); setVerificationUrl(""); setVerificationError("");
    setSingleBillOpen(false); setSingleBillCategory(""); setSingleBillPrint(null);

    const snapshot = readBillingSnapshot(id);
    if (snapshot) {
      setResult(snapshot); setBusy(false); setRefreshing(true);
      void createVerification(snapshot, version);
      void refreshBilling(id, version, true);
      return;
    }

    setResult(null); setBusy(true); setRefreshing(false);
    await refreshBilling(id, version, false);
  }

  useEffect(() => {
    if (!dueOnly || !result) return;
    const restore = () => setDueOnly(false);
    window.addEventListener("afterprint", restore, { once: true });
    const timer = window.setTimeout(() => { void printBillingPdf(result); }, 120);
    return () => { window.clearTimeout(timer); window.removeEventListener("afterprint", restore); };
  }, [dueOnly, result]);

  useEffect(() => {
    if (!singleBillPrint) return;
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      setSingleBillPrint(null);
      setSingleBillCategory("");
    };
    window.addEventListener("afterprint", restore, { once: true });
    const printTimer = window.setTimeout(() => { void printBillingPdf(singleBillPrint); }, 160);
    const fallbackTimer = window.setTimeout(restore, 60000);
    return () => {
      window.clearTimeout(printTimer);
      window.clearTimeout(fallbackTimer);
      window.removeEventListener("afterprint", restore);
    };
  }, [singleBillPrint]);

  function generateDueBill() {
    if (!result || Number(result.totals.due || 0) <= 0.009) return;
    setSingleBillOpen(false);
    setSingleBillPrint(null);
    setDueOnly(true);
  }

  function openSingleBillGenerator() {
    if (!result) return;
    const available = result.invoices.filter(hasBillingData);
    setDueOnly(false);
    setSingleBillCategory(available.length === 1 ? available[0].name : "");
    setSingleBillOpen(true);
  }

  function generateSingleBill() {
    if (!result || !singleBillCategory) return;
    const single = buildSingleBill(result, singleBillCategory);
    if (!single) {
      setError("The selected bill has no billing data to generate.");
      return;
    }
    setSingleBillOpen(false);
    setDueOnly(false);
    setSingleBillPrint(single);
  }

  async function load(event: FormEvent) {
    event.preventDefault();
    await openBilling(fileId);
  }

  useEffect(() => {
    const requested = normalizeFileId(new URLSearchParams(window.location.search).get("fileId") || "");
    if (requested) void openBilling(requested);
    // Open-on-arrival is intentionally a one-time action for Billing → Open links.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleBilling = singleBillPrint || result;
  const singleBillOptions = result?.invoices.filter(hasBillingData) || [];

  return (
    <div className={styles.workspace}>
      <div className={styles.header}>
        <div>
          <Link href="/admin/finance">← Billing</Link>
          <span className={styles.eyebrow}>LAND VIEW / BILLING</span>
          <h1>LV-Auto Invoice</h1>
          <p>Select a project from Billing → File List and generate its live billing statement.</p>
        </div>
        {result && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <EmailInvoiceButton result={result} verificationUrl={verificationUrl} className={styles.printButton} />
            <WhatsAppInvoiceButton result={result} verificationUrl={verificationUrl} className={styles.printButton} />
            <button className={styles.printButton} type="button" onClick={openSingleBillGenerator} disabled={singleBillPrint !== null}>
              {singleBillPrint ? "Generating Single Bill…" : "Generate Single Bill"}
            </button>
            {Number(result.totals.due || 0) > 0.009 && (
              <button className={styles.printButton} type="button" onClick={generateDueBill} disabled={dueOnly || singleBillPrint !== null}>
                {dueOnly ? "Generating Due Bill…" : "Generate Due Bill"}
              </button>
            )}
            <button className={styles.printButton} type="button" onClick={() => printBillingPdf(result)} disabled={singleBillPrint !== null}>Print / Save PDF</button>
            <button className={styles.printButton} type="button" onClick={() => void saveBillingJpg(result).catch((error) => window.alert(error instanceof Error ? error.message : "Could not save JPG."))} disabled={singleBillPrint !== null}>Save JPG</button>
          </div>
        )}
      </div>

      <form className={styles.lookup} onSubmit={load}>
        <label htmlFor="billing-file">Project / File ID</label>
        <input
          id="billing-file"
          list="billing-project-list"
          placeholder={fileListLoading ? "Loading projects from File List…" : "Search LV-209 or choose a project"}
          value={fileId}
          onChange={(event) => {
            setFileId(event.target.value); setResult(null); setError(""); setVerificationUrl(""); setVerificationError("");
            setSingleBillOpen(false); setSingleBillCategory(""); setSingleBillPrint(null);
            request.current++; setBusy(false); setRefreshing(false);
          }}
          required autoComplete="off"
        />
        <datalist id="billing-project-list">
          {fileListProjects.map((project) => <option key={project.id} value={project.id}>{[project.name, project.type, project.floor].filter(Boolean).join(" · ")}</option>)}
        </datalist>
        <button disabled={busy}>{busy ? "Loading…" : refreshing ? "Refreshing…" : "View billing"}</button>
        <span style={{ width: "100%", fontSize: 10, color: fileListError ? "#ffb4aa" : "#94a3ad" }}>
          {fileListError ? `File List unavailable: ${fileListError}` : fileListLoading ? "Loading project register…" : `${fileListProjects.length} projects pulled from Billing → File List`}
        </span>
      </form>

      {error && <div className={styles.error} role="alert">{error}</div>}
      {busy && <div className={styles.loading} role="status">Loading this project’s billing data…</div>}
      {refreshing && result && <div className={styles.loading} role="status">Bill opened from recent snapshot · checking latest billing and payment data in background…</div>}

      {singleBillOpen && result && (
        <div
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setSingleBillOpen(false); }}
          style={{ position: "fixed", inset: 0, zIndex: 1200, background: "rgba(8,18,16,.56)", backdropFilter: "blur(5px)", display: "grid", placeItems: "center", padding: 20 }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="single-bill-title" style={{ width: "min(620px,100%)", maxHeight: "88vh", overflow: "auto", borderRadius: 18, border: "1px solid rgba(140,160,155,.28)", background: "var(--theme-bg-_fff, #fff)", boxShadow: "0 28px 80px rgba(8,18,16,.28)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", padding: "20px 22px 16px", borderBottom: "1px solid rgba(140,160,155,.20)" }}>
              <div>
                <span style={{ display: "block", fontSize: 10, fontWeight: 800, letterSpacing: ".12em", color: "#708078", marginBottom: 5 }}>SINGLE BILL GENERATION</span>
                <h2 id="single-bill-title" style={{ margin: 0, fontSize: 22 }}>Which bill do you want to generate?</h2>
                <p style={{ margin: "6px 0 0", color: "#738078", fontSize: 12 }}>Only bills with actual billing data are shown for {result.id}.</p>
              </div>
              <button type="button" onClick={() => setSingleBillOpen(false)} aria-label="Close" style={{ border: 0, background: "transparent", fontSize: 26, cursor: "pointer", lineHeight: 1, color: "#64726c" }}>×</button>
            </div>

            <div style={{ padding: "16px 22px", display: "grid", gap: 10 }}>
              {singleBillOptions.map((category) => {
                const selected = singleBillCategory === category.name;
                return (
                  <button
                    key={category.name}
                    type="button"
                    onClick={() => setSingleBillCategory(category.name)}
                    style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 12, textAlign: "left", padding: "14px 15px", borderRadius: 12, border: selected ? "1px solid #2e715a" : "1px solid rgba(140,160,155,.26)", background: selected ? "rgba(46,113,90,.10)" : "transparent", color: "inherit", cursor: "pointer" }}
                  >
                    <span>
                      <strong style={{ display: "block", fontSize: 14 }}>{singleBillLabel(category.name)}</strong>
                      <small style={{ display: "block", marginTop: 4, color: "#78857f" }}>{category.items.length} bill item{category.items.length === 1 ? "" : "s"} · Paid BDT {Number(category.paid || 0).toLocaleString("en-BD")}</small>
                    </span>
                    <span style={{ textAlign: "right" }}>
                      <strong style={{ display: "block", fontSize: 13 }}>BDT {Number(category.gross || 0).toLocaleString("en-BD")}</strong>
                      <small style={{ display: "block", marginTop: 4, color: Number(category.due || 0) > 0.009 ? "#a44a3f" : "#2e715a", fontWeight: 800 }}>{Number(category.due || 0) > 0.009 ? `Due BDT ${Number(category.due || 0).toLocaleString("en-BD")}` : "FULL PAID"}</small>
                    </span>
                  </button>
                );
              })}
              {!singleBillOptions.length && <div style={{ padding: 18, textAlign: "center", color: "#7a8781" }}>No bill data is available for single generation.</div>}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "14px 22px 20px", borderTop: "1px solid rgba(140,160,155,.20)" }}>
              <button className={styles.printButton} type="button" onClick={() => setSingleBillOpen(false)}>Cancel</button>
              <button className={styles.printButton} type="button" onClick={generateSingleBill} disabled={!singleBillCategory}>Generate Selected Bill</button>
            </div>
          </section>
        </div>
      )}

      {visibleBilling && <ProjectBillingDocument result={visibleBilling} verificationUrl={verificationUrl} verificationError={verificationError} dueOnly={Boolean(dueOnly && !singleBillPrint)} />}
    </div>
  );
}
