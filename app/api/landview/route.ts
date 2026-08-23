import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";
const SESSION_COOKIE = "lv_session";
const SESSION_MAX_AGE = 8 * 60 * 60;
const PUBLIC_ACTIONS = new Set(["health", "login"]);

function apiUrl() {
  if (!APPS_SCRIPT_URL) {
    throw new Error("LAND_VIEW_API_URL is not configured in Vercel Environment Variables.");
  }
  if (!PROXY_SECRET) {
    throw new Error("LAND_VIEW_PROXY_SECRET is not configured in Vercel Environment Variables.");
  }
  return APPS_SCRIPT_URL;
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
}

function protectedHeaders() {
  return {
    "cache-control": "no-store, max-age=0",
    "content-type": "application/json; charset=utf-8",
  };
}

function parseJson(text: string): Record<string, any> | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function responseShowsExpiredSession(payload: Record<string, any> | null) {
  if (!payload || payload.success !== false) return false;
  const message = String(payload.error || payload.message || "").toLowerCase();
  return message.includes("unauthorized") || message.includes("session expired");
}

async function callAppsScript(method: "GET" | "POST", target: string, body?: string) {
  return fetch(target, {
    method,
    headers: method === "POST" ? { "Content-Type": "text/plain;charset=utf-8" } : undefined,
    body,
    cache: "no-store",
    redirect: "follow",
  });
}

export async function GET(request: NextRequest) {
  try {
    const action = String(request.nextUrl.searchParams.get("action") || "health");
    const target = new URL(apiUrl());

    request.nextUrl.searchParams.forEach((value, key) => {
      if (key !== "token" && key !== "proxySecret") target.searchParams.set(key, value);
    });
    target.searchParams.set("proxySecret", PROXY_SECRET);

    if (!PUBLIC_ACTIONS.has(action)) {
      const token = request.cookies.get(SESSION_COOKIE)?.value || "";
      if (!token) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
      }
      target.searchParams.set("token", token);
    }

    const upstream = await callAppsScript("GET", target.toString());
    const text = await upstream.text();
    const payload = parseJson(text);
    const response = new NextResponse(text, { status: upstream.status, headers: protectedHeaders() });

    if (responseShowsExpiredSession(payload)) clearSessionCookie(response);
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to reach LAND VIEW backend.";
    return NextResponse.json({ success: false, error: message }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403, headers: { "cache-control": "no-store" } });
  }

  try {
    const incoming = parseJson(await request.text()) || {};
    const action = String(incoming.action || "");
    delete incoming.token;
    delete incoming.proxySecret;
    incoming.proxySecret = PROXY_SECRET;

    if (!action) {
      return NextResponse.json({ success: false, error: "Action is required." }, { status: 400 });
    }

    if (!PUBLIC_ACTIONS.has(action)) {
      const token = request.cookies.get(SESSION_COOKIE)?.value || "";
      if (!token) {
        return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
      }
      incoming.token = token;
    }

    const upstream = await callAppsScript("POST", apiUrl(), JSON.stringify(incoming));
    const text = await upstream.text();
    const payload = parseJson(text);

    // Login: keep the Apps Script token only in an HttpOnly cookie and never expose it to browser JavaScript.
    if (action === "login" && payload?.success && payload?.data?.token) {
      const token = String(payload.data.token);
      const safePayload = { ...payload, data: { ...payload.data } };
      delete safePayload.data.token;
      const response = NextResponse.json(safePayload, { status: upstream.status, headers: { "cache-control": "no-store" } });
      setSessionCookie(response, token);
      return response;
    }

    const response = new NextResponse(text, { status: upstream.status, headers: protectedHeaders() });
    if (action === "logout" || responseShowsExpiredSession(payload)) clearSessionCookie(response);
    return response;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unable to reach LAND VIEW backend.";
    return NextResponse.json({ success: false, error: message }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
