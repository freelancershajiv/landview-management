import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { deleteRows, normalizeProjectCode, roleOf, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDIT_ROLES = new Set(["admin", "manager", "accounts"]);
const REMOVE_ROLES = new Set(["admin", "manager"]);
const BILL_CATEGORIES = new Set(["Engineering Bill", "Design Books", "Supervision Bill", "Other Services Bill"]);

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function text(value: unknown, max = 1200) { return String(value ?? "").trim().slice(0, max); }
function num(value: unknown) {
  const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : Number.NaN;
}
function date(value: unknown) {
  const v = text(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}
function draftOnly(current: Record<string, unknown>) {
  return text(current.status).toLowerCase() === "draft";
}

async function findBillForProject(billId: string, projectCode: string) {
  const found = await selectRows("bills", { filters: { bill_code: billId }, limit: 1 });
  if (!found.length) return { error: NextResponse.json({ success: false, error: "Bill was not found." }, { status: 404 }) };
  const current = found[0];

  if (projectCode) {
    const projects = await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 });
    if (!projects.length || projects[0].id !== current.project_id) {
      return { error: NextResponse.json({ success: false, error: "This bill does not belong to the selected project." }, { status: 409 }) };
    }
  }
  return { current };
}

export async function PATCH(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!EDIT_ROLES.has(roleOf(user))) return NextResponse.json({ success: false, error: "Admin, manager or accounts access is required to edit billed items." }, { status: 403 });

    const body = await request.json() as Record<string, unknown>;
    const billId = text(body.Bill_ID || body.billId, 120);
    if (!billId) return NextResponse.json({ success: false, error: "Bill ID is required." }, { status: 400 });
    const projectCode = normalizeProjectCode(body.Project_ID || body.projectId || "");
    const lookup = await findBillForProject(billId, projectCode);
    if ("error" in lookup) return lookup.error;
    if (!draftOnly(lookup.current)) return NextResponse.json({ success: false, error: "Posted/issued bills are locked. Use a Credit Note or Debit Note to correct the financial record." }, { status: 409 });

    const category = text(body.Billing_Category || body.Category || body.category, 80);
    if (!BILL_CATEGORIES.has(category)) return NextResponse.json({ success: false, error: "Choose a valid billing category." }, { status: 400 });
    const gross = num(body.Amount);
    const discount = num(body.Discount ?? 0);
    if (!(gross > 0)) return NextResponse.json({ success: false, error: "Enter a valid gross bill amount." }, { status: 400 });
    if (!Number.isFinite(discount) || discount < 0 || discount > gross) return NextResponse.json({ success: false, error: "Discount must be between zero and the gross bill amount." }, { status: 400 });
    const billDate = date(body.Bill_Date || body.Date);
    if (!billDate) return NextResponse.json({ success: false, error: "Enter a valid bill date." }, { status: 400 });
    const rawDescription = text(body.Description || body.Service || body.Particulars, 1000);
    const service = rawDescription.replace(/^\[(Engineering Bill|Design Books|Supervision Bill|Other Services Bill)\]\s*/i, "").trim();
    if (!service) return NextResponse.json({ success: false, error: "Service / description is required." }, { status: 400 });

    const now = new Date().toISOString();
    const rows = await updateRows("bills", { bill_code: billId }, {
      bill_date: billDate,
      billing_category: category,
      category,
      description: `[${category}] ${service}`,
      amount: gross,
      discount,
      net_amount: Math.max(0, gross - discount),
      notes: text(body.Notes || body.notes, 2000) || null,
      source_updated_at: now,
      updated_at: now,
    });
    return NextResponse.json({ success: true, data: rows[0] || null }, { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not edit the bill.";
    return NextResponse.json({ success: false, error: message }, { status: /session/i.test(message) ? 401 : 502, headers: { "Cache-Control": "no-store" } });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!REMOVE_ROLES.has(roleOf(user))) return NextResponse.json({ success: false, error: "Admin or manager access is required to remove billed items." }, { status: 403 });

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const billId = text(body.Bill_ID || body.billId, 120);
    if (!billId) return NextResponse.json({ success: false, error: "Bill ID is required." }, { status: 400 });
    const projectCode = normalizeProjectCode(body.Project_ID || body.projectId || "");
    const lookup = await findBillForProject(billId, projectCode);
    if ("error" in lookup) return lookup.error;
    if (!draftOnly(lookup.current)) return NextResponse.json({ success: false, error: "Posted/issued bills cannot be deleted. Use a Credit Note, Debit Note, or void an adjustment document instead." }, { status: 409 });

    await deleteRows("bills", { bill_code: billId });
    const remaining = await selectRows("bills", { filters: { bill_code: billId }, limit: 1 });
    if (remaining.length) throw new Error("Bill removal could not be verified.");

    return NextResponse.json({ success: true, Bill_ID: billId }, { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not remove the bill.";
    return NextResponse.json({ success: false, error: message }, { status: /session/i.test(message) ? 401 : 502, headers: { "Cache-Control": "no-store" } });
  }
}