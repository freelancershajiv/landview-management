import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf, userIdOf } from "@/lib/local-session";
import { handleLandviewDataAction, selectRows } from "@/lib/supabase-data";
import { PERMISSION_DEFINITIONS, mergeRolePermissions, roleDefaultPermissions } from "@/lib/role-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

const PERMISSION_KEYS = PERMISSION_DEFINITIONS.map((item) => item.key);

const ACCOUNTS_DEFAULTS = new Set([
  "dashboard.view", "projects.view",
  "finance.view", "finance.edit",
  "accounts.view", "accounts.edit", "ledger.view", "reports.view",
  "proposals.view", "proposals.create", "proposals.edit", "proposals.print",
]);

function text(value: unknown) {
  return String(value ?? "").trim();
}

function numberValue(value: unknown) {
  const parsed = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function pick(row: Row, keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && text(value)) return value;
  }
  return undefined;
}

function isEffectiveBill(row: Row) {
  return !["void", "voided", "cancelled", "canceled", "rejected"].includes(text(row.status).toLowerCase());
}

function isEffectivePayment(row: Row) {
  if (text(row.transaction_type).toLowerCase() === "personal income" || row.affects_business_balance === false) return false;
  const status = text(row.approval_status || row.status).toLowerCase().replace(/[_-]+/g, " ");
  return !status || ["approved", "received", "paid", "verified", "complete", "completed", "full paid", "fully paid", "posted"].includes(status);
}

function dhakaDay(value: Date | string | number) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function leadSummary(rows: Row[]) {
  const now = Date.now();
  const today = dhakaDay(new Date());
  let newCount = 0;
  let overdueFollowUps = 0;
  let dueToday = 0;
  let qualified = 0;
  let converted = 0;

  for (const row of rows) {
    const status = text(row.status) || "New";
    if (status === "New") newCount += 1;
    if (status === "Qualified") qualified += 1;
    if (status === "Converted") converted += 1;
    if (["Converted", "Closed"].includes(status) || !row.follow_up_at) continue;
    const due = new Date(row.follow_up_at);
    if (Number.isNaN(due.getTime())) continue;
    const dueDay = dhakaDay(due);
    if (due.getTime() < now && dueDay !== today) overdueFollowUps += 1;
    if (dueDay === today) dueToday += 1;
  }

  const total = rows.length;
  const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0;
  return { total, newCount, overdueFollowUps, dueToday, qualified, converted, conversionRate };
}

function projectStage(row: Row) {
  return text(pick(row, ["Stage", "Project_Stage", "Project Stage", "stage", "Status"])) || "Unspecified";
}

