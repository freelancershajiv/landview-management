import { createHmac, randomUUID } from "node:crypto";
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
const LOGIN_ATTEMPT_TIMEOUT_MS = 50_000;
const LOGIN_ATTEMPTS = 2;
const REDIRECT_RETRY_DELAYS_MS = [0, 250, 700];

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

function signQuickUser(user: Record<string, unknown>) {
  const payload = Buffer.from(JSON.stringify(user), "utf8").toString("base64url");
  return `${payload}.${hmac(`quick-user|${payload}`)}`;
}

function allowedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === "app.landview.com.bd" || host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function rawIp(request: NextRequest) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}

function clientKey(request: NextRequest) {
  return createHmac("sha256", PROXY_SECRET).update(rawIp(request)).digest("hex").slice(0, 32);
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

function geo(request: NextRequest) {
  return {
    city: request.headers.get("x-vercel-ip-city") || "",
    region: request.headers.get("x-vercel-ip-country-region") || "",
    country: request.headers.get("x-vercel-ip-country") || "",
    latitude: request.headers.get("x-vercel-ip-latitude") || "",
    longitude: request.headers.get("x-vercel-ip-longitude") || "",
  };
}

function safeUpstreamUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}`;
  } catch {
    return "invalid-upstream-url";
  }
}

function safeBodyPreview(text: string) {
  return text.replace(/\s+/g, " ").slice(0, 180);
}

type UpstreamResult = {
  upstream: Response;
  text: string;
  json: any | null;
};

async function parseUpstreamResponse(upstream: Response, attempt: number, phase: string): Promise<UpstreamResult> {
  const text = await upstream.text();
  let json: any | null = null;
  try {
    json = JSON.parse(text);
  } catch {
    console.error("login-fast upstream returned non-JSON", {
      attempt,
      phase,
      status: upstream.status,
      contentType: upstream.headers.get("content-type") || "",
      upstream: safeUpstreamUrl(upstream.url || APPS_SCRIPT_URL),
      bodyPreview: safeBodyPreview(text),
    });
  }
  return { upstream, text, json };
}

async function followAppsScriptRedirect(location: string, attempt: number, signal: AbortSignal): Promise<UpstreamResult> {
  let lastResult: UpstreamResult | null = null;

  for (let index = 0; index < REDIRECT_RETRY_DELAYS_MS.length; index += 1) {
    const delay = REDIRECT_RETRY_DELAYS_MS[index];
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));

    const response = await fetch(location, {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
      signal,
    });
    const result = await parseUpstreamResponse(response, attempt, `redirect-${index + 1}`);
    lastResult = result;

    if (result.json !== null) return result;
    const retryable = response.status === 404 || response.status === 429 || response.status >= 500;
    if (!retryable) return result;
  }

  return lastResult!;
}

async function callLoginUpstream(payload: Record<string, unknown>, attempt: number): Promise<UpstreamResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOGIN_ATTEMPT_TIMEOUT_MS);

  try {
    // Apps Script ContentService normally answers with a redirect to
    // script.googleusercontent.com/macros/echo. Following it ourselves lets us
    // retry a transient 404 from that response endpoint without re-running the
    // expensive password verification and creating duplicate login sessions.
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
      if (!location) return parseUpstreamResponse(initial, attempt, "redirect-missing-location");
      return followAppsScriptRedirect(location, attempt, controller.signal);
    }

    return parseUpstreamResponse(initial, attempt, "initial");
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request)) {
    return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
  }
  if (!APPS_SCRIPT_URL || !PROXY_SECRET) {
    return NextResponse.json({ success: false, error: "LAND VIEW login service is not configured." }, { status: 503 });
  }

  let input: Record<string, unknown> = {};
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid login request." }, { status: 400 });
  }

  const userId = String(input.userId || input.username || "").trim();
  const password = String(input.password || "");
  if (!userId || !password) {
    return NextResponse.json({ success: false, error: "Enter your User ID and password." }, { status: 400 });
  }

  const existingDeviceId = request.cookies.get(DEVICE_COOKIE)?.value?.trim();
  const deviceId = existingDeviceId || `LVD-${randomUUID()}`;
  const userAgent = request.headers.get("user-agent") || "";
  const device = parseDevice(userAgent);
  const location = geo(request);

  const payload = {
    action: "login",
    userId,
    password,
    proxySecret: PROXY_SECRET,
    _clientKey: clientKey(request),
    ipAddress: rawIp(request),
    deviceId,
    deviceName: device.deviceName,
    browser: device.browser,
    os: device.os,
    userAgent: userAgent.slice(0, 500),
    ...location,
  };

  let lastFailureWasTimeout = false;
  let lastResult: UpstreamResult | null = null;

  for (let attempt = 1; attempt <= LOGIN_ATTEMPTS; attempt += 1) {
    try {
      const result = await callLoginUpstream(payload, attempt);
      lastResult = result;
      lastFailureWasTimeout = false;

      // A valid JSON response means Apps Script executed correctly. Do not retry
      // authentication failures because that could unnecessarily increase lockout counters.
      if (result.json !== null) break;

      if (attempt < LOGIN_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    } catch (error: any) {
      lastFailureWasTimeout = error?.name === "AbortError";
      console.error("login-fast upstream request failed", {
        attempt,
        timedOut: lastFailureWasTimeout,
        error: String(error?.message || error || "Unknown error").slice(0, 180),
      });

      // A timeout likely means Apps Script is still doing the expensive password
      // verification. Starting the same login again immediately only doubles the
      // load, so preserve the full 50-second window and fail cleanly instead.
      if (lastFailureWasTimeout) break;

      if (attempt < LOGIN_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        continue;
      }
    }
  }

  if (!lastResult || lastResult.json === null) {
    return NextResponse.json(
      {
        success: false,
        error: lastFailureWasTimeout
          ? "The authentication server is still processing the sign-in request. Please try once more."
          : "The login service returned an invalid response.",
      },
      { status: lastFailureWasTimeout ? 504 : 502 },
    );
  }

  const { upstream, json } = lastResult;
  const token = String(json?.data?.token || json?.token || "").trim();
  const user = json?.data?.user || json?.user;
  if (!upstream.ok || !json?.success || !token || !user) {
    return NextResponse.json(
      { success: false, error: String(json?.error || json?.message || "Invalid User ID or password.") },
      { status: 401 },
    );
  }

  const response = NextResponse.json({ success: true, data: { user } }, {
    headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" },
  });
  response.cookies.set(COOKIE_NAME, token, cookieOptions(COOKIE_MAX_AGE_SECONDS));
  response.cookies.set(QUICK_USER_COOKIE, signQuickUser(user as Record<string, unknown>), cookieOptions(COOKIE_MAX_AGE_SECONDS));
  if (!existingDeviceId) response.cookies.set(DEVICE_COOKIE, deviceId, cookieOptions(DEVICE_MAX_AGE_SECONDS));
  return response;
}
