"use client";

import LinkedWorkAction from "@/components/linked-work-action";

import "./due-bills.css";

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
        <input className="due-search" aria-label="Search due bills" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search File ID, client, project, phone or address…" />
        <div className="due-filters">
          {([ ["all","All Due"], ["engineering","Engineering"], ["supervision","Supervision"], ["other","Other Services"] ] as const).map(([key,label]) => <button key={key} className={`due-filter ${filter===key?"active":""}`} data-lv-button={filter===key?"primary":"secondary"} aria-pressed={filter===key} onClick={() => setFilter(key)}>{label}</button>)}
        </div>
      </div>
      {/* A compact read-only representation of the exact same receivables.
          The desktop table remains available and no billing state is changed. */}
      {(!loading || loaded) && visibleRows.length > 0 && <div className="due-mobile-cards" aria-label="Due bills mobile summary">
        {visibleRows.map((row) => <article className="due-mobile-card" key={row.projectId}>
          <div className="due-mobile-card-head">
            <div className="due-mobile-identity">
              <span className="due-file">{row.projectId}</span>
              <strong>{row.clientName || row.projectName || "Client"}</strong>
              {row.projectName && row.projectName !== row.clientName && <small>{row.projectName}</small>}
            </div>
            <div className="due-mobile-amount">
              <span>Total collectible due</span>
              <strong>{money(row.totalDue)}</strong>
            </div>
          </div>
          <div className="due-mobile-breakdown">
            <div><span>Engineering</span><strong>{row.engineeringDue > .009 ? money(row.engineeringDue) : "—"}</strong></div>
            <div><span>Supervision</span><strong>{row.supervisionDue > .009 ? money(row.supervisionDue) : "—"}</strong></div>
            <div><span>Other services</span><strong>{row.otherDue > .009 ? money(row.otherDue) : "—"}</strong></div>
          </div>
          {row.unallocatedAmount > .009 && <p className="due-mobile-warning">{money(row.unallocatedAmount)} unallocated / advance — not applied to this due</p>}
          <div className="due-mobile-meta">
            <span>{row.phone || "No contact"}{row.address ? ` · ${row.address}` : ""}</span>
            <span>Last payment: {row.lastPaymentAmount > .009 ? money(row.lastPaymentAmount) : "—"} · {displayDate(row.lastPaymentDate)}</span>
          </div>
          <div className="due-mobile-actions">
            <Link className="due-link primary" data-lv-button="primary" href={`/admin/finance/workspace?fileId=${encodeURIComponent(row.projectId)}`}>Open Billing</Link>
            <Link className="due-link" data-lv-button="secondary" href={`/admin/finance/service-payments?fileId=${encodeURIComponent(row.projectId)}`}>Receive</Link><Link className="due-link" data-lv-button="secondary" href={`/admin/billing/full-bill-editor?fileId=${encodeURIComponent(row.projectId)}#bill-discount`}>Apply Discount</Link><Link className="due-link" data-lv-button="secondary" href={`/admin/billing/writeoffs?fileId=${encodeURIComponent(row.projectId)}`}>Write Off</Link>
            <Link className="due-link" data-lv-button="secondary" href={`/admin/finance/invoices?fileId=${encodeURIComponent(row.projectId)}`}>Statement</Link><LinkedWorkAction projectCode={row.projectId} title={"Payment follow-up — "+row.projectId} source="Billing: Due Bills. Verify current collectible amount before contacting the client." label="Follow-up task"/>
          </div>
        </article>)}
      </div>}
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
            <td><div className="due-actions"><Link className="due-link primary" data-lv-button="primary" href={`/admin/finance/workspace?fileId=${encodeURIComponent(row.projectId)}`}>Billing 2.0</Link><Link className="due-link" data-lv-button="secondary" href={`/admin/finance/service-payments?fileId=${encodeURIComponent(row.projectId)}`}>Receive</Link><Link className="due-link" data-lv-button="secondary" href={`/admin/billing/full-bill-editor?fileId=${encodeURIComponent(row.projectId)}#bill-discount`}>Apply Discount</Link><Link className="due-link" data-lv-button="secondary" href={`/admin/billing/writeoffs?fileId=${encodeURIComponent(row.projectId)}`}>Write Off</Link><Link className="due-link" data-lv-button="secondary" href={`/admin/finance/invoices?fileId=${encodeURIComponent(row.projectId)}`}>Statement</Link><LinkedWorkAction projectCode={row.projectId} title={"Payment follow-up — "+row.projectId} source="Billing: Due Bills. Verify current collectible amount before contacting the client." label="Follow-up task"/></div></td>
          </tr>)}</tbody>
        </table> : <div className="due-empty">No due bills match this view.</div>}
      </div>
    </section>
  </main>;
}
