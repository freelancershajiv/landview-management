"use client";

import { useEffect, useMemo, useState } from "react";

type TodoStatus = "To Do" | "In Progress" | "Done";
type View = "My To Dos" | "Today" | "Upcoming" | "Overdue" | "Completed";
type TodoItem = {
  todo_code: string;
  title: string;
  description?: string | null;
  status: TodoStatus;
  priority: "Low" | "Normal" | "High" | "Urgent";
  due_date?: string | null;
  due_time?: string | null;
  reminder_enabled?: boolean;
  reminder_minutes_before?: number | null;
  reminder_sent_at?: string | null;
  overdue_notified_at?: string | null;
  reference_type?: "None" | "Project" | "Proposal";
  project_code?: string | null;
  proposal_code?: string | null;
  workflow_id?: string | null;
  project_name?: string;
  project_client?: string;
  proposal_title?: string;
  proposal_client?: string;
  workflow_service?: string;
  workflow_status?: string;
};
type EmployeeTodoData = { employee: { id: string; employeeCode: string; name: string; designation?: string }; items: TodoItem[] };

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const STATUSES: TodoStatus[] = ["To Do", "In Progress", "Done"];
const VIEWS: View[] = ["My To Dos", "Today", "Upcoming", "Overdue", "Completed"];

function clean(value: unknown) { return String(value ?? "").trim(); }
function text(value: unknown, fallback = "—") { return clean(value) || fallback; }
function dhakaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function deadlineMs(item: TodoItem) {
  const d = clean(item.due_date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = clean(item.due_time).match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!d) return NaN;
  if (!t) return Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), 23, 59, 59) - DHAKA_OFFSET_MS;
  return Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]), Number(t[3] || 0)) - DHAKA_OFFSET_MS;
}
function isOverdue(item: TodoItem) { return item.status !== "Done" && Boolean(item.due_date) && deadlineMs(item) < Date.now(); }
function deadlineText(item: TodoItem) {
  if (!item.due_date) return "No deadline";
  const ms = deadlineMs(item);
  if (!Number.isFinite(ms)) return clean(item.due_date);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka", day: "2-digit", month: "short", year: "numeric",
    ...(item.due_time ? { hour: "2-digit", minute: "2-digit", hour12: true } : {}),
  }).format(new Date(ms));
}
function reminderText(item: TodoItem) {
  if (!item.reminder_enabled) return "";
  const m = Number(item.reminder_minutes_before || 0);
  if (m === 0) return "WhatsApp reminder at deadline";
  if (m < 60) return `WhatsApp reminder ${m} min before`;
  if (m % 1440 === 0) return `WhatsApp reminder ${m / 1440} day${m === 1440 ? "" : "s"} before`;
  if (m % 60 === 0) return `WhatsApp reminder ${m / 60} hour${m === 60 ? "" : "s"} before`;
  return `WhatsApp reminder ${m} min before`;
}
function referenceText(item: TodoItem) {
  if (item.reference_type === "Project" || item.project_code) return [item.project_code, item.project_client, item.project_name].filter(Boolean).join(" · ");
  if (item.reference_type === "Proposal" || item.proposal_code) return [item.proposal_code, item.proposal_client, item.proposal_title].filter(Boolean).join(" · ");
  return "General task";
}

