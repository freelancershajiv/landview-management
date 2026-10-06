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

function dhakaDay(value: Date | string | number) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function leadSummary(rows: Record<string, any>[]) {
  const now = Date.now();
  const today = dhakaDay(new Date());
  let newCount = 0;
  let overdueFollowUps = 0;
  let dueToday = 0;
  let qualified = 0;
  let converted = 0;

  for (const row of rows) {
    const status = text(row.status, 40) || "New";
    if (status === "New") newCount += 1;
    if (status === "Qualified") qualified += 1;
    if (status === "Converted") converted += 1;
    if (["Converted", "Closed"].includes(status) || !row.follow_up_at) continue;
    const due = new Date(row.follow_up_at);
    if (Number.isNaN(due.getTime())) continue;
    if (due.getTime() < now && dhakaDay(due) !== today) overdueFollowUps += 1;
    if (dhakaDay(due) === today) dueToday += 1;
  }

  return { total: rows.length, newCount, overdueFollowUps, dueToday, qualified, converted };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireManager(request);
    if (auth.error) return auth.error;
    const rows = await selectRows("website_leads", { order: "created_at:desc", limit: 3000 });
    if (request.nextUrl.searchParams.get("summary") === "1") {
      return NextResponse.json({ success: true, data: leadSummary(rows) }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    }
    return NextResponse.json({ success: true, data: rows, summary: leadSummary(rows) }, { headers: { "Cache-Control": "no-store, max-age=0" } });
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
    if (Object.prototype.hasOwnProperty.call(body, "adminNotes")) changes.admin_notes = text(body.adminNotes, 3000) || null;
    if (Object.prototype.hasOwnProperty.call(body, "nextAction")) changes.next_action = text(body.nextAction, 500) || null;
    if (Object.prototype.hasOwnProperty.call(body, "followUpAt")) {
      const raw = text(body.followUpAt, 80);
      if (!raw) changes.follow_up_at = null;
      else {
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return NextResponse.json({ success: false, error: "Invalid follow-up date." }, { status: 400 });
        changes.follow_up_at = parsed.toISOString();
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, "convertedProjectCode")) changes.converted_project_code = text(body.convertedProjectCode, 40).toUpperCase() || null;
    if (Object.prototype.hasOwnProperty.call(body, "convertedProposalCode")) changes.converted_proposal_code = text(body.convertedProposalCode, 80).toUpperCase() || null;

    const updated = await updateRows("website_leads", id ? { id } : { lead_code: leadCode }, changes);
    if (!updated.length) return NextResponse.json({ success: false, error: "Lead not found." }, { status: 404 });
    return NextResponse.json({ success: true, data: updated[0] }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not update website enquiry." }, { status: 502 });
  }
}
