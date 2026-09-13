type RawResponse<T = unknown> = {
  success?: boolean;
  error?: string;
  message?: string;
  data?: T;
  [key: string]: unknown;
};

const API_URL = "/api/landview";
const API_TIMEOUT_MS = 60000;
const API_MAX_CONCURRENCY = 4;
const API_RETRY_DELAYS_MS = [300, 900];
const LEGACY_TOKEN_KEYS = ["land_view_session_token", "land_view_token", "landview_token"];
const SESSION_CACHE_KEY = "land_view_session_cache_v1";
const SESSION_CACHE_TTL_MS = 5 * 60 * 1000;

let activeApiRequests = 0;
const apiRequestWaiters: Array<() => void> = [];

async function acquireApiSlot() {
  if (activeApiRequests < API_MAX_CONCURRENCY) {
    activeApiRequests += 1;
    return;
  }
  await new Promise<void>((resolve) => apiRequestWaiters.push(resolve));
  activeApiRequests += 1;
}

function releaseApiSlot() {
  activeApiRequests = Math.max(0, activeApiRequests - 1);
  const next = apiRequestWaiters.shift();
  if (next) next();
}

function wait(ms: number) {
  return new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms));
}

export type SessionUser = {
  userId?: string; username?: string; name?: string; role?: string;
  User_ID?: string; Username?: string; Name?: string; Role?: string;
  employeeId?: string; projectIds?: string; Employee_ID?: string; Project_IDs?: string;
};
export type SessionData = { authenticated: boolean; user: SessionUser };

export function saveSessionCache(session: SessionData | { authenticated?: boolean; user?: SessionUser }) {
  if (typeof window === "undefined" || !session?.authenticated || !session.user) return;
  try {
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify({ session, savedAt: Date.now() }));
  } catch {}
}

export function readSessionCache(): SessionData | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { session?: SessionData; savedAt?: number };
    if (!parsed?.session?.authenticated || !parsed.session.user || !parsed.savedAt) return null;
    if (Date.now() - parsed.savedAt > SESSION_CACHE_TTL_MS) {
      localStorage.removeItem(SESSION_CACHE_KEY);
      return null;
    }
    return parsed.session;
  } catch {
    try { localStorage.removeItem(SESSION_CACHE_KEY); } catch {}
    return null;
  }
}

export function clearStoredSession() {
  if (typeof window === "undefined") return;
  for (const key of LEGACY_TOKEN_KEYS) localStorage.removeItem(key);
  localStorage.removeItem(SESSION_CACHE_KEY);
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let json: RawResponse<T>;
  try {
    json = JSON.parse(text) as RawResponse<T>;
  } catch {
    const looksLikeHtml = /^\s*</.test(text);
    throw new Error(
      looksLikeHtml
        ? "The backend returned HTML instead of JSON. Check the LAND VIEW server configuration."
        : "The server returned an invalid response."
    );
  }
  if (!response.ok || !json.success) {
    throw new Error(String(json.error || json.message || `HTTP ${response.status}`));
  }
  return (json.data ?? (json as unknown)) as T;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}) {
  await acquireApiSlot();
  try {
    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController();
      const timer = globalThis.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
      try {
        const response = await fetch(input, { ...init, signal: controller.signal, credentials: "same-origin" });
        const retryable = response.status === 502 || response.status === 503 || response.status === 504;
        if (retryable && attempt < API_RETRY_DELAYS_MS.length) {
          globalThis.clearTimeout(timer);
          await wait(API_RETRY_DELAYS_MS[attempt]);
          continue;
        }
        return response;
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") {
          if (attempt < API_RETRY_DELAYS_MS.length) {
            await wait(API_RETRY_DELAYS_MS[attempt]);
            continue;
          }
          throw new Error("LAND VIEW server did not respond in time.");
        }
        if (attempt < API_RETRY_DELAYS_MS.length) {
          await wait(API_RETRY_DELAYS_MS[attempt]);
          continue;
        }
        throw error;
      } finally {
        globalThis.clearTimeout(timer);
      }
    }
  } finally {
    releaseApiSlot();
  }
}

