import { insertRows, selectRows, updateRows } from "@/lib/supabase-data";
import {
  getProjectServiceFinancials,
  workflowServiceKey,
  workflowServiceName,
  workflowStatusesForService,
  workflowTypeForService,
} from "@/lib/service-workflow";

type Row = Record<string, any>;

export type BillingContractServiceSeed = {
  proposalItemCode?: string | null;
  serviceName: string;
  billingCategory: string;
  gross: number;
  discount: number;
  net?: number;
};

type MilestoneTemplate = {
  name: string;
  trigger: string;
  share: number;
};

function text(value: unknown, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function num(value: unknown) {
  const n = Number(String(value ?? 0).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function money2(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function nowIso() {
  return new Date().toISOString();
}

function milestoneTemplates(serviceName: string, billingCategory: string): MilestoneTemplate[] {
  const workflowType = workflowTypeForService(serviceName);
  if (billingCategory === "Supervision Bill") {
    return [
      { name: "Supervision Mobilization", trigger: "Contract Accepted", share: 0.5 },
      { name: "Supervision Completion", trigger: "Delivered", share: 0.5 },
    ];
  }
  if (workflowType === "municipality") {
    return [
      { name: "Advance", trigger: "Contract Accepted", share: 0.5 },
      { name: "File Submission", trigger: "File Submitted", share: 0.25 },
      { name: "Final Delivery", trigger: "Delivered to Client", share: 0.25 },
    ];
  }
  if (workflowType === "engineering") {
    return [
      { name: "Advance", trigger: "Contract Accepted", share: 0.25 },
      { name: "Design Ready", trigger: "Ready", share: 0.25 },
      { name: "Design Sent", trigger: "Sent", share: 0.25 },
      { name: "Final Delivery", trigger: "Delivered", share: 0.25 },
    ];
  }
  return [
    { name: "Advance", trigger: "Contract Accepted", share: 0.5 },
    { name: "Report Ready", trigger: "Report Ready", share: 0.25 },
    { name: "Final Delivery", trigger: "Delivered", share: 0.25 },
  ];
}

function splitAmount(total: number, templates: MilestoneTemplate[]) {
  const roundedTotal = money2(Math.max(0, total));
  let allocated = 0;
  return templates.map((template, index) => {
    const value = index === templates.length - 1
      ? money2(Math.max(0, roundedTotal - allocated))
      : money2(roundedTotal * template.share);
    allocated = money2(allocated + value);
    return value;
  });
}

async function safeEvent(row: Row) {
  try {
    await insertRows("billing_events", row);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (!/duplicate|unique/.test(message)) throw error;
  }
}

async function projectForCode(projectCode: string) {
  const rows = await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 });
  if (!rows.length) throw new Error(`Project ${projectCode} was not found.`);
  return rows[0];
}

export async function createBillingContract(
  projectCode: string,
  proposalCode: string | null,
  seeds: BillingContractServiceSeed[],
  actor = "LAND VIEW",
  options: { legacyBilled?: boolean } = {},
) {
  const project = await projectForCode(projectCode);
  const existing = await selectRows("project_contracts", { filters: { project_id: project.id }, limit: 1 });
  if (existing.length) return existing[0];

  const normalized = seeds
    .map((seed) => {
      const serviceName = workflowServiceName(seed.serviceName);
      const gross = money2(Math.max(0, num(seed.gross)));
      const discount = money2(Math.min(gross, Math.max(0, num(seed.discount))));
      const explicitNet = seed.net === undefined ? null : money2(Math.max(0, num(seed.net)));
      const net = explicitNet === null ? money2(gross - discount) : explicitNet;
      return {
        ...seed,
        serviceName,
        serviceKey: workflowServiceKey(serviceName),
        workflowType: workflowTypeForService(serviceName),
        gross,
        discount,
        net,
      };
    })
    .filter((seed) => seed.serviceKey && seed.net >= 0);

  const gross = money2(normalized.reduce((sum, seed) => sum + seed.gross, 0));
  const discount = money2(normalized.reduce((sum, seed) => sum + seed.discount, 0));
  const net = money2(normalized.reduce((sum, seed) => sum + seed.net, 0));
  const timestamp = nowIso();

  let contract: Row;
  try {
    const rows = await insertRows("project_contracts", {
      project_id: project.id,
      project_code: projectCode,
      proposal_code: proposalCode || project.reclassified_proposal_code || null,
      status: "Active",
      original_gross: gross,
      contract_discount: discount,
      contract_net: net,
      source: options.legacyBilled ? "Billing 2.0 Legacy Backfill" : "Billing 2.0 Proposal Contract",
      created_by: actor || null,
      created_at: timestamp,
      updated_at: timestamp,
    });
    contract = rows[0];
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (!/duplicate|unique/.test(message)) throw error;
    const rows = await selectRows("project_contracts", { filters: { project_id: project.id }, limit: 1 });
    if (!rows.length) throw error;
    return rows[0];
  }

  for (const seed of normalized) {
    const serviceRows = await insertRows("project_contract_services", {
      contract_id: contract.id,
      project_id: project.id,
      project_code: projectCode,
      proposal_item_code: seed.proposalItemCode || null,
      service_name: seed.serviceName,
      service_key: seed.serviceKey,
      billing_category: seed.billingCategory,
      workflow_type: seed.workflowType,
      contract_gross: seed.gross,
      contract_discount: seed.discount,
      contract_net: seed.net,
      start_gate: "Any Payment",
      release_gate: "No Overdue Invoice",
      active: true,
      created_at: timestamp,
      updated_at: timestamp,
    });
    const service = serviceRows[0];

    if (options.legacyBilled) {
      await insertRows("billing_milestones", {
        contract_service_id: service.id,
        contract_id: contract.id,
        project_id: project.id,
        project_code: projectCode,
        service_name: seed.serviceName,
        service_key: seed.serviceKey,
        billing_category: seed.billingCategory,
        sequence_no: 1,
        milestone_name: "Legacy billed contract",
        trigger_status: "Legacy",
        percentage: 1,
        gross_amount: seed.gross,
        discount_amount: seed.discount,
        net_amount: seed.net,
        status: "invoiced",
        ready_at: timestamp,
        ready_by: actor || null,
        issued_at: timestamp,
        issued_by: actor || null,
        source: "Billing 2.0 Legacy Backfill",
        idempotency_key: `legacy:${projectCode}:${seed.serviceKey}`,
        created_at: timestamp,
        updated_at: timestamp,
      });
      continue;
    }

    const templates = milestoneTemplates(seed.serviceName, seed.billingCategory);
    const grossParts = splitAmount(seed.gross, templates);
    const discountParts = splitAmount(seed.discount, templates);
    const netParts = splitAmount(seed.net, templates);
    await insertRows("billing_milestones", templates.map((template, index) => {
      const ready = template.trigger === "Contract Accepted";
      return {
        contract_service_id: service.id,
        contract_id: contract.id,
        project_id: project.id,
        project_code: projectCode,
        service_name: seed.serviceName,
        service_key: seed.serviceKey,
        billing_category: seed.billingCategory,
        sequence_no: index + 1,
        milestone_name: template.name,
        trigger_status: template.trigger,
        percentage: template.share,
        gross_amount: grossParts[index],
        discount_amount: discountParts[index],
        net_amount: netParts[index],
        status: ready ? "ready_to_bill" : "scheduled",
        ready_at: ready ? timestamp : null,
        ready_by: ready ? actor || null : null,
        source: "Billing 2.0 Proposal Contract",
        idempotency_key: `milestone:${projectCode}:${seed.serviceKey}:${index + 1}`,
        created_at: timestamp,
        updated_at: timestamp,
      };
    }));
  }

  await safeEvent({
    project_id: project.id,
    project_code: projectCode,
    contract_id: contract.id,
    event_type: options.legacyBilled ? "contract_backfilled" : "contract_created",
    event_key: `contract:${contract.id}`,
    amount: net,
    actor: actor || null,
    details: { proposalCode: proposalCode || null, services: normalized.length, gross, discount, net },
    created_at: timestamp,
  });

  return contract;
}

export async function ensureBillingContract(projectCode: string, actor = "LAND VIEW") {
  const project = await projectForCode(projectCode);
  const existing = await selectRows("project_contracts", { filters: { project_id: project.id }, limit: 1 });
  if (existing.length) return existing[0];

  const financials = await getProjectServiceFinancials(projectCode);
  return createBillingContract(
    projectCode,
    text(project.reclassified_proposal_code) || null,
    financials.services.map((service) => ({
      serviceName: service.serviceName,
      billingCategory: service.billingCategory,
      gross: service.gross,
      discount: service.discount,
      net: service.net,
    })),
    actor,
    { legacyBilled: true },
  );
}

export async function syncBillingMilestonesForWorkflow(
  projectCode: string,
  serviceNameInput: string,
  workflowStatus: string,
  actor = "LAND VIEW",
) {
  const contract = await ensureBillingContract(projectCode, actor);
  const serviceName = workflowServiceName(serviceNameInput);
  const serviceKey = workflowServiceKey(serviceName);
  const services = await selectRows("project_contract_services", { filters: { contract_id: contract.id, service_key: serviceKey }, limit: 10 });
  if (!services.length) return { ready: [] as Row[] };
  const service = services[0];
  const statuses = workflowStatusesForService(serviceName);
  const currentRank = statuses.indexOf(workflowStatus as never);
  if (currentRank < 0) return { ready: [] as Row[] };

  const milestones = await selectRows("billing_milestones", { filters: { contract_service_id: service.id }, order: "sequence_no:asc", limit: 100 });
  const ready: Row[] = [];
  const timestamp = nowIso();
  for (const milestone of milestones) {
    if (text(milestone.status).toLowerCase() !== "scheduled") continue;
    const triggerRank = statuses.indexOf(text(milestone.trigger_status) as never);
    if (triggerRank < 0 || triggerRank > currentRank) continue;
    const rows = await updateRows("billing_milestones", { id: milestone.id }, {
      status: "ready_to_bill",
      ready_at: timestamp,
      ready_by: actor || null,
      updated_at: timestamp,
    });
    const updated = rows[0] || { ...milestone, status: "ready_to_bill", ready_at: timestamp, ready_by: actor || null };
    ready.push(updated);
    await safeEvent({
      project_id: milestone.project_id,
      project_code: projectCode,
      contract_id: contract.id,
      contract_service_id: service.id,
      milestone_id: milestone.id,
      event_type: "milestone_ready",
      event_key: `milestone-ready:${milestone.id}`,
      service_name: serviceName,
      workflow_status: workflowStatus,
      amount: num(milestone.net_amount),
      actor: actor || null,
      details: { milestone: milestone.milestone_name, trigger: milestone.trigger_status },
      created_at: timestamp,
    });
  }
  return { ready };
}

export async function markBillingMilestoneReady(milestoneId: string, actor = "LAND VIEW") {
  const rows = await selectRows("billing_milestones", { filters: { id: milestoneId }, limit: 1 });
  if (!rows.length) throw new Error("Billing milestone was not found.");
  const milestone = rows[0];
  if (text(milestone.status).toLowerCase() === "invoiced") return milestone;
  const timestamp = nowIso();
  const updatedRows = await updateRows("billing_milestones", { id: milestoneId }, {
    status: "ready_to_bill",
    ready_at: milestone.ready_at || timestamp,
    ready_by: actor || null,
    updated_at: timestamp,
  });
  const updated = updatedRows[0] || { ...milestone, status: "ready_to_bill" };
  await safeEvent({
    project_id: milestone.project_id,
    project_code: milestone.project_code,
    contract_id: milestone.contract_id,
    contract_service_id: milestone.contract_service_id,
    milestone_id: milestone.id,
    event_type: "milestone_ready_manual",
    event_key: `milestone-ready-manual:${milestone.id}`,
    service_name: milestone.service_name,
    workflow_status: null,
    amount: num(milestone.net_amount),
    actor: actor || null,
    details: { milestone: milestone.milestone_name },
    created_at: timestamp,
  });
  return updated;
}

export async function issueBillingMilestone(milestoneId: string, actor = "LAND VIEW") {
  const milestoneRows = await selectRows("billing_milestones", { filters: { id: milestoneId }, limit: 1 });
  if (!milestoneRows.length) throw new Error("Billing milestone was not found.");
  const milestone = milestoneRows[0];
  if (text(milestone.status).toLowerCase() === "invoiced" && milestone.bill_code) return milestone;
  if (text(milestone.status).toLowerCase() !== "ready_to_bill") throw new Error("This milestone is not ready to bill yet.");

  const project = await projectForCode(text(milestone.project_code));
  const idempotencyKey = `billing-v2:${milestone.id}`;
  const existingBills = await selectRows("bills", { filters: { idempotency_key: idempotencyKey }, limit: 1 });
  const timestamp = nowIso();
  let bill = existingBills[0];
  if (!bill) {
    const billCode = `BILL-${text(milestone.project_code).replace(/[^A-Z0-9]/gi, "")}-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
    const inserted = await insertRows("bills", {
      bill_code: billCode,
      project_id: project.id,
      bill_date: timestamp.slice(0, 10),
      billing_category: milestone.billing_category,
      category: milestone.billing_category,
      description: `[${milestone.billing_category}] ${milestone.service_name} — ${milestone.milestone_name}`,
      amount: Math.max(0, num(milestone.gross_amount)),
      discount: Math.max(0, num(milestone.discount_amount)),
      net_amount: Math.max(0, num(milestone.net_amount)),
      status: "Open",
      notes: `Issued from Billing 2.0 milestone: ${milestone.milestone_name}`,
      created_via: "Billing 2.0 Milestone",
      source_created_by: actor || null,
      source_created_at: timestamp,
      source_updated_at: timestamp,
      legacy_source_id: milestone.id,
      idempotency_key: idempotencyKey,
      unit_price: Math.max(0, num(milestone.gross_amount)),
      quantity: 1,
      created_at: timestamp,
      updated_at: timestamp,
    });
    bill = inserted[0];
  }

  const updatedRows = await updateRows("billing_milestones", { id: milestone.id }, {
    status: "invoiced",
    bill_id: bill.id,
    bill_code: bill.bill_code,
    issued_at: timestamp,
    issued_by: actor || null,
    updated_at: timestamp,
  });
  const updated = updatedRows[0] || { ...milestone, status: "invoiced", bill_id: bill.id, bill_code: bill.bill_code };

  await safeEvent({
    project_id: project.id,
    project_code: milestone.project_code,
    contract_id: milestone.contract_id,
    contract_service_id: milestone.contract_service_id,
    milestone_id: milestone.id,
    event_type: "invoice_issued",
    event_key: `milestone-issued:${milestone.id}`,
    service_name: milestone.service_name,
    workflow_status: null,
    amount: num(milestone.net_amount),
    actor: actor || null,
    details: { milestone: milestone.milestone_name, billCode: bill.bill_code },
    created_at: timestamp,
  });

  return updated;
}

export async function getBillingV2Snapshot(projectCode: string, actor = "LAND VIEW") {
  const project = await projectForCode(projectCode);
  const contract = await ensureBillingContract(projectCode, actor);
  const [contractServices, milestones, events, workflows, financials] = await Promise.all([
    selectRows("project_contract_services", { filters: { contract_id: contract.id }, order: "created_at:asc", limit: 500 }),
    selectRows("billing_milestones", { filters: { contract_id: contract.id }, order: "sequence_no:asc,created_at:asc", limit: 2000 }),
    selectRows("billing_events", { filters: { contract_id: contract.id }, order: "created_at:desc", limit: 100 }),
    selectRows("project_service_workflows", { filters: { project_id: project.id }, order: "updated_at:desc", limit: 500 }),
    getProjectServiceFinancials(projectCode),
  ]);

  const financeByKey = new Map(financials.services.map((row) => [row.serviceKey, row]));
  const workflowByKey = new Map(workflows.map((row: Row) => [text(row.service_key), row]));
  const milestonesByService = new Map<string, Row[]>();
  for (const milestone of milestones) {
    const key = text(milestone.service_key);
    const list = milestonesByService.get(key) || [];
    list.push(milestone);
    milestonesByService.set(key, list);
  }

  const services = contractServices.map((service: Row) => {
    const key = text(service.service_key);
    const finance = financeByKey.get(key);
    const workflow = workflowByKey.get(key);
    const serviceMilestones = milestonesByService.get(key) || [];
    const contractGross = Math.max(0, num(service.contract_gross));
    const contractDiscount = Math.max(0, num(service.contract_discount));
    const contractNet = Math.max(0, num(service.contract_net));
    const billedGross = Math.max(0, num(finance?.gross));
    const billedNet = Math.max(0, num(finance?.net));
    const paid = Math.max(0, num(finance?.paid));
    const due = Math.max(0, num(finance?.due));
    const unbilled = Math.max(0, money2(contractNet - billedNet));
    const readyToBill = money2(serviceMilestones
      .filter((row) => text(row.status).toLowerCase() === "ready_to_bill")
      .reduce((sum, row) => sum + Math.max(0, num(row.net_amount)), 0));
    const nextMilestone = serviceMilestones.find((row) => ["ready_to_bill", "scheduled"].includes(text(row.status).toLowerCase())) || null;
    let financeStatus = "Unbilled";
    if (readyToBill > 0 && billedNet <= 0) financeStatus = "Ready to Bill";
    else if (billedNet > 0 && due > 0 && paid > 0) financeStatus = "Partially Paid";
    else if (billedNet > 0 && due > 0) financeStatus = "Invoiced";
    else if (billedNet > 0 && due <= 0 && unbilled > 0) financeStatus = "Partially Billed";
    else if (contractNet > 0 && billedNet >= contractNet - 0.01 && due <= 0) financeStatus = "Paid";
    return {
      id: service.id,
      serviceName: service.service_name,
      serviceKey: key,
      billingCategory: service.billing_category,
      workflowType: service.workflow_type,
      workflowStatus: workflow?.status || "Not Started",
      contractGross,
      contractDiscount,
      contractNet,
      billedGross,
      billedNet,
      paid,
      due,
      unbilled,
      readyToBill,
      financeStatus,
      startGate: service.start_gate,
      releaseGate: service.release_gate,
      nextMilestone,
      milestones: serviceMilestones,
    };
  });

  const totals = services.reduce((sum, service) => ({
    contract: money2(sum.contract + service.contractNet),
    billed: money2(sum.billed + service.billedNet),
    paid: money2(sum.paid + service.paid),
    due: money2(sum.due + service.due),
    unbilled: money2(sum.unbilled + service.unbilled),
    readyToBill: money2(sum.readyToBill + service.readyToBill),
  }), { contract: 0, billed: 0, paid: 0, due: 0, unbilled: 0, readyToBill: 0 });

  return {
    project: {
      id: project.id,
      projectCode,
      projectName: project.project_name || projectCode,
      ownerName: project.client_name_snapshot || project.project_name || "",
      phone: project.phone_number_snapshot || "",
      location: project.location || "",
      lifecyclePhase: project.lifecycle_phase || "",
      proposalCode: project.reclassified_proposal_code || contract.proposal_code || "",
    },
    contract,
    totals,
    services,
    events,
  };
}
