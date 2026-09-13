"use client";

import { useEffect, useMemo, useState } from "react";
import ClientCertificateCenter, { type CertificateSummary } from "@/components/client-certificate-center";
import styles from "@/app/client/client.module.css";

type Row = Record<string, any>;
type ClientProject = {
  projectId:string; clientName:string; projectName:string; location:string; mobile:string; status:string;
  progress:number; completedServices:number; totalServices:number;
  finance:{ totalBill:number; totalPaid:number; due:number; engineeringBill:any; engineeringPaid:any; engineeringDue:any; supervisionBill:any; supervisionPaid:any; supervisionDue:any; othersBill:any; othersPaid:any; othersDue:any };
  workflow:Row[]; invoices:Row[]; billing:Record<string,Row[]>;
};
type Workspace = { projects:ClientProject[]; client?:{name?:string;projectIds?:string[]}; updatedAt?:string };

function text(value:unknown){ return String(value ?? "").trim(); }
function pick(row:Row,keys:string[]){ for(const key of keys) if(text(row?.[key])) return row[key]; return ""; }
function money(value:unknown){ const n=Number(String(value??0).replace(/[^0-9.-]/g,""))||0; return new Intl.NumberFormat("en-BD",{maximumFractionDigits:0}).format(n); }
function dateText(value:unknown){ const d=new Date(String(value||"")); return Number.isNaN(d.getTime())?"Recent":d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}); }
function statusClass(value:unknown){ const v=text(value).toLowerCase(); if(v.includes("complete")||v==="approved"||v==="active") return styles.complete; if(v==="rejected"||v==="revoked"||v==="deleted") return styles.paused; if(v.includes("progress")||v.includes("pending")) return styles.active; return styles.other; }

