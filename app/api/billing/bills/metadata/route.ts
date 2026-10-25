import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { normalizeProjectCode, roleOf, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDIT_ROLES = new Set(["admin", "manager", "accounts"]);
const BILL_CATEGORIES = new Set(["Engineering Bill", "Design Books", "Supervision Bill", "Other Services Bill"]);

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function text(value: unknown, max = 2000) { return String(value ?? "").trim().slice(0, max); }
function date(value: unknown) {
  const v = text(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}
function serviceText(value: unknown) {
  return text(value, 1000).replace(/^\[(Engineering Bill|Design Books|Supervision Bill|Other Services Bill)\]\s*/i, "").trim();
}

export async function PATCH(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!EDIT_ROLES.has(roleOf(user))) return NextResponse.json({ success: false, error: "Admin, manager or accounts access is required to edit bill details." }, { status: 403 });

    const body = await request.json() as Record<string, unknown>;
    const billId = text(body.Bill_ID || body.billId, 120);
    if (!billId) return NextResponse.json({ success: false, error: "Bill ID is required." }, { status: 400 });

    const found = await selectRows("bills", { filters: { bill_code: billId }, limit: 1 });
    if (!found.length) return NextResponse.json({ success: false, error: "Bill was not found." }, { status: 404 });
    const current = found[0];

    const projectCode = normalizeProjectCode(body.Project_ID || body.projectId || "");
    if (projectCode) {
      const projects = await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 });
      if (!projects.length || projects[0].id !== current.project_id) {
        return NextResponse.json({ success: false, error: "This bill does not belong to the selected project." }, { status: 409 });
      }
    }

    const currentStatus = text(current.status).toLowerCase();
    if (["void", "voided", "cancelled", "canceled", "rejected"].includes(currentStatus)) {
      return NextResponse.json({ success: false, error: "Voided or cancelled bills cannot be edited." }, { status: 409 });
    }

    const category = text(body.Billing_Category || body.Category || body.category || current.billing_category || current.category, 80);
    if (!BILL_CATEGORIES.has(category)) return NextResponse.json({ success: false, error: "Choose a valid billing category." }, { status: 400 });

    const billDate = date(body.Bill_Date || body.Date || current.bill_date);
    if (!billDate) return NextResponse.json({ success: false, error: "Enter a valid bill date." }, { status: 400 });

    const service = serviceText(body.Description || body.Service || body.Particulars || current.description);
    if (!service) return NextResponse.json({ success: false, error: "Service / description is required." }, { status: 400 });

    const notesProvided = Object.prototype.hasOwnProperty.call(body, "Notes") || Object.prototype.hasOwnProperty.call(body, "notes");
    const notes = notesProvided ? text(body.Notes ?? body.notes, 4000) : text(current.notes, 4000);
    const now = new Date().toISOString();
    const rows = await updateRows("bills", { bill_code: billId }, {
      bill_date: billDate,
      billing_category: category,
      category,
      description: `[${category}] ${service}`,
      notes: notes || null,
      source_updated_at: now,
      updated_at: now,
    });

    return NextResponse.json({ success: true, data: rows[0] || null }, {
      headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not edit bill details.";
    return NextResponse.json({ success: false, error: message }, {
      status: /session/i.test(message) ? 401 : 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
