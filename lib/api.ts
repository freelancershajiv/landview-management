type RawResponse<T = unknown> = {
  success?: boolean;
  error?: string;
  message?: string;
  data?: T;
  [key: string]: unknown;
};

const API_URL = "/api/landview";
const API_TIMEOUT_MS = 12000;
const LEGACY_TOKEN_KEYS = ["land_view_session_token", "land_view_token", "landview_token"];

/**
 * Session tokens are now stored only in an HttpOnly cookie by the Next.js API
 * proxy. This function only removes legacy browser tokens left by older builds.
 */
export function clearStoredSession() {
  if (typeof window === "undefined") return;
  for (const key of LEGACY_TOKEN_KEYS) localStorage.removeItem(key);
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
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal, credentials: "same-origin" });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("LAND VIEW server did not respond in time.");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
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

export type SessionUser = {
  userId?: string; username?: string; name?: string; role?: string;
  User_ID?: string; Username?: string; Name?: string; Role?: string;
  employeeId?: string; projectIds?: string; Employee_ID?: string; Project_IDs?: string;
};
export type SessionData = { authenticated: boolean; user: SessionUser };
export type DashboardData = {
  user: SessionUser;
  stats: { projectCount: number; activeProjectCount: number; employeeCount: number; documentCount: number; totalBill: number; totalPaid: number; pendingPayments: number };
  recentProjects: Record<string, unknown>[];
};
export type BillingDashboardData = { projectCount: number; billCount: number; paymentCount: number; totalBill: number; totalPaid: number; pending: number };
export type ProjectBillingData = { projectId: string; bills: Record<string, unknown>[]; payments: Record<string, unknown>[]; totalBill: number; totalPaid: number; due: number };

export const landViewApi = {
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
  getEmployees: () => get<Record<string, unknown>[]>("getEmployees"),
  createEmployee: (employee: Record<string, unknown>) => post<EmployeeRecord>("createEmployee", employee),
  updateEmployee: (employeeId: string, employee: Record<string, unknown>) => post<unknown>("updateEmployee", { employeeId, ...employee }),
  deleteEmployee: (employeeId: string) => post<unknown>("deleteEmployee", { employeeId }),
  getDocuments: (projectId?: string) => get<Record<string, unknown>[]>("getDocuments", projectId ? { projectId } : {}),
  createDocument: (document: Record<string, unknown>) => post<unknown>("createDocument", document),
  getSiteVisits: (projectId?: string) => get<Record<string, unknown>[]>("getSiteVisits", projectId ? { projectId } : {}),
  createSiteVisit: (visit: Record<string, unknown>) => post<unknown>("createSiteVisit", visit),
  getBillingDashboard: () => get<BillingDashboardData>("getBillingDashboard"),
  getProjectBilling: (projectId: string) => get<ProjectBillingData>("getProjectBilling", { projectId }),
  getBillingRecords: (projectId: string, category?: string) => get<Record<string, unknown>[]>("getBillingRecords", { projectId, category }),
  saveBill: (bill: Record<string, unknown>) => post<unknown>("saveBill", bill),
  createBill: (bill: Record<string, unknown>) => post<unknown>("createBill", bill),
  getPayments: (projectId?: string) => get<Record<string, unknown>[]>("getPayments", projectId ? { projectId } : {}),
  savePayment: (payment: Record<string, unknown>) => post<unknown>("savePayment", payment),
  createPayment: (payment: Record<string, unknown>) => post<unknown>("createPayment", payment),
  getInvoices: (projectId?: string) => get<Record<string, unknown>[]>("getInvoices", projectId ? { projectId } : {}),
  createInvoice: (projectId: string) => post<InvoiceCreateResult>("createInvoice", { projectId }),
  getPermissions: () => get<Record<string, unknown>[]>("getPermissions"),
  createPermission: (permission: Record<string, unknown>) => post<unknown>("createPermission", permission),
};
