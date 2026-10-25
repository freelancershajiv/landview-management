"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type DueFilter = "all" | "engineering" | "supervision" | "other";
type DueRow = {
  projectId: string;
  projectName: string;
  clientName: string;
  phone: string;
  address: string;
  engineeringDue: number;
  supervisionDue: number;
  otherDue: number;
  totalDue: number;
  invoiceDueTotal: number;
  writeoffTotal: number;
  unallocatedAmount: number;
  openInvoiceCount: number;
  lastPaymentDate: string;
  lastPaymentAmount: number;
};
type DueResponse = {
  rows: DueRow[];
  totals: { engineering: number; supervision: number; other: number; total: number; unallocated: number };
};

function money(value: number) {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value || 0);
}
function displayDate(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10) || "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}
async function loadDueBills(): Promise<DueResponse> {
  const response = await fetch("/api/billing/due-bills", { credentials: "same-origin", cache: "no-store" });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load due bills."));
  return json.data as DueResponse;
}

export default function DueBillsPage() {
  const [rows, setRows] = useState<DueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DueFilter>("all");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    loadDueBills().then((data) => {
      if (cancelled) return;
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setLoaded(true);
    }).catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Could not load due bills.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [revision]);

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "engineering" && row.engineeringDue <= 0.009) return false;
      if (filter === "supervision" && row.supervisionDue <= 0.009) return false;
      if (filter === "other" && row.otherDue <= 0.009) return false;
      if (!q) return true;
      return [row.projectId, row.clientName, row.projectName, row.phone, row.address].some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [rows, query, filter]);

  const totals = useMemo(() => visibleRows.reduce((sum, row) => ({
    engineering: sum.engineering + row.engineeringDue,
    supervision: sum.supervision + row.supervisionDue,
    other: sum.other + row.otherDue,
    total: sum.total + row.totalDue,
  }), { engineering: 0, supervision: 0, other: 0, total: 0 }), [visibleRows]);

  return <main className="due-page">
    <style>{`
      .due-page{max-width:1540px;margin:0 auto;color:var(--lv-text-primary)}.due-page *{box-sizing:border-box}.due-head{display:flex;align-items:flex-end;justify-content:space-between;gap:15px;margin-bottom:13px}.due-head small{display:block;color:var(--lv-brand-text);font-size:8px;font-weight:950;letter-spacing:.13em}.due-head h1{margin:5px 0 3px;font-size:28px}.due-head p{margin:0;color:var(--lv-text-muted);font-size:9px}.due-refresh{min-height:37px;padding:0 12px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:9px;font-weight:900;cursor:pointer}.due-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:12px}.due-stat{padding:12px;border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-panel)}.due-stat span{display:block;font-size:7px;font-weight:900;text-transform:uppercase;color:var(--lv-text-muted)}.due-stat strong{display:block;margin-top:6px;font-size:17px}.due-stat.total strong{color:var(--lv-danger)}.due-toolbar{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 11px;border:1px solid var(--lv-border-default);border-radius:10px 10px 0 0;background:var(--lv-surface-panel)}.due-search{min-width:260px;max-width:480px;flex:1;min-height:38px;padding:8px 10px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary)}.due-filters{display:flex;gap:5px;flex-wrap:wrap}.due-filter{min-height:35px;padding:0 10px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-secondary);font-size:8px;font-weight:900;cursor:pointer}.due-filter.active{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.due-error{padding:11px 12px;margin-bottom:10px;border-radius:8px;background:var(--lv-danger-soft);color:var(--lv-danger);font-size:9px}.due-table-wrap{overflow:auto;border:1px solid var(--lv-border-default);border-top:0;border-radius:0 0 10px 10px;background:var(--lv-surface-panel)}.due-table{width:100%;border-collapse:collapse;min-width:1320px}.due-table th,.due-table td{padding:10px 11px;border-bottom:1px solid var(--lv-border-subtle);text-align:left;font-size:8px;vertical-align:middle}.due-table th{position:sticky;top:0;background:var(--lv-surface-muted);color:var(--lv-text-muted);font-size:7px;text-transform:uppercase;letter-spacing:.04em;z-index:1}.due-table tbody tr:hover{background:var(--lv-surface-muted)}.due-file{font-size:9px;font-weight:950;color:var(--lv-brand-text)}.due-client strong{display:block;font-size:9px}.due-client span,.due-contact span{display:block;margin-top:3px;color:var(--lv-text-muted);font-size:7px}.due-number{font-variant-numeric:tabular-nums;white-space:nowrap}.due-number.total{font-size:10px;font-weight:950;color:var(--lv-danger)}.due-note{display:block;margin-top:3px;color:var(--lv-warning);font-size:6px;font-weight:850;white-space:normal}.due-last strong{display:block;font-size:8px}.due-last span{display:block;margin-top:3px;color:var(--lv-text-muted);font-size:7px}.due-actions{display:flex;gap:5px;white-space:nowrap}.due-link{display:inline-flex;align-items:center;justify-content:center;min-height:30px;padding:0 8px;border:1px solid var(--lv-border-default);border-radius:6px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:7px;font-weight:900;text-decoration:none}.due-link.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.due-empty{padding:32px;text-align:center;color:var(--lv-text-muted);font-size:9px}@media(max-width:1050px){.due-summary{grid-template-columns:repeat(3,1fr)}.due-toolbar{align-items:stretch;flex-direction:column}.due-search{max-width:none;width:100%}}@media(max-width:650px){.due-head{align-items:flex-start;flex-direction:column}.due-summary{grid-template-columns:1fr 1fr}.due-refresh{width:100%}.due-filters{display:grid;grid-template-columns:1fr 1fr}.due-filter{width:100%}}
    `}</style>

    <header className="due-head"><div><small>LAND VIEW / RECEIVABLES</small><h1>Due Bills</h1><p>Invoice and allocation truth. Unallocated payments do not reduce unrelated invoice dues.</p></div><button className="due-refresh" disabled={loading} onClick={() => setRevision((value) => value + 1)}>{loading ? "Refreshing…" : "Refresh"}</button></header>
    {error && <div className="due-error">{error}</div>}

    <section className="due-summary">
      <div className="due-stat"><span>Due Projects</span><strong>{visibleRows.length}</strong></div>
      <div className="due-stat"><span>Engineering Due</span><strong>{money(totals.engineering)}</strong></div>
      <div className="due-stat"><span>Supervision Due</span><strong>{money(totals.supervision)}</strong></div>
      <div className="due-stat"><span>Other Services Due</span><strong>{money(totals.other)}</strong></div>
      <div className="due-stat total"><span>Total Collectible Due</span><strong>{money(totals.total)}</strong></div>
    </section>

    <section>
      <div className="due-toolbar">
        <input className="due-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search File ID, client, project, phone or address…" />
        <div className="due-filters">
          {([ ["all","All Due"], ["engineering","Engineering"], ["supervision","Supervision"], ["other","Other Services"] ] as const).map(([key,label]) => <button key={key} className={`due-filter ${filter===key?"active":""}`} onClick={() => setFilter(key)}>{label}</button>)}
        </div>
      </div>
      <div className="due-table-wrap">
        {loading && !loaded ? <div className="due-empty">Loading current Billing 2.0 receivables…</div> : visibleRows.length ? <table className="due-table">
          <thead><tr><th>File ID</th><th>Client / Project</th><th>Contact</th><th>Engineering Due</th><th>Supervision Due</th><th>Other Due</th><th>Total Due</th><th>Last Payment</th><th>Actions</th></tr></thead>
          <tbody>{visibleRows.map((row) => <tr key={row.projectId}>
            <td><span className="due-file">{row.projectId}</span></td>
            <td className="due-client"><strong>{row.clientName || "—"}</strong><span>{row.projectName || "—"}</span></td>
            <td className="due-contact"><strong>{row.phone || "—"}</strong><span>{row.address || "—"}</span></td>
            <td className="due-number">{row.engineeringDue > .009 ? money(row.engineeringDue) : "—"}</td>
            <td className="due-number">{row.supervisionDue > .009 ? money(row.supervisionDue) : "—"}</td>
            <td className="due-number">{row.otherDue > .009 ? money(row.otherDue) : "—"}</td>
            <td className="due-number total">{money(row.totalDue)}{row.unallocatedAmount > .009 && <span className="due-note">{money(row.unallocatedAmount)} unallocated / advance</span>}</td>
            <td className="due-last"><strong>{row.lastPaymentAmount > .009 ? money(row.lastPaymentAmount) : "—"}</strong><span>{displayDate(row.lastPaymentDate)}</span></td>
            <td><div className="due-actions"><Link className="due-link primary" href={`/admin/finance/workspace?fileId=${encodeURIComponent(row.projectId)}`}>Billing 2.0</Link><Link className="due-link" href={`/admin/finance/service-payments?fileId=${encodeURIComponent(row.projectId)}`}>Receive</Link><Link className="due-link" href={`/admin/finance/invoices?fileId=${encodeURIComponent(row.projectId)}`}>Statement</Link></div></td>
          </tr>)}</tbody>
        </table> : <div className="due-empty">No due bills match this view.</div>}
      </div>
    </section>
  </main>;
}
