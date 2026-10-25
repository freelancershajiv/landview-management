import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { handleLandviewDataAction, employeeCodeOf, insertRows, normalizeProjectCode, selectRows, updateRows } from "@/lib/supabase-data";
import { workflowServiceKey } from "@/lib/service-workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
const WRITE_ROLES = new Set(["admin", "manager", "accounts"]);

function text(value: unknown, max = 1000) { return String(value ?? "").trim().slice(0, max); }
function num(value: unknown) {
  const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function money2(value: number) { return Math.round((Number(value) || 0) * 100) / 100; }
function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } }); }
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function actorOf(user: Row) { return employeeCodeOf(user) || text(user.username || user.Username || user.name || user.Name, 160) || "LAND VIEW"; }
function todayDhaka() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const pick = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}
function nextMonthlyDate(current: string, billingDay: number) {
  const [year, month] = current.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, Math.min(28, Math.max(1, billingDay))));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}
function monthLabel(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}
async function session(request: NextRequest, write = false) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  const role = roleOf(user);
  if (write && !WRITE_ROLES.has(role)) throw new Error("Admin, manager or accounts access is required for Billing controls.");
  if (!write && ![...WRITE_ROLES, "employee"].includes(role)) throw new Error("Billing control access is not available for this role.");
  return user;
}

async function controlSnapshot(user: Row) {
  const [book, contracts, services, milestones, rules, adjustments, projects] = await Promise.all([
    handleLandviewDataAction("getBillingBook", {}, user) as Promise<Row>,
    selectRows("project_contracts", { order: "updated_at:desc", limit: 5000 }),
    selectRows("project_contract_services", { order: "updated_at:desc", limit: 5000 }),
    selectRows("billing_milestones", { order: "updated_at:desc", limit: 5000 }),
    selectRows("supervision_billing_rules", { order: "updated_at:desc", limit: 5000 }),
    selectRows("billing_adjustments", { order: "posted_at:desc", limit: 200 }),
    selectRows("projects", { order: "project_code:desc", limit: 5000 }),
  ]);
  const projectById = new Map(projects.map((row: Row) => [text(row.id), row]));
  const serviceByContract = new Map<string, Row[]>();
  for (const service of services) {
    const list = serviceByContract.get(text(service.contract_id)) || [];
    list.push(service); serviceByContract.set(text(service.contract_id), list);
  }
  const readyMilestones = milestones.filter((row) => text(row.status).toLowerCase() === "ready_to_bill");
  const readyToBill = money2(readyMilestones.reduce((sum, row) => sum + Math.max(0, num(row.net_amount)), 0));
  const contractValue = money2(contracts.reduce((sum, row) => sum + Math.max(0, num(row.contract_net)), 0));
  const billed = money2(num(book?.totals?.billed));
  const paid = money2(num(book?.totals?.paid));
  const due = money2(num(book?.totals?.due));
  const futureRevenue = money2(Math.max(0, contractValue - billed));
  const financiallyOpen = contracts.filter((contract) => {
    const project = projectById.get(text(contract.project_id));
    return text(project?.lifecycle_phase).toLowerCase() === "completed" && text(contract.status).toLowerCase() !== "closed";
  }).length;
  const billedProjects = new Set((book?.projects || []).filter((row: Row) => num(row.billed) !== 0 || num(row.paid) !== 0).map((row: Row) => text(row.projectId))).size;
  const activeRules = rules.filter((row) => text(row.status) === "Active").length;
  return {
    summary: {
      contractValue, billed, paid, due, futureRevenue, readyToBill, financiallyOpen,
      contracts: contracts.length, billedProjects, backfilledContracts: contracts.filter((row) => text(row.source) === "Billing 2.0 Legacy Backfill").length,
      activeMonthlySupervisionRules: activeRules,
    },
    projects: contracts.map((contract) => {
      const project = projectById.get(text(contract.project_id)) || {};
      return {
        projectId: contract.project_code,
        projectName: project.project_name || contract.project_code,
        ownerName: project.client_name_snapshot || project.project_name || "",
        lifecyclePhase: project.lifecycle_phase || "",
        contractStatus: contract.status,
        contractId: contract.id,
        source: contract.source,
        services: (serviceByContract.get(text(contract.id)) || []).map((service) => ({
          id: service.id,
          serviceName: service.service_name,
          serviceKey: service.service_key,
          billingCategory: service.billing_category,
          billingModel: service.billing_model || "fixed",
          startGate: service.start_gate || "Any Payment",
          startGateValue: num(service.start_gate_value),
          releaseGate: service.release_gate || "None",
          releaseGateValue: num(service.release_gate_value),
          contractNet: num(service.contract_net),
        })),
      };
    }),
    ready: readyMilestones.slice(0, 100).map((row) => ({
      id: row.id, projectId: row.project_code, serviceName: row.service_name, milestone: row.milestone_name,
      amount: num(row.net_amount), readyAt: row.ready_at,
    })),
    rules,
    adjustments,
  };
}

