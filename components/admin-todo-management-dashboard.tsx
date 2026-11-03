"use client";

import { useEffect, useMemo, useState } from "react";

type Status = "To Do" | "In Progress" | "Done";
type Filter = "Open" | "All" | "Overdue" | "Due Today" | "Upcoming" | "High Priority" | "Unassigned" | "No Deadline" | "Stale" | "Workflow" | "Completed" | "Completed This Week";
type Task = {
  id: string; todoCode: string; title: string; status: Status; priority: string;
  dueDate: string; dueTime: string; createdAt: string; updatedAt: string; completedAt: string;
  assignedEmployeeId: string; assignedTo: string; employeeName: string; employeeCode: string;
  projectCode: string; proposalCode: string; workflowId: string; workflowService: string; workflowStatus: string;
  workflowFinal: boolean; workflowMissing: boolean; workflowMismatch: boolean; referenceType: string;
  checklist: { total: number; completed: number };
};
type Employee = { id: string; code: string; name: string; designation: string; status: string };
type Payload = { items: Task[]; employees: Employee[]; totalTasks: number; totalSubtasks: number; truncated: boolean; refreshedAt: string };
type Summary = {
  open: number; overdue: number; today: number; upcoming: number; high: number; unassigned: number;
  noDeadline: number; stale: number; workflow: number; completedWeek: number; completedPeriod: number;
  createdPeriod: number; cohortDone: number; cohortRate: number;
};
const FILTERS: Filter[] = ["Open", "All", "Overdue", "Due Today", "Upcoming", "High Priority", "Unassigned", "No Deadline", "Stale", "Workflow", "Completed", "Completed This Week"];
const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {timeZone:"Asia/Dhaka",day:"2-digit",month:"short",year:"numeric"});
const CLOCK_FORMAT = new Intl.DateTimeFormat("en-GB", {timeZone:"Asia/Dhaka",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",hour12:true});
const EMPTY: Payload = {items:[],employees:[],totalTasks:0,totalSubtasks:0,truncated:false,refreshedAt:""};
const DAY = 86400000;
function text(v: unknown) { return String(v ?? "").trim(); }
function instant(v: string) { const t = Date.parse(v); return Number.isFinite(t) ? t : 0; }
function bangladeshDay(ms: number) { return new Date(ms + 21600000).toISOString().slice(0,10); }
function nextDay(day: string, offset: number) { return new Date(Date.parse(day+"T00:00:00Z")+offset*DAY).toISOString().slice(0,10); }
function deadline(task: Task) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)) return null;
  const time = /^([01]\d|2[0-3]):[0-5]\d/.test(task.dueTime) ? task.dueTime.slice(0,5)+":00" : "23:59:59";
  const ms = Date.parse(task.dueDate+"T"+time+"+06:00");
  return Number.isFinite(ms) ? ms : null;
}
function dateLabel(date: string) { const ms = Date.parse(date+"T00:00:00+06:00"); return Number.isFinite(ms)?DATE_FORMAT.format(new Date(ms)):"—"; }
function dueLabel(task: Task) {
  const ms=deadline(task);
  if (ms===null) return "No deadline";
  return task.dueTime?CLOCK_FORMAT.format(new Date(ms)) : dateLabel(task.dueDate);
}
function priorityRank(priority: string) { return priority==="Urgent"?0:priority==="High"?1:priority==="Normal"?2:3; }
function onTime(task: Task) { const due=deadline(task); return due!==null && instant(task.completedAt)>0 && instant(task.completedAt)<=due; }
function percent(value: number, total: number) { return total?Math.round(100*value/total):0; }
function weekStart(now: number) {
  const day = bangladeshDay(now);
  const weekday = new Date(day+"T00:00:00Z").getUTCDay();
  return Date.parse(nextDay(day,-(weekday===0?6:weekday-1))+"T00:00:00+06:00");
}
function classify(task: Task, now: number, today: string, windowStart: number): Record<Filter, boolean> {
  const open = task.status!=="Done";
  const due=deadline(task);
  return {
    "Open":open,
    "All":true,
    "Overdue":open && due!==null && due<now,
    "Due Today":open && task.dueDate===today,
    "Upcoming":open && task.dueDate>today && task.dueDate<=nextDay(today,7),
    "High Priority":open && (task.priority==="High"||task.priority==="Urgent"),
    "Unassigned":open && !task.assignedEmployeeId,
    "No Deadline":open && due===null,
    "Stale":open && task.status==="In Progress" && instant(task.updatedAt)>0 && instant(task.updatedAt)<now-7*DAY,
    "Workflow":Boolean(task.workflowId) && (task.workflowMissing || task.workflowMismatch),
    "Completed":task.status==="Done" && instant(task.completedAt)>=windowStart,
    "Completed This Week":task.status==="Done" && instant(task.completedAt)>=weekStart(now),
  };
}
async function api(): Promise<Payload> {
  const response = await fetch("/api/admin/todo/dashboard", {credentials:"same-origin",cache:"no-store"});
  const body = await response.json().catch(()=>null);
  if (!response.ok || !body?.success) throw new Error(String(body?.error||"Could not load To Do dashboard."));
  return body.data as Payload;
}
function viewTask(code: string) {
  const hash="#todo="+encodeURIComponent(code);
  if (window.location.hash!==hash) window.location.hash=hash;
  else window.dispatchEvent(new CustomEvent("landview:todo:open", {detail:{todoCode:code}}));
}
const CSS = [
  ".td-shell{margin:20px 28px 0;border:1px solid var(--lv-border-default);border-radius:17px;background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm);color:var(--lv-text-primary);overflow:hidden}.td-shell *{box-sizing:border-box}",
  ".td-head{padding:20px 22px;display:flex;justify-content:space-between;gap:14px;align-items:flex-start;border-bottom:1px solid var(--lv-border-default);background:var(--lv-surface-muted)}",
  ".td-eyebrow{font-size:9px;letter-spacing:.11em;font-weight:950;text-transform:uppercase;color:var(--lv-brand-primary)}.td-head h2{font-size:22px;margin:5px 0 3px;line-height:1.2}.td-head p{font-size:11px;color:var(--lv-text-secondary);max-width:720px;line-height:1.5;margin:0}",
  ".td-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.td-btn{border:1px solid var(--lv-border-default);border-radius:9px;min-height:35px;padding:0 12px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:10px;font-weight:850;cursor:pointer}.td-btn:disabled{opacity:.5;cursor:default}",
  ".td-chip{font-size:9px;color:var(--lv-text-muted);font-weight:700}.td-msg{padding:11px 17px;margin:10px 16px 0;font-size:11px;border-radius:9px;background:var(--lv-surface-muted)}.td-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}",
  ".td-body{padding:18px}.td-metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px}.td-metric{text-align:left;border:1px solid var(--lv-border-subtle);background:var(--lv-surface-muted);color:var(--lv-text-primary);border-radius:12px;padding:13px;cursor:pointer;min-height:96px;display:flex;flex-direction:column;gap:6px}.td-metric.selected{border-color:var(--lv-brand-border);box-shadow:0 0 0 1px var(--lv-brand-border)}",
  ".td-metric span{font-size:9px;letter-spacing:.04em;text-transform:uppercase;color:var(--lv-text-secondary);font-weight:900}.td-metric strong{font-size:28px;line-height:1.1;letter-spacing:-.03em}.td-metric small{font-size:9px;color:var(--lv-text-muted);line-height:1.3}.td-metric.danger strong{color:var(--lv-danger)}",
  ".td-analytics{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,.7fr);gap:12px;margin-top:13px}.td-panel{border:1px solid var(--lv-border-subtle);border-radius:12px;padding:15px;min-width:0;background:var(--lv-surface-panel)}.td-heading{display:flex;justify-content:space-between;gap:10px;align-items:start;margin-bottom:12px}.td-heading h3{font-size:13px;margin:0}.td-heading p{font-size:10px;line-height:1.5;margin:5px 0 0;color:var(--lv-text-muted)}",
  ".td-range{display:inline-flex;gap:2px;border:1px solid var(--lv-border-default);border-radius:8px;padding:3px;background:var(--lv-surface-muted)}.td-range button{border:0;background:transparent;color:var(--lv-text-secondary);font-size:10px;font-weight:850;cursor:pointer;padding:6px 9px;border-radius:6px}.td-range button.active{background:var(--lv-surface-panel);color:var(--lv-text-primary);box-shadow:var(--lv-shadow-sm)}",
  ".td-chart{height:151px;display:flex;align-items:stretch;gap:7px;overflow-x:auto;padding:0 0 2px}.td-barcol{flex:1;min-width:23px;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:6px}.td-bars{display:flex;align-items:flex-end;gap:3px;height:122px;width:100%;justify-content:center;border-bottom:1px solid var(--lv-border-subtle)}.td-bars i{width:min(40%,15px);min-height:2px;display:block;border-radius:4px 4px 0 0;background:var(--lv-brand-primary)}.td-bars i.done{background:var(--lv-success)}.td-barcol span{font-size:8px;color:var(--lv-text-muted);white-space:nowrap}",
  ".td-legend{display:flex;gap:13px;margin-top:10px;font-size:9px;color:var(--lv-text-muted)}.td-legend b{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px;background:var(--lv-brand-primary)}.td-legend b.done{background:var(--lv-success)}",
  ".td-quick{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.td-quick div{border:1px solid var(--lv-border-subtle);border-radius:9px;padding:11px;background:var(--lv-surface-muted)}.td-quick strong{font-size:21px;display:block}.td-quick span{font-size:10px;color:var(--lv-text-secondary);display:block;margin-top:5px}.td-quick small{display:block;font-size:9px;color:var(--lv-text-muted);margin-top:3px}",
  ".td-section{margin-top:16px}.td-tablewrap{overflow-x:auto}.td-table{border-collapse:collapse;width:100%;font-size:10px}.td-table th{font-size:9px;text-align:left;text-transform:uppercase;letter-spacing:.04em;color:var(--lv-text-muted);background:var(--lv-surface-muted);padding:11px 9px;white-space:nowrap}.td-table td{border-top:1px solid var(--lv-border-subtle);padding:10px 9px}.td-table tr:hover td{background:var(--lv-surface-muted)}.td-table button{border:0;background:none;padding:0;color:var(--lv-brand-primary);font-size:10px;font-weight:900;text-align:left;cursor:pointer}.td-person{font-weight:900}.td-small{display:block;font-size:9px;color:var(--lv-text-muted);margin-top:4px}",
  ".td-bottlenecks{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.td-bottleneck{border:1px solid var(--lv-border-subtle);border-radius:10px;background:var(--lv-surface-muted);color:var(--lv-text-primary);text-align:left;padding:12px;cursor:pointer}.td-bottleneck strong{font-size:23px;display:block}.td-bottleneck span{font-size:10px;font-weight:850;display:block;margin-top:5px}.td-bottleneck small{font-size:9px;color:var(--lv-text-muted);line-height:1.45;display:block;margin-top:5px}",
  ".td-controls{display:grid;grid-template-columns:140px minmax(160px,1fr) minmax(170px,1.3fr);gap:9px;margin:0 0 10px}.td-controls select,.td-controls input{min-height:36px;width:100%;padding:6px 9px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:11px}",
  ".td-queue{display:grid;gap:8px;max-height:520px;overflow:auto}.td-task{width:100%;text-align:left;border:1px solid var(--lv-border-subtle);border-radius:9px;padding:11px 12px;background:var(--lv-surface-panel);color:var(--lv-text-primary);cursor:pointer;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px}.td-task:hover{border-color:var(--lv-brand-border)}.td-task strong{font-size:11px;display:block}.td-task span{font-size:9px;color:var(--lv-text-secondary);display:block;margin-top:5px;line-height:1.4}.td-task .right{text-align:right;min-width:100px}.td-task small{font-size:9px;font-weight:850;color:var(--lv-text-muted);display:block}.td-task .late{color:var(--lv-danger)}",
  ".td-empty{font-size:11px;color:var(--lv-text-muted);padding:20px;text-align:center;border:1px dashed var(--lv-border-default);border-radius:9px}.td-foot{font-size:9px;color:var(--lv-text-muted);margin-top:10px;line-height:1.4}",
  "@media(max-width:1200px){.td-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.td-bottlenecks{grid-template-columns:repeat(3,minmax(0,1fr))}}",
  "@media(max-width:850px){.td-analytics{grid-template-columns:1fr}.td-head{flex-direction:column}.td-bottlenecks{grid-template-columns:repeat(2,minmax(0,1fr))}}",
  "@media(max-width:560px){.td-shell{margin:14px 12px 0}.td-body{padding:12px}.td-head{padding:15px}.td-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.td-metric{min-height:84px}.td-metric strong{font-size:23px}.td-controls{grid-template-columns:1fr}.td-bottlenecks{grid-template-columns:1fr 1fr}.td-task{grid-template-columns:1fr}.td-task .right{text-align:left}.td-quick{grid-template-columns:repeat(2,minmax(0,1fr))}}",
].join("");

