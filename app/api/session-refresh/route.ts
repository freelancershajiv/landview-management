import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "landview_session";
const QUICK_USER_COOKIE = "landview_quick_user";
const REMEMBER_COOKIE = "landview_remember_device";
const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";
const REMEMBER_MAX_AGE_SECONDS = 400 * 24 * 60 * 60;
const NORMAL_MAX_AGE_SECONDS = 8 * 60 * 60;
const BACKEND_TIMEOUT_MS = 12_000;

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    priority: "high" as const,
  };
}

function hmac(value: string) {
  return createHmac("sha256", PROXY_SECRET).update(value).digest("hex");
}

function secureEqual(a: string, b: string) {
  const aa = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function signQuickUser(user: Record<string, unknown>) {
  const payload = Buffer.from(JSON.stringify(user), "utf8").toString("base64url");
  return `${payload}.${hmac(`quick-user|${payload}`)}`;
}

function readQuickUser(value: string | undefined) {
  const text = String(value || "");
  const dot = text.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = text.slice(0, dot);
  const signature = text.slice(dot + 1);
  if (!secureEqual(signature, hmac(`quick-user|${payload}`))) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function roleOf(user: Record<string, unknown> | null | undefined) {
  return String(user?.role || user?.Role || "").trim().toLowerCase();
}

function userIdOf(user: Record<string, unknown> | null | undefined) {
  return String(user?.userId || user?.User_ID || "").trim();
}

function clientKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHmac("sha256", PROXY_SECRET).update(forwarded).digest("hex").slice(0, 32);
}

function explicitSessionFailure(json: any) {
  if (json?.data?.authenticated === false) return true;
  if (json?.success !== false) return false;
  const message = String(json?.message || json?.error || "").trim().toLowerCase();
  return [
    "unauthorized",
    "session expired",
    "session expired.",
    "invalid session",
    "invalid session.",
    "authentication required",
    "authentication required.",
  ].includes(message);
}

async function callBackend(payload: Record<string, unknown>) {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
  });
  const raw = await response.text();
  let json: any = null;
  try { json = JSON.parse(raw); } catch {}
  return { response, raw, json };
}

async function mintRememberedAdminSession(request: NextRequest, user: Record<string, unknown>) {
  const role = roleOf(user);
  const userId = userIdOf(user);
  if (!userId || (role !== "admin" && role !== "manager")) return null;
  const { response, json } = await callBackend({
    action: "getPublicProjects",
    _trustedPinSessionUserId: userId,
    proxySecret: PROXY_SECRET,
    _clientKey: clientKey(request),
  });
  const token = String(json?.data?.token || "").trim();
  const refreshedUser = (json?.data?.user || user) as Record<string, unknown>;
  if (!response.ok || !json?.success || !token || !refreshedUser) return null;
  return { token, user: refreshedUser };
}

function clearAuth(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", cookieOptions(0));
  response.cookies.set(QUICK_USER_COOKIE, "", cookieOptions(0));
  response.cookies.set(REMEMBER_COOKIE, "", cookieOptions(0));
}

function authenticatedResponse(user: Record<string, unknown>, token: string, remembered: boolean) {
  const response = NextResponse.json({ success: true, data: { authenticated: true, user, remembered } }, {
    headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" },
  });
  const maxAge = remembered ? REMEMBER_MAX_AGE_SECONDS : NORMAL_MAX_AGE_SECONDS;
  response.cookies.set(COOKIE_NAME, token, cookieOptions(maxAge));
  response.cookies.set(QUICK_USER_COOKIE, signQuickUser(user), cookieOptions(maxAge));
  if (remembered) response.cookies.set(REMEMBER_COOKIE, "1", cookieOptions(REMEMBER_MAX_AGE_SECONDS));
  return response;
}

export async function GET(request: NextRequest) {
  if (!APPS_SCRIPT_URL || !PROXY_SECRET) {
    return NextResponse.json({ success: false, error: "Session service is not configured." }, { status: 503 });
  }

  const token = request.cookies.get(COOKIE_NAME)?.value || "";
  const remembered = request.cookies.get(REMEMBER_COOKIE)?.value === "1";
  const quickUser = readQuickUser(request.cookies.get(QUICK_USER_COOKIE)?.value);

  try {
    if (token) {
      const { response, json } = await callBackend({
        action: "getSession",
        token,
        proxySecret: PROXY_SECRET,
        _clientKey: clientKey(request),
      });

      if (response.ok && json?.success && json?.data?.authenticated && json?.data?.user) {
        return authenticatedResponse(json.data.user as Record<string, unknown>, token, remembered);
      }

      if (!explicitSessionFailure(json)) {
        return NextResponse.json({ success: false, error: String(json?.error || json?.message || "Could not validate session.") }, { status: 503 });
      }
    }

    if (remembered && quickUser) {
      const refreshed = await mintRememberedAdminSession(request, quickUser);
      if (refreshed) return authenticatedResponse(refreshed.user, refreshed.token, true);
    }

    const response = NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    clearAuth(response);
    return response;
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.name === "TimeoutError" || error?.name === "AbortError" ? "Session refresh timed out." : "Could not refresh session." },
      { status: 503 },
    );
  }
}
