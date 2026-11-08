import { NextRequest, NextResponse } from "next/server";
import {
  ACTING_USER_COOKIE,
  QUICK_USER_COOKIE,
  readSignedActingWorkspaceUser,
  readSignedWorkspaceUser,
  requireLocalSession,
  roleOf,
  userIdOf,
} from "@/lib/local-session";
import { selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
type BotRequestError = Error & { status?: number; retryAfterMs?: number };

type StatusCacheEntry = { expiresAt: number; data: unknown };
const employeeStatusCache = new Map<string, StatusCacheEntry>();
const employeeStatusInflight = new Map<string, Promise<unknown>>();

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

async function managerEmployeeCode(user: Row) {
  const direct = employeeCodeOf(user);
  if (/^EMP-/i.test(direct)) return direct;

  const userKey = clean(userIdOf(user as unknown as Parameters<typeof userIdOf>[0]), 120);
  let rows = userKey ? await selectRows("app_users", { filters: { user_key: userKey }, limit: 1 }) : [];
  if (!rows.length) {
    const username = clean(user?.username || user?.Username, 120);
    if (username) rows = await selectRows("app_users", { filters: { username }, limit: 1 });
  }
  return clean(rows[0]?.employee_code, 120).toUpperCase();
}

async function currentEmployee(request: NextRequest) {
  const signedBase = readSignedWorkspaceUser(request.cookies.get(QUICK_USER_COOKIE)?.value) as Row | null;
  let user: Row | null = signedBase;
  if (user && roleOf(user) === "admin") {
    const acting = readSignedActingWorkspaceUser(request.cookies.get(ACTING_USER_COOKIE)?.value) as Row | null;
    if (acting) user = acting;
  }
  if (!user) user = await requireLocalSession(request) as Row | null;

  if (!user) throw new Error("SESSION_EXPIRED");
  const role = roleOf(user);
  if (role !== "employee" && role !== "manager") throw new Error("EMPLOYEE_REQUIRED");
  const employeeId = role === "manager" ? await managerEmployeeCode(user) : employeeCodeOf(user);
  if (!employeeId) throw new Error("EMPLOYEE_ID_MISSING");
  return { user, employeeId };
}

function retriableBotStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status === 502 || status === 503 || status === 504;
}

function retryDelay(attempt: number, retryAfterMs = 0) {
  return Math.min(10_000, Math.max(retryAfterMs, 1_500 * (attempt + 1)));
}

function retryAfterMsOf(value: string | null) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(60_000, seconds * 1_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.min(60_000, Math.max(0, date - Date.now())) : 0;
}

function transientStatusData(message?: string, retryAfterMs = 30_000) {
  return {
    ok: true,
    connection: "connecting",
    paired: false,
    qrAvailable: false,
    qrDataUrl: null,
    phoneNumber: null,
    temporary: true,
    retryAfterMs: Math.max(30_000, Math.min(60_000, retryAfterMs || 30_000)),
    lastError: clean(message || "WhatsApp service is reconnecting. Status will refresh automatically.", 500),
  };
}

