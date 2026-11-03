import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { recordAuditEvent } from "@/lib/audit-log";
import { selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Row = Record<string, any>;
type Operation = "assign" | "priority" | "deadline" | "complete";
type Phase = "preview" | "apply";
type ItemInput = { todoCode: string; expectedUpdatedAt: string };
type ItemResult = { todoCode: string; status: "ready" | "updated" | "skipped" | "conflict" | "error"; message: string };

const MAX_ITEMS = 25;
const VALID_PRIORITIES = new Set(["Low", "Normal", "High", "Urgent"]);
function text(value: unknown, max = 300) { return String(value ?? "").trim().slice(0, max); }
function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } }); }
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || req.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).origin === req.nextUrl.origin; } catch { return false; }
}
function isValidDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const ms = Date.parse(date + "T00:00:00Z");
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === date;
}
function isValidTime(value: string) { return value === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(value); }
function summary(results: ItemResult[]) {
  return {
    total: results.length,
    ready: results.filter(x => x.status === "ready").length,
    updated: results.filter(x => x.status === "updated").length,
    skipped: results.filter(x => x.status === "skipped").length,
    conflicts: results.filter(x => x.status === "conflict").length,
    failed: results.filter(x => x.status === "error").length,
  };
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  try {
    const user = await requireLocalSession(request);
    if (!user) return json({ success: false, error: "Authentication required." }, 401);
    if (!["admin", "manager"].includes(roleOf(user))) return json({ success: false, error: "Access denied." }, 403);

    const input = await request.json().catch(() => null) as Row | null;
    if (!input || typeof input !== "object" || Array.isArray(input)) return json({ success: false, error: "Invalid request." }, 400);
    const operation = text(input.operation, 30) as Operation;
    const phase = text(input.phase, 30) as Phase;
    if (!["assign", "priority", "deadline", "complete"].includes(operation)) return json({ success: false, error: "Unknown bulk operation." }, 400);
    if (phase !== "preview" && phase !== "apply") return json({ success: false, error: "Choose preview or apply." }, 400);
    if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > MAX_ITEMS) {
      return json({ success: false, error: "Select between 1 and 25 To Dos per batch." }, 400);
    }

    const items: ItemInput[] = [];
    const seen = new Set<string>();
    for (const raw of input.items) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) return json({ success: false, error: "Invalid selection." }, 400);
      const todoCode = text(raw.todoCode, 80).toUpperCase();
      const expectedUpdatedAt = text(raw.expectedUpdatedAt, 110);
      if (!/^TODO-[A-Z0-9-]{4,48}$/.test(todoCode) || !expectedUpdatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
        return json({ success: false, error: "Selection contains an invalid task or update version. Refresh the To Do Board." }, 400);
      }
      if (seen.has(todoCode)) return json({ success: false, error: "Duplicate To Do selection." }, 400);
      seen.add(todoCode);
      items.push({ todoCode, expectedUpdatedAt });
    }

    const target: Row = {};
    let description = "";
    if (operation === "priority") {
      const priority = text(input.priority, 20);
      if (!VALID_PRIORITIES.has(priority)) return json({ success: false, error: "Select a valid priority." }, 400);
      target.priority = priority;
      description = priority + " priority";
    } else if (operation === "assign") {
      const id = text(input.assignedEmployeeId, 80);
      if (id) {
        if (!/^[a-f0-9-]{36}$/i.test(id)) return json({ success: false, error: "Invalid employee ID." }, 400);
        const employees = await selectRows("employees", { filters: { id }, limit: 1 });
        const employee = employees[0];
        if (!employee || text(employee.status).toLowerCase() !== "active") {
          return json({ success: false, error: "Only an active employee can receive bulk assignments." }, 400);
        }
        target.assigned_employee_id = id;
        target.assigned_to = text(employee.employee_code, 80) + " · " + text(employee.name, 160);
        description = target.assigned_to;
      } else {
        target.assigned_employee_id = null;
        target.assigned_to = null;
        description = "Unassigned";
      }
    } else if (operation === "deadline") {
      const dueDate = text(input.dueDate, 20);
      const dueTime = text(input.dueTime, 20);
      if (dueDate && !isValidDate(dueDate)) return json({ success: false, error: "Choose a valid due date." }, 400);
      if (!isValidTime(dueTime) || (!dueDate && !!dueTime)) return json({ success: false, error: "A due time requires a valid due date." }, 400);
      target.due_date = dueDate || null;
      target.due_time = dueTime ? dueTime + ":00" : null;
      description = dueDate ? dueDate + (dueTime ? " at " + dueTime : " (end of day)") : "No deadline";
    } else {
      description = "Mark Done (Workflow stays unchanged)";
    }

    const rows = await selectRows("todo_items", {
      inFilters: { todo_code: items.map(i => i.todoCode) },
      select: "*",
      limit: MAX_ITEMS + 1,
    });
    const byCode = new Map(rows.map(row => [text(row.todo_code, 80), row]));
    const results: ItemResult[] = [];
    const warnings: string[] = [];

    for (const choice of items) {
      const current = byCode.get(choice.todoCode);
      if (!current) { results.push({ todoCode: choice.todoCode, status: "conflict", message: "Task not found. Refresh." }); continue; }
      if (text(current.updated_at, 110) !== choice.expectedUpdatedAt) {
        results.push({ todoCode: choice.todoCode, status: "conflict", message: "Task changed since selection. Refresh and review." });
        continue;
      }
      if (text(current.status, 30) === "Done") {
        results.push({ todoCode: choice.todoCode, status: "skipped", message: "Already completed. Bulk actions apply to open To Dos only." });
        continue;
      }
      if (operation === "assign" && text(current.assigned_employee_id, 80) === (target.assigned_employee_id || "")) {
        results.push({ todoCode: choice.todoCode, status: "skipped", message: "Already assigned to that employee." });
        continue;
      }
      if (operation === "priority" && text(current.priority, 20) === target.priority) {
        results.push({ todoCode: choice.todoCode, status: "skipped", message: "Priority is already set." });
        continue;
      }
      if (operation === "deadline" &&
        text(current.due_date, 20) === (target.due_date || "") &&
        text(current.due_time, 8).slice(0, 8) === (target.due_time || "")) {
        results.push({ todoCode: choice.todoCode, status: "skipped", message: "Deadline is already set." });
        continue;
      }
      if (phase === "preview") { results.push({ todoCode: choice.todoCode, status: "ready", message: description }); continue; }

      const changes: Row = { ...target, updated_at: new Date().toISOString() };
      if (operation === "assign" || operation === "deadline") {
        changes.reminder_sent_at = null;
        changes.overdue_notified_at = null;
        changes.notification_last_attempt_at = null;
        changes.notification_last_error = null;
      }
      if (operation === "deadline" && !target.due_date) {
        changes.reminder_enabled = false;
        changes.reminder_minutes_before = null;
      }
      if (operation === "complete") {
        changes.status = "Done";
        changes.completed_at = changes.updated_at;
      }
      try {
        const updated = await updateRows("todo_items", {
          id: current.id,
          updated_at: current.updated_at,
          status: current.status,
        }, changes);
        if (updated.length !== 1) {
          results.push({ todoCode: choice.todoCode, status: "conflict", message: "Task changed during the bulk action. Refresh." });
          continue;
        }
        const after = updated[0];
        results.push({ todoCode: choice.todoCode, status: "updated", message: description });
        try {
          await recordAuditEvent({
            user: user as Row,
            request,
            action: "todo_bulk_" + operation,
            entityType: "todo",
            entityId: choice.todoCode,
            before: {
              status: current.status, priority: current.priority,
              dueDate: current.due_date, dueTime: current.due_time,
              assignedEmployeeId: current.assigned_employee_id,
            },
            after: {
              status: after.status, priority: after.priority,
              dueDate: after.due_date, dueTime: after.due_time,
              assignedEmployeeId: after.assigned_employee_id,
              workflowUnchanged: true,
            },
            source: "todo-bulk",
          });
        } catch {
          warnings.push("Audit logging could not be confirmed for " + choice.todoCode);
        }
      } catch (error) {
        results.push({ todoCode: choice.todoCode, status: "error", message: text(error instanceof Error ? error.message : error, 350) });
      }
    }

    if (phase === "apply") {
      await recordAuditEvent({
        user: user as Row,
        request,
        action: "todo_bulk_batch",
        entityType: "todo_bulk",
        entityId: operation,
        after: { operation, result: summary(results), codes: items.map(x => x.todoCode) },
        source: "todo-bulk",
      }).catch(() => warnings.push("Batch audit record could not be confirmed."));
    }
    return json({
      success: true,
      data: { phase, operation, description, results, summary: summary(results), warnings, workflowUnchanged: true },
    });
  } catch (error) {
    return json({ success: false, error: text(error instanceof Error ? error.message : error, 600) }, 500);
  }
}
