"use client";
import {useEffect,useMemo,useState} from "react";
type Settings={max_open_tasks:number;max_workload_points:number;whatsapp_critical_enabled:boolean;whatsapp_recipient_employee_id:string|null;whatsapp_enabled_at:string|null};
type Person={id:string;code:string;name:string;phoneConfigured:boolean};
type Overloaded={id:string;code:string;name:string;open:number;score:number;overOpen:number;overPoints:number};
type WorkAlert={id:string;employeeId:string;code:string;employeeName:string;status:string;openCount:number;points:number;maxOpen:number;maxPoints:number;acknowledgedBy:string;createdAt:string};
type Escalation={id:string;todoCode:string;title:string;level:number;status:string;overdueHours:number;assignedTo:string;createdAt:string};
type Delivery={id:string;status:string;createdAt:string;sentAt?:string;lastError:string};
type Data={settings:Settings;managers:Person[];overloaded:Overloaded[];escalation:Escalation[];alerts:WorkAlert[];deliveries:Delivery[];refreshedAt:string};
type Draft={maxOpenTasks:number;maxWorkloadPoints:number;whatsappCriticalEnabled:boolean;whatsappRecipientEmployeeId:string};
const INITIAL:Draft={maxOpenTasks:8,maxWorkloadPoints:15,whatsappCriticalEnabled:false,whatsappRecipientEmployeeId:""};
async function api(method:"GET"|"POST"="GET",input?:Record<string,unknown>){
 const res=await fetch("/api/admin/todo/management-alerts",{method,cache:"no-store",credentials:"same-origin",
  headers:input?{"Content-Type":"application/json"}:undefined,body:input?JSON.stringify(input):undefined});
 const body=await res.json().catch(()=>null);if(!res.ok||!body?.success)throw new Error(String(body?.error||"Notification request failed."));
 return body.data;
}
function pretty(date:string){const ms=Date.parse(date||"");return Number.isFinite(ms)?new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Dhaka",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit",hour12:true}).format(new Date(ms)):"—";}
function openTask(code:string){const hash="#todo="+encodeURIComponent(code);if(window.location.hash===hash)window.dispatchEvent(new CustomEvent("landview:todo:open",{detail:{todoCode:code}}));else window.location.hash=hash;}
const css=[
".ma-shell{margin:18px 28px 0;border:1px solid var(--lv-border-default);background:var(--lv-surface-panel);border-radius:16px;overflow:hidden;color:var(--lv-text-primary)}.ma-shell *{box-sizing:border-box}",
".ma-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:17px 19px;background:var(--lv-surface-muted);border-bottom:1px solid var(--lv-border-default)}.ma-head h2{font-size:18px;margin:0}.ma-head p{font-size:10px;line-height:1.5;max-width:760px;margin:5px 0 0;color:var(--lv-text-secondary)}",
".ma-body{padding:17px 19px}.ma-btn{background:var(--lv-surface-input);border:1px solid var(--lv-border-default);border-radius:8px;padding:8px 11px;color:var(--lv-text-primary);font-size:10px;font-weight:850;cursor:pointer;min-height:34px}.ma-btn:disabled{opacity:.5;cursor:default}.ma-btn.primary{color:var(--lv-text-inverse);background:var(--lv-brand-primary);border-color:var(--lv-brand-border)}",
".ma-layout{display:grid;grid-template-columns:minmax(0,0.9fr) minmax(0,1.1fr);gap:12px}.ma-card{min-width:0;border:1px solid var(--lv-border-subtle);padding:14px;border-radius:11px;background:var(--lv-surface-panel)}.ma-card h3{font-size:12px;margin:0 0 5px}.ma-card p{font-size:10px;color:var(--lv-text-secondary);margin:0 0 12px;line-height:1.5}",
".ma-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ma-field{display:grid;gap:5px;font-size:9px;color:var(--lv-text-muted);font-weight:900}.ma-field input,.ma-field select{border:1px solid var(--lv-border-default);background:var(--lv-surface-input);border-radius:7px;color:var(--lv-text-primary);padding:8px 9px;font-size:11px;min-height:35px;width:100%}",
".ma-separator{height:1px;background:var(--lv-border-subtle);margin:14px 0}.ma-toggle{font-size:11px;font-weight:850;display:flex;align-items:center;gap:8px}.ma-toggle input{width:17px;height:17px;accent-color:var(--lv-brand-primary)}.ma-note{font-size:9px;color:var(--lv-text-muted);line-height:1.55;margin-top:7px}",
".ma-actions{display:flex;justify-content:flex-start;gap:7px;margin-top:13px;flex-wrap:wrap}.ma-list{display:grid;gap:8px;max-height:440px;overflow:auto}.ma-alert{padding:10px 12px;background:var(--lv-surface-muted);border:1px solid var(--lv-border-subtle);border-radius:9px;display:flex;justify-content:space-between;gap:10px;align-items:center}.ma-alert strong{font-size:11px}.ma-alert p{margin:4px 0 0;font-size:10px}.ma-alert small{font-size:9px;color:var(--lv-text-muted)}.ma-alert .right{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;align-items:center}",
".ma-badge{font-size:9px;font-weight:900;color:var(--lv-text-secondary);white-space:nowrap}.ma-badge.critical{color:var(--lv-danger)}.ma-empty{font-size:10px;border:1px dashed var(--lv-border-default);border-radius:8px;color:var(--lv-text-muted);padding:12px}.ma-link{color:var(--lv-brand-primary);border:0;background:none;font-weight:900;font-size:11px;cursor:pointer;padding:0;text-align:left}",
".ma-counts{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:11px}.ma-count{font-size:10px;border:1px solid var(--lv-border-subtle);border-radius:8px;padding:6px 9px;background:var(--lv-surface-muted)}.ma-count strong{font-size:13px}.ma-msg{padding:10px 12px;margin:10px 17px 0;background:var(--lv-surface-muted);font-size:10px;border-radius:8px}.ma-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.ma-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}.ma-section{margin-top:16px}.ma-delivery{font-size:9px;color:var(--lv-text-secondary);display:flex;gap:9px;flex-wrap:wrap;margin:5px 0}.ma-foot{margin:12px 0 0;font-size:9px;color:var(--lv-text-muted);line-height:1.5}",
"@media(max-width:950px){.ma-layout{grid-template-columns:1fr}}@media(max-width:560px){.ma-shell{margin:14px 12px 0}.ma-body{padding:12px}.ma-head{flex-direction:column}.ma-fields{grid-template-columns:1fr}.ma-alert{flex-direction:column;align-items:stretch}.ma-alert .right{justify-content:flex-start}}"
].join("");
export default function AdminTodoManagementAlerts(){
 const [data,setData]=useState<Data|null>(null);
 const [draft,setDraft]=useState<Draft>(INITIAL);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [dirty,setDirty]=useState(false);
 async function load(silent=false){
  if(!silent)setLoading(true);
  try{
   const d=await api() as Data;setData(d);
   if(!dirty)setDraft({maxOpenTasks:d.settings.max_open_tasks,maxWorkloadPoints:d.settings.max_workload_points,
    whatsappCriticalEnabled:d.settings.whatsapp_critical_enabled,whatsappRecipientEmployeeId:d.settings.whatsapp_recipient_employee_id||""});
  }catch(e){setError(e instanceof Error?e.message:"Could not load management alerts.");}finally{setLoading(false);}
 }
 useEffect(()=>{void load();},[]);
 useEffect(()=>{const timer=window.setInterval(()=>{if(document.visibilityState==="visible")void load(true)},60000);return()=>window.clearInterval(timer);},[dirty]);
 async function apply(action:string,additional:Record<string,unknown>={},key=action){
   if(busy)return;setBusy(key);setError("");setNotice("");
   try{
     const result=await api("POST",{action,...additional}) as Record<string,any>;
     if(action==="settings"){setNotice("Limits and notification settings saved.");setDirty(false);}
     else if(action==="scan")setNotice("Scan complete: "+result.notifications.overloadOpened+" overload alerts opened, "+result.notifications.whatsappQueued+" critical WhatsApp queued.");
     else setNotice("Management alert updated.");
     await load(true);
     if(action==="settings"){const d=await api() as Data;setData(d);setDraft({maxOpenTasks:d.settings.max_open_tasks,maxWorkloadPoints:d.settings.max_workload_points,whatsappCriticalEnabled:d.settings.whatsapp_critical_enabled,whatsappRecipientEmployeeId:d.settings.whatsapp_recipient_employee_id||""});}
   }catch(e){setError(e instanceof Error?e.message:"Could not save settings.");}finally{setBusy("");}
 }
 function patch(update:Partial<Draft>){setDraft(p=>({...p,...update}));setDirty(true);}
 async function save(){
   if(draft.whatsappCriticalEnabled&&!draft.whatsappRecipientEmployeeId){setError("Choose an alert recipient first.");return;}
   const current=data?.settings;
   const enabling=draft.whatsappCriticalEnabled&&(!current?.whatsapp_critical_enabled||current.whatsapp_recipient_employee_id!==draft.whatsappRecipientEmployeeId);
   if(enabling&&!window.confirm("Enable critical WhatsApp alerts for the selected recipient? Only NEW critical overdue escalations after enabling will queue WhatsApp; existing alerts will not be sent."))return;
   await apply("settings",{settings:draft});
 }
 const pending=useMemo(()=>data?.alerts.filter(a=>a.status==="unread")||[],[data]);
 const overload=data?.overloaded||[];
 const escalation=data?.escalation||[];
 const managers=data?.managers||[];
 const selected=managers.find(p=>p.id===draft.whatsappRecipientEmployeeId);
 return <section className="ma-shell">
  <style>{css}</style>
  <header className="ma-head"><div><h2>Management Alerts & Limits</h2><p>Set team workload limits, review unacknowledged alerts, and optionally deliver new critical overdue To Dos to one designated WhatsApp recipient. Nothing is sent to clients.</p></div>
   <button className="ma-btn" type="button" onClick={()=>void load()} disabled={loading||Boolean(busy)}>{loading?"Loading…":"Refresh"}</button></header>
  {error&&<div className="ma-msg bad" role="alert">{error}</div>}
  {notice&&<div className="ma-msg good">{notice}</div>}
  <div className="ma-body">
   <div className="ma-layout">
    <article className="ma-card">
     <h3>Workload thresholds</h3><p>An overload notification is created when either limit is exceeded, once per continuous overload episode. Points estimate urgency and overdue weight, not employee productivity.</p>
     <div className="ma-fields">
      <label className="ma-field">Maximum open tasks per employee
       <input type="number" min={1} max={100} step={1} value={draft.maxOpenTasks} onChange={e=>patch({maxOpenTasks:Number(e.target.value)})}/>
      </label>
      <label className="ma-field">Maximum workload points
       <input type="number" min={1} max={500} step={0.5} value={draft.maxWorkloadPoints} onChange={e=>patch({maxWorkloadPoints:Number(e.target.value)})}/>
      </label>
     </div>
     <div className="ma-separator"/>
     <h3>Critical WhatsApp notifications</h3>
     <label className="ma-toggle"><input type="checkbox" checked={draft.whatsappCriticalEnabled} onChange={e=>patch({whatsappCriticalEnabled:e.target.checked})}/>Send critical escalations through WhatsApp</label>
     <p className="ma-note">Default OFF. Requires a recipient with an active LAND VIEW employee record and valid registered phone. Critical means a To Do remains at least 72 hours overdue. Existing escalations are excluded on activation.</p>
     <label className="ma-field" style={{marginTop:10}}>WhatsApp recipient
      <select value={draft.whatsappRecipientEmployeeId} onChange={e=>patch({whatsappRecipientEmployeeId:e.target.value})}>
       <option value="">Choose recipient…</option>{managers.map(p=><option key={p.id} value={p.id}>{p.code} · {p.name}{p.phoneConfigured?"":" · no phone"}</option>)}
      </select>
     </label>
     {draft.whatsappCriticalEnabled&&selected&&!selected.phoneConfigured&&<p className="ma-note">The selected employee does not have a valid phone number. Notifications cannot be enabled until it is corrected.</p>}
     <div className="ma-actions">
      <button className="ma-btn primary" type="button" disabled={Boolean(busy)||loading||!dirty} onClick={()=>void save()}>{busy==="settings"?"Saving…":"Save settings"}</button>
      <button className="ma-btn" type="button" disabled={Boolean(busy)} onClick={()=>void apply("scan")}>{busy==="scan"?"Scanning…":"Check alerts now"}</button>
     </div>
    </article>
    <article className="ma-card">
     <h3>Alert inbox</h3><p>Click an overdue task to inspect it. Acknowledge marks the alert reviewed—it does not complete or reassign the task.</p>
     <div className="ma-counts"><span className="ma-count"><strong>{pending.length}</strong> New workload alerts</span><span className="ma-count"><strong>{escalation.filter(e=>e.status==="open").length}</strong> Escalations to review</span><span className="ma-count"><strong>{escalation.filter(e=>e.level===2&&e.status==="open").length}</strong> Critical</span></div>
     <div className="ma-list">
      {escalation.slice(0,25).map(e=><div className="ma-alert" key={e.id}><div>
        <span className={"ma-badge"+(e.level===2?" critical":"")}>{e.level===2?"CRITICAL · 72h+":"OVERDUE · 24h+"}</span><p><button className="ma-link" type="button" onClick={()=>openTask(e.todoCode)}>{e.todoCode} · {e.title}</button></p>
        <small>{e.overdueHours}h overdue · {e.assignedTo} · {e.status==="acknowledged"?"Acknowledged":"Needs review"}</small></div>
       <div className="right"><button className="ma-btn" type="button" onClick={()=>openTask(e.todoCode)}>Open task</button><button type="button" className="ma-btn primary" disabled={Boolean(busy)} onClick={()=>void apply(e.status==="acknowledged"?"reopen_escalation":"acknowledge_escalation",{id:e.id},e.id)}>{busy===e.id?"Updating…":e.status==="acknowledged"?"Reopen":"Acknowledge"}</button></div>
      </div>)}
      {data?.alerts.filter(a=>a.status!=="resolved").slice(0,25).map(a=><div className="ma-alert" key={a.id}><div>
       <span className="ma-badge">OVERLOAD · {a.status==="unread"?"NEEDS REVIEW":"ACKNOWLEDGED"}</span>
       <p><strong>{a.code} · {a.employeeName}</strong></p><small>{a.openCount} open / limit {a.maxOpen} · {a.points} points / limit {a.maxPoints}</small></div>
       <div className="right">{a.status==="unread"&&<button type="button" className="ma-btn primary" disabled={Boolean(busy)} onClick={()=>void apply("acknowledge",{id:a.id},a.id)}>{busy===a.id?"Updating…":"Acknowledge"}</button>}</div>
      </div>)}
      {escalation.length===0&&!data?.alerts.some(a=>a.status!=="resolved")&&<div className="ma-empty">No active management alerts.</div>}
     </div>
    </article>
   </div>
   <div className="ma-section ma-card">
    <h3>Current workload limit breaches</h3><p>Live workload values, regardless of whether management already acknowledged the alert.</p>
    <div className="ma-list">
     {overload.map(p=><div className="ma-alert" key={p.id}><div><strong>{p.code} · {p.name}</strong><p>{p.open} open tasks, {p.score.toFixed(1)} workload points</p></div>
      <span className="ma-badge">{p.overOpen>0?p.overOpen+" over open limit":""}{p.overOpen>0&&p.overPoints>0?" · ":""}{p.overPoints>0?p.overPoints.toFixed(1)+" over points limit":""}</span></div>)}
     {!overload.length&&<div className="ma-empty">All active employees are within the current workload limits.</div>}
    </div>
   </div>
   <div className="ma-section ma-card">
    <h3>WhatsApp delivery status</h3><p>Only messages from this management alert module are shown. A queued message may still be waiting for the WhatsApp bot or retrying.</p>
    {data?.deliveries.length?data.deliveries.slice(0,10).map(d=><div className="ma-delivery" key={d.id}><strong>{d.status.toUpperCase()}</strong><span>{pretty(d.createdAt)}</span>{d.lastError&&<span>{d.lastError}</span>}</div>):<div className="ma-empty">No management WhatsApp alerts queued.</div>}
    <p className="ma-foot">Alerts refresh every 60 seconds while this workspace is open. Background checks run every 30 minutes using protected Supabase Cron. Workload alerts automatically resolve when an employee drops below both limits.</p>
   </div>
  </div>
 </section>;
}
