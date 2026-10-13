import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { insertRows, normalizeProjectCode, selectRows } from "@/lib/supabase-data";
import { publishSiteVisitToWhatsApp } from "@/lib/whatsapp-site-visits";
import { uploadSiteVisitMediaToR2 } from "@/lib/cloudflare-r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
type PreparedImage = { mime: string; base64: string; size: number; name: string };
type StoredPhoto = {
  kind: "visit" | "problem";
  fileId: string;
  fileUrl: string;
  key: string;
  mimeType: string;
  size: number;
  sortOrder: number;
  originalName: string;
  prepared: PreparedImage;
};

const MAX_TOTAL_PHOTOS = 8;

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

function validImage(value: FormDataEntryValue): value is File {
  return typeof value === "object" && typeof (value as File)?.arrayBuffer === "function" && String((value as File)?.type || "").startsWith("image/");
}

function imageFiles(form: FormData, pluralKey: string, legacyKey: string) {
  const plural = form.getAll(pluralKey).filter(validImage) as File[];
  if (plural.length) return plural;
  const legacy = form.get(legacyKey);
  return legacy && validImage(legacy) ? [legacy] : [];
}

async function fileToBase64(file: File): Promise<PreparedImage> {
  if (file.size > 4 * 1024 * 1024) throw new Error("Each processed Site Visit photo must be 4 MB or smaller.");
  const mime = String(file.type || "").toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) {
    throw new Error("Only JPG, PNG and WebP Site Visit photos are allowed.");
  }
  return {
    mime,
    base64: Buffer.from(await file.arrayBuffer()).toString("base64"),
    size: file.size,
    name: clean(file.name, 240) || "site-visit.jpg",
  };
}

