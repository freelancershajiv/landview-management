import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { selectRows } from "@/lib/supabase-data";
import { publishSiteVisitToWhatsApp } from "@/lib/whatsapp-site-visits";
import { isR2FileId, readSiteVisitMediaFromR2 } from "@/lib/cloudflare-r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

type RetryMedia = {
  kind: "visit" | "problem";
  base64: string;
  mimeType: string;
};

function clean(value: unknown, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function response(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" },
  });
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

function employeeCodeOf(user: Row) {
  return clean(user?.employeeId || user?.Employee_ID || user?.userId || user?.User_ID, 120).toUpperCase();
}

function internalAuthorized(request: NextRequest) {
  const expected = clean(process.env.SITE_VISIT_RETRY_TOKEN, 500);
  const supplied = clean(request.headers.get("x-land-view-site-visit-retry-token"), 500);
  return Boolean(expected && supplied && expected === supplied);
}

async function mediaFromR2(fileId: unknown) {
  const id = clean(fileId, 1200);
  if (!id || !isR2FileId(id)) return null;
  const media = await readSiteVisitMediaFromR2(id);
  if (!media.bytes?.length) return null;
  if (media.bytes.length > 4 * 1024 * 1024) throw new Error("Stored Site Visit photo is too large for WhatsApp retry.");
  return {
    base64: Buffer.from(media.bytes).toString("base64"),
    mimeType: clean(media.contentType || "image/jpeg", 100),
  };
}

function mediaMetadata(value: unknown): Row[] {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object") as Row[];
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object") : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function mediaSetFromVisit(visit: Row): Promise<RetryMedia[]> {
  const items = mediaMetadata(visit.media_items)
    .sort((a, b) => Number(a.sortOrder ?? a.sort_order ?? 0) - Number(b.sortOrder ?? b.sort_order ?? 0))
    .slice(0, 8);

  if (items.length) {
    const loaded = await Promise.all(items.map(async (item) => {
      const fileId = item.fileId || item.file_id;
      const media = await mediaFromR2(fileId);
      if (!media) return null;
      return {
        kind: String(item.kind || "visit").toLowerCase() === "problem" ? "problem" : "visit",
        base64: media.base64,
        mimeType: media.mimeType,
      } satisfies RetryMedia;
    }));
    const complete = loaded.filter(Boolean) as RetryMedia[];
    if (complete.length) return complete;
  }

  const [visitPhoto, problemPhoto] = await Promise.all([
    mediaFromR2(visit.visit_photo_drive_file_id),
    mediaFromR2(visit.problem_photo_drive_file_id),
  ]);
  const fallback: RetryMedia[] = [];
  if (visitPhoto) fallback.push({ kind: "visit", ...visitPhoto });
  if (problemPhoto) fallback.push({ kind: "problem", ...problemPhoto });
  return fallback;
}

async function statusRowsForUser(user: Row) {
  const role = roleOf(user);
  if (role === "employee") {
    const employeeCode = employeeCodeOf(user);
    const employee = (await selectRows("employees", { filters: { employee_code: employeeCode }, limit: 1 }))[0];
    if (!employee) throw new Error("Employee record not found.");
    return selectRows("site_visits", { filters: { employee_id: employee.id }, order: "created_at:desc", limit: 250 });
  }
  if (role === "admin" || role === "manager") {
    return selectRows("site_visits", { order: "created_at:desc", limit: 500 });
  }
  throw new Error("Site Visit WhatsApp status is not available for this account.");
}

function statusView(row: Row) {
  return {
    Visit_ID: row.visit_code || "",
    WhatsApp_Publish_Status: row.whatsapp_publish_status || "",
    WhatsApp_Publish_Reason: row.whatsapp_publish_reason || "",
    WhatsApp_Message_ID: row.whatsapp_message_id || "",
    WhatsApp_Media_Count: Number(row.whatsapp_media_count || 0),
    WhatsApp_Last_Attempt_At: row.whatsapp_last_attempt_at || "",
    WhatsApp_Sent_At: row.whatsapp_sent_at || "",
    WhatsApp_Attempt_Count: Number(row.whatsapp_attempt_count || 0),
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request) as Row | null;
    if (!user) return response({ success: false, error: "Session expired." }, 401);
    const rows = await statusRowsForUser(user);
    return response({ success: true, data: rows.map(statusView) });
  } catch (error: any) {
    const message = clean(error?.message || "Could not load WhatsApp delivery status.", 1000);
    const status = /session expired/i.test(message) ? 401 : /not available|Employee record not found/i.test(message) ? 403 : 500;
    return response({ success: false, error: message }, status);
  }
}

