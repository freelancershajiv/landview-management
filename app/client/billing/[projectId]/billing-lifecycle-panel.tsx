"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

type Invoice = { invoiceCode?: string; billCode?: string; issueDate?: string; category?: string; amount?: number; paid?: number; due?: number; status?: string };
type Receipt = { receiptCode?: string; paymentCode?: string; date?: string; amount?: number; allocated?: number; unallocated?: number; allocationStatus?: string; method?: string; reference?: string; receiptUrl?: string };
type Lifecycle = { invoices?: Invoice[]; receipts?: Receipt[]; unallocated?: number };

const money = (value: unknown) => new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(Number(value || 0));
const date = (value: unknown) => {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(d);
};

export default function BillingLifecyclePanel() {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(String(params?.projectId || ""));
  const [data, setData] = useState<Lifecycle | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const normalized = projectId.toUpperCase().startsWith("LV-") ? projectId.toUpperCase() : `LV-${projectId}`;
    fetch(`/api/project-billing?fileId=${encodeURIComponent(normalized)}`, { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => { const json = await response.json().catch(() => null); if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load invoice lifecycle.")); return json.data?.lifecycle || {}; })
      .then((next) => { if (active) setData(next); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : "Could not load invoice lifecycle."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectId]);

  const invoices = data?.invoices || [];
  const receipts = data?.receipts || [];
  const invoiceTotals = useMemo(() => invoices.reduce((sum, row) => ({ amount: sum.amount + Number(row.amount || 0), paid: sum.paid + Number(row.paid || 0), due: sum.due + Number(row.due || 0) }), { amount: 0, paid: 0, due: 0 }), [invoices]);

  if (loading) return <div className="blc blc-loading"><style>{css}</style>Loading invoice & receipt lifecycle…</div>;
  if (error) return <div className="blc blc-error"><style>{css}</style>{error}</div>;
  if (!invoices.length && !receipts.length) return null;

  return <section className="blc"><style>{css}</style>
    <header className="blc-head"><div><small>BILLING 2.0 / LIVE LIFECYCLE</small><h2>Invoices & Receipts</h2><p>Issued invoices, payment allocation and official verified receipts for this project.</p></div>{Number(data?.unallocated || 0) > 0.009 && <span className="blc-advance">Advance / Unallocated {money(data?.unallocated)}</span>}</header>
    <div className="blc-stats"><div><span>Invoice Value</span><strong>{money(invoiceTotals.amount)}</strong></div><div><span>Allocated Paid</span><strong>{money(invoiceTotals.paid)}</strong></div><div><span>Invoice Due</span><strong>{money(invoiceTotals.due)}</strong></div><div><span>Receipts</span><strong>{receipts.length}</strong></div></div>

    <div className="blc-block"><div className="blc-title"><strong>Invoices</strong><span>Old bills are mirrored; new Billing 2.0 invoices update automatically.</span></div><div className="blc-table"><table><thead><tr><th>Invoice</th><th>Date</th><th>Category</th><th>Amount</th><th>Paid</th><th>Due</th><th>Status</th></tr></thead><tbody>{invoices.map((row) => <tr key={`${row.invoiceCode}-${row.billCode}`}><td><strong>{row.invoiceCode || row.billCode || "Invoice"}</strong><small>{row.billCode || ""}</small></td><td>{date(row.issueDate)}</td><td>{row.category || "—"}</td><td>{money(row.amount)}</td><td className="paid">{money(row.paid)}</td><td className={Number(row.due || 0) > 0.009 ? "due" : ""}>{money(row.due)}</td><td><span className={`pill ${String(row.status || "").toLowerCase().replace(/\s+/g,"-")}`}>{row.status || "ISSUED"}</span></td></tr>)}</tbody></table></div></div>

    <div className="blc-block"><div className="blc-title"><strong>Payment Receipts</strong><span>Each approved payment receives a permanent verification link.</span></div><div className="blc-table"><table><thead><tr><th>Receipt</th><th>Date</th><th>Amount</th><th>Allocated</th><th>Advance</th><th>Method</th><th>Verify</th></tr></thead><tbody>{receipts.map((row) => <tr key={row.paymentCode || row.receiptCode}><td><strong>{row.receiptCode || row.paymentCode}</strong><small>{row.reference || row.paymentCode || ""}</small></td><td>{date(row.date)}</td><td>{money(row.amount)}</td><td className="paid">{money(row.allocated)}</td><td className={Number(row.unallocated || 0) > 0.009 ? "advance" : ""}>{money(row.unallocated)}</td><td>{row.method || "—"}</td><td>{row.receiptUrl ? <Link className="verify" href={row.receiptUrl}>Verified receipt →</Link> : "—"}</td></tr>)}</tbody></table></div></div>
  </section>;
}

const css = `
.blc{max-width:1240px;margin:18px auto 36px;padding:15px;border:1px solid var(--lv-border-default);border-radius:13px;background:var(--lv-surface-panel);color:var(--lv-text-primary);box-shadow:var(--lv-shadow-sm)}.blc *{box-sizing:border-box}.blc-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.blc-head small{color:var(--lv-brand-text);font-size:8px;font-weight:950;letter-spacing:.12em}.blc-head h2{margin:5px 0 3px;font-size:18px}.blc-head p{margin:0;color:var(--lv-text-muted);font-size:9px}.blc-advance{padding:7px 9px;border-radius:999px;background:var(--lv-warning-soft);color:var(--lv-warning);font-size:8px;font-weight:900}.blc-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-top:12px}.blc-stats div{padding:10px;border:1px solid var(--lv-border-subtle);border-radius:8px;background:var(--lv-surface-muted)}.blc-stats span{display:block;color:var(--lv-text-muted);font-size:7px;text-transform:uppercase;font-weight:900}.blc-stats strong{display:block;margin-top:5px;font-size:13px}.blc-block{margin-top:12px;border:1px solid var(--lv-border-subtle);border-radius:9px;overflow:hidden}.blc-title{display:flex;justify-content:space-between;gap:12px;padding:10px 12px;background:var(--lv-surface-muted)}.blc-title strong{font-size:10px}.blc-title span{color:var(--lv-text-muted);font-size:8px}.blc-table{overflow:auto}.blc table{width:100%;min-width:820px;border-collapse:collapse}.blc th,.blc td{padding:9px 10px;border-top:1px solid var(--lv-border-subtle);text-align:left;font-size:8px}.blc th{color:var(--lv-text-muted);font-size:7px;text-transform:uppercase}.blc td strong{display:block;font-size:9px}.blc td small{display:block;margin-top:2px;color:var(--lv-text-muted);font-size:7px}.blc .paid{color:var(--lv-success);font-weight:900}.blc .due{color:var(--lv-danger);font-weight:900}.blc .advance{color:var(--lv-warning);font-weight:900}.pill{display:inline-block;padding:4px 6px;border-radius:999px;background:var(--lv-surface-muted);font-size:7px;font-weight:950}.pill.paid{background:var(--lv-success-soft);color:var(--lv-success)}.pill.partially-paid{background:var(--lv-warning-soft);color:var(--lv-warning)}.pill.issued{background:var(--lv-brand-soft);color:var(--lv-brand-text)}.verify{color:var(--lv-brand-text);font-weight:900;text-decoration:none}.blc-loading,.blc-error{max-width:1240px;margin:18px auto;padding:12px;font-size:9px}.blc-error{color:var(--lv-danger)}@media(max-width:720px){.blc{margin:12px 14px 28px}.blc-head{flex-direction:column}.blc-stats{grid-template-columns:1fr 1fr}.blc-title{flex-direction:column;gap:3px}}`;
