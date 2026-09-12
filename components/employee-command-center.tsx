"use client";

import { useEffect, useMemo, useState } from "react";
import { landViewApi, type SessionUser } from "@/lib/api";
import styles from "@/app/admin/dashboard.module.css";

type Row = Record<string, any>;
type WorkbookData = {
  workflow?: Row[];
  assignedWorkflow?: Row[];
  unassignedWorkflow?: Row[];
  allowedProjectIds?: string[];
  employeeId?: string;
  source?: string;
  updatedAt?: string;
};

function pick(row: Row, keys: string[]) {
  for (const key of keys) if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "") return row[key];
  return "";
}
function text(value: unknown) { return String(value ?? "").trim(); }
function lower(value: unknown) { return text(value).toLowerCase(); }
function normalizeId(value: unknown) { const raw=text(value).toUpperCase(); const digits=raw.replace(/\D/g,""); return digits?`LV-${Number(digits)}`:raw; }
function projectId(row: Row) { return normalizeId(pick(row,["Project_ID","Project ID","ProjectId"])); }
function taskTitle(row: Row) { return text(pick(row,["Task_Title","Task Title","Title"])); }
function taskStatus(row: Row) { return text(pick(row,["Status","status"])) || "Pending"; }
function progressOf(row: Row) { if (lower(taskStatus(row)) === "completed") return 100; const n=Number(pick(row,["Progress","progress"])||0); return Number.isFinite(n)?Math.max(0,Math.min(100,n)):0; }
function dateText(value: unknown) { if(!value)return "—"; const d=new Date(String(value)); return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}); }
function statusClass(status:string){ const s=lower(status); if(s.includes("complete"))return styles.complete; if(s.includes("progress")||s.includes("active"))return styles.active; if(s.includes("blocked")||s.includes("hold"))return styles.paused; return styles.other; }

async function getWorkbookData(): Promise<WorkbookData> {
  const response=await fetch("/api/employee-workspace",{method:"GET",credentials:"same-origin",cache:"no-store"});
  const json=await response.json().catch(()=>null);
  if(!response.ok||!json?.success) throw new Error(String(json?.error||"Could not load LV Auto Invoice workflow."));
  return json.data||{};
}

