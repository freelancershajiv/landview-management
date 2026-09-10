"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { landViewApi, ProjectServiceFolderInfo } from "@/lib/api";
import { ErrorState, Field, LoadingState, Money, PageHeader, formatDate, pick } from "@/components/lv-ui";
import { PROJECT_SERVICE_FOLDERS, uploadProjectFile } from "@/lib/project-service-folders";

const WORKFLOW_STAGES = [
  "Measurement / Digital Survey",
  "Soil Test",
  "Design Drafting",
  "Structural Design",
  "3D Design",
  "Electrical Design",
  "Plumbing Design",
  "Municipality Design",
  "Estimate & Costing",
];
const STATUSES = ["Draft", "Pending", "In Progress", "Blocked", "Completed"];
type Tab = "overview" | "workflow" | "team" | "finance" | "visits" | "documents" | "activity";
type FinanceCategory = { name:string; bill:number; discount:number; paid:number; due:number };
type LiveFinance = { categories:FinanceCategory[]; billed:number; paid:number; due:number; status:string; sourceUpdatedAt?:string };

const css = `
.pc{display:grid;gap:18px}.pc-tabs{display:flex;gap:6px;overflow:auto;padding:6px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:#151515;position:sticky;top:0;z-index:8}.pc-tabs button{border:0;background:transparent;color:#aaa;padding:11px 14px;border-radius:8px;font-size:11px;font-weight:700;white-space:nowrap;cursor:pointer}.pc-tabs button:hover{color:#fff;background:#222}.pc-tabs button.active{background:#ef493b;color:#fff}.pc-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.pc-stat{padding:18px;border:1px solid rgba(255,255,255,.09);border-radius:11px;background:#242424}.pc-stat span{display:block;color:#999;font-size:9px;text-transform:uppercase;letter-spacing:.1em}.pc-stat strong{display:block;margin-top:8px;color:#fff;font-size:20px;overflow-wrap:anywhere}.pc-stat small{display:block;margin-top:5px;color:#aaa;font-size:9px}.pc-panel{padding:20px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:#242424}.pc-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px}.pc-panel-head span{color:#ef493b;font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.pc-panel-head h2{margin:3px 0 0;color:#fff;font-size:18px}.pc-two{display:grid;grid-template-columns:1.4fr 1fr;gap:14px}.pc-workflow{display:grid;gap:9px}.pc-stage{display:grid;grid-template-columns:34px minmax(170px,1fr) 150px 150px;align-items:center;gap:10px;padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:#1c1c1c}.pc-stage.done{border-color:rgba(89,184,126,.35)}.pc-stage.blocked{border-color:rgba(239,73,59,.45)}.pc-num{display:grid;place-items:center;width:28px;height:28px;border-radius:7px;background:#303030;color:#aaa;font-size:9px;font-weight:800}.pc-stage-name strong{display:block;color:#eee;font-size:11px}.pc-stage-name small{display:block;color:#777;font-size:9px;margin-top:4px}.pc-stage select,.pc-stage input{width:100%;min-height:36px;border:1px solid #444;border-radius:7px;background:#292929;color:#eee;padding:0 9px;font-size:10px}.pc-progress{height:7px;background:#333;border-radius:10px;overflow:hidden}.pc-progress span{display:block;height:100%;background:#ef493b}.pc-progress-copy{display:flex;justify-content:space-between;color:#aaa;font-size:10px;margin-top:7px}.pc-list{display:grid;gap:8px}.pc-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:#1e1e1e}.pc-row strong{color:#eee;font-size:11px}.pc-row small{display:block;color:#888;font-size:9px;margin-top:3px}.pc-badge{padding:5px 8px;border-radius:5px;background:#333;color:#bbb;font-size:9px;white-space:nowrap}.pc-badge.red{background:#472824;color:#ff9a91}.pc-badge.green{background:#223b2c;color:#a7dfba}.pc-actions{display:flex;gap:8px;flex-wrap:wrap}.pc-empty{padding:30px;text-align:center;color:#888;font-size:11px}.service-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.service-card{padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:9px;background:#1d1d1d}.service-card-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.service-card-head strong{color:#eee;font-size:10px}.service-card-head a{font-size:9px;color:#ef766c}.service-upload{display:flex;gap:7px;margin-top:10px}.service-upload input{min-width:0;width:100%;font-size:9px;color:#999}.service-upload button{border:1px solid #555;background:#2c2c2c;color:#eee;border-radius:6px;padding:7px 9px;font-size:9px}.pc-table{width:100%;border-collapse:collapse}.pc-table th,.pc-table td{padding:10px;border-bottom:1px solid #383838;text-align:left;font-size:10px;color:#ccc}.pc-table th{color:#888;text-transform:uppercase;letter-spacing:.08em;font-size:8px}.pc-table a{color:#ef766c}.pc-note{color:#888;font-size:9px;line-height:1.6}.pc-edit{margin-top:0}.pc-danger{border:1px solid #67352f!important;color:#ff8177!important;background:#2b1d1b!important}.pc-finance-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.pc-finance-card{padding:16px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:#1c1c1c}.pc-finance-card>span{display:block;color:#ef493b;font-size:8px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.pc-finance-line{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #333;font-size:10px;color:#aaa}.pc-finance-line:last-child{border-bottom:0}.pc-finance-line strong{color:#eee}.pc-live{display:flex;align-items:center;gap:7px;color:#9ccea8;font-size:9px}.pc-live i{width:6px;height:6px;border-radius:50%;background:#7fc49b}.pc-status-due{color:#ff9a91!important}.pc-status-paid{color:#a7dfba!important}
@media(max-width:1000px){.pc-grid{grid-template-columns:repeat(2,1fr)}.pc-two{grid-template-columns:1fr}.pc-stage{grid-template-columns:34px 1fr 130px}.pc-stage input{grid-column:2/-1}.service-grid,.pc-finance-grid{grid-template-columns:1fr}}
@media(max-width:600px){.pc-grid{grid-template-columns:1fr 1fr}.pc-stage{grid-template-columns:30px 1fr}.pc-stage select,.pc-stage input{grid-column:2}.pc-tabs{border-radius:8px}.pc-panel{padding:15px}}
`;

