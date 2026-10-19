"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Row = Record<string, unknown>;
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
    employeeCount?: number;
    activeEmployeeCount?: number;
    inactiveEmployeeCount?: number;
  };
  attention?: AttentionItem[];
  projectStages?: Record<string, number>;
  recentProjects?: Row[];
  generatedAt?: string;
};
type BalanceData = {
  currentBalance?: number;
};
type DailyBrief = {
  dateLabel?: string;
  finance?: { received?: number; spent?: number; netMovement?: number };
  operations?: { siteVisits?: number };
  actionCenter?: { counts?: { total?: number; critical?: number; warning?: number } };
};

const n = (value: unknown) => {
  const parsed = Number(String(value ?? 0).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value: unknown) =>
  `৳${n(value).toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;

const pick = (row: Row, keys: string[], fallback = "") =>
  keys.map((key) => row[key]).find((value) => value !== undefined && value !== null && String(value).trim() !== "") ?? fallback;

export default function AdminCommandCenter() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dashboardResponse, balanceResponse, briefResponse] = await Promise.all([
        fetch("/api/management-dashboard", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/admin-balance-overview", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/admin/daily-brief", { credentials: "same-origin", cache: "no-store" }),
      ]);

      const [dashboardPayload, balancePayload, briefPayload] = await Promise.all([
        dashboardResponse.json().catch(() => null),
        balanceResponse.json().catch(() => null),
        briefResponse.json().catch(() => null),
      ]);

      if (!dashboardResponse.ok || !dashboardPayload?.success) {
        throw new Error(String(dashboardPayload?.error || dashboardPayload?.message || "Could not load dashboard."));
      }

      setDashboard(dashboardPayload.data || {});
      setBalance(balanceResponse.ok && balancePayload?.success ? balancePayload.data || {} : null);
      setBrief(briefResponse.ok && briefPayload?.success ? briefPayload.data || {} : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !dashboard) {
    return <div className="lv-simple-loading">Loading dashboard…</div>;
  }

  const stats = dashboard?.stats || {};
  const attention = dashboard?.attention || [];
  const projects = (dashboard?.recentProjects || []).slice(0, 5);
  const stages = Object.entries(dashboard?.projectStages || {}).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const role = String(dashboard?.user?.role || "").toLowerCase();
  const full = role === "admin" || role === "manager";
  const permissions = dashboard?.permissions || {};
  const can = (key: string) => full || Boolean(permissions[key]);
  const actionCounts = brief?.actionCenter?.counts || {};
  const pendingCount = n(actionCounts.total) || attention.reduce((total, item) => total + Math.max(1, n(item.count)), 0);
  const criticalCount = n(actionCounts.critical) || attention
    .filter((item) => item.severity === "critical")
    .reduce((total, item) => total + Math.max(1, n(item.count)), 0);
  const stageMax = Math.max(1, ...stages.map(([, count]) => n(count)));
  const finance = brief?.finance || {};
  const siteVisitsToday = n(brief?.operations?.siteVisits);
  const generated = dashboard?.generatedAt
    ? new Date(dashboard.generatedAt).toLocaleTimeString("en-BD", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" })
    : "Live";

  const quickActions = [
    can("projects.edit") ? ["/admin/projects/new", "+ New Project", "Create project"] : null,
    can("ledger.view") || can("finance.view") ? ["/admin/accounts", "+ Income", "Open accounts"] : null,
    can("ledger.view") || can("finance.view") ? ["/admin/accounts", "+ Expense", "Open accounts"] : null,
    ["/admin/site-visits", "+ Site Visit", "Field activity"],
  ].filter(Boolean) as string[][];

  return (
    <main className="lv-simple-dashboard">
      <style>{`
        .lv-simple-dashboard{color:var(--lv-text-primary,#18222c);padding:4px 0 36px}.lv-simple-dashboard *{box-sizing:border-box}.lv-simple-dashboard a{text-decoration:none}
        .lv-simple-head{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:18px}.lv-simple-head h1{margin:0;color:var(--lv-text-strong,#111820);font-size:26px;line-height:1.15}.lv-simple-head p{margin:5px 0 0;color:var(--lv-text-muted,#6c7782);font-size:10px}.lv-simple-refresh{min-height:38px;padding:0 14px;border:1px solid var(--lv-border-default,#d7dde3);border-radius:9px;background:var(--lv-surface,#fff);color:var(--lv-text-primary,#18222c);font-size:9px;font-weight:900;cursor:pointer;white-space:nowrap}.lv-simple-refresh:hover{border-color:var(--lv-border-strong,#aeb8c1)}
        .lv-summary-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}.lv-summary-card{min-height:132px;padding:18px;border:1px solid var(--lv-border-default,#d7dde3);border-radius:14px;background:var(--lv-surface,#fff);box-shadow:var(--lv-shadow-sm,0 6px 18px rgba(0,0,0,.05));overflow:hidden}.lv-summary-label{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--lv-text-muted,#6c7782);font-size:8px;font-weight:900;letter-spacing:.11em;text-transform:uppercase}.lv-summary-dot{width:8px;height:8px;border-radius:50%;background:var(--lv-brand-primary,#d61f26)}.lv-summary-card.finance .lv-summary-dot{background:var(--lv-success,#278454)}.lv-summary-card.pending .lv-summary-dot{background:var(--lv-warning,#b57a12)}.lv-summary-card.people .lv-summary-dot{background:var(--lv-info,#3677b8)}.lv-summary-card strong{display:block;margin-top:15px;color:var(--lv-text-strong,#111820);font-size:27px;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lv-summary-card p{margin:8px 0 0;color:var(--lv-text-secondary,#596671);font-size:9px;line-height:1.5}.lv-summary-card p b{color:var(--lv-text-strong,#111820)}.lv-summary-card.pending strong.alert{color:var(--lv-danger,#d83a42)}
        .lv-dashboard-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(310px,.8fr);gap:14px;align-items:start}.lv-dashboard-side{display:grid;gap:14px}.lv-simple-panel{border:1px solid var(--lv-border-default,#d7dde3);border-radius:14px;background:var(--lv-surface,#fff);box-shadow:var(--lv-shadow-sm,0 6px 18px rgba(0,0,0,.04));overflow:hidden}.lv-simple-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 17px;border-bottom:1px solid var(--lv-border-default,#d7dde3)}.lv-simple-panel-head h2{margin:0;color:var(--lv-text-strong,#111820);font-size:13px}.lv-simple-panel-head a,.lv-simple-panel-head span{color:var(--lv-action-text,#c71f26);font-size:8px;font-weight:900}.lv-activity-list{padding:7px 12px 12px}.lv-activity-row{display:grid;grid-template-columns:9px minmax(0,1fr) auto;gap:11px;align-items:center;padding:12px 5px;border-bottom:1px solid var(--lv-border-default,#e1e5e9);color:var(--lv-text-primary,#18222c)}.lv-activity-row:last-child{border-bottom:0}.lv-activity-mark{width:8px;height:8px;border-radius:50%;background:var(--lv-info,#3677b8)}.lv-activity-row.warning .lv-activity-mark{background:var(--lv-warning,#b57a12)}.lv-activity-row.critical .lv-activity-mark{background:var(--lv-danger,#d83a42)}.lv-activity-row.project .lv-activity-mark{background:var(--lv-brand-primary,#d61f26)}.lv-activity-row strong{display:block;font-size:10px;color:var(--lv-text-strong,#111820)}.lv-activity-row small{display:block;margin-top:3px;color:var(--lv-text-muted,#6c7782);font-size:8.5px;line-height:1.4}.lv-activity-tag{color:var(--lv-text-muted,#6c7782);font-size:8px;font-weight:900;white-space:nowrap}.lv-empty{padding:22px 17px;color:var(--lv-text-muted,#6c7782);font-size:9px}
        .lv-stage-list{padding:14px 16px}.lv-stage-row{display:grid;grid-template-columns:minmax(95px,1fr) 1.7fr 28px;gap:9px;align-items:center;margin-bottom:12px}.lv-stage-row:last-child{margin-bottom:0}.lv-stage-row span{color:var(--lv-text-secondary,#596671);font-size:8.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lv-stage-row b{color:var(--lv-text-strong,#111820);font-size:9px;text-align:right}.lv-stage-track{height:5px;border-radius:99px;background:var(--lv-surface-muted,#eef1f4);overflow:hidden}.lv-stage-track i{display:block;height:100%;border-radius:99px;background:var(--lv-brand-primary,#d61f26)}
        .lv-quick-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;padding:14px}.lv-quick-action{min-height:74px;padding:12px;border:1px solid var(--lv-border-default,#d7dde3);border-radius:10px;background:var(--lv-surface-muted,#f6f8fa);display:flex;flex-direction:column;justify-content:center}.lv-quick-action:hover{border-color:var(--lv-brand-primary,#d61f26);background:var(--lv-surface,#fff)}.lv-quick-action strong{color:var(--lv-text-strong,#111820);font-size:10px}.lv-quick-action small{margin-top:4px;color:var(--lv-text-muted,#6c7782);font-size:8px}.lv-simple-error,.lv-simple-loading{margin:0 0 14px;padding:14px;border:1px solid var(--lv-border-default,#d7dde3);border-radius:12px;background:var(--lv-surface,#fff);color:var(--lv-text-muted,#6c7782);font-size:10px}.lv-simple-error{border-color:var(--lv-danger-border,#efc5c7);color:var(--lv-danger,#d83a42)}
        @media(max-width:1100px){.lv-summary-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.lv-dashboard-grid{grid-template-columns:1fr}}
        @media(max-width:640px){.lv-simple-dashboard{padding-top:0}.lv-simple-head{align-items:flex-start}.lv-simple-head h1{font-size:22px}.lv-summary-grid{grid-template-columns:1fr;gap:9px}.lv-summary-card{min-height:auto;padding:15px}.lv-summary-card strong{font-size:23px;margin-top:11px}.lv-dashboard-grid{gap:10px}.lv-quick-grid{grid-template-columns:1fr 1fr}.lv-activity-row{grid-template-columns:8px minmax(0,1fr)}.lv-activity-tag{display:none}}
        @media(max-width:420px){.lv-quick-grid{grid-template-columns:1fr}.lv-simple-refresh{padding:0 10px}}
      `}</style>

      <header className="lv-simple-head">
        <div>
          <h1>Admin Dashboard</h1>
          <p>Only the essentials · Updated {generated}</p>
        </div>
        <button className="lv-simple-refresh" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "↻ Refresh"}
        </button>
      </header>

      {error ? <div className="lv-simple-error">{error}</div> : null}

      <section className="lv-summary-grid" aria-label="Dashboard summary">
        <Link href="/admin/projects" className="lv-summary-card projects">
          <div className="lv-summary-label"><span>Projects</span><i className="lv-summary-dot" /></div>
          <strong>{n(stats.activeProjectCount)}</strong>
          <p>Ongoing · <b>{n(stats.projectCount)}</b> total projects</p>
        </Link>

        {(can("ledger.view") || can("finance.view")) && (
          <Link href="/admin/accounts" className="lv-summary-card finance">
            <div className="lv-summary-label"><span>Finance</span><i className="lv-summary-dot" /></div>
            <strong>{balance ? money(balance.currentBalance) : "—"}</strong>
            <p>Today <b>+{money(finance.received)}</b> · −{money(finance.spent)}</p>
          </Link>
        )}

        <Link href="/admin/action-center" className="lv-summary-card pending">
          <div className="lv-summary-label"><span>Pending Actions</span><i className="lv-summary-dot" /></div>
          <strong className={pendingCount > 0 ? "alert" : ""}>{pendingCount}</strong>
          <p><b>{criticalCount}</b> critical · review what needs attention</p>
        </Link>

        {can("employees.view") && (
          <Link href="/admin/employees" className="lv-summary-card people">
            <div className="lv-summary-label"><span>Employees</span><i className="lv-summary-dot" /></div>
            <strong>{n(stats.activeEmployeeCount)}</strong>
            <p>Active of <b>{n(stats.employeeCount)}</b> · {siteVisitsToday} site visits today</p>
          </Link>
        )}
      </section>

      <div className="lv-dashboard-grid">
        <section className="lv-simple-panel">
          <div className="lv-simple-panel-head">
            <h2>Recent Activity</h2>
            <Link href="/admin/action-center">View action center →</Link>
          </div>
          <div className="lv-activity-list">
            {attention.slice(0, 3).map((item, index) => (
              <Link key={`${item.type || "attention"}-${index}`} href={item.href || "/admin/action-center"} className={`lv-activity-row ${item.severity || "warning"}`}>
                <i className="lv-activity-mark" />
                <span>
                  <strong>{item.title || "Review required"}</strong>
                  <small>{item.detail || "Open the related workspace for details."}</small>
                </span>
                <span className="lv-activity-tag">ACTION</span>
              </Link>
            ))}

            {projects.map((project, index) => {
              const id = String(pick(project, ["Project_ID", "Project ID"], "—"));
              const name = String(pick(project, ["Project_Name", "Project Name", "Name", "Client_Name", "Client Name"], id));
              const stage = String(pick(project, ["Stage", "Project_Stage", "Project Stage", "Status"], "Active"));
              return (
                <Link key={`${id}-${index}`} href={`/admin/projects/${encodeURIComponent(id)}`} className="lv-activity-row project">
                  <i className="lv-activity-mark" />
                  <span>
                    <strong>{id} · {name}</strong>
                    <small>{String(pick(project, ["Location"], "LAND VIEW project"))}</small>
                  </span>
                  <span className="lv-activity-tag">{stage}</span>
                </Link>
              );
            })}

            {!attention.length && !projects.length ? <div className="lv-empty">No recent activity to show.</div> : null}
          </div>
        </section>

        <div className="lv-dashboard-side">
          <section className="lv-simple-panel">
            <div className="lv-simple-panel-head">
              <h2>Project Overview</h2>
              <Link href="/admin/projects">All projects →</Link>
            </div>
            <div className="lv-stage-list">
              {stages.map(([stage, count]) => (
                <div className="lv-stage-row" key={stage}>
                  <span title={stage}>{stage}</span>
                  <div className="lv-stage-track"><i style={{ width: `${Math.max(5, (n(count) / stageMax) * 100)}%` }} /></div>
                  <b>{count}</b>
                </div>
              ))}
              {!stages.length ? <div className="lv-empty">No stage data available.</div> : null}
            </div>
          </section>

          <section className="lv-simple-panel">
            <div className="lv-simple-panel-head"><h2>Quick Actions</h2><span>{brief?.dateLabel || "Today"}</span></div>
            <div className="lv-quick-grid">
              {quickActions.map(([href, label, note]) => (
                <Link key={`${href}-${label}`} href={href} className="lv-quick-action">
                  <strong>{label}</strong>
                  <small>{note}</small>
                </Link>
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
