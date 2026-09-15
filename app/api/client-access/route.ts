import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";
const COOKIE_NAME = "landview_session";
const COOKIE_MAX_AGE_SECONDS = 8 * 60 * 60;
const BACKEND_TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [0, 250, 700];

function clean(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

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

function statusForMessage(message: string) {
  const normalized = String(message || "").trim().toLowerCase();
  if (["unauthorized", "session expired", "session expired.", "invalid session", "invalid session.", "authentication required", "authentication required."].includes(normalized)) return 401;
  if (/^access denied\b|permission required|access is required/.test(normalized)) return 403;
  return 502;
}

async function fetchBackend(payload: Record<string, unknown>) {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const response = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
      });
      const raw = await response.text();
      let json: any;
      try { json = JSON.parse(raw); }
      catch {
        lastError = new Error(/^\s*</.test(raw) ? "Apps Script returned HTML instead of JSON." : "Client backend returned invalid JSON.");
        if (attempt < RETRY_DELAYS_MS.length - 1) continue;
        throw lastError;
      }
      if (response.status >= 500 && attempt < RETRY_DELAYS_MS.length - 1) {
        lastError = new Error(`Apps Script returned HTTP ${response.status}.`);
        continue;
      }
      return json;
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error || "Client backend request failed."));
      if (attempt >= RETRY_DELAYS_MS.length - 1) throw lastError;
    }
  }
  throw lastError || new Error("Client backend request failed.");
}

async function callBackend(request: NextRequest, clientOp: string, payload: Record<string, unknown> = {}, includeSession = true) {
  if (!APPS_SCRIPT_URL || !PROXY_SECRET) throw new Error("LAND VIEW client backend is not configured.");
  const token = request.cookies.get(COOKIE_NAME)?.value || "";
  const json = await fetchBackend({
    action: "getPublicProjects",
    _clientPortal: "1",
    clientOp,
    proxySecret: PROXY_SECRET,
    ...(includeSession && token ? { token } : {}),
    ...payload,
  });
  if (!json?.success) throw new Error(String(json?.error || json?.message || "Client portal request failed."));
  return json.data || {};
}

export async function GET(request: NextRequest) {
  try {
    const mode = clean(request.nextUrl.searchParams.get("mode"), 30).toLowerCase();
    const clientOp = mode === "admin-requests" ? "adminRequests" : "workspace";
    const data = await callBackend(request, clientOp);
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    const message = error?.message || "Could not load client portal.";
    return NextResponse.json({ success: false, error: message }, { status: statusForMessage(message) });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const input = await request.json();
    const action = clean(input?.action, 40).toLowerCase();

    if (action === "login") {
      const data = await callBackend(request, "login", {
        projectId: clean(input?.projectId, 60).toUpperCase(),
        mobile: clean(input?.mobile, 40),
      }, false);
      const token = String(data?.token || "");
      if (!token || !data?.user) throw new Error("Client login session was not created.");
      const { token: _token, ...safe } = data;
      const response = NextResponse.json({ success: true, data: safe }, { headers: { "Cache-Control": "no-store, max-age=0" } });
      response.cookies.set(COOKIE_NAME, token, cookieOptions(COOKIE_MAX_AGE_SECONDS));
      return response;
    }

    if (action === "request-certificate") {
      const data = await callBackend(request, "requestCertificate", {
        projectId: clean(input?.projectId, 60).toUpperCase(),
        certificateType: clean(input?.certificateType, 30),
        subject: clean(input?.subject, 160),
        details: clean(input?.details, 800),
      });
      return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }

    if (action === "review-request") {
      const data = await callBackend(request, "reviewRequest", {
        requestId: clean(input?.requestId, 80),
        decision: clean(input?.decision, 20),
        note: clean(input?.note, 400),
        certificateId: clean(input?.certificateId, 80),
      });
      return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }

    return NextResponse.json({ success: false, error: "Unknown client action." }, { status: 400 });
  } catch (error: any) {
    const message = error?.message || "Client portal request failed.";
    return NextResponse.json({ success: false, error: message }, { status: statusForMessage(message) });
  }
}
