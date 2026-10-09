import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { insertRows, normalizeProjectCode, selectRows, uploadSiteVisitMedia } from "@/lib/supabase-data";
import { publishSiteVisitToWhatsApp } from "@/lib/whatsapp-site-visits";
import { isR2Configured, uploadSiteVisitMediaToR2 } from "@/lib/cloudflare-r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
type PreparedImage = { mime: string; base64: string };

function clean(value: unknown, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

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

function supervisionActive(project: Row) {
  return String(project?.supervision_stage_status || "Completed").trim() !== "Completed";
}

function validImage(file: FormDataEntryValue | null): file is File {
  return !!file && typeof file === "object" && typeof (file as File).arrayBuffer === "function";
}

async function fileToBase64(file: File): Promise<PreparedImage> {
  if (file.size > 4 * 1024 * 1024) throw new Error("Each processed Site Visit photo must be 4 MB or smaller.");
  const mime = String(file.type || "").toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
    throw new Error("Only JPG, PNG and WebP site visit photos are allowed.");
  }
  return { mime, base64: Buffer.from(await file.arrayBuffer()).toString("base64") };
}

async function callDriveBackend(payload: Record<string, unknown>) {
  if (isR2Configured()) {
    try {
      const r2 = await uploadSiteVisitMediaToR2({
        projectCode: String(payload.projectId || "project"),
        visitCode: String(payload.visitId || "visit"),
        kind: String(payload.kind || "visit") === "problem" ? "problem" : "visit",
        mimeType: String(payload.mimeType || "image/jpeg"),
        base64: String(payload.base64 || ""),
      });
      return { ...r2, storageProvider: "cloudflare-r2" };
    } catch (error) {
      console.error("Cloudflare R2 Admin Site Visit upload failed; trying Google Drive fallback.", {
        visitId: String(payload.visitId || ""),
        kind: String(payload.kind || ""),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const url = String(process.env.LAND_VIEW_API_URL || "").trim();
  const secret = String(process.env.LAND_VIEW_PROXY_SECRET || "").trim();
  if (!url || !secret) throw new Error("Google Drive backend is not configured.");

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ action: "uploadSiteVisitMedia", proxySecret: secret, ...payload }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(String(json?.error || "Google Drive backend request failed."));
  }
  return { ...(json.data || {}), storageProvider: "google-drive" };
}

async function storeAdminSiteVisitPhoto(input: {
  projectCode: string;
  projectName: string;
  visitCode: string;
  kind: "visit" | "problem";
  file: PreparedImage;
}) {
  const fileName = input.kind === "visit"
    ? (input.file.mime === "image/png" ? "visit-photo.png" : input.file.mime === "image/webp" ? "visit-photo.webp" : "visit-photo.jpg")
    : (input.file.mime === "image/png" ? "problem-photo.png" : input.file.mime === "image/webp" ? "problem-photo.webp" : "problem-photo.jpg");

  try {
    const drive = await callDriveBackend({
      projectId: input.projectCode,
      projectName: input.projectName,
      visitId: input.visitCode,
      kind: input.kind,
      fileName,
      mimeType: input.file.mime,
      base64: input.file.base64,
    });
    const storage = drive?.storageProvider === "cloudflare-r2" ? "cloudflare-r2" : "google-drive";
    return { drive, path: "", storage, driveError: "", storageError: "" };
  } catch (error: any) {
    const driveError = String(error?.message || "Cloud archive upload failed.");
    const extension = input.file.mime === "image/png" ? "png" : input.file.mime === "image/webp" ? "webp" : "jpg";
    const path = `site-visits/${input.projectCode}/${input.visitCode}/${input.kind}-${crypto.randomUUID()}.${extension}`;
    try {
      await uploadSiteVisitMedia({ path, contentType: input.file.mime, base64: input.file.base64 });
      console.warn("Admin Site Visit photo stored in Supabase fallback", { visitCode: input.visitCode, kind: input.kind, driveError });
      return { drive: null, path, storage: "supabase-fallback" as const, driveError, storageError: "" };
    } catch (storageError: any) {
      const storageMessage = String(storageError?.message || "Supabase Site Visit media upload failed.");
      console.warn("Admin Site Visit photo will be WhatsApp-only", { visitCode: input.visitCode, kind: input.kind, driveError, storageMessage });
      return { drive: null, path: "", storage: "whatsapp-only" as const, driveError, storageError: storageMessage };
    }
  }
}

async function requireAdmin(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("SESSION_EXPIRED");
  if (roleOf(user) !== "admin") throw new Error("ADMIN_REQUIRED");
  return user;
}

export async function GET(request: NextRequest) {
  try {
    await requireAdmin(request);
    const mode = clean(request.nextUrl.searchParams.get("mode"), 40).toLowerCase();

    if (mode === "employees") {
      const employees = await selectRows("employees", { filters: { status: "Active" }, order: "employee_code:asc", limit: 1000 });
      return ok(employees.map((employee) => ({
        Employee_ID: employee.employee_code || "",
        Employee_Name: employee.name || "",
        Designation: employee.designation || "",
        Status: employee.status || "",
      })));
    }

    const projects = (await selectRows("projects", { order: "project_code:asc", limit: 5000 })).filter(supervisionActive);
    return ok(projects.map((project) => ({
      Project_ID: project.project_code || "",
      Project_Name: project.project_name || "",
      Client_Name: project.client_name_snapshot || "",
      Location: project.location || "",
      Status: project.status || "",
    })));
  } catch (error: any) {
    const code = clean(error?.message, 100);
    if (code === "SESSION_EXPIRED") return deny("Session expired.", 401);
    if (code === "ADMIN_REQUIRED") return deny("Admin access is required.", 403);
    return deny(clean(error?.message || "Could not load Site Visit data.", 1000), 500);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return deny("Invalid request origin.", 403);

  try {
    const user = await requireAdmin(request);
    const form = await request.formData();
    const projectCode = normalizeProjectCode(clean(form.get("projectId"), 80));
    if (!projectCode) return deny("Select a project.", 400);

    const projects = await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 });
    const project = projects[0] as Row | undefined;
    if (!project) return deny("Project not found.", 404);
    if (!supervisionActive(project)) {
      return deny("Site Visits are only available while the project is in the Supervision / Construction stage.", 409);
    }

    const issueEmployeeCode = clean(form.get("employeeId"), 120).toUpperCase();
    let issueEmployee: Row | null = null;
    if (issueEmployeeCode) {
      const employees = await selectRows("employees", {
        filters: { employee_code: issueEmployeeCode, status: "Active" },
        limit: 1,
      });
      issueEmployee = (employees[0] as Row | undefined) || null;
      if (!issueEmployee) return deny("Selected employee is not active or could not be found.", 400);
    }

    const visitDate = clean(form.get("visitDate"), 20) || new Date().toISOString().slice(0, 10);
    const purpose = clean(form.get("purpose"), 300);
    const problemDetails = clean(form.get("problemDetails"), 4000);
    const actionRequired = clean(form.get("actionRequired"), 4000);
    const notes = clean(form.get("notes"), 4000);
    if (!purpose) return deny("Enter the visit purpose.", 400);

    const visitFile = validImage(form.get("visitPhoto")) ? form.get("visitPhoto") as File : null;
    const problemFile = validImage(form.get("problemPhoto")) ? form.get("problemPhoto") as File : null;

    const visitCode = `SV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    let visitPhotoDrive: any = null;
    let problemPhotoDrive: any = null;
    let visitPhotoPath = "";
    let problemPhotoPath = "";
    let visitPhotoStorage = "none";
    let problemPhotoStorage = "none";
    let visitWhatsAppPhoto: PreparedImage | null = null;
    let problemWhatsAppPhoto: PreparedImage | null = null;
    const storageWarnings: string[] = [];

    if (visitFile) {
      const file = await fileToBase64(visitFile);
      visitWhatsAppPhoto = file;
      const stored = await storeAdminSiteVisitPhoto({
        projectCode,
        projectName: String(project.project_name || project.client_name_snapshot || projectCode),
        visitCode,
        kind: "visit",
        file,
      });
      visitPhotoDrive = stored.drive;
      visitPhotoPath = stored.path;
      visitPhotoStorage = stored.storage;
      if (stored.driveError) storageWarnings.push(`Visit photo archive: ${stored.driveError}`);
      if (stored.storageError) storageWarnings.push(`Visit photo fallback: ${stored.storageError}`);
    }

    if (problemFile) {
      const file = await fileToBase64(problemFile);
      problemWhatsAppPhoto = file;
      const stored = await storeAdminSiteVisitPhoto({
        projectCode,
        projectName: String(project.project_name || project.client_name_snapshot || projectCode),
        visitCode,
        kind: "problem",
        file,
      });
      problemPhotoDrive = stored.drive;
      problemPhotoPath = stored.path;
      problemPhotoStorage = stored.storage;
      if (stored.driveError) storageWarnings.push(`Problem photo archive: ${stored.driveError}`);
      if (stored.storageError) storageWarnings.push(`Problem photo fallback: ${stored.storageError}`);
    }

    const adminName = clean(user?.name || user?.Name || user?.username || user?.Username || "Admin", 200) || "Admin";
    const attributedEmployeeCode = clean(issueEmployee?.employee_code, 120);
    const attributedEmployeeName = clean(issueEmployee?.name, 200) || `Admin · ${adminName}`;
    const senderEmployeeCode = attributedEmployeeCode || "EMP-0002";
    const createdBy = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(user?.id || ""))
      ? String(user.id)
      : null;
    const now = new Date().toISOString();

    await insertRows("site_visits", {
      visit_code: visitCode,
      project_id: project.id,
      employee_id: issueEmployee?.id || null,
      visit_date: visitDate,
      purpose: purpose || null,
      visit_purpose: purpose || null,
      visited_by: attributedEmployeeName,
      observations: problemDetails || null,
      action_required: actionRequired || null,
      status: "Completed",
      notes: notes || null,
      visit_photo_path: visitPhotoPath || null,
      problem_photo_path: problemPhotoPath || null,
      location_latitude: null,
      location_longitude: null,
      location_accuracy_m: null,
      location_captured_at: null,
      location_verification_status: "ADMIN_NOT_REQUIRED",
      location_distance_m: null,
      location_source: "admin_manual",
      visit_photo_drive_file_id: String(visitPhotoDrive?.fileId || "") || null,
      visit_photo_drive_url: String(visitPhotoDrive?.fileUrl || "") || null,
      problem_photo_drive_file_id: String(problemPhotoDrive?.fileId || "") || null,
      problem_photo_drive_url: String(problemPhotoDrive?.fileUrl || "") || null,
      created_by: createdBy,
      source_created_at: now,
      updated_at: now,
    });

    const whatsAppPublish = await publishSiteVisitToWhatsApp({
      visitId: visitCode,
      projectId: projectCode,
      projectName: String(project.project_name || project.client_name_snapshot || ""),
      projectLocation: String(project.location || ""),
      employeeId: attributedEmployeeCode,
      employeeName: attributedEmployeeName,
      senderEmployeeId: senderEmployeeCode,
      visitDate,
      purpose,
      problemDetails,
      actionRequired,
      notes,
      locationLatitude: null,
      locationLongitude: null,
      locationAccuracyM: null,
      locationDistanceM: null,
      locationVerificationStatus: "ADMIN_NOT_REQUIRED",
      visitPhotoUrl: String(visitPhotoDrive?.fileUrl || ""),
      problemPhotoUrl: String(problemPhotoDrive?.fileUrl || ""),
      visitPhotoBase64: visitWhatsAppPhoto?.base64,
      visitPhotoMimeType: visitWhatsAppPhoto?.mime,
      problemPhotoBase64: problemWhatsAppPhoto?.base64,
      problemPhotoMimeType: problemWhatsAppPhoto?.mime,
    });

    return ok({
      Visit_ID: visitCode,
      Project_ID: projectCode,
      Project_Name: project.project_name || "",
      Visit_Date: visitDate,
      Employee_ID: attributedEmployeeCode,
      Employee_Name: attributedEmployeeName,
      WhatsApp_Sender_Employee_ID: senderEmployeeCode,
      Purpose: purpose,
      Problem_Details: problemDetails,
      Action_Required: actionRequired,
      Status: "Completed",
      Visit_Photo_Available: Boolean(visitPhotoDrive?.fileId || visitPhotoPath),
      Problem_Photo_Available: Boolean(problemPhotoDrive?.fileId || problemPhotoPath),
      Visit_Photo_Storage: visitPhotoStorage,
      Problem_Photo_Storage: problemPhotoStorage,
      Storage_Warnings: storageWarnings,
      Location_Verification_Status: "ADMIN_NOT_REQUIRED",
      WhatsApp_Publish_Status: whatsAppPublish.status,
      WhatsApp_Media_Count: whatsAppPublish.mediaCount || 0,
      WhatsApp_Publish_Reason: whatsAppPublish.reason || "",
    });
  } catch (error: any) {
    const code = clean(error?.message, 100);
    if (code === "SESSION_EXPIRED") return deny("Session expired.", 401);
    if (code === "ADMIN_REQUIRED") return deny("Admin access is required.", 403);
    return deny(clean(error?.message || "Could not create Site Visit.", 1000), 500);
  }
}
