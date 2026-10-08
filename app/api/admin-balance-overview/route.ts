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

export async function GET(request: NextRequest) {
  try {
    const user = (await requireLocalSession(request)) as Row | null;
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });

    const role = roleOf(user);
    if (!["admin", "manager", "accounts"].includes(role)) {
      return NextResponse.json({ success: false, error: "Finance access is required." }, { status: 403 });
    }

    const transactions = await selectRows("transactions", { order: "transaction_date:asc", limit: 5000 });

    let currentBalance = 0;
    let municipalityBalance = 0;
    let mainEntries = 0;
    let municipalityEntries = 0;

    for (const row of transactions) {
      const { debit, credit } = transactionAmounts(row);
      if (text(row.finance_scope) === MUNICIPALITY_SCOPE) {
        municipalityBalance += credit - debit;
        if (debit > 0 || credit > 0) municipalityEntries += 1;
      }
      if (includedInMainLedger(row)) {
        currentBalance += credit - debit;
        mainEntries += 1;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        currentBalance,
        municipalityBalance,
        mainEntries,
        municipalityEntries,
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
