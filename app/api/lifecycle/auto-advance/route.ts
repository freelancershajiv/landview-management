import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf, userIdOf } from "@/lib/local-session";
import { hasCapability } from "@/lib/permissions";
import { recordAuditEvent } from "@/lib/audit-log";
import { insertRows, normalizeProjectCode, selectRows, updateRows } from "@/lib/supabase-data";
import type { ProjectLifecyclePhase } from "@/lib/lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

type AutomationState = {
  projectId: string;
  phase: ProjectLifecyclePhase | string;
  ready: boolean;
  autoEligible: boolean;
  requiresManualClose: boolean;
  nextPhase: ProjectLifecyclePhase | null;
  blockers: string[];
  completed: number;
  total: number;
  message: string;
};

const DESIGN_COMPLETE = new Set(["approved", "completed", "issued"]);
const APPROVAL_COMPLETE = new Set(["approved", "completed", "accepted", "issued"]);
const SKIPPED_OR_COMPLETE = new Set(["completed", "not required", "not_required", "skipped"]);

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
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

async function managementUser(request: NextRequest, edit = false) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  const role = roleOf(user);
  if (role !== "admin" && role !== "manager") throw new Error("Management or Admin permission required.");
  const capability = edit ? "workflow.edit" : "workflow.view";
  if (!hasCapability(role, capability)) throw new Error(`Permission required: ${capability}`);
  return user;
}

function actorOf(user: Row) {
  return userIdOf(user) || text(user.employeeId || user.Employee_ID || user.username || user.Username, 200);
}

function normalized(value: unknown) {
  return text(value).toLowerCase().replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
}

function skippedOrComplete(value: unknown) {
  return SKIPPED_OR_COMPLETE.has(normalized(value));
}

function nextRequiredPhase(project: Row, fromPhase: string): ProjectLifecyclePhase | null {
  if (fromPhase === "Design Stage") {
    if (!skippedOrComplete(project.approval_stage_status)) return "Approval Stage";
    if (!skippedOrComplete(project.supervision_stage_status)) return "Supervision / Construction Stage";
    return "Handover";
  }
  if (fromPhase === "Approval Stage") {
    if (!skippedOrComplete(project.supervision_stage_status)) return "Supervision / Construction Stage";
    return "Handover";
  }
  if (fromPhase === "Supervision / Construction Stage") return "Handover";
  return null;
}

function recordLabel(row: Row, fallback: string) {
  return text(row.drawing_title || row.approval_type || row.drawing_code || row.approval_code, 180) || fallback;
}

