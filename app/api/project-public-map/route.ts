import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { normalizeProjectCode, roleOf, selectRows, updateRows } from "@/lib/supabase-data";

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

function coordinate(value: unknown, min: number, max: number) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : Number.NaN;
}

function settings(row: Record<string, any>) {
  return {
    projectId: String(row.project_code || ""),
    projectTitle: String(row.public_project_title || row.project_name || row.project_code || ""),
    location: String(row.location || ""),
    publicDisplay: Boolean(row.public_display),
    publicMapEnabled: Boolean(row.public_map_enabled),
    publicMapPrecision: row.public_map_precision === "exact" ? "exact" : "approximate",
    publicMapLatitude: row.public_map_latitude ?? "",
    publicMapLongitude: row.public_map_longitude ?? "",
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
      { success: true, data: settings(rows[0]) },
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

    const publicMapEnabled = body.publicMapEnabled === true;
    const publicMapPrecision = body.publicMapPrecision === "exact" ? "exact" : "approximate";
    const publicMapLatitude = coordinate(body.publicMapLatitude, -90, 90);
    const publicMapLongitude = coordinate(body.publicMapLongitude, -180, 180);

    if (Number.isNaN(publicMapLatitude) || Number.isNaN(publicMapLongitude)) {
      return NextResponse.json({ success: false, error: "Enter valid public map latitude and longitude." }, { status: 400 });
    }
    if (publicMapEnabled && (publicMapLatitude === null || publicMapLongitude === null)) {
      return NextResponse.json({ success: false, error: "Public map coordinates are required before publishing a project on the map." }, { status: 400 });
    }

    const updated = await updateRows(
      "projects",
      { project_code: projectId },
      {
        public_map_enabled: publicMapEnabled,
        public_map_precision: publicMapPrecision,
        public_map_latitude: publicMapLatitude,
        public_map_longitude: publicMapLongitude,
        updated_at: new Date().toISOString(),
      },
    );

    return NextResponse.json(
      { success: true, data: settings(updated[0] || { ...rows[0], public_map_enabled: publicMapEnabled, public_map_precision: publicMapPrecision, public_map_latitude: publicMapLatitude, public_map_longitude: publicMapLongitude }) },
      { headers: { "Cache-Control": "no-store", "X-Landview-Data": "supabase" } },
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Could not save public map settings." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
