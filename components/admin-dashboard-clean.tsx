"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Row = Record<string, unknown>;
type Severity = "critical" | "warning" | "info";

type DashboardData = {
  user?: { name?: string; role?: string };
  stats?: {
    projectCount?: number;
    activeProjectCount?: number;
    completedProjectCount?: number;
    pendingPayments?: number;
  };
  attention?: Array<{
    severity?: Severity;
    type?: string;
    count?: number;
    title?: string;
    detail?: string;
    href?: string;
  }>;
  recentProjects?: Row[];
  generatedAt?: string;
};

type BalanceData = {
  currentBalance?: number;
  totalIncome?: number;
  totalExpenses?: number;
  monthlySeries?: Array<{ key?: string; label?: string; income?: number; expenses?: number }>;
  recentTransactions?: Array<{
    id?: string;
    date?: string;
    description?: string;
    type?: "income" | "expense";
    amount?: number;
  }>;
};

type DailyBrief = {
  finance?: { received?: number; spent?: number; netMovement?: number };
  operations?: { proposals?: number; siteVisits?: number; tasksDue?: number; projectStageChanges?: number };
  actionCenter?: {
    counts?: { total?: number; critical?: number; warning?: number; info?: number };
    alerts?: Array<{
      alert_key?: string;
      severity?: Severity;
      title?: string;
      detail?: string;
      href?: string | null;
      status?: string;
      project_id?: string | null;
      entity_id?: string | null;
    }>;
  };
};

type LifecycleProject = {
  projectId?: string;
  projectName?: string;
  clientName?: string;
  lifecyclePhase?: string;
  updatedAt?: string;
};

type LifecycleData = {
  counts?: Record<string, number>;
  projects?: LifecycleProject[];
};

