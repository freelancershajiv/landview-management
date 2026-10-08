"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Row = Record<string, unknown>;
type LeadSummary = {
  total?: number;
  newCount?: number;
  overdueFollowUps?: number;
  dueToday?: number;
  qualified?: number;
  converted?: number;
  conversionRate?: number;
};
type HealthDomain = { score?: number; label?: string };
type AttentionItem = {
  severity?: "critical" | "warning" | "info";
  type?: string;
  count?: number;
  title?: string;
  detail?: string;
  href?: string;
};
type Dashboard = {
  user?: { name?: string; role?: string };
  permissions?: Record<string, boolean>;
  stats?: {
    projectCount?: number;
    activeProjectCount?: number;
    completedProjectCount?: number;
    staleProjectCount?: number;
    employeeCount?: number;
    activeEmployeeCount?: number;
    inactiveEmployeeCount?: number;
    documentCount?: number;
    totalBill?: number;
    totalPaid?: number;
    pendingPayments?: number;
    collectionRate?: number;
  };
  health?: {
    overallScore?: number;
    label?: string;
    domains?: {
      finance?: HealthDomain;
      delivery?: HealthDomain;
      clients?: HealthDomain;
      workforce?: HealthDomain;
      data?: HealthDomain;
    };
  };
  attention?: AttentionItem[];
  projectStages?: Record<string, number>;
  websiteLeadSummary?: LeadSummary | null;
  recentProjects?: Row[];
  backend?: string;
  generatedAt?: string;
};

