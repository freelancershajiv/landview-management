"use client";

import { useEffect, useMemo, useState } from "react";
import { landViewApi, type SessionUser } from "@/lib/api";

type Row = Record<string, any>;
type Tab = "dashboard" | "projects" | "workflow" | "visits" | "documents" | "attendance";

function pick(row: Row, keys: string[]) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "") return row[key];
  }
  return "";
}

function text(value: unknown) { return String(value ?? "").trim(); }
function lower(value: unknown) { return text(value).toLowerCase(); }
function dateText(value: any) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" });
}
function projectId(row: Row) { return text(pick(row,["Project_ID","Project ID","ProjectId"])); }
function taskTitle(row: Row) { return text(pick(row,["Task_Title","Task Title","Title"])); }
function taskStatus(row: Row) { return text(pick(row,["Status","status"])) || "Pending"; }
function progressOf(row: Row) {
  if (taskStatus(row).toLowerCase() === "completed") return 100;
  const n = Number(pick(row,["Progress","progress"]) || 0);
  return Number.isFinite(n) ? Math.max(0,Math.min(100,n)) : 0;
}

export default function EmployeePortalPage() {
  const [tab,setTab] = useState<Tab>("dashboard");
  const [user,setUser] = useState<SessionUser|null>(null);
  const [projects,setProjects] = useState<Row[]>([]);
  const [documents,setDocuments] = useState<Row[]>([]);
  const [visits,setVisits] = useState<Row[]>([]);
  const [tasks,setTasks] = useState<Row[]>([]);
  const [attendance,setAttendance] = useState<Row[]>([]);
  const [drawings,setDrawings] = useState<Row[]>([]);
  const [query,setQuery] = useState("");
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [refreshing,setRefreshing] = useState(false);

  async function load(silent=false) {
    if (silent) setRefreshing(true); else setLoading(true);
    setError("");
    try {
      const [session,p,d,v,t,a,drawingRows] = await Promise.all([
        landViewApi.getSession().catch(()=>null),
        landViewApi.getProjects(),
        landViewApi.getDocuments(),
        landViewApi.getSiteVisits(),
        landViewApi.getErpRecords("tasks"),
        landViewApi.getErpRecords("attendance"),
        landViewApi.getErpRecords("drawings"),
      ]);
      setUser(session?.user||null);
      setProjects(p||[]);
      setDocuments(d||[]);
      setVisits(v||[]);
      setTasks(t||[]);
      setAttendance(a||[]);
      setDrawings(drawingRows||[]);
    } catch (err:any) {
      setError(err?.message||"Unable to load employee workspace.");
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }

  useEffect(()=>{ void load(); },[]);

  const activeProjects = useMemo(()=>projects.filter(p=>!["completed","inactive","cancelled"].includes(lower(pick(p,["Status","status"])))),[projects]);
  const openTasks = useMemo(()=>tasks.filter(t=>lower(taskStatus(t))!=="completed"),[tasks]);
  const completedTasks = tasks.length-openTasks.length;
  const overallProgress = tasks.length ? Math.round(tasks.reduce((s,t)=>s+progressOf(t),0)/tasks.length) : 0;
  const overdueTasks = useMemo(()=>{
    const today = new Date(); today.setHours(0,0,0,0);
    return openTasks.filter(t=>{ const raw=pick(t,["Due_Date","Due Date"]); if(!raw)return false; const d=new Date(raw); return !Number.isNaN(d.getTime())&&d<today; });
  },[openTasks]);

  const employeeName = text(user?.name||user?.Name||user?.username||user?.Username)||"Employee";
  const employeeId = text(user?.employeeId||user?.Employee_ID||user?.userId||user?.User_ID)||"—";
  const term=query.trim().toLowerCase();
  const filterRows=(rows:Row[], fields:(row:Row)=>string)=>!term?rows:rows.filter(r=>fields(r).toLowerCase().includes(term));

  const filteredProjects=filterRows(projects,p=>[projectId(p),pick(p,["Project_Name","Project Name","Client_Name"]),pick(p,["Location","Project_Location"]),pick(p,["Status","status"])].join(" "));
  const filteredTasks=filterRows(tasks,t=>[projectId(t),taskTitle(t),taskStatus(t),pick(t,["Assigned_Employee_ID","Assigned Employee ID"])].join(" "));
  const filteredVisits=filterRows(visits,v=>[projectId(v),pick(v,["Visit_Purpose","Purpose","Visit_Type"]),pick(v,["Observations","Instructions"])].join(" "));
  const filteredDocs=filterRows(documents,d=>[projectId(d),pick(d,["Document_Name","Name","File_Name"]),pick(d,["Document_Type","Type"])].join(" "));
  const filteredAttendance=filterRows(attendance,a=>[pick(a,["Attendance_Date","Date"]),pick(a,["Status"]),pick(a,["Check_In"]),pick(a,["Check_Out"])].join(" "));

  if (loading) return <div className="role-portal-status">Loading employee command center…</div>;

  const tabs:Array<[Tab,string,string]> = [
    ["dashboard","Dashboard","⌂"],
    ["projects","My Projects","▣"],
    ["workflow","Workflow","✓"],
    ["visits","Site Visits","⌖"],
    ["documents","Documents","▤"],
    ["attendance","Attendance","◷"],
  ];

  return <>
    <style>{`
      .ep{display:grid;gap:18px}.ep-hero{position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.08);background:linear-gradient(135deg,#171717 0%,#202020 62%,#281d1c 100%);border-radius:18px;padding:26px}.ep-hero:after{content:"";position:absolute;width:220px;height:220px;border-radius:50%;right:-70px;top:-90px;background:rgba(239,73,59,.12);filter:blur(2px)}.ep-eyebrow{color:#ef6659;font-size:9px;font-weight:900;letter-spacing:.14em}.ep-hero h1{margin:7px 0 6px;font-size:28px;color:#fff}.ep-hero p{margin:0;color:#969696;font-size:11px}.ep-hero-meta{display:flex;gap:9px;flex-wrap:wrap;margin-top:18px}.ep-chip{padding:7px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.1);background:#151515;color:#bbb;font-size:9px}.ep-chip b{color:#fff}.ep-top-actions{position:absolute;right:22px;bottom:22px;z-index:2}.ep-refresh{border:1px solid rgba(255,255,255,.12);background:#232323;color:#ddd;border-radius:8px;padding:9px 11px;font-size:9px;font-weight:800;cursor:pointer}.ep-refresh:hover{border-color:#ef493b;color:#fff}.ep-tabs{display:flex;gap:7px;overflow:auto;padding:6px;border:1px solid rgba(255,255,255,.08);background:#171717;border-radius:13px;position:sticky;top:8px;z-index:10}.ep-tabs button{display:flex;align-items:center;gap:7px;border:0;background:transparent;color:#999;padding:10px 12px;border-radius:8px;font-size:9px;font-weight:800;white-space:nowrap;cursor:pointer}.ep-tabs button.active{background:#ef493b;color:#fff}.ep-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.ep-stat{border:1px solid rgba(255,255,255,.08);background:#202020;border-radius:12px;padding:16px}.ep-stat span{display:block;color:#858585;font-size:8px;text-transform:uppercase;letter-spacing:.09em}.ep-stat strong{display:block;color:#fff;font-size:23px;margin-top:7px}.ep-stat small{display:block;color:#777;font-size:8px;margin-top:5px}.ep-two{display:grid;grid-template-columns:1.3fr 1fr;gap:12px}.ep-panel{border:1px solid rgba(255,255,255,.08);background:#202020;border-radius:13px;padding:18px;min-width:0}.ep-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.ep-head span{display:block;color:#ef6558;font-size:8px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.ep-head h2{margin:3px 0 0;color:#fff;font-size:16px}.ep-head small{color:#777;font-size:9px}.ep-list{display:grid;gap:7px}.ep-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px;border:1px solid rgba(255,255,255,.06);background:#1a1a1a;border-radius:9px}.ep-row strong{display:block;color:#e9e9e9;font-size:10px}.ep-row span{display:block;color:#858585;font-size:8px;margin-top:4px}.ep-badge{padding:5px 8px;border-radius:999px;background:#333;color:#c7c7c7;font-size:8px;font-weight:800;white-space:nowrap}.ep-badge.completed{background:#21382a;color:#a9deb8}.ep-badge.in-progress{background:#453a20;color:#f1cc76}.ep-badge.blocked,.ep-badge.overdue{background:#472824;color:#ff9a91}.ep-progress{height:6px;background:#303030;border-radius:999px;overflow:hidden;margin-top:7px}.ep-progress i{display:block;height:100%;background:#ef493b}.ep-summary{display:grid;gap:9px}.ep-summary-row{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #333;color:#999;font-size:9px}.ep-summary-row:last-child{border-bottom:0}.ep-summary-row b{color:#fff}.ep-search{width:min(360px,100%);background:#161616;border:1px solid rgba(255,255,255,.1);color:#fff;border-radius:8px;padding:9px 11px;font-size:9px}.ep-table{overflow:auto;border:1px solid rgba(255,255,255,.07);border-radius:10px}.ep-table table{width:100%;border-collapse:collapse;min-width:760px}.ep-table th,.ep-table td{padding:11px;border-bottom:1px solid rgba(255,255,255,.06);text-align:left;font-size:9px;color:#c7c7c7}.ep-table th{font-size:8px;color:#777;text-transform:uppercase;letter-spacing:.08em;background:#181818}.ep-table tr:last-child td{border-bottom:0}.ep-link{color:#ef766c;font-weight:800;text-decoration:none}.ep-empty{padding:28px;text-align:center;color:#777;font-size:10px}.ep-alert{padding:11px 13px;border-radius:9px;background:#472824;border:1px solid #67352f;color:#ffb0a9;font-size:9px}.ep-drawing-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.ep-drawing{padding:12px;border-radius:9px;border:1px solid rgba(255,255,255,.06);background:#191919}.ep-drawing strong{color:#eee;font-size:10px}.ep-drawing span{display:block;color:#808080;font-size:8px;margin:4px 0 8px}@media(max-width:980px){.ep-grid{grid-template-columns:repeat(2,1fr)}.ep-two{grid-template-columns:1fr}}@media(max-width:620px){.ep-grid{grid-template-columns:1fr 1fr}.ep-hero{padding:20px}.ep-hero h1{font-size:22px}.ep-top-actions{position:static;margin-top:14px}.ep-drawing-grid{grid-template-columns:1fr}.ep-tabs{top:4px}}
    `}</style>

    <section className="ep">
      <div className="ep-hero">
        <div className="ep-eyebrow">EMPLOYEE COMMAND CENTER</div>
        <h1>Welcome back, {employeeName}</h1>
        <p>Your projects, workflow, site activity, files and attendance — all in one workspace.</p>
        <div className="ep-hero-meta"><div className="ep-chip">Employee ID · <b>{employeeId}</b></div><div className="ep-chip">Active projects · <b>{activeProjects.length}</b></div><div className="ep-chip">Open work · <b>{openTasks.length}</b></div>{overdueTasks.length>0&&<div className="ep-chip">Overdue · <b>{overdueTasks.length}</b></div>}</div>
        <div className="ep-top-actions"><button className="ep-refresh" onClick={()=>void load(true)} disabled={refreshing}>{refreshing?"Refreshing…":"↻ Refresh data"}</button></div>
      </div>

      <nav className="ep-tabs">{tabs.map(([key,label,icon])=><button key={key} className={tab===key?"active":""} onClick={()=>{setTab(key);setQuery("")}}><span>{icon}</span>{label}</button>)}</nav>
      {error&&<div className="ep-alert">{error}</div>}

      {tab==="dashboard"&&<>
        <div className="ep-grid">
          <div className="ep-stat"><span>Assigned Projects</span><strong>{projects.length}</strong><small>{activeProjects.length} active now</small></div>
          <div className="ep-stat"><span>Open Workflow</span><strong>{openTasks.length}</strong><small>{completedTasks} completed</small></div>
          <div className="ep-stat"><span>Overall Progress</span><strong>{overallProgress}%</strong><small>Across assigned workflow</small></div>
          <div className="ep-stat"><span>Site Visits</span><strong>{visits.length}</strong><small>{documents.length} project files available</small></div>
        </div>
        <div className="ep-two">
          <div className="ep-panel"><div className="ep-head"><div><span>PRIORITY QUEUE</span><h2>My Workflow</h2></div><small>{openTasks.length} open</small></div><div className="ep-list">{openTasks.slice(0,7).map((task,index)=>{const status=taskStatus(task);const p=progressOf(task);return <div className="ep-row" key={text(task.Task_ID)||index}><div style={{minWidth:0,flex:1}}><strong>{taskTitle(task)||"Workflow service"}</strong><span>{projectId(task)||"General"} · due {dateText(pick(task,["Due_Date","Due Date"]))}</span><div className="ep-progress"><i style={{width:`${p}%`}}/></div></div><div className={`ep-badge ${status.toLowerCase().replace(/\s+/g,"-")}`}>{status}</div></div>})}{!openTasks.length&&<div className="ep-empty">No open workflow items.</div>}</div></div>
          <div className="ep-panel"><div className="ep-head"><div><span>WORK SNAPSHOT</span><h2>Today at LAND VIEW</h2></div></div><div className="ep-summary"><div className="ep-summary-row"><span>Assigned projects</span><b>{projects.length}</b></div><div className="ep-summary-row"><span>Workflow completed</span><b>{completedTasks}/{tasks.length}</b></div><div className="ep-summary-row"><span>Overdue services</span><b>{overdueTasks.length}</b></div><div className="ep-summary-row"><span>Site records</span><b>{visits.length}</b></div><div className="ep-summary-row"><span>Documents available</span><b>{documents.length}</b></div><div className="ep-summary-row"><span>Attendance records</span><b>{attendance.length}</b></div></div></div>
        </div>
        <div className="ep-two">
          <div className="ep-panel"><div className="ep-head"><div><span>RECENT ACTIVITY</span><h2>Site Visits</h2></div><button className="ep-refresh" onClick={()=>setTab("visits")}>View all</button></div><div className="ep-list">{visits.slice(-5).reverse().map((v,i)=><div className="ep-row" key={text(v.Visit_ID)||i}><div><strong>{projectId(v)||"Project"}</strong><span>{text(pick(v,["Visit_Purpose","Purpose","Visit_Type"]))||"Site visit"}</span></div><div className="ep-badge">{dateText(pick(v,["Visit_Date","Date"]))}</div></div>)}{!visits.length&&<div className="ep-empty">No site visits yet.</div>}</div></div>
          <div className="ep-panel"><div className="ep-head"><div><span>DESIGN CONTROL</span><h2>Recent Drawings</h2></div></div><div className="ep-drawing-grid">{drawings.slice(-4).reverse().map((d,i)=><div className="ep-drawing" key={text(d.Drawing_ID)||i}><strong>{text(pick(d,["Drawing_Title"]))||"Drawing"}</strong><span>{projectId(d)||"Project"} · Rev {text(pick(d,["Revision"]))||"—"}</span>{d.Drive_URL?<a className="ep-link" href={String(d.Drive_URL)} target="_blank" rel="noreferrer">Open drawing →</a>:<div className="ep-badge">{text(pick(d,["Status"]))||"Draft"}</div>}</div>)}{!drawings.length&&<div className="ep-empty">No drawings assigned.</div>}</div></div>
        </div>
      </>}

      {tab!=="dashboard"&&<div className="ep-panel">
        <div className="ep-head"><div><span>EMPLOYEE WORKSPACE</span><h2>{tabs.find(x=>x[0]===tab)?.[1]}</h2></div><input className="ep-search" type="search" placeholder="Search this section…" value={query} onChange={e=>setQuery(e.target.value)}/></div>

        {tab==="projects"&&<div className="ep-table"><table><thead><tr><th>Project</th><th>Name / Client</th><th>Location</th><th>Status</th></tr></thead><tbody>{filteredProjects.map((p,i)=>{const status=text(pick(p,["Status","status"]))||"Active";return <tr key={projectId(p)||i}><td><strong>{projectId(p)||"—"}</strong></td><td>{text(pick(p,["Project_Name","Project Name","Client_Name"]))||"LAND VIEW Project"}</td><td>{text(pick(p,["Location","Project_Location"]))||"—"}</td><td><span className={`ep-badge ${status.toLowerCase().replace(/\s+/g,"-")}`}>{status}</span></td></tr>})}</tbody></table>{!filteredProjects.length&&<div className="ep-empty">No matching assigned projects.</div>}</div>}

        {tab==="workflow"&&<div className="ep-table"><table><thead><tr><th>Project</th><th>Service</th><th>Status</th><th>Progress</th><th>Start</th><th>Due</th></tr></thead><tbody>{filteredTasks.map((t,i)=>{const status=taskStatus(t),p=progressOf(t);return <tr key={text(t.Task_ID)||i}><td>{projectId(t)||"—"}</td><td><strong>{taskTitle(t)||"Workflow service"}</strong></td><td><span className={`ep-badge ${status.toLowerCase().replace(/\s+/g,"-")}`}>{status}</span></td><td><div style={{minWidth:120}}><div className="ep-progress"><i style={{width:`${p}%`}}/></div><span>{p}%</span></div></td><td>{dateText(pick(t,["Start_Date","Start Date"]))}</td><td>{dateText(pick(t,["Due_Date","Due Date"]))}</td></tr>})}</tbody></table>{!filteredTasks.length&&<div className="ep-empty">No matching workflow records.</div>}</div>}

        {tab==="visits"&&<div className="ep-table"><table><thead><tr><th>Date</th><th>Project</th><th>Visit Type</th><th>Progress / Condition</th><th>Instructions</th></tr></thead><tbody>{filteredVisits.slice().reverse().map((v,i)=><tr key={text(v.Visit_ID)||i}><td>{dateText(pick(v,["Visit_Date","Date"]))}</td><td>{projectId(v)||"—"}</td><td>{text(pick(v,["Visit_Purpose","Purpose","Visit_Type"]))||"Site visit"}</td><td>{text(pick(v,["Progress","Site_Condition"]))||"—"}</td><td>{text(pick(v,["Instructions","Observations"]))||"—"}</td></tr>)}</tbody></table>{!filteredVisits.length&&<div className="ep-empty">No matching site visits.</div>}</div>}

        {tab==="documents"&&<div className="ep-table"><table><thead><tr><th>Project</th><th>Document</th><th>Type</th><th>Date</th><th>Open</th></tr></thead><tbody>{filteredDocs.slice().reverse().map((d,i)=>{const url=text(pick(d,["File_URL","URL","Document_URL"]));return <tr key={text(d.Document_ID)||i}><td>{projectId(d)||"—"}</td><td><strong>{text(pick(d,["Document_Name","Name","File_Name"]))||"Document"}</strong></td><td>{text(pick(d,["Document_Type","Type"]))||"—"}</td><td>{dateText(pick(d,["Document_Date","Created_At"]))}</td><td>{url?<a className="ep-link" href={url} target="_blank" rel="noreferrer">Open →</a>:"—"}</td></tr>})}</tbody></table>{!filteredDocs.length&&<div className="ep-empty">No matching documents.</div>}</div>}

        {tab==="attendance"&&<div className="ep-table"><table><thead><tr><th>Date</th><th>Check In</th><th>Check Out</th><th>Status</th><th>Remarks</th></tr></thead><tbody>{filteredAttendance.slice().reverse().map((a,i)=>{const status=text(pick(a,["Status"]))||"Present";return <tr key={text(a.Attendance_ID)||i}><td>{dateText(pick(a,["Attendance_Date","Date"]))}</td><td>{text(pick(a,["Check_In"]))||"—"}</td><td>{text(pick(a,["Check_Out"]))||"—"}</td><td><span className={`ep-badge ${status.toLowerCase().replace(/\s+/g,"-")}`}>{status}</span></td><td>{text(pick(a,["Remarks","Notes"]))||"—"}</td></tr>})}</tbody></table>{!filteredAttendance.length&&<div className="ep-empty">No matching attendance records.</div>}</div>}
      </div>}
    </section>
  </>;
}