export default function ClientPortalPage(){
  const [workspace,setWorkspace]=useState<Workspace|null>(null);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState("");
  const [certificateSummary,setCertificateSummary]=useState<CertificateSummary|null>(null);
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
  const totals=useMemo(()=>projects.reduce((sum,p)=>({bill:sum.bill+Number(p.finance?.totalBill||0),paid:sum.paid+Number(p.finance?.totalPaid||0),due:sum.due+Number(p.finance?.due||0)}),{bill:0,paid:0,due:0}),[projects]);
  const progress=Math.max(0,Math.min(100,Number(project?.progress||0)));
  const recent=workflow.slice(-5).reverse();
  const status=project?.status|| (progress>=100?"Completed":"Ongoing");

  if(loading)return <div className={styles.skeleton} role="status"><span/><span/><span/><span/><span/><span/></div>;

  return <div className={styles.root} id="dashboard">
    <section className={styles.hero}>
      <div className={styles.heroContent}>
        <span className={styles.eyebrow}>WELCOME TO LAND VIEW</span>
        <h1>Your Project, Our Commitment<span>.</span></h1>
        <p>Track progress, manage payments, request certificates and stay connected with your project — all in one place.</p>
        <div className={styles.heroMeta}>
          <span>{project?.projectId||"Project"}</span>
          <span>{project?.location||"LAND VIEW project"}</span>
          <span>{refreshing?"Updating…":updated?`Updated ${updated.toLocaleTimeString("en-BD",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Dhaka"})}`:"Live workspace"}</span>
          <button type="button" className={styles.refresh} onClick={()=>void load(true)} disabled={refreshing}>{refreshing?"Refreshing…":"Refresh"}</button>
        </div>
      </div>
    </section>

    {error&&<div className={styles.error}>{error}</div>}

    <section id="project" className={`${styles.overviewGrid} cp-section`}>
      <div className={`${styles.card} ${styles.projectCard}`}>
        <div className={styles.projectVisual}/>
        <div>
          <span className={styles.label}>Current project</span>
          <h2>{project?.projectId||"—"}</h2>
          <div className={styles.client}>{project?.clientName||workspace?.client?.name||"Client"}</div>
          <div className={styles.location}>{project?.location||"Project location not recorded"}</div>
          <div className={styles.projectFooter}><span className={styles.statusPill}>{status.toUpperCase()}</span><small>{project?.completedServices||0}/{project?.totalServices||workflow.length||0} services completed</small></div>
        </div>
      </div>
      <div className={`${styles.card} ${styles.metricCard}`}><div className={styles.metricIcon}>▤</div><span>Total Bill</span><strong>৳ {money(totals.bill)}</strong><small>Project billing amount</small></div>
      <div className={`${styles.card} ${styles.metricCard}`}><div className={styles.metricIcon}>▣</div><span>Total Paid</span><strong>৳ {money(totals.paid)}</strong><small>Payments received</small></div>
      <div className={`${styles.card} ${styles.metricCard}`}><div className={styles.metricIcon}>◔</div><span>Balance Due</span><strong>৳ {money(totals.due)}</strong><small>{totals.due>0?"Current outstanding balance":"No outstanding balance"}</small></div>
    </section>

    <section className={styles.middleGrid}>
      <div className={`${styles.card} ${styles.progressCard}`}>
        <div className={styles.sectionTitle}><h2>Project Progress</h2><strong>{progress}%</strong></div>
        <div className={styles.progressTrack}><span style={{width:`${progress}%`}}/></div>
        <p>{project?.completedServices||0} of {project?.totalServices||workflow.length||0} services completed</p>
      </div>
      <div className={`${styles.card} ${styles.quickCard}`}>
        <div className={styles.sectionTitle}><h2>Quick Actions</h2></div>
        <div className={styles.quickActions}>
          <button className={`${styles.action} ${styles.actionPrimary}`} onClick={()=>project&&(window.location.href=`/client/billing/${encodeURIComponent(project.projectId)}`)}><span className={styles.actionIcon}>▤</span><span><strong>Generate Invoice</strong><small>View detailed bill</small></span></button>
          <a className={styles.action} href="#certificates"><span className={styles.actionIcon}>◫</span><span><strong>Request Certificate</strong><small>Get project certificate</small></span></a>
          <a className={styles.action} href="#documents"><span className={styles.actionIcon}>□</span><span><strong>View Documents</strong><small>Project files & drawings</small></span></a>
          <a className={styles.action} href="mailto:landviewcivil@gmail.com"><span className={styles.actionIcon}>◌</span><span><strong>Message Us</strong><small>Send a message</small></span></a>
        </div>
      </div>
    </section>

    <section className={styles.bottomGrid}>
      <div id="workflow" className={`${styles.card} ${styles.updatesCard} cp-section`}>
        <div className={styles.sectionTitle}><h2>Recent Updates</h2><a href="#workflow" style={{color:"#ff4148",fontSize:11}}>View All →</a></div>
        <div className={styles.updatesList}>{recent.length?recent.map((task,index)=>{const s=text(pick(task,["Status"]))||"Updated";const title=pick(task,["Task_Title","Title","Description"])||"Project service updated";return <div className={styles.updateRow} key={text(pick(task,["Task_ID"]))||index}><span className={styles.dot}/><span className={styles.updateDate}>{dateText(pick(task,["Due_Date","Due Date","Updated_At"]))}</span><span className={styles.updateText}>{title} · {s}</span></div>}):<div className={styles.updateRow}><span className={styles.dot}/><span className={styles.updateDate}>Current</span><span className={styles.updateText}>Your project workspace is active and up to date.</span></div>}</div>
      </div>
      <div className={`${styles.card} ${styles.supportCard}`}>
        <div className={styles.sectionTitle}><h2>Your Dedicated Support</h2></div>
        <div className={styles.supportPerson}><div className={styles.supportAvatar}>LV</div><div><strong>LAND VIEW Support</strong><small>Project coordination team</small></div></div>
        <div className={styles.supportLines}><span>✉ landviewcivil@gmail.com</span><span>Project: {project?.projectId||"—"}</span></div>
        <p className={styles.supportNote}>For any queries about your project, invoices or certificates, contact our team directly.</p>
      </div>
      <div className={`${styles.card} ${styles.brandCard}`}><strong>LAND VIEW</strong><i/><p>Design<br/>Plan<br/>Build<br/><span style={{color:"#9aa7b2"}}>for a Better Tomorrow</span></p></div>
    </section>

    <div className={styles.trustBanner}><div><strong>Your Trust Builds Safer Spaces</strong><small>Professional design. Reliable supervision. Lasting value.</small></div><span>Architecture for a Better Tomorrow.</span></div>

    <section id="finance" className={`${styles.financePanel} cp-section`}>
      <div className={styles.projectHeader}><div><small className={styles.panelKicker}>ACCOUNT POSITION</small><h2>Invoices & Payments</h2></div><button className="cp-secondary" onClick={()=>project&&(window.location.href=`/client/billing/${encodeURIComponent(project.projectId)}`)}>GENERATE INVOICE</button></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Category</th><th>Bill</th><th>Paid</th><th>Due</th></tr></thead><tbody>{project&&<><tr><td><span className={styles.projectName}>Engineering</span></td><td>৳ {money(project.finance.engineeringBill)}</td><td>৳ {money(project.finance.engineeringPaid)}</td><td><strong>৳ {money(project.finance.engineeringDue)}</strong></td></tr><tr><td><span className={styles.projectName}>Supervision</span></td><td>৳ {money(project.finance.supervisionBill)}</td><td>৳ {money(project.finance.supervisionPaid)}</td><td><strong>৳ {money(project.finance.supervisionDue)}</strong></td></tr><tr><td><span className={styles.projectName}>Others</span></td><td>৳ {money(project.finance.othersBill)}</td><td>৳ {money(project.finance.othersPaid)}</td><td><strong>৳ {money(project.finance.othersDue)}</strong></td></tr></>}</tbody></table></div>
    </section>

    <section id="documents" className={`${styles.projects} cp-section`}><div className={styles.projectHeader}><div><small className={styles.panelKicker}>PROJECT FILES</small><h2>Documents</h2></div></div><div className={styles.empty}><h3>Project documents</h3><p>Approved drawings, files and project records will appear here when they are made available to the client portal.</p></div></section>

    <section id="workflow-detail" className={`${styles.projects} cp-section`}><div className={styles.projectHeader}><div><small className={styles.panelKicker}>PROJECT DELIVERY</small><h2>Workflow <span style={{color:"#91a0aa"}}>({workflow.length})</span></h2></div></div><div className={styles.tableWrap}><table><thead><tr><th>#</th><th>Service</th><th>Status</th><th>Progress</th><th>Due date</th></tr></thead><tbody>{workflow.map((task,index)=>{const s=text(pick(task,["Status"]))||"Pending";const taskProgress=s.toLowerCase()==="completed"?100:Number(pick(task,["Progress"])||0);return <tr key={text(pick(task,["Task_ID"]))||index}><td><strong>{String(index+1).padStart(2,"0")}</strong></td><td><span className={styles.projectName}>{pick(task,["Task_Title","Title"])||"Project service"}</span><small>{pick(task,["Description"])||"LAND VIEW service workflow"}</small></td><td><span className={`${styles.status} ${statusClass(s)}`}>{s}</span></td><td><strong>{taskProgress}%</strong></td><td>{dateText(pick(task,["Due_Date","Due Date"]))}</td></tr>})}</tbody></table>{!workflow.length&&<div className={styles.empty}><h3>No workflow services yet</h3><p>Workflow will appear when billed project services are available.</p></div>}</div></section>

    <ClientCertificateCenter projects={projects} refreshKey={updated?.getTime() ?? 0} onSummary={setCertificateSummary} />
  </div>;
}
