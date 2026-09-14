"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { landViewApi, type FinanceSheetData } from "@/lib/api";
import {
  buildSheetInvoices,
  invoiceTabs,
  normalizeFileId,
  verifySheetInvoicesWithPayments,
  type SheetInvoices,
} from "@/lib/sheet-invoices";
import ProjectBillingDocument, {
  billingVerificationSnapshot,
  printBillingPdf,
} from "@/components/project-billing-document";
import styles from "./invoice.module.css";

async function loadFinanceTabs() {
  const results: FinanceSheetData[] = new Array(invoiceTabs.length);
  let cursor = 0;
  async function worker() {
    while (cursor < invoiceTabs.length) {
      const index = cursor++;
      results[index] = await landViewApi.getFinanceSheet(invoiceTabs[index]);
    }
  }
  await Promise.all(Array.from({ length: 3 }, () => worker()));
  return results;
}

type FileListProject = {
  id: string;
  name: string;
  type: string;
  floor: string;
};

export default function ProjectBillingPage() {
  const [fileId, setFileId] = useState("");
  const [result, setResult] = useState<SheetInvoices | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [verificationUrl, setVerificationUrl] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const [fileListProjects, setFileListProjects] = useState<FileListProject[]>([]);
  const [fileListLoading, setFileListLoading] = useState(true);
  const [fileListError, setFileListError] = useState("");
  const request = useRef(0);

  useEffect(() => {
    let active = true;
    async function loadProjects() {
      setFileListLoading(true);
      setFileListError("");
      try {
        const sheet = await landViewApi.getFinanceSheet("File List");
        if (!active) return;
        const projects = (sheet.rows || [])
          .map((row): FileListProject | null => {
            const normalized = normalizeFileId(String(row[0] || ""));
            if (!normalized) return null;
            return {
              id: `LV-${normalized}`,
              name: String(row[1] || "").trim(),
              floor: String(row[4] || "").trim(),
              type: String(row[5] || "").trim(),
            };
          })
          .filter((item): item is FileListProject => Boolean(item))
          .sort((a, b) => Number(b.id.replace("LV-", "")) - Number(a.id.replace("LV-", "")));
        setFileListProjects(projects);
      } catch (err) {
        if (active) setFileListError(err instanceof Error ? err.message : "Could not load projects from File List.");
      } finally {
        if (active) setFileListLoading(false);
      }
    }
    void loadProjects();
    return () => { active = false; };
  }, []);

  async function createVerification(billing: SheetInvoices, version: number) {
    try {
      const response = await fetch("/api/billing-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileId: billing.id,
          billing: billingVerificationSnapshot(billing),
        }),
      });
      const json = await response.json();
      if (!response.ok || !json?.success || !json?.url) throw new Error(json?.error || "Could not create verification link.");
      if (request.current === version) setVerificationUrl(String(json.url));
    } catch (err) {
      if (request.current === version) setVerificationError(err instanceof Error ? err.message : "Could not create verification link.");
    }
  }

  async function load(event: FormEvent) {
    event.preventDefault();
    const id = normalizeFileId(fileId);
    if (!id) return setError("Select a project from File List or enter a File ID such as LV-209.");
    const version = ++request.current;
    setBusy(true);
    setError("");
    setResult(null);
    setVerificationUrl("");
    setVerificationError("");

    try {
      const [financeTabs, databasePayments] = await Promise.all([
        loadFinanceTabs(),
        landViewApi.getPayments(`LV-${id}`).catch(() => [] as Record<string, unknown>[]),
      ]);
      const billing = verifySheetInvoicesWithPayments(buildSheetInvoices(financeTabs, id), databasePayments);
      if (version === request.current) {
        setResult(billing);
        void createVerification(billing, version);
      }
    } catch (err) {
      if (version === request.current) setError(err instanceof Error ? err.message : "Could not load project billing.");
    } finally {
      if (version === request.current) setBusy(false);
    }
  }

  return (
    <div className={styles.workspace}>
      <div className={styles.header}>
        <div>
          <Link href="/admin/finance">← Finance</Link>
          <span className={styles.eyebrow}>LAND VIEW / ACCOUNTS</span>
          <h1>LV-Auto Invoice</h1>
          <p>Select a project from Finance → File List and generate its live billing statement.</p>
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
            setFileId(event.target.value);
            setResult(null);
            setError("");
            setVerificationUrl("");
            setVerificationError("");
            request.current++;
            setBusy(false);
          }}
          required
          autoComplete="off"
        />
        <datalist id="billing-project-list">
          {fileListProjects.map((project) => <option key={project.id} value={project.id}>{[project.name, project.type, project.floor].filter(Boolean).join(" · ")}</option>)}
        </datalist>
        <button disabled={busy}>{busy ? "Loading…" : "View billing"}</button>
        <span style={{ width: "100%", fontSize: 10, color: fileListError ? "#ffb4aa" : "#94a3ad" }}>
          {fileListError ? `File List unavailable: ${fileListError}` : fileListLoading ? "Loading project register…" : `${fileListProjects.length} projects pulled from Finance → File List`}
        </span>
      </form>

      {error && <div className={styles.error} role="alert">{error}</div>}
      {busy && <div className={styles.loading} role="status">Pulling bill and deposit records…</div>}
      {result && <ProjectBillingDocument result={result} verificationUrl={verificationUrl} verificationError={verificationError} />}
    </div>
  );
}
