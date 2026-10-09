import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { getSiteVisitMediaUrl, normalizeProjectCode, selectRows } from "@/lib/supabase-data";
import { isR2FileId, readSiteVisitMediaFromR2 } from "@/lib/cloudflare-r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
function clean(value: unknown, max = 300) { return String(value ?? "").trim().slice(0, max); }
function clientProjectCodesOf(user: Row) {
  const raw = clean(user?.projectIds || user?.Project_IDs || user?.project_ids, 5000);
  return Array.from(new Set(raw.split(/[;,\s]+/).map(normalizeProjectCode).filter(Boolean)));
}
function deny(message: string, status = 403) {
  return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
async function canViewVisit(user: Row, visit: Row) {
  const role = roleOf(user);
  if (role === "admin" || role === "manager") return true;
  if (role === "employee") {
    const code = clean(user?.employeeId || user?.Employee_ID || user?.userId || user?.User_ID, 120);
    const employee = await selectRows("employees", { filters: { employee_code: code }, limit: 1 });
    if (!employee.length) return false;
    return String(employee[0].id) === String(visit.employee_id);
  }
  if (role === "client") {
    const projects = await selectRows("projects", { inFilters: { project_code: clientProjectCodesOf(user) }, limit: 5000 });
    return projects.some(project => String(project.id) === String(visit.project_id));
  }
  return false;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request) as Row | null;
    if (!user) return deny("Session expired.", 401);

    const visitId = clean(request.nextUrl.searchParams.get("visitId"), 120);
    const kind = clean(request.nextUrl.searchParams.get("kind"), 20).toLowerCase();
    if (!visitId || !["visit", "problem"].includes(kind)) return deny("Visit ID and media type are required.", 400);

    const rows = await selectRows("site_visits", { filters: { visit_code: visitId }, limit: 1 });
    if (!rows.length) return deny("Site Visit not found.", 404);
    const visit = rows[0];
    if (!await canViewVisit(user, visit)) return deny("Access denied for this Site Visit.", 403);

    const driveFileId = kind === "visit" ? clean(visit.visit_photo_drive_file_id, 500) : clean(visit.problem_photo_drive_file_id, 500);
    if (driveFileId) {
      if (isR2FileId(driveFileId)) {
        const media = await readSiteVisitMediaFromR2(driveFileId);
        return new NextResponse(media.bytes as unknown as BodyInit, {
          status: 200,
          headers: {
            "Content-Type": media.contentType,
            "Content-Length": String(media.bytes.length),
            "Cache-Control": "private, max-age=300",
            "Content-Disposition": `inline; filename="${media.fileName.replace(/"/g, "")}"`,
          },
        });
      }

      const url = String(process.env.LAND_VIEW_API_URL || "").trim();
      const secret = String(process.env.LAND_VIEW_PROXY_SECRET || "").trim();
      if (!url || !secret) return deny("Google Drive backend is not configured.", 500);

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ action: "getSiteVisitMedia", proxySecret: secret, fileId: driveFileId }),
        signal: AbortSignal.timeout(30_000),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success || !json?.data?.base64) return deny(String(json?.error || "Could not load Site Visit photo."), 502);

      const data = json.data;
      const bytes = Buffer.from(String(data.base64), "base64");
      return new NextResponse(bytes as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": String(data.mimeType || "image/jpeg"),
          "Content-Length": String(bytes.length),
          "Cache-Control": "private, max-age=300",
          "Content-Disposition": `inline; filename="${String(data.fileName || "site-visit.jpg").replace(/"/g, "")}"`,
        },
      });
    }

    // Backward compatibility for legacy Supabase Storage photos.
    const path = kind === "visit" ? clean(visit.visit_photo_path, 500) : clean(visit.problem_photo_path, 500);
    if (!path) return deny("No photo is attached to this Site Visit.", 404);
    const signed = await getSiteVisitMediaUrl(path, 900);
    return NextResponse.redirect(signed.url, 302);
  } catch (error: any) {
    return deny(error?.message || "Could not open Site Visit photo.", 500);
  }
}
