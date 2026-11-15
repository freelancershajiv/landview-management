"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Issue = {
  caseId: string; fingerprint: string; type: string; severity: "review" | "historical" | "info";
  projectCode: string; paymentCode: string; paymentId: string;
  date: string; amount: number; difference: number; explanation: string;
  receiptStatus: string; ledgerReference: string;
  reviewStatus: "open" | "pending" | "reviewed" | "rejected";
  requestedBy: string; requestedAt: string; reviewedBy: string; reviewedAt: string; reviewReason: string;
};
type Snapshot = {
  snapshotAt: string; complete: boolean;
  sizes: Record<string,number>;
  cases: Issue[];
  permissions: { canReview: boolean };
  summary: { scannedEffective: number; scannedHistorical: number; actionable: number;
    historical: number; advances: number; pendingReview: number; reviewedEvidence: number };
};
const names: Record<string,string> = {
  receipt_not_issued: "Missing Issued Receipt",
  receipt_amount_mismatch: "Receipt Amount Difference",
  receipt_project_mismatch: "Receipt Project Difference",
  ledger_transaction_unlinked: "Ledger Reference Not Found",
  ledger_amount_mismatch: "Ledger Amount Difference",
  ledger_scope_mismatch: "Ledger Finance Scope Difference",
  ledger_project_mismatch: "Ledger Project Difference",
  payment_overallocated: "Payment Overallocated",
  unallocated_advance: "Unallocated Advance",
  historical_evidence: "Historical Evidence Review",
};
const money = (amount: number) => "৳" + Number(amount || 0).toLocaleString("en-BD", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const date = (value: string) => value ? new Date(value).toLocaleString("en-BD", { timeZone: "Asia/Dhaka" }) : "—";
function csvEscape(value: string | number) {
  const raw = String(value ?? "");
  const escaped = /^[=+@\-\t\r]/.test(raw) ? "'" + raw : raw;
  return '"' + escaped.replace(/"/g, '""') + '"';
}
function exportCsv(items: Issue[]) {
  const records = [["Project", "Payment", "Payment Date", "Issue", "Severity", "Evidence Review", "Recorded Amount", "Difference", "Explanation"],
    ...items.map(c => [c.projectCode, c.paymentCode, c.date, names[c.type] || c.type,
      c.severity, c.reviewStatus, String(c.amount), String(c.difference), c.explanation])];
  const content = "\ufeff" + records.map(row => row.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = "landview-billing-reconciliation-41.csv";
  document.body.appendChild(link); link.click(); link.remove();
  URL.revokeObjectURL(url);
}

export default function Reconciliation41Page() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [reason, setReason] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/billing/reconciliation-41", { credentials: "same-origin", cache: "no-store" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load reconciliation worklist."));
      setData(json.data as Snapshot);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load reconciliation worklist."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, [load]);

  const filtered = useMemo(() => (data?.cases || []).filter(c => {
    if (kind !== "all" && !(kind === "unreviewed" ? c.severity === "review" && c.reviewStatus !== "reviewed" : kind === c.severity || kind === c.reviewStatus)) return false;
    const target = [c.projectCode, c.paymentCode, names[c.type], c.explanation].join(" ").toLowerCase();
    return !query || target.includes(query.toLowerCase().trim());
  }), [data, kind, query]);
  const selected = data?.cases.find(c => c.caseId === selectedId) || null;

  async function submit(action: "request" | "review" | "reject") {
    if (busyRef.current || !selected || reason.trim().length < 12) return;
    const description = action === "request" ? "submit an evidence-review request"
      : action === "review" ? "acknowledge the reviewed evidence WITHOUT correcting any balances"
      : "reject this review request";
    if (!window.confirm(`Confirm you want to ${description} for ${selected.paymentCode}?`)) return;
    busyRef.current = true; setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/billing/reconciliation-41", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, caseId: selected.caseId, fingerprint: selected.fingerprint, reason: reason.trim() }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not record the review."));
      setReason("");
      setMessage(action === "review"
        ? "Evidence review recorded in the audit log. No payment, receipt, invoice or ledger amount was changed."
        : action === "reject" ? "Review request rejected and audited." : "Review requested. A different administrator must assess the evidence.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not record the review."); }
    finally { busyRef.current = false; setBusy(false); }
  }

  return <main className="r41">
    <style>{`
      .r41{max-width:1530px;margin:0 auto;display:grid;gap:14px;color:var(--lv-text-primary)}.r41 *{box-sizing:border-box}
      .r41 a{color:var(--lv-brand-text);text-decoration:none;font-weight:750}.r41 h1{font-size:28px;margin:4px 0}.r41 h2{font-size:17px;margin:0}
      .r41 p{margin:4px 0;line-height:1.5;font-size:13px;color:var(--lv-text-secondary)}
      .r41-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}
      .r41-eyebrow{font-size:11px;font-weight:850;letter-spacing:.09em;color:var(--lv-brand-text)}
      .r41-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
      .r41 button,.r41 .r41-link{min-height:42px;padding:9px 13px;border-radius:8px;border:1px solid var(--lv-border-default);background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:12px;font-weight:800;cursor:pointer}
      .r41 button.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}
      .r41 button:disabled{opacity:.45;cursor:not-allowed}
      .r41 input,.r41 select,.r41 textarea{padding:10px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:13px;min-height:42px}
      .r41 textarea{width:100%;min-height:85px;resize:vertical}
      .r41-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
      .r41-metric{background:var(--lv-surface-panel);border:1px solid var(--lv-border-default);border-radius:11px;padding:14px}
      .r41-metric span{font-size:12px;color:var(--lv-text-secondary);display:block}.r41-metric strong{font-size:24px;display:block;margin-top:5px;font-variant-numeric:tabular-nums}
      .r41-panel{background:var(--lv-surface-panel);border:1px solid var(--lv-border-default);border-radius:12px;padding:14px}
      .r41-warning{padding:11px 13px;border-left:3px solid var(--lv-brand-primary);background:var(--lv-surface-muted);border-radius:6px;font-size:12px;line-height:1.5}
      .r41-error{color:var(--lv-danger);border-color:var(--lv-danger)}.r41-success{color:var(--lv-success);border-color:var(--lv-success)}
      .r41-filters{display:flex;gap:9px;flex-wrap:wrap;align-items:center;margin-top:10px}
      .r41-filters input{flex:1 1 250px}.r41-filters select{flex:0 1 240px;max-width:100%}
      .r41-scroll{overflow-x:auto;margin-top:11px;-webkit-overflow-scrolling:touch}
      .r41 table{width:100%;min-width:1020px;border-collapse:collapse;font-size:12px}
      .r41 th,.r41 td{padding:11px 9px;border-bottom:1px solid var(--lv-border-default);text-align:left;vertical-align:top}
      .r41 th{background:var(--lv-surface-muted);font-size:11px;color:var(--lv-text-muted)}
      .r41 td small{display:block;font-size:11px;color:var(--lv-text-secondary);margin-top:4px}
      .r41 .numeric{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
      .r41-pill{display:inline-flex;border:1px solid var(--lv-border-default);background:var(--lv-surface-muted);border-radius:6px;padding:4px 7px;font-size:11px;font-weight:800}
      .r41-review{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,.7fr);gap:16px}
      .r41-review dl{display:grid;grid-template-columns:150px 1fr;gap:6px 9px;font-size:12px;margin:12px 0}
      .r41-review dt{color:var(--lv-text-secondary)}.r41-review dd{margin:0;overflow-wrap:anywhere}
      .r41-review label{display:grid;gap:7px;font-size:12px;font-weight:750}
      .r41-mobile{display:none}
      @media(max-width:900px){.r41-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.r41-review{grid-template-columns:1fr}}
      @media(max-width:640px){.r41 h1{font-size:23px}.r41-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.r41-filters input,.r41-filters select{flex:1 1 100%;font-size:16px}.r41-scroll{display:none}.r41-mobile{display:grid;gap:10px;margin-top:11px}.r41-mobile article{padding:12px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-muted);display:grid;gap:7px}.r41-review dl{grid-template-columns:110px 1fr}.r41-actions button{flex:1}}
    `}</style>
    <header className="r41-head">
      <div><span className="r41-eyebrow">LAND VIEW / BILLING 4.1</span><h1>Reconciliation & Review Worklist</h1>
        <p>Cross-check posted payments, issued receipts, ledger references and invoice allocations without changing historical balances.</p></div>
      <div className="r41-actions">
        <button type="button" onClick={() => void load()} disabled={loading || busy}>{loading ? "Loading…" : "Refresh evidence"}</button>
        <Link href="/admin/billing/integrity" className="r41-link">Invoice Integrity</Link>
        <Link href="/admin/accounts" className="r41-link">Accounts Ledger</Link>
      </div>
    </header>
    <div className="r41-warning">A missing receipt or transaction reference is an investigation item, <strong>not proof of missing money or a customer debt</strong>. Legacy/excluded payments appear separately. Marking evidence reviewed records an audit decision only; it does not repair an accounting entry.</div>
    {error && <div role="alert" className="r41-panel r41-error">{error}</div>}
    {message && <div role="status" className="r41-panel r41-success">{message}</div>}
    {data && <>
      <section className="r41-metrics" aria-label="Reconciliation counts">
        <div className="r41-metric"><span>Actionable cases</span><strong>{data.summary.actionable}</strong></div>
        <div className="r41-metric"><span>Historical evidence</span><strong>{data.summary.historical}</strong></div>
        <div className="r41-metric"><span>Advances to track</span><strong>{data.summary.advances}</strong></div>
        <div className="r41-metric"><span>Pending review</span><strong>{data.summary.pendingReview}</strong></div>
      </section>
      <section className="r41-panel">
        <h2>Reconciliation cases</h2>
        <p>{filtered.length} displayed of {data.cases.length} findings · {data.summary.scannedEffective} effective and {data.summary.scannedHistorical} excluded/historical project payments assessed · Snapshot {date(data.snapshotAt)}</p>
        <div className="r41-filters">
          <input aria-label="Search reconciliation cases" placeholder="File ID, payment reference or issue…" value={query} onChange={event => setQuery(event.target.value)} />
          <select aria-label="Filter reconciliation cases" value={kind} onChange={event => setKind(event.target.value)}>
            <option value="all">All findings</option><option value="unreviewed">Actionable, not yet reviewed</option>
            <option value="review">Actionable issues</option><option value="historical">Historical evidence</option>
            <option value="info">Advances / information</option><option value="pending">Pending approval</option>
            <option value="reviewed">Evidence reviewed</option>
          </select>
          <button type="button" onClick={() => exportCsv(filtered)} disabled={!filtered.length}>Export visible CSV</button>
        </div>
        <div className="r41-scroll"><table>
          <thead><tr><th>Project / Payment</th><th>Finding</th><th>Evidence status</th><th className="numeric">Payment</th><th className="numeric">Difference / Advance</th><th>Review</th><th>Action</th></tr></thead>
          <tbody>{filtered.map(c => <tr key={c.caseId}>
            <td><strong>{c.projectCode}</strong><small>{c.paymentCode} · {c.date || "Date unavailable"}</small></td>
            <td><strong>{names[c.type] || c.type}</strong><small>{c.explanation}</small></td>
            <td><span className="r41-pill">{c.severity.toUpperCase()}</span><small>Receipt: {c.receiptStatus}</small></td>
            <td className="numeric">{money(c.amount)}</td><td className="numeric">{c.difference > 0 ? money(c.difference) : "—"}</td>
            <td><span className="r41-pill">{c.reviewStatus.toUpperCase()}</span></td>
            <td><button type="button" className={selectedId === c.caseId ? "primary" : ""} onClick={() => { setSelectedId(c.caseId); setReason(""); }}>Review case</button></td>
          </tr>)}
          {!filtered.length && <tr><td colSpan={7}>No cases match this filter.</td></tr>}</tbody>
        </table></div>
        <div className="r41-mobile">{filtered.map(c => <article key={c.caseId}>
          <div><strong>{c.projectCode} · {c.paymentCode}</strong></div>
          <strong>{names[c.type] || c.type}</strong>
          <p>{c.explanation}</p>
          <div>Recorded: {money(c.amount)} {c.difference > .01 ? `· Difference/advance: ${money(c.difference)}` : ""}</div>
          <div><span className="r41-pill">{c.severity}</span> <span className="r41-pill">{c.reviewStatus}</span></div>
          <button type="button" onClick={() => { setSelectedId(c.caseId); setReason(""); }}>Review case</button>
        </article>)}</div>
      </section>
      {selected && <section className="r41-panel r41-review" aria-label="Selected reconciliation case">
        <div>
          <h2>{names[selected.type] || selected.type}</h2>
          <p>{selected.explanation}</p>
          <dl>
            <dt>Project</dt><dd>{selected.projectCode}</dd>
            <dt>Payment</dt><dd>{selected.paymentCode} · {money(selected.amount)}</dd>
            <dt>Issued receipt</dt><dd>{selected.receiptStatus}</dd>
            <dt>Ledger reference</dt><dd>{selected.ledgerReference || "Not recorded"}</dd>
            <dt>Review status</dt><dd>{selected.reviewStatus}</dd>
            <dt>Requested by</dt><dd>{selected.requestedBy || "—"} · {date(selected.requestedAt)}</dd>
            <dt>Reviewed by</dt><dd>{selected.reviewedBy || "—"} · {date(selected.reviewedAt)}</dd>
            <dt>Review reason</dt><dd>{selected.reviewReason || "—"}</dd>
          </dl>
          <div className="r41-actions">
            <Link href={`/admin/billing/invoices?fileId=${encodeURIComponent(selected.projectCode)}`}>Project Invoice</Link>
            <Link href={`/admin/billing/service-payments?fileId=${encodeURIComponent(selected.projectCode)}`}>Payment / Receipt</Link>
            <Link href={`/admin/billing/allocation-corrections?projectId=${encodeURIComponent(selected.projectCode)}`}>Allocation Correction</Link>
          </div>
        </div>
        <div>
          <label>Supporting evidence and review reason
            <textarea value={reason} maxLength={1200} onChange={event => setReason(event.target.value)}
              placeholder="Describe the receipt, bank statement or journal reference checked. At least 12 characters."/>
          </label>
          <p>Case fingerprint is tied to the current financial evidence. If that evidence changes, this decision cannot be reused.</p>
          <div className="r41-actions">
            {selected.reviewStatus !== "pending" && selected.reviewStatus !== "reviewed" &&
              <button type="button" className="primary" disabled={busy || reason.trim().length < 12} onClick={() => void submit("request")}>Request evidence review</button>}
            {selected.reviewStatus === "pending" && data.permissions.canReview && <>
              <button type="button" className="primary" disabled={busy || reason.trim().length < 12} onClick={() => void submit("review")}>Mark evidence reviewed</button>
              <button type="button" disabled={busy || reason.trim().length < 12} onClick={() => void submit("reject")}>Reject review</button>
            </>}
          </div>
          {selected.reviewStatus === "pending" && !data.permissions.canReview && <p>Awaiting an administrator other than the requester.</p>}
          {selected.reviewStatus === "reviewed" && <p>The evidence was reviewed. The finding remains visible until the underlying source records are reconciled through an authorized accounting workflow.</p>}
        </div>
      </section>}
    </>}
    {!data && loading && <div className="r41-panel" role="status">Reading financial evidence without modifying records…</div>}
  </main>;
}
