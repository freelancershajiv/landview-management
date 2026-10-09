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
  actingFromAdmin?: boolean; designation?: string; department?: string; phoneNumber?: string; email?: string;
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

function isGoogleMapsLocation(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host === "maps.app.goo.gl" || host === "goo.gl" || host.endsWith(".goo.gl") || host === "google.com" || host.endsWith(".google.com") || /(^|\.)google\.(?:co\.[a-z]{2}|com\.[a-z]{2}|[a-z]{2})$/i.test(host);
  } catch {
    return /(?:google\.[a-z.]+\/maps|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(raw);
  }
}

async function withResolvedProjectLocation(project: Record<string, unknown>) {
  const location = String(project.Location ?? project.location ?? "").trim();
  if (!isGoogleMapsLocation(location)) return project;
  try {
    const response = await fetchWithTimeout("/api/projects/resolve-location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ location }),
    });
    const data = await parseResponse<{ latitude: number; longitude: number }>(response);
    if (!Number.isFinite(Number(data.latitude)) || !Number.isFinite(Number(data.longitude))) return project;
    return { ...project, Site_Latitude: data.latitude, Site_Longitude: data.longitude };
  } catch {
    // Keep manual coordinates as a fallback if Google changes a redirect or a
    // temporary network error prevents automatic conversion.
    return project;
  }
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
export type FinanceSheetData = { tab: string; tabs: string[]; headers: string[]; rows: string[][]; totals: { gross: number; discount: number; billed: number; paid: number; due: number; projects: number }; url: string; updatedAt: string };

export const landViewApi = {
  // Compatibility only: retained for any older finance screen still expecting a tabular view.
  // The server implementation is Supabase-backed; Workflow and Tasks no longer use it.
  getFinanceSheet: (tab = "Summary") => get<FinanceSheetData>("getFinanceSheet", { tab }),

  health: () => get<unknown>("health"),
  login: (userId: string, password: string) => post<{ user: SessionUser }>("login", { userId, password }),
  logout: () => post<{ loggedOut: boolean }>("logout"),
  getSession: () => get<SessionData>("getSession"),
  getDashboard: () => get<DashboardData>("getDashboard"),
  getUsers: () => get<Record<string, unknown>[]>("getUsers"),
  createUser: (user: Record<string, unknown>) => post<unknown>("createUser", { user }),
  resetUserPassword: (userId: string) => post<{ userId: string; username: string; temporaryPassword: string }>("resetUserPassword", { userId }),
  deleteUser: (userId: string) => post<{ deleted: boolean; userId: string }>("deleteUser", { userId }),
  changeOwnPassword: (currentPassword: string, newPassword: string) => post<{ changed: boolean }>("changeOwnPassword", { currentPassword, newPassword }),
  getProjects: () => get<Record<string, unknown>[]>("getProjects"),
  getProject: (projectId: string) => get<Record<string, unknown>>("getProject", { projectId }),
  createProject: (project: Record<string, unknown>) => post<ProjectRecord>("createProject", project),
  updateProject: async (projectId: string, project: Record<string, unknown>) => {
    const resolvedProject = await withResolvedProjectLocation(project);
    return post<unknown>("updateProject", { projectId, ...resolvedProject });
  },
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

  // Supabase is the single source of truth for ERP records, including workflow tasks.
  getErpRecords: (module: ErpModule) => get<Record<string, unknown>[]>("getErpRecords", { module }),
  createErpRecord: (module: ErpModule, record: Record<string, unknown>) => post<Record<string, unknown>>("createErpRecord", { module, ...record }),
  updateErpRecord: (module: ErpModule, id: string, changes: Record<string, unknown>) => post<Record<string, unknown>>("updateErpRecord", { module, id, ...changes }),
};