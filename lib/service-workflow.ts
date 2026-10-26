import { insertRows, selectRows, updateRows } from "@/lib/supabase-data";
import { canonicalProjectService, taskKeyPart } from "@/lib/project-task-templates";
import { loadReceivableAuthority, type ReceivableCategoryKey } from "@/lib/billing-receivable-authority";

type Row = Record<string, any>;

const ENGINEERING_ORDER = [
  "Architectural Design",
  "Structural Design",
  "3D Design - Exterior",
  "3D Design - Interior",
  "Electrical Design",
  "Fire Safety Design",
  "Plumbing Design",
  "Plan Approval Design",
  "Estimate & Costing",
  "Design Books",
  "Re-Design Fees",
];

export const ENGINEERING_SERVICE_STATUSES = ["Working", "Ready", "Sent", "Approved", "Ready to Print", "Printed", "Delivered"] as const;
export const OTHER_SERVICE_STATUSES = ["Working", "Report Ready", "Delivered"] as const;
export const MUNICIPALITY_SERVICE_STATUSES = [
  "Payment Received",
  "Working",
  "Bank Draft OK",
  "File Submitted",
  "Meeting Approved",
  "File Received",
  "Delivered to Client",
] as const;

function text(value: unknown, max = 1000) { return String(value ?? "").trim().slice(0, max); }
function rawBillService(row: Row) {
  return text(row.description, 300).replace(/^\[(Engineering Bill|Design Books|Supervision Bill|Other Services Bill)\]\s*/i, "").trim();
}
function billingCategory(key: ReceivableCategoryKey) {
  if (key === "supervision") return "Supervision Bill";
  if (key === "other") return "Other Services Bill";
  return "Engineering Bill";
}
export function workflowServiceName(value: unknown) {
  const raw = text(value, 300);
  const canonical = canonicalProjectService(raw);
  if (canonical === "Municipality Approval") return "Municipality Approval Contract";
  return canonical || raw || "Service";
}
export function workflowServiceKey(value: unknown) { return taskKeyPart(workflowServiceName(value)); }
export function workflowTypeForService(service: unknown) {
  const name = workflowServiceName(service);
  if (name === "Municipality Approval Contract") return "municipality";
  if (ENGINEERING_ORDER.includes(name)) return "engineering";
  return "other";
}
export function workflowStatusesForService(service: unknown) {
  const type = workflowTypeForService(service);
  return type === "municipality" ? [...MUNICIPALITY_SERVICE_STATUSES] : type === "engineering" ? [...ENGINEERING_SERVICE_STATUSES] : [...OTHER_SERVICE_STATUSES];
}
function initialWorkflowStatus(service: unknown) { return workflowTypeForService(service) === "municipality" ? "Payment Received" : "Working"; }

export type ServiceFinancial = {
  serviceName: string;
  serviceKey: string;
  billingCategory: string;
  workflowType: string;
  gross: number;
  discount: number;
  net: number;
  paid: number;
  due: number;
  relief: number;
  fullyPaid: boolean;
  billCodes: string[];
};

function serviceRank(name: string) {
  const index = ENGINEERING_ORDER.indexOf(name);
  if (index >= 0) return index;
  if (name === "Soil Test") return 100;
  if (name === "Digital Survey") return 110;
  if (name === "Municipality Approval Contract") return 120;
  if (name === "Site Supervision") return 130;
  return 200;
}

