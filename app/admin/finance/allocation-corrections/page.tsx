"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type InvoiceOption = { id: string; code: string; billCode: string; category: string; amount: number; allocated: number; settled: boolean };
type PaymentOption = { id: string; code: string; amount: number; allocated: number; unallocated: number; category: string; date: string; method: string; reference: string; receiptAttached: boolean; ledgerStatus: string; ledgerReason: string };
type AllocationOption = { id: string; paymentId: string; invoiceId: string; paymentCode: string; invoiceCode: string; billCode: string; amount: number; effective: boolean };
type CorrectionRequest = { requestCode: string; projectCode: string; requestedBy: string; requestedAt: string; status: string; allocationId: string; paymentCode: string; paymentId: string; fromInvoiceId: string; toInvoiceId: string; fromBillCode: string; toBillCode: string; amount: number; reason: string; resolvedBy: string };
type ControlData = {
  projectCode: string; invoices: InvoiceOption[]; payments: PaymentOption[]; allocations: AllocationOption[];
  requests: CorrectionRequest[]; ledgerAvailable: boolean;
  summary: { invoiceCount: number; allocatedAmount: number; receivedAmount: number; unallocatedAmount: number; ledgerExceptions: number; receiptMissing: number };
};

const money = (value: number) => "৳" + Number(value || 0).toLocaleString("en-BD", { maximumFractionDigits: 2 });
function projectId(value: string) {
  const input = value.trim().toUpperCase();
  const match = input.match(/^(?:LV[\s_-]*)?0*(\d+)$/i);
  return match ? `LV-${match[1].padStart(3, "0")}` : input;
}
async function api(path: string, init?: RequestInit): Promise<ControlData | { requestCode: string; status: string }> {
  const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...init });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Unable to access the correction service."));
  return json.data;
}
function date(value: string) {
  return value ? new Date(value).toLocaleString("en-BD", { timeZone: "Asia/Dhaka" }) : "—";
}

