import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf, userIdOf } from "@/lib/local-session";
import { recordAuditEvent } from "@/lib/audit-log";
import { selectRows } from "@/lib/supabase-data";
import { listAutomationDashboard, previewTodoAutomations, processTodoAutomations, saveAutomationRule } from "@/lib/todo-automation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Row = Record<string, any>;
function text(value: unknown, max = 600) { return String(value ?? "").trim().slice(0, max); }
function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } }); }
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === request.nextUrl.hostname.toLowerCase() || host === "app.landview.com.bd" || host === "www.landview.com.bd" || host === "landview.com.bd" || host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");
  } catch { return false; }
}
async function management(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Authentication required.");
  if (!["admin","manager"].includes(roleOf(user))) throw new Error("Access denied.");
  return user;
}
function statusOf(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /authentication|required session/i.test(message) ? 401 : /access denied/i.test(message) ? 403 : /unknown|not found|active employee|offset|0 and 90/i.test(message) ? 400 : 500;
}
export async function GET(request: NextRequest) {
  try {
    await management(request);
    const mode = text(request.nextUrl.searchParams.get("mode"), 30);
    if (mode === "preview") return json({ success: true, data: await previewTodoAutomations() });
    const [dashboard, employees] = await Promise.all([
      listAutomationDashboard(),
      selectRows("employees", { order: "employee_code:asc", limit: 5000 }),
    ]);
    return json({ success: true, data: { ...dashboard, employees: employees.filter((r) => text(r.status).toLowerCase() === "active").map((r) => ({ id: r.id, employeeCode: r.employee_code, name: r.name })) } });
  } catch (error) { return json({ success: false, error: text(error instanceof Error ? error.message : error) }, statusOf(error)); }
}
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  let user: Row | null = null;
  let input: Row = {};
  try {
    user = await management(request);
    input = await request.json().catch(() => ({})) as Row;
    const action = text(input.action, 40).toLowerCase();
    if (action === "save") {
      const key = text(input.ruleKey, 100);
      const before = (await listAutomationDashboard()).rules.find((r) => r.rule_key === key);
      const updated = await saveAutomationRule(key, (input.rule || {}) as Row);
      await recordAuditEvent({ user, request, action: "todo_automation_rule_updated", entityType: "todo_automation_rule", entityId: key,
        before: before ? { enabled: before.enabled, assignedEmployeeId: before.assigned_employee_id, dueDays: before.due_days } : undefined,
        after: { enabled: updated.enabled, assignedEmployeeId: updated.assigned_employee_id, dueDays: updated.due_days }, source: "todo-automation" });
      return json({ success: true, data: updated });
    }
    if (action === "run") {
      const result = await processTodoAutomations(20);
      await recordAuditEvent({ user, request, action: "todo_automation_manual_run", entityType: "todo_automation",
        entityId: text(userIdOf(user) || user.name || "management"), after: result, source: "todo-automation" });
      return json({ success: true, data: result });
    }
    throw new Error("Unsupported automation action.");
  } catch (error) {
    if (user) await recordAuditEvent({ user, request, action: "todo_automation_request", entityType: "todo_automation_rule",
      entityId: text(input.ruleKey), outcome: "failure",
      details: { requestedAction: text(input.action), error: text(error instanceof Error ? error.message : error) }, source: "todo-automation" }).catch(() => undefined);
    return json({ success: false, error: text(error instanceof Error ? error.message : error) }, statusOf(error));
  }
}