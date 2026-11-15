import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { selectRows } from "@/lib/supabase-data";
import { recordAuditEvent } from "@/lib/audit-log";
import { receivablePaymentIsEffective } from "@/lib/billing-receivable-authority";
import { paymentReconciliationIssues, reviewStatus, type ReconciliationCaseType, type ReconciliationSeverity } from "@/lib/billing-reconciliation-41";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
type Case = {
  caseId: string; fingerprint: string; type: ReconciliationCaseType; severity: ReconciliationSeverity;
  projectCode: string; paymentCode: string; paymentId: string;
  date: string; amount: number; difference: number;
  explanation: string; receiptStatus: string; ledgerReference: string;
  reviewStatus: "open" | "pending" | "reviewed" | "rejected";
  requestedBy: string; requestedAt: string; reviewedBy: string; reviewedAt: string;
  reviewReason: string;
};
const ACTION_REQUESTED = "billing.reconciliation.v41.requested";
const ACTION_REVIEWED = "billing.reconciliation.v41.reviewed";
const ACTION_REJECTED = "billing.reconciliation.v41.rejected";
const FINANCE_ROLES = ["admin", "manager", "accounts"];
const LIMIT = 5000;
const txt = (value: unknown, len = 250) => String(value ?? "").trim().slice(0, len);
const n = (value: unknown) => { const valueNumber = Number(value); return Number.isFinite(valueNumber) ? valueNumber : 0; };
const money = (value: number) => Math.round(value * 100) / 100;
const send = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "private, no-store" } });
const actor = (user: Row) => txt(user.userId || user.User_ID || user.employeeId || user.Employee_ID || user.username || user.Username, 160);
function originAllowed(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
async function authenticate(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  if (!FINANCE_ROLES.includes(roleOf(user))) throw new Error("Billing access required.");
  return user;
}
async function snapshot() {
  const [projects, payments, receipts, transactions, allocations, audit] = await Promise.all([
    selectRows("projects", { select: "id,project_code", limit: LIMIT }),
    selectRows("payments", { select: "id,project_id,payment_code,payment_date,amount,status,approval_status,transaction_type,affects_business_balance,is_legacy_manual,finance_scope,ledger_transaction_id,ledger_transaction_code,invoice_unallocated_amount", limit: LIMIT }),
    selectRows("payment_receipts", { select: "id,payment_id,payment_code,project_id,amount,status,voided_at,receipt_path,created_at", limit: LIMIT }),
    selectRows("transactions", { select: "id,transaction_code,project_id,amount,finance_scope", limit: LIMIT }),
    selectRows("payment_invoice_allocations", { select: "id,payment_id,invoice_id,allocated_amount,project_id", limit: LIMIT }),
    selectRows("app_audit_log", { select: "id,actor_user_key,action,entity_id,target,created_at,details",
      inFilters: { action: [ACTION_REQUESTED, ACTION_REVIEWED, ACTION_REJECTED] }, order: "created_at:desc", limit: LIMIT }),
  ]);
  const sizes = { projects: projects.length, payments: payments.length, receipts: receipts.length,
    transactions: transactions.length, allocations: allocations.length, audit: audit.length };
  if (Object.values(sizes).some(size => size >= LIMIT))
    throw new Error("Reconciliation data hit a safety read limit. Review is disabled until the complete dataset can be retrieved.");
  const projectsById = new Map(projects.map(row => [txt(row.id), txt(row.project_code)]));
  const receiptByPayment = new Map<string, Row[]>();
  for (const r of receipts) { const key = txt(r.payment_id); receiptByPayment.set(key, [...receiptByPayment.get(key) || [], r]); }
  const transactionById = new Map(transactions.map(t => [txt(t.id), t]));
  const transactionByCode = new Map(transactions.map(t => [txt(t.transaction_code), t]));
  const allocatedByPayment = new Map<string, number>();
  for (const a of allocations) {
    const key = txt(a.payment_id);
    allocatedByPayment.set(key, money((allocatedByPayment.get(key) || 0) + n(a.allocated_amount)));
  }
  const auditByCase = new Map<string, Row[]>();
  for (const event of audit) {
    const key = txt(event.entity_id);
    auditByCase.set(key, [...auditByCase.get(key) || [], event]);
  }
  const cases: Case[] = [];
  let scannedEffective = 0;
  let scannedHistorical = 0;
  for (const payment of payments) {
    const paymentId = txt(payment.id);
    const projectCode = projectsById.get(txt(payment.project_id)) || "";
    if (!projectCode || !paymentId) continue;
    const paymentCode = txt(payment.payment_code);
    const effective = receivablePaymentIsEffective(payment);
    const historical = payment.is_legacy_manual === true || payment.affects_business_balance === false;
    if (historical) scannedHistorical++;
    else if (effective) scannedEffective++;
    const issued = (receiptByPayment.get(paymentId) || []).find(r =>
      txt(r.status).toLowerCase() === "issued" && !txt(r.voided_at));
    const anyReceipt = (receiptByPayment.get(paymentId) || [])[0];
    const storedId = txt(payment.ledger_transaction_id);
    const storedCode = txt(payment.ledger_transaction_code);
    const canonicalCode = `TXN-PAY-${paymentCode}`;
    const transaction = (storedId && transactionById.get(storedId)) ||
      (storedCode && transactionByCode.get(storedCode)) ||
      transactionByCode.get(canonicalCode);
    const allocated = allocatedByPayment.get(paymentId) || 0;
    const facts = { amount: n(payment.amount), effective, historical, issuedReceipt: !!issued,
      receiptAmount: issued ? n(issued.amount) : null,
      receiptProjectMatches: !issued || txt(issued.project_id) === txt(payment.project_id),
      linkedLedger: !!transaction, ledgerAmount: transaction ? n(transaction.amount) : null,
      paymentScope: txt(payment.finance_scope || "main"),
      ledgerScope: txt(transaction?.finance_scope || ""),
      ledgerProjectMatches: !transaction || !txt(transaction.project_id) || txt(transaction.project_id) === txt(payment.project_id),
      allocated };
    const issues = paymentReconciliationIssues(facts);
    for (const issue of issues) {
      const caseId = `${issue.type}:${paymentId}`;
      const fingerprint = createHash("sha256").update(JSON.stringify([
        caseId, projectCode, facts.amount, facts.effective, facts.historical, facts.issuedReceipt,
        txt(issued?.id), facts.receiptAmount, facts.receiptProjectMatches,
        facts.linkedLedger, txt(transaction?.id), facts.ledgerAmount, facts.ledgerProjectMatches,
        facts.paymentScope, facts.ledgerScope, allocated,
      ])).digest("hex");
      const entries = (auditByCase.get(caseId) || [])
        .filter(row => txt((row.details as Row | null)?.fingerprint) === fingerprint)
        .sort((a,b) => txt(a.created_at).localeCompare(txt(b.created_at)));
      const actions = entries.map(row => ({
        action: txt(row.action) === ACTION_REQUESTED ? "requested" : txt(row.action) === ACTION_REVIEWED ? "reviewed" : "rejected",
        actor: txt(row.actor_user_key), fingerprint, createdAt: txt(row.created_at),
      }));
      const state = reviewStatus(actions, fingerprint);
      const request = [...entries].reverse().find(row => txt(row.action) === ACTION_REQUESTED);
      const decision = [...entries].reverse().find(row => txt(row.action) === ACTION_REVIEWED || txt(row.action) === ACTION_REJECTED);
      cases.push({
        caseId, fingerprint, type: issue.type, severity: issue.severity, projectCode, paymentCode, paymentId,
        date: txt(payment.payment_date), amount: money(facts.amount), difference: issue.difference,
        explanation: issue.explanation, receiptStatus: issued ? "issued" : anyReceipt ? "not issued / voided" : "missing",
        ledgerReference: txt(transaction?.transaction_code || storedCode || canonicalCode),
        reviewStatus: state,
        requestedBy: txt(request?.actor_user_key), requestedAt: txt(request?.created_at),
        reviewedBy: txt(decision?.actor_user_key), reviewedAt: txt(decision?.created_at),
        reviewReason: txt((decision?.details as Row | null)?.reason, 1000),
      });
    }
  }
  const weight: Record<ReconciliationSeverity, number> = { review: 0, historical: 1, info: 2 };
  cases.sort((a,b) => weight[a.severity] - weight[b.severity] || b.date.localeCompare(a.date) || a.caseId.localeCompare(b.caseId));
  return {
    snapshotAt: new Date().toISOString(), complete: true, sizes, cases,
    summary: {
      scannedEffective, scannedHistorical,
      actionable: cases.filter(c => c.severity === "review" && c.reviewStatus !== "reviewed").length,
      historical: cases.filter(c => c.severity === "historical").length,
      advances: cases.filter(c => c.type === "unallocated_advance").length,
      pendingReview: cases.filter(c => c.reviewStatus === "pending").length,
      reviewedEvidence: cases.filter(c => c.reviewStatus === "reviewed").length,
    },
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await authenticate(request);
    return send({ success: true, data: { ...await snapshot(), permissions: { canReview: roleOf(user) === "admin" } } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Could not load reconciliation.";
    return send({ success: false, error: msg }, /session/i.test(msg) ? 401 : /access/i.test(msg) ? 403 : 503);
  }
}
export async function POST(request: NextRequest) {
  if (!originAllowed(request)) return send({ success: false, error: "Invalid request origin." }, 403);
  try {
    const user = await authenticate(request);
    const who = actor(user);
    if (!who) return send({ success: false, error: "Named employee account required." }, 403);
    const body = await request.json() as Row;
    const action = txt(body.action);
    if (!["request", "review", "reject"].includes(action)) return send({ success: false, error: "Unsupported review action." }, 400);
    const caseId = txt(body.caseId, 170);
    const fingerprint = txt(body.fingerprint, 100);
    const reason = txt(body.reason, 1200);
    if (!caseId || !/^[a-f0-9]{64}$/.test(fingerprint) || reason.length < 12)
      return send({ success: false, error: "Select a current case and provide an evidence-based reason of at least 12 characters." }, 400);
    const current = await snapshot();
    const item = current.cases.find(c => c.caseId === caseId);
    if (!item || item.fingerprint !== fingerprint) return send({
      success: false, error: "The financial snapshot changed. Refresh the reconciliation list before reviewing it.",
    }, 409);
    if (action === "request") {
      if (item.reviewStatus === "pending" || item.reviewStatus === "reviewed") return send({
        success: false, error: "This case is already pending or reviewed for the current evidence snapshot.",
      }, 409);
      const saved = await recordAuditEvent({ user, request, action: ACTION_REQUESTED,
        target: item.projectCode, entityType: "billing_reconciliation_case", entityId: caseId,
        details: { fingerprint, type: item.type, paymentCode: item.paymentCode, amount: item.amount, reason } });
      if (!saved) throw new Error("Review request was not recorded. No financial data changed.");
      return send({ success: true, data: { caseId, status: "pending" } });
    }
    if (roleOf(user) !== "admin") return send({ success: false, error: "A separate administrator must review this case." }, 403);
    if (item.reviewStatus !== "pending" || !item.requestedBy) return send({
      success: false, error: "A pending request is required for this exact financial snapshot.",
    }, 409);
    if (item.requestedBy === who) return send({ success: false, error: "The requester cannot review their own case." }, 403);
    const targetAction = action === "review" ? ACTION_REVIEWED : ACTION_REJECTED;
    const saved = await recordAuditEvent({ user, request, action: targetAction,
      target: item.projectCode, entityType: "billing_reconciliation_case", entityId: caseId,
      details: {
        fingerprint, type: item.type, paymentCode: item.paymentCode, amount: item.amount,
        reason, outcome: action === "review" ? "evidence_reviewed_no_money_changed" : "request_rejected",
      } });
    if (!saved) throw new Error("Audit review was not recorded. No financial data changed.");
    return send({ success: true, data: { caseId, status: action === "review" ? "reviewed" : "rejected" } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Could not record reconciliation review.";
    return send({ success: false, error: msg }, /session/i.test(msg) ? 401 : /access/i.test(msg) ? 403 : 503);
  }
}
