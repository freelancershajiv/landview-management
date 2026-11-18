"use client";

import dynamic from "next/dynamic";
import { workScopeFromHash } from "@/lib/work-task-links";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

type Tab = "overview" | "board" | "calendar" | "workflow" | "collaboration" | "planning" | "management" | "reports" | "analytics";
type View = "checklist" | "files" | "templates" | "rules" | "reminders" | "workload" | "alerts" | "intelligence";
type Navigation = { tab: Tab; view: View | "" };
type TabDetail = { id: Tab; label: string; subtitle: string; description: string };
type ViewDetail = { id: View; label: string; description: string };

const TABS: TabDetail[] = [
  { id: "overview", label: "Today", subtitle: "Focus", description: "Prioritize deadlines, urgent assignments and work that needs attention." },
  { id: "board", label: "All Tasks", subtitle: "Create & manage", description: "Create, assign, prioritize, edit, and complete individual To Dos." },
  { id: "calendar", label: "Calendar", subtitle: "Day · Week · Month", description: "See deadlines and employee assignments in an interactive day, week, or month calendar." },
  { id: "workflow", label: "Workflow", subtitle: "Linked services", description: "Review linked services and explicitly advance or complete Workflow stages." },
  { id: "collaboration", label: "Collaboration", subtitle: "Checklists & files", description: "Manage task checklists, conversations, attachments, and activity history." },
  { id: "planning", label: "Planning", subtitle: "Templates & automation", description: "Configure templates, recurring work, event automations, and due reminders." },
  { id: "management", label: "Team", subtitle: "People & alerts", description: "Balance team workload, review escalations, and configure notification limits." },
  { id: "reports", label: "Reports & Views", subtitle: "Excel · PDF", description: "Filter, save and export management To Do reports." },
  { id: "analytics", label: "Performance", subtitle: "Analytics", description: "Review the existing management dashboard and performance indicators." },
];

const SUBTABS: Record<Tab, ViewDetail[]> = {
  overview: [],
  board: [],
  calendar: [],
  workflow: [],
  collaboration: [
    { id: "checklist", label: "Checklists", description: "Subtasks and step-by-step progress for each To Do." },
    { id: "files", label: "Comments, Files & Activity", description: "Shared discussions, private attachments, and the audit timeline." },
  ],
  planning: [
    { id: "templates", label: "Templates & Recurring", description: "Create reusable task/checklist templates and manage recurring schedules." },
    { id: "rules", label: "Automation Rules", description: "Create To Dos automatically from new project, payment, proposal, site, and document events." },
    { id: "reminders", label: "Due Times & Reminders", description: "Manage exact deadlines and opt-in employee WhatsApp reminders." },
  ],
  reports: [],
  analytics: [],
  management: [
    { id: "intelligence", label: "Management Intelligence", description: "Review bottlenecks, overdue work and estimated capacity risk." },
    { id: "workload", label: "Workload & Escalations", description: "Compare workload scores and manage overdue task escalations." },
    { id: "alerts", label: "Alerts & Limits", description: "Set workload limits and review optional management notifications." },
  ],
};

function LoadingPanel() {
  return <div className="tws-loading" role="status" aria-live="polite">
    <span className="tws-loading-dot" aria-hidden="true" />
    Opening workspace…
  </div>;
}

const Analytics = dynamic(() => import("./admin-todo-management-dashboard"), { loading: LoadingPanel });
const Board = dynamic(() => import("./admin-todo-board"), { loading: LoadingPanel });
const Calendar = dynamic(() => import("./admin-todo-calendar"), { loading: LoadingPanel });
const Workflow = dynamic(() => import("./admin-todo-workflow-center"), { loading: LoadingPanel });
const Checklist = dynamic(() => import("./todo-checklist-center"), { loading: LoadingPanel });
const Collaboration = dynamic(() => import("./todo-collaboration-center"), { loading: LoadingPanel });
const Templates = dynamic(() => import("./admin-todo-template-center"), { loading: LoadingPanel });
const Rules = dynamic(() => import("./admin-todo-automation-center"), { loading: LoadingPanel });
const Reminders = dynamic(() => import("./admin-todo-reminder-center"), { loading: LoadingPanel });
const Intelligence = dynamic(() => import("./admin-work-intelligence"), { loading: LoadingPanel });
const Workload = dynamic(() => import("./admin-todo-workload-center"), { loading: LoadingPanel });
const Alerts = dynamic(() => import("./admin-todo-management-alerts"), { loading: LoadingPanel });
const Reports = dynamic(() => import("./admin-todo-reports"), { loading: LoadingPanel });

