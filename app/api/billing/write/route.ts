import { NextRequest, NextResponse } from "next/server";
import { GET as legacyGET } from "../../landview/route";
import { handleLandviewDataAction, roleOf } from "@/lib/supabase-data";

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
async function sessionUser(request: NextRequest) {
  const url = new URL(request.url);
  url.pathname = "/api/landview";
  url.search = "?action=getSession";
  const probe = new NextRequest(url, { method: "GET", headers: new Headers(request.headers) });
  const response = await legacyGET(probe);
  const json = await response.json().catch(() => null);
  return response.ok && json?.success && json?.data?.authenticated ? json.data.user as Record<string, unknown> : null;
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || "").trim();
    if (action !== "saveBill" && action !== "savePayment") {
      return NextResponse.json({ success: false, error: "Unsupported billing write action." }, { status: 400 });
    }
    const idempotencyKey = cleanKey(body.Idempotency_Key || body.idempotencyKey);
    if (!idempotencyKey) return NextResponse.json({ success: false, error: "A valid idempotency key is required." }, { status: 400 });

    const user = await sessionUser(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    const role = roleOf(user);
    if (!["admin", "manager", "accounts", "employee"].includes(role)) {
      return NextResponse.json({ success: false, error: "Finance access is required." }, { status: 403 });
    }

    // Supabase enforces the idempotency key and posts the ledger transaction in
    // the same database. This endpoint deliberately performs one money write.
    const data = await handleLandviewDataAction(action, { ...body, Idempotency_Key: idempotencyKey }, user);
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
    return NextResponse.json({ success: false, error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
