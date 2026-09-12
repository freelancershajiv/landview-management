/* LAND VIEW — granular access control backend patch
 * Add this file to the Apps Script project, then replace the ERP functions in Code.gs
 * with the secure versions documented in APPS_SCRIPT_ACCESS_CONTROL_DEPLOY.md.
 */

const LAND_VIEW_PERMISSION_KEYS = {
  PROJECTS_VIEW: "projects.view",
  PROJECTS_EDIT: "projects.edit",
  WORKFLOW_VIEW: "workflow.view",
  WORKFLOW_EDIT: "workflow.edit",
  WORKFLOW_ASSIGN: "workflow.assign",
  DOCUMENTS_VIEW: "documents.view",
  DOCUMENTS_EDIT: "documents.edit",
  SITE_VIEW: "site.view",
  SITE_EDIT: "site.edit",
  CERTIFICATES_VIEW: "certificates.view",
  CERTIFICATES_PROCESS: "certificates.process",
  CERTIFICATES_ISSUE: "certificates.issue",
  FINANCE_VIEW: "finance.view",
  FINANCE_EDIT: "finance.edit",
  EMPLOYEES_VIEW: "employees.view",
  EMPLOYEES_MANAGE: "employees.manage",
  ATTENDANCE_VIEW: "attendance.view",
  ATTENDANCE_EDIT: "attendance.edit",
  EXPENSES_SUBMIT: "expenses.submit",
  EXPENSES_VIEW_ALL: "expenses.view_all",
  EXPENSES_APPROVE: "expenses.approve",
  PUBLIC_VIEW: "public.view",
  PUBLIC_EDIT: "public.edit",
  REPORTS_VIEW: "reports.view"
};

function permissionPrincipalIds_(session) {
  const ids = [];
  [session && session.userId, session && session.employeeId, session && session.username]
    .forEach(function(value) {
      const id = String(value || "").trim();
      if (id && ids.indexOf(id) < 0) ids.push(id);
    });
  return ids;
}

function latestPermissionState_(session, permissionKey) {
  if (isAdminRole(session && session.role)) return true;
  const principals = permissionPrincipalIds_(session);
  if (!principals.length) return false;
  const key = String(permissionKey || "").trim();
  const rows = readSheet(CONFIG.SHEETS.PERMISSIONS)
    .filter(function(row) {
      const uid = String(firstValue(row, ["User_ID", "User ID", "Employee_ID", "Employee ID"]) || "").trim();
      const permission = String(firstValue(row, ["Permission", "Permission_Key", "Permission Key"]) || "").trim();
      return principals.indexOf(uid) >= 0 && permission === key;
    })
    .sort(function(a, b) {
      const ad = new Date(String(firstValue(a, ["Created_At", "Created At"]) || 0)).getTime() || 0;
      const bd = new Date(String(firstValue(b, ["Created_At", "Created At"]) || 0)).getTime() || 0;
      return ad - bd;
    });
  if (!rows.length) return false;
  return normalize(firstValue(rows[rows.length - 1], ["Status", "status"])) === "active";
}

function hasPermission_(session, permissionKey) {
  return latestPermissionState_(session, permissionKey);
}

function requirePermission_(session, permissionKey, message) {
  if (!hasPermission_(session, permissionKey)) {
    throw new Error(message || ("Permission required: " + permissionKey));
  }
  return true;
}

function ownsExpenseRecord_(row, session) {
  const principals = permissionPrincipalIds_(session);
  const createdBy = String(firstValue(row, ["Created_By", "Created By", "Employee_ID", "Employee ID"]) || "").trim();
  return !!createdBy && principals.indexOf(createdBy) >= 0;
}

function filterExpensesForSession_(records, session) {
  if (isAdminRole(session.role) || hasPermission_(session, LAND_VIEW_PERMISSION_KEYS.EXPENSES_VIEW_ALL) || hasPermission_(session, LAND_VIEW_PERMISSION_KEYS.EXPENSES_APPROVE)) {
    return records;
  }
  return records.filter(function(row) { return ownsExpenseRecord_(row, session); });
}

