import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function numberValue(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalized(value: unknown) {
  return text(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export async function GET(request: NextRequest) {
  try {
    const user = (await requireLocalSession(request)) as Row | null;
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });

    const role = roleOf(user);
    if (!["admin", "manager", "accounts"].includes(role)) {
      return NextResponse.json({ success: false, error: "Finance access is required." }, { status: 403 });
    }

    const rows = await selectRows("transactions", {
      order: "transaction_date:asc,id:asc",
      limit: 5000,
    });

    const orders: Record<string, number> = {};
    const monthly = new Map<string, number[]>();

    for (const row of rows) {
      const code = text(row.transaction_code);
      const date = text(row.transaction_date);
      const month = /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : "";
      const financeScope = text(row.finance_scope) || "main";
      const transactionType = normalized(row.transaction_type);
      const status = normalized(row.status || "posted");
      const debit = numberValue(row.debit);
      const credit = numberValue(row.credit);
      const order = Math.trunc(numberValue(row.ledger_order));

      if (code && order > 0) orders[code] = order;
      if (!month || financeScope !== "main" || (debit <= 0 && credit <= 0)) continue;
      if (["transfer", "personal income", "personal expense"].includes(transactionType)) continue;
      if (status !== "posted") continue;

      const list = monthly.get(month) || [];
      list.push(order);
      monthly.set(month, list);
    }

    const canonicalMonths = [...monthly.entries()]
      .filter(([, values]) => {
        if (!values.length || values.some((value) => value <= 0)) return false;
        const unique = new Set(values);
        if (unique.size !== values.length) return false;
        const sorted = [...unique].sort((a, b) => a - b);
        return sorted[0] === 1 && sorted[sorted.length - 1] === values.length;
      })
      .map(([month]) => month)
      .sort();

    return NextResponse.json({ success: true, data: { orders, canonicalMonths } }, {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load ledger order.";
    return NextResponse.json({ success: false, error: message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