async function ensureSupervisionService(projectCode: string) {
  const projectRows = await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 });
  if (!projectRows.length) throw new Error(`Project ${projectCode} was not found.`);
  const contractRows = await selectRows("project_contracts", { filters: { project_id: projectRows[0].id }, limit: 1 });
  if (!contractRows.length) throw new Error("Open this project in Billing 2.0 first so its commercial contract exists.");
  const contract = contractRows[0];
  const serviceRows = await selectRows("project_contract_services", { filters: { contract_id: contract.id, service_key: workflowServiceKey("Site Supervision") }, limit: 1 });
  if (!serviceRows.length) throw new Error("This contract does not contain a Site Supervision service.");
  return { project: projectRows[0], contract, service: serviceRows[0] };
}

async function generateDueRule(rule: Row, actor: string, force = false) {
  const today = todayDhaka();
  const runDate = text(rule.next_run_date, 20);
  if (!force && runDate > today) return null;
  if (text(rule.status) !== "Active") throw new Error("Only an active monthly supervision rule can generate a bill milestone.");
  if (rule.end_date && runDate > text(rule.end_date, 20)) return null;
  const period = force && runDate > today ? today.slice(0, 8) + String(Math.min(28, Number(rule.billing_day || 1))).padStart(2, "0") : runDate;
  const sequence = 100000 + Number(period.slice(0, 4)) * 100 + Number(period.slice(5, 7));
  const existing = await selectRows("billing_milestones", { filters: { contract_service_id: rule.contract_service_id, sequence_no: sequence }, limit: 1 });
  if (existing.length) return existing[0];
  const label = text(rule.description_template || "Monthly Supervision — {MONTH} {YEAR}")
    .replace("{MONTH}", monthLabel(period).split(" ")[0])
    .replace("{YEAR}", period.slice(0, 4));
  const now = new Date().toISOString();
  const rows = await insertRows("billing_milestones", {
    contract_service_id: rule.contract_service_id, contract_id: rule.contract_id, project_id: rule.project_id,
    project_code: rule.project_code, service_name: rule.service_name || "Site Supervision", service_key: rule.service_key || "site-supervision",
    billing_category: "Supervision Bill", sequence_no: sequence, milestone_name: label, trigger_status: "Monthly Cycle", percentage: 0,
    gross_amount: num(rule.monthly_amount), discount_amount: 0, net_amount: num(rule.monthly_amount), status: "ready_to_bill",
    ready_at: now, ready_by: actor, source: "Billing 2.0 Monthly Supervision",
    idempotency_key: `monthly:${rule.id}:${period.slice(0, 7)}`, created_at: now, updated_at: now,
  });
  const milestone = rows[0];
  await insertRows("billing_events", {
    project_id: rule.project_id, project_code: rule.project_code, contract_id: rule.contract_id, contract_service_id: rule.contract_service_id,
    milestone_id: milestone.id, event_type: "milestone_ready", event_key: `monthly-ready:${rule.id}:${period.slice(0, 7)}`,
    service_name: rule.service_name || "Site Supervision", workflow_status: "Monthly Cycle", amount: num(rule.monthly_amount), actor,
    details: { period: period.slice(0, 7), ruleId: rule.id, recurring: true, manualRun: force }, created_at: now,
  });
  await updateRows("supervision_billing_rules", { id: rule.id }, { next_run_date: nextMonthlyDate(period, Number(rule.billing_day || 1)), updated_at: now });
  return milestone;
}

