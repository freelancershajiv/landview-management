import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf, userIdOf } from "@/lib/local-session";
import { hasCapability } from "@/lib/permissions";
import { recordAuditEvent } from "@/lib/audit-log";
import { normalizeProjectCode, selectRows, updateRows } from "@/lib/supabase-data";
import {
  PROJECT_LIFECYCLE_PHASES,
  isProjectLifecyclePhase,
  nextProjectLifecyclePhase,
  projectStageUpdates,
  type ProjectLifecyclePhase,
} from "@/lib/lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === request.nextUrl.hostname.toLowerCase()
      || host === "landview.com.bd"
      || host === "www.landview.com.bd"
      || host === "app.landview.com.bd"
      || host === "localhost"
      || host === "127.0.0.1"
      || host.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

async function managementUser(request: NextRequest, edit = false) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  const role = roleOf(user);
  if (role !== "admin" && role !== "manager") throw new Error("Management or Admin permission required.");
  const capability = edit ? "workflow.edit" : "workflow.view";
  if (!hasCapability(role, capability)) throw new Error(`Permission required: ${capability}`);
  return user;
}

function proposalView(row: Row) {
  return {
    proposalId: row.proposal_code,
    clientName: row.client_name || "",
    projectTitle: row.project_title || "",
    status: row.status || "",
    approvalStatus: row.approval_status || "",
    lifecyclePhase: row.lifecycle_phase || "Proposal Draft",
    convertedProjectId: row.converted_project_code || "",
    entrySource: row.entry_source || "",
    assignedTo: row.assigned_to || "",
    updatedAt: row.updated_at || row.created_at || "",
  };
}

function projectView(row: Row) {
  return {
    projectId: row.project_code,
    projectName: row.project_name || "",
    clientName: row.client_name_snapshot || "",
    lifecyclePhase: row.lifecycle_phase || "Design Stage",
    designStatus: row.design_stage_status || "Pending",
    approvalStatus: row.approval_stage_status || "Pending",
    supervisionStatus: row.supervision_stage_status || "Completed",
    sourceProposalId: row.reclassified_proposal_code || "",
    updatedAt: row.updated_at || row.created_at || "",
  };
}

export async function GET(request: NextRequest) {
  try {
    await managementUser(request, false);
    const [proposalRows, projectRows] = await Promise.all([
      selectRows("proposals", { order: "updated_at:desc", limit: 5000 }),
      selectRows("projects", { order: "updated_at:desc", limit: 5000 }),
    ]);
    const proposals = proposalRows.map(proposalView);
    const projects = projectRows.map(projectView);
    const counts: Record<string, number> = {};
    for (const item of [...proposals, ...projects]) {
      const phase = text((item as any).lifecyclePhase) || "Unknown";
      counts[phase] = (counts[phase] || 0) + 1;
    }
    return json({
      success: true,
      data: {
        counts,
        proposals,
        projects,
        projectPhases: PROJECT_LIFECYCLE_PHASES,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load lifecycle data.";
    const status = /session/i.test(message) ? 401 : /permission|management|admin/i.test(message) ? 403 : 500;
    return json({ success: false, error: message }, status);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  let user: Row | null = null;
  let input: Row = {};
  try {
    user = await managementUser(request, true);
    input = await request.json() as Row;
    const action = text(input.action, 80).toLowerCase();
    if (action !== "setprojectphase" && action !== "advanceproject") {
      throw new Error("Unsupported lifecycle action.");
    }

    const projectId = normalizeProjectCode(input.projectId || input.Project_ID);
    if (!projectId) throw new Error("Project ID is required.");
    const rows = await selectRows("projects", { filters: { project_code: projectId }, limit: 1 });
    if (!rows.length) throw new Error(`Project ${projectId} was not found.`);
    const before = rows[0];

    const requested = action === "advanceproject"
      ? nextProjectLifecyclePhase(before.lifecycle_phase)
      : text(input.phase, 120);
    if (!isProjectLifecyclePhase(requested)) throw new Error("Choose a valid project lifecycle phase.");

    const phase = requested as ProjectLifecyclePhase;
    const now = new Date().toISOString();
    const actor = userIdOf(user) || text(user.employeeId || user.Employee_ID || user.username || user.Username, 200);
    const changes = {
      ...projectStageUpdates(phase),
      lifecycle_phase: phase,
      lifecycle_changed_at: now,
      lifecycle_changed_by: actor || null,
      updated_at: now,
    };
    const updated = await updateRows("projects", { project_code: projectId }, changes);
    const after = updated[0] || { ...before, ...changes };

    await recordAuditEvent({
      user,
      request,
      action: "project_lifecycle_transition",
      entityType: "project",
      entityId: projectId,
      before: {
        lifecycle_phase: before.lifecycle_phase,
        design_stage_status: before.design_stage_status,
        approval_stage_status: before.approval_stage_status,
        supervision_stage_status: before.supervision_stage_status,
      },
      after: {
        lifecycle_phase: after.lifecycle_phase,
        design_stage_status: after.design_stage_status,
        approval_stage_status: after.approval_stage_status,
        supervision_stage_status: after.supervision_stage_status,
      },
      details: { requestedPhase: phase },
      source: "lifecycle-center",
    });

    return json({ success: true, data: projectView(after) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update lifecycle.";
    if (user) {
      await recordAuditEvent({
        user,
        request,
        action: "project_lifecycle_transition",
        entityType: "project",
        entityId: text(input.projectId || input.Project_ID, 200),
        outcome: "failure",
        details: { error: message },
        source: "lifecycle-center",
      });
    }
    const status = /session/i.test(message) ? 401 : /permission|management|admin/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400;
    return json({ success: false, error: message }, status);
  }
}
