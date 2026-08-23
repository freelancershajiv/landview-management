import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "landview_session";
const COOKIE_MAX_AGE_SECONDS = 12 * 60 * 60;

const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";

// ============================================================
// ALLOWED API ACTIONS
// ============================================================

const GET_ACTIONS = new Set([
  "health",

  // Public website
  "getPublicTeam",

  // Authentication/session
  "getSession",

  // Admin / employee / client data
  "getDashboard",
  "getUsers",
  "getProjects",
  "getProject",
  "getProjectEmployees",
  "getProjectDriveFolder",
  "getEmployees",
  "getDocuments",
  "getSiteVisits",
  "getBillingDashboard",
  "getProjectBilling",
  "getBillingRecords",
  "getPayments",
  "getInvoices",
  "getPermissions",
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
]);

// Actions that the PUBLIC website is allowed to use.
const PUBLIC_GET_ACTIONS = new Set([
  "health",
  "getPublicTeam",
]);

// ============================================================
// ENVIRONMENT
// ============================================================

function requiredEnv() {
  if (!APPS_SCRIPT_URL) {
    throw new Error("LAND_VIEW_API_URL is not configured.");
  }

  if (!PROXY_SECRET) {
    throw new Error("LAND_VIEW_PROXY_SECRET is not configured.");
  }
}

// ============================================================
// HOST SECURITY
// ============================================================

function getRequestHost(request: NextRequest) {
  return (request.headers.get("host") || "")
    .split(":")[0]
    .toLowerCase();
}

function isAppHost(host: string) {
  if (
    host === "app.landview.com.bd" ||
    host === "localhost" ||
    host === "127.0.0.1"
  ) {
    return true;
  }

  const vercelHost = process.env.VERCEL_URL?.toLowerCase();

  return Boolean(vercelHost && host === vercelHost);
}

function isPublicHost(host: string) {
  return (
    host === "www.landview.com.bd" ||
    host === "landview.com.bd"
  );
}

// ============================================================
// ORIGIN SECURITY
// ============================================================

function originAllowed(request: NextRequest) {
  const origin = request.headers.get("origin");

  if (!origin) return true;

  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();

    return (
      host === "app.landview.com.bd" ||
      host === "www.landview.com.bd" ||
      host === "landview.com.bd" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === process.env.VERCEL_URL?.toLowerCase()
    );
  } catch {
    return false;
  }
}

// ============================================================
// CLIENT REQUEST KEY
// ============================================================

function clientKey(request: NextRequest) {
  const forwarded =
    request.headers
      .get("x-forwarded-for")
      ?.split(",")[0]
      ?.trim() || "unknown";

  return createHmac("sha256", PROXY_SECRET)
    .update(forwarded)
    .digest("hex")
    .slice(0, 32);
}

// ============================================================
// APPS SCRIPT REQUEST
// ============================================================

async function callBackend(
  payload: Record<string, unknown>
) {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=utf-8",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    redirect: "follow",
  });

  const text = await response.text();

  let json: any;

  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      /^\s*</.test(text)
        ? "Apps Script returned HTML instead of JSON."
        : "Apps Script returned invalid JSON."
    );
  }

  return {
    response,
    json,
  };
}

// ============================================================
// RESPONSE SANITIZATION
// ============================================================

function safeJson(json: any) {
  // Never expose the backend session token to browser JavaScript.
  if (
    json?.data &&
    typeof json.data === "object" &&
    "token" in json.data
  ) {
    const {
      token: _token,
      ...rest
    } = json.data;

    return {
      ...json,
      data: rest,
    };
  }

  return json;
}

function backendResponse(
  status: number,
  json: any
) {
  return NextResponse.json(
    safeJson(json),
    {
      status,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        Pragma: "no-cache",
      },
    }
  );
}

// ============================================================
// SESSION COOKIE
// ============================================================

function setSessionCookie(
  response: NextResponse,
  token: string
) {
  response.cookies.set(
    COOKIE_NAME,
    token,
    {
      httpOnly: true,
      secure:
        process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS,
      priority: "high",
    }
  );
}

