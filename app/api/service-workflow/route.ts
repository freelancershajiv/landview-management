import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { recordAuditEvent } from "@/lib/audit-log";
import { selectRows, updateRows } from "@/lib/supabase-data";
import { canonicalProjectService } from "@/lib/project-task-templates";
import {
  ENGINEERING_SERVICE_STATUSES,
  MUNICIPALITY_SERVICE_STATUSES,
  OTHER_SERVICE_STATUSES,
  getProjectServiceFinancials,
  syncPaidServiceWorkflows,
  workflowServiceKey,
  workflowServiceName,
  workflowStatusesForService,
} from "@/lib/service-workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
function text(v: unknown, max = 1000) { return String(v ?? "").trim().slice(0, max); }
function num(v: unknown) { const n = Number(String(v ?? 0).replace(/,/g, "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; }
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } }); }
function actor(user: Row) { return text(user.employeeId || user.Employee_ID || user.userId || user.User_ID || user.username || user.Username || user.name || user.Name, 160) || "LAND VIEW"; }
async function session(request: NextRequest, edit = false) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  const role = roleOf(user);
  const allowed = edit ? ["admin", "manager"] : ["admin", "manager", "accounts", "employee"];
  if (!allowed.includes(role)) throw new Error(edit ? "Management permission is required." : "Workflow access is not available for this role.");
  return user;
}
function proposalStatus(value: unknown) {
  const status = text(value, 80);
  return ["Working", "Ready", "Sent", "Approved"].includes(status) ? status : "Working";
}
function effectiveProposal(row: Row) {
  const s = text(row.status).toLowerCase();
  return !["rejected", "cancelled", "canceled", "expired"].includes(s);
}

async function proposalWorkflow() {
  const [proposals, items] = await Promise.all([
    selectRows("proposals", { order: "updated_at:desc", limit: 5000 }),
    selectRows("proposal_items", { order: "updated_at:desc", limit: 20000 }),
  ]);
  const byProposal = new Map<string, Row[]>();
  for (const item of items) {
    const key = text(item.proposal_code, 160); if (!key) continue;
    const list = byProposal.get(key) || []; list.push(item); byProposal.set(key, list);
  }
  return proposals.filter(effectiveProposal).map((proposal) => {
    const rows = byProposal.get(text(proposal.proposal_code, 160)) || [];
    const architecture = rows.find((item) => canonicalProjectService(item.service) === "Architectural Design");
    if (!architecture) return null;
    const extraServices = rows.filter((item) => canonicalProjectService(item.service) !== "Architectural Design" && num(item.amount) > 0).map((item) => text(item.service));
    return {
      proposalCode: proposal.proposal_code,
      clientName: proposal.client_name || "",
      story: proposal.floors || "",
      location: proposal.project_location || "",
      projectTitle: proposal.project_title || "",
      assignedTo: proposal.assigned_to || "",
      proposalStatus: proposal.status || "",
      convertedProjectCode: proposal.converted_project_code || "",
      architecturalItemCode: architecture.item_code,
      architecturalAmount: num(architecture.amount),
      workflowStatus: proposalStatus(architecture.status),
      extraServices,
      updatedAt: architecture.updated_at || proposal.updated_at || proposal.created_at || "",
    };
  }).filter(Boolean);
}

async function projectWorkflow() {
  const [workflows, projects] = await Promise.all([
    selectRows("project_service_workflows", { order: "updated_at:desc", limit: 10000 }),
    selectRows("projects", { order: "project_code:desc", limit: 5000 }),
  ]);
  const projectById = new Map(projects.map((p: Row) => [text(p.id), p]));
  return workflows.map((row) => {
    const project = projectById.get(text(row.project_id));
    const statuses = workflowStatusesForService(row.service_name);
    return {
      id: row.id,
      projectId: row.project_code || project?.project_code || "",
      ownerName: project?.client_name_snapshot || project?.project_name || "",
      story: project?.number_of_stories_text || project?.floors || "",
      location: project?.location || "",
      lifecyclePhase: project?.lifecycle_phase || "",
      billingCategory: row.billing_category,
      serviceName: row.service_name,
      serviceKey: row.service_key,
      workflowType: row.workflow_type,
      status: row.status,
      statuses,
      netAmount: num(row.net_amount),
      paidAmount: num(row.paid_amount),
      activatedAt: row.activated_at,
      updatedAt: row.updated_at,
    };
  });
}

