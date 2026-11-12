"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type Summary = {
  project: { code: string; name: string; owner: string; location: string; phase: string; proposalCode: string };
  financial: { billed: number; paid: number; due: number; openInvoiceCount: number } | null;
  todos: { count: number; open: number; items: Array<{ code: string; title: string; status: string; dueDate: string }> };
  services: { count: number; items: Array<{ id: string; name: string; status: string; type: string }> };
  documents: Array<{ key: string; name: string; receiptCount: number; status: string }>;
  siteVisits: number | null;
  warnings: string[];
  refreshedAt: string;
};

function money(value: number) {
  return "৳" + value.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function V4ProjectPreview() {
  const params = useParams<{ projectId: string }>();
  const projectCode = decodeURIComponent(String(params?.projectId || "")).toUpperCase();
  const encoded = encodeURIComponent(projectCode);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!projectCode) return;
    let mounted = true;
    fetch(`/api/admin/projects/v4-summary?projectId=${encoded}`, { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.success) throw new Error(String(body?.error || "Unable to load project summary."));
        return body.data as Summary;
      })
      .then((data) => { if (mounted) setSummary(data); })
      .catch((reason) => { if (mounted) setError(reason instanceof Error ? reason.message : "Unable to load project."); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [projectCode, encoded]);

  const base = `/admin/projects/${encoded}`;

  return <main className="lv4-root">
    <style>{`
      .lv4-root{display:grid;gap:18px;color:var(--lv-text-primary);max-width:1450px;margin:0 auto}
      .lv4-heading,.lv4-card{border:1px solid var(--lv-border-default);background:var(--lv-surface-panel);border-radius:14px;padding:20px}
      .lv4-heading{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap}
      .lv4-kicker{font-size:10px;letter-spacing:.1em;color:var(--lv-text-muted);text-transform:uppercase;font-weight:800}
      .lv4-heading h1{margin:6px 0;font-size:24px;line-height:1.25;color:var(--lv-text-strong)}
      .lv4-muted{color:var(--lv-text-muted);font-size:12px;line-height:1.6}
      .lv4-links{display:flex;flex-wrap:wrap;gap:8px}
      .lv4-links a,.lv4-action{border:1px solid var(--lv-border-default);padding:9px 12px;border-radius:9px;text-decoration:none;color:var(--lv-text-primary);background:var(--lv-surface-muted);font-size:12px;font-weight:700}
      .lv4-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
      .lv4-metric{background:var(--lv-surface-panel);border:1px solid var(--lv-border-default);padding:17px;border-radius:12px;min-width:0}
      .lv4-metric small{display:block;color:var(--lv-text-muted);font-size:11px}
      .lv4-metric strong{display:block;color:var(--lv-text-strong);font-size:24px;margin-top:8px;overflow-wrap:anywhere}
      .lv4-columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px}
      .lv4-card h2{margin:0 0 14px;font-size:17px;color:var(--lv-text-strong)}
      .lv4-list{display:grid;gap:8px}
      .lv4-item{display:flex;justify-content:space-between;gap:12px;align-items:center;border:1px solid var(--lv-border-subtle);padding:10px 12px;border-radius:9px}
      .lv4-item span{font-size:12px}.lv4-item small{color:var(--lv-text-muted);font-size:10px}
      .lv4-status{font-size:10px;font-weight:800;background:var(--lv-surface-muted);padding:5px 8px;border-radius:999px;text-align:center;max-width:135px}
      .lv4-warning{border-left:3px solid #dba649;padding:11px 14px;background:var(--lv-surface-muted);border-radius:7px;font-size:12px}
      .lv4-module-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      .lv4-module-grid a{padding:15px;border-radius:10px;border:1px solid var(--lv-border-default);background:var(--lv-surface-muted);color:var(--lv-text-primary);font-size:12px;text-decoration:none;font-weight:700}
      @media(max-width:950px){.lv4-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.lv4-columns{grid-template-columns:1fr}.lv4-module-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:510px){.lv4-grid,.lv4-module-grid{grid-template-columns:1fr}.lv4-heading h1{font-size:20px}}
    `}</style>
    <header className="lv4-heading">
      <div>
        <div className="lv4-kicker">LAND VIEW v4.0 / read-only design preview</div>
        <h1>{summary ? `${summary.project.code} — ${summary.project.name}` : projectCode}</h1>
        <div className="lv4-muted">{summary ? [summary.project.owner, summary.project.location, summary.project.phase].filter(Boolean).join(" · ") : "Unified project overview"}</div>
      </div>
      <div className="lv4-links">
        <Link href={base}>Current Project View</Link>
        <Link href={base + "/lifecycle"}>Lifecycle Workspace</Link>
      </div>
    </header>
    {loading && <section className="lv4-card">Loading existing project records…</section>}
    {error && <section className="lv4-card" role="alert">{error}</section>}
    {summary && <>
      <section className="lv4-grid" aria-label="Project metrics">
        <div className="lv4-metric"><small>Total billed</small><strong>{summary.financial ? money(summary.financial.billed) : "Unavailable"}</strong></div>
        <div className="lv4-metric"><small>Effective payments</small><strong>{summary.financial ? money(summary.financial.paid) : "Unavailable"}</strong></div>
        <div className="lv4-metric"><small>Collectible due</small><strong>{summary.financial ? money(summary.financial.due) : "Unavailable"}</strong></div>
        <div className="lv4-metric"><small>Open To-Dos</small><strong>{summary.todos.open}</strong></div>
      </section>

      {summary.warnings.length > 0 && <div className="lv4-list" role="status">{summary.warnings.map((warning) => <div className="lv4-warning" key={warning}>{warning}</div>)}</div>}

      <div className="lv4-columns">
        <section className="lv4-card">
          <h2>Action Required — To-Do</h2>
          <div className="lv4-list">
            {summary.todos.items.map((item) => <div className="lv4-item" key={item.code}>
              <div><span>{item.title || item.code}</span><div><small>{item.code}{item.dueDate ? " · Due " + item.dueDate : ""}</small></div></div>
              <span className="lv4-status">{item.status || "Open"}</span>
            </div>)}
            {!summary.todos.items.length && <div className="lv4-muted">No open project To-Dos recorded.</div>}
          </div>
          <p className="lv4-muted">This view is read-only; manage work in the existing To-Do module.</p>
          <Link className="lv4-action" href="/admin/todo">Open To-Do</Link>
        </section>
        <section className="lv4-card">
          <h2>Client Document Requirements</h2>
          <div className="lv4-list">
            {summary.documents.map((item) => <div className="lv4-item" key={item.key}>
              <span>{item.name}</span><span className="lv4-status">{item.status}</span>
            </div>)}
          </div>
          <p className="lv4-muted">Statuses reflect existing receiving records only; formal verification and owner-specific requirements will be added without altering past receipts.</p>
          <Link className="lv4-action" href="/admin/project-operations/document-register">Open Existing Document Register</Link>
        </section>
      </div>

      <div className="lv4-columns">
        <section className="lv4-card">
          <h2>Service Workflows ({summary.services.count})</h2>
          <div className="lv4-list">{summary.services.items.map((item) => <div className="lv4-item" key={item.id}>
            <span>{item.name}</span><span className="lv4-status">{item.status || "Not started"}</span>
          </div>)}</div>
          {!summary.services.items.length && <p className="lv4-muted">No service workflow recorded.</p>}
          <p className="lv4-muted">Statuses shown as recorded; payment and delivery permissions must be checked in their authoritative modules.</p>
          <Link className="lv4-action" href={base + "/lifecycle"}>Open Workflow</Link>
        </section>
        <section className="lv4-card">
          <h2>Project Modules</h2>
          <div className="lv4-module-grid">
            <Link href={base}>Project Details</Link>
            <Link href="/admin/finance/payment-lifecycle">Bills &amp; Payments</Link>
            <Link href="/admin/todo">To-Do</Link>
            <Link href={base + "/lifecycle"}>Workflow</Link>
            <Link href="/admin/project-operations/document-register">Documents</Link>
            <Link href={base + "/references"}>Reference Images</Link>
            <Link href="/admin/project-operations/by-project">Project Operations</Link>
            <Link href="/admin/finance">Finance</Link>
            <Link href={base}>Site Visits &amp; Activity</Link>
          </div>
          <p className="lv4-muted">Site visits on record: {summary.siteVisits === null ? "Unavailable" : summary.siteVisits}. Existing pages remain the editable source.</p>
        </section>
      </div>
      <p className="lv4-muted">Prototype only: no conversion, payment, file upload, workflow advancement or notification action is performed on this page.</p>
    </>}
  </main>;
}
