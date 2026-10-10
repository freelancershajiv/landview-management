import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { normalizeProjectCode, roleOf, selectRows, updateRows } from "@/lib/supabase-data";
import { auditFailure, recordAuditEvent } from "@/lib/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  let auditUser: Record<string, unknown> | null = null;
  let auditTransactionCode = "";
  let auditBefore: Record<string, unknown> | undefined;
  let auditAfter: Record<string, unknown> | undefined;

  try {
    if (!sameOrigin(request)) {
      return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    }

    const user = await requireLocalSession(request);
    auditUser = user as Record<string, unknown> | null;
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (roleOf(user) !== "admin") {
      await recordAuditEvent({
        user: auditUser,
        request,
        action: "accounts.ledger.edit",
        entityType: "transaction",
        outcome: "denied",
        details: { reason: "Admin access is required to edit ledger history." },
      });
      return NextResponse.json({ success: false, error: "Admin access is required to edit ledger history." }, { status: 403 });
    }

    const body = await request.json() as Record<string, unknown>;
    const transactionCode = text(body.Transaction_ID || body.transactionId, 140);
    auditTransactionCode = transactionCode;
    if (!transactionCode || !isEditableTransactionCode(transactionCode)) {
      return NextResponse.json({ success: false, error: "A valid ledger transaction ID is required." }, { status: 400 });
    }

    const found = await selectRows("transactions", { filters: { transaction_code: transactionCode }, limit: 1 });
    if (!found.length) return NextResponse.json({ success: false, error: "Ledger transaction was not found." }, { status: 404 });
    const current = found[0];
    auditBefore = current;

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
    auditAfter = updates;

    const updated = await updateRows("transactions", { transaction_code: transactionCode }, updates);

    await recordAuditEvent({
      user: auditUser,
      request,
      action: "accounts.ledger.edit",
      entityType: "transaction",
      entityId: transactionCode,
      target: transactionCode,
      before: current,
      after: updated[0] || updates,
      details: {
        historical: true,
        previousActionName: "historical_ledger_edit",
      },
    });

    return NextResponse.json(
      { success: true, data: updated[0] || null },
      { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } },
    );
  } catch (error) {
    await auditFailure({
      user: auditUser,
      request,
      action: "accounts.ledger.edit",
      entityType: "transaction",
      entityId: auditTransactionCode,
      target: auditTransactionCode,
      before: auditBefore,
      after: auditAfter,
      error,
    });
    const message = error instanceof Error ? error.message : "Could not update the historical ledger entry.";
    return NextResponse.json({ success: false, error: message }, { status: /session/i.test(message) ? 401 : 502, headers: { "Cache-Control": "no-store" } });
  }
}
