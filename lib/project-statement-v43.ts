import type { NextRequest } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { normalizeProjectCode, selectRows } from "@/lib/supabase-data";
import {
  loadReceivableAuthority, receivableNumber,
  type ReceivableCategoryKey,
} from "@/lib/billing-receivable-authority";

type Row = Record<string, unknown>;
export class ProjectStatementError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}
export type StatementInvoiceV43 = {
  billCode: string; invoiceCode: string; billDate: string; category: string;
  service: string; status: string; gross: number; directDiscount: number;
  creditNote: number; debitNote: number; net: number; allocated: number;
  invoiceDueBeforeProjectOffsets: number;
};
export type StatementPaymentV43 = {
  paymentCode: string; date: string; amount: number; method: string; reference: string;
  category: string; allocatedToInvoices: number; notAllocatedToInvoices: number;
  receiptCode: string; receiptUrl: string; receiptStatus: string; legacyManual: boolean;
};
export type StatementAdjustmentV43 = {
  code: string; date: string; billCode: string; kind: string; amount: number; reason: string;
};
export type StatementWriteoffV43 = { date: string; category: string; kind: string; amount: number };
export type ProjectStatementV43 = {
  version: "4.3"; generatedAt: string; basis: "current_snapshot"; project: {
    code: string; name: string; client: string; location: string;
  };
  totals: {
    billedNetAfterAdjustments: number; receivedPayments: number; netWriteoffs: number;
    amountDue: number; engineeringDue: number; supervisionDue: number; otherDue: number;
    invoiceUnallocated: number; remainingAdvanceAfterOffsets: number;
    invoiceDueBeforeProjectOffsets: number;
  };
  invoices: StatementInvoiceV43[];
  payments: StatementPaymentV43[];
  adjustments: StatementAdjustmentV43[];
  writeoffs: StatementWriteoffV43[];
  counts: { invoices: number; payments: number; verifiedReceipts: number; advances: number };
};
const show = (value: unknown, size = 240) => String(value ?? "").trim().slice(0, size);
const money = (value: unknown) => Math.round(Math.max(0, receivableNumber(value)) * 100) / 100;
const category = (key: ReceivableCategoryKey) => key === "engineering" ? "Engineering Bill"
  : key === "supervision" ? "Supervision Bill" : "Other Services Bill";
const normalDate = (value: unknown) => show(value, 30).slice(0, 10);
const verifyReceipt = (value: unknown) => {
  const path = show(value, 120);
  return /^\/verify\/receipt\/[A-Za-z0-9]{20,80}$/.test(path) ? path : "";
};
function clientProjectCodes(user: Row) {
  return new Set(show(user.projectIds || user.Project_IDs || user.project_ids, 5000)
    .split(/[;,\s]+/).filter(Boolean).map(normalizeProjectCode));
}

