import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { getSiteVisitMediaUrl, insertRows, normalizeProjectCode, selectRows, uploadSiteVisitMedia } from "@/lib/supabase-data";
import { publishSiteVisitToWhatsApp } from "@/lib/whatsapp-site-visits";

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
  if (file.size > 4 * 1024 * 1024) throw new Error("Each processed Site Visit photo must be 4 MB or smaller.");
  const mime = String(file.type || "").toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) throw new Error("Only JPG, PNG and WebP site visit photos are allowed.");
  return { mime, base64: Buffer.from(await file.arrayBuffer()).toString("base64") };
}

async function callDriveBackend(action: "uploadSiteVisitMedia" | "getSiteVisitMedia", payload: Record<string, unknown>) {
  const url = String(process.env.LAND_VIEW_API_URL || "").trim();
  const secret = String(process.env.LAND_VIEW_PROXY_SECRET || "").trim();
  if (!url || !secret) throw new Error("Google Drive backend is not configured.");
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ action, proxySecret: secret, ...payload }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Google Drive backend request failed."));
  return json.data || {};
}

async function storeSiteVisitPhoto(input: {
  projectCode: string;
  projectName: string;
  visitCode: string;
  kind: "visit" | "problem";
  file: { mime: string; base64: string };
  latitude: number;
  longitude: number;
  accuracyM: number;
}) {
  const fileName = input.kind === "visit"
    ? (input.file.mime === "image/png" ? "visit-photo.png" : input.file.mime === "image/webp" ? "visit-photo.webp" : "visit-photo.jpg")
    : (input.file.mime === "image/png" ? "problem-photo.png" : input.file.mime === "image/webp" ? "problem-photo.webp" : "problem-photo.jpg");

  try {
    const drive = await callDriveBackend("uploadSiteVisitMedia", {
      projectId: input.projectCode,
      projectName: input.projectName,
      visitId: input.visitCode,
      kind: input.kind,
      fileName,
      mimeType: input.file.mime,
      base64: input.file.base64,
      locationLatitude: input.latitude,
      locationLongitude: input.longitude,
      locationAccuracyM: input.accuracyM,
    });
    return { drive, path: "", storage: "google-drive" as const, driveError: "" };
  } catch (error: any) {
    const driveError = String(error?.message || "Google Drive upload failed.");
    const extension = input.file.mime === "image/png" ? "png" : input.file.mime === "image/webp" ? "webp" : "jpg";
    const path = `${input.projectCode}/${input.visitCode}/${input.kind}-${crypto.randomUUID()}.${extension}`;
    await uploadSiteVisitMedia({ path, contentType: input.file.mime, base64: input.file.base64 });
    console.warn("Site Visit photo stored in Supabase fallback", { visitCode: input.visitCode, kind: input.kind, driveError });
    return { drive: null, path, storage: "supabase-fallback" as const, driveError };
  }
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
  const a = Math.sin(dLat/2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function supervisionActive(project: Row) {
  return String(project?.supervision_stage_status || "Completed").trim() !== "Completed";
}
async function accessibleProjects(user: Row) {
  const role = roleOf(user);
  if (role === "admin" || role === "manager") return { all: true, anyProject: true, employee: null as Row | null, ids: [] as string[], rows: [] as Row[] };

  if (role === "employee") {
    const employees = await selectRows("employees", { filters: { employee_code: employeeCodeOf(user) }, limit: 1 });
    if (!employees.length) throw new Error("Employee record not found.");
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
      Visit_Photo_Available: Boolean(row.visit_photo_drive_file_id || row.visit_photo_path),
      Problem_Photo_Available: Boolean(row.problem_photo_drive_file_id || row.problem_photo_path),
      Location_Verification_Status: row.location_verification_status || "",
      Location_Accuracy_M: row.location_accuracy_m ?? "",
      Location_Distance_M: row.location_distance_m ?? "",
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
      const projects = (await selectRows("projects", { order: "project_code:asc", limit: 5000 })).filter(supervisionActive);
      return ok(projects.map(project => ({
        Project_ID: project.project_code || "",
        Project_Name: project.project_name || "",
        Client_Name: project.client_name_snapshot || "",
        Location: project.location || "",
        Status: project.status || "",
        Site_Latitude: project.site_latitude ?? "",
        Site_Longitude: project.site_longitude ?? "",
        Site_Geofence_Radius_M: project.site_geofence_radius_m ?? 150,
      })));
    }

    const visits = await loadVisits(user, clean(request.nextUrl.searchParams.get("projectId"), 80) || undefined);
    return ok(visits);
  } catch (error: any) {
    const message = error?.message || "Could not load site visits.";
    const status = /session expired/i.test(message) ? 401 : /access denied|cannot access|Employee record not found/i.test(message) ? 403 : /only available while the project|GPS accuracy|project does not have a verified site location|registered project site/i.test(message) ? 409 : /Device location|required for every Site Visit|invalid/i.test(message) ? 400 : 500;
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
    if (!supervisionActive(project)) {
      return deny("Site Visits are only available while the project is in the Supervision / Construction stage.", 409);
    }

    const employees = await selectRows("employees", { filters: { employee_code: employeeCodeOf(user) }, limit: 1 });
    if (!employees.length) return deny("Employee record not found.", 400);

    const visitDate = clean(form.get("visitDate"), 20) || new Date().toISOString().slice(0, 10);
    const purpose = clean(form.get("purpose"), 300);
    const problemDetails = clean(form.get("problemDetails"), 4000);
    const actionRequired = clean(form.get("actionRequired"), 4000);
    const notes = clean(form.get("notes"), 4000);
    const visitFile = validImage(form.get("visitPhoto")) ? form.get("visitPhoto") as File : null;
    const problemFile = validImage(form.get("problemPhoto")) ? form.get("problemPhoto") as File : null;

    const locationLatitude = numberValue(form.get("locationLatitude"));
    const locationLongitude = numberValue(form.get("locationLongitude"));
    const locationAccuracyM = numberValue(form.get("locationAccuracyM"));
    const locationCapturedAt = clean(form.get("locationCapturedAt"), 60);

    if (locationLatitude === null || locationLongitude === null || locationAccuracyM === null) {
      return deny("Device location is required for every Site Visit.", 400);
    }
    if (Math.abs(locationLatitude) > 90 || Math.abs(locationLongitude) > 180) {
      return deny("The captured device location is invalid.", 400);
    }
    if (locationAccuracyM > 100) {
      return deny("GPS accuracy is too low. Please move to an open area and verify your location again.", 400);
    }

    const projectLatitude = numberValue(project.site_latitude);
    const projectLongitude = numberValue(project.site_longitude);
    const geofenceRadiusM = Math.max(25, Math.min(1000, Number(project.site_geofence_radius_m || 150)));
    const hasProjectCoordinates = projectLatitude !== null && projectLongitude !== null;
    const locationDistanceM = hasProjectCoordinates
      ? distanceMeters(locationLatitude, locationLongitude, projectLatitude!, projectLongitude!)
      : null;
    const locationVerificationStatus = hasProjectCoordinates
      ? (locationDistanceM! <= geofenceRadiusM ? "VERIFIED" : "REJECTED")
      : "NO_PROJECT_COORDINATES";

    if (hasProjectCoordinates && locationVerificationStatus === "REJECTED") {
      return deny(`You are approximately ${Math.round(locationDistanceM!)} m from the registered project site. Site Visit submission is allowed only within ${Math.round(geofenceRadiusM)} m.`, 409);
    }
    if (hasProjectCoordinates === false && (visitFile || problemFile)) {
      return deny("This project does not have a verified site location yet. An Admin or Manager must set the project's Site Latitude and Longitude before photos can be uploaded.", 409);
    }

    const visitCode = `SV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    let visitPhotoPath = "";
    let problemPhotoPath = "";
    let visitPhotoDrive: any = null;
    let problemPhotoDrive: any = null;
    let visitPhotoStorage = "none";
    let problemPhotoStorage = "none";
    const storageWarnings: string[] = [];

    if (visitFile) {
      const file = await fileToBase64(visitFile);
      const stored = await storeSiteVisitPhoto({
        projectCode,
        projectName: String(project.project_name || project.client_name_snapshot || projectCode),
        visitCode,
        kind: "visit",
        file,
        latitude: locationLatitude,
        longitude: locationLongitude,
        accuracyM: locationAccuracyM,
      });
      visitPhotoDrive = stored.drive;
      visitPhotoPath = stored.path;
      visitPhotoStorage = stored.storage;
      if (stored.driveError) storageWarnings.push(`Visit photo: ${stored.driveError}`);
    }
    if (problemFile) {
      const file = await fileToBase64(problemFile);
      const stored = await storeSiteVisitPhoto({
        projectCode,
        projectName: String(project.project_name || project.client_name_snapshot || projectCode),
        visitCode,
        kind: "problem",
        file,
        latitude: locationLatitude,
        longitude: locationLongitude,
        accuracyM: locationAccuracyM,
      });
      problemPhotoDrive = stored.drive;
      problemPhotoPath = stored.path;
      problemPhotoStorage = stored.storage;
      if (stored.driveError) storageWarnings.push(`Problem photo: ${stored.driveError}`);
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
      location_latitude: locationLatitude,
      location_longitude: locationLongitude,
      location_accuracy_m: locationAccuracyM,
      location_captured_at: locationCapturedAt ? new Date(locationCapturedAt).toISOString() : new Date().toISOString(),
      location_verification_status: locationVerificationStatus,
      location_distance_m: locationDistanceM,
      location_source: "device_gps",
      visit_photo_drive_file_id: String(visitPhotoDrive?.fileId || "") || null,
      visit_photo_drive_url: String(visitPhotoDrive?.fileUrl || "") || null,
      problem_photo_drive_file_id: String(problemPhotoDrive?.fileId || "") || null,
      problem_photo_drive_url: String(problemPhotoDrive?.fileUrl || "") || null,
      created_by: createdBy,
      source_created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const whatsAppPublish = await publishSiteVisitToWhatsApp({
      visitId: visitCode,
      projectId: projectCode,
      projectName: String(project.project_name || project.client_name_snapshot || ""),
      projectLocation: String(project.location || ""),
      employeeId: employeeCodeOf(user),
      employeeName: clean(employees[0]?.name || user?.name || user?.Name || employeeCodeOf(user), 200),
      visitDate,
      purpose,
      problemDetails,
      actionRequired,
      notes,
      locationLatitude,
      locationLongitude,
      locationAccuracyM,
      locationDistanceM,
      locationVerificationStatus,
      visitPhotoUrl: String(visitPhotoDrive?.fileUrl || ""),
      problemPhotoUrl: String(problemPhotoDrive?.fileUrl || ""),
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
      Visit_Photo_Available: Boolean(visitPhotoDrive?.fileId || visitPhotoPath),
      Problem_Photo_Available: Boolean(problemPhotoDrive?.fileId || problemPhotoPath),
      Visit_Photo_Storage: visitPhotoStorage,
      Problem_Photo_Storage: problemPhotoStorage,
      Storage_Warnings: storageWarnings,
      Location_Verification_Status: locationVerificationStatus,
      Location_Distance_M: locationDistanceM,
      Location_Accuracy_M: locationAccuracyM,
      WhatsApp_Publish_Status: whatsAppPublish.status,
    });
  } catch (error: any) {
    const message = error?.message || "Could not create site visit.";
    const status = /session expired/i.test(message) ? 401 : /only Employees|assigned to you|Employee record not found|select a project/i.test(message) ? 403 : 500;
    return deny(message, status);
  }
}