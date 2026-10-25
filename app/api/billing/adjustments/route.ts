import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { employeeCodeOf, insertRows, normalizeProjectCode, selectRows, updateRows } from "@/lib/supabase-data";
import { workflowServiceKey, workflowServiceName } from "@/lib/service-workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
const WRITE_ROLES = new Set(["admin", "manager", "accounts"]);

function text(value: unknown, max = 1200) { return String(value ?? "").trim().slice(0, max); }
function num(value: unknown) {
  const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function actorOf(user: Row) {
  return employeeCodeOf(user) || text(user.username || user.Username || user.name || user.Name, 160) || "LAND VIEW";
}
function serviceFromBill(row: Row) {
  const raw = text(row.description, 500)
    .replace(/^\[(Engineering Bill|Design Books|Supervision Bill|Other Services Bill)\]\s*/i, "")
    .replace(/\s+—\s+(Credit Note|Debit Note).*$/i, "")
    .trim();
  return text(row.billing_category || row.category).toLowerCase().includes("supervision")
    ? "Site Supervision"
    : workflowServiceName(raw || row.billing_category || row.category || "Service");
}
function code(prefix: string, projectCode: string) {
  return `${prefix}-${projectCode.replace(/[^A-Z0-9]/gi, "")}-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`;
}
async function session(request: NextRequest, write = false) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  const role = roleOf(user);
  if (write && !WRITE_ROLES.has(role)) throw new Error("Admin, manager or accounts access is required for billing adjustments.");
  if (!write && ![...WRITE_ROLES, "employee"].includes(role)) throw new Error("Billing adjustment access is not available for this role.");
  return user;
}

