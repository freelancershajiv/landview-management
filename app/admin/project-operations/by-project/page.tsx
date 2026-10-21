"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;

function money(value: unknown) {
  const n = Number(value || 0);
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);
}

async function parse(response: Response, fallback: string) {
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || fallback));
  return json.data;
}

async function loadWorkflow() {
  const [workflow, documentData] = await Promise.all([
    parse(await fetch("/api/service-workflow?mode=project", { credentials: "same-origin", cache: "no-store" }), "Could not load project operations."),
    parse(await fetch("/api/document-register/stats", { credentials: "same-origin", cache: "no-store" }), "Could not load document statistics."),
  ]);
  return { ...workflow, documentStats: documentData?.stats || {} };
}

async function post(payload: Row) {
  return parse(await fetch("/api/service-workflow", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }), "Could not update project operations.");
}

function isFinished(row: Row) {
  const statuses: string[] = row.statuses || [];
  return statuses.length > 0 && row.status === statuses[statuses.length - 1];
}

function serviceProgress(row: Row) {
  const statuses: string[] = row.statuses || [];
  if (statuses.length <= 1) return isFinished(row) ? 100 : 0;
  const index = Math.max(0, statuses.indexOf(String(row.status || "")));
  return Math.round((index / (statuses.length - 1)) * 100);
}

function reopenedPhase(row: Row) {
  const workflowType = String(row.workflowType || "").toLowerCase();
  const serviceName = String(row.serviceName || "").toLowerCase();
  if (workflowType === "municipality") return "Approval Stage";
  if (serviceName.includes("supervision")) return "Supervision / Construction Stage";
  return "Design Stage";
}

