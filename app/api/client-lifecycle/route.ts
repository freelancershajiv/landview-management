import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf, type WorkspaceUser } from "@/lib/local-session";
import { normalizeProjectCode, selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function text(value: unknown, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function projectIdsOf(user: WorkspaceUser | null | undefined) {
  const row = (user || {}) as Row;
  const raw = text(row.projectIds || row.Project_IDs || row.project_ids, 4000);
  return Array.from(new Set(raw.split(/[;,\s]+/).map(normalizeProjectCode).filter(Boolean)));
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (roleOf(user) !== "client") return NextResponse.json({ success: false, error: "Client access required." }, { status: 403 });

    const allowed = projectIdsOf(user);
    if (!allowed.length) return NextResponse.json({ success: true, data: [] }, { headers: { "Cache-Control": "no-store" } });

    const rows = await selectRows("projects", { inFilters: { project_code: allowed }, order: "project_code:asc", limit: 5000 });
    const data = rows.map((project: Row) => ({
      projectId: text(project.project_code, 80),
      projectName: text(project.project_name, 300),
      lifecyclePhase: text(project.lifecycle_phase, 120) || "Design Stage",
      designStageStatus: text(project.design_stage_status, 80) || "Pending",
      approvalStageStatus: text(project.approval_stage_status, 80) || "Pending",
      supervisionStageStatus: text(project.supervision_stage_status, 80) || "Completed",
      changedAt: text(project.lifecycle_changed_at || project.updated_at, 120),
    }));

    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load project lifecycle.";
    return NextResponse.json({ success: false, error: message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
