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
import styles from "./invoice.module.css";

const BILLING_SNAPSHOT_PREFIX = "landview_billing_snapshot_v2:";
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

  async function load(event: FormEvent) {
    event.preventDefault();
    const id = normalizeFileId(fileId);
    if (!id) return setError("Select a project from File List or enter a File ID such as LV-209.");
    const version = ++request.current;
    setError(""); setVerificationUrl(""); setVerificationError("");

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

  return (
    <div className={styles.workspace}>
      <div className={styles.header}>
        <div>
          <Link href="/admin/finance">← Billing</Link>
          <span className={styles.eyebrow}>LAND VIEW / BILLING</span>
          <h1>LV-Auto Invoice</h1>
          <p>Select a project from Billing → File List and generate its live billing statement.</p>
        </div>
        {result && <button className={styles.printButton} type="button" onClick={() => printBillingPdf(result)}>Print / Save PDF</button>}
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
      {result && <ProjectBillingDocument result={result} verificationUrl={verificationUrl} verificationError={verificationError} />}
    </div>
  );
}