async function billingProjects() {
  const [projects, bills] = await Promise.all([
    selectRows("projects", { order: "project_code:desc", limit: 5000 }),
    selectRows("bills", { order: "bill_date:desc", limit: 20000 }),
  ]);
  const billedProjectIds = new Set(
    bills
      .filter((bill) => !["void", "voided", "cancelled", "canceled", "rejected"].includes(text(bill.status).toLowerCase()) && num(bill.amount) > 0)
      .map((bill) => text(bill.project_id))
      .filter(Boolean),
  );
  return projects.filter((project) => billedProjectIds.has(text(project.id))).map((project) => ({
    projectId: text(project.project_code, 80),
    ownerName: project.client_name_snapshot || project.project_name || "",
    story: project.number_of_stories_text || project.floors || "",
    location: project.location || "",
  })).filter((project) => project.projectId);
}

export async function GET(request: NextRequest) {
  try {
    await session(request, false);
    const mode = text(request.nextUrl.searchParams.get("mode"), 40).toLowerCase() || "project";
    if (mode === "proposal") return json({ success: true, data: { proposals: await proposalWorkflow(), statuses: ["Working", "Ready", "Sent", "Approved"] } });
    if (mode === "billing-projects") return json({ success: true, data: { projects: await billingProjects() } });
    if (mode === "billing") {
      const projectId = text(request.nextUrl.searchParams.get("projectId"), 80).toUpperCase();
      if (!projectId) throw new Error("Project ID is required.");
      const snapshot = await getProjectServiceFinancials(projectId);
      return json({ success: true, data: {
        project: {
          projectId,
          ownerName: snapshot.project.client_name_snapshot || snapshot.project.project_name || "",
          story: snapshot.project.number_of_stories_text || snapshot.project.floors || "",
          location: snapshot.project.location || "",
        },
        services: snapshot.services,
        categoryTotals: snapshot.categoryTotals,
      } });
    }
    return json({ success: true, data: {
      workflows: await projectWorkflow(),
      engineeringStatuses: ENGINEERING_SERVICE_STATUSES,
      otherStatuses: OTHER_SERVICE_STATUSES,
      municipalityStatuses: MUNICIPALITY_SERVICE_STATUSES,
    } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load workflow.";
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /permission|access|role/i.test(message) ? 403 : 400);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  let user: Row | null = null; let input: Row = {};
  try {
    user = await session(request, true); input = await request.json() as Row;
    const action = text(input.action, 80).toLowerCase();
    const who = actor(user);

    if (action === "updateproposalstatus") {
      const proposalCode = text(input.proposalCode, 160);
      const itemCode = text(input.itemCode, 160);
      const status = proposalStatus(input.status);
      if (!proposalCode || !itemCode) throw new Error("Proposal and Architectural Design item are required.");
      const rows = await selectRows("proposal_items", { filters: { item_code: itemCode, proposal_code: proposalCode }, limit: 1 });
      if (!rows.length || canonicalProjectService(rows[0].service) !== "Architectural Design") throw new Error("Architectural Design workflow item was not found.");
      const updated = await updateRows("proposal_items", { item_code: itemCode }, { status, updated_at: new Date().toISOString() });
      await recordAuditEvent({ user, request, action: "proposal_architectural_workflow_status", entityType: "proposal", entityId: proposalCode, before: { status: rows[0].status }, after: { status }, source: "service-workflow" });
      return json({ success: true, data: updated[0] || { ...rows[0], status } });
    }

    if (action === "updateprojectservicestatus") {
      const id = text(input.id, 100);
      const status = text(input.status, 120);
      if (!id || !status) throw new Error("Service workflow and status are required.");
      const rows = await selectRows("project_service_workflows", { filters: { id }, limit: 1 });
      if (!rows.length) throw new Error("Project service workflow was not found.");
      const valid = workflowStatusesForService(rows[0].service_name);
      if (!valid.includes(status as never)) throw new Error(`Choose a valid ${workflowServiceName(rows[0].service_name)} status.`);
      const changes = { status, updated_by: who, updated_at: new Date().toISOString() };
      const updated = await updateRows("project_service_workflows", { id }, changes);
      await recordAuditEvent({ user, request, action: "project_service_workflow_status", entityType: "project_service_workflow", entityId: id, before: { status: rows[0].status }, after: { status }, details: { projectId: rows[0].project_code, service: rows[0].service_name }, source: "service-workflow" });
      return json({ success: true, data: updated[0] || { ...rows[0], ...changes } });
    }

    if (action === "redistributeengineeringdiscount") {
      const projectId = text(input.projectId, 80).toUpperCase();
      const requested: Row[] = Array.isArray(input.services) ? input.services : [];
      if (!projectId || !requested.length) throw new Error("Project and service discount split are required.");
      const snapshot = await getProjectServiceFinancials(projectId);
      const engineering = snapshot.services.filter((row) => row.billingCategory === "Engineering Bill");
      const currentTotal = engineering.reduce((sum, row) => sum + row.discount, 0);
      const requestedTotal = requested.reduce((sum, row) => sum + Math.max(0, num(row.discount)), 0);
      if (Math.abs(currentTotal - requestedTotal) > 0.01) throw new Error(`Service discounts must total BDT ${currentTotal.toLocaleString("en-BD")}.`);
      const project = snapshot.project;
      const bills = await selectRows("bills", { filters: { project_id: project.id }, order: "bill_date:asc,created_at:asc", limit: 5000 });
      for (const req of requested) {
        const serviceKey = workflowServiceKey(req.serviceName);
        const serviceDiscount = Math.max(0, num(req.discount));
        const matching = bills.filter((bill) => {
          const category = text(bill.billing_category || bill.category).toLowerCase();
          return category.includes("engineering") && workflowServiceKey(workflowServiceName(text(bill.description).replace(/^\[[^\]]+\]\s*/, ""))) === serviceKey;
        });
        const grossTotal = matching.reduce((sum, bill) => sum + Math.max(0, num(bill.amount)), 0);
        let remaining = serviceDiscount;
        for (let index = 0; index < matching.length; index += 1) {
          const bill = matching[index];
          const gross = Math.max(0, num(bill.amount));
          const share = index === matching.length - 1 ? remaining : Math.min(remaining, grossTotal > 0 ? Math.round((serviceDiscount * gross / grossTotal) * 100) / 100 : 0);
          remaining = Math.max(0, remaining - share);
          await updateRows("bills", { bill_code: bill.bill_code }, { discount: share, net_amount: Math.max(0, gross - share), updated_at: new Date().toISOString(), source_updated_at: new Date().toISOString() });
        }
      }
      await recordAuditEvent({ user, request, action: "engineering_discount_split", entityType: "project", entityId: projectId, details: { totalDiscount: requestedTotal, services: requested }, source: "service-workflow" });
      return json({ success: true, data: await getProjectServiceFinancials(projectId) });
    }

    if (action === "syncpaidservices") {
      const projectId = text(input.projectId, 80).toUpperCase();
      if (!projectId) throw new Error("Project ID is required.");
      return json({ success: true, data: await syncPaidServiceWorkflows(projectId, who) });
    }

    throw new Error("Unsupported service workflow action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update workflow.";
    if (user) await recordAuditEvent({ user, request, action: "service_workflow_action", entityType: "workflow", entityId: text(input?.id || input?.proposalCode || input?.projectId, 160), outcome: "failure", details: { requestedAction: input?.action, error: message }, source: "service-workflow" });
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /permission|management/i.test(message) ? 403 : 400);
  }
}