/** This is a current-status document, not a retroactively reconstructed historical balance. */
export async function buildProjectStatementV43(request: NextRequest, requestedFileId: unknown): Promise<ProjectStatementV43> {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new ProjectStatementError("Session expired.", 401);
  const role = roleOf(user);
  if (!["admin", "manager", "accounts", "client"].includes(role))
    throw new ProjectStatementError("Project statement access is not available for this role.", 403);
  const code = normalizeProjectCode(requestedFileId);
  if (!/^LV-\d{3,8}$/.test(code)) throw new ProjectStatementError("Enter a valid project File ID.", 400);
  if (role === "client" && !clientProjectCodes(user).has(code))
    throw new ProjectStatementError("This project is not linked to your account.", 403);
  const project = (await selectRows("projects", {
    select: "id,project_code,project_name,client_name_snapshot,location",
    filters: { project_code: code }, limit: 1,
  }))[0] as Row | undefined;
  if (!project?.id) throw new ProjectStatementError("Project not found.", 404);
  const projectId = show(project.id, 80);
  const [authority, receipts, adjustments, writeoffLog] = await Promise.all([
    loadReceivableAuthority({ projectId }),
    selectRows("payment_receipts", {
      select: "payment_id,receipt_code,receipt_path,status,voided_at,project_id,issued_at",
      filters: { project_id: projectId }, order: "issued_at:desc", limit: 5000,
    }),
    selectRows("billing_adjustments", {
      select: "adjustment_code,bill_code,posted_at,adjustment_type,amount,reason,status",
      filters: { project_id: projectId }, order: "posted_at:desc", limit: 5000,
    }),
    selectRows("billing_writeoff_log", {
      select: "billing_category,event_type,amount,effective_date,created_at",
      filters: { project_id: projectId }, order: "created_at:desc", limit: 5000,
    }),
  ]) as [Awaited<ReturnType<typeof loadReceivableAuthority>>, Row[], Row[], Row[]];
  if (!authority.complete || [receipts, adjustments, writeoffLog].some(rows => rows.length >= 5000))
    throw new ProjectStatementError("The financial register is too large for a certified complete statement.", 503);

  const projectState = authority.projects.get(projectId);
  const invoicesByBill = new Map(authority.invoices.filter(row => row.projectId === projectId)
    .map(row => [row.billCode, row]));
  const invoices: StatementInvoiceV43[] = authority.bills.filter(row => row.projectId === projectId).map(bill => {
    const invoice = invoicesByBill.get(bill.billCode);
    return {
      billCode: bill.billCode, invoiceCode: invoice?.invoiceCode || "",
      billDate: normalDate(bill.row.bill_date || bill.row.created_at),
      category: category(bill.category),
      service: show(bill.row.description, 250).replace(/^\[(Engineering Bill|Design Books|Other Services Bill|Supervision Bill)\]\s*/i, ""),
      status: show(invoice?.status || bill.row.status, 60),
      gross: money(bill.gross), directDiscount: money(bill.storedDiscount),
      creditNote: money(bill.creditAdjustment), debitNote: money(bill.debitAdjustment),
      net: money(bill.effectiveAmount), allocated: money(bill.allocated),
      invoiceDueBeforeProjectOffsets: money(bill.dueBeforeRelief),
    };
  }).sort((a,b) => a.billDate.localeCompare(b.billDate) || a.billCode.localeCompare(b.billCode));

  const receiptsByPayment = new Map<string, Row>();
  for (const receipt of receipts) {
    const id = show(receipt.payment_id, 80);
    // The result is already newest-first. Prefer an issued, nonvoided receipt.
    if (show(receipt.status).toLowerCase() !== "issued" || receipt.voided_at) continue;
    if (!receiptsByPayment.has(id)) receiptsByPayment.set(id, receipt);
  }
  const payments: StatementPaymentV43[] = authority.payments.filter(payment =>
    payment.projectId === projectId && payment.effective,
  ).map(payment => {
    const raw = payment.row;
    const receipt = receiptsByPayment.get(payment.paymentId);
    const verifiedPath = receipt && show(receipt.project_id) === projectId &&
      verifyReceipt(receipt.receipt_path) === verifyReceipt(raw.receipt_url)
        ? verifyReceipt(receipt.receipt_path) : "";
    return {
      paymentCode: payment.paymentCode,
      date: normalDate(raw.payment_date || raw.created_at),
      amount: money(payment.amount),
      method: show(raw.payment_method, 80),
      reference: show(raw.reference_no, 100),
      category: category(payment.category),
      allocatedToInvoices: money(payment.allocated),
      notAllocatedToInvoices: money(payment.unallocated),
      receiptCode: verifiedPath ? show(receipt?.receipt_code, 120) : "",
      receiptUrl: verifiedPath,
      receiptStatus: verifiedPath ? "Issued / verifiable" : "No online issued receipt",
      legacyManual: raw.is_legacy_manual === true,
    };
  }).sort((a,b) => a.date.localeCompare(b.date) || a.paymentCode.localeCompare(b.paymentCode));

  const activeAdjustments: StatementAdjustmentV43[] = adjustments
    .filter(row => !["void","voided","cancelled","canceled"].includes(show(row.status).toLowerCase()))
    .map(row => ({
      code: show(row.adjustment_code, 120), billCode: show(row.bill_code, 120),
      date: normalDate(row.posted_at), kind: show(row.adjustment_type, 80),
      amount: money(row.amount), reason: show(row.reason, 250),
    }));
  const writeoffs: StatementWriteoffV43[] = writeoffLog.map(row => ({
    date: normalDate(row.effective_date || row.created_at),
    category: show(row.billing_category, 100),
    kind: show(row.event_type, 80), amount: money(row.amount),
  }));
  const totals = {
    billedNetAfterAdjustments: money(projectState?.billed || 0),
    receivedPayments: money(projectState?.paid || 0),
    netWriteoffs: money(projectState?.writeoffTotal || 0),
    amountDue: money(projectState?.totalDue || 0),
    engineeringDue: money(projectState?.engineeringDue || 0),
    supervisionDue: money(projectState?.supervisionDue || 0),
    otherDue: money(projectState?.otherDue || 0),
    invoiceUnallocated: money(projectState?.rawUnallocated || 0),
    remainingAdvanceAfterOffsets: money(projectState?.remainingUnallocated || 0),
    invoiceDueBeforeProjectOffsets: money(projectState?.invoiceDueTotal || 0),
  };
  // A deliberately conservative verification: the statement must agree with
  // the one receivables authority, not recompute the customer due separately.
  const paymentTotal = money(payments.reduce((sum,row) => sum + row.amount, 0));
  const billedTotal = money(invoices.reduce((sum,row) => sum + row.net, 0));
  if (Math.abs(paymentTotal - totals.receivedPayments) > .011 ||
      Math.abs(billedTotal - totals.billedNetAfterAdjustments) > .011) {
    throw new ProjectStatementError("Statement figures did not reconcile with the financial authority. No document was issued.", 503);
  }
  return {
    version: "4.3", generatedAt: new Date().toISOString(), basis: "current_snapshot",
    project: {
      code, name: show(project.project_name, 220), client: show(project.client_name_snapshot, 220),
      location: show(project.location, 250),
    },
    totals, invoices, payments, adjustments: activeAdjustments, writeoffs,
    counts: {
      invoices: invoices.length, payments: payments.length,
      verifiedReceipts: payments.filter(row => !!row.receiptUrl).length,
      advances: payments.filter(row => row.notAllocatedToInvoices > .009).length,
    },
  };
}
