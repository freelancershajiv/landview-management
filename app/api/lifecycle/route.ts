import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf, userIdOf } from "@/lib/local-session";
import { hasCapability } from "@/lib/permissions";
import { recordAuditEvent } from "@/lib/audit-log";
import { insertRows, normalizeProjectCode, selectRows, updateRows } from "@/lib/supabase-data";
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

function text(value: unknown, max = 500) { return String(value ?? "").trim().slice(0, max); }
function numberOf(value: unknown) {
  const n = Number(String(value ?? 0).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function code(prefix: string, projectId: string) {
  const project = projectId.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return `${prefix}-${project}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
}
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === request.nextUrl.hostname.toLowerCase() || host === "landview.com.bd" || host === "www.landview.com.bd" || host === "app.landview.com.bd" || host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");
  } catch { return false; }
}
function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } }); }
async function managementUser(request: NextRequest, edit = false) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  const role = roleOf(user);
  if (role !== "admin" && role !== "manager") throw new Error("Management or Admin permission required.");
  const capability = edit ? "workflow.edit" : "workflow.view";
  if (!hasCapability(role, capability)) throw new Error(`Permission required: ${capability}`);
  return user;
}
function actorOf(user: Row) { return userIdOf(user) || text(user.employeeId || user.Employee_ID || user.username || user.Username, 200); }

function proposalView(row: Row) {
  return {
    proposalId: row.proposal_code, clientName: row.client_name || "", projectTitle: row.project_title || "", projectLocation: row.project_location || "",
    status: row.status || "", approvalStatus: row.approval_status || "", lifecyclePhase: row.lifecycle_phase || "Proposal Draft", convertedProjectId: row.converted_project_code || "",
    entrySource: row.entry_source || "", assignedTo: row.assigned_to || "", grossAmount: numberOf(row.gross_amount), discount: numberOf(row.discount), netAmount: numberOf(row.net_amount),
    updatedAt: row.updated_at || row.created_at || "",
  };
}
function projectView(row: Row) {
  return {
    projectId: row.project_code, projectName: row.project_name || "", projectType: row.project_type || "", clientName: row.client_name_snapshot || "", clientPhone: row.phone_number_snapshot || "",
    location: row.location || "", floors: row.floors ?? "", plotArea: row.plot_area ?? "", startDate: row.start_date || "", lifecyclePhase: row.lifecycle_phase || "Design Stage",
    designStatus: row.design_stage_status || "Pending", approvalStatus: row.approval_stage_status || "Pending", supervisionStatus: row.supervision_stage_status || "Completed",
    sourceProposalId: row.reclassified_proposal_code || "", projectManagementEnabled: Boolean(row.project_management_enabled), updatedAt: row.updated_at || row.created_at || "",
  };
}
function effectiveBill(row: Row) { return !["void", "voided", "cancelled", "canceled", "rejected"].includes(text(row.status).toLowerCase()); }
function effectivePayment(row: Row) {
  if (text(row.transaction_type).toLowerCase() === "personal income" || row.affects_business_balance === false) return false;
  const status = text(row.approval_status || row.status).toLowerCase().replace(/[_-]+/g, " ");
  return !status || ["approved", "received", "paid", "verified", "complete", "completed", "full paid", "fully paid", "posted"].includes(status);
}
function commercialFinance(bills: Row[], payments: Row[]) {
  const billed = bills.filter(effectiveBill).reduce((sum, row) => sum + numberOf(row.net_amount ?? row.amount), 0);
  const paid = payments.filter(effectivePayment).reduce((sum, row) => sum + numberOf(row.amount), 0);
  return { billed, paid, due: Math.max(0, billed - paid), billCount: bills.filter(effectiveBill).length, paymentCount: payments.filter(effectivePayment).length };
}
function constructionFinance(rows: Row[], summary?: Row) {
  const approved = rows.filter((row) => !row.approval_status || text(row.approval_status).toLowerCase() === "approved");
  const income = approved.reduce((sum, row) => sum + numberOf(row.credit), 0);
  const expense = approved.reduce((sum, row) => sum + numberOf(row.debit), 0);
  return { income, expense, currentBalance: income - expense, supplierAdvance: numberOf(summary?.supplier_advance), chequeOnHold: numberOf(summary?.cheque_on_hold), ledgerEntryCount: rows.length };
}
function mergeUnique(rows: Row[], key: string) {
  const seen = new Set<string>();
  return rows.filter((row) => { const id = text(row[key] || row.id); if (!id || seen.has(id)) return false; seen.add(id); return true; });
}
function isClosedStatus(value: unknown) { return ["completed", "done", "closed", "cancelled", "canceled", "approved", "issued"].includes(text(value).toLowerCase()); }
function nextActionFor(project: Row, commercial: ReturnType<typeof commercialFinance>, openTasks: Row[], drawings: Row[], approvals: Row[], visits: Row[], documents: Row[]) {
  const phase = text(project.lifecycle_phase) || "Design Stage";
  if (phase === "Design Stage") return drawings.length ? { tab: "design", title: "Review design deliverables", detail: `${drawings.length} digital deliverable(s) recorded.` } : { tab: "design", title: "Record first design deliverable", detail: "No digital drawing or design submission is registered yet." };
  if (phase === "Approval Stage") return approvals.length ? { tab: "approval", title: "Review authority approvals", detail: `${approvals.length} approval record(s) are attached.` } : { tab: "approval", title: "Record first approval submission", detail: "No digital municipality / fire / vetting approval is registered yet." };
  if (phase === "Supervision / Construction Stage") return visits.length ? { tab: "supervision", title: "Continue supervision", detail: `${visits.length} site visit(s) recorded. Close supervision only when construction scope is finished.` } : { tab: "supervision", title: "Record site supervision activity", detail: "No digital site visit is attached yet." };
  if (phase === "Handover") {
    if (commercial.due > 0) return { tab: "finance", title: "Clear consultancy due before close-out", detail: `Outstanding consultancy amount: BDT ${commercial.due.toLocaleString("en-BD")}.` };
    if (openTasks.length) return { tab: "overview", title: "Close remaining project tasks", detail: `${openTasks.length} open task(s) remain.` };
    if (!documents.length) return { tab: "documents", title: "Register handover documents", detail: "No project document is registered for close-out yet." };
    return { tab: "handover", title: "Complete handover", detail: "Commercial due and open tasks are clear. Review the checklist and complete the project." };
  }
  return { tab: "activity", title: "Project completed", detail: "The project is closed. Use Activity and Documents for the permanent record." };
}

async function projectDetail(projectCode: string) {
  const projectRows = await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 });
  if (!projectRows.length) throw new Error(`Project ${projectCode} was not found.`);
  const project = projectRows[0];
  const projectUuid = project.id;
  const sourceProposal = text(project.reclassified_proposal_code);
  const [proposalsByProject, proposalsBySource, drawings, approvals, visits, documents, tasks, bills, payments, transitions, managementSummary, managementLedger, suppliers, contractors] = await Promise.all([
    selectRows("proposals", { filters: { converted_project_code: projectCode }, order: "updated_at:desc", limit: 20 }),
    sourceProposal ? selectRows("proposals", { filters: { proposal_code: sourceProposal }, limit: 1 }) : Promise.resolve([]),
    selectRows("drawing_submissions", { filters: { project_code: projectCode }, order: "created_at:desc", limit: 500 }),
    selectRows("approvals", { filters: { project_id: projectUuid }, order: "created_at:desc", limit: 500 }),
    selectRows("site_visits", { filters: { project_id: projectUuid }, order: "visit_date:desc,created_at:desc", limit: 500 }),
    selectRows("documents", { filters: { project_id: projectUuid }, order: "created_at:desc", limit: 500 }),
    selectRows("tasks", { filters: { project_id: projectUuid }, order: "updated_at:desc", limit: 500 }),
    selectRows("bills", { filters: { project_id: projectUuid }, order: "bill_date:desc,created_at:desc", limit: 1000 }),
    selectRows("payments", { filters: { project_id: projectUuid }, order: "payment_date:desc,created_at:desc", limit: 1000 }),
    selectRows("project_lifecycle_transitions", { filters: { project_id: projectUuid }, order: "created_at:desc", limit: 500 }),
    selectRows("project_management_summary", { filters: { project_id: projectUuid }, limit: 1 }),
    selectRows("project_management_ledger", { filters: { project_id: projectUuid }, order: "entry_date:desc,created_at:desc", limit: 5000 }),
    selectRows("project_supplier_accounts", { filters: { project_id: projectUuid }, order: "updated_at:desc", limit: 500 }),
    selectRows("project_contractor_contracts", { filters: { project_id: projectUuid }, order: "updated_at:desc", limit: 500 }),
  ]);
  const proposalRows = mergeUnique([...proposalsBySource, ...proposalsByProject], "proposal_code");
  const proposal = proposalRows[0] || null;
  const proposalItems = proposal ? await selectRows("proposal_items", { filters: { proposal_code: proposal.proposal_code }, order: "sort_order:asc", limit: 500 }) : [];
  const commercial = commercialFinance(bills, payments);
  const construction = constructionFinance(managementLedger, managementSummary[0]);
  const openTasks = tasks.filter((row) => !isClosedStatus(row.status));
  const phase = text(project.lifecycle_phase) || "Design Stage";
  const handoverChecks = [
    { key: "design", label: "Design stage completed", complete: text(project.design_stage_status) === "Completed" },
    { key: "approval", label: "Approval stage completed", complete: text(project.approval_stage_status) === "Completed" },
    { key: "supervision", label: "Supervision / construction closed", complete: text(project.supervision_stage_status) === "Completed" },
    { key: "finance", label: "Consultancy bill fully settled", complete: commercial.due <= 0 },
    { key: "tasks", label: "No open project tasks", complete: openTasks.length === 0 },
    { key: "documents", label: "Project documents are on file", complete: documents.length > 0 },
  ];
  const health = [
    { key: "proposal", label: "Proposal", value: proposal ? proposal.proposal_code : "Legacy / direct", complete: Boolean(proposal) },
    { key: "finance", label: "Consultancy Finance", value: commercial.due <= 0 ? "Settled" : `Due BDT ${commercial.due.toLocaleString("en-BD")}`, complete: commercial.due <= 0 },
    { key: "design", label: "Design Records", value: `${drawings.length} submission(s)`, complete: drawings.length > 0 || text(project.design_stage_status) === "Completed" },
    { key: "approval", label: "Approval Records", value: `${approvals.length} record(s)`, complete: approvals.length > 0 || text(project.approval_stage_status) === "Completed" },
    { key: "supervision", label: "Site Visits", value: `${visits.length} visit(s)`, complete: visits.length > 0 || text(project.supervision_stage_status) === "Completed" },
    { key: "tasks", label: "Open Tasks", value: `${openTasks.length} open`, complete: openTasks.length === 0 },
    { key: "documents", label: "Documents", value: `${documents.length} file(s)`, complete: documents.length > 0 },
  ];
  return {
    project: projectView(project), proposal: proposal ? proposalView(proposal) : null, proposalItems,
    finance: { commercial, construction }, design: { status: project.design_stage_status || "Pending", submissions: drawings }, approval: { status: project.approval_stage_status || "Pending", records: approvals },
    supervision: { status: project.supervision_stage_status || "Completed", visits, suppliers, contractors, projectManagementEnabled: Boolean(project.project_management_enabled) },
    handover: { active: phase === "Handover", checks: handoverChecks, ready: handoverChecks.every((item) => item.complete) },
    health, nextAction: nextActionFor(project, commercial, openTasks, drawings, approvals, visits, documents), documents, tasks, openTasks, transitions,
    recentBills: bills.slice(0, 20), recentPayments: payments.slice(0, 20), projectPhases: PROJECT_LIFECYCLE_PHASES,
  };
}

export async function GET(request: NextRequest) {
  try {
    await managementUser(request, false);
    const requestedProject = normalizeProjectCode(request.nextUrl.searchParams.get("projectId"));
    if (requestedProject) return json({ success: true, data: await projectDetail(requestedProject) });
    const [proposalRows, projectRows] = await Promise.all([
      selectRows("proposals", { order: "updated_at:desc", limit: 5000 }), selectRows("projects", { order: "updated_at:desc", limit: 5000 }),
    ]);
    const proposals = proposalRows.map(proposalView); const projects = projectRows.map(projectView); const counts: Record<string, number> = {};
    for (const item of [...proposals, ...projects]) { const phase = text((item as any).lifecyclePhase) || "Unknown"; counts[phase] = (counts[phase] || 0) + 1; }
    return json({ success: true, data: { counts, proposals, projects, projectPhases: PROJECT_LIFECYCLE_PHASES } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load lifecycle data.";
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /permission|management|admin/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 500);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  let user: Row | null = null; let input: Row = {};
  try {
    user = await managementUser(request, true); input = await request.json() as Row;
    const action = text(input.action, 80).toLowerCase();
    const projectId = normalizeProjectCode(input.projectId || input.Project_ID);
    if (!projectId) throw new Error("Project ID is required.");
    const rows = await selectRows("projects", { filters: { project_code: projectId }, limit: 1 });
    if (!rows.length) throw new Error(`Project ${projectId} was not found.`);
    const project = rows[0]; const actor = actorOf(user); const now = new Date().toISOString();

    if (action === "createdesignsubmission") {
      const discipline = text(input.discipline, 120); const title = text(input.title || input.drawingTitle, 300);
      if (!discipline || !title) throw new Error("Discipline and deliverable title are required.");
      const row = {
        drawing_code: code("DRW", projectId), project_code: projectId, drawing_title: title, discipline,
        revision: text(input.revision, 40) || "R0", assigned_employee_code: text(input.assignedEmployeeCode, 120) || null,
        drive_url: text(input.driveUrl, 1000) || null, status: text(input.status, 80) || "In Progress",
        submitted_at: text(input.status).toLowerCase() === "submitted" ? now : null, comments: text(input.comments, 1500) || null,
        created_at: now, created_by: actor || null,
      };
      const inserted = await insertRows("drawing_submissions", row);
      await recordAuditEvent({ user, request, action: "create_design_submission", entityType: "project", entityId: projectId, after: row, source: "lifecycle-workspace" });
      return json({ success: true, data: inserted[0] || row });
    }

    if (action === "updatedesignsubmission") {
      const drawingCode = text(input.drawingCode, 200); if (!drawingCode) throw new Error("Drawing code is required.");
      const status = text(input.status, 80); if (!status) throw new Error("Design status is required.");
      const changes: Row = { status };
      if (input.revision !== undefined) changes.revision = text(input.revision, 40);
      if (input.comments !== undefined) changes.comments = text(input.comments, 1500) || null;
      if (["submitted", "approved", "completed", "issued"].includes(status.toLowerCase())) changes.submitted_at = now;
      if (status.toLowerCase() === "approved") { changes.approved_at = now; changes.approved_by = actor || null; }
      const updated = await updateRows("drawing_submissions", { drawing_code: drawingCode }, changes);
      await recordAuditEvent({ user, request, action: "update_design_submission", entityType: "project", entityId: projectId, details: { drawingCode, status }, source: "lifecycle-workspace" });
      return json({ success: true, data: updated[0] || changes });
    }

    if (action === "createapproval") {
      const approvalType = text(input.approvalType, 200); const requestedFrom = text(input.requestedFrom, 300);
      if (!approvalType || !requestedFrom) throw new Error("Approval type and requested-from authority are required.");
      const status = text(input.status, 80) || "Pending";
      const row = {
        approval_code: code("APR", projectId), project_id: project.id, approval_type: approvalType, requested_from: requestedFrom,
        status, approval_status: status, decision_notes: text(input.notes, 1500) || null, requested_at: now,
        source_created_at: now, source_created_by: actor || null, created_at: now, updated_at: now,
      };
      const inserted = await insertRows("approvals", row);
      await recordAuditEvent({ user, request, action: "create_project_approval", entityType: "project", entityId: projectId, after: row, source: "lifecycle-workspace" });
      return json({ success: true, data: inserted[0] || row });
    }

    if (action === "updateapproval") {
      const approvalCode = text(input.approvalCode, 200); const status = text(input.status, 80);
      if (!approvalCode || !status) throw new Error("Approval code and status are required.");
      const changes: Row = { status, approval_status: status, updated_at: now };
      if (input.notes !== undefined) changes.decision_notes = text(input.notes, 1500) || null;
      if (["approved", "rejected", "completed", "accepted"].includes(status.toLowerCase())) changes.decided_at = now;
      if (status.toLowerCase() === "approved") { changes.approved_at = now; changes.approved_by = actor || null; }
      const updated = await updateRows("approvals", { approval_code: approvalCode }, changes);
      await recordAuditEvent({ user, request, action: "update_project_approval", entityType: "project", entityId: projectId, details: { approvalCode, status }, source: "lifecycle-workspace" });
      return json({ success: true, data: updated[0] || changes });
    }

    if (action !== "setprojectphase" && action !== "advanceproject") throw new Error("Unsupported lifecycle action.");
    const requested = action === "advanceproject" ? nextProjectLifecyclePhase(project.lifecycle_phase) : text(input.phase, 120);
    if (!isProjectLifecyclePhase(requested)) throw new Error("Choose a valid project lifecycle phase.");
    const phase = requested as ProjectLifecyclePhase;
    if (phase === "Completed") {
      if (text(project.lifecycle_phase) !== "Handover") throw new Error("Move the project to Handover before marking it Completed.");
      const detail = await projectDetail(projectId);
      const pending = detail.handover.checks.filter((item: any) => !item.complete).map((item: any) => item.label);
      if (pending.length) throw new Error(`Complete the handover checklist first: ${pending.join(", ")}.`);
    }
    const changes = { ...projectStageUpdates(phase), lifecycle_phase: phase, lifecycle_changed_at: now, lifecycle_changed_by: actor || null, updated_at: now };
    const updated = await updateRows("projects", { project_code: projectId }, changes); const after = updated[0] || { ...project, ...changes };
    const fromPhase = text(project.lifecycle_phase) || null; const fromIndex = PROJECT_LIFECYCLE_PHASES.indexOf(fromPhase as ProjectLifecyclePhase); const toIndex = PROJECT_LIFECYCLE_PHASES.indexOf(phase);
    await insertRows("project_lifecycle_transitions", {
      project_id: project.id, project_code: projectId, from_phase: fromPhase, to_phase: phase,
      transition_type: fromIndex >= 0 && toIndex < fromIndex ? "rollback" : fromPhase === phase ? "reaffirm" : "advance",
      reason: text(input.reason, 1000) || null, changed_by: actor || null, changed_by_role: roleOf(user) || null, source: "lifecycle-workspace", created_at: now,
    });
    await recordAuditEvent({
      user, request, action: "project_lifecycle_transition", entityType: "project", entityId: projectId,
      before: { lifecycle_phase: project.lifecycle_phase, design_stage_status: project.design_stage_status, approval_stage_status: project.approval_stage_status, supervision_stage_status: project.supervision_stage_status },
      after: { lifecycle_phase: after.lifecycle_phase, design_stage_status: after.design_stage_status, approval_stage_status: after.approval_stage_status, supervision_stage_status: after.supervision_stage_status },
      details: { requestedPhase: phase, reason: text(input.reason, 1000) || null }, source: "lifecycle-workspace",
    });
    return json({ success: true, data: projectView(after) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update lifecycle.";
    if (user) await recordAuditEvent({ user, request, action: "project_lifecycle_action", entityType: "project", entityId: text(input.projectId || input.Project_ID, 200), outcome: "failure", details: { requestedAction: text(input.action, 80), error: message }, source: "lifecycle-workspace" });
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /permission|management|admin/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400);
  }
}
