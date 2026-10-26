import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { employeeCodeOf, insertRows, normalizeProjectCode, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
const WRITE_ROLES = new Set(["admin", "manager", "accounts"]);

function text(value: unknown, max = 1200) { return String(value ?? "").trim().slice(0, max); }
function num(value: unknown) {
  const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : Number.NaN;
}
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function actorOf(user: Row) {
  return employeeCodeOf(user) || text(user.username || user.Username || user.name || user.Name, 160) || "LAND VIEW";
}
function serviceFromBill(row: Row) {
  return text(row.description, 500)
    .replace(/^\[(Engineering Bill|Design Books|Supervision Bill|Other Services Bill)\]\s*/i, "")
    .replace(/\s+—\s+(Credit Note|Debit Note).*$/i, "")
    .trim() || text(row.billing_category || row.category, 120) || "Service";
}
function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  try {
    const user = await requireLocalSession(request) as Row | null;
    if (!user) return json({ success: false, error: "Session expired." }, 401);
    if (!WRITE_ROLES.has(roleOf(user))) return json({ success: false, error: "Admin, manager or accounts access is required to edit service discounts." }, 403);

    const body = await request.json() as Row;
    const projectCode = normalizeProjectCode(body.projectId || body.Project_ID || "");
    const billCode = text(body.billCode || body.Bill_ID, 160);
    const nextDiscount = Math.round(num(body.discount) * 100) / 100;
    const reason = text(body.reason, 1000) || "Full Bill Editor service discount";
    const notes = text(body.notes, 2000);

    if (!projectCode || !billCode) return json({ success: false, error: "Project and Bill ID are required." }, 400);
    if (!Number.isFinite(nextDiscount) || nextDiscount < 0) return json({ success: false, error: "Discount must be zero or greater." }, 400);

    const [billRows, projectRows] = await Promise.all([
      selectRows("bills", { filters: { bill_code: billCode }, limit: 1 }),
      selectRows("projects", { filters: { project_code: projectCode }, limit: 1 }),
    ]);
    if (!billRows.length) return json({ success: false, error: "Bill was not found." }, 404);
    if (!projectRows.length || billRows[0].project_id !== projectRows[0].id) return json({ success: false, error: "Bill does not belong to the selected project." }, 409);

    const bill = billRows[0];
    const status = text(bill.status).toLowerCase();
    if (["void", "voided", "cancelled", "canceled", "rejected"].includes(status)) return json({ success: false, error: "A void or cancelled bill cannot be discounted." }, 409);
    const createdVia = text(bill.created_via).toLowerCase();
    if (createdVia.includes("credit note") || createdVia.includes("debit note")) return json({ success: false, error: "Edit the original bill, not an adjustment record." }, 409);

    const gross = Math.max(0, Number(bill.amount) || 0);
    if (nextDiscount > gross + 0.009) return json({ success: false, error: `Discount cannot exceed the gross amount of BDT ${gross.toLocaleString("en-BD")}.` }, 400);

    const previousDiscount = Math.max(0, Number(bill.discount) || 0);
    if (Math.abs(previousDiscount - nextDiscount) < 0.009) {
      return json({ success: true, data: { billCode, previousDiscount, discount: nextDiscount, netAmount: Math.max(0, gross - nextDiscount), unchanged: true } });
    }

    const now = new Date().toISOString();
    const actor = actorOf(user);
    const updated = await updateRows("bills", { bill_code: billCode }, {
      discount: nextDiscount,
      source_updated_at: now,
      updated_at: now,
    });

    await insertRows("billing_events", {
      project_id: projectRows[0].id,
      project_code: projectCode,
      event_type: "service_discount_set",
      event_key: `service-discount-set:${bill.id}:${crypto.randomUUID()}`,
      service_name: serviceFromBill(bill),
      amount: Math.abs(nextDiscount - previousDiscount),
      actor,
      details: {
        billCode,
        previousDiscount,
        newDiscount: nextDiscount,
        delta: nextDiscount - previousDiscount,
        reason,
        notes: notes || null,
        storage: "original_bill_discount",
        source: "full-bill-editor",
      },
      created_at: now,
    });

    return json({
      success: true,
      data: {
        billCode,
        previousDiscount,
        discount: nextDiscount,
        netAmount: Math.max(0, gross - nextDiscount),
        bill: updated[0] || null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update the service discount.";
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : 502);
  }
}
