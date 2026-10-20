import { insertRows, selectRows, updateRows } from "@/lib/supabase-data";
import { canonicalProjectService, taskKeyPart } from "@/lib/project-task-templates";

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

export const ENGINEERING_SERVICE_STATUSES = ["Working", "Ready", "Sent", "Approved"] as const;
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
function num(value: unknown) { const n = Number(String(value ?? 0).replace(/,/g, "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; }
function norm(value: unknown) { return text(value, 160).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " "); }
function effectiveBill(row: Row) { return !["void", "voided", "cancelled", "canceled", "rejected"].includes(norm(row.status)); }
function effectivePayment(row: Row) {
  if (norm(row.transaction_type) === "personal income" || row.affects_business_balance === false) return false;
  const status = norm(row.approval_status || row.status);
  return !status || ["approved", "received", "paid", "verified", "complete", "completed", "full paid", "fully paid", "posted"].includes(status);
}
function billCategory(row: Row) {
  const value = text(row.billing_category || row.category, 120);
  const n = norm(value);
  if (n.includes("other")) return "Other Services Bill";
  if (n.includes("supervision")) return "Supervision Bill";
  return "Engineering Bill";
}
function rawBillService(row: Row) {
  return text(row.description, 300).replace(/^\[(Engineering Bill|Design Books|Supervision Bill|Other Services Bill)\]\s*/i, "").trim();
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
  const [bills, payments, allocations] = await Promise.all([
    selectRows("bills", { filters: { project_id: project.id }, order: "bill_date:asc,created_at:asc", limit: 5000 }),
    selectRows("payments", { filters: { project_id: project.id }, order: "payment_date:asc,created_at:asc", limit: 5000 }),
    selectRows("payment_service_allocations", { filters: { project_id: project.id }, order: "created_at:asc", limit: 10000 }),
  ]);

  const map = new Map<string, ServiceFinancial>();
  for (const bill of bills.filter(effectiveBill)) {
    const raw = rawBillService(bill);
    const serviceName = workflowServiceName(raw || bill.billing_category || bill.category);
    const serviceKey = workflowServiceKey(serviceName);
    if (!serviceKey) continue;
    const gross = Math.max(0, num(bill.amount));
    const discount = Math.max(0, num(bill.discount));
    const hasStoredNet = bill.net_amount !== null && bill.net_amount !== undefined && String(bill.net_amount) !== "";
    const net = Math.max(0, hasStoredNet ? num(bill.net_amount) : gross - discount);
    const existing = map.get(serviceKey) || {
      serviceName,
      serviceKey,
      billingCategory: billCategory(bill),
      workflowType: workflowTypeForService(serviceName),
      gross: 0,
      discount: 0,
      net: 0,
      paid: 0,
      due: 0,
      fullyPaid: false,
      billCodes: [],
    };
    existing.gross += gross;
    existing.discount += discount;
    existing.net += net;
    if (bill.bill_code) existing.billCodes.push(text(bill.bill_code, 160));
    map.set(serviceKey, existing);
  }

  const explicitByService = new Map<string, number>();
  let explicitEngineering = 0;
  for (const allocation of allocations) {
    const key = text(allocation.service_key, 120);
    const value = Math.max(0, num(allocation.allocated_amount));
    explicitByService.set(key, (explicitByService.get(key) || 0) + value);
    if (norm(allocation.billing_category).includes("engineering")) explicitEngineering += value;
  }

  const approvedPayments = payments.filter(effectivePayment);
  const categoryPaid = (needle: string) => approvedPayments
    .filter((row) => norm(row.payment_for || row.income_category).includes(needle))
    .reduce((sum, row) => sum + Math.max(0, num(row.amount)), 0);
  let legacyEngineeringPool = Math.max(0, categoryPaid("engineering") - explicitEngineering);
  let supervisionPool = categoryPaid("supervision");

  const rows = Array.from(map.values()).sort((a, b) => serviceRank(a.serviceName) - serviceRank(b.serviceName) || a.serviceName.localeCompare(b.serviceName));
  for (const service of rows) {
    let paid = explicitByService.get(service.serviceKey) || 0;
    if (service.billingCategory === "Engineering Bill") {
      const remaining = Math.max(0, service.net - paid);
      const legacyApplied = Math.min(remaining, legacyEngineeringPool);
      paid += legacyApplied;
      legacyEngineeringPool -= legacyApplied;
    } else if (service.billingCategory === "Supervision Bill") {
      const remaining = Math.max(0, service.net - paid);
      const applied = Math.min(remaining, supervisionPool);
      paid += applied;
      supervisionPool -= applied;
    } else {
      const directPaid = approvedPayments
        .filter((payment) => {
          const pCategory = norm(payment.payment_for || payment.income_category);
          if (!pCategory.includes("other")) return false;
          const serviceType = workflowServiceName(payment.service_type || "");
          return workflowServiceKey(serviceType) === service.serviceKey;
        })
        .reduce((sum, payment) => sum + Math.max(0, num(payment.amount)), 0);
      paid = Math.max(paid, directPaid);
    }
    service.paid = Math.min(service.net, paid);
    service.due = Math.max(0, service.net - service.paid);
    service.fullyPaid = service.net > 0 && service.due <= 0.01;
  }

  return {
    project,
    services: rows,
    categoryTotals: rows.reduce((acc: Record<string, { gross: number; discount: number; net: number; paid: number; due: number }>, row) => {
      const key = row.billingCategory;
      const current = acc[key] || { gross: 0, discount: 0, net: 0, paid: 0, due: 0 };
      current.gross += row.gross; current.discount += row.discount; current.net += row.net; current.paid += row.paid; current.due += row.due;
      acc[key] = current; return acc;
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
    if (!service.fullyPaid) continue;
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
      const rows = await updateRows("project_service_workflows", { id: prior.id }, changes);
      updated.push(rows[0] || { ...prior, ...changes });
      continue;
    }
    const row = {
      project_id: project.id,
      ...changes,
      status: initialWorkflowStatus(service.serviceName),
      activated_at: now,
      created_at: now,
    };
    const rows = await insertRows("project_service_workflows", row);
    activated.push(rows[0] || row);
  }
  return { projectId: projectCode, activated, updated, services: snapshot.services };
}
