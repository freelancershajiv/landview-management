export const TOKEN_KEY = "land_view_session_token";

type RawResponse<T = unknown> = {
  success?: boolean;
  error?: string;
  message?: string;
  data?: T;
  [key: string]: unknown;
};

const LEGACY_TOKEN_KEYS = ["land_view_token", "landview_token"];
const API_URL = "/api/landview";
const API_TIMEOUT_MS = 12000;

function requireApiUrl() {
  return API_URL;
}

export function clearStoredSession() {
  if (typeof window === "undefined") return;

  localStorage.removeItem(TOKEN_KEY);
  for (const key of LEGACY_TOKEN_KEYS) {
    localStorage.removeItem(key);
  }
}

export function getStoredToken() {
  if (typeof window === "undefined") return "";

  const current = localStorage.getItem(TOKEN_KEY);
  if (current) return current;

  // One-time compatibility with older LAND VIEW frontend builds.
  for (const key of LEGACY_TOKEN_KEYS) {
    const legacy = localStorage.getItem(key);
    if (legacy) {
      localStorage.setItem(TOKEN_KEY, legacy);
      localStorage.removeItem(key);
      return legacy;
    }
  }

  return "";
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
        ? "The backend returned HTML instead of JSON. Check that LAND_VIEW_API_URL points to the deployed Google Apps Script /exec URL."
        : "The server returned an invalid response."
    );
  }

  if (!response.ok) {
    throw new Error(
      String(json.error || json.message || `HTTP ${response.status}`)
    );
  }

  if (!json.success) {
    const message = String(json.error || json.message || "Request failed.");
    const normalized = message.toLowerCase();

    if (
      normalized.includes("unauthorized") ||
      normalized.includes("session expired")
    ) {
      clearStoredSession();
    }

    throw new Error(message);
  }

  // Code.gs normally returns successful payloads under `data`.
  // Direct payload responses are also tolerated for compatibility.
  return (json.data ?? (json as unknown)) as T;
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {}
) {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        "LAND VIEW server did not respond in time. Check the Apps Script /exec URL and deployment permissions."
      );
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

