import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { normalizeProjectCode, roleOf, selectRows, insertRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACCESS_ROLES = new Set(["admin", "manager", "accounts"]);

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
async function requireFinanceUser(request: NextRequest) {
  const user = await requireLocalSession(request) as Record<string, unknown> | null;
  if (!user) throw new Error("Session expired.");
  if (!ACCESS_ROLES.has(roleOf(user))) throw new Error("Finance access is required.");
  return user;
}

export async function GET(request: NextRequest) {
  try {
    await requireFinanceUser(request);
    const [transactions, projects, accounts] = await Promise.all([
      selectRows("transactions", { filters: { finance_scope: "municipality_file_pass" }, order: "transaction_date:desc", limit: 5000 }),
      selectRows("projects", { order: "project_code:asc", limit: 5000 }),
      selectRows("accounts", { order: "account_name:asc", limit: 1000 }),
    ]);
    const projectMap = new Map(projects.map((row) => [row.id, row.project_code]));
    const accountMap = new Map(accounts.map((row) => [row.id, row.account_name || row.account_code]));
    return NextResponse.json({
      success: true,
      data: {
        transactions: transactions.map((row) => ({
          id: row.transaction_code,
          date: row.transaction_date || "",
          type: num(row.credit) > 0 ? "Income" : "Expense",
          projectId: projectMap.get(row.project_id) || row.project_code_snapshot || "",
          category: row.category || row.service_type || "Municipality File Pass",
          description: row.description || row.service_type || "Municipality File Pass",
          debit: num(row.debit),
          credit: num(row.credit),
          account: accountMap.get(row.account_id) || row.account_snapshot || "",
          method: row.payment_method || "",
          reference: row.reference_no || "",
          createdBy: row.source_created_by || "",
        })),
        projects: projects.map((row) => ({
          id: row.project_code,
          name: row.project_name || "",
          client: row.client_name_snapshot || "",
        })),
        accounts: accounts
          .filter((row) => text(row.status || "Active").toLowerCase() !== "inactive")
          .map((row) => ({ code: row.account_code || "", name: row.account_name || row.account_code || "" }))
          .filter((row) => row.name),
      },
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Municipality File Pass ledger.";
    const status = /session/i.test(message) ? 401 : /access/i.test(message) ? 403 : 502;
    return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const user = await requireFinanceUser(request);
    const body = await request.json() as Record<string, unknown>;
    const projectCode = normalizeProjectCode(body.Project_ID || body.projectId || "");
    if (!projectCode) return NextResponse.json({ success: false, error: "Choose a project." }, { status: 400 });
    const projects = await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 });
    if (!projects.length) return NextResponse.json({ success: false, error: `Project ${projectCode} was not found.` }, { status: 400 });

    const value = num(body.Amount || body.amount);
    if (!(value > 0)) return NextResponse.json({ success: false, error: "Enter a valid expense amount." }, { status: 400 });
    const date = text(body.Expense_Date || body.date, 20) || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ success: false, error: "Choose a valid expense date." }, { status: 400 });
    const account = text(body.Account || body.Payment_Method || body.account, 160);
    if (!account) return NextResponse.json({ success: false, error: "Choose the account the expense was paid from." }, { status: 400 });

    const actor = actorOf(user);
    const expenseCode = `MFP-${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
    const row = {
      expense_code: expenseCode,
      project_id: projects[0].id,
      expense_date: date,
      file_id: projectCode,
      project_name_snapshot: projects[0].project_name || null,
      category: text(body.Category || body.category, 200) || "Municipality File Pass",
      description: text(body.Description || body.description, 1000) || "Municipality File Pass expense",
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
      service_type: "Municipality File Pass",
      finance_scope: "municipality_file_pass",
    };
    const saved = await insertRows("expenses", row);
    return NextResponse.json({ success: true, data: saved[0] || row }, { status: 201, headers: { "Cache-Control": "no-store", "X-Landview-Data": "supabase" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add Municipality File Pass expense.";
    const status = /session/i.test(message) ? 401 : /access/i.test(message) ? 403 : /choose|valid|required/i.test(message) ? 400 : 502;
    return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
