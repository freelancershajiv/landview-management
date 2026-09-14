import { createHmac, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "landview_session";
const DEVICE_COOKIE = "landview_device";
const COOKIE_MAX_AGE_SECONDS = 8 * 60 * 60;
const DEVICE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";

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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const upstream = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
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
      }),
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });

    const text = await upstream.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      return NextResponse.json({ success: false, error: "The login service returned an invalid response." }, { status: 502 });
    }

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
    if (!existingDeviceId) response.cookies.set(DEVICE_COOKIE, deviceId, cookieOptions(DEVICE_MAX_AGE_SECONDS));
    return response;
  } catch (error: any) {
    const timedOut = error?.name === "AbortError";
    return NextResponse.json(
      { success: false, error: timedOut ? "Login took too long. Please try again." : "Could not reach the LAND VIEW login service." },
      { status: timedOut ? 504 : 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
