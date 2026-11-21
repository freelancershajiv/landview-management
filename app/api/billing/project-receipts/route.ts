import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { normalizeProjectCode, selectRows } from "@/lib/supabase-data";
import { receivablePaymentIsEffective } from "@/lib/billing-receivable-authority";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
const text = (value: unknown) => String(value ?? "").trim();
const amount = (value: unknown) => {
  const valueNumber = Number(value ?? 0);
  return Number.isFinite(valueNumber) ? Math.max(0, valueNumber) : 0;
};
const verifiedPath = (value: unknown) => {
  const path = text(value);
  return /^\/verify\/receipt\/[A-Za-z0-9]{20,80}$/.test(path) ? path : "";
};

function allowedProjectCodes(user: Row) {
  return new Set(
    text(user.projectIds || user.Project_IDs || user.project_ids)
      .split(/[;,\s]+/)
      .map(normalizeProjectCode)
      .filter(Boolean),
  );
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request) as Row | null;
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });

    const role = roleOf(user);
    if (!["admin", "manager", "accounts", "client"].includes(role)) {
      return NextResponse.json({ success: false, error: "Receipt access is not available for this role." }, { status: 403 });
    }

    const projectCode = normalizeProjectCode(request.nextUrl.searchParams.get("projectId") || "");
    if (!/^LV-\d{1,8}$/.test(projectCode)) {
      return NextResponse.json({ success: false, error: "Valid project ID required." }, { status: 400 });
    }
    if (role === "client" && !allowedProjectCodes(user).has(projectCode)) {
      return NextResponse.json({ success: false, error: "This project is not linked to your account." }, { status: 403 });
    }

    const project = (await selectRows("projects", {
      select: "id,project_code",
      filters: { project_code: projectCode },
      limit: 1,
    }))[0];
    if (!project) return NextResponse.json({ success: false, error: "Project not found." }, { status: 404 });

    const [payments, receipts, allocations, bills] = await Promise.all([
      selectRows("payments", {
        select: "id,payment_code,payment_date,amount,payment_method,reference_no,income_category,payment_for,approval_status,status,receipt_url,created_at,transaction_type,affects_business_balance,is_legacy_manual",
        filters: { project_id: project.id }, order: "payment_date:desc", limit: 5000,
      }),
      selectRows("payment_receipts", {
        select: "payment_id,receipt_code,receipt_path,status,voided_at,issued_at",
        filters: { project_id: project.id }, limit: 5000,
      }),
      selectRows("payment_invoice_allocations", {
        select: "payment_id,bill_code,invoice_code,service_name,allocated_amount",
        filters: { project_id: project.id }, limit: 10000,
      }),
      selectRows("bills", {
        select: "bill_code,description", filters: { project_id: project.id }, limit: 5000,
      }),
    ]) as [Row[], Row[], Row[], Row[]];

    const receiptsByPayment = new Map(receipts.map(row => [text(row.payment_id), row]));
    const billDescriptions = new Map(bills.map(row => [text(row.bill_code), text(row.description)]));
    const allocationsByPayment = new Map<string, Row[]>();
    for (const item of allocations) {
      const key = text(item.payment_id);
      const rows = allocationsByPayment.get(key) || [];
      rows.push(item);
      allocationsByPayment.set(key, rows);
    }

    const rows = payments
      .filter(payment => receivablePaymentIsEffective(payment))
      .map(payment => {
        const receipt = receiptsByPayment.get(text(payment.id));
        const approval = text(payment.approval_status || payment.status || "Pending");
        const issued = receipt && text(receipt.status).toLowerCase() === "issued"
          && !receipt.voided_at
          && ["approved", "received", "paid", "verified", "complete", "completed", "posted"].includes(approval.toLowerCase());
        const allocationsForPayment = (allocationsByPayment.get(text(payment.id)) || []).map(row => ({
          billCode: text(row.bill_code), invoiceCode: text(row.invoice_code),
          serviceName: billDescriptions.get(text(row.bill_code)) || text(row.service_name), amount: amount(row.allocated_amount),
        }));
        const allocated = allocationsForPayment.reduce((sum, row) => sum + row.amount, 0);
        const receiptUrl = issued && verifiedPath(receipt?.receipt_path)
          && verifiedPath(receipt?.receipt_path) === verifiedPath(payment.receipt_url)
          ? verifiedPath(receipt?.receipt_path) : "";
        return {
          paymentCode: text(payment.payment_code), receiptCode: issued ? text(receipt?.receipt_code) : "",
          projectCode, date: payment.payment_date, amount: amount(payment.amount),
          method: text(payment.payment_method), reference: text(payment.reference_no),
          category: text(payment.income_category || payment.payment_for),
          approval, allocated, unallocated: Math.max(0, amount(payment.amount) - allocated),
          allocations: allocationsForPayment, receiptUrl,
          receiptStatus: receiptUrl ? "Issued" : "Unavailable",
        };
      })
      .sort((a, b) => text(b.date).localeCompare(text(a.date)) || b.paymentCode.localeCompare(a.paymentCode));

    const requestedPayment = text(request.nextUrl.searchParams.get("paymentCode"));
    const visibleRows = requestedPayment ? rows.filter(row => row.paymentCode === requestedPayment) : rows;
    return NextResponse.json({
      success: true,
      data: { projectCode, payments: visibleRows, total: visibleRows.length },
    }, { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Could not load project receipts.",
    }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
