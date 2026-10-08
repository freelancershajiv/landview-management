import { NextRequest, NextResponse } from "next/server";
import {
  QUICK_USER_COOKIE,
  readSignedWorkspaceUser,
  requireLocalSession,
} from "@/lib/local-session";
import { normalizeProjectCode, roleOf, selectRows, insertRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCESS_ROLES = new Set(["admin", "manager", "accounts"]);
const MUNICIPALITY_SCOPE = "municipality_file_pass";

function text(value: unknown, max = 1200) {
  return String(value ?? "").trim().slice(0, max);
}
function num(value: unknown) {
  const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function actorOf(user: Record<string, unknown>) {
  return text(user.employeeId || user.Employee_ID || user.userId || user.User_ID || user.username || user.Username || "LAND VIEW", 160);
}
function dhakaToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";
  return year && month && day ? `${year}-${month}-${day}` : new Date().toISOString().slice(0, 10);
}
async function requireFinanceUser(request: NextRequest) {
  let user = await requireLocalSession(request) as Record<string, unknown> | null;
  if (!user) user = readSignedWorkspaceUser(request.cookies.get(QUICK_USER_COOKIE)?.value) as Record<string, unknown> | null;
  if (!user) throw new Error("Session could not be validated. Refresh the page and try again.");
  if (!ACCESS_ROLES.has(roleOf(user))) throw new Error("Finance access is required.");
  return user;
}
function responseStatus(message: string) {
  if (/session/i.test(message)) return 401;
  if (/access/i.test(message)) return 403;
  if (/choose|valid|required|no municipality balance|not found/i.test(message)) return 400;
  return 502;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireFinanceUser(request);
    const currentRole = roleOf(user);
    const [transactions, projects, accounts, expenses] = await Promise.all([
      selectRows("transactions", { filters: { finance_scope: MUNICIPALITY_SCOPE }, order: "transaction_date:desc", limit: 5000 }),
      selectRows("projects", { order: "project_code:asc", limit: 5000 }),
      selectRows("accounts", { order: "account_name:asc", limit: 1000 }),
      selectRows("expenses", { filters: { finance_scope: MUNICIPALITY_SCOPE }, limit: 5000 }),
    ]);
    const projectMap = new Map(projects.map((row) => [row.id, row.project_code]));
    const accountMap = new Map(accounts.map((row) => [row.id, row.account_name || row.account_code]));
    const expenseMap = new Map(expenses.map((row) => [row.expense_code, row]));
    const canWorkExpenses = ACCESS_ROLES.has(currentRole);
    return NextResponse.json({
      success: true,
      data: {
        canAddExpense: canWorkExpenses,
        canEditExpenses: canWorkExpenses,
        canSendToMainLedger: currentRole === "admin",
        transactions: transactions.map((row) => {
          const sourceType = text(row.source_type, 120);
          const isTransfer = sourceType === "MUNICIPALITY_TRANSFER_OUT";
          const sourceExpense = sourceType === "EXPENSE" ? expenseMap.get(row.source_id) : undefined;
          return {
            id: row.transaction_code,
            sourceId: row.source_id || "",
            date: row.transaction_date || "",
            type: isTransfer ? "Transfer" : num(row.credit) > 0 ? "Income" : "Expense",
            sourceType,
            projectId: projectMap.get(row.project_id) || row.project_code_snapshot || "",
            category: row.category || row.service_type || "Municipality Accounts",
            description: row.description || row.service_type || "Municipality Accounts",
            debit: num(row.debit),
            credit: num(row.credit),
            account: accountMap.get(row.account_id) || row.account_snapshot || "",
            method: row.payment_method || "",
            reference: row.reference_no || "",
            paidTo: sourceExpense?.paid_to || "",
            notes: sourceExpense?.notes || "",
            createdBy: row.source_created_by || "",
          };
        }),
        projects: projects.map((row) => ({ id: row.project_code, name: row.project_name || "", client: row.client_name_snapshot || "" })),
        accounts: accounts
          .filter((row) => text(row.status || "Active").toLowerCase() !== "inactive")
          .map((row) => ({ code: row.account_code || "", name: row.account_name || row.account_code || "" }))
          .filter((row) => row.name),
      },
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Municipality Accounts.";
    return NextResponse.json({ success: false, error: message }, { status: responseStatus(message), headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const user = await requireFinanceUser(request);
    const body = await request.json() as Record<string, unknown>;
    const action = text(body.action, 60) || "addExpense";
    const projectCode = normalizeProjectCode(body.Project_ID || body.projectId || "");
    if (!projectCode) return NextResponse.json({ success: false, error: "Choose a project." }, { status: 400 });
    const projects = await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 });
    if (!projects.length) return NextResponse.json({ success: false, error: `Project ${projectCode} was not found.` }, { status: 400 });

    const actor = actorOf(user);

    if (action === "updateExpense") {
      const sourceId = text(body.Source_ID || body.sourceId, 160);
      if (!sourceId) return NextResponse.json({ success: false, error: "Municipality expense source ID is required." }, { status: 400 });
      const existingRows = await selectRows("expenses", { filters: { expense_code: sourceId }, limit: 1 });
      const existing = existingRows[0];
      if (!existing || text(existing.finance_scope) !== MUNICIPALITY_SCOPE) return NextResponse.json({ success: false, error: "Municipality expense was not found." }, { status: 404 });

      const value = num(body.Amount || body.amount);
      if (!(value > 0)) return NextResponse.json({ success: false, error: "Enter a valid expense amount." }, { status: 400 });
      const date = text(body.Expense_Date || body.date, 20) || dhakaToday();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ success: false, error: "Choose a valid expense date." }, { status: 400 });
      const account = text(body.Account || body.Payment_Method || body.account, 160);
      if (!account) return NextResponse.json({ success: false, error: "Choose the account the expense was paid from." }, { status: 400 });

      const changes = {
        project_id: projects[0].id,
        expense_date: date,
        file_id: projectCode,
        project_name_snapshot: projects[0].project_name || null,
        category: text(body.Category || body.category, 200) || "Municipality Fee",
        description: text(body.Description || body.description, 1000) || "Municipality expense",
        amount: value,
        paid_to: text(body.Paid_To || body.paidTo, 250) || null,
        payment_method: account,
        reference_no: text(body.Reference_No || body.reference, 300) || null,
        notes: text(body.Notes || body.notes, 1000) || null,
        approved_by_code: actor,
        approved_at: new Date().toISOString(),
        service_type: "Municipality Accounts",
        finance_scope: MUNICIPALITY_SCOPE,
      };
      const saved = await updateRows("expenses", { expense_code: sourceId }, changes);
      if (!saved.length) throw new Error("Municipality expense update did not return a saved row.");
      return NextResponse.json({ success: true, data: saved[0] }, { headers: { "Cache-Control": "no-store", "X-Landview-Data": "supabase" } });
    }

    if (action === "sendToMainLedger") {
      if (roleOf(user) !== "admin") return NextResponse.json({ success: false, error: "Admin access is required to send Municipality balances to the Main Ledger." }, { status: 403 });
      const transferCode = `MUN-${crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`;
      const transferDate = dhakaToday();
      await insertRows("transactions", {
        transaction_code: `REQ-${transferCode}`,
        transaction_date: transferDate,
        transaction_type: "Transfer Request",
        source_type: "MUNICIPALITY_TRANSFER_REQUEST",
        source_id: transferCode,
        project_id: projects[0].id,
        project_code_snapshot: projectCode,
        account_snapshot: "Municipality Accounts",
        category: "Municipality Accounts Transfer",
        description: "Send remaining municipality balance to Main Ledger",
        debit: 0,
        credit: 0,
        status: "REQUEST",
        direction: "TRANSFER",
        amount: 0,
        payment_method: "Internal Transfer",
        source_created_by: actor,
        source_created_at: new Date().toISOString(),
        service_type: "Municipality Accounts",
        finance_scope: MUNICIPALITY_SCOPE,
      });
      const mainCode = `TXN-MUN-MAIN-${transferCode}`;
      const transferred = await selectRows("transactions", { filters: { transaction_code: mainCode }, limit: 1 });
      if (!transferred.length) throw new Error("Municipality transfer completed without a resolvable Main Ledger entry.");
      return NextResponse.json({ success: true, data: { transferCode, projectId: projectCode, amount: num(transferred[0].credit), date: transferred[0].transaction_date || transferDate, mainTransactionId: mainCode } }, { status: 201, headers: { "Cache-Control": "no-store", "X-Landview-Data": "supabase" } });
    }

    if (action !== "addExpense") return NextResponse.json({ success: false, error: "Unsupported Municipality Accounts action." }, { status: 400 });

    const value = num(body.Amount || body.amount);
    if (!(value > 0)) return NextResponse.json({ success: false, error: "Enter a valid expense amount." }, { status: 400 });
    const date = text(body.Expense_Date || body.date, 20) || dhakaToday();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ success: false, error: "Choose a valid expense date." }, { status: 400 });
    const account = text(body.Account || body.Payment_Method || body.account, 160);
    if (!account) return NextResponse.json({ success: false, error: "Choose the account the expense was paid from." }, { status: 400 });

    const expenseCode = `MFP-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
    const row = {
      expense_code: expenseCode,
      project_id: projects[0].id,
      expense_date: date,
      file_id: projectCode,
      project_name_snapshot: projects[0].project_name || null,
      category: text(body.Category || body.category, 200) || "Municipality Fee",
      description: text(body.Description || body.description, 1000) || "Municipality expense",
      amount: value,
      approval_status: "Approved",
      approved_by_code: actor,
      approved_at: new Date().toISOString(),
      paid_to: text(body.Paid_To || body.paidTo, 250) || null,
      payment_method: account,
      reference_no: text(body.Reference_No || body.reference, 300) || null,
      notes: text(body.Notes || body.notes, 1000) || null,
      status: "POSTED",
      source_created_by: actor,
      source_created_at: new Date().toISOString(),
      service_type: "Municipality Accounts",
      finance_scope: MUNICIPALITY_SCOPE,
    };
    const saved = await insertRows("expenses", row);
    return NextResponse.json({ success: true, data: saved[0] || row }, { status: 201, headers: { "Cache-Control": "no-store", "X-Landview-Data": "supabase" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Municipality Accounts action failed.";
    return NextResponse.json({ success: false, error: message }, { status: responseStatus(message), headers: { "Cache-Control": "no-store" } });
  }
}