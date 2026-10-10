/* LAND VIEW authorization capabilities
   ------------------------------------------------------------
   Keep product permissions here instead of scattering role-name checks across
   pages, API routes and components. UI hiding is never an authorization
   boundary; server/API code should call hasCapability / require helpers. */

export type WorkspaceRole = "admin" | "manager" | "accounts" | "employee" | "client";

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
  | "certificates.view"
  | "certificates.issue"
  | "proposals.view"
  | "proposals.edit"
  | "billing.view"
  | "billing.edit"
  | "accounts.view"
  | "accounts.createEntry"
  | "accounts.edit"
  | "accounts.reorder"
  | "accounts.delete"
  | "municipalityAccounts.view"
  | "municipalityAccounts.edit"
  | "municipalityAccounts.transfer"
  | "analytics.view"
  | "access.manage"
  | "security.manage"
  | "whatsapp.manage"
  | "website.manage";

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
  "certificates.view",
  "certificates.issue",
  "proposals.view",
  "proposals.edit",
  "billing.view",
  "billing.edit",
  "accounts.view",
  "accounts.createEntry",
  "accounts.edit",
  "accounts.reorder",
  "accounts.delete",
  "municipalityAccounts.view",
  "municipalityAccounts.edit",
  "municipalityAccounts.transfer",
  "analytics.view",
  "access.manage",
  "security.manage",
  "whatsapp.manage",
  "website.manage",
];

const ROLE_CAPABILITIES: Record<WorkspaceRole, ReadonlySet<Capability>> = {
  admin: new Set(ALL_CAPABILITIES),

  // Manager is an operational management role. Deliberately excluded:
  // destructive accounting actions, employee/role administration, certificate
  // issuance, access/security/WhatsApp settings and website curation.
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
    "newSite.submit",
    "newSite.approve",
    "siteVisits.view",
    "siteVisits.create",
    "siteVisits.media.view",
    "documents.view",
    "documents.manage",
    "employees.view",
    "certificates.view",
    "proposals.view",
    "proposals.edit",
    "billing.view",
    "billing.edit",
    "accounts.view",
    "municipalityAccounts.view",
    "municipalityAccounts.edit",
    "analytics.view",
  ]),

  // Legacy finance-focused role retained for compatibility while role
  // consolidation is completed. It is intentionally narrow.
  accounts: new Set<Capability>([
    "dashboard.view",
    "projects.view",
    "proposals.view",
    "billing.view",
    "billing.edit",
    "accounts.view",
    "accounts.createEntry",
    "accounts.edit",
    "municipalityAccounts.view",
    "municipalityAccounts.edit",
  ]),

  employee: new Set<Capability>([
    "dashboard.view",
    "projects.view",
    "workflow.view",
    "newSite.submit",
    "siteVisits.view",
    "siteVisits.create",
    "documents.view",
    "certificates.view",
  ]),

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

export function normalizeWorkspaceRole(value: unknown): WorkspaceRole | null {
  const role = String(value ?? "").trim().toLowerCase();
  return role === "admin" || role === "manager" || role === "accounts" || role === "employee" || role === "client"
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
