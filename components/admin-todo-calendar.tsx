"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Mode = "month" | "week" | "day";
type StatusFilter = "Open" | "All" | "To Do" | "In Progress" | "Done";
type CalendarItem = {
  id: string; todoCode: string; title: string; status: string; priority: string;
  dueDate: string; dueTime: string; createdAt: string; updatedAt: string;
  assignedEmployeeId: string; employeeName: string; employeeCode: string;
  projectCode: string; proposalCode: string; workflowService: string; workflowStatus: string;
  checklist: { total: number; completed: number };
};
type Employee = { id: string; code: string; name: string; status: string };
type Dashboard = { items: CalendarItem[]; employees: Employee[]; totalTasks: number; truncated: boolean; refreshedAt: string };

const DAY = 86_400_000;
const DHAKA = 6 * 3_600_000;
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DATE_FMT = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "long", year: "numeric" });
const MONTH_FMT = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" });
const SHORT_FMT = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "2-digit", month: "short" });
const PRIORITY: Record<string,number> = { Urgent: 0, High: 1, Normal: 2, Low: 3 };

function value(v: unknown) { return String(v ?? "").trim(); }
function todayDhaka(now = Date.now()) { return new Date(now + DHAKA).toISOString().slice(0, 10); }
function validDay(v: string) { const time = Date.parse(v + "T00:00:00Z"); return /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === v; }
function timeOfDay(v: string) { const match = /^([01]\d|2[0-3]):([0-5]\d)/.exec(v); return match ? match[1] + ":" + match[2] : ""; }
function timeMs(day: string) { return Date.parse(day + "T00:00:00Z"); }
function dateAt(day: string) { return new Date(timeMs(day)); }
function addDay(day: string, count: number) { return new Date(timeMs(day) + count * DAY).toISOString().slice(0, 10); }
function monday(day: string) { const utcDay = dateAt(day).getUTCDay(); return addDay(day, -(utcDay === 0 ? 6 : utcDay - 1)); }
function monthStart(day: string) { return day.slice(0, 7) + "-01"; }
function addMonth(day: string, count: number) {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7)) - 1;
  const target = new Date(Date.UTC(year, month + count, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(Number(day.slice(8, 10)), last));
  return target.toISOString().slice(0, 10);
}
function dateLabel(day: string) { return DATE_FMT.format(dateAt(day)); }
function monthLabel(day: string) { return MONTH_FMT.format(dateAt(day)); }
function shortLabel(day: string) { return SHORT_FMT.format(dateAt(day)); }
function dueAt(task: CalendarItem) {
  if (!validDay(task.dueDate)) return null;
  const time = timeOfDay(task.dueTime) || "23:59";
  const timestamp = Date.parse(task.dueDate + "T" + time + (timeOfDay(task.dueTime) ? ":00" : ":59") + "+06:00");
  return Number.isFinite(timestamp) ? timestamp : null;
}
function isOverdue(task: CalendarItem, now: number) {
  const due = dueAt(task);
  return task.status !== "Done" && due !== null && due < now;
}
function taskSort(a: CalendarItem, b: CalendarItem) {
  const aTime = timeOfDay(a.dueTime) || "99:99";
  const bTime = timeOfDay(b.dueTime) || "99:99";
  return aTime.localeCompare(bTime) || (PRIORITY[a.priority] ?? 4) - (PRIORITY[b.priority] ?? 4) || a.todoCode.localeCompare(b.todoCode);
}
function openTask(code: string) {
  const target = "#todo=" + encodeURIComponent(code);
  if (window.location.hash === target) window.dispatchEvent(new CustomEvent("landview:todo:open", { detail: { todoCode: code } }));
  else window.location.hash = target;
}
async function fetchDashboard(): Promise<Dashboard> {
  const res = await fetch("/api/admin/todo/dashboard", { credentials: "same-origin", cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(String(json?.error || "Could not load the To Do calendar."));
  return json.data as Dashboard;
}
const css = [
  ".tc-shell{margin:18px 28px 0;min-width:0;border:1px solid var(--lv-border-default);border-radius:16px;overflow:hidden;background:var(--lv-surface-panel);color:var(--lv-text-primary);box-shadow:var(--lv-shadow-sm)}.tc-shell *{box-sizing:border-box}",
  ".tc-head{padding:20px 22px;border-bottom:1px solid var(--lv-border-default);background:var(--lv-surface-muted);display:flex;justify-content:space-between;align-items:flex-start;gap:14px}.tc-head h2{font-size:20px;font-weight:900;letter-spacing:-.025em;margin:0}.tc-head p{font-size:11px;color:var(--lv-text-secondary);margin:5px 0 0;max-width:670px;line-height:1.55}",
  ".tc-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.tc-btn{min-height:36px;border:1px solid var(--lv-border-default);border-radius:9px;background:var(--lv-surface-input);color:var(--lv-text-primary);padding:8px 12px;font-size:11px;font-weight:850;cursor:pointer}.tc-btn.primary{background:var(--lv-brand-primary);color:var(--lv-text-inverse);border-color:var(--lv-brand-border)}.tc-btn:disabled{opacity:.5;cursor:default}",
  ".tc-body{padding:16px 18px}.tc-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.tc-metric{border:1px solid var(--lv-border-subtle);background:var(--lv-surface-muted);border-radius:10px;padding:12px}.tc-metric label{display:block;font-size:9px;font-weight:900;color:var(--lv-text-secondary);letter-spacing:.04em;text-transform:uppercase}.tc-metric strong{display:block;font-size:24px;line-height:1.1;margin-top:7px}.tc-metric small{display:block;font-size:9px;color:var(--lv-text-muted);margin-top:5px}.tc-metric.late strong{color:var(--lv-danger)}",
  ".tc-filters{display:grid;grid-template-columns:minmax(170px,1.6fr) repeat(3,minmax(120px,1fr));gap:9px;margin:16px 0}.tc-field{display:grid;gap:5px;font-size:10px;font-weight:850;color:var(--lv-text-secondary);min-width:0}.tc-field input,.tc-field select{width:100%;min-height:37px;border:1px solid var(--lv-border-default);border-radius:8px;padding:7px 9px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:11px}",
  ".tc-switchbar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;border:1px solid var(--lv-border-subtle);border-radius:11px;padding:10px 12px;margin-bottom:13px}.tc-nav,.tc-modes{display:flex;align-items:center;gap:6px;flex-wrap:wrap}.tc-nav h3{margin:0 8px;min-width:180px;font-size:16px;font-weight:900;letter-spacing:-.02em}.tc-nav .tc-date{width:128px;max-width:100%;min-height:34px;font-size:11px;padding:5px 7px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary)}",
  ".tc-modes{padding:3px;border:1px solid var(--lv-border-default);border-radius:9px;background:var(--lv-surface-muted)}.tc-modes button{border:0;border-radius:7px;padding:8px 13px;background:transparent;color:var(--lv-text-secondary);font-size:11px;font-weight:850;cursor:pointer}.tc-modes button.active{background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm);color:var(--lv-text-primary)}",
  ".tc-month{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));border:1px solid var(--lv-border-default);border-radius:12px;overflow:hidden}.tc-weekday{min-width:0;padding:11px 5px;background:var(--lv-surface-muted);text-align:center;font-size:10px;font-weight:900;color:var(--lv-text-secondary);border-bottom:1px solid var(--lv-border-default)}",
  ".tc-cell{position:relative;min-width:0;min-height:117px;border-right:1px solid var(--lv-border-subtle);border-bottom:1px solid var(--lv-border-subtle);padding:7px 7px 8px;display:flex;flex-direction:column;gap:5px;background:var(--lv-surface-panel)}.tc-cell:nth-child(7n){border-right:0}.tc-cell.outside{background:var(--lv-surface-muted)}.tc-cell.today{box-shadow:inset 0 0 0 2px var(--lv-brand-border)}.tc-cell.selected{background:var(--lv-surface-muted)}",
  ".tc-daylink{align-self:flex-start;display:flex;align-items:center;gap:4px;border:0;border-radius:6px;background:transparent;color:var(--lv-text-secondary);font-size:11px;font-weight:900;padding:3px 6px;cursor:pointer}.tc-cell.today .tc-daylink{color:var(--lv-brand-primary)}.tc-daylink small{font-size:9px;font-weight:700;color:var(--lv-text-muted)}",
  ".tc-item{border:1px solid var(--lv-border-subtle);border-left:3px solid var(--lv-brand-primary);border-radius:7px;text-align:left;min-width:0;width:100%;padding:6px;background:var(--lv-surface-muted);color:var(--lv-text-primary);cursor:pointer}.tc-item:hover,.tc-daytask:hover{border-color:var(--lv-brand-border)}.tc-item strong{font-size:10px;font-weight:850;line-height:1.3;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tc-item small{font-size:9px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--lv-text-muted);margin-top:3px}.tc-item.done{opacity:.62;border-left-color:var(--lv-success)}.tc-item.urgent{border-left-color:var(--lv-danger)}.tc-item.late{background:var(--lv-danger-soft)}",
  ".tc-more{font-size:10px;border:0;background:none;text-align:left;color:var(--lv-brand-primary);font-weight:900;cursor:pointer;padding:2px 5px}.tc-emptyday{font-size:9px;color:var(--lv-text-muted);padding:8px 4px}",
  ".tc-week{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}.tc-weekdaycol{min-width:0;border:1px solid var(--lv-border-subtle);border-radius:10px;min-height:255px;background:var(--lv-surface-panel);overflow:hidden}.tc-weekdaycol.selected{border-color:var(--lv-brand-border)}.tc-weekhead{width:100%;border:0;border-bottom:1px solid var(--lv-border-subtle);background:var(--lv-surface-muted);color:var(--lv-text-primary);padding:11px 8px;text-align:left;cursor:pointer}.tc-weekhead strong{font-size:13px;display:block}.tc-weekhead small{font-size:10px;color:var(--lv-text-secondary);display:block;margin-top:5px}.tc-week-items{display:grid;gap:6px;padding:8px}.tc-week-empty{font-size:10px;color:var(--lv-text-muted);padding:9px 4px}",
  ".tc-daypanel{border:1px solid var(--lv-border-subtle);border-radius:12px;overflow:hidden}.tc-daytitle{padding:14px 16px;border-bottom:1px solid var(--lv-border-subtle);background:var(--lv-surface-muted);font-size:13px;font-weight:900}.tc-timeline{display:grid;gap:0}.tc-timeslot{display:grid;grid-template-columns:112px minmax(0,1fr);min-height:81px;border-bottom:1px solid var(--lv-border-subtle)}.tc-timeslot:last-child{border-bottom:0}.tc-time{padding:14px;font-size:11px;font-weight:850;color:var(--lv-text-secondary);background:var(--lv-surface-muted);border-right:1px solid var(--lv-border-subtle)}.tc-time small{display:block;font-size:9px;font-weight:500;color:var(--lv-text-muted);margin-top:4px}.tc-tasks{padding:10px;display:grid;gap:7px;align-content:start}",
  ".tc-daytask{min-width:0;border:1px solid var(--lv-border-subtle);border-left:3px solid var(--lv-brand-primary);border-radius:9px;background:var(--lv-surface-panel);color:var(--lv-text-primary);text-align:left;padding:10px 12px;cursor:pointer}.tc-daytask.urgent{border-left-color:var(--lv-danger)}.tc-daytask.done{opacity:.7;border-left-color:var(--lv-success)}.tc-daytask.late{background:var(--lv-danger-soft)}.tc-daytask strong{font-size:11px;font-weight:900;display:block}.tc-daytask span{font-size:10px;color:var(--lv-text-secondary);display:block;line-height:1.45;margin-top:5px}.tc-daytask small{font-size:9px;color:var(--lv-text-muted);display:block;margin-top:4px}",
  ".tc-secondary{margin-top:16px;border:1px solid var(--lv-border-subtle);border-radius:12px;padding:13px}.tc-secondary-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:9px}.tc-secondary h4{font-size:12px;margin:0;font-weight:900}.tc-secondary p{font-size:10px;color:var(--lv-text-secondary);margin:5px 0 0}.tc-unscheduled{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.tc-note{margin:12px 0 0;font-size:9px;color:var(--lv-text-muted);line-height:1.5}.tc-warning{margin:11px 0;padding:11px 12px;background:var(--lv-danger-soft);border-radius:8px;color:var(--lv-danger);font-size:11px}.tc-empty{padding:24px;text-align:center;color:var(--lv-text-muted);font-size:11px}.tc-small{font-size:9px;color:var(--lv-text-muted)}",
  "@media(max-width:1120px){.tc-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.tc-week{overflow-x:auto;grid-template-columns:repeat(7,minmax(150px,1fr));padding-bottom:5px}.tc-weekdaycol{min-height:225px}.tc-month{overflow-x:auto;grid-template-columns:repeat(7,minmax(105px,1fr))}.tc-cell{min-height:105px}}",
  "@media(max-width:700px){.tc-shell{margin:14px 12px 0}.tc-head{padding:15px;flex-direction:column}.tc-body{padding:12px}.tc-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.tc-filters{grid-template-columns:1fr 1fr}.tc-switchbar{align-items:flex-start}.tc-nav h3{min-width:0;flex-basis:100%;order:-1}.tc-modes{width:100%}.tc-modes button{flex:1}.tc-cell{min-height:94px}.tc-unscheduled{grid-template-columns:1fr}.tc-timeslot{grid-template-columns:82px minmax(0,1fr)}.tc-time{padding:12px 7px}}",
  "@media(max-width:420px){.tc-filters{grid-template-columns:1fr}.tc-btn{padding:8px 9px}.tc-nav{width:100%}.tc-nav h3{flex-basis:100%}.tc-switchbar{padding:9px}}"
].join("");

export default function AdminTodoCalendar() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [anchor, setAnchor] = useState("");
  const [mode, setMode] = useState<Mode>("month");
  const [status, setStatus] = useState<StatusFilter>("Open");
  const [employeeId, setEmployeeId] = useState("");
  const [priority, setPriority] = useState("All");
  const [search, setSearch] = useState("");
  const [showAllUnscheduled, setShowAllUnscheduled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());

  const selectedDay = validDay(anchor) ? anchor : todayDhaka(now);
  const today = todayDhaka(now);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const next = await fetchDashboard();
      setData(next);
      setError("");
      setNow(Date.now());
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load the To Do calendar."); }
    finally { if (!quiet) setLoading(false); }
  }, []);

  useEffect(() => {
    function readLocation() {
      const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      if (params.get("tab") !== "calendar") return;
      const date = params.get("date") || "";
      const view = params.get("mode") || "";
      if (validDay(date)) setAnchor(date);
      if (view === "month" || view === "week" || view === "day") setMode(view);
    }
    readLocation();
    window.addEventListener("hashchange", readLocation);
    return () => window.removeEventListener("hashchange", readLocation);
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => { setNow(Date.now()); if (document.visibilityState === "visible") void load(true); };
    const timer = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    window.addEventListener("landview:todo:changed", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("landview:todo:changed", refresh);
    };
  }, [load]);

  function changeDate(nextDate: string, nextMode: Mode = mode) {
    if (!validDay(nextDate)) return;
    setAnchor(nextDate);
    setMode(nextMode);
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (params.get("tab") === "calendar") {
      params.set("date", nextDate);
      params.set("mode", nextMode);
      window.history.replaceState(null, "", window.location.pathname + window.location.search + "#" + params.toString());
    }
  }

  function step(delta: number) {
    changeDate(mode === "month" ? addMonth(selectedDay, delta) : addDay(selectedDay, mode === "week" ? delta * 7 : delta));
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.items || []).filter(task => {
      if (status === "Open" && task.status === "Done") return false;
      if (status !== "Open" && status !== "All" && task.status !== status) return false;
      if (employeeId === "__unassigned__" ? !!task.assignedEmployeeId : employeeId && task.assignedEmployeeId !== employeeId) return false;
      if (priority !== "All" && task.priority !== priority) return false;
      if (needle && ![task.todoCode, task.title, task.projectCode, task.proposalCode, task.employeeName, task.employeeCode, task.workflowService, task.workflowStatus].some(x => value(x).toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [data, status, employeeId, priority, search]);

  const byDay = useMemo(() => {
    const map = new Map<string,CalendarItem[]>();
    for (const task of filtered) {
      if (!validDay(task.dueDate)) continue;
      const existing = map.get(task.dueDate) || [];
      existing.push(task);
      map.set(task.dueDate, existing);
    }
    for (const list of map.values()) list.sort(taskSort);
    return map;
  }, [filtered]);

  const unscheduled = useMemo(() => filtered.filter(task => !validDay(task.dueDate)).sort((a,b) => (PRIORITY[a.priority]??4)-(PRIORITY[b.priority]??4) || b.createdAt.localeCompare(a.createdAt)), [filtered]);
  const counts = useMemo(() => ({
    dueToday: filtered.filter(task => task.status !== "Done" && task.dueDate === today).length,
    overdue: filtered.filter(task => isOverdue(task, now)).length,
    upcoming: filtered.filter(task => task.status !== "Done" && task.dueDate > today && task.dueDate <= addDay(today, 7)).length,
    noDate: unscheduled.filter(task => task.status !== "Done").length,
  }), [filtered, unscheduled, now, today]);

  const dayList = byDay.get(selectedDay) || [];
  const firstDay = monday(monthStart(selectedDay));
  const lastDay = monday(addDay(addMonth(monthStart(selectedDay), 1), -1));
  const lastSunday = addDay(lastDay, 6);
  const monthDays = Array.from({ length: Math.floor((timeMs(lastSunday) - timeMs(firstDay)) / DAY) + 1 }, (_, i) => addDay(firstDay, i));
  const weekDays = Array.from({ length: 7 }, (_, i) => addDay(monday(selectedDay), i));
  const title = mode === "month" ? monthLabel(selectedDay) : mode === "week" ? shortLabel(weekDays[0]) + " – " + shortLabel(weekDays[6]) + " " + selectedDay.slice(0, 4) : dateLabel(selectedDay);
  const daySlots = useMemo(() => {
    const groups = new Map<string,CalendarItem[]>();
    for (const task of dayList) {
      const time = timeOfDay(task.dueTime) || "End of day";
      const group = groups.get(time) || [];
      group.push(task);
      groups.set(time, group);
    }
    return [...groups.entries()].sort((a,b) => (a[0] === "End of day" ? 1 : b[0] === "End of day" ? -1 : a[0].localeCompare(b[0])));
  }, [dayList]);

  function taskClass(task: CalendarItem, base: string) {
    return base + (task.status === "Done" ? " done" : task.priority === "Urgent" ? " urgent" : "") + (isOverdue(task,now) ? " late" : "");
  }
  function taskHint(task: CalendarItem) {
    return [timeOfDay(task.dueTime) || "End of day", task.employeeCode ? task.employeeCode + " · " + task.employeeName : task.employeeName || "Unassigned"].join(" · ");
  }
  function taskButton(task: CalendarItem, detailed = false) {
    return <button type="button" key={task.todoCode} onClick={() => openTask(task.todoCode)}
      className={taskClass(task, detailed ? "tc-daytask" : "tc-item")}
      title={task.todoCode + " · " + task.title + " · " + taskHint(task)}
      aria-label={"Open " + task.todoCode + ": " + task.title + ", " + taskHint(task)}>
      <strong>{task.title}</strong>
      {detailed ? <>
        <span>{task.todoCode} · {task.projectCode || task.proposalCode || "General task"} · {task.priority} · {task.status}</span>
        <span>{task.employeeCode ? task.employeeCode + " · " : ""}{task.employeeName || "Unassigned"}</span>
        {task.workflowService && <small>Workflow: {task.workflowService} · {task.workflowStatus}</small>}
        {task.checklist?.total > 0 && <small>Checklist: {task.checklist.completed}/{task.checklist.total} done</small>}
      </> : <small>{taskHint(task)}</small>}
    </button>;
  }

  return <section className="tc-shell">
    <style>{css}</style>
    <header className="tc-head">
      <div>
        <h2>To Do Calendar & Timeline</h2>
        <p>Manage time visually across projects and employees. Deadlines are interpreted in Bangladesh time (UTC+6). Click a task to open its editor in the To Do Board.</p>
      </div>
      <div className="tc-actions">
        <button type="button" className="tc-btn" disabled={loading} onClick={() => void load()}>{loading ? "Loading…" : "Refresh"}</button>
        <button type="button" className="tc-btn primary" onClick={() => changeDate(today, mode)}>Today</button>
      </div>
    </header>
    {error && <div className="tc-warning" role="alert">{error}</div>}
    {data?.truncated && <div className="tc-warning">Some records could not be loaded because the dashboard reached its reporting limit. Calendar results may be incomplete.</div>}
    <div className="tc-body">
      <div className="tc-metrics">
        {([
          ["Due today", counts.dueToday, "Open tasks for today"],
          ["Overdue", counts.overdue, "Past deadline", "late"],
          ["Next 7 days", counts.upcoming, "Tomorrow onward"],
          ["Unscheduled", counts.noDate, "Open tasks without due dates"],
        ] as const).map(([label,count,subtitle,kind]) => <div className={"tc-metric" + (kind === "late" ? " late" : "")} key={label}>
          <label>{label}</label><strong>{count}</strong><small>{subtitle}</small>
        </div>)}
      </div>
      <div className="tc-filters">
        <label className="tc-field">Search task or project
          <input type="search" placeholder="Title, To Do code, LV project…" value={search} onChange={e => setSearch(e.target.value)}/>
        </label>
        <label className="tc-field">Assigned employee
          <select value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
            <option value="">All employees</option><option value="__unassigned__">Unassigned</option>
            {(data?.employees || []).map(employee => <option key={employee.id} value={employee.id}>{employee.code} · {employee.name}{employee.status.toLowerCase() === "active" ? "" : " (former)"}</option>)}
          </select>
        </label>
        <label className="tc-field">Task status
          <select value={status} onChange={e => setStatus(e.target.value as StatusFilter)}>
            <option>Open</option><option>All</option><option>To Do</option><option>In Progress</option><option>Done</option>
          </select>
        </label>
        <label className="tc-field">Priority
          <select value={priority} onChange={e => setPriority(e.target.value)}>
            <option>All</option><option>Urgent</option><option>High</option><option>Normal</option><option>Low</option>
          </select>
        </label>
      </div>

      <div className="tc-switchbar">
        <div className="tc-nav">
          <button className="tc-btn" type="button" aria-label="Previous period" onClick={() => step(-1)}>‹</button>
          <button className="tc-btn" type="button" aria-label="Next period" onClick={() => step(1)}>›</button>
          <h3>{title}</h3>
          <input className="tc-date" type="date" aria-label="Jump to calendar date" value={selectedDay} onChange={e => changeDate(e.target.value)}/>
        </div>
        <div className="tc-modes" aria-label="Calendar display mode">
          {(["month","week","day"] as const).map(v => <button type="button" key={v}
            className={mode === v ? "active" : ""}
            aria-pressed={mode === v}
            onClick={() => changeDate(selectedDay, v)}>{v.charAt(0).toUpperCase()+v.slice(1)}</button>)}
        </div>
      </div>

      {mode === "month" && <div className="tc-month" aria-label="Monthly To Do calendar">
        {WEEKDAYS.map(weekday => <div key={weekday} className="tc-weekday">{weekday}</div>)}
        {monthDays.map(day => {
          const list = byDay.get(day) || [];
          const outside = day.slice(0,7) !== selectedDay.slice(0,7);
          return <div className={"tc-cell" + (outside ? " outside" : "") + (day === today ? " today" : "") + (day === selectedDay ? " selected" : "")} key={day}>
            <button type="button" className="tc-daylink" onClick={() => changeDate(day,"day")}
              aria-label={"View " + dateLabel(day) + ", " + list.length + " tasks"}>
              {Number(day.slice(-2))}{list.length > 0 && <small>· {list.length}</small>}
            </button>
            {list.slice(0,3).map(task => taskButton(task))}
            {list.length > 3 && <button className="tc-more" type="button" onClick={() => changeDate(day,"day")}>+{list.length-3} more</button>}
          </div>;
        })}
      </div>}

      {mode === "week" && <div className="tc-week" aria-label="Weekly To Do timeline">
        {weekDays.map(day => {
          const list = byDay.get(day) || [];
          return <div className={"tc-weekdaycol" + (day === selectedDay ? " selected" : "")} key={day}>
            <button type="button" className="tc-weekhead" onClick={() => changeDate(day,"day")}>
              <strong>{WEEKDAYS[(dateAt(day).getUTCDay()+6)%7]} · {Number(day.slice(-2))}</strong>
              <small>{day === today ? "Today · " : ""}{list.length} task{list.length === 1 ? "" : "s"}</small>
            </button>
            <div className="tc-week-items">
              {list.map(task => taskButton(task))}
              {!list.length && <span className="tc-week-empty">No deadlines</span>}
            </div>
          </div>;
        })}
      </div>}

      {mode === "day" && <div className="tc-daypanel" aria-label="Daily To Do deadline timeline">
        <div className="tc-daytitle">{dateLabel(selectedDay)} · {dayList.length} scheduled task{dayList.length === 1 ? "" : "s"}</div>
        {daySlots.length > 0 ? <div className="tc-timeline">
          {daySlots.map(([time,list]) => <div className="tc-timeslot" key={time}>
            <div className="tc-time">
              {time === "End of day" ? "Date only" : time}
              <small>{time === "End of day" ? "Due by 11:59 PM" : "Bangladesh time"}</small>
            </div>
            <div className="tc-tasks">{list.map(task => taskButton(task,true))}</div>
          </div>)}
        </div> : <div className="tc-empty">No deadlines scheduled for this day with the current filters.</div>}
      </div>}

      <section className="tc-secondary" aria-label="To Dos without deadlines">
        <div className="tc-secondary-head">
          <div><h4>Needs scheduling · {unscheduled.length}</h4><p>Tasks without due dates remain visible here instead of disappearing from the calendar.</p></div>
          {unscheduled.length > 6 && <button type="button" className="tc-btn" onClick={() => setShowAllUnscheduled(!showAllUnscheduled)}>
            {showAllUnscheduled ? "Show fewer" : "Show all"}
          </button>}
        </div>
        <div className="tc-unscheduled">
          {unscheduled.slice(0,showAllUnscheduled ? undefined : 6).map(task => taskButton(task,true))}
          {!unscheduled.length && <div className="tc-week-empty">No unscheduled tasks match the filters.</div>}
        </div>
      </section>
      <p className="tc-note">Tasks with a date but no specific time are due at the end of that day (11:59 PM, Dhaka). The calendar is read-only: change assignments or deadlines from the To Do Board. Automatically refreshes every 60 seconds while active. {data?.refreshedAt ? "Last synced: " + new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Dhaka",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(data.refreshedAt)) : ""}</p>
    </div>
  </section>;
}
