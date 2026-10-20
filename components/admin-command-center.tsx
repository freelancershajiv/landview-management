"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";

type Row = Record<string, unknown>;

type AttentionItem = {
  severity?: "critical" | "warning" | "info";
  type?: string;
  count?: number;
  title?: string;
  detail?: string;
  href?: string;
};

type ActionAlert = {
  alert_key?: string;
  category?: string;
  severity?: "critical" | "warning" | "info";
  title?: string;
  detail?: string;
  entity_type?: string | null;
  entity_id?: string | null;
  project_id?: string | null;
  href?: string | null;
  status?: string;
  assigned_to?: string | null;
  metadata?: Row;
  last_detected_at?: string;
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
    pendingPayments?: number;
    totalBill?: number;
    totalPaid?: number;
  };
  attention?: AttentionItem[];
  projectStages?: Record<string, number>;
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
  dateLabel?: string;
  finance?: { received?: number; spent?: number; netMovement?: number };
  operations?: {
    newSiteEntries?: number;
    proposals?: number;
    siteVisits?: number;
    projectStageChanges?: number;
    tasksDue?: number;
    websiteEnquiries?: number;
  };
  actionCenter?: {
    score?: number;
    status?: string;
    counts?: { total?: number; critical?: number; warning?: number; info?: number };
    alerts?: ActionAlert[];
  };
};

