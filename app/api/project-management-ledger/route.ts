import { NextRequest, NextResponse } from "next/server";
import {
  GET as projectManagementGET,
  POST as projectManagementPOST,
  PUT as projectManagementPUT,
  DELETE as projectManagementDELETE,
} from "../project-management/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

const num = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const virtualIncomeSuffix = "::sattapur-income";
const isVirtualIncomeId = (value: unknown) => String(value || "").endsWith(virtualIncomeSuffix);
const sourceId = (value: unknown) => {
  const text = String(value || "");
  return isVirtualIncomeId(text) ? text.slice(0, -virtualIncomeSuffix.length) : text;
};

function isSattapurAccountingExpense(row: Row) {
  return num(row?.credit) > 0 &&
    num(row?.debit) === 0 &&
    (String(row?.category || "").trim().toLowerCase() === "sattapur bricks deposit" ||
      /SATTPUR_BRICKS_DEPOSIT/i.test(String(row?.memo || "")));
}

function createdBefore(value: unknown) {
  const parsed = Date.parse(String(value || ""));
  if (Number.isFinite(parsed)) return new Date(parsed - 1).toISOString();
  return String(value || "");
}

function expandSattapurFunding(data: Row) {
  const sourceEntries: Row[] = Array.isArray(data?.entries) ? data.entries : [];
  const deposits: Row[] = Array.isArray(data?.sattapurBricks?.deposits) ? data.sattapurBricks.deposits : [];
  const depositById = new Map(deposits.map((row: Row) => [String(row?.id || ""), row]));
  const expanded: Row[] = [];

  for (const row of sourceEntries) {
    if (isSattapurAccountingExpense(row)) {
      const deposit = depositById.get(String(row?.id || ""));
      const amount = num(deposit?.amount || row.credit);
      expanded.push({
        ...row,
        id: `${row.id}${virtualIncomeSuffix}`,
        source_entry_id: row.id,
        virtual_entry_side: "income",
        created_at: createdBefore(row.created_at),
        category: deposit?.category || "Bank Transfer",
        debit: amount,
        credit: 0,
      });
    }
    expanded.push(row);
  }

  expanded.sort((a: Row, b: Row) => {
    const date = String(a?.entry_date || "").localeCompare(String(b?.entry_date || ""));
    if (date) return date;
    const created = String(a?.created_at || "").localeCompare(String(b?.created_at || ""));
    if (created) return created;
    if (a?.virtual_entry_side === "income" && b?.virtual_entry_side !== "income") return -1;
    if (b?.virtual_entry_side === "income" && a?.virtual_entry_side !== "income") return 1;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });

  let balance = 0;
  let incomeBalance = 0;
  let expenseBalance = 0;
  for (const row of expanded) {
    const debit = num(row.debit);
    const credit = num(row.credit);
    incomeBalance += debit;
    expenseBalance += credit;
    balance += debit - credit;
    row.debit = debit;
    row.credit = credit;
    row.income_balance = incomeBalance;
    row.expense_balance = expenseBalance;
    row.balance = balance;
  }

  const categories = Array.from(new Set(expanded.map((row: Row) => String(row?.category || "Other Expenses").trim()).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b))
    .map((category) => {
      const matching = expanded.filter((row: Row) => String(row?.category || "Other Expenses").trim() === category);
      return {
        category,
        total: matching.reduce((sum: number, row: Row) => sum + num(row.debit) + num(row.credit), 0),
        count: matching.length,
      };
    });

  const debit = expanded.reduce((sum: number, row: Row) => sum + num(row.debit), 0);
  const credit = expanded.reduce((sum: number, row: Row) => sum + num(row.credit), 0);

  return {
    ...data,
    entries: expanded,
    categories,
    totals: { ...(data?.totals || {}), debit, credit, balance: debit - credit },
  };
}

async function jsonResponse(response: Response, transform = false) {
  const text = await response.text();
  let payload: any;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    return new Response(text, { status: response.status, headers: response.headers });
  }

  if (transform && response.ok && payload?.success && payload?.data?.selectedProject) {
    payload = { ...payload, data: expandSattapurFunding(payload.data) };
  }

  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  headers.delete("content-length");
  return NextResponse.json(payload, { status: response.status, headers });
}

async function currentDepositCategory(request: NextRequest, projectId: unknown, id: unknown) {
  const code = String(projectId || "").trim();
  const entryId = sourceId(id);
  if (!code || !entryId) return "";
  const url = new URL(request.url);
  url.pathname = "/api/project-management";
  url.search = "";
  url.searchParams.set("projectId", code);
  const lookupRequest = new NextRequest(url, { method: "GET", headers: request.headers });
  const response = await projectManagementGET(lookupRequest);
  if (!response.ok) return "";
  const payload = await response.json().catch(() => null);
  const deposits = Array.isArray(payload?.data?.sattapurBricks?.deposits) ? payload.data.sattapurBricks.deposits : [];
  return String(deposits.find((row: Row) => String(row?.id || "") === entryId)?.category || "");
}

export async function GET(request: NextRequest) {
  return jsonResponse(await projectManagementGET(request), true);
}

export async function POST(request: NextRequest) {
  return projectManagementPOST(request);
}

export async function PUT(request: NextRequest) {
  const body = await request.json() as Row;
  const originalId = body?.id;
  body.id = sourceId(originalId);

  // The expense-side row is derived from the same underlying Sattapur funding
  // transaction. If it is edited from the Expense Ledger, convert it back to
  // its original debit form before handing it to the canonical route.
  if (!isVirtualIncomeId(originalId) &&
      String(body?.category || "").trim().toLowerCase() === "sattapur bricks deposit" &&
      num(body?.credit) > 0 && num(body?.debit) === 0) {
    const originalCategory = await currentDepositCategory(request, body?.projectId, body.id);
    body.debit = num(body.credit);
    body.credit = 0;
    if (originalCategory) body.category = originalCategory;
  }

  const forwarded = new NextRequest(request.url, {
    method: "PUT",
    headers: request.headers,
    body: JSON.stringify(body),
  });
  return projectManagementPUT(forwarded);
}

export async function DELETE(request: NextRequest) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) url.searchParams.set("id", sourceId(id));
  const forwarded = new NextRequest(url, { method: "DELETE", headers: request.headers });
  return projectManagementDELETE(forwarded);
}
