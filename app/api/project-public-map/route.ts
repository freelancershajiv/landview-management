import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { normalizeProjectCode, roleOf, selectRows, updateRows } from "@/lib/supabase-data";
import { looksLikeGoogleMapsLocation, parseGoogleMapsCoordinates, resolveGoogleMapsLocation } from "@/lib/google-maps-location";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeHost(value: string | null | undefined) {
  return String(value || "").split(":")[0].trim().toLowerCase();
}

function trustedVercelHosts() {
  return new Set(
    [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
      .map(normalizeHost)
      .filter(Boolean),
  );
}

function allowedHost(host: string) {
  return host === "app.landview.com.bd" || host === "localhost" || host === "127.0.0.1" || trustedVercelHosts().has(host);
}

function originAllowed(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try {
    return allowedHost(normalizeHost(new URL(origin).hostname));
  } catch {
    return false;
  }
}

async function authorizedUser(request: NextRequest) {
  const user = await requireLocalSession(request);
  if (!user) return null;
  const role = roleOf(user);
  return role === "admin" || role === "manager" ? user : null;
}

function validCoordinates(latitude: unknown, longitude: unknown) {
  const latText = String(latitude ?? "").trim();
  const lngText = String(longitude ?? "").trim();
  if (!latText || !lngText) return null;
  const lat = Number(latText);
  const lng = Number(lngText);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) return null;
  return { latitude: lat, longitude: lng };
}

async function projectMapSource(row: Record<string, any>) {
  const locationTag = String(row.location_tag || "").trim();
  if (!locationTag) return null;

  const direct = parseGoogleMapsCoordinates(locationTag);
  if (direct) return { latitude: direct.latitude, longitude: direct.longitude, source: "location-tag" as const };

  if (looksLikeGoogleMapsLocation(locationTag)) {
    try {
      const resolved = await resolveGoogleMapsLocation(locationTag);
      if (resolved) return { latitude: resolved.latitude, longitude: resolved.longitude, source: "location-tag" as const };
    } catch {}
  }

  // Only use the stored site coordinates when a Location Tag exists but Google
  // cannot temporarily expand it. These values are synchronized from the tag.
  const site = validCoordinates(row.site_latitude, row.site_longitude);
  if (site) return { ...site, source: "site-coordinates" as const };

  return null;
}

async function settings(row: Record<string, any>) {
  const source = await projectMapSource(row);
  return {
    projectId: String(row.project_code || ""),
    projectTitle: String(row.public_project_title || row.project_name || row.project_code || ""),
    location: String(row.location || ""),
    locationTag: String(row.location_tag || ""),
    publicDisplay: Boolean(row.public_display),
    publicMapEnabled: Boolean(row.public_map_enabled),
    publicMapPrecision: row.public_map_precision === "exact" ? "exact" : "approximate",
    publicMapLatitude: source?.latitude ?? "",
    publicMapLongitude: source?.longitude ?? "",
    mapSource: source?.source || "",
    siteLatitude: row.site_latitude ?? "",
    siteLongitude: row.site_longitude ?? "",
  };
}

export async function GET(request: NextRequest) {
  try {
    const host = normalizeHost(request.headers.get("host"));
    if (!allowedHost(host)) return NextResponse.json({ success: false, error: "Not found." }, { status: 404 });
    const user = await authorizedUser(request);
    if (!user) return NextResponse.json({ success: false, error: "Admin or Manager access is required." }, { status: 403 });

    const projectId = normalizeProjectCode(request.nextUrl.searchParams.get("projectId"));
    if (!projectId) return NextResponse.json({ success: false, error: "Project ID is required." }, { status: 400 });

    const rows = await selectRows("projects", { filters: { project_code: projectId }, limit: 1 });
    if (!rows[0]) return NextResponse.json({ success: false, error: "Project not found." }, { status: 404 });

    return NextResponse.json(
      { success: true, data: await settings(rows[0]) },
      { headers: { "Cache-Control": "no-store", "X-Landview-Data": "supabase" } },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Could not load public map settings." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const host = normalizeHost(request.headers.get("host"));
    if (!allowedHost(host) || !originAllowed(request)) {
      return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    }
    const user = await authorizedUser(request);
    if (!user) return NextResponse.json({ success: false, error: "Admin or Manager access is required." }, { status: 403 });

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const projectId = normalizeProjectCode(body.projectId);
    if (!projectId) return NextResponse.json({ success: false, error: "Project ID is required." }, { status: 400 });

    const rows = await selectRows("projects", { filters: { project_code: projectId }, limit: 1 });
    if (!rows[0]) return NextResponse.json({ success: false, error: "Project not found." }, { status: 404 });

    const project = rows[0];
    const publicMapEnabled = body.publicMapEnabled === true;
    const publicMapPrecision = body.publicMapPrecision === "exact" ? "exact" : "approximate";
    const locationTag = String(project.location_tag || "").trim();
    const source = await projectMapSource(project);

    if (publicMapEnabled && !locationTag) {
      return NextResponse.json({
        success: false,
        error: "Add a Location Tag in the project editor before publishing this project on the public map.",
      }, { status: 400 });
    }
    if (publicMapEnabled && !source) {
      return NextResponse.json({
        success: false,
        error: "The project Location Tag could not be resolved. Open the project editor, refresh the Location Tag, and try again.",
      }, { status: 400 });
    }

    const changes: Record<string, unknown> = {
      public_map_enabled: publicMapEnabled,
      public_map_precision: publicMapPrecision,
      public_map_latitude: source?.latitude ?? null,
      public_map_longitude: source?.longitude ?? null,
      updated_at: new Date().toISOString(),
    };

    if (source?.source === "location-tag") {
      changes.site_latitude = source.latitude;
      changes.site_longitude = source.longitude;
    }

    const updated = await updateRows("projects", { project_code: projectId }, changes);
    return NextResponse.json(
      { success: true, data: await settings(updated[0] || { ...project, ...changes }) },
      { headers: { "Cache-Control": "no-store", "X-Landview-Data": "supabase" } },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Could not save public map settings." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
