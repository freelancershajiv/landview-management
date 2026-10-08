import * as SecureStore from "expo-secure-store";

const API_BASE = "https://app.landview.com.bd";
const ACCESS_KEY = "landview.mobile.access";
const REFRESH_KEY = "landview.mobile.refresh";
const USER_KEY = "landview.mobile.user";

export type MobileUser = Record<string, any>;
export type MobileSession = {
  accessToken: string;
  refreshToken: string;
  expiresIn?: number;
  user: MobileUser;
};

async function parse(response: Response) {
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || `HTTP ${response.status}`));
  return json.data;
}

export async function saveSession(session: MobileSession) {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, session.accessToken || ""),
    SecureStore.setItemAsync(REFRESH_KEY, session.refreshToken || ""),
    SecureStore.setItemAsync(USER_KEY, JSON.stringify(session.user || {})),
  ]);
}

export async function clearSession() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
    SecureStore.deleteItemAsync(USER_KEY),
  ]);
}

export async function storedUser(): Promise<MobileUser | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function accessToken() { return await SecureStore.getItemAsync(ACCESS_KEY); }
async function refreshToken() { return await SecureStore.getItemAsync(REFRESH_KEY); }

export async function login(userId: string, password: string) {
  const response = await fetch(`${API_BASE}/api/mobile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "login", userId, password }),
  });
  const data = await parse(response) as MobileSession;
  await saveSession(data);
  return data;
}

export async function clientLogin(projectId: string, mobile: string) {
  const response = await fetch(`${API_BASE}/api/mobile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "client-login", projectId, mobile }),
  });
  const data = await parse(response) as MobileSession;
  await saveSession(data);
  return data;
}

async function refreshSession() {
  const token = await refreshToken();
  if (!token) throw new Error("Session expired.");
  const response = await fetch(`${API_BASE}/api/mobile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "refresh", refreshToken: token }),
  });
  const data = await parse(response) as MobileSession;
  await saveSession(data);
  return data.accessToken;
}

async function authFetch(path: string, init: RequestInit = {}, retry = true) {
  let token = await accessToken();
  if (!token) throw new Error("Session expired.");
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  let response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (response.status === 401 && retry) {
    token = await refreshSession();
    headers.set("Authorization", `Bearer ${token}`);
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  }
  return response;
}

export async function getView<T = any>(view: string, params: Record<string, string> = {}) {
  const query = new URLSearchParams({ view, ...params });
  return await parse(await authFetch(`/api/mobile?${query.toString()}`)) as T;
}

export async function mobileAction<T = any>(action: string, payload: Record<string, unknown> = {}) {
  return await parse(await authFetch("/api/mobile", {
    method: "POST",
    body: JSON.stringify({ action, ...payload }),
  })) as T;
}
