import { NextRequest, NextResponse } from "next/server";
import {
  ACTING_USER_COOKIE,
  readSignedActingWorkspaceUser,
  requireOriginalLocalSession,
  roleOf,
  signActingWorkspaceUser,
} from "@/lib/local-session";
import { selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TARGET_EMPLOYEE_ID = "EMP-0002";

type Row = Record<string, any>;

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

function cookieOptions(maxAge?: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    ...(typeof maxAge === "number" ? { maxAge } : {}),
  };
}

function ok(data: unknown) {
  return NextResponse.json({ success: true, data }, { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } });
}

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

async function requireMainAdmin(request: NextRequest) {
  const original = await requireOriginalLocalSession(request) as Row | null;
  if (!original) throw new Error("SESSION_EXPIRED");
  if (roleOf(original) !== "admin") throw new Error("ADMIN_REQUIRED");
  return original;
}

async function employeeIdentity() {
  const rows = await selectRows("employees", { filters: { employee_code: TARGET_EMPLOYEE_ID }, limit: 1 });
  const employee = rows[0] as Row | undefined;
  if (!employee) throw new Error("EMPLOYEE_NOT_FOUND");
  const name = String(employee.name || TARGET_EMPLOYEE_ID).trim() || TARGET_EMPLOYEE_ID;
  return {
    role: "employee",
    Role: "Employee",
    employeeId: TARGET_EMPLOYEE_ID,
    Employee_ID: TARGET_EMPLOYEE_ID,
    userId: TARGET_EMPLOYEE_ID,
    User_ID: TARGET_EMPLOYEE_ID,
    name,
    Name: name,
    designation: String(employee.designation || "").trim(),
    department: String(employee.department || "").trim(),
    phoneNumber: String(employee.phone_number || "").trim(),
    email: String(employee.email || "").trim(),
    actingFromAdmin: true,
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireMainAdmin(request);
    const acting = readSignedActingWorkspaceUser(request.cookies.get(ACTING_USER_COOKIE)?.value);
    return ok({
      mode: acting ? "employee" : "admin",
      employeeId: TARGET_EMPLOYEE_ID,
      actingUser: acting || null,
    });
  } catch (error: any) {
    const code = String(error?.message || "");
    return fail(code === "SESSION_EXPIRED" ? "Session expired." : "Main Admin access is required.", code === "SESSION_EXPIRED" ? 401 : 403);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail("Invalid request origin.", 403);
  try {
    const original = await requireMainAdmin(request);
    const body = await request.json().catch(() => ({})) as Row;
    const action = String(body?.action || "").trim().toLowerCase();

    if (action === "employee") {
      const actingUser = await employeeIdentity();
      const response = ok({ mode: "employee", employeeId: TARGET_EMPLOYEE_ID, user: actingUser });
      response.cookies.set(ACTING_USER_COOKIE, signActingWorkspaceUser(actingUser), cookieOptions());
      return response;
    }

    if (action === "admin") {
      const response = ok({ mode: "admin", employeeId: TARGET_EMPLOYEE_ID, user: original });
      response.cookies.set(ACTING_USER_COOKIE, "", cookieOptions(0));
      return response;
    }

    return fail("Unsupported role switch action.", 400);
  } catch (error: any) {
    const code = String(error?.message || "");
    if (code === "SESSION_EXPIRED") return fail("Session expired.", 401);
    if (code === "ADMIN_REQUIRED") return fail("Main Admin access is required.", 403);
    if (code === "EMPLOYEE_NOT_FOUND") return fail(`${TARGET_EMPLOYEE_ID} was not found in the employee register.`, 404);
    return fail(String(error?.message || "Could not switch workspace role."), 500);
  }
}
