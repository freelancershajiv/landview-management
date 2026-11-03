"use client";
import {useEffect,useMemo,useState} from "react";
type Work={id:string;code:string;name:string;designation:string;score:number;open:number;urgent:number;overdue:number};
type Suggestion={todoCode:string;title:string;updatedAt:string;priority:string;projectCode:string;currentEmployeeId:string;assignedTo:string;suggestedEmployeeId:string;suggestedEmployeeName:string;overdueDays:number;reason:string};
type Escalation={id:string;todoCode:string;title:string;projectCode:string;level:1|2;status:string;overdueHours:number;assignedTo:string;acknowledgedBy:string};
type Response={workloads:Work[];recommendations:Suggestion[];escalations:Escalation[];metrics:{activeEmployees:number;openTasks:number;unassigned:number;needsAttention:number;critical:number};refreshedAt:string};
const EMPTY:Response={workloads:[],recommendations:[],escalations:[],metrics:{activeEmployees:0,openTasks:0,unassigned:0,needsAttention:0,critical:0},refreshedAt:""};
async function api(method:"GET"|"POST"="GET",body?:Record<string,unknown>){
  const r=await fetch("/api/admin/todo/workload",{method,cache:"no-store",credentials:"same-origin",headers:body?{"Content-Type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});
  const j=await r.json().catch(()=>null);if(!r.ok||!j?.success)throw new Error(String(j?.error||"Request failed."));return j.data;
}
function openTask(code:string){const hash="#todo="+encodeURIComponent(code);if(window.location.hash===hash)window.dispatchEvent(new CustomEvent("landview:todo:open",{detail:{todoCode:code}}));else window.location.hash=hash;}
const css=[
".wl{margin:18px 28px 0;border:1px solid var(--lv-border-default);border-radius:16px;background:var(--lv-surface-panel);color:var(--lv-text-primary);overflow:hidden}.wl *{box-sizing:border-box}",
".wl-header{background:var(--lv-surface-muted);padding:18px 20px;display:flex;justify-content:space-between;gap:16px;border-bottom:1px solid var(--lv-border-default)}.wl-header h2{font-size:18px;margin:0}.wl-header p{font-size:11px;color:var(--lv-text-secondary);margin:6px 0 0;max-width:700px;line-height:1.5}",
".wl-body{padding:17px 19px}.wl-btn{border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:10px;font-weight:850;padding:9px 12px;cursor:pointer}.wl-btn:disabled{opacity:.5;cursor:default}.wl-btn.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.wl-actions{display:flex;gap:8px;flex-wrap:wrap}",
".wl-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.wl-metric{padding:12px;border:1px solid var(--lv-border-subtle);background:var(--lv-surface-muted);border-radius:10px}.wl-metric span{display:block;text-transform:uppercase;font-size:9px;font-weight:850;color:var(--lv-text-secondary)}.wl-metric strong{display:block;font-size:23px;margin-top:7px}.wl-metric.warn strong{color:var(--lv-danger)}",
".wl-section{border-top:1px solid var(--lv-border-subtle);padding-top:13px;margin-top:16px}.wl-section h3{font-size:13px;margin:0 0 5px}.wl-section p{color:var(--lv-text-secondary);font-size:10px;line-height:1.5;margin:0 0 10px}",
".wl-people{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.wl-person{border:1px solid var(--lv-border-subtle);background:var(--lv-surface-muted);padding:12px;border-radius:10px}.wl-person-top{display:flex;justify-content:space-between;gap:8px;font-size:11px}.wl-person small{font-size:9px;display:block;color:var(--lv-text-muted);margin:5px 0 10px}.wl-track{height:7px;background:var(--lv-border-default);border-radius:8px;overflow:hidden}.wl-fill{height:100%;background:var(--lv-brand-primary)}.wl-stats{display:flex;gap:13px;margin-top:8px;flex-wrap:wrap;color:var(--lv-text-secondary);font-size:10px}",
".wl-list{display:grid;gap:8px}.wl-row{border:1px solid var(--lv-border-subtle);border-radius:10px;padding:12px;display:flex;justify-content:space-between;align-items:center;gap:10px}.wl-row p{margin:5px 0 0}.wl-row small{font-size:9px;color:var(--lv-text-muted)}.wl-link{border:0;padding:0;background:transparent;color:var(--lv-brand-primary);font-weight:850;font-size:11px;cursor:pointer;text-align:left}",
".wl-ctrl{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.wl-ctrl select{border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);padding:8px;font-size:10px;max-width:280px}.wl-msg{padding:9px 11px;font-size:11px;margin:9px 17px 0;border-radius:8px;background:var(--lv-surface-muted)}.wl-msg.bad{color:var(--lv-danger);background:var(--lv-danger-soft)}.wl-msg.good{color:var(--lv-success);background:var(--lv-success-soft)}.wl-empty{border:1px dashed var(--lv-border-default);padding:13px;border-radius:9px;color:var(--lv-text-muted);font-size:10px}.wl-tag{font-size:9px;font-weight:900;color:var(--lv-text-secondary)}.wl-tag.critical{color:var(--lv-danger)}.wl-foot{font-size:9px;color:var(--lv-text-muted);margin:14px 0 0;line-height:1.5}",
"@media(max-width:930px){.wl-header{flex-direction:column}.wl-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.wl-people{grid-template-columns:1fr}}",
"@media(max-width:600px){.wl{margin:14px 12px 0}.wl-body{padding:12px}.wl-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.wl-row{flex-direction:column;align-items:stretch}.wl-ctrl{justify-content:flex-start}.wl-ctrl select{flex:1;max-width:none}}"
].join("");
export default function AdminTodoWorkloadCenter(){
const [data,setData]=useState<Response>(EMPTY);
const [choices,setChoices]=useState<Record<string,string>>({});
const [busy,setBusy]=useState("");
const [loading,setLoading]=useState(true);
const [error,setError]=useState("");
const [notice,setNotice]=useState("");
async function load(silent=false){
  if(!silent)setLoading(true);
  try{const next=await api() as Response;setData(next);setChoices(prev=>{const res={...prev};for(const s of next.recommendations)if(!res[s.todoCode])res[s.todoCode]=s.suggestedEmployeeId;return res;});}
  catch(e){setError(e instanceof Error?e.message:"Could not load workload.");}
  finally{setLoading(false);}
}
useEffect(()=>{void load();const tick=()=>{if(document.visibilityState==="visible")void load(true)};const t=window.setInterval(tick,60000);
window.addEventListener("landview:todo:changed",tick);
return()=>{window.clearInterval(t);window.removeEventListener("landview:todo:changed",tick)};},[]);
async function run(action:Record<string,unknown>,key:string){
  if(busy)return;setBusy(key);setNotice("");setError("");
  try{const result=await api("POST",action) as Record<string,any>;
    if(action.action==="reassign"){setNotice(String(action.todoCode)+" reassigned to "+String(result.assignedTo));window.dispatchEvent(new Event("landview:todo:changed"));}
    else if(action.action==="scan")setNotice("Escalations: "+result.opened+" new, "+result.resolved+" resolved, "+result.errors?.length+" errors.");
    else setNotice("Escalation acknowledgement updated.");
    await load(true);
  }catch(e){setError(e instanceof Error?e.message:"Action failed.");}finally{setBusy("");}
}
function reassign(s:Suggestion){
 const id=choices[s.todoCode]||s.suggestedEmployeeId;
 const person=data.workloads.find(w=>w.id===id);
 if(!person){setError("Choose an active employee.");return;}
 if(id===s.currentEmployeeId){setError("Choose a different employee.");return;}
 const message="Reassign "+s.todoCode+" — "+s.title+" to "+person.code+" · "+person.name+"?\nCurrent: "+(s.assignedTo||"Unassigned")+"\nThis changes the To Do owner and resets reminder delivery flags. Linked Workflow remains unchanged. Confirm their expertise and availability first.";
 if(!window.confirm(message))return;
 void run({action:"reassign",todoCode:s.todoCode,employeeId:id,expectedUpdatedAt:s.updatedAt},s.todoCode);
}
const max=useMemo(()=>Math.max(1,...data.workloads.map(w=>w.score)),[data.workloads]);
return <section className="wl">
 <style>{css}</style>
 <header className="wl-header"><div><h2>Workload Balance & Escalations</h2><p>Weighted team workload, suggested task assignments and a management-only escalation inbox. Recommendations never reassign staff automatically.</p></div>
 <div className="wl-actions"><button className="wl-btn" type="button" onClick={()=>void load()} disabled={loading||Boolean(busy)}>{loading?"Loading…":"Refresh"}</button><button className="wl-btn primary" type="button" onClick={()=>void run({action:"scan"},"scan")} disabled={Boolean(busy)}>Scan overdue now</button></div></header>
 {error&&<div className="wl-msg bad" role="alert">{error}</div>}{notice&&<div className="wl-msg good">{notice}</div>}
 <div className="wl-body">
  <div className="wl-metrics">{([
    ["Active staff",data.metrics.activeEmployees],["Open To Dos",data.metrics.openTasks],["Unassigned",data.metrics.unassigned],
    ["Needs review",data.metrics.needsAttention],["Critical 72h+",data.metrics.critical]
  ] as const).map(([label,n])=><div className={"wl-metric"+(label==="Critical 72h+"&&n>0?" warn":"")} key={label}><span>{label}</span><strong>{n}</strong></div>)}</div>
  <div className="wl-section"><h3>Workload by employee</h3><p>Points estimate open work using urgency, due dates and overdue age—not time worked or employee performance. Confirm skills before assigning.</p>
   <div className="wl-people">{data.workloads.map(w=><div className="wl-person" key={w.id}>
     <div className="wl-person-top"><strong>{w.code} · {w.name}</strong><b>{w.score.toFixed(1)} pts</b></div>
     <small>{w.designation||"Employee"}</small><div className="wl-track"><div className="wl-fill" style={{width:Math.round(w.score/max*100)+"%"}}/></div>
     <div className="wl-stats"><span>{w.open} open</span><span>{w.urgent} high/urgent</span><span>{w.overdue} overdue</span></div>
   </div>)}{!data.workloads.length&&<div className="wl-empty">No active employees found.</div>}</div>
  </div>
  <div className="wl-section"><h3>Suggested task assignments</h3><p>Unassigned work is suggested to the least-loaded active teammate. Reassignment suggestions for existing owners appear only when the load gap is at least 3 points.</p>
   <div className="wl-list">{data.recommendations.slice(0,25).map(s=><div className="wl-row" key={s.todoCode}>
    <div><button className="wl-link" type="button" onClick={()=>openTask(s.todoCode)}>{s.todoCode} · {s.title}</button><p>{s.projectCode||"General task"} · {s.priority} · {s.reason}</p><small>{s.assignedTo||"Unassigned"}{s.overdueDays>0?" · "+s.overdueDays+"d overdue":""}</small></div>
    <div className="wl-ctrl"><select aria-label={"Assign "+s.todoCode} value={choices[s.todoCode]||s.suggestedEmployeeId} onChange={e=>setChoices(prev=>({...prev,[s.todoCode]:e.target.value}))}>
    {data.workloads.filter(w=>w.id!==s.currentEmployeeId).map(w=><option value={w.id} key={w.id}>{w.code} · {w.name} ({w.score.toFixed(1)} pts)</option>)}</select>
    <button className="wl-btn primary" type="button" disabled={Boolean(busy)} onClick={()=>reassign(s)}>{busy===s.todoCode?"Assigning…":"Assign"}</button></div>
   </div>)}{!data.recommendations.length&&<div className="wl-empty">No workload imbalance requiring a suggestion.</div>}</div>
  </div>
  <div className="wl-section"><h3>Overdue management escalations</h3><p>24 hours overdue triggers a review; 72 hours triggers a separate critical escalation. Acknowledging a review does not complete the task or prevent later critical escalation.</p>
   <div className="wl-list">{data.escalations.map(e=><div className="wl-row" key={e.id}>
     <div><span className={"wl-tag"+(e.level===2?" critical":"")}>{e.level===2?"CRITICAL · 72h+":"REVIEW · 24h+"}</span>
       <p><button className="wl-link" type="button" onClick={()=>openTask(e.todoCode)}>{e.todoCode} · {e.title}</button></p>
       <small>{e.projectCode||"General task"} · {e.assignedTo} · {e.overdueHours}h overdue · {e.status==="acknowledged"?"Acknowledged by "+e.acknowledgedBy:"Awaiting review"}</small>
     </div>
     <div className="wl-ctrl"><button className="wl-btn" type="button" onClick={()=>openTask(e.todoCode)}>Open To Do</button>
     <button className="wl-btn primary" type="button" disabled={Boolean(busy)} onClick={()=>void run({action:e.status==="acknowledged"?"reopen":"acknowledge",id:e.id},e.id)}>{busy===e.id?"Updating…":e.status==="acknowledged"?"Reopen":"Acknowledge"}</button></div>
   </div>)}{!data.escalations.length&&<div className="wl-empty">No overdue escalations. The protected scheduler checks every 30 minutes.</div>}</div>
  </div>
  <p className="wl-foot">Reassignment and acknowledgement are audited. Management alerts are currently in-app, not WhatsApp; automated reassignments are disabled. Last refreshed: {data.refreshedAt?new Date(data.refreshedAt).toLocaleString("en-GB",{timeZone:"Asia/Dhaka"}):"—"}.</p>
 </div>
</section>;
}