const num = (value: unknown) => {
  const parsed = Number(String(value ?? 0).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const txt = (value: unknown) => String(value ?? "").trim();
const money = (value: unknown) => `BDT ${num(value).toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
const pick = (row: Row, keys: string[], fallback = "") =>
  txt(keys.map((key) => row[key]).find((value) => value !== undefined && value !== null && txt(value)) ?? fallback);

function stageProgress(value: unknown) {
  const stage = txt(value).toLowerCase();
  if (stage.includes("complete")) return 100;
  if (stage.includes("handover")) return 90;
  if (stage.includes("supervision") || stage.includes("construction")) return 75;
  if (stage.includes("approval")) return 55;
  if (stage.includes("design")) return 35;
  if (stage.includes("proposal")) return 15;
  return 10;
}

function stageTone(value: unknown) {
  const progress = stageProgress(value);
  if (progress >= 100) return "completed";
  if (progress >= 70) return "ontrack";
  if (progress >= 35) return "progress";
  return "early";
}

function formatShortDate(value: unknown) {
  const raw = txt(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("en-BD", { timeZone: "Asia/Dhaka", month: "short", day: "numeric" }).format(date);
}

function phaseCount(counts: Record<string, number>, needle: string) {
  return Object.entries(counts).reduce((sum, [key, value]) => key.toLowerCase().includes(needle) ? sum + num(value) : sum, 0);
}

function buildCalendar(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = [];
  for (let i = 0; i < first.getDay(); i += 1) cells.push(null);
  for (let day = 1; day <= days; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function AdminDashboardClean() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [lifecycle, setLifecycle] = useState<LifecycleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const responses = await Promise.all([
        fetch("/api/management-dashboard", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/admin-balance-overview", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/admin/daily-brief", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/lifecycle", { credentials: "same-origin", cache: "no-store" }),
      ]);
      const payloads = await Promise.all(responses.map((response) => response.json().catch(() => null)));
      if (!responses[0].ok || !payloads[0]?.success) throw new Error(String(payloads[0]?.error || "Could not load dashboard."));
      setDashboard(payloads[0].data || {});
      setBalance(responses[1].ok && payloads[1]?.success ? payloads[1].data || {} : null);
      setBrief(responses[2].ok && payloads[2]?.success ? payloads[2].data || {} : null);
      setLifecycle(responses[3].ok && payloads[3]?.success ? payloads[3].data || {} : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { setNow(new Date()); void load(); }, [load]);

  const counts = lifecycle?.counts || {};
  const projects = lifecycle?.projects || [];
  const completed = phaseCount(counts, "completed");
  const active = projects.length ? Math.max(0, projects.length - completed) : num(dashboard?.stats?.activeProjectCount);
  const series = balance?.monthlySeries || [];
  const latestMonth = series[series.length - 1] || {};
  const chartMax = Math.max(1, ...series.flatMap((item) => [num(item.income), num(item.expenses)]));
  const operations = brief?.operations || {};

  const workflow = [
    { label: "Proposal", icon: "▤", count: phaseCount(counts, "proposal"), href: "/admin/proposals" },
    { label: "Design", icon: "✎", count: phaseCount(counts, "design stage"), href: "/admin/lifecycle" },
    { label: "Approval", icon: "✓", count: phaseCount(counts, "approval stage"), href: "/admin/lifecycle" },
    { label: "Supervision", icon: "⌂", count: phaseCount(counts, "supervision") + phaseCount(counts, "construction"), href: "/admin/site-visits" },
    { label: "Completed", icon: "⚑", count: completed, href: "/admin/projects" },
  ];

  const priority = useMemo(() => {
    const alerts = (brief?.actionCenter?.alerts || [])
      .filter((item) => !["resolved", "dismissed"].includes(txt(item.status).toLowerCase()))
      .slice(0, 5)
      .map((item) => ({
        id: item.alert_key || item.title || Math.random().toString(),
        severity: item.severity || "warning" as Severity,
        title: item.title || "Management action",
        detail: item.detail || item.project_id || item.entity_id || "Needs review",
        href: item.href || "/admin/action-center",
      }));
    if (alerts.length) return alerts;
    return (dashboard?.attention || []).slice(0, 5).map((item, index) => ({
      id: `${item.type || "attention"}-${index}`,
      severity: item.severity || "warning" as Severity,
      title: item.title || "Needs attention",
      detail: item.detail || `${num(item.count)} open item${num(item.count) === 1 ? "" : "s"}`,
      href: item.href || "/admin/action-center",
    }));
  }, [brief?.actionCenter?.alerts, dashboard?.attention]);

  const recentActivity = useMemo(() => {
    const transactions = (balance?.recentTransactions || []).slice(0, 3).map((item, index) => ({
      id: item.id || `txn-${index}`,
      icon: item.type === "expense" ? "−" : "+",
      tone: item.type === "expense" ? "red" : "green",
      title: item.description || (item.type === "expense" ? "Expense recorded" : "Payment received"),
      meta: `${item.type === "expense" ? "Expense" : "Income"} · ${money(item.amount)}`,
      date: formatShortDate(item.date),
    }));
    const projectRows = (dashboard?.recentProjects || []).slice(0, 3).map((row, index) => ({
      id: `project-${index}-${pick(row, ["Project_ID", "projectId", "id"], String(index))}`,
      icon: "▣",
      tone: "blue",
      title: `${pick(row, ["Project_ID", "projectId", "Project ID"], "Project")} updated`,
      meta: `${pick(row, ["Client_Name", "clientName", "Client Name", "client"], "Client")} · ${pick(row, ["lifecycle_phase", "Lifecycle_Phase", "Stage", "Status"], "Project update")}`,
      date: formatShortDate(pick(row, ["Updated_At", "updatedAt", "updated_at", "Created_Date"], "")),
    }));
    return [...transactions, ...projectRows].slice(0, 5);
  }, [balance?.recentTransactions, dashboard?.recentProjects]);

  const progressProjects = projects.slice(0, 5);
  const calendarDate = now || new Date(2026, 0, 1);
  const calendarCells = buildCalendar(calendarDate);
  const monthLabel = new Intl.DateTimeFormat("en-BD", { month: "long", year: "numeric" }).format(calendarDate);
  const userName = dashboard?.user?.name || "Management";
  const refreshTime = dashboard?.generatedAt
    ? new Date(dashboard.generatedAt).toLocaleTimeString("en-BD", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit" })
    : "Live";

  return <div className="lv-clean-dashboard">
    <style>{`
      .lv-clean-dashboard{--red:#d91925;--red2:#b80f1a;--redsoft:#fff1f2;--ink:#182131;--muted:#778196;--line:#e8ebef;--panel:#fff;--bg:#f5f7fa;color:var(--ink);display:grid;gap:14px;padding:18px 18px 36px;background:var(--bg);min-height:100%}
      .lv-clean-dashboard *{box-sizing:border-box}.lv-clean-dashboard h1,.lv-clean-dashboard h2,.lv-clean-dashboard h3,.lv-clean-dashboard p{margin:0}.lv-clean-dashboard a{text-decoration:none;color:inherit}
      .lv-clean-head{display:flex;align-items:end;justify-content:space-between;gap:18px}.lv-clean-head h1{font-size:28px;letter-spacing:-.035em}.lv-clean-head p{margin-top:5px;color:var(--muted);font-size:11px}.lv-clean-head-actions{display:flex;gap:8px}.lv-clean-btn{height:36px;padding:0 13px;border:1px solid var(--line);border-radius:8px;background:#fff;color:#364152;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:850}.lv-clean-btn.primary{border-color:var(--red);background:var(--red);color:#fff;box-shadow:0 5px 14px rgba(217,25,37,.16)}
      .lv-clean-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.lv-clean-kpi{position:relative;min-height:126px;padding:18px 16px 16px 72px;border:1px solid var(--line);border-radius:13px;background:#fff;box-shadow:0 4px 14px rgba(15,23,42,.035)}.lv-clean-kpi-icon{position:absolute;left:18px;top:18px;width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:var(--redsoft);color:var(--red);font-size:18px;font-weight:900}.lv-clean-kpi span{display:block;color:#687386;font-size:10px;font-weight:800}.lv-clean-kpi strong{display:block;margin-top:7px;font-size:23px;letter-spacing:-.025em;line-height:1.1}.lv-clean-kpi small{display:block;margin-top:9px;color:#8a94a3;font-size:9px}.lv-clean-kpi small b{color:#159455}.lv-clean-kpi.expense small b{color:var(--red)}
      .lv-clean-grid-main{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(360px,.9fr);gap:12px}.lv-clean-card{border:1px solid var(--line);border-radius:13px;background:#fff;box-shadow:0 4px 16px rgba(15,23,42,.035);overflow:hidden}.lv-clean-card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px 0}.lv-clean-title{display:flex;align-items:center;gap:9px}.lv-clean-title i{font-style:normal;color:var(--red);font-size:16px}.lv-clean-title h2{font-size:15px}.lv-clean-link{color:#1670d2!important;font-size:9px;font-weight:800}
      .lv-workflow{padding:18px;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;align-items:start}.lv-workflow-step{position:relative;text-align:center;padding:0 4px}.lv-workflow-step:not(:last-child):after{content:"→";position:absolute;right:-9px;top:21px;color:#a8b1bf;font-size:16px}.lv-workflow-icon{width:54px;height:54px;margin:0 auto 9px;border:1px solid #e3e6eb;border-radius:50%;display:grid;place-items:center;background:#f7f8fa;color:#4b586c;font-size:18px;font-weight:900}.lv-workflow-step:first-child .lv-workflow-icon{border-color:var(--red);background:var(--red);color:#fff;box-shadow:0 6px 16px rgba(217,25,37,.18)}.lv-workflow-step strong{display:block;font-size:10px}.lv-workflow-step b{display:block;margin-top:8px;color:var(--red);font-size:18px}.lv-workflow-step small{color:#8993a1;font-size:8px}
      .lv-finance-body{padding:16px 18px 18px}.lv-finance-summary{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}.lv-finance-summary>div{padding-right:12px;border-right:1px solid var(--line)}.lv-finance-summary>div:last-child{border-right:0}.lv-finance-summary strong{display:block;font-size:18px}.lv-finance-summary span{display:block;margin-top:4px;color:#8590a0;font-size:9px}.lv-chart{height:150px;display:flex;align-items:end;gap:8px;padding:12px 3px 0;border-top:1px solid #f0f2f4}.lv-chart-group{height:100%;flex:1;display:flex;align-items:end;justify-content:center;gap:4px;position:relative;padding-bottom:22px}.lv-chart-bar{width:min(18px,38%);min-height:3px;border-radius:3px 3px 0 0;background:var(--red)}.lv-chart-bar.expense{background:#fac1c5}.lv-chart-label{position:absolute;bottom:1px;font-size:8px;color:#7f8998;white-space:nowrap}.lv-chart-legend{display:flex;justify-content:flex-end;gap:12px;margin-top:7px;font-size:8px;color:#7f8998}.lv-chart-legend i{width:7px;height:7px;border-radius:50%;display:inline-block;margin-right:4px;background:var(--red)}.lv-chart-legend i.exp{background:#fac1c5}
      .lv-clean-grid-lower{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr) minmax(280px,.62fr);gap:12px}.lv-list{padding:10px 16px 16px}.lv-activity-row{display:grid;grid-template-columns:34px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid #f0f2f4}.lv-activity-row:last-child{border-bottom:0}.lv-activity-icon{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:#eef4ff;color:#4777b8;font-weight:900}.lv-activity-icon.red{background:#fff0f1;color:var(--red)}.lv-activity-icon.green{background:#eefaf3;color:#199153}.lv-activity-copy strong{display:block;font-size:9.5px}.lv-activity-copy small{display:block;margin-top:3px;color:#8590a0;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lv-activity-date{color:#9aa3af;font-size:8px}
      .lv-project-row{display:grid;grid-template-columns:42px minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid #f0f2f4}.lv-project-row:last-child{border-bottom:0}.lv-project-avatar{width:42px;height:42px;border-radius:9px;display:grid;place-items:center;background:linear-gradient(135deg,#fff0f1,#f7f8fa);color:var(--red);font-size:10px;font-weight:900;border:1px solid #eceef2}.lv-project-copy strong{display:block;font-size:9.5px}.lv-project-copy small{display:block;margin-top:2px;color:#8590a0;font-size:8px}.lv-progress-track{height:5px;background:#edf0f3;border-radius:99px;margin-top:7px;overflow:hidden}.lv-progress-track span{display:block;height:100%;background:var(--red);border-radius:inherit}.lv-project-status{padding:5px 7px;border-radius:999px;font-size:7.5px;font-weight:800;white-space:nowrap}.lv-project-status.completed{background:#eaf9f0;color:#16884b}.lv-project-status.ontrack{background:#eefaf3;color:#16884b}.lv-project-status.progress{background:#eef5ff;color:#2e6ebd}.lv-project-status.early{background:#fff6df;color:#a86d08}
      .lv-calendar{padding:12px 16px 16px}.lv-calendar-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:9px}.lv-calendar-head strong{font-size:10px}.lv-calendar-week,.lv-calendar-grid{display:grid;grid-template-columns:repeat(7,1fr);text-align:center}.lv-calendar-week span{padding:5px 0;color:#a0a8b4;font-size:7px}.lv-calendar-day{height:25px;display:grid;place-items:center;font-size:8px;color:#566274}.lv-calendar-day.today{width:25px;height:25px;border-radius:50%;margin:auto;background:var(--red);color:#fff;font-weight:900}.lv-today-summary{display:grid;gap:7px;margin-top:12px;padding-top:11px;border-top:1px solid #eef0f3}.lv-today-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 9px;border:1px solid #eef0f3;border-radius:8px;background:#fafbfc}.lv-today-item span{font-size:8px;color:#687386}.lv-today-item strong{font-size:10px;color:var(--red)}
      .lv-bottom-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(300px,.65fr);gap:12px}.lv-priority-list{padding:8px 16px 16px}.lv-priority-row{display:grid;grid-template-columns:7px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid #f0f2f4}.lv-priority-row:last-child{border-bottom:0}.lv-priority-dot{width:7px;height:7px;border-radius:50%;background:#5a87c7}.lv-priority-dot.critical{background:var(--red)}.lv-priority-dot.warning{background:#e5a11b}.lv-priority-copy strong{display:block;font-size:9.5px}.lv-priority-copy small{display:block;margin-top:3px;color:#8490a0;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lv-priority-open{font-size:8px;color:#1670d2!important;font-weight:800}
      .lv-quick{padding:12px 16px 16px;display:grid;grid-template-columns:1fr 1fr;gap:8px}.lv-quick a{min-height:48px;padding:10px;border:1px solid #f2d8da;border-radius:9px;background:#fff5f6;color:#c71924;display:flex;align-items:center;gap:8px;font-size:8.5px;font-weight:850}.lv-quick a b{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:#ffe4e6;font-size:13px}.lv-empty{padding:20px;color:#8b95a3;font-size:9px;text-align:center}.lv-dashboard-error{padding:14px 16px;border:1px solid #f1b9bd;border-radius:10px;background:#fff2f3;color:#b4141f;font-size:10px}.lv-dashboard-loading{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.lv-dashboard-loading span{height:122px;border-radius:13px;background:linear-gradient(90deg,#f0f2f4,#fafafa,#f0f2f4);background-size:220% 100%;animation:lvpulse 1.1s infinite}@keyframes lvpulse{to{background-position:-220% 0}}
      html:not([data-theme="dark"]) body .portal-admin:has(.lv-clean-dashboard) .primary-nav.lv-module-nav{background:linear-gradient(180deg,#d71925 0%,#a70813 100%)!important;border-color:#b10d17!important;box-shadow:10px 0 30px rgba(130,0,8,.15)!important}.portal-admin:has(.lv-clean-dashboard) .primary-nav.lv-module-nav .sidebar-brand,.portal-admin:has(.lv-clean-dashboard) .primary-nav.lv-module-nav .sidebar-footer,.portal-admin:has(.lv-clean-dashboard) .lv-module-layout,.portal-admin:has(.lv-clean-dashboard) .lv-module-rail{background:transparent!important;border-color:rgba(255,255,255,.14)!important}.portal-admin:has(.lv-clean-dashboard) .primary-nav.lv-module-nav .sidebar-brand img{content:url('/land-view-logo-light.svg')!important;filter:none!important}.portal-admin:has(.lv-clean-dashboard) .primary-nav.lv-module-nav .sidebar-brand strong,.portal-admin:has(.lv-clean-dashboard) .primary-nav.lv-module-nav .sidebar-brand small,.portal-admin:has(.lv-clean-dashboard) .lv-module-button,.portal-admin:has(.lv-clean-dashboard) .primary-nav.lv-module-nav .sidebar-user strong,.portal-admin:has(.lv-clean-dashboard) .primary-nav.lv-module-nav .sidebar-user small{color:#fff!important}.portal-admin:has(.lv-clean-dashboard) .lv-module-button:hover{background:rgba(255,255,255,.09)!important;border-color:rgba(255,255,255,.12)!important;color:#fff!important}.portal-admin:has(.lv-clean-dashboard) .lv-module-button.selected{background:rgba(255,255,255,.14)!important;border-color:rgba(255,255,255,.18)!important;color:#fff!important;box-shadow:inset 3px 0 #fff!important}.portal-admin:has(.lv-clean-dashboard) .lv-module-context{background:rgba(120,0,8,.22)!important;border-color:rgba(255,255,255,.14)!important}.portal-admin:has(.lv-clean-dashboard) .lv-module-context-head{border-color:rgba(255,255,255,.12)!important}.portal-admin:has(.lv-clean-dashboard) .lv-module-context-head strong{color:#fff!important}.portal-admin:has(.lv-clean-dashboard) .lv-module-context-icon{background:rgba(255,255,255,.14)!important;color:#fff!important}.portal-admin:has(.lv-clean-dashboard) .primary-nav.lv-module-nav .lv-module-links a{color:rgba(255,255,255,.82)!important}.portal-admin:has(.lv-clean-dashboard) .primary-nav.lv-module-nav .lv-module-links a:hover,.portal-admin:has(.lv-clean-dashboard) .primary-nav.lv-module-nav .lv-module-links a.active{background:rgba(255,255,255,.12)!important;border-color:rgba(255,255,255,.16)!important;color:#fff!important;box-shadow:inset 3px 0 #fff!important}
      @media(max-width:1180px){.lv-clean-kpis{grid-template-columns:repeat(2,1fr)}.lv-clean-grid-main{grid-template-columns:1fr}.lv-clean-grid-lower{grid-template-columns:1fr 1fr}.lv-clean-grid-lower>.lv-clean-card:last-child{grid-column:1/-1}.lv-bottom-grid{grid-template-columns:1fr}}
      @media(max-width:760px){.lv-clean-dashboard{padding:12px 10px 90px;gap:10px}.lv-clean-head{align-items:flex-start;flex-direction:column}.lv-clean-head-actions{width:100%}.lv-clean-head-actions .lv-clean-btn{flex:1}.lv-clean-kpis{grid-template-columns:1fr 1fr;gap:8px}.lv-clean-kpi{min-height:106px;padding:14px 12px 12px 58px}.lv-clean-kpi-icon{left:13px;top:14px;width:34px;height:34px}.lv-clean-kpi strong{font-size:17px}.lv-workflow{overflow-x:auto;grid-template-columns:repeat(5,110px)}.lv-clean-grid-lower{grid-template-columns:1fr}.lv-clean-grid-lower>.lv-clean-card:last-child{grid-column:auto}.lv-quick{grid-template-columns:1fr 1fr}}
      @media(max-width:480px){.lv-clean-head h1{font-size:23px}.lv-clean-kpis{grid-template-columns:1fr}.lv-finance-summary{grid-template-columns:1fr}.lv-finance-summary>div{border-right:0;border-bottom:1px solid var(--line);padding:0 0 9px}.lv-finance-summary>div:last-child{border-bottom:0;padding-top:2px}.lv-quick{grid-template-columns:1fr}}
    `}</style>

    <div className="lv-clean-head">
      <div><h1>Dashboard</h1><p>Welcome back, {userName}. Here&apos;s what is happening across LAND VIEW today. · Updated {refreshTime}</p></div>
      <div className="lv-clean-head-actions"><button type="button" className="lv-clean-btn" onClick={() => void load()}>Refresh</button><Link className="lv-clean-btn primary" href="/admin/projects/new">+ New Project</Link></div>
    </div>

    {error && <div className="lv-dashboard-error">{error}</div>}
    {loading && !dashboard ? <div className="lv-dashboard-loading"><span/><span/><span/><span/></div> : <>
      <section className="lv-clean-kpis">
        <article className="lv-clean-kpi"><div className="lv-clean-kpi-icon">▣</div><span>Active Projects</span><strong>{active}</strong><small><b>{num(operations.projectStageChanges)} updates</b> today</small></article>
        <article className="lv-clean-kpi"><div className="lv-clean-kpi-icon">৳</div><span>Current Balance</span><strong>{money(balance?.currentBalance)}</strong><small><b>{money(brief?.finance?.netMovement)}</b> today</small></article>
        <article className="lv-clean-kpi"><div className="lv-clean-kpi-icon">↗</div><span>This Month Income</span><strong>{money(latestMonth.income)}</strong><small><b>{money(brief?.finance?.received)}</b> received today</small></article>
        <article className="lv-clean-kpi expense"><div className="lv-clean-kpi-icon">▤</div><span>This Month Expenses</span><strong>{money(latestMonth.expenses)}</strong><small><b>{money(brief?.finance?.spent)}</b> spent today</small></article>
      </section>

      <section className="lv-clean-grid-main">
        <article className="lv-clean-card">
          <div className="lv-clean-card-head"><div className="lv-clean-title"><i>◉</i><h2>Project Workflow</h2></div><Link className="lv-clean-link" href="/admin/lifecycle">View All</Link></div>
          <div className="lv-workflow">{workflow.map((item) => <Link className="lv-workflow-step" href={item.href} key={item.label}><div className="lv-workflow-icon">{item.icon}</div><strong>{item.label}</strong><b>{item.count}</b><small>Projects</small></Link>)}</div>
        </article>

        <article className="lv-clean-card">
          <div className="lv-clean-card-head"><div className="lv-clean-title"><i>▥</i><h2>Finance Summary</h2></div><Link className="lv-clean-link" href="/admin/accounts">View Report</Link></div>
          <div className="lv-finance-body">
            <div className="lv-finance-summary"><div><strong>{money(balance?.totalIncome)}</strong><span>Total Income</span></div><div><strong>{money(balance?.totalExpenses)}</strong><span>Total Expenses</span></div></div>
            <div className="lv-chart">{series.slice(-6).map((item, index) => <div className="lv-chart-group" key={item.key || index}><div className="lv-chart-bar" style={{height:`${Math.max(3,(num(item.income)/chartMax)*100)}%`}}/><div className="lv-chart-bar expense" style={{height:`${Math.max(3,(num(item.expenses)/chartMax)*100)}%`}}/><span className="lv-chart-label">{item.label || item.key}</span></div>)}</div>
            <div className="lv-chart-legend"><span><i/>Income</span><span><i className="exp"/>Expenses</span></div>
          </div>
        </article>
      </section>

      <section className="lv-clean-grid-lower">
        <article className="lv-clean-card"><div className="lv-clean-card-head"><div className="lv-clean-title"><i>◷</i><h2>Recent Activity</h2></div><Link className="lv-clean-link" href="/admin/action-center">View All</Link></div><div className="lv-list">{recentActivity.length ? recentActivity.map((item) => <div className="lv-activity-row" key={item.id}><div className={`lv-activity-icon ${item.tone}`}>{item.icon}</div><div className="lv-activity-copy"><strong>{item.title}</strong><small>{item.meta}</small></div><span className="lv-activity-date">{item.date || "Recent"}</span></div>) : <div className="lv-empty">No recent activity available.</div>}</div></article>

        <article className="lv-clean-card"><div className="lv-clean-card-head"><div className="lv-clean-title"><i>◎</i><h2>Project Progress</h2></div><Link className="lv-clean-link" href="/admin/projects">View All</Link></div><div className="lv-list">{progressProjects.length ? progressProjects.map((project) => {const progress=stageProgress(project.lifecyclePhase);return <Link href={`/admin/projects/${encodeURIComponent(project.projectId || "")}`} className="lv-project-row" key={project.projectId || project.projectName}><div className="lv-project-avatar">{txt(project.projectId).replace(/^LV-/i, "") || "LV"}</div><div className="lv-project-copy"><strong>{project.projectId || "Project"} · {project.projectName || project.clientName || "LAND VIEW Project"}</strong><small>{project.clientName || project.lifecyclePhase || "Project"} · {progress}%</small><div className="lv-progress-track"><span style={{width:`${progress}%`}}/></div></div><span className={`lv-project-status ${stageTone(project.lifecyclePhase)}`}>{project.lifecyclePhase || "Active"}</span></Link>}) : <div className="lv-empty">No lifecycle project data available.</div>}</div></article>

        <article className="lv-clean-card"><div className="lv-clean-card-head"><div className="lv-clean-title"><i>□</i><h2>Schedule & Calendar</h2></div><Link className="lv-clean-link" href="/admin/site-visits">View All</Link></div><div className="lv-calendar"><div className="lv-calendar-head"><strong>{monthLabel}</strong><span className="lv-clean-link">Today</span></div><div className="lv-calendar-week">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((day)=><span key={day}>{day}</span>)}</div><div className="lv-calendar-grid">{calendarCells.map((day,index)=><span key={`${day}-${index}`} className={`lv-calendar-day ${day && now && day===now.getDate()?"today":""}`}>{day || ""}</span>)}</div><div className="lv-today-summary"><div className="lv-today-item"><span>Site Visits Today</span><strong>{num(operations.siteVisits)}</strong></div><div className="lv-today-item"><span>Tasks Due</span><strong>{num(operations.tasksDue)}</strong></div><div className="lv-today-item"><span>Proposals</span><strong>{num(operations.proposals)}</strong></div></div></div></article>
      </section>

      <section className="lv-bottom-grid">
        <article className="lv-clean-card"><div className="lv-clean-card-head"><div className="lv-clean-title"><i>!</i><h2>Priority Work</h2></div><Link className="lv-clean-link" href="/admin/action-center">Open Action Center</Link></div><div className="lv-priority-list">{priority.length ? priority.map((item)=><div className="lv-priority-row" key={item.id}><span className={`lv-priority-dot ${item.severity}`}/><div className="lv-priority-copy"><strong>{item.title}</strong><small>{item.detail}</small></div><Link className="lv-priority-open" href={item.href}>Open →</Link></div>) : <div className="lv-empty">No priority work is currently flagged.</div>}</div></article>

        <article className="lv-clean-card"><div className="lv-clean-card-head"><div className="lv-clean-title"><i>⚡</i><h2>Quick Actions</h2></div></div><div className="lv-quick"><Link href="/admin/projects/new"><b>+</b>Add New Project</Link><Link href="/admin/accounts/entry"><b>৳</b>Add Income / Expense</Link><Link href="/admin/finance/bills"><b>▤</b>Add Bill</Link><Link href="/admin/site-visits"><b>□</b>Schedule Visit</Link></div></article>
      </section>
    </>}
  </div>;
}