export default function ByProjectOperationsPage() {
  const [data, setData] = useState<Row>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await loadWorkflow()); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load project operations."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function updateService(row: Row, status: string) {
    if (busy) return;
    setBusy(`S:${row.id}`); setError(""); setMessage("");
    try {
      const updated = await post({ action: "updateProjectServiceStatus", id: row.id, status });
      const statuses: string[] = row.statuses || [];
      const final = String(statuses[statuses.length - 1] || "");
      const reopened = String(row.lifecyclePhase || "") === "Completed" && status !== final;
      const nextPhase = reopened ? reopenedPhase(row) : String(row.lifecyclePhase || "");
      const updatedAt = updated?.updated_at || new Date().toISOString();
      setData((current) => ({
        ...current,
        workflows: (current.workflows || []).map((item: Row) => {
          if (item.projectId !== row.projectId) return item;
          const projectUpdate = reopened ? { lifecyclePhase: nextPhase } : {};
          return item.id === row.id ? { ...item, ...projectUpdate, status, updatedAt } : { ...item, ...projectUpdate };
        }),
      }));
      setMessage(`${row.projectId} · ${row.serviceName} moved to ${status}.${reopened ? " The completed project was reopened automatically for correction." : ""}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update service."); }
    finally { setBusy(""); }
  }

  async function markProjectComplete(projectId: string, ownerName: string) {
    if (busy) return;
    const confirmed = window.confirm(`Mark ${projectId}${ownerName ? ` · ${ownerName}` : ""} fully completed?\n\nBilling, payments, discounts and ledger history will not be changed.`);
    if (!confirmed) return;
    setBusy(`C:${projectId}`); setError(""); setMessage("");
    try {
      const result = await post({ action: "markProjectComplete", projectId, reason: "Manually marked complete from Project Operations · By Project." });
      const updatedAt = new Date().toISOString();
      setData((current) => ({
        ...current,
        workflows: (current.workflows || []).map((item: Row) => {
          if (item.projectId !== projectId) return item;
          const statuses: string[] = item.statuses || [];
          return { ...item, status: statuses[statuses.length - 1] || item.status, lifecyclePhase: "Completed", updatedAt };
        }),
      }));
      setMessage(`${projectId} marked Completed. ${Number(result?.servicesClosed || 0)} open service workflow${Number(result?.servicesClosed || 0) === 1 ? " was" : "s were"} closed.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not complete project."); }
    finally { setBusy(""); }
  }

  const workflows: Row[] = data.workflows || [];
  const documentStats: Record<string, Row> = data.documentStats || {};
  const projects = useMemo(() => {
    const grouped = new Map<string, Row[]>();
    for (const row of workflows) {
      const projectId = String(row.projectId || "").trim();
      if (!projectId) continue;
      const rows = grouped.get(projectId) || [];
      rows.push(row); grouped.set(projectId, rows);
    }
    const q = query.trim().toLowerCase();
    return Array.from(grouped.entries())
      .filter(([projectId, rows]) => {
        if (!q) return true;
        const first = rows[0] || {};
        return [projectId, first.ownerName, first.story, first.location, ...rows.flatMap((r) => [r.serviceName, r.status, r.billingCategory])].join(" ").toLowerCase().includes(q);
      })
      .sort((a, b) => b[0].localeCompare(a[0], undefined, { numeric: true }));
  }, [workflows, query]);

  const totals = useMemo(() => {
    const done = workflows.filter(isFinished).length;
    return { projects: projects.length, services: workflows.length, active: workflows.length - done, done };
  }, [projects.length, workflows]);

  return (
    <main className="byp-shell">
      <style>{`
        .byp-shell{max-width:100%;color:var(--lv-text-primary)}.byp-shell *{box-sizing:border-box}
        .byp-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:14px}.byp-head h2{margin:0;font-size:24px}.byp-head p{margin:5px 0 0;font-size:12px;color:var(--lv-text-secondary)}.byp-actions{display:flex;gap:8px;flex-wrap:wrap}.byp-btn{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 12px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);text-decoration:none;font-size:11px;font-weight:900}.byp-btn.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}
        .byp-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:12px}.byp-kpi{padding:12px 13px;border:1px solid var(--lv-border-default);border-radius:9px;background:var(--lv-surface-panel)}.byp-kpi span{display:block;font-size:10px;text-transform:uppercase;font-weight:900;color:var(--lv-text-muted)}.byp-kpi strong{display:block;margin-top:4px;font-size:20px}.byp-search{width:100%;min-height:42px;margin-bottom:12px;padding:0 13px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:12px}.byp-msg{margin-bottom:10px;padding:10px 12px;border-radius:8px;font-size:11px}.byp-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.byp-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}
        .byp-table-wrap{overflow:auto;border:1px solid var(--lv-border-default);border-radius:11px;background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm)}.byp-table{width:100%;border-collapse:collapse;min-width:980px}.byp-table th{padding:11px 12px;background:var(--lv-surface-muted);border-bottom:1px solid var(--lv-border-default);font-size:10px;text-align:left;text-transform:uppercase;letter-spacing:.04em;color:var(--lv-text-muted)}.byp-table td{padding:12px;border-bottom:1px solid var(--lv-border-subtle);vertical-align:middle;font-size:11px}.byp-table tr:last-child td{border-bottom:0}.byp-id{font-weight:950;font-size:12px;color:var(--lv-text-strong)}.byp-owner strong{display:block;font-size:12px}.byp-owner span{display:block;margin-top:3px;color:var(--lv-text-muted);font-size:10px}.byp-chips{display:flex;gap:5px;flex-wrap:wrap;max-width:430px}.byp-chip{display:inline-flex;padding:5px 7px;border-radius:999px;background:var(--lv-brand-soft);color:var(--lv-brand-text);font-size:9px;font-weight:900}.byp-progress{min-width:120px}.byp-progress-top{display:flex;justify-content:space-between;gap:8px;margin-bottom:5px;font-size:10px}.byp-bar{height:7px;border-radius:999px;background:var(--lv-surface-muted);overflow:hidden}.byp-bar i{display:block;height:100%;background:var(--lv-brand-primary);border-radius:999px}.byp-attn strong{display:block;font-size:11px}.byp-attn span{display:block;margin-top:3px;color:var(--lv-text-muted);font-size:10px}.byp-row-action{display:flex;gap:6px;justify-content:flex-end}.byp-small{min-height:31px;padding:0 9px;border:1px solid var(--lv-border-default);border-radius:6px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:10px;font-weight:900;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}.byp-small.primary{background:var(--lv-brand-primary);color:var(--lv-text-inverse);border-color:var(--lv-brand-border)}
        .byp-expand td{padding:0;background:var(--lv-surface-muted)}.byp-detail{padding:13px 14px}.byp-detail-head{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}.byp-detail-head strong{font-size:12px}.byp-detail-actions{display:flex;gap:6px;flex-wrap:wrap}.byp-complete{min-height:32px;padding:0 10px;border:1px solid var(--lv-success-border);border-radius:6px;background:var(--lv-success-soft);color:var(--lv-success);font-size:10px;font-weight:950;cursor:pointer}.byp-done{display:inline-flex;align-items:center;min-height:32px;padding:0 10px;border:1px solid var(--lv-success-border);border-radius:999px;background:var(--lv-success-soft);color:var(--lv-success);font-size:10px;font-weight:950}.byp-services{display:grid;gap:8px}.byp-service{display:grid;grid-template-columns:minmax(170px,1fr) 130px 155px minmax(170px,.75fr) 160px;gap:10px;align-items:center;padding:10px 11px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-panel)}.byp-service-name strong{display:block;font-size:11px}.byp-service-name span{display:block;margin-top:3px;font-size:9px;color:var(--lv-text-muted)}.byp-status{display:inline-flex;width:max-content;padding:5px 8px;border-radius:999px;background:var(--lv-brand-soft);color:var(--lv-brand-text);font-size:10px;font-weight:950}.byp-doc-link{display:block;text-decoration:none;color:var(--lv-text-primary)}.byp-doc-link strong{display:block;font-size:11px;color:var(--lv-brand-primary)}.byp-doc-link span{display:block;margin-top:3px;font-size:9px;color:var(--lv-text-muted)}.byp-money{font-size:10px;color:var(--lv-text-muted)}.byp-money strong{display:block;margin-top:3px;font-size:11px;color:var(--lv-text-primary)}.byp-service select{width:100%;min-height:34px;padding:6px;border:1px solid var(--lv-border-default);border-radius:6px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:10px}.byp-empty{padding:32px;text-align:center;color:var(--lv-text-muted);font-size:12px}
        @media(max-width:1050px){.byp-service{grid-template-columns:1fr 1fr 1fr}}@media(max-width:900px){.byp-head{align-items:flex-start;flex-direction:column}.byp-kpis{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){.byp-kpis{grid-template-columns:1fr}.byp-service{grid-template-columns:1fr}.byp-actions{width:100%}.byp-btn{flex:1}}
      `}</style>

      <header className="byp-head">
        <div><h2>By Project</h2><p>Scan projects quickly, then expand one row to manage services and their document registers.</p></div>
        <div className="byp-actions"><Link className="byp-btn" href="/admin/finance/service-payments">Pay / Allocate Services</Link><Link className="byp-btn primary" href="/admin/projects">Open Projects</Link></div>
      </header>

      <section className="byp-kpis">
        <div className="byp-kpi"><span>Projects</span><strong>{totals.projects}</strong></div>
        <div className="byp-kpi"><span>Opened Services</span><strong>{totals.services}</strong></div>
        <div className="byp-kpi"><span>Active</span><strong>{totals.active}</strong></div>
        <div className="byp-kpi"><span>Completed</span><strong>{totals.done}</strong></div>
      </section>

      <input className="byp-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search project ID, owner, story, location, service or status…" />
      {error && <div className="byp-msg bad">{error}</div>}{message && <div className="byp-msg good">{message}</div>}

      {loading ? <div className="byp-empty">Loading project operations…</div> : <div className="byp-table-wrap"><table className="byp-table">
        <thead><tr><th>Project</th><th>Owner / Story</th><th>Services</th><th>Progress</th><th>Current Attention</th><th style={{textAlign:"right"}}>Action</th></tr></thead>
        <tbody>
          {projects.map(([projectId, rows]) => {
            const first = rows[0] || {};
            const projectCompleted = String(first.lifecyclePhase || "") === "Completed";
            const progress = projectCompleted ? 100 : Math.round(rows.reduce((sum, row) => sum + serviceProgress(row), 0) / Math.max(1, rows.length));
            const attention = rows.find((row) => !isFinished(row)) || rows[rows.length - 1];
            const open = expanded === projectId;
            return <tbody key={projectId} style={{display:"contents"}}>
              <tr>
                <td><span className="byp-id">{projectId}</span><div style={{marginTop:4,fontSize:10,color:"var(--lv-text-muted)"}}>{first.location || "Location —"}</div></td>
                <td className="byp-owner"><strong>{first.ownerName || "Owner"}</strong><span>{first.story || "Story —"}</span></td>
                <td><div className="byp-chips">{rows.map((row) => <span className="byp-chip" key={row.id}>{row.serviceName}</span>)}</div></td>
                <td><div className="byp-progress"><div className="byp-progress-top"><span>{projectCompleted ? "Completed" : "Overall"}</span><strong>{progress}%</strong></div><div className="byp-bar"><i style={{width:`${progress}%`}} /></div></div></td>
                <td className="byp-attn"><strong>{projectCompleted ? "Project Completed" : attention?.serviceName || "—"}</strong><span>{projectCompleted ? "All project work closed" : attention?.status || "—"}</span></td>
                <td><div className="byp-row-action"><button className="byp-small primary" type="button" onClick={() => setExpanded(open ? null : projectId)}>{open ? "Hide" : "View"}</button><Link className="byp-small" href={`/admin/projects/${encodeURIComponent(projectId)}`}>Project</Link></div></td>
              </tr>
              {open && <tr className="byp-expand"><td colSpan={6}><div className="byp-detail">
                <div className="byp-detail-head"><strong>{projectId} · {first.ownerName || "Owner"} · {first.story || "Story —"}</strong><div className="byp-detail-actions">{projectCompleted ? <span className="byp-done">✓ Project Completed · editable for corrections</span> : <button className="byp-complete" disabled={busy === `C:${projectId}`} onClick={() => void markProjectComplete(projectId, first.ownerName || "")}>{busy === `C:${projectId}` ? "Completing…" : "✓ Mark Project Complete"}</button>}</div></div>
                <div className="byp-services">{rows.map((row) => {
                  const docs = documentStats[row.id] || {};
                  return <div className="byp-service" key={row.id}>
                    <div className="byp-service-name"><strong>{row.serviceName}</strong><span>{row.billingCategory}</span></div>
                    <span className="byp-status">{row.status}</span>
                    <Link className="byp-doc-link" href={`/admin/project-operations/document-register?workflowId=${encodeURIComponent(row.id)}`}><strong>Documents {Number(docs.total || 0)}</strong><span>{Number(docs.total || 0) ? `${Number(docs.pending || 0)} pending · ${Number(docs.delivered || 0)} delivered` : "Open / initialize register"}</span></Link>
                    <div className="byp-money">Paid / Net<strong>{money(row.paidAmount)} / {money(row.netAmount)}</strong></div>
                    <select value={row.status} disabled={busy === `S:${row.id}`} onChange={(e) => void updateService(row, e.target.value)}>{(row.statuses || []).map((status: string) => <option key={status}>{status}</option>)}</select>
                  </div>;
                })}</div>
              </div></td></tr>}
            </tbody>;
          })}
          {!projects.length && <tr><td colSpan={6}><div className="byp-empty">No project service workflows found.</div></td></tr>}
        </tbody>
      </table></div>}
    </main>
  );
}