async function botRequest(path: string, init?: RequestInit) {
  const base = clean(process.env.WHATSAPP_BOT_URL, 1000).replace(/\/+$/, "");
  const token = clean(process.env.WHATSAPP_BOT_API_TOKEN, 1000);
  if (!base || !token) throw new Error("LAND VIEW WhatsApp service is not configured.");

  const requestHeaders = new Headers(init?.headers || {});
  requestHeaders.set("x-land-view-bot-token", token);
  if (init?.body && !requestHeaders.has("content-type")) requestHeaders.set("content-type", "application/json");

  const method = String(init?.method || "GET").toUpperCase();
  // Status is polled by several screens; keep retries bounded so a 429 is not amplified.
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
        const retryAfterMs = retryAfterMsOf(result.headers.get("retry-after"));
        (error as Error & { status?: number; retryAfterMs?: number }).status = result.status;
        (error as Error & { retryAfterMs?: number }).retryAfterMs = retryAfterMs;
        if (attempt + 1 < attempts && retriableBotStatus(result.status)) {
          lastError = error;
          await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt, retryAfterMs)));
          continue;
        }
        throw error;
      }
      return json;
    } catch (error: unknown) {
      lastError = error;
      const requestError = error as BotRequestError;
      const status = Number(requestError.status) || 0;
      const retryAfterMs = Number(requestError.retryAfterMs) || 0;
      const mayRetry = !status || retriableBotStatus(status);
      if (attempt + 1 < attempts && mayRetry) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt, retryAfterMs)));
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
    const cached = employeeStatusCache.get(employeeId);
    if (cached && cached.expiresAt > Date.now()) {
      return response({ success: true, data: cached.data });
    }

    let pending = employeeStatusInflight.get(employeeId);
    if (!pending) {
      pending = botRequest(`/employee/status?employeeId=${encodeURIComponent(employeeId)}`)
        .then((data) => {
          employeeStatusCache.set(employeeId, { data, expiresAt: Date.now() + 5_000 });
          return data;
        })
        .catch((error: unknown) => {
          const requestError = error as BotRequestError;
          const status = Number(requestError.status) || 0;
          if (!status || retriableBotStatus(status)) {
            const data = transientStatusData(
              clean(requestError.message || "WhatsApp service is reconnecting.", 500),
              Number(requestError.retryAfterMs) || 30_000,
            );
            employeeStatusCache.set(employeeId, { data, expiresAt: Date.now() + 15_000 });
            return data;
          }
          throw error;
        })
        .finally(() => employeeStatusInflight.delete(employeeId));
      employeeStatusInflight.set(employeeId, pending);
    }
    const data = await pending;
    return response({ success: true, data });
  } catch (error: unknown) {
    const requestError = error as BotRequestError;
    const message = clean(requestError.message || "Could not load WhatsApp status.", 1000);
    if (message === "SESSION_EXPIRED") return response({ success: false, error: "Session expired." }, 401);
    if (message === "EMPLOYEE_REQUIRED") return response({ success: false, error: "Employee or Management access is required." }, 403);
    if (message === "EMPLOYEE_ID_MISSING") return response({ success: false, error: "No employee ID is linked to this account." }, 400);

    const status = Number(requestError.status) || 0;
    if (!status || retriableBotStatus(status)) {
      return response({ success: true, data: transientStatusData(message, Number(requestError.retryAfterMs) || 30_000) });
    }
    return response({ success: false, error: message }, status || 500);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return response({ success: false, error: "Invalid request origin." }, 403);
  try {
    const { employeeId } = await currentEmployee(request);
    const body = await request.json().catch(() => ({}));
    const action = clean(body?.action, 40).toLowerCase();
    if (action !== "reset") return response({ success: false, error: "Unsupported WhatsApp action." }, 400);

    try {
      await botRequest(`/employee/status?employeeId=${encodeURIComponent(employeeId)}`);
    } catch {
      // The status request is only used to wake a sleeping Render instance.
    }

    const data = await botRequest("/employee/reset", {
      method: "POST",
      body: JSON.stringify({ employeeId }),
    });
    return response({ success: true, data });
  } catch (error: unknown) {
    const requestError = error as BotRequestError;
    const message = clean(requestError.message || "Could not update WhatsApp connection.", 1000);
    if (message === "SESSION_EXPIRED") return response({ success: false, error: "Session expired." }, 401);
    if (message === "EMPLOYEE_REQUIRED") return response({ success: false, error: "Employee or Management access is required." }, 403);
    if (message === "EMPLOYEE_ID_MISSING") return response({ success: false, error: "No employee ID is linked to this account." }, 400);
    return response({ success: false, error: message }, Number(requestError.status) || 500);
  }
}
