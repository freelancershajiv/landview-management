// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { employeeCodeOf, insertRows, normalizeProjectCode, selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

const clean = (value: unknown, max = 1000) => String(value ?? "").trim().slice(0, max);
const num = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value: unknown) => Math.round(num(value) * 100) / 100;
const roleOf = (user: Row | null) => clean(user?.role || user?.Role, 30).toLowerCase();
const userIdOf = (user: Row | null) => clean(user?.userId || user?.User_ID || user?.username || user?.Username, 120);
const isManagement = (user: Row) => ["admin", "manager"].includes(roleOf(user));

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
  const message = error instanceof Error ? error.message : String(error || "Sattapur ledger request failed.");
  return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}
function approved(row: Row) {
  const status = clean(row.approval_status, 40).toLowerCase();
  return !status || ["approved", "verified", "posted", "paid", "complete", "completed"].includes(status);
}
async function requireUser(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  if (!["admin", "manager", "client"].includes(roleOf(user))) throw new Error("Project Management access is restricted to management and client accounts.");
  return user;
}
async function projectFor(user: Row, value: unknown) {
  const code = normalizeProjectCode(value);
  if (!code) throw new Error("Project is required.");
  if (!isManagement(user) && !projectIdsOf(user).includes(code)) throw new Error("Access denied for this project.");
  const rows = await selectRows("projects", { filters: { project_code: code, record_type: "project" }, limit: 1 });
  if (!rows.length) throw new Error("Project not found.");
  return rows[0];
}
async function sattapurAccount(project: Row) {
  const accounts = await selectRows("project_supplier_accounts", { filters: { project_id: project.id, active: true }, limit: 1000 });
  const account = accounts.find((row:any) => clean(row.supplier_name, 180).toLowerCase().includes("sattapur"));
  if (!account) throw new Error("Sattapur Brick Field supplier account is not configured for this project.");
  return account;
}
async function workspace(user: Row, projectCode: unknown) {
  const project = await projectFor(user, projectCode);
  const account = await sattapurAccount(project);
  const ledger = await selectRows("project_management_ledger", {
    filters: { project_id: project.id, supplier_account_id: account.id },
    order: "entry_date:asc,serial_no:asc",
    limit: 10000,
  });
  const rows = ledger.filter(approved).slice().sort((a:any,b:any) =>
    String(a.entry_date || "").localeCompare(String(b.entry_date || "")) ||
    num(a.serial_no) - num(b.serial_no) ||
    String(a.created_at || "").localeCompare(String(b.created_at || ""))
  );

  let supplierBalance = 0;
  let depositAmount = 0;
  let deliveredValue = 0;
  let deliveredQuantity = 0;
  const deposits: any[] = [];
  const deliveries: any[] = [];

  for (const row of rows) {
    const movement = clean(row.supplier_movement_type, 60).toLowerCase();
    const isDeposit = movement === "advance_fund" || (!movement && num(row.debit) > 0);
    const isDelivery = movement === "delivery";
    if (isDeposit && num(row.debit) > 0) {
      const amount = money(row.debit);
      depositAmount += amount;
      supplierBalance += amount;
      deposits.push({
        id: row.id,
        serialNo: num(row.serial_no),
        date: row.entry_date,
        details: row.details || "Sattapur deposit",
        receivedFrom: row.received_from || "",
        paymentMethod: row.payment_method || "",
        referenceNo: row.reference_no || "",
        amount,
        supplierBalanceAfter: money(supplierBalance),
      });
    }
    if (isDelivery && num(row.credit) > 0) {
      const value = money(row.credit);
      const quantity = num(row.sft);
      deliveredValue += value;
      deliveredQuantity += quantity;
      supplierBalance -= value;
      deliveries.push({
        id: row.id,
        serialNo: num(row.serial_no),
        date: row.entry_date,
        details: row.details || "Brick delivery",
        category: row.category || "Bricks",
        quantity,
        rate: num(row.rate),
        value,
        memo: row.memo || "",
        supplierBalanceAfter: money(supplierBalance),
      });
    }
  }

  return {
    project: { id: project.id, projectCode: project.project_code, projectName: project.project_name || project.project_code },
    supplier: { id: account.id, name: account.supplier_name, category: account.primary_category || "Bricks" },
    totals: {
      depositAmount: money(depositAmount),
      deliveredValue: money(deliveredValue),
      deliveredQuantity: money(deliveredQuantity),
      supplierAdvance: money(Math.max(0, supplierBalance)),
      supplierPayable: money(Math.max(0, -supplierBalance)),
      depositCount: deposits.length,
      deliveryCount: deliveries.length,
    },
    deposits: deposits.slice().reverse(),
    deliveries: deliveries.slice().reverse(),
    readOnly: !isManagement(user),
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    return ok(await workspace(user, request.nextUrl.searchParams.get("projectId") || ""));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /session expired/i.test(message) ? 401 : /access denied|restricted/i.test(message) ? 403 : /required|not found|not configured/i.test(message) ? 400 : 500;
    return fail(message, status);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return fail("Invalid request origin.", 403);
    const user = await requireUser(request);
    if (!isManagement(user)) return fail("Management permission required.", 403);
    const body = await request.json() as Row;
    const project = await projectFor(user, body.projectId);
    const account = await sattapurAccount(project);
    const date = clean(body.date || body.deliveryDate, 20) || new Date().toISOString().slice(0, 10);
    const details = clean(body.details, 1000);
    const quantity = Math.max(0, num(body.quantity));
    const rate = Math.max(0, num(body.rate));
    const explicitValue = Math.max(0, num(body.amount || body.value));
    const value = money(explicitValue > 0 ? explicitValue : quantity * rate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("Enter a valid delivery date.", 400);
    if (!details) return fail("Delivery details are required.", 400);
    if (!(quantity > 0)) return fail("Delivery quantity must be greater than zero.", 400);
    if (!(rate > 0) && !(explicitValue > 0)) return fail("Enter a rate or delivery value.", 400);
    if (!(value > 0)) return fail("Delivery value must be greater than zero.", 400);

    const actor = employeeCodeOf(user) || userIdOf(user) || "LAND VIEW";
    const row = {
      project_id: project.id,
      project_code_snapshot: project.project_code,
      entry_date: date,
      details,
      sft: quantity,
      rate,
      debit: 0,
      credit: value,
      category: clean(body.category, 120) || account.primary_category || "Bricks",
      supplier: account.supplier_name,
      paid_to: account.supplier_name,
      received_from: null,
      supplier_account_id: account.id,
      supplier_movement_type: "delivery",
      supplier_advance_applied: 0,
      payment_method: "unspecified",
      cheque_status: null,
      approval_status: "approved",
      memo: clean(body.memo, 1000) || null,
      source: "sattapur_delivery_ledger",
      source_type: "sattapur_delivery_ledger",
      created_by: actor,
      updated_by: actor,
    };
    const saved = await insertRows("project_management_ledger", row);
    return ok(saved[0] || row, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /session expired/i.test(message) ? 401 : /permission|required|valid|greater than|not found|not configured/i.test(message) ? 400 : 500;
    return fail(message, status);
  }
}