function clearSessionCookie(
  response: NextResponse
) {
  response.cookies.set(
    COOKIE_NAME,
    "",
    {
      httpOnly: true,
      secure:
        process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    }
  );
}

// ============================================================
// MAIN REQUEST HANDLER
// ============================================================

async function handle(
  request: NextRequest,
  method: "GET" | "POST"
) {
  try {
    requiredEnv();

    // --------------------------------------------------------
    // Read request first so we know which action is requested.
    // --------------------------------------------------------

    let input: Record<string, unknown> = {};

    if (method === "GET") {
      request.nextUrl.searchParams.forEach(
        (value, key) => {
          input[key] = value;
        }
      );
    } else {
      try {
        input = await request.json();
      } catch {
        return NextResponse.json(
          {
            success: false,
            error: "Invalid JSON request.",
          },
          {
            status: 400,
          }
        );
      }
    }

    const action =
      String(input.action || "").trim();

    // --------------------------------------------------------
    // Validate action
    // --------------------------------------------------------

    const allowedActions =
      method === "GET"
        ? GET_ACTIONS
        : POST_ACTIONS;

    if (!allowedActions.has(action)) {
      return NextResponse.json(
        {
          success: false,
          error: "Unsupported action.",
        },
        {
          status: 405,
        }
      );
    }

    // --------------------------------------------------------
    // Host authorization
    // --------------------------------------------------------

    const host = getRequestHost(request);

    if (isPublicHost(host)) {
      // www.landview.com.bd may access ONLY explicitly public
      // GET actions.
      if (
        method !== "GET" ||
        !PUBLIC_GET_ACTIONS.has(action)
      ) {
        return NextResponse.json(
          {
            success: false,
            error: "Not found.",
          },
          {
            status: 404,
          }
        );
      }
    } else if (!isAppHost(host)) {
      return NextResponse.json(
        {
          success: false,
          error: "Not found.",
        },
        {
          status: 404,
        }
      );
    }

    // --------------------------------------------------------
    // POST origin protection
    // --------------------------------------------------------

    if (
      method === "POST" &&
      !originAllowed(request)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request origin.",
        },
        {
          status: 403,
        }
      );
    }

    // --------------------------------------------------------
    // Strip values browsers must never control
    // --------------------------------------------------------

    delete input.token;
    delete input.proxySecret;
    delete input._clientKey;

    // --------------------------------------------------------
    // Read secure session cookie
    // --------------------------------------------------------

    const token =
      request.cookies
        .get(COOKIE_NAME)
        ?.value || "";

    // --------------------------------------------------------
    // Build trusted backend payload
    // --------------------------------------------------------

    const payload:
      Record<string, unknown> = {
        ...input,
        action,
        proxySecret: PROXY_SECRET,
        _clientKey: clientKey(request),
      };

    if (
      token &&
      action !== "login"
    ) {
      payload.token = token;
    }

    // --------------------------------------------------------
    // Call Apps Script
    // --------------------------------------------------------

    const {
      response: backend,
      json,
    } = await callBackend(payload);

    const out = backendResponse(
      backend.ok
        ? 200
        : backend.status,
      json
    );

    // --------------------------------------------------------
    // Login/session handling
    // --------------------------------------------------------

    const returnedToken =
      String(json?.data?.token || "");

    if (
      json?.success &&
      returnedToken &&
      (
        action === "login" ||
        action === "changeOwnPassword"
      )
    ) {
      setSessionCookie(
        out,
        returnedToken
      );
    }

    // --------------------------------------------------------
    // Logout / expired session
    // --------------------------------------------------------

    if (
      action === "logout" ||
      (
        !json?.success &&
        /unauthorized|session expired/i.test(
          String(
            json?.error ||
            json?.message ||
            ""
          )
        )
      )
    ) {
      clearSessionCookie(out);
    }

    return out;

  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error:
          error?.message ||
          "Unable to reach LAND VIEW backend.",
      },
      {
        status: 502,
      }
    );
  }
}

// ============================================================
// ROUTES
// ============================================================

export async function GET(
  request: NextRequest
) {
  return handle(
    request,
    "GET"
  );
}

export async function POST(
  request: NextRequest
) {
  return handle(
    request,
    "POST"
  );
}