async function get<T>(action: string, params: Record<string, unknown> = {}) {
  if (typeof window === "undefined") throw new Error("LAND VIEW API requests must be made from the browser.");
  const url = new URL(API_URL, window.location.origin);
  url.searchParams.set("action", action);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const response = await fetchWithTimeout(url.toString(), { method: "GET", cache: "no-store" });
  return parseResponse<T>(response);
}

async function post<T>(action: string, body: Record<string, unknown> = {}) {
  const response = await fetchWithTimeout(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ action, ...body }),
  });
  return parseResponse<T>(response);
}

export type LoginAccountResult = {
  created?: boolean;
  userId?: string;
  username?: string;
  temporaryPassword?: string;
  projectIds?: string;
};
export type ProjectRecord = Record<string, unknown> & { Project_ID?: string; clientAccount?: LoginAccountResult };
export type EmployeeRecord = Record<string, unknown> & { Employee_ID?: string; account?: LoginAccountResult };
export type InvoiceCreateResult = {
  invoiceId: string; projectId: string; projectName?: string; clientName?: string;
  totalBill?: number; totalPaid?: number; due?: number; fileId?: string;
  pdfUrl?: string; downloadUrl?: string; folderUrl?: string;
  invoice?: Record<string, unknown> & { Invoice_ID?: string };
};
export type ProjectServiceFolderInfo = { name: string; id: string; url: string };
export type ProjectServiceFoldersResult = {
  projectId: string;
  found?: boolean;
  category?: "Running" | "Paused" | "Completed" | string;
  projectFolderId: string;
  projectFolderName?: string;
  projectFolderUrl: string;
  folders: ProjectServiceFolderInfo[];
};
export type ProjectDriveIndexResult = {
  bulk: true;
  projects: Record<string, ProjectServiceFoldersResult>;
};
export type ProjectServiceUploadResult = {
  projectId: string;
  folderName: string;
  folderId: string;
  folderUrl: string;
  fileId: string;
  fileName: string;
  fileUrl: string;
  size: number;
};

export type DashboardData = {
  user: SessionUser;
  stats: { projectCount: number; activeProjectCount: number; employeeCount: number; documentCount: number; totalBill: number; totalPaid: number; pendingPayments: number };
  recentProjects: Record<string, unknown>[];
};
export type BillingDashboardData = { projectCount: number; billCount: number; paymentCount: number; totalBill: number; totalPaid: number; pending: number };
export type ProjectBillingData = { projectId: string; bills: Record<string, unknown>[]; payments: Record<string, unknown>[]; totalBill: number; totalPaid: number; due: number };
export type BillingBookData = {
  totals: { gross: number; discount: number; billed: number; paid: number; due: number };
  categories: Array<{ category: string; gross: number; discount: number; billed: number; paid: number; due: number }>;
  projects: Array<{ projectId: string; projectName: string; clientName: string; gross: number; discount: number; billed: number; paid: number; due: number; categories: Record<string, { gross: number; discount: number; billed: number; paid: number; due: number }> }>;
  billCount: number;
  paymentCount: number;
};
export type ErpModule = "clients" | "tasks" | "attendance" | "leave" | "expenses" | "quotations" | "drawings" | "approvals";

export type FinanceSheetData = {tab: string; tabs: string[]; headers: string[]; rows: string[][]; totals: {gross:number; discount:number; billed:number; paid:number; due:number; projects:number}; url:string; updatedAt:string};

function financeRowsToRecords(data: FinanceSheetData): Record<string, unknown>[] {
  return (data.rows || []).map(row => {
    const record: Record<string, unknown> = {};
    (data.headers || []).forEach((header, index) => {
      const key = String(header || "").trim();
      if (key) record[key] = row[index] ?? "";
    });
    return record;
  });
}

