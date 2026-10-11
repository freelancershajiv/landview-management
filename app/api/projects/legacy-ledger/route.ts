import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { normalizeProjectCode, roleOf, selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MANAGE_ROLES = new Set(["admin", "manager"]);
function text(value: unknown, max = 1200) { return String(value ?? "").trim().slice(0, max); }
function num(value: unknown) { const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; }
function cleanDate(value: unknown) { const valueText = text(value, 20); return /^\d{4}-\d{2}-\d{2}$/.test(valueText) ? valueText : ""; }

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!MANAGE_ROLES.has(roleOf(user))) return NextResponse.json({ success: false, error: "Admin or manager access is required." }, { status: 403 });

    const projectCode = normalizeProjectCode(request.nextUrl.searchParams.get("projectCode") || "");
    const amount = num(request.nextUrl.searchParams.get("amount"));
    const date = cleanDate(request.nextUrl.searchParams.get("date"));
    if (!(amount > 0)) return NextResponse.json({ success: false, error: "Enter a payment amount to search the ledger." }, { status: 400 });

    const [transactions, linkedPayments] = await Promise.all([
      selectRows("transactions", {
        filters: { transaction_type: "Income" },
        select: "id,transaction_code,transaction_date,transaction_type,source_type,source_id,project_id,project_code_snapshot,category,description,credit,amount,reference_no,status,direction,payment_method",
        order: "transaction_date:desc,created_at:desc",
        limit: 5000,
      }),
      selectRows("payments", { select: "ledger_transaction_id", limit: 5000 }),
    ]);

    const used = new Set(linkedPayments.map((row) => text(row.ledger_transaction_id, 80)).filter(Boolean));
    const results = transactions
      .filter((row) => {
        if (used.has(text(row.id, 80))) return false;
        if (text(row.source_type, 120).toUpperCase() === "PAYMENT") return false;
        const transactionAmount = num(row.amount || row.credit);
        return Math.abs(transactionAmount - amount) <= Math.max(0.01, amount * 0.1);
      })
      .map((row) => {
        const transactionAmount = num(row.amount || row.credit);
        const transactionDate = text(row.transaction_date, 20);
        const transactionProject = normalizeProjectCode(row.project_code_snapshot || "");
        const amountExact = Math.abs(transactionAmount - amount) < 0.005;
        const dateExact = !date || transactionDate === date;
        const projectCompatible = !transactionProject || !projectCode || transactionProject === projectCode;
        let score = amountExact ? 100 : Math.max(0, 70 - Math.abs(transactionAmount - amount) / Math.max(amount, 1) * 100);
        if (date && transactionDate === date) score += 60;
        if (projectCode && transactionProject === projectCode) score += 80;
        else if (!transactionProject) score += 12;
        else if (projectCode && transactionProject !== projectCode) score -= 120;
        return {
          id: text(row.id, 80),
          transactionCode: text(row.transaction_code, 160),
          date: transactionDate,
          amount: transactionAmount,
          projectCode: transactionProject,
          category: text(row.category, 200),
          description: text(row.description, 700),
          reference: text(row.reference_no, 300),
          sourceType: text(row.source_type, 160),
          status: text(row.status, 100),
          matchStatus: amountExact && dateExact && projectCompatible ? "exact" : "review",
          score,
        };
      })
      .filter((row) => row.score > -20)
      .sort((a, b) => b.score - a.score || b.date.localeCompare(a.date))
      .slice(0, 12);

    return NextResponse.json({ success: true, data: results }, { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not search the Accounts Ledger.";
    return NextResponse.json({ success: false, error: message }, { status: /session/i.test(message) ? 401 : 502, headers: { "Cache-Control": "no-store" } });
  }
}
