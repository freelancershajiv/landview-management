import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { roleOf, selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FINANCE_ROLES = new Set(["admin", "manager", "accounts", "employee"]);
type CategoryKey = "engineering" | "supervision" | "other";
type CategoryAmounts = Record<CategoryKey, number>;
type Row = Record<string, unknown>;

function text(value: unknown) { return String(value ?? "").trim(); }
function num(value: unknown) {
  const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function categoryOf(value: unknown): CategoryKey {
  const raw = text(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (raw.includes("supervision")) return "supervision";
  if (/other|soil|survey|municipality|file pass/.test(raw)) return "other";
  return "engineering";
}
function activeInvoice(row: Row) {
  const status = text(row.status).toLowerCase().replace(/[_-]+/g, " ");
  return !new Set(["draft", "cancelled", "canceled", "void", "voided", "rejected"]).has(status);
}
function activePayment(row: Row) {
  if (text(row.transaction_type).toLowerCase() === "personal income" || row.affects_business_balance === false) return false;
  const status = text(row.approval_status || row.status).toLowerCase().replace(/[_-]+/g, " ");
  return !status || ["approved", "received", "paid", "verified", "complete", "completed", "full paid", "fully paid", "posted"].includes(status);
}
// Receivables follow invoice allocation state; unallocated project money is not treated as invoice payment.
function invoiceDue(row: Row) {
  const snapshot = row.due_amount_snapshot;
  if (snapshot !== undefined && snapshot !== null && text(snapshot) !== "") return Math.max(0, num(snapshot));
  return Math.max(0, num(row.amount) - num(row.paid_amount_snapshot));
}
function emptyAmounts(): CategoryAmounts { return { engineering: 0, supervision: 0, other: 0 }; }

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!FINANCE_ROLES.has(roleOf(user))) return NextResponse.json({ success: false, error: "Finance access is required." }, { status: 403 });

    const [projects, invoices, payments, writeoffs] = await Promise.all([
      selectRows("projects", { select: "id,project_code,project_name,client_name_snapshot,phone_number_snapshot,location", limit: 5000 }),
      selectRows("invoices", { select: "id,project_id,invoice_code,bill_code,category,amount,paid_amount_snapshot,due_amount_snapshot,status", limit: 5000 }),
      selectRows("payments", { select: "id,project_id,payment_code,payment_date,amount,status,approval_status,transaction_type,affects_business_balance,invoice_unallocated_amount,invoice_allocation_status,created_at", limit: 5000 }),
      selectRows("billing_writeoff_log", { select: "project_id,billing_category,event_type,amount,effective_date,created_at", order: "created_at:asc", limit: 5000 }),
    ]);

    const invoiceMap = new Map<string, Row[]>();
    for (const invoice of invoices) {
      if (!activeInvoice(invoice)) continue;
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
        const due = invoiceDue(invoice);
        if (due <= 0.009) continue;
        categoryDue[categoryOf(invoice.category)] += due;
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
      let lastPaymentDate = "";
      let lastPaymentAmount = 0;
      let lastStamp = -1;
      for (const payment of paymentMap.get(projectUuid) || []) {
        unallocatedAmount += Math.max(0, num(payment.invoice_unallocated_amount));
        const date = text(payment.payment_date || payment.created_at);
        const stamp = date ? new Date(date).getTime() : 0;
        if (Number.isFinite(stamp) && stamp >= lastStamp) {
          lastStamp = stamp;
          lastPaymentDate = date;
          lastPaymentAmount = Math.max(0, num(payment.amount));
        }
      }

      const totalDue = collectible.engineering + collectible.supervision + collectible.other;
      const writeoffTotal = written.engineering + written.supervision + written.other;
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
        unallocatedAmount,
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
      headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "invoice-allocation-truth" },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load due bills." }, {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
