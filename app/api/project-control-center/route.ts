// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { employeeCodeOf, normalizeProjectCode, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
const clean = (v: unknown, max = 1000) => String(v ?? "").trim().slice(0, max);
const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const roleOf = (u: Row | null) => clean(u?.role || u?.Role, 30).toLowerCase();
const userIdOf = (u: Row | null) => clean(u?.userId || u?.User_ID || u?.username || u?.Username, 120);
const isManagement = (u: Row) => ["admin", "manager"].includes(roleOf(u));
const isAdmin = (u: Row) => roleOf(u) === "admin";
const actorOf = (u: Row) => employeeCodeOf(u) || userIdOf(u) || "LAND VIEW";

function projectIdsOf(user: Row) {
  const raw = clean(user.projectIds || user.Project_IDs || user.project_ids, 3000);
  return Array.from(new Set(raw.split(/[;,\s]+/).map(normalizeProjectCode).filter(Boolean)));
}
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function ok(data: unknown, status = 200) {
  return NextResponse.json({ success: true, data }, { status, headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } });
}
function fail(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error || "Project Control Center request failed.");
  return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}
function errorStatus(message: string) {
  if (/session expired/i.test(message)) return 401;
  if (/access denied|restricted|permission required/i.test(message)) return 403;
  if (/not found/i.test(message)) return 404;
  if (/required|valid/i.test(message)) return 400;
  return 500;
}
async function requireUser(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  const role = roleOf(user);
  if (!["admin", "manager", "client"].includes(role)) throw new Error("Project Management access is restricted.");
  return user;
}
function normalizeParty(value: unknown) {
  return clean(value, 180).toLowerCase()
    .replace(/\bcontactor\b/g, "contractor")
    .replace(/\b(contractor|supplier|brick\s*field|brickfield|bf)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function structuredChequeStatus(row: Row) {
  const value = clean(row.cheque_status, 30).toLowerCase();
  if (value === "on_hold" || value === "cashed" || value === "bounced" || value === "cancelled") return value;
  if (clean(row.category, 80).toLowerCase() !== "cheque") return "";
  return /^CHEQUE_STATUS:ON_HOLD/i.test(String(row.memo || "")) ? "on_hold" : "cashed";
}
function isHeldCheque(row: Row) {
  return num(row.debit) > 0 && structuredChequeStatus(row) === "on_hold";
}
function isSattapur(row: Row) {
  const date = String(row.entry_date || "").slice(0, 10);
  if (date === "2025-11-20" || date === "2025-11-23") return false;
  const party = clean(row.paid_to || row.supplier, 180).toLowerCase();
  const details = clean(row.details, 700).toLowerCase();
  return party.includes("sattapur") || details.includes("sattapur brick");
}
function isSattapurDelivery(row: Row) {
  return isSattapur(row) && num(row.credit) > 0 && clean(row.category, 80).toLowerCase() === "bricks";
}
function isSattapurFunding(row: Row) {
  return isSattapur(row) && num(row.debit) > 0 && !isHeldCheque(row);
}
function transactionCode(row: Row) {
  return `PM-${String(Math.max(0, Math.trunc(num(row.serial_no)))).padStart(6, "0")}`;
}

async function projectsFor(user: Row) {
  const rows = await selectRows("projects", { filters: { record_type: "project" }, order: "project_code:asc", limit: 5000 });
  if (isManagement(user)) return rows;
  const allowed = new Set(projectIdsOf(user));
  return rows.filter((p: Row) => allowed.has(normalizeProjectCode(p.project_code)));
}

async function controlWorkspace(user: Row, requested: string) {
  const allProjects = await projectsFor(user);
  const projectList = allProjects.map((p: Row) => ({
    id: p.id,
    projectCode: p.project_code,
    projectName: p.project_name || p.project_code,
    clientName: p.client_name_snapshot || "",
    location: p.location || "",
    enabled: Boolean(p.project_management_enabled),
    stage: p.supervision_stage_status || p.lifecycle_phase || "",
  }));
  const enabledProjects = projectList.filter((p: Row) => p.enabled);

  if (!requested) {
    return {
      projects: enabledProjects,
      allProjects: isManagement(user) ? projectList : enabledProjects,
      selectedProject: null,
      canConfigure: isManagement(user),
      isAdmin: isAdmin(user),
    };
  }

  const code = normalizeProjectCode(requested);
  const selected = allProjects.find((p: Row) => normalizeProjectCode(p.project_code) === code);
  if (!selected) throw new Error("Project not found or access denied.");
  if (!selected.project_management_enabled) throw new Error("Project Management is not enabled for this project.");

  const [rows, summaryRows, contracts, bills, auditRows] = await Promise.all([
    selectRows("project_management_ledger", { filters: { project_id: selected.id }, order: "entry_date:asc", limit: 20000 }),
    selectRows("project_management_summary", { filters: { project_id: selected.id }, limit: 1 }),
    selectRows("project_contractor_contracts", { filters: { project_id: selected.id, active: true }, order: "category:asc", limit: 1000 }),
    selectRows("project_contractor_bills", { filters: { project_id: selected.id }, order: "bill_date:asc", limit: 5000 }),
    selectRows("app_audit_log", { filters: { entity_type: "project_management_ledger" }, order: "created_at:desc", limit: 1000 }),
  ]);

  const recordedFunds = rows.reduce((s: number, r: Row) => s + num(r.debit), 0);
  const heldChequeRows = rows.filter(isHeldCheque);
  const chequeOnHold = heldChequeRows.reduce((s: number, r: Row) => s + num(r.debit), 0);
  const cashIncome = recordedFunds - chequeOnHold;

  const expense = rows.reduce((s: number, r: Row) => {
    if (isSattapurDelivery(r)) return s;
    if (isSattapurFunding(r)) return s + num(r.debit);
    return s + num(r.credit);
  }, 0);
  const cashBalance = recordedFunds - chequeOnHold - expense;

  const sattapurDeposits = rows.filter(isSattapurFunding);
  const sattapurDeliveries = rows.filter(isSattapurDelivery);
  const sattapurDepositAmount = sattapurDeposits.reduce((s: number, r: Row) => s + num(r.debit), 0);
  const sattapurDeliveredValue = sattapurDeliveries.reduce((s: number, r: Row) => s + num(r.credit), 0);
  const supplierAdvance = Math.max(0, sattapurDepositAmount - sattapurDeliveredValue);

  const certifiedBills = bills.filter((b: Row) => clean(b.status, 30).toLowerCase() === "certified");
  const contractorAccounts = contracts.map((contract: Row) => {
    const nameKey = normalizeParty(contract.contractor_name);
    const contractBills = certifiedBills.filter((b: Row) => String(b.contract_id) === String(contract.id));
    const certified = contractBills.reduce((s: number, b: Row) => s + num(b.net_amount ?? b.gross_amount), 0);
    const paid = rows.filter((r: Row) => num(r.credit) > 0 && normalizeParty(r.paid_to || r.supplier) === nameKey)
      .reduce((s: number, r: Row) => s + num(r.credit), 0);
    const contractValue = num(contract.contract_quantity) * num(contract.agreed_rate);
    return {
      id: contract.id,
      name: contract.contractor_name,
      partyType: contract.party_type || "Contractor",
      category: contract.category,
      contractValue,
      certified,
      paid,
      advance: Math.max(0, paid - certified),
      payable: Math.max(0, certified - paid),
      remainingContract: contractValue > 0 ? Math.max(0, contractValue - certified) : 0,
      configured: num(contract.contract_quantity) > 0 && num(contract.agreed_rate) > 0,
    };
  });
  const contractorOnly = contractorAccounts.filter((c: Row) => clean(c.partyType, 30).toLowerCase() === "contractor");
  const contractorAdvance = contractorOnly.reduce((s: number, c: Row) => s + num(c.advance), 0);
  const contractorPayable = contractorOnly.reduce((s: number, c: Row) => s + num(c.payable), 0);
  const unconfiguredContracts = contractorAccounts.filter((c: Row) => !c.configured).length;

  const recent = rows.slice().sort((a: Row, b: Row) => {
    const d = String(b.entry_date || "").localeCompare(String(a.entry_date || ""));
    if (d) return d;
    return String(b.created_at || "").localeCompare(String(a.created_at || ""));
  }).slice(0, 12).map((r: Row) => ({
    id: r.id,
    serialNo: num(r.serial_no),
    transactionCode: transactionCode(r),
    date: r.entry_date,
    type: r.entry_type || (num(r.debit) > 0 ? "income" : "expense"),
    party: r.received_from || r.paid_to || r.supplier || "",
    details: r.details,
    category: r.category || "",
    amount: num(r.debit) > 0 ? num(r.debit) : num(r.credit),
    paymentMethod: r.payment_method || "unspecified",
    chequeStatus: structuredChequeStatus(r),
    createdBy: r.created_by || "",
    updatedBy: r.updated_by || "",
  }));

  const projectAudit = auditRows.filter((a: Row) => {
    const d = a.details && typeof a.details === "object" ? a.details : {};
    return String(d.project_id || "") === String(selected.id) || normalizeProjectCode(d.project_code) === code;
  }).slice(0, 10).map((a: Row) => ({
    id: a.id,
    action: a.action,
    target: a.target,
    actor: a.actor_name || a.actor_user_key || "LAND VIEW",
    createdAt: a.created_at,
  }));

  const attention: Row[] = [];
  if (chequeOnHold > 0) attention.push({ level: "warning", title: `${heldChequeRows.length} cheque${heldChequeRows.length === 1 ? "" : "s"} on hold`, amount: chequeOnHold, href: `/projectmanagement?projectId=${encodeURIComponent(code)}&section=income` });
  if (supplierAdvance > 0) attention.push({ level: "info", title: "Supplier advance still held with Sattapur", amount: supplierAdvance, href: `/projectmanagement?projectId=${encodeURIComponent(code)}&section=sattapur` });
  if (contractorPayable > 0) attention.push({ level: "warning", title: "Certified contractor bills currently payable", amount: contractorPayable, href: `/projectmanagement/contractors?projectId=${encodeURIComponent(code)}` });
  if (unconfiguredContracts > 0) attention.push({ level: "neutral", title: `${unconfiguredContracts} supplier / contractor contract${unconfiguredContracts === 1 ? "" : "s"} missing quantity or rate`, amount: 0, href: `/projectmanagement?projectId=${encodeURIComponent(code)}&section=suppliers` });
  if (!attention.length) attention.push({ level: "good", title: "No immediate finance control warnings", amount: 0, href: "" });

  const summary = summaryRows[0] || {};
  return {
    projects: enabledProjects,
    allProjects: isManagement(user) ? projectList : enabledProjects,
    selectedProject: {
      id: selected.id,
      projectCode: selected.project_code,
      projectName: selected.project_name || selected.project_code,
      clientName: selected.client_name_snapshot || "",
      location: selected.location || "",
      stage: selected.supervision_stage_status || selected.lifecycle_phase || "",
      enabled: true,
    },
    canConfigure: isManagement(user),
    isAdmin: isAdmin(user),
    totals: {
      recordedFunds,
      cashIncome,
      expense,
      cashBalance,
      chequeOnHold,
      supplierAdvance,
      contractorAdvance,
      contractorPayable,
    },
    counts: {
      entries: rows.length,
      heldCheques: heldChequeRows.length,
      suppliersAndContractors: contracts.length,
      certifiedBills: certifiedBills.length,
      unconfiguredContracts,
    },
    supplier: {
      sattapurDepositAmount,
      sattapurDeliveredValue,
      supplierAdvance,
    },
    contractors: contractorAccounts,
    recent,
    attention,
    audit: projectAudit,
    notes: summary.notes || "",
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const requested = request.nextUrl.searchParams.get("projectId") || "";
    return ok(await controlWorkspace(user, requested));
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return fail(message, errorStatus(message));
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return fail("Invalid request origin.", 403);
    const user = await requireUser(request);
    if (!isManagement(user)) return fail("Management permission required.", 403);
    const body = await request.json() as Row;
    const action = clean(body.action, 80);
    if (action !== "setProjectManagementEnabled") return fail("Unsupported Project Control action.", 400);

    const code = normalizeProjectCode(body.projectId);
    if (!code) return fail("Project is required.", 400);
    const rows = await selectRows("projects", { filters: { project_code: code, record_type: "project" }, limit: 1 });
    const project = rows[0];
    if (!project) return fail("Project not found.", 404);

    const enabled = Boolean(body.enabled);
    const saved = await updateRows("projects", { id: project.id }, {
      project_management_enabled: enabled,
      updated_at: new Date().toISOString(),
    });
    if (!saved.length) return fail("Project Management setting could not be updated.", 404);

    return ok({
      projectCode: project.project_code,
      enabled,
      updatedBy: actorOf(user),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return fail(message, errorStatus(message));
  }
}
