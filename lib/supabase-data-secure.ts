import {
  employeeCodeOf,
  handleLandviewDataAction as handleUnsafeLandviewDataAction,
  normalizeProjectCode,
  roleOf,
  selectRows,
  type WorkspaceUser,
} from "./supabase-data";

// Preserve the complete low-level module surface for existing imports while
// replacing only handleLandviewDataAction with the guarded implementation below.
export * from "./supabase-data";

type Row = Record<string, any>;

const MANAGEMENT_ROLES = new Set(["admin", "manager"]);
const CLIENT_READ_ACTIONS = new Set([
  "getDashboard",
  "getProjects",
  "getProject",
  "getDocuments",
  "getSiteVisits",
  "getProjectBilling",
  "getBillingRecords",
  "getPayments",
  "getInvoices",
]);
const EMPLOYEE_ALLOWED_ACTIONS = new Set([
  "getDashboard",
  "getProjects",
  "getProject",
  "getProjectEmployees",
  "getDocuments",
  "getSiteVisits",
  "getErpRecords",
  "createDocument",
  "createSiteVisit",
]);
const EMPLOYEE_FINANCE_ACTIONS = new Set([
  "getBillingDashboard",
  "getBillingBook",
  "getProjectBilling",
  "getBillingRecords",
  "getPayments",
  "getInvoices",
  "getFinanceSheet",
  "getChairmanPendingApprovals",
  "saveBill",
  "createBill",
  "savePayment",
  "createPayment",
  "reviewChairmanPendingApproval",
]);
const FINANCE_ACTIONS = new Set([
  "getBillingDashboard",
  "getBillingBook",
  "getProjectBilling",
  "getBillingRecords",
  "getPayments",
  "getInvoices",
  "getFinanceSheet",
  "getChairmanPendingApprovals",
  "saveBill",
  "createBill",
  "savePayment",
  "createPayment",
  "reviewChairmanPendingApproval",
]);
const PROJECT_SCOPED_ACTIONS = new Set([
  "getProject",
  "getProjectEmployees",
  "getProjectBilling",
  "getBillingRecords",
  "getPayments",
  "getInvoices",
  "updateProject",
  "deleteProject",
  "updateProjectEmployees",
  "createDocument",
  "createSiteVisit",
  "saveBill",
  "createBill",
]);

function text(value: unknown) {
  return String(value ?? "").trim();
}

function projectCodeFrom(input: Row) {
  return normalizeProjectCode(
    input.projectId || input.Project_ID || input.project_id || input.project_code || input.fileId || input.File_ID,
  );
}

function userProjectCodes(user: WorkspaceUser) {
  const row = (user || {}) as Row;
  const values = [row.projectIds, row.Project_IDs, row.projectId, row.Project_ID]
    .flatMap((value) => Array.isArray(value) ? value : text(value).split(/[;,\s]+/))
    .map(normalizeProjectCode)
    .filter(Boolean);
  return Array.from(new Set(values));
}

/**
 * Employee project scope comes from the authoritative assignment tables rather
 * than a legacy API response. This prevents a future regression in getProjects
 * from silently widening employee access.
 */
async function employeeProjectCodes(user: WorkspaceUser) {
  const code = text(employeeCodeOf(user)).toUpperCase();
  if (!code) return [];

  const employees = await selectRows("employees", { filters: { employee_code: code }, limit: 1 });
  const employeeId = employees[0]?.id;
  if (!employeeId) return [];

  const links = await selectRows("project_employees", { filters: { employee_id: employeeId }, limit: 5000 });
  const projectIds = Array.from(new Set(links.map((row) => row.project_id).filter(Boolean)));
  if (!projectIds.length) return [];

  const projects = await selectRows("projects", { inFilters: { id: projectIds }, limit: 5000 });
  return Array.from(new Set(projects.map((row) => normalizeProjectCode(row.project_code)).filter(Boolean)));
}

async function accessibleProjectCodes(user: WorkspaceUser) {
  const role = roleOf(user);
  if (MANAGEMENT_ROLES.has(role) || role === "accounts") return null;
  if (role === "client") return new Set(userProjectCodes(user));
  if (role === "employee") return new Set(await employeeProjectCodes(user));
  return new Set<string>();
}

async function requireProjectAccess(user: WorkspaceUser, input: Row) {
  const allowed = await accessibleProjectCodes(user);
  if (allowed === null) return;
  const projectCode = projectCodeFrom(input);
  if (!projectCode) throw new Error("Project access requires a Project_ID.");
  if (!allowed.has(projectCode)) throw new Error("Permission denied for this project.");
}

function filterByProjectCode(rows: Row[], allowed: Set<string>) {
  return rows.filter((row) => allowed.has(normalizeProjectCode(
    row.Project_ID || row.projectId || row.fileId || row.project_code || row.File_ID,
  )));
}

function clientVisible(value: unknown) {
  if (value === true) return true;
  return ["true", "yes", "1", "visible", "client"].includes(text(value).toLowerCase());
}

