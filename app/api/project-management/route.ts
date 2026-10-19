// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { selectRows } from "@/lib/supabase-data";
import {
  GET as legacyGET,
  POST as legacyPOST,
  PUT as legacyPUT,
  DELETE as legacyDELETE,
} from "./legacy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
const num = (value: unknown) => {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const clean = (value: unknown, max = 1000) => String(value ?? "").trim().slice(0, max);
const jsonHeaders = { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" };

function emptySupplierWorkspace() {
  return {
    depositAmount: 0,
    depositCount: 0,
    deliveredQuantity: 0,
    deliveredValue: 0,
    deliveryCount: 0,
    holdAmount: 0,
    overDeliveredValue: 0,
    deposits: [],
    deliveries: [],
  };
}

function sortLedgerRows(rows: Row[]) {
  return rows.slice().sort((a: Row, b: Row) => {
    const date = String(a.entry_date || "").localeCompare(String(b.entry_date || ""));
    if (date) return date;
    const serial = num(a.serial_no) - num(b.serial_no);
    if (serial) return serial;
    const created = String(a.created_at || "").localeCompare(String(b.created_at || ""));
    if (created) return created;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}

function cleanLv157Entries(rows: Row[]) {
  let runningBalance = 0;
  let incomeBalance = 0;
  let expenseBalance = 0;
  let runningChequeOnHold = 0;

  return sortLedgerRows(rows).map((row: Row) => {
    const debit = num(row.debit);
    const credit = num(row.credit);
    const held = (
      clean(row.cheque_status, 40).toLowerCase() === "on_hold" ||
      /^CHEQUE_STATUS:ON_HOLD/i.test(clean(row.memo, 1000))
    ) ? debit : 0;

    runningBalance = Math.round((runningBalance + debit - credit) * 100) / 100;
    incomeBalance = Math.round((incomeBalance + debit) * 100) / 100;
    expenseBalance = Math.round((expenseBalance + credit) * 100) / 100;
    runningChequeOnHold = Math.round((runningChequeOnHold + held) * 100) / 100;
    const availableCashBalance = Math.round((runningBalance - runningChequeOnHold) * 100) / 100;

    return {
      ...row,
      debit,
      credit,
      sft: num(row.sft),
      rate: num(row.rate),
      balance: runningBalance,
      income_balance: incomeBalance,
      expense_balance: expenseBalance,
      supplier_allocation: 0,
      supplier_advance_applied: 0,
      supplier_movement_type: null,
      cheque_on_hold: held,
      available_cash_balance: availableCashBalance,
      paid_to: clean(row.paid_to || (credit > 0 ? row.supplier : ""), 160),
      received_from: clean(row.received_from, 160),
    };
  });
}

function categoriesFrom(entries: Row[]) {
  const names = Array.from(new Set(
    entries.map((row: Row) => clean(row.category || "Other Expenses", 120)).filter(Boolean)
  )).sort((a, b) => String(a).localeCompare(String(b)));

  return names.map((category) => {
    const matching = entries.filter((row: Row) => String(row.category || "") === category);
    return {
      category,
      total: matching.reduce((sum: number, row: Row) => sum + num(row.debit) + num(row.credit), 0),
      count: matching.length,
    };
  });
}

export async function GET(request: NextRequest) {
  const legacyResponse = await legacyGET(request);
  let payload: any;
  try {
    payload = await legacyResponse.json();
  } catch {
    return legacyResponse;
  }

  const selected = payload?.data?.selectedProject;
  if (!legacyResponse.ok || !payload?.success || clean(selected?.projectCode, 40) !== "LV-157") {
    return NextResponse.json(payload, { status: legacyResponse.status, headers: jsonHeaders });
  }

  const rows = await selectRows("project_management_ledger", {
    filters: { project_id: selected.id },
    order: "entry_date:asc",
    limit: 10000,
  });
  const entries = cleanLv157Entries(rows);
  const debit = entries.reduce((sum: number, row: Row) => sum + num(row.debit), 0);
  const credit = entries.reduce((sum: number, row: Row) => sum + num(row.credit), 0);
  const chequeOnHold = entries.reduce((sum: number, row: Row) => sum + num(row.cheque_on_hold), 0);
  const balance = Math.round((debit - credit) * 100) / 100;
  const engShajivBalance = Math.round((balance - chequeOnHold) * 100) / 100;

  payload.data = {
    ...payload.data,
    entries,
    totals: { debit, credit, balance },
    summary: {
      ...(payload.data.summary || {}),
      supplierAdvance: 0,
      supplierAdvanceSource: "disabled",
      chequeOnHold,
      engShajivBalance,
      notes: "LV-157 rebuilt from the uploaded ledger sheet. Supplier advance and delivery are not configured.",
    },
    sattapurBricks: emptySupplierWorkspace(),
    categories: categoriesFrom(entries),
    // Keep the live supplier/contract master returned by the legacy workspace.
    // LV-157 cash calculations above remain ledger-only; restoring this list only
    // makes saved suppliers/contractors available to Add Expense and billing UI.
    contractorBills: payload.data.contractorBills || { contracts: [], bills: [], totals: { contractValue: 0, certifiedAmount: 0, paidAmount: 0, advance: 0, balancePayable: 0, remainingContract: 0, overCertified: 0, configuredContractCount: 0, unconfiguredContractCount: 0 } },
  };

  return NextResponse.json(payload, { status: legacyResponse.status, headers: jsonHeaders });
}

export async function POST(request: NextRequest) {
  const probe = request.clone();
  let body: any = null;
  try { body = await probe.json(); } catch {}
  if (body?.action === "saveSattapurDelivery") {
    return NextResponse.json(
      { success: false, error: "Supplier delivery is not enabled for LV-157 yet." },
      { status: 400, headers: jsonHeaders },
    );
  }
  return legacyPOST(request);
}

export async function PUT(request: NextRequest) {
  return legacyPUT(request);
}

export async function DELETE(request: NextRequest) {
  return legacyDELETE(request);
}
