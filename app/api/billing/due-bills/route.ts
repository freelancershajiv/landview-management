import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { roleOf, selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FINANCE_ROLES = new Set(["admin", "manager", "accounts", "employee"]);
const CATEGORY_KEYS: CategoryKey[] = ["engineering", "supervision", "other"];
type CategoryKey = "engineering" | "supervision" | "other";
type CategoryAmounts = Record<CategoryKey, number>;
type Row = Record<string, any>;
type AdjustmentAmounts = { debit: number; credit: number };

function text(value: unknown) { return String(value ?? "").trim(); }
function num(value: unknown) {
  const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function normStatus(value: unknown) {
  return text(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}
function categoryOf(value: unknown): CategoryKey {
  const raw = text(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (raw.includes("supervision")) return "supervision";
  if (/other|soil|survey|municipality|file pass/.test(raw)) return "other";
  return "engineering";
}
function activeInvoice(row: Row) {
  const status = normStatus(row.status);
  return !new Set(["draft", "cancelled", "canceled", "void", "voided", "rejected"]).has(status);
}
function activeBill(row: Row) {
  const status = normStatus(row.status);
  return !new Set(["draft", "cancelled", "canceled", "void", "voided", "rejected"]).has(status);
}
function activePayment(row: Row) {
  if (text(row.transaction_type).toLowerCase() === "personal income" || row.affects_business_balance === false) return false;
  const status = normStatus(row.approval_status || row.status);
  return !status || ["approved", "received", "paid", "verified", "complete", "completed", "full paid", "fully paid", "posted"].includes(status);
}
function adjustmentMirrorBill(row: Row | undefined) {
  const source = text(row?.created_via).toLowerCase();
  return source.includes("credit note") || source.includes("debit note");
}
function settledBill(row: Row | undefined) {
  if (!row) return false;
  return ["paid", "full paid", "fully paid"].includes(normStatus(row.status));
}
function storedBillNet(row: Row | undefined) {
  if (!row) return 0;
  if (row.net_amount !== undefined && row.net_amount !== null && text(row.net_amount) !== "") return Math.max(0, num(row.net_amount));
  return Math.max(0, num(row.amount) - num(row.discount));
}
function emptyAmounts(): CategoryAmounts { return { engineering: 0, supervision: 0, other: 0 }; }
function reduceAmounts(amounts: CategoryAmounts, reduction: number, preferred: CategoryAmounts = emptyAmounts()) {
  let remaining = Math.max(0, reduction);
  for (const key of CATEGORY_KEYS) {
    if (remaining <= 0.009) break;
    const preferredReduction = Math.min(amounts[key], preferred[key], remaining);
    amounts[key] -= preferredReduction;
    remaining -= preferredReduction;
  }
  if (remaining > 0.009) {
    const byLargestDue = [...CATEGORY_KEYS].sort((a, b) => amounts[b] - amounts[a]);
    for (const key of byLargestDue) {
      if (remaining <= 0.009) break;
      const applied = Math.min(amounts[key], remaining);
      amounts[key] -= applied;
      remaining -= applied;
    }
  }
  return Math.max(0, reduction - remaining);
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!FINANCE_ROLES.has(roleOf(user))) return NextResponse.json({ success: false, error: "Finance access is required." }, { status: 403 });

    const [projects, invoices, bills, adjustments, payments, writeoffs] = await Promise.all([
      selectRows("projects", { select: "id,project_code,project_name,client_name_snapshot,phone_number_snapshot,location", limit: 5000 }),
      selectRows("invoices", { select: "id,project_id,invoice_code,bill_code,category,amount,paid_amount_snapshot,due_amount_snapshot,status", limit: 5000 }),
      selectRows("bills", { select: "id,project_id,bill_code,billing_category,category,amount,discount,net_amount,status,created_via", limit: 5000 }),
      selectRows("billing_adjustments", { select: "bill_code,adjustment_type,amount,status", limit: 5000 }),
      selectRows("payments", { select: "id,project_id,payment_code,payment_date,amount,status,approval_status,transaction_type,affects_business_balance,payment_for,income_category,invoice_unallocated_amount,invoice_allocation_status,created_at", limit: 5000 }),
      selectRows("billing_writeoff_log", { select: "project_id,billing_category,event_type,amount,effective_date,created_at", order: "created_at:asc", limit: 5000 }),
    ]);

    const billByCode = new Map<string, Row>();
    for (const bill of bills) {
      const code = text(bill.bill_code);
      if (code) billByCode.set(code, bill);
    }

    const adjustmentByBill = new Map<string, AdjustmentAmounts>();
    for (const adjustment of adjustments) {
      if (text(adjustment.status).toLowerCase() === "void") continue;
      const code = text(adjustment.bill_code);
      if (!code) continue;
      const current = adjustmentByBill.get(code) || { debit: 0, credit: 0 };
      const amount = Math.max(0, num(adjustment.amount));
      if (text(adjustment.adjustment_type) === "Debit Note") current.debit += amount;
      else if (text(adjustment.adjustment_type) === "Credit Note") current.credit += amount;
      adjustmentByBill.set(code, current);
    }

    const projectBilledMap = new Map<string, number>();
    for (const bill of bills) {
      if (!activeBill(bill) || adjustmentMirrorBill(bill)) continue;
      const projectId = text(bill.project_id);
      if (!projectId) continue;
      const adjustment = adjustmentByBill.get(text(bill.bill_code)) || { debit: 0, credit: 0 };
      const effectiveAmount = Math.max(0, storedBillNet(bill) + adjustment.debit - adjustment.credit);
      projectBilledMap.set(projectId, (projectBilledMap.get(projectId) || 0) + effectiveAmount);
    }

    const invoiceMap = new Map<string, Row[]>();
    for (const invoice of invoices) {
      if (!activeInvoice(invoice)) continue;
      const bill = billByCode.get(text(invoice.bill_code));
      // A settled bill is authoritative. Older/imported invoice snapshots can remain
      // PARTIALLY PAID even after the underlying bill has been fully settled.
      if (adjustmentMirrorBill(bill) || settledBill(bill)) continue;
      const key = text(invoice.project_id);
      const list = invoiceMap.get(key) || [];
      list.push(invoice);
      invoiceMap.set(key, list);
    }

    const paymentMap = new Map<string, Row[]>();
    for (const payment of payments) {
      if (!activePayment(payment)) continue;
      const key = text(payment.project_id);
      const list = paymentMap.get(key) || [];
      list.push(payment);
      paymentMap.set(key, list);
    }

    const writeoffMap = new Map<string, CategoryAmounts>();
    for (const event of writeoffs) {
      const projectId = text(event.project_id);
      if (!projectId) continue;
      const current = writeoffMap.get(projectId) || emptyAmounts();
      const category = categoryOf(event.billing_category);
      const amount = Math.abs(num(event.amount));
      const eventType = text(event.event_type).toLowerCase().replace(/\s+/g, "_");
      if (eventType === "write_off") current[category] += amount;
      if (eventType === "recovery") current[category] = Math.max(0, current[category] - amount);
      writeoffMap.set(projectId, current);
    }

    const rows = projects.map((project) => {
      const projectUuid = text(project.id);
      const categoryDue = emptyAmounts();
      let openInvoiceCount = 0;
      let invoiceDueTotal = 0;

      for (const invoice of invoiceMap.get(projectUuid) || []) {
        const billCode = text(invoice.bill_code);
        const bill = billByCode.get(billCode);
        const adjustment = adjustmentByBill.get(billCode) || { debit: 0, credit: 0 };
        const effectiveAmount = Math.max(0, storedBillNet(bill) + adjustment.debit - adjustment.credit);
        const paid = Math.max(0, num(invoice.paid_amount_snapshot));
        const due = Math.max(0, effectiveAmount - Math.min(effectiveAmount, paid));
        if (due <= 0.009) continue;
        categoryDue[categoryOf(bill?.billing_category || bill?.category || invoice.category)] += due;
        invoiceDueTotal += due;
        openInvoiceCount += 1;
      }

      const written = writeoffMap.get(projectUuid) || emptyAmounts();
      const collectible: CategoryAmounts = {
        engineering: Math.max(0, categoryDue.engineering - written.engineering),
        supervision: Math.max(0, categoryDue.supervision - written.supervision),
        other: Math.max(0, categoryDue.other - written.other),
      };

      let unallocatedAmount = 0;
      const unallocatedByCategory = emptyAmounts();
      let activePaymentTotal = 0;
      let lastPaymentDate = "";
      let lastPaymentAmount = 0;
      let lastStamp = -1;
      for (const payment of paymentMap.get(projectUuid) || []) {
        activePaymentTotal += Math.max(0, num(payment.amount));
        const unallocated = Math.max(0, num(payment.invoice_unallocated_amount));
        unallocatedAmount += unallocated;
        if (unallocated > 0.009) {
          unallocatedByCategory[categoryOf(payment.income_category || payment.payment_for)] += unallocated;
        }
        const paymentDate = text(payment.payment_date || payment.created_at);
        const stamp = paymentDate ? new Date(paymentDate).getTime() : 0;
        if (Number.isFinite(stamp) && stamp >= lastStamp) {
          lastStamp = stamp;
          lastPaymentDate = paymentDate;
          lastPaymentAmount = Math.max(0, num(payment.amount));
        }
      }

      // Invoice allocations remain the first source of truth, but approved money that is
      // still unallocated must not make the project look more collectible than it is.
      const appliedUnallocated = reduceAmounts(collectible, unallocatedAmount, unallocatedByCategory);
      const remainingUnallocated = Math.max(0, unallocatedAmount - appliedUnallocated);

      const writeoffTotal = written.engineering + written.supervision + written.other;
      const projectBilledTotal = projectBilledMap.get(projectUuid) || 0;
      const projectBalanceDue = Math.max(0, projectBilledTotal - activePaymentTotal - writeoffTotal);
      const collectibleBeforeCap = collectible.engineering + collectible.supervision + collectible.other;
      if (collectibleBeforeCap > projectBalanceDue + 0.009) {
        reduceAmounts(collectible, collectibleBeforeCap - projectBalanceDue);
      }

      const totalDue = collectible.engineering + collectible.supervision + collectible.other;
      return {
        projectId: text(project.project_code),
        projectName: text(project.project_name),
        clientName: text(project.client_name_snapshot),
        phone: text(project.phone_number_snapshot),
        address: text(project.location),
        engineeringDue: collectible.engineering,
        supervisionDue: collectible.supervision,
        otherDue: collectible.other,
        totalDue,
        invoiceDueTotal,
        writeoffTotal,
        unallocatedAmount: remainingUnallocated,
        openInvoiceCount,
        lastPaymentDate,
        lastPaymentAmount,
      };
    }).filter((row) => row.totalDue > 0.009)
      .sort((a, b) => b.totalDue - a.totalDue || a.projectId.localeCompare(b.projectId, undefined, { numeric: true }));

    const totals = rows.reduce((sum, row) => ({
      engineering: sum.engineering + row.engineeringDue,
      supervision: sum.supervision + row.supervisionDue,
      other: sum.other + row.otherDue,
      total: sum.total + row.totalDue,
      unallocated: sum.unallocated + row.unallocatedAmount,
    }), { engineering: 0, supervision: 0, other: 0, total: 0, unallocated: 0 });

    return NextResponse.json({ success: true, data: { rows, totals } }, {
      headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "project-balance-capped-invoice-truth" },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load due bills." }, {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
