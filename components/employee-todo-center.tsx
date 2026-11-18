"use client";

import { useEffect, useMemo, useState } from "react";
import { dhakaDay, taskDeadline, needsManagement, myDay, estimateSummary } from "@/lib/work-day-policy";

type TodoStatus = "To Do" | "In Progress" | "Done";
type View = "My Day" | "My Tasks" | "Upcoming" | "Overdue" | "Review" | "Revisions" | "Blocked" | "Completed";
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
  updated_at?: string;
  estimated_minutes?: number | null;
  planned_date?: string | null;
  dependency_blocked?: boolean;
  is_delivery_step?: boolean;
  review_required?: boolean;
  review_state?: "not_submitted" | "submitted" | "revision_requested" | "approved";
  review_note?: string | null;
  review_actor?: string | null;
  review_changed_at?: string | null;
};
type EmployeeTodoData = { employee: { id: string; employeeCode: string; name: string; designation?: string }; items: TodoItem[] };


const VIEWS: View[] = ["My Day","My Tasks","Upcoming","Overdue","Review","Revisions","Blocked","Completed"];
function referenceText(t:TodoItem) {
  return [t.project_code || t.proposal_code,t.project_name || t.proposal_title,t.workflow_service].filter(Boolean).join(" · ") || "Office task";
}
function deadlineText(t:TodoItem) {
  const ms=taskDeadline(t);
  return Number.isFinite(ms)?new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Dhaka",day:"numeric",month:"short",...(t.due_time?{hour:"numeric",minute:"2-digit",hour12:true}:{})}).format(ms):"No deadline";
}
function hours(minutes:number) {return Number((minutes/60).toFixed(2))+"h";}
function statusLabel(t:TodoItem) {
  if(t.status==="Done")return "Completed";
  if(t.review_state==="submitted")return "Awaiting review";
  if(t.review_state==="approved")return "Approved · awaiting closure";
  if(t.dependency_blocked)return "Blocked by preceding work";
  if(t.review_state==="revision_requested")return "Revision requested";
  return t.status;
}
async function api(method:"GET"|"POST"="GET",body?:Record<string,unknown>,signal?:AbortSignal) {
  const r=await fetch("/api/employee/todo",{method,credentials:"same-origin",cache:"no-store",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined,signal});
  const j=await r.json().catch(()=>null);
  if(!r.ok||!j?.success)throw new Error(j?.error||"Could not load or update work.");
  return j.data;
}

