import { NextRequest, NextResponse } from "next/server";
import {
  ACTING_USER_COOKIE,
  QUICK_USER_COOKIE,
  readSignedActingWorkspaceUser,
  readSignedWorkspaceUser,
  requireLocalSession,
  roleOf,
} from "@/lib/local-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

function clean(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function employeeCodeOf(user: Row) {
  return clean(
    user?.employeeId ||
      user?.Employee_ID ||
      user?.employeeCode ||
      user?.employee_code ||
      user?.Employee_Code ||
      user?.userId ||
      user?.User_ID,
    120,
  ).toUpperCase();
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

function response(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

async function currentEmployee(request: NextRequest) {
  // Role switching already creates HMAC-signed identity cookies. Prefer those
  // locally so the employee WhatsApp card does not depend on a second remote
  // auth lookup immediately after switching from Admin to EMP-0002.
  const signedBase = readSignedWorkspaceUser(request.cookies.get(QUICK_USER_COOKIE)?.value) as Row | null;
  let user: Row | null = signedBase;
  if (user && roleOf(user) === "admin") {
    const acting = readSignedActingWorkspaceUser(request.cookies.get(ACTING_USER_COOKIE)?.value) as Row | null;
    if (acting) user = acting;
  }
  if (!user) user = await requireLocalSession(request) as Row | null;

  if (!user) throw new Error("SESSION_EXPIRED");
  if (roleOf(user) !== "employee") throw new Error("EMPLOYEE_REQUIRED");
  const employeeId = employeeCodeOf(user);
  if (!employeeId) throw new Error("EMPLOYEE_ID_MISSING");
  return { user, employeeId };
}

function retriableBotStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status === 502 || status === 503 || status === 504;
}

async function botRequest(path: string, init?: RequestInit) {
  const base = clean(process.env.WHATSAPP_BOT_URL, 1000).replace(/\/+$/, "");
  const token = clean(process.env.WHATSAPP_BOT_API_TOKEN, 1000);
  if (!base || !token) throw new Error("LAND VIEW WhatsApp service is not configured.");

  const requestHeaders = new Headers(init?.headers || {});
  requestHeaders.set("x-land-view-bot-token", token);
  if (init?.body && !requestHeaders.has("content-type")) requestHeaders.set("content-type", "application/json");

  const method = String(init?.method || "GET").toUpperCase();
  const attempts = method === "GET" ? 2 : 1;
  let lastError: unknown = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const result = await fetch(`${base}${path}`, {
        ...init,
        headers: requestHeaders,
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
      const json = await result.json().catch(() => null);
      if (!result.ok || !json?.ok) {
        const error = new Error(clean(json?.error || `WhatsApp service returned HTTP ${result.status}.`, 1000));
        (error as Error & { status?: number }).status = result.status;
        if (attempt + 1 < attempts && retriableBotStatus(result.status)) {
          lastError = error;
          await new Promise((resolve) => setTimeout(resolve, 450));
          continue;
        }
        throw error;
      }
      return json;
    } catch (error: any) {
      lastError = error;
      const status = Number(error?.status) || 0;
      const mayRetry = !status || retriableBotStatus(status);
      if (attempt + 1 < attempts && mayRetry) {
        await new Promise((resolve) => setTimeout(resolve, 450));
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Could not reach LAND VIEW WhatsApp service.");
}

export async function GET(request: NextRequest) {
  try {
    const { employeeId } = await currentEmployee(request);
    const data = await botRequest(`/employee/status?employeeId=${encodeURIComponent(employeeId)}`);
    return response({ success: true, data });
  } catch (error: any) {
    const message = clean(error?.message || "Could not load WhatsApp status.", 1000);
    if (message === "SESSION_EXPIRED") return response({ success: false, error: "Session expired." }, 401);
    if (message === "EMPLOYEE_REQUIRED") return response({ success: false, error: "Employee access is required." }, 403);
    if (message === "EMPLOYEE_ID_MISSING") return response({ success: false, error: "Employee ID is missing from this account." }, 400);
    return response({ success: false, error: message }, Number(error?.status) || 500);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return response({ success: false, error: "Invalid request origin." }, 403);
  try {
    const { employeeId } = await currentEmployee(request);
    const body = await request.json().catch(() => ({}));
    const action = clean(body?.action, 40).toLowerCase();
    if (action !== "reset") return response({ success: false, error: "Unsupported WhatsApp action." }, 400);

    const data = await botRequest("/employee/reset", {
      method: "POST",
      body: JSON.stringify({ employeeId }),
    });
    return response({ success: true, data });
  } catch (error: any) {
    const message = clean(error?.message || "Could not update WhatsApp connection.", 1000);
    if (message === "SESSION_EXPIRED") return response({ success: false, error: "Session expired." }, 401);
    if (message === "EMPLOYEE_REQUIRED") return response({ success: false, error: "Employee access is required." }, 403);
    if (message === "EMPLOYEE_ID_MISSING") return response({ success: false, error: "Employee ID is missing from this account." }, 400);
    return response({ success: false, error: message }, Number(error?.status) || 500);
  }
}