const BILLING_WORKFLOW_SERVICES = [
  { title: "Architectural Design", category: "Engineering", aliases: ["architectural design", "architectural", "architect design", "architecture design"] },
  { title: "Structural Design", category: "Engineering", aliases: ["structural design", "structural"] },
  { title: "3D Design Exterior", category: "Engineering", aliases: ["3d design exterior", "3d design - exterior", "3d exterior", "exterior 3d", "3d design"] },
  { title: "Electrical Design", category: "Engineering", aliases: ["electrical design", "electrical"] },
  { title: "Plumbing Design", category: "Engineering", aliases: ["plumbing design", "plumbing"] },
  { title: "Estimate & Costing", category: "Engineering", aliases: ["estimate & costing", "estimate and costing", "estimate costing", "cost estimate", "estimation and costing", "estimation & costing"] },
  { title: "Plan Approval Design", category: "Engineering", aliases: ["plan approval design", "plan approval", "approval design", "municipality design"] },
  { title: "Soil Test", category: "Others", aliases: ["soil test", "soil testing", "soil investigation", "soil test bill"] },
  { title: "Digital Survey", category: "Others", aliases: ["digital survey", "measurement / digital survey", "measurement digital survey", "land survey", "survey"] },
  { title: "Municipality File Pass", category: "Others", aliases: ["municipality file pass", "municipality pass", "municipality contract", "file pass", "municipality file", "plan pass", "municipality approval"] },
  { title: "Site Supervision", category: "Supervision", aliases: ["site supervision", "supervision", "supervision bill"] },
] as const;

function normalizeWorkflowText(value: unknown) {
  return String(value || "").trim().toLowerCase().replace(/[–—_-]+/g, " ").replace(/&/g, " and ").replace(/\s+/g, " ");
}

function normalizeWorkflowProjectId(value: unknown) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  return digits ? `LV-${Number(digits)}` : raw;
}

function canonicalBillingService(value: unknown, category?: "Engineering" | "Others" | "Supervision") {
  const text = normalizeWorkflowText(value);
  if (!text) return "";
  for (const service of BILLING_WORKFLOW_SERVICES) {
    if (category && service.category !== category) continue;
    for (const candidate of [service.title, ...service.aliases]) {
      const alias = normalizeWorkflowText(candidate);
      if (text === alias || text.includes(alias) || alias.includes(text)) return service.title;
    }
  }
  return "";
}

function recordValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && String(record[key]).trim() !== "") return record[key];
  }
  return "";
}

function billingRequirementMap(data: FinanceSheetData, category: "Engineering" | "Others" | "Supervision") {
  const map = new Map<string, Set<string>>();
  for (const record of financeRowsToRecords(data)) {
    const projectId = normalizeWorkflowProjectId(recordValue(record, ["FILE ID", "File ID", "File_ID", "Project_ID", "Project ID"]));
    if (!projectId) continue;
    const rawService = recordValue(record, ["Service Name", "Services", "Service", "Description", "Item"]);
    if (!rawService) continue;
    const service = category === "Supervision" ? "Site Supervision" : canonicalBillingService(rawService, category);
    if (!service) continue;
    if (!map.has(projectId)) map.set(projectId, new Set());
    map.get(projectId)!.add(service);
  }
  return map;
}

function mergeRequirements(target: Map<string, Set<string>>, source: Map<string, Set<string>>) {
  for (const [projectId, services] of source) {
    if (!target.has(projectId)) target.set(projectId, new Set());
    const bucket = target.get(projectId)!;
    for (const service of services) bucket.add(service);
  }
}

function makeAutoTaskId(projectId: string, title: string) {
  return `AUTO::${encodeURIComponent(projectId)}::${encodeURIComponent(title)}`;
}

function parseAutoTaskId(id: string) {
  if (!id.startsWith("AUTO::")) return null;
  const parts = id.split("::");
  if (parts.length !== 3) return null;
  try {
    return { projectId: decodeURIComponent(parts[1]), title: decodeURIComponent(parts[2]) };
  } catch {
    return null;
  }
}

