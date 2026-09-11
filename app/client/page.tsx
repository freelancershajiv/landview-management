"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

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
function statusClass(value:unknown){ const v=text(value).toLowerCase(); if(v==="completed"||v==="approved"||v==="active") return "ok"; if(v==="rejected"||v==="revoked"||v==="deleted") return "bad"; return "warn"; }

export default function ClientPortalPage(){
  const [workspace,setWorkspace]=useState<Workspace|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [requestOpen,setRequestOpen]=useState(false);
  const [requestType,setRequestType]=useState("project");
  const [requestSubject,setRequestSubject]=useState("Project Completion / Status Certificate");
  const [requestDetails,setRequestDetails]=useState("");
  const [requestBusy,setRequestBusy]=useState(false);
  const [notice,setNotice]=useState("");

  async function load(){
    setError("");
    try{
      const response=await fetch("/api/client-access",{cache:"no-store",credentials:"same-origin"});
      const json=await response.json();
      if(!response.ok||!json?.success) throw new Error(json?.error||"Unable to load your client workspace.");
      setWorkspace(json.data as Workspace);
    }catch(err:any){ setError(err?.message||"Unable to load your client workspace."); }
    finally{ setLoading(false); }
  }

  useEffect(()=>{ void load(); },[]);
  const projects=workspace?.projects||[];
  const totals=useMemo(()=>projects.reduce((sum,p)=>({bill:sum.bill+Number(p.finance?.totalBill||0),paid:sum.paid+Number(p.finance?.totalPaid||0),due:sum.due+Number(p.finance?.due||0)}),{bill:0,paid:0,due:0}),[projects]);

  async function requestCertificate(e:FormEvent){
    e.preventDefault();
    const project=projects[0]; if(!project||requestBusy) return;
    setRequestBusy(true); setNotice("");
    try{
      const response=await fetch("/api/client-access",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({action:"request-certificate",projectId:project.projectId,certificateType:requestType,subject:requestSubject,details:requestDetails})});
      const json=await response.json();
      if(!response.ok||!json?.success) throw new Error(json?.error||"Could not submit certificate request.");
      setNotice(json?.data?.duplicate?"A pending request already exists for this certificate type.":"Certificate request submitted for Admin approval.");
      setRequestOpen(false); setRequestDetails(""); await load();
    }catch(err:any){ setNotice(err?.message||"Could not submit certificate request."); }
    finally{ setRequestBusy(false); }
  }

  function printInvoice(project:ClientProject){
    const w=window.open("","_blank","width=900,height=900"); if(!w) return;
    const rows=[
      ["Engineering",project.finance.engineeringBill,project.finance.engineeringPaid,project.finance.engineeringDue],
      ["Supervision",project.finance.supervisionBill,project.finance.supervisionPaid,project.finance.supervisionDue],
      ["Others",project.finance.othersBill,project.finance.othersPaid,project.finance.othersDue],
    ];
    w.document.write(`<!doctype html><html><head><title>${project.projectId} Invoice</title><style>body{font-family:Arial;padding:42px;color:#111}header{display:flex;justify-content:space-between;border-bottom:3px solid #111;padding-bottom:18px}.brand{font-size:26px;font-weight:900}.brand span{color:#d73329}.meta{text-align:right;font-size:12px}.box{margin-top:28px;padding:18px;border:1px solid #bbb}.box h2{margin:0 0 8px}table{width:100%;border-collapse:collapse;margin-top:25px}th,td{padding:12px;border:1px solid #ccc;text-align:right}th:first-child,td:first-child{text-align:left}tfoot td{font-weight:900}.note{margin-top:28px;font-size:11px;color:#555}@media print{button{display:none}}</style></head><body><header><div><div class="brand">LAND <span>VIEW</span></div><div>Engineers & Architects</div></div><div class="meta"><b>CLIENT INVOICE / ACCOUNT STATEMENT</b><br>${new Date().toLocaleDateString("en-GB")}</div></header><div class="box"><h2>${project.clientName||"Client"}</h2><div>${project.projectId} · ${project.projectName||"LAND VIEW Project"}</div><div>${project.location||""}</div></div><table><thead><tr><th>Category</th><th>Bill (৳)</th><th>Paid (৳)</th><th>Due (৳)</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${r[0]}</td><td>${money(r[1])}</td><td>${money(r[2])}</td><td>${money(r[3])}</td></tr>`).join("")}</tbody><tfoot><tr><td>TOTAL</td><td>${money(project.finance.totalBill)}</td><td>${money(project.finance.totalPaid)}</td><td>${money(project.finance.due)}</td></tr></tfoot></table><div class="note">Generated from the LAND VIEW client portal. Financial records remain subject to LAND VIEW accounting verification.</div><script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  }

  if(loading) return <div className="client-loading">Loading your LAND VIEW project…</div>;
  if(error) return <div className="client-error"><h2>Client portal unavailable</h2><p>{error}</p><button onClick={()=>{setLoading(true);void load();}}>TRY AGAIN</button></div>;

  return <div className="client-portal">
    <style>{`
      .client-portal{display:grid;gap:20px;color:#eee}.client-hero{border:1px solid #34373b;background:linear-gradient(120deg,#181a1c,#111315);border-radius:14px;padding:24px;display:flex;justify-content:space-between;gap:20px;align-items:end}.client-hero small,.section-head small,.project-kicker{color:#ef6e64;font-size:8px;font-weight:900;letter-spacing:.13em}.client-hero h1{margin:7px 0 5px;font-size:31px;letter-spacing:-.035em}.client-hero p{margin:0;color:#858b91;font-size:10px}.hero-actions{display:flex;gap:8px}.hero-actions button{height:42px;padding:0 14px;border-radius:8px;border:1px solid #3b4045;background:#202326;color:#ddd;font-size:8px;font-weight:900;cursor:pointer}.hero-actions .primary{background:#ef493b;border-color:#ef493b;color:white}.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.stat{border:1px solid #34373b;background:#1b1d1f;border-radius:11px;padding:16px}.stat span{font-size:8px;color:#777f86;font-weight:900;letter-spacing:.09em}.stat strong{display:block;font-size:23px;margin-top:7px}.project-card,.section{border:1px solid #34373b;background:#1b1d1f;border-radius:12px;overflow:hidden}.project-top{padding:19px 20px;border-bottom:1px solid #303438;display:flex;justify-content:space-between;gap:16px}.project-top h2{font-size:20px;margin:5px 0}.project-top p{margin:0;color:#80878d;font-size:10px}.pill{height:max-content;padding:6px 9px;border:1px solid #3d4449;border-radius:999px;font-size:7px;font-weight:900}.project-body{padding:18px 20px}.progress-head{display:flex;justify-content:space-between;font-size:9px;font-weight:900}.progress-track{height:8px;background:#292d31;border-radius:999px;margin:9px 0 17px;overflow:hidden}.progress-track i{display:block;height:100%;background:#ef493b}.finance-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.finance-grid div{padding:13px;border:1px solid #303438;border-radius:9px;background:#121416}.finance-grid small{font-size:7px;color:#717980;font-weight:900}.finance-grid b{display:block;margin-top:6px;font-size:16px}.section-head{padding:17px 19px;border-bottom:1px solid #303438;display:flex;justify-content:space-between;align-items:center}.section-head h2{margin:5px 0 0;font-size:17px}.section-head span{color:#7a8188;font-size:8px}.workflow{display:grid}.task{display:grid;grid-template-columns:34px minmax(0,1fr) 120px;gap:12px;align-items:center;padding:13px 18px;border-bottom:1px solid #2d3135}.task:last-child{border-bottom:0}.task-num{width:30px;height:30px;border:1px solid #3a3f44;border-radius:8px;display:grid;place-items:center;font-size:8px;font-weight:900}.task strong{font-size:10px}.task p{margin:4px 0 0;color:#777f86;font-size:8px}.task-status{text-align:right}.task-status b,.req-status{display:inline-block;border-radius:999px;padding:5px 8px;font-size:7px;font-weight:900}.ok{background:#15261b;color:#9ed5af;border:1px solid #315c40}.warn{background:#292318;color:#dfbd78;border:1px solid #5b4b2d}.bad{background:#301a17;color:#ef9a90;border:1px solid #67352f}.requests{display:grid}.request{padding:14px 18px;border-bottom:1px solid #2e3236;display:flex;justify-content:space-between;gap:15px}.request:last-child{border-bottom:0}.request strong{font-size:10px}.request p{margin:4px 0 0;color:#777f86;font-size:8px}.request small{display:block;margin-top:5px;color:#666e75;font-size:7px}.empty{padding:22px;text-align:center;color:#737a80;font-size:9px}.notice{padding:11px 13px;border:1px solid #3a4146;border-radius:9px;background:#151719;font-size:9px}.modal{position:fixed;inset:0;background:rgba(0,0,0,.72);display:grid;place-items:center;z-index:80;padding:18px}.modal-card{width:min(560px,100%);background:#181a1c;border:1px solid #383d42;border-radius:13px;padding:20px}.modal-card h2{margin:0 0 5px}.modal-card p{color:#7f878e;font-size:9px}.field{display:grid;gap:6px;margin-top:12px}.field span{font-size:8px;color:#858c92;font-weight:900}.field input,.field select,.field textarea{width:100%;border:1px solid #353a3f;border-radius:8px;background:#101214;color:#fff;padding:0 11px}.field input,.field select{height:43px}.field textarea{min-height:100px;padding-top:10px;resize:vertical}.modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:15px}.modal-actions button{height:40px;padding:0 14px;border:1px solid #3a3f44;border-radius:8px;background:#202326;color:#ddd;font-size:8px;font-weight:900;cursor:pointer}.modal-actions .primary{background:#ef493b;border-color:#ef493b;color:#fff}@media(max-width:850px){.client-hero{display:grid}.stats{grid-template-columns:1fr 1fr}.hero-actions{flex-wrap:wrap}}@media(max-width:560px){.stats,.finance-grid{grid-template-columns:1fr}.task{grid-template-columns:30px 1fr}.task-status{grid-column:2;text-align:left}.request{display:grid}}
    `}</style>

    <header className="client-hero"><div><small>CLIENT WORKSPACE</small><h1>Welcome, {projects[0]?.clientName||workspace?.client?.name||"Client"}.</h1><p>Live project workflow, financial updates, invoices and certificate requests in one place.</p></div><div className="hero-actions"><button onClick={()=>projects[0]&&printInvoice(projects[0])}>GENERATE INVOICE</button><button className="primary" onClick={()=>setRequestOpen(true)}>REQUEST CERTIFICATE</button></div></header>

    {notice&&<div className="notice">{notice}</div>}

    <section className="stats"><div className="stat"><span>TOTAL BILL</span><strong>৳ {money(totals.bill)}</strong></div><div className="stat"><span>TOTAL PAID</span><strong>৳ {money(totals.paid)}</strong></div><div className="stat"><span>TOTAL DUE</span><strong>৳ {money(totals.due)}</strong></div><div className="stat"><span>PROJECT PROGRESS</span><strong>{projects[0]?.progress||0}%</strong></div></section>

    {projects.map(project=><section className="project-card" key={project.projectId}><div className="project-top"><div><span className="project-kicker">{project.projectId}</span><h2>{project.projectName||"LAND VIEW Project"}</h2><p>{project.location||"Location not recorded"}</p></div><span className="pill">{project.status||"Active"}</span></div><div className="project-body"><div className="progress-head"><span>DELIVERY PROGRESS</span><span>{project.completedServices} of {project.totalServices} services completed</span></div><div className="progress-track"><i style={{width:`${Math.max(0,Math.min(100,project.progress||0))}%`}}/></div><div className="finance-grid"><div><small>BILLED</small><b>৳ {money(project.finance.totalBill)}</b></div><div><small>PAID</small><b>৳ {money(project.finance.totalPaid)}</b></div><div><small>DUE</small><b>৳ {money(project.finance.due)}</b></div></div></div></section>)}

    <section className="section"><div className="section-head"><div><small>PROJECT DELIVERY</small><h2>Workflow Status</h2></div><span>Live from LAND VIEW workflow</span></div><div className="workflow">{projects.flatMap(p=>p.workflow||[]).length?projects.flatMap(p=>p.workflow||[]).map((task,index)=>{const status=text(pick(task,["Status"]))||"Pending";return <div className="task" key={text(pick(task,["Task_ID"]))||index}><span className="task-num">{String(index+1).padStart(2,"0")}</span><div><strong>{pick(task,["Task_Title","Title"])||"Project service"}</strong><p>{pick(task,["Description"])||"LAND VIEW service workflow"}</p></div><div className="task-status"><b className={statusClass(status)}>{status.toUpperCase()}</b></div></div>}):<div className="empty">No workflow services are currently listed for this project.</div>}</div></section>

    <section className="section"><div className="section-head"><div><small>FINANCIAL UPDATE</small><h2>Billing Breakdown</h2></div><span>Current account position</span></div>{projects.map(p=><div className="project-body" key={`billing-${p.projectId}`}><div className="finance-grid"><div><small>ENGINEERING DUE</small><b>৳ {money(p.finance.engineeringDue)}</b></div><div><small>SUPERVISION DUE</small><b>৳ {money(p.finance.supervisionDue)}</b></div><div><small>OTHER DUE</small><b>৳ {money(p.finance.othersDue)}</b></div></div></div>)}</section>

    <section className="section"><div className="section-head"><div><small>CERTIFICATE CENTER</small><h2>My Certificate Requests</h2></div><span>Admin approval required</span></div><div className="requests">{projects.flatMap(p=>p.certificateRequests||[]).length?projects.flatMap(p=>p.certificateRequests||[]).map(req=><div className="request" key={req.requestId}><div><strong>{req.subject||req.certificateType}</strong><p>{req.requestId} · Requested {dateText(req.requestedAt)}</p>{req.adminNote&&<small>Admin note: {req.adminNote}</small>}{req.certificateId&&<small>Certificate: {req.certificateId}</small>}</div><span className={`req-status ${statusClass(req.status)}`}>{(req.status||"Pending").toUpperCase()}</span></div>):<div className="empty">No certificate requests yet. Use “Request certificate” when you need one.</div>}</div></section>

    {requestOpen&&<div className="modal" onMouseDown={e=>{if(e.target===e.currentTarget)setRequestOpen(false);}}><form className="modal-card" onSubmit={requestCertificate}><h2>Request certificate</h2><p>Your request will be sent to LAND VIEW administration for review and approval.</p><label className="field"><span>CERTIFICATE TYPE</span><select value={requestType} onChange={e=>{setRequestType(e.target.value);setRequestSubject(e.target.value==="building"?"Building Certificate":"Project Completion / Status Certificate");}}><option value="project">Project Certificate</option><option value="building">Building Certificate</option></select></label><label className="field"><span>SUBJECT / PURPOSE</span><input value={requestSubject} onChange={e=>setRequestSubject(e.target.value)} required/></label><label className="field"><span>DETAILS FOR ADMIN</span><textarea value={requestDetails} onChange={e=>setRequestDetails(e.target.value)} placeholder="Tell LAND VIEW why you need this certificate or any wording/details to include."/></label><div className="modal-actions"><button type="button" onClick={()=>setRequestOpen(false)}>CANCEL</button><button className="primary" type="submit" disabled={requestBusy}>{requestBusy?"SUBMITTING…":"SUBMIT REQUEST"}</button></div></form></div>}
  </div>;
}
