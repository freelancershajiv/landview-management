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
  printBillingPdf,
} from "@/components/project-billing-document";
import EmailInvoiceButton from "@/components/email-invoice-button";
import WhatsAppInvoiceButton from "@/components/whatsapp-invoice-button";
import { saveBillingJpg } from "@/lib/save-document-jpg";
import styles from "./invoice.module.css";

const BILLING_SNAPSHOT_PREFIX = "landview_billing_snapshot_v4:";
const BILLING_SNAPSHOT_TTL_MS = 0;

type BillingSnapshot = { savedAt: number; billing: SheetInvoices };
type ProjectBillingBundle = {
  projectId: string;
  sheets: FinanceSheetData[];
  payments: Record<string, unknown>[];
  updatedAt?: string;
  mode?: string;
};
type FileListProject = { id: string; name: string; type: string; floor: string };
type SingleBillOption = {
  key: string;
  categoryIndex: number;
  itemIndex: number;
  categoryName: string;
  service: string;
  amount: number;
  discount: number;
  netAmount: number;
  status: string;
};
type ReceivableBillItem = SheetInvoices["invoices"][number]["items"][number] & {
  billId?: string;
  billPaidAmount?: number;
  billDueAmount?: number;
};

function snapshotKey(id: string) {
  return `${BILLING_SNAPSHOT_PREFIX}LV-${id}`;
}

