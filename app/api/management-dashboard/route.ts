import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf, userIdOf } from "@/lib/local-session";
import { handleLandviewDataAction, selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

const PERMISSION_KEYS = [
  "dashboard.view",
  "projects.view", "projects.edit",
  "workflow.view", "workflow.edit", "workflow.assign",
  "employees.view", "employees.manage",
  "requests.view",
  "certificates.view", "certificates.process", "certificates.issue",
  "finance.view", "finance.edit",
  "accounts.view", "accounts.edit",
  "ledger.view",
  "proposals.view", "proposals.create", "proposals.edit", "proposals.print", "proposals.view_all", "proposals.convert",
  "documents.view", "documents.edit",
  "site.view", "site.edit",
  "attendance.view", "attendance.edit",
  "expenses.submit", "expenses.view_all", "expenses.approve",
  "public.view", "public.edit",
  "reports.view",
] as const;

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

function isEffectiveBill(row: Row) {
  return !["void", "voided", "cancelled", "canceled", "rejected"].includes(text(row.status).toLowerCase());
}

function isEffectivePayment(row: Row) {
  if (text(row.transaction_type).toLowerCase() === "personal income" || row.affects_business_balance === false) return false;
  const status = text(row.approval_status || row.status).toLowerCase().replace(/[_-]+/g, " ");
  return !status || ["approved", "received", "paid", "verified", "complete", "completed", "full paid", "fully paid", "posted"].includes(status);
}

async function permissionsFor(user: Row) {
  const role = roleOf(user);
  const permissions: Record<string, boolean> = Object.fromEntries(PERMISSION_KEYS.map((key) => [key, false]));

  if (role === "admin" || role === "manager") {
    for (const key of PERMISSION_KEYS) permissions[key] = true;
    return permissions;
  }

  if (role === "accounts") {
    for (const key of ACCOUNTS_DEFAULTS) permissions[key] = true;
  }

  const userKey = userIdOf(user);
  if (userKey) {
    const rows = await selectRows("app_permissions", {
      filters: { user_key: userKey },
      order: "created_at:asc",
      limit: 5000,
    });
    for (const row of rows) {
      const key = text(row.permission);
      if (key) permissions[key] = text(row.status).toLowerCase() === "active";
    }
  }

  return permissions;
}

export async function GET(request: NextRequest) {
  try {
    const user = (await requireLocalSession(request)) as Row | null;
    if (!user) {
      return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    }

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

    const employeesPromise = permissions["employees.view"]
      ? selectRows("employees", { limit: 1000 })
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

    const [documents, employees, bills, payments] = await Promise.all([
      documentsPromise,
      employeesPromise,
      billsPromise,
      paymentsPromise,
    ]);

    const effectiveBills = bills.filter(isEffectiveBill);
    const effectivePayments = payments.filter(isEffectivePayment);
    const totalBill = effectiveBills.reduce(
      (sum, bill) => sum + numberValue(bill.net_amount ?? (numberValue(bill.amount) - numberValue(bill.discount))),
      0,
    );
    const totalPaid = effectivePayments.reduce((sum, payment) => sum + numberValue(payment.amount), 0);
    const activeProjects = scopedProjects.filter((project) =>
      !["completed", "closed", "cancelled", "canceled"].includes(text(project.Status).toLowerCase()),
    );
    const recentProjects = [...scopedProjects]
      .sort((a, b) => text(b.Updated_At || b.Created_Date).localeCompare(text(a.Updated_At || a.Created_Date)))
      .slice(0, 10);

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
        employeeCount: employees.length,
        documentCount: documents.length,
        totalBill,
        totalPaid,
        pendingPayments: totalBill - totalPaid,
      },
      recentProjects,
      backend: "supabase-postgresql",
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
