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

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}
function numberOf(value: unknown) {
  const valueNumber = Number(String(value ?? 0).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(valueNumber) ? valueNumber : 0;
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
    projectLocation: row.project_location || "",
    status: row.status || "",
    approvalStatus: row.approval_status || "",
    lifecyclePhase: row.lifecycle_phase || "Proposal Draft",
    convertedProjectId: row.converted_project_code || "",
    entrySource: row.entry_source || "",
    assignedTo: row.assigned_to || "",
    grossAmount: numberOf(row.gross_amount),
    discount: numberOf(row.discount),
    netAmount: numberOf(row.net_amount),
    updatedAt: row.updated_at || row.created_at || "",
  };
}

function projectView(row: Row) {
  return {
    projectId: row.project_code,
    projectName: row.project_name || "",
    projectType: row.project_type || "",
    clientName: row.client_name_snapshot || "",
    clientPhone: row.phone_number_snapshot || "",
    location: row.location || "",
    floors: row.floors ?? "",
    plotArea: row.plot_area ?? "",
    startDate: row.start_date || "",
    lifecyclePhase: row.lifecycle_phase || "Design Stage",
    designStatus: row.design_stage_status || "Pending",
    approvalStatus: row.approval_stage_status || "Pending",
    supervisionStatus: row.supervision_stage_status || "Completed",
    sourceProposalId: row.reclassified_proposal_code || "",
    projectManagementEnabled: Boolean(row.project_management_enabled),
    updatedAt: row.updated_at || row.created_at || "",
  };
}

function effectiveBill(row: Row) {
  return !["void", "voided", "cancelled", "canceled", "rejected"].includes(text(row.status).toLowerCase());
}
function effectivePayment(row: Row) {
  if (text(row.transaction_type).toLowerCase() === "personal income" || row.affects_business_balance === false) return false;
  const status = text(row.approval_status || row.status).toLowerCase().replace(/[_-]+/g, " ");
  return !status || ["approved", "received", "paid", "verified", "complete", "completed", "full paid", "fully paid", "posted"].includes(status);
}
function commercialFinance(bills: Row[], payments: Row[]) {
  const billed = bills.filter(effectiveBill).reduce((sum, row) => sum + numberOf(row.net_amount ?? row.amount) , 0);
  const paid = payments.filter(effectivePayment).reduce((sum, row) => sum + numberOf(row.amount), 0);
  return {
    billed,
    paid,
    due: Math.max(0, billed - paid),
    billCount: bills.filter(effectiveBill).length,
    paymentCount: payments.filter(effectivePayment).length,
  };
}
function constructionFinance(rows: Row[], summary?: Row) {
  const approved = rows.filter((row) => !row.approval_status || text(row.approval_status).toLowerCase() === "approved");
  const income = approved.reduce((sum, row) => sum + numberOf(row.credit), 0);
  const expense = approved.reduce((sum, row) => sum + numberOf(row.debit), 0);
  return {
    income,
    expense,
    currentBalance: income - expense,
    supplierAdvance: numberOf(summary?.supplier_advance),
    chequeOnHold: numberOf(summary?.cheque_on_hold),
    ledgerEntryCount: rows.length,
  };
}
function mergeUnique(rows: Row[], key: string) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const id = text(row[key] || row.id);
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