export default function AdminTodoManagementDashboard() {
  const [data,setData] = useState<Payload>(EMPTY);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [range,setRange] = useState<7|30|90>(30);
  const [filter,setFilter] = useState<Filter>("Open");
  const [employee,setEmployee] = useState("");
  const [query,setQuery] = useState("");
  const [now,setNow] = useState(Date.now());

  async function load(silent=false) {
    if (!silent) setLoading(true);
    if (!silent) setError("");
    try { const next = await api(); setData(next); setNow(Date.now()); }
    catch (e) { setError(e instanceof Error?e.message:"Dashboard request failed."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    void load();
    const refresh = () => { setNow(Date.now()); if (document.visibilityState==="visible") void load(true); };
    const interval = window.setInterval(refresh,60000);
    window.addEventListener("focus",refresh);
    return () => { window.clearInterval(interval); window.removeEventListener("focus",refresh); };
  }, []);

  const items = data.items || [];
  const today = bangladeshDay(now);
  const windowStart = now-range*DAY;
  const monday = weekStart(now);
  const summary: Summary = useMemo(() => {
    const open = items.filter((task)=>task.status!=="Done");
    const due = open.filter((task)=>{const due=deadline(task);return due!==null&&due<now;});
    const created = items.filter((task)=>instant(task.createdAt)>=windowStart);
    const completed = items.filter((task)=>task.status==="Done"&&instant(task.completedAt)>=windowStart);
    return {
      open:open.length, overdue:due.length,
      today:open.filter((task)=>task.dueDate===today).length,
      upcoming:open.filter((task)=>task.dueDate>today&&task.dueDate<=nextDay(today,7)).length,
      high:open.filter((task)=>task.priority==="High"||task.priority==="Urgent").length,
      unassigned:open.filter((task)=>!task.assignedEmployeeId).length,
      noDeadline:open.filter((task)=>deadline(task)===null).length,
      stale:open.filter((task)=>task.status==="In Progress"&&instant(task.updatedAt)>0&&instant(task.updatedAt)<now-7*DAY).length,
      workflow:items.filter((task)=>Boolean(task.workflowId)&&(task.workflowMismatch||task.workflowMissing)).length,
      completedWeek:items.filter((task)=>task.status==="Done"&&instant(task.completedAt)>=monday).length,
      completedPeriod:completed.length,
      createdPeriod:created.length,
      cohortDone:created.filter((task)=>task.status==="Done").length,
      cohortRate:percent(created.filter((task)=>task.status==="Done").length,created.length),
    };
  },[items,now,range,today,windowStart,monday]);

  const trends = useMemo(() => {
    const days = Math.min(14,range);
    return Array.from({length:days},(_,i)=>{
      const date=nextDay(today,i-(days-1));
      return {date,label:date.slice(5),created:items.filter((task)=>instant(task.createdAt)>0&&bangladeshDay(instant(task.createdAt))===date).length,
        completed:items.filter((task)=>task.status==="Done"&&instant(task.completedAt)>0&&bangladeshDay(instant(task.completedAt))===date).length};
    });
  },[items,range,today]);
  const trendMax=Math.max(1,...trends.map((t)=>Math.max(t.created,t.completed)));

  const people = useMemo(() => {
    const allocated = new Set(items.map((task)=>task.assignedEmployeeId).filter(Boolean));
    const staff = data.employees.filter((p)=>p.status.toLowerCase()==="active"||allocated.has(p.id)).map((p)=>{
      const own=items.filter((task)=>task.assignedEmployeeId===p.id);
      const open=own.filter((task)=>task.status!=="Done");
      const done=own.filter((task)=>task.status==="Done"&&instant(task.completedAt)>=windowStart);
      const finishedDue=own.filter((task)=>task.status==="Done"&&deadline(task)!==null&&instant(task.completedAt)>0);
      return {...p,assigned:own.length,open:open.length,overdue:open.filter((task)=>{const due=deadline(task);return due!==null&&due<now;}).length,
        high:open.filter((task)=>task.priority==="High"||task.priority==="Urgent").length,
        donePeriod:done.length,onTime:finishedDue.length?percent(finishedDue.filter(onTime).length,finishedDue.length):null,
        dueSample:finishedDue.length};
    }).sort((a,b)=>b.overdue-a.overdue||b.open-a.open||a.code.localeCompare(b.code));
    return staff;
  },[data.employees,items,now,windowStart]);

  const taskFilters = useMemo(() => new Map(items.map((task)=>[task.todoCode,classify(task,now,today,windowStart)])),[items,now,today,windowStart]);
  const visible = useMemo(() => {
    const needle=query.trim().toLowerCase();
    const result=items.filter((task)=>{
      const matches=taskFilters.get(task.todoCode)?.[filter] ?? false;
      if (!matches) return false;
      if (employee==="__unassigned__"&&task.assignedEmployeeId) return false;
      if (employee&&employee!=="__unassigned__"&&task.assignedEmployeeId!==employee) return false;
      if (!needle) return true;
      return [task.todoCode,task.title,task.employeeName,task.employeeCode,task.projectCode,task.proposalCode,task.workflowService,task.workflowStatus,task.status,task.priority].some((v)=>v.toLowerCase().includes(needle));
    });
    return result.sort((a,b)=>{
      const aLate=taskFilters.get(a.todoCode)?.Overdue?0:1, bLate=taskFilters.get(b.todoCode)?.Overdue?0:1;
      if (aLate!==bLate) return aLate-bLate;
      const prior=priorityRank(a.priority)-priorityRank(b.priority);
      if (prior) return prior;
      return (deadline(a)??Infinity)-(deadline(b)??Infinity)||instant(b.createdAt)-instant(a.createdAt);
    });
  },[items,taskFilters,filter,employee,query]);

  function focus(next: Filter, nextEmployee?: string) {
    setFilter(next);
    if (nextEmployee!==undefined) setEmployee(nextEmployee);
    window.requestAnimationFrame(()=>document.getElementById("todo-dashboard-queue")?.scrollIntoView({behavior:"smooth",block:"start"}));
  }

  const metrics: Array<{label:string;value:number;hint:string;filter:Filter;danger?:boolean}> = [
    {label:"Open tasks",value:summary.open,hint:"Awaiting completion",filter:"Open"},
    {label:"Due today",value:summary.today,hint:"Includes today's overdue",filter:"Due Today"},
    {label:"Overdue",value:summary.overdue,hint:"Deadline has passed",filter:"Overdue",danger:true},
    {label:"High priority",value:summary.high,hint:"High & urgent open",filter:"High Priority"},
    {label:"Unassigned",value:summary.unassigned,hint:"No linked employee",filter:"Unassigned"},
    {label:"Completed this week",value:summary.completedWeek,hint:"Since Monday · Dhaka",filter:"Completed This Week"},
  ];

  return <section className="td-shell">
    <style>{CSS}</style>
    <header className="td-head">
      <div>
        <div className="td-eyebrow">LAND VIEW · MANAGEMENT INTELLIGENCE</div>
        <h2>To Do Dashboard</h2>
        <p>Live workload, deadlines, team assignments, and task bottlenecks. Task deadlines and reporting days use Bangladesh time (UTC+6).</p>
      </div>
      <div className="td-actions">
        <span className="td-chip">{data.refreshedAt?"Updated "+CLOCK_FORMAT.format(new Date(data.refreshedAt)):"Not loaded"}</span>
        <button type="button" className="td-btn" onClick={()=>void load()} disabled={loading}>{loading?"Refreshing…":"Refresh"}</button>
      </div>
    </header>
    {error&&<div className="td-msg bad" role="alert">{error}</div>}
    {data.truncated&&<div className="td-msg bad">This report reached the 10,000-record safety limit. Counts may be incomplete. Consult the database for a full historical report.</div>}
    <div className="td-body">
      <div className="td-metrics">
        {metrics.map((m)=><button type="button" className={"td-metric"+(m.danger?" danger":"")+(filter===m.filter?" selected":"")} key={m.label} onClick={()=>focus(m.filter)}>
          <span>{m.label}</span><strong>{m.value.toLocaleString()}</strong><small>{m.hint}</small>
        </button>)}
      </div>
      <div className="td-analytics">
        <article className="td-panel">
          <div className="td-heading">
            <div><h3>Task activity</h3><p>New tasks vs. completed tasks. Completion counts use actual completed timestamps.</p></div>
            <div className="td-range">{([7,30,90] as const).map((days)=><button key={days} type="button" className={range===days?"active":""} onClick={()=>setRange(days)}>{days}d</button>)}</div>
          </div>
          <div className="td-chart" role="img" aria-label={"Daily new and completed To Dos for the past "+Math.min(range,14)+" days."}>
            {trends.map((t)=><div className="td-barcol" key={t.date} title={dateLabel(t.date)+": "+t.created+" created, "+t.completed+" completed"}>
              <div className="td-bars"><i style={{height:Math.max(2,Math.round(t.created/trendMax*110))+"px"}}/><i className="done" style={{height:Math.max(2,Math.round(t.completed/trendMax*110))+"px"}}/></div>
              <span>{t.label}</span>
            </div>)}
          </div>
          <div className="td-legend"><span><b/>Created</span><span><b className="done"/>Completed</span></div>
        </article>
        <article className="td-panel">
          <div className="td-heading"><div><h3>{range}-day delivery snapshot</h3><p>Separate task throughput from completion rate for tasks created in this period.</p></div></div>
          <div className="td-quick">
            <div><strong>{summary.createdPeriod}</strong><span>Created</span><small>Past {range} days</small></div>
            <div><strong>{summary.completedPeriod}</strong><span>Completed</span><small>Finished in past {range} days</small></div>
            <div><strong>{summary.cohortRate}%</strong><span>Creation-cohort completion</span><small>{summary.cohortDone} / {summary.createdPeriod} new tasks finished</small></div>
            <div><strong>{summary.upcoming}</strong><span>Due next 7 days</span><small>Tomorrow onward</small></div>
          </div>
        </article>
      </div>

      <div className="td-section td-panel">
        <div className="td-heading"><div><h3>Where work is getting stuck</h3><p>Click any category to review the actual To Dos. Stale means In Progress with no record update for 7 days.</p></div></div>
        <div className="td-bottlenecks">
          <button className="td-bottleneck" type="button" onClick={()=>focus("Overdue")}><strong>{summary.overdue}</strong><span>Past deadline</span><small>Open tasks that missed their due date/time</small></button>
          <button className="td-bottleneck" type="button" onClick={()=>focus("Stale")}><strong>{summary.stale}</strong><span>Inactive 7+ days</span><small>In Progress tasks without recent updates</small></button>
          <button className="td-bottleneck" type="button" onClick={()=>focus("Unassigned")}><strong>{summary.unassigned}</strong><span>Needs an owner</span><small>No linked active employee record</small></button>
          <button className="td-bottleneck" type="button" onClick={()=>focus("No Deadline")}><strong>{summary.noDeadline}</strong><span>Needs a deadline</span><small>Open To Dos with no due date</small></button>
          <button className="td-bottleneck" type="button" onClick={()=>focus("Workflow")}><strong>{summary.workflow}</strong><span>Workflow discrepancy</span><small>Linked Workflow missing or final state differs</small></button>
        </div>
      </div>

      <div className="td-section td-panel">
        <div className="td-heading"><div><h3>Employee workload & outcomes</h3><p>Counts follow current task assignment; completed counts do not identify which person clicked Done. On-time rates use finished tasks that had due dates.</p></div></div>
        <div className="td-tablewrap">
          <table className="td-table"><thead><tr><th>Employee</th><th>Assigned total</th><th>Open</th><th>Overdue</th><th>High / urgent</th><th>Completed {range}d</th><th>On time</th></tr></thead>
            <tbody>
              {people.map((p)=><tr key={p.id}>
                <td><button type="button" onClick={()=>focus("All",p.id)} className="td-person">{p.code} · {p.name}</button><span className="td-small">{p.status!=="Active"?"Former · ":""}{p.designation||"Employee"}</span></td>
                <td>{p.assigned}</td><td><button type="button" onClick={()=>focus("All",p.id)}>{p.open}</button></td><td><button type="button" onClick={()=>focus("Overdue",p.id)}>{p.overdue}</button></td><td>{p.high}</td><td>{p.donePeriod}</td><td>{p.onTime===null?"—":p.onTime+"%"}<span className="td-small">{p.dueSample?p.dueSample+" with due dates":"No due-date sample"}</span></td>
              </tr>)}
              <tr><td><button type="button" className="td-person" onClick={()=>focus("Unassigned","__unassigned__")}>Unassigned</button><span className="td-small">No linked employee UUID</span></td>
                <td>{items.filter((t)=>!t.assignedEmployeeId).length}</td><td>{summary.unassigned}</td><td>{items.filter((t)=>taskFilters.get(t.todoCode)?.Overdue&&!t.assignedEmployeeId).length}</td><td>{items.filter((t)=>taskFilters.get(t.todoCode)?.["High Priority"]&&!t.assignedEmployeeId).length}</td><td>—</td><td>—</td>
              </tr>
            </tbody></table>
        </div>
        {!people.length&&<p className="td-foot">No employee records are currently available for workload statistics.</p>}
      </div>

      <div className="td-section td-panel" id="todo-dashboard-queue">
        <div className="td-heading"><div><h3>Actionable To Do queue</h3><p>Filtered tasks are sorted by overdue status, priority, then due date. Select a task to open its edit form in the To Do board below.</p></div><strong>{visible.length} task(s)</strong></div>
        <div className="td-controls">
          <select aria-label="To Do filter" value={filter} onChange={(e)=>setFilter(e.target.value as Filter)}>{FILTERS.map((name)=><option key={name} value={name}>{name}</option>)}</select>
          <select aria-label="Employee filter" value={employee} onChange={(e)=>setEmployee(e.target.value)}>
            <option value="">All employees</option><option value="__unassigned__">Unassigned only</option>
            {people.map((p)=><option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </select>
          <input type="search" aria-label="Search To Dos" placeholder="Search To Do, project, employee, workflow…" value={query} onChange={(e)=>setQuery(e.target.value)}/>
        </div>
        <div className="td-queue">
          {visible.slice(0,75).map((task)=><button type="button" key={task.todoCode} className="td-task" onClick={()=>viewTask(task.todoCode)} title={"Open "+task.todoCode+" in To Do board"}>
            <div>
              <strong>{task.title}</strong>
              <span>{task.todoCode} · {task.projectCode||task.proposalCode||"General task"} · {task.employeeCode?task.employeeCode+" · "+task.employeeName:task.employeeName||"Unassigned"}</span>
              {task.workflowId&&<span>Workflow: {task.workflowMissing?"Missing linked service":task.workflowService+" · "+task.workflowStatus}{task.workflowMismatch?" · Needs reconciliation":""}</span>}
              {task.checklist.total>0&&<span>Checklist: {task.checklist.completed} / {task.checklist.total} complete</span>}
            </div>
            <div className="right"><small>{task.priority} · {task.status}</small><span className={taskFilters.get(task.todoCode)?.Overdue?"late":""}>{dueLabel(task)}</span></div>
          </button>)}
          {!visible.length&&<div className="td-empty">{loading?"Loading To Dos…":"No To Dos match these filters."}</div>}
        </div>
        {visible.length>75&&<p className="td-foot">Showing the first 75 matching tasks. Narrow the filters or search by task code for more.</p>}
      </div>
      <p className="td-foot">All dates are interpreted in Bangladesh time (UTC+6). A date-only deadline ends at 11:59:59 PM. The employee table measures current task assignment, not individual productivity or responsibility. Data refreshes while this page is active.</p>
    </div>
  </section>;
}