function idOf(row:any, keys:string[]){ return pick(row, keys, ""); }
function statusClass(value:string){ const s=String(value||"").toLowerCase(); return s==="completed"?"done":s==="blocked"?"blocked":""; }
function normalizeFinanceId(value:unknown){ const raw=String(value||"").trim().toUpperCase(); if(!raw)return ""; const digits=raw.replace(/\D/g,""); return digits?`LV-${Number(digits)}`:raw; }
function moneyNumber(value:unknown){ const n=Number(String(value??0).replace(/,/g,"").replace(/[^0-9.-]/g,"")); return Number.isFinite(n)?n:0; }
function projectFromFileList(rows:string[][],projectId:string){
  const target=normalizeFinanceId(projectId);
  const row=rows.find(r=>normalizeFinanceId(r[0])===target && String(r[1]||"").trim());
  if(!row)return null;
  return {
    Project_ID:target,
    Project_Name:String(row[1]||"").trim(),
    Client_Name:String(row[1]||"").trim(),
    Phone_Number:String(row[3]||"").trim(),
    Location:String(row[2]||"").trim(),
    Floors:String(row[4]||"").trim(),
    Project_Type:String(row[5]||"").trim(),
    Plot_Area:String(row[6]||"").trim(),
    Status:"Running",
    __source:"File List",
  };
}
function financeFromSummary(rows:string[][],projectId:string,updatedAt?:string):LiveFinance|null{
  const target=normalizeFinanceId(projectId);
  const row=rows.find(r=>normalizeFinanceId(r[0])===target);
  if(!row)return null;
  const categories:FinanceCategory[]=[
    {name:"Engineering",bill:moneyNumber(row[3]),discount:moneyNumber(row[4]),paid:moneyNumber(row[5]),due:moneyNumber(row[6])},
    {name:"Supervision",bill:moneyNumber(row[7]),discount:moneyNumber(row[8]),paid:moneyNumber(row[9]),due:moneyNumber(row[10])},
    {name:"Others",bill:moneyNumber(row[11]),discount:moneyNumber(row[12]),paid:moneyNumber(row[13]),due:moneyNumber(row[14])},
  ];
  const billed=categories.reduce((sum,c)=>sum+c.bill-c.discount,0);
  const paid=categories.reduce((sum,c)=>sum+c.paid,0);
  const due=moneyNumber(row[15]);
  return {categories,billed,paid,due,status:String(row[16]||"").trim()||(due>0?"Due":"Full Paid"),sourceUpdatedAt:updatedAt};
}

