import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { employeeCodeOf, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
const MAX_ACCURACY_M = 100;
const VERIFIED_M = 100;
const NEAR_M = 250;

function text(value: unknown, max = 1000) { return String(value ?? "").trim().slice(0, max); }
function numberValue(value: unknown) { const n = Number(String(value ?? "").trim()); return Number.isFinite(n) ? n : null; }
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}
function ok(data: unknown) {
  return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } });
}
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const rad = (n: number) => n * Math.PI / 180;
  const r = 6371000;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function publicCheck(row: Row | undefined) {
  if (!row) return null;
  return {
    id: row.id || "",
    requestedBy: row.requested_by || "Management",
    requestedAt: row.requested_at || "",
    expiresAt: row.expires_at || "",
    status: row.status || "",
    responseNote: row.response_note || "",
  };
}
async function requireEmployee(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("SESSION_EXPIRED");
  if (roleOf(user) !== "employee") throw new Error("EMPLOYEE_REQUIRED");
  const employeeCode = text(employeeCodeOf(user), 120).toUpperCase();
  if (!employeeCode) throw new Error("EMPLOYEE_NOT_LINKED");
  return { user, employeeCode };
}

export async function GET(request: NextRequest) {
  try {
    const { employeeCode } = await requireEmployee(request);
    const rows = await selectRows("employee_location_checks", { filters: { employee_code: employeeCode }, order: "requested_at:desc", limit: 1 });
    const row = rows[0];
    if (!row) return ok(null);
    if (row.status === "PENDING" && new Date(row.expires_at).getTime() <= Date.now()) {
      const saved = await updateRows("employee_location_checks", { id: row.id }, {
        status: "EXPIRED",
        response_note: "Location-check window expired before the employee responded.",
        updated_at: new Date().toISOString(),
      });
      return ok(publicCheck(saved[0] || { ...row, status: "EXPIRED" }));
    }
    return ok(publicCheck(row));
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "SESSION_EXPIRED") return fail("Employee session expired.", 401);
    if (code === "EMPLOYEE_REQUIRED") return fail("Employee access is required.", 403);
    if (code === "EMPLOYEE_NOT_LINKED") return fail("Employee account is not linked to an employee ID.", 403);
    return fail(code || "Could not load location request.", 500);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return fail("Invalid request origin.", 403);
  try {
    const { employeeCode } = await requireEmployee(request);
    const body = await request.json() as Row;
    const checkId = text(body.checkId, 100);
    const action = text(body.action, 30).toLowerCase();
    if (!checkId) return fail("Location check ID is required.", 400);

    const rows = await selectRows("employee_location_checks", { filters: { id: checkId }, limit: 1 });
    const check = rows[0];
    if (!check || text(check.employee_code).toUpperCase() !== employeeCode) return fail("Location check was not found for this employee.", 404);
    if (check.status !== "PENDING") return fail("This location check is no longer waiting for a response.", 409);
    if (new Date(check.expires_at).getTime() <= Date.now()) {
      await updateRows("employee_location_checks", { id: check.id }, { status: "EXPIRED", response_note: "Location-check window expired.", updated_at: new Date().toISOString() });
      return fail("This location check has expired. Management can request a new one.", 409);
    }

    const now = new Date().toISOString();
    if (action === "deny") {
      const saved = await updateRows("employee_location_checks", { id: check.id }, {
        status: "DENIED",
        responded_at: now,
        response_note: text(body.reason, 500) || "Employee did not grant device location access.",
        updated_at: now,
      });
      return ok({ status: "DENIED", check: publicCheck(saved[0]) });
    }
    if (action !== "respond") return fail("Unsupported location-check action.", 400);

    const latitude = numberValue(body.latitude);
    const longitude = numberValue(body.longitude);
    const accuracy = numberValue(body.accuracyM);
    if (latitude === null || longitude === null || accuracy === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return fail("A valid fresh device location is required.", 400);
    }
    if (accuracy > MAX_ACCURACY_M) {
      const saved = await updateRows("employee_location_checks", { id: check.id }, {
        status: "ERROR",
        accuracy_m: accuracy,
        responded_at: now,
        response_note: `GPS accuracy was too low (±${Math.round(accuracy)} m). Move to an open area and request another check.`,
        updated_at: now,
      });
      return ok({ status: "ERROR", check: publicCheck(saved[0]) });
    }

    const projects = await selectRows("projects", { order: "project_code:asc", limit: 10000 });
    let nearest: { row: Row; distance: number } | null = null;
    for (const project of projects) {
      const siteLat = numberValue(project.site_latitude);
      const siteLng = numberValue(project.site_longitude);
      if (siteLat === null || siteLng === null || Math.abs(siteLat) > 90 || Math.abs(siteLng) > 180) continue;
      const distance = distanceMeters(latitude, longitude, siteLat, siteLng);
      if (!nearest || distance < nearest.distance) nearest = { row: project, distance };
    }

    const distance = nearest?.distance ?? null;
    const status = distance !== null && distance <= VERIFIED_M ? "VERIFIED_SITE" : distance !== null && distance <= NEAR_M ? "NEAR_SITE" : "NOT_NEAR_SITE";
    const matched = status === "VERIFIED_SITE" || status === "NEAR_SITE" ? nearest?.row : null;
    const responseNote = status === "VERIFIED_SITE"
      ? "Employee is within 100 m of a registered LAND VIEW project site."
      : status === "NEAR_SITE"
        ? "Employee is within 250 m of a registered LAND VIEW project site."
        : "Employee is not near any registered LAND VIEW project site.";

    const saved = await updateRows("employee_location_checks", { id: check.id }, {
      status,
      accuracy_m: accuracy,
      matched_project_id: matched?.id || null,
      matched_project_code: matched?.project_code || null,
      matched_project_name: matched ? (matched.project_name || matched.client_name_snapshot || matched.project_code || null) : null,
      distance_m: matched && distance !== null ? Math.round(distance * 10) / 10 : null,
      responded_at: now,
      response_note: responseNote,
      updated_at: now,
    });

    return ok({
      status,
      matchedProjectCode: matched?.project_code || "",
      matchedProjectName: matched ? (matched.project_name || matched.client_name_snapshot || matched.project_code || "") : "",
      distanceM: matched && distance !== null ? Math.round(distance * 10) / 10 : null,
      accuracyM: accuracy,
      responseNote,
      check: publicCheck(saved[0]),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "SESSION_EXPIRED") return fail("Employee session expired.", 401);
    if (code === "EMPLOYEE_REQUIRED") return fail("Employee access is required.", 403);
    if (code === "EMPLOYEE_NOT_LINKED") return fail("Employee account is not linked to an employee ID.", 403);
    return fail(code || "Could not submit employee location verification.", 500);
  }
}
