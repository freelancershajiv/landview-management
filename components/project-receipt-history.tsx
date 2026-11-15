"use client";

import { useCallback, useEffect, useState } from "react";

type ReceiptPayment = {
  paymentCode: string;
  receiptCode: string;
  projectCode: string;
  date: string;
  amount: number;
  allocated: number;
  unallocated: number;
  method: string;
  approval: string;
  category: string;
  receiptStatus: string;
  receiptUrl: string;
  allocations: Array<{ billCode: string; invoiceCode: string; serviceName: string; amount: number }>;
};

const money = (amount: number) => "৳" + Number(amount || 0).toLocaleString("en-BD", { maximumFractionDigits: 2 });
const printHref = (receiptUrl: string) => {
  const token = /^\/verify\/receipt\/([A-Za-z0-9]{20,80})$/.exec(receiptUrl)?.[1];
  return token ? "/api/billing/receipt-print?token=" + encodeURIComponent(token) + "&autoprint=1" : "";
};
const date = (value: string) => {
  if (!value) return "—";
  const parts = value.slice(0, 10).split("-");
  return parts.length === 3 ? [parts[2], parts[1], parts[0]].join("/") : value;
};

export default function ProjectReceiptHistory({
  projectId, highlightPaymentCode = "", clientView = false,
}: { projectId: string; highlightPaymentCode?: string; clientView?: boolean }) {
  const [payments, setPayments] = useState<ReceiptPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/billing/project-receipts?projectId=${encodeURIComponent(projectId)}`, {
        credentials: "same-origin", cache: "no-store",
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) throw new Error(String(result?.error || "Could not load receipts."));
      setPayments(Array.isArray(result.data?.payments) ? result.data.payments : []);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load receipts."); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { void load(); }, [load, highlightPaymentCode]);

  async function copyReceipt(path: string, paymentCode: string) {
    if (!path) return;
    try {
      await navigator.clipboard.writeText(window.location.origin + path);
      setCopied(paymentCode);
    } catch { setError("Could not copy this link. Use View Receipt to share its address."); }
  }

  const selected = highlightPaymentCode ? payments.find(row => row.paymentCode === highlightPaymentCode) : undefined;
  const shown = clientView ? payments.slice(0, 20) : payments.slice(0, 100);

  return <section className="lv-receipts" aria-label="Project payment receipts">
    <style>{`
      .lv-receipts{padding:16px;border:1px solid var(--lv-border-default, #d5dce3);border-radius:12px;background:var(--lv-surface-panel, #fff);color:var(--lv-text-primary,#1c252d)}
      .lv-receipts *{box-sizing:border-box}.lv-receipts h3{margin:0;font-size:16px;color:inherit}.lv-receipts p{margin:5px 0 0;font-size:12px;color:var(--lv-text-secondary,#64748b)}
      .lv-receipts-head{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
      .lv-receipts button,.lv-receipts a.lv-receipt-action{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:7px 12px;border:1px solid var(--lv-border-default,#cbd5e1);border-radius:8px;background:var(--lv-surface-input,#fff);color:var(--lv-text-primary,#111827);font-size:12px;font-weight:700;text-decoration:none;cursor:pointer}
      .lv-receipts .primary{background:var(--lv-brand-primary,#b4232c)!important;color:var(--lv-text-inverse,#fff)!important;border-color:var(--lv-brand-primary,#b4232c)!important}
      .lv-receipt-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
      .lv-receipt-notice{padding:10px 12px;margin:13px 0;border-radius:8px;background:var(--lv-surface-muted,#f1f5f9);font-size:12px}
      .lv-receipt-notice.error{color:var(--lv-danger,#b42318)}.lv-receipt-notice.success{border:1px solid var(--lv-success,#168048)}
      .lv-receipts-scroll{overflow-x:auto;margin-top:12px}.lv-receipts table{width:100%;min-width:660px;border-collapse:collapse}
      .lv-receipts th,.lv-receipts td{text-align:left;vertical-align:top;border-top:1px solid var(--lv-border-subtle,#e5e7eb);padding:11px 9px;font-size:12px;color:inherit}
      .lv-receipts th{color:var(--lv-text-secondary,#64748b);font-size:11px}.lv-receipts small{display:block;color:var(--lv-text-secondary,#64748b);margin-top:4px}
      .lv-receipt-allocations{display:grid;gap:2px}.lv-receipt-allocations span{font-size:11px}
      @media(max-width:600px){.lv-receipts{padding:12px}.lv-receipts h3{font-size:14px}.lv-receipts th,.lv-receipts td{padding:9px 7px}}
    `}</style>
    <div className="lv-receipts-head">
      <div><h3>Payments & Receipts</h3><p>Each receipt links to its original payment in {projectId}. Invoice allocations reflect the current ledger.</p></div>
      <button type="button" disabled={loading} onClick={() => void load()}>{loading ? "Refreshing…" : "Refresh receipts"}</button>
    </div>
    {selected && <div className="lv-receipt-notice success">
      <strong>Saved payment: {selected.paymentCode} · {money(selected.amount)}</strong>
      <div className="lv-receipt-actions" style={{marginTop:8}}>
        {selected.receiptUrl ? <>
          <a className="lv-receipt-action" href={selected.receiptUrl} target="_blank" rel="noreferrer">View Receipt</a>
          {printHref(selected.receiptUrl) && <a className="lv-receipt-action primary" href={printHref(selected.receiptUrl)} target="_blank" rel="noopener noreferrer">Print / Save PDF</a>}
          <button type="button" onClick={() => void copyReceipt(selected.receiptUrl, selected.paymentCode)}>{copied === selected.paymentCode ? "Link copied" : "Copy receipt link"}</button>
        </> : <span>Receipt not yet issued; verify payment approval and refresh.</span>}
      </div>
    </div>}
    {highlightPaymentCode && !selected && !loading && !error && <div className="lv-receipt-notice">Payment saved. Refresh receipts to load its record.</div>}
    {error && <div role="alert" className="lv-receipt-notice error">{error}</div>}
    {!error && !loading && payments.length === 0 && <div className="lv-receipt-notice">No project payments were found.</div>}
    <div className="lv-receipts-scroll"><table>
      <thead><tr><th>Payment</th><th>Date</th><th>Received</th><th>Applied to invoices</th><th>Receipt</th></tr></thead>
      <tbody>{shown.map(payment => <tr key={payment.paymentCode} style={payment.paymentCode === highlightPaymentCode ? {background:"var(--lv-surface-muted,#f8fafc)"} : undefined}>
        <td><strong>{payment.paymentCode}</strong><small>{payment.method || payment.category || "Client payment"}</small></td>
        <td>{date(payment.date)}</td>
        <td><strong>{money(payment.amount)}</strong><small>{payment.unallocated > .009 ? `${money(payment.unallocated)} not allocated to invoices` : "Fully allocated"}</small></td>
        <td><div className="lv-receipt-allocations">{payment.allocations.length ? payment.allocations.map((item, i) =>
          <span key={item.invoiceCode + i}>{item.serviceName || item.billCode || "Invoice"} · {money(item.amount)}<small>{item.billCode}</small></span>
        ) : <span>No invoice allocation recorded</span>}</div></td>
        <td>{payment.receiptUrl ? <div className="lv-receipt-actions">
          <a className="lv-receipt-action" href={payment.receiptUrl} target="_blank" rel="noreferrer">View</a>
          {printHref(payment.receiptUrl) && <a className="lv-receipt-action primary" href={printHref(payment.receiptUrl)} target="_blank" rel="noopener noreferrer">Print / PDF</a>}
          <button type="button" onClick={() => void copyReceipt(payment.receiptUrl, payment.paymentCode)}>{copied===payment.paymentCode?"Copied":"Share link"}</button>
        </div> : <small>Not issued</small>}</td>
      </tr>)}</tbody>
    </table></div>
    {!clientView && payments.length > 100 && <p>Showing the latest 100 payments. Older receipts remain in the payment register.</p>}
  </section>;
}
