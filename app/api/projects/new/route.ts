import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { insertRows, roleOf, selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MANAGE_ROLES = new Set(["admin", "manager"]);

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function text(value: unknown, max = 1000) { return String(value ?? "").trim().slice(0, max); }
function normalizeProjectCode(value: unknown) {
  const raw = text(value, 60).toUpperCase();
  if (!raw) return "";
  const match = raw.match(/LV[\s_-]*0*(\d+)/i);
  if (match?.[1]) return `LV-${Number(match[1])}`;
  const digits = raw.replace(/\D/g, "");
  return digits ? `LV-${Number(digits)}` : "";
}
function numericId(code: unknown) {
  const match = text(code, 60).toUpperCase().match(/^LV-(\d+)$/);
  return match ? Number(match[1]) : 0;
}
function isUniqueViolation(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");
  return /duplicate key|unique constraint|23505|already exists/i.test(message);
}
function cleanDate(value: unknown) {
  const date = text(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}
function integerOrNull(value: unknown) {
  const raw = text(value, 40);
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

async function existingProjectCodes() {
  const rows = await selectRows("projects", { select: "project_code", limit: 10000 });
  return rows.map((row) => text(row.project_code, 60)).filter(Boolean);
}

async function nextAutomaticCode() {
  const codes = await existingProjectCodes();
  const max = codes.reduce((current, code) => Math.max(current, numericId(code)), 0);
  return `LV-${max + 1}`;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!MANAGE_ROLES.has(roleOf(user))) return NextResponse.json({ success: false, error: "Admin or manager access is required." }, { status: 403 });
    const nextId = await nextAutomaticCode();
    return NextResponse.json({ success: true, data: { nextId } }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not calculate the next project ID." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!MANAGE_ROLES.has(roleOf(user))) return NextResponse.json({ success: false, error: "Admin or manager access is required." }, { status: 403 });

    const body = await request.json() as Record<string, unknown>;
    const mode = text(body.idMode || body.mode, 20).toLowerCase() === "manual" ? "manual" : "automatic";
    const projectName = text(body.Project_Name || body.projectName, 240);
    const clientName = text(body.Client_Name || body.clientName, 240) || projectName;
    if (!projectName) return NextResponse.json({ success: false, error: "Project name is required." }, { status: 400 });

    const baseRow: Record<string, unknown> = {
      project_name: projectName,
      client_name_snapshot: clientName,
      phone_number_snapshot: text(body.Phone_Number || body.phoneNumber, 80) || null,
      referred_by: text(body.Referred_By || body.referredBy, 240) || null,
      ref_contact: text(body.Ref_Contact || body.refContact, 120) || null,
      project_type: text(body.Project_Type || body.projectType, 160) || null,
      location: text(body.Location || body.location, 300) || null,
      project_area_text: text(body.Project_Area || body.projectArea, 120) || null,
      number_of_stories_text: text(body.Number_of_Stories || body.numberOfStories, 80) || null,
      start_date: cleanDate(body.Start_Date || body.startDate),
      status: text(body.Status || body.status, 80) || "Running",
      notes: text(body.Notes || body.notes, 2000) || null,
      public_display: false,
      updated_at: new Date().toISOString(),
    };
    const floors = integerOrNull(body.Number_of_Stories || body.numberOfStories);
    if (floors !== null) baseRow.floors = floors;

    if (mode === "manual") {
      const code = normalizeProjectCode(body.Project_ID || body.projectId || body.manualId);
      if (!code) return NextResponse.json({ success: false, error: "Enter a valid manual project ID, for example LV-72." }, { status: 400 });
      const exists = await selectRows("projects", { filters: { project_code: code }, select: "id,project_code", limit: 1 });
      if (exists.length) return NextResponse.json({ success: false, error: `${code} already exists. Choose a genuinely unused project ID.` }, { status: 409 });
      try {
        const saved = await insertRows("projects", { ...baseRow, project_code: code });
        return NextResponse.json({ success: true, data: { Project_ID: code, project: saved[0] || null, idMode: mode } }, { status: 201, headers: { "Cache-Control": "no-store, max-age=0" } });
      } catch (error) {
        if (isUniqueViolation(error)) return NextResponse.json({ success: false, error: `${code} was just taken by another project. Choose another ID.` }, { status: 409 });
        throw error;
      }
    }

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = await nextAutomaticCode();
      try {
        const saved = await insertRows("projects", { ...baseRow, project_code: code });
        return NextResponse.json({ success: true, data: { Project_ID: code, project: saved[0] || null, idMode: mode } }, { status: 201, headers: { "Cache-Control": "no-store, max-age=0" } });
      } catch (error) {
        if (isUniqueViolation(error)) continue;
        throw error;
      }
    }
    return NextResponse.json({ success: false, error: "Could not reserve a unique automatic project ID. Please retry." }, { status: 409 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create the project.";
    return NextResponse.json({ success: false, error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
