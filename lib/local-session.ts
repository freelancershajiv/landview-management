import { createHmac, timingSafeEqual } from "node:crypto";
import { getVercelOidcToken } from "@vercel/oidc";
import type { NextRequest } from "next/server";

const SESSION_URL = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-session";
const AUDIENCE = "https://supabase.landview.internal";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";

export const SESSION_COOKIE = "landview_session";
export const QUICK_USER_COOKIE = "landview_quick_user";
export const REMEMBER_COOKIE = "landview_remember_device";
export const DEVICE_COOKIE = "landview_device";

const NORMAL_MAX_AGE_SECONDS = 8 * 60 * 60;
const REMEMBER_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
const NORMAL_IDLE_MS = 30 * 60 * 1000;
const TOUCH_AFTER_MS = 2 * 60 * 1000;

export type WorkspaceUser = Record<string, unknown>;

type SessionRow = {
  session_key: string;
  user_id: string;
  role: string;
  user_json: WorkspaceUser;
  remembered: boolean;
  active: boolean;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
};

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
    return ["admin", "manager", "accounts", "employee", "client"].includes(role) ? user : null;
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

export function sessionKeyForToken(token: string) {
  return hmac(`app-session|${String(token || "").trim()}`);
}

async function sessionGateway(action: string, input: Record<string, unknown>) {
  const oidc = await getVercelOidcToken({ audience: AUDIENCE });
  if (!oidc) throw new Error("Vercel OIDC token is unavailable.");
  const response = await fetch(SESSION_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${oidc}`, "content-type": "application/json" },
    body: JSON.stringify({ action, ...input }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || `Supabase session service returned HTTP ${response.status}.`));
  return json.data as SessionRow | null;
}

function expiryFor(remembered: boolean) {
  const seconds = remembered ? REMEMBER_MAX_AGE_SECONDS : NORMAL_MAX_AGE_SECONDS;
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export function sessionMaxAge(remembered: boolean) {
  return remembered ? REMEMBER_MAX_AGE_SECONDS : NORMAL_MAX_AGE_SECONDS;
}

export async function registerSupabaseSession(
  token: string,
  user: WorkspaceUser,
  remembered: boolean,
  deviceId = "",
) {
  const sessionKey = sessionKeyForToken(token);
  if (!sessionKey || !userIdOf(user)) throw new Error("Cannot register LAND VIEW session.");
  return sessionGateway("upsert", {
    sessionKey,
    user,
    remembered,
    expiresAt: expiryFor(remembered),
    deviceId,
  });
}

export async function requireLocalSession(request: NextRequest): Promise<WorkspaceUser | null> {
  if (!PROXY_SECRET) return null;
  const token = request.cookies.get(SESSION_COOKIE)?.value?.trim() || "";
  const signedUser = readSignedWorkspaceUser(request.cookies.get(QUICK_USER_COOKIE)?.value);
  if (!token || !signedUser) return null;

  const sessionKey = sessionKeyForToken(token);
  if (!sessionKey) return null;
  const remembered = request.cookies.get(REMEMBER_COOKIE)?.value === "1";
  let row: SessionRow | null = null;
  try {
    row = await sessionGateway("get", { sessionKey });
  } catch (error) {
    console.warn("LAND VIEW Supabase session lookup failed", {
      message: error instanceof Error ? error.message.slice(0, 180) : "Unknown error",
    });
    return null;
  }

  if (!row) {
    try {
      row = await registerSupabaseSession(
        token,
        signedUser,
        remembered,
        request.cookies.get(DEVICE_COOKIE)?.value || "",
      );
    } catch (error) {
      console.warn("LAND VIEW Supabase session bootstrap failed", {
        message: error instanceof Error ? error.message.slice(0, 180) : "Unknown error",
      });
      return null;
    }
  }

  if (!row?.active || Date.parse(row.expires_at) <= Date.now()) return null;
  const lastSeen = Date.parse(row.last_seen_at || row.created_at || "");
  if (!row.remembered && Number.isFinite(lastSeen) && Date.now() - lastSeen > NORMAL_IDLE_MS) {
    void sessionGateway("revoke", { sessionKey }).catch(() => undefined);
    return null;
  }

  if (!Number.isFinite(lastSeen) || Date.now() - lastSeen > TOUCH_AFTER_MS) {
    void sessionGateway("touch", { sessionKey }).catch(() => undefined);
  }
  return row.user_json && typeof row.user_json === "object" ? row.user_json : signedUser;
}

export async function revokeLocalSession(token: string) {
  const sessionKey = sessionKeyForToken(token);
  if (!sessionKey) return null;
  return sessionGateway("revoke", { sessionKey });
}
