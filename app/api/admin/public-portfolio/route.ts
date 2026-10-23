import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { normalizePublicImageUrl } from "@/lib/public-projects-server";
import { normalizeProjectCode, roleOf, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MANAGE_ROLES = new Set(["admin", "manager"]);
const EMPTY_VALUES = new Set(["", "-", "—", "–", "0", "n/a", "na", "nil", "null", "undefined"]);

function text(value: unknown, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}
function clean(value: unknown) {
  const valueText = String(value ?? "").replace(/\s+/g, " ").trim();
  return EMPTY_VALUES.has(valueText.toLowerCase()) ? "" : valueText;
}
function bool(value: unknown) {
  return value === true || String(value ?? "").toLowerCase() === "true";
}
function integer(value: unknown, max = 9999) {
  const parsed = Number(value);
  return Math.max(0, Math.min(max, Number.isFinite(parsed) ? Math.trunc(parsed) : 0));
}
function has(body: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(body, key);
}
function splitList(value: unknown) {
  return String(value ?? "").split(/[\n,;]+/).map((item) => clean(item)).filter(Boolean);
}
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
function localBodyLabel(type: string, name: string) {
  if (!name) return "";
  const normalizedType = type.toLowerCase();
  if (/union/i.test(name) || /paurashava|pourashava|municipality/i.test(name) || /city corporation/i.test(name)) return name;
  if (normalizedType.includes("union")) return `${name} Union`;
  if (normalizedType.includes("city")) return `${name} City Corporation`;
  if (normalizedType.includes("paur") || normalizedType.includes("pour") || normalizedType.includes("municip")) return `${name} Paurashava`;
  return name;
}
function structuredAddress(row: Record<string, unknown>) {
  const division = clean(row.division);
  const district = clean(row.district);
  const upazila = clean(row.upazila_thana);
  const localType = clean(row.local_body_type);
  const localName = localBodyLabel(localType, clean(row.local_body_name));
  const wardRaw = clean(row.ward_no).replace(/^ward\s*/i, "");
  const ward = wardRaw ? `Ward ${wardRaw.padStart(2, "0")}` : "";
  const village = clean(row.village_area);
  const road = clean(row.road_holding);
  const seen = new Set<string>();
  return [road, village, ward, localName, upazila, district, division].filter(Boolean).filter((part) => {
    const key = part.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(" · ");
}
function currentStage(row: Record<string, unknown>) {
  const lifecycle = clean(row.lifecycle_phase);
  if (["Design Stage", "Approval Stage", "Supervision / Construction Stage", "Completed"].includes(lifecycle)) return lifecycle;
  if (String(row.design_stage_status || "Pending") !== "Completed") return "Design Stage";
  if (String(row.approval_stage_status || "Pending") !== "Completed") return "Approval Stage";
  if (String(row.supervision_stage_status || "Completed") !== "Completed") return "Supervision / Construction Stage";
  return "Completed";
}
function publicLocation(row: Record<string, unknown>) {
  const structured = structuredAddress(row);
  if (structured) return structured;
  const legacy = clean(row.location);
  if (!legacy || /^https?:\/\//i.test(legacy) || /google\.[^/]+\/maps|maps\.app\.goo\.gl/i.test(legacy)) return "";
  return legacy;
}
function portfolioRow(row: Record<string, unknown>) {
  const projectId = text(row.project_code, 60);
  const title = clean(row.public_project_title) || clean(row.project_name) || projectId;
  const category = clean(row.project_category) || clean(row.project_type);
  const location = publicLocation(row);
  const coverImageUrl = normalizePublicImageUrl(text(row.cover_image_url, 1200));
  const description = clean(row.public_description);
  const services = splitList(row.public_services);
  const checks = [
    { label: "Public title", ok: Boolean(clean(row.public_project_title)) },
    { label: "Project category", ok: Boolean(category) },
    { label: "Structured address", ok: Boolean(structuredAddress(row)) },
    { label: "Cover image", ok: Boolean(coverImageUrl) },
    { label: "Public description", ok: Boolean(description && description.length >= 40) },
    { label: "Services", ok: Boolean(services.length) },
    { label: "Project ID", ok: Boolean(projectId) },
  ];
  const score = Math.round((checks.filter((check) => check.ok).length / checks.length) * 100);
  return {
    projectId,
    projectName: clean(row.project_name),
    projectType: clean(row.project_type),
    public_display: Boolean(row.public_display),
    public_display_order: Number(row.public_display_order || 0),
    website_featured: Boolean(row.website_featured),
    website_featured_order: Number(row.website_featured_order || 0),
    public_project_title: text(row.public_project_title, 180),
    project_category: text(row.project_category, 100),
    public_description: text(row.public_description, 2200),
    public_services: text(row.public_services, 1800),
    cover_image_url: text(row.cover_image_url, 1200),
    gallery_images: text(row.gallery_images, 6000),
    completion_year: text(row.completion_year, 40),
    project_area_text: text(row.project_area_text, 120),
    number_of_stories_text: text(row.number_of_stories_text, 80),
    division: text(row.division, 100),
    district: text(row.district, 100),
    upazila_thana: text(row.upazila_thana, 140),
    local_body_type: text(row.local_body_type, 60),
    local_body_name: text(row.local_body_name, 160),
    ward_no: text(row.ward_no, 30),
    village_area: text(row.village_area, 240),
    road_holding: text(row.road_holding, 300),
    location_tag: text(row.location_tag, 4000),
    title,
    category,
    location,
    currentStage: currentStage(row),
    area: clean(row.project_area_text) || clean(row.plot_area),
    stories: clean(row.number_of_stories_text) || clean(row.floors),
    completionYear: clean(row.completion_year),
    description,
    coverImageUrl,
    galleryImages: splitList(row.gallery_images).map((item) => normalizePublicImageUrl(item)),
    services,
    mapEnabled: Boolean(text(row.location_tag)),
    publicReadiness: score,
    publicReady: score >= 72 && Boolean(coverImageUrl && location && title),
    publicMissing: checks.filter((check) => !check.ok).map((check) => check.label),
    updatedAt: row.updated_at || null,
  };
}

const SELECT = [
  "project_code", "project_name", "project_type", "public_display", "public_display_order", "website_featured", "website_featured_order",
  "public_project_title", "project_category", "public_description", "public_services", "cover_image_url", "gallery_images", "completion_year",
  "project_area_text", "plot_area", "number_of_stories_text", "floors", "location", "location_tag", "site_latitude", "site_longitude",
  "division", "district", "upazila_thana", "local_body_type", "local_body_name", "ward_no", "village_area", "road_holding",
  "lifecycle_phase", "design_stage_status", "approval_stage_status", "supervision_stage_status", "updated_at",
].join(",");

export async function GET(request: NextRequest) {
  try {
    const auth = await manager(request); if (auth.error) return auth.error;
    const rows = await selectRows("projects", { select: SELECT, order: "public_display_order:asc,updated_at:desc", limit: 10000 });
    return NextResponse.json({ success: true, data: rows.map((row: any) => portfolioRow(row)) }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load public portfolio." }, { status: 502 });
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
    if (has(body, "publicDisplay")) changes.public_display = bool(body.publicDisplay);
    if (has(body, "publicDisplayOrder")) changes.public_display_order = integer(body.publicDisplayOrder);
    if (has(body, "websiteFeatured")) changes.website_featured = bool(body.websiteFeatured);
    if (has(body, "websiteFeaturedOrder")) changes.website_featured_order = integer(body.websiteFeaturedOrder, 999);
    if (has(body, "publicTitle")) changes.public_project_title = text(body.publicTitle, 180) || null;
    if (has(body, "projectCategory")) changes.project_category = text(body.projectCategory, 100) || null;
    if (has(body, "publicDescription")) changes.public_description = text(body.publicDescription, 2200) || null;
    if (has(body, "publicServices")) changes.public_services = text(body.publicServices, 1800) || null;
    if (has(body, "coverImageUrl")) changes.cover_image_url = text(body.coverImageUrl, 1200) || null;
    if (has(body, "galleryImages")) changes.gallery_images = text(body.galleryImages, 6000) || null;
    if (has(body, "completionYear")) changes.completion_year = text(body.completionYear, 40) || null;
    if (has(body, "projectAreaText")) changes.project_area_text = text(body.projectAreaText, 120) || null;
    if (has(body, "numberOfStoriesText")) changes.number_of_stories_text = text(body.numberOfStoriesText, 80) || null;
    if (has(body, "division")) changes.division = text(body.division, 100) || null;
    if (has(body, "district")) changes.district = text(body.district, 100) || null;
    if (has(body, "upazilaThana")) changes.upazila_thana = text(body.upazilaThana, 140) || null;
    if (has(body, "localBodyType")) changes.local_body_type = text(body.localBodyType, 60) || null;
    if (has(body, "localBodyName")) changes.local_body_name = text(body.localBodyName, 160) || null;
    if (has(body, "wardNo")) changes.ward_no = text(body.wardNo, 30) || null;
    if (has(body, "villageArea")) changes.village_area = text(body.villageArea, 240) || null;
    if (has(body, "roadHolding")) changes.road_holding = text(body.roadHolding, 300) || null;
    if (has(body, "locationTag")) changes.location_tag = text(body.locationTag, 4000) || null;

    const updated = await updateRows("projects", { project_code: projectCode }, changes);
    if (!updated.length) return NextResponse.json({ success: false, error: "Project not found." }, { status: 404 });
    const rows = await selectRows("projects", { filters: { project_code: projectCode }, select: SELECT, limit: 1 });
    return NextResponse.json({ success: true, data: portfolioRow((rows[0] || updated[0]) as Record<string, unknown>) }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not save public portfolio project." }, { status: 502 });
  }
}
