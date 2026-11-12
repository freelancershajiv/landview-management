"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Exception = {
  type: string;
  projectCode: string;
  billCode: string;
  paymentCode: string;
  amount: number;
  explanation: string;
  source?: string;
};
type Integrity = {
  snapshotAt: string;
  complete: boolean;
  scanned: Record<string, number>;
  counts: Record<string, number>;
  exceptionCount: number;
  allocationGapTotal: number;
  exceptions: Exception[];
};
const money = (value: number) => "৳" + Number(value || 0).toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const labels: Record<string, string> = {
  paid_allocation_gap: "Paid / Allocation Gap",
  missing_invoice: "Bill Missing Invoice",
  invoice_missing_bill: "Invoice Missing Bill",
  allocation_reference: "Invalid Allocation Link",
  payment_overallocated: "Overallocated Payment",
};

export default function InvoiceIntegrityPage() {
  const [data, setData] = useState<Integrity | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/billing/integrity", { credentials: "same-origin", cache: "no-store" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success || !json?.data) throw new Error(String(json?.error || "Could not load invoice integrity results."));
      setData(json.data as Integrity);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load invoice integrity results.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const exceptions = useMemo(() => (data?.exceptions || []).filter((row) =>
    [row.projectCode, row.billCode, row.paymentCode, row.source, labels[row.type], row.explanation].join(" ").toLowerCase().includes(search.toLowerCase().trim())
  ), [data, search]);

  return <main className="integrity"><style>{styles}</style>
    <header className="integrity-head">
      <div><small>LAND VIEW / FINANCE 2.0</small><h1>Invoice Integrity</h1>
        <p>Read-only checks of bill links, invoice allocations and Paid status exceptions. This screen cannot modify bills or payments.</p></div>
      <button type="button" onClick={() => void load()} disabled={loading}>{loading ? "Checking…" : "Refresh Audit"}</button>
    </header>
    {error && <p className="integrity-error" role="alert">{error}</p>}
    {loading && <p className="integrity-info" role="status">Checking current financial records…</p>}
    {data && <>
      {!data.complete && <p className="integrity-error" role="alert">Result limit reached; this audit may be incomplete. Do not rely on the totals until the dataset is paginated.</p>}
      <section className="integrity-grid" aria-label="Integrity summary">
        <div><span>Bills reviewed</span><strong>{data.scanned.bills || 0}</strong></div>
        <div><span>Missing invoices</span><strong>{data.counts.missingInvoice || 0}</strong></div>
        <div><span>Unmatched invoices</span><strong>{data.counts.invoiceMissingBill || 0}</strong></div>
        <div><span>Paid allocation exceptions</span><strong>{data.counts.paidAllocationGap || 0}</strong></div>
        <div><span>Allocation references to review</span><strong>{(data.counts.allocationReference || 0) + (data.counts.paymentOverallocated || 0)}</strong></div>
      </section>
      <section className="integrity-note">
        <strong>Allocation gap flagged: {money(data.allocationGapTotal)}</strong>
        <p>This figure is <b>not</b> a verified outstanding receivable. Legacy payments, adjustments or historical settlements may explain the gaps. Review each item before any financial correction.</p>
        <p>Audit time: {new Date(data.snapshotAt).toLocaleString("en-BD", { timeZone: "Asia/Dhaka" })} · {data.exceptionCount} exceptions found. Showing up to 250 records.</p>
      </section>
      <section className="integrity-panel">
        <div className="integrity-top"><div><h2>Exceptions to review</h2><p>Open the project billing records to compare original bills, payment allocations and adjustments.</p></div>
          <input aria-label="Search integrity exceptions" placeholder="Search project, bill or issue" value={search} onChange={(event) => setSearch(event.target.value)}/></div>
        <div className="integrity-table"><table><thead><tr><th>File</th><th>Exception</th><th>Bill / Payment</th><th>Difference</th><th>Explanation</th><th>Review</th></tr></thead><tbody>
          {exceptions.length ? exceptions.map((row, index) => <tr key={row.type + ":" + row.projectCode + ":" + row.billCode + ":" + row.paymentCode + ":" + index}>
            <td><strong>{row.projectCode || "—"}</strong></td><td>{labels[row.type] || row.type}</td>
            <td>{row.billCode || row.paymentCode || "—"}{row.source && <span className="integrity-source">{row.source}</span>}</td><td>{row.amount > 0 ? money(row.amount) : "—"}</td>
            <td>{row.explanation}</td><td>{row.projectCode ? <Link href={`/admin/finance/bills?fileId=${encodeURIComponent(row.projectCode)}`}>Open Bills</Link> : "—"}</td>
          </tr>) : <tr><td colSpan={6}>No exceptions match the current search.</td></tr>}
        </tbody></table></div>
      </section>
    </>}
  </main>;
}

