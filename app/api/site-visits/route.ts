import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { getSiteVisitMediaUrl, insertRows, normalizeProjectCode, selectRows, uploadSiteVisitMedia } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function clean(value: unknown, max = 2000) { return String(value ?? "").trim().slice(0, max); }
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function deny(message: string, status = 403) {
  return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
function ok(data: unknown) {
  return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } });
}
function employeeCodeOf(user: Row) { return clean(user?.employeeId || user?.Employee_ID || user?.userId || user?.User_ID, 120); }
function clientProjectCodesOf(user: Row) {
  const raw = clean(user?.projectIds || user?.Project_IDs || user?.project_ids, 5000);
  return Array.from(new Set(raw.split(/[;,\s]+/).map(normalizeProjectCode).filter(Boolean)));
}
function validImage(file: FormDataEntryValue | null): file is File {
  return !!file && typeof file === "object" && typeof (file as File).arrayBuffer === "function";
}
async function fileToBase64(file: File) {
  if (file.size > 8 * 1024 * 1024) throw new Error("Each site visit photo must be 8 MB or smaller.");
  const mime = String(file.type || "").toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) throw new Error("Only JPG, PNG and WebP site visit photos are allowed.");
  return { mime, base64: Buffer.from(await file.arrayBuffer()).toString("base64") };
}
async function accessibleProjects(user: Row) {
  const role = roleOf(user);
  if (role === "admin" || role === "manager") return { all: true, anyProject: true, employee: null as Row | null, ids: [] as string[], rows: [] as Row[] };

  if (role === "employee") {
    const employees = await selectRows("employees", { filters: { employee_code: employeeCodeOf(user) }, limit: 1 });
    if (!employees.length) throw new Error("Employee record not found.");
    // Site visits are field operations: an employee may visit any LAND VIEW project.
    const rows = await selectRows("projects", { order: "project_code:asc", limit: 5000 });
    return { all: false, anyProject: true, employee: employees[0], ids: rows.map(row => String(row.id)), rows };
  }

  if (role === "client") {
    const codes = clientProjectCodesOf(user);
    const rows = codes.length ? await selectRows("projects", { inFilters: { project_code: codes }, limit: 5000 }) : [];
    return { all: false, anyProject: false, employee: null as Row | null, ids: rows.map(row => String(row.id)), rows };
  }

  throw new Error("This account role cannot access Site Visits.");
}
async function loadVisits(user: Row, projectCode?: string) {
  const access = await accessibleProjects(user);
  const employeeId = roleOf(user) === "employee" ? access.employee?.id : null;
  if (roleOf(user) === "employee" && !employeeId) throw new Error("Employee record not found.");
  let rows: Row[] = [];
  let projects: Row[] = access.rows;

  if (access.all) {
    if (projectCode) {
      const project = await selectRows("projects", { filters: { project_code: normalizeProjectCode(projectCode) }, limit: 1 });
      if (!project.length) throw new Error("Project not found.");
      projects = project;
      rows = await selectRows("site_visits", { filters: { project_id: project[0].id }, order: "visit_date:desc", limit: 5000 });
    } else {
      rows = await selectRows("site_visits", { order: "visit_date:desc", limit: 5000 });
      projects = await selectRows("projects", { limit: 5000 });
    }
  } else {
    if (projectCode) {
      const wanted = normalizeProjectCode(projectCode);
      const project = projects.find(row => String(row.project_code || "").toUpperCase() === wanted);
      if (!project) throw new Error("Access denied for this project.");
      projects = [project];
      if (roleOf(user) === "employee") {
        rows = await selectRows("site_visits", { filters: { project_id: project.id, employee_id: employeeId }, order: "visit_date:desc", limit: 5000 });
      } else {
        rows = await selectRows("site_visits", { filters: { project_id: project.id }, order: "visit_date:desc", limit: 5000 });
      }
    } else if (roleOf(user) === "employee") {
      rows = await selectRows("site_visits", { filters: { employee_id: employeeId }, order: "visit_date:desc", limit: 5000 });
    } else if (access.ids.length) {
      rows = await selectRows("site_visits", { inFilters: { project_id: access.ids }, order: "visit_date:desc", limit: 5000 });
    }
  }

  const projectMap = new Map(projects.map(row => [String(row.id), row]));
  const employeeIds = Array.from(new Set(rows.map(row => row.employee_id).filter(Boolean)));
  const employees = employeeIds.length ? await selectRows("employees", { inFilters: { id: employeeIds }, limit: 1000 }) : [];
  const employeeMap = new Map(employees.map(row => [String(row.id), row]));

  return rows.map(row => {
    const project = projectMap.get(String(row.project_id));
    const employee = employeeMap.get(String(row.employee_id));
    return {
      Visit_ID: row.visit_code,
      Project_ID: project?.project_code || "",
      Project_Name: project?.project_name || "",
      Client_Name: project?.client_name_snapshot || "",
      Location: project?.location || "",
      Employee_ID: employee?.employee_code || "",
      Employee_Name: employee?.name || row.visited_by || "",
      Visit_Date: row.visit_date || "",
      Purpose: row.visit_purpose || row.purpose || "",
      Visited_By: row.visited_by || employee?.name || "",
      Observations: row.observations || "",
      Problem_Details: row.action_required || "",
      Action_Required: row.action_required || "",
      Status: row.status || "",
      Notes: row.notes || "",
      Visit_Photo_Available: Boolean(row.visit_photo_path),
      Problem_Photo_Available: Boolean(row.problem_photo_path),
      Created_At: row.created_at || "",
      Updated_At: row.updated_at || "",
    };
  });
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request) as Row | null;
    if (!user) return deny("Session expired.", 401);

    if (clean(request.nextUrl.searchParams.get("mode"), 40).toLowerCase() === "projects") {
      if (roleOf(user) !== "employee") return deny("Employee access is required.", 403);
      const projects = await selectRows("projects", { order: "project_code:asc", limit: 5000 });
      return ok(projects.map(project => ({
        Project_ID: project.project_code || "",
        Project_Name: project.project_name || "",
        Client_Name: project.client_name_snapshot || "",
        Location: project.location || "",
        Status: project.status || "",
      })));
    }

    const visits = await loadVisits(user, clean(request.nextUrl.searchParams.get("projectId"), 80) || undefined);
    return ok(visits);
  } catch (error: any) {
    const message = error?.message || "Could not load site visits.";
    const status = /session expired/i.test(message) ? 401 : /access denied|cannot access|Employee record not found/i.test(message) ? 403 : 500;
    return deny(message, status);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return deny("Invalid request origin.", 403);
  try {
    const user = await requireLocalSession(request) as Row | null;
    if (!user) return deny("Session expired.", 401);
    if (roleOf(user) !== "employee") return deny("Only Employees can create Site Visits.", 403);

    const form = await request.formData();
    const projectCode = normalizeProjectCode(clean(form.get("projectId"), 80));
    if (!projectCode) return deny("Select a project.", 400);

    const access = await accessibleProjects(user);
    const project = access.rows.find(row => String(row.project_code || "").toUpperCase() === projectCode);
    if (!project) return deny("Project not found.", 404);

    const employees = await selectRows("employees", { filters: { employee_code: employeeCodeOf(user) }, limit: 1 });
    if (!employees.length) return deny("Employee record not found.", 400);

    const visitDate = clean(form.get("visitDate"), 20) || new Date().toISOString().slice(0, 10);
    const purpose = clean(form.get("purpose"), 300);
    const problemDetails = clean(form.get("problemDetails"), 4000);
    const actionRequired = clean(form.get("actionRequired"), 4000);
    const notes = clean(form.get("notes"), 4000);
    const visitFile = validImage(form.get("visitPhoto")) ? form.get("visitPhoto") as File : null;
    const problemFile = validImage(form.get("problemPhoto")) ? form.get("problemPhoto") as File : null;

    const visitCode = `SV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    let visitPhotoPath = "";
    let problemPhotoPath = "";

    if (visitFile) {
      const file = await fileToBase64(visitFile);
      visitPhotoPath = `site-visits/${projectCode}/${visitCode}/visit-photo${file.mime === "image/png" ? ".png" : file.mime === "image/webp" ? ".webp" : ".jpg"}`;
      await uploadSiteVisitMedia({ path: visitPhotoPath, contentType: file.mime, base64: file.base64 });
    }
    if (problemFile) {
      const file = await fileToBase64(problemFile);
      problemPhotoPath = `site-visits/${projectCode}/${visitCode}/problem-photo${file.mime === "image/png" ? ".png" : file.mime === "image/webp" ? ".webp" : ".jpg"}`;
      await uploadSiteVisitMedia({ path: problemPhotoPath, contentType: file.mime, base64: file.base64 });
    }

    const createdBy = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(user?.id || "")) ? String(user.id) : null;
    await insertRows("site_visits", {
      visit_code: visitCode,
      project_id: project.id,
      employee_id: employees[0].id,
      visit_date: visitDate,
      purpose: purpose || null,
      visit_purpose: purpose || null,
      visited_by: clean(user?.name || user?.Name || employeeCodeOf(user), 200),
      observations: problemDetails || null,
      action_required: actionRequired || null,
      status: "Completed",
      notes: notes || null,
      visit_photo_path: visitPhotoPath || null,
      problem_photo_path: problemPhotoPath || null,
      created_by: createdBy,
      source_created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    return ok({
      Visit_ID: visitCode,
      Project_ID: projectCode,
      Project_Name: project.project_name || "",
      Visit_Date: visitDate,
      Employee_ID: employeeCodeOf(user),
      Employee_Name: user?.name || user?.Name || "",
      Purpose: purpose,
      Problem_Details: problemDetails,
      Action_Required: actionRequired,
      Status: "Completed",
      Visit_Photo_Available: Boolean(visitPhotoPath),
      Problem_Photo_Available: Boolean(problemPhotoPath),
    });
  } catch (error: any) {
    const message = error?.message || "Could not create site visit.";
    const status = /session expired/i.test(message) ? 401 : /only Employees|assigned to you|Employee record not found|select a project/i.test(message) ? 403 : 500;
    return deny(message, status);
  }
}
