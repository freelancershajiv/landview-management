/* LAND VIEW authorization capabilities
   ------------------------------------------------------------
   Keep product permissions here instead of scattering role-name checks across
   pages, API routes and components. UI hiding is never an authorization
   boundary; server/API code should call hasCapability / require helpers.

   This file is the single role-authority source for the management workspace.
   lib/role-permissions.ts is now only a compatibility/presentation adapter for
   the older permission keys stored in Access Control.
*/

export type WorkspaceRole = "admin" | "manager" | "employee" | "client";

export type Capability =
  | "dashboard.view"
  | "systemHealth.view"
  | "projects.view"
  | "projects.create"
  | "projects.edit"
  | "projects.delete"
  | "projectManagement.view"
  | "projectManagement.edit"
  | "estimates.view"
  | "estimates.edit"
  | "workflow.view"
  | "workflow.edit"
  | "workflow.assign"
  | "newSite.submit"
  | "newSite.approve"
  | "siteVisits.view"
  | "siteVisits.create"
  | "siteVisits.media.view"
  | "siteVisits.media.process"
  | "siteVisits.media.retry"
  | "documents.view"
  | "documents.manage"
  | "employees.view"
  | "employees.manage"
  | "employees.manageRole"
  | "attendance.view"
  | "attendance.edit"
  | "certificates.view"
  | "certificates.process"
  | "certificates.issue"
  | "proposals.view"
  | "proposals.create"
  | "proposals.edit"
  | "proposals.print"
  | "proposals.viewAll"
  | "proposals.convert"
  | "billing.view"
  | "billing.edit"
  | "accounts.view"
  | "accounts.createEntry"
  | "accounts.edit"
  | "accounts.reorder"
  | "accounts.delete"
  | "ledger.view"
  | "expenses.submit"
  | "expenses.viewAll"
  | "expenses.approve"
  | "municipalityAccounts.view"
  | "municipalityAccounts.expenseAdd"
  | "municipalityAccounts.edit"
  | "municipalityAccounts.transfer"
  | "website.view"
  | "website.edit"
  | "website.manage"
  | "analytics.view"
  | "reports.view"
  | "access.manage"
  | "security.manage"
  | "whatsapp.manage";

const ALL_CAPABILITIES: readonly Capability[] = [
  "dashboard.view",
  "systemHealth.view",
  "projects.view",
  "projects.create",
  "projects.edit",
  "projects.delete",
  "projectManagement.view",
  "projectManagement.edit",
  "estimates.view",
  "estimates.edit",
  "workflow.view",
  "workflow.edit",
  "workflow.assign",
  "newSite.submit",
  "newSite.approve",
  "siteVisits.view",
  "siteVisits.create",
  "siteVisits.media.view",
  "siteVisits.media.process",
  "siteVisits.media.retry",
  "documents.view",
  "documents.manage",
  "employees.view",
  "employees.manage",
  "employees.manageRole",
  "attendance.view",
  "attendance.edit",
  "certificates.view",
  "certificates.process",
  "certificates.issue",
  "proposals.view",
  "proposals.create",
  "proposals.edit",
  "proposals.print",
  "proposals.viewAll",
  "proposals.convert",
  "billing.view",
  "billing.edit",
  "accounts.view",
  "accounts.createEntry",
  "accounts.edit",
  "accounts.reorder",
  "accounts.delete",
  "ledger.view",
  "expenses.submit",
  "expenses.viewAll",
  "expenses.approve",
  "municipalityAccounts.view",
  "municipalityAccounts.expenseAdd",
  "municipalityAccounts.edit",
  "municipalityAccounts.transfer",
  "website.view",
  "website.edit",
  "website.manage",
  "analytics.view",
  "reports.view",
  "access.manage",
  "security.manage",
  "whatsapp.manage",
];

const ROLE_CAPABILITIES: Record<WorkspaceRole, ReadonlySet<Capability>> = {
  admin: new Set(ALL_CAPABILITIES),

  // Management runs normal office operations. Deliberately excluded:
  // destructive/historical accounting changes, Main Accounts entry,
  // Municipality history edits/transfers, employee/role administration,
  // certificate issuance, Access/Security/WhatsApp settings and website curation.
  manager: new Set<Capability>([
    "dashboard.view",
    "systemHealth.view",
    "projects.view",
    "projects.create",
    "projects.edit",
    "projectManagement.view",
    "projectManagement.edit",
    "estimates.view",
    "estimates.edit",
    "workflow.view",
    "workflow.edit",
    "workflow.assign",
    "newSite.submit",
    "newSite.approve",
    "siteVisits.view",
    "siteVisits.create",
    "siteVisits.media.view",
    "documents.view",
    "documents.manage",
    "employees.view",
    "attendance.view",
    "attendance.edit",
    "certificates.view",
    "certificates.process",
    "proposals.view",
    "proposals.create",
    "proposals.edit",
    "proposals.print",
    "proposals.viewAll",
    "proposals.convert",
    "billing.view",
    "billing.edit",
    "accounts.view",
    "ledger.view",
    "expenses.viewAll",
    "expenses.approve",
    "municipalityAccounts.view",
    "municipalityAccounts.expenseAdd",
    "website.view",
    "website.edit",
    "analytics.view",
    "reports.view",
  ]),

  // Employees can progress their assigned operational work, record site visits,
  // view project documents, submit own expenses and use attendance.
  employee: new Set<Capability>([
    "dashboard.view",
    "projects.view",
    "workflow.view",
    "workflow.edit",
    "newSite.submit",
    "siteVisits.view",
    "siteVisits.create",
    "documents.view",
    "attendance.view",
    "expenses.submit",
  ]),

  // Client capabilities are used by client-facing server/API guards. The admin
  // Access Control compatibility adapter intentionally exposes none of these.
  client: new Set<Capability>([
    "dashboard.view",
    "projects.view",
    "workflow.view",
    "siteVisits.view",
    "documents.view",
    "certificates.view",
    "proposals.view",
    "billing.view",
  ]),
};

