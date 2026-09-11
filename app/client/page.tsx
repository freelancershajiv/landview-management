"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "@/app/admin/dashboard.module.css";

type Row = Record<string, any>;
type CertificateRequest = {
  requestId:string; projectId:string; certificateType:string; subject:string; details:string;
  status:string; certificateId?:string; requestedAt:string; reviewedAt?:string; adminNote?:string;
};
type ClientProject = {
  projectId:string; clientName:string; projectName:string; location:string; mobile:string; status:string;
  progress:number; completedServices:number; totalServices:number;
  finance:{ totalBill:number; totalPaid:number; due:number; engineeringBill:any; engineeringPaid:any; engineeringDue:any; supervisionBill:any; supervisionPaid:any; supervisionDue:any; othersBill:any; othersPaid:any; othersDue:any };
  workflow:Row[]; invoices:Row[]; billing:Record<string,Row[]>; certificateRequests:CertificateRequest[];
};
type Workspace = { projects:ClientProject[]; client?:{name?:string;projectIds?:string[]}; updatedAt?:string };

function text(value:unknown){ return String(value ?? "").trim(); }
function pick(row:Row,keys:string[]){ for(const key of keys) if(text(row?.[key])) return row[key]; return ""; }
function money(value:unknown){ const n=Number(String(value??0).replace(/[^0-9.-]/g,""))||0; return new Intl.NumberFormat("en-BD",{maximumFractionDigits:0}).format(n); }
function dateText(value:unknown){ const d=new Date(String(value||"")); return Number.isNaN(d.getTime())?"—":d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}); }
function statusClass(value:unknown){ const v=text(value).toLowerCase(); if(v.includes("complete")||v==="approved"||v==="active") return styles.complete; if(v==="rejected"||v==="revoked"||v==="deleted") return styles.paused; if(v.includes("progress")||v.includes("pending")) return styles.active; return styles.other; }

