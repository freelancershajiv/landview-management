"use client";

import { FormEvent, useEffect, useState } from "react";
import styles from "@/app/admin/dashboard.module.css";

type RequestRow = { requestId:string; category:string; categoryLabel?:string; subject:string; status:string; certificateId?:string; requestedAt?:string; adminNote?:string };
type CertificateRow = { certificateId:string; type:string; category?:string; subject:string; status:string; issuedAt:string; reference:string };

function dateText(value?:string){ if(!value)return"—"; const d=new Date(value); return Number.isNaN(d.getTime())?value:d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}); }
function statusClass(v:string){ const s=String(v||"").toLowerCase(); if(s==="active"||s==="issued"||s==="approved")return styles.complete; if(s==="rejected"||s==="revoked"||s==="deleted")return styles.paused; return styles.other; }

export default function EmployeeCertificateCenter(){
  const [requests,setRequests]=useState<RequestRow[]>([]);
  const [certificates,setCertificates]=useState<CertificateRow[]>([]);
  const [open,setOpen]=useState(false);
  const [details,setDetails]=useState("");
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");

  async function load(){
    try{
      const r=await fetch("/api/certificate-portal",{cache:"no-store",credentials:"same-origin"});
      const j=await r.json();
      if(!r.ok||!j?.success)throw new Error(j?.error||"Could not load certificates.");
      setRequests(Array.isArray(j?.data?.requests)?j.data.requests:[]);
      setCertificates(Array.isArray(j?.data?.certificates)?j.data.certificates:[]);
    }catch(e:any){setNotice(e?.message||"Could not load certificates.");}
  }
  useEffect(()=>{void load();},[]);

  async function submit(e:FormEvent){
    e.preventDefault(); if(busy)return; setBusy(true);setNotice("");
    try{
      const r=await fetch("/api/certificate-portal",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({action:"request",category:"employee",subject:"Employee Certificate",details})});
      const j=await r.json(); if(!r.ok||!j?.success)throw new Error(j?.error||"Could not submit request.");
      setNotice(j?.data?.duplicate?"An active employee certificate request already exists.":"Employee certificate request sent to Admin.");
      setDetails("");setOpen(false);await load();
    }catch(e:any){setNotice(e?.message||"Could not submit request.");}finally{setBusy(false);}
  }

  return <section id="certificates" className={`${styles.projects} ec-section`} style={{marginTop:20}}>
    <div className={styles.projectHeader}><div><small className={styles.panelKicker}>CERTIFICATE CENTER</small><h2>My certificates <span>{certificates.length}</span></h2></div><div className={styles.projectTools}><button type="button" className={styles.refresh} onClick={()=>setOpen(true)}>Request certificate</button></div></div>
    {notice&&<div style={{padding:"12px 16px",borderBottom:"1px solid #333",fontSize:10,color:"#bbb"}}>{notice}</div>}
    <div className={styles.tableWrap}><table><thead><tr><th>Certificate ID</th><th>Type</th><th>Subject</th><th>Status</th><th>Issued</th></tr></thead><tbody>{certificates.map((c,i)=><tr key={c.certificateId||i}><td><strong>{c.certificateId}</strong></td><td>{c.category||c.type}</td><td><span className={styles.projectName}>{c.subject||"Employee Certificate"}</span></td><td><span className={`${styles.status} ${statusClass(c.status)}`}><i/>{c.status||"Active"}</span></td><td>{dateText(c.issuedAt)}</td></tr>)}</tbody></table>{!certificates.length&&<div className={styles.empty}><h3>No issued certificates yet</h3><p>Once Admin issues an employee certificate, it will appear here automatically.</p></div>}</div>
    <div className={styles.projectHeader} style={{borderTop:"1px solid #333"}}><div><small className={styles.panelKicker}>REQUEST HISTORY</small><h2>My requests <span>{requests.length}</span></h2></div></div>
    <div className={styles.tableWrap}><table><thead><tr><th>Request</th><th>Subject</th><th>Status</th><th>Certificate</th></tr></thead><tbody>{requests.map((r,i)=><tr key={r.requestId||i}><td><strong>{r.requestId}</strong><small>{dateText(r.requestedAt)}</small></td><td>{r.subject||r.categoryLabel||"Employee Certificate"}</td><td><span className={`${styles.status} ${statusClass(r.status)}`}><i/>{r.status||"Pending"}</span></td><td>{r.certificateId||"—"}</td></tr>)}</tbody></table></div>
    {open&&<div className="modal-backdrop" onMouseDown={()=>setOpen(false)}><form className="modal card" onSubmit={submit} onMouseDown={e=>e.stopPropagation()}><div className="section-title"><div><span>CERTIFICATE REQUEST</span><h2>Employee Certificate</h2></div><button type="button" className="icon-button" onClick={()=>setOpen(false)}>×</button></div><label className="form-field"><span>DETAILS / PURPOSE</span><textarea value={details} onChange={e=>setDetails(e.target.value)} placeholder="Purpose or wording you want Admin to review" style={{minHeight:110}}/></label><div className="form-actions"><button type="button" className="btn btn-light" onClick={()=>setOpen(false)}>Cancel</button><button type="submit" className="btn btn-dark" disabled={busy}>{busy?"Submitting...":"Submit request"}</button></div></form></div>}
  </section>;
}
