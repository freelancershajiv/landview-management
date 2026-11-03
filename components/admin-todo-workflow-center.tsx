"use client";

import { useEffect, useMemo, useState } from "react";

type WorkflowInfo = {
  id: string;
  serviceName: string;
  billingCategory: string;
  workflowType: string;
  status: string;
  statuses: string[];
  currentIndex: number;
  nextStatus: string;
  finalStatus: string;
  progress: number;
  updatedAt: string;
  completed: boolean;
};

type LinkedTodo = {
  todoCode: string;
  title: string;
  todoStatus: "To Do" | "In Progress" | "Done";
  priority: "Low" | "Normal" | "High" | "Urgent";
  projectCode: string;
  assignedEmployeeId: string;
  assignedTo: string;
  dueDate: string;
  dueTime: string;
  workflow: WorkflowInfo | null;
};

type Payload = { items: LinkedTodo[]; refreshedAt: string };
type Filter = "All" | "Active" | "Ready to Finish" | "Completed" | "Unavailable";

const FILTERS: Filter[] = ["All", "Active", "Ready to Finish", "Completed", "Unavailable"];

function text(value: unknown, fallback = "—") {
  const result = String(value ?? "").trim();
  return result || fallback;
}

function deadline(item: LinkedTodo) {
  if (!item.dueDate) return "No deadline";
  const date = new Date(`${item.dueDate}T${item.dueTime || "23:59"}:00+06:00`);
  if (!Number.isFinite(date.getTime())) return [item.dueDate, item.dueTime].filter(Boolean).join(" · ");
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(item.dueTime ? { hour: "2-digit", minute: "2-digit", hour12: true } : {}),
  }).format(date);
}

function progressStep(workflow: WorkflowInfo) {
  if (!workflow.statuses.length) return "—";
  const index = Math.max(0, workflow.currentIndex);
  return `${Math.min(workflow.statuses.length, index + 1)} / ${workflow.statuses.length}`;
}

function finishLabel(item: LinkedTodo) {
  const workflowDone = Boolean(item.workflow?.completed);
  const todoDone = item.todoStatus === "Done";
  if (workflowDone && todoDone) return "Completed";
  if (workflowDone) return "Complete To Do";
  if (todoDone) return "Finish Workflow";
  return "Complete both";
}

