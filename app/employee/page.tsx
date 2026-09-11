"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { landViewApi, type SessionUser } from "@/lib/api";
import styles from "../admin/dashboard.module.css";

type Row = Record<string, any>;

function pick(row: Row, keys: string[]) {
  for (const key of keys) if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "") return row[key];
  return "";
}
function text(value: unknown) { return String(value ?? "").trim(); }
function lower(value: unknown) { return text(value).toLowerCase(); }
function projectId(row: Row) { return text(pick(row,["Project_ID","Project ID","ProjectId"])); }
function taskTitle(row: Row) { return text(pick(row,["Task_Title","Task Title","Title"])); }
function taskStatus(row: Row) { return text(pick(row,["Status","status"])) || "Pending"; }
function progressOf(row: Row) { if (lower(taskStatus(row)) === "completed") return 100; const n = Number(pick(row,["Progress","progress"]) || 0); return Number.isFinite(n) ? Math.max(0,Math.min(100,n)) : 0; }
function dateText(value: any) { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}); }
function statusClass(status:string){ const s=lower(status); if(s.includes("complete"))return styles.complete; if(s.includes("progress")||s.includes("active"))return styles.active; if(s.includes("blocked")||s.includes("hold"))return styles.paused; return styles.other; }

export default function EmployeePortalPage() {
  const [user,setUser]=useState<SessionUser|null>(null);
  const [projects,setProjects]=useState<Row[]>([]);
  const [documents,setDocuments]=useState<Row[]>([]);
  const [visits,setVisits]=useState<Row[]>([]);
  const [tasks,setTasks]=useState<Row[]>([]);
  const [attendance,setAttendance]=useState<Row[]>([]);
  const [drawings,setDrawings]=useState<Row[]>([]);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [updated,setUpdated]=useState<Date|null>(null);

  async function load(silent=false){
    if(silent)setRefreshing(true); else setLoading(true);
    setError("");
    try{
      const [session,p,d,v,t,a,dr]=await Promise.all([
        landViewApi.getSession().catch(()=>null),
        landViewApi.getProjects(),
        landViewApi.getDocuments(),
        landViewApi.getSiteVisits(),
        landViewApi.getErpRecords("tasks"),
        landViewApi.getErpRecords("attendance"),
        landViewApi.getErpRecords("drawings"),
      ]);
      setUser(session?.user||null); setProjects(p||[]); setDocuments(d||[]); setVisits(v||[]); setTasks(t||[]); setAttendance(a||[]); setDrawings(dr||[]); setUpdated(new Date());
    }catch(e:any){setError(e?.message||"Unable to load employee command center.");}
    finally{setLoading(false);setRefreshing(false);}
  }
  useEffect(()=>{void load();},[]);

  const activeProjects=useMemo(()=>projects.filter(p=>!["completed","inactive","cancelled"].includes(lower(pick(p,["Status","status"])))),[projects]);
  const openTasks=useMemo(()=>tasks.filter(t=>lower(taskStatus(t))!=="completed"),[tasks]);
  const completedTasks=tasks.length-openTasks.length;
  const overallProgress=tasks.length?Math.round(tasks.reduce((s,t)=>s+progressOf(t),0)/tasks.length):0;
  const overdueTasks=useMemo(()=>{const today=new Date();today.setHours(0,0,0,0);return openTasks.filter(t=>{const raw=pick(t,["Due_Date","Due Date"]);if(!raw)return false;const d=new Date(raw);return !Number.isNaN(d.getTime())&&d<today;});},[openTasks]);
  const name=text(user?.name||user?.Name||user?.username||user?.Username)||"Employee";
  const employeeId=text(user?.employeeId||user?.Employee_ID||user?.userId||user?.User_ID)||"—";
  const term=query.trim().toLowerCase();
  const filteredProjects=projects.filter(p=>[projectId(p),pick(p,["Project_Name","Project Name","Client_Name"]),pick(p,["Location","Project_Location"]),pick(p,["Status","status"])].join(" ").toLowerCase().includes(term));
  const recentWork=[...openTasks].sort((a,b)=>String(pick(a,["Due_Date"])).localeCompare(String(pick(b,["Due_Date"])))).slice(0,5);

  if(loading)return <div className={styles.skeleton} role="status" aria-label="Loading employee dashboard"><span/><span/><span/><span/><span/><span/></div>;

  return <div className={styles.root} id="dashboard">
    <style>{`
      .employee-section{scroll-margin-top:120px}.employee-stack{display:grid;gap:20px}.employee-list{display:grid;gap:10px;margin-top:18px}.employee-list-row{display:grid;grid-template-columns:38px minmax(0,1fr) auto;align-items:center;gap:12px;padding:13px 14px;border:1px solid #3d3d3d;border-radius:9px;background:#252525;color:#f2f2f2}.employee-list-row strong,.employee-list-row small{display:block}.employee-list-row strong{font-size:12px}.employee-list-row small{margin-top:4px;color:#aaa;font-size:10px}.employee-list-row b{font-size:10px;color:#ccc}.employee-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:8px;background:#3a2c2b;color:#ff8479;font-size:11px;font-weight:800}.employee-progress{height:6px;margin-top:8px;border-radius:999px;background:#3d3d3d;overflow:hidden}.employee-progress span{display:block;height:100%;background:#ef493b}.employee-grid2{display:grid;grid-template-columns:1.35fr .9fr;gap:20px}.employee-mini-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:18px}.employee-mini{padding:15px;border:1px solid #3d3d3d;border-radius:9px;background:#252525}.employee-mini span{display:block;font-size:9px;color:#999}.employee-mini strong{display:block;margin-top:8px;font-size:22px;color:#fff}.employee-actions{display:grid;gap:8px;margin-top:16px}.employee-actions a{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 14px;border-top:1px solid #3d3d3d;color:#ededed}.employee-actions a:hover{color:#ff8479}.employee-doc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:18px}.employee-doc{padding:14px;border:1px solid #3d3d3d;border-radius:9px;background:#252525}.employee-doc strong{display:block;font-size:11px;color:#f3f3f3}.employee-doc small{display:block;margin-top:5px;font-size:9px;color:#999}.employee-doc a{display:inline-block;margin-top:10px;font-size:10px;color:#ff8479}@media(max-width:1000px){.employee-grid2{grid-template-columns:1fr}.employee-mini-grid{grid-template-columns:1fr 1fr}}@media(max-width:650px){.employee-mini-grid,.employee-doc-grid{grid-template-columns:1fr}.employee-list-row{grid-template-columns:34px minmax(0,1fr)}}
    `}</style>

    <header className={styles.header}>
      <div>
        <span className={styles.eyebrow}>LAND VIEW EMPLOYEE ERP</span>
        <h1>Command center<span aria-hidden="true">.</span></h1>
        <span className={styles.timestamp}>{refreshing?"Updating employee workspace…":updated?`Updated ${updated.toLocaleTimeString("en-BD",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Dhaka"})} · Dhaka`:`${name} · ${employeeId}`}</span>
      </div>
      <div className={styles.actions}><button type="button" className={styles.refresh} onClick={()=>void load(true)} disabled={refreshing}><span>↻</span>{refreshing?"Updating…":"Refresh"}</button></div>
    </header>

    {error&&<div className={styles.error}>{error}</div>}

    <section className={styles.metrics} aria-label="Employee work totals">
      <a href="#projects" className={styles.metric}><span className={styles.metricTitle}>Assigned projects <i>↗</i></span><strong>{projects.length}</strong><small>{activeProjects.length} active assignments</small></a>
      <a href="#workflow" className={styles.metric}><span className={styles.metricTitle}>Open workflow <i>↗</i></span><strong>{openTasks.length}</strong><small>{completedTasks} service{completedTasks===1?"":"s"} completed</small></a>
      <a href="#workflow" className={`${styles.metric} ${overdueTasks.length?styles.dueMetric:""}`}><span className={styles.metricTitle}>Overdue <i>↗</i></span><strong>{overdueTasks.length}</strong><small>Workflow items needing attention</small></a>
      <a href="#workflow" className={styles.metric}><span className={styles.metricTitle}>Delivery progress <i>↗</i></span><strong>{overallProgress}%</strong><small>Across assigned services</small></a>
      <a href="#visits" className={styles.metric}><span className={styles.metricTitle}>Site visits <i>↗</i></span><strong>{visits.length}</strong><small>Recorded site activity</small></a>
      <a href="#documents" className={styles.metric}><span className={styles.metricTitle}>Project files <i>↗</i></span><strong>{documents.length}</strong><small>{drawings.length} drawing record{drawings.length===1?"":"s"}</small></a>
    </section>

    <section className={styles.moduleGrid} aria-label="Employee modules">
      <a href="#projects" className={styles.moduleCard}><span className={styles.moduleIcon}>01</span><div><small>CORE OPERATIONS</small><strong>My projects</strong><p>Assigned project register, location and current project status.</p></div><b>→</b></a>
      <a href="#workflow" className={styles.moduleCard}><span className={styles.moduleIcon}>02</span><div><small>DELIVERY</small><strong>Workflow control</strong><p>Services, deadlines, progress and completion status.</p></div><b>→</b></a>
      <a href="#visits" className={styles.moduleCard}><span className={styles.moduleIcon}>03</span><div><small>FIELD OPERATIONS</small><strong>Site & records</strong><p>Site visits, project documents, drawings and attendance.</p></div><b>→</b></a>
    </section>

    <div className="employee-grid2">
      <section className={styles.attentionPanel}>
        <div className={styles.panelTop}><div><small className={styles.panelKicker}>MY PRIORITIES</small><h2>Work queue</h2></div><strong className={styles.attentionBadge}>{openTasks.length}</strong></div>
        <div className="employee-list">{recentWork.map((task,index)=>{const p=progressOf(task);return <a href="#workflow" className="employee-list-row" key={text(task.Task_ID)||index}><span className="employee-icon">{String(index+1).padStart(2,"0")}</span><div><strong>{taskTitle(task)||"Workflow service"}</strong><small>{projectId(task)||"General"} · due {dateText(pick(task,["Due_Date","Due Date"]))}</small><div className="employee-progress"><span style={{width:`${p}%`}}/></div></div><b>{p}%</b></a>})}{!recentWork.length&&<div className="employee-list-row"><span className="employee-icon">✓</span><div><strong>No open workflow</strong><small>Your assigned delivery queue is clear.</small></div></div>}</div>
      </section>
      <section className={styles.healthPanel}>
        <div className={styles.panelTop}><div><small className={styles.panelKicker}>WORK HEALTH</small><h2>Delivery score</h2></div><strong>{overallProgress}%</strong></div>
        <div className={styles.healthBar}><span style={{width:`${overallProgress}%`}}/></div>
        <div className="employee-mini-grid"><div className="employee-mini"><span>Completed</span><strong>{completedTasks}</strong></div><div className="employee-mini"><span>Open</span><strong>{openTasks.length}</strong></div><div className="employee-mini"><span>Overdue</span><strong>{overdueTasks.length}</strong></div></div>
        <p>{name} · Employee ID {employeeId}. Progress is calculated from workflow services assigned to this account.</p>
      </section>
    </div>

    <section id="projects" className={`${styles.projects} employee-section`}>
      <div className={styles.projectHeader}><div><small className={styles.panelKicker}>ASSIGNED ACCESS</small><h2>My projects <span>{projects.length}</span></h2></div><div className={styles.projectTools}><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search project, client, location…"/></div></div>
      <div className={styles.tableWrap}><table><thead><tr><th>File ID</th><th>Project / Client</th><th>Location</th><th>Status</th></tr></thead><tbody>{filteredProjects.map((p,index)=>{const id=projectId(p);const status=text(pick(p,["Status","status"]))||"Active";return <tr key={id||index}><td><strong>{id||"—"}</strong></td><td><span className={styles.projectName}>{text(pick(p,["Project_Name","Project Name","Client_Name"]))||"LAND VIEW Project"}</span></td><td>{text(pick(p,["Location","Project_Location"]))||"—"}</td><td><span className={`${styles.status} ${statusClass(status)}`}><i/>{status}</span></td></tr>})}</tbody></table>{!filteredProjects.length&&<div className={styles.empty}><h3>No assigned projects found</h3></div>}</div>
    </section>

    <section id="workflow" className={`${styles.projects} employee-section`}>
      <div className={styles.projectHeader}><div><small className={styles.panelKicker}>BILLING-DRIVEN DELIVERY</small><h2>My workflow <span>{tasks.length}</span></h2></div><div className={styles.projectTools}><a href="#dashboard">Back to top ↑</a></div></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Project</th><th>Service</th><th>Status</th><th>Progress</th><th>Due date</th></tr></thead><tbody>{tasks.map((t,index)=>{const status=taskStatus(t);const p=progressOf(t);return <tr key={text(t.Task_ID)||index}><td><strong>{projectId(t)||"—"}</strong></td><td><span className={styles.projectName}>{taskTitle(t)||"Workflow service"}</span></td><td><span className={`${styles.status} ${statusClass(status)}`}><i/>{status}</span></td><td>{p}%</td><td>{dateText(pick(t,["Due_Date","Due Date"]))}</td></tr>})}</tbody></table>{!tasks.length&&<div className={styles.empty}><h3>No workflow services assigned</h3></div>}</div>
    </section>

    <div className="employee-grid2">
      <section id="visits" className={`${styles.attentionPanel} employee-section`}><div className={styles.panelTop}><div><small className={styles.panelKicker}>FIELD OPERATIONS</small><h2>Site visits</h2></div><strong className={styles.attentionBadge}>{visits.length}</strong></div><div className="employee-list">{visits.slice(-8).reverse().map((v,index)=><div className="employee-list-row" key={text(pick(v,["Visit_ID"]))||index}><span className="employee-icon">⌖</span><div><strong>{projectId(v)||"Project"}</strong><small>{text(pick(v,["Visit_Purpose","Purpose","Visit_Type"]))||"Site visit"} · {dateText(pick(v,["Visit_Date","Date"]))}</small></div><b>{text(pick(v,["Progress","Site_Condition"]))||"Recorded"}</b></div>)}</div></section>
      <section id="attendance" className={`${styles.healthPanel} employee-section`}><div className={styles.panelTop}><div><small className={styles.panelKicker}>TIME & ATTENDANCE</small><h2>Recent attendance</h2></div><strong>{attendance.length}</strong></div><div className="employee-list">{attendance.slice(-6).reverse().map((a,index)=><div className="employee-list-row" key={text(a.Attendance_ID)||index}><span className="employee-icon">◷</span><div><strong>{dateText(pick(a,["Attendance_Date","Date"]))}</strong><small>{text(pick(a,["Check_In"]))||"—"} – {text(pick(a,["Check_Out"]))||"—"}</small></div><b>{text(pick(a,["Status"]))||"Present"}</b></div>)}</div></section>
    </div>

    <section id="documents" className={`${styles.collection} employee-section`}>
      <div className={styles.panelTop}><div><small className={styles.panelKicker}>PROJECT FILES</small><h2>Documents & drawings</h2></div><span>{documents.length+drawings.length} records</span></div>
      <div className="employee-doc-grid">{documents.slice(-8).reverse().map((d,index)=>{const url=text(pick(d,["File_URL","URL","Document_URL"]));return <div className="employee-doc" key={text(pick(d,["Document_ID"]))||index}><strong>{text(pick(d,["Document_Name","Name","File_Name"]))||"Project document"}</strong><small>{projectId(d)||"Project"} · {dateText(pick(d,["Document_Date","Created_At"]))}</small>{url&&<a href={url} target="_blank" rel="noreferrer">Open file ↗</a>}</div>})}{drawings.slice(-6).reverse().map((d,index)=>{const url=text(pick(d,["Drive_URL","File_URL","URL"]));return <div className="employee-doc" key={`drawing-${text(d.Drawing_ID)||index}`}><strong>{text(pick(d,["Drawing_Title","Title"]))||"Drawing"}</strong><small>{projectId(d)||"Project"} · Rev {text(pick(d,["Revision"]))||"—"}</small>{url&&<a href={url} target="_blank" rel="noreferrer">Open drawing ↗</a>}</div>})}</div>
    </section>
  </div>;
}
