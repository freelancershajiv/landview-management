import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { selectRows } from "@/lib/supabase-data";
import {
  billingAmount,
  billingPaymentIsEffective,
  billIsEffective,
  canonicalBillingCategory,
  type CanonicalBillingCategory,
} from "@/lib/billing-payment-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
type CategoryNumbers = { gross: number; discount: number; billed: number; paid: number; due: number };

function emptyCategory(): CategoryNumbers {
  return { gross: 0, discount: 0, billed: 0, paid: 0, due: 0 };
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request);
    if (!user) {
      return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    }

    const [projects, bills, payments] = await Promise.all([
      selectRows("projects", { limit: 5000 }),
      selectRows("bills", { limit: 5000 }),
      selectRows("payments", { limit: 5000 }),
    ]);

    const effectiveBills = bills.filter(billIsEffective);
    const effectivePayments = payments.filter(billingPaymentIsEffective);
    const billsByProject = new Map<string, Row[]>();
    const paymentsByProject = new Map<string, Row[]>();

    for (const bill of effectiveBills) {
      const rows = billsByProject.get(String(bill.project_id)) || [];
      rows.push(bill);
      billsByProject.set(String(bill.project_id), rows);
    }
    for (const payment of effectivePayments) {
      const rows = paymentsByProject.get(String(payment.project_id)) || [];
      rows.push(payment);
      paymentsByProject.set(String(payment.project_id), rows);
    }

    const categoryTotals = new Map<CanonicalBillingCategory, CategoryNumbers>();

    const rows = projects.map((project) => {
      const categories: Record<string, CategoryNumbers> = {};
      let gross = 0;
      let discount = 0;
      let paid = 0;

      for (const bill of billsByProject.get(String(project.id)) || []) {
        const category = canonicalBillingCategory(bill);
        const categoryRow = categories[category] || emptyCategory();
        const billGross = billingAmount(bill.amount);
        const billDiscount = billingAmount(bill.discount);
        gross += billGross;
        discount += billDiscount;
        categoryRow.gross += billGross;
        categoryRow.discount += billDiscount;
        categoryRow.billed += Math.max(0, billGross - billDiscount);
        categories[category] = categoryRow;
      }

      for (const payment of paymentsByProject.get(String(project.id)) || []) {
        const category = canonicalBillingCategory(payment);
        const categoryRow = categories[category] || emptyCategory();
        const paymentAmount = billingAmount(payment.amount);
        paid += paymentAmount;
        categoryRow.paid += paymentAmount;
        categories[category] = categoryRow;
      }

      for (const [categoryName, values] of Object.entries(categories)) {
        values.due = Math.max(0, values.billed - values.paid);
        const category = categoryName as CanonicalBillingCategory;
        const total = categoryTotals.get(category) || emptyCategory();
        total.gross += values.gross;
        total.discount += values.discount;
        total.billed += values.billed;
        total.paid += values.paid;
        total.due += values.due;
        categoryTotals.set(category, total);
      }

      const billed = Math.max(0, gross - discount);
      return {
        projectId: project.project_code,
        projectName: project.project_name || "",
        clientName: project.client_name_snapshot || "",
        gross,
        discount,
        billed,
        paid,
        due: Math.max(0, billed - paid),
        categories,
      };
    });

    const totals = rows.reduce(
      (sum, row) => ({
        gross: sum.gross + row.gross,
        discount: sum.discount + row.discount,
        billed: sum.billed + row.billed,
        paid: sum.paid + row.paid,
        due: sum.due + row.due,
      }),
      { gross: 0, discount: 0, billed: 0, paid: 0, due: 0 },
    );

    return NextResponse.json(
      {
        success: true,
        data: {
          totals,
          categories: [...categoryTotals.entries()].map(([category, values]) => ({ category, ...values })),
          projects: rows,
          billCount: effectiveBills.length,
          paymentCount: effectivePayments.length,
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase-billing-compatible" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Billing.";
    return NextResponse.json({ success: false, error: message }, { status: /session/i.test(message) ? 401 : 500, headers: { "Cache-Control": "no-store" } });
  }
}
