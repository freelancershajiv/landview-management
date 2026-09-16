"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorState, Money, pick } from "@/components/lv-ui";
import styles from "@/app/admin/dashboard.module.css";

type Row = Record<string, unknown>;
type Dashboard = {
  user?: { name?: string; role?: string; userId?: string; employeeId?: string };
  permissions?: Record<string, boolean>;
  stats?: { projectCount?: number; activeProjectCount?: number; employeeCount?: number; documentCount?: number; totalBill?: number; totalPaid?: number; pendingPayments?: number };
  recentProjects?: Row[];
};

const number = (v: unknown) => { const n = Number(String(v ?? 0).replace(/,/g,"")); return Number.isFinite(n)?n:0; };

async function loadDashboard() {
  const response = await fetch("/api/management-dashboard",{credentials:"same-origin",cache:"no-store"});
  const json = await response.json().catch(()=>null);
  if(!response.ok||!json?.success) throw new Error(String(json?.error||json?.message||"Could not load management dashboard."));
  return (json.data||{}) as Dashboard;
}

export default function ManagementDashboardV2(){
  const [data,setData]=useState<Dashboard|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [updated,setUpdated]=useState<Date|null>(null);

  const load=useCallback(async()=>{setLoading(true);setError("");try{setData(await loadDashboard());setUpdated(new Date());}catch(e){setError(e instanceof Error?e.message:"Could not load dashboard.");}finally{setLoading(false)}},[]);
  useEffect(()=>{void load()},[load]);

  const stats=data?.stats||{};
  const p=data?.permissions||{};
  const projects=data?.recentProjects||[];
  const term=query.trim().toLowerCase();
  const recent=projects.filter(row=>[pick(row,["Project_ID","Project ID"]),pick(row,["Project_Name","Project Name","Name"]),pick(row,["Client_Name","Client Name"]),pick(row,["Location"]),pick(row,["Status"])].join(" ").toLowerCase().includes(term));
  const billed=number(stats.totalBill),paid=number(stats.totalPaid),due=number(stats.pendingPayments);
  const rate=billed>0?Math.max(0,Math.round((paid/billed)*100)):0;
  const can=(key:string)=>Boolean(p[key]);
  const role=String(data?.user?.role||"").toLowerCase();
  const full=role==="admin"||role==="manager";
  const proposalCreate=full||can("proposals.create");
  const projectEdit=full||can("projects.edit");
  const financeView=full||can("finance.view")||can("ledger.view")||can("accounts.view");

  if(!data&&loading)return <div className={styles.skeleton} role="status"><span/><span/><span/><span/><span/><span/></div>;

  return <div className={styles.root}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>LAND VIEW ERP</span><h1>Command center<span aria-hidden="true">.</span></h1><span className={styles.timestamp}>{loading?"Updating workspace…":updated?`Updated ${updated.toLocaleTimeString("en-BD",{hour:"2-digit",minute:"2-digit",timeZone:"Asia/Dhaka"})} · ${data?.user?.name||"LAND VIEW"}`:"Management workspace"}</span></div>
      <div className={styles.actions}>
        <button type="button" className={styles.refresh} onClick={load} disabled={loading}><span aria-hidden="true">↻</span>{loading?"Updating…":"Refresh"}</button>
        {proposalCreate&&<Link className={styles.primary} href="/admin/proposals/new">+ Add Client</Link>}
        {projectEdit&&<Link className={styles.primary} href="/admin/projects/new">+ New project</Link>}
      </div>
    </header>

    {error&&<div role="alert" className={styles.error}><ErrorState message={error} onRetry={loading?undefined:load}/></div>}

    <section className={styles.metrics} aria-label="Business totals">
      <Link href="/admin/projects" className={styles.metric}><span className={styles.metricTitle}>Total projects <i>↗</i></span><strong>{number(stats.projectCount)}</strong><small>Projects available to this account</small></Link>
      <Link href="/admin/projects" className={styles.metric}><span className={styles.metricTitle}>Ongoing <i>↗</i></span><strong>{number(stats.activeProjectCount)}</strong><small>Active project assignments</small></Link>
      {financeView&&<Link href="/admin/finance" className={`${styles.metric} ${styles.dueMetric}`}><span className={styles.metricTitle}>Receivables <i>↗</i></span><strong><Money value={Math.abs(due)}/></strong><small>Current billing balance</small></Link>}
      {financeView&&<Link href="/admin/finance" className={styles.metric}><span className={styles.metricTitle}>Collected <i>↗</i></span><strong><Money value={paid}/></strong><small>{rate}% of recorded billing</small></Link>}
      {(full||can("employees.view"))&&<Link href="/admin/employees" className={styles.metric}><span className={styles.metricTitle}>People <i>↗</i></span><strong>{number(stats.employeeCount)}</strong><small>Employees in workspace</small></Link>}
      <div className={styles.metric}><span className={styles.metricTitle}>Project files</span><strong>{number(stats.documentCount)}</strong><small>Documents within your project scope</small></div>
    </section>

    <section className={styles.moduleGrid} aria-label="Workspace modules">
      {(full||can("projects.view"))&&<Link href="/admin/projects" className={styles.moduleCard}><span className={styles.moduleIcon}>01</span><div><small>CORE OPERATIONS</small><strong>Project control</strong><p>Projects, teams, records and delivery status.</p></div><b>→</b></Link>}
      {(full||can("workflow.view"))&&<Link href="/admin/workflow" className={styles.moduleCard}><span className={styles.moduleIcon}>02</span><div><small>DELIVERY</small><strong>Workflow</strong><p>Required services, assignments and progress.</p></div><b>→</b></Link>}
      {(full||can("proposals.view"))&&<Link href="/admin/proposals" className={styles.moduleCard}><span className={styles.moduleIcon}>03</span><div><small>SALES PIPELINE</small><strong>Proposals</strong><p>Prospective clients, pricing, review and printable offers.</p></div><b>→</b></Link>}
    </section>

    <div className={styles.middle}>
      <section className={styles.collection} aria-labelledby="recent-heading">
        <div className={styles.panelTop}><h2 id="recent-heading">Recent projects</h2>{(full||can("projects.view"))&&<Link href="/admin/projects">Open register ↗</Link>}</div>
        <div style={{display:"flex",gap:8,margin:"16px 0 10px"}}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Find project, client or location…" style={{width:"100%",border:"1px solid #35414b",borderRadius:8,background:"#0c1319",color:"#eef2f5",padding:"10px 12px"}}/></div>
        <div style={{display:"grid",gap:8}}>{recent.slice(0,8).map((row,index)=>{const id=String(pick(row,["Project_ID","Project ID"],"—"));const name=String(pick(row,["Project_Name","Project Name","Name","Client_Name"],id));const status=String(pick(row,["Status"],"Active"));return <Link key={`${id}-${index}`} href={`/admin/projects/${encodeURIComponent(id)}`} style={{display:"grid",gridTemplateColumns:"86px 1fr auto",gap:12,padding:"12px 13px",border:"1px solid #333d45",borderRadius:9,background:"#111920",color:"#eef2f5",textDecoration:"none"}}><b style={{color:"#ff756e"}}>{id}</b><span><strong style={{display:"block"}}>{name}</strong><small style={{color:"#81909a"}}>{String(pick(row,["Location"],""))||"LAND VIEW project"}</small></span><small style={{color:"#9aa7b1"}}>{status}</small></Link>})}{!recent.length&&<div style={{padding:22,color:"#83909a"}}>No matching projects.</div>}</div>
      </section>

      <section className={styles.launcher} aria-labelledby="quick-heading">
        <div className={styles.panelTop}><h2 id="quick-heading">Quick actions</h2><span>↗</span></div>
        {proposalCreate&&<Link href="/admin/proposals/new"><span className={styles.launchIcon}>＋</span><span>Add prospective client</span><b>→</b></Link>}
        {(full||can("proposals.view"))&&<Link href="/admin/proposals"><span className={styles.launchIcon}>P</span><span>Open proposal register</span><b>→</b></Link>}
        {(full||can("finance.view"))&&<Link href="/admin/finance/invoices"><span className={styles.launchIcon}>৳</span><span>Open client billing</span><b>→</b></Link>}
        {(full||can("ledger.view"))&&<Link href="/admin/accounts"><span className={styles.launchIcon}>L</span><span>Open accounts ledger</span><b>→</b></Link>}
      </section>
    </div>
  </div>;
}