function defaultView(tab: Tab): View | "" {
  return SUBTABS[tab][0]?.id || "";
}

function navigationFromHash(): Navigation {
  if (typeof window === "undefined") return { tab: "overview", view: "" };
  const fragment = window.location.hash.replace(/^#/, "");
  if (fragment === "todo" || fragment === "board" || fragment.startsWith("todo=")) {
    return { tab: "board", view: "" };
  }
  const params = new URLSearchParams(fragment);
  const tabParam = params.get("tab") || "overview";
  const tab = TABS.some((item) => item.id === tabParam) ? tabParam as Tab : "overview";
  const viewParam = params.get("view");
  const allowed = SUBTABS[tab];
  const view = allowed.find((item) => item.id === viewParam)?.id || defaultView(tab);
  return { tab, view };
}

function locationHash(tab: Tab, view: View | "") {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (view) params.set("view", view);
  return "#" + params.toString();
}

const PRIMARY_TABS: Tab[] = ["overview", "board", "calendar", "management"];
const TOOLS: Tab[] = ["workflow", "collaboration", "planning", "reports", "analytics"];
type TodayTask = {
  todoCode: string; title: string; status: "To Do" | "In Progress" | "Done"; priority: string;
  dueDate: string; dueTime: string; employeeName: string; assignedTo: string; assignedEmployeeId: string;
  projectCode: string; proposalCode: string; workflowService: string;
  workflowMissing: boolean; workflowMismatch: boolean; dependencyBlocker?: string; deliveryStep?: boolean; reviewRequired?: boolean; reviewState?: string;
};
type TodayPayload = { items: TodayTask[]; truncated: boolean; totalTasks: number };
type Focus = "attention" | "overdue" | "today" | "progress" | "unassigned" | "blocked" | "review";
const FOCUS_LABELS: Record<Focus, string> = {
  attention: "Requires attention", overdue: "Overdue tasks", today: "Due today",
  progress: "In progress", unassigned: "Unassigned tasks", blocked: "Dependency blockers", review: "Awaiting management review",
};
function localDay(now: number) {
  return new Date(now + 6 * 3600000).toISOString().slice(0, 10);
}
function taskDeadline(task: TodayTask) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate || "")) return Infinity;
  const time = /^([01]\d|2[0-3]):[0-5]\d/.test(task.dueTime || "") ? task.dueTime.slice(0,5) + ":00" : "23:59:59";
  const value = Date.parse(task.dueDate + "T" + time + "+06:00");
  return Number.isFinite(value) ? value : Infinity;
}
function taskDueLabel(task: TodayTask) {
  const due = taskDeadline(task);
  if (!Number.isFinite(due)) return "No deadline";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka", day: "numeric", month: "short",
    ...(task.dueTime ? { hour: "numeric", minute: "2-digit", hour12: true } : {}),
  }).format(due);
}
function Today({ onOpen, onAll }: { onOpen: (code: string) => void; onAll: () => void }) {
  const [data, setData] = useState<TodayPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [focus, setFocus] = useState<Focus>("attention");
  const [now, setNow] = useState(Date.now());
  const [limit, setLimit] = useState(20);
  const refreshRef = useRef<() => void>(() => {});
  useEffect(() => {
    let alive = true;
    let pending = false;
    const controller = new AbortController();
    async function refresh() {
      if (!alive || pending) return;
      pending = true;
      try {
        const response = await fetch("/api/admin/todo/dashboard", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
        const json = await response.json();
        if (!response.ok || !json?.success || !Array.isArray(json?.data?.items)) throw new Error(json?.error || "Unable to load tasks.");
        if (alive) { setData(json.data); setError(""); setNow(Date.now()); }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Unable to load tasks.");
      } finally {
        pending = false;
        if (alive) setLoading(false);
      }
    }
    refreshRef.current = () => { void refresh(); };
    const visibleRefresh = () => { if (document.visibilityState === "visible") { setNow(Date.now()); void refresh(); } };
    void refresh();
    const timer = window.setInterval(visibleRefresh, 60000);
    window.addEventListener("focus", visibleRefresh);
    window.addEventListener("landview:todo:changed", visibleRefresh);
    return () => { alive = false; controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", visibleRefresh); window.removeEventListener("landview:todo:changed", visibleRefresh); };
  }, []);
  const open = (data?.items || []).filter(item => item.status !== "Done");
  const day = localDay(now);
  const overdue = (t: TodayTask) => taskDeadline(t) < now;
  const dueToday = (t: TodayTask) => t.dueDate === day;
  const unassigned = (t: TodayTask) => !t.assignedEmployeeId;
  const important = (t: TodayTask) => overdue(t) || dueToday(t) || t.priority === "Urgent" || t.priority === "High" || unassigned(t) || t.workflowMissing || t.workflowMismatch || Boolean(t.dependencyBlocker) || t.reviewState === "submitted";
  const predicates: Record<Focus, (task: TodayTask) => boolean> = {
    attention: important, overdue, today: dueToday, progress: t => t.status === "In Progress", unassigned, blocked: t => Boolean(t.dependencyBlocker), review: t => t.reviewRequired === true && t.reviewState === "submitted",
  };
  const metrics: { id: Focus; label: string; value: number }[] = [
    { id: "overdue", label: "Overdue", value: open.filter(overdue).length },
    { id: "today", label: "Due today", value: open.filter(dueToday).length },
    { id: "progress", label: "In progress", value: open.filter(t => t.status === "In Progress").length },
    { id: "unassigned", label: "Unassigned", value: open.filter(unassigned).length },
    { id: "blocked", label: "Blocked", value: open.filter(t => t.dependencyBlocker).length },
    { id: "review", label: "For review", value: open.filter(predicates.review).length },
  ];
  const rank = (t: TodayTask) => t.priority === "Urgent" ? 0 : t.priority === "High" ? 1 : t.priority === "Normal" ? 2 : 3;
  const queue = open.filter(predicates[focus]).sort((a,b) => Number(overdue(b)) - Number(overdue(a)) || rank(a) - rank(b) || taskDeadline(a) - taskDeadline(b) || a.todoCode.localeCompare(b.todoCode));
  const schedule = open.filter(dueToday).sort((a,b) => taskDeadline(a) - taskDeadline(b) || a.todoCode.localeCompare(b.todoCode));
  const choose = (next: Focus) => { setFocus(next); setLimit(20); };
  const date = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  const taskRow = (task: TodayTask) => <button className="wm-task" key={task.todoCode} type="button" onClick={() => onOpen(task.todoCode)}>
    <span className="wm-task-main"><strong>{task.title}</strong><span>{[task.projectCode || task.proposalCode || "Office", task.workflowService, task.employeeName || task.assignedTo || "Unassigned"].filter(Boolean).join(" · ")}</span></span>
    <span className="wm-task-meta"><strong className={overdue(task) ? "wm-danger" : ""}>{overdue(task) ? "Overdue · " : ""}{taskDueLabel(task)}</strong><span>{task.dependencyBlocker || (task.reviewRequired && task.reviewState === "submitted" ? "Awaiting management review" : task.reviewState === "revision_requested" ? "Revision requested" : task.reviewState === "approved" ? "Approved · ready to complete" : task.workflowMissing || task.workflowMismatch ? "Workflow needs attention" : task.deliveryStep ? "Payment verification required" : task.priority + " · " + task.status)}</span></span>
    <span aria-hidden="true">›</span>
  </button>;
  return <section className="wm-today" aria-label="Today's work">
    <div className="wm-hero"><div><h2>Today</h2><p>{date} · Dhaka time</p></div><button className="wm-secondary" type="button" onClick={() => refreshRef.current()}>Refresh</button></div>
    {error && <p role="alert" className="wm-message">{error}{data ? " Showing the last successful refresh." : ""}</p>}
    {data?.truncated && <p role="status" className="wm-message">The dashboard response is limited. Counts and lists below are based on the returned tasks, not the complete database.</p>}
    {loading && !data ? <LoadingPanel /> : !data ? <p className="wm-empty">Tasks could not be loaded. Refresh to try again.</p> : <>
      <div className="wm-metrics">{metrics.map(metric => <button type="button" aria-pressed={focus === metric.id} key={metric.id} onClick={() => choose(metric.id)} className="wm-metric"><span>{metric.label}</span><strong className={metric.id === "overdue" && metric.value ? "wm-danger" : ""}>{metric.value}</strong></button>)}</div>
      <div className="wm-columns"><div className="wm-panel"><div className="wm-panel-head"><div><h3>{FOCUS_LABELS[focus]} <span>({queue.length})</span></h3><p>Open a task to manage the original assignment.</p></div>{focus !== "attention" && <button type="button" className="wm-secondary" onClick={() => choose("attention")}>Reset</button>}</div>
        {queue.length ? queue.slice(0,limit).map(taskRow) : <p className="wm-empty">No tasks in this view.</p>}
        {queue.length > limit && <button className="wm-secondary wm-more" type="button" onClick={() => setLimit(n => n + 20)}>Show more</button>}
        <button className="wm-secondary wm-more" type="button" onClick={onAll}>View all tasks</button>
      </div><div className="wm-panel"><div className="wm-panel-head"><div><h3>Today's deadlines <span>({schedule.length})</span></h3><p>Ordered by due time.</p></div></div>
        {schedule.length ? schedule.slice(0,12).map(taskRow) : <p className="wm-empty">No open deadlines today.</p>}
        {schedule.length > 12 && <button type="button" className="wm-secondary wm-more" onClick={() => choose("today")}>See all today's deadlines</button>}
      </div></div>
    </>}
  </section>;
}

const CSS = [
  ".tws-page{width:100%;min-width:0;padding:0 0 32px;color:var(--lv-text-primary)}",
  ".tws-page *{box-sizing:border-box}",
  ".tws-head{margin:18px 28px 0;padding:20px 22px;border:1px solid var(--lv-border-default);border-radius:16px;background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm)}",
  ".tws-header-row{display:flex;align-items:flex-start;justify-content:space-between;gap:18px}",
  ".tws-eyebrow{font-size:10px;letter-spacing:.1em;text-transform:uppercase;font-weight:900;color:var(--lv-brand-primary)}",
  ".tws-head h1{font-size:clamp(24px,2.4vw,34px);line-height:1.15;letter-spacing:-.035em;margin:7px 0 6px;font-weight:900}",
  ".tws-head p{font-size:12px;color:var(--lv-text-secondary);line-height:1.55;margin:0;max-width:730px}",
  ".tws-primary{display:inline-flex;gap:8px;align-items:center;justify-content:center;min-height:38px;padding:8px 14px;white-space:nowrap;cursor:pointer;background:var(--lv-brand-primary);border:1px solid var(--lv-brand-border);border-radius:9px;color:var(--lv-text-inverse);font-size:11px;font-weight:850}",
  ".tws-primary:focus-visible,.tws-tab:focus-visible,.tws-subtab:focus-visible{outline:2px solid var(--lv-brand-primary);outline-offset:3px}",
  ".tws-nav-wrap{margin-top:19px;padding-top:14px;border-top:1px solid var(--lv-border-subtle)}",
  ".tws-nav{display:flex;gap:6px;align-items:stretch;overflow-x:auto;padding:1px 1px 8px;scrollbar-width:thin;scroll-snap-type:x proximity}",
  ".tws-tab{display:flex;flex:1 0 0;min-width:116px;flex-direction:column;align-items:flex-start;text-align:left;gap:5px;border:1px solid transparent;border-radius:11px;padding:12px 13px;background:transparent;color:var(--lv-text-primary);cursor:pointer;scroll-snap-align:start}",
  ".tws-tab:hover{background:var(--lv-surface-muted);border-color:var(--lv-border-subtle)}",
  ".tws-tab[aria-selected=true]{background:var(--lv-surface-muted);border-color:var(--lv-brand-border);box-shadow:inset 0 3px 0 var(--lv-brand-primary)}",
  ".tws-tab b{font-size:12px;font-weight:900;line-height:1.25;white-space:nowrap}",
  ".tws-tab span{font-size:10px;color:var(--lv-text-muted);line-height:1.35;white-space:nowrap}",
  ".tws-view-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:15px 28px 0;padding:0 4px}",
  ".tws-view-head b{font-size:12px;font-weight:900}.tws-view-head span{font-size:11px;color:var(--lv-text-muted);line-height:1.4}",
  ".tws-subnav{display:flex;gap:6px;margin:14px 28px 0;padding:7px;border:1px solid var(--lv-border-default);border-radius:12px;background:var(--lv-surface-muted);overflow-x:auto;scrollbar-width:thin}",
  ".tws-subtab{min-height:38px;white-space:nowrap;border:1px solid transparent;padding:7px 14px;border-radius:9px;background:transparent;color:var(--lv-text-secondary);font-size:11px;font-weight:850;cursor:pointer}",
  ".tws-subtab:hover{color:var(--lv-text-primary)}.tws-subtab[aria-selected=true]{background:var(--lv-surface-panel);color:var(--lv-text-primary);border-color:var(--lv-border-subtle);box-shadow:var(--lv-shadow-sm)}",
  ".tws-panel{min-width:0;outline:none}.tws-loading{display:flex;align-items:center;gap:9px;margin:18px 28px;border:1px solid var(--lv-border-subtle);border-radius:11px;background:var(--lv-surface-muted);padding:20px;color:var(--lv-text-secondary);font-size:11px}",
  ".tws-loading-dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:var(--lv-brand-primary)}",
  ".wm-today{margin:16px 28px;color:var(--lv-text-primary);min-width:0}.wm-hero,.wm-panel-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.wm-hero{margin-bottom:14px}.wm-hero h2{font-size:26px;letter-spacing:-.03em;margin:0}.wm-hero p,.wm-panel-head p{color:var(--lv-text-secondary);font-size:13px;margin:5px 0 0}.wm-secondary{min-height:38px;padding:8px 12px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-panel);color:var(--lv-text-primary);font-size:12px;font-weight:700;cursor:pointer}.wm-secondary:hover,.wm-secondary:focus-visible{border-color:var(--lv-brand-primary)}",
  ".wm-metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;margin-bottom:16px}.wm-metric{background:var(--lv-surface-panel);border:1px solid var(--lv-border-default);border-radius:12px;padding:16px;text-align:left;color:var(--lv-text-primary);cursor:pointer;min-height:94px}.wm-metric[aria-pressed=true]{border-color:var(--lv-brand-primary);box-shadow:inset 0 0 0 1px var(--lv-brand-primary)}.wm-metric span{display:block;font-size:13px;color:var(--lv-text-secondary);font-weight:650}.wm-metric strong{display:block;font-size:30px;margin-top:7px;line-height:1.1}.wm-danger{color:var(--lv-danger)!important}",
  ".wm-columns{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:14px;align-items:start}.wm-panel{border:1px solid var(--lv-border-default);background:var(--lv-surface-panel);border-radius:12px;padding:16px;min-width:0}.wm-panel-head{margin-bottom:12px;align-items:flex-start}.wm-panel-head h3{font-size:16px;margin:0}.wm-panel-head h3 span{color:var(--lv-text-muted);font-size:13px}.wm-task{display:flex;align-items:center;gap:12px;width:100%;min-width:0;text-align:left;padding:13px 4px;border:0;border-top:1px solid var(--lv-border-subtle);background:transparent;color:var(--lv-text-primary);cursor:pointer}.wm-task:hover,.wm-task:focus-visible{background:var(--lv-surface-muted)}.wm-task-main{flex:1;min-width:0}.wm-task strong,.wm-task span span{display:block;overflow-wrap:anywhere}.wm-task strong{font-size:14px;font-weight:700}.wm-task span span{font-size:12px;color:var(--lv-text-secondary);margin-top:5px}.wm-task-meta{text-align:right;max-width:40%}.wm-task-meta strong{font-size:12px}.wm-more{margin-top:12px;margin-right:8px}.wm-empty,.wm-message{padding:14px;background:var(--lv-surface-muted);border-radius:8px;font-size:13px;color:var(--lv-text-secondary);line-height:1.5}",
  ".wm-tools{position:relative;min-width:110px;flex:0 0 auto}.wm-tools summary{list-style:none;cursor:pointer;padding:12px 14px;border:1px solid var(--lv-border-default);border-radius:9px;color:var(--lv-text-primary);font-size:13px;font-weight:700;background:var(--lv-surface-panel)}.wm-tools summary::-webkit-details-marker{display:none}.wm-tools[open] .wm-tools-menu{display:grid}.wm-tools-menu{display:none;gap:4px;padding:6px;margin-top:6px;border:1px solid var(--lv-border-default);border-radius:9px;background:var(--lv-surface-panel)}.wm-tools-menu button{text-align:left;border:0;background:transparent;color:var(--lv-text-primary);border-radius:6px;padding:9px;font-size:12px;cursor:pointer}.wm-tools-menu button:hover,.wm-tools-menu button[aria-current=true]{background:var(--lv-surface-muted);color:var(--lv-brand-primary)}.tws-main-navigation{display:flex;align-items:flex-start;gap:10px}.tws-main-navigation .tws-nav{flex:1;min-width:0}.tws-tab b{font-size:14px}.tws-tab span{font-size:11px}.tws-head p,.tws-view-head span{font-size:13px}.tws-primary{font-size:13px;min-height:42px}",
  "@media(max-width:850px){.wm-columns{grid-template-columns:1fr}.tws-main-navigation{flex-wrap:wrap}.wm-tools{width:100%}.wm-tools-menu{grid-template-columns:repeat(2,minmax(0,1fr))}}",
  "@media(max-width:650px){.wm-today{margin:14px 12px}.wm-metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.wm-panel{padding:12px}.wm-task{gap:8px}.wm-task-meta{max-width:42%}.wm-hero h2{font-size:22px}.tws-main-navigation .tws-nav{flex-basis:100%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));overflow:visible}.tws-main-navigation .tws-tab{min-width:0;white-space:normal}.tws-main-navigation .tws-tab b{font-size:13px}}",
  ".tws-footer{margin:18px 28px 0;border-top:1px solid var(--lv-border-subtle);padding:13px 4px;color:var(--lv-text-muted);font-size:10px;line-height:1.45}",
  "@media(max-width:1000px){.tws-tab{flex:0 0 auto;min-width:136px}.tws-header-row{align-items:center}}",
  "@media(max-width:650px){.tws-head{margin:12px 12px 0;padding:16px}.tws-header-row{flex-direction:column;align-items:stretch;gap:12px}.tws-primary{align-self:flex-start}.tws-nav-wrap{margin-top:13px;padding-top:10px}.tws-tab{min-width:129px;padding:10px 12px}.tws-tab b{font-size:11px}.tws-tab span{font-size:9px}.tws-view-head{margin:13px 12px 0;display:block}.tws-view-head span{display:block;margin-top:4px}.tws-subnav{margin:12px 12px 0}.tws-loading{margin:12px}.tws-footer{margin:18px 12px 0}}",
].join("");

export default function AdminTodoWorkspace() {
  const [navigation, setNavigation] = useState<Navigation>({ tab: "overview", view: "" });
  const navRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const toolsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const sync = () => setNavigation(navigationFromHash());
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  function navigate(tab: Tab, view: View | "" = defaultView(tab)) {
    setNavigation({ tab, view });
    if (toolsRef.current) toolsRef.current.open = false;
    const desired = locationHash(tab, view);
    if (window.location.hash !== desired) window.location.hash = desired;
    window.requestAnimationFrame(() => navRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function newTodo() {
    if (navigation.tab === "board") {
      const desired = locationHash("board", "");
      if (!workScopeFromHash(window.location.hash) && window.location.hash !== desired) window.location.hash = desired;
      window.dispatchEvent(new Event("landview:todo:new"));
    } else {
      navigate("board", "");
    }
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % PRIMARY_TABS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + PRIMARY_TABS.length) % PRIMARY_TABS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = PRIMARY_TABS.length - 1;
    else return;
    event.preventDefault();
    navigate(PRIMARY_TABS[next]);
    tabRefs.current[next]?.focus();
  }

  const detail = TABS.find((tab) => tab.id === navigation.tab) || TABS[0];
  const views = SUBTABS[navigation.tab];
  const selectedView = views.find((view) => view.id === navigation.view) || views[0];
  const selectedLabel = selectedView ? selectedView.label : detail.label;

  return <div className="tws-page">
    <style>{CSS}</style>
    <div className="tws-head" ref={navRef}>
      <div className="tws-header-row">
        <div>
          <div className="tws-eyebrow">LAND VIEW · MANAGEMENT WORKSPACE</div>
          <h1>Work Management</h1>
          <p>Focus on deadlines, assignments and team priorities. Advanced tools remain available when you need them.</p>
        </div>
        <button className="tws-primary" type="button" onClick={newTodo}>+ New Task</button>
      </div>
      <div className="tws-nav-wrap tws-main-navigation">
        <div className="tws-nav" role="tablist" aria-label="To Do management sections">
          {TABS.filter(tab => PRIMARY_TABS.includes(tab.id)).map((tab, index) => <button
            key={tab.id}
            id={"tws-tab-" + tab.id}
            ref={(element) => { tabRefs.current[index] = element; }}
            role="tab"
            aria-selected={navigation.tab === tab.id}
            aria-controls="tws-current-panel"
            tabIndex={navigation.tab === tab.id || (!PRIMARY_TABS.includes(navigation.tab) && index === 0) ? 0 : -1}
            type="button"
            className="tws-tab"
            onClick={() => navigate(tab.id)}
            onKeyDown={(event) => onTabKeyDown(event, index)}
          >
            <b>{tab.label}</b>
            <span>{tab.subtitle}</span>
          </button>)}
        </div>
        <details className="wm-tools" ref={toolsRef}><summary>{TOOLS.includes(navigation.tab) ? detail.label : "More tools"} ▾</summary><div className="wm-tools-menu">{TABS.filter(tab => TOOLS.includes(tab.id)).map(tab => <button type="button" key={tab.id} aria-current={navigation.tab === tab.id} onClick={() => navigate(tab.id)}>{tab.label}</button>)}</div></details>
      </div>
    </div>
    {views.length > 0 ? <div className="tws-subnav" role="tablist" aria-label={detail.label + " tools"}>
      {views.map((view, index) => <button key={view.id}
        id={"tws-view-" + view.id}
        type="button"
        role="tab"
        aria-selected={navigation.view === view.id}
        aria-controls="tws-current-panel"
        className="tws-subtab"
        tabIndex={navigation.view === view.id ? 0 : -1}
        onClick={() => navigate(navigation.tab, view.id)}
        onKeyDown={(event) => {
          let next = index;
          if (event.key === "ArrowRight") next = (index + 1) % views.length;
          else if (event.key === "ArrowLeft") next = (index - 1 + views.length) % views.length;
          else if (event.key === "Home") next = 0;
          else if (event.key === "End") next = views.length - 1;
          else return;
          event.preventDefault();
          navigate(navigation.tab, views[next].id);
          (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
        }}
      >{view.label}</button>)}
    </div> : null}
    <div className="tws-view-head" aria-live="polite">
      <b>{selectedLabel}</b>
      <span>{selectedView?.description || detail.description}</span>
    </div>
    <section
      id="tws-current-panel"
      className="tws-panel"
      role="tabpanel"
      aria-labelledby={selectedView ? "tws-view-" + selectedView.id : PRIMARY_TABS.includes(navigation.tab) ? "tws-tab-" + navigation.tab : undefined}
      aria-label={TOOLS.includes(navigation.tab) && !selectedView ? detail.label : undefined}
      tabIndex={0}
    >
      {navigation.tab === "overview" && <Today onOpen={(code) => { window.location.hash = "#todo=" + encodeURIComponent(code); }} onAll={() => navigate("board")} />}
      {navigation.tab === "analytics" && <Analytics />}
      {navigation.tab === "board" && <Board />}
      {navigation.tab === "calendar" && <Calendar />}
      {navigation.tab === "workflow" && <Workflow />}
      {navigation.tab === "collaboration" && navigation.view === "checklist" && <Checklist mode="admin" />}
      {navigation.tab === "collaboration" && navigation.view === "files" && <Collaboration mode="admin" />}
      {navigation.tab === "planning" && navigation.view === "templates" && <Templates />}
      {navigation.tab === "planning" && navigation.view === "rules" && <Rules />}
      {navigation.tab === "planning" && navigation.view === "reminders" && <Reminders />}
      {navigation.tab === "management" && navigation.view === "intelligence" && <Intelligence />}
      {navigation.tab === "management" && navigation.view === "workload" && <Workload />}
      {navigation.tab === "management" && navigation.view === "alerts" && <Alerts />}
      {navigation.tab === "reports" && <Reports />}
    </section>
    <p className="tws-footer">
      Each section uses the existing LAND VIEW records and management permissions. Task links open the correct item in the To Do Board; Workflow changes remain explicit actions.
    </p>
  </div>;
}
