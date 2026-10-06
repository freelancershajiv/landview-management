import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { roleOf, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MANAGE_ROLES = new Set(["admin", "manager"]);
const STATUSES = new Set(["New", "Contacted", "Qualified", "Converted", "Closed"]);
const PRIORITIES = new Set(["Low", "Normal", "High", "Urgent"]);

function text(value: unknown, max = 1000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

async function requireManager(request: NextRequest) {
  const user = await requireLocalSession(request);
  if (!user) return { error: NextResponse.json({ success: false, error: "Session expired." }, { status: 401 }) };
  if (!MANAGE_ROLES.has(roleOf(user))) return { error: NextResponse.json({ success: false, error: "Admin or manager access is required." }, { status: 403 }) };
  return { user };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireManager(request);
    if (auth.error) return auth.error;
    const rows = await selectRows("website_leads", { order: "created_at:desc", limit: 3000 });
    return NextResponse.json({ success: true, data: rows }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load website enquiries." }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const auth = await requireManager(request);
    if (auth.error) return auth.error;

    const body = await request.json() as Record<string, unknown>;
    const id = text(body.id, 80);
    const leadCode = text(body.leadCode, 80);
    if (!id && !leadCode) return NextResponse.json({ success: false, error: "Lead ID is required." }, { status: 400 });

    const status = text(body.status, 40);
    const priority = text(body.priority, 40);
    const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (status) {
      if (!STATUSES.has(status)) return NextResponse.json({ success: false, error: "Invalid lead status." }, { status: 400 });
      changes.status = status;
      if (["Contacted", "Qualified", "Converted"].includes(status)) changes.contacted_at = new Date().toISOString();
    }
    if (priority) {
      if (!PRIORITIES.has(priority)) return NextResponse.json({ success: false, error: "Invalid priority." }, { status: 400 });
      changes.priority = priority;
    }
    if (Object.prototype.hasOwnProperty.call(body, "assignedTo")) changes.assigned_to = text(body.assignedTo, 140) || null;
    if (Object.prototype.hasOwnProperty.call(body, "adminNotes")) changes.admin_notes = text(body.adminNotes, 2000) || null;
    if (Object.prototype.hasOwnProperty.call(body, "convertedProjectCode")) changes.converted_project_code = text(body.convertedProjectCode, 40).toUpperCase() || null;

    const updated = await updateRows("website_leads", id ? { id } : { lead_code: leadCode }, changes);
    if (!updated.length) return NextResponse.json({ success: false, error: "Lead not found." }, { status: 404 });
    return NextResponse.json({ success: true, data: updated[0] }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not update website enquiry." }, { status: 502 });
  }
}
