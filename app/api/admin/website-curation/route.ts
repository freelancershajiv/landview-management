import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { getPublicProjectsForSeo } from "@/lib/public-projects-server";
import { normalizeProjectCode, roleOf, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MANAGE_ROLES = new Set(["admin", "manager"]);
function text(value: unknown, max = 2000) { return String(value ?? "").trim().slice(0, max); }
function bool(value: unknown) { return value === true || String(value ?? "").toLowerCase() === "true"; }
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
async function manager(request: NextRequest) {
  const user = await requireLocalSession(request);
  if (!user) return { error: NextResponse.json({ success: false, error: "Session expired." }, { status: 401 }) };
  if (!MANAGE_ROLES.has(roleOf(user))) return { error: NextResponse.json({ success: false, error: "Admin or manager access is required." }, { status: 403 }) };
  return { user };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await manager(request); if (auth.error) return auth.error;
    const [publicProjects, rows] = await Promise.all([
      getPublicProjectsForSeo(),
      selectRows("projects", { filters: { public_display: true }, select: "project_code,public_project_title,public_description,project_category,cover_image_url,gallery_images,public_services,completion_year,website_featured,website_featured_order,public_display_order", order: "public_display_order:asc,updated_at:desc", limit: 2000 }),
    ]);
    const raw = new Map(rows.map((row: any) => [String(row.project_code || ""), row]));
    const data = publicProjects.map((project) => ({ ...project, ...(raw.get(String(project.projectId || "")) || {}) }));
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load website curation." }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const auth = await manager(request); if (auth.error) return auth.error;
    const body = await request.json() as Record<string, unknown>;
    const projectCode = normalizeProjectCode(body.projectId || body.project_code);
    if (!projectCode) return NextResponse.json({ success: false, error: "Project ID is required." }, { status: 400 });

    const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (Object.prototype.hasOwnProperty.call(body, "websiteFeatured")) changes.website_featured = bool(body.websiteFeatured);
    if (Object.prototype.hasOwnProperty.call(body, "websiteFeaturedOrder")) {
      const order = Math.max(0, Math.min(999, Math.trunc(Number(body.websiteFeaturedOrder) || 0)));
      changes.website_featured_order = order;
    }
    if (Object.prototype.hasOwnProperty.call(body, "publicTitle")) changes.public_project_title = text(body.publicTitle, 180) || null;
    if (Object.prototype.hasOwnProperty.call(body, "publicDescription")) changes.public_description = text(body.publicDescription, 2200) || null;
    if (Object.prototype.hasOwnProperty.call(body, "projectCategory")) changes.project_category = text(body.projectCategory, 100) || null;
    if (Object.prototype.hasOwnProperty.call(body, "coverImageUrl")) changes.cover_image_url = text(body.coverImageUrl, 1200) || null;
    if (Object.prototype.hasOwnProperty.call(body, "galleryImages")) changes.gallery_images = text(body.galleryImages, 6000) || null;
    if (Object.prototype.hasOwnProperty.call(body, "publicServices")) changes.public_services = text(body.publicServices, 1800) || null;
    if (Object.prototype.hasOwnProperty.call(body, "completionYear")) changes.completion_year = text(body.completionYear, 40) || null;

    const updated = await updateRows("projects", { project_code: projectCode }, changes);
    if (!updated.length) return NextResponse.json({ success: false, error: "Project not found." }, { status: 404 });
    return NextResponse.json({ success: true, data: updated[0] }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not save website curation." }, { status: 502 });
  }
}
