"use client";

import { useEffect, useMemo, useState } from "react";

type TodoStatus = "To Do" | "In Progress" | "Done";
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
  notification_last_attempt_at?: string | null;
  notification_last_error?: string | null;
  reference_type?: "None" | "Project" | "Proposal";
  project_code?: string | null;
  proposal_code?: string | null;
  workflow_id?: string | null;
  assigned_employee_id?: string | null;
  assigned_to?: string | null;
};

type Draft = { dueDate: string; dueTime: string; reminder: string };
type Filter = "Open" | "Today" | "Overdue" | "Reminders" | "Completed";

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const REMINDERS = [
  ["off", "Reminder off"],
  ["0", "At deadline"],
  ["15", "15 minutes before"],
  ["30", "30 minutes before"],
  ["60", "1 hour before"],
  ["120", "2 hours before"],
  ["1440", "1 day before"],
  ["2880", "2 days before"],
] as const;

function text(value: unknown) { return String(value ?? "").trim(); }
function timeValue(value?: string | null) { return text(value).slice(0, 5); }
function dhakaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}
function deadlineMs(item: Pick<TodoItem, "due_date" | "due_time">) {
  const d = text(item.due_date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = text(item.due_time).match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!d) return NaN;
  if (!t) return Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), 23, 59, 59) - DHAKA_OFFSET_MS;
  return Date.UTC(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]), Number(t[3] || 0)) - DHAKA_OFFSET_MS;
}
function deadlineLabel(item: Pick<TodoItem, "due_date" | "due_time">) {
  if (!item.due_date) return "No deadline";
  const ms = deadlineMs(item);
  if (!Number.isFinite(ms)) return [item.due_date, timeValue(item.due_time)].filter(Boolean).join(" · ");
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka", day: "2-digit", month: "short", year: "numeric",
    ...(item.due_time ? { hour: "2-digit", minute: "2-digit", hour12: true } : {}),
  }).format(new Date(ms));
}
function reminderValue(item: TodoItem) {
  return item.reminder_enabled ? String(item.reminder_minutes_before ?? 0) : "off";
}
function referenceLabel(item: TodoItem) {
  if (item.project_code) return `Project ${item.project_code}`;
  if (item.proposal_code) return `Proposal ${item.proposal_code}`;
  return "General To Do";
}
function notificationState(item: TodoItem) {
  if (item.notification_last_error) return { label: `Notification error: ${item.notification_last_error}`, tone: "bad" };
  if (item.overdue_notified_at) return { label: "Overdue alert queued", tone: "bad" };
  if (item.reminder_sent_at) return { label: "Reminder queued", tone: "good" };
  if (item.reminder_enabled) return { label: "Reminder scheduled", tone: "warn" };
  return { label: "Reminder off", tone: "muted" };
}

async function api(method: "GET" | "POST", body?: Record<string, unknown>) {
  const response = await fetch("/api/admin/todo", {
    method, credentials: "same-origin", cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "To Do reminder request failed."));
  return json.data;
}

