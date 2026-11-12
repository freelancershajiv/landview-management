import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { selectRows } from "@/lib/supabase-data";
import { receivablePaymentIsEffective } from "@/lib/billing-receivable-authority";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
type Exception = {
  type: "paid_allocation_gap" | "missing_invoice" | "invoice_missing_bill" | "allocation_reference" | "payment_overallocated";
  projectCode: string;
  billCode: string;
  paymentCode: string;
  amount: number;
  explanation: string;
  source?: string;
};
const LIMIT = 5000;
const INACTIVE = new Set(["draft", "void", "voided", "cancelled", "canceled", "rejected", "returned"]);
const text = (value: unknown) => String(value ?? "").trim();
const num = (value: unknown) => { const n = Number(value); return Number.isFinite(n) ? n : 0; };
const money = (value: number) => Math.round(value * 100) / 100;

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!["admin", "manager", "accounts"].includes(roleOf(user))) {
      return NextResponse.json({ success: false, error: "Accounts permission is required." }, { status: 403 });
    }

    const [projects, bills, invoices, payments, allocations] = await Promise.all([
      selectRows("projects", { select: "id,project_code", limit: LIMIT }),
      selectRows("bills", { select: "id,bill_code,project_id,amount,discount,net_amount,status,created_via", limit: LIMIT }),
      selectRows("invoices", { select: "id,project_id,bill_code,invoice_code,status", limit: LIMIT }),
      selectRows("payments", { select: "id,project_id,payment_code,amount,status,approval_status,transaction_type,affects_business_balance", limit: LIMIT }),
      selectRows("payment_invoice_allocations", { select: "id,project_id,payment_id,invoice_id,allocated_amount", limit: LIMIT }),
    ]) as Row[][];

    const complete = [projects, bills, invoices, payments, allocations].every((rows) => rows.length < LIMIT);
    const projectCodes = new Map(projects.map((p) => [text(p.id), text(p.project_code)]));
    const invoiceById = new Map(invoices.map((i) => [text(i.id), i]));
    const paymentById = new Map(payments.map((p) => [text(p.id), p]));
    const invoiceByKey = new Map(invoices.map((i) => [`${text(i.project_id)}:${text(i.bill_code).toLowerCase()}`, i]));
    const billByKey = new Map(bills.map((b) => [`${text(b.project_id)}:${text(b.bill_code).toLowerCase()}`, b]));

    const exceptions: Exception[] = [];
    const counts = {
      missingInvoice: 0, invoiceMissingBill: 0, paidAllocationGap: 0,
      paymentOverallocated: 0, allocationReference: 0,
    };
    const allocatedByInvoice = new Map<string, number>();
    const allocatedByPayment = new Map<string, number>();
    const add = (entry: Exception, count: keyof typeof counts) => {
      counts[count] += 1;
      exceptions.push(entry);
    };

    for (const a of allocations) {
      const paymentId = text(a.payment_id), invoiceId = text(a.invoice_id);
      const pay = paymentById.get(paymentId), invoice = invoiceById.get(invoiceId);
      const amount = Math.max(0, num(a.allocated_amount));
      if (!pay || !invoice || pay.project_id !== invoice.project_id ||
        (a.project_id && (a.project_id !== pay.project_id || a.project_id !== invoice.project_id))) {
        add({
          type: "allocation_reference",
          projectCode: projectCodes.get(text(a.project_id)) || "",
          billCode: text(invoice?.bill_code), paymentCode: text(pay?.payment_code),
          amount, explanation: "Allocation is missing a linked payment/invoice or crosses project boundaries.",
        }, "allocationReference");
        continue;
      }
      if (!receivablePaymentIsEffective(pay)) continue;
      allocatedByInvoice.set(invoiceId, (allocatedByInvoice.get(invoiceId) || 0) + amount);
      allocatedByPayment.set(paymentId, (allocatedByPayment.get(paymentId) || 0) + amount);
    }

    for (const b of bills) {
      const status = text(b.status).toLowerCase();
      const billCode = text(b.bill_code);
      const projectCode = projectCodes.get(text(b.project_id)) || "";
      const invoice = invoiceByKey.get(`${text(b.project_id)}:${billCode.toLowerCase()}`);
      if (!invoice && !INACTIVE.has(status)) {
        add({ type: "missing_invoice", projectCode, billCode, paymentCode: "", amount: num(b.net_amount),
          explanation: "This issued bill has no linked invoice record." }, "missingInvoice");
      }
      // This is a reconciliation exception, NOT an assertion that the client owes money.
      // Legacy/externally posted payments and financial adjustments require manual review.
      if (status === "paid" && invoice) {
        const net = Math.max(0, num(b.net_amount ?? (num(b.amount) - num(b.discount))));
        const allocated = allocatedByInvoice.get(text(invoice.id)) || 0;
        if (net > 0.009 && allocated + 0.01 < net) {
          add({
            type: "paid_allocation_gap", projectCode, billCode, paymentCode: "",
            amount: money(net - allocated),
            source: text(b.created_via) || "Unclassified",
            explanation: "Bill is marked Paid but invoice allocation is lower than its recorded net. Check historical payments and adjustments before correction.",
          }, "paidAllocationGap");
        }
      }
    }

    for (const invoice of invoices) {
      if (!billByKey.has(`${text(invoice.project_id)}:${text(invoice.bill_code).toLowerCase()}`)) {
        add({
          type: "invoice_missing_bill", projectCode: projectCodes.get(text(invoice.project_id)) || "",
          billCode: text(invoice.bill_code), paymentCode: "", amount: 0,
          explanation: "Invoice has no matching bill under the same project.",
        }, "invoiceMissingBill");
      }
    }

    for (const payment of payments) {
      const allocated = allocatedByPayment.get(text(payment.id)) || 0;
      const total = Math.max(0, num(payment.amount));
      if (allocated > total + 0.01) {
        add({
          type: "payment_overallocated", projectCode: projectCodes.get(text(payment.project_id)) || "",
          billCode: "", paymentCode: text(payment.payment_code), amount: money(allocated - total),
          explanation: "More effective allocations than payment amount; check for duplicate allocations.",
        }, "paymentOverallocated");
      }
    }

    exceptions.sort((a, b) => b.amount - a.amount || a.projectCode.localeCompare(b.projectCode));
    return NextResponse.json({
      success: true,
      data: {
        snapshotAt: new Date().toISOString(), complete, counts,
        scanned: { projects: projects.length, bills: bills.length, invoices: invoices.length, payments: payments.length, allocations: allocations.length },
        allocationGapTotal: money(exceptions.filter((e) => e.type === "paid_allocation_gap").reduce((sum, row) => sum + row.amount, 0)),
        exceptions: exceptions.slice(0, 250),
        exceptionCount: exceptions.length,
        sourceBreakdown: Object.values(exceptions.filter((row) => row.type === "paid_allocation_gap").reduce((groups, row) => {
          const source = row.source || "Unclassified";
          const group = groups[source] || { source, count: 0, gap: 0 };
          group.count += 1;
          group.gap = money(group.gap + row.amount);
          groups[source] = group;
          return groups;
        }, {} as Record<string, { source: string; count: number; gap: number }>)).sort((a, b) => b.gap - a.gap),
      },
    }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not run billing integrity check.";
    return NextResponse.json({ success: false, error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
