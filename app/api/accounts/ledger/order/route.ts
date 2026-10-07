import { NextRequest, NextResponse } from "next/server";
import {
  QUICK_USER_COOKIE,
  readSignedWorkspaceUser,
  requireLocalSession,
} from "@/lib/local-session";
import { insertRows, roleOf, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const READ_ROLES = new Set(["admin", "manager", "accounts"]);
const LEDGER_LIVE_START = "2026-09-01";
const LEDGER_END = "2026-12-31";
const HISTORICAL_PREFIXES = ["TXN-HIST-2026-", "TXN-LEDGER-2025-"];

type DbRow = Record<string, unknown>;
type LedgerRow = {
  id: string;
  date: string;
  debit: number;
  credit: number;
  order: number | null;
  description: string;
  category: string;
  projectCode: string;
  transactionType: string;
  status: string;
};

type LedgerStateRow = {
  id: string;
  date: string;
  order: number | null;
  position: number;
  dayCount: number;
  balance: number;
};

function text(value: unknown, max = 1500) {
  return String(value ?? "").trim().slice(0, max);
}
function number(value: unknown) {
  const parsed = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}
function positiveInteger(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
function normalizeStatus(value: unknown) {
  return text(value, 100).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}
function validMonthKey(value: unknown) {
  const month = text(value, 7);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : "";
}
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function ledgerEntryRank(row: LedgerRow) {
  if (row.credit > 0 && row.debit <= 0) return 0;
  if (row.debit > 0 && row.credit <= 0) return 1;
  return row.credit >= row.debit ? 0 : 1;
}
function fallbackWording(row: LedgerRow) {
  return [row.description, row.category, row.projectCode, row.id].map((value) => text(value)).filter(Boolean).join(" ").toLowerCase();
}
function compareWithinDate(a: LedgerRow, b: LedgerRow) {
  if (a.order !== null && b.order !== null && a.order !== b.order) return a.order - b.order;
  if (a.order !== null && b.order === null) return -1;
  if (a.order === null && b.order !== null) return 1;
  const entryOrder = ledgerEntryRank(a) - ledgerEntryRank(b);
  if (entryOrder) return entryOrder;
  const wordingOrder = fallbackWording(a).localeCompare(fallbackWording(b), undefined, { numeric: true, sensitivity: "base" });
  if (wordingOrder) return wordingOrder;
  return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: "base" });
}
function isLedgerTransaction(row: LedgerRow) {
  const historical = HISTORICAL_PREFIXES.some((prefix) => row.id.startsWith(prefix));
  if (historical) return true;
  if (normalizeStatus(row.status) !== "posted") return false;
  if (["transfer", "personal income", "personal expense"].includes(normalizeStatus(row.transactionType))) return false;
  return row.date >= LEDGER_LIVE_START && row.date <= LEDGER_END;
}
function toLedgerRow(row: DbRow): LedgerRow {
  return {
    id: text(row.transaction_code, 160), date: text(row.transaction_date, 20), debit: number(row.debit), credit: number(row.credit), order: positiveInteger(row.ledger_order),
    description: text(row.description), category: text(row.category, 300), projectCode: text(row.project_code_snapshot, 160), transactionType: text(row.transaction_type, 100), status: text(row.status, 100) || "Posted",
  };
}
async function loadLedgerRows() {
  const rows = await selectRows("transactions", { limit: 5000 });
  return rows.map(toLedgerRow).filter((row) => row.id && row.date && (row.debit > 0 || row.credit > 0) && isLedgerTransaction(row));
}
function buildState(rows: LedgerRow[], openingBalance = 0, statementDisplay = false) {
  const chronological = [...rows].sort((a, b) => {
    const dateOrder = a.date.localeCompare(b.date);
    return dateOrder || compareWithinDate(a, b);
  });
  const dayGroups = new Map<string, LedgerRow[]>();
  for (const row of chronological) { const group = dayGroups.get(row.date) || []; group.push(row); dayGroups.set(row.date, group); }
  let balance = openingBalance;
  const state = chronological.map<LedgerStateRow>((row) => {
    balance += row.credit - row.debit;
    const group = dayGroups.get(row.date) || [];
    const position = group.findIndex((item) => item.id === row.id);
    return { id: row.id, date: row.date, order: row.order, position: position >= 0 ? position + 1 : 1, dayCount: group.length, balance };
  });
  if (!statementDisplay || !state.length) return state;
  const stateById = new Map(state.map((row) => [row.id, row]));
  const displayOrder = [...chronological].sort((a, b) => {
    const dateOrder = b.date.localeCompare(a.date);
    return dateOrder || compareWithinDate(a, b);
  });
  let displayBalance = openingBalance + chronological.reduce((sum, row) => sum + row.credit - row.debit, 0);
  for (const row of displayOrder) {
    const item = stateById.get(row.id);
    if (item) item.balance = displayBalance;
    displayBalance -= row.credit - row.debit;
  }
  return state;
}
function buildMonthState(rows: LedgerRow[], monthKey: string) {
  const monthStart = `${monthKey}-01`;
  const openingBalance = rows.reduce((sum, row) => row.date >= monthStart ? sum : sum + row.credit - row.debit, 0);
  const monthRows = rows.filter((row) => row.date.slice(0, 7) === monthKey);
  return buildState(monthRows, openingBalance, true);
}
function stateFor(rows: LedgerRow[], monthKey: string) {
  return monthKey ? buildMonthState(rows, monthKey) : buildState(rows, 0, true);
}
async function stabilizeDayOrder(dayRows: LedgerRow[]) {
  for (let index = 0; index < dayRows.length; index += 1) {
    const expected = index + 1;
    if (dayRows[index].order !== expected) { await updateRows("transactions", { transaction_code: dayRows[index].id }, { ledger_order: expected }); dayRows[index].order = expected; }
  }
}
async function saveDayOrder(dayRows: LedgerRow[]) {
  for (let index = 0; index < dayRows.length; index += 1) {
    const expected = index + 1;
    if (dayRows[index].order !== expected) { await updateRows("transactions", { transaction_code: dayRows[index].id }, { ledger_order: expected }); dayRows[index].order = expected; }
  }
}
async function requireLedgerUser(request: NextRequest) {
  let user = await requireLocalSession(request);
  if (!user) user = readSignedWorkspaceUser(request.cookies.get(QUICK_USER_COOKIE)?.value);
  if (!user) return { error: NextResponse.json({ success: false, error: "Session could not be validated. Refresh the page and try again." }, { status: 401, headers: { "Cache-Control": "no-store, max-age=0" } }) };
  if (!READ_ROLES.has(roleOf(user))) return { error: NextResponse.json({ success: false, error: "Ledger access is required." }, { status: 403 }) };
  return { user };
}

