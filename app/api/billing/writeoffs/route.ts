import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { employeeCodeOf, roleOf, selectRows, supabaseGateway } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FINANCE_ROLES = new Set(["admin", "manager", "accounts", "employee"]);
const WRITEOFF_ROLES = new Set(["admin", "manager", "accounts"]);

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
function cleanKey(value: unknown) {
  const key = String(value ?? "").trim();
  return /^[A-Za-z0-9._:-]{12,120}$/.test(key) ? key : "";
}
function actor(user: Record<string, unknown>) {
  return employeeCodeOf(user) || text(user.username || user.Username, 120) || "LAND VIEW";
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!FINANCE_ROLES.has(roleOf(user))) return NextResponse.json({ success: false, error: "Finance access is required." }, { status: 403 });

    const [events, projects] = await Promise.all([
      selectRows("billing_writeoff_log", { order: "created_at:asc", limit: 5000 }),
      selectRows("projects", { select: "id,project_code,project_name,client_name_snapshot", limit: 5000 }),
    ]);
    const projectMap = new Map(projects.map((project) => [String(project.id), project]));
    const data = events.map((event) => {
      const project = projectMap.get(String(event.project_id));
      return {
        id: String(event.id || ""),
        writeoffCode: String(event.writeoff_code || ""),
        projectId: String(project?.project_code || ""),
        projectName: String(project?.project_name || ""),
        clientName: String(project?.client_name_snapshot || ""),
        category: String(event.billing_category || ""),
        eventType: event.event_type === "recovery" ? "recovery" : "write_off",
        amount: num(event.amount),
        date: String(event.effective_date || ""),
        reason: String(event.reason || ""),
        notes: String(event.notes || ""),
        createdBy: String(event.created_by || ""),
        paymentId: String(event.payment_id || ""),
        createdAt: String(event.created_at || ""),
      };
    });
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load write-offs." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!WRITEOFF_ROLES.has(roleOf(user))) return NextResponse.json({ success: false, error: "Admin, manager or accounts access is required for write-offs." }, { status: 403 });

    const body = await request.json() as Record<string, unknown>;
    const action = text(body.action, 40);
    const projectCode = text(body.Project_ID || body.projectId, 60).toUpperCase();
    const category = text(body.Billing_Category || body.Category || body.category, 80);
    const amount = num(body.Amount || body.amount);
    const idempotencyKey = cleanKey(body.Idempotency_Key || body.idempotencyKey);
    if (!new Set(["saveWriteOff", "recoverWriteOff"]).has(action)) return NextResponse.json({ success: false, error: "Unsupported write-off action." }, { status: 400 });
    if (!projectCode) return NextResponse.json({ success: false, error: "Project is required." }, { status: 400 });
    if (!category) return NextResponse.json({ success: false, error: "Billing category is required." }, { status: 400 });
    if (!(amount > 0)) return NextResponse.json({ success: false, error: "Enter a valid amount." }, { status: 400 });
    if (!idempotencyKey) return NextResponse.json({ success: false, error: "A valid idempotency key is required." }, { status: 400 });

    const createdBy = actor(user as Record<string, unknown>);
    let data: unknown;
    if (action === "saveWriteOff") {
      const reason = text(body.Reason || body.reason, 160);
      const notes = text(body.Notes || body.notes, 1000);
      if (!reason) return NextResponse.json({ success: false, error: "Write-off reason is required." }, { status: 400 });
      if (!notes) return NextResponse.json({ success: false, error: "Add a note explaining why this amount is unrecoverable." }, { status: 400 });
      data = await supabaseGateway("applyBillingWriteOff", {
        projectCode,
        category,
        amount,
        writeoffDate: text(body.WriteOff_Date || body.Date || body.date, 20) || new Date().toISOString().slice(0, 10),
        reason,
        notes,
        createdBy,
        idempotencyKey,
      });
    } else {
      data = await supabaseGateway("recoverBillingWriteOff", {
        projectCode,
        category,
        amount,
        paymentDate: text(body.Payment_Date || body.Date || body.date, 20) || new Date().toISOString().slice(0, 10),
        paymentMethod: text(body.Payment_Method || body.method, 80) || "Bank Transfer",
        depositAccount: text(body.Deposit_Account || body.account, 120) || "Bank Account",
        reference: text(body.Reference_No || body.reference, 160),
        notes: text(body.Notes || body.notes, 1000),
        createdBy,
        idempotencyKey,
      });
    }

    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Write-off action failed.";
    const status = /required|invalid|cannot exceed|must be greater|note/i.test(message) ? 400 : 502;
    return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