async function getBillingDrivenWorkflowTasks() {
  const [workflow, designBill, othersBill, supervisionBill] = await Promise.all([
    get<FinanceSheetData>("getFinanceSheet", { tab: "Workflow" }),
    get<FinanceSheetData>("getFinanceSheet", { tab: "Design Bill" }),
    get<FinanceSheetData>("getFinanceSheet", { tab: "Others Bill" }),
    get<FinanceSheetData>("getFinanceSheet", { tab: "Supervision Bill" }),
  ]);

  const requirements = new Map<string, Set<string>>();
  mergeRequirements(requirements, billingRequirementMap(designBill, "Engineering"));
  mergeRequirements(requirements, billingRequirementMap(othersBill, "Others"));
  mergeRequirements(requirements, billingRequirementMap(supervisionBill, "Supervision"));

  const existing = financeRowsToRecords(workflow);
  const byKey = new Map<string, Record<string, unknown>>();
  for (const task of existing) {
    const projectId = normalizeWorkflowProjectId(recordValue(task, ["Project_ID", "Project ID", "FILE ID", "File ID"]));
    const rawTitle = recordValue(task, ["Task_Title", "Task Title", "Title"]);
    const canonical = canonicalBillingService(rawTitle);
    if (!projectId || !canonical) continue;
    const required = requirements.get(projectId);
    if (!required || !required.has(canonical)) continue;
    byKey.set(`${projectId}\n${canonical}`, { ...task, Project_ID: projectId, Task_Title: canonical });
  }

  const result: Record<string, unknown>[] = [];
  for (const [projectId, services] of requirements) {
    for (const title of services) {
      const key = `${projectId}\n${title}`;
      const saved = byKey.get(key);
      result.push(saved || {
        Task_ID: makeAutoTaskId(projectId, title),
        Project_ID: projectId,
        Project_Name: "",
        Task_Title: title,
        Assigned_Employee_ID: "",
        Priority: "Normal",
        Start_Date: "",
        Due_Date: "",
        Status: "Pending",
        Progress: 0,
        Description: "Auto-created from billing service",
        Completed_At: "",
      });
    }
  }
  return result;
}

