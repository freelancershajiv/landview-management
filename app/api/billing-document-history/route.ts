import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { normalizeProjectCode, selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request);
    if (!user || !["admin", "manager", "accounts"].includes(roleOf(user))) {
      return NextResponse.json({ success: false, error: "Access denied." }, { status: 403 });
    }
    const fileId = normalizeProjectCode(request.nextUrl.searchParams.get("fileId") || "");
    if (!/^LV-\d+$/.test(fileId)) {
      return NextResponse.json({ success: false, error: "Invalid File ID." }, { status: 400 });
    }
    const actions = ["billing.invoice.generated", "billing.statement.generated"];
    const groups = await Promise.all(actions.map((action) => selectRows("app_audit_log", {
      select: "id,created_at,actor_user_key,action,details",
      filters: { action, target: fileId },
      order: "created_at:desc",
      limit: 200,
    })));
    const entries = groups.flat().map((row) => ({
      id: String(row.id || ""),
      generatedAt: String(row.created_at || ""),
      actor: String(row.actor_user_key || "LAND VIEW"),
      documentKind: String(row.details?.documentKind || "single"),
      invoiceCode: String(row.details?.invoiceCode || row.details?.statementRef || ""),
      billCode: String(row.details?.billCode || ""),
      gross: Number(row.details?.gross || 0),
      discount: Number(row.details?.discount || 0),
      net: Number(row.details?.net || 0),
      paid: Number(row.details?.paid || 0),
      due: Number(row.details?.due || 0),
    })).sort((left, right) => right.generatedAt.localeCompare(left.generatedAt)).slice(0, 200);
    // Issued documents are immutable snapshots. Corrections are append-only
    // history items, not silent edits to a previously generated invoice.
    const [adjustments, allocationCorrections] = await Promise.all([
      selectRows("billing_adjustments", {
        select: "adjustment_code,bill_code,adjustment_type,amount,reason,status,posted_by,posted_at,voided_at,void_reason",
        filters: { project_code: fileId }, order: "posted_at:desc", limit: 200,
      }),
      selectRows("app_audit_log", {
        select: "created_at,actor_user_key,action,entity_id,details",
        filters: { action: "billing.allocation.correction.applied", target: fileId },
        order: "created_at:desc", limit: 200,
      }),
    ]);
    const revisions = [
      ...adjustments.map((row) => ({
        kind: String(row.adjustment_type || "Bill Adjustment"),
        reference: String(row.adjustment_code || ""),
        billCode: String(row.bill_code || ""),
        date: String(row.posted_at || row.voided_at || ""),
        amount: Number(row.amount || 0),
        reason: String(row.reason || row.void_reason || ""),
        status: String(row.status || ""),
        actor: String(row.posted_by || ""),
      })),
      ...allocationCorrections.map((row) => ({
        kind: "Payment Allocation Correction",
        reference: String(row.entity_id || ""),
        billCode: String(row.details?.toBillCode || ""),
        date: String(row.created_at || ""),
        amount: Number(row.details?.amount || 0),
        reason: String(row.details?.reason || ""),
        status: "Applied",
        actor: String(row.actor_user_key || ""),
      })),
    ].sort((a, b) => b.date.localeCompare(a.date));
    return NextResponse.json({ success: true, data: entries, revisions }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load invoice history." }, { status: 502 });
  }
}