function automationState(project: Row, drawings: Row[], approvals: Row[]): AutomationState {
  const phase = text(project.lifecycle_phase) || "Design Stage";
  const projectId = text(project.project_code, 120);

  if (phase === "Design Stage") {
    const stageAlreadyComplete = skippedOrComplete(project.design_stage_status);
    const incomplete = stageAlreadyComplete ? [] : drawings.filter((row) => !DESIGN_COMPLETE.has(normalized(row.status)));
    const total = drawings.length;
    const completed = stageAlreadyComplete ? total : drawings.filter((row) => DESIGN_COMPLETE.has(normalized(row.status))).length;
    const blockers = stageAlreadyComplete
      ? []
      : total === 0
        ? ["No design deliverables are registered yet."]
        : incomplete.slice(0, 8).map((row) => `${recordLabel(row, "Design deliverable")} — ${text(row.status, 60) || "In Progress"}`);
    const ready = stageAlreadyComplete || (total > 0 && incomplete.length === 0);
    const nextPhase = nextRequiredPhase(project, phase);
    return {
      projectId, phase, ready, autoEligible: true, requiresManualClose: false, nextPhase, blockers, completed, total,
      message: ready
        ? `Design requirements are complete. The project can move to ${nextPhase}.`
        : `${Math.max(0, total - completed)} design requirement(s) still need completion.`,
    };
  }

  if (phase === "Approval Stage") {
    const stageAlreadyComplete = skippedOrComplete(project.approval_stage_status);
    const incomplete = stageAlreadyComplete ? [] : approvals.filter((row) => !APPROVAL_COMPLETE.has(normalized(row.status || row.approval_status)));
    const total = approvals.length;
    const completed = stageAlreadyComplete ? total : approvals.filter((row) => APPROVAL_COMPLETE.has(normalized(row.status || row.approval_status))).length;
    const blockers = stageAlreadyComplete
      ? []
      : total === 0
        ? ["No required approval records are registered yet."]
        : incomplete.slice(0, 8).map((row) => `${recordLabel(row, "Approval")} — ${text(row.status || row.approval_status, 60) || "Pending"}`);
    const ready = stageAlreadyComplete || (total > 0 && incomplete.length === 0);
    const nextPhase = nextRequiredPhase(project, phase);
    return {
      projectId, phase, ready, autoEligible: true, requiresManualClose: false, nextPhase, blockers, completed, total,
      message: ready
        ? `Approval requirements are complete. The project can move to ${nextPhase}.`
        : `${Math.max(0, total - completed)} approval requirement(s) still need completion.`,
    };
  }

  if (phase === "Supervision / Construction Stage") {
    return {
      projectId, phase, ready: false, autoEligible: false, requiresManualClose: true,
      nextPhase: "Handover", blockers: [], completed: 0, total: 0,
      message: "Construction completion cannot be inferred safely. Management must close Supervision explicitly.",
    };
  }

  if (phase === "Handover") {
    return {
      projectId, phase, ready: false, autoEligible: false, requiresManualClose: false,
      nextPhase: "Completed", blockers: [], completed: 0, total: 0,
      message: "Handover remains a deliberate management close-out step. The existing handover checklist still protects final completion.",
    };
  }

  return {
    projectId, phase, ready: false, autoEligible: false, requiresManualClose: false,
    nextPhase: null, blockers: [], completed: 0, total: 0,
    message: "Project lifecycle is complete.",
  };
}

async function loadProjectState(projectId: string) {
  const projects = await selectRows("projects", { filters: { project_code: projectId }, limit: 1 });
  if (!projects.length) throw new Error(`Project ${projectId} was not found.`);
  const project = projects[0];
  const [drawings, approvals] = await Promise.all([
    selectRows("drawing_submissions", { filters: { project_code: projectId }, order: "created_at:asc", limit: 1000 }),
    selectRows("approvals", { filters: { project_id: project.id }, order: "created_at:asc", limit: 1000 }),
  ]);
  return { project, drawings, approvals, state: automationState(project, drawings, approvals) };
}

function transitionChanges(project: Row, fromPhase: string, toPhase: ProjectLifecyclePhase, actor: string, now: string) {
  const changes: Row = {
    lifecycle_phase: toPhase,
    lifecycle_changed_at: now,
    lifecycle_changed_by: actor || null,
    updated_at: now,
  };

  if (fromPhase === "Design Stage") changes.design_stage_status = "Completed";
  if (fromPhase === "Approval Stage") {
    changes.design_stage_status = "Completed";
    changes.approval_stage_status = "Completed";
  }
  if (fromPhase === "Supervision / Construction Stage") {
    changes.design_stage_status = "Completed";
    changes.approval_stage_status = "Completed";
    changes.supervision_stage_status = "Completed";
  }

  if (toPhase === "Approval Stage") changes.approval_stage_status = "In Progress";
  if (toPhase === "Supervision / Construction Stage") {
    changes.design_stage_status = "Completed";
    changes.approval_stage_status = "Completed";
    changes.supervision_stage_status = "In Progress";
  }
  if (toPhase === "Handover") {
    changes.design_stage_status = "Completed";
    changes.approval_stage_status = "Completed";
    changes.supervision_stage_status = "Completed";
  }

  // Preserve an explicitly skipped future stage until it is actually behind us.
  if (toPhase === "Approval Stage" && skippedOrComplete(project.supervision_stage_status)) {
    changes.supervision_stage_status = project.supervision_stage_status;
  }

  return changes;
}