export default function ProjectDetailPage(){
  const params=useParams<{projectId:string}>();
  const router=useRouter();
  const projectId=decodeURIComponent(String(params.projectId||""));
  const [tab,setTab]=useState<Tab>("overview");
  const [project,setProject]=useState<any>(null);
  const [employees,setEmployees]=useState<any[]>([]);
  const [assigned,setAssigned]=useState<string[]>([]);
  const [billing,setBilling]=useState<any>(null);
  const [liveFinance,setLiveFinance]=useState<LiveFinance|null>(null);
  const [drive,setDrive]=useState<any>(null);
  const [serviceFolders,setServiceFolders]=useState<ProjectServiceFolderInfo[]>([]);
  const [visits,setVisits]=useState<any[]>([]);
  const [documents,setDocuments]=useState<any[]>([]);
  const [tasks,setTasks]=useState<any[]>([]);
  const [folderFiles,setFolderFiles]=useState<Record<string,File|null>>({});
  const [uploadingFolder,setUploadingFolder]=useState("");
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [editing,setEditing]=useState(false);
  const [draft,setDraft]=useState<any>({});
  const [savingTeam,setSavingTeam]=useState(false);
  const [savingProject,setSavingProject]=useState(false);
  const [initializing,setInitializing]=useState(false);
  const [updatingTask,setUpdatingTask]=useState("");

  async function load(){
    setLoading(true); setError("");
    try{
      const [fileList,legacyProject,allEmp,assignedEmp,bill,folder,services,sv,docs,allTasks,summary]=await Promise.all([
        landViewApi.getFinanceSheet("File List"),
        landViewApi.getProject(projectId).catch(()=>null),
        landViewApi.getEmployees().catch(()=>[]),
        landViewApi.getProjectEmployees(projectId).catch(()=>[]),
        landViewApi.getProjectBilling(projectId).catch(()=>null),
        landViewApi.getProjectDriveFolder(projectId).catch(()=>null),
        landViewApi.getProjectServiceFolders(projectId).catch(()=>null),
        landViewApi.getSiteVisits(projectId).catch(()=>[]),
        landViewApi.getDocuments(projectId).catch(()=>[]),
        landViewApi.getErpRecords("tasks").catch(()=>[]),
        landViewApi.getFinanceSheet("Summary").catch(()=>null),
      ]);
      const fileListProject=projectFromFileList(fileList.rows,projectId);
      const p=legacyProject||fileListProject;
      if(!p)throw new Error("Project not found in LV Auto Invoice File List.");
      if(services?.category)p.Status=services.category;
      setProject(p); setDraft(p); setEmployees(allEmp);
      setAssigned(assignedEmp.map((e:any)=>idOf(e,["Employee_ID","Employee ID","EmployeeId"])).filter(Boolean));
      setBilling(bill); setLiveFinance(summary?financeFromSummary(summary.rows,projectId,summary.updatedAt):null);
      setDrive(folder||services||null); setServiceFolders(services?.folders||[]); setVisits(sv); setDocuments(docs);
      setTasks((allTasks||[]).filter((t:any)=>normalizeFinanceId(idOf(t,["Project_ID","Project ID","ProjectId"]))===normalizeFinanceId(projectId)));
    }catch(e:any){ setError(e?.message||"Could not load project."); }
    finally{ setLoading(false); }
  }
  useEffect(()=>{ if(projectId) void load(); },[projectId]);

  const taskMap=useMemo(()=>new Map(tasks.map((t:any)=>[String(idOf(t,["Task_Title","Task Title","Title"])),t])),[tasks]);
  const completed=WORKFLOW_STAGES.filter(stage=>String(idOf(taskMap.get(stage)||{},["Status","status"])).toLowerCase()==="completed").length;
  const progress=Math.round(completed/WORKFLOW_STAGES.length*100);
  const assignedPeople=employees.filter((e:any)=>assigned.includes(idOf(e,["Employee_ID","Employee ID","EmployeeId"])));
  const folderMap=new Map(serviceFolders.map(f=>[f.name,f]));

  async function saveEdit(e:FormEvent){ e.preventDefault(); if(savingProject)return; setSavingProject(true); try{ await landViewApi.updateProject(projectId,draft); setEditing(false); await load(); }catch(e:any){setError(e?.message||"Update failed.")}finally{setSavingProject(false)} }
  async function saveTeam(){ setSavingTeam(true); try{ await landViewApi.updateProjectEmployees(projectId,assigned); await load(); }catch(e:any){setError(e?.message||"Could not update team.")}finally{setSavingTeam(false)} }
  async function initializeWorkflow(){ setInitializing(true); setError(""); try{ for(const stage of WORKFLOW_STAGES){ if(!taskMap.has(stage)) await landViewApi.createErpRecord("tasks",{Project_ID:projectId,Task_Title:stage,Assigned_Employee_ID:"",Priority:"Normal",Start_Date:"",Due_Date:"",Status:"Pending",Notes:""}); } await load(); setTab("workflow"); }catch(e:any){setError(e?.message||"Could not initialize workflow.")}finally{setInitializing(false)} }
  async function updateTask(task:any,changes:Record<string,unknown>){ const taskId=idOf(task,["Task_ID","Task ID","TaskId"]); if(!taskId)return; setUpdatingTask(taskId); try{ await landViewApi.updateErpRecord("tasks",taskId,changes); setTasks(v=>v.map(t=>idOf(t,["Task_ID","Task ID","TaskId"])===taskId?{...t,...changes}:t)); }catch(e:any){setError(e?.message||"Could not update workflow stage.")}finally{setUpdatingTask("")} }
  async function uploadToFolder(folderName:string){ const file=folderFiles[folderName]; if(!file)return; setUploadingFolder(folderName); try{ await uploadProjectFile(projectId,folderName,file); setFolderFiles(v=>({...v,[folderName]:null})); await load(); }catch(e:any){setError(e?.message||"Upload failed.")}finally{setUploadingFolder("")} }
  async function remove(){ if(!window.confirm(`Delete ${projectId}? This deletes the project row.`))return; try{ await landViewApi.deleteProject(projectId); router.push("/admin/projects"); }catch(e:any){setError(e?.message||"Delete failed.")} }

  if(loading)return <LoadingState label="Loading project command center..."/>;
  if(error&&!project)return <ErrorState message={error} onRetry={load}/>;
  const title=idOf(project,["Project_Name","Project Name","Name","Project_Type","Project Type"])||projectId;
  const billed=liveFinance?.billed??Number(billing?.totalBill||0);
  const paid=liveFinance?.paid??Number(billing?.totalPaid||0);
  const due=liveFinance?.due??Number(billing?.due||0);
  const collection=billed>0?Math.max(0,Math.round(paid/billed*100)):0;
  const tabs:Array<[Tab,string]>=[["overview","Overview"],["workflow","Workflow"],["team","Team"],["finance","Finance"],["visits","Site Visits"],["documents","Documents"],["activity","Activity"]];

  return <><style dangerouslySetInnerHTML={{__html:css}}/><div className="pc">
    <PageHeader eyebrow={`PROJECT COMMAND CENTER · ${projectId}`} title={title} description={`${idOf(project,["Client_Name","Client Name","Client"])||"No client"} · ${idOf(project,["Location","Address"])||"Location not set"}`} action={<div className="pc-actions"><Link className="btn" href="/admin/projects">← Projects</Link><button className="btn btn-dark" onClick={()=>setEditing(v=>!v)}>{editing?"Close editor":"Edit project"}</button></div>}/>

    <div className="pc-tabs" role="tablist">{tabs.map(([key,label])=><button key={key} className={tab===key?"active":""} onClick={()=>setTab(key)}>{label}{key==="workflow"?` · ${progress}%`:key==="documents"?` · ${documents.length}`:key==="visits"?` · ${visits.length}`:key==="finance"&&liveFinance?` · ${liveFinance.status}`:""}</button>)}</div>

    {editing&&<form className="card form-card compact pc-edit" onSubmit={saveEdit}><div className="section-title"><div><span>PROJECT MASTER DATA</span><h2>Edit project</h2></div></div><div className="form-grid">{[["Project_Name","PROJECT NAME"],["Client_Name","CLIENT NAME"],["Phone_Number","PHONE"],["Project_Type","PROJECT TYPE"],["Location","LOCATION"],["Design_Bill","DESIGN BILL"],["Status","STATUS"],["Start_Date","START DATE"]].map(([key,label])=><Field key={key} label={label}><input type={key==="Start_Date"?"date":"text"} value={String(draft?.[key]??"")} onChange={e=>setDraft((v:any)=>({...v,[key]:e.target.value}))}/></Field>)}</div><div className="form-actions"><button type="button" onClick={remove} className="btn pc-danger">Delete project</button><button className="btn btn-dark" disabled={savingProject}>{savingProject?"Saving...":"Save changes"}</button></div></form>}

    {tab==="overview"&&<>
      <section className="pc-grid">
        <div className="pc-stat"><span>Project status</span><strong>{idOf(project,["Status","status"])||"Active"}</strong><small>{formatDate(project.Start_Date||project["Start Date"])}</small></div>
        <div className="pc-stat"><span>Workflow progress</span><strong>{progress}%</strong><small>{completed} of {WORKFLOW_STAGES.length} stages completed</small></div>
        <div className="pc-stat"><span>Outstanding</span><strong><Money value={due}/></strong><small><Money value={paid}/> received · live finance</small></div>
        <div className="pc-stat"><span>Assigned team</span><strong>{assignedPeople.length}</strong><small>{documents.length} documents · {visits.length} visits</small></div>
      </section>
      <div className="pc-two"><section className="pc-panel"><div className="pc-panel-head"><div><span>PROJECT CONTROL</span><h2>Workflow health</h2></div><button className="btn btn-small" onClick={()=>setTab("workflow")}>Open workflow →</button></div><div className="pc-progress"><span style={{width:`${progress}%`}}/></div><div className="pc-progress-copy"><span>{completed} completed</span><span>{WORKFLOW_STAGES.length-completed} remaining</span></div><div className="pc-list" style={{marginTop:16}}>{WORKFLOW_STAGES.slice(0,5).map((stage,i)=>{const t=taskMap.get(stage);const s=idOf(t||{},["Status","status"])||"Not started";return <div className="pc-row" key={stage}><div><strong>{String(i+1).padStart(2,"0")} · {stage}</strong><small>{idOf(t||{},["Assigned_Employee_ID","Assigned Employee ID"])||"Unassigned"}</small></div><span className={`pc-badge ${s==="Completed"?"green":s==="Blocked"?"red":""}`}>{s}</span></div>})}</div></section>
      <section className="pc-panel"><div className="pc-panel-head"><div><span>COMMERCIAL</span><h2>Project finance</h2></div><button className="btn btn-small" onClick={()=>setTab("finance")}>Details →</button></div><div className="pc-list"><div className="pc-row"><strong>Net billed</strong><strong><Money value={billed}/></strong></div><div className="pc-row"><strong>Total received</strong><strong><Money value={paid}/></strong></div><div className="pc-row"><strong>Outstanding</strong><strong><Money value={due}/></strong></div><div className="pc-row"><strong>Account status</strong><span className={`pc-badge ${due>0?"red":"green"}`}>{liveFinance?.status||(due>0?"Due":"Full Paid")}</span></div></div></section></div>
    </>}

    {tab==="workflow"&&<section className="pc-panel"><div className="pc-panel-head"><div><span>DELIVERY PIPELINE</span><h2>LAND VIEW project workflow</h2></div>{tasks.length<WORKFLOW_STAGES.length&&<button className="btn btn-small" disabled={initializing} onClick={initializeWorkflow}>{initializing?"Initializing...":"Initialize workflow"}</button>}</div><div className="pc-progress"><span style={{width:`${progress}%`}}/></div><div className="pc-progress-copy"><span>{completed} completed</span><span>{progress}% overall</span></div><div className="pc-workflow" style={{marginTop:16}}>{WORKFLOW_STAGES.map((stage,index)=>{const t=taskMap.get(stage);const status=idOf(t||{},["Status","status"])||"Not started";const taskId=idOf(t||{},["Task_ID","Task ID","TaskId"]);return <div className={`pc-stage ${statusClass(status)}`} key={stage}><span className="pc-num">{String(index+1).padStart(2,"0")}</span><div className="pc-stage-name"><strong>{stage}</strong><small>{taskId||"Workflow record not initialized"}</small></div>{t?<><select disabled={updatingTask===taskId} value={status} onChange={e=>updateTask(t,{Status:e.target.value})}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select><select disabled={updatingTask===taskId} value={idOf(t,["Assigned_Employee_ID","Assigned Employee ID"])} onChange={e=>updateTask(t,{Assigned_Employee_ID:e.target.value})}><option value="">Unassigned</option>{employees.map((emp:any)=>{const id=idOf(emp,["Employee_ID","Employee ID","EmployeeId"]);return <option value={id} key={id}>{id} · {idOf(emp,["Employee_Name","Employee Name","Name"])}</option>})}</select></>:<><span className="pc-badge">Not initialized</span><span/></>}</div>})}</div><p className="pc-note" style={{marginTop:14}}>Stage status and employee assignment are stored in the existing ERP Tasks records; the standalone Tasks page is not required.</p></section>}

    {tab==="team"&&<section className="pc-panel"><div className="pc-panel-head"><div><span>PEOPLE & ASSIGNMENTS</span><h2>Project team</h2></div><button className="btn btn-small" disabled={savingTeam} onClick={saveTeam}>{savingTeam?"Saving...":"Save team"}</button></div><div className="check-list">{employees.length?employees.map((e:any)=>{const id=idOf(e,["Employee_ID","Employee ID","EmployeeId"]);return <label key={id}><input type="checkbox" checked={assigned.includes(id)} onChange={ev=>setAssigned(v=>ev.target.checked?[...v,id]:v.filter(x=>x!==id))}/><span><strong>{idOf(e,["Employee_Name","Employee Name","Name"])||id}</strong><small>{id} · {idOf(e,["Position","Department"])||"Team member"}</small></span></label>}):<p className="pc-empty">No employees available.</p>}</div></section>}

    {tab==="finance"&&<section className="pc-panel"><div className="pc-panel-head"><div><span>FINANCE & ACCOUNTS</span><h2>Live commercial position</h2></div><div className="pc-actions"><span className="pc-live"><i/>Finance Summary linked</span><Link className="btn btn-small" href="/admin/finance">Open Finance →</Link></div></div><section className="pc-grid"><div className="pc-stat"><span>Net billed</span><strong><Money value={billed}/></strong><small>After discounts</small></div><div className="pc-stat"><span>Received</span><strong><Money value={paid}/></strong><small>All deposits</small></div><div className="pc-stat"><span>Outstanding</span><strong><Money value={due}/></strong><small className={due>0?"pc-status-due":"pc-status-paid"}>{liveFinance?.status||(due>0?"Due":"Full Paid")}</small></div><div className="pc-stat"><span>Collection</span><strong>{collection}%</strong><small>Received ÷ net billed</small></div></section>{liveFinance?<><div className="pc-finance-grid" style={{marginTop:14}}>{liveFinance.categories.map(category=><div className="pc-finance-card" key={category.name}><span>{category.name}</span><div className="pc-finance-line"><span>Bill</span><strong><Money value={category.bill}/></strong></div><div className="pc-finance-line"><span>Discount</span><strong><Money value={category.discount}/></strong></div><div className="pc-finance-line"><span>Deposit</span><strong><Money value={category.paid}/></strong></div><div className="pc-finance-line"><span>Due</span><strong className={category.due>0?"pc-status-due":"pc-status-paid"}><Money value={category.due}/></strong></div></div>)}</div><p className="pc-note" style={{marginTop:14}}>These figures come directly from the Finance Summary worksheet for {normalizeFinanceId(projectId)}. Updating bills, discounts or deposits in Finance will update this project after refresh.</p></>:<div className="pc-empty">No matching Finance Summary row was found for {normalizeFinanceId(projectId)}. The legacy project billing values are shown above as fallback.</div>}</section>}

    {tab==="visits"&&<section className="pc-panel"><div className="pc-panel-head"><div><span>SITE CONTROL</span><h2>Site visits</h2></div><span className="pc-badge">{visits.length} records</span></div>{visits.length?<div style={{overflowX:"auto"}}><table className="pc-table"><thead><tr><th>Date</th><th>Engineer</th><th>Purpose</th><th>Status</th></tr></thead><tbody>{visits.map((v:any,i)=><tr key={i}><td>{formatDate(v.Visit_Date||v.Date||v.Created_At)}</td><td>{idOf(v,["Employee_Name","Engineer","Visited_By"])||"—"}</td><td>{idOf(v,["Purpose","Notes","Description"])||"—"}</td><td>{idOf(v,["Status","status"])||"Recorded"}</td></tr>)}</tbody></table></div>:<div className="pc-empty">No site visits recorded for this project.</div>}</section>}

    {tab==="documents"&&<><section className="pc-panel"><div className="pc-panel-head"><div><span>DOCUMENT CONTROL</span><h2>Registered documents</h2></div><span className="pc-badge">{documents.length} files</span></div>{documents.length?<div className="pc-list">{documents.map((d:any,i)=><div className="pc-row" key={i}><div><strong>{idOf(d,["Document_Name","Document Name","Name"])||`Document ${i+1}`}</strong><small>{idOf(d,["Document_Type","Document Type","Category"])||"Project document"} · {formatDate(d.Document_Date||d.Date||d.Created_At)}</small></div>{idOf(d,["File_URL","File URL","URL"])&&<a href={idOf(d,["File_URL","File URL","URL"])} target="_blank" rel="noreferrer">Open ↗</a>}</div>)}</div>:<div className="pc-empty">No registered documents yet.</div>}</section><section className="pc-panel"><div className="pc-panel-head"><div><span>GOOGLE DRIVE</span><h2>Project service folders</h2></div></div><div className="service-grid">{PROJECT_SERVICE_FOLDERS.map(folderName=>{const folder=folderMap.get(folderName);const selected=folderFiles[folderName];return <div className="service-card" key={folderName}><div className="service-card-head"><strong>{folderName}</strong>{folder?.url&&<a href={folder.url} target="_blank" rel="noreferrer">Open folder ↗</a>}</div><div className="service-upload"><input type="file" onChange={e=>setFolderFiles(v=>({...v,[folderName]:e.target.files?.[0]||null}))}/><button disabled={!selected||uploadingFolder===folderName} onClick={()=>uploadToFolder(folderName)}>{uploadingFolder===folderName?"Uploading...":"Upload"}</button></div></div>})}</div></section></>}

    {tab==="activity"&&<section className="pc-panel"><div className="pc-panel-head"><div><span>PROJECT RECORDS</span><h2>Activity summary</h2></div></div><div className="pc-list"><div className="pc-row"><div><strong>Workflow</strong><small>Delivery stages connected to ERP task records</small></div><span className="pc-badge">{tasks.length} records</span></div><div className="pc-row"><div><strong>Documents</strong><small>Registered project files and uploads</small></div><span className="pc-badge">{documents.length}</span></div><div className="pc-row"><div><strong>Site visits</strong><small>Supervision and field records</small></div><span className="pc-badge">{visits.length}</span></div><div className="pc-row"><div><strong>Finance source</strong><small>{liveFinance?"Finance Summary worksheet linked":"Legacy billing fallback"}</small></div><span className={`pc-badge ${due>0?"red":"green"}`}>{liveFinance?.status||(due>0?"Due":"Full Paid")}</span></div><div className="pc-row"><div><strong>Assigned employees</strong><small>Current project team</small></div><span className="pc-badge">{assignedPeople.length}</span></div></div></section>}
  </div></>;
}
