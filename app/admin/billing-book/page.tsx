"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChangeEvent, useEffect, useMemo, useState } from "react";

import { EmptyState, LoadingState, Money, PageHeader, StatCard } from "@/components/lv-ui";
import { BillingBookData, landViewApi } from "@/lib/api";
import { LegacyBillingImport, parseLegacyBillingWorkbook } from "@/lib/legacy-billing-import";

type ImportProgress = { current: number; total: number; label: string };

const BATCH_SIZE = 25;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function backendNeedsUpdate(error: unknown) {
  return errorMessage(error, "").toLowerCase().includes("unknown action");
}

function countRows(data: LegacyBillingImport) {
  return data.projects.length + data.bills.length + data.payments.length;
}

async function importRows(
  data: LegacyBillingImport,
  onProgress: (progress: ImportProgress) => void
) {
  const groups = [
    { kind: "projects" as const, label: "projects", rows: data.projects },
    { kind: "bills" as const, label: "bills", rows: data.bills },
    { kind: "payments" as const, label: "payments", rows: data.payments },
  ];
  const total = countRows(data);
  let current = 0;
  let created = 0;
  let updated = 0;

  for (const group of groups) {
    for (let index = 0; index < group.rows.length; index += BATCH_SIZE) {
      const batch = group.rows.slice(index, index + BATCH_SIZE);
      onProgress({ current, total, label: `Importing ${group.label}…` });
      const result = await landViewApi.importLegacyBillingBatch(group.kind, batch);
      created += result.created || 0;
      updated += result.updated || 0;
      current += batch.length;
      onProgress({ current, total, label: `Imported ${current} of ${total} records` });
    }
  }
  return { created, updated };
}

