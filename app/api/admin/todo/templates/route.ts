import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf, userIdOf } from "@/lib/local-session";
import { recordAuditEvent } from "@/lib/audit-log";
import { deleteTodoTemplate, listTodoTemplates, saveTodoTemplate, useTodoTemplate } from "@/lib/todo-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function text(value: unknown, max = 1000) { return String(value ?? "").trim().slice(0, max); }
function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } }); }
function originAllowed(request: NextRequest) {
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
  const role = roleOf(user);
  if (role !== "admin" && role !== "manager") throw new Error("Access denied.");
  return user;
}
function actorName(user: Row) { return text(user.name || user.Name || user.username || user.Username || userIdOf(user) || "LAND VIEW", 250); }

export async function GET(request: NextRequest) {
  try {
    await management(request);
    return json({ success: true, data: await listTodoTemplates() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ success: false, error: message }, /authentication/i.test(message) ? 401 : /access denied/i.test(message) ? 403 : 500);
  }
}

export async function POST(request: NextRequest) {
  if (!originAllowed(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  let user: Row | null = null;
  let input: Row = {};
  try {
    user = await management(request);
    input = await request.json().catch(() => ({})) as Row;
    const action = text(input.action, 40).toLowerCase();
    const who = actorName(user);

    if (action === "save") {
      const beforeId = text(input.template?.id, 80);
      const before = beforeId ? (await listTodoTemplates()).find((row) => row.id === beforeId) || null : null;
      const template = await saveTodoTemplate((input.template || {}) as Row, who);
      await recordAuditEvent({
        user,
        request,
        action: before ? "todo_template_updated" : "todo_template_created",
        entityType: "todo_template",
        entityId: template.template_code,
        before: before ? { name: before.name, recurrenceEnabled: before.recurrence_enabled, nextRunDate: before.next_run_date } : undefined,
        after: { name: template.name, recurrenceEnabled: template.recurrence_enabled, nextRunDate: template.next_run_date, checklistCount: template.checklist?.length || 0 },
        source: "todo-template",
      });
      return json({ success: true, data: template });
    }

    if (action === "use") {
      const id = text(input.id, 80);
      if (!id) throw new Error("Template ID is required.");
      const scheduledDate = text(input.scheduledDate, 20) || null;
      const todo = await useTodoTemplate(id, scheduledDate, `Template · ${who}`);
      const template = (await listTodoTemplates()).find((row) => row.id === id);
      await recordAuditEvent({
        user,
        request,
        action: "todo_created_from_template",
        entityType: "todo",
        entityId: todo.todo_code,
        after: { templateCode: template?.template_code || id, scheduledDate, title: todo.title },
        source: "todo-template",
      });
      return json({ success: true, data: todo });
    }

    if (action === "delete") {
      const id = text(input.id, 80);
      if (!id) throw new Error("Template ID is required.");
      const removed = await deleteTodoTemplate(id);
      await recordAuditEvent({ user, request, action: "todo_template_deleted", entityType: "todo_template", entityId: text(removed.template_code, 80), before: { name: removed.name, recurrenceEnabled: removed.recurrence_enabled }, source: "todo-template" });
      return json({ success: true, data: { deleted: true, id, templateCode: removed.template_code } });
    }

    throw new Error("Unsupported template action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Template request failed.";
    if (user) {
      await recordAuditEvent({ user, request, action: "todo_template_request", entityType: "todo_template", entityId: text(input.id || input.template?.id, 80), outcome: "failure", details: { requestedAction: text(input.action, 40), error: message }, source: "todo-template" }).catch(() => undefined);
    }
    return json({ success: false, error: message }, /authentication/i.test(message) ? 401 : /access denied/i.test(message) ? 403 : /required|not found|inactive|project|proposal|workflow|employee|reminder|recurr|start date|end date/i.test(message) ? 400 : 500);
  }
}
