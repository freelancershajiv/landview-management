"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Status = "issued" | "partial" | "paid" | "review";
type InvoiceRow = {
  invoiceCode: string; billCode: string; projectCode: string; projectName: string;
  clientName: string; service: string; category: string; issueDate: string; dueDate: string;
  amount: number; allocated: number; invoiceUnallocatedBalance: number;
  projectCollectibleDue: number; status: Status; reminderEligible: boolean;
};
type Report = {
  snapshotAt: string; complete: boolean; remindersEnabled: boolean; rows: InvoiceRow[];
  summary: {
    invoiceCount: number; invoiceValue: number; invoiceAllocated: number;
    projectBilled: number; projectPaid: number; collectibleDue: number; availableAdvances: number;
    engineeringDue: number; supervisionDue: number; otherDue: number;
    counts: Record<Status, number>;
  };
};
const money = (n: number) => "৳" + Number(n || 0).toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const statusNames: Record<Status, string> = {
  issued: "Issued", partial: "Partially paid", paid: "Paid", review: "Historical review",
};

function csvCell(value: unknown) {
  const raw = String(value ?? "");
  // Prevent Excel/Sheets from evaluating potentially untrusted CSV formulas.
  const safe = /^[\s]*[=+@-]/.test(raw) ? "'" + raw : raw;
  return '"' + safe.replace(/"/g, '""') + '"';
}
function csvExport(rows: InvoiceRow[]) {
  const headers = ["Project", "Client", "Invoice", "Bill", "Service", "Category", "Issued", "Due date", "Status", "Net amount (BDT)", "Allocated (BDT)", "Invoice balance before project relief (BDT)", "Project collectible due (BDT)"];
  const lines = [headers, ...rows.map((r) => [r.projectCode, r.clientName, r.invoiceCode, r.billCode, r.service, r.category, r.issueDate, r.dueDate, statusNames[r.status], r.amount, r.allocated, r.invoiceUnallocatedBalance, r.projectCollectibleDue])];
  const blob = new Blob(["\uFEFF", lines.map((line) => line.map(csvCell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "LAND-VIEW-invoices-" + new Date().toISOString().slice(0, 10) + ".csv"; a.click();
  URL.revokeObjectURL(url);
}

export default function InvoiceCenterPage() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Status | "all">("all");
  const [category, setCategory] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [onlyProjectDue, setOnlyProjectDue] = useState(false);
  const [sending, setSending] = useState("");
  const [notified, setNotified] = useState<string[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/billing/invoice-center", { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async (res) => {
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload?.success) throw new Error(String(payload?.error || "Could not load invoices."));
        return payload.data as Report;
      })
      .then((data) => { if (!controller.signal.aborted) { setReport(data); setError(""); } })
      .catch((err: unknown) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Could not load invoices."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (report?.rows || []).filter((row) => {
      if (status !== "all" && row.status !== status) return false;
      if (category !== "all" && row.category !== category) return false;
      if (onlyProjectDue && row.projectCollectibleDue <= 0.009) return false;
      if (fromDate && (!row.issueDate || row.issueDate.slice(0, 10) < fromDate)) return false;
      if (toDate && (!row.issueDate || row.issueDate.slice(0, 10) > toDate)) return false;
      return !q || [row.projectCode, row.projectName, row.clientName, row.invoiceCode, row.billCode, row.service, row.category].some((v) => v.toLowerCase().includes(q));
    });
  }, [report, search, status, category, onlyProjectDue, fromDate, toDate]);
  const categories = useMemo(() => [...new Set((report?.rows || []).map((row) => row.category))].sort(), [report]);
  const filtered = visible.reduce((sum, row) => ({ net: sum.net + row.amount, allocated: sum.allocated + row.allocated }), { net: 0, allocated: 0 });

  function reload() { setError(""); setNotice(""); setLoading(true); setRevision((v) => v + 1); }
  async function sendReminder(row: InvoiceRow) {
    if (sending || notified.includes(row.projectCode) || !row.reminderEligible) return;
    if (!window.confirm("Queue one WhatsApp billing reminder for " + row.projectCode + "?\n\nCurrent collectible project balance: " + money(row.projectCollectibleDue) + "\n\nThe recipient must have client updates enabled; only one reminder per month will be queued.")) return;
    setSending(row.projectCode); setNotice("");
    try {
      const response = await fetch("/api/billing/reminders", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectCode: row.projectCode, confirmed: true }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not queue reminder."));
      setNotified((items) => [...items, row.projectCode]);
      setNotice(json.data.queued ? "Reminder queued for " + row.projectCode + ". Delivery status is tracked by the WhatsApp outbox." : "A reminder for " + row.projectCode + " is already in the monthly outbox.");
    } catch (err) { setNotice(err instanceof Error ? err.message : "Could not queue reminder."); }
    finally { setSending(""); }
  }

  const s = report?.summary;
  return <main className="ic">
    <style>{styles}</style>
    <header className="ic-head">
      <div><small>FINANCE / INVOICE SYSTEM 3.0</small><h1>Invoice Center</h1>
        <p>One authoritative view of invoice allocations, project dues and client reminders. Existing billing pages remain the source for issuing bills and payments.</p></div>
      <div className="ic-head-actions">
        <Link href="/admin/finance/invoices">Generate PDF</Link>
        <button type="button" onClick={() => csvExport(visible)} disabled={!visible.length}>Export CSV</button>
        <button type="button" className="ic-primary" onClick={reload} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
      </div>
    </header>
    {error && <p role="alert" className="ic-error">{error}</p>}
    {notice && <p role="status" className="ic-notice">{notice}</p>}
    {loading && <p className="ic-notice" role="status">Loading canonical invoice data…</p>}
    {report && <>
      {!report.remindersEnabled && <p className="ic-notice">Client WhatsApp billing reminders are paused pending financial verification and explicit production activation.</p>}
      {!report.complete && <p className="ic-error" role="alert">The finance data limit was reached; report totals may be incomplete. Do not use this export for reconciliation until pagination is available.</p>}
      <section className="ic-stats" aria-label="Invoice overview">
        <div><span>Invoices</span><strong>{s?.invoiceCount || 0}</strong><small>{s?.counts.review || 0} historical reviews</small></div>
        <div><span>Invoice value</span><strong>{money(s?.invoiceValue || 0)}</strong><small>Active invoice lines</small></div>
        <div><span>Invoice allocations</span><strong>{money(s?.invoiceAllocated || 0)}</strong><small>Verified allocations</small></div>
        <div><span>Project collectible due</span><strong>{money(s?.collectibleDue || 0)}</strong><small>After project relief & advances</small></div>
        <div><span>Unallocated advances</span><strong>{money(s?.availableAdvances || 0)}</strong><small>Not new invoice debt</small></div>
      </section>
      <section className="ic-shortcuts">
        <Link href="/admin/finance/service-payments">Record service payment</Link>
        <Link href="/admin/finance/payment-lifecycle">Receipts & advances</Link>
        <Link href="/admin/finance/integrity">Reconciliation exceptions</Link>
        <Link href="/admin/finance/due-bills">Project due summary</Link>
      </section>
      <section className="ic-panel">
        <div className="ic-filterbar">
          <label>Search<input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="File, client, bill, service…"/></label>
          <label>Status<select value={status} onChange={(e) => setStatus(e.target.value as Status | "all")}>
            <option value="all">All statuses</option><option value="issued">Issued</option><option value="partial">Partially paid</option><option value="paid">Paid</option><option value="review">Historical review</option>
          </select></label>
          <label>Category<select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All categories</option>{categories.map((name) => <option key={name} value={name}>{name}</option>)}
          </select></label>
          <label>Issued from<input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}/></label>
          <label>Issued to<input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}/></label>
          <label className="ic-check"><input type="checkbox" checked={onlyProjectDue} onChange={(e) => setOnlyProjectDue(e.target.checked)}/> Project due only</label>
        </div>
        <div className="ic-filter-summary"><strong>{visible.length} invoices</strong> shown · Net {money(filtered.net)} · Allocated {money(filtered.allocated)} <span>Project due is shown per file; do not sum repeated project balances across invoice rows.</span></div>
        <div className="ic-table"><table>
          <thead><tr><th>File / Client</th><th>Invoice / Bill</th><th>Service</th><th>Issue date</th><th>Net</th><th>Allocated</th><th>Invoice balance*</th><th>Project due</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>{visible.map((row) => <tr key={row.invoiceCode || row.billCode}>
            <td><strong>{row.projectCode}</strong><small>{row.clientName || row.projectName || "—"}</small></td>
            <td><strong>{row.invoiceCode || "—"}</strong><small>{row.billCode || "—"}</small></td>
            <td>{row.service || row.category}<small>{row.category}</small></td>
            <td>{row.issueDate.slice(0, 10) || "—"}{row.dueDate && <small>Due {row.dueDate.slice(0, 10)}</small>}</td>
            <td>{money(row.amount)}</td><td>{money(row.allocated)}</td>
            <td>{money(row.invoiceUnallocatedBalance)}</td>
            <td className={row.projectCollectibleDue > 0.009 ? "ic-due" : "ic-paid"}>{money(row.projectCollectibleDue)}</td>
            <td><span className={"ic-status is-" + row.status}>{statusNames[row.status]}</span></td>
            <td><div className="ic-row-actions">
              <Link href={"/admin/finance/invoices?fileId=" + encodeURIComponent(row.projectCode)}>Invoice / PDF</Link>
              <Link href={"/admin/finance/service-payments?fileId=" + encodeURIComponent(row.projectCode)}>Payment</Link>
              {report.remindersEnabled && row.reminderEligible && <button type="button" disabled={Boolean(sending) || notified.includes(row.projectCode)}
                onClick={() => void sendReminder(row)}>{sending === row.projectCode ? "Queueing…" : notified.includes(row.projectCode) ? "Queued" : "WhatsApp reminder"}</button>}
            </div></td>
          </tr>)}
          {!visible.length && <tr><td colSpan={10} className="ic-empty">No invoices match the selected filters.</td></tr>}
          </tbody></table></div>
        <footer className="ic-footer">
          * Invoice balance is before project-wide advances and write-off relief. The project collectible due comes from the canonical receivables engine.
          <span>Historical review means a Paid marker has less allocated payment than its bill amount; it is not proof of additional debt.</span>
        </footer>
      </section>
    </>}
  </main>;
}

