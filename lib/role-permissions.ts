export type WorkspaceRole = "admin" | "manager" | "employee" | "client";

export type PermissionDefinition = {
  key: string;
  label: string;
  group: string;
  description?: string;
  adminOnly?: boolean;
};

export const PERMISSION_DEFINITIONS: PermissionDefinition[] = [
  { key: "dashboard.view", label: "Dashboard · View", group: "Workspace" },
  { key: "projects.view", label: "Projects · View", group: "Projects" },
  { key: "projects.edit", label: "Projects · Create / Edit", group: "Projects" },
  { key: "projects.delete", label: "Projects · Delete", group: "Projects", adminOnly: true },
  { key: "project_management.view", label: "Project Management · View", group: "Projects" },
  { key: "project_management.edit", label: "Project Management · Edit", group: "Projects" },
  { key: "estimates.view", label: "Estimates · View", group: "Projects" },
  { key: "estimates.edit", label: "Estimates · Create / Edit", group: "Projects" },

  { key: "workflow.view", label: "Workflow · View", group: "Workflow" },
  { key: "workflow.edit", label: "Workflow · Edit / Progress", group: "Workflow" },
  { key: "workflow.assign", label: "Workflow · Assign Team", group: "Workflow" },

  { key: "site.view", label: "Site Visits · View", group: "Project records" },
  { key: "site.edit", label: "Site Visits · Add / Edit", group: "Project records" },
  { key: "documents.view", label: "Documents · View", group: "Project records" },
  { key: "documents.edit", label: "Documents · Upload / Edit", group: "Project records" },

  { key: "proposals.view", label: "Proposals · View", group: "Proposals" },
  { key: "proposals.create", label: "Proposals · Create", group: "Proposals" },
  { key: "proposals.edit", label: "Proposals · Edit", group: "Proposals" },
  { key: "proposals.print", label: "Proposals · Print / PDF", group: "Proposals" },
  { key: "proposals.view_all", label: "Proposals · View All Staff", group: "Proposals" },
  { key: "proposals.convert", label: "Proposals · Convert to Project", group: "Proposals" },

  { key: "certificates.view", label: "Certificates · View", group: "Certificates" },
  { key: "certificates.process", label: "Certificates · Process / Edit", group: "Certificates" },
  { key: "certificates.issue", label: "Certificates · Issue", group: "Certificates", adminOnly: true },

  { key: "finance.view", label: "Billing · View", group: "Finance" },
  { key: "finance.edit", label: "Billing · Create / Edit", group: "Finance" },
  { key: "municipality.view", label: "Municipality Accounts · View", group: "Finance" },
  { key: "municipality.expense_add", label: "Municipality · Add Expense", group: "Finance" },
  { key: "municipality.edit", label: "Municipality · Edit History", group: "Finance", adminOnly: true },
  { key: "municipality.send_main", label: "Municipality · Send to Main Ledger", group: "Finance", adminOnly: true },

  { key: "accounts.view", label: "Main Accounts · View", group: "Accounts" },
  { key: "accounts.edit", label: "Main Accounts · Create Entries", group: "Accounts", adminOnly: true },
  { key: "ledger.view", label: "Ledger · View", group: "Accounts" },
  { key: "ledger.edit", label: "Ledger · Edit History", group: "Accounts", adminOnly: true },
  { key: "ledger.reorder", label: "Ledger · Reorder Entries", group: "Accounts", adminOnly: true },
  { key: "ledger.delete", label: "Ledger · Delete / Void", group: "Accounts", adminOnly: true },
  { key: "expenses.submit", label: "Expenses · Submit Own", group: "Accounts" },
  { key: "expenses.view_all", label: "Expenses · View All", group: "Accounts" },
  { key: "expenses.approve", label: "Expenses · Review / Approve", group: "Accounts" },

  { key: "employees.view", label: "Employees · View", group: "People" },
  { key: "employees.manage", label: "Employees · Create / Edit / Delete", group: "People", adminOnly: true },
  { key: "attendance.view", label: "Attendance · View", group: "People" },
  { key: "attendance.edit", label: "Attendance · Edit", group: "People" },

  { key: "public.view", label: "Public Website · View", group: "Website" },
  { key: "public.edit", label: "Public Website · Edit", group: "Website" },
  { key: "analytics.view", label: "Website Analytics · View", group: "Website" },
  { key: "reports.view", label: "Reports · View / Export", group: "Reports" },
  { key: "access.manage", label: "Access Control · Manage", group: "Administration", adminOnly: true },
];

