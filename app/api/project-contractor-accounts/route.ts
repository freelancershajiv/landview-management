// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { deleteRows, employeeCodeOf, insertRows, normalizeProjectCode, selectRows, updateRows } from "@/lib/supabase-data";
import { contractorClean, contractorNum, contractorWorkspaceForProject } from "@/lib/project-contractor-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
const roleOf = (u: Row | null) => contractorClean(u?.role || u?.Role, 30).toLowerCase();
const userIdOf = (u: Row | null) => contractorClean(u?.userId || u?.User_ID || u?.username || u?.Username, 120);
const isManagement = (u: Row) => ["admin", "manager"].includes(roleOf(u));
const isAdmin = (u: Row) => roleOf(u) === "admin";
const actorOf = (u: Row) => employeeCodeOf(u) || userIdOf(u) || "LAND VIEW";

function projectIdsOf(user: Row) {
  const raw = contractorClean(user.projectIds || user.Project_IDs || user.project_ids, 3000);
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
  const message = error instanceof Error ? error.message : String(error || "Contractor account request failed.");
  return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}
function errorStatus(message: string) {
  if (/session expired/i.test(message)) return 401;
  if (/access denied|restricted|permission required/i.test(message)) return 403;
  if (/not found/i.test(message)) return 404;
  if (/required|valid|greater than|between|unsupported|exceed/i.test(message)) return 400;
  return 500;
}
async function requireUser(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  if (!["admin", "manager", "client"].includes(roleOf(user))) throw new Error("Project Management access is restricted.");
  return user;
}
async function projectFor(user: Row, value: unknown) {
  const code = normalizeProjectCode(value);
  if (!code) throw new Error("Project is required.");
  if (!isManagement(user) && !projectIdsOf(user).includes(code)) throw new Error("Access denied for this project.");
  const rows = await selectRows("projects", { filters: { project_code: code, record_type: "project" }, limit: 1 });
  if (!rows.length) throw new Error("Project not found.");
  if (!rows[0].project_management_enabled) throw new Error("Project Management is not enabled for this project.");
  return rows[0];
}
async function contractFor(project: Row, value: unknown) {
  const id = contractorClean(value, 100);
  if (!id) throw new Error("Contractor account is required.");
  const rows = await selectRows("project_contractor_contracts", { filters: { id, project_id: project.id }, limit: 1 });
  const row = rows[0];
  if (!row || contractorClean(row.party_type || "Contractor", 30).toLowerCase() !== "contractor") throw new Error("Contractor account not found.");
  return row;
}
function validDate(value: unknown, required = false) {
  const raw = contractorClean(value, 20);
  if (!raw && !required) return null;
  const date = raw || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Enter a valid date.");
  return date;
}
function billCode() {
  return "CB-" + crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase();
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const project = await projectFor(user, request.nextUrl.searchParams.get("projectId") || "");
    const data = await contractorWorkspaceForProject(project.id, project.project_code);
    return ok({
      ...data,
      selectedProject: {
        id: project.id,
        projectCode: project.project_code,
        projectName: project.project_name || project.project_code,
        clientName: project.client_name_snapshot || "",
        location: project.location || "",
      },
      readOnly: !isManagement(user),
      canDelete: isAdmin(user),
    });
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
    const project = await projectFor(user, body.projectId);
    const action = contractorClean(body.action, 60);
    const actor = actorOf(user);

    if (action === "saveContract") {
      const id = contractorClean(body.id, 100);
      const contractorName = contractorClean(body.contractorName, 160);
      const category = contractorClean(body.category, 120);
      const billingUnit = contractorClean(body.billingUnit, 40) || "SFT";
      const pricingType = contractorClean(body.pricingType, 20).toLowerCase() === "lump_sum" ? "lump_sum" : "rate";
      const contractQuantity = Math.max(0, contractorNum(body.contractQuantity));
      const agreedRate = Math.max(0, contractorNum(body.agreedRate));
      const contractAmount = Math.max(0, contractorNum(body.contractAmount));
      if (!contractorName || !category) return fail("Contractor name and category are required.", 400);
      if (pricingType === "lump_sum" && !(contractAmount > 0)) return fail("Lump-sum contract amount must be greater than zero.", 400);
      const existing = await selectRows("project_contractor_contracts", { filters: { project_id: project.id }, limit: 2000 });
      const duplicate = existing.find((row: Row) => String(row.id) !== id
        && contractorClean(row.party_type || "Contractor", 30).toLowerCase() === "contractor"
        && contractorClean(row.contractor_name, 160).toLowerCase() === contractorName.toLowerCase()
        && contractorClean(row.category, 120).toLowerCase() === category.toLowerCase());
      if (duplicate?.active) return fail("This contractor already has an active account for the selected category.", 409);
      const row = {
        project_id: project.id,
        contractor_name: contractorName,
        party_type: "Contractor",
        category,
        billing_unit: billingUnit,
        pricing_type: pricingType,
        contract_quantity: contractQuantity,
        agreed_rate: agreedRate,
        contract_amount: pricingType === "lump_sum" ? contractAmount : 0,
        scope_description: contractorClean(body.scopeDescription, 3000) || null,
        start_date: validDate(body.startDate),
        target_completion_date: validDate(body.targetCompletionDate),
        notes: contractorClean(body.notes, 3000) || null,
        active: true,
        updated_at: new Date().toISOString(),
      };
      if (duplicate && !duplicate.active && !id) {
        const saved = await updateRows("project_contractor_contracts", { id: duplicate.id }, row);
        return ok(saved[0] || row);
      }
      const saved = id ? await updateRows("project_contractor_contracts", { id, project_id: project.id }, row) : await insertRows("project_contractor_contracts", row);
      if (!saved.length) return fail("Contractor account could not be saved.", 404);
      return ok(saved[0]);
    }

    if (action === "removeContract") {
      const contract = await contractFor(project, body.id);
      const saved = await updateRows("project_contractor_contracts", { id: contract.id }, { active: false, updated_at: new Date().toISOString() });
      return ok(saved[0] || { id: contract.id, active: false });
    }

    if (action === "saveBill") {
      const contract = await contractFor(project, body.contractId);
      const id = contractorClean(body.id, 100);
      const description = contractorClean(body.description, 1200);
      const date = validDate(body.billDate, true);
      const quantity = Math.max(0, contractorNum(body.quantity));
      const rate = Math.max(0, contractorNum(body.rate));
      const deduction = Math.max(0, contractorNum(body.deduction));
      const grossAmount = Math.max(0, quantity * rate);
      const netAmount = grossAmount - deduction;
      const statusRaw = contractorClean(body.status, 20);
      const status = ["Draft", "Certified", "Void"].includes(statusRaw) ? statusRaw : "Certified";
      if (!description) return fail("Bill description is required.", 400);
      if (!(grossAmount > 0)) return fail("Bill quantity and rate must produce an amount greater than zero.", 400);
      if (netAmount < 0) return fail("Deduction cannot exceed the gross bill amount.", 400);
      const row = {
        project_id: project.id,
        contract_id: contract.id,
        bill_code: id ? contractorClean(body.billCode, 80) : billCode(),
        bill_date: date,
        description,
        quantity,
        rate,
        gross_amount: grossAmount,
        deduction,
        net_amount: netAmount,
        status,
        notes: contractorClean(body.notes, 3000) || null,
        created_by: actor,
        updated_at: new Date().toISOString(),
      };
      const saved = id ? await updateRows("project_contractor_bills", { id, project_id: project.id, contract_id: contract.id }, row) : await insertRows("project_contractor_bills", row);
      if (!saved.length) return fail("Contractor bill could not be saved.", 404);
      return ok(saved[0]);
    }

    if (action === "saveProgress") {
      const contract = await contractFor(project, body.contractId);
      const id = contractorClean(body.id, 100);
      const date = validDate(body.progressDate, true);
      const progressPercent = contractorNum(body.progressPercent);
      const description = contractorClean(body.description, 1200);
      if (progressPercent < 0 || progressPercent > 100) return fail("Physical progress must be between 0 and 100 percent.", 400);
      if (!description) return fail("Progress description is required.", 400);
      const row = {
        project_id: project.id,
        contract_id: contract.id,
        progress_date: date,
        progress_percent: progressPercent,
        completed_quantity: Math.max(0, contractorNum(body.completedQuantity)),
        stage_name: contractorClean(body.stageName, 160) || null,
        floor_label: contractorClean(body.floorLabel, 120) || null,
        description,
        notes: contractorClean(body.notes, 3000) || null,
        created_by: actor,
        updated_at: new Date().toISOString(),
      };
      const saved = id ? await updateRows("project_contractor_progress_updates", { id, project_id: project.id, contract_id: contract.id }, row) : await insertRows("project_contractor_progress_updates", row);
      if (!saved.length) return fail("Progress update could not be saved.", 404);
      return ok(saved[0]);
    }

    return fail("Unsupported contractor account action.", 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return fail(message, errorStatus(message));
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return fail("Invalid request origin.", 403);
    const user = await requireUser(request);
    if (!isAdmin(user)) return fail("Admin permission required.", 403);
    const project = await projectFor(user, request.nextUrl.searchParams.get("projectId") || "");
    const id = contractorClean(request.nextUrl.searchParams.get("id"), 100);
    const type = contractorClean(request.nextUrl.searchParams.get("type"), 40);
    if (!id) return fail("Record ID is required.", 400);
    if (type === "progress") {
      const deleted = await deleteRows("project_contractor_progress_updates", { id, project_id: project.id });
      if (!deleted.length) return fail("Progress update not found.", 404);
      return ok({ deleted: true, id, type });
    }
    if (type === "bill") {
      const deleted = await deleteRows("project_contractor_bills", { id, project_id: project.id });
      if (!deleted.length) return fail("Contractor bill not found.", 404);
      return ok({ deleted: true, id, type });
    }
    return fail("Unsupported delete type.", 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return fail(message, errorStatus(message));
  }
}