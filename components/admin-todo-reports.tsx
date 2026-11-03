"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
type Filters={
  search:string;status:string;priority:string;employeeId:string;referenceType:string;
  projectCode:string;workflow:string;deadline:string;
  dueFrom:string;dueTo:string;createdFrom:string;createdTo:string;sort:string;
};
type Person={id:string;code:string;name:string};
type View={id:string;name:string;filters:Partial<Filters>;createdAt:string;updatedAt:string};
type Task={code:string;title:string;status:string;priority:string;employee:string;
  reference:string;client:string;workflow:string;workflowStatus:string;
  dueDate:string;dueTime:string;createdAt:string;completedAt:string;overdueDays:number};
type Report={rows:Task[];stats:{total:number;open:number;inProgress:number;done:number;overdue:number;dueToday:number};
  shown:number;generatedAt:string};
const DEFAULT:Filters={
  search:"",status:"All",priority:"All",employeeId:"",referenceType:"All",projectCode:"",
  workflow:"All",deadline:"All",dueFrom:"",dueTo:"",createdFrom:"",createdTo:"",sort:"Due Date"
};
const CSS=[
".tr-shell{margin:18px 28px 0;border:1px solid var(--lv-border-default);background:var(--lv-surface-panel);border-radius:16px;overflow:hidden;color:var(--lv-text-primary)}.tr-shell *{box-sizing:border-box}",
".tr-head{padding:19px 20px;border-bottom:1px solid var(--lv-border-default);background:var(--lv-surface-muted);display:flex;justify-content:space-between;align-items:flex-start;gap:16px}.tr-head h2{font-size:19px;letter-spacing:-.02em;margin:0}.tr-head p{font-size:11px;max-width:650px;line-height:1.55;color:var(--lv-text-secondary);margin:6px 0 0}",
".tr-actions{display:flex;gap:7px;flex-wrap:wrap}.tr-btn{border:1px solid var(--lv-border-default);border-radius:8px;padding:8px 12px;min-height:37px;background:var(--lv-surface-input);font-size:11px;font-weight:850;color:var(--lv-text-primary);cursor:pointer}.tr-btn.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.tr-btn:disabled{opacity:.45;cursor:default}",
".tr-content{padding:16px 19px}.tr-group{border:1px solid var(--lv-border-subtle);padding:14px;border-radius:12px;margin-bottom:13px}.tr-group h3{font-size:12px;margin:0 0 10px}.tr-description{font-size:10px;color:var(--lv-text-muted);line-height:1.5;margin:5px 0 12px}",
".tr-filters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.tr-field{display:grid;gap:5px;font-size:10px;color:var(--lv-text-secondary);font-weight:850;min-width:0}.tr-field input,.tr-field select{min-height:37px;border:1px solid var(--lv-border-default);border-radius:8px;padding:7px 9px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:11px;min-width:0;width:100%}.tr-field.wide{grid-column:span 2}",
".tr-save{display:grid;grid-template-columns:minmax(180px,1fr) minmax(190px,1.2fr) auto auto;gap:8px;align-items:end}.tr-small{font-size:10px;color:var(--lv-text-muted)}.tr-message{border-radius:8px;background:var(--lv-surface-muted);padding:10px 12px;font-size:11px;margin:0 0 12px}.tr-message.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.tr-message.good{background:var(--lv-success-soft);color:var(--lv-success)}",
".tr-cards{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-bottom:14px}.tr-card{border:1px solid var(--lv-border-subtle);background:var(--lv-surface-muted);border-radius:10px;padding:11px}.tr-card span{font-size:9px;font-weight:900;text-transform:uppercase;color:var(--lv-text-secondary);display:block}.tr-card strong{font-size:24px;display:block;margin-top:7px}.tr-card.danger strong{color:var(--lv-danger)}",
".tr-table-wrap{max-width:100%;overflow:auto;border:1px solid var(--lv-border-subtle);border-radius:10px}.tr-table{border-collapse:collapse;width:100%;font-size:10px;min-width:1150px}.tr-table th{padding:10px 9px;text-align:left;background:var(--lv-surface-muted);color:var(--lv-text-secondary);text-transform:uppercase;letter-spacing:.03em;font-size:9px;white-space:nowrap;position:sticky;top:0}.tr-table td{padding:10px 9px;border-top:1px solid var(--lv-border-subtle);vertical-align:top;color:var(--lv-text-primary)}.tr-table td small{color:var(--lv-text-muted);font-size:9px;display:block;margin-top:4px}.tr-table tr:hover td{background:var(--lv-surface-muted)}.tr-link{border:0;background:none;color:var(--lv-brand-primary);font-size:10px;font-weight:900;cursor:pointer;padding:0;text-align:left}",
".tr-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:10px}.tr-toolbar h3{font-size:12px;margin:0}.tr-toolbar p{font-size:10px;color:var(--lv-text-muted);margin:4px 0 0}.tr-toolbar .tr-actions{justify-content:flex-end}.tr-foot{font-size:10px;color:var(--lv-text-muted);margin:10px 0 0;line-height:1.5}.tr-loading{font-size:11px;color:var(--lv-text-secondary);padding:16px;text-align:center}",
"@media(max-width:1050px){.tr-filters{grid-template-columns:repeat(3,minmax(0,1fr))}.tr-cards{grid-template-columns:repeat(3,minmax(0,1fr))}.tr-save{grid-template-columns:1fr 1fr}}",
"@media(max-width:700px){.tr-shell{margin:13px 12px 0}.tr-head{padding:15px;flex-direction:column}.tr-content{padding:12px}.tr-filters{grid-template-columns:repeat(2,minmax(0,1fr))}.tr-field.wide{grid-column:1/-1}.tr-save{grid-template-columns:1fr}.tr-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.tr-actions .tr-btn{flex:1 1 auto}.tr-table{min-width:1050px}}",
].join("");
async function getMeta(){
 const response=await fetch("/api/admin/todo/reports",{cache:"no-store",credentials:"same-origin"});
 const result=await response.json().catch(()=>null);
 if(!response.ok||!result?.success)throw new Error(String(result?.error||"Could not load saved reports."));
 return result.data as {views:View[];employees:Person[]};
}
async function request(action:string,payload:Record<string,unknown>={}){
 const response=await fetch("/api/admin/todo/reports",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...payload}),credentials:"same-origin",cache:"no-store"});
 if(!response.ok){
   const json=await response.json().catch(()=>null);
   throw new Error(String(json?.error||"Report request failed."));
 }
 return response;
}
function openTask(code:string){
 const hash="#todo="+encodeURIComponent(code);
 if(window.location.hash===hash)window.dispatchEvent(new CustomEvent("landview:todo:open",{detail:{todoCode:code}}));
 else window.location.hash=hash;
}
export default function AdminTodoReports(){
 const [filters,setFilters]=useState<Filters>(DEFAULT);
 const [views,setViews]=useState<View[]>([]);
 const [employees,setEmployees]=useState<Person[]>([]);
 const [selectedView,setSelectedView]=useState("");
 const [viewName,setViewName]=useState("");
 const [report,setReport]=useState<Report|null>(null);
 const [previewKey,setPreviewKey]=useState("");
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const key=useMemo(()=>JSON.stringify(filters),[filters]);
 const applied=previewKey===key&&report!==null;
 const change=(field:keyof Filters,value:string)=>setFilters(previous=>({...previous,[field]:value}));
 const refreshMeta=useCallback(async()=>{
   const meta=await getMeta();setViews(meta.views||[]);setEmployees(meta.employees||[]);
 },[]);
 const preview=useCallback(async(f:Filters)=>{
   const response=await request("preview",{filters:f});
   return await response.json().then(j=>j.data as Report);
 },[]);
 useEffect(()=>{
   let active=true;
   (async()=>{
     try {
       const [meta,p]=await Promise.all([getMeta(),preview(DEFAULT)]);
       if(!active)return;
       setViews(meta.views||[]);setEmployees(meta.employees||[]);
       setReport(p);setPreviewKey(JSON.stringify(DEFAULT));
     } catch(e){if(active)setError(e instanceof Error?e.message:"Could not load report.");}
   })();
   return()=>{active=false};
 },[preview]);
 async function showPreview(){
   if(busy)return;setBusy("preview");setError("");setNotice("");
   try {const p=await preview(filters);setReport(p);setPreviewKey(JSON.stringify(filters));}
   catch(e){setError(e instanceof Error?e.message:"Could not apply filters.");}
   finally{setBusy("")}
 }
 function pickView(id:string){
   setSelectedView(id);
   if(!id)return;
   const view=views.find(v=>v.id===id);
   if(!view)return;
   setViewName(view.name);
   setFilters({...DEFAULT,...view.filters});
   setNotice("Loaded saved view. Apply filters to refresh the report.");
   setError("");
 }
 async function saveView(){
   if(busy)return;if(!viewName.trim()){setError("Enter a name for the saved view.");return;}
   setBusy("save");setError("");setNotice("");
   try {
     const r=await request("save",{name:viewName,filters});
     const data=await r.json();
     await refreshMeta();
     setSelectedView(data.data?.id||"");
     setNotice("View saved for your management account.");
   }catch(e){setError(e instanceof Error?e.message:"Could not save view.");}
   finally{setBusy("")}
 }
 async function deleteView(){
   if(busy||!selectedView)return;
   const view=views.find(v=>v.id===selectedView);
   if(!view||!window.confirm('Delete saved view "'+view.name+'"? Tasks are not affected.'))return;
   setBusy("delete");setError("");setNotice("");
   try{
     await request("delete",{id:selectedView});await refreshMeta();
     setSelectedView("");setViewName("");
     setNotice("Saved view deleted. No tasks were changed.");
   }catch(e){setError(e instanceof Error?e.message:"Could not delete view.");}
   finally{setBusy("")}
 }
 async function download(format:"xlsx"|"pdf"){
   if(busy)return;setBusy(format);setError("");setNotice("");
   try {
     const response=await request("export",{filters,format});
     const blob=await response.blob();
     const header=response.headers.get("Content-Disposition")||"";
     const name=header.match(/filename="([^"]+)"/)?.[1]||"LAND_VIEW_ToDo_Report."+format;
     const url=URL.createObjectURL(blob);
     const anchor=document.createElement("a");
     anchor.href=url;anchor.download=name;document.body.appendChild(anchor);anchor.click();anchor.remove();
     window.setTimeout(()=>URL.revokeObjectURL(url),1000);
     setNotice((format==="xlsx"?"Excel":"PDF")+" report downloaded with the current filters.");
   }catch(e){setError(e instanceof Error?e.message:"Could not export report.");}
   finally{setBusy("")}
 }
 const statRows=report?[
  ["Matching",report.stats.total],["Open",report.stats.open],
  ["In Progress",report.stats.inProgress],["Completed",report.stats.done],
  ["Overdue",report.stats.overdue],["Due Today",report.stats.dueToday],
 ]:[];
 return <div className="tr-shell">
  <style>{CSS}</style>
  <header className="tr-head">
   <div><h2>To Do Reports & Saved Views</h2><p>Filter tasks across employees, deadlines, projects, and Workflow. Save personal management views and export full filtered results to Excel or PDF.</p></div>
   <button type="button" className="tr-btn" onClick={()=>{setFilters(DEFAULT);setSelectedView("");setViewName("");setNotice("");setError("")}} disabled={Boolean(busy)}>Reset filters</button>
  </header>
  <div className="tr-content">
   {error&&<div className="tr-message bad" role="alert">{error}</div>}
   {notice&&<div className="tr-message good">{notice}</div>}
   <section className="tr-group">
    <h3>Saved management views</h3>
    <p className="tr-description">Views belong to the signed-in manager. Saving a view stores filter settings only, not a snapshot of confidential task data.</p>
    <div className="tr-save">
     <label className="tr-field">Load saved view
      <select value={selectedView} disabled={Boolean(busy)} onChange={e=>pickView(e.target.value)}>
       <option value="">Choose a view…</option>{views.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
      </select>
     </label>
     <label className="tr-field">View name
      <input value={viewName} maxLength={80} disabled={Boolean(busy)} placeholder="e.g. My overdue design tasks" onChange={e=>setViewName(e.target.value)}/>
     </label>
     <button type="button" className="tr-btn primary" disabled={Boolean(busy)||!viewName.trim()} onClick={()=>void saveView()}>{busy==="save"?"Saving…":"Save view"}</button>
     <button type="button" className="tr-btn" disabled={Boolean(busy)||!selectedView} onClick={()=>void deleteView()}>Delete</button>
    </div>
    <p className="tr-foot">{views.length} of 25 saved views. Saving an existing name updates that view.</p>
   </section>
   <section className="tr-group">
    <h3>Advanced filters</h3>
    <div className="tr-filters">
     <label className="tr-field wide">Search tasks, clients, projects, Workflow
      <input type="search" placeholder="Search code, title, client, employee…" value={filters.search} onChange={e=>change("search",e.target.value)} />
     </label>
     <label className="tr-field">Status
      <select value={filters.status} onChange={e=>change("status",e.target.value)}>
       {["All","To Do","In Progress","Done"].map(s=><option key={s}>{s}</option>)}
      </select>
     </label>
     <label className="tr-field">Priority
      <select value={filters.priority} onChange={e=>change("priority",e.target.value)}>
       {["All","Low","Normal","High","Urgent"].map(s=><option key={s}>{s}</option>)}
      </select>
     </label>
     <label className="tr-field">Assigned employee
      <select value={filters.employeeId} onChange={e=>change("employeeId",e.target.value)}>
       <option value="">All employees</option><option value="unassigned">Unassigned</option>
       {employees.map(e=><option key={e.id} value={e.id}>{e.code} · {e.name}</option>)}
      </select>
     </label>
     <label className="tr-field">Reference type
      <select value={filters.referenceType} onChange={e=>change("referenceType",e.target.value)}>
       {["All","Project","Proposal","None"].map(s=><option key={s}>{s}</option>)}
      </select>
     </label>
     <label className="tr-field">Project ID (contains)
      <input value={filters.projectCode} placeholder="LV-157" onChange={e=>change("projectCode",e.target.value)}/>
     </label>
     <label className="tr-field">Workflow link
      <select value={filters.workflow} onChange={e=>change("workflow",e.target.value)}>
       {["All","Linked","Unlinked"].map(s=><option key={s}>{s}</option>)}
      </select>
     </label>
     <label className="tr-field">Deadline category
      <select value={filters.deadline} onChange={e=>change("deadline",e.target.value)}>
       {["All","Overdue","Due Today","Next 7 Days","No Deadline"].map(s=><option key={s}>{s}</option>)}
      </select>
     </label>
     <label className="tr-field">Due from
      <input type="date" value={filters.dueFrom} onChange={e=>change("dueFrom",e.target.value)}/>
     </label>
     <label className="tr-field">Due through
      <input type="date" value={filters.dueTo} onChange={e=>change("dueTo",e.target.value)}/>
     </label>
     <label className="tr-field">Created from
      <input type="date" value={filters.createdFrom} onChange={e=>change("createdFrom",e.target.value)}/>
     </label>
     <label className="tr-field">Created through
      <input type="date" value={filters.createdTo} onChange={e=>change("createdTo",e.target.value)}/>
     </label>
     <label className="tr-field">Sort order
      <select value={filters.sort} onChange={e=>change("sort",e.target.value)}>
       {["Due Date","Newest","Oldest","Priority","Employee"].map(s=><option key={s}>{s}</option>)}
      </select>
     </label>
    </div>
    <div className="tr-actions" style={{marginTop:13}}>
     <button type="button" className="tr-btn primary" onClick={()=>void showPreview()} disabled={Boolean(busy)}>{busy==="preview"?"Applying…":"Apply filters"}</button>
     <button type="button" className="tr-btn" onClick={()=>void download("xlsx")} disabled={Boolean(busy)}>{busy==="xlsx"?"Preparing…":"Download Excel (.xlsx)"}</button>
     <button type="button" className="tr-btn" onClick={()=>void download("pdf")} disabled={Boolean(busy)}>{busy==="pdf"?"Preparing…":"Download PDF"}</button>
    </div>
    {!applied&&report&&<p className="tr-foot">Filters changed. Click Apply filters to refresh this preview; downloads always use the current filter selections.</p>}
   </section>
   {report&&<>
    <div className="tr-cards">
     {statRows.map(([label,value])=><div className={"tr-card"+(label==="Overdue"?" danger":"")} key={label}><span>{label}</span><strong>{value}</strong></div>)}
    </div>
    <section className="tr-group">
     <div className="tr-toolbar"><div><h3>Matching To Dos</h3>
      <p>{report.shown} of {report.stats.total} shown in the preview · Download to export all matching rows</p>
     </div><span className="tr-small">Report generated {new Date(report.generatedAt).toLocaleString("en-GB",{timeZone:"Asia/Dhaka"})}</span></div>
     <div className="tr-table-wrap">
      <table className="tr-table">
       <thead><tr><th>Code</th><th>To Do / Client</th><th>Status</th><th>Priority</th><th>Employee</th><th>Reference</th><th>Workflow</th><th>Due</th><th>Overdue</th></tr></thead>
       <tbody>{report.rows.map(row=><tr key={row.code}>
        <td><button type="button" className="tr-link" onClick={()=>openTask(row.code)}>{row.code}</button></td>
        <td><strong>{row.title}</strong>{row.client&&<small>{row.client}</small>}</td>
        <td>{row.status}</td><td>{row.priority}</td><td>{row.employee}</td><td>{row.reference}</td>
        <td>{row.workflow?row.workflow+" · "+row.workflowStatus:"—"}</td>
        <td>{row.dueDate||"—"}{row.dueTime&&<small>{row.dueTime.slice(0,5)} BDT</small>}</td>
        <td>{row.overdueDays>0?row.overdueDays+" day(s)":"—"}</td>
       </tr>)}</tbody>
      </table>
      {!report.rows.length&&<div className="tr-loading">No To Dos match these filters.</div>}
     </div>
    </section>
   </>}
   {!report&&<div className="tr-loading">Loading To Do report…</div>}
   <p className="tr-foot">Management-only report. Deadline calculations use Bangladesh time. Export files contain current task data, so handle them as internal company records.</p>
  </div>
 </div>;
}