export async function GET(request: NextRequest) {
  try {
    const access = await requireLedgerUser(request);
    if (access.error) return access.error;
    const requestedMonth = request.nextUrl.searchParams.get("month");
    const monthKey = requestedMonth ? validMonthKey(requestedMonth) : "";
    if (requestedMonth && !monthKey) return NextResponse.json({ success: false, error: "Month must use YYYY-MM format." }, { status: 400 });
    const rows = await loadLedgerRows();
    return NextResponse.json({ success: true, rows: stateFor(rows, monthKey), month: monthKey || null }, { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load ledger order.";
    return NextResponse.json({ success: false, error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const access = await requireLedgerUser(request);
    if (access.error) return access.error;
    if (roleOf(access.user) !== "admin") return NextResponse.json({ success: false, error: "Admin access is required to reorder ledger history." }, { status: 403 });

    const body = await request.json() as Record<string, unknown>;
    const transactionId = text(body.transactionId || body.Transaction_ID, 160);
    const direction = text(body.direction, 20).toLowerCase();
    const targetTransactionId = text(body.targetTransactionId, 160);
    const placement = text(body.placement, 20).toLowerCase();
    const requestedMonth = text(body.month, 20);
    const monthKey = requestedMonth ? validMonthKey(requestedMonth) : "";
    const dragRequest = Boolean(targetTransactionId);
    if (requestedMonth && !monthKey) return NextResponse.json({ success: false, error: "Month must use YYYY-MM format." }, { status: 400 });
    if (!transactionId) return NextResponse.json({ success: false, error: "Transaction ID is required." }, { status: 400 });
    if (dragRequest) {
      if (placement !== "before" && placement !== "after") return NextResponse.json({ success: false, error: "Placement must be before or after." }, { status: 400 });
    } else if (direction !== "up" && direction !== "down") return NextResponse.json({ success: false, error: "Direction must be up or down." }, { status: 400 });

    const allRows = await loadLedgerRows();
    const current = allRows.find((row) => row.id === transactionId);
    if (!current) return NextResponse.json({ success: false, error: "Ledger transaction was not found." }, { status: 404 });
    if (monthKey && current.date.slice(0, 7) !== monthKey) return NextResponse.json({ success: false, error: "Only entries from the current month can be reordered here." }, { status: 400 });
    const dayRows = allRows.filter((row) => row.date === current.date).sort(compareWithinDate);
    const currentIndex = dayRows.findIndex((row) => row.id === transactionId);
    if (currentIndex < 0) return NextResponse.json({ success: false, error: "Ledger transaction was not found for its date." }, { status: 404 });
    await stabilizeDayOrder(dayRows);
    const actor = text((access.user as Record<string, unknown>).User_ID || (access.user as Record<string, unknown>).userId || (access.user as Record<string, unknown>).username || "LAND VIEW", 160);

    if (dragRequest) {
      if (targetTransactionId === transactionId) return NextResponse.json({ success: true, rows: stateFor(await loadLedgerRows(), monthKey), month: monthKey || null }, { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } });
      const target = dayRows.find((row) => row.id === targetTransactionId);
      if (!target) {
        const targetAnywhere = allRows.find((row) => row.id === targetTransactionId);
        return NextResponse.json({ success: false, error: targetAnywhere ? "Ledger entries can only be dragged within the same date." : "Drop target was not found." }, { status: 400 });
      }
      const fromOrder = current.order || currentIndex + 1;
      const withoutCurrent = dayRows.filter((row) => row.id !== transactionId);
      const targetIndex = withoutCurrent.findIndex((row) => row.id === targetTransactionId);
      let insertIndex = placement === "after" ? targetIndex + 1 : targetIndex;
      insertIndex = Math.max(0, Math.min(insertIndex, withoutCurrent.length));
      withoutCurrent.splice(insertIndex, 0, current);
      await saveDayOrder(withoutCurrent);
      const toOrder = withoutCurrent.findIndex((row) => row.id === transactionId) + 1;
      if (toOrder !== fromOrder) await insertRows("app_audit_log", { actor_user_key: actor, action: "ledger_reorder_drag", target: transactionId, outcome: "success", details: { transaction_date: current.date, month: monthKey || null, moved_relative_to: targetTransactionId, placement, from_order: fromOrder, to_order: toOrder } });
    } else {
      const neighborIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (neighborIndex >= 0 && neighborIndex < dayRows.length) {
        const first = dayRows[currentIndex], second = dayRows[neighborIndex];
        const firstOrder = first.order || currentIndex + 1, secondOrder = second.order || neighborIndex + 1;
        await updateRows("transactions", { transaction_code: first.id }, { ledger_order: secondOrder });
        await updateRows("transactions", { transaction_code: second.id }, { ledger_order: firstOrder });
        first.order = secondOrder; second.order = firstOrder;
        await insertRows("app_audit_log", { actor_user_key: actor, action: "ledger_reorder", target: transactionId, outcome: "success", details: { transaction_date: current.date, month: monthKey || null, direction, swapped_with: second.id, from_order: firstOrder, to_order: secondOrder } });
      }
    }
    const refreshed = await loadLedgerRows();
    return NextResponse.json({ success: true, rows: stateFor(refreshed, monthKey), month: monthKey || null }, { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not reorder the ledger entry.";
    return NextResponse.json({ success: false, error: message }, { status: /session/i.test(message) ? 401 : 502, headers: { "Cache-Control": "no-store" } });
  }
}