/**
 * Compatibility map for permission names already stored by Access Control and
 * used by the management navigation. Defaults for those keys are derived from
 * the canonical capability table above so role policy cannot drift again.
 */
export const LEGACY_PERMISSION_CAPABILITY_MAP = {
  "dashboard.view": "dashboard.view",
  "projects.view": "projects.view",
  "projects.edit": "projects.edit",
  "projects.delete": "projects.delete",
  "project_management.view": "projectManagement.view",
  "project_management.edit": "projectManagement.edit",
  "estimates.view": "estimates.view",
  "estimates.edit": "estimates.edit",
  "workflow.view": "workflow.view",
  "workflow.edit": "workflow.edit",
  "workflow.assign": "workflow.assign",
  "site.view": "siteVisits.view",
  "site.edit": "siteVisits.create",
  "documents.view": "documents.view",
  "documents.edit": "documents.manage",
  "proposals.view": "proposals.view",
  "proposals.create": "proposals.create",
  "proposals.edit": "proposals.edit",
  "proposals.print": "proposals.print",
  "proposals.view_all": "proposals.viewAll",
  "proposals.convert": "proposals.convert",
  "certificates.view": "certificates.view",
  "certificates.process": "certificates.process",
  "certificates.issue": "certificates.issue",
  "finance.view": "billing.view",
  "finance.edit": "billing.edit",
  "municipality.view": "municipalityAccounts.view",
  "municipality.expense_add": "municipalityAccounts.expenseAdd",
  "municipality.edit": "municipalityAccounts.edit",
  "municipality.send_main": "municipalityAccounts.transfer",
  "accounts.view": "accounts.view",
  "accounts.edit": "accounts.createEntry",
  "ledger.view": "ledger.view",
  "ledger.edit": "accounts.edit",
  "ledger.reorder": "accounts.reorder",
  "ledger.delete": "accounts.delete",
  "expenses.submit": "expenses.submit",
  "expenses.view_all": "expenses.viewAll",
  "expenses.approve": "expenses.approve",
  "employees.view": "employees.view",
  "employees.manage": "employees.manage",
  "attendance.view": "attendance.view",
  "attendance.edit": "attendance.edit",
  "public.view": "website.view",
  "public.edit": "website.edit",
  "analytics.view": "analytics.view",
  "reports.view": "reports.view",
  "access.manage": "access.manage",
} as const satisfies Record<string, Capability>;

export function normalizeWorkspaceRole(value: unknown): WorkspaceRole | null {
  const role = String(value ?? "").trim().toLowerCase();
  return role === "admin" || role === "manager" || role === "employee" || role === "client"
    ? role
    : null;
}

export function roleOfPermissionUser(user: Record<string, unknown> | null | undefined): WorkspaceRole | null {
  return normalizeWorkspaceRole(user?.role ?? user?.Role);
}

export function capabilitiesForRole(roleValue: unknown): readonly Capability[] {
  const role = normalizeWorkspaceRole(roleValue);
  return role ? Array.from(ROLE_CAPABILITIES[role]) : [];
}

export function hasCapability(roleOrUser: unknown, capability: Capability): boolean {
  const role = typeof roleOrUser === "string"
    ? normalizeWorkspaceRole(roleOrUser)
    : roleOfPermissionUser((roleOrUser && typeof roleOrUser === "object" ? roleOrUser : null) as Record<string, unknown> | null);
  return Boolean(role && ROLE_CAPABILITIES[role].has(capability));
}

export function hasEveryCapability(roleOrUser: unknown, capabilities: readonly Capability[]): boolean {
  return capabilities.every((capability) => hasCapability(roleOrUser, capability));
}

export function hasAnyCapability(roleOrUser: unknown, capabilities: readonly Capability[]): boolean {
  return capabilities.some((capability) => hasCapability(roleOrUser, capability));
}

export function capabilityForLegacyPermission(permission: string): Capability | null {
  return (LEGACY_PERMISSION_CAPABILITY_MAP as Record<string, Capability>)[String(permission || "").trim()] || null;
}

export function hasLegacyPermission(roleOrUser: unknown, permission: string): boolean {
  const capability = capabilityForLegacyPermission(permission);
  return capability ? hasCapability(roleOrUser, capability) : false;
}
