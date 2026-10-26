import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { selectRows, updateRows } from "@/lib/supabase-data";
import { loadReceivableAuthority } from "@/lib/billing-receivable-authority";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
const WRITE_ROLES = new Set(["admin", "manager", "accounts"]);
const RETIRED_MONTHLY_ACTIONS = new Set(["savesupervisionrule", "setrulestatus", "generatesupervisionnow"]);

function text(value: unknown, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}
function num(value: unknown) {
  const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function money2(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}
function compareProjectCodeDesc(a: string, b: string) {
  return b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" });
}
function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "canonical-receivable-authority" } });
}
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
async function session(request: NextRequest, write = false) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  const role = roleOf(user);
  if (write && !WRITE_ROLES.has(role)) throw new Error("Admin, manager or accounts access is required for Billing controls.");
  if (!write && ![...WRITE_ROLES, "employee"].includes(role)) throw new Error("Billing control access is not available for this role.");
  return user;
}

async function controlSnapshot() {
  const [contracts, services, milestones, projects, authority] = await Promise.all([
    selectRows("project_contracts", { order: "updated_at:desc", limit: 5000 }),
    selectRows("project_contract_services", { order: "updated_at:desc", limit: 5000 }),
    selectRows("billing_milestones", { order: "updated_at:desc", limit: 5000 }),
    selectRows("projects", { limit: 5000 }),
    loadReceivableAuthority(),
  ]);

  const projectById = new Map(projects.map((row: Row) => [text(row.id), row]));
  const serviceByContract = new Map<string, Row[]>();
  for (const service of services) {
    const list = serviceByContract.get(text(service.contract_id)) || [];
    list.push(service);
    serviceByContract.set(text(service.contract_id), list);
  }

  const readyMilestones = milestones.filter((row) => text(row.status).toLowerCase() === "ready_to_bill");
  const readyToBill = money2(readyMilestones.reduce((sum, row) => sum + Math.max(0, num(row.net_amount)), 0));
  const contractValue = money2(contracts.reduce((sum, row) => sum + Math.max(0, num(row.contract_net)), 0));
  const billed = money2(authority.totals.billed);
  const paid = money2(authority.totals.paid);
  const due = money2(authority.totals.due);
  const futureRevenue = money2(Math.max(0, contractValue - billed));
  const financiallyOpen = contracts.filter((contract) => {
    const project = projectById.get(text(contract.project_id));
    return text(project?.lifecycle_phase).toLowerCase() === "completed" && text(contract.status).toLowerCase() !== "closed";
  }).length;
  const billedProjects = [...authority.projects.values()].filter((row) => row.billed > 0.009 || row.paid > 0.009).length;

  const projectRows = contracts.map((contract) => {
    const project = projectById.get(text(contract.project_id)) || {};
    return {
      projectId: text(contract.project_code || project.project_code),
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
        billingModel: text(service.service_key) === "site-supervision" ? "manual" : (service.billing_model || "fixed"),
        startGate: service.start_gate || "Any Payment",
        startGateValue: num(service.start_gate_value),
        releaseGate: service.release_gate || "None",
        releaseGateValue: num(service.release_gate_value),
        contractNet: num(service.contract_net),
      })),
    };
  }).sort((a, b) => compareProjectCodeDesc(a.projectId, b.projectId));

  return {
    summary: {
      contractValue,
      billed,
      paid,
      due,
      futureRevenue,
      readyToBill,
      financiallyOpen,
      contracts: contracts.length,
      billedProjects,
      backfilledContracts: contracts.filter((row) => text(row.source) === "Billing 2.0 Legacy Backfill").length,
    },
    projects: projectRows,
    ready: readyMilestones.slice(0, 100).map((row) => ({
      id: row.id,
      projectId: row.project_code,
      serviceName: row.service_name,
      milestone: row.milestone_name,
      amount: num(row.net_amount),
      readyAt: row.ready_at,
    })),
  };
}

export async function GET(request: NextRequest) {
  try {
    await session(request, false);
    return json({ success: true, data: await controlSnapshot() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Billing controls.";
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /access|role|permission/i.test(message) ? 403 : 400);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  try {
    await session(request, true);
    const body = await request.json() as Row;
    const action = text(body.action, 80).toLowerCase();

    if (RETIRED_MONTHLY_ACTIONS.has(action)) {
      return json({ success: false, error: "Monthly supervision billing has been retired. Site Supervision is billed manually / by milestone only." }, 410);
    }

    if (action !== "updategate") throw new Error("Unsupported Billing control action.");

    const serviceId = text(body.serviceId, 120);
    if (!serviceId) throw new Error("Contract service is required.");
    const releaseGate = text(body.releaseGate, 80);
    const startGate = text(body.startGate, 80);
    const validRelease = ["None", "No Overdue Invoice", "Minimum Amount", "Minimum Percent", "Fully Paid"];
    const validStart = ["None", "Any Payment", "Minimum Amount", "Minimum Percent", "Fully Paid"];
    if (!validRelease.includes(releaseGate) || !validStart.includes(startGate)) throw new Error("Choose valid financial gate rules.");

    await updateRows("project_contract_services", { id: serviceId }, {
      start_gate: startGate,
      start_gate_value: Math.max(0, num(body.startGateValue)),
      release_gate: releaseGate,
      release_gate_value: Math.max(0, num(body.releaseGateValue)),
      updated_at: new Date().toISOString(),
    });

    return json({ success: true, data: await controlSnapshot() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Billing control action failed.";
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /access|role|permission/i.test(message) ? 403 : 400);
  }
}