function updatedAt(row: Row) {
  const value = pick(row, ["Updated_At", "Updated At", "updated_at", "Modified_At", "Created_Date", "created_at"]);
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function isActiveEmployee(row: Row) {
  const status = text(pick(row, ["status", "Status", "Employment_Status", "Employment Status"])).toLowerCase();
  return !["inactive", "former", "resigned", "terminated", "left", "disabled"].includes(status);
}

async function permissionsFor(user: Row) {
  const role = roleOf(user);
  if (role === "admin") return roleDefaultPermissions("admin");
  const userKey = userIdOf(user);
  const overrides: Record<string, boolean> = {};
  if (userKey) {
    const rows = await selectRows("app_permissions", { filters: { user_key: userKey }, order: "created_at:asc", limit: 5000 });
    for (const row of rows) {
      const key = text(row.permission);
      if (key) overrides[key] = text(row.status).toLowerCase() === "active";
    }
  }
  if (role === "manager" || role === "employee" || role === "client") return mergeRolePermissions(role, overrides);
  const permissions: Record<string, boolean> = Object.fromEntries(PERMISSION_KEYS.map((key) => [key, false]));
  if (role === "accounts") for (const key of ACCOUNTS_DEFAULTS) permissions[key] = true;
  for (const [key, enabled] of Object.entries(overrides)) permissions[key] = enabled;
  return permissions;
}

export async function GET(request: NextRequest) {
  try {
    const user = (await requireLocalSession(request)) as Row | null;
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });

    const role = roleOf(user);
    const permissions = await permissionsFor(user);
    if (!permissions["dashboard.view"] && role !== "admin" && role !== "manager") {
      return NextResponse.json({ success: false, error: "Permission required: dashboard.view" }, { status: 403 });
    }

    const scopedProjects = (await handleLandviewDataAction("getProjects", {}, user)) as Row[];
    const projectCodes = scopedProjects.map((project) => text(project.Project_ID)).filter(Boolean);
    const rawProjects = projectCodes.length
      ? await selectRows("projects", { inFilters: { project_code: projectCodes }, limit: 5000 })
      : [];
    const projectUuids = rawProjects.map((project) => project.id).filter(Boolean);

    const management = role === "admin" || role === "manager";
    const unrestrictedProjectData = management || role === "accounts";
    const financeVisible = unrestrictedProjectData || permissions["finance.view"] || permissions["accounts.view"] || permissions["ledger.view"];
    const unrestrictedFinance = unrestrictedProjectData || permissions["ledger.view"];

    const documentsPromise = unrestrictedProjectData
      ? selectRows("documents", { limit: 5000 })
      : projectUuids.length
        ? selectRows("documents", { inFilters: { project_id: projectUuids }, limit: 5000 })
        : Promise.resolve([] as Row[]);

    const employeesPromise = permissions["employees.view"] || management
      ? selectRows("employees", { limit: 1000 })
      : Promise.resolve([] as Row[]);

    const websiteLeadsPromise = management
      ? selectRows("website_leads", { order: "created_at:desc", limit: 3000 })
      : Promise.resolve([] as Row[]);

    let billsPromise: Promise<Row[]> = Promise.resolve([]);
    let paymentsPromise: Promise<Row[]> = Promise.resolve([]);
    if (financeVisible) {
      if (unrestrictedFinance) {
        billsPromise = selectRows("bills", { limit: 5000 });
        paymentsPromise = selectRows("payments", { limit: 5000 });
      } else if (projectUuids.length) {
        billsPromise = selectRows("bills", { inFilters: { project_id: projectUuids }, limit: 5000 });
        paymentsPromise = selectRows("payments", { inFilters: { project_id: projectUuids }, limit: 5000 });
      }
    }

    const [documents, employees, bills, payments, websiteLeads] = await Promise.all([
      documentsPromise,
      employeesPromise,
      billsPromise,
      paymentsPromise,
      websiteLeadsPromise,
    ]);

    const effectiveBills = bills.filter(isEffectiveBill);
    const effectivePayments = payments.filter(isEffectivePayment);
    const totalBill = effectiveBills.reduce(
      (sum, bill) => sum + numberValue(bill.net_amount ?? (numberValue(bill.amount) - numberValue(bill.discount))),
      0,
    );
    const totalPaid = effectivePayments.reduce((sum, payment) => sum + numberValue(payment.amount), 0);
    const billingGap = totalBill - totalPaid;
    const collectionRate = totalBill > 0 ? Math.max(0, Math.min(100, Math.round((totalPaid / totalBill) * 100))) : 100;

    const activeProjects = scopedProjects.filter((project) =>
      !["completed", "closed", "cancelled", "canceled"].includes(text(project.Status).toLowerCase()),
    );
    const completedProjects = scopedProjects.length - activeProjects.length;
    const recentProjects = [...scopedProjects]
      .sort((a, b) => text(b.Updated_At || b.Created_Date).localeCompare(text(a.Updated_At || a.Created_Date)))
      .slice(0, 10);

    const now = Date.now();
    const staleThreshold = 30 * 24 * 60 * 60 * 1000;
    const staleProjects = activeProjects.filter((project) => {
      const date = updatedAt(project);
      return Boolean(date && now - date.getTime() > staleThreshold);
    });

    const stageCounts: Record<string, number> = {};
    for (const project of activeProjects) {
      const stage = projectStage(project);
      stageCounts[stage] = (stageCounts[stage] || 0) + 1;
    }

    const activeEmployees = employees.filter(isActiveEmployee);
    const inactiveEmployees = employees.length - activeEmployees.length;
    const leads = management ? leadSummary(websiteLeads) : null;

    const financeScore = financeVisible
      ? Math.max(35, Math.round(100 - Math.min(65, Math.abs(billingGap) / Math.max(totalBill, 1) * 100)))
      : 100;
    const deliveryScore = activeProjects.length
      ? Math.max(35, Math.round(100 - (staleProjects.length / activeProjects.length) * 65))
      : 100;
    const clientScore = leads
      ? Math.max(35, 100 - Math.min(65, leads.overdueFollowUps * 8 + leads.dueToday * 2))
      : 100;
    const workforceScore = employees.length
      ? Math.max(50, Math.round((activeEmployees.length / employees.length) * 100))
      : 100;
    const dataScore = 100;
    const overallScore = Math.round(
      financeScore * 0.3 + deliveryScore * 0.3 + clientScore * 0.2 + workforceScore * 0.1 + dataScore * 0.1,
    );

    const health = {
      overallScore,
      label: overallScore >= 85 ? "Healthy" : overallScore >= 70 ? "Watch" : "Needs Attention",
      domains: {
        finance: { score: financeScore, label: financeScore >= 85 ? "Healthy" : financeScore >= 70 ? "Watch" : "Attention" },
        delivery: { score: deliveryScore, label: deliveryScore >= 85 ? "Healthy" : deliveryScore >= 70 ? "Watch" : "Attention" },
        clients: { score: clientScore, label: clientScore >= 85 ? "Healthy" : clientScore >= 70 ? "Watch" : "Attention" },
        workforce: { score: workforceScore, label: workforceScore >= 85 ? "Healthy" : workforceScore >= 70 ? "Watch" : "Attention" },
        data: { score: dataScore, label: "Online" },
      },
    };

    const attention = [
      ...(leads && leads.overdueFollowUps > 0 ? [{ severity: "critical", type: "leads", count: leads.overdueFollowUps, title: "Overdue client follow-ups", detail: `${leads.overdueFollowUps} website lead follow-up${leads.overdueFollowUps === 1 ? " is" : "s are"} overdue.`, href: "/admin/website-leads?follow=Overdue" }] : []),
      ...(staleProjects.length > 0 ? [{ severity: "warning", type: "projects", count: staleProjects.length, title: "Projects need progress review", detail: `${staleProjects.length} active project${staleProjects.length === 1 ? " has" : "s have"} no recorded update for more than 30 days.`, href: "/admin/projects" }] : []),
      ...(financeVisible && Math.abs(billingGap) > 0.01 ? [{ severity: "warning", type: "finance", count: 1, title: "Billing reconciliation gap", detail: `Recorded bills and effective payments differ by BDT ${Math.abs(billingGap).toLocaleString("en-BD", { maximumFractionDigits: 2 })}.`, href: "/admin/finance" }] : []),
      ...(leads && leads.dueToday > 0 ? [{ severity: "info", type: "leads", count: leads.dueToday, title: "Client follow-ups due today", detail: `${leads.dueToday} follow-up${leads.dueToday === 1 ? " is" : "s are"} scheduled today.`, href: "/admin/website-leads?follow=Due%20Today" }] : []),
      ...(leads && leads.newCount > 0 ? [{ severity: "info", type: "leads", count: leads.newCount, title: "New website enquiries", detail: `${leads.newCount} new enquir${leads.newCount === 1 ? "y is" : "ies are"} waiting for qualification.`, href: "/admin/website-leads?status=New" }] : []),
    ];

    const data = {
      user: {
        userId: text(user.userId || user.User_ID || user.username || user.Username),
        employeeId: text(user.employeeId || user.Employee_ID),
        username: text(user.username || user.Username),
        name: text(user.name || user.Name),
        role: text(user.role || user.Role),
      },
      permissions,
      stats: {
        projectCount: scopedProjects.length,
        activeProjectCount: activeProjects.length,
        completedProjectCount: completedProjects,
        staleProjectCount: staleProjects.length,
        employeeCount: employees.length,
        activeEmployeeCount: activeEmployees.length,
        inactiveEmployeeCount: inactiveEmployees,
        documentCount: documents.length,
        totalBill,
        totalPaid,
        pendingPayments: billingGap,
        collectionRate,
      },
      health,
      attention,
      projectStages: stageCounts,
      websiteLeadSummary: leads,
      recentProjects,
      backend: "supabase-postgresql",
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(
      { success: true, data },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          "X-Landview-Data": "supabase",
          "X-Landview-Module": "management-dashboard",
        },
      },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load management dashboard.";
    return NextResponse.json(
      { success: false, error: message },
      { status: /session expired|authentication required/i.test(message) ? 401 : 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
