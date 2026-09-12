import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "landview_session";
const QUICK_USER_COOKIE = "landview_quick_user";
const QUICK_LOCK_COOKIE = "landview_quick_locked";
const TRUSTED_DEVICE_COOKIE = "landview_trusted_device";
const COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;
const QUICK_META_MAX_AGE_SECONDS = 3650 * 24 * 60 * 60;
const TRUSTED_DEVICE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const QUICK_PIN_PREFIX = "QPIN_V1";

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
  "getChairmanPendingApprovals",
]);

const POST_ACTIONS = new Set([
  "login",
  "logout",
  "setQuickPin",
  "quickPinStatus",
  "quickPinLogin",
  "quickLock",
  "trustDevice",
  "untrustDevice",
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
  "reviewChairmanPendingApproval",
]);

const QUICK_ACTIONS = new Set(["setQuickPin", "quickPinStatus", "quickPinLogin", "quickLock", "trustDevice", "untrustDevice"]);
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

function clearQuickMetaCookies(response: NextResponse) {
  response.cookies.set(QUICK_USER_COOKIE, "", cookieOptions(0));
  response.cookies.set(QUICK_LOCK_COOKIE, "", cookieOptions(0));
}

function clearTrustedDeviceCookie(response: NextResponse) {
  response.cookies.set(TRUSTED_DEVICE_COOKIE, "", cookieOptions(0));
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

function userIdOf(user: Record<string, unknown> | null | undefined) {
  return String(user?.userId || user?.User_ID || "").trim();
}

function roleOf(user: Record<string, unknown> | null | undefined) {
  return String(user?.role || user?.Role || "").trim().toLowerCase();
}

function encodeUserId(userId: string) {
  return Buffer.from(userId, "utf8").toString("base64url");
}

function permanentPinVerifier(userId: string, pin: string, salt: string) {
  return hmac(`${QUICK_PIN_PREFIX}|${userId}|${salt}|${pin}`);
}

function makePermanentPinId(userId: string, pin: string) {
  const salt = randomBytes(20).toString("hex");
  const verifier = permanentPinVerifier(userId, pin, salt);
  return `${QUICK_PIN_PREFIX}:${encodeUserId(userId)}:${salt}:${verifier}`;
}

function parsePermanentPinId(value: unknown) {
  const text = String(value || "").trim();
  const parts = text.split(":");
  if (parts.length !== 4 || parts[0] !== QUICK_PIN_PREFIX) return null;
  try {
    const userId = Buffer.from(parts[1], "base64url").toString("utf8");
    if (!userId || !/^[a-f0-9]{40}$/i.test(parts[2]) || !/^[a-f0-9]{64}$/i.test(parts[3])) return null;
    return { userId, salt: parts[2], verifier: parts[3] };
  } catch {
    return null;
  }
}

type TrustedDevicePayload = {
  user: Record<string, unknown>;
  pin: { userId: string; salt: string; verifier: string };
  expiresAt: number;
};

function signTrustedDevice(payload: TrustedDevicePayload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${hmac(`trusted-device-v1|${encoded}`)}`;
}

function readTrustedDevice(value: string | undefined): TrustedDevicePayload | null {
  const text = String(value || "");
  const dot = text.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = text.slice(0, dot);
  const signature = text.slice(dot + 1);
  if (!secureEqual(signature, hmac(`trusted-device-v1|${payload}`))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as TrustedDevicePayload;
    if (!parsed?.user || !parsed?.pin || !parsed?.expiresAt || Date.now() >= Number(parsed.expiresAt)) return null;
    if (userIdOf(parsed.user) !== parsed.pin.userId) return null;
    if (roleOf(parsed.user) !== "admin" && roleOf(parsed.user) !== "manager") return null;
    return parsed;
  } catch {
    return null;
  }
}

async function backendForSession(request: NextRequest, action: string, extra: Record<string, unknown> = {}) {
  const token = request.cookies.get(COOKIE_NAME)?.value || "";
  if (!token) return { success: false, error: "Session expired." } as any;
  const { json } = await callBackend({
    ...extra,
    action,
    token,
    proxySecret: PROXY_SECRET,
    _clientKey: clientKey(request),
  });
  return json;
}

async function currentAdminUser(request: NextRequest) {
  const signed = readQuickUser(request.cookies.get(QUICK_USER_COOKIE)?.value);
  if (signed && (roleOf(signed) === "admin" || roleOf(signed) === "manager") && userIdOf(signed)) return signed;

  const json = await backendForSession(request, "getSession");
  const user = json?.data?.user;
  const role = roleOf(user);
  if (!json?.success || !user || (role !== "admin" && role !== "manager")) return null;
  return user as Record<string, unknown>;
}

async function permanentPinRecord(request: NextRequest, userId: string) {
  const json = await backendForSession(request, "getPermissions");
  if (!json?.success || !Array.isArray(json?.data)) return null;
  for (let i = json.data.length - 1; i >= 0; i--) {
    const row = json.data[i] || {};
    const parsed = parsePermanentPinId(row.Permission_ID || row["Permission ID"]);
    if (parsed && parsed.userId === userId) return parsed;
  }
  return null;
}

async function mintTrustedBackendSession(request: NextRequest, userId: string) {
  const { json } = await callBackend({
    action: "getPublicProjects",
    _trustedPinSessionUserId: userId,
    proxySecret: PROXY_SECRET,
    _clientKey: clientKey(request),
  });
  return json;
}

async function handleQuickAction(request: NextRequest, action: string, input: Record<string, unknown>) {
  const sessionToken = request.cookies.get(COOKIE_NAME)?.value || "";
  const trusted = readTrustedDevice(request.cookies.get(TRUSTED_DEVICE_COOKIE)?.value);

  if (action === "quickPinStatus") {
    if (trusted) {
      return NextResponse.json({
        success: true,
        data: {
          configured: true,
          trusted: true,
          expiresAt: trusted.expiresAt,
          locked: request.cookies.get(QUICK_LOCK_COOKIE)?.value === "1",
        },
      });
    }

    if (!sessionToken) {
      return NextResponse.json({ success: true, data: { configured: false, trusted: false, locked: false } });
    }
    const user = await currentAdminUser(request);
    if (!user) return NextResponse.json({ success: true, data: { configured: false, trusted: false, locked: false } });
    const userId = userIdOf(user);
    const record = await permanentPinRecord(request, userId);
    const response = NextResponse.json({
      success: true,
      data: { configured: Boolean(record), trusted: false, locked: request.cookies.get(QUICK_LOCK_COOKIE)?.value === "1" },
    });
    response.cookies.set(QUICK_USER_COOKIE, signQuickUser(user), cookieOptions(QUICK_META_MAX_AGE_SECONDS));
    return response;
  }

  if (action === "setQuickPin") {
    const pin = String(input.pin || "").trim();
    if (!/^\d{6}$/.test(pin)) {
      return NextResponse.json({ success: false, error: "Quick PIN must be exactly 6 digits." }, { status: 400 });
    }
    if (!sessionToken) {
      return NextResponse.json({ success: false, error: "Sign in normally before setting your permanent PIN." }, { status: 401 });
    }
    const user = await currentAdminUser(request);
    if (!user) return NextResponse.json({ success: false, error: "Permanent PIN is available only to Admin or Manager accounts." }, { status: 403 });
    const userId = userIdOf(user);
    const existing = await permanentPinRecord(request, userId);
    if (existing) {
      return NextResponse.json({ success: false, error: "Your permanent Admin PIN is already configured." }, { status: 409 });
    }

    const permissionId = makePermanentPinId(userId, pin);
    const json = await backendForSession(request, "createPermission", {
      Permission_ID: permissionId,
      User_ID: userId,
      Role: "Admin Quick PIN",
      Permission: "Permanent Admin PIN",
      Status: "Active",
      Created_At: new Date().toISOString(),
    });
    if (!json?.success) {
      return NextResponse.json({ success: false, error: String(json?.error || json?.message || "Could not save permanent Admin PIN.") }, { status: 502 });
    }

    const response = NextResponse.json({ success: true, data: { configured: true, permanent: true } });
    response.cookies.set(QUICK_USER_COOKIE, signQuickUser(user), cookieOptions(QUICK_META_MAX_AGE_SECONDS));
    clearLockCookie(response);
    return response;
  }

  if (action === "trustDevice") {
    if (!sessionToken) return NextResponse.json({ success: false, error: "Sign in normally before trusting this device." }, { status: 401 });
    const user = await currentAdminUser(request);
    if (!user) return NextResponse.json({ success: false, error: "Trusted-device PIN login is available only to Admin or Manager accounts." }, { status: 403 });
    const userId = userIdOf(user);
    const record = await permanentPinRecord(request, userId);
    if (!record) return NextResponse.json({ success: false, error: "Create your permanent Admin PIN first." }, { status: 400 });

    const expiresAt = Date.now() + TRUSTED_DEVICE_MAX_AGE_SECONDS * 1000;
    const payload: TrustedDevicePayload = { user, pin: record, expiresAt };
    const response = NextResponse.json({ success: true, data: { trusted: true, expiresAt } });
    response.cookies.set(TRUSTED_DEVICE_COOKIE, signTrustedDevice(payload), cookieOptions(TRUSTED_DEVICE_MAX_AGE_SECONDS));
    response.cookies.set(QUICK_USER_COOKIE, signQuickUser(user), cookieOptions(TRUSTED_DEVICE_MAX_AGE_SECONDS));
    return response;
  }

  if (action === "untrustDevice") {
    const response = NextResponse.json({ success: true, data: { trusted: false } });
    clearTrustedDeviceCookie(response);
    clearLockCookie(response);
    return response;
  }

  if (action === "quickLock") {
    if (!sessionToken) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    const user = await currentAdminUser(request);
    if (!user) return NextResponse.json({ success: false, error: "Admin access required." }, { status: 403 });
    const record = await permanentPinRecord(request, userIdOf(user));
    if (!record) return NextResponse.json({ success: false, error: "Set your permanent Admin PIN first." }, { status: 400 });
    if (!trusted || userIdOf(trusted.user) !== userIdOf(user)) {
      return NextResponse.json({ success: false, error: "Trust this device first. Trusted-device PIN access lasts 7 days." }, { status: 400 });
    }

    const response = NextResponse.json({ success: true, data: { locked: true } });
    response.cookies.set(QUICK_USER_COOKIE, signQuickUser(user), cookieOptions(TRUSTED_DEVICE_MAX_AGE_SECONDS));
    response.cookies.set(QUICK_LOCK_COOKIE, "1", cookieOptions(TRUSTED_DEVICE_MAX_AGE_SECONDS));
    return response;
  }

  if (action === "quickPinLogin") {
    const pin = String(input.pin || "").trim();
    if (!/^\d{6}$/.test(pin)) {
      return NextResponse.json({ success: false, error: "Enter your 6-digit Admin PIN." }, { status: 400 });
    }
    if (!trusted) {
      return NextResponse.json({ success: false, error: "This device is not trusted or its 7-day trust has expired. Sign in normally and trust it again." }, { status: 401 });
    }

    const userId = userIdOf(trusted.user);
    const expected = permanentPinVerifier(userId, pin, trusted.pin.salt);
    if (!secureEqual(expected, trusted.pin.verifier)) {
      return NextResponse.json({ success: false, error: "Incorrect Admin PIN." }, { status: 401 });
    }

    const json = await mintTrustedBackendSession(request, userId);
    const token = String(json?.data?.token || "");
    const user = json?.data?.user || trusted.user;
    if (!json?.success || !token || !user) {
      return NextResponse.json({ success: false, error: String(json?.error || json?.message || "Could not create a secure Admin session.") }, { status: 401 });
    }

    const response = NextResponse.json({ success: true, data: { user, trusted: true, expiresAt: trusted.expiresAt } });
    setSessionCookie(response, token);
    response.cookies.set(QUICK_USER_COOKIE, signQuickUser(user), cookieOptions(Math.max(1, Math.floor((trusted.expiresAt - Date.now()) / 1000))));
    clearLockCookie(response);
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
      return NextResponse.json({ success: false, error: "Workspace locked. Enter your Admin PIN." }, { status: 423 });
    }

    delete input.token;
    delete input.proxySecret;
    delete input._clientKey;
    delete input._trustedPinSessionUserId;

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
      if (action === "logout") clearQuickMetaCookies(out);
    }
    return out;
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to reach LAND VIEW backend." }, { status: 502 });
  }
}

export async function GET(request: NextRequest) { return handle(request, "GET"); }
export async function POST(request: NextRequest) { return handle(request, "POST"); }
