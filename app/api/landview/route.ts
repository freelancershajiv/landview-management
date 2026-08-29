import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "landview_session";
const COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;

const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";

const GET_ACTIONS = new Set([
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
  "createInvoice",
  "createPermission",
  "initializeErpSheets",
  "createErpRecord",
  "updateErpRecord",
]);

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

function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
    priority: "high",
  });
}

function clearSessionCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
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
    }
    if (action === "logout" || (!json?.success && /unauthorized|session expired/i.test(String(json?.error || json?.message || "")))) {
      clearSessionCookie(out);
    }
    return out;
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Unable to reach LAND VIEW backend." }, { status: 502 });
  }
}

export async function GET(request: NextRequest) { return handle(request, "GET"); }
export async function POST(request: NextRequest) { return handle(request, "POST"); }
