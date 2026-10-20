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
    pendingPayments?: number;
    totalBill?: number;
    totalPaid?: number;
  };
  attention?: AttentionItem[];
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
    proposals?: number;
    siteVisits?: number;
    tasksDue?: number;
    projectStageChanges?: number;
  };
  actionCenter?: {
    score?: number;
    status?: string;
    counts?: { total?: number; critical?: number; warning?: number; info?: number };
    alerts?: ActionAlert[];
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
  proposals?: Array<Record<string, unknown>>;
};

type Severity = "critical" | "warning" | "info";

const n = (value: unknown) => {
  const parsed = Number(String(value ?? 0).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const text = (value: unknown) => String(value ?? "").trim();

const money = (value: unknown) =>
  `৳ ${n(value).toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;

const pick = (row: Row, keys: string[], fallback: unknown = "") =>
  keys.map((key) => row[key]).find((value) => value !== undefined && value !== null && String(value).trim() !== "") ?? fallback;

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

function categoryMeta(value: unknown) {
  const raw = text(value);
  const category = raw.toLowerCase();
  if (category.includes("finance") || category.includes("account") || category.includes("billing")) {
    return { key: "finance", label: "Finance", owner: "Accounts", icon: "৳" };
  }
  if (category.includes("delivery") || category.includes("project") || category.includes("supervision") || category.includes("site")) {
    return { key: "delivery", label: "Project Delivery", owner: "Project Mgmt", icon: "▣" };
  }
  if (category.includes("communication") || category.includes("whatsapp") || category.includes("message")) {
    return { key: "communications", label: "Communications", owner: "Admin / WhatsApp", icon: "●" };
  }
  if (category.includes("client") || category.includes("lead") || category.includes("follow")) {
    return { key: "clients", label: "Client Follow-up", owner: "Client Relations", icon: "◎" };
  }
  if (category.includes("workforce") || category.includes("employee") || category.includes("staff")) {
    return { key: "workforce", label: "Workforce", owner: "Management", icon: "♙" };
  }
  if (category.includes("data") || category.includes("system") || category.includes("integrity")) {
    return { key: "system", label: "Data & System", owner: "Admin", icon: "◆" };
  }
  const label = raw
    ? raw.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Management";
  return { key: raw.toLowerCase() || "management", label, owner: "Management", icon: "!" };
}

function projectCode(row: Row) {
  return text(pick(row, ["Project_ID", "project_code", "Project ID", "projectId", "id"], "Project"));
}

function projectClient(row: Row) {
  return text(pick(row, ["Client_Name", "Client Name", "client_name", "Client", "client"], "Client"));
}

function projectStage(row: Row) {
  return text(pick(row, ["lifecycle_phase", "Lifecycle_Phase", "Stage", "Project_Stage", "Project Stage", "stage", "Status"], "Project update"));
}

function projectUpdated(row: Row) {
  return text(pick(row, ["Updated_At", "Updated At", "updated_at", "lifecycle_changed_at", "Modified_At", "Created_Date", "created_at"], ""));
}

export default function AdminCommandCenterV2() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [lifecycle, setLifecycle] = useState<LifecycleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dashboardResponse, balanceResponse, briefResponse, lifecycleResponse] = await Promise.all([
        fetch("/api/management-dashboard", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/admin-balance-overview", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/admin/daily-brief", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/lifecycle", { credentials: "same-origin", cache: "no-store" }),
      ]);

      const [dashboardPayload, balancePayload, briefPayload, lifecyclePayload] = await Promise.all([
        dashboardResponse.json().catch(() => null),
        balanceResponse.json().catch(() => null),
        briefResponse.json().catch(() => null),
        lifecycleResponse.json().catch(() => null),
      ]);

      if (!dashboardResponse.ok || !dashboardPayload?.success) {
        throw new Error(String(dashboardPayload?.error || dashboardPayload?.message || "Could not load dashboard."));
      }

      setDashboard(dashboardPayload.data || {});
      setBalance(balanceResponse.ok && balancePayload?.success ? balancePayload.data || {} : null);
      setBrief(briefResponse.ok && briefPayload?.success ? briefPayload.data || {} : null);
      setLifecycle(lifecycleResponse.ok && lifecyclePayload?.success ? lifecyclePayload.data || {} : null);
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
  const finance = brief?.finance || {};
  const operations = brief?.operations || {};
  const actionCounts = brief?.actionCenter?.counts || {};
  const role = text(dashboard?.user?.role).toLowerCase();
  const full = role === "admin" || role === "manager";
  const permissions = dashboard?.permissions || {};
  const can = (key: string) => full || Boolean(permissions[key]);
  const financeVisible = can("ledger.view") || can("finance.view") || can("accounts.view");

  const generated = dashboard?.generatedAt
    ? new Date(dashboard.generatedAt).toLocaleTimeString("en-BD", {
      timeZone: "Asia/Dhaka",
      hour: "2-digit",
      minute: "2-digit",
    })
    : "Live";

  const lifecycleCounts = lifecycle?.counts || {};
  const hasLifecycleProjects = Boolean(lifecycle?.projects?.length);
  const registeredProjects = hasLifecycleProjects ? n(lifecycle?.projects?.length) : n(stats.projectCount);
  const completedProjects = hasLifecycleProjects ? n(lifecycleCounts.Completed) : n(stats.completedProjectCount);
  const activeProjects = hasLifecycleProjects
    ? Math.max(0, registeredProjects - completedProjects)
    : n(stats.activeProjectCount);

  const workflow = useMemo(() => {
    const counts = lifecycle?.counts || {};
    const siteApproval = n(counts["Site Entry Pending Approval"]);
    const proposals = n(counts["Proposal Draft"]) + n(counts["Proposal Sent"]) + n(counts["Proposal Accepted"]);
    return [
      { key: "proposal", label: "Proposal", icon: "▤", count: proposals, note: `${siteApproval} site approval pending`, href: "/admin/proposals" },
      { key: "design", label: "Design", icon: "✎", count: n(counts["Design Stage"]), note: "Design work in progress", href: "/admin/lifecycle" },
      { key: "approval", label: "Approval", icon: "✓", count: n(counts["Approval Stage"]), note: "Authority / approval stage", href: "/admin/lifecycle" },
      { key: "supervision", label: "Supervision", icon: "⌂", count: n(counts["Supervision / Construction Stage"]), note: `${n(operations.siteVisits)} site visits today`, href: "/admin/site-visits" },
      { key: "handover", label: "Handover", icon: "↗", count: n(counts.Handover), note: "Close-out and delivery", href: "/admin/lifecycle" },
      { key: "completed", label: "Completed", icon: "✓", count: hasLifecycleProjects ? n(counts.Completed) : n(stats.completedProjectCount), note: "Successfully completed", href: "/admin/projects" },
    ];
  }, [hasLifecycleProjects, lifecycle?.counts, operations.siteVisits, stats.completedProjectCount]);

  const activeAlerts = useMemo(() => {
    return (brief?.actionCenter?.alerts || [])
      .filter((item) => !["resolved", "dismissed"].includes(text(item.status).toLowerCase()))
      .sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  }, [brief?.actionCenter?.alerts]);

  const priorityWorks = useMemo(() => {
    if (activeAlerts.length) {
      return activeAlerts.slice(0, 6).map((item, index) => {
        const meta = item.metadata || {};
        const category = categoryMeta(item.category || item.entity_type);
        const explicitScope = text(pick(meta, ["project_code", "Project_ID", "projectId", "project_id", "employee_id", "invoice_number", "bill_number"], ""));
        const entity = text(item.project_id || item.entity_id || "");
        const scope = explicitScope || entity || "Organization";
        const owner = text(pick(meta, ["assigned_to", "responsible", "employee_name", "owner"], item.assigned_to || category.owner));
        const dueRaw = pick(meta, ["due_date", "dueDate", "visit_date", "date"], "");
        const timing = shortDate(dueRaw) || (item.severity === "critical" ? "Immediate" : item.severity === "warning" ? "Today" : "Open");
        return {
          id: item.alert_key || `alert-${index}`,
          severity: (item.severity || "info") as Severity,
          scope,
          area: category.label,
          action: item.title || "Review action",
          detail: item.detail || "",
          owner,
          timing,
          href: item.href || "/admin/action-center",
        };
      });
    }

    return (dashboard?.attention || []).slice(0, 6).map((item, index) => {
      const category = categoryMeta(item.type);
      return {
        id: `${item.type || "attention"}-${index}`,
        severity: (item.severity || "warning") as Severity,
        scope: item.count && item.count > 1 ? `${item.count} items` : "Organization",
        area: category.label,
        action: item.title || "Needs attention",
        detail: item.detail || "",
        owner: category.owner,
        timing: item.severity === "critical" ? "Immediate" : "Open",
        href: item.href || "/admin/action-center",
      };
    });
  }, [activeAlerts, dashboard?.attention]);

  const attentionGroups = useMemo(() => {
    if (activeAlerts.length) {
      const grouped = new Map<string, { id: string; label: string; count: number; severity: Severity; href: string; icon: string }>();
      for (const alert of activeAlerts) {
        const category = categoryMeta(alert.category || alert.entity_type);
        const current = grouped.get(category.key);
        const severity = (alert.severity || "info") as Severity;
        if (!current) {
          grouped.set(category.key, {
            id: category.key,
            label: category.label,
            count: 1,
            severity,
            href: alert.href || "/admin/action-center",
            icon: category.icon,
          });
        } else {
          current.count += 1;
          if (severityRank(severity) < severityRank(current.severity)) current.severity = severity;
          if (!current.href && alert.href) current.href = alert.href;
        }
      }
      return [...grouped.values()]
        .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || b.count - a.count)
        .slice(0, 6);
    }

    return (dashboard?.attention || []).slice(0, 6).map((item, index) => {
      const category = categoryMeta(item.type);
      return {
        id: `${category.key}-${index}`,
        label: item.title || category.label,
        count: Math.max(1, n(item.count)),
        severity: (item.severity || "warning") as Severity,
        href: item.href || "/admin/action-center",
        icon: category.icon,
      };
    });
  }, [activeAlerts, dashboard?.attention]);

  const attentionTotal = activeAlerts.length || n(actionCounts.total) || attentionGroups.reduce((sum, item) => sum + item.count, 0);
  const criticalCount = activeAlerts.filter((item) => item.severity === "critical").length || n(actionCounts.critical);

  const monthlySeries = balance?.monthlySeries || [];
  const chartMax = Math.max(1, ...monthlySeries.flatMap((item) => [n(item.income), n(item.expenses)]));
  const totalProjectsForChart = Math.max(registeredProjects, activeProjects + completedProjects);
  const activePercent = totalProjectsForChart > 0 ? Math.round((activeProjects / totalProjectsForChart) * 100) : 0;

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

    const lifecycleProjects = (lifecycle?.projects || []).slice(0, 6).map((item, index) => ({
      id: `life-${item.projectId || index}`,
      kind: "project",
      title: `${item.projectId || "Project"} · ${item.clientName || item.projectName || "Project update"}`,
      meta: item.lifecyclePhase || "Project update",
      date: item.updatedAt || "",
      timestamp: item.updatedAt ? new Date(item.updatedAt).getTime() : 0,
      href: item.projectId ? `/admin/projects/${encodeURIComponent(item.projectId)}` : "/admin/projects",
    }));

    const legacyProjects = !lifecycleProjects.length
      ? (dashboard?.recentProjects || []).slice(0, 6).map((row, index) => {
        const code = projectCode(row);
        const updated = projectUpdated(row);
        return {
          id: `project-${code}-${index}`,
          kind: "project",
          title: `${code} · ${projectClient(row)}`,
          meta: projectStage(row),
          date: updated,
          timestamp: updated ? new Date(updated).getTime() : 0,
          href: `/admin/projects/${encodeURIComponent(code)}`,
        };
      })
      : [];

    return [...transactions, ...lifecycleProjects, ...legacyProjects]
      .sort((a, b) => (Number.isFinite(b.timestamp) ? b.timestamp : 0) - (Number.isFinite(a.timestamp) ? a.timestamp : 0))
      .slice(0, 6);
  }, [balance?.recentTransactions, dashboard?.recentProjects, lifecycle?.projects]);

  if (loading && !dashboard) {
    return <div className="lv2-loading">Loading LAND VIEW dashboard…</div>;
  }

  const name = text(dashboard?.user?.name) || "LAND VIEW Admin";
  const negativeBalance = n(balance?.currentBalance) < 0;

  return (
    <main className="lv2-home">
      <style>{`
        .lv2-home{--r:#d71920;--rd:#aa1016;--rs:#fff0f1;--ink:#171c24;--muted:#6f7782;--line:#e4e7eb;color:var(--ink);padding:2px 0 42px}.lv2-home *{box-sizing:border-box}.lv2-home a{text-decoration:none}.lv2-loading{padding:18px;border:1px solid #e4e7eb;border-radius:14px;background:#fff;color:#6f7782}
        .lv2-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:18px}.lv2-welcome small{display:block;color:#707986;font-size:12px}.lv2-welcome h1{margin:3px 0 0;color:#171c24!important;font-size:30px;line-height:1.05;letter-spacing:-.035em}.lv2-welcome p{margin:8px 0 0;color:#737c87!important;font-size:12px}.lv2-sync{display:flex;align-items:center;gap:10px}.lv2-date{color:#858d97;font-size:10px}.lv2-refresh{height:40px;padding:0 15px;border:1px solid #dfe2e6;border-radius:10px;background:#fff;color:#b51319;font-size:11px;font-weight:900;cursor:pointer;box-shadow:0 4px 14px rgba(25,31,38,.04)}.lv2-refresh:hover{border-color:#d71920}.lv2-error{margin-bottom:14px;padding:12px 14px;border:1px solid #efc7ca;border-radius:11px;background:#fff3f4;color:#b51b21;font-size:11px}
        .lv2-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:14px}.lv2-kpi{min-width:0;min-height:112px;display:grid;grid-template-columns:46px minmax(0,1fr);align-items:center;gap:12px;padding:16px;border:1px solid var(--line);border-radius:15px;background:#fff;color:inherit;box-shadow:0 8px 24px rgba(30,36,43,.045);transition:.15s ease}.lv2-kpi:hover{transform:translateY(-1px);border-color:#efc4c7}.lv2-kpi-icon{width:46px;height:46px;display:grid;place-items:center;border-radius:13px;background:#fff0f1;color:#d71920;font-size:20px;font-weight:900}.lv2-kpi.income .lv2-kpi-icon{background:#ecf8f0;color:#1a8c4c}.lv2-kpi.expense .lv2-kpi-icon{background:#fff3ec;color:#dc6817}.lv2-kpi-copy{min-width:0}.lv2-kpi-copy>span{display:block;color:#525a64;font-size:10px;font-weight:800}.lv2-kpi-copy strong{display:block;margin-top:5px;color:#171c24!important;font-size:20px;line-height:1.05;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lv2-kpi-copy small{display:block;margin-top:8px;color:#7d8590!important;font-size:9px;line-height:1.35}.lv2-kpi-copy small.good{color:#188a4a!important}.lv2-kpi.negative .lv2-kpi-copy strong,.lv2-kpi.danger .lv2-kpi-copy strong{color:#d71920!important}.lv2-kpi.negative{border-color:#efc9cc;background:linear-gradient(145deg,#fff7f7,#fff)}
        .lv2-panel{border:1px solid var(--line);border-radius:16px;background:#fff;box-shadow:0 8px 24px rgba(30,36,43,.04);overflow:hidden}.lv2-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 16px}.lv2-panel-title h2{margin:0;color:#191e25!important;font-size:15px}.lv2-panel-title p{margin:4px 0 0;color:#808995!important;font-size:9.5px}.lv2-panel-link{color:#c4141b;font-size:9.5px;font-weight:900;white-space:nowrap}.lv2-badge{display:inline-grid;place-items:center;min-width:24px;height:20px;margin-left:5px;padding:0 7px;border-radius:999px;background:#ef3b45;color:#fff;font-size:9px;vertical-align:1px}
        .lv2-workflow{margin-bottom:14px}.lv2-flow{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;padding:0 14px 14px}.lv2-flow-card{position:relative;min-width:0;min-height:96px;display:grid;grid-template-columns:40px minmax(0,1fr);align-items:center;gap:10px;padding:12px;border:1px solid #f0e0e1;border-radius:13px;background:linear-gradient(145deg,#fff7f7,#fff);color:#222831}.lv2-flow-card:nth-child(2){background:linear-gradient(145deg,#eef5ff,#fff);border-color:#dbe7f5}.lv2-flow-card:nth-child(3){background:linear-gradient(145deg,#fff8e9,#fff);border-color:#f0e4c8}.lv2-flow-card:nth-child(4){background:linear-gradient(145deg,#f6f0ff,#fff);border-color:#e5d9f5}.lv2-flow-card:nth-child(5){background:linear-gradient(145deg,#fff5ed,#fff);border-color:#f2dfd0}.lv2-flow-card:nth-child(6){background:linear-gradient(145deg,#edf9f2,#fff);border-color:#d6ecdf}.lv2-flow-icon{width:40px;height:40px;display:grid;place-items:center;border-radius:11px;background:#ffe2e4;color:#d71920;font-size:17px;font-weight:900}.lv2-flow-card:nth-child(2) .lv2-flow-icon{background:#dceaff;color:#2768c7}.lv2-flow-card:nth-child(3) .lv2-flow-icon{background:#fff0bf;color:#b97500}.lv2-flow-card:nth-child(4) .lv2-flow-icon{background:#eadfff;color:#7041bf}.lv2-flow-card:nth-child(5) .lv2-flow-icon{background:#ffe7d6;color:#ca651d}.lv2-flow-card:nth-child(6) .lv2-flow-icon{background:#d9f4e3;color:#178d4b}.lv2-flow-copy{min-width:0}.lv2-flow-copy span{display:block;color:#343b44;font-size:10px;font-weight:850}.lv2-flow-copy strong{display:block;margin-top:4px;color:#171c24!important;font-size:22px;line-height:1}.lv2-flow-copy small{display:block;margin-top:7px;color:#7d8691!important;font-size:8.5px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lv2-flow-card:not(:last-child)::after{content:"›";position:absolute;right:-8px;top:50%;z-index:3;transform:translateY(-50%);color:#d71920;font-size:19px;font-weight:900}
        .lv2-priority-grid{display:grid;grid-template-columns:minmax(0,1.85fr) minmax(300px,.72fr);gap:14px;margin-bottom:14px}.lv2-priority-wrap{padding:0 14px 12px;overflow-x:auto}.lv2-priority-head,.lv2-priority-row{display:grid;grid-template-columns:86px 105px 124px minmax(220px,1.55fr) 118px 76px;gap:9px;align-items:center;min-width:760px}.lv2-priority-head{min-height:34px;padding:0 9px;border-radius:8px;background:#f5f6f8;color:#737c87;font-size:8.5px;font-weight:900}.lv2-priority-row{min-height:48px;padding:7px 9px;border-bottom:1px solid #eceef1;color:#303740}.lv2-priority-row:last-child{border-bottom:0}.lv2-priority-row:hover{background:#fff9f9}.lv2-priority-row>span{min-width:0;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lv2-priority-row .action{font-weight:800;color:#343a42}.lv2-priority-row .timing{font-weight:900}.lv2-priority-row.critical .timing{color:#d71920}.lv2-priority-row.warning .timing{color:#dc6817}.lv2-priority-pill{display:inline-flex!important;align-items:center;gap:6px;width:max-content;max-width:100%;padding:5px 8px;border-radius:8px;background:#fff0f1;color:#cb151c!important;font-size:9px!important;font-weight:900}.lv2-priority-pill::before{content:"";width:7px;height:7px;border-radius:50%;background:#d71920}.lv2-priority-row.warning .lv2-priority-pill{background:#fff4eb;color:#d8600b!important}.lv2-priority-row.warning .lv2-priority-pill::before{background:#f07a21}.lv2-priority-row.info .lv2-priority-pill{background:#eef5ff;color:#2d68ad!important}.lv2-priority-row.info .lv2-priority-pill::before{background:#3677b8}.lv2-empty{padding:26px 8px;color:#818995;font-size:10px}
        .lv2-attention-list{display:grid;gap:8px;padding:0 14px 14px}.lv2-attention-row{min-height:46px;display:grid;grid-template-columns:34px minmax(0,1fr) 30px 16px;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:#fff2f3;color:#303740}.lv2-attention-row.warning{background:#fff7ec}.lv2-attention-row.info{background:#eef6ff}.lv2-attention-icon{width:30px;height:30px;display:grid;place-items:center;border-radius:9px;background:#ffe0e2;color:#d71920;font-size:11px;font-weight:900}.lv2-attention-row.warning .lv2-attention-icon{background:#ffe9cf;color:#d66a13}.lv2-attention-row.info .lv2-attention-icon{background:#dfeeff;color:#2e6cae}.lv2-attention-row strong{color:#333a43!important;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lv2-attention-count{display:grid;place-items:center;min-width:25px;height:24px;padding:0 6px;border-radius:999px;background:rgba(255,255,255,.78);font-size:9px;font-weight:900;color:#333a43}.lv2-arrow{color:#8d949d;font-size:14px}
        .lv2-bottom{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(260px,.65fr) minmax(310px,.82fr);gap:14px}.lv2-chart{min-height:234px}.lv2-legend{display:flex;gap:14px;padding:0 16px;color:#737b85;font-size:9px}.lv2-legend span{display:flex;align-items:center;gap:5px}.lv2-legend i{width:8px;height:8px;border-radius:50%;background:#d71920}.lv2-legend span:last-child i{background:#f3b7bb}.lv2-bars{height:160px;display:flex;align-items:flex-end;gap:10px;padding:12px 16px 16px;border-bottom:1px solid #eceef1}.lv2-month{flex:1;min-width:0;height:100%;display:grid;grid-template-rows:1fr 18px;align-items:end;gap:6px}.lv2-bar-pair{height:100%;display:flex;align-items:flex-end;justify-content:center;gap:4px}.lv2-bar{width:min(14px,36%);min-height:2px;border-radius:4px 4px 1px 1px;background:#d71920}.lv2-bar.expense{background:#f4c1c5}.lv2-month label{text-align:center;color:#737b85;font-size:8.5px}.lv2-chart-empty{padding:44px 16px;color:#848c96;font-size:10px}
        .lv2-status-body{display:grid;place-items:center;gap:14px;padding:10px 16px 20px}.lv2-donut{--active:50%;width:128px;height:128px;display:grid;place-items:center;border-radius:50%;background:conic-gradient(#d71920 0 var(--active),#f1c8cb var(--active) 100%);position:relative}.lv2-donut::after{content:"";position:absolute;width:78px;height:78px;border-radius:50%;background:#fff}.lv2-donut-copy{position:relative;z-index:2;text-align:center}.lv2-donut-copy strong{display:block;color:#171c24!important;font-size:21px}.lv2-donut-copy span{display:block;margin-top:3px;color:#737c87;font-size:9px}.lv2-status-legend{width:100%;display:grid;gap:8px}.lv2-status-legend div{display:grid;grid-template-columns:9px 1fr auto;align-items:center;gap:7px;color:#59616c;font-size:9.5px}.lv2-status-legend i{width:8px;height:8px;border-radius:50%;background:#d71920}.lv2-status-legend div:last-child i{background:#f1c8cb}.lv2-status-legend b{color:#222831}
        .lv2-activity{padding:0 14px 12px}.lv2-activity-row{min-height:47px;display:grid;grid-template-columns:30px minmax(0,1fr) auto;align-items:center;gap:9px;border-bottom:1px solid #eceef1;color:#333a43}.lv2-activity-row:last-child{border-bottom:0}.lv2-activity-icon{width:30px;height:30px;display:grid;place-items:center;border-radius:50%;background:#eef5ff;color:#316cae;font-size:11px;font-weight:900}.lv2-activity-row.income .lv2-activity-icon{background:#e9f8ef;color:#198d4b}.lv2-activity-row.expense .lv2-activity-icon{background:#fff0f1;color:#d71920}.lv2-activity-copy{min-width:0}.lv2-activity-copy strong{display:block;color:#303740!important;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lv2-activity-copy small{display:block;margin-top:3px;font-size:8.5px!important;color:#7f8791!important}.lv2-activity-date{color:#9198a1;font-size:8.5px;white-space:nowrap}
        @media(max-width:1320px){.lv2-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.lv2-flow{grid-template-columns:repeat(3,minmax(0,1fr))}.lv2-flow-card:nth-child(3)::after{display:none}.lv2-bottom{grid-template-columns:1fr 1fr}.lv2-bottom .lv2-panel:last-child{grid-column:1/-1}}
        @media(max-width:1000px){.lv2-priority-grid{grid-template-columns:1fr}.lv2-bottom{grid-template-columns:1fr}.lv2-bottom .lv2-panel:last-child{grid-column:auto}}
        @media(max-width:720px){.lv2-head{align-items:flex-start}.lv2-welcome h1{font-size:25px}.lv2-date{display:none}.lv2-kpis{grid-template-columns:1fr 1fr}.lv2-kpi{min-height:98px;padding:12px;grid-template-columns:40px 1fr}.lv2-kpi-icon{width:40px;height:40px}.lv2-flow{grid-template-columns:1fr 1fr}.lv2-flow-card:nth-child(2n)::after{display:none}.lv2-flow-card:nth-child(3)::after{display:block}}
        @media(max-width:480px){.lv2-kpis{grid-template-columns:1fr}.lv2-flow{grid-template-columns:1fr}.lv2-flow-card::after{display:none!important}.lv2-panel-head{padding:12px}.lv2-priority-wrap,.lv2-attention-list,.lv2-activity{padding-left:10px;padding-right:10px}}
      `}</style>

      <header className="lv2-head">
        <div className="lv2-welcome">
          <small>Welcome Back,</small>
          <h1>{name}</h1>
          <p>Here&apos;s what needs attention across LAND VIEW today.</p>
        </div>
        <div className="lv2-sync">
          <span className="lv2-date">{brief?.dateLabel || `Updated ${generated}`}</span>
          <button className="lv2-refresh" type="button" onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>
      </header>

      {error ? <div className="lv2-error">{error}</div> : null}

      <section className="lv2-kpis" aria-label="LAND VIEW summary">
        {financeVisible ? <>
          <Link href="/admin/accounts" className="lv2-kpi income">
            <span className="lv2-kpi-icon">৳</span>
            <span className="lv2-kpi-copy"><span>Total Income</span><strong>{balance ? money(balance.totalIncome) : "—"}</strong><small className="good">+ {money(finance.received)} received today</small></span>
          </Link>
          <Link href="/admin/accounts" className="lv2-kpi expense">
            <span className="lv2-kpi-icon">↗</span>
            <span className="lv2-kpi-copy"><span>Total Expenses</span><strong>{balance ? money(balance.totalExpenses) : "—"}</strong><small>{money(finance.spent)} spent today</small></span>
          </Link>
          <Link href="/admin/accounts" className={`lv2-kpi ${negativeBalance ? "negative" : ""}`}>
            <span className="lv2-kpi-icon">◎</span>
            <span className="lv2-kpi-copy"><span>Current Balance</span><strong>{balance ? money(balance.currentBalance) : "—"}</strong><small>{negativeBalance ? "Main ledger is below zero" : "Live main ledger balance"}</small></span>
          </Link>
        </> : null}
        <Link href="/admin/projects" className="lv2-kpi">
          <span className="lv2-kpi-icon">▣</span>
          <span className="lv2-kpi-copy"><span>Active Projects</span><strong>{activeProjects}</strong><small>{completedProjects} completed · {registeredProjects} registered</small></span>
        </Link>
        <Link href={financeVisible ? "/admin/finance" : "/admin/action-center"} className={`lv2-kpi ${n(stats.pendingPayments) > 0 ? "danger" : ""}`}>
          <span className="lv2-kpi-icon">▤</span>
          <span className="lv2-kpi-copy"><span>{financeVisible ? "Pending Billing" : "Needs Attention"}</span><strong>{financeVisible ? money(Math.max(0, n(stats.pendingPayments))) : attentionTotal}</strong><small>{criticalCount} critical · {attentionTotal} open actions</small></span>
        </Link>
      </section>

      <section className="lv2-panel lv2-workflow">
        <div className="lv2-panel-head">
          <div className="lv2-panel-title"><h2>Project Workflow</h2><p>Canonical LAND VIEW lifecycle — billing continues across every project phase.</p></div>
          <Link href="/admin/lifecycle" className="lv2-panel-link">Open Lifecycle Center →</Link>
        </div>
        <div className="lv2-flow">
          {workflow.map((item) => <Link className="lv2-flow-card" href={item.href} key={item.key}>
            <span className="lv2-flow-icon">{item.icon}</span>
            <span className="lv2-flow-copy"><span>{item.label}</span><strong>{item.count}</strong><small>{item.note}</small></span>
          </Link>)}
        </div>
      </section>

      <div className="lv2-priority-grid">
        <section className="lv2-panel">
          <div className="lv2-panel-head">
            <div className="lv2-panel-title"><h2>Priority Works <span className="lv2-badge">{priorityWorks.length}</span></h2><p>Highest-priority live Action Center items with a clear operational owner.</p></div>
            <Link href="/admin/action-center" className="lv2-panel-link">View All →</Link>
          </div>
          <div className="lv2-priority-wrap">
            <div className="lv2-priority-head" aria-hidden="true"><span>Priority</span><span>Scope</span><span>Area</span><span>Next Action</span><span>Owner</span><span>Timing</span></div>
            {priorityWorks.map((item) => <Link href={item.href} className={`lv2-priority-row ${item.severity}`} key={item.id} title={item.detail}>
              <span className="lv2-priority-pill">{item.severity === "critical" ? "Urgent" : item.severity === "warning" ? "High" : "Normal"}</span>
              <span>{item.scope}</span><span>{item.area}</span><span className="action">{item.action}</span><span>{item.owner}</span><span className="timing">{item.timing}</span>
            </Link>)}
            {!priorityWorks.length ? <div className="lv2-empty">No priority work is waiting right now.</div> : null}
          </div>
        </section>

        <section className="lv2-panel">
          <div className="lv2-panel-head">
            <div className="lv2-panel-title"><h2>Needs Attention <span className="lv2-badge">{attentionTotal}</span></h2><p>Open alerts grouped by operational area.</p></div>
            <Link href="/admin/action-center" className="lv2-panel-link">Action Center →</Link>
          </div>
          <div className="lv2-attention-list">
            {attentionGroups.map((item) => <Link href={item.href} className={`lv2-attention-row ${item.severity}`} key={item.id}>
              <span className="lv2-attention-icon">{item.icon}</span><strong>{item.label}</strong><span className="lv2-attention-count">{item.count}</span><span className="lv2-arrow">›</span>
            </Link>)}
            {!attentionGroups.length ? <div className="lv2-empty">Everything is clear at the moment.</div> : null}
          </div>
        </section>
      </div>

      <div className="lv2-bottom">
        {financeVisible ? <section className="lv2-panel lv2-chart">
          <div className="lv2-panel-head"><div className="lv2-panel-title"><h2>Income vs Expenses</h2><p>Posted main-ledger activity this year.</p></div><span className="lv2-panel-link">This Year</span></div>
          <div className="lv2-legend"><span><i />Income</span><span><i />Expenses</span></div>
          {monthlySeries.length ? <div className="lv2-bars">{monthlySeries.map((item) => <div className="lv2-month" key={item.key || item.label}>
            <div className="lv2-bar-pair"><i className="lv2-bar" title={`Income ${money(item.income)}`} style={{ height: `${Math.max(2, (n(item.income) / chartMax) * 100)}%` }} /><i className="lv2-bar expense" title={`Expenses ${money(item.expenses)}`} style={{ height: `${Math.max(2, (n(item.expenses) / chartMax) * 100)}%` }} /></div><label>{item.label || item.key}</label>
          </div>)}</div> : <div className="lv2-chart-empty">No monthly ledger data available.</div>}
        </section> : null}

        <section className="lv2-panel">
          <div className="lv2-panel-head"><div className="lv2-panel-title"><h2>Project Status</h2><p>Canonical lifecycle portfolio.</p></div></div>
          <div className="lv2-status-body">
            <div className="lv2-donut" style={{ "--active": `${activePercent}%` } as CSSProperties}><div className="lv2-donut-copy"><strong>{totalProjectsForChart}</strong><span>Projects</span></div></div>
            <div className="lv2-status-legend"><div><i /><span>Active</span><b>{activeProjects}</b></div><div><i /><span>Completed</span><b>{completedProjects}</b></div></div>
          </div>
        </section>

        <section className="lv2-panel">
          <div className="lv2-panel-head"><div className="lv2-panel-title"><h2>Recent Activity</h2><p>Latest project and ledger movement.</p></div><Link href="/admin/projects" className="lv2-panel-link">View All →</Link></div>
          <div className="lv2-activity">{recentActivity.map((item) => <Link href={item.href} className={`lv2-activity-row ${item.kind}`} key={item.id}>
            <span className="lv2-activity-icon">{item.kind === "income" ? "৳" : item.kind === "expense" ? "−" : "▣"}</span><span className="lv2-activity-copy"><strong>{item.title}</strong><small>{item.meta}</small></span><span className="lv2-activity-date">{shortDate(item.date) || "Recent"}</span>
          </Link>)}{!recentActivity.length ? <div className="lv2-empty">No recent activity to show.</div> : null}</div>
        </section>
      </div>
    </main>
  );
}
