import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "landview_session";
const COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;
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

function clientKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHmac("sha256", PROXY_SECRET).update(forwarded).digest("hex").slice(0, 32);
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