export default function ClientPortalPage(){
  const [workspace,setWorkspace]=useState<Workspace|null>(null);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState("");
  const [requestOpen,setRequestOpen]=useState(false);
  const [requestType,setRequestType]=useState("project");
  const [requestSubject,setRequestSubject]=useState("Project Completion / Status Certificate");
  const [requestDetails,setRequestDetails]=useState("");
  const [requestBusy,setRequestBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [updated,setUpdated]=useState<Date|null>(null);

  async function load(silent=false){
    if(silent)setRefreshing(true); else setLoading(true);
    setError("");
    try{
      const response=await fetch("/api/client-access",{cache:"no-store",credentials:"same-origin"});
      const json=await response.json();
      if(!response.ok||!json?.success) throw new Error(json?.error||"Unable to load your client workspace.");
      setWorkspace(json.data as Workspace); setUpdated(new Date());
    }catch(err:any){ setError(err?.message||"Unable to load your client workspace."); }
    finally{ setLoading(false); setRefreshing(false); }
  }

  useEffect(()=>{ void load(); },[]);
  const projects=workspace?.projects||[];
  const project=projects[0];
  const workflow=projects.flatMap(p=>p.workflow||[]);
  const requests=projects.flatMap(p=>p.certificateRequests||[]);
  const totals=useMemo(()=>projects.reduce((sum,p)=>({bill:sum.bill+Number(p.finance?.totalBill||0),paid:sum.paid+Number(p.finance?.totalPaid||0),due:sum.due+Number(p.finance?.due||0)}),{bill:0,paid:0,due:0}),[projects]);
  const completed=workflow.filter(t=>text(pick(t,["Status"])) .toLowerCase()==="completed").length;
  const progress=project?.progress||0;

  async function requestCertificate(e:FormEvent){
    e.preventDefault(); if(!project||requestBusy) return;
    setRequestBusy(true); setNotice("");
    try{
      const response=await fetch("/api/client-access",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({action:"request-certificate",projectId:project.projectId,certificateType:requestType,subject:requestSubject,details:requestDetails})});
      const json=await response.json();
      if(!response.ok||!json?.success) throw new Error(json?.error||"Could not submit certificate request.");
      setNotice(json?.data?.duplicate?"A pending request already exists for this certificate type.":"Certificate request submitted for Admin approval.");
      setRequestOpen(false); setRequestDetails(""); await load(true);
    }catch(err:any){ setNotice(err?.message||"Could not submit certificate request."); }
    finally{ setRequestBusy(false); }
  }

  function printInvoice(p:ClientProject){
    const w=window.open("","_blank","width=900,height=900"); if(!w) return;
    const rows=[["Engineering",p.finance.engineeringBill,p.finance.engineeringPaid,p.finance.engineeringDue],["Supervision",p.finance.supervisionBill,p.finance.supervisionPaid,p.finance.supervisionDue],["Others",p.finance.othersBill,p.finance.othersPaid,p.finance.othersDue]];
    w.document.write(`<!doctype html><html><head><title>${p.projectId} Invoice</title><style>body{font-family:Arial;padding:42px;color:#111}header{display:flex;justify-content:space-between;border-bottom:3px solid #111;padding-bottom:18px}.brand{font-size:26px;font-weight:900}.brand span{color:#d73329}.meta{text-align:right;font-size:12px}.box{margin-top:28px;padding:18px;border:1px solid #bbb}.box h2{margin:0 0 8px}table{width:100%;border-collapse:collapse;margin-top:25px}th,td{padding:12px;border:1px solid #ccc;text-align:right}th:first-child,td:first-child{text-align:left}tfoot td{font-weight:900}.note{margin-top:28px;font-size:11px;color:#555}</style></head><body><header><div><div class="brand">LAND <span>VIEW</span></div><div>Engineers & Architects</div></div><div class="meta"><b>CLIENT INVOICE / ACCOUNT STATEMENT</b><br>${new Date().toLocaleDateString("en-GB")}</div></header><div class="box"><h2>${p.clientName||"Client"}</h2><div>${p.projectId} · ${p.projectName||"LAND VIEW Project"}</div><div>${p.location||""}</div></div><table><thead><tr><th>Category</th><th>Bill (৳)</th><th>Paid (৳)</th><th>Due (৳)</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r[0]}</td><td>${money(r[1])}</td><td>${money(r[2])}</td><td>${money(r[3])}</td></tr>`).join("")}</tbody><tfoot><tr><td>TOTAL</td><td>${money(p.finance.totalBill)}</td><td>${money(p.finance.totalPaid)}</td><td>${money(p.finance.due)}</td></tr></tfoot></table><div class="note">Generated from the LAND VIEW client portal. Financial records remain subject to LAND VIEW accounting verification.</div><script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  }

  if(loading)return <div className={styles.skeleton} role="status"><span/><span/><span/><span/><span/><span/></div>;

  return <div className={styles.root} id="dashboard">
    <style>{`
      .cp-section{scroll-margin-top:130px}.cp-actions{display:flex;gap:8px;flex-wrap:wrap}.cp-primary,.cp-secondary{height:38px;padding:0 14px;border-radius:7px;font-size:9px;font-weight:800;cursor:pointer}.cp-primary{border:1px solid #ef493b;background:#ef493b;color:#fff}.cp-secondary{border:1px solid #454545;background:#282828;color:#eee}.cp-project-grid{display:grid;grid-template-columns:1.25fr .75fr;gap:20px}.cp-progress{height:8px;border-radius:999px;background:#3a3a3a;overflow:hidden;margin-top:16px}.cp-progress span{display:block;height:100%;background:#ef493b}.cp-mini{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px}.cp-mini div{padding:14px;border:1px solid #3d3d3d;border-radius:9px;background:#252525}.cp-mini small{display:block;color:#999;font-size:9px}.cp-mini strong{display:block;margin-top:6px;font-size:18px;color:#fff}.cp-request-list{display:grid;gap:10px;margin-top:16px}.cp-request{display:flex;justify-content:space-between;gap:16px;padding:13px 14px;border:1px solid #3d3d3d;border-radius:9px;background:#252525}.cp-request strong,.cp-request small{display:block}.cp-request strong{font-size:11px}.cp-request small{margin-top:4px;color:#999;font-size:9px}.cp-modal{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.72);display:grid;place-items:center;padding:18px}.cp-modal-card{width:min(560px,100%);padding:20px;border:1px solid #3d3d3d;border-radius:12px;background:#202020;color:#fff}.cp-modal-card h2{margin:0 0 4px}.cp-modal-card p{margin:0 0 14px;color:#999;font-size:10px}.cp-field{display:grid;gap:6px;margin-top:12px}.cp-field span{font-size:8px;font-weight:800;color:#aaa}.cp-field input,.cp-field select,.cp-field textarea{width:100%;border:1px solid #444;border-radius:7px;background:#171717;color:#fff;padding:0 11px}.cp-field input,.cp-field select{height:42px}.cp-field textarea{min-height:100px;padding-top:10px;resize:vertical}.cp-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:15px}.cp-notice{padding:11px 13px;border:1px solid #5a4a2c;border-radius:8px;background:#332b1c;color:#e5c777;font-size:10px}@media(max-width:950px){.cp-project-grid{grid-template-columns:1fr}}@media(max-width:650px){.cp-mini{grid-template-columns:1fr}.cp-request{display:grid}}
    `}</style>

    <header className={styles.header}>
      <div><span className={styles.eyebrow}>LAND VIEW CLIENT ERP</span><h1>Command center<span>.</span></h1><span className={styles.timestamp}>{refreshing?"Updating project data…":updated?`Updated ${updated.toLocaleTimeString("en-BD",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Dhaka"})} · ${project?.clientName||workspace?.client?.name||"Client"}`:"Client workspace"}</span></div>
      <div className={styles.actions}><button type="button" className={styles.refresh} onClick={()=>void load(true)} disabled={refreshing}><span>↻</span>{refreshing?"Updating…":"Refresh"}</button></div>
    </header>

    {error&&<div className={styles.error}>{error}</div>}
    {notice&&<div className="cp-notice">{notice}</div>}

    <section className={styles.metrics}>
      <a href="#project" className={styles.metric}><span className={styles.metricTitle}>Project <i>↗</i></span><strong>{project?.projectId||"—"}</strong><small>{project?.status||"Active"}</small></a>
      <a href="#workflow" className={styles.metric}><span className={styles.metricTitle}>Delivery progress <i>↗</i></span><strong>{progress}%</strong><small>{completed}/{workflow.length} services completed</small></a>
      <a href="#finance" className={styles.metric}><span className={styles.metricTitle}>Total bill <i>↗</i></span><strong>৳ {money(totals.bill)}</strong><small>Current project billing</small></a>
      <a href="#finance" className={styles.metric}><span className={styles.metricTitle}>Paid <i>↗</i></span><strong>৳ {money(totals.paid)}</strong><small>Recorded deposits</small></a>
      <a href="#finance" className={`${styles.metric} ${totals.due>0?styles.dueMetric:""}`}><span className={styles.metricTitle}>Balance due <i>↗</i></span><strong>৳ {money(totals.due)}</strong><small>Current outstanding balance</small></a>
      <a href="#certificates" className={styles.metric}><span className={styles.metricTitle}>Certificate requests <i>↗</i></span><strong>{requests.length}</strong><small>{requests.filter(r=>text(r.status).toLowerCase()==="pending").length} pending approval</small></a>
    </section>

    <section className={styles.moduleGrid}>
      <a href="#workflow" className={styles.moduleCard}><span className={styles.moduleIcon}>01</span><div><small>PROJECT DELIVERY</small><strong>Workflow</strong><p>Follow every billed service from pending to completed.</p></div><b>→</b></a>
      <a href="#finance" className={styles.moduleCard}><span className={styles.moduleIcon}>02</span><div><small>ACCOUNT POSITION</small><strong>Finance & invoice</strong><p>See bills, payments and current due, then generate an account invoice.</p></div><b>→</b></a>
      <a href="#certificates" className={styles.moduleCard}><span className={styles.moduleIcon}>03</span><div><small>CLIENT SERVICES</small><strong>Certificates</strong><p>Request a project or building certificate for LAND VIEW approval.</p></div><b>→</b></a>
    </section>

    <div id="project" className="cp-project-grid cp-section">
      <section className={styles.attentionPanel}><div className={styles.panelTop}><div><small className={styles.panelKicker}>PROJECT OVERVIEW</small><h2>{project?.projectName||"LAND VIEW Project"}</h2></div><strong className={styles.attentionBadge}>{project?.projectId||"—"}</strong></div><p>{project?.location||"Project location not recorded"}</p><div className="cp-progress"><span style={{width:`${Math.max(0,Math.min(100,progress))}%`}}/></div><div className="cp-mini"><div><small>Completed services</small><strong>{project?.completedServices||0}</strong></div><div><small>Total services</small><strong>{project?.totalServices||0}</strong></div><div><small>Status</small><strong>{project?.status||"Active"}</strong></div></div></section>
      <section className={styles.healthPanel}><div className={styles.panelTop}><div><small className={styles.panelKicker}>QUICK ACTIONS</small><h2>Client services</h2></div><strong>{progress}%</strong></div><div className={styles.healthBar}><span style={{width:`${progress}%`}}/></div><p>Use these actions for your project account. Certificate requests are reviewed by LAND VIEW administration.</p><div className="cp-actions"><button className="cp-secondary" onClick={()=>project&&printInvoice(project)}>GENERATE INVOICE</button><button className="cp-primary" onClick={()=>setRequestOpen(true)}>REQUEST CERTIFICATE</button></div></section>
    </div>

    <section id="workflow" className={`${styles.projects} cp-section`}><div className={styles.projectHeader}><div><small className={styles.panelKicker}>PROJECT DELIVERY</small><h2>Workflow <span>{workflow.length}</span></h2></div><div className={styles.projectTools}><span style={{fontSize:10,color:"#999"}}>Live billing-driven progress</span></div></div><div className={styles.tableWrap}><table><thead><tr><th>#</th><th>Service</th><th>Status</th><th>Progress</th><th>Due date</th></tr></thead><tbody>{workflow.map((task,index)=>{const status=text(pick(task,["Status"]))||"Pending";const taskProgress=status.toLowerCase()==="completed"?100:Number(pick(task,["Progress"])||0);return <tr key={text(pick(task,["Task_ID"]))||index}><td><strong>{String(index+1).padStart(2,"0")}</strong></td><td><span className={styles.projectName}>{pick(task,["Task_Title","Title"])||"Project service"}</span><small>{pick(task,["Description"])||"LAND VIEW service workflow"}</small></td><td><span className={`${styles.status} ${statusClass(status)}`}><i/>{status}</span></td><td><strong>{taskProgress}%</strong></td><td>{dateText(pick(task,["Due_Date","Due Date"]))}</td></tr>})}</tbody></table>{!workflow.length&&<div className={styles.empty}><h3>No workflow services yet</h3><p>Workflow will appear when billed project services are available.</p></div>}</div></section>

    <section id="finance" className={`${styles.projects} cp-section`}><div className={styles.projectHeader}><div><small className={styles.panelKicker}>FINANCIAL UPDATE</small><h2>Account position</h2></div><div className="cp-actions"><button className="cp-secondary" onClick={()=>project&&printInvoice(project)}>GENERATE INVOICE</button></div></div><div className={styles.tableWrap}><table><thead><tr><th>Category</th><th>Bill</th><th>Paid</th><th>Due</th></tr></thead><tbody>{project&&<><tr><td><span className={styles.projectName}>Engineering</span></td><td>৳ {money(project.finance.engineeringBill)}</td><td>৳ {money(project.finance.engineeringPaid)}</td><td><strong>৳ {money(project.finance.engineeringDue)}</strong></td></tr><tr><td><span className={styles.projectName}>Supervision</span></td><td>৳ {money(project.finance.supervisionBill)}</td><td>৳ {money(project.finance.supervisionPaid)}</td><td><strong>৳ {money(project.finance.supervisionDue)}</strong></td></tr><tr><td><span className={styles.projectName}>Others</span></td><td>৳ {money(project.finance.othersBill)}</td><td>৳ {money(project.finance.othersPaid)}</td><td><strong>৳ {money(project.finance.othersDue)}</strong></td></tr></>}</tbody></table></div></section>

    <section id="certificates" className={`${styles.attentionPanel} cp-section`}><div className={styles.panelTop}><div><small className={styles.panelKicker}>CERTIFICATE CENTER</small><h2>My requests</h2></div><button className="cp-primary" onClick={()=>setRequestOpen(true)}>REQUEST CERTIFICATE</button></div><div className="cp-request-list">{requests.map(req=><div className="cp-request" key={req.requestId}><div><strong>{req.subject||req.certificateType}</strong><small>{req.requestId} · Requested {dateText(req.requestedAt)}</small>{req.adminNote&&<small>Admin note: {req.adminNote}</small>}{req.certificateId&&<small>Certificate ID: {req.certificateId}</small>}</div><span className={`${styles.status} ${statusClass(req.status)}`}><i/>{req.status||"Pending"}</span></div>)}{!requests.length&&<div className={styles.empty}><h3>No certificate requests</h3><p>Request a project or building certificate when required.</p></div>}</div></section>

    {requestOpen&&<div className="cp-modal" onMouseDown={e=>{if(e.target===e.currentTarget)setRequestOpen(false);}}><form className="cp-modal-card" onSubmit={requestCertificate}><h2>Request certificate</h2><p>Your request will be sent to LAND VIEW administration for review and approval.</p><label className="cp-field"><span>CERTIFICATE TYPE</span><select value={requestType} onChange={e=>{setRequestType(e.target.value);setRequestSubject(e.target.value==="building"?"Building Certificate":"Project Completion / Status Certificate");}}><option value="project">Project Certificate</option><option value="building">Building Certificate</option></select></label><label className="cp-field"><span>SUBJECT / PURPOSE</span><input value={requestSubject} onChange={e=>setRequestSubject(e.target.value)} required/></label><label className="cp-field"><span>DETAILS FOR ADMIN</span><textarea value={requestDetails} onChange={e=>setRequestDetails(e.target.value)} placeholder="Tell LAND VIEW why you need this certificate or any wording/details to include."/></label><div className="cp-modal-actions"><button className="cp-secondary" type="button" onClick={()=>setRequestOpen(false)}>CANCEL</button><button className="cp-primary" type="submit" disabled={requestBusy}>{requestBusy?"SUBMITTING…":"SUBMIT REQUEST"}</button></div></form></div>}
  </div>;
}
