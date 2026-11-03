import { NextRequest, NextResponse } from "next/server";
import { listTodoItems, type TodoItem } from "@/lib/todo-data";
import { selectRows, updateRows, upsertRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Row = Record<string, any>;

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const OVERDUE_GRACE_MS = 5 * 60 * 1000;
const ERROR_RETRY_MS = 30 * 60 * 1000;
const MAX_PER_RUN = 50;

function text(value: unknown, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

function authorized(request: NextRequest) {
  const secret = text(process.env.CRON_SECRET, 500);
  const auth = text(request.headers.get("authorization"), 600);
  return Boolean(secret && auth === `Bearer ${secret}`);
}

function canonicalPhone(value: unknown) {
  let digits = text(value, 100).replace(/\D/g, "");
  if (digits.startsWith("880") && digits.length >= 13) digits = `0${digits.slice(3)}`;
  else if (digits.startsWith("88") && digits.length >= 13) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("1")) digits = `0${digits}`;
  return /^01\d{9}$/.test(digits) ? digits : "";
}

function phoneToJid(value: unknown) {
  const phone = canonicalPhone(value);
  return phone ? `88${phone}@s.whatsapp.net` : "";
}

function deadlineMs(todo: TodoItem) {
  const dateMatch = text(todo.due_date, 20).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = text(todo.due_time, 20).match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!dateMatch || !timeMatch) return NaN;
  return Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
    Number(timeMatch[3] || 0),
  ) - DHAKA_OFFSET_MS;
}

function deadlineLabel(todo: TodoItem) {
  const ms = deadlineMs(todo);
  if (!Number.isFinite(ms)) return [todo.due_date, todo.due_time].filter(Boolean).join(" ");
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(ms));
}

function referenceLabel(todo: TodoItem) {
  if (todo.project_code) return `Project: ${todo.project_code}`;
  if (todo.proposal_code) return `Proposal: ${todo.proposal_code}`;
  return "General To Do";
}

