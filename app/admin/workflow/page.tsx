"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/lv-ui";

type Row = Record<string, any>;
type EngineState = "All" | "Ready" | "In Progress" | "Waiting" | "Upcoming" | "Done";
type WorkflowData = {
  tasks: Row[];
  metrics?: Record<string, number>;
  employees: Row[];
  projects: Row[];
};

const ENGINE_STATES: EngineState[] = ["All", "Ready", "In Progress", "Waiting", "Upcoming", "Done"];
const STAGE_ORDER = ["Design Stage", "Approval Stage", "Supervision / Construction Stage", "Handover"];

function text(value: unknown) { return String(value ?? "").trim(); }
function normalized(value: unknown) { return text(value).toLowerCase(); }
function numberOf(value: unknown) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function isClosed(task: Row) {
  if (task.is_closed === true) return true;
  return ["completed", "done", "closed", "approved", "issued", "cancelled", "canceled"].includes(normalized(task.status));
}
function engineState(task: Row): Exclude<EngineState, "All"> {
  if (isClosed(task)) return "Done";
  if (task.dependency_blocked === true) return "Upcoming";
  if (task.is_blocked === true || ["blocked", "waiting"].includes(normalized(task.status)) || text(task.blocker_reason)) return "Waiting";
  if (normalized(task.status) === "in progress") return "In Progress";
  return "Ready";
}
function dueLabel(value: unknown) {
  const raw = text(value);
  if (!raw) return "No due date";
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}
function taskCode(task: Row) { return text(task.task_code || task.Task_ID || task.id); }
function projectCode(task: Row) { return text(task.project_code || task.Project_ID); }
function priorityRank(value: unknown) {
  return ({ urgent: 0, high: 1, normal: 2, low: 3 } as Record<string, number>)[normalized(value)] ?? 4;
}

async function parseResponse(response: Response, fallback: string) {
  const raw = await response.text();
  let json: any;
  try { json = JSON.parse(raw); }
  catch { throw new Error(/^\s*</.test(raw) ? "LAND VIEW returned HTML instead of workflow data." : fallback); }
  if (!response.ok || !json?.success) throw new Error(String(json?.error || json?.message || fallback));
  return json.data;
}

async function getWorkflow(): Promise<WorkflowData> {
  const response = await fetch("/api/task-center", { credentials: "same-origin", cache: "no-store" });
  return parseResponse(response, "Could not load the workflow engine.");
}

async function postWorkflow(payload: Record<string, unknown>) {
  const response = await fetch("/api/task-center", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify(payload),
  });
  return parseResponse(response, "Could not update workflow.");
}

