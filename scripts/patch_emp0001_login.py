from pathlib import Path
import subprocess

# LAND VIEW employee identity + authorization repair.
# This script is intentionally idempotent because the GitHub workflow may run it repeatedly.
code_path = Path("Code.gs")
s = code_path.read_text(encoding="utf-8")

# -----------------------------------------------------------------------------
# EMP-0001 identity/login aliases
# -----------------------------------------------------------------------------
old_matcher = '''    const rowUserId = normalize(firstValue(user, ["User_ID", "User ID", "UserId", "userId"]));
    const rowUsername = normalize(firstValue(user, ["Username", "username", "User_Name", "User Name"]));
    const rowPhoneUsername = normalizePhoneIdentifier(firstValue(user, ["Username", "username", "Phone", "Phone_Number"]));
    const identifierMatches = normalizedIdentifier === rowUserId || normalizedIdentifier === rowUsername || (phoneIdentifier && phoneIdentifier === rowPhoneUsername);
'''

new_matcher = '''    const rowUserId = normalize(firstValue(user, ["User_ID", "User ID", "UserId", "userId"]));
    const rowUsername = normalize(firstValue(user, ["Username", "username", "User_Name", "User Name"]));
    const rowEmployeeId = normalize(firstValue(user, ["Employee_ID", "Employee ID", "EmployeeId", "employeeId"]));
    const rowPhoneUsername = normalizePhoneIdentifier(firstValue(user, ["Username", "username", "Phone", "Phone_Number"]));
    const chairmanAliasMatches = normalizedIdentifier === normalize("EMP-0001") && chairmanIdentityMatches_(user);
    const identifierMatches = normalizedIdentifier === rowUserId || normalizedIdentifier === rowUsername || normalizedIdentifier === rowEmployeeId || chairmanAliasMatches || (phoneIdentifier && phoneIdentifier === rowPhoneUsername);
'''

if 'const chairmanAliasMatches = normalizedIdentifier === normalize("EMP-0001")' not in s:
    if old_matcher not in s:
        raise SystemExit("loginUser matcher anchor not found")
    s = s.replace(old_matcher, new_matcher, 1)

old_name_match = '''    name.indexOf("jamal ahmed bhuiyan") >= 0 ||
    name.indexOf("jamal rony") >= 0;'''
new_name_match = '''    name.indexOf("jamal ahmed bhuiyan") >= 0 ||
    name.indexOf("jamal ahamed bhuiyan") >= 0 ||
    name.indexOf("jamal rony") >= 0;'''
if 'name.indexOf("jamal ahamed bhuiyan") >= 0' not in s:
    if old_name_match not in s:
        raise SystemExit("chairmanIdentityMatches_ name anchor not found")
    s = s.replace(old_name_match, new_name_match, 1)

# -----------------------------------------------------------------------------
# One coherent Employee action policy.
# Read/write access remains scoped by assertProjectAccess/getAllowedProjectIds.
# Finance, users, employees, permissions and project administration stay blocked.
# -----------------------------------------------------------------------------
old_employee_access = '''  employee: [
    "getProjects", "getProject", "getDocuments", "createDocument", "getSiteVisits", "createSiteVisit", "changeOwnPassword",
    "getErpRecords", "createErpRecord", "updateErpRecord"
  ],'''
new_employee_access = '''  employee: [
    // Account/session-safe operations.
    "changeOwnPassword",

    // Assigned-project read access. Each function still applies project scoping.
    "getProjects", "getProject", "getProjectDriveFolder", "getProjectServiceFolders",

    // Assigned-project operational records.
    "getDocuments", "createDocument", "getSiteVisits", "createSiteVisit", "uploadProjectServiceFile",

    // Employee ERP modules: workflow/tasks, attendance, leave, drawings and expenses.
    "getErpRecords", "createErpRecord", "updateErpRecord"
  ],'''
if old_employee_access in s:
    s = s.replace(old_employee_access, new_employee_access, 1)
elif '"getProjectServiceFolders"' not in s.split('client: [', 1)[0]:
    raise SystemExit("ROLE_ACCESS.employee anchor not found")

# Make future role mismatches self-identifying and auditable.
old_denial = '''  if (!allowed.includes(action)) {
    throw new Error("Access denied for role: " + (session.role || "Unknown"));
  }
'''
new_denial = '''  if (!allowed.includes(action)) {
    auditSecurityEvent_(session, "ROLE_DENIED", action, "DENIED", "Role action policy");
    throw new Error("Access denied for role: " + (session.role || "Unknown") + " (action: " + action + ")");
  }
'''
if old_denial in s:
    s = s.replace(old_denial, new_denial, 1)

# Allow Employees to upload only inside projects they are already assigned to.
old_upload_gate = '''  if (
    !isAdminRole(
      session.role
    )
  ) {
    throw new Error(
      "Access denied."
    );
  }
'''
new_upload_gate = '''  const uploadRole = normalizeRoleName(session.role);
  if (!isAdminRole(uploadRole) && uploadRole !== "employee") {
    throw new Error("Access denied.");
  }
'''
# Scope replacement to the upload function only.
upload_start = s.find('function uploadProjectServiceFile(params)')
if upload_start >= 0:
    upload_end = s.find('\n}\n', upload_start)
    segment = s[upload_start:upload_end + 3] if upload_end >= 0 else s[upload_start:]
    if old_upload_gate in segment:
        segment = segment.replace(old_upload_gate, new_upload_gate, 1)
        s = s[:upload_start] + segment + s[upload_start + len(s[upload_start:upload_end + 3]):]