export default function BillingBookPage() {
  const router = useRouter();
  const [data, setData] = useState<BillingBookData | null>(null);
  const [preview, setPreview] = useState<LegacyBillingImport | null>(null);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(await landViewApi.getBillingBook());
    } catch (err: unknown) {
      if (backendNeedsUpdate(err)) {
        router.replace("/admin/finance");
        return;
      }
      setError(errorMessage(err, "Could not load the billing book."));
    } finally {
      setLoading(false);
    }
  }

  // The first request synchronizes this client page with the live billing ledger.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setParsing(true);
    setError("");
    setSuccess("");
    try {
      const parsed = parseLegacyBillingWorkbook(await file.arrayBuffer());
      if (!countRows(parsed)) throw new Error("No LAND VIEW billing records were found in this workbook.");
      setPreview(parsed);
      setFileName(file.name);
    } catch (err: unknown) {
      setPreview(null);
      setFileName("");
      setError(errorMessage(err, "This workbook could not be read."));
    } finally {
      setParsing(false);
      event.target.value = "";
    }
  }

  async function startImport() {
    if (!preview || importing) return;
    setImporting(true);
    setError("");
    setSuccess("");
    try {
      const result = await importRows(preview, setProgress);
      setSuccess(`Import complete: ${result.created} records created and ${result.updated} existing records updated.`);
      setPreview(null);
      setFileName("");
      await load();
    } catch (err: unknown) {
      if (backendNeedsUpdate(err)) {
        router.replace("/admin/finance");
        return;
      }
      setError(`${errorMessage(err, "Import failed.")} Completed batches are safe; choose the same file again to resume without duplicates.`);
    } finally {
      setImporting(false);
    }
  }

  const sortedProjects = useMemo(
    () => [...(data?.projects || [])].sort((a, b) => b.due - a.due),
    [data]
  );

  return (
    <>
      <PageHeader
        eyebrow="Finance control"
        title="Billing Book"
        description="Project bills, discounts, deposits and outstanding balances, migrated from the LAND VIEW Excel billing book."
        action={<Link href="/admin/finance" className="btn btn-light">Open Finance</Link>}
      />

      {error && <div className="notice error"><strong>Unable to continue</strong><span>{error}</span></div>}
      {success && <div className="notice success"><strong>Import completed</strong><span>{success}</span></div>}

      <section className="card form-card" style={{ marginBottom: 24 }}>
        <div className="section-title">
          <div><span>EXCEL MIGRATION</span><h2>Import the legacy billing workbook</h2></div>
        </div>
        <p>Select the original <strong>.xlsm</strong> or <strong>.xlsx</strong> file. It is read in your browser; projects, bills and deposits are then saved to the protected Google Sheets backend.</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", marginTop: 18 }}>
          <label className="btn btn-dark" style={{ cursor: parsing || importing ? "wait" : "pointer" }}>
            {parsing ? "Reading workbook…" : "Choose Excel workbook"}
            <input type="file" accept=".xlsm,.xlsx" onChange={selectFile} disabled={parsing || importing} hidden />
          </label>
          {preview && (
            <button className="btn btn-accent" onClick={startImport} disabled={importing}>
              {importing ? "Importing…" : "Import records"}
            </button>
          )}
        </div>

        {preview && (
          <div className="notice" style={{ marginTop: 18 }}>
            <strong>{fileName}</strong>
            <span>{preview.projects.length} projects · {preview.bills.length} bills · {preview.payments.length} deposits</span>
          </div>
        )}
        {progress && importing && (
          <div style={{ marginTop: 18 }}>
            <div className="progress"><span style={{ width: `${progress.total ? Math.round(progress.current / progress.total * 100) : 0}%` }} /></div>
            <small>{progress.label}</small>
          </div>
        )}
      </section>

      {loading ? <LoadingState label="Loading billing book…" /> : data ? (
        <>
          <section className="stats-grid">
            <StatCard label="Gross bills" value={<Money value={data.totals.gross} />} detail={`${data.billCount} bill lines`} icon="৳" />
            <StatCard label="Discounts" value={<Money value={data.totals.discount} />} detail="Approved reductions" icon="−" />
            <StatCard label="Deposits" value={<Money value={data.totals.paid} />} detail={`${data.paymentCount} payment records`} icon="✓" />
            <StatCard label="Total due" value={<Money value={data.totals.due} />} detail="Net bills less deposits" icon="!" />
          </section>

          <section className="card table-card" style={{ marginTop: 24 }}>
            <div className="section-title"><div><span>CATEGORY SUMMARY</span><h2>Billing by service</h2></div></div>
            {data.categories.length ? <div className="table-scroll"><table>
              <thead><tr><th>Service</th><th>Gross</th><th>Discount</th><th>Net bill</th><th>Deposits</th><th>Due</th></tr></thead>
              <tbody>{data.categories.map((item) => <tr key={item.category}>
                <td><strong>{item.category}</strong></td><td><Money value={item.gross} /></td><td><Money value={item.discount} /></td><td><Money value={item.billed} /></td><td><Money value={item.paid} /></td><td><strong><Money value={item.due} /></strong></td>
              </tr>)}</tbody>
            </table></div> : <EmptyState title="No billing records" text="Import the legacy workbook to populate this summary." />}
          </section>

          <section className="card table-card" style={{ marginTop: 24 }}>
            <div className="section-title"><div><span>PROJECT LEDGER</span><h2>Project balances</h2></div></div>
            {sortedProjects.length ? <div className="table-scroll"><table>
              <thead><tr><th>Project</th><th>Client</th><th>Gross</th><th>Discount</th><th>Deposits</th><th>Due</th></tr></thead>
              <tbody>{sortedProjects.map((project) => <tr key={project.projectId}>
                <td><Link href={`/admin/projects/${encodeURIComponent(project.projectId)}`}><strong>{project.projectId}</strong><br /><small>{project.projectName}</small></Link></td>
                <td>{project.clientName || "—"}</td><td><Money value={project.gross} /></td><td><Money value={project.discount} /></td><td><Money value={project.paid} /></td><td><strong><Money value={project.due} /></strong></td>
              </tr>)}</tbody>
            </table></div> : <EmptyState title="No project balances" text="Choose the LAND VIEW workbook above to begin the migration." />}
          </section>
        </>
      ) : null}
    </>
  );
}
