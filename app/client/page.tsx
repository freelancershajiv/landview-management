"use client";

import { useEffect, useState } from "react";
import ClientCertificateCenter from "@/components/client-certificate-center";
import styles from "@/app/client/client.module.css";
import ProjectReceiptHistory from "@/components/project-receipt-history";

type Row = Record<string, any>;
type ClientProject = {
  projectId:string; clientName:string; projectName:string; location:string; mobile:string; status:string;
  progress:number; completedServices:number; totalServices:number;
  workflow:Row[];
};
type Workspace = { projects:ClientProject[]; client?:{name?:string;projectIds?:string[]}; updatedAt?:string };

type Readiness = {
  finance: { billed: number; paid: number; due: number; categories: { label: string; billed: number; paid: number; due: number }[] } | null;
  documentActions: { name: string; status: string }[] | null;
  deliverables: { id: string; title: string; drawing: string; revision: string; deliveredAt: string; url: string }[] | null;
};
type ConstructionFinance = { totals?: { debit?: number; credit?: number }; summary?: {
  supplierAdvance?: number; chequeOnHold?: number; engShajivBalance?: number;
}; entries?: unknown[] };

function text(value:unknown){ return String(value ?? "").trim(); }
function pick(row:Row,keys:string[]){ for(const key of keys) if(text(row?.[key])) return row[key]; return ""; }
function money(value:unknown){ const n=Number(String(value??0).replace(/[^0-9.-]/g,""))||0; return new Intl.NumberFormat("en-BD",{maximumFractionDigits:2}).format(n); }
function dateText(value:unknown){ const d=new Date(String(value||"")); return Number.isNaN(d.getTime())?"Recent":d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}); }
function statusClass(value:unknown){ const v=text(value).toLowerCase(); if(v.includes("complete")||v==="approved"||v==="active") return styles.complete; if(v==="rejected"||v==="revoked"||v==="deleted") return styles.paused; if(v.includes("progress")||v.includes("pending")) return styles.active; return styles.other; }

