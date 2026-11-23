import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { normalizeProjectCode, roleOf } from "@/lib/supabase-data";
import { getPaymentBills } from "@/lib/billing-payment-bills";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const respond = (body: object, status = 200) =>
    NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  try {
    const user = await requireLocalSession(request);
    if (!user) return respond({ success: false, error: "Session expired." }, 401);
    if (!["admin", "manager", "accounts"].includes(roleOf(user))) return respond({ success: false, error: "Finance access required." }, 403);
    const projectCode = normalizeProjectCode(request.nextUrl.searchParams.get("projectId"));
    if (!/^LV-\d{3,8}$/.test(projectCode)) return respond({ success: false, error: "Valid project ID required." }, 400);
    return respond({ success: true, data: await getPaymentBills(projectCode) });
  } catch (cause) {
    const error = cause instanceof Error ? cause.message : "Could not load payment bills.";
    return respond({ success: false, error }, error === "Project not found." ? 404 : 502);
  }
}
