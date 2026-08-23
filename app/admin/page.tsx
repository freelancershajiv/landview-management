"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { landViewApi, DashboardData } from "@/lib/api";
import { ErrorState, LoadingState, Money, PageHeader, StatCard, StatusBadge, pick, formatDate } from "@/components/lv-ui";

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try { setData(await landViewApi.getDashboard()); }
    catch (e: any) { setError(e?.message || "Could not load dashboard."); }
  }
  useEffect(() => { load(); }, []);

  if (!data && !error) return <LoadingState label="Loading dashboard..."/>;
  if (!data) return <ErrorState message={error} onRetry={load}/>;

  const s = data.stats;
  const paidPct = s.totalBill > 0 ? Math.min(100, Math.round((s.totalPaid / s.totalBill) * 100)) : 0;

  return <>
    <section className="dashboard-showcase">
      <div className="dashboard-showcase-grid" />
      <div className="dashboard-showcase-copy">
        <span className="showcase-tag">DESIGNED TO DELIVER</span>
        <h1>Complete Project Management Solutions</h1>
        <p>Projects, teams, documents, site supervision and finance — managed from one LAND VIEW workspace.</p>
        <div className="showcase-actions">
          <Link href="/admin/projects/new" className="btn btn-accent">Create a project</Link>
          <Link href="/admin/projects" className="btn btn-outline-light">Browse projects</Link>
        </div>
      </div>
      <div className="showcase-panel">
        <span>LIVE OPERATIONS</span>
        <strong>{s.activeProjectCount}</strong>
        <small>Active projects</small>
      </div>
    </section>

    <div className="dashboard-search-band">
      <div className="dashboard-search-label">
        <span className="search-ring">LV</span>
        <strong>QUICK ACCESS</strong>
      </div>
      <div className="dashboard-shortcuts">
        <Link href="/admin/projects">Projects</Link>
        <Link href="/admin/employees">Employees</Link>
        <Link href="/admin/documents">Documents</Link>
        <Link href="/admin/finance">Finance</Link>
      </div>
    </div>

    <PageHeader eyebrow="OVERVIEW" title={`Good day, ${data.user?.name || data.user?.Name || "Admin"}.`} description="A live view of your LAND VIEW operations and financial position." action={<Link href="/admin/projects/new" className="btn btn-dark">+ New project</Link>}/>

    <div className="stats-grid">
      <StatCard label="TOTAL PROJECTS" value={s.projectCount} detail={`${s.activeProjectCount} currently active`} icon="◇"/>
      <StatCard label="EMPLOYEES" value={s.employeeCount} detail="Team members on record" icon="◎"/>
      <StatCard label="TOTAL BILLED" value={<Money value={s.totalBill}/>} detail="Across all bill records" icon="৳"/>
      <StatCard label="OUTSTANDING" value={<Money value={s.pendingPayments}/>} detail={`${paidPct}% collected`} icon="↗"/>
    </div>

    <div className="dashboard-grid">
      <section className="card card-dark finance-hero">
        <div className="card-kicker">FINANCIAL POSITION</div>
        <div className="finance-number"><Money value={s.totalPaid}/></div>
        <p>Collected against <Money value={s.totalBill}/> billed.</p>
        <div className="progress dark"><span style={{ width: `${paidPct}%` }}/></div>
        <div className="finance-row"><span>{paidPct}% collected</span><Link href="/admin/finance">Open finance →</Link></div>
      </section>

      <section className="card quick-card">
        <div className="section-title"><div><span>SHORTCUTS</span><h2>Quick actions</h2></div></div>
        <div className="quick-grid">
          <Link href="/admin/projects/new"><b>+</b><span>New project</span></Link>
          <Link href="/admin/employees"><b>◎</b><span>Add employee</span></Link>
          <Link href="/admin/documents"><b>▤</b><span>Add document</span></Link>
          <Link href="/admin/site-supervision"><b>⌁</b><span>Site visit</span></Link>
        </div>
      </section>
    </div>

    <section className="card table-card">
      <div className="section-title"><div><span>RECENT ACTIVITY</span><h2>Recent projects</h2></div><Link href="/admin/projects" className="text-link">View all →</Link></div>
      {data.recentProjects.length ? <div className="table-scroll"><table><thead><tr><th>Project</th><th>Client</th><th>Type</th><th>Status</th><th>Start</th><th></th></tr></thead><tbody>
        {data.recentProjects.map((p: any, i) => { const id=pick(p,["Project_ID","Project ID","ProjectId"],`Project ${i+1}`); return <tr key={id}><td><strong>{id}</strong><small>{pick(p,["Project_Name","Project Name","Name","Location"],"LAND VIEW Project")}</small></td><td>{pick(p,["Client_Name","Client Name","Client"],"—")}</td><td>{pick(p,["Project_Type","Project Type","Type"],"—")}</td><td><StatusBadge value={pick(p,["Status","status","Active"],"Active")}/></td><td>{formatDate(p.Start_Date || p["Start Date"] || p.Created_Date)}</td><td><Link className="row-link" href={`/admin/projects/${encodeURIComponent(id)}`}>Open →</Link></td></tr>; })}
      </tbody></table></div> : <div className="empty-inline">No projects yet. Create your first project to start the workspace.</div>}
    </section>
  </>;
}
