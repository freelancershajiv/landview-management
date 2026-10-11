// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { employeeCodeOf, insertRows, normalizeProjectCode, selectRows, updateRows } from "@/lib/supabase-data";
import { supplierClean, supplierNum, supplierWorkspaceForProject } from "@/lib/project-supplier-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
const roleOf = (u: Row | null) => supplierClean(u?.role || u?.Role, 30).toLowerCase();
const userIdOf = (u: Row | null) => supplierClean(u?.userId || u?.User_ID || u?.username || u?.Username, 120);
const isManagement = (u: Row) => ["admin", "manager"].includes(roleOf(u));
const actorOf = (u: Row) => employeeCodeOf(u) || userIdOf(u) || "LAND VIEW";

function projectIdsOf(user: Row) {
  const raw = supplierClean(user.projectIds || user.Project_IDs || user.project_ids, 3000);
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
  const message = error instanceof Error ? error.message : String(error || "Supplier account request failed.");
  return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}
function errorStatus(message: string) {
  if (/session expired/i.test(message)) return 401;
  if (/access denied|restricted|permission required/i.test(message)) return 403;
  if (/not found/i.test(message)) return 404;
  if (/required|valid|greater than|unsupported/i.test(message)) return 400;
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
async function accountFor(project: Row, value: unknown) {
  const id = supplierClean(value, 100);
  if (!id) throw new Error("Supplier account is required.");
  const rows = await selectRows("project_supplier_accounts", { filters: { id, project_id: project.id }, limit: 1 });
  if (!rows.length) throw new Error("Supplier account not found.");
  return rows[0];
}
function validDate(value: unknown) {
  const date = supplierClean(value, 20) || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Enter a valid date.");
  return date;
}
function paymentMethod(value: unknown) {
  const raw = supplierClean(value, 30).toLowerCase().replace(/[_-]+/g, " ");
  if (raw === "cash") return { key: "cash", category: "Cash" };
  if (raw === "cheque") return { key: "cheque", category: "Cheque" };
  return { key: "bank_transfer", category: "Bank Transfer" };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const project = await projectFor(user, request.nextUrl.searchParams.get("projectId") || "");
    const data = await supplierWorkspaceForProject(project.id, project.project_code);
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
    const action = supplierClean(body.action, 60);

    if (action === "reclassifyMovement") {
      const id = supplierClean(body.id, 100);
      const movementType = supplierClean(body.movementType, 40);
      const allowed = ["advance_fund", "advance_cash", "delivery", "direct_purchase", "refund", "adjustment"];
      if (!id || !allowed.includes(movementType)) return fail("A valid transaction and supplier movement type are required.", 400);
      const existing = await selectRows("project_management_ledger", { filters: { id, project_id: project.id }, limit: 1 });
      if (!existing.length) return fail("Project transaction not found.", 404);
      const account = await accountFor(project, body.supplierAccountId || existing[0].supplier_account_id);
      const saved = await updateRows("project_management_ledger", { id }, {
        supplier_account_id: account.id,
        supplier_movement_type: movementType,
        supplier: account.supplier_name,
        paid_to: account.supplier_name,
        updated_by: actorOf(user),
        updated_at: new Date().toISOString(),
      });
      return ok(saved[0] || existing[0]);
    }

    const account = await accountFor(project, body.supplierAccountId);
    const date = validDate(body.date || body.entryDate);
    const details = supplierClean(body.details, 1000);
    if (!details) return fail("Details are required.", 400);
    const actor = actorOf(user);
    const category = supplierClean(body.category, 120) || account.primary_category || "Other Expenses";
    const quantity = Math.max(0, supplierNum(body.quantity));
    const rate = Math.max(0, supplierNum(body.rate));
    const enteredAmount = Math.max(0, supplierNum(body.amount));
    const calculatedAmount = quantity > 0 && rate > 0 ? quantity * rate : enteredAmount;
    const notes = supplierClean(body.memo || body.notes, 1000);

    if (action === "addDelivery" || action === "addDirectPurchase") {
      if (!(calculatedAmount > 0)) return fail("Delivery / purchase value must be greater than zero.", 400);
      const movementType = action === "addDelivery" ? "delivery" : "direct_purchase";
      const method = paymentMethod(body.paymentMethod);
      const source = action === "addDelivery" ? "supplier_delivery" : "supplier_direct_purchase";
      const row = {
        project_id: project.id,
        project_code_snapshot: project.project_code,
        entry_date: date,
        details,
        sft: quantity,
        rate,
        debit: 0,
        credit: calculatedAmount,
        category,
        memo: notes || null,
        source,
        source_type: source,
        supplier: account.supplier_name,
        paid_to: account.supplier_name,
        received_from: null,
        payment_method: action === "addDirectPurchase" ? method.key : "supplier_credit",
        supplier_account_id: account.id,
        supplier_movement_type: movementType,
        created_by: actor,
        updated_by: actor,
      };
      const saved = await insertRows("project_management_ledger", row);
      return ok(saved[0] || row);
    }

    if (action === "addAdvanceFund") {
      const amount = enteredAmount;
      if (!(amount > 0)) return fail("Advance amount must be greater than zero.", 400);
      const receivedFrom = supplierClean(body.receivedFrom, 160);
      const allowedReceivedFrom = ["Mr. Mahi Bhai", "Scrap Selling", "Mr. Jamaluddin"];
      if (!allowedReceivedFrom.includes(receivedFrom)) return fail("Select a valid Received From option.", 400);
      const method = paymentMethod(body.paymentMethod);
      const chequeStatus = supplierClean(body.chequeStatus, 30) === "On Hold" ? "ON_HOLD" : "CASHED";
      const memo = method.key === "cheque"
        ? `CHEQUE_STATUS:${chequeStatus}${notes ? `\n${notes}` : ""}`
        : (notes || null);
      const row = {
        project_id: project.id,
        project_code_snapshot: project.project_code,
        entry_date: date,
        details,
        sft: 0,
        rate: 0,
        debit: amount,
        credit: 0,
        category: method.category,
        memo,
        source: "supplier_advance_fund",
        source_type: "supplier_advance_fund",
        supplier: account.supplier_name,
        paid_to: account.supplier_name,
        received_from: receivedFrom,
        payment_method: method.key,
        supplier_account_id: account.id,
        supplier_movement_type: "advance_fund",
        created_by: actor,
        updated_by: actor,
      };
      const saved = await insertRows("project_management_ledger", row);
      return ok(saved[0] || row);
    }

    if (action === "addAdvanceCash") {
      const amount = enteredAmount;
      if (!(amount > 0)) return fail("Advance amount must be greater than zero.", 400);
      const method = paymentMethod(body.paymentMethod);
      const row = {
        project_id: project.id,
        project_code_snapshot: project.project_code,
        entry_date: date,
        details,
        sft: 0,
        rate: 0,
        debit: 0,
        credit: amount,
        category,
        memo: notes || null,
        source: "supplier_advance_cash",
        source_type: "supplier_advance_cash",
        supplier: account.supplier_name,
        paid_to: account.supplier_name,
        received_from: null,
        payment_method: method.key,
        supplier_account_id: account.id,
        supplier_movement_type: "advance_cash",
        created_by: actor,
        updated_by: actor,
      };
      const saved = await insertRows("project_management_ledger", row);
      return ok(saved[0] || row);
    }

    return fail("Unsupported supplier account action.", 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return fail(message, errorStatus(message));
  }
}
