import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, userIdOf } from "@/lib/local-session";
import { selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPROVER_CODE = "EMP-0001";

type Row = Record<string, unknown>;

function text(value: unknown) {
  return String(value ?? "").trim();
}

function actorCode(user: Row | null | undefined) {
  return text(
    user?.employeeCode ||
      user?.Employee_Code ||
      user?.employeeId ||
      user?.Employee_ID ||
      userIdOf(user)
  ).toUpperCase();
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  try {
    const user = (await requireLocalSession(request)) as Row | null;
    if (!user) return json({ success: false, error: "Authentication required." }, 401);

    const code = actorCode(user);
    if (code !== APPROVER_CODE) {
      return json({ success: false, error: "Only EMP-0001 can approve or reject expenses." }, 403);
    }

    const body = (await request.json().catch(() => null)) as Row | null;
    const expenseId = text(body?.expenseId || body?.Expense_ID);
    const decision = text(body?.decision).toLowerCase();
    const note = text(body?.note || body?.notes || body?.decisionNote);

    if (!expenseId) return json({ success: false, error: "Expense ID is required." }, 400);
    if (!new Set(["approved", "rejected"]).has(decision)) {
      return json({ success: false, error: "Decision must be Approved or Rejected." }, 400);
    }

    const existing = await selectRows("expenses", { filters: { expense_code: expenseId }, limit: 1 });
    if (!existing.length) return json({ success: false, error: "Expense not found." }, 404);

    const now = new Date().toISOString();
    const changes = decision === "approved"
      ? {
          approval_status: "Approved",
          status: "POSTED",
          approved_by_code: APPROVER_CODE,
          approved_at: now,
          reviewed_by_code: APPROVER_CODE,
          reviewed_at: now,
          decision_notes: note || null,
          decided_at: now,
          updated_at: now,
        }
      : {
          approval_status: "Rejected",
          status: "REJECTED",
          approved_by_code: null,
          approved_at: null,
          reviewed_by_code: APPROVER_CODE,
          reviewed_at: now,
          decision_notes: note || null,
          decided_at: now,
          updated_at: now,
        };

    const updated = await updateRows("expenses", { expense_code: expenseId }, changes);
    return json({ success: true, data: updated?.[0] || null, approver: APPROVER_CODE });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not update expense approval.";
    return json({ success: false, error: message }, 500);
  }
}