export default function ClientPortalPage(){
  const [workspace,setWorkspace]=useState<Workspace|null>(null);
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [error,setError]=useState("");
  const [updated,setUpdated]=useState<Date|null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<{ projectId: string; readiness?: Readiness | null; finance?: ConstructionFinance | null; visits?: Row[] | null }>({ projectId: "" });

  async function load(silent=false){
    if(silent)setRefreshing(true); else setLoading(true);
    setError("");
    try{
      const response=await fetch("/api/client-access",{cache:"no-store",credentials:"same-origin"});
      const json=await response.json();
      if(!response.ok||!json?.success) throw new Error(json?.error||"Unable to load your client workspace.");
      setWorkspace(json.data as Workspace);
      setUpdated(new Date());
    }catch(err:any){ setError(err?.message||"Unable to load your client workspace."); }
    finally{ setLoading(false); setRefreshing(false); }
  }

  useEffect(()=>{ void load(); },[]);
  const projects=workspace?.projects||[];
  const project = projects.find((item) => item.projectId === selectedId) ?? projects[0];
  const projectId = project?.projectId;
  const selectedDetails = detail.projectId === projectId ? detail : undefined;
  const readiness = selectedDetails?.readiness;
  const projectFinance = selectedDetails?.finance;
  const siteVisits = selectedDetails?.visits ?? [];
  const finance = readiness?.finance;
  const workflow = project?.workflow ?? [];
  const progress = Math.max(0, Math.min(100, Number(project?.progress || 0)));
  const recent = workflow.slice(-5).reverse();
  const status = project?.status || (progress >= 100 ? "Completed" : "Ongoing");

  useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    const code = encodeURIComponent(projectId);
    setDetail({ projectId });
    async function read<T>(url: string): Promise<T | null> {
      try {
        const response = await fetch(url, { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        const result = await response.json();
        return response.ok && result?.success ? result.data as T : null;
      } catch { return null; }
    }
    void read<Readiness>(`/api/client-access?mode=project-readiness&projectId=${code}`).then((readiness) => {
      if (!controller.signal.aborted) setDetail((current) => ({ ...current, projectId, readiness }));
    });
    void read<ConstructionFinance>(`/api/project-management?projectId=${code}`).then((finance) => {
      if (!controller.signal.aborted) setDetail((current) => ({ ...current, projectId, finance }));
    });
    void read<Row[]>(`/api/site-visits?projectId=${code}`).then((visits) => {
      if (!controller.signal.aborted) setDetail((current) => ({ ...current, projectId, visits: Array.isArray(visits) ? visits : null }));
    });
    return () => controller.abort();
  }, [projectId, updated]);

  const financeValue = (value: number | undefined) => value === undefined ? "—" : `৳ ${money(value)}`;

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
          {project&&<button type="button" className={styles.refresh} onClick={()=>{window.location.href=`/projectmanagement?projectId=${encodeURIComponent(project.projectId)}`;}}>View Project Management</button>}<button type="button" className={styles.refresh} onClick={()=>void load(true)} disabled={refreshing}>{refreshing?"Refreshing…":"Refresh"}</button>
        </div>
      </div>
    </section>

    {error&&<div className={styles.error}>{error}</div>}

    {projects.length > 1 && <div className={styles.projectPicker}>
      <label htmlFor="client-project">Select project</label>
      <select id="client-project" value={projectId || ""} onChange={(event) => setSelectedId(event.target.value)}>
        {projects.map((item) => <option key={item.projectId} value={item.projectId}>{item.projectId} · {item.projectName}</option>)}
      </select>
    </div>}
    {!project ? <p className={styles.empty}>No project is available in this session.</p> : <>

    <section id="project" className={`${styles.overviewGrid} cp-section`}>
      <div className={`${styles.card} ${styles.projectCard}`}>
        <div className={styles.projectVisual}/>
        <div>
          <span className={styles.label}>Current project</span>
          <h2>{project?.projectId||"—"}</h2>
          <div className={styles.client}>{project?.clientName||workspace?.client?.name||"Client"}</div>
          <div className={styles.location}>{project?.location||"Project location not recorded"}</div>
          <div className={styles.projectFooter}><span className={styles.statusPill}>{status.toUpperCase()}</span><small>{project?.completedServices||0}/{project?.totalServices||workflow.length||0} services completed</small></div>
          {project&&<button type="button" className={styles.actionPrimary} style={{marginTop:14,width:"100%",justifyContent:"center"}} onClick={()=>{window.location.href=`/projectmanagement?projectId=${encodeURIComponent(project.projectId)}`;}}>▤ &nbsp; VIEW PROJECT MANAGEMENT</button>}
        </div>
      </div>
      <div className={`${styles.card} ${styles.metricCard}`}><div className={styles.metricIcon}>▤</div><span>Consultancy fees</span><strong>{financeValue(finance?.billed)}</strong><small>Net fees billed for this project</small></div>
      <div className={`${styles.card} ${styles.metricCard}`}><div className={styles.metricIcon}>▣</div><span>Fee payments received</span><strong>{financeValue(finance?.paid)}</strong><small>Consultancy payments for this project</small></div>
      <div className={`${styles.card} ${styles.metricCard}`}><div className={styles.metricIcon}>◔</div><span>Consultancy amount payable</span><strong>{financeValue(finance?.due)}</strong><small>{finance ? (finance.due > 0 ? "Current outstanding balance" : "No outstanding balance") : readiness === undefined ? "Loading balance…" : "Balance unavailable"}</small></div>
    </section>

    <section className={styles.projects} aria-labelledby="client-next-actions">
      <div className={styles.projectHeader}><h2 id="client-next-actions">What you need to do</h2></div>
      <div className={styles.clientActionList}>
        {finance && finance.due > 0 && <p>Consultancy balance due: <strong>{financeValue(finance.due)}</strong>. <a href={`/client/billing/${encodeURIComponent(project.projectId)}`}>View billing statement</a></p>}
        {readiness?.documentActions?.length ? <><p>Confirm these checklist items with LAND VIEW:</p><ul>{readiness.documentActions.map(({ name, status }) => <li key={name}>{name} · {status}</li>)}</ul></>
          : readiness?.documentActions ? <p>No outstanding document requests on the project checklist.</p>
          : <p>{readiness === undefined ? "Checking project documents…" : "The document checklist is unavailable."}</p>}
      </div>
    </section>

    <section id="finance-update" className={styles.financeUpdate}>
      <div className={styles.financeUpdateHeader}>
        <div><span className={styles.label}>PROJECT FINANCE</span><h2>Construction Funds</h2><p>Construction ledger for this project.</p></div>
        {project&&<button type="button" className={styles.seeMoreButton} onClick={()=>{window.location.href="/projectmanagement?projectId="+encodeURIComponent(project.projectId);}}>See More →</button>}
      </div>
      <div className={styles.financeUpdateStats}>
        <div><span>Construction funds received</span><strong>{financeValue(projectFinance?.totals?.debit)}</strong><small>Project funds received</small></div>
        <div><span>Expenses</span><strong>{financeValue(projectFinance?.totals?.credit)}</strong><small>Recognized project expenses</small></div>
        <div><span>Supplier Advance</span><strong>{financeValue(projectFinance?.summary?.supplierAdvance)}</strong><small>Outstanding supplier prepayment</small></div>
        <div><span>Cheque on Hold</span><strong>{financeValue(projectFinance?.summary?.chequeOnHold)}</strong><small>Committed, not treated as expense</small></div>
        <div><span>Eng Shajiv Cash</span><strong>{financeValue(projectFinance?.summary?.engShajivBalance)}</strong><small>Paid − Expenses − Advance − Hold</small></div>
      </div>
      <div className={styles.financeUpdateFooter}><span>{projectFinance ? (projectFinance.entries?.length||0)+" project ledger entries" : projectFinance === null ? "Construction finance unavailable" : "Loading construction finance…"}</span><span>View-only financial summary</span></div>
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
          {project&&<button className={styles.action} onClick={()=>{window.location.href=`/projectmanagement?projectId=${encodeURIComponent(project.projectId)}`;}}><span className={styles.actionIcon}>▤</span><span><strong>Project Finance</strong><small>Open full project ledger</small></span></button>}
          <a className={styles.action} href="#certificates"><span className={styles.actionIcon}>◫</span><span><strong>View Certificates</strong><small>Issued project certificates</small></span></a>
          <a className={styles.action} href="#documents"><span className={styles.actionIcon}>□</span><span><strong>View Documents</strong><small>Project files & drawings</small></span></a>
          <a className={styles.action} href="mailto:landviewcivil@gmail.com"><span className={styles.actionIcon}>◌</span><span><strong>Message Us</strong><small>Send a message</small></span></a>
        </div>
      </div>
    </section>

    <section className={styles.bottomGrid}>
      <div id="workflow" className={`${styles.card} ${styles.updatesCard} cp-section`}>
        <div className={styles.sectionTitle}><h2>Recent Updates</h2><a href="#workflow-detail" style={{color:"#ff4148",fontSize:11}}>View All →</a></div>
        <div className={styles.updatesList}>{recent.length?recent.map((task,index)=>{const s=text(pick(task,["Status"]))||"Updated";const title=pick(task,["Task_Title","Title","Description"])||"Project service updated";return <div className={styles.updateRow} key={text(pick(task,["Task_ID"]))||index}><span className={styles.dot}/><span className={styles.updateDate}>{dateText(pick(task,["Due_Date","Due Date","Updated_At"]))}</span><span className={styles.updateText}>{title} · {s}</span></div>}):<div className={styles.updateRow}><span className={styles.dot}/><span className={styles.updateDate}>Current</span><span className={styles.updateText}>Your project workspace is active and up to date.</span></div>}</div>
      </div>
      <div className={`${styles.card} ${styles.supportCard}`}>
        <div className={styles.sectionTitle}><h2>Your Dedicated Support</h2></div>
        <div className={styles.supportPerson}><div className={styles.supportAvatar}>LV</div><div><strong>LAND VIEW Support</strong><small>Project coordination team</small></div></div>
        <div className={styles.supportLines}><span>✉ landviewcivil@gmail.com</span><span>Project: {project?.projectId||"—"}</span></div>
        <p className={styles.supportNote}>For any queries about your project, invoices or certificates, contact our team directly.</p>
      </div>
      <div className={`${styles.card} ${styles.brandCard}`}><strong>LAND VIEW</strong><i/><p>Design<br/>Plan<br/>Build<br/><span style={{color:"var(--theme-ink-_9aa7b2, #9aa7b2)"}}>for a Better Tomorrow</span></p></div>
    </section>

    <div className={styles.trustBanner}><div><strong>Your Trust Builds Safer Spaces</strong><small>Professional design. Reliable supervision. Lasting value.</small></div><span>Architecture for a Better Tomorrow.</span></div>

    <section id="finance" className={`${styles.financePanel} cp-section`}>
      <div className={styles.projectHeader}><div><small className={styles.panelKicker}>ACCOUNT POSITION</small><h2>Invoices & Payments</h2></div><button className="cp-secondary" onClick={()=>project&&(window.location.href=`/client/billing/${encodeURIComponent(project.projectId)}`)}>GENERATE INVOICE</button></div>
      <p className={styles.tableHint}>Swipe the table sideways to see all columns.</p><div className={styles.tableWrap} role="region" aria-label="Invoices and payments" tabIndex={0}><table><thead><tr><th>Category</th><th>Bill</th><th>Paid</th><th>Due</th></tr></thead><tbody>{finance?.categories.map((row) => <tr key={row.label}><td><span className={styles.projectName}>{row.label}</span></td><td>{financeValue(row.billed)}</td><td>{financeValue(row.paid)}</td><td><strong>{financeValue(row.due)}</strong></td></tr>)}{!finance && <tr><td colSpan={4}>{readiness === undefined ? "Loading billing…" : "Billing summary unavailable."}</td></tr>}</tbody></table></div>
    </section>

    <section className={`${styles.projects} cp-section`} id="receipts"><ProjectReceiptHistory key={project.projectId} projectId={project.projectId} clientView /></section>

    <section id="documents" className={`${styles.projects} cp-section`}>
      <div className={styles.projectHeader}><div><small className={styles.panelKicker}>PROJECT FILES</small><h2>Released Documents</h2></div></div>
      <div className={styles.clientActionList}>
        {readiness?.deliverables?.length ? <ul>{readiness.deliverables.map((file) => <li key={file.id}>
          <a href={file.url} target="_blank" rel="noreferrer">{file.title}</a>
          <small>{[file.drawing, file.revision ? `Revision ${file.revision}` : "", dateText(file.deliveredAt)].filter(Boolean).join(" · ")}</small>
        </li>)}</ul> : <p>{readiness === undefined ? "Loading released documents…" : readiness?.deliverables ? "No documents have been released for this project." : "Released documents are unavailable."}</p>}
      </div>
    </section>

    <section id="workflow-detail" className={`${styles.projects} cp-section`}><div className={styles.projectHeader}><div><small className={styles.panelKicker}>PROJECT DELIVERY</small><h2>Workflow <span style={{color:"var(--theme-ink-_91a0aa, #91a0aa)"}}>({workflow.length})</span></h2></div></div><p className={styles.tableHint}>Swipe the table sideways to see all columns.</p><div className={styles.tableWrap} role="region" aria-label="Project workflow" tabIndex={0}><table><thead><tr><th>#</th><th>Service</th><th>Status</th><th>Progress</th><th>Due date</th></tr></thead><tbody>{workflow.map((task,index)=>{const s=text(pick(task,["Status"]))||"Pending";const taskProgress=s.toLowerCase()==="completed"?100:Number(pick(task,["Progress"])||0);return <tr key={text(pick(task,["Task_ID"]))||index}><td><strong>{String(index+1).padStart(2,"0")}</strong></td><td><span className={styles.projectName}>{pick(task,["Task_Title","Title"])||"Project service"}</span><small>{pick(task,["Description"])||"LAND VIEW service workflow"}</small></td><td><span className={`${styles.status} ${statusClass(s)}`}>{s}</span></td><td><strong>{taskProgress}%</strong></td><td>{dateText(pick(task,["Due_Date","Due Date"]))}</td></tr>})}</tbody></table>{!workflow.length&&<div className={styles.empty}><h3>No workflow services yet</h3><p>Workflow will appear when billed project services are available.</p></div>}</div></section>

    <section id="site-visits" className={`\${styles.projects} cp-section`}><div className={styles.projectHeader}><div><small className={styles.panelKicker}>SITE SUPERVISION</small><h2>Site Visits <span style={{color:"var(--theme-ink-_91a0aa, #91a0aa)"}}>({siteVisits.length})</span></h2></div><span style={{color:"var(--theme-ink-_8e9aa4, #8e9aa4)",fontSize:10}}>Read-only project updates</span></div><p className={styles.tableHint}>Swipe the table sideways to see all columns.</p><div className={styles.tableWrap} role="region" aria-label="Site Visit history" tabIndex={0}><table><thead><tr><th>Date</th><th>Visit</th><th>Employee</th><th>Problem / Observation</th><th>Photos</th></tr></thead><tbody>{siteVisits.slice(0,30).map((visit:any,index:number)=>{const vurl="/api/site-visits/media?visitId="+encodeURIComponent(visit.Visit_ID)+"&kind=visit";const purl="/api/site-visits/media?visitId="+encodeURIComponent(visit.Visit_ID)+"&kind=problem";return <tr key={visit.Visit_ID||index}><td>{dateText(visit.Visit_Date)}</td><td><span className={styles.projectName}>{visit.Project_ID} · {visit.Purpose||"Site Visit"}</span><small>{visit.Location||visit.Project_Name||""}</small></td><td>{visit.Employee_Name||visit.Employee_ID||"Employee"}</td><td>{visit.Problem_Details||visit.Action_Required||"No problem recorded."}</td><td>{(visit.Visit_Photo_Available||visit.Problem_Photo_Available)?<div style={{display:"flex",gap:6}}>{visit.Visit_Photo_Available&&<a href={vurl} target="_blank" rel="noreferrer" style={{color:"#ff5960",fontSize:9}}>Visit photo</a>}{visit.Problem_Photo_Available&&<a href={purl} target="_blank" rel="noreferrer" style={{color:"#ff5960",fontSize:9}}>Problem photo</a>}</div>:"—"}</td></tr>})}</tbody></table>{!siteVisits.length&&<div className={styles.empty}><h3>{selectedDetails?.visits === undefined ? "Loading site visits…" : selectedDetails.visits === null ? "Site visits unavailable" : "No Site Visits yet"}</h3></div>}</div></section>

    <ClientCertificateCenter key={project.projectId} projectId={project.projectId} refreshKey={updated?.getTime() ?? 0} />
    </>}
  </div>;
}
