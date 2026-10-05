"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Row = Record<string, unknown>;
type Dashboard = {
  user?: { name?: string; role?: string };
  permissions?: Record<string, boolean>;
  stats?: {
    projectCount?: number;
    activeProjectCount?: number;
    employeeCount?: number;
    documentCount?: number;
    totalBill?: number;
    totalPaid?: number;
    pendingPayments?: number;
  };
  recentProjects?: Row[];
};

const n = (v: unknown) => {
  const x = Number(String(v ?? 0).replace(/,/g, ""));
  return Number.isFinite(x) ? x : 0;
};
const money = (v: unknown) => `৳${n(v).toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
const pick = (r: Row, keys: string[], fallback = "") =>
  keys.map(k => r[k]).find(v => v !== undefined && v !== null && String(v).trim() !== "") ?? fallback;

export default function AdminCommandCenter() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

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
  const role = String(data?.user?.role || "").toLowerCase();
  const full = role === "admin" || role === "manager";
  const permissions = data?.permissions || {};
  const can = (key: string) => full || Boolean(permissions[key]);
  const projects = data?.recentProjects || [];
  const term = query.trim().toLowerCase();
  const filtered = useMemo(() => projects.filter(r =>
    [pick(r, ["Project_ID", "Project ID"]), pick(r, ["Project_Name", "Project Name", "Name"]),
      pick(r, ["Client_Name", "Client Name"]), pick(r, ["Location"]), pick(r, ["Status"])]
      .join(" ").toLowerCase().includes(term)
  ).slice(0, 6), [projects, term]);

  const userName = String(data?.user?.name || "LAND VIEW").trim();
  const billed = n(stats.totalBill);
  const paid = n(stats.totalPaid);
  const billingGap = billed - paid;
  const collectionRate = billed > 0 ? Math.round((paid / billed) * 100) : 0;

  if (loading && !data) return <div className="lv-command-loading">Loading LAND VIEW Command Center…</div>;

  return (
    <div className="lv-command">
      <style>{`
        .lv-command{color:var(--theme-ink-_eef2f5, #eef2f5);padding:4px 0 34px}
        .lv-command *{box-sizing:border-box}
        .lv-command-hero{display:flex;justify-content:space-between;gap:22px;align-items:flex-end;padding:25px 26px;border:1px solid var(--theme-line-_2e3942, #2e3942);border-radius:15px;background:linear-gradient(145deg,var(--theme-bg-_151c22, #151c22),var(--theme-bg-_0e1419, #0e1419) 72%);box-shadow:0 16px 35px var(--theme-shadow-rgba_0_0_0__18_, rgba(0,0,0,.18));position:relative;overflow:hidden}
        .lv-command-hero:after{content:"";position:absolute;right:-40px;top:-70px;width:220px;height:220px;border:1px solid var(--theme-line-rgba_227_31_38__28_, rgba(227,31,38,.28));transform:rotate(45deg);pointer-events:none}
        .lv-eyebrow{font-size:9px;font-weight:900;letter-spacing:.18em;color:#ff686d}.lv-command h1{font-size:32px;line-height:1.05;margin:8px 0 8px;color:var(--theme-ink-_fff, #fff)}.lv-command-hero p{margin:0;color:var(--theme-ink-_95a1ab, #95a1ab);max-width:730px;line-height:1.55;font-size:12px}
        .lv-command-date{display:block;margin-top:10px;color:var(--theme-ink-_66737e, #66737e);font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}
        .lv-command-actions{display:flex;gap:8px;flex-wrap:wrap}.lv-command-btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 14px;border-radius:9px;border:1px solid var(--theme-line-_39434d, #39434d);background:var(--theme-bg-_151b21, #151b21);color:var(--theme-ink-_eef2f5, #eef2f5);text-decoration:none;font-weight:800;font-size:11px}.lv-command-btn.primary{border-color:var(--theme-line-_e02b32, #e02b32);background:#d61f26;color:#fff}.lv-command-btn:hover{border-color:var(--theme-line-_e04a50, #e04a50)}
        .lv-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin:14px 0}.lv-kpi{padding:15px 16px;border:1px solid var(--theme-line-_2d3841, #2d3841);border-radius:12px;background:linear-gradient(150deg,var(--theme-bg-_151c22, #151c22),var(--theme-bg-_0d1318, #0d1318));min-height:108px;position:relative;overflow:hidden}.lv-kpi:before{content:"";position:absolute;left:0;top:0;width:38px;height:2px;background:#e21f27}.lv-kpi small{display:block;color:var(--theme-ink-_7f8b96, #7f8b96);text-transform:uppercase;letter-spacing:.09em;font-weight:800;font-size:9px}.lv-kpi strong{display:block;font-size:22px;margin-top:9px;color:var(--theme-ink-_fff, #fff)}.lv-kpi span{display:block;margin-top:5px;color:var(--theme-ink-_77848f, #77848f);font-size:10px}
        .lv-grid{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(300px,.85fr);gap:14px}.lv-panel{border:1px solid var(--theme-line-_2c3740, #2c3740);border-radius:13px;background:var(--theme-bg-_10161c, #10161c);overflow:hidden;box-shadow:0 10px 28px var(--theme-shadow-rgba_0_0_0__08_, rgba(0,0,0,.08))}.lv-panel-head{display:flex;justify-content:space-between;align-items:center;padding:15px 17px;border-bottom:1px solid var(--theme-line-_273139, #273139);background:var(--theme-bg-_11181f, #11181f)}.lv-panel-head h2{font-size:14px;margin:0;color:var(--theme-ink-_fff, #fff)}.lv-panel-head a{font-size:10px;color:var(--theme-ink-_ff7478, #ff7478);text-decoration:none;font-weight:800}.lv-search{margin:14px 16px;width:calc(100% - 32px);height:40px;border:1px solid var(--theme-line-_33404a, #33404a);border-radius:8px;background:var(--theme-bg-_0b1014, #0b1014);color:var(--theme-ink-_fff, #fff);padding:0 12px;font-size:11px}.lv-project{display:grid;grid-template-columns:82px minmax(0,1fr) auto;gap:12px;align-items:center;margin:0 14px 8px;padding:12px;border:1px solid var(--theme-line-_29323a, #29323a);border-radius:10px;background:var(--theme-bg-_12181e, #12181e);color:var(--theme-ink-_eef2f5, #eef2f5);text-decoration:none}.lv-project:hover{border-color:var(--theme-line-_4b5661, #4b5661)}.lv-project-id{color:#ff666b;font-weight:900;font-size:11px}.lv-project strong{display:block;font-size:12px}.lv-project small{color:var(--theme-ink-_7f8b96, #7f8b96)}.lv-status{font-size:10px;color:var(--theme-ink-_9aa5af, #9aa5af)}.lv-actions{display:grid;gap:8px;padding:14px}.lv-action{display:flex;align-items:center;gap:11px;padding:12px;border:1px solid var(--theme-line-_29323a, #29323a);border-radius:10px;background:var(--theme-bg-_12181e, #12181e);color:var(--theme-ink-_eef2f5, #eef2f5);text-decoration:none;font-weight:800;font-size:11px}.lv-action:hover{border-color:var(--theme-line-_4b5661, #4b5661)}.lv-action i{font-style:normal;width:30px;height:30px;display:grid;place-items:center;border-radius:8px;background:var(--theme-bg-_20191b, #20191b);color:var(--theme-ink-_ff777b, #ff777b)}.lv-attention{display:grid;gap:8px;padding:14px}.lv-alert{display:flex;gap:10px;padding:11px;border-radius:9px;border:1px solid var(--theme-line-_3a3031, #3a3031);background:var(--theme-bg-_191416, #191416)}.lv-alert b{color:#ff696e;font-size:11px}.lv-alert span{color:var(--theme-ink-_8f9aa4, #8f9aa4);font-size:10px;line-height:1.45}.lv-health{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:14px}.lv-health div{padding:12px;border:1px solid var(--theme-line-_29323a, #29323a);border-radius:9px;background:var(--theme-bg-_12181e, #12181e)}.lv-health b{display:block;color:var(--theme-ink-_7bd49b, #7bd49b);font-size:10px}.lv-health span{font-size:10px;color:var(--theme-ink-_7f8b96, #7f8b96)}.lv-empty{padding:20px;color:var(--theme-ink-_7f8b96, #7f8b96);font-size:11px}.lv-error{margin:0 0 14px;padding:12px;border:1px solid var(--theme-line-_74373a, #74373a);background:var(--theme-bg-_211416, #211416);border-radius:10px;color:var(--theme-ink-_ff9a9e, #ff9a9e);font-size:11px}.lv-command-loading{padding:50px 20px;color:var(--theme-ink-_8c98a3, #8c98a3)}
        @media(max-width:1100px){.lv-kpis{grid-template-columns:repeat(3,1fr)}.lv-grid{grid-template-columns:1fr}}
        @media(max-width:700px){.lv-command-hero{display:block;padding:20px}.lv-command-actions{margin-top:16px}.lv-kpis{grid-template-columns:repeat(2,1fr)}.lv-project{grid-template-columns:70px minmax(0,1fr)}.lv-status{display:none}.lv-health{grid-template-columns:1fr}}
        @media(max-width:420px){.lv-kpis{grid-template-columns:1fr}}
      `}</style>

      <section className="lv-command-hero">
        <div>
          <span className="lv-eyebrow">LAND VIEW • MANAGEMENT SYSTEM</span>
          <h1>Dashboard.</h1>
          <p>Welcome back, {userName}. Here’s the current operational picture across projects, billing, delivery and your workspace.</p>
          <span className="lv-command-date">Live workspace overview · Role: {String(data?.user?.role || "user")}</span>
        </div>
        <div className="lv-command-actions">
          <button className="lv-command-btn" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "↻ Refresh"}</button>
          {can("projects.edit") && <Link className="lv-command-btn primary" href="/admin/projects/new">+ New Project</Link>}
          {can("proposals.create") && <Link className="lv-command-btn" href="/admin/proposals/new">+ Client / Proposal</Link>}
        </div>
      </section>

      {error && <div className="lv-error">{error} <button className="lv-command-btn" onClick={() => void load()} style={{marginLeft:8,minHeight:30}}>Retry</button></div>}

      <section className="lv-kpis" aria-label="Business overview">
        <div className="lv-kpi"><small>Total Projects</small><strong>{n(stats.projectCount)}</strong><span>All accessible projects</span></div>
        <div className="lv-kpi"><small>Ongoing</small><strong>{n(stats.activeProjectCount)}</strong><span>Active assignments</span></div>
        {can("finance.view") && <div className="lv-kpi"><small>Billing Total</small><strong>{money(billed)}</strong><span>Effective recorded bills</span></div>}
        {can("finance.view") && <div className="lv-kpi"><small>Collected</small><strong>{money(paid)}</strong><span>{collectionRate}% of effective payments</span></div>}
        {can("employees.view") && <div className="lv-kpi"><small>People</small><strong>{n(stats.employeeCount)}</strong><span>Employees in workspace</span></div>}
        <div className="lv-kpi"><small>Project Files</small><strong>{n(stats.documentCount)}</strong><span>Accessible records</span></div>
      </section>

      <div className="lv-grid">
        <section className="lv-panel">
          <div className="lv-panel-head"><h2>Recent Projects</h2>{can("projects.view") && <Link href="/admin/projects">Open register →</Link>}</div>
          <input className="lv-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search project, client, location or status…" />
          {filtered.map((r, i) => {
            const id = String(pick(r, ["Project_ID", "Project ID"], "—"));
            const name = String(pick(r, ["Project_Name", "Project Name", "Name", "Client_Name"], id));
            return <Link className="lv-project" key={id + i} href={`/admin/projects/${encodeURIComponent(id)}`}>
              <span className="lv-project-id">{id}</span><span><strong>{name}</strong><small>{String(pick(r, ["Location"], "LAND VIEW project"))}</small></span><span className="lv-status">{String(pick(r, ["Status"], "Active"))}</span>
            </Link>;
          })}
          {!filtered.length && <div className="lv-empty">No projects match your search.</div>}
        </section>

        <div style={{display:"grid",gap:14,alignContent:"start"}}>
          <section className="lv-panel">
            <div className="lv-panel-head"><h2>Action Center</h2><span style={{fontSize:10,color:"var(--theme-ink-_7f8b96, #7f8b96)"}}>Next improvements</span></div>
            <div className="lv-attention">
              {can("finance.view") && Math.abs(billingGap) > 0.01 && <Link href="/admin/finance" className="lv-alert"><b>RECONCILE</b><span>{money(Math.abs(billingGap))} gap exists between effective bills and effective payments. Review billing reconciliation before treating it as client due.</span></Link>}
              {can("projects.view") && n(stats.activeProjectCount) > 0 && <Link href="/admin/projects" className="lv-alert"><b>DELIVERY</b><span>{n(stats.activeProjectCount)} active project assignments are currently in the workspace.</span></Link>}
              {Math.abs(billingGap) <= 0.01 && !stats.activeProjectCount && <div className="lv-empty">No immediate dashboard-level actions detected.</div>}
            </div>
          </section>

          <section className="lv-panel">
            <div className="lv-panel-head"><h2>Quick Access</h2></div>
            <div className="lv-actions">
              {can("finance.view") && <Link className="lv-action" href="/admin/finance"><i>৳</i>Billing & Client Payments →</Link>}
              {can("ledger.view") && <Link className="lv-action" href="/admin/accounts"><i>L</i>Accounts Ledger →</Link>}
              {can("workflow.view") && <Link className="lv-action" href="/admin/workflow"><i>W</i>Project Workflow →</Link>}
              {can("proposals.view") && <Link className="lv-action" href="/admin/proposals"><i>P</i>Proposal Register →</Link>}
            </div>
          </section>

          <section className="lv-panel">
            <div className="lv-panel-head"><h2>Workspace Health</h2></div>
            <div className="lv-health">
              <div><b>● ONLINE</b><span>Admin workspace</span></div>
              <div><b>● PROTECTED</b><span>Role-based access</span></div>
              <div><b>● LIVE DATA</b><span>Management dashboard</span></div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
