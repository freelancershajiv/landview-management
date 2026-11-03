"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Task = { todoCode: string; title: string; status: string; priority: string; projectCode: string; proposalCode: string; assignedTo: string };
type Subtask = {
  id: string;
  todo_code: string;
  title: string;
  sort_order: number;
  is_completed: boolean;
  completed_at?: string | null;
  completed_by_name?: string | null;
  completed_by_role?: string | null;
};
type Detail = { todo: Task; items: Subtask[]; canManage: boolean };
type Props = { mode: "admin" | "employee" };

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "To Do checklist request failed."));
  return json.data;
}
function taskRef(task?: Task | null) { return task?.projectCode || task?.proposalCode || "General"; }
function when(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true }).format(date);
}

export default function TodoChecklistCenter({ mode }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadTasks() {
    setLoading(true); setError("");
    try {
      const data = await api("/api/todo/subtasks") as { tasks: Task[]; canManage: boolean };
      const rows = data.tasks || [];
      setTasks(rows); setCanManage(Boolean(data.canManage));
      setSelected((current) => current && rows.some((item) => item.todoCode === current) ? current : rows[0]?.todoCode || "");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load To Do checklists."); }
    finally { setLoading(false); }
  }
  async function loadDetail(code = selected, silent = false) {
    if (!code) { setDetail(null); return; }
    if (!silent) setLoading(true);
    setError("");
    try {
      const data = await api(`/api/todo/subtasks?todoCode=${encodeURIComponent(code)}`) as Detail;
      setDetail(data); setCanManage(Boolean(data.canManage));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load checklist."); }
    finally { if (!silent) setLoading(false); }
  }
  useEffect(() => { void loadTasks(); }, []);
  useEffect(() => { if (selected) void loadDetail(selected); else setDetail(null); }, [selected]);

  const selectedTask = useMemo(() => tasks.find((task) => task.todoCode === selected) || null, [tasks, selected]);
  const items = detail?.items || [];
  const completed = items.filter((item) => item.is_completed).length;
  const progress = items.length ? Math.round((completed / items.length) * 100) : 0;

  async function mutate(body: Record<string, unknown>, success: string) {
    if (!selected || busy) return;
    setBusy(String(body.action || "update")); setError(""); setNotice("");
    try {
      await api("/api/todo/subtasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ todoCode: selected, ...body }) });
      setNotice(success); await loadDetail(selected, true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update checklist."); }
    finally { setBusy(""); }
  }

  async function add(event: FormEvent) {
    event.preventDefault();
    const title = newTitle.trim();
    if (!title || !canManage) return;
    await mutate({ action: "create", title }, "Checklist item added.");
    setNewTitle("");
  }
  async function rename(item: Subtask) {
    if (!canManage || busy) return;
    const next = window.prompt("Rename checklist item", item.title)?.trim();
    if (!next || next === item.title) return;
    await mutate({ action: "rename", id: item.id, title: next }, "Checklist item renamed.");
  }
  async function remove(item: Subtask) {
    if (!canManage || busy || !window.confirm(`Remove “${item.title}”?`)) return;
    await mutate({ action: "delete", id: item.id }, "Checklist item removed.");
  }
  async function move(index: number, delta: -1 | 1) {
    if (!canManage || busy) return;
    const next = [...items];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    await mutate({ action: "reorder", ids: next.map((item) => item.id) }, "Checklist order updated.");
  }

  return <section className="cl-shell">
    <style>{`
      .cl-shell{margin:${mode === "admin" ? "18px 28px 0" : "18px 0 0"};border:1px solid var(--lv-border-default);border-radius:16px;background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm);overflow:hidden;color:var(--lv-text-primary)}.cl-shell *{box-sizing:border-box}
      .cl-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:18px 20px;border-bottom:1px solid var(--lv-border-default);background:var(--lv-surface-muted)}.cl-head h2{margin:0;font-size:19px}.cl-head p{margin:5px 0 0;font-size:11px;color:var(--lv-text-secondary);line-height:1.5}.cl-select{min-width:280px;max-width:460px;width:42%;min-height:40px;padding:0 11px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-weight:800}
      .cl-context{padding:11px 18px;border-bottom:1px solid var(--lv-border-subtle);font-size:10px;color:var(--lv-text-secondary)}.cl-context strong{color:var(--lv-text-strong)}
      .cl-progress{display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:10px;padding:13px 18px;border-bottom:1px solid var(--lv-border-subtle)}.cl-progress strong{font-size:12px}.cl-bar{height:8px;border-radius:999px;background:var(--lv-surface-muted);overflow:hidden}.cl-bar i{display:block;height:100%;border-radius:999px;background:var(--lv-brand-primary)}.cl-percent{font-size:11px;font-weight:950;color:var(--lv-brand-primary)}
      .cl-msg{margin:12px 16px 0;padding:9px 10px;border-radius:8px;font-size:10px;font-weight:800}.cl-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.cl-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}
      .cl-body{padding:16px 18px}.cl-add{display:flex;gap:8px;margin-bottom:12px}.cl-add input{flex:1;min-height:38px;padding:0 10px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary)}.cl-btn{min-height:34px;padding:0 10px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:10px;font-weight:900;cursor:pointer}.cl-btn.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.cl-btn.danger{color:var(--lv-danger)}.cl-btn:disabled{opacity:.45;cursor:not-allowed}
      .cl-list{display:grid;gap:8px}.cl-item{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px 12px;border:1px solid var(--lv-border-subtle);border-radius:9px;background:var(--lv-surface-muted)}.cl-item.done{opacity:.72}.cl-check{width:19px;height:19px;accent-color:var(--lv-brand-primary);cursor:pointer}.cl-copy strong{display:block;font-size:11px;line-height:1.4}.cl-item.done .cl-copy strong{text-decoration:line-through}.cl-copy span{display:block;margin-top:4px;font-size:9px;color:var(--lv-text-muted)}.cl-actions{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.cl-actions .cl-btn{min-height:30px;padding:0 8px}.cl-empty{padding:28px 10px;text-align:center;color:var(--lv-text-muted);font-size:11px}
      @media(max-width:760px){.cl-shell{margin:${mode === "admin" ? "14px 12px 0" : "14px 0 0"}}.cl-head{flex-direction:column}.cl-select{min-width:0;max-width:none;width:100%}.cl-progress{grid-template-columns:1fr auto}.cl-progress strong{grid-column:1/-1}.cl-item{grid-template-columns:auto minmax(0,1fr)}.cl-actions{grid-column:1/-1;justify-content:flex-start;padding-left:29px}.cl-add{flex-direction:column}.cl-add .cl-btn{width:100%}}
    `}</style>

    <header className="cl-head">
      <div><h2>Checklist</h2><p>{mode === "employee" ? "Complete the checklist prepared for your assigned To Do. Checklist structure stays under management control." : "Break a To Do into clear steps. Employees can complete steps without changing the checklist structure."}</p></div>
      <select className="cl-select" value={selected} onChange={(e) => setSelected(e.target.value)} disabled={loading || !tasks.length}>
        {!tasks.length ? <option value="">No To Dos available</option> : null}
        {tasks.map((task) => <option key={task.todoCode} value={task.todoCode}>{task.todoCode} · {task.title}</option>)}
      </select>
    </header>

    {selectedTask ? <div className="cl-context"><strong>{selectedTask.todoCode} · {selectedTask.title}</strong> · {taskRef(selectedTask)} · {selectedTask.status}{selectedTask.assignedTo ? ` · ${selectedTask.assignedTo}` : ""}</div> : null}
    {selected ? <div className="cl-progress"><strong>{completed} of {items.length} completed</strong><div className="cl-bar"><i style={{ width: `${progress}%` }} /></div><span className="cl-percent">{progress}%</span></div> : null}
    {error ? <div className="cl-msg bad">{error}</div> : null}{notice ? <div className="cl-msg good">{notice}</div> : null}

    <div className="cl-body">
      {canManage && selected ? <form className="cl-add" onSubmit={add}><input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} maxLength={500} placeholder="Add checklist item…" /><button className="cl-btn primary" type="submit" disabled={!newTitle.trim() || Boolean(busy)}>{busy === "create" ? "Adding…" : "Add item"}</button></form> : null}
      {!selected ? <div className="cl-empty">No To Do is available.</div> : null}
      {selected && !loading && !items.length ? <div className="cl-empty">No checklist items yet.{canManage ? " Add the first step above." : " Management has not added a checklist yet."}</div> : null}
      <div className="cl-list">{items.map((item, index) => <div className={`cl-item${item.is_completed ? " done" : ""}`} key={item.id}>
        <input className="cl-check" type="checkbox" checked={item.is_completed} disabled={Boolean(busy)} onChange={(e) => void mutate({ action: "toggle", id: item.id, completed: e.target.checked }, e.target.checked ? "Checklist item completed." : "Checklist item reopened.")} aria-label={`Complete ${item.title}`} />
        <div className="cl-copy"><strong>{item.title}</strong>{item.is_completed ? <span>Completed{item.completed_by_name ? ` by ${item.completed_by_name}` : ""}{item.completed_at ? ` · ${when(item.completed_at)}` : ""}</span> : <span>Pending</span>}</div>
        {canManage ? <div className="cl-actions"><button className="cl-btn" type="button" onClick={() => void move(index, -1)} disabled={Boolean(busy) || index === 0}>↑</button><button className="cl-btn" type="button" onClick={() => void move(index, 1)} disabled={Boolean(busy) || index === items.length - 1}>↓</button><button className="cl-btn" type="button" onClick={() => void rename(item)} disabled={Boolean(busy)}>Rename</button><button className="cl-btn danger" type="button" onClick={() => void remove(item)} disabled={Boolean(busy)}>Remove</button></div> : null}
      </div>)}</div>
    </div>
  </section>;
}