async function safeDashboard(user: WorkspaceUser) {
  const role = roleOf(user);
  const projects = await handleLandviewDataAction("getProjects", {}, user) as Row[];
  const active = projects.filter((row) => {
    const stages = [row.Design_Stage_Status, row.Approval_Stage_Status, row.Supervision_Stage_Status];
    return stages.some((status) => text(status).toLowerCase() !== "completed");
  });
  return {
    user,
    stats: {
      projectCount: projects.length,
      activeProjectCount: active.length,
      employeeCount: 0,
      documentCount: 0,
      totalBill: 0,
      totalPaid: 0,
      pendingPayments: 0,
    },
    recentProjects: projects.slice(0, 8),
    scoped: true,
    role,
  };
}

async function safeEmployeeErp(action: string, input: Row, user: WorkspaceUser) {
  const module = text(input.module).toLowerCase();
  const employeeCode = text(employeeCodeOf(user)).toUpperCase();
  if (!employeeCode) throw new Error("Employee identity is required.");

  if (action === "getErpRecords") {
    if (!["tasks", "attendance", "leave", "expenses"].includes(module)) {
      throw new Error("Permission denied for this ERP module.");
    }
    const rows = await handleUnsafeLandviewDataAction(action, input, user) as Row[];
    if (module === "tasks") return rows.filter((row) => text(row.Assigned_Employee_ID).toUpperCase() === employeeCode);
    if (module === "attendance" || module === "leave") return rows.filter((row) => text(row.Employee_ID).toUpperCase() === employeeCode);
    return rows.filter((row) => text(row.Requested_By || row.Employee_ID).toUpperCase() === employeeCode);
  }

  throw new Error("Management access is required for ERP changes.");
}

async function handleClientAction(action: string, input: Row, user: WorkspaceUser) {
  if (!CLIENT_READ_ACTIONS.has(action)) throw new Error("Client access is not available for this action.");
  const allowed = await accessibleProjectCodes(user) as Set<string>;

  if (action === "getDashboard") return safeDashboard(user);

  if (action === "getProjects") {
    const rows = await handleUnsafeLandviewDataAction(action, input, user) as Row[];
    return filterByProjectCode(rows, allowed);
  }

  if (action === "getDocuments" || action === "getSiteVisits") {
    if (projectCodeFrom(input)) await requireProjectAccess(user, input);
    const rows = await handleUnsafeLandviewDataAction(action, input, user) as Row[];
    const scoped = filterByProjectCode(rows, allowed);
    return action === "getDocuments" ? scoped.filter((row) => clientVisible(row.Client_Visible)) : scoped;
  }

  await requireProjectAccess(user, input);
  return handleUnsafeLandviewDataAction(action, input, user);
}

async function handleEmployeeAction(action: string, input: Row, user: WorkspaceUser) {
  if (EMPLOYEE_FINANCE_ACTIONS.has(action)) throw new Error("Finance access is required.");
  if (!EMPLOYEE_ALLOWED_ACTIONS.has(action)) throw new Error("Employee access is not available for this action.");

  if (action === "getDashboard") return safeDashboard(user);

  if (action === "getProjects") {
    const allowed = await accessibleProjectCodes(user) as Set<string>;
    const rows = await handleUnsafeLandviewDataAction(action, input, user) as Row[];
    return filterByProjectCode(rows, allowed);
  }

  if (action === "getErpRecords") return safeEmployeeErp(action, input, user);

  if (PROJECT_SCOPED_ACTIONS.has(action)) await requireProjectAccess(user, input);

  if (action === "getDocuments" || action === "getSiteVisits") {
    const allowed = await accessibleProjectCodes(user) as Set<string>;
    if (projectCodeFrom(input)) await requireProjectAccess(user, input);
    const rows = await handleUnsafeLandviewDataAction(action, input, user) as Row[];
    return filterByProjectCode(rows, allowed);
  }

  if (action === "createSiteVisit") {
    input = { ...input, Employee_ID: employeeCodeOf(user), employeeId: employeeCodeOf(user) };
  }

  return handleUnsafeLandviewDataAction(action, input, user);
}

async function handleAccountsAction(action: string, input: Row, user: WorkspaceUser) {
  if (FINANCE_ACTIONS.has(action) || ["getProjects", "getProject"].includes(action)) {
    return handleUnsafeLandviewDataAction(action, input, user);
  }
  throw new Error("Accounts access is not available for this action.");
}

/**
 * Authoritative compatibility-action guard.
 *
 * Every caller importing @/lib/supabase-data is routed through this wrapper by
 * tsconfig. The original module remains the low-level data adapter; this layer
 * owns role authorization and resource scoping so UI visibility is never used
 * as an access-control boundary.
 */
export async function handleLandviewDataAction(action: string, input: Row = {}, user: WorkspaceUser) {
  const role = roleOf(user);
  if (!role) throw new Error("Authentication required.");

  if (MANAGEMENT_ROLES.has(role)) return handleUnsafeLandviewDataAction(action, input, user);
  if (role === "accounts") return handleAccountsAction(action, input, user);
  if (role === "client") return handleClientAction(action, input, user);
  if (role === "employee") return handleEmployeeAction(action, input, user);

  throw new Error("Permission denied for this role.");
}
