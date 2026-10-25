import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
const text = (value: unknown) => String(value ?? "").trim();
const num = (value: unknown) => { const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; };

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request) as Row | null;
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!["admin","manager","accounts"].includes(roleOf(user))) return NextResponse.json({ success: false, error: "Accounts access is required." }, { status: 403 });

    const [payments, invoices, projects] = await Promise.all([
      selectRows("payments", { order: "payment_date:desc,created_at:desc", limit: 5000 }),
      selectRows("invoices", { order: "issue_date:desc,created_at:desc", limit: 5000 }),
      selectRows("projects", { order: "project_code:desc", limit: 5000 }),
    ]);
    const projectById = new Map(projects.map((row: Row) => [text(row.id), row]));
    const projectPayments = payments.filter((row: Row) => row.project_id && text(row.receipt_url));
    const unallocated = projectPayments.filter((row: Row) => num(row.invoice_unallocated_amount) > 0.009);
    const invoiceSummary = invoices.reduce((acc: Row, row: Row) => {
      const status = text(row.status || "ISSUED").toUpperCase();
      acc[status] = Number(acc[status] || 0) + 1;
      acc.amount = Number(acc.amount || 0) + num(row.amount);
      acc.paid = Number(acc.paid || 0) + num(row.paid_amount_snapshot);
      acc.due = Number(acc.due || 0) + num(row.due_amount_snapshot);
      return acc;
    }, {});

    return NextResponse.json({ success: true, data: {
      summary: {
        invoices: invoices.length,
        receipts: projectPayments.length,
        invoiceValue: num(invoiceSummary.amount),
        invoicePaid: num(invoiceSummary.paid),
        invoiceDue: num(invoiceSummary.due),
        paidInvoices: Number(invoiceSummary.PAID || 0),
        partialInvoices: Number(invoiceSummary["PARTIALLY PAID"] || 0),
        issuedInvoices: Number(invoiceSummary.ISSUED || 0),
        unallocatedAmount: unallocated.reduce((sum: number, row: Row) => sum + num(row.invoice_unallocated_amount), 0),
        unallocatedPayments: unallocated.length,
      },
      unallocated: unallocated.slice(0, 250).map((row: Row) => {
        const project = projectById.get(text(row.project_id)) || {};
        return {
          paymentCode: row.payment_code,
          projectCode: project.project_code || "",
          client: project.client_name_snapshot || row.received_from || "",
          date: row.payment_date || "",
          amount: num(row.amount),
          allocated: num(row.invoice_allocated_amount),
          unallocated: num(row.invoice_unallocated_amount),
          category: row.income_category || row.payment_for || "",
          method: row.payment_method || "",
          receiptUrl: row.receipt_url || "",
        };
      }),
      recentReceipts: projectPayments.slice(0, 100).map((row: Row) => {
        const project = projectById.get(text(row.project_id)) || {};
        return { paymentCode: row.payment_code, receiptCode: `RCPT-${row.payment_code}`, projectCode: project.project_code || "", client: project.client_name_snapshot || row.received_from || "", date: row.payment_date || "", amount: num(row.amount), allocated: num(row.invoice_allocated_amount), unallocated: num(row.invoice_unallocated_amount), receiptUrl: row.receipt_url || "" };
      }),
    } }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load payment lifecycle.";
    return NextResponse.json({ success: false, error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
