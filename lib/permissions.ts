/* LAND VIEW authorization capabilities
   ------------------------------------------------------------
   This file is the canonical authorization policy for the product.

   Important migration rule:
   - New code must use Capability keys from this file.
   - Legacy workspace keys are translated through LEGACY_PERMISSION_TARGETS.
   - UI visibility is never an authorization boundary; server/API code must
     enforce the same capability before performing a protected action.
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
  | "expenses.submitOwn"
  | "expenses.viewAll"
  | "expenses.approve"
  | "municipalityAccounts.view"
  | "municipalityAccounts.createExpense"
  | "municipalityAccounts.edit"
  | "municipalityAccounts.transfer"
  | "analytics.view"
  | "reports.view"
  | "website.view"
  | "website.manage"
  | "access.manage"
  | "security.manage"
  | "whatsapp.manage";

export type PermissionDefinition = {
  key: Capability;
  label: string;
  group: string;
  description?: string;
  adminOnly?: boolean;
};

export const PERMISSION_DEFINITIONS: readonly PermissionDefinition[] = [
  { key: "dashboard.view", label: "Dashboard · View", group: "Workspace" },
  { key: "systemHealth.view", label: "System Health · View", group: "Workspace" },
  { key: "projects.view", label: "Projects · View", group: "Projects" },
  { key: "projects.create", label: "Projects · Create", group: "Projects" },
  { key: "projects.edit", label: "Projects · Edit", group: "Projects" },
  { key: "projects.delete", label: "Projects · Delete", group: "Projects", adminOnly: true },
  { key: "projectManagement.view", label: "Project Management · View", group: "Projects" },
  { key: "projectManagement.edit", label: "Project Management · Edit", group: "Projects" },
  { key: "estimates.view", label: "Estimates · View", group: "Projects" },
  { key: "estimates.edit", label: "Estimates · Create / Edit", group: "Projects" },
  { key: "workflow.view", label: "Workflow · View", group: "Workflow" },
  { key: "workflow.edit", label: "Workflow · Edit / Progress", group: "Workflow" },
  { key: "workflow.assign", label: "Workflow · Assign Team", group: "Workflow" },
  { key: "newSite.submit", label: "New Site · Submit", group: "Workflow" },
  { key: "newSite.approve", label: "New Site · Approve", group: "Workflow" },
  { key: "siteVisits.view", label: "Site Visits · View", group: "Project records" },
  { key: "siteVisits.create", label: "Site Visits · Add / Edit", group: "Project records" },
  { key: "siteVisits.media.view", label: "Site Visit Media · View", group: "Project records" },
  { key: "siteVisits.media.process", label: "Site Visit Media · Process", group: "Project records", adminOnly: true },
  { key: "siteVisits.media.retry", label: "Site Visit Media · Retry", group: "Project records", adminOnly: true },
  { key: "documents.view", label: "Documents · View", group: "Project records" },
  { key: "documents.manage", label: "Documents · Upload / Edit", group: "Project records" },
  { key: "proposals.view", label: "Proposals · View", group: "Proposals" },
  { key: "proposals.create", label: "Proposals · Create", group: "Proposals" },
  { key: "proposals.edit", label: "Proposals · Edit", group: "Proposals" },
  { key: "proposals.print", label: "Proposals · Print / PDF", group: "Proposals" },
  { key: "proposals.viewAll", label: "Proposals · View All Staff", group: "Proposals" },
  { key: "proposals.convert", label: "Proposals · Convert to Project", group: "Proposals" },
  { key: "certificates.view", label: "Certificates · View", group: "Certificates" },
  { key: "certificates.process", label: "Certificates · Process / Edit", group: "Certificates" },
  { key: "certificates.issue", label: "Certificates · Issue", group: "Certificates", adminOnly: true },
  { key: "billing.view", label: "Billing · View", group: "Finance" },
  { key: "billing.edit", label: "Billing · Create / Edit", group: "Finance" },
  { key: "municipalityAccounts.view", label: "Municipality Accounts · View", group: "Finance" },
  { key: "municipalityAccounts.createExpense", label: "Municipality · Add Expense", group: "Finance" },
  { key: "municipalityAccounts.edit", label: "Municipality · Edit History", group: "Finance", adminOnly: true },
  { key: "municipalityAccounts.transfer", label: "Municipality · Send to Main Ledger", group: "Finance", adminOnly: true },
  { key: "accounts.view", label: "Accounts / Ledger · View", group: "Accounts" },
  { key: "accounts.createEntry", label: "Main Accounts · Create Entries", group: "Accounts", adminOnly: true },
  { key: "accounts.edit", label: "Ledger · Edit History", group: "Accounts", adminOnly: true },
  { key: "accounts.reorder", label: "Ledger · Reorder Entries", group: "Accounts", adminOnly: true },
  { key: "accounts.delete", label: "Ledger · Delete / Void", group: "Accounts", adminOnly: true },
  { key: "expenses.submitOwn", label: "Expenses · Submit Own", group: "Accounts" },
  { key: "expenses.viewAll", label: "Expenses · View All", group: "Accounts" },
  { key: "expenses.approve", label: "Expenses · Review / Approve", group: "Accounts" },
  { key: "employees.view", label: "Employees · View", group: "People" },
  { key: "employees.manage", label: "Employees · Create / Edit / Delete", group: "People", adminOnly: true },
  { key: "employees.manageRole", label: "Employees · Manage Role", group: "People", adminOnly: true },
  { key: "attendance.view", label: "Attendance · View", group: "People" },
  { key: "attendance.edit", label: "Attendance · Edit", group: "People" },
  { key: "website.view", label: "Public Website · View", group: "Website" },
  { key: "website.manage", label: "Public Website · Edit", group: "Website" },
  { key: "analytics.view", label: "Website Analytics · View", group: "Website" },
  { key: "reports.view", label: "Reports · View / Export", group: "Reports" },
  { key: "access.manage", label: "Access Control · Manage", group: "Administration", adminOnly: true },
  { key: "security.manage", label: "Security · Manage", group: "Administration", adminOnly: true },
  { key: "whatsapp.manage", label: "WhatsApp · Manage", group: "Administration" },
] as const;

export const PERMISSION_GROUP_ORDER = ["Workspace","Projects","Workflow","Project records","Proposals","Certificates","Finance","Accounts","People","Website","Reports","Administration"] as const;

const ALL_CAPABILITIES = PERMISSION_DEFINITIONS.map((item) => item.key);
const CAPABILITY_SET = new Set<Capability>(ALL_CAPABILITIES);
const ADMIN_ONLY_CAPABILITIES = new Set<Capability>(PERMISSION_DEFINITIONS.filter((item) => item.adminOnly).map((item) => item.key));

const ROLE_CAPABILITIES: Record<WorkspaceRole, ReadonlySet<Capability>> = {
  admin: new Set(ALL_CAPABILITIES),
  manager: new Set<Capability>([
    "dashboard.view","systemHealth.view","projects.view","projects.create","projects.edit","projectManagement.view","projectManagement.edit","estimates.view","estimates.edit","workflow.view","workflow.edit","workflow.assign","newSite.submit","newSite.approve","siteVisits.view","siteVisits.create","siteVisits.media.view","documents.view","documents.manage","employees.view","attendance.view","attendance.edit","certificates.view","certificates.process","proposals.view","proposals.create","proposals.edit","proposals.print","proposals.viewAll","proposals.convert","billing.view","billing.edit","accounts.view","expenses.viewAll","expenses.approve","municipalityAccounts.view","municipalityAccounts.createExpense","analytics.view","reports.view","website.view","website.manage","whatsapp.manage"
  ]),
  employee: new Set<Capability>(["dashboard.view","projects.view","workflow.view","workflow.edit","newSite.submit","siteVisits.view","siteVisits.create","documents.view","attendance.view","expenses.submitOwn","certificates.view"]),
  client: new Set<Capability>(["dashboard.view","projects.view","workflow.view","siteVisits.view","documents.view","certificates.view","proposals.view","billing.view"]),
};

export const ROLE_TEMPLATE_SUMMARIES: Array<{ role: WorkspaceRole; label: string; subtitle: string; summary: string }> = [
  { role: "admin", label: "Admin", subtitle: "Full system authority", summary: "All modules, finance history, access control, critical corrections and destructive actions." },
  { role: "manager", label: "Management", subtitle: "Operational management", summary: "Runs projects, workflow, proposals, billing, municipality expenses, documents and reports; financial history and permissions remain protected." },
  { role: "employee", label: "Employees", subtitle: "Assigned-resource access", summary: "Assigned projects and tasks, own attendance/expenses, documents and Site Visits. No company-wide finance or user administration." },
  { role: "client", label: "Clients", subtitle: "Own-project portal", summary: "Client portal only, limited to the client’s linked project records and approved project information." },
];

export const LEGACY_PERMISSION_TARGETS: Readonly<Record<string, readonly Capability[]>> = {
  "dashboard.view":["dashboard.view"],"projects.view":["projects.view"],"projects.edit":["projects.create","projects.edit"],"projects.delete":["projects.delete"],"project_management.view":["projectManagement.view"],"project_management.edit":["projectManagement.edit"],"estimates.view":["estimates.view"],"estimates.edit":["estimates.edit"],"workflow.view":["workflow.view"],"workflow.edit":["workflow.edit"],"workflow.assign":["workflow.assign"],"site.view":["siteVisits.view"],"site.edit":["siteVisits.create"],"documents.view":["documents.view"],"documents.edit":["documents.manage"],"proposals.view":["proposals.view"],"proposals.create":["proposals.create"],"proposals.edit":["proposals.edit"],"proposals.print":["proposals.print"],"proposals.view_all":["proposals.viewAll"],"proposals.convert":["proposals.convert"],"certificates.view":["certificates.view"],"certificates.process":["certificates.process"],"certificates.issue":["certificates.issue"],"finance.view":["billing.view"],"finance.edit":["billing.edit"],"municipality.view":["municipalityAccounts.view"],"municipality.expense_add":["municipalityAccounts.createExpense"],"municipality.edit":["municipalityAccounts.edit"],"municipality.send_main":["municipalityAccounts.transfer"],"accounts.view":["accounts.view"],"accounts.edit":["accounts.createEntry"],"ledger.view":["accounts.view"],"ledger.edit":["accounts.edit"],"ledger.reorder":["accounts.reorder"],"ledger.delete":["accounts.delete"],"expenses.submit":["expenses.submitOwn"],"expenses.view_all":["expenses.viewAll"],"expenses.approve":["expenses.approve"],"employees.view":["employees.view"],"employees.manage":["employees.manage"],"attendance.view":["attendance.view"],"attendance.edit":["attendance.edit"],"public.view":["website.view"],"public.edit":["website.manage"],"analytics.view":["analytics.view"],"reports.view":["reports.view"],"access.manage":["access.manage"]
};

export function normalizeWorkspaceRole(value: unknown): WorkspaceRole | null { const role = String(value ?? "").trim().toLowerCase(); return role === "admin" || role === "manager" || role === "employee" || role === "client" ? role : null; }
export function normalizeCapabilityKey(value: unknown): Capability | null { const key = String(value ?? "").trim() as Capability; return CAPABILITY_SET.has(key) ? key : null; }
export function legacyPermissionTargets(value: unknown): readonly Capability[] { return LEGACY_PERMISSION_TARGETS[String(value ?? "").trim()] || []; }
export function roleOfPermissionUser(user: Record<string, unknown> | null | undefined): WorkspaceRole | null { return normalizeWorkspaceRole(user?.role ?? user?.Role); }
export function capabilitiesForRole(roleValue: unknown): readonly Capability[] { const role = normalizeWorkspaceRole(roleValue); return role ? Array.from(ROLE_CAPABILITIES[role]) : []; }
export function roleDefaultPermissionMap(roleValue: unknown): Record<string, boolean> { const role = normalizeWorkspaceRole(roleValue); const defaults = new Set(role ? capabilitiesForRole(role) : []); return Object.fromEntries(ALL_CAPABILITIES.map((capability) => [capability, defaults.has(capability)])); }
export function isAdminOnlyCapability(value: unknown): boolean { const capability = normalizeCapabilityKey(value); return Boolean(capability && ADMIN_ONLY_CAPABILITIES.has(capability)); }
export function canRoleOverrideCapability(roleValue: unknown, value: unknown): boolean { const role = normalizeWorkspaceRole(roleValue); const capability = normalizeCapabilityKey(value); if (!role || !capability || role === "admin" || role === "client") return false; if (isAdminOnlyCapability(capability)) return false; return role === "manager" || role === "employee"; }
export function translateLegacyPermissionOverrides(overrides: Record<string, boolean>): Record<string, boolean> { const translated: Record<string, boolean> = {}; for (const [legacyKey, enabledValue] of Object.entries(overrides || {})) { const enabled = Boolean(enabledValue); const targets = legacyPermissionTargets(legacyKey); if (!targets.length) { const canonical = normalizeCapabilityKey(legacyKey); if (canonical) translated[canonical] = translated[canonical] === false ? false : enabled; continue; } for (const capability of targets) translated[capability] = translated[capability] === false ? false : enabled; } return translated; }
export function mergePermissionOverrides(roleValue: unknown, overrides: Record<string, boolean>): Record<string, boolean> { const role = normalizeWorkspaceRole(roleValue); const permissions = roleDefaultPermissionMap(role); if (!role || role === "admin") return permissions; for (const [rawKey, enabledValue] of Object.entries(overrides || {})) { const capability = normalizeCapabilityKey(rawKey); if (!capability) continue; const enabled = Boolean(enabledValue); if (enabled && isAdminOnlyCapability(capability)) continue; permissions[capability] = enabled; } return permissions; }
export function hasCapability(roleOrUser: unknown, capability: Capability): boolean { const role = typeof roleOrUser === "string" ? normalizeWorkspaceRole(roleOrUser) : roleOfPermissionUser((roleOrUser && typeof roleOrUser === "object" ? roleOrUser : null) as Record<string, unknown> | null); return Boolean(role && ROLE_CAPABILITIES[role].has(capability)); }
export function hasEveryCapability(roleOrUser: unknown, capabilities: readonly Capability[]): boolean { return capabilities.every((capability) => hasCapability(roleOrUser, capability)); }
export function hasAnyCapability(roleOrUser: unknown, capabilities: readonly Capability[]): boolean { return capabilities.some((capability) => hasCapability(roleOrUser, capability)); }