async function api(method: "GET" | "POST" = "GET", body?: Record<string, unknown>) {
  const response = await fetch("/api/admin/todo/workflow", {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Workflow To Do request failed."));
  return json.data;
}

export default function AdminTodoWorkflowCenter() {
  const [data, setData] = useState<Payload>({ items: [], refreshedAt: "" });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [query, setQuery] = useState("");

  async function load(silent = false) {
    if (!silent) setLoading(true);
    if (!silent) setError("");
    try {
      setData(await api());
    } catch (err) {
      if (!silent) setError(err instanceof Error ? err.message : "Could not load linked Workflow To Dos.");
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const refresh = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const items = data.items || [];
  const metrics = useMemo(() => {
    const available = items.filter((item) => item.workflow);
    const completed = available.filter((item) => item.workflow?.completed && item.todoStatus === "Done").length;
    const readyToFinish = available.filter((item) => item.workflow?.completed && item.todoStatus !== "Done").length;
    const active = available.filter((item) => !item.workflow?.completed).length;
    const unavailable = items.length - available.length;
    return { linked: items.length, active, readyToFinish, completed, unavailable };
  }, [items]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const workflow = item.workflow;
      if (filter === "Active" && (!workflow || workflow.completed)) return false;
      if (filter === "Ready to Finish" && (!workflow?.completed || item.todoStatus === "Done")) return false;
      if (filter === "Completed" && (!workflow?.completed || item.todoStatus !== "Done")) return false;
      if (filter === "Unavailable" && workflow) return false;
      if (!needle) return true;
      return [item.todoCode, item.title, item.projectCode, item.assignedTo, item.todoStatus, item.priority, workflow?.serviceName, workflow?.status, workflow?.nextStatus, workflow?.billingCategory]
        .some((value) => String(value || "").toLowerCase().includes(needle));
    });
  }, [filter, items, query]);

  async function run(item: LinkedTodo, action: "advance" | "finish") {
    if (busy || !item.workflow) return;
    if (action === "finish") {
      const label = finishLabel(item);
      if (label !== "Complete To Do" && !window.confirm(`${label} for ${item.projectCode} · ${item.workflow.serviceName}?`)) return;
    }
    setBusy(`${item.todoCode}:${action}`);
    setError("");
    setNotice("");
    try {
      const updated = await api("POST", { action, todoCode: item.todoCode }) as LinkedTodo;
      if (action === "advance") {
        setNotice(`${item.projectCode} · ${item.workflow.serviceName} moved to ${updated.workflow?.status || "the next status"}.`);
      } else {
        setNotice(`${item.projectCode} · ${item.workflow.serviceName} and its linked To Do are complete.`);
      }
      await load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update linked Workflow.");
    } finally {
      setBusy("");
    }
  }

  return <section className="twf-shell">
    <style>{`
      .twf-shell{margin:18px 28px 0;padding:0;border:1px solid var(--lv-border-default);border-radius:16px;background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm);overflow:hidden;color:var(--lv-text-primary)}
      .twf-shell *{box-sizing:border-box}.twf-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid var(--lv-border-default);background:var(--lv-surface-muted)}
      .twf-head h2{margin:0;font-size:19px;color:var(--lv-text-strong)}.twf-head p{margin:5px 0 0;font-size:11px;color:var(--lv-text-secondary);line-height:1.5}.twf-live{display:flex;align-items:center;gap:7px;white-space:nowrap;font-size:10px;font-weight:900;color:var(--lv-success)}.twf-live i{width:8px;height:8px;border-radius:999px;background:var(--lv-success)}
      .twf-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;padding:14px 16px 8px}.twf-kpi{padding:11px 12px;border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-muted)}.twf-kpi span{display:block;font-size:9px;text-transform:uppercase;letter-spacing:.05em;font-weight:900;color:var(--lv-text-muted)}.twf-kpi strong{display:block;margin-top:5px;font-size:20px;color:var(--lv-text-strong)}
      .twf-tools{display:flex;gap:8px;align-items:center;padding:7px 16px 13px}.twf-tabs{display:flex;gap:6px;overflow:auto}.twf-tabs button,.twf-refresh{min-height:34px;padding:0 10px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-secondary);font-size:10px;font-weight:900;cursor:pointer;white-space:nowrap}.twf-tabs button.active{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.twf-search{margin-left:auto;min-width:220px;max-width:360px;flex:1}.twf-search input{width:100%;min-height:36px;padding:0 11px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);outline:0}.twf-refresh:disabled{opacity:.55;cursor:not-allowed}
      .twf-msg{margin:0 16px 12px;padding:9px 10px;border-radius:8px;font-size:10px;font-weight:800}.twf-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}.twf-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}
      .twf-table-wrap{overflow:auto;border-top:1px solid var(--lv-border-default)}.twf-table{width:100%;min-width:1050px;border-collapse:collapse}.twf-table th{padding:10px 12px;background:var(--lv-surface-muted);border-bottom:1px solid var(--lv-border-default);text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:var(--lv-text-muted)}.twf-table td{padding:12px;border-bottom:1px solid var(--lv-border-subtle);vertical-align:middle;font-size:10px}.twf-table tr:last-child td{border-bottom:0}
      .twf-task strong{display:block;font-size:11px;color:var(--lv-text-strong)}.twf-task span{display:block;margin-top:4px;color:var(--lv-text-muted);font-size:9px}.twf-service strong{display:block;font-size:11px}.twf-service span{display:block;margin-top:4px;color:var(--lv-text-muted);font-size:9px}.twf-status{display:inline-flex;padding:5px 8px;border-radius:999px;background:var(--lv-brand-soft);color:var(--lv-brand-text);font-size:9px;font-weight:950}.twf-status.done{background:var(--lv-success-soft);color:var(--lv-success)}.twf-status.todo{background:var(--lv-warning-soft);color:var(--lv-warning)}
      .twf-progress{min-width:145px}.twf-progress-top{display:flex;justify-content:space-between;gap:8px;margin-bottom:5px;font-size:9px}.twf-bar{height:7px;background:var(--lv-surface-muted);border-radius:999px;overflow:hidden}.twf-bar i{display:block;height:100%;background:var(--lv-brand-primary);border-radius:999px}.twf-next{margin-top:5px;color:var(--lv-text-muted);font-size:9px}.twf-actions{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}.twf-actions a,.twf-actions button{display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:0 9px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);text-decoration:none;font-size:9px;font-weight:950;cursor:pointer}.twf-actions button.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.twf-actions button.success{background:var(--lv-success-soft);border-color:var(--lv-success-border);color:var(--lv-success)}.twf-actions button:disabled{opacity:.5;cursor:not-allowed}.twf-missing{color:var(--lv-danger);font-weight:900}.twf-empty{padding:28px;text-align:center;color:var(--lv-text-muted);font-size:11px}
      @media(max-width:1000px){.twf-kpis{grid-template-columns:repeat(3,1fr)}.twf-tools{align-items:stretch;flex-direction:column}.twf-search{margin-left:0;min-width:0;max-width:none;width:100%}}@media(max-width:650px){.twf-shell{margin:14px 12px 0}.twf-head{flex-direction:column}.twf-kpis{grid-template-columns:repeat(2,1fr)}.twf-live{white-space:normal}}
    `}</style>

    <header className="twf-head">
      <div>
        <h2>To Do ↔ Workflow</h2>
        <p>Live Workflow status for linked Project To Dos. To Do remains independent; Workflow only moves when management explicitly advances or finishes it.</p>
      </div>
      <span className="twf-live"><i /> Live · auto-refresh 30s</span>
    </header>

    <div className="twf-kpis">
      <div className="twf-kpi"><span>Linked</span><strong>{metrics.linked}</strong></div>
      <div className="twf-kpi"><span>Active Workflow</span><strong>{metrics.active}</strong></div>
      <div className="twf-kpi"><span>Ready to Finish</span><strong>{metrics.readyToFinish}</strong></div>
      <div className="twf-kpi"><span>Completed</span><strong>{metrics.completed}</strong></div>
      <div className="twf-kpi"><span>Unavailable</span><strong>{metrics.unavailable}</strong></div>
    </div>

    <div className="twf-tools">
      <div className="twf-tabs">{FILTERS.map((name) => <button key={name} className={filter === name ? "active" : ""} type="button" onClick={() => setFilter(name)}>{name}</button>)}</div>
      <label className="twf-search"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search task, project, service, employee…" /></label>
      <button className="twf-refresh" type="button" onClick={() => void load()} disabled={loading || Boolean(busy)}>{loading ? "Loading…" : "Refresh"}</button>
    </div>

    {error ? <div className="twf-msg bad">{error}</div> : null}
    {notice ? <div className="twf-msg good">{notice}</div> : null}

    {loading && !items.length ? <div className="twf-empty">Loading linked Workflow To Dos…</div> : null}
    {!loading && !visible.length ? <div className="twf-empty">No linked Workflow To Dos match this view.</div> : null}

    {visible.length ? <div className="twf-table-wrap"><table className="twf-table">
      <thead><tr><th>Project / To Do</th><th>Workflow Service</th><th>Workflow Status</th><th>Progress</th><th>To Do</th><th>Assigned / Deadline</th><th style={{ textAlign: "right" }}>Action</th></tr></thead>
      <tbody>{visible.map((item) => {
        const workflow = item.workflow;
        const finishing = busy === `${item.todoCode}:finish`;
        const advancing = busy === `${item.todoCode}:advance`;
        const finished = Boolean(workflow?.completed && item.todoStatus === "Done");
        return <tr key={item.todoCode}>
          <td className="twf-task"><strong>{item.projectCode} · {item.title}</strong><span>{item.todoCode} · {item.priority}</span></td>
          <td className="twf-service">{workflow ? <><strong>{workflow.serviceName}</strong><span>{workflow.billingCategory || workflow.workflowType}</span></> : <span className="twf-missing">Linked service unavailable</span>}</td>
          <td>{workflow ? <span className={`twf-status ${workflow.completed ? "done" : ""}`}>{workflow.status}</span> : "—"}</td>
          <td>{workflow ? <div className="twf-progress"><div className="twf-progress-top"><span>{progressStep(workflow)}</span><strong>{workflow.progress}%</strong></div><div className="twf-bar"><i style={{ width: `${workflow.progress}%` }} /></div><div className="twf-next">{workflow.nextStatus ? `Next: ${workflow.nextStatus}` : "Final status reached"}</div></div> : "—"}</td>
          <td><span className={`twf-status ${item.todoStatus === "Done" ? "done" : "todo"}`}>{item.todoStatus}</span></td>
          <td className="twf-service"><strong>{text(item.assignedTo, "Unassigned")}</strong><span>{deadline(item)}</span></td>
          <td><div className="twf-actions">
            {workflow ? <a href={`/admin/project-operations/by-project?project=${encodeURIComponent(item.projectCode)}&workflow=${encodeURIComponent(workflow.id)}`}>Open Workflow</a> : null}
            {workflow?.nextStatus ? <button className="primary" type="button" disabled={Boolean(busy)} onClick={() => void run(item, "advance")}>{advancing ? "Advancing…" : `Advance → ${workflow.nextStatus}`}</button> : null}
            {workflow ? <button className="success" type="button" disabled={Boolean(busy) || finished} onClick={() => void run(item, "finish")}>{finishing ? "Finishing…" : finishLabel(item)}</button> : null}
          </div></td>
        </tr>;
      })}</tbody>
    </table></div> : null}
  </section>;
}
