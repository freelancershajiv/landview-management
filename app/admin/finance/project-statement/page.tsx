"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ProjectStatementV43 } from "@/lib/project-statement-v43";

const normalize = (raw: string) => {
  const match = String(raw || "").trim().toUpperCase().match(/^(?:LV[\s_-]*)?0*(\d{1,8})$/);
  return match ? "LV-" + String(Number(match[1])).padStart(3, "0") : "";
};
const money = (value: number) => "৳" + Number(value || 0).toLocaleString("en-BD", {minimumFractionDigits: 2,maximumFractionDigits: 2});
const date = (value: string) => {
  const raw = String(value || "").slice(0,10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw.split("-").reverse().join("/") : "—";
};

export default function ProjectStatementPageV43() {
  const [input, setInput] = useState("");
  const [data, setData] = useState<ProjectStatementV43 | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async (raw: string) => {
    const code = normalize(raw);
    if (!code) { setError("Enter a valid File ID, such as LV-157."); return; }
    setLoading(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/billing/project-statement?projectId=" + encodeURIComponent(code), {
        cache: "no-store", credentials: "same-origin",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load the project statement."));
      setData(json.data as ProjectStatementV43);
      setInput(code);
      const url = new URL(window.location.href);
      url.searchParams.set("fileId", code);
      window.history.replaceState(null, "", url.pathname + "?" + url.searchParams.toString());
    } catch (cause) {
      setData(null);
      setError(cause instanceof Error ? cause.message : "Could not load this project.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const id = normalize(new URLSearchParams(window.location.search).get("fileId") || "");
    if (!id) return;
    const timer = window.setTimeout(() => { void load(id); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function pdf() {
    if (!data || pdfBusy) return;
    setError(""); setMessage(""); setPdfBusy(true);
    try {
      const { downloadProjectStatementPdfV43 } = await import("@/lib/project-statement-pdf-v43");
      const pages = await downloadProjectStatementPdfV43(data.project.code);
      setMessage(`Project statement PDF downloaded as ${pages} A4 page${pages === 1 ? "" : "s"}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not export the statement PDF.");
    } finally { setPdfBusy(false); }
  }

  const printUrl = data ? "/api/billing/project-statement-print?projectId=" + encodeURIComponent(data.project.code) + "&autoprint=1" : "";
  const t = data?.totals;
  const rows: Array<[string, number, string]> = t ? [
    ["Net services billed", t.billedNetAfterAdjustments, "Bills after discounts and posted credit/debit adjustments"],
    ["Total payments received", t.receivedPayments, "Includes effective historical manual client payments"],
    ["Net write-offs", t.netWriteoffs, "Current write-off balance after recoveries"],
    ["Amount currently payable", t.amountDue, "Canonical project receivable amount after allowed offsets"],
  ] : [];

  return <main className="sv43">
    <style>{`
      .sv43{max-width:1500px;margin:0 auto;display:grid;gap:14px;color:var(--lv-text-primary)}.sv43 *{box-sizing:border-box}
      .sv43 h1{font-size:27px;line-height:1.2;margin:4px 0}.sv43 h2{font-size:17px;margin:0}.sv43 p{font-size:12px;line-height:1.5;margin:5px 0;color:var(--lv-text-secondary)}
      .sv43-eyebrow{font-size:11px;font-weight:850;color:var(--lv-brand-text);letter-spacing:.12em}
      .sv43-top{display:flex;gap:16px;justify-content:space-between;align-items:flex-end;flex-wrap:wrap}
      .sv43-input{display:flex;gap:9px;flex-wrap:wrap;align-items:center;background:var(--lv-surface-panel);border:1px solid var(--lv-border-default);border-radius:12px;padding:12px}
      .sv43-input label{font-size:12px;font-weight:800}.sv43-input input{min-height:44px;min-width:180px;flex:1;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);padding:9px 12px;font-size:15px}
      .sv43 button,.sv43 a.sv43-button{min-height:43px;border:1px solid var(--lv-border-default);border-radius:8px;padding:10px 14px;display:inline-flex;gap:7px;align-items:center;justify-content:center;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:12px;font-weight:800;text-decoration:none;cursor:pointer}
      .sv43 button.primary,.sv43 a.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)!important}
      .sv43 button:disabled{opacity:.5;cursor:not-allowed}.sv43-links{display:flex;flex-wrap:wrap;gap:9px}
      .sv43-panel{border:1px solid var(--lv-border-default);background:var(--lv-surface-panel);border-radius:12px;padding:15px}
      .sv43-project{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .sv43-project small{display:block;font-size:11px;color:var(--lv-text-secondary);margin-bottom:6px}.sv43-project strong{font-size:14px;overflow-wrap:anywhere}
      .sv43-totals{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
      .sv43-total{background:var(--lv-surface-muted);border:1px solid var(--lv-border-subtle);padding:15px;border-radius:9px}
      .sv43-total small{font-size:11px;color:var(--lv-text-secondary)}.sv43-total strong{font-size:20px;display:block;margin:7px 0}
      .sv43-total p{font-size:11px;margin:0}.sv43-total.owed{background:var(--lv-brand-soft);border-color:var(--lv-brand-border)}
      .sv43-small-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;margin-top:11px}
      .sv43-small-grid>div{border:1px solid var(--lv-border-subtle);padding:12px;border-radius:9px}
      .sv43-small-grid span{font-size:11px;color:var(--lv-text-secondary)}.sv43-small-grid strong{display:block;font-size:15px;margin-top:8px}
      .sv43-notice{padding:12px;border-left:3px solid var(--lv-brand-primary);background:var(--lv-surface-muted);border-radius:7px;font-size:12px;line-height:1.55}
      .sv43-msg{padding:11px 14px;border:1px solid var(--lv-border-default);border-radius:8px;font-size:12px}
      .sv43-msg.bad{color:var(--lv-danger);border-color:var(--lv-danger)}.sv43-msg.good{color:var(--lv-success)}
      .sv43-table-wrap{overflow:auto;-webkit-overflow-scrolling:touch;margin-top:13px}
      .sv43 table{border-collapse:collapse;width:100%;min-width:930px}.sv43 th,.sv43 td{padding:10px 8px;border-bottom:1px solid var(--lv-border-subtle);text-align:left;vertical-align:top;font-size:12px}
      .sv43 th{font-size:11px;color:var(--lv-text-secondary);background:var(--lv-surface-muted)}.sv43 td strong{font-size:12px}
      .sv43 td small{display:block;font-size:11px;color:var(--lv-text-secondary);margin-top:5px}
      .sv43 td.right,.sv43 th.right{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
      .sv43 td a{color:var(--lv-brand-text);font-size:12px;font-weight:800}
      .sv43-section-head{display:flex;justify-content:space-between;gap:13px;flex-wrap:wrap;align-items:center}
      .sv43-tag{padding:5px 9px;border-radius:7px;border:1px solid var(--lv-border-default);font-size:11px;font-weight:800;background:var(--lv-surface-muted)}
      .sv43-empty{padding:20px;font-size:12px;color:var(--lv-text-secondary)}
      @media(max-width:1000px){.sv43-totals{grid-template-columns:repeat(2,minmax(0,1fr))}.sv43-small-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:630px){.sv43 h1{font-size:23px}.sv43-project,.sv43-totals{grid-template-columns:1fr 1fr}.sv43-small-grid{grid-template-columns:1fr 1fr}.sv43-input{display:grid;grid-template-columns:1fr}.sv43-input input{min-width:0;font-size:16px}.sv43-links,.sv43-top{width:100%}.sv43-links>*{flex:1}.sv43 .sv43-total strong{font-size:17px}}
    `}</style>
    <header className="sv43-top">
      <div><span className="sv43-eyebrow">LAND VIEW / BILLING 4.3</span><h1>Project Statement & Receipts</h1>
        <p>One complete current project billing view, suitable for reviewing with a client or exporting as a standardized A4 PDF.</p></div>
      <div className="sv43-links">
        <Link className="sv43-button" href="/admin/billing/service-payments">Receive Payment</Link>
        <Link className="sv43-button" href="/admin/billing/reconciliation">Reconciliation</Link>
      </div>
    </header>
    <section className="sv43-input" aria-label="Find a project statement">
      <label htmlFor="sv43-project">Project / File ID</label>
      <input id="sv43-project" value={input} placeholder="LV-157" onChange={event => setInput(event.target.value)}
        onKeyDown={event => { if (event.key === "Enter") void load(input); }}/>
      <button type="button" className="primary" disabled={loading} onClick={() => void load(input)}>{loading ? "Reading ledger…" : "Open Statement"}</button>
      {data && <button type="button" disabled={loading} onClick={() => void load(data.project.code)}>Refresh</button>}
    </section>
    {error && <div role="alert" className="sv43-msg bad">{error}</div>}
    {message && <div role="status" className="sv43-msg good">{message}</div>}
    {!data && !loading && !error && <div className="sv43-panel sv43-empty">Enter a File ID to review its full billing statement, receipts and advances.</div>}

    {data && t && <>
      <section className="sv43-panel sv43-project" aria-label="Project identity">
        <div><small>File ID</small><strong>{data.project.code}</strong></div>
        <div><small>Client</small><strong>{data.project.client || "—"}</strong></div>
        <div><small>Project & Location</small><strong>{data.project.name || "Project"} · {data.project.location || "—"}</strong></div>
      </section>
      <div className="sv43-links" aria-label="Statement documents">
        <a className="sv43-button primary" href={printUrl} target="_blank" rel="noopener noreferrer">Print / Save PDF</a>
        <button className="primary" type="button" disabled={pdfBusy} onClick={() => void pdf()}>{pdfBusy ? "Preparing A4 PDF…" : "Download PDF"}</button>
        <a className="sv43-button" href={"/api/billing/project-statement-print?projectId=" + encodeURIComponent(data.project.code)}
          target="_blank" rel="noopener noreferrer">Document Preview</a>
        <span className="sv43-tag">Current ledger · {new Date(data.generatedAt).toLocaleString("en-BD", {timeZone:"Asia/Dhaka"})}</span>
      </div>
      <section className="sv43-totals" aria-label="Current financial summary">
        {rows.map(([title,value,description],i) => <div key={title} className={i===3 ? "sv43-total owed" : "sv43-total"}>
          <small>{title}</small><strong>{money(value)}</strong><p>{description}</p>
        </div>)}
      </section>
      <section className="sv43-panel">
        <h2>Current receivables and advances</h2>
        <div className="sv43-small-grid">
          <div><span>Engineering due</span><strong>{money(t.engineeringDue)}</strong></div>
          <div><span>Other Services due</span><strong>{money(t.otherDue)}</strong></div>
          <div><span>Supervision due</span><strong>{money(t.supervisionDue)}</strong></div>
          <div><span>Not allocated to invoices</span><strong>{money(t.invoiceUnallocated)}</strong></div>
          <div><span>Advance remaining after offsets</span><strong>{money(t.remainingAdvanceAfterOffsets)}</strong></div>
        </div>
        <p className="sv43-notice" style={{marginTop:12}}>
          Invoice balances below precede project-level advance and write-off offsets. The authoritative amount payable is the figure above.
          An unallocated payment may have already reduced the amount payable; it must not be counted as additional debt.
        </p>
      </section>
      <section className="sv43-panel">
        <div className="sv43-section-head"><div><h2>Service bills & invoices</h2><p>Effective bills after discounts and posted credit/debit notes. Draft and adjustment mirror bills are excluded.</p></div><span className="sv43-tag">{data.invoices.length} active services</span></div>
        <div className="sv43-table-wrap"><table role="table" data-mobile-table=""><thead role="rowgroup"><tr role="row">
          <th role="columnheader">Invoice / Bill</th><th role="columnheader">Service</th><th role="columnheader">Category</th>
          <th role="columnheader" className="right">Gross</th><th role="columnheader" className="right">Discount</th><th role="columnheader" className="right">Net</th>
          <th role="columnheader" className="right">To invoices</th><th role="columnheader" className="right">Invoice open*</th>
        </tr></thead><tbody role="rowgroup">{data.invoices.map(line => <tr role="row" key={line.billCode}>
          <td role="cell" data-mobile-label="Invoice / Bill"><strong>{line.invoiceCode || line.billCode}</strong><small>{line.billCode} · {date(line.billDate)}</small></td>
          <td role="cell" data-mobile-label="Service">{line.service}<small>{line.status}</small></td><td role="cell" data-mobile-label="Category">{line.category}</td>
          <td role="cell" data-mobile-label="Gross" className="right">{money(line.gross)}</td>
          <td role="cell" data-mobile-label="Discount" className="right">{money(line.directDiscount + line.creditNote)}<small>Debit note: {money(line.debitNote)}</small></td>
          <td role="cell" data-mobile-label="Net" className="right">{money(line.net)}</td><td role="cell" data-mobile-label="To invoices" className="right">{money(line.allocated)}</td>
          <td role="cell" data-mobile-label="Invoice open*" className="right">{money(line.invoiceDueBeforeProjectOffsets)}</td>
        </tr>)}</tbody></table></div>
        {!data.invoices.length && <p className="sv43-empty">No active service bills found.</p>}
        <p>* Individual invoice balances are shown before project-wide advances and write-off relief.</p>
      </section>
      <section className="sv43-panel">
        <div className="sv43-section-head"><div><h2>Payments & verified receipts</h2><p>Every effective project payment appears here, including genuine legacy manual payments even when an online receipt was not issued.</p></div><span className="sv43-tag">{data.payments.length} payments · {data.counts.verifiedReceipts} online receipts</span></div>
        <div className="sv43-table-wrap"><table role="table" data-mobile-table=""><thead role="rowgroup"><tr role="row">
          <th role="columnheader">Payment</th><th role="columnheader">Date / Method</th><th role="columnheader" className="right">Received</th>
          <th role="columnheader" className="right">Allocated to invoices</th><th role="columnheader" className="right">Not allocated</th><th role="columnheader">Receipt</th>
        </tr></thead><tbody role="rowgroup">{data.payments.map(payment => <tr role="row" key={payment.paymentCode}>
          <td role="cell" data-mobile-label="Payment"><strong>{payment.paymentCode}</strong><small>{payment.category}{payment.legacyManual ? " · Historical entry" : ""}</small></td>
          <td role="cell" data-mobile-label="Date / Method">{date(payment.date)}<small>{payment.method || "—"}{payment.reference ? " · " + payment.reference : ""}</small></td>
          <td role="cell" data-mobile-label="Received" className="right">{money(payment.amount)}</td>
          <td role="cell" data-mobile-label="Allocated to invoices" className="right">{money(payment.allocatedToInvoices)}</td>
          <td role="cell" data-mobile-label="Not allocated" className="right">{money(payment.notAllocatedToInvoices)}</td>
          <td role="cell" data-mobile-label="Receipt">{payment.receiptUrl ? <>
            <a href={payment.receiptUrl} target="_blank" rel="noopener noreferrer">{payment.receiptCode || "View verified receipt"}</a>
            <small><a href={"/api/billing/receipt-print?token=" + encodeURIComponent(payment.receiptUrl.split("/").at(-1) || "") + "&autoprint=1"}
              target="_blank" rel="noopener noreferrer">Print receipt / Save PDF</a></small>
          </> : <small>{payment.receiptStatus}</small>}</td>
        </tr>)}</tbody></table></div>
        {!data.payments.length && <p className="sv43-empty">No effective project payments found.</p>}
      </section>
      {(data.adjustments.length > 0 || data.writeoffs.length > 0) && <section className="sv43-panel">
        <div className="sv43-section-head"><div><h2>Adjustments, write-offs & recoveries</h2>
          <p>Financial corrections already reflected in the statement totals; not extra charges.</p></div></div>
        {data.adjustments.length > 0 && <><h3>Credit / Debit Notes</h3>
          <div className="sv43-table-wrap"><table role="table" data-mobile-table=""><thead role="rowgroup"><tr role="row"><th role="columnheader">Correction</th><th role="columnheader">Original bill</th><th role="columnheader">Date</th><th role="columnheader">Type</th><th role="columnheader" className="right">Amount</th><th role="columnheader">Reason</th></tr></thead><tbody role="rowgroup">{data.adjustments.map(item => <tr role="row" key={item.code}><td role="cell" data-mobile-label="Correction">{item.code}</td><td role="cell" data-mobile-label="Original bill">{item.billCode}</td><td role="cell" data-mobile-label="Date">{date(item.date)}</td><td role="cell" data-mobile-label="Type">{item.kind}</td><td role="cell" data-mobile-label="Amount" className="right">{money(item.amount)}</td><td role="cell" data-mobile-label="Reason">{item.reason}</td></tr>)}</tbody></table></div></>}
        {data.writeoffs.length > 0 && <><h3>Write-offs & Recoveries</h3>
          <div className="sv43-table-wrap"><table role="table" data-mobile-table=""><thead role="rowgroup"><tr role="row"><th role="columnheader">Effective date</th><th role="columnheader">Billing category</th><th role="columnheader">Event type</th><th role="columnheader" className="right">Amount</th></tr></thead><tbody role="rowgroup">{data.writeoffs.map((item,i) => <tr role="row" key={String(i)+item.date}><td role="cell" data-mobile-label="Effective date">{date(item.date)}</td><td role="cell" data-mobile-label="Billing category">{item.category}</td><td role="cell" data-mobile-label="Event type">{item.kind}</td><td role="cell" data-mobile-label="Amount" className="right">{money(item.amount)}</td></tr>)}</tbody></table></div></>}
      </section>}
    </>}
  </main>;
}