const n = (v: unknown) => {
  const x = Number(String(v ?? 0).replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
};
const money = (v: unknown) => `৳${n(v).toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
const pick = (r: Row, keys: string[], fallback = "") =>
  keys.map((k) => r[k]).find((v) => v !== undefined && v !== null && String(v).trim() !== "") ?? fallback;

const ADMIN_EDIT_ACTIONS = [
  ["/admin/projects/new", "New Project", "Create a complete project record"],
  ["/admin/projects/legacy", "Legacy Registration", "Register or correct older projects"],
  ["/admin/projects", "Project Editor", "Edit project records, stages and details"],
  ["/admin/projects/locations", "Project Locations", "Manage project map and location data"],
  ["/admin/projects/payment-routing", "Payment Routing", "Correct project/payment relationships"],
  ["/admin/employees", "Employees", "Manage employees, status and roles"],
  ["/admin/proposals", "Proposals", "Create and revise client proposals"],
  ["/admin/finance/bills", "Bills", "Manage project billing records"],
  ["/admin/finance/invoices", "Invoices", "Review invoice register"],
  ["/admin/accounts/entry", "Accounts Entry", "Create main account entries"],
  ["/admin/accounts", "Accounts Ledger", "Edit and reconcile ledger history"],
  ["/admin/registers", "Registers", "Manage documents and design-book records"],
  ["/admin/site-visits", "Site Visits", "Review field activity and visit records"],
  ["/admin/projects/website-curation", "Website Curation", "Control public project presentation"],
  ["/admin/municipality-accounts", "Municipality", "Manage municipality financial records"],
  ["/admin/access", "Access Control", "Manage permissions and role authority"],
  ["/admin/security", "Security", "Manage security controls"],
  ["/admin/whatsapp", "WhatsApp", "Manage WhatsApp integration"],
] as const;

function statusTone(score: number) {
  if (score >= 85) return "good";
  if (score >= 70) return "watch";
  return "bad";
}

function HealthCard({ label, domain, href, note }: { label: string; domain?: HealthDomain; href: string; note: string }) {
  const score = n(domain?.score);
  const tone = statusTone(score || 100);
  return (
    <Link href={href} className={`lv-health-card ${tone}`}>
      <div className="lv-health-card-top"><span>{label}</span><b>{domain?.label || "Healthy"}</b></div>
      <strong>{score || 100}<small>/100</small></strong>
      <div className="lv-health-track"><i style={{ width: `${Math.max(4, Math.min(100, score || 100))}%` }} /></div>
      <p>{note}</p>
    </Link>
  );
}

export default function AdminCommandCenter() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [showAdminTools, setShowAdminTools] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/management-dashboard", { credentials: "same-origin", cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) throw new Error(String(json?.error || json?.message || "Could not load command center."));
      setData(json.data || {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load command center.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const stats = data?.stats || {};
  const health = data?.health || {};
  const domains = health.domains || {};
  const role = String(data?.user?.role || "").toLowerCase();
  const full = role === "admin" || role === "manager";
  const isAdmin = role === "admin";
  const leadSummary = data?.websiteLeadSummary || {};
  const permissions = data?.permissions || {};
  const can = (key: string) => full || Boolean(permissions[key]);
  const projects = data?.recentProjects || [];
  const attention = data?.attention || [];
  const stages = Object.entries(data?.projectStages || {}).sort((a, b) => b[1] - a[1]);
  const term = query.trim().toLowerCase();
  const filtered = useMemo(() => projects.filter((r) =>
    [pick(r, ["Project_ID", "Project ID"]), pick(r, ["Project_Name", "Project Name", "Name"]),
      pick(r, ["Client_Name", "Client Name"]), pick(r, ["Location"]), pick(r, ["Stage", "Project_Stage", "Status"])]
      .join(" ").toLowerCase().includes(term)
  ).slice(0, 7), [projects, term]);

  const overallScore = n(health.overallScore) || 100;
  const overallTone = statusTone(overallScore);
  const generated = data?.generatedAt ? new Date(data.generatedAt).toLocaleString("en-BD", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" }) : "Live";

  if (loading && !data) return <div className="lv-command-loading">Loading LAND VIEW organization health…</div>;

  return (
    <div className="lv-command">
      <style>{`
        .lv-command{color:var(--theme-ink-_eef2f5,#eef2f5);padding:4px 0 36px}.lv-command *{box-sizing:border-box}.lv-command a{text-decoration:none}
        .lv-command-hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:center;padding:24px 26px;border:1px solid var(--theme-line-_2e3942,#2e3942);border-radius:16px;background:linear-gradient(145deg,var(--theme-bg-_151c22,#151c22),var(--theme-bg-_0d1318,#0d1318) 70%);box-shadow:0 16px 35px rgba(0,0,0,.15);position:relative;overflow:hidden}.lv-command-hero:after{content:"";position:absolute;right:-70px;top:-100px;width:300px;height:300px;border:1px solid rgba(227,31,38,.2);transform:rotate(45deg);pointer-events:none}.lv-eyebrow{font-size:9px;font-weight:900;letter-spacing:.18em;color:#ff686d}.lv-command h1{font-size:31px;line-height:1.05;margin:8px 0;color:var(--theme-ink-_fff,#fff)}.lv-command-hero p{margin:0;color:var(--theme-ink-_95a1ab,#95a1ab);max-width:720px;line-height:1.55;font-size:11px}.lv-command-date{display:block;margin-top:10px;color:var(--theme-ink-_66737e,#66737e);font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.lv-command-actions{display:flex;gap:8px;flex-wrap:wrap;position:relative;z-index:1}.lv-command-btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 14px;border-radius:9px;border:1px solid var(--theme-line-_39434d,#39434d);background:var(--theme-bg-_151b21,#151b21);color:var(--theme-ink-_eef2f5,#eef2f5);font-weight:800;font-size:10px;cursor:pointer}.lv-command-btn.primary{border-color:#e02b32;background:#d61f26;color:#fff}.lv-command-btn:hover{border-color:#e04a50}
        .lv-health-summary{display:grid;grid-template-columns:260px minmax(0,1fr);gap:12px;margin:14px 0}.lv-score{border:1px solid var(--theme-line-_2d3841,#2d3841);border-radius:14px;padding:19px;background:linear-gradient(150deg,var(--theme-bg-_151c22,#151c22),var(--theme-bg-_0d1318,#0d1318));display:flex;gap:17px;align-items:center}.lv-score-ring{width:94px;height:94px;border-radius:50%;display:grid;place-items:center;position:relative;background:conic-gradient(#55c785 calc(var(--score)*1%),rgba(255,255,255,.07) 0)}.lv-score.watch .lv-score-ring{background:conic-gradient(#e6aa47 calc(var(--score)*1%),rgba(255,255,255,.07) 0)}.lv-score.bad .lv-score-ring{background:conic-gradient(#e85b61 calc(var(--score)*1%),rgba(255,255,255,.07) 0)}.lv-score-ring:after{content:"";position:absolute;inset:8px;border-radius:50%;background:var(--theme-bg-_11181e,#11181e)}.lv-score-ring strong{position:relative;z-index:1;color:#fff;font-size:26px}.lv-score-copy small{color:#7f8b96;font-weight:900;text-transform:uppercase;font-size:8px;letter-spacing:.12em}.lv-score-copy b{display:block;color:#fff;font-size:16px;margin:4px 0}.lv-score-copy span{color:#7f8b96;font-size:9px;line-height:1.4;display:block}.lv-domain-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.lv-health-card{border:1px solid var(--theme-line-_2d3841,#2d3841);border-radius:12px;padding:13px;background:var(--theme-bg-_11181e,#11181e);min-width:0}.lv-health-card:hover{border-color:#4d5963}.lv-health-card-top{display:flex;justify-content:space-between;gap:5px;align-items:center}.lv-health-card-top span{font-size:9px;font-weight:900;color:#bac3ca;text-transform:uppercase}.lv-health-card-top b{font-size:8px;color:#64d391}.lv-health-card.watch .lv-health-card-top b{color:#e9b75c}.lv-health-card.bad .lv-health-card-top b{color:#ff7479}.lv-health-card>strong{display:block;color:#fff;font-size:20px;margin:8px 0 6px}.lv-health-card>strong small{font-size:8px;color:#6d7983}.lv-health-track{height:3px;background:#263038;border-radius:9px;overflow:hidden}.lv-health-track i{height:100%;display:block;background:#59c986}.lv-health-card.watch .lv-health-track i{background:#d7a348}.lv-health-card.bad .lv-health-track i{background:#df555b}.lv-health-card p{font-size:8.5px;color:#77848e;margin:8px 0 0;line-height:1.35}
        .lv-kpis{display:grid;grid-template-columns:repeat(8,minmax(110px,1fr));gap:8px;margin-bottom:14px}.lv-kpi{padding:13px 14px;border:1px solid var(--theme-line-_2d3841,#2d3841);border-radius:11px;background:var(--theme-bg-_11181e,#11181e);min-height:88px}.lv-kpi small{display:block;color:#7f8b96;text-transform:uppercase;letter-spacing:.07em;font-weight:800;font-size:8px}.lv-kpi strong{display:block;font-size:18px;margin-top:8px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lv-kpi span{display:block;margin-top:4px;color:#77848f;font-size:8.5px;line-height:1.25}.lv-kpi.alert{border-color:rgba(226,31,39,.38)}.lv-kpi.alert strong{color:#ff7277}
        .lv-main-grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(330px,.85fr);gap:14px}.lv-stack{display:grid;gap:14px;align-content:start}.lv-panel{border:1px solid var(--theme-line-_2c3740,#2c3740);border-radius:13px;background:var(--theme-bg-_10161c,#10161c);overflow:hidden}.lv-panel-head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid #273139;background:#11181f}.lv-panel-head h2{font-size:13px;margin:0;color:#fff}.lv-panel-head a,.lv-panel-head span{font-size:9px;color:#ff7478;font-weight:800}.lv-attention{display:grid;gap:8px;padding:12px}.lv-alert{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:10px;align-items:center;padding:11px;border:1px solid #313b43;border-radius:9px;background:#12181e}.lv-alert-dot{width:8px;height:8px;border-radius:50%;background:#6d7780}.lv-alert.critical .lv-alert-dot{background:#e9575d}.lv-alert.warning .lv-alert-dot{background:#e3ac4d}.lv-alert.info .lv-alert-dot{background:#6d9bd2}.lv-alert strong{display:block;color:#eef2f5;font-size:10px}.lv-alert small{display:block;color:#818c96;font-size:8.5px;margin-top:3px;line-height:1.35}.lv-alert>span{font-size:8px;color:#8b969f;font-weight:900}.lv-empty{padding:18px;color:#7f8b96;font-size:10px}
        .lv-project-stage{padding:13px}.lv-stage-row{display:grid;grid-template-columns:minmax(105px,1fr) 2.3fr 28px;gap:10px;align-items:center;margin-bottom:10px}.lv-stage-row:last-child{margin-bottom:0}.lv-stage-row span{font-size:9px;color:#aeb7bf;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lv-stage-row b{font-size:9px;color:#fff;text-align:right}.lv-stage-track{height:6px;border-radius:10px;background:#242d34;overflow:hidden}.lv-stage-track i{display:block;height:100%;background:#d61f26;border-radius:10px}
        .lv-search{margin:12px 14px;width:calc(100% - 28px);height:38px;border:1px solid #33404a;border-radius:8px;background:#0b1014;color:#fff;padding:0 11px;font-size:10px}.lv-project{display:grid;grid-template-columns:78px minmax(0,1fr) auto;gap:11px;align-items:center;margin:0 12px 7px;padding:11px;border:1px solid #29323a;border-radius:9px;background:#12181e;color:#eef2f5}.lv-project:hover{border-color:#4b5661}.lv-project-id{color:#ff666b;font-weight:900;font-size:10px}.lv-project strong{display:block;font-size:10px}.lv-project small{color:#7f8b96;font-size:8.5px}.lv-status{font-size:8.5px;color:#9aa5af;max-width:110px;text-align:right}.lv-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;padding:12px}.lv-action{padding:11px;border:1px solid #29323a;border-radius:9px;background:#12181e;color:#eef2f5;font-weight:800;font-size:9px}.lv-action:hover{border-color:#4b5661}
        .lv-admin-edit-center{margin-top:14px;border:1px solid #34414b;border-radius:13px;background:#10161c;overflow:hidden}.lv-admin-edit-toggle{width:100%;border:0;background:#11181f;color:#fff;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;text-align:left}.lv-admin-edit-toggle strong{font-size:12px}.lv-admin-edit-toggle span{font-size:9px;color:#ff686d;font-weight:900}.lv-admin-edit-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:7px;padding:12px}.lv-admin-edit-link{min-height:60px;padding:10px;border:1px solid #303b45;border-radius:9px;background:#151c22;display:flex;flex-direction:column;justify-content:center}.lv-admin-edit-link strong{color:#f6f8fa;font-size:9.5px}.lv-admin-edit-link small{margin-top:4px;color:#788691;font-size:7.8px;line-height:1.3}.lv-admin-edit-link:hover{border-color:#d61f26}.lv-error{margin:14px 0;padding:12px;border:1px solid #74373a;background:#211416;border-radius:10px;color:#ff9a9e;font-size:10px}.lv-command-loading{padding:50px 20px;color:#8c98a3}
        @media(max-width:1250px){.lv-domain-grid{grid-template-columns:repeat(3,1fr)}.lv-kpis{grid-template-columns:repeat(4,1fr)}.lv-admin-edit-grid{grid-template-columns:repeat(4,1fr)}}
        @media(max-width:980px){.lv-health-summary,.lv-main-grid{grid-template-columns:1fr}.lv-domain-grid{grid-template-columns:repeat(5,1fr)}}
        @media(max-width:760px){.lv-command-hero{grid-template-columns:1fr;padding:20px}.lv-command-actions{justify-content:flex-start}.lv-domain-grid{grid-template-columns:repeat(2,1fr)}.lv-kpis{grid-template-columns:repeat(2,1fr)}.lv-actions{grid-template-columns:1fr}.lv-admin-edit-grid{grid-template-columns:repeat(2,1fr)}.lv-project{grid-template-columns:70px minmax(0,1fr)}.lv-status{display:none}}
        @media(max-width:460px){.lv-health-summary{display:block}.lv-score{margin-bottom:10px}.lv-domain-grid{grid-template-columns:1fr}.lv-kpis{grid-template-columns:1fr 1fr}.lv-admin-edit-grid{grid-template-columns:1fr}}
      `}</style>

      <section className="lv-command-hero">
        <div>
          <span className="lv-eyebrow">LAND VIEW • ORGANIZATION COMMAND CENTER</span>
          <h1>Organization Health.</h1>
          <p>One live view of finance, project delivery, client pipeline, workforce and system readiness. Problems that need management attention rise to the top automatically.</p>
          <span className="lv-command-date">Updated {generated} · Role: {String(data?.user?.role || "user")}</span>
        </div>
        <div className="lv-command-actions">
          <button className="lv-command-btn" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "↻ Refresh"}</button>
          {full && <Link className="lv-command-btn" href="/admin/website-leads">Client Enquiries</Link>}
          {can("projects.edit") && <Link className="lv-command-btn primary" href="/admin/projects/new">+ New Project</Link>}
        </div>
      </section>

      {error && <div className="lv-error">{error} <button className="lv-command-btn" onClick={() => void load()} style={{ marginLeft: 8, minHeight: 28 }}>Retry</button></div>}

      <section className="lv-health-summary" aria-label="Organization health">
        <div className={`lv-score ${overallTone}`} style={{ "--score": overallScore } as React.CSSProperties}>
          <div className="lv-score-ring"><strong>{overallScore}</strong></div>
          <div className="lv-score-copy"><small>Overall Health</small><b>{health.label || "Healthy"}</b><span>Weighted view of finance, delivery, clients, workforce and data availability.</span></div>
        </div>
        <div className="lv-domain-grid">
          <HealthCard label="Finance" domain={domains.finance} href="/admin/finance" note={`${n(stats.collectionRate)}% collection / reconciliation rate`} />
          <HealthCard label="Delivery" domain={domains.delivery} href="/admin/projects" note={`${n(stats.staleProjectCount)} active projects need progress review`} />
          <HealthCard label="Clients" domain={domains.clients} href="/admin/website-leads" note={`${n(leadSummary.overdueFollowUps)} overdue follow-ups`} />
          <HealthCard label="Workforce" domain={domains.workforce} href="/admin/employees" note={`${n(stats.activeEmployeeCount)} active of ${n(stats.employeeCount)} employees`} />
          <HealthCard label="Data" domain={domains.data} href="/admin/security" note={data?.backend === "supabase-postgresql" ? "Supabase management data online" : "Management data connection"} />
        </div>
      </section>

      <section className="lv-kpis" aria-label="Executive indicators">
        <div className="lv-kpi"><small>Projects</small><strong>{n(stats.projectCount)}</strong><span>{n(stats.activeProjectCount)} ongoing</span></div>
        <div className={`lv-kpi ${n(stats.staleProjectCount) > 0 ? "alert" : ""}`}><small>Needs Review</small><strong>{n(stats.staleProjectCount)}</strong><span>30+ days without update</span></div>
        {can("finance.view") && <div className="lv-kpi"><small>Total Billed</small><strong>{money(stats.totalBill)}</strong><span>Effective billing records</span></div>}
        {can("finance.view") && <div className="lv-kpi"><small>Collected</small><strong>{money(stats.totalPaid)}</strong><span>{n(stats.collectionRate)}% of billing</span></div>}
        {can("finance.view") && <div className={`lv-kpi ${Math.abs(n(stats.pendingPayments)) > 0.01 ? "alert" : ""}`}><small>Reconciliation Gap</small><strong>{money(Math.abs(n(stats.pendingPayments)))}</strong><span>Bills vs effective payments</span></div>}
        {full && <div className={`lv-kpi ${n(leadSummary.overdueFollowUps) > 0 ? "alert" : ""}`}><small>Lead Actions</small><strong>{n(leadSummary.newCount) + n(leadSummary.overdueFollowUps) + n(leadSummary.dueToday)}</strong><span>{n(leadSummary.overdueFollowUps)} overdue</span></div>}
        {can("employees.view") && <div className="lv-kpi"><small>Active People</small><strong>{n(stats.activeEmployeeCount)}</strong><span>{n(stats.inactiveEmployeeCount)} inactive / former</span></div>}
        <div className="lv-kpi"><small>Project Files</small><strong>{n(stats.documentCount)}</strong><span>Document records</span></div>
      </section>

      <div className="lv-main-grid">
        <div className="lv-stack">
          <section className="lv-panel">
            <div className="lv-panel-head"><h2>Management Attention</h2><span>{attention.length ? `${attention.length} SIGNAL${attention.length === 1 ? "" : "S"}` : "CLEAR"}</span></div>
            <div className="lv-attention">
              {attention.map((item, index) => <Link key={`${item.type}-${index}`} href={item.href || "/admin"} className={`lv-alert ${item.severity || "info"}`}><i className="lv-alert-dot"/><div><strong>{item.title || "Review required"}</strong><small>{item.detail || "Open the related workspace for details."}</small></div><span>OPEN →</span></Link>)}
              {!attention.length && <div className="lv-empty">No organization-level warnings detected from the current dashboard data.</div>}
            </div>
          </section>

          <section className="lv-panel">
            <div className="lv-panel-head"><h2>Recent Projects</h2>{can("projects.view") && <Link href="/admin/projects">Project register →</Link>}</div>
            <input className="lv-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search project, client, location or stage…" />
            {filtered.map((r, i) => {
              const id = String(pick(r, ["Project_ID", "Project ID"], "—"));
              const name = String(pick(r, ["Project_Name", "Project Name", "Name", "Client_Name"], id));
              const stage = String(pick(r, ["Stage", "Project_Stage", "Project Stage", "Status"], "Active"));
              return <Link className="lv-project" key={id + i} href={`/admin/projects/${encodeURIComponent(id)}`}><span className="lv-project-id">{id}</span><span><strong>{name}</strong><small>{String(pick(r, ["Location"], "LAND VIEW project"))}</small></span><span className="lv-status">{stage}</span></Link>;
            })}
            {!filtered.length && <div className="lv-empty">No projects match your search.</div>}
          </section>
        </div>

        <div className="lv-stack">
          <section className="lv-panel">
            <div className="lv-panel-head"><h2>Active Project Stages</h2><Link href="/admin/projects">View projects →</Link></div>
            <div className="lv-project-stage">
              {stages.map(([stage, count]) => <div className="lv-stage-row" key={stage}><span title={stage}>{stage}</span><div className="lv-stage-track"><i style={{ width: `${Math.max(5, n(stats.activeProjectCount) ? (count / n(stats.activeProjectCount)) * 100 : 0)}%` }}/></div><b>{count}</b></div>)}
              {!stages.length && <div className="lv-empty">No active project stage data available.</div>}
            </div>
          </section>

          <section className="lv-panel">
            <div className="lv-panel-head"><h2>Client & Pipeline</h2><Link href="/admin/website-leads">Open CRM →</Link></div>
            <div className="lv-actions">
              <Link className="lv-action" href="/admin/website-leads?status=New">New enquiries · {n(leadSummary.newCount)}</Link>
              <Link className="lv-action" href="/admin/website-leads?follow=Overdue">Overdue follow-ups · {n(leadSummary.overdueFollowUps)}</Link>
              <Link className="lv-action" href="/admin/website-leads?status=Qualified">Qualified · {n(leadSummary.qualified)}</Link>
              <Link className="lv-action" href="/admin/website-leads?status=Converted">Converted · {n(leadSummary.converted)}</Link>
            </div>
          </section>

          <section className="lv-panel">
            <div className="lv-panel-head"><h2>Operations</h2></div>
            <div className="lv-actions">
              {can("finance.view") && <Link className="lv-action" href="/admin/finance">Billing & Payments →</Link>}
              {can("ledger.view") && <Link className="lv-action" href="/admin/accounts">Accounts Ledger →</Link>}
              <Link className="lv-action" href="/admin/site-visits">Site Visits →</Link>
              {can("workflow.view") && <Link className="lv-action" href="/admin/workflow">Project Workflow →</Link>}
              <Link className="lv-action" href="/admin/website-analytics">Website Analytics →</Link>
              <Link className="lv-action" href="/admin/whatsapp">WhatsApp Status →</Link>
            </div>
          </section>
        </div>
      </div>

      {isAdmin && <section className="lv-admin-edit-center" aria-label="Admin editing center">
        <button className="lv-admin-edit-toggle" onClick={() => setShowAdminTools((v) => !v)}><strong>Admin Editing & Control Center</strong><span>{showAdminTools ? "HIDE CONTROLS ↑" : `${ADMIN_EDIT_ACTIONS.length} CONTROLS ↓`}</span></button>
        {showAdminTools && <div className="lv-admin-edit-grid">{ADMIN_EDIT_ACTIONS.map(([href, label, description]) => <Link key={href} href={href} className="lv-admin-edit-link"><strong>{label}</strong><small>{description}</small></Link>)}</div>}
      </section>}
    </div>
  );
}