const styles = `
.integrity{max-width:1500px;margin:0 auto;color:var(--lv-text-primary)}.integrity *{box-sizing:border-box}
.integrity-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:15px}
.integrity-head small{color:var(--lv-brand-text);font-size:10px;font-weight:800;letter-spacing:.12em}
.integrity-head h1{font-size:26px;margin:5px 0}.integrity-head p{font-size:12px;max-width:790px;color:var(--lv-text-muted);line-height:1.5;margin:0}
.integrity-head button{border:1px solid var(--lv-brand-border);background:var(--lv-brand-primary);color:var(--lv-text-inverse);border-radius:8px;font-size:12px;font-weight:800;padding:11px 15px;cursor:pointer}
.integrity-head button:disabled{opacity:.65;cursor:wait}
.integrity-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
.integrity-grid div{border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-panel);padding:15px;min-width:0}
.integrity-grid span{display:block;color:var(--lv-text-muted);font-size:11px}.integrity-grid strong{display:block;margin-top:7px;font-size:21px}
.integrity-note{margin-top:14px;background:var(--lv-surface-muted);border:1px solid var(--lv-border-default);border-radius:10px;padding:14px}
.integrity-note strong{display:block;font-size:16px}.integrity-note p{font-size:12px;line-height:1.5;color:var(--lv-text-muted);margin:6px 0 0}
.integrity-panel{margin-top:16px;border:1px solid var(--lv-border-default);border-radius:11px;background:var(--lv-surface-panel);overflow:hidden}
.integrity-top{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:14px}
.integrity-top h2{font-size:16px;margin:0}.integrity-top p{font-size:11px;line-height:1.4;color:var(--lv-text-muted);margin:5px 0 0}
.integrity-top input{min-width:260px;max-width:100%;background:var(--lv-surface-input);border:1px solid var(--lv-border-default);border-radius:8px;padding:10px 12px;color:var(--lv-text-primary);font-size:12px}
.integrity-table{overflow:auto}.integrity-table table{width:100%;min-width:920px;border-collapse:collapse}
.integrity-table td,.integrity-table th{padding:11px;border-top:1px solid var(--lv-border-subtle);text-align:left;font-size:11px;vertical-align:top}
.integrity-table th{color:var(--lv-text-muted);font-weight:800}.integrity-table td:nth-child(5){max-width:360px;color:var(--lv-text-muted);line-height:1.4}
.integrity-table a{color:var(--lv-brand-text);font-weight:800;text-decoration:none;white-space:nowrap}.integrity-source{display:block;margin-top:5px;color:var(--lv-text-muted);font-size:10px}
.integrity-info,.integrity-error{border-radius:8px;padding:14px;background:var(--lv-surface-muted);font-size:12px}
.integrity-error{color:var(--lv-danger,#c64747)}
@media(max-width:900px){.integrity-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.integrity-head{align-items:flex-start;flex-direction:column}.integrity-top{align-items:stretch;flex-direction:column}.integrity-top input{width:100%}}
@media(max-width:500px){.integrity-grid{grid-template-columns:1fr}}
`;
