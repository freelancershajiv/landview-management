import { NextRequest, NextResponse } from "next/server";
import { GET as legacyGET, POST as legacyPOST } from "../landview/route";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { isAllowedRequestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

const MANAGEMENT = new Set(["admin", "manager"]);
const FINANCE = new Set(["admin", "manager", "accounts"]);
const PUBLIC_GET_ACTIONS = new Set(["health", "getPublicTeam"]);
const PUBLIC_POST_ACTIONS = new Set(["login"]);
const ADMIN_POST_ACTIONS = new Set([
  "createUser",
  "resetUserPassword",
  "deleteUser",
  "createPermission",
  "initializeRoleSecurity",
  "migrateModularDatabases",
  "disableModularDatabases",
  "terminateSession",
]);
const RETIRED_QUICK_ACTIONS = new Set([
  "setQuickPin",
  "quickPinStatus",
  "quickPinLogin",
  "quickLock",
  "trustDevice",
  "untrustDevice",
  "clearQuickPin",
]);

function text(value: unknown) {
  return String(value ?? "").trim();
}

function fail(error: string, status: number) {
  return NextResponse.json(
    { success: false, error },
    { status, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

async function authenticatedUser(request: NextRequest) {
  const user = await requireLocalSession(request);
  return user || null;
}

function moduleOf(input: Row) {
  return text(input.module).toLowerCase();
}

/**
 * Security gateway for the long-lived /api/landview compatibility router.
 * The legacy implementation still owns response compatibility, but known
 * pre-dispatch branches are authorized here before they can bypass the central
 * Supabase action guard.
 */
export async function GET(request: NextRequest) {
  const action = text(request.nextUrl.searchParams.get("action"));
  if (PUBLIC_GET_ACTIONS.has(action)) return legacyGET(request);

  const user = await authenticatedUser(request);
  if (!user) return fail("Session expired.", 401);
  const role = roleOf(user);

  if ((action === "getUsers" || action === "getPermissions") && role !== "admin") {
    return fail("Admin permission required.", 403);
  }

  if (action === "getFinanceSheet" && !FINANCE.has(role)) {
    return fail("Finance access is required.", 403);
  }

  if (action === "getErpRecords") {
    const module = text(request.nextUrl.searchParams.get("module")).toLowerCase();
    if ((module === "quotations" || module === "drawings") && !MANAGEMENT.has(role)) {
      return fail("Management access is required.", 403);
    }
  }

  return legacyGET(request);
}

export async function POST(request: NextRequest) {
  if (!isAllowedRequestOrigin(request)) return fail("Invalid request origin.", 403);

  const input = await request.clone().json().catch(() => null) as Row | null;
  if (!input) return fail("Invalid request.", 400);
  const action = text(input.action);

  if (PUBLIC_POST_ACTIONS.has(action)) return legacyPOST(request);

  // Logout is deliberately safe to call even if the access token has already
  // expired; the legacy handler clears every authentication cookie.
  if (action === "logout") return legacyPOST(request);

  if (RETIRED_QUICK_ACTIONS.has(action)) return legacyPOST(request);

  const user = await authenticatedUser(request);
  if (!user) return fail("Session expired.", 401);
  const role = roleOf(user);

  if (ADMIN_POST_ACTIONS.has(action) && role !== "admin") {
    return fail("Admin permission required.", 403);
  }

  if ((action === "createErpRecord" || action === "updateErpRecord") &&
      (moduleOf(input) === "quotations" || moduleOf(input) === "drawings") &&
      !MANAGEMENT.has(role)) {
    return fail("Management access is required.", 403);
  }

  return legacyPOST(request);
}