async function projectDetail(projectCode: string) {
  const projectRows = await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 });
  if (!projectRows.length) throw new Error(`Project ${projectCode} was not found.`);
  const project = projectRows[0];
  const projectUuid = project.id;
  const sourceProposal = text(project.reclassified_proposal_code);

  const [
    proposalsByProject,
    proposalsBySource,
    drawings,
    approvals,
    visits,
    documents,
    tasks,
    bills,
    payments,
    transitions,
    managementSummary,
    managementLedger,
    suppliers,
    contractors,
  ] = await Promise.all([
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
  const proposalItems = proposal
    ? await selectRows("proposal_items", { filters: { proposal_code: proposal.proposal_code }, order: "sort_order:asc", limit: 500 })
    : [];
  const commercial = commercialFinance(bills, payments);
  const construction = constructionFinance(managementLedger, managementSummary[0]);
  const openTasks = tasks.filter((row) => !["completed", "done", "closed", "cancelled", "canceled"].includes(text(row.status).toLowerCase()));
  const phase = text(project.lifecycle_phase) || "Design Stage";
  const handoverChecks = [
    { key: "design", label: "Design stage completed", complete: text(project.design_stage_status) === "Completed" },
    { key: "approval", label: "Approval stage completed", complete: text(project.approval_stage_status) === "Completed" },
    { key: "supervision", label: "Supervision / construction closed", complete: text(project.supervision_stage_status) === "Completed" },
    { key: "finance", label: "Consultancy bill fully settled", complete: commercial.due <= 0 },
    { key: "tasks", label: "No open project tasks", complete: openTasks.length === 0 },
    { key: "documents", label: "Project documents are on file", complete: documents.length > 0 },
  ];

  return {
    project: projectView(project),
    proposal: proposal ? proposalView(proposal) : null,
    proposalItems,
    finance: { commercial, construction },
    design: { status: project.design_stage_status || "Pending", submissions: drawings },
    approval: { status: project.approval_stage_status || "Pending", records: approvals },
    supervision: {
      status: project.supervision_stage_status || "Completed",
      visits,
      suppliers,
      contractors,
      projectManagementEnabled: Boolean(project.project_management_enabled),
    },
    handover: {
      active: phase === "Handover",
      checks: handoverChecks,
      ready: handoverChecks.every((item) => item.complete),
    },
    documents,
    tasks,
    transitions,
    recentBills: bills.slice(0, 20),
    recentPayments: payments.slice(0, 20),
    projectPhases: PROJECT_LIFECYCLE_PHASES,
  };
}

export async function GET(request: NextRequest) {
  try {
    await managementUser(request, false);
    const requestedProject = normalizeProjectCode(request.nextUrl.searchParams.get("projectId"));
    if (requestedProject) {
      return json({ success: true, data: await projectDetail(requestedProject) });
    }

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
    return json({ success: true, data: { counts, proposals, projects, projectPhases: PROJECT_LIFECYCLE_PHASES } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load lifecycle data.";
    const status = /session/i.test(message) ? 401 : /permission|management|admin/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 500;
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
    if (action !== "setprojectphase" && action !== "advanceproject") throw new Error("Unsupported lifecycle action.");

    const projectId = normalizeProjectCode(input.projectId || input.Project_ID);
    if (!projectId) throw new Error("Project ID is required.");
    const rows = await selectRows("projects", { filters: { project_code: projectId }, limit: 1 });
    if (!rows.length) throw new Error(`Project ${projectId} was not found.`);
    const before = rows[0];

    const requested = action === "advanceproject" ? nextProjectLifecyclePhase(before.lifecycle_phase) : text(input.phase, 120);
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

    const fromPhase = text(before.lifecycle_phase) || null;
    const fromIndex = PROJECT_LIFECYCLE_PHASES.indexOf(fromPhase as ProjectLifecyclePhase);
    const toIndex = PROJECT_LIFECYCLE_PHASES.indexOf(phase);
    await insertRows("project_lifecycle_transitions", {
      project_id: before.id,
      project_code: projectId,
      from_phase: fromPhase,
      to_phase: phase,
      transition_type: fromIndex >= 0 && toIndex < fromIndex ? "rollback" : fromPhase === phase ? "reaffirm" : "advance",
      reason: text(input.reason, 1000) || null,
      changed_by: actor || null,
      changed_by_role: roleOf(user) || null,
      source: "lifecycle-workspace",
      created_at: now,
    });

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
      details: { requestedPhase: phase, reason: text(input.reason, 1000) || null },
      source: "lifecycle-workspace",
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
        source: "lifecycle-workspace",
      });
    }
    const status = /session/i.test(message) ? 401 : /permission|management|admin/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400;
    return json({ success: false, error: message }, status);
  }
}