export const landViewApi = {
  getFinanceSheet: (tab = "Summary") => get<FinanceSheetData>("getFinanceSheet", { tab }),

  health: () => get<unknown>("health"),
  login: (userId: string, password: string) => post<{ user: SessionUser }>("login", { userId, password }),
  logout: () => post<{ loggedOut: boolean }>("logout"),
  getSession: () => get<SessionData>("getSession"),
  getDashboard: () => get<DashboardData>("getDashboard"),
  getUsers: () => get<Record<string, unknown>[]>("getUsers"),
  createUser: (user: Record<string, unknown>) => post<unknown>("createUser", { user }),
  resetUserPassword: (userId: string) => post<{ userId: string; username: string; temporaryPassword: string }>("resetUserPassword", { userId }),
  changeOwnPassword: (currentPassword: string, newPassword: string) => post<{ changed: boolean }>("changeOwnPassword", { currentPassword, newPassword }),
  getProjects: () => get<Record<string, unknown>[]>("getProjects"),
  getProject: (projectId: string) => get<Record<string, unknown>>("getProject", { projectId }),
  createProject: (project: Record<string, unknown>) => post<ProjectRecord>("createProject", project),
  updateProject: (projectId: string, project: Record<string, unknown>) => post<unknown>("updateProject", { projectId, ...project }),
  deleteProject: (projectId: string) => post<unknown>("deleteProject", { projectId }),
  getProjectEmployees: (projectId: string) => get<Record<string, unknown>[]>("getProjectEmployees", { projectId }),
  updateProjectEmployees: (projectId: string, employeeIds: string[]) => post<unknown>("updateProjectEmployees", { projectId, employeeIds }),
  getProjectDriveFolder: (projectId: string) => get<{ projectId: string; folderId: string; url: string }>("getProjectDriveFolder", { projectId }),
  getProjectServiceFolders: (projectId: string) => get<ProjectServiceFoldersResult>("getProjectServiceFolders", { projectId }),
  getProjectDriveIndex: () => get<ProjectDriveIndexResult>("getProjectServiceFolders", { bulk: 1 }),
  uploadProjectServiceFile: (projectId: string, folderName: string, file: { fileName: string; mimeType: string; base64: string }) =>
    post<ProjectServiceUploadResult>("uploadProjectServiceFile", { projectId, folderName, ...file }),
  getEmployees: () => get<Record<string, unknown>[]>("getEmployees"),
  createEmployee: (employee: Record<string, unknown>) => post<EmployeeRecord>("createEmployee", employee),
  updateEmployee: (employeeId: string, employee: Record<string, unknown>) => post<unknown>("updateEmployee", { employeeId, ...employee }),
  deleteEmployee: (employeeId: string) => post<unknown>("deleteEmployee", { employeeId }),
  getDocuments: (projectId?: string) => get<Record<string, unknown>[]>("getDocuments", projectId ? { projectId } : {}),
  createDocument: (document: Record<string, unknown>) => post<unknown>("createDocument", document),
  getSiteVisits: (projectId?: string) => get<Record<string, unknown>[]>("getSiteVisits", projectId ? { projectId } : {}),
  createSiteVisit: (visit: Record<string, unknown>) => post<unknown>("createSiteVisit", visit),
  getBillingDashboard: () => get<BillingDashboardData>("getBillingDashboard"),
  getBillingBook: () => get<BillingBookData>("getBillingBook"),
  getProjectBilling: (projectId: string) => get<ProjectBillingData>("getProjectBilling", { projectId }),
  getBillingRecords: (projectId: string, category?: string) => get<Record<string, unknown>[]>("getBillingRecords", { projectId, category }),
  saveBill: (bill: Record<string, unknown>) => post<unknown>("saveBill", bill),
  createBill: (bill: Record<string, unknown>) => post<unknown>("createBill", bill),
  getPayments: (projectId?: string) => get<Record<string, unknown>[]>("getPayments", projectId ? { projectId } : {}),
  savePayment: (payment: Record<string, unknown>) => post<unknown>("savePayment", payment),
  createPayment: (payment: Record<string, unknown>) => post<unknown>("createPayment", payment),
  importLegacyBillingBatch: (kind: "projects" | "bills" | "payments", records: Record<string, string | number>[]) =>
    post<{ kind: string; received: number; created: number; updated: number }>("importLegacyBillingBatch", { kind, records }),
  getInvoices: (projectId?: string) => get<Record<string, unknown>[]>("getInvoices", projectId ? { projectId } : {}),
  createInvoice: (projectId: string) => post<InvoiceCreateResult>("createInvoice", { projectId }),
  getPermissions: () => get<Record<string, unknown>[]>("getPermissions"),
  createPermission: (permission: Record<string, unknown>) => post<unknown>("createPermission", permission),
  initializeErpSheets: () => post<{ initialized: boolean; modules: string[] }>("initializeErpSheets"),

  getErpRecords: async (module: ErpModule) => {
    if (module === "tasks") {
      const session = readSessionCache();
      const role = String(session?.user?.role || session?.user?.Role || "").trim().toLowerCase();
      if (role === "employee") {
        return get<Record<string, unknown>[]>("getErpRecords", { module: "tasks" });
      }
      return getBillingDrivenWorkflowTasks();
    }
    return get<Record<string, unknown>[]>("getErpRecords", { module });
  },

  createErpRecord: (module: ErpModule, record: Record<string, unknown>) => {
    if (module === "tasks") {
      const session = readSessionCache();
      const role = String(session?.user?.role || session?.user?.Role || "").trim().toLowerCase();
      if (role === "employee") {
        return post<Record<string, unknown>>("createErpRecord", { module: "tasks", ...record });
      }
      return post<Record<string, unknown>>("getFinanceSheet", { tab: "Workflow", workflowOp: "create", ...record });
    }
    return post<unknown>("createErpRecord", { module, ...record });
  },

  updateErpRecord: (module: ErpModule, id: string, changes: Record<string, unknown>) => {
    if (module === "tasks") {
      const session = readSessionCache();
      const role = String(session?.user?.role || session?.user?.Role || "").trim().toLowerCase();
      if (role === "employee") {
        return post<Record<string, unknown>>("updateErpRecord", { module: "tasks", id, ...changes });
      }
      const auto = parseAutoTaskId(id);
      if (auto) {
        return post<Record<string, unknown>>("getFinanceSheet", {
          tab: "Workflow",
          workflowOp: "create",
          Project_ID: auto.projectId,
          Task_Title: auto.title,
          ...changes,
        });
      }
      return post<Record<string, unknown>>("getFinanceSheet", { tab: "Workflow", workflowOp: "update", id, ...changes });
    }
    return post<unknown>("updateErpRecord", { module, id, ...changes });
  },
};