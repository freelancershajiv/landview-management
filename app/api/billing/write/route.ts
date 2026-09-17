import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { employeeCodeOf, handleLandviewDataAction, roleOf, supabaseGateway } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function cleanKey(value: unknown) {
  const key = String(value ?? "").trim();
  return /^[A-Za-z0-9._:-]{12,120}$/.test(key) ? key : "";
}
function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}
function num(value: unknown) {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || "").trim();
    if (!new Set(["saveBill", "savePayment", "saveDiscount"]).has(action)) {
      return NextResponse.json({ success: false, error: "Unsupported billing write action." }, { status: 400 });
    }
    const idempotencyKey = cleanKey(body.Idempotency_Key || body.idempotencyKey);
    if (!idempotencyKey) return NextResponse.json({ success: false, error: "A valid idempotency key is required." }, { status: 400 });

    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    const role = roleOf(user);
    if (!["admin", "manager", "accounts", "employee"].includes(role)) {
      return NextResponse.json({ success: false, error: "Finance access is required." }, { status: 403 });
    }

    let data: unknown;
    if (action === "saveDiscount") {
      const projectCode = text(body.Project_ID || body.projectId, 60).toUpperCase();
      const category = text(body.Billing_Category || body.Category || body.category, 80);
      const discountAmount = num(body.Amount || body.Discount || body.discount);
      if (!projectCode) return NextResponse.json({ success: false, error: "Project is required." }, { status: 400 });
      if (!category) return NextResponse.json({ success: false, error: "Discount category is required." }, { status: 400 });
      if (!(discountAmount > 0)) return NextResponse.json({ success: false, error: "Enter a valid discount amount." }, { status: 400 });

      data = await supabaseGateway("applyBillingDiscount", {
        projectCode,
        category,
        amount: discountAmount,
        discountDate: text(body.Discount_Date || body.Date, 20) || new Date().toISOString().slice(0, 10),
        notes: text(body.Notes || body.notes, 1000),
        createdBy: employeeCodeOf(user) || text((user as Record<string, unknown>)?.username || (user as Record<string, unknown>)?.Username, 120) || "LAND VIEW",
        idempotencyKey,
      });
    } else {
      data = await handleLandviewDataAction(action, { ...body, Idempotency_Key: idempotencyKey }, user);
    }

    const masterAdmin = role === "admin";
    return NextResponse.json({
      success: true,
      data: masterAdmin && action === "savePayment"
        ? { ...(data as Record<string, unknown>), Approval_Status: "Approved", Acknowledgement_Status: "Unseen" }
        : data,
      ...(masterAdmin && action === "savePayment" ? {
        autoApproved: true,
        acknowledgementRequiredBy: "EMP-0001",
        ledgerPosted: true,
        ledgerDeferred: false,
      } : {}),
    }, { status: 200, headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "The billing write response timed out. Refresh Billing before trying again so you do not duplicate a transaction."
      : error instanceof Error ? error.message : "Billing write failed.";
    const status = /required|invalid|cannot exceed|must be greater/i.test(message) ? 400 : 502;
    return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