export default function EmployeeTodoCenter() {
  const [data,setData]=useState<EmployeeTodoData|null>(null);
  const [view,setView]=useState<View>("My Day");
  const [query,setQuery]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [now,setNow]=useState(()=>Date.now());
  const [submitCode,setSubmitCode]=useState("");
  const [note,setNote]=useState("");
  const [planCode,setPlanCode]=useState("");
  const [planDate,setPlanDate]=useState("");
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{
    let active=true;const controller=new AbortController();
    setLoading(true);setError("");
    api("GET",undefined,controller.signal).then(result=>{if(active)setData(result);}).catch(err=>{if(active)setError(err instanceof Error?err.message:"Unable to load tasks.");}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;controller.abort();};
  },[refresh]);
  useEffect(()=>{
    const tick=()=>setNow(Date.now());
    const timer=window.setInterval(tick,60000);
    window.addEventListener("focus",tick);
    return()=>{window.clearInterval(timer);window.removeEventListener("focus",tick);};
  },[]);
  const today=dhakaDay(now);
  const items=data?.items||[];
  const open=items.filter(t=>t.status!=="Done");
  const day=open.filter(t=>myDay(t,today));
  const overdue=(t:TodoItem)=>t.status!=="Done"&&taskDeadline(t)<now;
  const review=open.filter(needsManagement);
  const revisions=open.filter(t=>t.review_state==="revision_requested");
  const blocked=open.filter(t=>t.dependency_blocked);
  const effort=estimateSummary(day);
  const counts:Record<View,number>={"My Day":day.length,"My Tasks":open.length,"Upcoming":open.filter(t=>Boolean((t.due_date&&t.due_date>today)||(t.planned_date&&t.planned_date>today))).length,"Overdue":open.filter(overdue).length,"Review":review.length,"Revisions":revisions.length,"Blocked":blocked.length,"Completed":items.length-open.length};
  const visible=useMemo(()=>{
    const needle=query.toLowerCase().trim();
    const priorities:Record<string,number>={Urgent:0,High:1,Normal:2,Low:3};
    return items.filter(t=>{
      if(view==="Completed")return t.status==="Done";
      if(t.status==="Done")return false;
      switch(view){
        case "My Day":return myDay(t,today);
        case "Upcoming":return Boolean((t.due_date&&t.due_date>today)||(t.planned_date&&t.planned_date>today));
        case "Overdue":return taskDeadline(t)<now;
        case "Review":return needsManagement(t);
        case "Revisions":return t.review_state==="revision_requested";
        case "Blocked":return Boolean(t.dependency_blocked);
        default:return true;
      }
    }).filter(t=>!needle||[t.todo_code,t.title,t.description,referenceText(t),statusLabel(t)].some(v=>String(v||"").toLowerCase().includes(needle)))
      .sort((a,b)=>Number(b.review_state==="revision_requested")-Number(a.review_state==="revision_requested")||Number(taskDeadline(b)<now)-Number(taskDeadline(a)<now)||(priorities[a.priority]??2)-(priorities[b.priority]??2)||taskDeadline(a)-taskDeadline(b)||a.title.localeCompare(b.title));
  },[items,query,view,today,now]);
  async function act(t:TodoItem,action:string,fields:Record<string,unknown>,message:string){
    if(busy)return false;
    setBusy(t.todo_code);setError("");setNotice("");
    try{
      await api("POST",{action,todoCode:t.todo_code,expectedUpdatedAt:t.updated_at,...fields});
      setNotice(message);
      try{setData(await api());}catch(err){setError("Task saved, but refresh failed. Use Refresh to reload your assignments.");}
      return true;
    }catch(err){setError(err instanceof Error?err.message:"Could not update task.");return false;}
    finally{setBusy("");}
  }
  function updateStatus(t:TodoItem,status:TodoStatus){void act(t,"updateStatus",{status},status==="Done"?"Task completed. Official workflow remains unchanged.":"Work started.");}
  async function submit(t:TodoItem){
    if(await act(t,"submitReview",{note},"Submitted for management review.")){setSubmitCode("");setNote("");}
  }
  async function schedule(t:TodoItem,date:string|null){
    if(await act(t,"planDay",{plannedDate:date},date?"Personal work date saved. Official deadline unchanged.":"Personal work date cleared.")){setPlanCode("");setPlanDate("");}
  }

  return <section className="ewm" aria-label="Employee work management">
    <style>{CSS}</style>
    <div className="ewm-head"><div><span className="ewm-eyebrow">LAND VIEW · PERSONAL WORKSPACE</span><h2>My Work</h2><p>{new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Dhaka",weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(now)} · Bangladesh time</p>{data&&<p>{data.employee.employeeCode} · {data.employee.name}</p>}</div><button type="button" disabled={loading||Boolean(busy)} onClick={()=>setRefresh(n=>n+1)}>Refresh</button></div>
    {error&&<p className="ewm-alert" role="alert">{error}</p>}{notice&&<p className="ewm-notice" role="status">{notice}</p>}
    {!data&&loading?<p className="ewm-empty">Loading your assignments…</p>:!data?<p className="ewm-empty">Work unavailable. Refresh to retry.</p>:<>
      <div className="ewm-summary"><div><span>My Day · planned effort</span><strong>{hours(effort.minutes)}</strong><p>{effort.estimated} estimated · {effort.unestimated} without estimates. Not actual hours worked.</p></div><div><span>Focus priorities</span><strong>{day.length} tasks</strong><p>Urgent, overdue, in progress, revisions and personally planned work.</p></div></div>
      <nav className="ewm-tabs" aria-label="Work views">{VIEWS.map(v=><button key={v} type="button" aria-pressed={view===v} onClick={()=>setView(v)}>{v}<span>{counts[v]}</span></button>)}</nav>
      <div className="ewm-search"><h3>{view}</h3><input aria-label="Search tasks" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search assignments…"/></div>
      <div className="ewm-list">{visible.map(t=>{
        const done=t.status==="Done", waiting=needsManagement(t), canWork=!done&&!waiting&&!t.dependency_blocked, canSubmit=canWork&&t.review_required&&t.status==="In Progress", due=overdue(t);
        return <article key={t.todo_code} className="ewm-task"><div className="ewm-task-main"><div className="ewm-tags"><span className={due?"ewm-danger":""}>{due?"Overdue":t.priority}</span><span>{statusLabel(t)}</span></div><h4>{t.title}</h4><p>{referenceText(t)} · {t.todo_code}</p>{t.description&&<details><summary>Instructions</summary><p className="ewm-body">{t.description}</p></details>}{t.review_note&&<p className="ewm-note"><strong>{t.review_state==="revision_requested"?"Revision instructions":"Review note"}:</strong> {t.review_note}</p>}{t.dependency_blocked&&<p className="ewm-note">A predecessor task must be completed before this assignment can be finished.</p>}{t.is_delivery_step&&<p className="ewm-note">Final delivery requires verified payment and existing delivery checks.</p>}</div>
          <div className="ewm-meta"><span>Official deadline <b>{deadlineText(t)}</b></span><span>Estimate <b>{t.estimated_minutes?hours(t.estimated_minutes):"Not estimated"}</b></span><span>My work date <b>{t.planned_date||"Not planned"}</b></span>{t.reminder_enabled&&<span>WhatsApp reminder enabled by management</span>}</div>
          <div className="ewm-actions">{canWork&&t.status==="To Do"&&<button className="primary" disabled={Boolean(busy)} onClick={()=>updateStatus(t,"In Progress")}>Start work</button>}{canSubmit&&<button className="primary" disabled={Boolean(busy)} onClick={()=>{setSubmitCode(t.todo_code);setNote("");setPlanCode("");}}>{t.review_state==="revision_requested"?"Resubmit":"Submit for review"}</button>}{canWork&&!t.review_required&&t.status==="In Progress"&&!t.is_delivery_step&&<button className="primary" disabled={Boolean(busy)} onClick={()=>{if(window.confirm("Mark this assignment completed?"))updateStatus(t,"Done");}}>Complete</button>}{canWork&&t.planned_date!==today&&<button disabled={Boolean(busy)} onClick={()=>void schedule(t,today)}>Add to My Day</button>}{canWork&&<button disabled={Boolean(busy)} onClick={()=>{setSubmitCode("");setPlanCode(t.todo_code);setPlanDate(t.planned_date&&t.planned_date>=today?t.planned_date:today);}}>Plan date</button>}{canWork&&t.planned_date&&<button disabled={Boolean(busy)} onClick={()=>void schedule(t,null)}>Clear plan</button>}{waiting&&!done&&<span>Waiting for management</span>}{canWork&&t.is_delivery_step&&<span>Contact management for delivery</span>}</div>
          {submitCode===t.todo_code&&canSubmit&&<div className="ewm-editor"><label>Submission note<textarea maxLength={2000} rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Drawing revision, file location or work completed (optional)"/></label><div className="ewm-actions"><button className="primary" disabled={Boolean(busy)} onClick={()=>void submit(t)}>Send for review</button><button disabled={Boolean(busy)} onClick={()=>setSubmitCode("")}>Cancel</button></div></div>}
          {planCode===t.todo_code&&canWork&&<div className="ewm-editor"><label>Personal work date<input type="date" min={today} value={planDate} onChange={e=>setPlanDate(e.target.value)}/></label><div className="ewm-actions"><button className="primary" disabled={Boolean(busy)||!planDate||planDate<today} onClick={()=>void schedule(t,planDate)}>Save work date</button><button disabled={Boolean(busy)} onClick={()=>setPlanCode("")}>Cancel</button></div></div>}
        </article>;
      })}{!visible.length&&<p className="ewm-empty">{query?"No matching assignments.":"No tasks in this view. Choose My Tasks to see all open assignments."}</p>}</div>
    </>}
  </section>;
}

const CSS = [
".ewm{margin:0 0 16px;padding:18px;display:grid;gap:14px;min-width:0;background:var(--lv-surface-panel);color:var(--lv-text-primary);border:1px solid var(--lv-border-default);border-radius:14px}.ewm *{box-sizing:border-box}.ewm-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.ewm-head h2{font-size:26px;margin:4px 0}.ewm-head p,.ewm-summary p,.ewm-task p{font-size:13px;line-height:1.5;color:var(--lv-text-secondary);margin:4px 0}.ewm-eyebrow{font-size:10px;letter-spacing:.1em;color:var(--lv-brand-text);font-weight:800}.ewm button{border:1px solid var(--lv-border-default);background:var(--lv-surface-input);color:var(--lv-text-primary);border-radius:9px;padding:9px 12px;min-height:42px;font-size:13px;font-weight:650;cursor:pointer}.ewm button.primary,.ewm button[aria-pressed=true]{background:var(--lv-brand-primary);color:var(--lv-text-inverse);border-color:var(--lv-brand-border)}.ewm button:disabled{opacity:.55;cursor:not-allowed}.ewm-summary{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ewm-summary>div{padding:13px;border:1px solid var(--lv-border-default);border-radius:12px;background:var(--lv-surface-muted)}.ewm-summary span{font-size:12px;color:var(--lv-text-secondary)}.ewm-summary strong{display:block;font-size:25px;margin:5px 0}.ewm-tabs{display:flex;flex-wrap:wrap;gap:7px}.ewm-tabs button{display:flex;gap:8px;align-items:center}.ewm-tabs span{font-size:11px;font-weight:700}.ewm-search{display:flex;gap:10px;justify-content:space-between;align-items:center}.ewm-search h3{font-size:17px;margin:0}.ewm input,.ewm textarea{min-height:42px;padding:10px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:14px;max-width:100%}.ewm-search input{width:260px}.ewm-list{display:grid;gap:10px}.ewm-task{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(160px,.7fr);gap:12px;padding:15px;border:1px solid var(--lv-border-default);border-radius:12px}.ewm-task-main{min-width:0;overflow-wrap:anywhere}.ewm-task h4{margin:8px 0 3px;font-size:16px;line-height:1.4}.ewm-meta{display:grid;gap:7px;align-content:start;font-size:12px;color:var(--lv-text-secondary)}.ewm-meta b{display:block;color:var(--lv-text-primary);margin-top:3px;font-size:13px}.ewm-tags{display:flex;gap:6px;flex-wrap:wrap}.ewm-tags span{padding:4px 7px;background:var(--lv-surface-muted);border-radius:6px;font-size:11px;font-weight:650}.ewm-danger,.ewm-alert{color:var(--lv-danger)}.ewm-actions{grid-column:1/-1;display:flex;align-items:center;flex-wrap:wrap;gap:7px;font-size:13px;color:var(--lv-text-secondary)}.ewm-actions:empty{display:none}.ewm-editor{grid-column:1/-1;padding:12px;background:var(--lv-surface-muted);border-radius:9px}.ewm-editor label{display:grid;gap:6px;margin-bottom:9px;font-size:13px;font-weight:650}.ewm-note,.ewm-body{white-space:pre-wrap}.ewm-task details summary{font-size:13px;cursor:pointer;color:var(--lv-brand-text);padding:7px 0}.ewm-alert,.ewm-notice,.ewm-empty{padding:12px;border-radius:8px;background:var(--lv-surface-muted);margin:0;font-size:13px;line-height:1.5}.ewm-notice{color:var(--lv-success)}",
"@media(max-width:650px){.ewm{padding:12px;gap:12px}.ewm-head h2{font-size:22px}.ewm-task{grid-template-columns:1fr;padding:12px}.ewm-meta{grid-template-columns:1fr 1fr}.ewm-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.ewm-tabs button{justify-content:space-between}.ewm-search{align-items:stretch;flex-direction:column}.ewm-search input{width:100%}.ewm-actions button{flex:1 1 125px}.ewm-summary strong{font-size:21px}.ewm-summary>div{padding:10px}}"
].join("");