function enforceErpReadPermission_(moduleName, session) {
  if (isAdminRole(session.role)) return true;
  const role = normalizeRoleName(session.role);
  if (moduleName === "expenses") {
    if (role === "employee") return true; // own records are scoped later
    if (hasPermission_(session, LAND_VIEW_PERMISSION_KEYS.EXPENSES_VIEW_ALL) || hasPermission_(session, LAND_VIEW_PERMISSION_KEYS.EXPENSES_APPROVE)) return true;
  }
  if (moduleName === "tasks") return requirePermission_(session, LAND_VIEW_PERMISSION_KEYS.WORKFLOW_VIEW);
  if (moduleName === "attendance") return requirePermission_(session, LAND_VIEW_PERMISSION_KEYS.ATTENDANCE_VIEW);
  if (moduleName === "drawings") return requirePermission_(session, LAND_VIEW_PERMISSION_KEYS.DOCUMENTS_VIEW);
  if (role === "accounts") return true;
  return false;
}

function enforceErpCreatePermission_(moduleName, session) {
  if (isAdminRole(session.role)) return true;
  if (moduleName === "expenses") return requirePermission_(session, LAND_VIEW_PERMISSION_KEYS.EXPENSES_SUBMIT, "You do not have permission to submit office expenses.");
  if (moduleName === "tasks") return requirePermission_(session, LAND_VIEW_PERMISSION_KEYS.WORKFLOW_EDIT);
  if (moduleName === "attendance") return requirePermission_(session, LAND_VIEW_PERMISSION_KEYS.ATTENDANCE_EDIT);
  if (moduleName === "drawings") return requirePermission_(session, LAND_VIEW_PERMISSION_KEYS.DOCUMENTS_EDIT);
  if (normalizeRoleName(session.role) === "accounts" && ["clients", "quotations"].indexOf(moduleName) >= 0) return true;
  throw new Error("Access denied.");
}

function enforceErpUpdatePermission_(moduleName, params, session) {
  if (isAdminRole(session.role)) return true;
  if (moduleName === "expenses") {
    const statusChange = params.Status !== undefined || params.Reviewed_By !== undefined || params.Reviewed_At !== undefined;
    if (statusChange) return requirePermission_(session, LAND_VIEW_PERMISSION_KEYS.EXPENSES_APPROVE, "You do not have permission to approve or reject expenses.");
    return requirePermission_(session, LAND_VIEW_PERMISSION_KEYS.EXPENSES_SUBMIT);
  }
  if (moduleName === "tasks") {
    if (params.Assigned_Employee_ID !== undefined) return requirePermission_(session, LAND_VIEW_PERMISSION_KEYS.WORKFLOW_ASSIGN);
    return requirePermission_(session, LAND_VIEW_PERMISSION_KEYS.WORKFLOW_EDIT);
  }
  if (moduleName === "attendance") return requirePermission_(session, LAND_VIEW_PERMISSION_KEYS.ATTENDANCE_EDIT);
  if (moduleName === "drawings") return requirePermission_(session, LAND_VIEW_PERMISSION_KEYS.DOCUMENTS_EDIT);
  if (normalizeRoleName(session.role) === "accounts" && ["clients", "quotations"].indexOf(moduleName) >= 0) return true;
  throw new Error("Access denied.");
}

function secureFilterErpRecordsForSession_(moduleName, records, session) {
  const role = normalizeRoleName(session.role);
  if (isAdminRole(role)) return records;
  enforceErpReadPermission_(moduleName, session);

  if (moduleName === "expenses") return filterExpensesForSession_(records, session);

  if (role === "employee") {
    const employeeId = String(session.employeeId || "").trim();
    if (moduleName === "tasks" || moduleName === "drawings") {
      return records.filter(function(row) { return String(row.Assigned_Employee_ID || "").trim() === employeeId; });
    }
    if (moduleName === "attendance" || moduleName === "leave") {
      return records.filter(function(row) { return String(row.Employee_ID || "").trim() === employeeId; });
    }
    return [];
  }

  if (role === "client") {
    const projectIds = splitIds(session.projectIds || "");
    if (moduleName !== "drawings" && moduleName !== "approvals") return [];
    return records.filter(function(row) { return projectIds.includes(String(row.Project_ID || "").trim()); });
  }

  return records;
}
