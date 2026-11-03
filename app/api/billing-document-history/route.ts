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
    return NextResponse.json({ success: true, data: entries }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load invoice history." }, { status: 502 });
  }
}
