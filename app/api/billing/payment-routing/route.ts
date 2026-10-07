import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { normalizeProjectCode, roleOf, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EDIT_ROLES = new Set(["admin", "manager", "accounts"]);
const BILLING_CATEGORIES = new Set(["Engineering Bill", "Supervision Bill", "Other Services Bill"]);
const OTHER_SERVICE_TYPES = new Set(["Soil Test", "Digital Survey", "Municipality File Pass"]);

function text(value: unknown, max = 1000) {
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
function effectivePayment(row: Record<string, unknown>) {
  if (text(row.transaction_type).toLowerCase() === "personal income" || row.affects_business_balance === false) return false;
  const status = text(row.approval_status || row.status).toLowerCase().replace(/[_-]+/g, " ");
  return !status || ["approved", "pre approved", "received", "paid", "verified", "complete", "completed", "full paid", "fully paid", "posted"].includes(status);
}
function historicalPayment(row: Record<string, unknown>) {
  const code = text(row.payment_code).toUpperCase();
  return code.startsWith("TXN-HIST-") || code.startsWith("TXN-LEDGER-");
}
async function requireEditor(request: NextRequest) {
  const user = await requireLocalSession(request) as Record<string, unknown> | null;
  if (!user) throw new Error("Session expired.");
  if (!EDIT_ROLES.has(roleOf(user))) throw new Error("Admin, Manager or Accounts access is required to edit project payment routing.");
  return user;
}
function statusCode(message: string) {
  if (/session/i.test(message)) return 401;
  if (/access|required to edit/i.test(message)) return 403;
  if (/required|choose|not found|invalid/i.test(message)) return 400;
  return 502;
}

export async function GET(request: NextRequest) {
  try {
    await requireEditor(request);
    const projectCode = normalizeProjectCode(request.nextUrl.searchParams.get("projectId") || "");
    const projects = projectCode
      ? await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 })
      : await selectRows("projects", { order: "project_code:asc", limit: 5000 });
    if (projectCode && !projects.length) {
      return NextResponse.json({ success: false, error: `Project ${projectCode} was not found.` }, { status: 404 });
    }

    const projectIds = projects.map((project) => project.id).filter(Boolean);
    const payments = projectCode && projectIds[0]
      ? await selectRows("payments", { filters: { project_id: projectIds[0] }, order: "payment_date:desc", limit: 5000 })
      : await selectRows("payments", { order: "payment_date:desc", limit: 5000 });
    const projectMap = new Map(projects.map((project) => [project.id, project]));

    const rows = payments
      .filter((payment) => payment.project_id && effectivePayment(payment) && !historicalPayment(payment))
      .map((payment) => {
        const project = projectMap.get(payment.project_id);
        return {
          paymentId: payment.payment_code,
          projectId: project?.project_code || payment.project_code_snapshot || "",
          projectName: project?.project_name || "",
          clientName: project?.client_name_snapshot || "",
          date: payment.payment_date || "",
          amount: num(payment.amount),
          category: payment.income_category || payment.payment_for || "Engineering Bill",
          serviceType: payment.service_type || "",
          financeScope: payment.finance_scope || "main",
          method: payment.payment_method || "",
          account: payment.deposit_account || "",
          reference: payment.reference_no || "",
          notes: payment.notes || "",
          status: payment.approval_status || payment.status || "",
        };
      });

    return NextResponse.json({
      success: true,
      data: {
        projectId: projectCode,
        payments: rows,
        projects: projects.map((project) => ({
          id: project.project_code,
          name: project.project_name || "",
          client: project.client_name_snapshot || "",
        })),
      },
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load project payments.";
    return NextResponse.json({ success: false, error: message }, { status: statusCode(message), headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    await requireEditor(request);
    const body = await request.json() as Record<string, unknown>;
    const paymentId = text(body.Payment_ID || body.paymentId, 180);
    if (!paymentId) return NextResponse.json({ success: false, error: "Payment ID is required." }, { status: 400 });

    const found = await selectRows("payments", { filters: { payment_code: paymentId }, limit: 1 });
    if (!found.length) return NextResponse.json({ success: false, error: "Payment not found." }, { status: 404 });
    const payment = found[0];
    if (!payment.project_id) return NextResponse.json({ success: false, error: "Only project billing payments can be reclassified here." }, { status: 400 });
    if (historicalPayment(payment)) return NextResponse.json({ success: false, error: "Historical ledger-only rows cannot be reclassified as project payments." }, { status: 400 });

    let category = text(body.Payment_For || body.Income_Category || body.category, 120) || text(payment.income_category || payment.payment_for, 120) || "Engineering Bill";
    let serviceType = text(body.Service_Type || body.serviceType, 120);
    if (serviceType === "Municipality File Pass") category = "Other Services Bill";
    if (!BILLING_CATEGORIES.has(category)) return NextResponse.json({ success: false, error: "Choose a valid billing category." }, { status: 400 });
    if (category === "Other Services Bill") {
      if (!OTHER_SERVICE_TYPES.has(serviceType)) return NextResponse.json({ success: false, error: "Choose Soil Test, Digital Survey or Municipality File Pass." }, { status: 400 });
    } else {
      serviceType = "";
    }

    const financeScope = serviceType === "Municipality File Pass" ? "municipality_file_pass" : "main";
    const saved = await updateRows("payments", { payment_code: paymentId }, {
      payment_for: category,
      income_category: category,
      service_type: serviceType || null,
      finance_scope: financeScope,
      source_updated_at: new Date().toISOString(),
    });
    if (!saved.length) throw new Error("Payment routing update returned no payment row.");

    const transactionCode = `TXN-PAY-${paymentId}`;
    const transactions = await selectRows("transactions", { filters: { transaction_code: transactionCode }, limit: 1 });
    const transaction = transactions[0] || null;
    if (effectivePayment(saved[0]) && (!transaction || text(transaction.finance_scope) !== financeScope)) {
      throw new Error("Payment was updated, but its ledger transaction did not synchronize correctly.");
    }

    return NextResponse.json({
      success: true,
      data: {
        paymentId,
        category,
        serviceType,
        financeScope,
        transactionCode: transaction?.transaction_code || "",
        ledger: financeScope === "municipality_file_pass" ? "Municipality File Pass" : "Main Finance",
      },
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update project payment routing.";
    return NextResponse.json({ success: false, error: message }, { status: statusCode(message), headers: { "Cache-Control": "no-store" } });
  }
}