const n = (value: unknown) => {
  const parsed = Number(String(value ?? 0).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value: unknown) =>
  `৳ ${n(value).toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;

const pick = (row: Row, keys: string[], fallback = "") =>
  keys.map((key) => row[key]).find((value) => value !== undefined && value !== null && String(value).trim() !== "") ?? fallback;

const text = (value: unknown) => String(value ?? "").trim();

const severityRank = (severity?: string) => severity === "critical" ? 0 : severity === "warning" ? 1 : 2;

function shortDate(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("en-BD", {
    timeZone: "Asia/Dhaka",
    month: "short",
    day: "numeric",
  }).format(date);
}

function projectCode(row: Row) {
  return text(pick(row, ["Project_ID", "project_code", "Project ID", "projectId", "id"], "Project"));
}

function projectClient(row: Row) {
  return text(pick(row, ["Client_Name", "Client Name", "client_name", "Client", "client"], "Client"));
}

function projectStageLabel(row: Row) {
  return text(pick(row, ["Stage", "Project_Stage", "Project Stage", "stage", "Status"], "Project update"));
}

function projectUpdated(row: Row) {
  return text(pick(row, ["Updated_At", "Updated At", "updated_at", "Modified_At", "Created_Date", "created_at"], ""));
}

function classifyWorkflow(stageName: string) {
  const stage = stageName.toLowerCase();
  if (stage.includes("proposal") || stage.includes("enquiry") || stage.includes("inquiry")) return "proposal";
  if (stage.includes("approved") || stage.includes("award") || stage.includes("kickoff") || stage.includes("kick off")) return "approved";
  if (stage.includes("bill") || stage.includes("payment") || stage.includes("invoice") || stage.includes("finance")) return "billing";
  if (stage.includes("supervision") || stage.includes("construction") || stage.includes("execution") || stage.includes("site")) return "supervision";
  if (
    stage.includes("design") ||
    stage.includes("drawing") ||
    stage.includes("architect") ||
    stage.includes("structural") ||
    stage.includes("electrical") ||
    stage.includes("plumbing") ||
    stage.includes("3d") ||
    stage.includes("estimate")
  ) return "design";
  return "";
}

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

  const stats = dashboard?.stats || {};
  const attention = dashboard?.attention || [];
  const role = text(dashboard?.user?.role).toLowerCase();
  const full = role === "admin" || role === "manager";
  const permissions = dashboard?.permissions || {};
  const can = (key: string) => full || Boolean(permissions[key]);
  const financeVisible = can("ledger.view") || can("finance.view") || can("accounts.view");
  const finance = brief?.finance || {};
  const operations = brief?.operations || {};
  const actionCounts = brief?.actionCenter?.counts || {};
  const pendingCount = n(actionCounts.total) || attention.reduce((total, item) => total + Math.max(1, n(item.count)), 0);
  const criticalCount = n(actionCounts.critical) || attention
    .filter((item) => item.severity === "critical")
    .reduce((total, item) => total + Math.max(1, n(item.count)), 0);

  const generated = dashboard?.generatedAt
    ? new Date(dashboard.generatedAt).toLocaleTimeString("en-BD", {
      timeZone: "Asia/Dhaka",
      hour: "2-digit",
      minute: "2-digit",
    })
    : "Live";

  const workflow = useMemo(() => {
    const counts = { proposal: 0, approved: 0, billing: 0, design: 0, supervision: 0 };
    for (const [stage, count] of Object.entries(dashboard?.projectStages || {})) {
      const bucket = classifyWorkflow(stage);
      if (bucket && bucket in counts) counts[bucket as keyof typeof counts] += n(count);
    }
    return [
      { key: "proposal", label: "Proposal", icon: "▤", count: counts.proposal, note: `${n(operations.proposals)} added today`, href: "/admin/proposals" },
      { key: "approved", label: "Approved", icon: "✓", count: counts.approved, note: "Ready for next step", href: "/admin/projects" },
      { key: "billing", label: "Billing", icon: "৳", count: counts.billing, note: financeVisible ? `${money(stats.pendingPayments)} pending` : "Finance stage", href: financeVisible ? "/admin/finance" : "/admin/projects" },
      { key: "design", label: "Design", icon: "✎", count: counts.design, note: "In progress", href: "/projectmanagement" },
      { key: "supervision", label: "Supervision", icon: "⌂", count: counts.supervision, note: `${n(operations.siteVisits)} visits today`, href: "/admin/site-visits" },
      { key: "completed", label: "Completed", icon: "✓", count: n(stats.completedProjectCount), note: "Successfully done", href: "/admin/projects" },
    ];
  }, [dashboard?.projectStages, financeVisible, operations.proposals, operations.siteVisits, stats.completedProjectCount, stats.pendingPayments]);

  const priorityWorks = useMemo(() => {
    const liveAlerts = (brief?.actionCenter?.alerts || [])
      .filter((item) => !["resolved", "dismissed"].includes(text(item.status).toLowerCase()))
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
      .slice(0, 6)
      .map((item, index) => {
        const meta = item.metadata || {};
        const project = text(
          pick(meta, ["project_code", "Project_ID", "projectId", "project_id"], item.project_id || item.entity_id || "General"),
        );
        const stage = text(pick(meta, ["stage", "current_stage", "project_stage"], item.category || item.entity_type || "Action"));
        const responsible = text(pick(meta, ["assigned_to", "responsible", "employee_name", "owner"], item.assigned_to || "Unassigned"));
        const dueRaw = pick(meta, ["due_date", "dueDate", "visit_date", "date"], "");
        const due = shortDate(dueRaw) || (item.severity === "critical" ? "Now" : item.severity === "warning" ? "Review" : "Open");
        return {
          id: item.alert_key || `alert-${index}`,
          severity: item.severity || "info",
          project,
          stage,
          action: item.title || "Review action",
          detail: item.detail || "",
          responsible,
          due,
          href: item.href || "/admin/action-center",
        };
      });

    if (liveAlerts.length) return liveAlerts;

    return attention
      .slice()
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity))
      .slice(0, 6)
      .map((item, index) => ({
        id: `${item.type || "attention"}-${index}`,
        severity: item.severity || "warning",
        project: item.count && item.count > 1 ? `${item.count} items` : "General",
        stage: item.type || "Action",
        action: item.title || "Needs attention",
        detail: item.detail || "",
        responsible: "Review",
        due: item.severity === "critical" ? "Now" : "Open",
        href: item.href || "/admin/action-center",
      }));
  }, [attention, brief?.actionCenter?.alerts]);

  const attentionRows = useMemo(() => {
    const rows: Array<{ id: string; severity: string; count: number; title: string; href: string }> = [];
    if (n(operations.tasksDue) > 0) {
      rows.push({
        id: "tasks-due",
        severity: "critical",
        count: n(operations.tasksDue),
        title: "Tasks due today",
        href: "/admin/action-center",
      });
    }
    for (const [index, item] of attention.slice(0, 5).entries()) {
      rows.push({
        id: `${item.type || "attention"}-${index}`,
        severity: item.severity || "warning",
        count: Math.max(1, n(item.count)),
        title: item.title || "Needs attention",
        href: item.href || "/admin/action-center",
      });
    }
    if (!rows.length && pendingCount > 0) {
      rows.push({ id: "open-actions", severity: criticalCount > 0 ? "critical" : "warning", count: pendingCount, title: "Open management actions", href: "/admin/action-center" });
    }
    return rows.slice(0, 6);
  }, [attention, criticalCount, operations.tasksDue, pendingCount]);

  const monthlySeries = balance?.monthlySeries || [];
  const chartMax = Math.max(1, ...monthlySeries.flatMap((item) => [n(item.income), n(item.expenses)]));

  const totalProjects = n(stats.activeProjectCount) + n(stats.completedProjectCount);
  const activePercent = totalProjects > 0 ? Math.round((n(stats.activeProjectCount) / totalProjects) * 100) : 0;

  const recentActivity = useMemo(() => {
    const transactions = (balance?.recentTransactions || []).map((item, index) => ({
      id: `txn-${item.id || index}`,
      kind: item.type === "expense" ? "expense" : "income",
      title: item.description || (item.type === "expense" ? "Expense posted" : "Payment received"),
      meta: item.type === "expense" ? `− ${money(item.amount)}` : `+ ${money(item.amount)}`,
      date: item.date || "",
      timestamp: item.date ? new Date(item.date).getTime() : 0,
      href: "/admin/accounts",
    }));

    const projects = (dashboard?.recentProjects || []).slice(0, 5).map((row, index) => {
      const code = projectCode(row);
      const updated = projectUpdated(row);
      return {
        id: `project-${code}-${index}`,
        kind: "project",
        title: `${code} · ${projectClient(row)}`,
        meta: projectStageLabel(row),
        date: updated,
        timestamp: updated ? new Date(updated).getTime() : 0,
        href: `/admin/projects/${encodeURIComponent(code)}`,
      };
    });

    return [...transactions, ...projects]
      .sort((a, b) => (Number.isFinite(b.timestamp) ? b.timestamp : 0) - (Number.isFinite(a.timestamp) ? a.timestamp : 0))
      .slice(0, 6);
  }, [balance?.recentTransactions, dashboard?.recentProjects]);

  if (loading && !dashboard) {
    return <div className="lv-home-loading">Loading LAND VIEW dashboard…</div>;
  }

  const name = text(dashboard?.user?.name) || "Management";

  return (
    <main className="lv-home">
      <style>{`
        .lv-home{--home-red:#d71920;--home-red-dark:#ac1016;--home-red-soft:#fff0f1;--home-ink:#171c24;--home-muted:#707986;--home-line:#e7e9ed;--home-bg:#f7f8fa;color:var(--home-ink);padding:0 0 40px}.lv-home *{box-sizing:border-box}.lv-home a{text-decoration:none}.lv-home-loading{padding:22px;border:1px solid #e4e7eb;border-radius:16px;background:#fff;color:#6f7782}
        .lv-home-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin:0 0 18px}.lv-home-welcome small{display:block;margin:0 0 3px;color:#6e7681;font-size:12px}.lv-home-welcome h1{margin:0;color:#171c24!important;font-size:30px;line-height:1.05;letter-spacing:-.035em}.lv-home-welcome p{margin:7px 0 0;color:#737b86!important;font-size:11px}.lv-home-sync{display:flex;align-items:center;gap:10px}.lv-home-live{font-size:9px;color:#7c8490}.lv-home-refresh{height:38px;padding:0 14px;border:1px solid #dedfe3;border-radius:10px;background:#fff;color:#2a3038;font-size:10px;font-weight:850;cursor:pointer;box-shadow:0 4px 14px rgba(25,31,38,.04)}.lv-home-refresh:hover{border-color:#d71920;color:#b41117}
        .lv-home-error{margin:0 0 14px;padding:12px 14px;border:1px solid #f0c8cb;border-radius:12px;background:#fff4f5;color:#b51c22;font-size:10px}
        .lv-home-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:14px}.lv-home-kpi{min-width:0;min-height:112px;display:grid;grid-template-columns:46px 1fr;align-items:center;gap:12px;padding:16px;border:1px solid var(--home-line);border-radius:15px;background:#fff;color:inherit;box-shadow:0 8px 25px rgba(30,36,43,.045)}.lv-home-kpi:hover{border-color:#efc3c6;transform:translateY(-1px)}.lv-home-kpi-icon{width:46px;height:46px;display:grid;place-items:center;border-radius:13px;background:#fff0f1;color:#d71920;font-size:20px;font-weight:900}.lv-home-kpi-copy{min-width:0}.lv-home-kpi-copy span{display:block;color:#4e5661;font-size:9px;font-weight:750}.lv-home-kpi-copy strong{display:block;margin-top:5px;color:#171c24!important;font-size:20px;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lv-home-kpi-copy small{display:block;margin-top:8px;color:#7a828c!important;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lv-home-kpi-copy small b{color:#1c8e4f}.lv-home-kpi.danger .lv-home-kpi-copy strong{color:#d71920!important}
        .lv-home-panel{border:1px solid var(--home-line);border-radius:16px;background:#fff;box-shadow:0 8px 25px rgba(30,36,43,.04);overflow:hidden}.lv-home-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px}.lv-home-panel-title h2{margin:0;color:#191e25!important;font-size:14px;letter-spacing:-.01em}.lv-home-panel-title p{margin:3px 0 0;color:#848b95!important;font-size:8.5px}.lv-home-panel-link{color:#c4141b;font-size:8.5px;font-weight:850}
        .lv-home-workflow{margin-bottom:14px}.lv-home-flow{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;padding:0 14px 14px}.lv-home-flow-card{position:relative;min-width:0;min-height:90px;display:grid;grid-template-columns:40px 1fr;align-items:center;gap:10px;padding:11px;border:1px solid #f0e1e2;border-radius:13px;background:linear-gradient(145deg,#fff7f7,#fff);color:#222831}.lv-home-flow-card:nth-child(2){background:linear-gradient(145deg,#fff5f1,#fff);border-color:#f4e0d7}.lv-home-flow-card:nth-child(3){background:linear-gradient(145deg,#fff8e9,#fff);border-color:#f4e8c9}.lv-home-flow-card:nth-child(4){background:linear-gradient(145deg,#eef5ff,#fff);border-color:#dce8f7}.lv-home-flow-card:nth-child(5){background:linear-gradient(145deg,#f6f0ff,#fff);border-color:#e7dcf7}.lv-home-flow-card:nth-child(6){background:linear-gradient(145deg,#eefbf3,#fff);border-color:#d8efdf}.lv-home-flow-icon{width:40px;height:40px;display:grid;place-items:center;border-radius:12px;background:#ffe3e5;color:#d71920;font-size:17px;font-weight:900}.lv-home-flow-card:nth-child(3) .lv-home-flow-icon{background:#fff0bf;color:#c27a00}.lv-home-flow-card:nth-child(4) .lv-home-flow-icon{background:#dceaff;color:#2768c7}.lv-home-flow-card:nth-child(5) .lv-home-flow-icon{background:#e9dcff;color:#7140c7}.lv-home-flow-card:nth-child(6) .lv-home-flow-icon{background:#d9f6e3;color:#17914c}.lv-home-flow-copy{min-width:0}.lv-home-flow-copy span{display:block;color:#363d46;font-size:9px;font-weight:800}.lv-home-flow-copy strong{display:block;margin-top:4px;color:#171c24!important;font-size:21px;line-height:1}.lv-home-flow-copy small{display:block;margin-top:7px;color:#7e8792!important;font-size:7.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lv-home-flow-card:not(:last-child)::after{content:"›";position:absolute;right:-8px;top:50%;z-index:3;transform:translateY(-50%);color:#d71920;font-size:19px;font-weight:800}
        .lv-home-priority-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(300px,.8fr);gap:14px;margin-bottom:14px}.lv-home-badge{min-width:25px;height:20px;display:inline-grid;place-items:center;margin-left:6px;padding:0 7px;border-radius:99px;background:#ef3b45;color:#fff;font-size:8px}.lv-home-priority-table{padding:0 14px 12px}.lv-home-priority-head,.lv-home-priority-row{display:grid;grid-template-columns:86px 94px 118px minmax(180px,1.5fr) 110px 70px;gap:8px;align-items:center}.lv-home-priority-head{min-height:30px;padding:0 8px;border-radius:8px;background:#f5f6f8;color:#737c87;font-size:7.5px;font-weight:800}.lv-home-priority-row{min-height:42px;padding:6px 8px;border-bottom:1px solid #eceef1;color:#303740}.lv-home-priority-row:last-child{border-bottom:0}.lv-home-priority-row:hover{background:#fff9f9}.lv-home-priority-row>span{min-width:0;font-size:8.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lv-home-priority-row .action{font-weight:750;color:#343a42}.lv-home-priority-row .due{font-weight:850}.lv-home-priority-row.critical .due{color:#d71920}.lv-home-priority-row.warning .due{color:#dd6c16}.lv-home-priority-pill{display:inline-flex!important;align-items:center;gap:6px;width:max-content;max-width:100%;padding:5px 8px;border-radius:8px;background:#fff0f1;color:#cb151c!important;font-size:8px!important;font-weight:850}.lv-home-priority-pill::before{content:"";width:7px;height:7px;border-radius:50%;background:#d71920}.lv-home-priority-row.warning .lv-home-priority-pill{background:#fff4eb;color:#d8600b!important}.lv-home-priority-row.warning .lv-home-priority-pill::before{background:#f07a21}.lv-home-priority-row.info .lv-home-priority-pill{background:#eef5ff;color:#2d68ad!important}.lv-home-priority-row.info .lv-home-priority-pill::before{background:#3677b8}.lv-home-priority-empty{padding:26px 8px;color:#818995;font-size:9px}
        .lv-home-attention-list{display:grid;gap:7px;padding:0 14px 14px}.lv-home-attention-row{min-height:40px;display:grid;grid-template-columns:34px 1fr 18px;align-items:center;gap:8px;padding:7px 10px;border-radius:10px;background:#fff5f5;color:#303740}.lv-home-attention-row.warning{background:#fff8ee}.lv-home-attention-row.info{background:#eef6ff}.lv-home-attention-count{width:28px;height:28px;display:grid;place-items:center;border-radius:9px;background:#ffe1e3;color:#d71920;font-size:10px;font-weight:900}.lv-home-attention-row.warning .lv-home-attention-count{background:#ffe9cf;color:#d66a13}.lv-home-attention-row.info .lv-home-attention-count{background:#dfeeff;color:#2e6cae}.lv-home-attention-row strong{color:#333a43!important;font-size:8.5px}.lv-home-attention-row>span:last-child{color:#8d949d;font-size:14px}
        .lv-home-bottom{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(260px,.65fr) minmax(300px,.82fr);gap:14px}.lv-home-chart{min-height:228px}.lv-home-chart-legend{display:flex;gap:14px;padding:0 16px;color:#737b85;font-size:8px}.lv-home-chart-legend span{display:flex;align-items:center;gap:5px}.lv-home-chart-legend i{width:8px;height:8px;border-radius:50%;background:#d71920}.lv-home-chart-legend span:last-child i{background:#f5aeb3}.lv-home-bars{height:154px;display:flex;align-items:flex-end;gap:10px;padding:12px 16px 16px;border-bottom:1px solid #eceef1}.lv-home-month{flex:1;min-width:0;height:100%;display:grid;grid-template-rows:1fr 16px;align-items:end;gap:6px}.lv-home-bar-pair{height:100%;display:flex;align-items:flex-end;justify-content:center;gap:4px}.lv-home-bar{width:min(14px,36%);min-height:2px;border-radius:4px 4px 1px 1px;background:#d71920}.lv-home-bar.expense{background:#f6c4c8}.lv-home-month label{text-align:center;color:#737b85;font-size:7.5px}.lv-home-chart-empty{padding:42px 16px;color:#848c96;font-size:9px}
        .lv-home-status-body{display:grid;place-items:center;gap:14px;padding:10px 16px 20px}.lv-home-donut{--active:50%;width:126px;height:126px;display:grid;place-items:center;border-radius:50%;background:conic-gradient(#d71920 0 var(--active),#f1c8cb var(--active) 100%);position:relative}.lv-home-donut::after{content:"";position:absolute;width:76px;height:76px;border-radius:50%;background:#fff}.lv-home-donut-copy{position:relative;z-index:2;text-align:center}.lv-home-donut-copy strong{display:block;color:#171c24!important;font-size:20px}.lv-home-donut-copy span{display:block;margin-top:3px;color:#737c87;font-size:8px}.lv-home-status-legend{width:100%;display:grid;gap:8px}.lv-home-status-legend div{display:grid;grid-template-columns:9px 1fr auto;align-items:center;gap:7px;color:#59616c;font-size:8px}.lv-home-status-legend i{width:8px;height:8px;border-radius:50%;background:#d71920}.lv-home-status-legend div:last-child i{background:#f1c8cb}.lv-home-status-legend b{color:#222831}
        .lv-home-activity{padding:0 14px 12px}.lv-home-activity-row{min-height:43px;display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:9px;border-bottom:1px solid #eceef1;color:#333a43}.lv-home-activity-row:last-child{border-bottom:0}.lv-home-activity-icon{width:28px;height:28px;display:grid;place-items:center;border-radius:50%;background:#eef5ff;color:#316cae;font-size:10px;font-weight:900}.lv-home-activity-row.income .lv-home-activity-icon{background:#e9f8ef;color:#198d4b}.lv-home-activity-row.expense .lv-home-activity-icon{background:#fff0f1;color:#d71920}.lv-home-activity-copy{min-width:0}.lv-home-activity-copy strong{display:block;color:#303740!important;font-size:8.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lv-home-activity-copy small{display:block;margin-top:3px;font-size:7.5px!important;color:#7f8791!important}.lv-home-activity-date{color:#9198a1;font-size:7.5px;white-space:nowrap}
        @media(max-width:1280px){.lv-home-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.lv-home-flow{grid-template-columns:repeat(3,minmax(0,1fr))}.lv-home-flow-card:nth-child(3)::after{display:none}.lv-home-bottom{grid-template-columns:1fr 1fr}.lv-home-bottom .lv-home-panel:last-child{grid-column:1/-1}.lv-home-priority-head,.lv-home-priority-row{grid-template-columns:80px 85px 105px minmax(150px,1fr) 95px 58px}}
        @media(max-width:980px){.lv-home-priority-grid{grid-template-columns:1fr}.lv-home-bottom{grid-template-columns:1fr}.lv-home-bottom .lv-home-panel:last-child{grid-column:auto}.lv-home-priority-table{overflow-x:auto}.lv-home-priority-head,.lv-home-priority-row{min-width:720px}}
        @media(max-width:720px){.lv-home-head{align-items:flex-start}.lv-home-welcome h1{font-size:25px}.lv-home-live{display:none}.lv-home-kpis{grid-template-columns:1fr 1fr}.lv-home-kpi{min-height:96px;padding:12px;grid-template-columns:40px 1fr}.lv-home-kpi-icon{width:40px;height:40px}.lv-home-flow{grid-template-columns:1fr 1fr}.lv-home-flow-card:nth-child(2n)::after{display:none}.lv-home-flow-card:nth-child(3)::after{display:block}}
        @media(max-width:480px){.lv-home-kpis{grid-template-columns:1fr}.lv-home-flow{grid-template-columns:1fr}.lv-home-flow-card::after{display:none!important}.lv-home-welcome p{font-size:10px}.lv-home-refresh{padding:0 10px}.lv-home-panel-head{padding:12px}.lv-home-priority-table,.lv-home-attention-list,.lv-home-activity{padding-left:10px;padding-right:10px}}
      `}</style>

      <header className="lv-home-head">
        <div className="lv-home-welcome">
          <small>Welcome Back,</small>
          <h1>{name}</h1>
          <p>Here&apos;s what&apos;s happening at Land View today.</p>
        </div>
        <div className="lv-home-sync">
          <span className="lv-home-live">{brief?.dateLabel || `Updated ${generated}`}</span>
          <button className="lv-home-refresh" type="button" onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>
      </header>

      {error ? <div className="lv-home-error">{error}</div> : null}

      <section className="lv-home-kpis" aria-label="LAND VIEW summary">
        {financeVisible ? (
          <>
            <Link href="/admin/accounts" className="lv-home-kpi">
              <span className="lv-home-kpi-icon">৳</span>
              <span className="lv-home-kpi-copy">
                <span>Total Income</span>
                <strong>{balance ? money(balance.totalIncome) : "—"}</strong>
                <small><b>+ {money(finance.received)}</b> received today</small>
              </span>
            </Link>
            <Link href="/admin/accounts" className="lv-home-kpi">
              <span className="lv-home-kpi-icon">↗</span>
              <span className="lv-home-kpi-copy">
                <span>Total Expenses</span>
                <strong>{balance ? money(balance.totalExpenses) : "—"}</strong>
                <small>{money(finance.spent)} spent today</small>
              </span>
            </Link>
            <Link href="/admin/accounts" className="lv-home-kpi">
              <span className="lv-home-kpi-icon">◎</span>
              <span className="lv-home-kpi-copy">
                <span>Current Balance</span>
                <strong>{balance ? money(balance.currentBalance) : "—"}</strong>
                <small>Live main ledger balance</small>
              </span>
            </Link>
          </>
        ) : null}
        <Link href="/admin/projects" className="lv-home-kpi">
          <span className="lv-home-kpi-icon">▣</span>
          <span className="lv-home-kpi-copy">
            <span>Active Projects</span>
            <strong>{n(stats.activeProjectCount)}</strong>
            <small>{n(stats.completedProjectCount)} completed · {n(stats.projectCount)} total</small>
          </span>
        </Link>
        <Link href={financeVisible ? "/admin/finance" : "/admin/action-center"} className={`lv-home-kpi ${n(stats.pendingPayments) > 0 ? "danger" : ""}`}>
          <span className="lv-home-kpi-icon">{financeVisible ? "▤" : "!"}</span>
          <span className="lv-home-kpi-copy">
            <span>{financeVisible ? "Pending Billing" : "Needs Attention"}</span>
            <strong>{financeVisible ? money(Math.max(0, n(stats.pendingPayments))) : pendingCount}</strong>
            <small>{financeVisible ? `${pendingCount} management actions open` : `${criticalCount} critical items`}</small>
          </span>
        </Link>
      </section>

      <section className="lv-home-panel lv-home-workflow">
        <div className="lv-home-panel-head">
          <div className="lv-home-panel-title">
            <h2>Project Workflow</h2>
            <p>Track projects through the major Land View delivery stages.</p>
          </div>
          <Link href="/admin/projects" className="lv-home-panel-link">View All Projects →</Link>
        </div>
        <div className="lv-home-flow">
          {workflow.map((item) => (
            <Link className="lv-home-flow-card" href={item.href} key={item.key}>
              <span className="lv-home-flow-icon">{item.icon}</span>
              <span className="lv-home-flow-copy">
                <span>{item.label}</span>
                <strong>{item.count}</strong>
                <small>{item.note}</small>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <div className="lv-home-priority-grid">
        <section className="lv-home-panel">
          <div className="lv-home-panel-head">
            <div className="lv-home-panel-title">
              <h2>Priority Works <span className="lv-home-badge">{priorityWorks.length || pendingCount}</span></h2>
              <p>Highest-priority items from the live Action Center.</p>
            </div>
            <Link href="/admin/action-center" className="lv-home-panel-link">View All →</Link>
          </div>
          <div className="lv-home-priority-table">
            <div className="lv-home-priority-head" aria-hidden="true">
              <span>Priority</span><span>Project</span><span>Current Stage</span><span>Next Action</span><span>Responsible</span><span>Due</span>
            </div>
            {priorityWorks.map((item) => (
              <Link href={item.href} className={`lv-home-priority-row ${item.severity}`} key={item.id} title={item.detail}>
                <span className="lv-home-priority-pill">{item.severity === "critical" ? "Urgent" : item.severity === "warning" ? "High" : "Normal"}</span>
                <span>{item.project}</span>
                <span>{item.stage}</span>
                <span className="action">{item.action}</span>
                <span>{item.responsible}</span>
                <span className="due">{item.due}</span>
              </Link>
            ))}
            {!priorityWorks.length ? <div className="lv-home-priority-empty">No priority work is waiting right now.</div> : null}
          </div>
        </section>

        <section className="lv-home-panel">
          <div className="lv-home-panel-head">
            <div className="lv-home-panel-title">
              <h2>Needs Attention <span className="lv-home-badge">{pendingCount}</span></h2>
              <p>Items that need a management decision or follow-up.</p>
            </div>
          </div>
          <div className="lv-home-attention-list">
            {attentionRows.map((item) => (
              <Link href={item.href} className={`lv-home-attention-row ${item.severity}`} key={item.id}>
                <span className="lv-home-attention-count">{item.count}</span>
                <strong>{item.title}</strong>
                <span>›</span>
              </Link>
            ))}
            {!attentionRows.length ? <div className="lv-home-priority-empty">Everything is clear at the moment.</div> : null}
          </div>
        </section>
      </div>

      <div className="lv-home-bottom">
        {financeVisible ? (
          <section className="lv-home-panel lv-home-chart">
            <div className="lv-home-panel-head">
              <div className="lv-home-panel-title"><h2>Income vs Expenses</h2><p>Posted main-ledger activity this year.</p></div>
              <span className="lv-home-panel-link">This Year</span>
            </div>
            <div className="lv-home-chart-legend"><span><i />Income</span><span><i />Expenses</span></div>
            {monthlySeries.length ? (
              <div className="lv-home-bars">
                {monthlySeries.map((item) => (
                  <div className="lv-home-month" key={item.key || item.label}>
                    <div className="lv-home-bar-pair">
                      <i className="lv-home-bar" title={`Income ${money(item.income)}`} style={{ height: `${Math.max(2, (n(item.income) / chartMax) * 100)}%` }} />
                      <i className="lv-home-bar expense" title={`Expenses ${money(item.expenses)}`} style={{ height: `${Math.max(2, (n(item.expenses) / chartMax) * 100)}%` }} />
                    </div>
                    <label>{item.label || item.key}</label>
                  </div>
                ))}
              </div>
            ) : <div className="lv-home-chart-empty">No monthly ledger data available.</div>}
          </section>
        ) : null}

        <section className="lv-home-panel">
          <div className="lv-home-panel-head">
            <div className="lv-home-panel-title"><h2>Project Status</h2><p>Active vs completed project portfolio.</p></div>
          </div>
          <div className="lv-home-status-body">
            <div className="lv-home-donut" style={{ "--active": `${activePercent}%` } as CSSProperties}>
              <div className="lv-home-donut-copy"><strong>{totalProjects}</strong><span>Projects</span></div>
            </div>
            <div className="lv-home-status-legend">
              <div><i /><span>Active</span><b>{n(stats.activeProjectCount)}</b></div>
              <div><i /><span>Completed</span><b>{n(stats.completedProjectCount)}</b></div>
            </div>
          </div>
        </section>

        <section className="lv-home-panel">
          <div className="lv-home-panel-head">
            <div className="lv-home-panel-title"><h2>Recent Activity</h2><p>Latest project and financial movement.</p></div>
            <Link href="/admin/projects" className="lv-home-panel-link">View All →</Link>
          </div>
          <div className="lv-home-activity">
            {recentActivity.map((item) => (
              <Link href={item.href} className={`lv-home-activity-row ${item.kind}`} key={item.id}>
                <span className="lv-home-activity-icon">{item.kind === "income" ? "৳" : item.kind === "expense" ? "−" : "▣"}</span>
                <span className="lv-home-activity-copy"><strong>{item.title}</strong><small>{item.meta}</small></span>
                <span className="lv-home-activity-date">{shortDate(item.date) || "Recent"}</span>
              </Link>
            ))}
            {!recentActivity.length ? <div className="lv-home-priority-empty">No recent activity to show.</div> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