export async function getProjectServiceFinancials(projectCode: string) {
  const projects = await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 });
  if (!projects.length) throw new Error(`Project ${projectCode} was not found.`);
  const project = projects[0];
  const authority = await loadReceivableAuthority({ projectId: text(project.id) });
  const projectReceivable = authority.projects.get(text(project.id));

  const map = new Map<string, ServiceFinancial>();
  for (const bill of authority.bills) {
    const category = billingCategory(bill.category);
    const raw = rawBillService(bill.row);
    const serviceName = category === "Supervision Bill"
      ? "Site Supervision"
      : workflowServiceName(raw || bill.row.billing_category || bill.row.category);
    const serviceKey = workflowServiceKey(serviceName);
    if (!serviceKey) continue;

    const existing = map.get(serviceKey) || {
      serviceName,
      serviceKey,
      billingCategory: category,
      workflowType: workflowTypeForService(serviceName),
      gross: 0,
      discount: 0,
      net: 0,
      paid: 0,
      due: 0,
      relief: 0,
      fullyPaid: false,
      billCodes: [],
    };
    existing.gross += bill.gross;
    existing.discount += bill.effectiveDiscount;
    existing.net += bill.effectiveAmount;
    existing.paid += bill.paidForReceivable;
    existing.due += bill.dueBeforeRelief;
    if (bill.billCode) existing.billCodes.push(bill.billCode);
    map.set(serviceKey, existing);
  }

  const rows = Array.from(map.values()).sort((a, b) => serviceRank(a.serviceName) - serviceRank(b.serviceName) || a.serviceName.localeCompare(b.serviceName));

  // Write-offs and approved-but-unallocated payments are project/category relief.
  // Apply only the amount needed to make service totals agree with the canonical
  // project receivable, without pretending that relief is an actual cash payment.
  const targetDue = {
    "Engineering Bill": projectReceivable?.engineeringDue ?? rows.filter((row) => row.billingCategory === "Engineering Bill").reduce((sum, row) => sum + row.due, 0),
    "Supervision Bill": projectReceivable?.supervisionDue ?? rows.filter((row) => row.billingCategory === "Supervision Bill").reduce((sum, row) => sum + row.due, 0),
    "Other Services Bill": projectReceivable?.otherDue ?? rows.filter((row) => row.billingCategory === "Other Services Bill").reduce((sum, row) => sum + row.due, 0),
  };

  for (const category of ["Engineering Bill", "Supervision Bill", "Other Services Bill"] as const) {
    const candidates = rows.filter((row) => row.billingCategory === category);
    const currentDue = candidates.reduce((sum, row) => sum + row.due, 0);
    let reduction = Math.max(0, currentDue - targetDue[category]);
    candidates.sort((a, b) => b.due - a.due || serviceRank(a.serviceName) - serviceRank(b.serviceName));
    for (const service of candidates) {
      if (reduction <= 0.009) break;
      const applied = Math.min(service.due, reduction);
      service.due -= applied;
      service.relief += applied;
      reduction -= applied;
    }
  }

  for (const service of rows) {
    service.fullyPaid = service.net > 0 && service.due <= 0.01;
  }

  return {
    project,
    services: rows,
    categoryTotals: rows.reduce((acc: Record<string, { gross: number; discount: number; net: number; paid: number; due: number; relief: number }>, row) => {
      const key = row.billingCategory;
      const current = acc[key] || { gross: 0, discount: 0, net: 0, paid: 0, due: 0, relief: 0 };
      current.gross += row.gross;
      current.discount += row.discount;
      current.net += row.net;
      current.paid += row.paid;
      current.due += row.due;
      current.relief += row.relief;
      acc[key] = current;
      return acc;
    }, {}),
  };
}

export async function syncPaidServiceWorkflows(projectCode: string, actor = "") {
  const snapshot = await getProjectServiceFinancials(projectCode);
  const project = snapshot.project;
  const existing = await selectRows("project_service_workflows", { filters: { project_id: project.id }, limit: 5000 });
  const byKey = new Map(existing.map((row: Row) => [text(row.service_key), row]));
  const activated: Row[] = [];
  const updated: Row[] = [];
  const now = new Date().toISOString();

  for (const service of snapshot.services) {
    // Project Operations should start as soon as a billed service has received
    // actual payment. Write-offs/relief can settle a due balance but do not
    // activate delivery work by themselves.
    if (service.net <= 0 || service.paid <= 0) continue;
    const prior = byKey.get(service.serviceKey);
    const changes = {
      project_code: projectCode,
      billing_category: service.billingCategory,
      service_name: service.serviceName,
      service_key: service.serviceKey,
      workflow_type: service.workflowType,
      net_amount: service.net,
      paid_amount: service.paid,
      updated_by: actor || null,
      updated_at: now,
    };
    if (prior) {
      const updatedRows = await updateRows("project_service_workflows", { id: prior.id }, changes);
      updated.push(updatedRows[0] || { ...prior, ...changes });
      continue;
    }
    const row = {
      project_id: project.id,
      ...changes,
      status: initialWorkflowStatus(service.serviceName),
      activated_at: now,
      created_at: now,
    };
    const insertedRows = await insertRows("project_service_workflows", row);
    activated.push(insertedRows[0] || row);
  }
  return { projectId: projectCode, activated, updated, services: snapshot.services };
}
