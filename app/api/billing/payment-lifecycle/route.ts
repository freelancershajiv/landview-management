import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { selectRows } from "@/lib/supabase-data";
import { loadReceivableAuthority } from "@/lib/billing-receivable-authority";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
const text = (value: unknown) => String(value ?? "").trim();
const stamp = (value: unknown) => {
  const date = new Date(text(value));
  return Number.isFinite(date.getTime()) ? date.getTime() : 0;
};

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request) as Row | null;
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!["admin", "manager", "accounts"].includes(roleOf(user))) return NextResponse.json({ success: false, error: "Accounts access is required." }, { status: 403 });

    const [projects, authority] = await Promise.all([
      selectRows("projects", { select: "id,project_code,project_name,client_name_snapshot", limit: 5000 }),
      loadReceivableAuthority(),
    ]);
    const projectById = new Map((projects as Row[]).map((row: Row) => [text(row.id), row]));

    const invoices = authority.invoices;
    const paidInvoices = invoices.filter((row) => row.settledByBill || row.dueBeforeRelief <= 0.009).length;
    const partialInvoices = invoices.filter((row) => !row.settledByBill && row.allocated > 0.009 && row.dueBeforeRelief > 0.009).length;
    const issuedInvoices = invoices.filter((row) => !row.settledByBill && row.allocated <= 0.009 && row.dueBeforeRelief > 0.009).length;

    const effectiveProjectPayments = authority.payments.filter((row) => row.effective && !!row.projectId);
    const receipts = effectiveProjectPayments
      .filter((row) => text(row.row.receipt_url))
      .sort((a, b) => stamp(b.row.payment_date || b.row.created_at) - stamp(a.row.payment_date || a.row.created_at));
    const unallocated = effectiveProjectPayments
      .filter((row) => row.unallocated > 0.009)
      .sort((a, b) => stamp(b.row.payment_date || b.row.created_at) - stamp(a.row.payment_date || a.row.created_at));

    return NextResponse.json({ success: true, data: {
      summary: {
        invoices: invoices.length,
        receipts: receipts.length,
        invoiceValue: invoices.reduce((sum, row) => sum + row.amount, 0),
        invoicePaid: invoices.reduce((sum, row) => sum + (row.settledByBill ? row.amount : row.allocated), 0),
        invoiceDue: authority.totals.due,
        paidInvoices,
        partialInvoices,
        issuedInvoices,
        unallocatedAmount: unallocated.reduce((sum, row) => sum + row.unallocated, 0),
        unallocatedPayments: unallocated.length,
      },
      unallocated: unallocated.slice(0, 250).map((row) => {
        const project = projectById.get(row.projectId) || {};
        return {
          paymentCode: row.paymentCode,
          projectCode: project.project_code || "",
          client: project.client_name_snapshot || row.row.received_from || "",
          date: row.row.payment_date || "",
          amount: row.amount,
          allocated: row.allocated,
          unallocated: row.unallocated,
          category: row.row.income_category || row.row.payment_for || "",
          method: row.row.payment_method || "",
          receiptUrl: row.row.receipt_url || "",
        };
      }),
      recentReceipts: receipts.slice(0, 100).map((row) => {
        const project = projectById.get(row.projectId) || {};
        return {
          paymentCode: row.paymentCode,
          receiptCode: `RCPT-${row.paymentCode}`,
          projectCode: project.project_code || "",
          client: project.client_name_snapshot || row.row.received_from || "",
          date: row.row.payment_date || "",
          amount: row.amount,
          allocated: row.allocated,
          unallocated: row.unallocated,
          receiptUrl: row.row.receipt_url || "",
        };
      }),
    } }, { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "canonical-receivable-authority" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load payment lifecycle.";
    return NextResponse.json({ success: false, error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
