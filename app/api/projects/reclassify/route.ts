import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { employeeCodeOf, roleOf, selectRows, supabaseGateway } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MANAGE_ROLES = new Set(["admin", "manager"]);

type Row = Record<string, any>;

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function text(value: unknown, max = 1000) { return String(value ?? "").trim().slice(0, max); }
function num(value: unknown) {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function normalizeProjectCode(value: unknown) {
  const raw = text(value, 60).toUpperCase();
  const match = raw.match(/LV[\s_-]*0*(\d+)/i);
  if (match?.[1]) return `LV-${Number(match[1])}`;
  const digits = raw.replace(/\D/g, "");
  return digits ? `LV-${Number(digits)}` : "";
}
function effectiveBill(row: Row) {
  return !["void","voided","cancelled","canceled","rejected"].includes(text(row.status).toLowerCase());
}
function effectivePayment(row: Row) {
  if (text(row.transaction_type).toLowerCase() === "personal income" || row.affects_business_balance === false) return false;
  const status = text(row.approval_status || row.status).toLowerCase().replace(/[_-]+/g, " ");
  return !status || ["approved","received","paid","verified","complete","completed","full paid","fully paid","posted"].includes(status);
}
function actor(user: Row) {
  return employeeCodeOf(user) || text(user.username || user.Username, 120) || "LAND VIEW";
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request) as Row | null;
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!MANAGE_ROLES.has(roleOf(user))) return NextResponse.json({ success: false, error: "Admin or manager access is required." }, { status: 403 });

    const [projects, bills, payments, invoices] = await Promise.all([
      selectRows("projects", { select: "id,project_code,project_name,client_name_snapshot,phone_number_snapshot,project_type,location,status,record_type,reclassified_proposal_code", order: "updated_at:desc", limit: 5000 }),
      selectRows("bills", { select: "id,project_id,amount,discount,net_amount,status", limit: 5000 }),
      selectRows("payments", { select: "id,project_id,amount,transaction_type,affects_business_balance,approval_status,status", limit: 5000 }),
      selectRows("invoices", { select: "id,project_id,status", limit: 5000 }),
    ]);

    const billsByProject = new Map<string, Row[]>();
    for (const bill of bills.filter(effectiveBill)) {
      const key = String(bill.project_id || "");
      const bucket = billsByProject.get(key) || [];
      bucket.push(bill);
      billsByProject.set(key, bucket);
    }
    const paymentsByProject = new Map<string, Row[]>();
    for (const payment of payments.filter(effectivePayment)) {
      const key = String(payment.project_id || "");
      const bucket = paymentsByProject.get(key) || [];
      bucket.push(payment);
      paymentsByProject.set(key, bucket);
    }
    const invoicesByProject = new Map<string, number>();
    for (const invoice of invoices) {
      const key = String(invoice.project_id || "");
      invoicesByProject.set(key, (invoicesByProject.get(key) || 0) + 1);
    }

    const rows = projects.map((project) => {
      const projectBills = billsByProject.get(String(project.id)) || [];
      const projectPayments = paymentsByProject.get(String(project.id)) || [];
      const billed = projectBills.reduce((sum, bill) => sum + num(bill.net_amount ?? (num(bill.amount) - num(bill.discount))), 0);
      const paid = projectPayments.reduce((sum, payment) => sum + num(payment.amount), 0);
      return {
        projectId: String(project.project_code || ""),
        projectName: String(project.project_name || ""),
        clientName: String(project.client_name_snapshot || ""),
        phone: String(project.phone_number_snapshot || ""),
        projectType: String(project.project_type || ""),
        location: String(project.location || ""),
        status: String(project.status || ""),
        recordType: String(project.record_type || "project"),
        proposalId: String(project.reclassified_proposal_code || ""),
        billCount: projectBills.length,
        invoiceCount: invoicesByProject.get(String(project.id)) || 0,
        billed,
        paid,
        due: Math.max(0, billed - paid),
        blocked: paid > 0,
      };
    });

    return NextResponse.json({ success: true, data: rows }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load project reclassification data." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const user = await requireLocalSession(request) as Row | null;
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!MANAGE_ROLES.has(roleOf(user))) return NextResponse.json({ success: false, error: "Admin or manager access is required." }, { status: 403 });

    const body = await request.json() as Row;
    const projectCode = normalizeProjectCode(body.projectId || body.Project_ID);
    if (!projectCode) return NextResponse.json({ success: false, error: "A valid project ID is required." }, { status: 400 });

    const data = await supabaseGateway("moveProjectToProposal", {
      projectCode,
      createdBy: actor(user),
    });

    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not move the project to Proposals.";
    const status = /payment|not found|required|already/i.test(message) ? 400 : 502;
    return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
