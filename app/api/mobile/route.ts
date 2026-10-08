import { NextRequest, NextResponse } from "next/server";
import { supabaseAuthGateway } from "@/lib/supabase-auth";
import { insertRows, normalizeProjectCode, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function text(value: unknown, max = 2000) { return String(value ?? "").trim().slice(0, max); }
function roleOf(user: Row | null | undefined) { return text(user?.role || user?.Role, 40).toLowerCase(); }
function employeeCodeOf(user: Row | null | undefined) { return text(user?.employeeId || user?.Employee_ID || user?.userId || user?.User_ID, 120).toUpperCase(); }
function projectCodesOf(user: Row | null | undefined) {
  const raw = text(user?.projectIds || user?.Project_IDs, 5000);
  return Array.from(new Set(raw.split(/[;,\s]+/).map(normalizeProjectCode).filter(Boolean)));
}
function fail(error: string, status = 400) {
  return NextResponse.json({ success: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}
function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status, headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Mobile": "1" } });
}
function bearer(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}
async function mobileUser(request: NextRequest) {
  const token = bearer(request);
  if (!token) return null;
  const session = await supabaseAuthGateway<{ authenticated: boolean; user: Row }>("getUser", { accessToken: token });
  return session?.authenticated ? session.user : null;
}
function numberValue(value: unknown) {
  const n = Number(String(value ?? "").trim());
  return Number.isFinite(n) ? n : null;
}
function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (n: number) => n * Math.PI / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function employeeRow(user: Row) {
  const code = employeeCodeOf(user);
  if (!code) return null;
  const rows = await selectRows("employees", { filters: { employee_code: code }, limit: 1 });
  return rows[0] || null;
}

async function accessibleProjects(user: Row) {
  const role = roleOf(user);
  if (["admin", "manager", "accounts"].includes(role)) return await selectRows("projects", { order: "project_code:asc", limit: 5000 });
  if (role === "client") {
    const codes = projectCodesOf(user);
    return codes.length ? await selectRows("projects", { inFilters: { project_code: codes }, order: "project_code:asc", limit: 5000 }) : [];
  }
  if (role === "employee") {
    const employee = await employeeRow(user);
    if (!employee?.id) return [];
    const links = await selectRows("project_employees", { filters: { employee_id: employee.id }, limit: 5000 });
    const ids = Array.from(new Set(links.map((row) => row.project_id).filter(Boolean)));
    return ids.length ? await selectRows("projects", { inFilters: { id: ids }, order: "project_code:asc", limit: 5000 }) : [];
  }
  return [];
}

function projectView(row: Row) {
  return {
    id: row.id,
    projectId: row.project_code || "",
    projectName: row.project_name || "",
    clientName: row.client_name_snapshot || "",
    location: row.location || "",
    projectType: row.project_type || "",
    currentStage: row.design_stage_status !== "Completed" ? "Design Stage" : row.approval_stage_status !== "Completed" ? "Approval Stage" : row.supervision_stage_status !== "Completed" ? "Supervision / Construction" : "Completed",
    latitude: row.site_latitude ?? null,
    longitude: row.site_longitude ?? null,
    geofenceRadiusM: Number(row.site_geofence_radius_m || 150),
    updatedAt: row.updated_at || row.created_at || "",
  };
}

async function latestLocationCheck(code: string) {
  if (!code) return null;
  const rows = await selectRows("employee_location_checks", { filters: { employee_code: code }, order: "requested_at:desc", limit: 1 });
  const row = rows[0];
  if (!row) return null;
  if (row.status === "PENDING" && row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    const updated = await updateRows("employee_location_checks", { id: row.id }, { status: "EXPIRED", response_note: "Location check expired before response.", updated_at: new Date().toISOString() });
    return updated[0] || { ...row, status: "EXPIRED" };
  }
  return row;
}

function locationCheckView(row: Row | null | undefined) {
  if (!row) return null;
  return {
    id: row.id,
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

export async function GET(request: NextRequest) {
  try {
    const user = await mobileUser(request);
    if (!user) return fail("Authentication required.", 401);
    const role = roleOf(user);
    const view = text(request.nextUrl.searchParams.get("view"), 60).toLowerCase() || "dashboard";

    if (view === "session") return ok({ user });

    if (view === "projects") {
      const projects = await accessibleProjects(user);
      return ok(projects.map(projectView));
    }

    if (view === "employees") {
      if (!["admin", "manager"].includes(role)) return fail("Admin or Manager access is required.", 403);
      const employees = await selectRows("employees", { order: "employee_code:asc", limit: 1000 });
      return ok(employees.map((row) => ({ employeeId: row.employee_code || "", name: row.name || "", designation: row.designation || "", department: row.department || "", phone: row.phone_number || "", status: row.status || "" })));
    }

    if (view === "expenses") {
      let rows: Row[];
      if (role === "employee") rows = await selectRows("expenses", { filters: { requested_by_code: employeeCodeOf(user) }, order: "expense_date:desc", limit: 1000 });
      else if (["admin", "manager", "accounts"].includes(role)) rows = await selectRows("expenses", { order: "expense_date:desc", limit: 1000 });
      else return fail("Expense access is not available for this role.", 403);
      return ok(rows.map((row) => ({ expenseId: row.expense_code || row.id, date: row.expense_date || "", category: row.category || "", description: row.description || "", amount: Number(row.amount || 0), status: row.approval_status || row.status || "", projectId: row.file_id || "", paidTo: row.paid_to || "" })));
    }

    if (view === "site-visits") {
      let rows: Row[];
      if (role === "employee") {
        const employee = await employeeRow(user);
        rows = employee?.id ? await selectRows("site_visits", { filters: { employee_id: employee.id }, order: "visit_date:desc", limit: 1000 }) : [];
      } else if (["admin", "manager"].includes(role)) rows = await selectRows("site_visits", { order: "visit_date:desc", limit: 1000 });
      else {
        const projects = await accessibleProjects(user);
        const ids = projects.map((row) => row.id).filter(Boolean);
        rows = ids.length ? await selectRows("site_visits", { inFilters: { project_id: ids }, order: "visit_date:desc", limit: 1000 }) : [];
      }
      const projectIds = Array.from(new Set(rows.map((row) => row.project_id).filter(Boolean)));
      const projects = projectIds.length ? await selectRows("projects", { inFilters: { id: projectIds }, limit: 1000 }) : [];
      const projectMap = new Map(projects.map((row) => [String(row.id), row]));
      return ok(rows.map((row) => ({ visitId: row.visit_code || row.id, date: row.visit_date || "", projectId: projectMap.get(String(row.project_id))?.project_code || "", projectName: projectMap.get(String(row.project_id))?.project_name || "", purpose: row.visit_purpose || row.purpose || "", observations: row.observations || "", actionRequired: row.action_required || "", status: row.status || "", locationStatus: row.location_verification_status || "", distanceM: row.location_distance_m ?? null, accuracyM: row.location_accuracy_m ?? null })));
    }

    if (view === "location-check") {
      if (role === "employee") return ok(locationCheckView(await latestLocationCheck(employeeCodeOf(user))));
      if (!["admin", "manager"].includes(role)) return fail("Location checks require Admin or Manager access.", 403);
      const employeeCode = text(request.nextUrl.searchParams.get("employeeCode"), 120).toUpperCase();
      if (employeeCode) return ok(locationCheckView(await latestLocationCheck(employeeCode)));
      const rows = await selectRows("employee_location_checks", { order: "requested_at:desc", limit: 1000 });
      const seen = new Set<string>();
      const latest: Row[] = [];
      for (const row of rows) {
        const code = text(row.employee_code, 120).toUpperCase();
        if (!code || seen.has(code)) continue;
        seen.add(code);
        latest.push((await latestLocationCheck(code)) || row);
      }
      return ok(latest.map(locationCheckView));
    }

    if (view === "dashboard") {
      const projects = await accessibleProjects(user);
      const activeProjects = projects.filter((row) => row.design_stage_status !== "Completed" || row.approval_stage_status !== "Completed" || row.supervision_stage_status !== "Completed");
      let pendingLocationCheck = null;
      let recentVisits: Row[] = [];
      if (role === "employee") {
        pendingLocationCheck = locationCheckView(await latestLocationCheck(employeeCodeOf(user)));
        const employee = await employeeRow(user);
        if (employee?.id) recentVisits = await selectRows("site_visits", { filters: { employee_id: employee.id }, order: "visit_date:desc", limit: 5 });
      } else if (["admin", "manager"].includes(role)) {
        recentVisits = await selectRows("site_visits", { order: "visit_date:desc", limit: 5 });
      }
      return ok({
        user,
        role,
        stats: { projectCount: projects.length, activeProjectCount: activeProjects.length, recentVisitCount: recentVisits.length },
        projects: projects.slice(0, 8).map(projectView),
        pendingLocationCheck,
      });
    }

    return fail("Unknown mobile view.", 404);
  } catch (error: any) {
    const message = String(error?.message || "Mobile API request failed.");
    return fail(message, /auth|token|session/i.test(message) ? 401 : 500);
  }
}

export async function POST(request: NextRequest) {
  let body: Row;
  try { body = await request.json(); } catch { return fail("Invalid request body.", 400); }
  const action = text(body.action, 60).toLowerCase();

  try {
    if (action === "login") {
      const userId = text(body.userId || body.username, 120);
      const password = String(body.password || "");
      if (!userId || !password) return fail("User ID and password are required.", 400);
      const data = await supabaseAuthGateway("signIn", { userId, password });
      return ok(data);
    }
    if (action === "client-login") {
      const projectId = normalizeProjectCode(body.projectId);
      const mobile = text(body.mobile, 50);
      if (!projectId || !mobile) return fail("Project ID and mobile number are required.", 400);
      return ok(await supabaseAuthGateway("clientProjectLogin", { projectId, mobile }));
    }
    if (action === "refresh") {
      const refreshToken = String(body.refreshToken || "");
      if (!refreshToken) return fail("Refresh token is required.", 400);
      return ok(await supabaseAuthGateway("refresh", { refreshToken }));
    }

    const user = await mobileUser(request);
    if (!user) return fail("Authentication required.", 401);
    const role = roleOf(user);

    if (action === "request-location-check") {
      if (!["admin", "manager"].includes(role)) return fail("Admin or Manager access is required.", 403);
      const employeeCode = text(body.employeeCode, 120).toUpperCase();
      if (!employeeCode) return fail("Employee ID is required.", 400);
      const employees = await selectRows("employees", { filters: { employee_code: employeeCode, status: "Active" }, limit: 1 });
      if (!employees.length) return fail("Active employee not found.", 404);
      const previous = await selectRows("employee_location_checks", { filters: { employee_code: employeeCode, status: "PENDING" }, limit: 50 });
      const now = new Date();
      for (const row of previous) await updateRows("employee_location_checks", { id: row.id }, { status: "EXPIRED", response_note: "Superseded by a newer mobile location check.", updated_at: now.toISOString() });
      const actor = employeeCodeOf(user) || text(user.name || user.Name || user.userId || user.User_ID, 160) || "Management";
      const saved = await insertRows("employee_location_checks", { employee_code: employeeCode, requested_by: actor, requested_at: now.toISOString(), expires_at: new Date(now.getTime() + 5 * 60 * 1000).toISOString(), status: "PENDING", response_note: "Waiting for employee device location verification.", created_at: now.toISOString(), updated_at: now.toISOString() });
      return ok(locationCheckView(saved[0]), 201);
    }

    if (action === "respond-location-check") {
      if (role !== "employee") return fail("Employee access is required.", 403);
      const code = employeeCodeOf(user);
      const check = await latestLocationCheck(code);
      if (!check || check.status !== "PENDING") return fail("There is no active location check request.", 409);
      const lat = numberValue(body.latitude), lon = numberValue(body.longitude), accuracy = numberValue(body.accuracyM);
      const denied = body.denied === true;
      const now = new Date().toISOString();
      if (denied) {
        const saved = await updateRows("employee_location_checks", { id: check.id }, { status: "DENIED", response_note: "Employee denied device location access.", responded_at: now, updated_at: now });
        return ok(locationCheckView(saved[0] || { ...check, status: "DENIED", responded_at: now }));
      }
      if (lat === null || lon === null || accuracy === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) return fail("A valid GPS reading is required.", 400);
      if (accuracy > 100) {
        const saved = await updateRows("employee_location_checks", { id: check.id }, { status: "ERROR", accuracy_m: accuracy, response_note: "GPS accuracy was too low for verification.", responded_at: now, updated_at: now });
        return ok(locationCheckView(saved[0] || check));
      }
      const projects = await selectRows("projects", { limit: 5000 });
      const candidates = projects.map((project) => ({ project, lat: numberValue(project.site_latitude), lon: numberValue(project.site_longitude) })).filter((item) => item.lat !== null && item.lon !== null) as Array<{ project: Row; lat: number; lon: number }>;
      let nearest: { project: Row; distance: number } | null = null;
      for (const item of candidates) {
        const distance = distanceMeters(lat, lon, item.lat, item.lon);
        if (!nearest || distance < nearest.distance) nearest = { project: item.project, distance };
      }
      const distance = nearest?.distance ?? null;
      const status = distance === null ? "NOT_NEAR_SITE" : distance <= 100 ? "VERIFIED_SITE" : distance <= 250 ? "NEAR_SITE" : "NOT_NEAR_SITE";
      const matched = status === "NOT_NEAR_SITE" ? null : nearest?.project || null;
      const note = status === "VERIFIED_SITE" ? "Employee verified at a registered LAND VIEW site." : status === "NEAR_SITE" ? "Employee is near a registered LAND VIEW site." : "Employee is not near any registered LAND VIEW site.";
      const saved = await updateRows("employee_location_checks", { id: check.id }, { status, accuracy_m: accuracy, matched_project_id: matched?.id || null, matched_project_code: matched?.project_code || null, matched_project_name: matched?.project_name || null, distance_m: status === "NOT_NEAR_SITE" ? null : Math.round(Number(distance || 0)), responded_at: now, response_note: note, updated_at: now });
      return ok(locationCheckView(saved[0] || check));
    }

    return fail("Unknown mobile action.", 404);
  } catch (error: any) {
    const message = String(error?.message || "Mobile action failed.");
    return fail(message, /invalid login|credentials|auth|token|session/i.test(message) ? 401 : 500);
  }
}
