import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const COOKIE_NAME = "landview_session";
const QUICK_USER_COOKIE = "landview_quick_user";
const DEVICE_COOKIE = "landview_device";
const COOKIE_MAX_AGE_SECONDS = 8 * 60 * 60;
const DEVICE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";

// Only the SHA-256 digest is stored in the public repository. The actual
// bearer token is kept out of source control and should be treated like a password.
const OWNER_ACCESS_TOKEN_SHA256 = "c8e3c774257a85e942058f54caa47ab3375ca60ab4ca6b77db1c0ff4ffad48e0";

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

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function secureEqual(a: string, b: string) {
  const aa = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function signQuickUser(user: Record<string, unknown>) {
  const payload = Buffer.from(JSON.stringify(user), "utf8").toString("base64url");
  const signature = createHmac("sha256", PROXY_SECRET).update(`quick-user|${payload}`).digest("hex");
  return `${payload}.${signature}`;
}

function rawIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}

function parseDevice(userAgent: string) {
  const ua = userAgent || "";
  const os = /Windows NT 10/i.test(ua) ? "Windows 10/11"
    : /Android/i.test(ua) ? "Android"
    : /iPhone|iPad|iPod/i.test(ua) ? "iOS/iPadOS"
    : /Mac OS X/i.test(ua) ? "macOS"
    : /Linux/i.test(ua) ? "Linux"
    : "Unknown OS";
  const browser = /Edg\//i.test(ua) ? "Microsoft Edge"
    : /OPR\//i.test(ua) ? "Opera"
    : /Chrome\//i.test(ua) ? "Chrome"
    : /Firefox\//i.test(ua) ? "Firefox"
    : /Safari\//i.test(ua) ? "Safari"
    : "Unknown browser";
  const deviceName = /Mobile|Android|iPhone|iPad/i.test(ua) ? `${os} mobile device` : `${os} computer`;
  return { os, browser, deviceName };
}

async function readAppsScriptResponse(response: Response) {
  const text = await response.text();
  try {
    return { response, json: JSON.parse(text) as any };
  } catch {
    return { response, json: null as any };
  }
}

async function callAppsScript(payload: Record<string, unknown>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50_000);
  try {
    const initial = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      cache: "no-store",
      redirect: "manual",
      signal: controller.signal,
    });

    if ([301, 302, 303].includes(initial.status)) {
      const location = initial.headers.get("location") || "";
      if (!location) return readAppsScriptResponse(initial);
      let last: Awaited<ReturnType<typeof readAppsScriptResponse>> | null = null;
      for (const delay of [0, 250, 700]) {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
        const redirected = await fetch(location, { method: "GET", cache: "no-store", redirect: "follow", signal: controller.signal });
        last = await readAppsScriptResponse(redirected);
        if (last.json !== null) return last;
        if (!(redirected.status === 404 || redirected.status === 429 || redirected.status >= 500)) return last;
      }
      return last!;
    }

    return readAppsScriptResponse(initial);
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  if (!token || !secureEqual(hash(token), OWNER_ACCESS_TOKEN_SHA256)) {
    return NextResponse.redirect(new URL("/login?error=invalid-owner-link", request.url));
  }

  if (!APPS_SCRIPT_URL || !PROXY_SECRET) {
    return NextResponse.json({ success: false, error: "LAND VIEW owner access is not configured." }, { status: 503 });
  }

  const userAgent = request.headers.get("user-agent") || "";
  const device = parseDevice(userAgent);
  const deviceId = request.cookies.get(DEVICE_COOKIE)?.value?.trim() || `LVD-${randomUUID()}`;

  const result = await callAppsScript({
    action: "login",
    _ownerMagic: "1",
    proxySecret: PROXY_SECRET,
    deviceId,
    deviceName: device.deviceName,
    browser: device.browser,
    os: device.os,
    userAgent: userAgent.slice(0, 500),
    ipAddress: rawIp(request),
    city: request.headers.get("x-vercel-ip-city") || "",
    region: request.headers.get("x-vercel-ip-country-region") || "",
    country: request.headers.get("x-vercel-ip-country") || "",
  });

  const sessionToken = String(result.json?.data?.token || "").trim();
  const user = result.json?.data?.user as Record<string, unknown> | undefined;
  if (!result.response.ok || !result.json?.success || !sessionToken || !user) {
    return NextResponse.json(
      { success: false, error: String(result.json?.error || result.json?.message || "Owner access could not create an admin session.") },
      { status: 502 },
    );
  }

  const response = NextResponse.redirect(new URL("/admin", request.url));
  response.cookies.set(COOKIE_NAME, sessionToken, cookieOptions(COOKIE_MAX_AGE_SECONDS));
  response.cookies.set(QUICK_USER_COOKIE, signQuickUser(user), cookieOptions(COOKIE_MAX_AGE_SECONDS));
  response.cookies.set(DEVICE_COOKIE, deviceId, cookieOptions(DEVICE_MAX_AGE_SECONDS));
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
