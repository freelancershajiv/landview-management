import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf, userIdOf } from "@/lib/local-session";
import { insertRows, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
const MANAGE_ROLES = new Set(["admin", "manager"]);
const REQUEST_TTL_MS = 5 * 60 * 1000;

function text(value: unknown, max = 500) { return String(value ?? "").trim().slice(0, max); }
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}
function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status, headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } });
}
function publicCheck(row: Row | undefined) {
  if (!row) return null;
  return {
    id: row.id || "",
    employeeCode: row.employee_code || "",
    requestedBy: row.requested_by || "",
    requestedAt: row.requested_at || "",
    expiresAt: row.expires_at || "",
    status: row.status || "",
    accuracyM: row.accuracy_m ?? null,
    matchedProjectCode: row.matched_project_code || "",
    matchedProjectName: row.matched_project_name || "",
    distanceM: row.distance_m ?? null,
    respondedAt: row.responded_at || "",
    responseNote: row.response_note || "",
  };
}
async function requireManager(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("SESSION_EXPIRED");
  if (!MANAGE_ROLES.has(roleOf(user))) throw new Error("MANAGER_REQUIRED");
  return user;
}
async function expireIfNeeded(row: Row | undefined): Promise<Row | undefined> {
  if (!row || row.status !== "PENDING" || !row.expires_at) return row;
  if (new Date(row.expires_at).getTime() > Date.now()) return row;
  const saved = await updateRows("employee_location_checks", { id: row.id }, {
    status: "EXPIRED",
    response_note: "Employee did not respond before the location-check window expired.",
    updated_at: new Date().toISOString(),
  });
  return saved[0] || { ...row, status: "EXPIRED" };
}

export async function GET(request: NextRequest) {
  try {
    await requireManager(request);
    const employeeCode = text(request.nextUrl.searchParams.get("employeeCode"), 120).toUpperCase();
    if (employeeCode) {
      const rows = await selectRows("employee_location_checks", { filters: { employee_code: employeeCode }, order: "requested_at:desc", limit: 1 });
      return ok(publicCheck(await expireIfNeeded(rows[0])));
    }

    const [rows, employees] = await Promise.all([
      selectRows("employee_location_checks", { order: "requested_at:desc", limit: 1000 }),
      selectRows("employees", { filters: { status: "Active" }, order: "employee_code:asc", limit: 1000 }),
    ]);
    const latest = new Map<string, Row>();
    for (const row of rows) {
      const code = text(row.employee_code, 120).toUpperCase();
      if (!code || latest.has(code)) continue;
      const resolved = await expireIfNeeded(row);
      if (resolved) latest.set(code, resolved);
    }
    return ok({
      employees: employees.map((row) => ({ employeeCode: row.employee_code || "", employeeName: row.name || row.employee_code || "", designation: row.designation || "", status: row.status || "" })),
      checks: Array.from(latest.values()).map(publicCheck),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "SESSION_EXPIRED") return fail("Session expired.", 401);
    if (code === "MANAGER_REQUIRED") return fail("Admin or Manager access is required.", 403);
    return fail(code || "Could not load employee location check.", 500);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail("Invalid request origin.", 403);
  try {
    const user = await requireManager(request);
    const body = await request.json() as Row;
    const employeeCode = text(body.employeeCode || body.Employee_ID, 120).toUpperCase();
    if (!employeeCode) return fail("Employee ID is required.", 400);

    const employees = await selectRows("employees", { filters: { employee_code: employeeCode }, limit: 1 });
    const employee = employees[0];
    if (!employee) return fail("Employee was not found.", 404);
    if (text(employee.status || "Active").toLowerCase() !== "active") return fail("Location checks are only available for active employees.", 409);

    const previous = await selectRows("employee_location_checks", { filters: { employee_code: employeeCode, status: "PENDING" }, order: "requested_at:desc", limit: 20 });
    const now = new Date();
    for (const row of previous) {
      await updateRows("employee_location_checks", { id: row.id }, {
        status: "EXPIRED",
        response_note: "Superseded by a newer management location check.",
        updated_at: now.toISOString(),
      });
    }

    const actor = text((user as Row).employeeId || (user as Row).Employee_ID || userIdOf(user) || (user as Row).name || "Management", 160) || "Management";
    const saved = await insertRows("employee_location_checks", {
      employee_code: employeeCode,
      requested_by: actor,
      requested_at: now.toISOString(),
      expires_at: new Date(now.getTime() + REQUEST_TTL_MS).toISOString(),
      status: "PENDING",
      response_note: "Waiting for employee device location verification.",
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
    return ok(publicCheck(saved[0]), 201);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "SESSION_EXPIRED") return fail("Session expired.", 401);
    if (code === "MANAGER_REQUIRED") return fail("Admin or Manager access is required.", 403);
    return fail(code || "Could not request employee location.", 500);
  }
}
