import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { supabaseAuthGateway } from "@/lib/supabase-auth";

const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";

// v2 cookie names intentionally invalidate the old persistent auth cookies.
// All v2 auth cookies are browser-session cookies and disappear with the browser session.
export const SESSION_COOKIE = "landview_session_v2";
export const REFRESH_COOKIE = "landview_refresh_v2";
export const QUICK_USER_COOKIE = "landview_quick_user_v2";
export const REMEMBER_COOKIE = "landview_remember_device_v2";
export const DEVICE_COOKIE = "landview_device";

const SESSION_READ_CACHE_MS = 5_000;

export type WorkspaceUser = Record<string, unknown>;

type SessionCacheEntry = { user: WorkspaceUser; expiresAt: number };
const sessionReadCache = new Map<string, SessionCacheEntry>();
const sessionReadInflight = new Map<string, Promise<WorkspaceUser | null>>();

function hmac(value: string) {
  if (!PROXY_SECRET) return "";
  return createHmac("sha256", PROXY_SECRET).update(value).digest("hex");
}

function secureEqual(a: string, b: string) {
  const aa = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

export function readSignedWorkspaceUser(value: string | undefined): WorkspaceUser | null {
  if (!PROXY_SECRET) return null;
  const text = String(value || "");
  const dot = text.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = text.slice(0, dot);
  const signature = text.slice(dot + 1);
  if (!secureEqual(signature, hmac(`quick-user|${payload}`))) return null;
  try {
    const user = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as WorkspaceUser;
    const role = roleOf(user);
    return ["admin", "manager", "employee", "client"].includes(role) ? user : null;
  } catch {
    return null;
  }
}

export function signWorkspaceUser(user: WorkspaceUser) {
  const payload = Buffer.from(JSON.stringify(user), "utf8").toString("base64url");
  return `${payload}.${hmac(`quick-user|${payload}`)}`;
}

export function roleOf(user: WorkspaceUser | null | undefined) {
  return String(user?.role || user?.Role || "").trim().toLowerCase();
}

export function userIdOf(user: WorkspaceUser | null | undefined) {
  return String(user?.userId || user?.User_ID || user?.username || user?.Username || "").trim();
}

/** Auth cookies are browser-session cookies: no Max-Age or Expires. */
export function sessionMaxAge(_remembered: boolean): any {
  return undefined;
}

function cacheKey(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function clearTokenCache(token: string) {
  const key = cacheKey(token);
  sessionReadCache.delete(key);
  sessionReadInflight.delete(key);
}

async function readSupabaseAuthUser(token: string): Promise<WorkspaceUser | null> {
  const key = cacheKey(token);
  const cached = sessionReadCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.user;
  if (cached) sessionReadCache.delete(key);

  const inflight = sessionReadInflight.get(key);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const data = await supabaseAuthGateway<{ authenticated: boolean; user: WorkspaceUser }>("getUser", { accessToken: token });
      if (!data?.authenticated || !data.user) return null;
      sessionReadCache.set(key, { user: data.user, expiresAt: Date.now() + SESSION_READ_CACHE_MS });
      return data.user;
    } catch {
      return null;
    }
  })();
  sessionReadInflight.set(key, promise);
  try {
    return await promise;
  } finally {
    if (sessionReadInflight.get(key) === promise) sessionReadInflight.delete(key);
  }
}

export async function requireLocalSession(request: NextRequest): Promise<WorkspaceUser | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value?.trim() || "";
  if (!token) return null;
  return readSupabaseAuthUser(token);
}

export async function revokeLocalSession(token: string) {
  if (!token) return null;
  clearTokenCache(token);
  return supabaseAuthGateway("logout", { accessToken: token }).catch(() => null);
}