export async function GET(request: NextRequest) {
  try {
    await session(request, false);
    const projectCode = normalizeProjectCode(request.nextUrl.searchParams.get("projectId") || request.nextUrl.searchParams.get("fileId") || "");
    let rows: Row[] = [];
    if (projectCode) rows = await selectRows("billing_adjustments", { filters: { project_code: projectCode }, order: "posted_at:desc", limit: 1000 });
    else rows = await selectRows("billing_adjustments", { order: "posted_at:desc", limit: 1000 });
    return json({ success: true, data: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load billing adjustments.";
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /access|role|permission/i.test(message) ? 403 : 400);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  try {
    const user = await session(request, true);
    const body = await request.json() as Row;
    const action = text(body.action, 60).toLowerCase();
    const actor = actorOf(user);
    const now = new Date().toISOString();

    if (action === "void") {
      const adjustmentCode = text(body.adjustmentCode, 160);
      const reason = text(body.reason, 1000);
      if (!adjustmentCode || !reason) throw new Error("Adjustment and void reason are required.");
      const found = await selectRows("billing_adjustments", { filters: { adjustment_code: adjustmentCode }, limit: 1 });
      if (!found.length) throw new Error("Adjustment was not found.");
      const current = found[0];
      if (text(current.status).toLowerCase() === "void") return json({ success: true, data: current });
      if (current.mirror_bill_code) await updateRows("bills", { bill_code: current.mirror_bill_code }, { status: "Void", source_updated_at: now, updated_at: now, notes: `${text(current.notes)}\nVoided ${now}: ${reason}`.trim() });
      const rows = await updateRows("billing_adjustments", { adjustment_code: adjustmentCode }, { status: "Void", voided_by: actor, voided_at: now, void_reason: reason, updated_at: now });
      try {
        await insertRows("billing_events", {
          project_id: current.project_id, project_code: current.project_code, contract_id: current.contract_id || null,
          contract_service_id: current.contract_service_id || null, event_type: "adjustment_voided",
          event_key: `adjustment-void:${current.id}`, service_name: current.service_name, amount: num(current.amount), actor,
          details: { adjustmentCode, type: current.adjustment_type, reason }, created_at: now,
        });
      } catch (eventError) {
        const message = eventError instanceof Error ? eventError.message.toLowerCase() : String(eventError).toLowerCase();
        if (!/duplicate|unique/.test(message)) throw eventError;
      }
      return json({ success: true, data: rows[0] || { ...current, status: "Void" } });
    }

    if (action !== "create") throw new Error("Unsupported billing adjustment action.");
    const billCode = text(body.billCode || body.Bill_ID, 160);
    const projectCode = normalizeProjectCode(body.projectId || body.Project_ID || "");
    const type = text(body.type || body.adjustmentType, 40) === "Debit Note" ? "Debit Note" : "Credit Note";
    const adjustmentAmount = Math.round(num(body.amount) * 100) / 100;
    const reason = text(body.reason, 1000);
    const notes = text(body.notes, 2000);
    if (!billCode || !projectCode) throw new Error("Project and original Bill ID are required.");
    if (!(adjustmentAmount > 0)) throw new Error("Adjustment amount must be greater than zero.");
    if (!reason) throw new Error("Adjustment reason is required.");

    const [billRows, projectRows] = await Promise.all([
      selectRows("bills", { filters: { bill_code: billCode }, limit: 1 }),
      selectRows("projects", { filters: { project_code: projectCode }, limit: 1 }),
    ]);
    if (!billRows.length) throw new Error("Original bill was not found.");
    if (!projectRows.length || billRows[0].project_id !== projectRows[0].id) throw new Error("Original bill does not belong to the selected project.");
    const bill = billRows[0];
    if (["void", "voided", "cancelled", "canceled", "rejected"].includes(text(bill.status).toLowerCase())) throw new Error("A void or cancelled bill cannot be adjusted.");
    if (text(bill.created_via).toLowerCase().includes("credit note") || text(bill.created_via).toLowerCase().includes("debit note")) throw new Error("Create an adjustment against the original bill, not another adjustment note.");

    const existing = await selectRows("billing_adjustments", { filters: { bill_id: bill.id }, order: "posted_at:asc", limit: 1000 });
    const active = existing.filter((row) => text(row.status).toLowerCase() !== "void");
    const originalNet = num(bill.net_amount ?? (num(bill.amount) - num(bill.discount)));
    const debits = active.filter((row) => row.adjustment_type === "Debit Note").reduce((sum, row) => sum + num(row.amount), 0);
    const credits = active.filter((row) => row.adjustment_type === "Credit Note").reduce((sum, row) => sum + num(row.amount), 0);
    const adjustableBalance = Math.max(0, originalNet + debits - credits);
    if (type === "Credit Note" && adjustmentAmount > adjustableBalance + 0.009) {
      throw new Error(`Credit note cannot exceed the remaining adjusted bill value of BDT ${adjustableBalance.toLocaleString("en-BD")}.`);
    }

    const serviceName = serviceFromBill(bill);
    const serviceKey = workflowServiceKey(serviceName);
    const billingCategory = text(bill.billing_category || bill.category, 100) || "Engineering Bill";
    const contractRows = await selectRows("project_contracts", { filters: { project_id: projectRows[0].id }, limit: 1 });
    const contract = contractRows[0] || null;
    const serviceRows = contract ? await selectRows("project_contract_services", { filters: { contract_id: contract.id, service_key: serviceKey }, limit: 1 }) : [];
    const contractService = serviceRows[0] || null;
    const adjustmentCode = code(type === "Credit Note" ? "CRN" : "DBN", projectCode);
    const mirrorBillCode = code(type === "Credit Note" ? "CRB" : "DBB", projectCode);
    const mirrorRows = await insertRows("bills", {
      bill_code: mirrorBillCode,
      project_id: projectRows[0].id,
      bill_date: now.slice(0, 10),
      billing_category: billingCategory,
      category: billingCategory,
      description: `[${billingCategory}] ${serviceName}`,
      amount: type === "Debit Note" ? adjustmentAmount : 0,
      discount: type === "Credit Note" ? adjustmentAmount : 0,
      status: "Posted",
      notes: `${type} ${adjustmentCode} against ${billCode}. Reason: ${reason}${notes ? `\n${notes}` : ""}`,
      created_via: type,
      source_created_by: actor,
      source_created_at: now,
      source_updated_at: now,
      legacy_source_id: bill.id,
      idempotency_key: `billing-adjustment:${adjustmentCode}`,
      unit_price: type === "Debit Note" ? adjustmentAmount : 0,
      quantity: 1,
      created_at: now,
      updated_at: now,
    });
    const mirror = mirrorRows[0];
    const inserted = await insertRows("billing_adjustments", {
      adjustment_code: adjustmentCode,
      project_id: projectRows[0].id,
      project_code: projectCode,
      bill_id: bill.id,
      bill_code: billCode,
      mirror_bill_id: mirror.id,
      mirror_bill_code: mirror.bill_code,
      contract_id: contract?.id || null,
      contract_service_id: contractService?.id || null,
      service_name: serviceName,
      service_key: serviceKey,
      billing_category: billingCategory,
      adjustment_type: type,
      amount: adjustmentAmount,
      reason,
      notes: notes || null,
      status: "Posted",
      posted_by: actor,
      posted_at: now,
      created_at: now,
      updated_at: now,
    });
    const adjustment = inserted[0];
    await insertRows("billing_events", {
      project_id: projectRows[0].id, project_code: projectCode, contract_id: contract?.id || null,
      contract_service_id: contractService?.id || null, event_type: type === "Credit Note" ? "credit_note_posted" : "debit_note_posted",
      event_key: `adjustment:${adjustment.id}`, service_name: serviceName,
      amount: adjustmentAmount, actor, details: { adjustmentCode, originalBillCode: billCode, mirrorBillCode, reason }, created_at: now,
    });
    return json({ success: true, data: adjustment });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Billing adjustment failed.";
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /access|role|permission/i.test(message) ? 403 : 400);
  }
}
