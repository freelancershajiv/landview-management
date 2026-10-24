import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

const LEDGER_LIVE_START = "2026-09-01";
const LEDGER_END = "2026-12-31";
const MUNICIPALITY_SCOPE = "municipality_file_pass";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function amount(value: unknown) {
  const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function normalizeStatus(value: unknown) {
  return text(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function dateKey(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D|$)/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
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

function transactionAmounts(row: Row) {
  const transactionType = normalizeStatus(row.transaction_type);
  const direction = text(row.direction).toUpperCase();
  const fallback = amount(row.amount);
  let debit = amount(row.debit);
  let credit = amount(row.credit);
  if (!debit && !credit && fallback > 0) {
    if (direction === "DEBIT" || transactionType === "expense") debit = fallback;
    if (direction === "CREDIT" || transactionType === "income") credit = fallback;
  }
  return { debit, credit, transactionType };
}

function includedInMainLedger(row: Row) {
  const id = text(row.transaction_code);
  const date = dateKey(row.transaction_date);
  const { debit, credit, transactionType } = transactionAmounts(row);
  if (!id || !date || (debit <= 0 && credit <= 0)) return false;

  const historical = id.startsWith("TXN-LEDGER-2025-") || id.startsWith("TXN-HIST-2026-");
  if (historical) return true;

  if (normalizeStatus(row.status || "Posted") !== "posted") return false;
  if (["transfer", "personal income", "personal expense"].includes(transactionType)) return false;
  return date >= LEDGER_LIVE_START && date <= LEDGER_END;
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

    // The data gateway reads large result sets in 1,000-row pages. Always use
    // a unique tiebreaker so rows sharing the same transaction date cannot be
    // skipped or duplicated between pages.
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
      const { debit, credit } = transactionAmounts(row);
      if (text(row.finance_scope) === MUNICIPALITY_SCOPE) {
        municipalityBalance += credit - debit;
        if (debit > 0 || credit > 0) municipalityEntries += 1;
      }

      if (includedInMainLedger(row)) {
        currentBalance += credit - debit;
        mainEntries += 1;
        totalIncome += credit;
        totalExpenses += debit;

        const day = dateKey(row.transaction_date);
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
