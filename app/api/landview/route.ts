import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "landview_session";
const QUICK_PIN_COOKIE = "landview_quick_pin";
const QUICK_DEVICE_COOKIE = "landview_quick_device";
const QUICK_USER_COOKIE = "landview_quick_user";
const QUICK_LOCK_COOKIE = "landview_quick_locked";
const COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;
const QUICK_PIN_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";

const GET_ACTIONS = new Set([
  "getFinanceSheet",
  "health",
  "getPublicTeam",
  "getSession",
  "getDashboard",
  "getUsers",
  "getProjects",
  "getProject",
  "getProjectEmployees",
  "getProjectDriveFolder",
  "getProjectServiceFolders",
  "getEmployees",
  "getDocuments",
  "getSiteVisits",
  "getBillingDashboard",
  "getBillingBook",
  "getProjectBilling",
  "getBillingRecords",
  "getPayments",
  "getInvoices",
  "getPermissions",
  "getErpRecords",
]);

const POST_ACTIONS = new Set([
  "login",
  "logout",
  "setQuickPin",
  "quickPinStatus",
  "quickPinLogin",
  "quickLock",
  "disableQuickPin",
  "createUser",
  "resetUserPassword",
  "changeOwnPassword",
  "createProject",
  "updateProject",
  "deleteProject",
  "updateProjectEmployees",
  "uploadProjectServiceFile",
  "createEmployee",
  "updateEmployee",
  "deleteEmployee",
  "createDocument",
  "createSiteVisit",
  "saveBill",
  "createBill",
  "savePayment",
  "createPayment",
  "importLegacyBillingBatch",
  "createInvoice",
  "createPermission",
  "initializeErpSheets",
  "createErpRecord",
  "updateErpRecord",
]);

const QUICK_ACTIONS = new Set(["setQuickPin", "quickPinStatus", "quickPinLogin", "quickLock", "disableQuickPin"]);
const PUBLIC_GET_ACTIONS = new Set(["health", "getPublicTeam"]);

function requiredEnv() {
  if (!APPS_SCRIPT_URL) throw new Error("LAND_VIEW_API_URL is not configured.");
  if (!PROXY_SECRET) throw new Error("LAND_VIEW_PROXY_SECRET is not configured.");
}

function normalizeHost(value: string | null | undefined) {
  return String(value || "").split(":")[0].trim().toLowerCase();
}

function getRequestHost(request: NextRequest) {
  return normalizeHost(request.headers.get("host"));
}

function trustedVercelHosts() {
  return new Set(
    [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
      .map(normalizeHost)
      .filter(Boolean)
  );
}

function isAppHost(host: string) {
  return host === "app.landview.com.bd" || host === "localhost" || host === "127.0.0.1" || trustedVercelHosts().has(host);
}

function isPublicHost(host: string) {
  return host === "www.landview.com.bd" || host === "landview.com.bd";
}

function originAllowed(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) {
    if (process.env.NODE_ENV !== "production") return true;
    return request.headers.get("sec-fetch-site") === "same-origin";
  }
  try {
    const url = new URL(origin);
    const host = normalizeHost(url.hostname);
    return isAppHost(host) || isPublicHost(host);
  } catch {
    return false;
  }
}

function clientKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHmac("sha256", PROXY_SECRET).update(forwarded).digest("hex").slice(0, 32);
}

async function callBackend(payload: Record<string, unknown>) {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload),
    cache: "no-store",
    redirect: "follow",
  });
  const text = await response.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(/^\s*</.test(text) ? "Apps Script returned HTML instead of JSON." : "Apps Script returned invalid JSON.");
  }
  return { response, json };
}

function safeJson(json: any) {
  if (json?.data && typeof json.data === "object" && "token" in json.data) {
    const { token: _token, ...rest } = json.data;
    return { ...json, data: rest };
  }
  return json;
}

function backendResponse(status: number, json: any) {
  return NextResponse.json(safeJson(json), {
    status,
    headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" },
  });
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

function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE_NAME, token, cookieOptions(COOKIE_MAX_AGE_SECONDS));
}

function clearSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", cookieOptions(0));
}

function clearLockCookie(response: NextResponse) {
  response.cookies.set(QUICK_LOCK_COOKIE, "", cookieOptions(0));
}

function clearQuickPinCookies(response: NextResponse) {
  response.cookies.set(QUICK_PIN_COOKIE, "", cookieOptions(0));
  response.cookies.set(QUICK_DEVICE_COOKIE, "", cookieOptions(0));
  response.cookies.set(QUICK_USER_COOKIE, "", cookieOptions(0));
  response.cookies.set(QUICK_LOCK_COOKIE, "", cookieOptions(0));
}

function hmac(value: string) {
  return createHmac("sha256", PROXY_SECRET).update(value).digest("hex");
}

function pinVerifier(pin: string, deviceId: string) {
  return hmac(`landview-quick-pin-v1|${deviceId}|${pin}`);
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

function quickConfigured(request: NextRequest) {
  return Boolean(
    request.cookies.get(QUICK_PIN_COOKIE)?.value &&
    request.cookies.get(QUICK_DEVICE_COOKIE)?.value &&
    request.cookies.get(QUICK_USER_COOKIE)?.value
  );
}

async function handleQuickAction(request: NextRequest, action: string, input: Record<string, unknown>) {
  const sessionToken = request.cookies.get(COOKIE_NAME)?.value || "";

  if (action === "quickPinStatus") {
    return NextResponse.json({
      success: true,
      data: {
        configured: quickConfigured(request),
        locked: request.cookies.get(QUICK_LOCK_COOKIE)?.value === "1",
      },
    });
  }

  if (action === "setQuickPin") {
    const pin = String(input.pin || "").trim();
    if (!/^\d{6}$/.test(pin)) {
      return NextResponse.json({ success: false, error: "Quick PIN must be exactly 6 digits." }, { status: 400 });
    }
    if (!sessionToken) {
      return NextResponse.json({ success: false, error: "Sign in normally before setting a Quick PIN." }, { status: 401 });
    }

    const { json } = await callBackend({
      action: "getSession",
      token: sessionToken,
      proxySecret: PROXY_SECRET,
      _clientKey: clientKey(request),
    });
    const user = json?.data?.user;
    const role = String(user?.role || user?.Role || "").trim().toLowerCase();
    if (!json?.success || !user || (role !== "admin" && role !== "manager")) {
      return NextResponse.json({ success: false, error: "Quick PIN is available only to an administrator." }, { status: 403 });
    }

    const deviceId = randomBytes(32).toString("hex");
    const verifier = pinVerifier(pin, deviceId);
    const response = NextResponse.json({ success: true, data: { configured: true } });
    response.cookies.set(QUICK_DEVICE_COOKIE, deviceId, cookieOptions(QUICK_PIN_MAX_AGE_SECONDS));
    response.cookies.set(QUICK_PIN_COOKIE, verifier, cookieOptions(QUICK_PIN_MAX_AGE_SECONDS));
    response.cookies.set(QUICK_USER_COOKIE, signQuickUser(user), cookieOptions(QUICK_PIN_MAX_AGE_SECONDS));
    clearLockCookie(response);
    return response;
  }

  if (action === "quickLock") {
    if (!quickConfigured(request) || !sessionToken) {
      return NextResponse.json({ success: false, error: "Set up Quick PIN first." }, { status: 400 });
    }
    const response = NextResponse.json({ success: true, data: { locked: true } });
    response.cookies.set(QUICK_LOCK_COOKIE, "1", cookieOptions(QUICK_PIN_MAX_AGE_SECONDS));
    return response;
  }

  if (action === "quickPinLogin") {
    const pin = String(input.pin || "").trim();
    const deviceId = request.cookies.get(QUICK_DEVICE_COOKIE)?.value || "";
    const storedVerifier = request.cookies.get(QUICK_PIN_COOKIE)?.value || "";
    const quickUser = readQuickUser(request.cookies.get(QUICK_USER_COOKIE)?.value);
    if (!/^\d{6}$/.test(pin) || !deviceId || !storedVerifier || !quickUser || !sessionToken) {
      return NextResponse.json({ success: false, error: "Quick access is unavailable. Use your normal login." }, { status: 401 });
    }

    const expected = pinVerifier(pin, deviceId);
    if (!secureEqual(expected, storedVerifier)) {
      return NextResponse.json({ success: false, error: "Incorrect Quick PIN." }, { status: 401 });
    }

    const role = String(quickUser.role || quickUser.Role || "").trim().toLowerCase();
    if (role !== "admin" && role !== "manager") {
      return NextResponse.json({ success: false, error: "Quick PIN is restricted to administrators." }, { status: 403 });
    }

    const response = NextResponse.json({ success: true, data: { user: quickUser } });
    clearLockCookie(response);
    return response;
  }

  if (action === "disableQuickPin") {
    if (!sessionToken) {
      return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
    }
    const response = NextResponse.json({ success: true, data: { configured: false } });
    clearQuickPinCookies(response);
    return response;
  }

  return NextResponse.json({ success: false, error: "Unsupported quick access action." }, { status: 400 });
}

async function handle(request: NextRequest, method: "GET" | "POST") {
  try {
    requiredEnv();
    let input: Record<string, unknown> = {};
    if (method === "GET") {
      request.nextUrl.searchParams.forEach((value, key) => { input[key] = value; });
    } else {
      try {
        input = await request.json();
      } catch {
        return NextResponse.json({ success: false, error: "Invalid JSON request." }, { status: 400 });
      }
    }

    const action = String(input.action || "").trim();
    const allowedActions = method === "GET" ? GET_ACTIONS : POST_ACTIONS;
    if (!allowedActions.has(action)) {
      return NextResponse.json({ success: false, error: "Unsupported action." }, { status: 405 });
    }

    const host = getRequestHost(request);
    if (isPublicHost(host)) {
      if (method !== "GET" || !PUBLIC_GET_ACTIONS.has(action)) {
        return NextResponse.json({ success: false, error: "Not found." }, { status: 404 });
      }
    } else if (!isAppHost(host)) {
      return NextResponse.json({ success: false, error: "Not found." }, { status: 404 });
    }

    if (method === "POST" && !originAllowed(request)) {
      return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    }

    if (method === "POST" && QUICK_ACTIONS.has(action)) {
      return handleQuickAction(request, action, input);
    }

    if (request.cookies.get(QUICK_LOCK_COOKIE)?.value === "1" && action !== "login") {
      return NextResponse.json({ success: false, error: "Workspace locked. Enter your Quick PIN." }, { status: 423 });
    }

    delete input.token;
    delete input.proxySecret;
    delete input._clientKey;

    const token = request.cookies.get(COOKIE_NAME)?.value || "";
    const payload: Record<string, unknown> = {
      ...input,
      action,
      proxySecret: PROXY_SECRET,
      _clientKey: clientKey(request),
    };
    if (token && action !== "login") payload.token = token;

    const { response: backend, json } = await callBackend(payload);
    const out = backendResponse(backend.ok ? 200 : backend.status, json);
    const returnedToken = String(json?.data?.token || "");

    if (json?.success && returnedToken && (action === "login" || action === "changeOwnPassword")) {
      setSessionCookie(out, returnedToken);
      clearLockCookie(out);
    }
    if (action === "logout" || (!json?.success && /unauthorized|session expired/i.test(String(json?.error || json?.message || "")))) {
      clearSessionCookie(out);
      if (action === "logout") clearQuickPinCookies(out);
    }
    return out;
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to reach LAND VIEW backend." }, { status: 502 });
  }
}

export async function GET(request: NextRequest) { return handle(request, "GET"); }
export async function POST(request: NextRequest) { return handle(request, "POST"); }
