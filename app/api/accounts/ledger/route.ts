import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { insertRows, normalizeProjectCode, roleOf, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDIT_ROLES = new Set(["admin", "manager", "accounts"]);
const HISTORICAL_PREFIXES = ["TXN-HIST-2026-", "TXN-LEDGER-2025-"];

function text(value: unknown, max = 1500) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeStatus(value: unknown) {
  return text(value, 100).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function number(value: unknown) {
  const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : Number.NaN;
}

function validDate(value: unknown) {
  const v = text(value, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

function isEditableTransactionCode(code: string) {
  return Boolean(code);
}

export async function PATCH(request: NextRequest) {
  try {
    if (!sameOrigin(request)) {
      return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    }

    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!EDIT_ROLES.has(roleOf(user))) {
      return NextResponse.json({ success: false, error: "Admin, manager or accounts access is required to edit ledger entries." }, { status: 403 });
    }

    const body = await request.json() as Record<string, unknown>;
    const transactionCode = text(body.Transaction_ID || body.transactionId, 140);
    if (!transactionCode || !isEditableTransactionCode(transactionCode)) {
      return NextResponse.json({ success: false, error: "A valid ledger transaction ID is required." }, { status: 400 });
    }

    const found = await selectRows("transactions", { filters: { transaction_code: transactionCode }, limit: 1 });
    if (!found.length) return NextResponse.json({ success: false, error: "Ledger transaction was not found." }, { status: 404 });
    const current = found[0];

    const transactionDate = validDate(body.Transaction_Date || body.date);
    if (!transactionDate) return NextResponse.json({ success: false, error: "Enter a valid transaction date." }, { status: 400 });
    if (normalizeStatus(current.status) !== "posted") {
      return NextResponse.json({ success: false, error: "Only posted ledger entries can be edited." }, { status: 400 });
    }

    const entryType = text(body.Entry_Type || body.type, 30).toLowerCase();
    if (!["income", "expense"].includes(entryType)) {
      return NextResponse.json({ success: false, error: "Choose Income or Expense." }, { status: 400 });
    }

    const amount = number(body.Amount || body.amount);
    if (!(amount > 0)) return NextResponse.json({ success: false, error: "Enter a valid amount greater than zero." }, { status: 400 });

    const category = text(body.Category || body.category, 250) || "Uncategorized";
    const description = text(body.Description || body.description, 1200) || category;
    const projectCode = normalizeProjectCode(body.Project_ID || body.projectId || "");
    let projectId: string | null = null;
    let projectSnapshot: string | null = null;
    if (projectCode) {
      const projects = await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 });
      if (!projects.length) return NextResponse.json({ success: false, error: `Project ${projectCode} was not found.` }, { status: 400 });
      projectId = projects[0].id;
      projectSnapshot = projectCode;
    }

    const account = text(body.Account || body.account, 250);
    const reference = text(body.Reference_No || body.reference, 500);
    const method = text(body.Payment_Method || body.method, 120);
    const actor = text((user as Record<string, unknown>).User_ID || (user as Record<string, unknown>).userId || (user as Record<string, unknown>).username || "LAND VIEW", 160);

    const updates = {
      transaction_date: transactionDate,
      transaction_type: entryType === "income" ? "Income" : "Expense",
      project_id: projectId,
      project_code_snapshot: projectSnapshot,
      account_id: null,
      account_snapshot: account || null,
      category,
      description,
      debit: entryType === "expense" ? amount : null,
      credit: entryType === "income" ? amount : null,
      direction: entryType === "expense" ? "DEBIT" : "CREDIT",
      amount,
      payment_method: method || null,
      reference_no: reference || null,
      source_created_by: actor,
    };

    const updated = await updateRows("transactions", { transaction_code: transactionCode }, updates);
    await insertRows("app_audit_log", {
      actor_user_key: actor,
      action: "historical_ledger_edit",
      target: transactionCode,
      outcome: "success",
      details: {
        before: {
          transaction_date: current.transaction_date,
          transaction_type: current.transaction_type,
          project_code_snapshot: current.project_code_snapshot,
          account_snapshot: current.account_snapshot,
          category: current.category,
          description: current.description,
          debit: current.debit,
          credit: current.credit,
          amount: current.amount,
          payment_method: current.payment_method,
          reference_no: current.reference_no,
        },
        after: updates,
      },
    });

    return NextResponse.json(
      { success: true, data: updated[0] || null },
      { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update the historical ledger entry.";
    return NextResponse.json({ success: false, error: message }, { status: /session/i.test(message) ? 401 : 502, headers: { "Cache-Control": "no-store" } });
  }
}
