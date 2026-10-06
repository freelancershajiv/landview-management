import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { normalizeProjectCode, roleOf, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MANAGE_ROLES = new Set(["admin", "manager"]);
function text(value: unknown, max = 1000) { return String(value ?? "").trim().slice(0, max); }
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function fullAddress(input: Record<string, unknown>) {
  const parts = [
    text(input.roadHolding || input.Road_Holding),
    text(input.villageArea || input.Village_Area),
    text(input.wardNo || input.Ward_No) ? `Ward ${text(input.wardNo || input.Ward_No)}` : "",
    text(input.localBodyName || input.Local_Body_Name),
    text(input.upazilaThana || input.Upazila_Thana),
    text(input.district || input.District),
    text(input.division || input.Division),
  ].filter(Boolean);
  return parts.length ? `${parts.join(", ")}, Bangladesh` : "";
}
function publicRow(row: Record<string, unknown>) {
  return {
    projectId: row.project_code || "",
    projectName: row.project_name || "",
    clientName: row.client_name_snapshot || "",
    legacyLocation: row.location || "",
    division: row.division || "",
    district: row.district || "",
    upazilaThana: row.upazila_thana || "",
    localBodyType: row.local_body_type || "",
    localBodyName: row.local_body_name || "",
    wardNo: row.ward_no || "",
    villageArea: row.village_area || "",
    roadHolding: row.road_holding || "",
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!MANAGE_ROLES.has(roleOf(user))) return NextResponse.json({ success: false, error: "Admin or manager access is required." }, { status: 403 });
    const rows = await selectRows("projects", { order: "project_code:desc", limit: 10000 });
    return NextResponse.json({ success: true, data: rows.map(publicRow) }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load project locations." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!MANAGE_ROLES.has(roleOf(user))) return NextResponse.json({ success: false, error: "Admin or manager access is required." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const projectCode = normalizeProjectCode(body.projectId || body.Project_ID);
    if (!projectCode) return NextResponse.json({ success: false, error: "Project ID is required." }, { status: 400 });
    const rows = await selectRows("projects", { filters: { project_code: projectCode }, select: "id,project_code", limit: 1 });
    if (!rows.length) return NextResponse.json({ success: false, error: "Project not found." }, { status: 404 });

    const changes = {
      division: text(body.division || body.Division, 100) || null,
      district: text(body.district || body.District, 100) || null,
      upazila_thana: text(body.upazilaThana || body.Upazila_Thana, 140) || null,
      local_body_type: text(body.localBodyType || body.Local_Body_Type, 60) || null,
      local_body_name: text(body.localBodyName || body.Local_Body_Name, 160) || null,
      ward_no: text(body.wardNo || body.Ward_No, 30) || null,
      village_area: text(body.villageArea || body.Village_Area, 240) || null,
      road_holding: text(body.roadHolding || body.Road_Holding, 300) || null,
      location: text(body.fullAddress, 1000) || fullAddress(body) || null,
      updated_at: new Date().toISOString(),
    };
    const updated = await updateRows("projects", { project_code: projectCode }, changes);
    return NextResponse.json({ success: true, data: publicRow(updated[0] || { ...changes, project_code: projectCode }) }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not save project location." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