# -----------------------------------------------------------------------------
# Role defaults for the ERP permission layer.
# Explicit Permission-sheet rows override these defaults, including revocation.
# -----------------------------------------------------------------------------
permission_anchor = '''};

function permissionPrincipalIds_(session) {'''
role_defaults = '''};

// Built-in role defaults keep normal portal functions working even when the
// Permissions sheet has no per-user rows. An explicit latest permission row
// still overrides the default, so Admin can revoke a capability with Status=Inactive.
const ROLE_DEFAULT_PERMISSIONS = {
  employee: [
    LAND_VIEW_PERMISSION_KEYS.PROJECTS_VIEW,
    LAND_VIEW_PERMISSION_KEYS.WORKFLOW_VIEW,
    LAND_VIEW_PERMISSION_KEYS.WORKFLOW_EDIT,
    LAND_VIEW_PERMISSION_KEYS.DOCUMENTS_VIEW,
    LAND_VIEW_PERMISSION_KEYS.DOCUMENTS_EDIT,
    LAND_VIEW_PERMISSION_KEYS.SITE_VIEW,
    LAND_VIEW_PERMISSION_KEYS.SITE_EDIT,
    LAND_VIEW_PERMISSION_KEYS.CERTIFICATES_VIEW,
    LAND_VIEW_PERMISSION_KEYS.ATTENDANCE_VIEW,
    LAND_VIEW_PERMISSION_KEYS.ATTENDANCE_EDIT,
    LAND_VIEW_PERMISSION_KEYS.EXPENSES_SUBMIT
  ]
};

function isChairmanSession_(session) {
  if (!session) return false;
  return chairmanIdentityMatches_({
    userId: session.userId,
    User_ID: session.userId,
    username: session.username,
    Username: session.username,
    name: session.name,
    Name: session.name,
    employeeId: session.employeeId,
    Employee_ID: session.employeeId
  });
}

function defaultPermissionForRole_(session, permissionKey) {
  if (!session) return false;
  const role = normalizeRoleName(session.role);
  if (isMainAdminRole_(role)) return true;

  const defaults = ROLE_DEFAULT_PERMISSIONS[role] || [];
  if (defaults.indexOf(permissionKey) >= 0) return true;

  // EMP-0001 is the chairman expense approver but remains an Employee account.
  if (role === "employee" && isChairmanSession_(session)) {
    if (permissionKey === LAND_VIEW_PERMISSION_KEYS.EXPENSES_VIEW_ALL ||
        permissionKey === LAND_VIEW_PERMISSION_KEYS.EXPENSES_APPROVE) {
      return true;
    }
  }

  return false;
}

function permissionPrincipalIds_(session) {'''
if 'const ROLE_DEFAULT_PERMISSIONS = {' not in s:
    if permission_anchor not in s:
        raise SystemExit("permission defaults anchor not found")
    s = s.replace(permission_anchor, role_defaults, 1)

old_no_rows = '  if (!rows.length) return false;\n  return normalize(firstValue(rows[rows.length - 1], ["Status", "status"])) === "active";'
new_no_rows = '  if (!rows.length) return null;\n  return normalize(firstValue(rows[rows.length - 1], ["Status", "status"])) === "active";'
if old_no_rows in s:
    s = s.replace(old_no_rows, new_no_rows, 1)

old_has_permission = '''function hasPermission_(session, permissionKey) {
  return latestPermissionState_(session, permissionKey);
}'''
new_has_permission = '''function hasPermission_(session, permissionKey) {
  const explicitState = latestPermissionState_(session, permissionKey);
  if (explicitState !== null && explicitState !== undefined) return explicitState;
  return defaultPermissionForRole_(session, permissionKey);
}'''
if old_has_permission in s:
    s = s.replace(old_has_permission, new_has_permission, 1)
elif 'defaultPermissionForRole_(session, permissionKey)' not in s:
    raise SystemExit("hasPermission_ anchor not found")

code_path.write_text(s, encoding="utf-8")

# -----------------------------------------------------------------------------
# Frontend API alignment: Employee task reads must use the employee-scoped ERP
# endpoint, not the Admin/Accounts Finance Sheet workflow endpoint.
# -----------------------------------------------------------------------------
api_path = Path("lib/api.ts")
if api_path.exists():
    api = api_path.read_text(encoding="utf-8")
    old_task_reader = '''  getErpRecords: async (module: ErpModule) => {
    if (module === "tasks") return getBillingDrivenWorkflowTasks();
    return get<Record<string, unknown>[]>("getErpRecords", { module });
  },'''
    new_task_reader = '''  getErpRecords: async (module: ErpModule) => {
    if (module === "tasks") {
      const session = readSessionCache();
      const role = String(session?.user?.role || session?.user?.Role || "").trim().toLowerCase();
      if (role === "employee") {
        return get<Record<string, unknown>[]>("getErpRecords", { module: "tasks" });
      }
      return getBillingDrivenWorkflowTasks();
    }
    return get<Record<string, unknown>[]>("getErpRecords", { module });
  },'''
    if old_task_reader in api:
        api = api.replace(old_task_reader, new_task_reader, 1)
        api_path.write_text(api, encoding="utf-8")
        # The existing workflow's later git-add list does not mention lib/api.ts.
        # Stage it here so the same workflow commit includes the alignment fix.
        subprocess.run(["git", "add", "lib/api.ts"], check=True)

print("Employee role policy, default permissions, chairman approvals, and task API alignment patched successfully")
