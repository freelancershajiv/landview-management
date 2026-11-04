"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

// Existing LAND VIEW data gateway returns heterogeneous row shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
type Payload = { projects: Row[]; employees: Row[]; today: string; refreshedAt: string; source: string; historyLimit: number; totals: Row };
type Filter = "All" | "Needs Attention" | "Overdue" | "Completed";
const FILTERS: Filter[] = ["All", "Needs Attention", "Overdue", "Completed"];

function text(value: unknown, fallback = "—") { return String(value ?? "").trim() || fallback; }
function pct(value: unknown) { return Math.min(100, Math.max(0, Number(value || 0))); }
function formatTime(value: unknown) {
  const date = new Date(String(value || ""));
  if (!Number.isFinite(date.getTime())) return text(value);
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(date);
}
function workTotal(project: Row) { return (project.tasks?.length || 0) + (project.todos?.length || 0) + (project.services?.length || 0); }
function attention(project: Row) { return Number(project.overdue || 0) + Number(project.blocked || 0) + Number(project.syncIssues || 0); }
async function request(url: string, body?: Row) {
  const response = await fetch(url, { method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const value = await response.json().catch(() => null);
  if (!response.ok || !value?.success) throw new Error(String(value?.error || "Workflow request failed."));
  return value.data;
}

export default function WorkflowOverviewPage() {
  const [data, setData] = useState<Payload>({ projects: [], employees: [], today: "", refreshedAt: "", source: "", historyLimit: 0, totals: {} });
  const [selectedCode, setSelectedCode] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const fresh = await request("/api/admin/workflow/overview") as Payload;
      setData(fresh);
      setSelectedCode((previous) => {
        if (previous && fresh.projects.some((row) => row.code === previous)) return previous;
        const url = new URLSearchParams(window.location.search);
        const preferred = String(url.get("project") || "").trim().toUpperCase();
        return fresh.projects.find((row) => row.code === preferred)?.code || fresh.projects.find((row) => attention(row) > 0)?.code || fresh.projects[0]?.code || "";
      });
      setError("");
    } catch (err) { if (!silent) setError(err instanceof Error ? err.message : "Could not load Workflow."); }
    finally { if (!silent) setLoading(false); }
  }, []);

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => { void load(); }, 0);
    const refresh = () => { if (document.visibilityState === "visible") void load(true); };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [load]);

  const metrics = useMemo(() => ({
    projects: data.projects.length,
    active: data.projects.filter((p) => workTotal(p) > 0 && p.lifecyclePhase !== "Completed").length,
    overdue: data.projects.reduce((sum, p) => sum + Number(p.overdue || 0), 0),
    blocked: data.projects.reduce((sum, p) => sum + Number(p.blocked || 0), 0),
    sync: data.projects.reduce((sum, p) => sum + Number(p.syncIssues || 0), 0),
  }), [data.projects]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.projects.filter((p) => {
      if (filter === "Completed" && p.lifecyclePhase !== "Completed") return false;
      if (filter === "Overdue" && !p.overdue) return false;
      if (filter === "Needs Attention" && !attention(p) && !p.unassigned) return false;
      return !needle || [p.code, p.name, p.lifecyclePhase, ...(p.services || []).map((s: Row) => s.name)].join(" ").toLowerCase().includes(needle);
    }).sort((a, b) => {
      const aRank = attention(a), bRank = attention(b);
      return bRank - aRank || String(b.code).localeCompare(String(a.code), undefined, { numeric: true });
    });
  }, [data.projects, query, filter]);

  const project = filtered.find((row) => row.code === selectedCode) || filtered[0] || null;
  const tasks: Row[] = project?.tasks || [];
  const services: Row[] = project?.services || [];
  const todos: Row[] = project?.todos || [];

  async function taskAction(task: Row, action: string, fields: Row = {}) {
    if (busy) return;
    setBusy(task.code + ":" + action); setNotice(""); setError("");
    try {
      await request("/api/admin/workflow/overview", { action, taskCode: task.code, ...fields });
      await load(true);
      setNotice(`${project?.code || "Project"} · ${task.title}: update saved to Workflow.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Task update failed."); }
    finally { setBusy(""); }
  }
  async function serviceAction(service: Row, status: string) {
    if (busy || status === service.status) return;
    setBusy(service.id); setNotice(""); setError("");
    try {
      await request("/api/service-workflow", { action: "updateProjectServiceStatus", id: service.id, status });
      await load(true);
      setNotice(`${project?.code || "Project"} · ${service.name} moved to ${status}.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Service update failed."); }
    finally { setBusy(""); }
  }
  function setBlock(task: Row) {
    const reason = window.prompt("Why is this responsibility blocked?", task.blockerReason || "");
    if (reason !== null && reason.trim()) void taskAction(task, "block", { reason: reason.trim() });
  }

  return <main className="wov-shell">
    <style>{`
      .wov-shell{color:var(--lv-text-primary)}.wov-shell *{box-sizing:border-box}
      .wov-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px;flex-wrap:wrap}
      .wov-heading h2{margin:0;color:var(--lv-text-strong);font-size:23px}.wov-heading p{margin:6px 0 0;font-size:12px;color:var(--lv-text-secondary);line-height:1.55}
      .wov-heading-actions{display:flex;gap:8px;flex-wrap:wrap}
      .wov-btn,.wov-button{display:inline-flex;align-items:center;justify-content:center;min-height:34px;border-radius:8px;padding:7px 11px;background:var(--lv-surface-input);color:var(--lv-text-primary);border:1px solid var(--lv-border-default);font-size:11px;font-weight:800;text-decoration:none;cursor:pointer}
      .wov-btn.primary,.wov-button.primary{background:var(--lv-brand-primary);color:var(--lv-text-inverse);border-color:var(--lv-brand-border)}
      .wov-button:disabled,.wov-select:disabled{opacity:.5;cursor:not-allowed}
      .wov-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:14px}
      .wov-metric{border:1px solid var(--lv-border-default);background:var(--lv-surface-panel);padding:14px;border-radius:11px}
      .wov-metric small{font-size:10px;text-transform:uppercase;color:var(--lv-text-muted);font-weight:850}.wov-metric strong{display:block;margin-top:5px;font-size:24px;font-weight:900}
      .wov-grid{display:grid;grid-template-columns:minmax(250px,320px) minmax(0,1fr);gap:14px;align-items:start}
      .wov-panel{background:var(--lv-surface-panel);border:1px solid var(--lv-border-default);border-radius:12px;overflow:hidden;box-shadow:var(--lv-shadow-sm)}
      .wov-sidebar{position:sticky;top:80px;max-height:calc(100vh - 100px);overflow:auto}
      .wov-sidebar-controls{padding:12px;border-bottom:1px solid var(--lv-border-subtle)}
      .wov-search,.wov-select,.wov-date{width:100%;min-height:35px;border:1px solid var(--lv-border-default);border-radius:7px;padding:7px 9px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:11px}
      .wov-filters{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
      .wov-filter{font-size:10px;border:1px solid var(--lv-border-default);background:var(--lv-surface-input);color:var(--lv-text-secondary);border-radius:7px;padding:7px 8px;cursor:pointer}
      .wov-filter.active{background:var(--lv-brand-primary);color:var(--lv-text-inverse);border-color:var(--lv-brand-border)}
      .wov-listitem{display:block;width:100%;text-align:left;border:0;border-bottom:1px solid var(--lv-border-subtle);background:transparent;padding:12px 13px;cursor:pointer;color:var(--lv-text-primary)}
      .wov-listitem.active{background:var(--lv-brand-soft);box-shadow:inset 3px 0 0 var(--lv-brand-primary)}
      .wov-listitem-head{display:flex;justify-content:space-between;gap:8px;align-items:center}
      .wov-listitem-head strong{font-size:12px}.wov-listitem-head small{font-size:11px;font-weight:900}
      .wov-listitem-name{display:block;margin-top:4px;font-size:11px;color:var(--lv-text-secondary);white-space:nowrap;text-overflow:ellipsis;overflow:hidden}
      .wov-listitem-meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:7px;font-size:10px;color:var(--lv-text-muted)}
      .wov-empty{padding:26px 16px;color:var(--lv-text-muted);font-size:12px}
      .wov-content{display:grid;gap:13px;min-width:0}.wov-detail-head{padding:15px}
      .wov-detail-head-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap}
      .wov-detail-head h3{margin:0;font-size:19px}.wov-sub{font-size:11px;margin-top:4px;color:var(--lv-text-muted)}
      .wov-tags{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.wov-tag{display:inline-flex;padding:5px 8px;border-radius:20px;background:var(--lv-surface-muted);border:1px solid var(--lv-border-subtle);font-size:10px;color:var(--lv-text-secondary)}
      .wov-progress-track{width:100%;height:8px;background:var(--lv-surface-muted);border-radius:12px;overflow:hidden;margin-top:9px}.wov-progress-track i{display:block;height:100%;background:var(--lv-brand-primary);border-radius:12px}
      .wov-section-head{display:flex;align-items:center;justify-content:space-between;gap:9px;padding:13px 14px;border-bottom:1px solid var(--lv-border-default)}
      .wov-section-head h3{margin:0;font-size:14px}.wov-section-head small{font-size:10px;color:var(--lv-text-muted)}
      .wov-stage-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;padding:12px}
      .wov-stage{border:1px solid var(--lv-border-default);border-radius:10px;padding:11px;min-width:0}
      .wov-stage strong{display:block;font-size:11px;line-height:1.45;min-height:32px}
      .wov-stage-meta{display:flex;justify-content:space-between;margin-top:8px;gap:8px;font-size:10px;color:var(--lv-text-muted)}
      .wov-stage-meta b{color:var(--lv-text-strong);font-size:14px}
      .wov-tablewrap{overflow-x:auto}.wov-table{width:100%;border-collapse:collapse;min-width:760px}
      .wov-table th{background:var(--lv-surface-muted);text-transform:uppercase;color:var(--lv-text-muted);font-size:10px;letter-spacing:.03em;text-align:left;padding:10px;border-bottom:1px solid var(--lv-border-default)}
      .wov-table td{padding:11px 10px;font-size:11px;vertical-align:top;border-bottom:1px solid var(--lv-border-subtle)}
      .wov-table tr:last-child td{border-bottom:0}.wov-table td strong{display:block;font-size:11px}.wov-table td small{display:block;font-size:10px;line-height:1.5;color:var(--lv-text-muted);margin-top:4px}
      .wov-pill{display:inline-flex;font-size:10px;padding:4px 7px;border-radius:15px;font-weight:800;background:var(--lv-surface-muted)}
      .wov-pill.warn{background:var(--lv-warning-soft);color:var(--lv-warning)}.wov-pill.danger{background:var(--lv-danger-soft);color:var(--lv-danger)}
      .wov-control-stack{display:grid;gap:6px;min-width:145px}.wov-control-row{display:flex;gap:5px;flex-wrap:wrap}
      .wov-link{font-weight:800;color:var(--lv-brand-primary);text-decoration:none;font-size:11px}.wov-task-title{max-width:260px}
      .wov-feed{padding:2px 15px 11px}.wov-event{padding:11px 0;border-bottom:1px solid var(--lv-border-subtle);display:grid;gap:4px;font-size:11px}
      .wov-event:last-child{border-bottom:0}.wov-event strong{font-size:11px}.wov-event small{font-size:10px;color:var(--lv-text-muted)}
      .wov-msg{padding:11px 13px;border-radius:9px;margin-bottom:12px;font-size:11px}
      .wov-msg.error{background:var(--lv-danger-soft);color:var(--lv-danger)}.wov-msg.ok{background:var(--lv-success-soft);color:var(--lv-success)}
      .wov-muted{color:var(--lv-text-muted);font-size:11px;padding:13px}
      @media(max-width:1200px){.wov-grid{grid-template-columns:260px minmax(0,1fr)}.wov-metrics{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:900px){.wov-grid{grid-template-columns:1fr}.wov-sidebar{position:static;max-height:310px}.wov-stage-grid{grid-template-columns:1fr}.wov-metrics{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:520px){.wov-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.wov-metric strong{font-size:19px}.wov-detail-head h3{font-size:16px}}
    `}</style>

    <header className="wov-heading">
      <div><h2>Workflow Control Center</h2><p>Live project stages, service progress, responsibility dependencies and linked To Do. Stage updates remain management-controlled.</p></div>
      <div className="wov-heading-actions"><Link href="/admin/todo" className="wov-btn">Open To Do</Link><button className="wov-button primary" disabled={loading || Boolean(busy)} onClick={() => void load()} type="button">Refresh Workflow</button></div>
    </header>

    <section className="wov-metrics">
      <div className="wov-metric"><small>Projects</small><strong>{metrics.projects}</strong></div>
      <div className="wov-metric"><small>Active projects</small><strong>{metrics.active}</strong></div>
      <div className="wov-metric"><small>Overdue work</small><strong>{metrics.overdue}</strong></div>
      <div className="wov-metric"><small>Blocked tasks</small><strong>{metrics.blocked}</strong></div>
      <div className="wov-metric"><small>To Do sync alerts</small><strong>{metrics.sync}</strong></div>
    </section>

    {error && <div role="alert" className="wov-msg error">{error}</div>}
    {notice && <div role="status" className="wov-msg ok">{notice}</div>}
    <div className="wov-grid">
      <aside className="wov-panel wov-sidebar" aria-label="Project selector">
        <div className="wov-sidebar-controls">
          <input aria-label="Search workflows" className="wov-search" value={query} placeholder="Search LV ID, project, service…" onChange={(e) => setQuery(e.target.value)} />
          <div className="wov-filters">{FILTERS.map((item) => <button key={item} type="button" className={`wov-filter${filter === item ? " active" : ""}`} onClick={() => setFilter(item)}>{item}</button>)}</div>
        </div>
        {loading ? <div className="wov-empty">Loading Workflow…</div> : filtered.length ? filtered.map((item) => <button className={`wov-listitem${project?.code === item.code ? " active" : ""}`} key={item.code} onClick={() => setSelectedCode(item.code)} type="button">
          <span className="wov-listitem-head"><strong>{item.code}</strong><small>{pct(item.progress)}%</small></span>
          <span className="wov-listitem-name">{text(item.name, "Untitled project")}</span>
          <span className="wov-listitem-meta"><span>{item.lifecyclePhase || "No stage"}</span><span>{workTotal(item)} items</span>{attention(item) ? <span style={{color:"var(--lv-danger)"}}>{attention(item)} alerts</span> : null}</span>
        </button>) : <div className="wov-empty">No projects match your filters.</div>}
      </aside>

      <div className="wov-content">
        {!project ? <div className="wov-panel wov-empty">Select a project to see its Workflow.</div> : <>
          <section className="wov-panel wov-detail-head">
            <div className="wov-detail-head-top">
              <div><h3>{project.code} · {text(project.name, "Project")}</h3><div className="wov-sub">Current stage: {text(project.lifecyclePhase, "Design Stage")} · Updated {project.lastUpdated ? formatTime(project.lastUpdated) : "not recorded"}</div></div>
              <div className="wov-heading-actions"><Link className="wov-btn primary" href={`/admin/project-operations/by-project?project=${encodeURIComponent(project.code)}`}>Manage Services</Link><Link className="wov-btn" href={`/admin/projects/${encodeURIComponent(project.code)}`}>Project Details</Link></div>
            </div>
            <div className="wov-tags"><span className="wov-tag">{services.length} services</span><span className="wov-tag">{tasks.length} responsibilities</span><span className="wov-tag">{todos.length} linked/project To Dos</span>{project.overdue ? <span className="wov-pill danger">{project.overdue} overdue</span> : null}{project.blocked ? <span className="wov-pill warn">{project.blocked} blocked</span> : null}{project.syncIssues ? <span className="wov-pill danger">{project.syncIssues} To Do mismatch</span> : null}</div>
            <div className="wov-stage-meta"><span>Overall Workflow progress</span><b>{pct(project.progress)}%</b></div><div className="wov-progress-track"><i style={{width:`${pct(project.progress)}%`}} /></div>
          </section>

          <section className="wov-panel"><div className="wov-section-head"><h3>Project Stages</h3><small>Calculated from current service, responsibility and To Do records</small></div>
            <div className="wov-stage-grid">{(project.stages || []).map((stage: Row) => <div className="wov-stage" key={stage.name}>
              <strong>{stage.name}</strong><span className="wov-pill">{stage.status}</span>
              <div className="wov-stage-meta"><span>{stage.done}/{stage.total} complete</span><b>{pct(stage.progress)}%</b></div>
              <div className="wov-progress-track"><i style={{width:`${pct(stage.progress)}%`}} /></div>
              <div className="wov-stage-meta"><span>{stage.overdue ? `${stage.overdue} overdue` : "No overdue items"}</span><span>{stage.blocked ? `${stage.blocked} blocked` : ""}</span></div>
            </div>)}</div>
          </section>

          <section className="wov-panel"><div className="wov-section-head"><h3>Service Workflow</h3><small>Explicit management actions only</small></div>
            {!services.length ? <div className="wov-muted">No issued service workflows are available yet.</div> : <div className="wov-tablewrap"><table className="wov-table"><thead><tr><th>Service</th><th>Stage</th><th>Progress</th><th>Current status</th><th>Open</th></tr></thead><tbody>{services.map((service) => <tr key={service.id}>
              <td><strong>{service.name}</strong><small>{service.billingCategory}</small>{service.deliveryLocked ? <small style={{color:"var(--lv-danger)",fontWeight:900}}>🔒 Delivery locked · Due BDT {Number(service.deliveryDue || 0).toLocaleString("en-BD")}</small> : <small style={{color:"var(--lv-success)",fontWeight:900}}>Payment verified at delivery</small>}</td><td>{service.stage}</td><td><strong>{service.progress}%</strong><div className="wov-progress-track"><i style={{width:`${pct(service.progress)}%`}} /></div></td>
              <td><select aria-label={`Change ${service.name} status`} title={service.deliveryLocked ? "Work can continue. The final file cannot be delivered before full payment." : "Service payment is satisfied"} className="wov-select" value={service.status} disabled={Boolean(busy)} onChange={(e) => void serviceAction(service, e.target.value)}>{service.statuses.map((status: string) => <option key={status} value={status}>{status}{service.deliveryLocked && /Delivered/.test(status) ? " · payment required" : ""}</option>)}</select></td>
              <td><Link className="wov-link" href={`/admin/project-operations/by-project?project=${encodeURIComponent(project.code)}&workflow=${encodeURIComponent(service.id)}`}>Details</Link></td>
            </tr>)}</tbody></table></div>}
          </section>

          <section className="wov-panel"><div className="wov-section-head"><h3>Responsibilities & Dependencies</h3><small>Assign owners, manage blockers and sequence dependent work</small></div>
            {!tasks.length ? <div className="wov-muted">No responsibility tasks have been generated for this project.</div> : <div className="wov-tablewrap"><table className="wov-table"><thead><tr><th>Task / dependency</th><th>Stage / deadline</th><th>Owner / dependency</th><th>Status</th><th>Actions</th></tr></thead><tbody>{[...tasks].sort((a,b) => Number(b.overdue)-Number(a.overdue) || Number(b.blocked)-Number(a.blocked) || (a.sortOrder||0)-(b.sortOrder||0)).map((task) => <tr key={task.code}>
              <td className="wov-task-title"><strong>{task.title}</strong><small>{task.code} · {task.service || task.priority}</small>{task.blockerReason ? <small style={{color:"var(--lv-danger)"}}>Blocked: {task.blockerReason}</small> : null}{task.waitingFor ? <small style={{color:"var(--lv-warning)"}}>Waiting: {task.waitingFor}</small> : null}</td>
              <td>{task.stage}<small>{task.dueDate || "No deadline"}{task.overdue ? <span className="wov-pill danger">Overdue</span> : null}</small><input className="wov-date" type="date" value={task.dueDate || ""} disabled={Boolean(busy)} aria-label={`Due date for ${task.title}`} onChange={(e) => void taskAction(task, "dueDate", { dueDate: e.target.value })} /></td>
              <td><div className="wov-control-stack"><select className="wov-select" aria-label={`Assign ${task.title}`} value={task.employeeId || ""} disabled={Boolean(busy)} onChange={(e) => void taskAction(task, "assign", { employeeId: e.target.value })}><option value="">Unassigned</option>{data.employees.filter((person) => text(person.status).toLowerCase() !== "former").map((person) => <option key={person.id} value={person.id}>{person.name} · {person.code}</option>)}</select>
              <select className="wov-select" aria-label={`Dependency for ${task.title}`} value={task.dependencyCode || ""} disabled={Boolean(busy)} onChange={(e) => void taskAction(task, "dependency", { dependencyCode: e.target.value })}><option value="">No dependency</option>{tasks.filter((candidate) => candidate.code !== task.code).map((candidate) => <option key={candidate.code} value={candidate.code}>{candidate.title.slice(0, 58)}</option>)}</select></div></td>
              <td><select className="wov-select" aria-label={`Status for ${task.title}`} value={task.status} disabled={Boolean(busy)} onChange={(e) => void taskAction(task, "setStatus", { status: e.target.value })}>{["Pending","In Progress","Completed"].map((status) => <option key={status} value={status}>{status}</option>)}</select><small>{task.progress}% complete</small></td>
              <td>{task.blockerReason ? <button className="wov-button" type="button" disabled={Boolean(busy)} onClick={() => void taskAction(task, "unblock")}>Clear blocker</button> : <button className="wov-button" type="button" disabled={Boolean(busy) || task.done} onClick={() => setBlock(task)}>Add blocker</button>}</td>
            </tr>)}</tbody></table></div>}
          </section>

          <section className="wov-panel"><div className="wov-section-head"><h3>To Do Synchronization</h3><small>Live read-only link; To Do completion never silently advances Workflow</small></div>
            {!todos.length ? <div className="wov-muted">No project-linked To Dos. Link a To Do to this project or a Workflow service to track it here.</div> : <div className="wov-tablewrap"><table className="wov-table"><thead><tr><th>To Do</th><th>Owner</th><th>Deadline</th><th>Status</th><th>Workflow link</th></tr></thead><tbody>{todos.map((todo) => <tr key={todo.code}>
              <td><strong>{todo.title}</strong><small>{todo.code}</small></td><td>{todo.employee || "Unassigned"}</td><td>{todo.dueDate || "No deadline"}{todo.overdue ? <small className="wov-pill danger">Overdue</small> : null}</td><td><span className="wov-pill">{todo.status}</span></td>
              <td>{todo.workflowName ? <><strong>{todo.workflowName}</strong><small>{todo.workflowStatus}</small></> : <small>{todo.missingWorkflow ? "Linked service missing" : "Project-linked"}</small>}{todo.mismatch ? <small className="wov-pill warn">Completion differs — review manually</small> : null}</td>
            </tr>)}</tbody></table></div>}
            <div className="wov-muted"><Link className="wov-link" href="/admin/todo">Open To Do to edit task details</Link></div>
          </section>

          <section className="wov-panel"><div className="wov-section-head"><h3>Activity History</h3><small>Recent audited changes and lifecycle transitions</small></div>
            {!project.activity?.length ? <div className="wov-muted">No recent activity within the available audit history.</div> : <div className="wov-feed">{project.activity.map((event: Row) => <div className="wov-event" key={`${event.type}-${event.id}`}><strong>{event.title}</strong><small>{event.actor} · {formatTime(event.at)}</small>{event.note ? <span>{event.note}</span> : null}</div>)}</div>}
          </section>
        </>}
      </div>
    </div>
    <p className="wov-muted">Updated {data.refreshedAt ? formatTime(data.refreshedAt) : "—"}. Progress is observational; completed project stages and actual service statuses remain authoritative. Activity feed shows the most recent {data.historyLimit || 0} audit records.</p>
  </main>;
}
