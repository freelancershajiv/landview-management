import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { normalizeProjectCode, roleOf, selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!["admin", "manager", "accounts"].includes(roleOf(user))) {
      return NextResponse.json({ success: false, error: "Finance access required." }, { status: 403 });
    }
    const projectCode = normalizeProjectCode(request.nextUrl.searchParams.get("projectId"));
    const key = String(request.nextUrl.searchParams.get("key") || "").trim();
    if (!/^LV-\d{3,8}$/.test(projectCode) || !/^[A-Za-z0-9._:-]{12,120}$/.test(key)) {
      return NextResponse.json({ success: false, error: "Invalid project or submission identifier." }, { status: 400 });
    }
    const project = (await selectRows("projects", {
      select: "id,project_code", filters: { project_code: projectCode }, limit: 1,
    }))[0];
    if (!project) return NextResponse.json({ success: false, error: "Project not found." }, { status: 404 });
    const payment = (await selectRows("payments", {
      select: "id,payment_code,project_id,amount,payment_date,approval_status,status,receipt_url",
      filters: { idempotency_key: key }, limit: 1,
    }))[0];
    if (payment && String(payment.project_id) !== String(project.id)) {
      return NextResponse.json({ success: false, error: "Submission ID is linked to a different project." }, { status: 409 });
    }
    return NextResponse.json({ success: true, data: {
      found: !!payment, paymentCode: payment?.payment_code || "", amount: Number(payment?.amount || 0),
      date: payment?.payment_date || "", status: payment?.approval_status || payment?.status || "",
      receiptUrl: typeof payment?.receipt_url === "string" && /^\/verify\/receipt\/[A-Za-z0-9]{20,80}$/.test(payment.receipt_url) ? payment.receipt_url : "",
    } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not verify payment submission." },
      { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