async function storePhoto(input: {
  projectCode: string;
  visitCode: string;
  kind: "visit" | "problem";
  file: File;
  sortOrder: number;
}) {
  const prepared = await fileToBase64(input.file);
  const media = await uploadSiteVisitMediaToR2({
    projectCode: input.projectCode,
    visitCode: input.visitCode,
    kind: input.kind,
    mimeType: prepared.mime,
    base64: prepared.base64,
    uniqueId: `${input.kind}-${input.sortOrder + 1}-${crypto.randomUUID().slice(0, 8)}`,
  });
  return {
    kind: input.kind,
    fileId: String(media.fileId || ""),
    fileUrl: String(media.fileUrl || ""),
    key: String(media.key || ""),
    mimeType: prepared.mime,
    size: Number(media.size || prepared.size || 0),
    sortOrder: input.sortOrder,
    originalName: prepared.name,
    prepared,
  } satisfies StoredPhoto;
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

    const project = (await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 }))[0] as Row | undefined;
    if (!project) return deny("Project not found.", 404);
    if (!supervisionActive(project)) return deny("Site Visits are only available while the project is in the Supervision / Construction stage.", 409);

    const issueEmployeeCode = clean(form.get("employeeId"), 120).toUpperCase();
    let issueEmployee: Row | null = null;
    if (issueEmployeeCode) {
      issueEmployee = ((await selectRows("employees", { filters: { employee_code: issueEmployeeCode, status: "Active" }, limit: 1 }))[0] as Row | undefined) || null;
      if (!issueEmployee) return deny("Selected employee is not active or could not be found.", 400);
    }

    const visitDate = clean(form.get("visitDate"), 20) || new Date().toISOString().slice(0, 10);
    const purpose = clean(form.get("purpose"), 300) || "Site Visit";
    const problemDetails = clean(form.get("problemDetails"), 4000);
    const actionRequired = clean(form.get("actionRequired"), 4000);
    const notes = clean(form.get("notes"), 4000);

    const visitFiles = imageFiles(form, "visitPhotos", "visitPhoto");
    const problemFiles = imageFiles(form, "problemPhotos", "problemPhoto");
    const totalPhotos = visitFiles.length + problemFiles.length;
    if (totalPhotos > MAX_TOTAL_PHOTOS) return deny(`A Site Visit can contain up to ${MAX_TOTAL_PHOTOS} photos.`, 400);

    const visitCode = `SV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const stored: StoredPhoto[] = [];

    for (let index = 0; index < visitFiles.length; index += 1) {
      stored.push(await storePhoto({ projectCode, visitCode, kind: "visit", file: visitFiles[index], sortOrder: stored.length }));
    }
    for (let index = 0; index < problemFiles.length; index += 1) {
      stored.push(await storePhoto({ projectCode, visitCode, kind: "problem", file: problemFiles[index], sortOrder: stored.length }));
    }

    const firstVisit = stored.find((photo) => photo.kind === "visit") || null;
    const firstProblem = stored.find((photo) => photo.kind === "problem") || null;
    const mediaItems = stored.map((photo) => ({
      kind: photo.kind,
      fileId: photo.fileId,
      fileUrl: photo.fileUrl,
      key: photo.key,
      mimeType: photo.mimeType,
      size: photo.size,
      sortOrder: photo.sortOrder,
      originalName: photo.originalName,
      storageProvider: "cloudflare-r2",
    }));

    const adminName = clean(user?.name || user?.Name || user?.username || user?.Username || "Admin", 200) || "Admin";
    const attributedEmployeeCode = clean(issueEmployee?.employee_code, 120);
    const attributedEmployeeName = clean(issueEmployee?.name, 200) || `Admin · ${adminName}`;
    const senderEmployeeCode = attributedEmployeeCode || "EMP-0002";
    const createdBy = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(user?.id || "")) ? String(user.id) : null;
    const now = new Date().toISOString();

    await insertRows("site_visits", {
      visit_code: visitCode,
      project_id: project.id,
      employee_id: issueEmployee?.id || null,
      visit_date: visitDate,
      purpose,
      visit_purpose: purpose,
      visited_by: attributedEmployeeName,
      observations: problemDetails || null,
      action_required: actionRequired || null,
      status: "Completed",
      notes: notes || null,
      media_items: mediaItems,
      visit_photo_path: null,
      problem_photo_path: null,
      location_latitude: null,
      location_longitude: null,
      location_accuracy_m: null,
      location_captured_at: null,
      location_verification_status: "ADMIN_NOT_REQUIRED",
      location_distance_m: null,
      location_source: "admin_manual",
      visit_photo_drive_file_id: firstVisit?.fileId || null,
      visit_photo_drive_url: firstVisit?.fileUrl || null,
      problem_photo_drive_file_id: firstProblem?.fileId || null,
      problem_photo_drive_url: firstProblem?.fileUrl || null,
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
      visitPhotoUrl: firstVisit?.fileUrl || "",
      problemPhotoUrl: firstProblem?.fileUrl || "",
      visitPhotoBase64: firstVisit?.prepared.base64,
      visitPhotoMimeType: firstVisit?.prepared.mime,
      problemPhotoBase64: firstProblem?.prepared.base64,
      problemPhotoMimeType: firstProblem?.prepared.mime,
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
      Photo_Count: totalPhotos,
      Site_Photo_Count: visitFiles.length,
      Problem_Photo_Count: problemFiles.length,
      Media_Items: mediaItems,
      Visit_Photo_Available: Boolean(firstVisit),
      Problem_Photo_Available: Boolean(firstProblem),
      Visit_Photo_Storage: firstVisit ? "cloudflare-r2" : "none",
      Problem_Photo_Storage: firstProblem ? "cloudflare-r2" : "none",
      Location_Verification_Status: "ADMIN_NOT_REQUIRED",
      WhatsApp_Publish_Status: whatsAppPublish.status,
      WhatsApp_Media_Count: whatsAppPublish.mediaCount || 0,
      WhatsApp_Publish_Reason: whatsAppPublish.reason || "",
    });
  } catch (error: any) {
    const code = clean(error?.message, 1000);
    if (code === "SESSION_EXPIRED") return deny("Session expired.", 401);
    if (code === "ADMIN_REQUIRED") return deny("Admin access is required.", 403);
    if (/Cloudflare R2/i.test(code)) return deny(code, 503);
    return deny(code || "Could not create Site Visit.", 500);
  }
}