async function get<T>(
  action: string,
  params: Record<string, unknown> = {},
  withToken = true
) {
  if (typeof window === "undefined") {
    throw new Error("LAND VIEW API requests must be made from the browser.");
  }

  const url = new URL(requireApiUrl(), window.location.origin);
  url.searchParams.set("action", action);

  if (withToken) {
    const token = getStoredToken();
    if (token) url.searchParams.set("token", token);
  }

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetchWithTimeout(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  return parseResponse<T>(response);
}

async function post<T>(
  action: string,
  body: Record<string, unknown> = {},
  withToken = true
) {
  const token = withToken ? getStoredToken() : "";

  const response = await fetchWithTimeout(requireApiUrl(), {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({
      action,
      ...(token ? { token } : {}),
      ...body,
    }),
  });

  return parseResponse<T>(response);
}


export type ProjectRecord = Record<string, unknown> & {
  Project_ID?: string;
};

export type EmployeeRecord = Record<string, unknown> & {
  Employee_ID?: string;
};

export type InvoiceCreateResult = {
  invoiceId: string;
  projectId: string;
  projectName?: string;
  clientName?: string;
  totalBill?: number;
  totalPaid?: number;
  due?: number;
  fileId?: string;
  pdfUrl?: string;
  downloadUrl?: string;
  folderUrl?: string;
  invoice?: Record<string, unknown> & { Invoice_ID?: string };
};

export type SessionUser = {
  userId?: string;
  username?: string;
  name?: string;
  role?: string;
  User_ID?: string;
  Username?: string;
  Name?: string;
  Role?: string;
  employeeId?: string;
  projectIds?: string;
  Employee_ID?: string;
  Project_IDs?: string;
};

export type SessionData = {
  authenticated: boolean;
  user: SessionUser;
};

export type DashboardData = {
  user: SessionUser;
  stats: {
    projectCount: number;
    activeProjectCount: number;
    employeeCount: number;
    documentCount: number;
    totalBill: number;
    totalPaid: number;
    pendingPayments: number;
  };
  recentProjects: Record<string, unknown>[];
};

export type BillingDashboardData = {
  projectCount: number;
  billCount: number;
  paymentCount: number;
  totalBill: number;
  totalPaid: number;
  pending: number;
};

export type ProjectBillingData = {
  projectId: string;
  bills: Record<string, unknown>[];
  payments: Record<string, unknown>[];
  totalBill: number;
  totalPaid: number;
  due: number;
};

export const landViewApi = {
  health: () => get<unknown>("health", {}, false),

  login: (userId: string, password: string) =>
    post<{ token: string; user: SessionUser }>(
      "login",
      { userId, password },
      false
    ),

  logout: () => post<{ loggedOut: boolean }>("logout"),

  getSession: (token?: string) =>
    token
      ? get<SessionData>("getSession", { token }, false)
      : get<SessionData>("getSession"),

  getDashboard: () => get<DashboardData>("getDashboard"),

  getUsers: () => get<Record<string, unknown>[]>("getUsers"),
  createUser: (user: Record<string, unknown>) =>
    post<unknown>("createUser", { user }),
  resetUserPassword: (userId: string) =>
    post<{ userId: string; username: string; temporaryPassword: string }>(
      "resetUserPassword",
      { userId }
    ),
  changeOwnPassword: (currentPassword: string, newPassword: string) =>
    post<{ changed: boolean }>("changeOwnPassword", {
      currentPassword,
      newPassword,
    }),

  getProjects: () => get<Record<string, unknown>[]>("getProjects"),
  getProject: (projectId: string) =>
    get<Record<string, unknown>>("getProject", { projectId }),
  createProject: (project: Record<string, unknown>) =>
    post<ProjectRecord>("createProject", project),
  updateProject: (projectId: string, project: Record<string, unknown>) =>
    post<unknown>("updateProject", { projectId, ...project }),
  deleteProject: (projectId: string) =>
    post<unknown>("deleteProject", { projectId }),

  getProjectEmployees: (projectId: string) =>
    get<Record<string, unknown>[]>("getProjectEmployees", { projectId }),
  updateProjectEmployees: (projectId: string, employeeIds: string[]) =>
    post<unknown>("updateProjectEmployees", { projectId, employeeIds }),
  getProjectDriveFolder: (projectId: string) =>
    get<{ projectId: string; folderId: string; url: string }>(
      "getProjectDriveFolder",
      { projectId }
    ),

  getEmployees: () => get<Record<string, unknown>[]>("getEmployees"),
  createEmployee: (employee: Record<string, unknown>) =>
    post<EmployeeRecord>("createEmployee", employee),
  updateEmployee: (employeeId: string, employee: Record<string, unknown>) =>
    post<unknown>("updateEmployee", { employeeId, ...employee }),
  deleteEmployee: (employeeId: string) =>
    post<unknown>("deleteEmployee", { employeeId }),

  getDocuments: (projectId?: string) =>
    get<Record<string, unknown>[]>(
      "getDocuments",
      projectId ? { projectId } : {}
    ),
  createDocument: (document: Record<string, unknown>) =>
    post<unknown>("createDocument", document),

  getSiteVisits: (projectId?: string) =>
    get<Record<string, unknown>[]>(
      "getSiteVisits",
      projectId ? { projectId } : {}
    ),
  createSiteVisit: (visit: Record<string, unknown>) =>
    post<unknown>("createSiteVisit", visit),

  getBillingDashboard: () => get<BillingDashboardData>("getBillingDashboard"),
  getProjectBilling: (projectId: string) =>
    get<ProjectBillingData>("getProjectBilling", { projectId }),
  getBillingRecords: (projectId: string, category?: string) =>
    get<Record<string, unknown>[]>("getBillingRecords", {
      projectId,
      category,
    }),
  saveBill: (bill: Record<string, unknown>) => post<unknown>("saveBill", bill),
  createBill: (bill: Record<string, unknown>) =>
    post<unknown>("createBill", bill),

  getPayments: (projectId?: string) =>
    get<Record<string, unknown>[]>(
      "getPayments",
      projectId ? { projectId } : {}
    ),
  savePayment: (payment: Record<string, unknown>) =>
    post<unknown>("savePayment", payment),
  createPayment: (payment: Record<string, unknown>) =>
    post<unknown>("createPayment", payment),

  getInvoices: (projectId?: string) =>
    get<Record<string, unknown>[]>(
      "getInvoices",
      projectId ? { projectId } : {}
    ),
  createInvoice: (projectId: string) =>
    post<InvoiceCreateResult>("createInvoice", { projectId }),

  getPermissions: () => get<Record<string, unknown>[]>("getPermissions"),
  createPermission: (permission: Record<string, unknown>) =>
    post<unknown>("createPermission", permission),
};