export async function GET(request: NextRequest) {
  try {
    const user = await session(request, false);
    return json({ success: true, data: await controlSnapshot(user) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Billing controls.";
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /access|role|permission/i.test(message) ? 403 : 400);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  try {
    const user = await session(request, true);
    const body = await request.json() as Row;
    const action = text(body.action, 80).toLowerCase();
    const actor = actorOf(user);
    const now = new Date().toISOString();

    if (action === "savesupervisionrule") {
      const projectCode = normalizeProjectCode(body.projectId || "");
      const monthlyAmount = money2(num(body.monthlyAmount));
      const billingDay = Math.min(28, Math.max(1, Math.trunc(num(body.billingDay) || 1)));
      const startDate = text(body.startDate, 20) || todayDhaka();
      const endDate = text(body.endDate, 20) || null;
      const status = ["Active", "Paused", "Stopped"].includes(text(body.status)) ? text(body.status) : "Active";
      if (!(monthlyAmount > 0)) throw new Error("Monthly supervision amount must be greater than zero.");
      const { project, contract, service } = await ensureSupervisionService(projectCode);
      const firstRun = `${startDate.slice(0, 8)}${String(billingDay).padStart(2, "0")}`;
      const nextRunDate = firstRun < startDate ? nextMonthlyDate(firstRun, billingDay) : firstRun;
      const prior = await selectRows("supervision_billing_rules", { filters: { project_id: project.id, contract_service_id: service.id }, limit: 1 });
      const changes = {
        project_code: projectCode, contract_id: contract.id, contract_service_id: service.id,
        service_name: "Site Supervision", service_key: workflowServiceKey("Site Supervision"), monthly_amount: monthlyAmount,
        billing_day: billingDay, start_date: startDate, end_date: endDate, next_run_date: prior[0]?.next_run_date || nextRunDate,
        status, auto_issue: false, description_template: text(body.descriptionTemplate, 300) || "Monthly Supervision — {MONTH} {YEAR}", updated_at: now,
      };
      if (prior.length) await updateRows("supervision_billing_rules", { id: prior[0].id }, changes);
      else await insertRows("supervision_billing_rules", { ...changes, project_id: project.id, created_by: actor, created_at: now });
      await updateRows("project_contract_services", { id: service.id }, { billing_model: "monthly", updated_at: now });
    } else if (action === "setrulestatus") {
      const ruleId = text(body.ruleId, 120);
      const status = text(body.status);
      if (!ruleId || !["Active", "Paused", "Stopped"].includes(status)) throw new Error("Rule and valid status are required.");
      await updateRows("supervision_billing_rules", { id: ruleId }, { status, updated_at: now });
    } else if (action === "generatesupervisionnow") {
      const ruleId = text(body.ruleId, 120);
      const rows = await selectRows("supervision_billing_rules", { filters: { id: ruleId }, limit: 1 });
      if (!rows.length) throw new Error("Monthly supervision rule was not found.");
      await generateDueRule(rows[0], actor, true);
    } else if (action === "updategate") {
      const serviceId = text(body.serviceId, 120);
      if (!serviceId) throw new Error("Contract service is required.");
      const releaseGate = text(body.releaseGate, 80);
      const startGate = text(body.startGate, 80);
      const validRelease = ["None", "No Overdue Invoice", "Minimum Amount", "Minimum Percent", "Fully Paid"];
      const validStart = ["None", "Any Payment", "Minimum Amount", "Minimum Percent", "Fully Paid"];
      if (!validRelease.includes(releaseGate) || !validStart.includes(startGate)) throw new Error("Choose valid financial gate rules.");
      await updateRows("project_contract_services", { id: serviceId }, {
        start_gate: startGate, start_gate_value: Math.max(0, num(body.startGateValue)),
        release_gate: releaseGate, release_gate_value: Math.max(0, num(body.releaseGateValue)), updated_at: now,
      });
    } else {
      throw new Error("Unsupported Billing control action.");
    }

    return json({ success: true, data: await controlSnapshot(user) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Billing control action failed.";
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /access|role|permission/i.test(message) ? 403 : 400);
  }
}
