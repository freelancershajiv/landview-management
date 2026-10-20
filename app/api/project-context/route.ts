import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { hasCapability } from "@/lib/permissions";
import { normalizeProjectCode, selectRows } from "@/lib/supabase-data";
import { PROJECT_LIFECYCLE_PHASES } from "@/lib/lifecycle";
import { formatProjectIdentity } from "@/lib/project-identity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request) as Row | null;
    if (!user) throw new Error("Session expired.");
    const role = roleOf(user);
    if (role !== "admin" && role !== "manager") throw new Error("Management or Admin permission required.");
    if (!hasCapability(role, "workflow.view")) throw new Error("Permission required: workflow.view");

    const projectId = normalizeProjectCode(request.nextUrl.searchParams.get("projectId"));
    if (!projectId) throw new Error("Project ID is required.");

    const rows = await selectRows("projects", { filters: { project_code: projectId }, limit: 1 });
    if (!rows.length) throw new Error(`Project ${projectId} was not found.`);
    const project = rows[0];
    const context = {
      projectId: project.project_code || projectId,
      ownerName: project.client_name_snapshot || "",
      story: project.number_of_stories_text || project.floors || "",
      lifecyclePhase: project.lifecycle_phase || "Design Stage",
      projectName: project.project_name || "",
      projectType: project.project_type || "",
      identity: formatProjectIdentity({
        projectId: project.project_code || projectId,
        ownerName: project.client_name_snapshot || "",
        story: project.number_of_stories_text || project.floors || "",
      }),
      phases: PROJECT_LIFECYCLE_PHASES,
    };

    return json({ success: true, data: context });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load project context.";
    return json(
      { success: false, error: message },
      /session/i.test(message) ? 401 : /permission|management|admin/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400,
    );
  }
}