const styles = String.raw`
.ic{max-width:1600px;margin:0 auto;color:var(--lv-text-primary)}.ic *{box-sizing:border-box}
.ic-head{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:18px}.ic-head small{font-size:10px;letter-spacing:.12em;color:var(--lv-brand-text);font-weight:900}.ic-head h1{font-size:29px;margin:4px 0}.ic-head p{font-size:12px;line-height:1.5;margin:0;max-width:650px;color:var(--lv-text-muted)}
.ic-head-actions{display:flex;gap:8px;flex-wrap:wrap}.ic-head-actions a,.ic-head-actions button,.ic-row-actions a,.ic-row-actions button{padding:9px 12px;border-radius:7px;background:var(--lv-surface-panel);border:1px solid var(--lv-border-default);color:var(--lv-text-primary);text-decoration:none;white-space:nowrap;font-size:11px;font-weight:800;cursor:pointer}
.ic-head-actions .ic-primary{background:var(--lv-brand-primary);color:var(--lv-text-inverse);border-color:var(--lv-brand-border)}.ic button:disabled{opacity:.52;cursor:not-allowed}
.ic-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:14px}.ic-stats>div{padding:16px;border:1px solid var(--lv-border-default);border-radius:12px;background:var(--lv-surface-panel)}.ic-stats span{display:block;color:var(--lv-text-muted);font-size:11px}.ic-stats strong{display:block;font-size:20px;margin:8px 0;overflow-wrap:anywhere}.ic-stats small{font-size:10px;color:var(--lv-text-muted)}
.ic-shortcuts{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:15px}.ic-shortcuts a{font-size:11px;color:var(--lv-brand-text);font-weight:800;text-decoration:none;padding:8px 12px;border-radius:7px;border:1px solid var(--lv-border-default)}
.ic-panel{border:1px solid var(--lv-border-default);border-radius:12px;background:var(--lv-surface-panel);overflow:hidden}
.ic-filterbar{display:flex;flex-wrap:wrap;gap:10px;padding:15px;background:var(--lv-surface-muted)}.ic-filterbar label{display:flex;flex-direction:column;gap:5px;color:var(--lv-text-muted);font-size:10px;font-weight:800;flex:1;min-width:130px}
.ic-filterbar input,.ic-filterbar select{width:100%;min-height:38px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);padding:8px;font-size:12px}
.ic-filterbar label:first-child{flex:2;min-width:200px}.ic-filterbar .ic-check{flex-direction:row;align-items:end;gap:9px;white-space:nowrap;padding-bottom:10px}.ic-filterbar .ic-check input{width:16px;min-height:16px;accent-color:var(--lv-brand-primary)}
.ic-filter-summary{padding:12px 15px;border-top:1px solid var(--lv-border-subtle);font-size:11px;color:var(--lv-text-muted)}.ic-filter-summary strong{color:var(--lv-text-primary)}.ic-filter-summary span{display:block;margin-top:5px}
.ic-table{overflow:auto}.ic-table table{border-collapse:collapse;width:100%;min-width:1340px}.ic-table th,.ic-table td{font-size:11px;text-align:left;padding:12px 10px;border-top:1px solid var(--lv-border-subtle);vertical-align:top}.ic-table th{color:var(--lv-text-muted);font-weight:900;white-space:nowrap}.ic-table td strong{font-size:11px}.ic-table td small{display:block;margin-top:5px;color:var(--lv-text-muted);font-size:10px}.ic-table td.ic-due{color:var(--lv-warning);font-weight:900}.ic-table td.ic-paid{color:var(--lv-success);font-weight:900}
.ic-status{display:inline-block;padding:5px 7px;border:1px solid var(--lv-border-default);border-radius:6px;white-space:nowrap;font-weight:800}.ic-status.is-paid{color:var(--lv-success)}.ic-status.is-partial,.ic-status.is-review{color:var(--lv-warning)}.ic-status.is-issued{color:var(--lv-brand-text)}
.ic-row-actions{display:flex;flex-wrap:wrap;gap:5px;max-width:270px}.ic-row-actions a,.ic-row-actions button{font-size:10px;padding:6px 8px}.ic-row-actions button{color:var(--lv-brand-text)}
.ic-empty{text-align:center;padding:30px!important;color:var(--lv-text-muted)}
.ic-footer{padding:14px;font-size:11px;color:var(--lv-text-muted);line-height:1.55}.ic-footer span{display:block;margin-top:5px}
.ic-error,.ic-notice{border:1px solid var(--lv-border-default);border-radius:9px;padding:12px;font-size:12px;background:var(--lv-surface-muted)}.ic-error{color:var(--lv-danger,#c64747)}
@media(max-width:1000px){.ic-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.ic-head{align-items:start;flex-direction:column}}
@media(max-width:600px){.ic-stats{grid-template-columns:1fr}.ic-head-actions{width:100%}.ic-head-actions>*{flex:1;text-align:center}}
`;