async function writeTransition(request: NextRequest, user: Row, project: Row, projectId: string, toPhase: ProjectLifecyclePhase, reason: string, source: string) {
  const actor = actorOf(user);
  const now = new Date().toISOString();
  const fromPhase = text(project.lifecycle_phase) || "Design Stage";
  const changes = transitionChanges(project, fromPhase, toPhase, actor, now);
  const updated = await updateRows("projects", { project_code: projectId }, changes);
  const after = updated[0] || { ...project, ...changes };

  await insertRows("project_lifecycle_transitions", {
    project_id: project.id,
    project_code: projectId,
    from_phase: fromPhase,
    to_phase: toPhase,
    transition_type: source === "auto" ? "auto_advance" : "advance",
    reason,
    changed_by: actor || null,
    changed_by_role: roleOf(user) || null,
    source: "lifecycle-auto-advance",
    created_at: now,
  });

  await recordAuditEvent({
    user,
    request,
    action: source === "auto" ? "project_lifecycle_auto_advance" : "project_supervision_close",
    entityType: "project",
    entityId: projectId,
    before: {
      lifecycle_phase: project.lifecycle_phase,
      design_stage_status: project.design_stage_status,
      approval_stage_status: project.approval_stage_status,
      supervision_stage_status: project.supervision_stage_status,
    },
    after: {
      lifecycle_phase: after.lifecycle_phase,
      design_stage_status: after.design_stage_status,
      approval_stage_status: after.approval_stage_status,
      supervision_stage_status: after.supervision_stage_status,
    },
    details: { fromPhase, toPhase, reason },
    source: "lifecycle-auto-advance",
  });

  return { after, fromPhase, toPhase };
}

export async function GET(request: NextRequest) {
  try {
    await managementUser(request, false);
    const projectId = normalizeProjectCode(request.nextUrl.searchParams.get("projectId"));
    if (!projectId) throw new Error("Project ID is required.");
    const { state } = await loadProjectState(projectId);
    return json({ success: true, data: state });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not inspect lifecycle automation.";
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /permission|management|admin/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  let user: Row | null = null;
  let input: Row = {};
  try {
    user = await managementUser(request, true);
    input = await request.json() as Row;
    const projectId = normalizeProjectCode(input.projectId || input.Project_ID);
    if (!projectId) throw new Error("Project ID is required.");
    const action = text(input.action, 80).toLowerCase();
    const loaded = await loadProjectState(projectId);
    const phase = text(loaded.project.lifecycle_phase) || "Design Stage";

    if (action === "advancereadystage") {
      if (!loaded.state.autoEligible) return json({ success: true, data: { noOp: true, state: loaded.state } });
      if (!loaded.state.ready || !loaded.state.nextPhase) {
        throw new Error(loaded.state.blockers[0] || "The current lifecycle stage is not ready to advance.");
      }
      const result = await writeTransition(
        request,
        user,
        loaded.project,
        projectId,
        loaded.state.nextPhase,
        `Automatically advanced after all ${phase === "Design Stage" ? "design deliverables" : "approval requirements"} were completed.`,
        "auto",
      );
      const refreshed = await loadProjectState(projectId);
      return json({ success: true, data: { projectId, ...result, state: refreshed.state } });
    }

    if (action === "closesupervision") {
      if (phase !== "Supervision / Construction Stage") return json({ success: true, data: { noOp: true, state: loaded.state } });
      const reason = text(input.reason, 1000) || "Supervision / construction scope confirmed complete by management.";
      const result = await writeTransition(request, user, loaded.project, projectId, "Handover", reason, "manual");
      const refreshed = await loadProjectState(projectId);
      return json({ success: true, data: { projectId, ...result, state: refreshed.state } });
    }

    throw new Error("Unsupported lifecycle automation action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not advance lifecycle.";
    if (user) {
      await recordAuditEvent({
        user,
        request,
        action: "project_lifecycle_auto_advance_action",
        entityType: "project",
        entityId: text(input.projectId || input.Project_ID, 200),
        outcome: "failure",
        details: { requestedAction: text(input.action, 80), error: message },
        source: "lifecycle-auto-advance",
      });
    }
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /permission|management|admin/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400);
  }
}
