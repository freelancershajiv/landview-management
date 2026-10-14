"use client";

import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;

const STAGES = ["Design Stage", "Approval Stage", "Supervision / Construction Stage", "Handover"];
const STATUSES = ["Pending", "In Progress", "Waiting", "Blocked", "Completed"];
const PRIORITIES = ["Low", "Normal", "High", "Urgent"];

function text(value: unknown, fallback = "—") { const v = String(value ?? "").trim(); return v || fallback; }
function dueTone(row: Row) { if (row.is_closed) return "good"; if (row.is_blocked) return "bad"; if (row.is_overdue) return "bad"; if (row.is_due_today) return "warn"; return ""; }
function dateText(value: unknown) { const raw = String(value || ""); if (!raw) return "—"; const d = new Date(`${raw}T00:00:00`); return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }

async function taskRequest(projectId: string, method: "GET" | "POST" = "GET", body?: Row) {
  const response = await fetch(method === "GET" ? `/api/task-center?projectId=${encodeURIComponent(projectId)}` : "/api/task-center", {
    method, credentials: "same-origin", cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Task Center request failed."));
  return json.data;
}

export default function ProjectTaskCenter() {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(String(params?.projectId || ""));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stageFilter, setStageFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("Open");
  const [showCreate, setShowCreate] = useState(false);
  const [draft, setDraft] = useState({ title: "", lifecycleStage: "Design Stage", priority: "Normal", dueDate: "", assignedEmployeeId: "", isRequired: true, description: "" });

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setError("");
    try { setData(await taskRequest(projectId)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load project tasks."); }
    finally { if (!silent) setLoading(false); }
  }
  useEffect(() => { if (projectId) void load(); }, [projectId]);

  async function act(key: string, body: Row, success: string) {
    if (busy) return;
    setBusy(key); setError(""); setNotice("");
    try { await taskRequest(projectId, "POST", body); setNotice(success); await load(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Task action failed."); }
    finally { setBusy(""); }
  }

  async function createTask(event: FormEvent) {
    event.preventDefault();
    await act("create", { action: "createTask", projectId, ...draft }, "Task added to the project responsibility plan.");
    setDraft({ title: "", lifecycleStage: data?.project?.lifecyclePhase || "Design Stage", priority: "Normal", dueDate: "", assignedEmployeeId: "", isRequired: true, description: "" });
    setShowCreate(false);
  }

  function blockTask(row: Row) {
    const reason = window.prompt("What is blocking this task?", row.blocker_reason || "");
    if (reason === null || !reason.trim()) return;
    void act(`block-${row.task_code}`, { action: "blockTask", taskCode: row.task_code, reason }, `${row.task_code} marked blocked.`);
  }

  const rows = useMemo(() => {
    const all: Row[] = data?.tasks || [];
    return all.filter((row) => {
      if (stageFilter !== "All" && text(row.lifecycle_stage, "") !== stageFilter) return false;
      if (statusFilter === "Open" && row.is_closed) return false;
      if (statusFilter === "Completed" && !row.is_closed) return false;
      if (statusFilter === "Blocked" && !row.is_blocked) return false;
      if (statusFilter === "Overdue" && !row.is_overdue) return false;
      return true;
    });
  }, [data, stageFilter, statusFilter]);

  if (loading) return <section className="ptc-shell"><div className="ptc-empty">Loading responsibility plan…</div></section>;
  if (!data) return <section className="ptc-shell"><div className="ptc-error">{error || "Task Center unavailable."}</div></section>;
  const metrics = data.metrics || {};

  return <section className="ptc-shell">
    <style>{`
      .ptc-shell{max-width:1540px;margin:0 auto 14px;border:1px solid var(--lv-border-default);border-radius:14px;background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm);overflow:hidden;color:var(--lv-text-primary)}.ptc-shell *{box-sizing:border-box}
      .ptc-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;border-bottom:1px solid var(--lv-border-default);background:var(--lv-surface-muted)}.ptc-head h2{margin:0;font-size:14px;color:var(--lv-text-strong)}.ptc-head p{margin:4px 0 0;font-size:8px;color:var(--lv-text-secondary)}.ptc-actions{display:flex;gap:7px;flex-wrap:wrap}.ptc-btn{min-height:34px;padding:0 10px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px;font-weight:900;cursor:pointer}.ptc-btn.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.ptc-btn.danger{color:var(--lv-danger)}.ptc-btn:disabled{opacity:.45;cursor:not-allowed}
      .ptc-metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;padding:12px 14px}.ptc-metric{padding:11px;border:1px solid var(--lv-border-default);border-radius:9px;background:var(--lv-surface-muted)}.ptc-metric span{display:block;font-size:7px;font-weight:900;color:var(--lv-text-muted);text-transform:uppercase}.ptc-metric strong{display:block;margin-top:5px;font-size:18px;color:var(--lv-text-strong)}.ptc-metric.bad strong{color:var(--lv-danger)}.ptc-metric.warn strong{color:var(--lv-warning)}
      .ptc-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 14px;border-top:1px solid var(--lv-border-subtle);border-bottom:1px solid var(--lv-border-default)}.ptc-toolbar select{padding:7px 9px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px}.ptc-toolbar small{margin-left:auto;font-size:8px;color:var(--lv-text-muted)}
      .ptc-msg{margin:10px 14px 0;padding:9px 10px;border-radius:7px;font-size:8px}.ptc-msg.good{background:var(--lv-success-soft);color:var(--lv-success);border:1px solid var(--lv-success-border)}.ptc-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger);border:1px solid var(--lv-danger-border)}
      .ptc-table-wrap{overflow:auto}.ptc-table{width:100%;min-width:1120px;border-collapse:collapse}.ptc-table th{padding:9px 10px;background:var(--lv-surface-muted);border-bottom:1px solid var(--lv-border-default);font-size:7px;text-transform:uppercase;color:var(--lv-text-muted);text-align:left}.ptc-table td{padding:9px 10px;border-bottom:1px solid var(--lv-border-subtle);font-size:8px;vertical-align:top}.ptc-task strong{display:block;font-size:9px;color:var(--lv-text-strong)}.ptc-task span{display:block;margin-top:3px;color:var(--lv-text-secondary);line-height:1.35}.ptc-badge{display:inline-flex;padding:4px 6px;border-radius:999px;background:var(--lv-surface-muted);font-size:7px;font-weight:900;color:var(--lv-text-secondary)}.ptc-badge.good{background:var(--lv-success-soft);color:var(--lv-success)}.ptc-badge.warn{background:var(--lv-warning-soft);color:var(--lv-warning)}.ptc-badge.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.ptc-table select,.ptc-table input{max-width:155px;padding:6px;border:1px solid var(--lv-border-default);border-radius:6px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px}.ptc-row-actions{display:flex;gap:5px}.ptc-mini{padding:5px 6px;border:1px solid var(--lv-border-default);border-radius:6px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:7px;font-weight:900;cursor:pointer}
      .ptc-form{padding:14px;border-top:1px solid var(--lv-border-default);background:var(--lv-surface-muted)}.ptc-form-grid{display:grid;grid-template-columns:2fr repeat(4,1fr);gap:8px}.ptc-field label{display:block;margin-bottom:4px;font-size:7px;font-weight:900;color:var(--lv-text-muted)}.ptc-field input,.ptc-field select,.ptc-field textarea{width:100%;padding:8px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px}.ptc-wide{grid-column:1/-1}.ptc-check{display:flex;align-items:center;gap:6px;font-size:8px;color:var(--lv-text-secondary)}.ptc-empty{padding:24px;text-align:center;font-size:9px;color:var(--lv-text-muted)}.ptc-error{padding:14px;color:var(--lv-danger);font-size:9px}
      @media(max-width:980px){.ptc-metrics{grid-template-columns:repeat(3,1fr)}.ptc-form-grid{grid-template-columns:1fr 1fr}}@media(max-width:600px){.ptc-head{align-items:flex-start;flex-direction:column}.ptc-metrics{grid-template-columns:repeat(2,1fr)}.ptc-form-grid{grid-template-columns:1fr}.ptc-toolbar small{width:100%;margin-left:0}}
    `}</style>

    <div className="ptc-head"><div><h2>Project Responsibility Plan</h2><p>Required work, ownership, deadlines, dependencies and blockers for {projectId}. Only structured required tasks can block smart lifecycle handoff.</p></div><div className="ptc-actions"><button className="ptc-btn" disabled={Boolean(busy)} onClick={() => void act("sync", { action: "syncProjectTasks", projectId }, "Responsibility templates synced from project services.")}>{busy === "sync" ? "Syncing…" : "Sync from Services"}</button><button className="ptc-btn primary" onClick={() => setShowCreate((value) => !value)}>{showCreate ? "Close Form" : "Add Task"}</button></div></div>

    <div className="ptc-metrics">
      <div className="ptc-metric"><span>Open</span><strong>{metrics.open || 0}</strong></div>
      <div className="ptc-metric"><span>Required Open</span><strong>{metrics.requiredOpen || 0}</strong></div>
      <div className="ptc-metric bad"><span>Overdue</span><strong>{metrics.overdue || 0}</strong></div>
      <div className="ptc-metric warn"><span>Blocked</span><strong>{metrics.blocked || 0}</strong></div>
      <div className="ptc-metric warn"><span>Unassigned</span><strong>{metrics.unassigned || 0}</strong></div>
      <div className="ptc-metric"><span>Completed</span><strong>{metrics.completed || 0}</strong></div>
    </div>

    {error && <div className="ptc-msg bad">{error}</div>}{notice && <div className="ptc-msg good">{notice}</div>}
    <div className="ptc-toolbar"><select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)}><option>All</option>{STAGES.map((stage) => <option key={stage}>{stage}</option>)}</select><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option>Open</option><option>All</option><option>Overdue</option><option>Blocked</option><option>Completed</option></select><small>{rows.length} task(s) shown</small></div>

    <div className="ptc-table-wrap"><table className="ptc-table"><thead><tr><th>Task</th><th>Stage</th><th>Owner</th><th>Priority</th><th>Due</th><th>Status</th><th>Dependency / Blocker</th><th>Actions</th></tr></thead><tbody>
      {rows.map((row: Row) => <tr key={row.task_code}>
        <td className="ptc-task"><strong>{text(row.task_title)}</strong><span>{text(row.source_service, row.task_type || "Manual task")}{row.is_required ? " · Required" : " · Optional"}</span></td>
        <td><span className="ptc-badge">{text(row.lifecycle_stage, "General")}</span></td>
        <td><select disabled={busy === `assign-${row.task_code}`} value={row.assigned_employee_id || ""} onChange={(e) => void act(`assign-${row.task_code}`, { action: "assignTask", taskCode: row.task_code, assignedEmployeeId: e.target.value }, `${row.task_title} assignment updated.`)}><option value="">Unassigned</option>{(data.employees || []).map((employee: Row) => <option key={employee.id} value={employee.id}>{employee.employeeCode} · {employee.name}</option>)}</select></td>
        <td><select value={text(row.priority, "Normal")} disabled={Boolean(busy)} onChange={(e) => void act(`priority-${row.task_code}`, { action: "updateTask", taskCode: row.task_code, priority: e.target.value }, `${row.task_title} priority updated.`)}>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select></td>
        <td><input type="date" value={row.due_date || ""} disabled={Boolean(busy)} onChange={(e) => void act(`due-${row.task_code}`, { action: "updateTask", taskCode: row.task_code, dueDate: e.target.value }, `${row.task_title} deadline updated.`)} /><div style={{marginTop:4}}><span className={`ptc-badge ${dueTone(row)}`}>{row.is_overdue ? `Overdue · ${dateText(row.due_date)}` : row.is_due_today ? "Due today" : dateText(row.due_date)}</span></div></td>
        <td><select value={text(row.status, "Pending")} disabled={Boolean(busy)} onChange={(e) => void act(`status-${row.task_code}`, { action: "updateTask", taskCode: row.task_code, status: e.target.value }, `${row.task_title} status updated.`)}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select><div style={{marginTop:5}}><span className={`ptc-badge ${row.is_closed ? "good" : row.is_blocked ? "bad" : ""}`}>{Math.round(Number(row.progress || 0))}%</span></div></td>
        <td className="ptc-task"><strong>{row.dependency_blocked ? `Waiting for ${text(row.dependency_title)}` : row.dependency_task_code ? `Dependency: ${text(row.dependency_title, row.dependency_task_code)}` : "No dependency"}</strong><span>{text(row.blocker_reason, row.dependency_blocked ? `Dependency is ${text(row.dependency_status)}` : "Clear")}</span></td>
        <td><div className="ptc-row-actions">{row.is_blocked ? <button className="ptc-mini" disabled={Boolean(busy)} onClick={() => void act(`unblock-${row.task_code}`, { action: "unblockTask", taskCode: row.task_code }, `${row.task_title} unblocked.`)}>Unblock</button> : !row.is_closed && <button className="ptc-mini" disabled={Boolean(busy)} onClick={() => blockTask(row)}>Block</button>}</div></td>
      </tr>)}
      {!rows.length && <tr><td colSpan={8}><div className="ptc-empty">No tasks match this filter. Use <b>Sync from Services</b> to create the responsibility plan for a project that already has billing services.</div></td></tr>}
    </tbody></table></div>

    {showCreate && <form className="ptc-form" onSubmit={(e) => void createTask(e)}><div className="ptc-form-grid"><div className="ptc-field"><label>Task title</label><input required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div><div className="ptc-field"><label>Stage</label><select value={draft.lifecycleStage} onChange={(e) => setDraft({ ...draft, lifecycleStage: e.target.value })}>{STAGES.map((stage) => <option key={stage}>{stage}</option>)}</select></div><div className="ptc-field"><label>Assignee</label><select value={draft.assignedEmployeeId} onChange={(e) => setDraft({ ...draft, assignedEmployeeId: e.target.value })}><option value="">Unassigned</option>{(data.employees || []).map((employee: Row) => <option key={employee.id} value={employee.id}>{employee.employeeCode} · {employee.name}</option>)}</select></div><div className="ptc-field"><label>Priority</label><select value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>{PRIORITIES.map((priority) => <option key={priority}>{priority}</option>)}</select></div><div className="ptc-field"><label>Due date</label><input type="date" value={draft.dueDate} onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })} /></div><div className="ptc-field ptc-wide"><label>Description</label><textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div><label className="ptc-check"><input type="checkbox" checked={draft.isRequired} onChange={(e) => setDraft({ ...draft, isRequired: e.target.checked })} /> Required for lifecycle stage</label></div><div style={{marginTop:10}}><button className="ptc-btn primary" disabled={busy === "create"}>{busy === "create" ? "Saving…" : "Create Task"}</button></div></form>}
  </section>;
}
