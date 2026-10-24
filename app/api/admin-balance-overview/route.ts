import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import {
  financeDateKey,
  financeTransactionAmounts,
  includedInCurrentBalance,
  includedInMainLedger,
  isMunicipalityTransaction,
} from "@/lib/finance-ledger-policy";
import { selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function dhakaYearMonth() {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value || String(new Date().getFullYear());
  const month = parts.find((part) => part.type === "month")?.value || "01";
  return { year, month: Number(month) || 1 };
}

function transactionDescription(row: Row) {
  return text(
    row.description ||
    row.particulars ||
    row.purpose ||
    row.category ||
    row.notes ||
    row.transaction_code ||
    "Ledger transaction"
  );
}

export async function GET(request: NextRequest) {
  try {
    const user = (await requireLocalSession(request)) as Row | null;
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });

    const role = roleOf(user);
    if (!["admin", "manager", "accounts"].includes(role)) {
      return NextResponse.json({ success: false, error: "Finance access is required." }, { status: 403 });
    }

    // Stable tiebreaker is required because the data gateway pages large result
    // sets and many transactions can share the same transaction date.
    const transactions = await selectRows("transactions", {
      order: "transaction_date:asc,id:asc",
      limit: 5000,
    });

    let currentBalance = 0;
    let municipalityBalance = 0;
    let mainEntries = 0;
    let municipalityEntries = 0;
    let totalIncome = 0;
    let totalExpenses = 0;

    const monthly = new Map<string, { income: number; expenses: number }>();
    const recentMain: Array<{
      id: string;
      date: string;
      description: string;
      type: "income" | "expense";
      amount: number;
    }> = [];

    for (const row of transactions) {
      const { debit, credit } = financeTransactionAmounts(row);

      if (isMunicipalityTransaction(row)) {
        municipalityBalance += credit - debit;
        if (debit > 0 || credit > 0) municipalityEntries += 1;
      }

      if (includedInCurrentBalance(row)) {
        currentBalance += credit - debit;
      }

      if (!includedInMainLedger(row)) continue;

      mainEntries += 1;
      totalIncome += credit;
      totalExpenses += debit;

      const day = financeDateKey(row.transaction_date);
      const monthKey = day.slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(monthKey)) {
        const bucket = monthly.get(monthKey) || { income: 0, expenses: 0 };
        bucket.income += credit;
        bucket.expenses += debit;
        monthly.set(monthKey, bucket);
      }

      recentMain.push({
        id: text(row.transaction_code || row.id),
        date: day,
        description: transactionDescription(row),
        type: credit > 0 ? "income" : "expense",
        amount: credit > 0 ? credit : debit,
      });
    }

    const { year, month } = dhakaYearMonth();
    const monthlySeries = Array.from({ length: month }, (_, index) => {
      const monthNumber = index + 1;
      const key = `${year}-${String(monthNumber).padStart(2, "0")}`;
      const values = monthly.get(key) || { income: 0, expenses: 0 };
      const label = new Intl.DateTimeFormat("en", { month: "short", timeZone: "Asia/Dhaka" })
        .format(new Date(`${key}-01T00:00:00+06:00`));
      return { key, label, income: values.income, expenses: values.expenses };
    });

    const recentTransactions = recentMain.slice(-6).reverse();

    return NextResponse.json({
      success: true,
      data: {
        currentBalance,
        municipalityBalance,
        mainEntries,
        municipalityEntries,
        totalIncome,
        totalExpenses,
        monthlySeries,
        recentTransactions,
        generatedAt: new Date().toISOString(),
      },
    }, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Landview-Data": "supabase",
        "X-Landview-Module": "admin-balance-overview",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load account balances.";
    return NextResponse.json({ success: false, error: message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