async function api(method: "GET" | "POST" = "GET", body?: Record<string, unknown>) {
  const response = await fetch("/api/employee/todo", { method, credentials: "same-origin", cache: "no-store", headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Employee To Do request failed."));
  return json.data;
}

export default function EmployeeTodoCenter() {
  const [data, setData] = useState<EmployeeTodoData | null>(null);
  const [view, setView] = useState<View>("My To Dos");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setError("");
    try { setData(await api()); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load My To Dos."); }
    finally { if (!silent) setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const today = dhakaToday();
  const items = data?.items || [];
  const metrics = useMemo(() => {
    const open = items.filter((item) => item.status !== "Done");
    return {
      open: open.length,
      today: open.filter((item) => item.due_date === today).length,
      upcoming: open.filter((item) => Boolean(item.due_date && item.due_date > today)).length,
      overdue: open.filter(isOverdue).length,
      completed: items.filter((item) => item.status === "Done").length,
    };
  }, [items, today]);

  const visible = useMemo(() => {
    let rows = items.filter((item) => {
      if (view === "Completed") return item.status === "Done";
      if (item.status === "Done") return false;
      if (view === "Today") return item.due_date === today;
      if (view === "Upcoming") return Boolean(item.due_date && item.due_date > today);
      if (view === "Overdue") return isOverdue(item);
      return true;
    });
    const needle = query.trim().toLowerCase();
    if (needle) rows = rows.filter((item) => [item.title,item.description,item.project_code,item.project_name,item.project_client,item.proposal_code,item.proposal_title,item.proposal_client,item.workflow_service,item.workflow_status,item.priority,item.status].some((value) => clean(value).toLowerCase().includes(needle)));
    return rows.sort((a, b) => {
      const ao = isOverdue(a), bo = isOverdue(b);
      if (ao !== bo) return Number(bo) - Number(ao);
      const am = deadlineMs(a), bm = deadlineMs(b);
      if (Number.isFinite(am) && Number.isFinite(bm)) return am - bm;
      if (Number.isFinite(am)) return -1;
      if (Number.isFinite(bm)) return 1;
      return a.title.localeCompare(b.title);
    });
  }, [items, query, today, view]);

  async function updateStatus(item: TodoItem, status: TodoStatus) {
    if (busy || item.status === status) return;
    setBusy(item.todo_code); setError(""); setNotice("");
    try {
      await api("POST", { action: "updateStatus", todoCode: item.todo_code, status });
      setNotice(status === "Done" && item.workflow_id ? `${item.title} completed. Linked Workflow was left unchanged.` : `${item.title} updated to ${status}.`);
      await load(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update To Do status."); }
    finally { setBusy(""); }
  }

  if (loading) return <section className="etodo-shell"><div className="etodo-empty">Loading My To Dos…</div></section>;
  if (!data) return <section className="etodo-shell"><div className="etodo-error">{error || "My To Dos are unavailable."}</div></section>;

  return <section className="etodo-shell">
    <style>{`
      .etodo-shell{margin:0 0 16px;border:1px solid var(--lv-border-default);border-radius:15px;background:var(--lv-surface-panel);overflow:hidden;box-shadow:var(--lv-shadow-sm);color:var(--lv-text-primary)}.etodo-shell *{box-sizing:border-box}.etodo-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:17px 18px;border-bottom:1px solid var(--lv-border-default);background:var(--lv-surface-muted)}.etodo-head h2{margin:0;font-size:18px;color:var(--lv-text-strong)}.etodo-head p{margin:5px 0 0;font-size:12px;color:var(--lv-text-secondary)}.etodo-person{padding:7px 10px;border-radius:999px;background:var(--lv-surface-input);color:var(--lv-brand-text);font-size:10px;font-weight:900;white-space:nowrap}.etodo-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;padding:14px 16px 10px}.etodo-metric{border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-muted);padding:11px 12px;text-align:left;cursor:pointer;color:var(--lv-text-primary)}.etodo-metric span{display:block;color:var(--lv-text-muted);font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.etodo-metric strong{display:block;margin-top:5px;color:var(--lv-text-strong);font-size:21px}.etodo-metric.bad strong{color:var(--lv-danger)}.etodo-metric.warn strong{color:var(--lv-warning)}.etodo-tools{display:flex;align-items:center;gap:8px;padding:0 16px 13px}.etodo-tabs{display:flex;gap:6px;overflow:auto;scrollbar-width:none}.etodo-tabs::-webkit-scrollbar{display:none}.etodo-tabs button{min-height:34px;padding:0 11px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-secondary);font-size:10px;font-weight:900;cursor:pointer;white-space:nowrap}.etodo-tabs button.active{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.etodo-search{margin-left:auto;min-width:220px;max-width:340px;flex:1}.etodo-search input{width:100%;min-height:36px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);padding:0 11px;outline:0}.etodo-msg{margin:0 16px 12px;padding:9px 10px;border-radius:8px;font-size:10px}.etodo-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}.etodo-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.etodo-list{display:grid;border-top:1px solid var(--lv-border-default)}.etodo-row{display:grid;grid-template-columns:minmax(0,1.5fr) 190px 190px 145px;gap:12px;align-items:center;padding:14px 16px;border-bottom:1px solid var(--lv-border-subtle)}.etodo-row.overdue{background:color-mix(in srgb,var(--lv-danger-soft) 35%,var(--lv-surface-panel))}.etodo-title strong{display:block;color:var(--lv-text-strong);font-size:13px;line-height:1.4}.etodo-title p{margin:5px 0 0!important;color:var(--lv-text-secondary);font-size:11px!important;line-height:1.45!important}.etodo-ref{display:block;margin-top:6px;color:var(--lv-text-muted);font-size:10px;line-height:1.45}.etodo-workflow,.etodo-reminder{display:inline-flex;margin:7px 6px 0 0;padding:4px 7px;border-radius:999px;background:var(--lv-brand-soft);color:var(--lv-brand-text);font-size:9px;font-weight:900}.etodo-reminder{background:var(--lv-success-soft);color:var(--lv-success)}.etodo-meta{font-size:10px;color:var(--lv-text-secondary);line-height:1.5}.etodo-meta b{display:block;margin-bottom:3px;color:var(--lv-text-primary);font-size:9px;text-transform:uppercase;letter-spacing:.05em}.etodo-badge{display:inline-flex;margin-top:5px;padding:4px 7px;border-radius:999px;background:var(--lv-surface-muted);font-size:9px;font-weight:900;color:var(--lv-text-secondary)}.etodo-badge.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.etodo-badge.warn{background:var(--lv-warning-soft);color:var(--lv-warning)}.etodo-badge.good{background:var(--lv-success-soft);color:var(--lv-success)}.etodo-row select{width:100%;min-height:38px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);padding:0 9px;outline:0}.etodo-row select:disabled{opacity:.55}.etodo-empty{padding:28px;text-align:center;color:var(--lv-text-muted);font-size:11px}.etodo-error{padding:14px;color:var(--lv-danger);font-size:11px}@media(max-width:1050px){.etodo-metrics{grid-template-columns:repeat(3,1fr)}.etodo-row{grid-template-columns:1fr 1fr}.etodo-title{grid-column:1/-1}.etodo-tools{align-items:stretch;flex-direction:column}.etodo-search{margin-left:0;min-width:0;max-width:none;width:100%}}@media(max-width:600px){.etodo-head{flex-direction:column}.etodo-person{white-space:normal}.etodo-metrics{grid-template-columns:repeat(2,1fr)}.etodo-row{grid-template-columns:1fr}.etodo-title{grid-column:auto}.etodo-tabs{width:100%}}
    `}</style>
    <div className="etodo-head"><div><h2>My To Dos</h2><p>Deadlines use Bangladesh time. WhatsApp reminders appear only when management enables them.</p></div><span className="etodo-person">{text(data.employee.employeeCode)} · {text(data.employee.name)}</span></div>
    <div className="etodo-metrics">
      <button className="etodo-metric" onClick={() => setView("My To Dos")}><span>Open</span><strong>{metrics.open}</strong></button>
      <button className="etodo-metric warn" onClick={() => setView("Today")}><span>Today</span><strong>{metrics.today}</strong></button>
      <button className="etodo-metric" onClick={() => setView("Upcoming")}><span>Upcoming</span><strong>{metrics.upcoming}</strong></button>
      <button className="etodo-metric bad" onClick={() => setView("Overdue")}><span>Overdue</span><strong>{metrics.overdue}</strong></button>
      <button className="etodo-metric" onClick={() => setView("Completed")}><span>Completed</span><strong>{metrics.completed}</strong></button>
    </div>
    <div className="etodo-tools"><div className="etodo-tabs">{VIEWS.map((name) => <button key={name} className={view === name ? "active" : ""} onClick={() => setView(name)}>{name}</button>)}</div><label className="etodo-search"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search task, project, proposal, workflow…" /></label></div>
    {error ? <div className="etodo-msg bad">{error}</div> : null}{notice ? <div className="etodo-msg good">{notice}</div> : null}
    <div className="etodo-list">{visible.map((item) => {
      const overdue = isOverdue(item); const dueToday = item.status !== "Done" && item.due_date === today;
      return <article className={`etodo-row${overdue ? " overdue" : ""}`} key={item.todo_code}>
        <div className="etodo-title"><strong>{item.title}</strong>{item.description ? <p>{item.description}</p> : null}<span className="etodo-ref">{referenceText(item)}</span>{item.workflow_service ? <span className="etodo-workflow">{item.workflow_service} · {item.workflow_status || "Workflow"}</span> : null}{item.reminder_enabled ? <span className="etodo-reminder">{reminderText(item)}</span> : null}</div>
        <div className="etodo-meta"><b>Deadline</b>{deadlineText(item)}<br/><span className={`etodo-badge ${overdue ? "bad" : dueToday ? "warn" : item.status === "Done" ? "good" : ""}`}>{overdue ? "Overdue" : dueToday ? "Due today" : item.status === "Done" ? "Completed" : item.priority}</span></div>
        <div className="etodo-meta"><b>Notification</b>{item.overdue_notified_at ? "Overdue alert queued" : item.reminder_sent_at ? "Reminder queued" : item.reminder_enabled ? "Reminder scheduled" : "No reminder"}</div>
        <select disabled={busy === item.todo_code} value={item.status} onChange={(e) => void updateStatus(item, e.target.value as TodoStatus)}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
      </article>;
    })}{!visible.length ? <div className="etodo-empty">No To Dos in this view.</div> : null}</div>
  </section>;
}