export default function EmployeeCommandCenter(){
  const [user,setUser]=useState<SessionUser|null>(null);
  const [projects,setProjects]=useState<Row[]>([]);
  const [workflow,setWorkflow]=useState<Row[]>([]);
  const [visits,setVisits]=useState<Row[]>([]);
  const [documents,setDocuments]=useState<Row[]>([]);
  const [attendance,setAttendance]=useState<Row[]>([]);
  const [drawings,setDrawings]=useState<Row[]>([]);
  const [source,setSource]=useState("LV - Auto Invoice / Workflow");
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState("");
  const [workbookWarning,setWorkbookWarning]=useState("");
  const [query,setQuery]=useState("");
  const [updated,setUpdated]=useState<Date|null>(null);

  async function load(silent=false){
    if(silent)setRefreshing(true); else setLoading(true);
    setError(""); setWorkbookWarning("");
    try{
      const [session,p,v,d,a,dr,book,legacyTasks]=await Promise.all([
        landViewApi.getSession().catch(()=>null),
        landViewApi.getProjects().catch(()=>[]),
        landViewApi.getSiteVisits().catch(()=>[]),
        landViewApi.getDocuments().catch(()=>[]),
        landViewApi.getErpRecords("attendance").catch(()=>[]),
        landViewApi.getErpRecords("drawings").catch(()=>[]),
        getWorkbookData().catch((e)=>({__error:e instanceof Error?e.message:"Workbook unavailable"} as any)),
        landViewApi.getErpRecords("tasks").catch(()=>[]),
      ]);
      setUser(session?.user||null); setProjects(p||[]); setVisits(v||[]); setDocuments(d||[]); setAttendance(a||[]); setDrawings(dr||[]);
      if((book as any).__error){
        setWorkflow(legacyTasks||[]);
        setSource("Management Tasks fallback");
        setWorkbookWarning(`${(book as any).__error} Showing the management Tasks sheet until the Apps Script update is deployed.`);
      }else{
        setWorkflow((book as WorkbookData).workflow||[]);
        setSource((book as WorkbookData).source||"LV - Auto Invoice / Workflow");
      }
      setUpdated(new Date());
    }catch(e:any){ setError(e?.message||"Unable to load employee command center."); }
    finally{setLoading(false);setRefreshing(false);}
  }
  useEffect(()=>{void load();},[]);

  const activeProjects=useMemo(()=>projects.filter(p=>!["completed","inactive","cancelled"].includes(lower(pick(p,["Status","status"])))),[projects]);
  const openWorkflow=useMemo(()=>workflow.filter(t=>lower(taskStatus(t))!=="completed"),[workflow]);
  const completed=workflow.length-openWorkflow.length;
  const overall=workflow.length?Math.round(workflow.reduce((s,t)=>s+progressOf(t),0)/workflow.length):0;
  const overdue=useMemo(()=>{const today=new Date();today.setHours(0,0,0,0);return openWorkflow.filter(t=>{const raw=pick(t,["Due_Date","Due Date"]);if(!raw)return false;const d=new Date(String(raw));return !Number.isNaN(d.getTime())&&d<today;});},[openWorkflow]);
  const name=text(user?.name||user?.Name||user?.username||user?.Username)||"Employee";
  const employeeId=text(user?.employeeId||user?.Employee_ID||user?.userId||user?.User_ID)||"—";
  const term=query.trim().toLowerCase();
  const filteredProjects=projects.filter(p=>[projectId(p),pick(p,["Project_Name","Project Name","Client_Name"]),pick(p,["Location","Project_Location"]),pick(p,["Status","status"])].join(" ").toLowerCase().includes(term));
  const priority=[...openWorkflow].sort((a,b)=>text(pick(a,["Due_Date"])).localeCompare(text(pick(b,["Due_Date"])))).slice(0,6);

  if(loading)return <div className={styles.skeleton} role="status"><span/><span/><span/><span/><span/><span/></div>;

  return <div className={styles.root} id="dashboard">
    <style>{`
      .ec-section{scroll-margin-top:130px}.ec-grid2{display:grid;grid-template-columns:1.35fr .9fr;gap:20px}.ec-list{display:grid;gap:10px;margin-top:18px}.ec-row{display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:12px;padding:13px 14px;border:1px solid #3d3d3d;border-radius:9px;background:#252525;color:#f2f2f2}.ec-row strong,.ec-row small{display:block}.ec-row strong{font-size:12px}.ec-row small{margin-top:4px;color:#aaa;font-size:10px}.ec-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:8px;background:#3a2c2b;color:#ff8479;font-size:10px;font-weight:800}.ec-progress{height:6px;margin-top:8px;border-radius:999px;background:#3d3d3d;overflow:hidden}.ec-progress span{display:block;height:100%;background:#ef493b}.ec-mini{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:18px}.ec-mini div{padding:14px;border:1px solid #3d3d3d;border-radius:9px;background:#252525}.ec-mini span{font-size:9px;color:#999}.ec-mini strong{display:block;margin-top:7px;font-size:22px;color:#fff}.ec-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:18px}.ec-card{padding:14px;border:1px solid #3d3d3d;border-radius:9px;background:#252525}.ec-card strong{display:block;color:#f3f3f3;font-size:11px}.ec-card small{display:block;margin-top:5px;color:#999;font-size:9px}.ec-card a{display:inline-block;margin-top:10px;color:#ff8479;font-size:10px}.ec-warning{padding:11px 13px;border:1px solid #6b5931;background:#463b24;color:#f0d38c;border-radius:9px;font-size:10px}@media(max-width:1000px){.ec-grid2{grid-template-columns:1fr}}@media(max-width:650px){.ec-mini,.ec-cards{grid-template-columns:1fr}.ec-row{grid-template-columns:34px minmax(0,1fr)}}
    `}</style>

    <header className={styles.header}>
      <div><span className={styles.eyebrow}>LAND VIEW TEAM</span><h1>My work<span>.</span></h1><span className={styles.timestamp}>{refreshing?"Updating your assignments…":updated?`Updated ${updated.toLocaleTimeString("en-BD",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Dhaka"})} · ${name} · ${employeeId}`:"Employee workspace"}</span></div>
      <div className={styles.actions}><button type="button" className={styles.refresh} onClick={()=>void load(true)} disabled={refreshing}><span>↻</span>{refreshing?"Updating…":"Refresh"}</button></div>
    </header>

    {error&&<div className={styles.error}>{error}</div>}{workbookWarning&&<div className="ec-warning">{workbookWarning}</div>}

    <section className={styles.metrics}>
      <a href="#projects" className={styles.metric}><span className={styles.metricTitle}>Assigned projects <i>↗</i></span><strong>{projects.length}</strong><small>{activeProjects.length} active assignments</small></a>
      <a href="#workflow" className={styles.metric}><span className={styles.metricTitle}>Required services <i>↗</i></span><strong>{workflow.length}</strong><small>Services for your assignments</small></a>
      <a href="#workflow" className={`${styles.metric} ${overdue.length?styles.dueMetric:""}`}><span className={styles.metricTitle}>Open services <i>↗</i></span><strong>{openWorkflow.length}</strong><small>{overdue.length} overdue</small></a>
      <a href="#workflow" className={styles.metric}><span className={styles.metricTitle}>Delivery progress <i>↗</i></span><strong>{overall}%</strong><small>{completed}/{workflow.length} completed</small></a>
      <a href="#visits" className={styles.metric}><span className={styles.metricTitle}>Site visits <i>↗</i></span><strong>{visits.length}</strong><small>Recorded site visits</small></a>
      <a href="#records" className={styles.metric}><span className={styles.metricTitle}>Project records <i>↗</i></span><strong>{documents.length}</strong><small>{drawings.length} drawing records</small></a>
    </section>

    <section className={styles.moduleGrid}>
      <a href="#projects" className={styles.moduleCard}><span className={styles.moduleIcon}>01</span><div><small>CORE OPERATIONS</small><strong>My projects</strong><p>Projects assigned to this employee account.</p></div><b>→</b></a>
      <a href="#workflow" className={styles.moduleCard}><span className={styles.moduleIcon}>02</span><div><small>LV AUTO INVOICE</small><strong>Billing-driven workflow</strong><p>Required project services and saved completion status from the Excel Workflow tab.</p></div><b>→</b></a>
      <a href="#records" className={styles.moduleCard}><span className={styles.moduleIcon}>03</span><div><small>FIELD & FILES</small><strong>Operational records</strong><p>Site visits, documents, drawings and attendance from management sheets.</p></div><b>→</b></a>
    </section>

    <div className="ec-grid2">
      <section className={styles.attentionPanel}><div className={styles.panelTop}><div><small className={styles.panelKicker}>MY PRIORITIES</small><h2>Delivery queue</h2></div><strong className={styles.attentionBadge}>{openWorkflow.length}</strong></div><div className="ec-list">{priority.map((task,index)=>{const p=progressOf(task);return <a href="#workflow" className="ec-row" key={text(task.Task_ID)||`${projectId(task)}-${taskTitle(task)}-${index}`}><span className="ec-icon">{String(index+1).padStart(2,"0")}</span><div><strong>{taskTitle(task)||"Project service"}</strong><small>{projectId(task)||"—"} · {text(pick(task,["Project_Name"]))||"LAND VIEW Project"} · due {dateText(pick(task,["Due_Date"]))}</small><div className="ec-progress"><span style={{width:`${p}%`}}/></div></div><b>{p}%</b></a>})}{!priority.length&&<div className="ec-row"><span className="ec-icon">✓</span><div><strong>No open workflow</strong><small>All required services are complete.</small></div></div>}</div></section>
      <section className={styles.healthPanel}><div className={styles.panelTop}><div><small className={styles.panelKicker}>EXCEL CONNECTION</small><h2>Delivery health</h2></div><strong>{overall}%</strong></div><div className={styles.healthBar}><span style={{width:`${overall}%`}}/></div><div className="ec-mini"><div><span>Completed</span><strong>{completed}</strong></div><div><span>Open</span><strong>{openWorkflow.length}</strong></div><div><span>Overdue</span><strong>{overdue.length}</strong></div></div><p>Workflow source: {source}. Project access remains limited by this employee account.</p></section>
    </div>

    <section id="projects" className={`${styles.projects} ec-section`}><div className={styles.projectHeader}><div><small className={styles.panelKicker}>ASSIGNED ACCESS</small><h2>My projects <span>{projects.length}</span></h2></div><div className={styles.projectTools}><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search project, client, location…"/></div></div><div className={styles.tableWrap}><table><thead><tr><th>File ID</th><th>Project / Client</th><th>Location</th><th>Status</th></tr></thead><tbody>{filteredProjects.map((p,index)=>{const id=projectId(p);const status=text(pick(p,["Status","status"]))||"Active";return <tr key={id||index}><td><strong>{id||"—"}</strong></td><td><span className={styles.projectName}>{text(pick(p,["Project_Name","Project Name","Client_Name"]))||"LAND VIEW Project"}</span></td><td>{text(pick(p,["Location","Project_Location"]))||"—"}</td><td><span className={`${styles.status} ${statusClass(status)}`}><i/>{status}</span></td></tr>})}</tbody></table>{!filteredProjects.length&&<div className={styles.empty}><h3>No assigned projects found</h3></div>}</div></section>

    <section id="workflow" className={`${styles.projects} ec-section`}><div className={styles.projectHeader}><div><small className={styles.panelKicker}>LV AUTO INVOICE · WORKFLOW</small><h2>Billing-driven delivery <span>{workflow.length}</span></h2></div><div className={styles.projectTools}><span style={{fontSize:10,color:"#999"}}>{source}</span></div></div><div className={styles.tableWrap}><table><thead><tr><th>Project</th><th>Service</th><th>Assigned</th><th>Status</th><th>Progress</th><th>Due</th></tr></thead><tbody>{workflow.map((t,index)=>{const status=taskStatus(t);return <tr key={text(t.Task_ID)||index}><td><strong>{projectId(t)||"—"}</strong><small>{text(pick(t,["Project_Name"]))}</small></td><td><span className={styles.projectName}>{taskTitle(t)||"Project service"}</span></td><td>{text(pick(t,["Assigned_Employee_ID"]))||"Unassigned"}</td><td><span className={`${styles.status} ${statusClass(status)}`}><i/>{status}</span></td><td>{progressOf(t)}%</td><td>{dateText(pick(t,["Due_Date"]))}</td></tr>})}</tbody></table>{!workflow.length&&<div className={styles.empty}><h3>No billed workflow services found for assigned projects</h3></div>}</div></section>

    <div id="records" className="ec-grid2 ec-section">
      <section id="visits" className={styles.attentionPanel}><div className={styles.panelTop}><div><small className={styles.panelKicker}>FIELD OPERATIONS</small><h2>Site visits</h2></div><strong className={styles.attentionBadge}>{visits.length}</strong></div><div className="ec-list">{visits.slice(-8).reverse().map((v,index)=><div className="ec-row" key={text(pick(v,["Visit_ID"]))||index}><span className="ec-icon">⌖</span><div><strong>{projectId(v)||"Project"}</strong><small>{text(pick(v,["Visit_Type","Visit_Purpose","Purpose"]))||"Site visit"} · {dateText(pick(v,["Visit_Date","Date"]))}</small></div><b>{text(pick(v,["Progress"]))||""}</b></div>)}{!visits.length&&<div className="ec-row"><span className="ec-icon">—</span><div><strong>No site visits</strong></div></div>}</div></section>
      <section id="attendance" className={styles.healthPanel}><div className={styles.panelTop}><div><small className={styles.panelKicker}>TIME & ATTENDANCE</small><h2>Recent attendance</h2></div><strong>{attendance.length}</strong></div><div className="ec-list">{attendance.slice(-6).reverse().map((a,index)=><div className="ec-row" key={text(pick(a,["Attendance_ID"]))||index}><span className="ec-icon">◷</span><div><strong>{dateText(pick(a,["Attendance_Date","Date"]))}</strong><small>{text(pick(a,["Check_In"]))||"—"} – {text(pick(a,["Check_Out"]))||"—"}</small></div><b>{text(pick(a,["Status"]))||"Present"}</b></div>)}{!attendance.length&&<div className="ec-row"><span className="ec-icon">—</span><div><strong>No attendance records</strong></div></div>}</div></section>
    </div>

    <section id="documents" className={`${styles.collection} ec-section`}><div className={styles.panelTop}><div><small className={styles.panelKicker}>PROJECT FILES</small><h2>Documents & drawings</h2></div><span>{documents.length + drawings.length} records</span></div><div className="ec-cards">{documents.slice(-6).reverse().map((d,index)=>{const url=text(pick(d,["File_URL","URL","Document_URL"]));return <div className="ec-card" key={text(pick(d,["Document_ID"]))||index}><strong>{text(pick(d,["Document_Name","Name","File_Name"]))||"Document"}</strong><small>{projectId(d)||"Project"} · {dateText(pick(d,["Document_Date","Created_At"]))}</small>{url&&<a href={url} target="_blank" rel="noreferrer">Open file ↗</a>}</div>})}{drawings.slice(-6).reverse().map((d,index)=>{const url=text(pick(d,["Drive_URL","File_URL","URL"]));return <div className="ec-card" key={`drawing-${text(pick(d,["Drawing_ID"]))||index}`}><strong>{text(pick(d,["Drawing_Title","Title"]))||"Drawing"}</strong><small>{projectId(d)||"Project"} · Rev {text(pick(d,["Revision"]))||"—"}</small>{url&&<a href={url} target="_blank" rel="noreferrer">Open drawing ↗</a>}</div>})}{!documents.length&&!drawings.length&&<div className="ec-card"><strong>No project files available</strong></div>}</div></section>
  </div>;
}