export default function AllocationCorrectionCenter() {
  const [fileId, setFileId] = useState("");
  const [loaded, setLoaded] = useState<ControlData | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selection, setSelection] = useState("");
  const [destination, setDestination] = useState("");
  const [reason, setReason] = useState("");
  const [approvalReason, setApprovalReason] = useState("");

  const refresh = useCallback(async (code: string) => {
    const normalized = projectId(code);
    if (!/^LV-\d+$/.test(normalized)) { setError("Enter a valid File ID such as LV-209."); return; }
    setLoading(true); setError("");
    try {
      const next = await api(`/api/billing/allocation-corrections?projectId=${encodeURIComponent(normalized)}`) as ControlData;
      setLoaded(next);
      setFileId(normalized);
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to load financial records."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get("projectId");
    if (query) { const code = projectId(query); setFileId(code); void refresh(code); }
  }, [refresh]);

  const activeAllocation = loaded?.allocations.find((row) => row.id === selection) || null;
  const activeInvoice = loaded?.invoices.find((row) => row.id === activeAllocation?.invoiceId) || null;
  const available = useMemo(() =>
    !loaded || !activeInvoice ? [] : loaded.invoices.filter((row) =>
      row.id !== activeInvoice.id && !row.settled &&
      row.category === activeInvoice.category &&
      row.amount - row.allocated + 0.01 >= (activeAllocation?.amount || 0)
    ), [loaded, activeInvoice, activeAllocation]);

  const request = async () => {
    if (!loaded || !selection || !destination || !reason.trim()) return;
    if (!window.confirm("Submit this allocation transfer for a separate administrator's approval? No funds will change until approval.")) return;
    setSending(true); setError(""); setNotice("");
    try {
      const result = await api("/api/billing/allocation-corrections", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", projectId: loaded.projectCode, allocationId: selection, toInvoiceId: destination, reason }),
      }) as { requestCode: string; status: string };
      setNotice(`Request ${result.requestCode} submitted. Another administrator must review it before the allocation changes.`);
      setSelection(""); setDestination(""); setReason("");
      await refresh(loaded.projectCode);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not submit the request."); }
    finally { setSending(false); }
  };
  const decide = async (entry: CorrectionRequest, action: "approve" | "reject") => {
    if (!loaded) return;
    if (!approvalReason.trim()) { setError("Write a specific review reason before approving or rejecting."); return; }
    const message = action === "approve"
      ? `Approve one existing allocation transfer of ${money(entry.amount)} from ${entry.fromBillCode} to ${entry.toBillCode}? The payment amount will not change.`
      : `Reject correction request ${entry.requestCode}?`;
    if (!window.confirm(message)) return;
    setSending(true); setError(""); setNotice("");
    try {
      const result = await api("/api/billing/allocation-corrections", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, projectId: loaded.projectCode, requestCode: entry.requestCode, reason: approvalReason }),
      }) as { requestCode: string; status: string };
      setNotice(`Correction ${result.requestCode}: ${result.status}. Refresh the invoice and ledger to see the updated link.`);
      setApprovalReason("");
      await refresh(loaded.projectCode);
    } catch (e) { setError(e instanceof Error ? e.message : "The correction could not be reviewed."); }
    finally { setSending(false); }
  };

  return <main className="lv-correction">
    <style>{`
      .lv-correction{max-width:1480px;margin:0 auto;color:var(--lv-text-primary);display:grid;gap:14px}.lv-correction *{box-sizing:border-box}
      .lv-correction .head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}
      .lv-correction .eyebrow{font-size:10px;letter-spacing:.12em;color:var(--lv-brand-text);font-weight:900}
      .lv-correction h1{font-size:27px;margin:5px 0}.lv-correction h2{font-size:17px;margin:0}.lv-correction p{font-size:12px;color:var(--lv-text-secondary);line-height:1.6;margin:6px 0}
      .lv-correction a{color:var(--lv-brand-text);font-weight:700;text-decoration:none}
      .lv-correction .links{display:flex;flex-wrap:wrap;gap:14px}.lv-correction .panel{padding:16px;border:1px solid var(--lv-border-default);border-radius:11px;background:var(--lv-surface-panel)}
      .lv-correction .lookup{display:flex;gap:8px;align-items:end;flex-wrap:wrap}.lv-correction label{display:grid;gap:5px;color:var(--lv-text-secondary);font-size:12px;font-weight:750}
      .lv-correction input,.lv-correction select,.lv-correction textarea{background:var(--lv-surface-input);border:1px solid var(--lv-border-default);border-radius:7px;min-height:38px;color:var(--lv-text-primary);padding:8px 10px;font:inherit;font-size:12px}
      .lv-correction textarea{min-height:80px;width:100%;resize:vertical}.lv-correction input:focus,.lv-correction select:focus,.lv-correction textarea:focus{outline:2px solid var(--lv-brand-primary);outline-offset:1px}
      .lv-correction button{border:1px solid var(--lv-brand-border);background:var(--lv-brand-primary);color:var(--lv-text-inverse);border-radius:7px;padding:9px 13px;min-height:38px;font-weight:800;font-size:12px;cursor:pointer}
      .lv-correction button:disabled{opacity:.45;cursor:not-allowed}.lv-correction .secondary{background:var(--lv-surface-muted);border-color:var(--lv-border-default);color:var(--lv-text-primary)}
      .lv-correction .cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.lv-correction .cards div{border:1px solid var(--lv-border-default);background:var(--lv-surface-muted);border-radius:9px;padding:13px}
      .lv-correction .cards span{display:block;font-size:11px;color:var(--lv-text-muted)}.lv-correction .cards strong{display:block;margin-top:6px;font-size:19px;font-variant-numeric:tabular-nums}
      .lv-correction .tablewrap{overflow:auto;margin-top:12px}.lv-correction table{width:100%;min-width:760px;border-collapse:collapse;font-size:12px}
      .lv-correction th,.lv-correction td{padding:10px 9px;text-align:left;vertical-align:top;border-bottom:1px solid var(--lv-border-subtle)}.lv-correction th{font-size:10px;color:var(--lv-text-muted);text-transform:uppercase;letter-spacing:.03em}
      .lv-correction td small{display:block;color:var(--lv-text-muted);font-size:10px;margin-top:4px}
      .lv-correction .amount{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.lv-correction .kind{display:inline-flex;font-size:10px;font-weight:850;padding:4px 7px;border-radius:5px;background:var(--lv-surface-muted);border:1px solid var(--lv-border-default)}
      .lv-correction .review{color:#d87c17}.lv-correction .matched{color:var(--lv-success)}.lv-correction .warn{padding:12px;border:1px solid var(--lv-danger);border-radius:8px;background:var(--lv-danger-soft);color:var(--lv-danger);font-size:12px}
      .lv-correction .success{padding:12px;border:1px solid var(--lv-success);border-radius:8px;background:var(--lv-success-soft);color:var(--lv-success);font-size:12px}
      .lv-correction .selection{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:13px}.lv-correction .selection label{min-width:0}.lv-correction .selection select{width:100%}
      .lv-correction .detail{padding:10px 12px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-muted);margin:10px 0;font-size:12px}
      .lv-correction .reviewrow{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
      @media(max-width:900px){.lv-correction .cards{grid-template-columns:repeat(2,minmax(0,1fr))}.lv-correction .selection{grid-template-columns:1fr}}
      @media(max-width:530px){.lv-correction .cards{grid-template-columns:1fr}.lv-correction h1{font-size:22px}}
    `}</style>
    <header className="head">
      <div><span className="eyebrow">LAND VIEW / INVOICE SYSTEM 3.2</span><h1>Allocation Correction Center</h1>
        <p>Move an existing linked payment between invoices only after separate administrator approval. This never creates or deletes a payment, changes its amount, or overwrites the original invoice.</p></div>
      <nav className="links" aria-label="Finance links"><Link href="/admin/finance/integrity">Financial Integrity</Link><Link href="/admin/finance/adjustments">Credit / Debit Notes</Link><Link href="/admin/finance/invoices">Invoices</Link></nav>
    </header>
    <form className="panel lookup" onSubmit={(event) => { event.preventDefault(); void refresh(fileId); }}>
      <label>Project / File ID<input value={fileId} placeholder="LV-209" onChange={(event) => setFileId(event.target.value)} required/></label>
      <button disabled={loading || sending}>{loading ? "Loading…" : "Review project"}</button>
      {loaded && <button type="button" className="secondary" onClick={() => void refresh(loaded.projectCode)} disabled={loading || sending}>Refresh</button>}
    </form>
    {error && <div className="warn" role="alert">{error}</div>}
    {notice && <div className="success" role="status">{notice}</div>}
    {loaded && <>
      <section className="cards" aria-label="Payment reconciliation summary">
        <div><span>Received</span><strong>{money(loaded.summary.receivedAmount)}</strong></div>
        <div><span>Linked to invoices</span><strong>{money(loaded.summary.allocatedAmount)}</strong></div>
        <div><span>Unallocated advance</span><strong>{money(loaded.summary.unallocatedAmount)}</strong></div>
        <div><span>Ledger exceptions</span><strong>{loaded.summary.ledgerExceptions}</strong></div>
      </section>
      {!loaded.ledgerAvailable && <div className="warn" role="alert">Ledger comparison is temporarily unavailable. Do not interpret missing ledger results as financial differences.</div>}
      <section className="panel">
        <h2>Payment-to-ledger verification</h2>
        <p>Cross-check each recorded receipt against its TXN-PAY ledger entry. Missing receipt attachments are informational, not proof that money is missing.</p>
        <div className="tablewrap"><table><thead><tr><th>Payment</th><th>Category</th><th className="amount">Received</th><th className="amount">Allocated</th><th className="amount">Advance</th><th>Receipt</th><th>Ledger check</th></tr></thead><tbody>
          {loaded.payments.map((payment) => <tr key={payment.id}>
            <td><strong>{payment.code}</strong><small>{payment.date || "Date unavailable"} · {payment.method || "—"} {payment.reference || ""}</small></td>
            <td>{payment.category}</td><td className="amount">{money(payment.amount)}</td><td className="amount">{money(payment.allocated)}</td><td className="amount">{money(payment.unallocated)}</td>
            <td>{payment.receiptAttached ? "Attached" : "Not attached"}</td>
            <td><span className={`kind ${payment.ledgerStatus}`}>{payment.ledgerStatus.toUpperCase()}</span>{payment.ledgerReason && <small>{payment.ledgerReason}</small>}</td>
          </tr>)}
          {!loaded.payments.length && <tr><td colSpan={7}>No effective payments found.</td></tr>}
        </tbody></table></div>
      </section>
      <section className="panel">
        <h2>Request an allocation correction</h2>
        <p>Select one existing invoice-linked allocation, then select an issued invoice in the same project and category. Changes require a second person's approval; the amount remains fixed.</p>
        <div className="selection">
          <label>Existing payment allocation
            <select value={selection} onChange={(event) => { setSelection(event.target.value); setDestination(""); }}>
              <option value="">Choose a payment → bill allocation</option>
              {loaded.allocations.filter((item) => item.effective).map((item) => <option key={item.id} value={item.id}>
                {item.paymentCode} → {item.billCode} / {item.invoiceCode} · {money(item.amount)}
              </option>)}
            </select>
          </label>
          <label>Move to invoice
            <select value={destination} onChange={(event) => setDestination(event.target.value)} disabled={!selection}>
              <option value="">Choose a compatible issued invoice</option>
              {available.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.billCode} / {invoice.code} · Available {money(invoice.amount - invoice.allocated)}</option>)}
            </select>
          </label>
        </div>
        {activeAllocation && <div className="detail">Selected: {activeAllocation.paymentCode} · {money(activeAllocation.amount)} currently allocated to {activeAllocation.billCode}. {activeInvoice?.settled ? "This historical settled bill cannot be changed through this workflow." : "Only the invoice link can be changed."}</div>}
        <label>Reason and supporting reference<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Describe the original allocation error and the receipt, statement or approval that supports the correction." maxLength={1000}/></label>
        <button type="button" disabled={sending || !selection || !destination || reason.trim().length < 12} onClick={() => void request()}>{sending ? "Submitting…" : "Submit for Approval"}</button>
      </section>
      <section className="panel">
        <h2>Approval queue & immutable audit history</h2>
        <p>An administrator other than the requester may approve or reject a pending request. Historical Paid and unverified cases must be investigated separately.</p>
        <label>Administrator decision reason<textarea value={approvalReason} onChange={(event) => setApprovalReason(event.target.value)} placeholder="Why is this correction approved or rejected?" maxLength={1000}/></label>
        <div className="tablewrap"><table><thead><tr><th>Request / Actor</th><th>Allocation</th><th>Reason</th><th>Status</th><th>Decision</th></tr></thead><tbody>
          {loaded.requests.map((entry) => <tr key={entry.requestCode}>
            <td><strong>{entry.requestCode}</strong><small>{date(entry.requestedAt)} · {entry.requestedBy}</small></td>
            <td>{entry.paymentCode} · {money(entry.amount)}<small>{entry.fromBillCode} → {entry.toBillCode}</small></td>
            <td>{entry.reason}</td><td><span className="kind">{entry.status.toUpperCase()}</span>{entry.resolvedBy && <small>Reviewed by {entry.resolvedBy}</small>}</td>
            <td>{entry.status === "pending" ? <div className="reviewrow">
              <button type="button" disabled={sending || approvalReason.trim().length < 12} onClick={() => void decide(entry, "approve")}>Approve</button>
              <button type="button" className="secondary" disabled={sending || approvalReason.trim().length < 12} onClick={() => void decide(entry, "reject")}>Reject</button>
            </div> : "Recorded"}</td>
          </tr>)}
          {!loaded.requests.length && <tr><td colSpan={5}>No correction requests for {loaded.projectCode}.</td></tr>}
        </tbody></table></div>
      </section>
    </>}
  </main>;
}
