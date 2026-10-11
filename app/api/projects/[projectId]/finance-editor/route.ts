import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { insertRows, normalizeProjectCode, roleOf, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDIT_ROLES = new Set(["admin", "manager", "accounts"]);
const BILL_CATEGORIES = new Set(["Engineering Bill", "Design Books", "Supervision Bill", "Other Services Bill"]);

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function text(value: unknown, max = 1600) { return String(value ?? "").trim().slice(0, max); }
function num(value: unknown) {
  const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : Number.NaN;
}
function nullableNum(value: unknown) {
  if (value === undefined || value === null || text(value, 80) === "") return null;
  const n = num(value);
  return Number.isFinite(n) ? n : null;
}
function date(value: unknown) {
  const v = text(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}
function actorOf(user: Record<string, unknown>) {
  return text(user.employeeId || user.Employee_ID || user.userId || user.User_ID || user.username || user.Username || "LAND VIEW", 160);
}
function code(prefix: string) {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "").toUpperCase()}`;
}
function amountOfTransaction(row: Record<string, unknown>) {
  const amount = num(row.amount);
  if (Number.isFinite(amount)) return amount;
  const credit = num(row.credit);
  return Number.isFinite(credit) ? credit : 0;
}
function isCredit(row: Record<string, unknown>) {
  return text(row.transaction_type, 60).toLowerCase() === "income" || text(row.direction, 60).toUpperCase() === "CREDIT";
}
function verificationFor(transaction: Record<string, unknown>, amount: number, paymentDate: string, projectCode: string) {
  const amountMatches = Math.abs(amountOfTransaction(transaction) - amount) < 0.005;
  const dateMatches = !paymentDate || text(transaction.transaction_date, 20) === paymentDate;
  const transactionProject = normalizeProjectCode(transaction.project_code_snapshot || "");
  const projectMatches = !transactionProject || transactionProject === projectCode;
  const verified = amountMatches && dateMatches && projectMatches;
  const notes = verified
    ? (transactionProject ? "Amount, date and project match the linked Accounts Ledger entry." : "Amount and date match. The older Accounts Ledger entry had no project assigned when it was linked.")
    : "The selected Accounts Ledger entry has an amount, date or project mismatch. Review is required.";
  return { status: verified ? "verified" : "mismatch", notes };
}

async function resolveProject(rawProjectCode: string) {
  const projectCode = normalizeProjectCode(rawProjectCode);
  const rows = await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 });
  if (!rows.length) throw new Error(`Project ${projectCode || rawProjectCode} was not found.`);
  return { projectCode, project: rows[0] };
}

function billOutput(row: Record<string, unknown>) {
  return {
    id: row.id,
    bill_code: text(row.bill_code),
    bill_date: text(row.bill_date),
    billing_category: text(row.billing_category || row.category) || "Engineering Bill",
    category: text(row.category),
    description: text(row.description).replace(/^\[(Engineering Bill|Design Books|Supervision Bill|Other Services Bill)\]\s*/i, ""),
    unit_price: row.unit_price ?? "",
    quantity: row.quantity ?? "",
    amount: row.amount ?? 0,
    discount: row.discount ?? 0,
    net_amount: row.net_amount ?? null,
    status: text(row.status) || "Issued",
    notes: text(row.notes),
    created_via: text(row.created_via),
  };
}
function paymentOutput(row: Record<string, unknown>) {
  return {
    id: row.id,
    payment_code: text(row.payment_code),
    payment_date: text(row.payment_date),
    amount: row.amount ?? 0,
    payment_method: text(row.payment_method),
    reference_no: text(row.reference_no),
    deposit_account: text(row.deposit_account),
    payment_for: text(row.payment_for),
    income_category: text(row.income_category) || "Engineering Bill",
    received_from: text(row.received_from),
    received_by: text(row.received_by),
    notes: text(row.notes),
    approval_status: text(row.approval_status),
    status: text(row.status),
    affects_business_balance: row.affects_business_balance !== false,
    ledger_transaction_code: text(row.ledger_transaction_code),
    ledger_verification_status: text(row.ledger_verification_status) || (row.affects_business_balance !== false ? "posted" : "unlinked"),
    ledger_verification_notes: text(row.ledger_verification_notes),
    service_type: text(row.service_type),
    finance_scope: text(row.finance_scope) || "main",
  };
}

export async function GET(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!EDIT_ROLES.has(roleOf(user))) return NextResponse.json({ success: false, error: "Admin, manager or accounts access is required." }, { status: 403 });
    const { projectId } = await context.params;
    const { projectCode, project } = await resolveProject(decodeURIComponent(projectId));
    const [bills, payments] = await Promise.all([
      selectRows("bills", { filters: { project_id: project.id }, order: "bill_date:asc,created_at:asc", limit: 5000 }),
      selectRows("payments", { filters: { project_id: project.id }, order: "payment_date:asc,created_at:asc", limit: 5000 }),
    ]);
    return NextResponse.json({
      success: true,
      data: {
        projectCode,
        legacyImport: Boolean(project.legacy_import),
        bills: bills.map(billOutput),
        payments: payments.map(paymentOutput),
      },
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load project finance history.";
    return NextResponse.json({ success: false, error: message }, { status: /not found/i.test(message) ? 404 : 502, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ projectId: string }> }) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!EDIT_ROLES.has(roleOf(user))) return NextResponse.json({ success: false, error: "Admin, manager or accounts access is required." }, { status: 403 });
    const { projectId } = await context.params;
    const { projectCode, project } = await resolveProject(decodeURIComponent(projectId));
    const body = await request.json() as Record<string, unknown>;
    const action = text(body.action, 40);
    const actor = actorOf(user as Record<string, unknown>);
    const now = new Date().toISOString();

    if (action === "saveBill") {
      const billCode = text(body.bill_code || body.Bill_ID, 180);
      const category = text(body.billing_category || body.Billing_Category, 80) || "Engineering Bill";
      if (!BILL_CATEGORIES.has(category)) return NextResponse.json({ success: false, error: "Choose a valid billing category." }, { status: 400 });
      const gross = num(body.amount ?? body.Amount);
      const discount = Number.isFinite(num(body.discount ?? body.Discount)) ? num(body.discount ?? body.Discount) : 0;
      if (!(gross > 0)) return NextResponse.json({ success: false, error: "Enter a valid gross bill amount." }, { status: 400 });
      if (discount < 0 || discount > gross) return NextResponse.json({ success: false, error: "Discount must be between zero and the gross bill amount." }, { status: 400 });
      const billDate = date(body.bill_date || body.Bill_Date);
      if (!billDate) return NextResponse.json({ success: false, error: "Enter a valid bill date." }, { status: 400 });
      const service = text(body.description || body.Description, 1000).replace(/^\[(Engineering Bill|Design Books|Supervision Bill|Other Services Bill)\]\s*/i, "").trim();
      if (!service) return NextResponse.json({ success: false, error: "Service / description is required." }, { status: 400 });
      const changes = {
        bill_date: billDate,
        billing_category: category,
        category: text(body.category, 160) || category,
        description: `[${category}] ${service}`,
        unit_price: nullableNum(body.unit_price),
        quantity: nullableNum(body.quantity),
        amount: gross,
        discount,
        status: text(body.status, 80) || "Issued",
        notes: text(body.notes, 2000) || null,
        source_updated_at: now,
        updated_at: now,
      };
      if (billCode) {
        const found = await selectRows("bills", { filters: { bill_code: billCode }, limit: 1 });
        if (!found.length || found[0].project_id !== project.id) return NextResponse.json({ success: false, error: "Bill was not found in this project." }, { status: 404 });
        const rows = await updateRows("bills", { bill_code: billCode }, changes);
        return NextResponse.json({ success: true, data: billOutput(rows[0] || { ...found[0], ...changes }) }, { headers: { "Cache-Control": "no-store" } });
      }
      const newCode = code("HIST-BILL");
      const rows = await insertRows("bills", {
        ...changes,
        bill_code: newCode,
        project_id: project.id,
        created_via: "project_editor_history",
        source_created_by: actor,
        source_created_at: now,
        legacy_source_id: `PROJECT-EDITOR:${projectCode}`,
        idempotency_key: `project-editor:${projectCode}:bill:${crypto.randomUUID()}`,
      });
      return NextResponse.json({ success: true, data: billOutput(rows[0] || { ...changes, bill_code: newCode }) }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "savePayment") {
      const paymentCode = text(body.payment_code || body.Payment_ID, 180);
      const paymentDate = date(body.payment_date || body.Payment_Date);
      if (!paymentDate) return NextResponse.json({ success: false, error: "Enter a valid payment date." }, { status: 400 });
      const amount = num(body.amount ?? body.Amount);
      if (!(amount > 0)) return NextResponse.json({ success: false, error: "Enter a valid payment amount." }, { status: 400 });
      const ledgerCode = text(body.ledger_transaction_code, 220);
      let ledgerTransaction: Record<string, unknown> | null = null;
      let verificationStatus = "unlinked";
      let verificationNotes = "Historical payment is not linked to an Accounts Ledger entry.";
      if (ledgerCode) {
        const txRows = await selectRows("transactions", { filters: { transaction_code: ledgerCode }, limit: 1 });
        if (!txRows.length) return NextResponse.json({ success: false, error: `Ledger transaction ${ledgerCode} was not found.` }, { status: 404 });
        ledgerTransaction = txRows[0];
        if (!isCredit(ledgerTransaction)) return NextResponse.json({ success: false, error: "The selected ledger row is not an income / credit entry." }, { status: 400 });
        const [existingLinksById, existingLinksByCode] = await Promise.all([
          selectRows("payments", { filters: { ledger_transaction_id: ledgerTransaction.id }, limit: 10 }),
          selectRows("payments", { filters: { ledger_transaction_code: ledgerCode }, limit: 10 }),
        ]);
        const existingLinks = [...existingLinksById, ...existingLinksByCode];
        if (existingLinks.some((row) => text(row.payment_code) !== paymentCode)) {
          return NextResponse.json({ success: false, error: "That Accounts Ledger entry is already linked to another payment." }, { status: 409 });
        }
        const verification = verificationFor(ledgerTransaction, amount, paymentDate, projectCode);
        verificationStatus = verification.status;
        verificationNotes = verification.notes;
      }

      let current: Record<string, unknown> | null = null;
      if (paymentCode) {
        const found = await selectRows("payments", { filters: { payment_code: paymentCode }, limit: 1 });
        if (!found.length || found[0].project_id !== project.id) return NextResponse.json({ success: false, error: "Payment was not found in this project." }, { status: 404 });
        current = found[0];
      }
      const ownGeneratedLedger = Boolean(ledgerTransaction && paymentCode && (
        text(ledgerTransaction.transaction_code) === `TXN-PAY-${paymentCode}` ||
        (text(ledgerTransaction.source_type).toUpperCase() === "PAYMENT" && text(ledgerTransaction.source_id) === paymentCode)
      ));
      const affectsBusinessBalance = current
        ? (ledgerTransaction && !ownGeneratedLedger ? false : current.affects_business_balance !== false)
        : false;
      if (!ledgerCode && current && current.affects_business_balance === false) verificationNotes = "Historical payment is not linked to an Accounts Ledger entry.";
      if (!ledgerCode && current && current.affects_business_balance !== false) {
        verificationStatus = "posted";
        verificationNotes = "This operational payment posts to the Accounts Ledger automatically through its payment transaction.";
      }

      const changes: Record<string, unknown> = {
        payment_date: paymentDate,
        amount,
        payment_method: text(body.payment_method, 120) || null,
        reference_no: text(body.reference_no, 500) || null,
        deposit_account: text(body.deposit_account, 240) || null,
        payment_for: text(body.payment_for, 500) || null,
        income_category: text(body.income_category, 120) || "Engineering Bill",
        transaction_type: "Income",
        affects_business_balance: affectsBusinessBalance,
        received_from: text(body.received_from, 240) || null,
        received_by: text(body.received_by, 240) || null,
        notes: text(body.notes, 2000) || null,
        ledger_transaction_id: ledgerTransaction?.id || null,
        ledger_transaction_code: ledgerCode || null,
        ledger_verification_status: verificationStatus === "posted" ? "unlinked" : verificationStatus,
        ledger_verified_at: ledgerTransaction ? now : null,
        ledger_verification_notes: verificationNotes,
        reviewed_by: actor,
        reviewed_at: now,
        review_notes: verificationNotes,
        source_updated_at: now,
        updated_at: now,
      };

      if (current) {
        const rows = await updateRows("payments", { payment_code: paymentCode }, changes);
        const output = paymentOutput(rows[0] || { ...current, ...changes });
        if (verificationStatus === "posted") {
          output.ledger_verification_status = "posted";
          output.ledger_verification_notes = verificationNotes;
        }
        return NextResponse.json({ success: true, data: output }, { headers: { "Cache-Control": "no-store" } });
      }

      const newCode = code("HIST-PAY");
      const rows = await insertRows("payments", {
        ...changes,
        payment_code: newCode,
        project_id: project.id,
        approval_status: "Approved",
        status: "POSTED",
        decision_notes: verificationNotes,
        source_created_by: actor,
        source_created_at: now,
        legacy_source_id: `PROJECT-EDITOR:${projectCode}`,
        idempotency_key: `project-editor:${projectCode}:payment:${crypto.randomUUID()}`,
        finance_scope: text(body.finance_scope, 80) || "main",
        service_type: text(body.service_type, 160) || null,
      });
      return NextResponse.json({ success: true, data: paymentOutput(rows[0] || { ...changes, payment_code: newCode }) }, { headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({ success: false, error: "Unsupported finance editor action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save project finance history.";
    const status = /required|valid|must|choose|not an income/i.test(message) ? 400 : /not found/i.test(message) ? 404 : /already linked/i.test(message) ? 409 : 502;
    return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