export async function POST(request: NextRequest) {
  const internal = internalAuthorized(request);
  if (!internal && !sameOrigin(request)) return response({ success: false, error: "Invalid request origin." }, 403);

  try {
    const user = internal ? null : await requireLocalSession(request) as Row | null;
    if (!internal && !user) return response({ success: false, error: "Session expired." }, 401);

    const body = await request.json().catch(() => ({}));
    const visitId = clean(body?.visitId, 120);
    if (!visitId) return response({ success: false, error: "Site Visit ID is required." }, 400);

    const visit = (await selectRows("site_visits", { filters: { visit_code: visitId }, limit: 1 }))[0];
    if (!visit) return response({ success: false, error: "Site Visit not found." }, 404);

    const project = (await selectRows("projects", { filters: { id: visit.project_id }, limit: 1 }))[0];
    const attributedEmployee = visit.employee_id
      ? (await selectRows("employees", { filters: { id: visit.employee_id }, limit: 1 }))[0]
      : null;
    const senderEmployee = attributedEmployee || (await selectRows("employees", { filters: { employee_code: "EMP-0002" }, limit: 1 }))[0];
    if (!project || !senderEmployee) return response({ success: false, error: "Site Visit project or WhatsApp sender record is missing." }, 409);

    if (!internal && user) {
      const role = roleOf(user);
      if (role === "employee") {
        if (!attributedEmployee || employeeCodeOf(user) !== clean(attributedEmployee.employee_code, 120).toUpperCase()) {
          return response({ success: false, error: "You can retry only your own Site Visit WhatsApp updates." }, 403);
        }
      }
      if (!["employee", "admin", "manager"].includes(role)) {
        return response({ success: false, error: "You cannot retry Site Visit WhatsApp updates." }, 403);
      }
    }

    if (String(visit.whatsapp_publish_status || "").toLowerCase() === "sent" && body?.force !== true) {
      return response({ success: true, data: { ...statusView(visit), Already_Sent: true } });
    }

    const mediaItems = await mediaSetFromVisit(visit);
    const firstVisit = mediaItems.find((item) => item.kind === "visit") || null;
    const firstProblem = mediaItems.find((item) => item.kind === "problem") || null;

    const result = await publishSiteVisitToWhatsApp({
      visitId: clean(visit.visit_code, 120),
      projectId: clean(project.project_code, 80),
      projectName: clean(project.project_name || project.client_name_snapshot, 220),
      projectLocation: clean(project.location, 300),
      employeeId: clean(attributedEmployee?.employee_code, 120),
      employeeName: clean(attributedEmployee?.name || visit.visited_by, 200),
      senderEmployeeId: clean(senderEmployee.employee_code, 120),
      visitDate: clean(visit.visit_date, 40),
      purpose: clean(visit.visit_purpose || visit.purpose, 500),
      problemDetails: clean(visit.observations, 1000),
      actionRequired: clean(visit.action_required, 1000),
      notes: clean(visit.notes, 1000),
      locationLatitude: Number.isFinite(Number(visit.location_latitude)) ? Number(visit.location_latitude) : null,
      locationLongitude: Number.isFinite(Number(visit.location_longitude)) ? Number(visit.location_longitude) : null,
      locationAccuracyM: Number.isFinite(Number(visit.location_accuracy_m)) ? Number(visit.location_accuracy_m) : null,
      locationDistanceM: Number.isFinite(Number(visit.location_distance_m)) ? Number(visit.location_distance_m) : null,
      locationVerificationStatus: clean(visit.location_verification_status, 80),
      visitPhotoUrl: clean(visit.visit_photo_drive_url, 1000),
      problemPhotoUrl: clean(visit.problem_photo_drive_url, 1000),
      visitPhotoBase64: firstVisit?.base64,
      visitPhotoMimeType: firstVisit?.mimeType,
      problemPhotoBase64: firstProblem?.base64,
      problemPhotoMimeType: firstProblem?.mimeType,
      mediaItems,
    });

    const refreshed = (await selectRows("site_visits", { filters: { visit_code: visitId }, limit: 1 }))[0] || visit;
    return response({
      success: result.status === "sent",
      data: statusView(refreshed),
      error: result.status === "sent" ? undefined : (result.reason || "WhatsApp update was not sent."),
    }, result.status === "sent" ? 200 : 409);
  } catch (error: any) {
    const message = clean(error?.message || "Could not retry Site Visit WhatsApp update.", 1000);
    return response({ success: false, error: message }, 500);
  }
}