function ReminderRow({ item, onSaved }: { item: TodoItem; onSaved: () => Promise<void> }) {
  const [draft, setDraft] = useState<Draft>({ dueDate: item.due_date || "", dueTime: timeValue(item.due_time), reminder: reminderValue(item) });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const isOverdue = item.status !== "Done" && Boolean(item.due_date) && deadlineMs(item) < Date.now();
  const state = notificationState(item);

  useEffect(() => {
    setDraft({ dueDate: item.due_date || "", dueTime: timeValue(item.due_time), reminder: reminderValue(item) });
  }, [item.due_date, item.due_time, item.reminder_enabled, item.reminder_minutes_before]);

  async function save() {
    if (busy) return;
    const reminderEnabled = draft.reminder !== "off";
    if (reminderEnabled && !item.assigned_employee_id) { setMessage("Assign an employee before enabling a WhatsApp reminder."); return; }
    if (reminderEnabled && (!draft.dueDate || !draft.dueTime)) { setMessage("Reminder requires both a due date and due time."); return; }
    setBusy(true); setMessage("");
    try {
      await api("POST", {
        action: "update",
        todoCode: item.todo_code,
        item: {
          title: item.title, description: item.description || "", status: item.status, priority: item.priority,
          dueDate: draft.dueDate, dueTime: draft.dueTime,
          reminderEnabled,
          reminderMinutesBefore: reminderEnabled ? Number(draft.reminder) : null,
          referenceType: item.reference_type || (item.project_code ? "Project" : item.proposal_code ? "Proposal" : "None"),
          projectCode: item.project_code || "", proposalCode: item.proposal_code || "", workflowId: item.workflow_id || "",
          assignedEmployeeId: item.assigned_employee_id || "", assignedTo: item.assigned_to || "",
        },
      });
      setMessage(reminderEnabled ? "Deadline and reminder saved." : "Deadline saved. Reminder is off.");
      await onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save reminder.");
    } finally { setBusy(false); }
  }

  return <article className={`trc-row${isOverdue ? " overdue" : ""}`}>
    <div className="trc-task">
      <strong>{item.title}</strong>
      <span>{referenceLabel(item)} · {item.assigned_to || "Unassigned"}</span>
      <small>{item.status} · {item.priority} priority · {deadlineLabel(item)}</small>
    </div>
    <label><span>Due date</span><input type="date" value={draft.dueDate} onChange={(e) => setDraft((v) => ({ ...v, dueDate: e.target.value }))} /></label>
    <label><span>Due time</span><input type="time" value={draft.dueTime} onChange={(e) => setDraft((v) => ({ ...v, dueTime: e.target.value }))} /></label>
    <label><span>WhatsApp reminder</span><select value={draft.reminder} onChange={(e) => setDraft((v) => ({ ...v, reminder: e.target.value }))}>{REMINDERS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <div className="trc-state">
      <span className={`trc-pill ${state.tone}`}>{isOverdue ? "Overdue" : state.label}</span>
      {item.reminder_enabled ? <small>{state.label}</small> : <small>Opt-in only</small>}
      {message ? <em>{message}</em> : null}
    </div>
    <button className="trc-save" type="button" onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
  </article>;
}

export default function AdminTodoReminderCenter() {
  const [items, setItems] = useState<TodoItem[]>([]);
  const [filter, setFilter] = useState<Filter>("Open");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try { setItems(await api("GET")); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load reminder settings."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const today = dhakaToday();
  const metrics = useMemo(() => {
    const open = items.filter((item) => item.status !== "Done");
    return {
      open: open.length,
      today: open.filter((item) => item.due_date === today).length,
      overdue: open.filter((item) => Boolean(item.due_date) && deadlineMs(item) < Date.now()).length,
      reminders: open.filter((item) => item.reminder_enabled).length,
    };
  }, [items, today]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      const overdue = item.status !== "Done" && Boolean(item.due_date) && deadlineMs(item) < Date.now();
      if (filter === "Open" && item.status === "Done") return false;
      if (filter === "Completed" && item.status !== "Done") return false;
      if (filter === "Today" && (item.status === "Done" || item.due_date !== today)) return false;
      if (filter === "Overdue" && !overdue) return false;
      if (filter === "Reminders" && (item.status === "Done" || !item.reminder_enabled)) return false;
      if (!needle) return true;
      return [item.title, item.todo_code, item.project_code, item.proposal_code, item.assigned_to, item.priority, item.status].some((v) => text(v).toLowerCase().includes(needle));
    }).sort((a, b) => {
      const aOver = a.status !== "Done" && Boolean(a.due_date) && deadlineMs(a) < Date.now();
      const bOver = b.status !== "Done" && Boolean(b.due_date) && deadlineMs(b) < Date.now();
      if (aOver !== bOver) return Number(bOver) - Number(aOver);
      const am = deadlineMs(a), bm = deadlineMs(b);
      if (Number.isFinite(am) && Number.isFinite(bm)) return am - bm;
      if (Number.isFinite(am)) return -1;
      if (Number.isFinite(bm)) return 1;
      return a.title.localeCompare(b.title);
    });
  }, [items, filter, query, today]);

  return <section className="trc-shell">
    <style>{`
      .trc-shell{margin:18px auto 48px;width:calc(100% - 56px);max-width:1544px;border:1px solid #e2e5e9;border-radius:16px;background:#fff;color:#1d2228;overflow:hidden;box-shadow:0 8px 28px rgba(15,23,42,.05)}.trc-shell *{box-sizing:border-box}.trc-head{display:flex;justify-content:space-between;gap:20px;padding:21px 23px;border-bottom:1px solid #e5e7eb;background:#fafbfc}.trc-head h2{margin:3px 0 0;font-size:22px}.trc-head p{margin:7px 0 0;color:#68707a;font-size:12px;line-height:1.5}.trc-tag{align-self:flex-start;padding:7px 10px;border-radius:999px;background:#f6e9ea;color:#971923;font-size:10px;font-weight:900}.trc-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;padding:14px 18px}.trc-metric{border:1px solid #e1e4e8;border-radius:10px;background:#fff;padding:11px 13px;text-align:left;cursor:pointer}.trc-metric span{display:block;color:#737b84;font-size:9px;font-weight:900;text-transform:uppercase}.trc-metric strong{display:block;margin-top:4px;font-size:21px}.trc-tools{display:flex;gap:8px;padding:0 18px 14px}.trc-filters{display:flex;gap:6px;overflow:auto}.trc-filters button{height:35px;padding:0 11px;border:1px solid #d9dde3;border-radius:8px;background:#fff;color:#4b5563;font-weight:800;cursor:pointer}.trc-filters button.active{background:#a51d25;color:#fff;border-color:#a51d25}.trc-search{margin-left:auto;min-width:260px;height:36px;border:1px solid #d9dde3;border-radius:8px;padding:0 11px;outline:0}.trc-list{border-top:1px solid #e5e7eb}.trc-row{display:grid;grid-template-columns:minmax(250px,1.6fr) 145px 125px 180px minmax(150px,.8fr) 78px;gap:11px;align-items:end;padding:14px 18px;border-bottom:1px solid #edf0f2}.trc-row.overdue{background:#fffafa}.trc-task strong{display:block;font-size:13px}.trc-task span,.trc-task small{display:block;margin-top:4px;color:#6b7280;font-size:10px;line-height:1.4}.trc-row label{display:grid;gap:5px}.trc-row label>span{font-size:9px;font-weight:900;color:#626a73;text-transform:uppercase}.trc-row input,.trc-row select{width:100%;height:38px;border:1px solid #d8dde4;border-radius:8px;background:#fff;padding:0 9px;font:inherit;font-size:11px}.trc-state{display:grid;gap:5px;align-self:center}.trc-state small{color:#7a828c;font-size:9px}.trc-state em{font-size:9px;color:#374151;font-style:normal}.trc-pill{display:inline-flex;width:max-content;max-width:100%;padding:4px 7px;border-radius:999px;font-size:9px;font-weight:900;background:#eef1f4;color:#69707a}.trc-pill.good{background:#e9f7ef;color:#207348}.trc-pill.warn{background:#fff4d9;color:#8a5b00}.trc-pill.bad{background:#fdebec;color:#a51d25}.trc-save{height:38px;border:1px solid #981b23;border-radius:8px;background:#a51d25;color:#fff;font-weight:900;cursor:pointer}.trc-save:disabled{opacity:.5}.trc-empty,.trc-error{padding:25px;text-align:center;color:#747c85}.trc-error{color:#a51d25}@media(max-width:1180px){.trc-row{grid-template-columns:1fr 1fr 1fr}.trc-task{grid-column:1/-1}.trc-state{align-self:end}}@media(max-width:720px){.trc-shell{width:calc(100% - 24px)}.trc-head{flex-direction:column}.trc-metrics{grid-template-columns:1fr 1fr}.trc-tools{flex-direction:column}.trc-search{margin:0;min-width:0;width:100%}.trc-row{grid-template-columns:1fr}.trc-task{grid-column:auto}.trc-filters{width:100%}}
    `}</style>
    <div className="trc-head"><div><span className="trc-tag">DEADLINES & REMINDERS</span><h2>To Do Reminder Center</h2><p>Set an exact Bangladesh-time deadline and optionally notify the assigned employee on WhatsApp. Reminders are off unless you enable one.</p></div><span className="trc-tag">Asia/Dhaka</span></div>
    <div className="trc-metrics">
      <button className="trc-metric" onClick={() => setFilter("Open")}><span>Open</span><strong>{metrics.open}</strong></button>
      <button className="trc-metric" onClick={() => setFilter("Today")}><span>Due Today</span><strong>{metrics.today}</strong></button>
      <button className="trc-metric" onClick={() => setFilter("Overdue")}><span>Overdue</span><strong>{metrics.overdue}</strong></button>
      <button className="trc-metric" onClick={() => setFilter("Reminders")}><span>Reminders On</span><strong>{metrics.reminders}</strong></button>
    </div>
    <div className="trc-tools"><div className="trc-filters">{(["Open","Today","Overdue","Reminders","Completed"] as Filter[]).map((name) => <button key={name} className={filter === name ? "active" : ""} onClick={() => setFilter(name)}>{name}</button>)}</div><input className="trc-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search task, project, proposal, employee…" /></div>
    {error ? <div className="trc-error">{error}</div> : null}
    {loading ? <div className="trc-empty">Loading deadline settings…</div> : <div className="trc-list">{visible.map((item) => <ReminderRow key={item.todo_code} item={item} onSaved={load} />)}{!visible.length ? <div className="trc-empty">No To Dos in this view.</div> : null}</div>}
  </section>;
}
