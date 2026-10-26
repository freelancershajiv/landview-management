import { selectRows } from "@/lib/supabase-data";

type Row = Record<string, any>;
export type ReceivableCategoryKey = "engineering" | "supervision" | "other";
export type ReceivableCategoryAmounts = Record<ReceivableCategoryKey, number>;
type AdjustmentAmounts = { debit: number; credit: number };

const CATEGORY_KEYS: ReceivableCategoryKey[] = ["engineering", "supervision", "other"];
const INACTIVE = new Set(["draft", "cancelled", "canceled", "void", "voided", "rejected", "returned"]);
const PAYMENT_OK = new Set(["approved", "received", "paid", "verified", "complete", "completed", "full paid", "fully paid", "posted"]);
const SETTLED = new Set(["paid", "full paid", "fully paid", "settled", "complete", "completed"]);

export function receivableText(value: unknown) {
  return String(value ?? "").trim();
}
export function receivableNumber(value: unknown) {
  const n = Number(receivableText(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
export function receivableStatus(value: unknown) {
  return receivableText(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}
export function receivableCategory(value: unknown): ReceivableCategoryKey {
  const raw = receivableStatus(value);
  if (raw.includes("supervision")) return "supervision";
  if (/other|soil|survey|municipality|file pass/.test(raw)) return "other";
  return "engineering";
}
export function emptyReceivableAmounts(): ReceivableCategoryAmounts {
  return { engineering: 0, supervision: 0, other: 0 };
}
export function receivableBillIsActive(row: Row | undefined) {
  return !!row && !INACTIVE.has(receivableStatus(row.status));
}
export function receivableInvoiceIsActive(row: Row | undefined) {
  return !!row && !INACTIVE.has(receivableStatus(row.status));
}
export function receivableBillIsSettled(row: Row | undefined) {
  return !!row && SETTLED.has(receivableStatus(row.status));
}
export function receivableAdjustmentMirror(row: Row | undefined) {
  const source = receivableText(row?.created_via).toLowerCase();
  return source.includes("credit note") || source.includes("debit note");
}
export function receivablePaymentIsEffective(row: Row | undefined) {
  if (!row) return false;
  if (receivableStatus(row.transaction_type) === "personal income" || row.affects_business_balance === false) return false;
  const rowStatus = receivableStatus(row.status);
  const approvalStatus = receivableStatus(row.approval_status);
  // A terminal transaction status always wins over an older approval snapshot.
  if (INACTIVE.has(rowStatus) || INACTIVE.has(approvalStatus)) return false;
  const status = approvalStatus || rowStatus;
  return !status || PAYMENT_OK.has(status);
}
export function receivableStoredBillNet(row: Row | undefined) {
  if (!row) return 0;
  if (row.net_amount !== undefined && row.net_amount !== null && receivableText(row.net_amount) !== "") {
    return Math.max(0, receivableNumber(row.net_amount));
  }
  return Math.max(0, receivableNumber(row.amount) - receivableNumber(row.discount));
}
export function reduceReceivableAmounts(
  amounts: ReceivableCategoryAmounts,
  reduction: number,
  preferred: ReceivableCategoryAmounts = emptyReceivableAmounts(),
) {
  let remaining = Math.max(0, reduction);
  for (const key of CATEGORY_KEYS) {
    if (remaining <= 0.009) break;
    const applied = Math.min(amounts[key], preferred[key], remaining);
    amounts[key] -= applied;
    remaining -= applied;
  }
  if (remaining > 0.009) {
    const byLargest = [...CATEGORY_KEYS].sort((a, b) => amounts[b] - amounts[a]);
    for (const key of byLargest) {
      if (remaining <= 0.009) break;
      const applied = Math.min(amounts[key], remaining);
      amounts[key] -= applied;
      remaining -= applied;
    }
  }
  return Math.max(0, reduction - remaining);
}

export type BillReceivableState = {
  billId: string;
  billCode: string;
  projectId: string;
  category: ReceivableCategoryKey;
  gross: number;
  storedDiscount: number;
  creditAdjustment: number;
  debitAdjustment: number;
  effectiveDiscount: number;
  effectiveAmount: number;
  allocated: number;
  paidForReceivable: number;
  dueBeforeRelief: number;
  settled: boolean;
  invoiceIds: string[];
  row: Row;
};

export type InvoiceReceivableState = {
  invoiceId: string;
  invoiceCode: string;
  billCode: string;
  projectId: string;
  category: ReceivableCategoryKey;
  amount: number;
  allocated: number;
  dueBeforeRelief: number;
  settledByBill: boolean;
  status: string;
  row: Row;
};

export type PaymentReceivableState = {
  paymentId: string;
  paymentCode: string;
  projectId: string;
  category: ReceivableCategoryKey;
  amount: number;
  allocated: number;
  unallocated: number;
  effective: boolean;
  row: Row;
};

export type ProjectReceivableState = {
  projectId: string;
  billed: number;
  paid: number;
  invoiceDueTotal: number;
  engineeringDue: number;
  supervisionDue: number;
  otherDue: number;
  totalDue: number;
  writeoffByCategory: ReceivableCategoryAmounts;
  writeoffTotal: number;
  rawUnallocated: number;
  remainingUnallocated: number;
  openInvoiceCount: number;
  lastPaymentDate: string;
  lastPaymentAmount: number;
};

export type ReceivableAuthority = {
  projects: Map<string, ProjectReceivableState>;
  bills: BillReceivableState[];
  billByCode: Map<string, BillReceivableState>;
  billById: Map<string, BillReceivableState>;
  invoices: InvoiceReceivableState[];
  payments: PaymentReceivableState[];
  totals: {
    billed: number;
    paid: number;
    due: number;
    engineeringDue: number;
    supervisionDue: number;
    otherDue: number;
    writeoff: number;
    rawUnallocated: number;
    remainingUnallocated: number;
  };
};

function scopedOptions(projectId: string | undefined, select: string, limit = 10000) {
  return projectId
    ? { select, filters: { project_id: projectId }, limit }
    : { select, limit };
}

export async function loadReceivableAuthority(options: { projectId?: string } = {}): Promise<ReceivableAuthority> {
  const projectId = receivableText(options.projectId) || undefined;
  const [bills, invoices, payments, allocations, adjustments, writeoffs] = await Promise.all([
    selectRows("bills", scopedOptions(projectId, "id,project_id,bill_code,billing_category,category,description,amount,discount,net_amount,status,created_via,bill_date,created_at")),
    selectRows("invoices", scopedOptions(projectId, "id,project_id,invoice_code,invoice_no,bill_code,category,amount,status,issue_date,due_date,created_at")),
    selectRows("payments", scopedOptions(projectId, "id,project_id,payment_code,payment_date,amount,status,approval_status,transaction_type,affects_business_balance,payment_for,income_category,service_type,receipt_url,payment_method,reference_no,created_at")),
    selectRows("payment_invoice_allocations", scopedOptions(projectId, "id,payment_id,invoice_id,project_id,allocated_amount", 20000)),
    selectRows("billing_adjustments", scopedOptions(projectId, "id,project_id,bill_id,bill_code,adjustment_type,amount,status", 10000)),
    selectRows("billing_writeoff_log", scopedOptions(projectId, "id,project_id,billing_category,event_type,amount,effective_date,created_at", 10000)),
  ]);

  const sourceBillById = new Map<string, Row>();
  const sourceBillByCode = new Map<string, Row>();
  for (const bill of bills) {
    if (receivableText(bill.id)) sourceBillById.set(receivableText(bill.id), bill);
    if (receivableText(bill.bill_code)) sourceBillByCode.set(receivableText(bill.bill_code), bill);
  }

  const adjustmentByBill = new Map<string, AdjustmentAmounts>();
  for (const adjustment of adjustments) {
    if (INACTIVE.has(receivableStatus(adjustment.status))) continue;
    const original = sourceBillById.get(receivableText(adjustment.bill_id));
    const code = receivableText(adjustment.bill_code || original?.bill_code);
    if (!code) continue;
    const current = adjustmentByBill.get(code) || { debit: 0, credit: 0 };
    const amount = Math.max(0, receivableNumber(adjustment.amount));
    const type = receivableStatus(adjustment.adjustment_type);
    if (type === "debit note") current.debit += amount;
    if (type === "credit note") current.credit += amount;
    adjustmentByBill.set(code, current);
  }

  const activeInvoices = invoices.filter(receivableInvoiceIsActive);
  const invoiceById = new Map(activeInvoices.map((row: Row) => [receivableText(row.id), row]));
  const invoicesByBill = new Map<string, Row[]>();
  for (const invoice of activeInvoices) {
    const code = receivableText(invoice.bill_code);
    if (!code) continue;
    const list = invoicesByBill.get(code) || [];
    list.push(invoice);
    invoicesByBill.set(code, list);
  }

  const paymentRowById = new Map(payments.map((row: Row) => [receivableText(row.id), row]));
  const allocationByInvoice = new Map<string, number>();
  const allocationByPayment = new Map<string, number>();
  for (const allocation of allocations) {
    const payment = paymentRowById.get(receivableText(allocation.payment_id));
    if (payment && !receivablePaymentIsEffective(payment)) continue;
    const invoice = invoiceById.get(receivableText(allocation.invoice_id));
    if (!invoice) continue;
    const amount = Math.max(0, receivableNumber(allocation.allocated_amount));
    const invoiceId = receivableText(invoice.id);
    allocationByInvoice.set(invoiceId, (allocationByInvoice.get(invoiceId) || 0) + amount);
    const paymentId = receivableText(allocation.payment_id);
    if (paymentId) allocationByPayment.set(paymentId, (allocationByPayment.get(paymentId) || 0) + amount);
  }

  const billStates: BillReceivableState[] = [];
  const billByCode = new Map<string, BillReceivableState>();
  const billById = new Map<string, BillReceivableState>();
  for (const bill of bills) {
    if (!receivableBillIsActive(bill) || receivableAdjustmentMirror(bill)) continue;
    const billCode = receivableText(bill.bill_code);
    const billId = receivableText(bill.id);
    const adjustment = adjustmentByBill.get(billCode) || { debit: 0, credit: 0 };
    const gross = Math.max(0, receivableNumber(bill.amount));
    const storedDiscount = Math.max(0, receivableNumber(bill.discount));
    const effectiveAmount = Math.max(0, receivableStoredBillNet(bill) + adjustment.debit - adjustment.credit);
    const invoiceRows = invoicesByBill.get(billCode) || [];
    const allocated = invoiceRows.reduce((sum, invoice) => sum + (allocationByInvoice.get(receivableText(invoice.id)) || 0), 0);
    const settled = receivableBillIsSettled(bill);
    const paidForReceivable = settled ? effectiveAmount : Math.min(effectiveAmount, allocated);
    const dueBeforeRelief = settled ? 0 : Math.max(0, effectiveAmount - paidForReceivable);
    const state: BillReceivableState = {
      billId,
      billCode,
      projectId: receivableText(bill.project_id),
      category: receivableCategory(bill.billing_category || bill.category),
      gross,
      storedDiscount,
      creditAdjustment: adjustment.credit,
      debitAdjustment: adjustment.debit,
      effectiveDiscount: Math.max(0, storedDiscount + adjustment.credit),
      effectiveAmount,
      allocated,
      paidForReceivable,
      dueBeforeRelief,
      settled,
      invoiceIds: invoiceRows.map((row) => receivableText(row.id)).filter(Boolean),
      row: bill,
    };
    billStates.push(state);
    if (billCode) billByCode.set(billCode, state);
    if (billId) billById.set(billId, state);
  }

  const invoiceStates: InvoiceReceivableState[] = activeInvoices
    .filter((invoice: Row) => {
      const bill = sourceBillByCode.get(receivableText(invoice.bill_code));
      return !bill || (receivableBillIsActive(bill) && !receivableAdjustmentMirror(bill));
    })
    .map((invoice: Row) => {
      const billState = billByCode.get(receivableText(invoice.bill_code));
      const amount = billState?.effectiveAmount ?? Math.max(0, receivableNumber(invoice.amount));
      const allocated = Math.min(amount, allocationByInvoice.get(receivableText(invoice.id)) || 0);
      const settledByBill = !!billState?.settled;
      return {
        invoiceId: receivableText(invoice.id),
        invoiceCode: receivableText(invoice.invoice_code || invoice.invoice_no),
        billCode: receivableText(invoice.bill_code),
        projectId: receivableText(invoice.project_id),
        category: billState?.category || receivableCategory(invoice.category),
        amount,
        allocated,
        dueBeforeRelief: settledByBill ? 0 : Math.max(0, amount - allocated),
        settledByBill,
        status: receivableText(invoice.status),
        row: invoice,
      };
    });

  const paymentStates: PaymentReceivableState[] = payments.map((payment: Row) => {
    const effective = receivablePaymentIsEffective(payment);
    const amount = Math.max(0, receivableNumber(payment.amount));
    const allocated = effective ? Math.min(amount, allocationByPayment.get(receivableText(payment.id)) || 0) : 0;
    return {
      paymentId: receivableText(payment.id),
      paymentCode: receivableText(payment.payment_code),
      projectId: receivableText(payment.project_id),
      category: receivableCategory(payment.income_category || payment.payment_for),
      amount,
      allocated,
      unallocated: effective ? Math.max(0, amount - allocated) : 0,
      effective,
      row: payment,
    };
  });

  const writeoffSignedByProject = new Map<string, ReceivableCategoryAmounts>();
  for (const event of writeoffs) {
    const id = receivableText(event.project_id);
    if (!id) continue;
    const current = writeoffSignedByProject.get(id) || emptyReceivableAmounts();
    const category = receivableCategory(event.billing_category);
    const amount = Math.abs(receivableNumber(event.amount));
    const type = receivableStatus(event.event_type).replace(/\s+/g, "_");
    if (type === "write_off") current[category] += amount;
    if (type === "recovery") current[category] -= amount;
    writeoffSignedByProject.set(id, current);
  }

  const projectIds = new Set<string>();
  for (const bill of billStates) if (bill.projectId) projectIds.add(bill.projectId);
  for (const payment of paymentStates) if (payment.projectId) projectIds.add(payment.projectId);
  for (const invoice of invoiceStates) if (invoice.projectId) projectIds.add(invoice.projectId);
  for (const id of writeoffSignedByProject.keys()) projectIds.add(id);

  const projects = new Map<string, ProjectReceivableState>();
  for (const id of projectIds) {
    const projectBills = billStates.filter((row) => row.projectId === id);
    const projectPayments = paymentStates.filter((row) => row.projectId === id && row.effective);
    const categoryDue = emptyReceivableAmounts();
    let openInvoiceCount = 0;
    for (const bill of projectBills) {
      if (bill.dueBeforeRelief <= 0.009) continue;
      categoryDue[bill.category] += bill.dueBeforeRelief;
      openInvoiceCount += 1;
    }
    const invoiceDueTotal = CATEGORY_KEYS.reduce((sum, key) => sum + categoryDue[key], 0);
    const signedWriteoff = writeoffSignedByProject.get(id) || emptyReceivableAmounts();
    const writeoffByCategory: ReceivableCategoryAmounts = {
      engineering: Math.max(0, signedWriteoff.engineering),
      supervision: Math.max(0, signedWriteoff.supervision),
      other: Math.max(0, signedWriteoff.other),
    };
    const collectible: ReceivableCategoryAmounts = {
      engineering: Math.max(0, categoryDue.engineering - writeoffByCategory.engineering),
      supervision: Math.max(0, categoryDue.supervision - writeoffByCategory.supervision),
      other: Math.max(0, categoryDue.other - writeoffByCategory.other),
    };

    const unallocatedByCategory = emptyReceivableAmounts();
    let rawUnallocated = 0;
    let paid = 0;
    let lastPaymentDate = "";
    let lastPaymentAmount = 0;
    let lastStamp = -1;
    for (const payment of projectPayments) {
      paid += payment.amount;
      rawUnallocated += payment.unallocated;
      unallocatedByCategory[payment.category] += payment.unallocated;
      const value = receivableText(payment.row.payment_date || payment.row.created_at);
      const stamp = value ? new Date(value).getTime() : 0;
      if (Number.isFinite(stamp) && stamp >= lastStamp) {
        lastStamp = stamp;
        lastPaymentDate = value;
        lastPaymentAmount = payment.amount;
      }
    }

    const billed = projectBills.reduce((sum, row) => sum + row.effectiveAmount, 0);
    const writeoffTotal = CATEGORY_KEYS.reduce((sum, key) => sum + writeoffByCategory[key], 0);
    const projectBalanceDue = Math.max(0, billed - paid - writeoffTotal);
    const beforeCap = CATEGORY_KEYS.reduce((sum, key) => sum + collectible[key], 0);
    const requiredReduction = Math.max(0, beforeCap - projectBalanceDue);
    const appliedUnallocated = requiredReduction > 0.009
      ? reduceReceivableAmounts(collectible, requiredReduction, unallocatedByCategory)
      : 0;
    const remainingUnallocated = Math.max(0, rawUnallocated - Math.min(rawUnallocated, appliedUnallocated));
    const totalDue = CATEGORY_KEYS.reduce((sum, key) => sum + collectible[key], 0);

    projects.set(id, {
      projectId: id,
      billed,
      paid,
      invoiceDueTotal,
      engineeringDue: collectible.engineering,
      supervisionDue: collectible.supervision,
      otherDue: collectible.other,
      totalDue,
      writeoffByCategory,
      writeoffTotal,
      rawUnallocated,
      remainingUnallocated,
      openInvoiceCount,
      lastPaymentDate,
      lastPaymentAmount,
    });
  }

  const totals = [...projects.values()].reduce((sum, row) => ({
    billed: sum.billed + row.billed,
    paid: sum.paid + row.paid,
    due: sum.due + row.totalDue,
    engineeringDue: sum.engineeringDue + row.engineeringDue,
    supervisionDue: sum.supervisionDue + row.supervisionDue,
    otherDue: sum.otherDue + row.otherDue,
    writeoff: sum.writeoff + row.writeoffTotal,
    rawUnallocated: sum.rawUnallocated + row.rawUnallocated,
    remainingUnallocated: sum.remainingUnallocated + row.remainingUnallocated,
  }), {
    billed: 0,
    paid: 0,
    due: 0,
    engineeringDue: 0,
    supervisionDue: 0,
    otherDue: 0,
    writeoff: 0,
    rawUnallocated: 0,
    remainingUnallocated: 0,
  });

  return { projects, bills: billStates, billByCode, billById, invoices: invoiceStates, payments: paymentStates, totals };
}