export default function WorkflowPage() {
  const [data, setData] = useState<WorkflowData>({ tasks: [], employees: [], projects: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<EngineState>("All");
  const [projectFilter, setProjectFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setData(await getWorkflow()); }
    catch (err: any) { setError(err?.message || "Could not load workflow."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const tasks = data.tasks || [];
  const stateCounts = useMemo(() => {
    const counts: Record<EngineState, number> = { All: tasks.length, Ready: 0, "In Progress": 0, Waiting: 0, Upcoming: 0, Done: 0 };
    tasks.forEach((task) => { counts[engineState(task)] += 1; });
    return counts;
  }, [tasks]);

  const overdueCount = useMemo(() => tasks.filter((task) => task.is_overdue === true && !isClosed(task)).length, [tasks]);

  const stageCounts = useMemo(() => {
    const counts = new Map<string, { total: number; done: number; active: number }>();
    for (const stage of STAGE_ORDER) counts.set(stage, { total: 0, done: 0, active: 0 });
    for (const task of tasks) {
      const stage = text(task.lifecycle_stage) || "Other";
      const row = counts.get(stage) || { total: 0, done: 0, active: 0 };
      row.total += 1;
      if (isClosed(task)) row.done += 1;
      else if (engineState(task) === "In Progress") row.active += 1;
      counts.set(stage, row);
    }
    return Array.from(counts.entries()).filter(([, value]) => value.total > 0);
  }, [tasks]);

  const projectProgress = useMemo(() => {
    const grouped = new Map<string, { total: number; done: number }>();
    for (const task of tasks) {
      const code = projectCode(task);
      if (!code) continue;
      const row = grouped.get(code) || { total: 0, done: 0 };
      row.total += 1;
      if (isClosed(task)) row.done += 1;
      grouped.set(code, row);
    }
    return grouped;
  }, [tasks]);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return tasks
      .filter((task) => {
        const state = engineState(task);
        if (filter !== "All" && state !== filter) return false;
        if (projectFilter && projectCode(task) !== projectFilter) return false;
        if (stageFilter && text(task.lifecycle_stage) !== stageFilter) return false;
        if (!term) return true;
        return [
          projectCode(task), task.project_name, task.task_title, task.source_service,
          task.employee_name, task.employee_code, task.lifecycle_stage, task.priority,
          task.status, task.blocker_reason,
        ].join(" ").toLowerCase().includes(term);
      })
      .sort((a, b) => {
        const stateOrder: Record<string, number> = { Waiting: 0, Ready: 1, "In Progress": 2, Upcoming: 3, Done: 4 };
        const stateDiff = (stateOrder[engineState(a)] ?? 9) - (stateOrder[engineState(b)] ?? 9);
        if (stateDiff) return stateDiff;
        const overdueDiff = Number(Boolean(b.is_overdue)) - Number(Boolean(a.is_overdue));
        if (overdueDiff) return overdueDiff;
        const priorityDiff = priorityRank(a.priority) - priorityRank(b.priority);
        if (priorityDiff) return priorityDiff;
        return text(a.due_date || "9999-99-99").localeCompare(text(b.due_date || "9999-99-99"));
      });
  }, [tasks, filter, projectFilter, stageFilter, query]);

  async function runTaskAction(task: Row, mode: "start" | "wait" | "resume" | "complete") {
    const code = taskCode(task);
    if (!code || busy[code]) return;
    let payload: Record<string, unknown> = { action: "updatetask", taskCode: code };
    if (mode === "start") payload = { ...payload, status: "In Progress", progress: Math.max(10, numberOf(task.progress)) };
    if (mode === "wait") {
      const reason = window.prompt("What is this task waiting for?", text(task.blocker_reason));
      if (reason === null) return;
      if (!reason.trim()) { window.alert("Enter a waiting reason so the team knows what is blocking this task."); return; }
      payload = { ...payload, status: "Waiting", blockerReason: reason.trim() };
    }
    if (mode === "resume") payload = { ...payload, status: "Pending", blockerReason: "" };
    if (mode === "complete") {
      if (!window.confirm(`Complete “${text(task.task_title) || code}”?`)) return;
      payload = { ...payload, status: "Completed", progress: 100, blockerReason: "" };
    }

    setBusy((current) => ({ ...current, [code]: true }));
    setError("");
    setNotice("");
    try {
      await postWorkflow(payload);
      await load();
      setNotice(mode === "complete" ? "Task completed. Any dependent next step is now unlocked automatically." : "Workflow updated.");
    } catch (err: any) {
      setError(err?.message || "Could not update task.");
    } finally {
      setBusy((current) => ({ ...current, [code]: false }));
    }
  }

  async function assignTask(task: Row, employeeId: string) {
    const code = taskCode(task);
    if (!code || busy[code]) return;
    setBusy((current) => ({ ...current, [code]: true }));
    setError("");
    setNotice("");
    try {
      await postWorkflow({ action: "assigntask", taskCode: code, assignedEmployeeId: employeeId });
      await load();
      setNotice(employeeId ? "Task assigned." : "Task moved to the unassigned queue.");
    } catch (err: any) {
      setError(err?.message || "Could not assign task.");
    } finally {
      setBusy((current) => ({ ...current, [code]: false }));
    }
  }

  async function syncSelectedProject() {
    if (!projectFilter) { setError("Choose a project first, then sync its billed services into the workflow."); return; }
    const key = `sync:${projectFilter}`;
    if (busy[key]) return;
    setBusy((current) => ({ ...current, [key]: true }));
    setError("");
    setNotice("");
    try {
      const result = await postWorkflow({ action: "syncprojecttasks", projectId: projectFilter });
      await load();
      setNotice(result?.createdCount
        ? `${result.createdCount} workflow task${result.createdCount === 1 ? "" : "s"} created from ${projectFilter} billing.`
        : `${projectFilter} workflow is already synchronized with billing.`);
    } catch (err: any) {
      setError(err?.message || "Could not sync project workflow.");
    } finally {
      setBusy((current) => ({ ...current, [key]: false }));
    }
  }

  return <>
    <style>{`
      .workflow-engine{--wf-red:#c91f2b;--wf-red-dark:#a9131d;--wf-ink:#17191d;--wf-muted:#69717b;--wf-line:#e7e9ed;--wf-soft:#f7f8fa;--wf-white:#fff;color:var(--wf-ink)}
      .wf-topbar{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;margin:0 0 18px}.wf-topbar-actions{display:flex;gap:8px;flex-wrap:wrap}.wf-btn{border:1px solid var(--wf-line);background:var(--wf-white);color:var(--wf-ink);border-radius:9px;padding:9px 12px;font-size:12px;font-weight:800;cursor:pointer;transition:.15s}.wf-btn:hover{border-color:#c9cdd3;transform:translateY(-1px)}.wf-btn.primary{background:var(--wf-red);border-color:var(--wf-red);color:#fff}.wf-btn.primary:hover{background:var(--wf-red-dark)}.wf-btn:disabled{opacity:.45;cursor:not-allowed;transform:none}
      .wf-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}.wf-kpi{background:var(--wf-white);border:1px solid var(--wf-line);border-radius:12px;padding:15px 16px;box-shadow:0 7px 22px rgba(25,31,39,.04)}.wf-kpi-top{display:flex;justify-content:space-between;gap:10px;align-items:center}.wf-kpi span{color:var(--wf-muted);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.09em}.wf-kpi strong{display:block;font-size:27px;line-height:1.1;margin-top:9px}.wf-kpi i{width:8px;height:8px;border-radius:999px;background:#b7bdc6}.wf-kpi.ready i{background:#2563eb}.wf-kpi.active i{background:var(--wf-red)}.wf-kpi.waiting i{background:#d97706}.wf-kpi.overdue i{background:#b91c1c}
      .wf-pipeline{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:0 0 16px}.wf-stage-card{background:linear-gradient(180deg,#fff,#fbfbfc);border:1px solid var(--wf-line);border-radius:11px;padding:13px 14px;position:relative;overflow:hidden}.wf-stage-card:before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--wf-red)}.wf-stage-card small{display:block;color:var(--wf-muted);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.wf-stage-card b{display:block;margin:5px 0 8px;font-size:13px}.wf-stage-card p{margin:0;color:var(--wf-muted);font-size:11px}.wf-stage-card progress{width:100%;height:5px;margin-top:9px;accent-color:var(--wf-red)}
      .wf-controls{display:grid;grid-template-columns:minmax(230px,1.6fr) minmax(170px,.8fr) minmax(180px,.9fr) auto;gap:9px;align-items:center;background:var(--wf-white);border:1px solid var(--wf-line);border-radius:12px;padding:11px;margin-bottom:10px}.wf-control{width:100%;min-height:38px;border:1px solid #dfe2e7;border-radius:8px;background:#fff;color:var(--wf-ink);padding:8px 10px;font-size:12px;outline:none}.wf-control:focus{border-color:var(--wf-red);box-shadow:0 0 0 3px rgba(201,31,43,.08)}
      .wf-filters{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:13px}.wf-filter{border:1px solid var(--wf-line);background:#fff;color:#4c545e;border-radius:999px;padding:7px 10px;font-size:11px;font-weight:800;cursor:pointer}.wf-filter.active{background:var(--wf-red);border-color:var(--wf-red);color:#fff}.wf-filter b{margin-left:5px}
      .wf-note{margin:0 0 12px;border-radius:9px;padding:10px 12px;font-size:12px;font-weight:650}.wf-note.ok{background:#edf8f0;border:1px solid #cfe8d5;color:#24653a}.wf-note.err{background:#fff0f0;border:1px solid #f3caca;color:#9d1c24}
      .wf-table-wrap{background:#fff;border:1px solid var(--wf-line);border-radius:12px;overflow:auto;box-shadow:0 9px 26px rgba(25,31,39,.04)}.wf-table{width:100%;border-collapse:collapse;min-width:1260px}.wf-table th{position:sticky;top:0;z-index:1;background:#f6f7f9;color:#646d78;font-size:10px;text-transform:uppercase;letter-spacing:.08em;text-align:left;padding:10px 11px;border-bottom:1px solid var(--wf-line)}.wf-table td{padding:11px;border-bottom:1px solid #eef0f2;font-size:12px;vertical-align:middle}.wf-table tr:last-child td{border-bottom:0}.wf-table tr:hover td{background:#fcfcfd}.wf-project strong{display:block;font-size:12px}.wf-project span{display:block;color:var(--wf-muted);margin-top:2px;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wf-title{max-width:330px}.wf-title strong{display:block;font-size:12px;line-height:1.35}.wf-title small{display:block;color:var(--wf-muted);margin-top:4px;line-height:1.35}.wf-title .dependency{color:#915d08}.wf-badge{display:inline-flex;align-items:center;gap:5px;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:900;white-space:nowrap}.wf-badge:before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}.wf-badge.ready{background:#eef4ff;color:#2459b8}.wf-badge.in-progress{background:#fff0f1;color:#b71924}.wf-badge.waiting{background:#fff6e8;color:#a35b00}.wf-badge.upcoming{background:#f0f2f5;color:#69717b}.wf-badge.done{background:#edf8f0;color:#26703e}.wf-priority{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.05em}.wf-priority.urgent{color:#b91c1c}.wf-priority.high{color:#c2410c}.wf-due.overdue{color:#b91c1c;font-weight:850}.wf-assignee{min-width:150px}.wf-assignee select{width:100%;border:1px solid #dfe2e7;border-radius:7px;padding:7px;background:#fff;font-size:11px}.wf-actions{display:flex;gap:5px;flex-wrap:wrap;min-width:220px}.wf-action{border:1px solid #dfe2e7;background:#fff;border-radius:7px;padding:6px 8px;font-size:10px;font-weight:850;cursor:pointer}.wf-action.primary{background:var(--wf-red);border-color:var(--wf-red);color:#fff}.wf-action.complete{background:#eff9f1;border-color:#cfe8d5;color:#24653a}.wf-action.wait{background:#fff7e9;border-color:#eed8ac;color:#89530b}.wf-action:disabled{opacity:.4;cursor:not-allowed}.wf-progress{min-width:130px}.wf-progress-line{height:5px;border-radius:999px;background:#eceef1;overflow:hidden}.wf-progress-line i{display:block;height:100%;background:var(--wf-red)}.wf-progress small{display:block;color:var(--wf-muted);margin-top:4px}.wf-link{font-size:11px;color:var(--wf-red);font-weight:850;text-decoration:none}.wf-footer-hint{color:var(--wf-muted);font-size:11px;margin:10px 2px 0}
      @media(max-width:1050px){.wf-kpis,.wf-pipeline{grid-template-columns:repeat(2,minmax(0,1fr))}.wf-controls{grid-template-columns:1fr 1fr}.wf-controls .search{grid-column:1/-1}.wf-topbar{align-items:stretch;flex-direction:column}.wf-topbar-actions{justify-content:flex-start}}
      @media(max-width:620px){.wf-kpis,.wf-pipeline{grid-template-columns:1fr 1fr}.wf-controls{grid-template-columns:1fr}.wf-controls .search{grid-column:auto}.wf-topbar-actions .wf-btn{flex:1}.wf-kpi{padding:12px}.wf-kpi strong{font-size:23px}}
    `}</style>

    <div className="workflow-engine">
      <div className="wf-topbar">
        <PageHeader eyebrow="OPERATIONS / WORKFLOW ENGINE" title="Workflow" description="One priority queue for project delivery. Dependencies decide what is ready now; completed work automatically unlocks the next responsibility." />
        <div className="wf-topbar-actions">
          <button className="wf-btn" type="button" onClick={() => void load()} disabled={loading}>Refresh</button>
          <button className="wf-btn primary" type="button" onClick={() => void syncSelectedProject()} disabled={!projectFilter || Boolean(busy[`sync:${projectFilter}`])} title={projectFilter ? `Sync ${projectFilter} billed services into workflow` : "Choose a project first"}>
            {busy[`sync:${projectFilter}`] ? "Syncing…" : "Sync from Billing"}
          </button>
        </div>
      </div>

      <section className="wf-kpis">
        <div className="wf-kpi ready"><div className="wf-kpi-top"><span>Ready now</span><i /></div><strong>{stateCounts.Ready}</strong></div>
        <div className="wf-kpi active"><div className="wf-kpi-top"><span>In progress</span><i /></div><strong>{stateCounts["In Progress"]}</strong></div>
        <div className="wf-kpi waiting"><div className="wf-kpi-top"><span>Waiting</span><i /></div><strong>{stateCounts.Waiting}</strong></div>
        <div className="wf-kpi overdue"><div className="wf-kpi-top"><span>Overdue</span><i /></div><strong>{overdueCount}</strong></div>
      </section>

      {stageCounts.length > 0 && <section className="wf-pipeline">
        {stageCounts.map(([stage, metrics]) => {
          const percent = metrics.total ? Math.round((metrics.done / metrics.total) * 100) : 0;
          return <div className="wf-stage-card" key={stage}><small>Project pipeline</small><b>{stage}</b><p>{metrics.done}/{metrics.total} done{metrics.active ? ` · ${metrics.active} active` : ""}</p><progress max={100} value={percent} /></div>;
        })}
      </section>}

      <div className="wf-controls">
        <input className="wf-control search" type="search" placeholder="Search project, task, service, employee, blocker..." value={query} onChange={(event) => setQuery(event.target.value)} />
        <select className="wf-control" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
          <option value="">All projects</option>
          {(data.projects || []).map((project) => <option key={text(project.id || project.projectCode)} value={text(project.projectCode)}>{text(project.projectCode)} · {text(project.projectName) || "Unnamed project"}</option>)}
        </select>
        <select className="wf-control" value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
          <option value="">All stages</option>
          {Array.from(new Set(tasks.map((task) => text(task.lifecycle_stage)).filter(Boolean))).sort().map((stage) => <option key={stage} value={stage}>{stage}</option>)}
        </select>
        <span style={{fontSize:11,color:"#69717b",fontWeight:800,whiteSpace:"nowrap"}}>{rows.length} tasks</span>
      </div>

      <div className="wf-filters">
        {ENGINE_STATES.map((state) => <button key={state} type="button" className={`wf-filter ${filter === state ? "active" : ""}`} onClick={() => setFilter(state)}>{state}<b>{stateCounts[state]}</b></button>)}
      </div>

      {notice && <div className="wf-note ok">{notice}</div>}
      {error && <div className="wf-note err">{error}</div>}

      {loading ? <LoadingState label="Loading workflow engine…" /> : !tasks.length ? (
        error ? <ErrorState message={error} onRetry={load} /> : <EmptyState title="No workflow tasks yet" text="Choose a project and sync its billed services. New bills will also create responsibility tasks automatically." href="/admin/projects" action="Open projects" />
      ) : <div className="wf-table-wrap"><table className="wf-table"><thead><tr>
        <th>Priority</th><th>Project</th><th>Stage / responsibility</th><th>Owner</th><th>Due</th><th>State</th><th>Project progress</th><th>Actions</th><th>Open</th>
      </tr></thead><tbody>{rows.map((task) => {
        const code = taskCode(task);
        const pCode = projectCode(task);
        const state = engineState(task);
        const progress = projectProgress.get(pCode) || { total: 0, done: 0 };
        const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
        const dependency = text(task.dependency_title);
        const blockedReason = text(task.blocker_reason);
        const isBusy = Boolean(busy[code]);
        return <tr key={code || `${pCode}-${text(task.task_title)}`}>
          <td><span className={`wf-priority ${normalized(task.priority)}`}>{text(task.priority) || "Normal"}</span></td>
          <td className="wf-project"><strong>{pCode || "—"}</strong><span>{text(task.project_name) || "Project name unavailable"}</span></td>
          <td className="wf-title"><strong>{text(task.task_title) || "Untitled responsibility"}</strong><small>{text(task.lifecycle_stage) || "General"}{text(task.source_service) ? ` · ${text(task.source_service)}` : ""}</small>{dependency && <small className="dependency">After: {dependency}{task.dependency_blocked ? " (not complete)" : ""}</small>}{blockedReason && state === "Waiting" && <small className="dependency">Waiting for: {blockedReason}</small>}</td>
          <td className="wf-assignee"><select value={text(task.assigned_employee_id)} onChange={(event) => void assignTask(task, event.target.value)} disabled={isBusy}><option value="">Unassigned</option>{(data.employees || []).map((employee) => <option key={text(employee.id)} value={text(employee.id)}>{text(employee.employeeCode)} · {text(employee.name)}</option>)}</select></td>
          <td className={`wf-due ${task.is_overdue ? "overdue" : ""}`}>{dueLabel(task.due_date)}{task.is_overdue && <><br/><small>Overdue</small></>}</td>
          <td><span className={`wf-badge ${state.toLowerCase().replace(/\s+/g, "-")}`}>{state}</span></td>
          <td><div className="wf-progress"><div className="wf-progress-line"><i style={{width:`${pct}%`}} /></div><small>{progress.done}/{progress.total} · {pct}%</small></div></td>
          <td><div className="wf-actions">
            {state === "Ready" && <button className="wf-action primary" type="button" disabled={isBusy} onClick={() => void runTaskAction(task, "start")}>Start</button>}
            {state === "In Progress" && <button className="wf-action wait" type="button" disabled={isBusy} onClick={() => void runTaskAction(task, "wait")}>Wait</button>}
            {state === "Waiting" && <button className="wf-action" type="button" disabled={isBusy} onClick={() => void runTaskAction(task, "resume")}>Resume</button>}
            {state !== "Done" && state !== "Upcoming" && <button className="wf-action complete" type="button" disabled={isBusy} onClick={() => void runTaskAction(task, "complete")}>Complete</button>}
            {state === "Upcoming" && <span style={{fontSize:10,color:"#69717b",fontWeight:800}}>Waiting on dependency</span>}
            {state === "Done" && <span style={{fontSize:10,color:"#26703e",fontWeight:900}}>Completed</span>}
          </div></td>
          <td><Link className="wf-link" href={`/admin/projects/${encodeURIComponent(pCode)}`}>Project →</Link></td>
        </tr>;
      })}</tbody></table></div>}
      <p className="wf-footer-hint">Engine rule: a pending task is Ready only when its dependency is complete. Waiting records stay out of the Ready queue until resumed. New billed services are synchronized into responsibility tasks automatically.</p>
    </div>
  </>;
}