export const PERMISSION_GROUP_ORDER = [
  "Workspace",
  "Projects",
  "Workflow",
  "Project records",
  "Proposals",
  "Certificates",
  "Finance",
  "Accounts",
  "People",
  "Website",
  "Reports",
  "Administration",
];

const MANAGER_DEFAULTS = new Set([
  "dashboard.view",
  "projects.view", "projects.edit",
  "project_management.view", "project_management.edit",
  "estimates.view", "estimates.edit",
  "workflow.view", "workflow.edit", "workflow.assign",
  "site.view", "site.edit",
  "documents.view", "documents.edit",
  "proposals.view", "proposals.create", "proposals.edit", "proposals.print", "proposals.view_all", "proposals.convert",
  "certificates.view", "certificates.process",
  "finance.view", "finance.edit",
  "municipality.view", "municipality.expense_add",
  "accounts.view", "ledger.view",
  "expenses.view_all", "expenses.approve",
  "employees.view", "attendance.view",
  "public.view", "public.edit", "analytics.view",
  "reports.view",
]);

const EMPLOYEE_DEFAULTS = new Set([
  "dashboard.view",
  "projects.view",
  "workflow.view", "workflow.edit",
  "site.view", "site.edit",
  "documents.view",
  "attendance.view",
  "expenses.submit",
]);

export const ROLE_TEMPLATE_SUMMARIES: Array<{
  role: WorkspaceRole;
  label: string;
  subtitle: string;
  summary: string;
}> = [
  { role: "admin", label: "Admin", subtitle: "Full system authority", summary: "All modules, finance history, access control, critical corrections and destructive actions." },
  { role: "manager", label: "Management", subtitle: "Operational management", summary: "Runs projects, workflow, proposals, billing, municipality expenses, documents and reports; financial history and permissions remain protected." },
  { role: "employee", label: "Employees", subtitle: "Assigned-resource access", summary: "Assigned projects and tasks, own attendance/expenses, documents and Site Visits. No company-wide finance or user administration." },
  { role: "client", label: "Clients", subtitle: "Own-project portal", summary: "Client portal only, limited to the client’s linked project records and approved project information." },
];

export function normalizeWorkspaceRole(value: unknown): WorkspaceRole | "" {
  const role = String(value ?? "").trim().toLowerCase();
  if (role === "admin" || role === "manager" || role === "employee" || role === "client") return role;
  return "";
}

export function roleDefaultPermissions(roleValue: unknown) {
  const role = normalizeWorkspaceRole(roleValue);
  const permissions: Record<string, boolean> = {};
  for (const item of PERMISSION_DEFINITIONS) {
    permissions[item.key] = role === "admin"
      ? true
      : role === "manager"
        ? MANAGER_DEFAULTS.has(item.key)
        : role === "employee"
          ? EMPLOYEE_DEFAULTS.has(item.key)
          : false;
  }
  return permissions;
}

export function isAdminOnlyPermission(permission: string) {
  return PERMISSION_DEFINITIONS.some((item) => item.key === permission && item.adminOnly === true);
}

export function canRoleOverridePermission(roleValue: unknown, permission: string) {
  const role = normalizeWorkspaceRole(roleValue);
  if (role === "admin") return false;
  if (role === "client") return false;
  if (isAdminOnlyPermission(permission)) return false;
  return role === "manager" || role === "employee";
}

export function mergeRolePermissions(roleValue: unknown, overrides: Record<string, boolean>) {
  const role = normalizeWorkspaceRole(roleValue);
  const permissions = roleDefaultPermissions(role);
  if (role === "admin") return permissions;
  for (const [key, enabled] of Object.entries(overrides || {})) {
    if (isAdminOnlyPermission(key) && enabled) continue;
    permissions[key] = Boolean(enabled);
  }
  return permissions;
}
