import { insertRows, selectRows, updateRows } from "@/lib/supabase-data";
import { workflowServiceName, workflowStatusesForService, workflowTypeForService } from "@/lib/service-workflow";

type Row = Record<string, any>;

export const DOCUMENT_WORKFLOW_STATUSES = [
  "Working",
  "Ready",
  "Sent",
  "Approved",
  "Ready to Print",
  "Printed",
  "Delivered",
] as const;

const STATUS_RANK = new Map<string, number>(DOCUMENT_WORKFLOW_STATUSES.map((status, index) => [status, index]));

function text(value: unknown, max = 1000) { return String(value ?? "").trim().slice(0, max); }
function num(value: unknown) { const n = Number(String(value ?? 0).replace(/,/g, "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; }
function rank(value: unknown) { return STATUS_RANK.get(text(value, 80)) ?? 0; }
function active(rows: Row[]) { return rows.filter((row) => !row.archived_at); }

export type DocumentTemplate = { name: string; paperSize?: string; required?: boolean };

export function documentTemplatesForService(serviceValue: unknown): DocumentTemplate[] {
  const service = workflowServiceName(serviceValue);
  if (service === "Architectural Design") return [
    { name: "Floor Plan", paperSize: "A3" },
    { name: "Elevation", paperSize: "A3" },
    { name: "Section", paperSize: "A3" },
    { name: "Door / Window Schedule", paperSize: "A3" },
    { name: "Final Architectural Set", paperSize: "A3" },
  ];
  if (service === "Structural Design") return [
    { name: "Foundation Design", paperSize: "A3" },
    { name: "Column Layout", paperSize: "A3" },
    { name: "Beam / Slab Layout", paperSize: "A3" },
    { name: "Stair / Roof Details", paperSize: "A3" },
    { name: "Final Structural Set", paperSize: "A3" },
  ];
  if (service === "3D Design - Exterior") return [{ name: "Exterior 3D Views", paperSize: "A3" }];
  if (service === "3D Design - Interior") return [{ name: "Interior 3D Views", paperSize: "A3" }];
  if (service === "Electrical Design") return [
    { name: "Electrical Layout", paperSize: "A3" },
    { name: "SLD / DB Schedule", paperSize: "A3" },
    { name: "Final Electrical Set", paperSize: "A3" },
  ];
  if (service === "Fire Safety Design") return [
    { name: "Fire Safety Layout", paperSize: "A3" },
    { name: "Final Fire Safety Set", paperSize: "A3" },
  ];
  if (service === "Plumbing Design") return [
    { name: "Water Supply Layout", paperSize: "A3" },
    { name: "Sanitary / Drainage Layout", paperSize: "A3" },
    { name: "Final Plumbing Set", paperSize: "A3" },
  ];
  if (service === "Plan Approval Design") return [{ name: "Approval Drawing Set", paperSize: "A1" }];
  if (service === "Estimate & Costing") return [{ name: "BOQ / Estimate", paperSize: "A4" }];
  if (service === "Design Books") return [{ name: "Design Book Set", paperSize: "A4" }];
  if (service === "Re-Design Fees") return [{ name: "Revised Drawing Set", paperSize: "A3" }];
  if (service === "Soil Test") return [{ name: "Soil Test Report", paperSize: "A4" }];
  if (service === "Digital Survey") return [{ name: "Digital Survey Report", paperSize: "A3" }];
  if (service === "Municipality Approval Contract") return [
    { name: "Application Documents", paperSize: "A4" },
    { name: "Bank Draft / Fees", paperSize: "A4" },
    { name: "Submitted Drawing Set", paperSize: "A1" },
    { name: "Approval Sheet / File", paperSize: "A1" },
  ];
  if (service === "Site Supervision") return [{ name: "Site Supervision Report", paperSize: "A4" }];
  return [];
}

export function documentStats(rowsValue: Row[]) {
  const rows = active(rowsValue);
  const required = rows.filter((row) => row.is_required !== false);
  const base = required.length ? required : rows;
  const atLeast = (status: string) => base.filter((row) => rank(row.status) >= rank(status)).length;
  return {
    total: rows.length,
    required: required.length,
    working: rows.filter((row) => row.status === "Working").length,
    approved: atLeast("Approved"),
    readyToPrint: atLeast("Ready to Print"),
    printed: atLeast("Printed"),
    delivered: atLeast("Delivered"),
    pending: base.filter((row) => row.status !== "Delivered").length,
    printQuantity: rows.reduce((sum, row) => sum + Math.max(0, num(row.print_quantity)), 0),
    deliveredQuantity: rows.reduce((sum, row) => sum + Math.max(0, num(row.delivered_quantity)), 0),
  };
}

export async function documentRegisterSnapshot(workflowId: string) {
  const workflowRows = await selectRows("project_service_workflows", { filters: { id: workflowId }, limit: 1 });
  if (!workflowRows.length) throw new Error("Service workflow was not found.");
  const workflow = workflowRows[0];
  const [projectRows, documents, designBooks, drawings] = await Promise.all([
    selectRows("projects", { filters: { id: workflow.project_id }, limit: 1 }),
    selectRows("project_service_documents", { filters: { service_workflow_id: workflowId }, order: "updated_at:desc", limit: 1000 }),
    selectRows("design_book_register", { filters: { project_id: workflow.project_id }, order: "updated_at:desc", limit: 500 }),
    selectRows("drawing_submissions", { filters: { project_code: workflow.project_code }, order: "created_at:desc", limit: 1000 }),
  ]);
  const project = projectRows[0] || {};
  const service = workflowServiceName(workflow.service_name);
  const matchingBooks = designBooks.filter((row) => {
    const candidate = workflowServiceName(row.book_type);
    if (service === "Design Books") return true;
    if (service === "Architectural Design" && /architectural/i.test(text(row.book_type))) return true;
    if (service === "Structural Design" && /structural/i.test(text(row.book_type))) return true;
    if (service === "3D Design - Exterior" && /3d/i.test(text(row.book_type))) return true;
    if (service === "Electrical Design" && /electrical/i.test(text(row.book_type))) return true;
    if (service === "Plumbing Design" && /plumbing/i.test(text(row.book_type))) return true;
    if (service === "Soil Test" && /soil/i.test(text(row.book_type))) return true;
    if (service === "Digital Survey" && /survey/i.test(text(row.book_type))) return true;
    if (service === "Municipality Approval Contract" && /municipality|approval/i.test(text(row.book_type))) return true;
    return candidate === service;
  });
  const matchingDrawings = drawings.filter((row) => {
    const fromDiscipline = workflowServiceName(row.discipline);
    const fromTitle = workflowServiceName(row.drawing_title);
    return fromDiscipline === service || fromTitle === service;
  });
  const current = active(documents);
  return {
    workflow: {
      id: workflow.id,
      projectId: workflow.project_code || project.project_code || "",
      projectUuid: workflow.project_id,
      ownerName: project.client_name_snapshot || project.project_name || "",
      story: project.number_of_stories_text || project.floors || "",
      location: project.location || "",
      serviceName: service,
      serviceKey: workflow.service_key,
      workflowType: workflow.workflow_type || workflowTypeForService(service),
      status: workflow.status,
      statuses: workflowStatusesForService(service),
      netAmount: num(workflow.net_amount),
      paidAmount: num(workflow.paid_amount),
    },
    documents: current,
    archivedDocuments: documents.filter((row) => row.archived_at),
    stats: documentStats(current),
    templates: documentTemplatesForService(service),
    legacy: { designBooks: matchingBooks, drawings: matchingDrawings },
  };
}

export async function initializeDocumentChecklist(workflowId: string, actor = "") {
  const snapshot = await documentRegisterSnapshot(workflowId);
  const templates = snapshot.templates;
  if (!templates.length) return { inserted: 0, snapshot };
  const existingNames = new Set(snapshot.documents.map((row: Row) => text(row.document_name, 300).toLowerCase()));
  const now = new Date().toISOString();
  const rows = templates.filter((template) => !existingNames.has(template.name.toLowerCase())).map((template) => ({
    document_code: `WDR-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`,
    project_id: snapshot.workflow.projectUuid,
    project_code: snapshot.workflow.projectId,
    service_workflow_id: workflowId,
    service_key: snapshot.workflow.serviceKey,
    service_name: snapshot.workflow.serviceName,
    document_name: template.name,
    revision_no: "R0",
    paper_size: template.paperSize || null,
    status: "Working",
    is_required: template.required !== false,
    print_quantity: 0,
    delivered_quantity: 0,
    created_by: actor || null,
    updated_by: actor || null,
    created_at: now,
    updated_at: now,
  }));
  if (rows.length) await insertRows("project_service_documents", rows);
  if (rows.length) await syncWorkflowFromDocuments(workflowId, actor);
  return { inserted: rows.length, snapshot: await documentRegisterSnapshot(workflowId) };
}

export async function syncWorkflowFromDocuments(workflowId: string, actor = "") {
  const workflowRows = await selectRows("project_service_workflows", { filters: { id: workflowId }, limit: 1 });
  if (!workflowRows.length) throw new Error("Service workflow was not found.");
  const workflow = workflowRows[0];
  const documents = active(await selectRows("project_service_documents", { filters: { service_workflow_id: workflowId }, limit: 1000 }));
  const required = documents.filter((row) => row.is_required !== false);
  if (!required.length) return workflow;

  const type = text(workflow.workflow_type).toLowerCase() || workflowTypeForService(workflow.service_name);
  const allDelivered = required.every((row) => row.status === "Delivered");
  let nextStatus = text(workflow.status, 120);

  if (type === "engineering") {
    const lowest = required.reduce((min, row) => Math.min(min, rank(row.status)), DOCUMENT_WORKFLOW_STATUSES.length - 1);
    nextStatus = DOCUMENT_WORKFLOW_STATUSES[lowest];
  } else if (type === "municipality") {
    if (allDelivered) nextStatus = "Delivered to Client";
    else if (nextStatus === "Delivered to Client") nextStatus = "Working";
  } else {
    if (allDelivered) nextStatus = "Delivered";
    else if (required.every((row) => rank(row.status) >= rank("Approved"))) nextStatus = "Report Ready";
    else nextStatus = "Working";
  }

  const valid = workflowStatusesForService(workflow.service_name);
  if (!valid.includes(nextStatus as never) || nextStatus === workflow.status) return workflow;
  const updated = await updateRows("project_service_workflows", { id: workflowId }, {
    status: nextStatus,
    updated_by: actor || null,
    updated_at: new Date().toISOString(),
  });
  return updated[0] || { ...workflow, status: nextStatus };
}