function readBillingSnapshot(id: string): SheetInvoices | null {
  try {
    const raw = sessionStorage.getItem(snapshotKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BillingSnapshot;
    if (!parsed?.billing?.id || !parsed.savedAt || BILLING_SNAPSHOT_TTL_MS <= 0 || Date.now() - parsed.savedAt > BILLING_SNAPSHOT_TTL_MS) {
      sessionStorage.removeItem(snapshotKey(id));
      return null;
    }
    return parsed.billing;
  } catch { return null; }
}

function saveBillingSnapshot(id: string, billing: SheetInvoices) {
  if (BILLING_SNAPSHOT_TTL_MS <= 0) return;
  try { sessionStorage.setItem(snapshotKey(id), JSON.stringify({ savedAt: Date.now(), billing } satisfies BillingSnapshot)); }
  catch {}
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyValue(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizedService(value: unknown) {
  return String(value ?? "")
    .replace(/^\[(Engineering Bill|Design Books|Supervision Bill|Other Services Bill)\]\s*/i, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function attachCanonicalBillAmounts(billing: SheetInvoices, sheets: FinanceSheetData[], id: string) {
  const tabByCategory: Record<string, string> = {
    Engineering: "Design Bill",
    "Design Books": "Design Books Bill",
    Supervision: "Supervision Bill",
    Others: "Others Bill",
  };
  const normalizedId = normalizeFileId(id);

  for (const category of billing.invoices) {
    const tabName = tabByCategory[category.name];
    if (!tabName) continue;
    const source = sheets.find((sheet) => sheet.tab === tabName);
    if (!source) continue;
    const rows = (source.rows || []).filter((row) => normalizeFileId(String(row[0] || "")) === normalizedId);
    const used = new Set<number>();

    for (const item of category.items) {
      const targetService = normalizedService(item.service);
      const targetAmount = numberValue(item.amount);
      const index = rows.findIndex((row, rowIndex) => {
        if (used.has(rowIndex)) return false;
        if (normalizedService(row[1]) !== targetService) return false;
        const rowAmount = moneyValue(row[4]);
        return Number.isFinite(rowAmount) && Math.abs(rowAmount - targetAmount) < 0.01;
      });
      if (index < 0) continue;
      used.add(index);
      const row = rows[index];
      const paid = moneyValue(row[9]);
      const due = moneyValue(row[10]);
      const extended = item as ReceivableBillItem;
      extended.billId = String(row[5] || "").trim();
      if (Number.isFinite(paid)) extended.billPaidAmount = Math.max(0, paid);
      if (Number.isFinite(due)) extended.billDueAmount = Math.max(0, due);
    }
  }
  return billing;
}

function singleBillAmounts(item: SheetInvoices["invoices"][number]["items"][number]) {
  const amount = Math.max(0, numberValue(item.amount));
  const explicitDiscount = Number(item.billDiscount);
  const explicitNet = Number(item.billNetAmount);
  const discount = Number.isFinite(explicitDiscount)
    ? Math.max(0, explicitDiscount)
    : Number.isFinite(explicitNet)
      ? Math.max(0, amount - explicitNet)
      : 0;
  const netAmount = Number.isFinite(explicitNet)
    ? Math.max(0, explicitNet)
    : Math.max(0, amount - discount);
  return { amount, discount, netAmount };
}

function singleBillOptions(result: SheetInvoices): SingleBillOption[] {
  const options: SingleBillOption[] = [];
  result.invoices.forEach((category, categoryIndex) => {
    category.items.forEach((item, itemIndex) => {
      const values = singleBillAmounts(item);
      if (values.amount <= 0.009) return;
      options.push({
        key: `${categoryIndex}:${itemIndex}`,
        categoryIndex,
        itemIndex,
        categoryName: category.name,
        service: String(item.service || `${category.name} Bill`).trim() || `${category.name} Bill`,
        amount: values.amount,
        discount: values.discount,
        netAmount: values.netAmount,
        status: String(item.billStatus || "").trim(),
      });
    });
  });
  return options;
}

function buildSingleBill(result: SheetInvoices, selectionKey: string): SheetInvoices | null {
  const [categoryIndexText, itemIndexText] = selectionKey.split(":");
  const categoryIndex = Number(categoryIndexText);
  const itemIndex = Number(itemIndexText);
  if (!Number.isInteger(categoryIndex) || !Number.isInteger(itemIndex)) return null;

  const category = result.invoices[categoryIndex];
  const item = category?.items?.[itemIndex];
  if (!category || !item) return null;

  const { amount, discount, netAmount } = singleBillAmounts(item);
  const status = String(item.billStatus || "").trim().toLowerCase();
  const fullyPaid = ["paid", "fully paid", "full paid", "settled", "complete", "completed"].includes(status);
  const receivableItem = item as ReceivableBillItem;
  const explicitPaid = Number(receivableItem.billPaidAmount);
  const explicitDue = Number(receivableItem.billDueAmount);
  const paid = Number.isFinite(explicitPaid)
    ? Math.min(netAmount, Math.max(0, explicitPaid))
    : fullyPaid ? netAmount : 0;
  const due = Number.isFinite(explicitDue)
    ? Math.min(netAmount, Math.max(0, explicitDue))
    : Math.max(0, netAmount - paid);
  const serviceName = String(item.service || category.name || "Single Bill").trim() || "Single Bill";

  const singleCategory = {
    ...category,
    name: serviceName,
    items: [item],
    payments: [],
    gross: amount,
    discount,
    paid,
    due,
  };

  return {
    ...result,
    invoices: [singleCategory],
    totals: {
      ...result.totals,
      gross: amount,
      discount,
      paid,
      due,
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
  const [singleBillSelection, setSingleBillSelection] = useState("");
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
    const billing = attachCanonicalBillAmounts(
      mergeBillingWorkspaceBills(buildSheetInvoices(bundle.sheets, id), databaseBills),
      bundle.sheets,
      id,
    );
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
    setSingleBillOpen(false); setSingleBillSelection(""); setSingleBillPrint(null);

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
      setSingleBillSelection("");
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
    if (!result || refreshing) return;
    const available = singleBillOptions(result);
    setDueOnly(false);
    setSingleBillSelection(available.length === 1 ? available[0].key : "");
    setSingleBillOpen(true);
  }

  function generateSingleBill() {
    if (!result || !singleBillSelection) return;
    const single = buildSingleBill(result, singleBillSelection);
    if (!single) {
      setError("The selected bill could not be generated. Refresh billing and try again.");
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
  const billOptions = result ? singleBillOptions(result) : [];

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
            <button className={styles.printButton} type="button" onClick={openSingleBillGenerator} disabled={singleBillPrint !== null || refreshing}>
              {refreshing ? "Refreshing Bills…" : singleBillPrint ? "Generating Single Bill…" : "Generate Single Bill"}
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
            setSingleBillOpen(false); setSingleBillSelection(""); setSingleBillPrint(null);
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
          <section role="dialog" aria-modal="true" aria-labelledby="single-bill-title" style={{ width: "min(680px,100%)", maxHeight: "88vh", overflow: "auto", borderRadius: 18, border: "1px solid rgba(140,160,155,.28)", background: "var(--theme-bg-_fff, #fff)", boxShadow: "0 28px 80px rgba(8,18,16,.28)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 18, alignItems: "flex-start", padding: "20px 22px 16px", borderBottom: "1px solid rgba(140,160,155,.20)" }}>
              <div>
                <span style={{ display: "block", fontSize: 10, fontWeight: 800, letterSpacing: ".12em", color: "#708078", marginBottom: 5 }}>SINGLE BILL GENERATION</span>
                <h2 id="single-bill-title" style={{ margin: 0, fontSize: 22 }}>Which individual bill do you want to generate?</h2>
                <p style={{ margin: "6px 0 0", color: "#738078", fontSize: 12 }}>Each bill entry is listed separately. Its own discount and net amount will be used for {result.id}.</p>
              </div>
              <button type="button" onClick={() => setSingleBillOpen(false)} aria-label="Close" style={{ border: 0, background: "transparent", fontSize: 26, cursor: "pointer", lineHeight: 1, color: "#64726c" }}>×</button>
            </div>

            <div style={{ padding: "16px 22px", display: "grid", gap: 10 }}>
              {billOptions.map((bill) => {
                const selected = singleBillSelection === bill.key;
                return (
                  <button
                    key={bill.key}
                    type="button"
                    onClick={() => setSingleBillSelection(bill.key)}
                    style={{ width: "100%", display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 12, textAlign: "left", padding: "14px 15px", borderRadius: 12, border: selected ? "1px solid #b51f2e" : "1px solid rgba(140,160,155,.26)", background: selected ? "rgba(181,31,46,.08)" : "transparent", color: "inherit", cursor: "pointer" }}
                  >
                    <span>
                      <strong style={{ display: "block", fontSize: 14 }}>{bill.service}</strong>
                      <small style={{ display: "block", marginTop: 4, color: "#78857f" }}>{bill.categoryName} Bill{bill.status ? ` · ${bill.status}` : ""}</small>
                    </span>
                    <span style={{ textAlign: "right" }}>
                      <strong style={{ display: "block", fontSize: 13 }}>Bill BDT {bill.amount.toLocaleString("en-BD")}</strong>
                      <small style={{ display: "block", marginTop: 4, color: bill.discount > 0.009 ? "#b51f2e" : "#68766f", fontWeight: 800 }}>
                        {bill.discount > 0.009 ? `Discount BDT ${bill.discount.toLocaleString("en-BD")} · ` : ""}Net BDT {bill.netAmount.toLocaleString("en-BD")}
                      </small>
                    </span>
                  </button>
                );
              })}
              {!billOptions.length && <div style={{ padding: 18, textAlign: "center", color: "#7a8781" }}>No individual bill entries are available for generation.</div>}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "14px 22px 20px", borderTop: "1px solid rgba(140,160,155,.20)" }}>
              <button className={styles.printButton} type="button" onClick={() => setSingleBillOpen(false)}>Cancel</button>
              <button className={styles.printButton} type="button" onClick={generateSingleBill} disabled={!singleBillSelection}>Generate Selected Bill</button>
            </div>
          </section>
        </div>
      )}

      {visibleBilling && <ProjectBillingDocument result={visibleBilling} verificationUrl={verificationUrl} verificationError={verificationError} dueOnly={Boolean(dueOnly && !singleBillPrint)} />}
    </div>
  );
}
