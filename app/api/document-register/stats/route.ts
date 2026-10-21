import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { selectRows } from "@/lib/supabase-data";
import { documentStats } from "@/lib/service-document-register";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request) as Row | null;
    if (!user) throw new Error("Session expired.");
    if (!["admin", "manager", "accounts", "employee"].includes(roleOf(user))) throw new Error("Document Register access is not available for this role.");

    const documents = await selectRows("documents", { order: "updated_at:desc", limit: 20000 });
    const grouped = new Map<string, Row[]>();
    for (const row of documents) {
      const workflowId = String(row.service_workflow_id || "").trim();
      if (!workflowId) continue;
      const list = grouped.get(workflowId) || [];
      list.push(row);
      grouped.set(workflowId, list);
    }
    const stats = Object.fromEntries(Array.from(grouped.entries()).map(([workflowId, rows]) => [workflowId, documentStats(rows)]));
    return NextResponse.json({ success: true, data: { stats } }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load document statistics.";
    return NextResponse.json({ success: false, error: message }, { status: /session/i.test(message) ? 401 : /access|role/i.test(message) ? 403 : 400, headers: { "Cache-Control": "no-store" } });
  }
}
