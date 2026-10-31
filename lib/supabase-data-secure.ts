import {
  deleteRows,
  employeeCodeOf,
  getSiteVisitMediaUrl,
  handleLandviewDataAction as handleUnsafeLandviewDataAction,
  insertRows,
  normalizeProjectCode,
  roleOf,
  selectRows,
  SUPABASE_DATA_GET_ACTIONS,
  SUPABASE_DATA_POST_ACTIONS,
  supabaseGateway,
  updateRows,
  uploadSiteVisitMedia,
  upsertRows,
  type WorkspaceUser,
} from "./supabase-data";

export {
  deleteRows,
  employeeCodeOf,
  getSiteVisitMediaUrl,
  insertRows,
  normalizeProjectCode,
  roleOf,
  selectRows,
  SUPABASE_DATA_GET_ACTIONS,
  SUPABASE_DATA_POST_ACTIONS,
  supabaseGateway,
  updateRows,
  uploadSiteVisitMedia,
  upsertRows,
};
export type { WorkspaceUser };

type Row = Record<string, any>;

const MANAGEMENT_ROLES = new Set(["admin", "manager"]);
const FINANCE_ROLES = new Set(["admin", "manager", "accounts"]);
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

async function employeeProjectCodes(user: WorkspaceUser) {
  const projects = await handleUnsafeLandviewDataAction("getProjects", {}, user) as Row[];
  return Array.from(new Set(projects.map((row) => normalizeProjectCode(row.Project_ID || row.projectId)).filter(Boolean)));
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
  return rows.filter((row) => allowed.has(normalizeProjectCode(row.Project_ID || row.projectId || row.fileId)));
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

  // Mutating generic ERP records is too broad for an employee because the base
  // handler can change assignment/approval fields. Employee self-service uses
  // dedicated endpoints; keep this compatibility route management-only.
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
    return action === "getDocuments" ? scoped.filter((row) => row.Client_Visible === true) : scoped;
  }

  await requireProjectAccess(user, input);
  return handleUnsafeLandviewDataAction(action, input, user);
}

async function handleEmployeeAction(action: string, input: Row, user: WorkspaceUser) {
  if (EMPLOYEE_FINANCE_ACTIONS.has(action)) throw new Error("Finance access is required.");
  if (action === "getEmployees" || action === "getChairmanPendingApprovals") {
    throw new Error("Management access is required.");
  }
  if (["createEmployee", "updateEmployee", "deleteEmployee", "initializeErpSheets"].includes(action)) {
    // The underlying handler still evaluates explicit permission overrides for
    // permission-aware management actions. Generic initialization remains admin.
    if (action === "initializeErpSheets") throw new Error("Management access is required.");
  }
  if (action === "getDashboard") return safeDashboard(user);
  if (action === "getErpRecords" || action === "createErpRecord" || action === "updateErpRecord") {
    return safeEmployeeErp(action, input, user);
  }
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