function reminderLabel(minutes: number) {
  if (minutes === 0) return "due now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} before deadline`;
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return `${days} day${days === 1 ? "" : "s"} before deadline`;
  }
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? "" : "s"} before deadline`;
  }
  return `${minutes} minutes before deadline`;
}

function messageFor(todo: TodoItem, employee: Row, kind: "reminder" | "overdue") {
  const lines = kind === "overdue"
    ? ["🔴 *LAND VIEW — OVERDUE TO DO*", ""]
    : ["⏰ *LAND VIEW — TO DO REMINDER*", ""];
  const employeeName = text(employee.name, 160);
  if (employeeName) lines.push(`*Assigned To:* ${employeeName}`);
  lines.push(`*Task:* ${text(todo.title, 240)}`);
  lines.push(`*Deadline:* ${deadlineLabel(todo)}`);
  lines.push(`*Priority:* ${text(todo.priority, 40) || "Normal"}`);
  lines.push(`*${referenceLabel(todo)}*`);
  if (kind === "reminder") {
    lines.push(`*Reminder:* ${reminderLabel(Number(todo.reminder_minutes_before || 0))}`);
  } else {
    lines.push("*Status:* Deadline passed — task is still open");
  }
  lines.push("", "Open *Employee Workspace → To Do* to update the task.", "_LAND VIEW Architects & Engineers_");
  return lines.join("\n").slice(0, 4000);
}

async function wakeWhatsAppBot() {
  const base = text(process.env.WHATSAPP_BOT_URL, 1000).replace(/\/+$/, "");
  const token = text(process.env.WHATSAPP_BOT_API_TOKEN, 500);
  if (!base || !token) return;
  try {
    await fetch(`${base}/client/wake`, {
      method: "POST",
      headers: { "x-land-view-bot-token": token },
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
  } catch {
    // The durable Supabase outbox will still be picked up when the bot is available.
  }
}

async function queueEmployeeWhatsApp(todo: TodoItem, employee: Row, kind: "reminder" | "overdue") {
  const jid = phoneToJid(employee.phone_number);
  if (!jid) throw new Error("Assigned employee does not have a valid Bangladesh WhatsApp phone number.");

  const scheduleKey = `${text(todo.due_date, 20)}:${text(todo.due_time, 20)}:${Number(todo.reminder_minutes_before || 0)}`;
  const dedupeKey = `todo-${kind}:${text(todo.todo_code, 80)}:${scheduleKey}`.slice(0, 240);
  const existing = await selectRows("whatsapp_client_outbox", { filters: { dedupe_key: dedupeKey }, limit: 1 });
  if (existing.length) {
    const state = text(existing[0].status, 40).toLowerCase();
    if (state === "failed") throw new Error(text(existing[0].last_error, 700) || "WhatsApp delivery exhausted its retry limit.");
    return { queued: false, existing: true, status: state || "pending" };
  }

  await upsertRows("whatsapp_client_outbox", {
    conversation_id: null,
    to_jid: jid,
    message: messageFor(todo, employee, kind),
    status: "pending",
    attempt_count: 0,
    next_attempt_at: new Date().toISOString(),
    last_error: null,
    provider_message_id: null,
    dedupe_key: dedupeKey,
    source: "todo-reminder",
    event_key: `todo:${todo.todo_code}`,
    priority: kind === "overdue" ? "urgent" : "routine",
    recipient_group: "employee",
    template_key: kind === "overdue" ? "todo_overdue" : "todo_reminder",
    media_json: null,
    updated_at: new Date().toISOString(),
  }, "dedupe_key");
  return { queued: true, existing: false, status: "pending" };
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return json({ success: false, error: "Unauthorized." }, 401);

  const startedAt = new Date().toISOString();
  const now = Date.now();
  let scanned = 0;
  let eligible = 0;
  let remindersQueued = 0;
  let overdueQueued = 0;
  let skipped = 0;
  const errors: Array<{ todoCode: string; error: string }> = [];
  let shouldWake = false;

  try {
    const [todos, employees] = await Promise.all([
      listTodoItems(),
      selectRows("employees", { order: "employee_code:asc", limit: 5000 }),
    ]);
    const employeeById = new Map(employees.map((row) => [text(row.id, 80), row]));
    const candidates = todos.filter((todo) => todo.status !== "Done" && todo.reminder_enabled === true).slice(0, 2000);
    scanned = candidates.length;

    for (const todo of candidates) {
      if (eligible >= MAX_PER_RUN) break;
      const deadline = deadlineMs(todo);
      const minutesBefore = Number(todo.reminder_minutes_before);
      if (!Number.isFinite(deadline) || !Number.isFinite(minutesBefore) || minutesBefore < 0 || !todo.assigned_employee_id) {
        skipped += 1;
        continue;
      }

      if (todo.notification_last_error && todo.notification_last_attempt_at) {
        const lastAttempt = new Date(todo.notification_last_attempt_at).getTime();
        if (Number.isFinite(lastAttempt) && now - lastAttempt < ERROR_RETRY_MS) {
          skipped += 1;
          continue;
        }
      }

      const employee = employeeById.get(text(todo.assigned_employee_id, 80));
      if (!employee || text(employee.status, 40).toLowerCase() !== "active") {
        skipped += 1;
        continue;
      }

      const reminderAt = deadline - minutesBefore * 60_000;
      const overdueAt = deadline + OVERDUE_GRACE_MS;
      let kind: "reminder" | "overdue" | null = null;

      if (!todo.overdue_notified_at && now >= overdueAt) {
        kind = "overdue";
      } else if (!todo.reminder_sent_at) {
        const beforeDeadline = now < deadline;
        const dueNowWindow = minutesBefore === 0 && now >= deadline && now < overdueAt;
        if ((now >= reminderAt && beforeDeadline) || dueNowWindow) kind = "reminder";
      }

      if (!kind) {
        skipped += 1;
        continue;
      }

      eligible += 1;
      const attemptAt = new Date().toISOString();
      try {
        const result = await queueEmployeeWhatsApp(todo, employee, kind);
        shouldWake = shouldWake || result.queued;
        const changes: Row = {
          notification_last_attempt_at: attemptAt,
          notification_last_error: null,
          updated_at: attemptAt,
        };
        if (kind === "reminder") {
          changes.reminder_sent_at = attemptAt;
          remindersQueued += 1;
        } else {
          changes.overdue_notified_at = attemptAt;
          overdueQueued += 1;
        }
        await updateRows("todo_items", { todo_code: todo.todo_code }, changes);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ todoCode: todo.todo_code, error: text(message, 700) });
        await updateRows("todo_items", { todo_code: todo.todo_code }, {
          notification_last_attempt_at: attemptAt,
          notification_last_error: text(message, 1000),
          updated_at: attemptAt,
        }).catch(() => undefined);
      }
    }

    if (shouldWake) await wakeWhatsAppBot();

    return json({
      success: true,
      data: {
        startedAt,
        finishedAt: new Date().toISOString(),
        scanned,
        eligible,
        remindersQueued,
        overdueQueued,
        skipped,
        errors: errors.slice(0, 20),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ success: false, error: text(message, 1000), startedAt }, 500);
  }
}
