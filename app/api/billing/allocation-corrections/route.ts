import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { employeeCodeOf, normalizeProjectCode, selectRows, updateRows } from "@/lib/supabase-data";
import { recordAuditEvent } from "@/lib/audit-log";
import { loadReceivableAuthority, type ReceivableAuthority } from "@/lib/billing-receivable-authority";
import { allocationMoveError, invoiceLedgerComparison, type CorrectionAllocation, type CorrectionPayment, type CorrectionTarget } from "@/lib/invoice-correction-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const EDIT_ROLES = ["admin", "manager", "accounts"];
const ACTION_REQUESTED = "billing.allocation.correction.requested";
const ACTION_APPROVED = "billing.allocation.correction.approved";
const ACTION_REJECTED = "billing.allocation.correction.rejected";
const ACTION_APPLIED = "billing.allocation.correction.applied";
const ACTION_FAILED = "billing.allocation.correction.failed";
const DECISIONS = [ACTION_APPROVED, ACTION_REJECTED, ACTION_APPLIED, ACTION_FAILED];
const t = (value: unknown, limit = 250) => String(value ?? "").trim().slice(0, limit);
const n = (value: unknown) => { const number = Number(value); return Number.isFinite(number) ? number : 0; };
const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
const details = (row: Row) => (row.details && typeof row.details === "object" && !Array.isArray(row.details) ? row.details : {}) as Row;
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
async function session(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  if (!EDIT_ROLES.includes(roleOf(user))) throw new Error("Finance access required.");
  return user;
}
const actorOf = (user: Row) => t(employeeCodeOf(user) || user.userId || user.User_ID || user.username || user.Username, 180);
function codeOf(value: unknown) {
  const code = normalizeProjectCode(value);
  if (!/^LV-\d+$/.test(code)) throw new Error("A valid project ID is required.");
  return code;
}
async function projectContext(projectCode: string) {
  const projects = await selectRows("projects", { select: "id,project_code", filters: { project_code: projectCode }, limit: 1 });
  const project = projects[0] as Row | undefined;
  if (!project?.id) throw new Error("Project not found.");
  const projectId = t(project.id);
  const [authority, allocations] = await Promise.all([
    loadReceivableAuthority({ projectId }),
    selectRows("payment_invoice_allocations", { select: "id,project_id,payment_id,invoice_id,allocated_amount", filters: { project_id: projectId }, limit: 5000 }),
  ]);
  if (!authority.complete || allocations.length >= 5000 || authority.invoices.length >= 5000 || authority.payments.length >= 5000 || authority.bills.length >= 5000) throw new Error("Financial records are incomplete. No corrections are permitted.");
  return { projectId, authority, allocations: allocations as Row[] };
}
function candidate(ctx: Awaited<ReturnType<typeof projectContext>>, allocationId: string, toInvoiceId: string) {
  const raw = ctx.allocations.find((item) => t(item.id) === allocationId);
  const state = ctx.authority;
  const source = state.invoices.find((item) => item.invoiceId === t(raw?.invoice_id));
  const destination = state.invoices.find((item) => item.invoiceId === toInvoiceId);
  const payment = state.payments.find((item) => item.paymentId === t(raw?.payment_id));
  const allocation: CorrectionAllocation | undefined = raw ? {
    id: t(raw.id), projectId: t(raw.project_id), paymentId: t(raw.payment_id), invoiceId: t(raw.invoice_id), amount: n(raw.allocated_amount),
  } : undefined;
  const p: CorrectionPayment | undefined = payment ? {
    id: payment.paymentId, projectId: payment.projectId, category: payment.category, amount: payment.amount, effective: payment.effective,
  } : undefined;
  const map = (invoice: typeof source): CorrectionTarget | undefined => invoice ? ({
    id: invoice.invoiceId, projectId: invoice.projectId, category: invoice.category, billCode: invoice.billCode,
    amount: invoice.amount, allocated: invoice.allocated, settled: invoice.settledByBill, active: true,
  }) : undefined;
  const error = allocationMoveError(allocation, p, map(source), map(destination));
  return { allocation, payment, source, destination, error };
}
async function events(projectCode: string) {
  const actions = [ACTION_REQUESTED, ...DECISIONS];
  const groups = await Promise.all(actions.map((action) => selectRows("app_audit_log", {
    select: "id,created_at,actor_user_key,action,entity_id,target,details",
    filters: { action, target: projectCode }, order: "created_at:desc", limit: 500,
  })));
  if (groups.some((list) => list.length >= 500)) throw new Error("Correction audit trail is incomplete. No corrections are permitted.");
  return groups.flat() as Row[];
}
function correctionRequests(rows: Row[]) {
  const actions = new Map<string, Row[]>();
  for (const row of rows) {
    const requestCode = t(row.entity_id);
    if (!requestCode) continue;
    const list = actions.get(requestCode) || [];
    list.push(row);
    actions.set(requestCode, list);
  }
  return rows.filter((row) => t(row.action) === ACTION_REQUESTED).map((request) => {
    const id = t(request.entity_id);
    const activity = (actions.get(id) || []).sort((a, b) => t(b.created_at).localeCompare(t(a.created_at)));
    const status = activity.some((row) => row.action === ACTION_APPLIED) ? "applied"
      : activity.some((row) => row.action === ACTION_REJECTED) ? "rejected"
      : activity.some((row) => row.action === ACTION_FAILED) ? "failed"
      : activity.some((row) => row.action === ACTION_APPROVED) ? "approved"
      : "pending";
    return {
      requestCode: id, projectCode: t(request.target), requestedBy: t(request.actor_user_key),
      requestedAt: t(request.created_at), status,
      allocationId: t(details(request).allocationId), paymentCode: t(details(request).paymentCode),
      paymentId: t(details(request).paymentId),
      fromInvoiceId: t(details(request).fromInvoiceId), toInvoiceId: t(details(request).toInvoiceId),
      fromBillCode: t(details(request).fromBillCode), toBillCode: t(details(request).toBillCode),
      amount: n(details(request).amount), reason: t(details(request).reason, 1000),
      resolvedBy: t(activity.find((row) => row.action !== ACTION_REQUESTED)?.actor_user_key),
    };
  }).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

export async function GET(request: NextRequest) {
  try {
    await session(request);
    const projectCode = codeOf(request.nextUrl.searchParams.get("projectId"));
    const ctx = await projectContext(projectCode);
    const [audit, ledgerRows] = await Promise.all([
      events(projectCode),
      (async () => {
        const codes = ctx.authority.payments.filter((payment) => payment.effective && !!payment.paymentCode)
          .map((payment) => `TXN-PAY-${payment.paymentCode}`);
        if (!codes.length) return [] as Row[];
        return await selectRows("transactions", { select: "transaction_code,amount,finance_scope", inFilters: { transaction_code: codes }, limit: 5000 }) as Row[];
      })().then((rows) => ({ available: rows.length < 5000, rows })).catch(() => ({ available: false, rows: [] as Row[] })),
    ]);
    const invoices = ctx.authority.invoices.map((invoice) => ({
      id: invoice.invoiceId, code: invoice.invoiceCode, billCode: invoice.billCode, category: invoice.category,
      amount: invoice.amount, allocated: invoice.allocated, settled: invoice.settledByBill,
    }));
    const allocationRows = ctx.allocations.map((row) => {
      const invoice = ctx.authority.invoices.find((item) => item.invoiceId === t(row.invoice_id));
      const payment = ctx.authority.payments.find((item) => item.paymentId === t(row.payment_id));
      return {
        id: t(row.id), paymentId: t(row.payment_id), invoiceId: t(row.invoice_id),
        paymentCode: payment?.paymentCode || "", invoiceCode: invoice?.invoiceCode || "",
        billCode: invoice?.billCode || "", amount: n(row.allocated_amount),
        effective: !!payment?.effective,
      };
    });
    const ledgerByCode = new Map(ledgerRows.rows.map((row) => [t(row.transaction_code), row]));
    const payments = ctx.authority.payments.filter((payment) => payment.effective).map((payment) => {
      const ledger = ledgerByCode.get(`TXN-PAY-${payment.paymentCode}`);
      const historical = /^TXN-(HIST|LEDGER)-/.test(payment.paymentCode);
      const scope = t(payment.row.finance_scope || "main");
      const check = ledgerRows.available ? invoiceLedgerComparison({
        paymentAmount: payment.amount, transactionAmount: n(ledger?.amount), transactionFound: !!ledger,
        historical, paymentScope: scope, ledgerScope: t(ledger?.finance_scope),
      }) : { status: "unavailable", reason: "Ledger comparison temporarily unavailable." };
      return {
        id: payment.paymentId, code: payment.paymentCode, amount: payment.amount, allocated: payment.allocated,
        unallocated: payment.unallocated, category: payment.category,
        date: t(payment.row.payment_date), method: t(payment.row.payment_method), reference: t(payment.row.reference_no),
        receiptAttached: !!t(payment.row.receipt_url), ledgerStatus: check.status, ledgerReason: check.reason,
      };
    });
    return json({ success: true, data: {
      projectCode, invoices, allocations: allocationRows, payments,
      requests: correctionRequests(audit), ledgerAvailable: ledgerRows.available,
      summary: {
        invoiceCount: invoices.length, allocatedAmount: ctx.authority.invoices.reduce((sum, invoice) => sum + invoice.allocated, 0),
        receivedAmount: payments.reduce((sum, payment) => sum + payment.amount, 0),
        unallocatedAmount: payments.reduce((sum, payment) => sum + payment.unallocated, 0),
        ledgerExceptions: payments.filter((payment) => payment.ledgerStatus === "review").length,
        receiptMissing: payments.filter((payment) => !payment.receiptAttached).length,
      },
    } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load allocation corrections.";
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /access/i.test(message) ? 403 : 400);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
    const user = await session(request);
    const actor = actorOf(user);
    if (!actor) return json({ success: false, error: "A named employee account is required for audited corrections." }, 403);
    const body = await request.json() as Row;
    const action = t(body.action);
    const projectCode = codeOf(body.projectId);
    const reason = t(body.reason, 1000);
    if (reason.length < 12) return json({ success: false, error: "Give a specific reason (at least 12 characters)." }, 400);
    const ctx = await projectContext(projectCode);
    const existing = correctionRequests(await events(projectCode));
    if (action === "request") {
      const allocationId = t(body.allocationId);
      const toInvoiceId = t(body.toInvoiceId);
      const check = candidate(ctx, allocationId, toInvoiceId);
      if (check.error || !check.allocation || !check.payment || !check.source || !check.destination)
        return json({ success: false, error: check.error || "Correction cannot be verified." }, 409);
      if (existing.some((entry) => entry.status === "pending" && entry.allocationId === allocationId))
        return json({ success: false, error: "There is already a pending correction for this allocation." }, 409);
      const requestCode = `ALC-${projectCode}-${crypto.randomUUID().slice(0, 10).toUpperCase()}`;
      const ok = await recordAuditEvent({
        user, request, action: ACTION_REQUESTED, target: projectCode, entityType: "payment_invoice_allocation", entityId: requestCode,
        details: {
          projectCode, allocationId, fromInvoiceId: check.source.invoiceId, toInvoiceId,
          fromBillCode: check.source.billCode, toBillCode: check.destination.billCode,
          paymentId: check.payment.paymentId, paymentCode: check.payment.paymentCode,
          amount: check.allocation.amount, reason,
        },
      });
      if (!ok) throw new Error("Could not save the correction request audit; no change was made.");
      return json({ success: true, data: { requestCode, status: "pending" } });
    }
    if (action !== "approve" && action !== "reject") return json({ success: false, error: "Choose request, approve or reject." }, 400);
    if (roleOf(user) !== "admin") return json({ success: false, error: "Administrator approval is required." }, 403);
    const requestCode = t(body.requestCode);
    const proposal = existing.find((item) => item.requestCode === requestCode);
    if (!proposal || proposal.status !== "pending") return json({ success: false, error: "The request is missing or no longer pending." }, 409);
    if (proposal.requestedBy === actor) return json({ success: false, error: "The requester cannot approve or reject their own correction." }, 403);
    if (action === "reject") {
      const saved = await recordAuditEvent({
        user, request, action: ACTION_REJECTED, target: projectCode, entityType: "payment_invoice_allocation", entityId: requestCode,
        details: { reason, allocationId: proposal.allocationId, paymentCode: proposal.paymentCode },
      });
      if (!saved) throw new Error("Could not record rejection.");
      return json({ success: true, data: { requestCode, status: "rejected" } });
    }
    const check = candidate(ctx, proposal.allocationId, proposal.toInvoiceId);
    if (check.error || !check.allocation || !check.payment || !check.source || !check.destination)
      return json({ success: false, error: check.error || "Correction preflight failed. No change made." }, 409);
    if (check.allocation.invoiceId !== proposal.fromInvoiceId || check.allocation.paymentId !== proposal.paymentId ||
        Math.abs(check.allocation.amount - proposal.amount) > 0.01)
      return json({ success: false, error: "The original allocation changed after submission. Create a new request." }, 409);
    const before = { invoiceId: check.allocation.invoiceId, paymentId: check.allocation.paymentId, amount: check.allocation.amount };
    const after = { ...before, invoiceId: proposal.toInvoiceId };
    const approved = await recordAuditEvent({
      user, request, action: ACTION_APPROVED, target: projectCode, entityType: "payment_invoice_allocation", entityId: requestCode,
      before, after, details: { reason, allocationId: proposal.allocationId, approvedRequest: proposal.requestCode },
    });
    if (!approved) throw new Error("Could not record approval; no change was made.");
    // One-row compare-and-set: prevent replacing a different allocation after review.
    // Never edit the payment amount, invoice amount, ledger transaction or original bill.
    try {
      const changed = await updateRows("payment_invoice_allocations", {
        id: check.allocation.id, project_id: ctx.projectId,
        payment_id: check.allocation.paymentId,
        invoice_id: check.allocation.invoiceId,
        allocated_amount: check.allocation.amount,
      }, { invoice_id: proposal.toInvoiceId });
      if (changed.length !== 1) throw new Error("The allocation was changed concurrently or could not be updated.");
      const recorded = await recordAuditEvent({
        user, request, action: ACTION_APPLIED, target: projectCode,
        entityType: "payment_invoice_allocation", entityId: requestCode, before, after,
        details: { allocationId: proposal.allocationId, paymentCode: proposal.paymentCode, reason },
      });
      if (!recorded) throw new Error("Allocation was updated, but the completion audit could not be written. Escalate for review.");
      return json({ success: true, data: { requestCode, status: "applied", fromBillCode: proposal.fromBillCode, toBillCode: proposal.toBillCode } });
    } catch (error) {
      await recordAuditEvent({
        user, request, action: ACTION_FAILED, target: projectCode, entityType: "payment_invoice_allocation", entityId: requestCode,
        details: { allocationId: proposal.allocationId, error: error instanceof Error ? error.message : "Update failed", requiresReview: true },
      });
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not process the allocation correction.";
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /access|required.*approval|requester cannot/i.test(message) ? 403 : /no longer|changed|concurrently/i.test(message) ? 409 : 400);
  }
}
