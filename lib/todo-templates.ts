import { createTodoItem, deleteTodoItem, type TodoItem } from "@/lib/todo-data";
import { deleteRows, insertRows, normalizeProjectCode, selectRows, updateRows } from "@/lib/supabase-data";
import { recordAuditEvent } from "@/lib/audit-log";

type Row = Record<string, any>;

export type TodoTemplate = Row & {
  id: string;
  template_code: string;
  name: string;
  title: string;
  description?: string | null;
  priority: "Low" | "Normal" | "High" | "Urgent";
  reference_type: "None" | "Project" | "Proposal";
  project_code?: string | null;
  proposal_code?: string | null;
  workflow_id?: string | null;
  assigned_employee_id?: string | null;
  assigned_to?: string | null;
  due_time?: string | null;
  reminder_enabled: boolean;
  reminder_minutes_before?: number | null;
  recurrence_enabled: boolean;
  recurrence_type: "None" | "Daily" | "Weekly" | "Monthly";
  recurrence_interval: number;
  recurrence_weekday?: number | null;
  recurrence_day_of_month?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  next_run_date?: string | null;
  is_active: boolean;
  checklist?: string[];
  lastRun?: Row | null;
};

const PRIORITIES = new Set(["Low", "Normal", "High", "Urgent"]);
const RECURRENCES = new Set(["Daily", "Weekly", "Monthly"]);
const DAY_MS = 86_400_000;

function text(value: unknown, max = 1000) { return String(value ?? "").trim().slice(0, max); }
function integer(value: unknown, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? Math.trunc(n) : fallback; }
function isoDate(value: unknown) { const s = text(value, 20); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ""; }
function timeHHMM(value: unknown) { const s = text(value, 20); const m = s.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/); return m ? `${m[1]}:${m[2]}` : ""; }
function dateUtc(value: string) { const [y, m, d] = value.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); }
function formatDate(date: Date) { return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`; }
function addDays(value: string, days: number) { const d = dateUtc(value); d.setUTCDate(d.getUTCDate() + days); return formatDate(d); }
function addMonths(value: string, months: number, day: number) { const d = dateUtc(value); const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, day)); return formatDate(target); }
function compareDate(a: string, b: string) { return a.localeCompare(b); }
function maxDate(a: string, b: string) { return compareDate(a, b) >= 0 ? a : b; }

export function dhakaToday() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function scheduleSignature(row: Row) {
  return [
    Boolean(row.recurrence_enabled), text(row.recurrence_type, 20), integer(row.recurrence_interval, 1),
    row.recurrence_weekday ?? "", row.recurrence_day_of_month ?? "", isoDate(row.start_date), isoDate(row.end_date),
  ].join("|");
}

export function firstOccurrence(row: Row, floorDate = dhakaToday()) {
  if (!row.recurrence_enabled) return "";
  const type = text(row.recurrence_type, 20);
  const interval = Math.max(1, integer(row.recurrence_interval, 1));
  const start = isoDate(row.start_date);
  const end = isoDate(row.end_date);
  if (!start || !RECURRENCES.has(type)) return "";
  const floor = maxDate(start, isoDate(floorDate) || start);
  let candidate = start;

  if (type === "Daily") {
    const diff = Math.max(0, Math.floor((dateUtc(floor).getTime() - dateUtc(start).getTime()) / DAY_MS));
    candidate = addDays(start, Math.ceil(diff / interval) * interval);
  } else if (type === "Weekly") {
    const weekday = Math.min(6, Math.max(0, integer(row.recurrence_weekday, 0)));
    candidate = addDays(start, (weekday - dateUtc(start).getUTCDay() + 7) % 7);
    if (compareDate(candidate, floor) < 0) {
      const diff = Math.floor((dateUtc(floor).getTime() - dateUtc(candidate).getTime()) / DAY_MS);
      candidate = addDays(candidate, Math.ceil(diff / (7 * interval)) * 7 * interval);
    }
  } else {
    const day = Math.min(28, Math.max(1, integer(row.recurrence_day_of_month, 1)));
    const startObj = dateUtc(start);
    candidate = formatDate(new Date(Date.UTC(startObj.getUTCFullYear(), startObj.getUTCMonth(), day)));
    if (compareDate(candidate, start) < 0) candidate = addMonths(candidate, interval, day);
    let guard = 0;
    while (compareDate(candidate, floor) < 0 && guard < 2400) {
      candidate = addMonths(candidate, interval, day);
      guard += 1;
    }
  }
  return end && compareDate(candidate, end) > 0 ? "" : candidate;
}

export function nextOccurrence(row: Row, afterDate: string) {
  const type = text(row.recurrence_type, 20);
  const interval = Math.max(1, integer(row.recurrence_interval, 1));
  let candidate = "";
  if (type === "Daily") candidate = addDays(afterDate, interval);
  else if (type === "Weekly") candidate = addDays(afterDate, 7 * interval);
  else if (type === "Monthly") candidate = addMonths(afterDate, interval, Math.min(28, Math.max(1, integer(row.recurrence_day_of_month, 1))));
  const end = isoDate(row.end_date);
  return candidate && (!end || compareDate(candidate, end) <= 0) ? candidate : "";
}

function checklistFrom(input: Row) {
  const raw = Array.isArray(input.checklist) ? input.checklist : [];
  return raw.map((value) => text(value, 500)).filter(Boolean).slice(0, 100);
}

async function validateTemplate(input: Row, existing?: Row | null) {
  const name = text(input.name, 180);
  const title = text(input.title, 500);
  if (!name) throw new Error("Template name is required.");
  if (!title) throw new Error("To Do title is required.");

  const priority = PRIORITIES.has(text(input.priority, 20)) ? text(input.priority, 20) : "Normal";
  const referenceType = ["Project", "Proposal"].includes(text(input.referenceType ?? input.reference_type, 20)) ? text(input.referenceType ?? input.reference_type, 20) : "None";
  let projectCode: string | null = null;
  let proposalCode: string | null = null;
  let workflowId: string | null = null;

  if (referenceType === "Project") {
    projectCode = normalizeProjectCode(input.projectCode ?? input.project_code);
    if (!projectCode) throw new Error("Project is required for a Project template.");
    const projects = await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 });
    if (!projects.length) throw new Error("Selected project was not found.");
    workflowId = text(input.workflowId ?? input.workflow_id, 80) || null;
    if (workflowId) {
      const workflows = await selectRows("project_service_workflows", { filters: { id: workflowId }, limit: 1 });
      if (!workflows.length || text(workflows[0].project_code, 80).toUpperCase() !== projectCode.toUpperCase()) throw new Error("Selected Workflow service does not belong to this project.");
    }
  } else if (referenceType === "Proposal") {
    proposalCode = text(input.proposalCode ?? input.proposal_code, 120).toUpperCase();
    if (!proposalCode) throw new Error("Proposal is required for a Proposal template.");
    const proposals = await selectRows("proposals", { filters: { proposal_code: proposalCode }, limit: 1 });
    if (!proposals.length) throw new Error("Selected proposal was not found.");
  }

  let employeeId = text(input.assignedEmployeeId ?? input.assigned_employee_id, 80) || null;
  let assignedTo: string | null = null;
  if (employeeId) {
    const employees = await selectRows("employees", { filters: { id: employeeId }, limit: 1 });
    if (!employees.length || text(employees[0].status, 40).toLowerCase() !== "active") throw new Error("Assigned employee must be active.");
    assignedTo = [text(employees[0].employee_code, 80), text(employees[0].name, 180)].filter(Boolean).join(" · ");
  }

  const dueTime = timeHHMM(input.dueTime ?? input.due_time) || null;
  const reminderEnabled = input.reminderEnabled === true || input.reminder_enabled === true;
  const reminderMinutes = reminderEnabled ? Math.max(0, Math.min(10080, integer(input.reminderMinutesBefore ?? input.reminder_minutes_before, 0))) : null;
  if (reminderEnabled && !employeeId) throw new Error("A reminder requires an assigned employee.");
  if (reminderEnabled && !dueTime) throw new Error("A reminder requires a due time.");

  const recurrenceEnabled = input.recurrenceEnabled === true || input.recurrence_enabled === true;
  const recurrenceType = recurrenceEnabled && RECURRENCES.has(text(input.recurrenceType ?? input.recurrence_type, 20)) ? text(input.recurrenceType ?? input.recurrence_type, 20) : "None";
  const recurrenceInterval = recurrenceEnabled ? Math.max(1, Math.min(365, integer(input.recurrenceInterval ?? input.recurrence_interval, 1))) : 1;
  const recurrenceWeekday = recurrenceEnabled && recurrenceType === "Weekly" ? Math.max(0, Math.min(6, integer(input.recurrenceWeekday ?? input.recurrence_weekday, 0))) : null;
  const recurrenceDay = recurrenceEnabled && recurrenceType === "Monthly" ? Math.max(1, Math.min(28, integer(input.recurrenceDayOfMonth ?? input.recurrence_day_of_month, 1))) : null;
  const startDate = recurrenceEnabled ? isoDate(input.startDate ?? input.start_date) : null;
  const endDate = recurrenceEnabled ? (isoDate(input.endDate ?? input.end_date) || null) : null;
  if (recurrenceEnabled && !startDate) throw new Error("Recurring templates require a start date.");
  if (startDate && endDate && compareDate(endDate, startDate) < 0) throw new Error("Recurrence end date cannot be before the start date.");

  const activeValue = input.isActive ?? input.is_active;
  const isActive = activeValue === undefined ? (existing ? existing.is_active !== false : true) : activeValue !== false;
  const row: Row = {
    name,
    title,
    description: text(input.description, 4000) || null,
    priority,
    reference_type: referenceType,
    project_code: projectCode,
    proposal_code: proposalCode,
    workflow_id: workflowId,
    assigned_employee_id: employeeId,
    assigned_to: assignedTo,
    due_time: dueTime,
    reminder_enabled: reminderEnabled,
    reminder_minutes_before: reminderMinutes,
    recurrence_enabled: recurrenceEnabled,
    recurrence_type: recurrenceType,
    recurrence_interval: recurrenceInterval,
    recurrence_weekday: recurrenceWeekday,
    recurrence_day_of_month: recurrenceDay,
    start_date: startDate,
    end_date: endDate,
    is_active: isActive,
    updated_at: new Date().toISOString(),
  };

  const scheduleChanged = !existing || scheduleSignature(existing) !== scheduleSignature(row);
  row.next_run_date = recurrenceEnabled
    ? (scheduleChanged || !isoDate(existing?.next_run_date) ? (firstOccurrence(row) || null) : existing?.next_run_date)
    : null;
  if (!recurrenceEnabled) row.last_error = null;
  return { row, checklist: checklistFrom(input) };
}

async function replaceChecklist(templateId: string, checklist: string[]) {
  const previous = await selectRows("todo_template_subtasks", { filters: { template_id: templateId }, order: "sort_order:asc", limit: 500 });
  try {
    if (previous.length) await deleteRows("todo_template_subtasks", { template_id: templateId });
    if (checklist.length) {
      const now = new Date().toISOString();
      await insertRows("todo_template_subtasks", checklist.map((title, index) => ({ template_id: templateId, title, sort_order: index * 10, created_at: now, updated_at: now })));
    }
  } catch (error) {
    try {
      await deleteRows("todo_template_subtasks", { template_id: templateId });
      if (previous.length) await insertRows("todo_template_subtasks", previous);
    } catch {}
    throw error;
  }
}

export async function listTodoTemplates() {
  const [templates, subtasks, runs] = await Promise.all([
    selectRows("todo_templates", { order: "updated_at:desc", limit: 1000 }),
    selectRows("todo_template_subtasks", { order: "sort_order:asc", limit: 10000 }),
    selectRows("todo_template_runs", { order: "scheduled_date:desc", limit: 5000 }),
  ]);
  const checklist = new Map<string, string[]>();
  for (const row of subtasks) {
    const id = text(row.template_id, 80);
    if (!checklist.has(id)) checklist.set(id, []);
    checklist.get(id)!.push(text(row.title, 500));
  }
  const lastRuns = new Map<string, Row>();
  for (const row of runs) {
    const id = text(row.template_id, 80);
    if (!lastRuns.has(id)) lastRuns.set(id, row);
  }
  return templates.map((row) => ({ ...row, checklist: checklist.get(text(row.id, 80)) || [], lastRun: lastRuns.get(text(row.id, 80)) || null })) as TodoTemplate[];
}

export async function saveTodoTemplate(input: Row, createdBy: string) {
  const id = text(input.id, 80);
  const existingRows = id ? await selectRows("todo_templates", { filters: { id }, limit: 1 }) : [];
  const existing = existingRows[0] || null;
  if (id && !existing) throw new Error("Template was not found.");
  const { row, checklist } = await validateTemplate(input, existing);
  let template: Row;
  if (existing) {
    const updated = await updateRows("todo_templates", { id }, row);
    template = updated[0] || { ...existing, ...row };
  } else {
    const created = await insertRows("todo_templates", {
      ...row,
      template_code: `TPL-${crypto.randomUUID().replace(/-/g, "").slice(0, 10).toUpperCase()}`,
      created_by: text(createdBy, 250) || "LAND VIEW",
      created_at: new Date().toISOString(),
    });
    template = created[0];
  }
  try {
    await replaceChecklist(text(template.id, 80), checklist);
  } catch (error) {
    if (!existing && template?.id) await deleteRows("todo_templates", { id: template.id }).catch(() => undefined);
    throw error;
  }
  const all = await listTodoTemplates();
  return all.find((item) => item.id === template.id) || template;
}

export async function deleteTodoTemplate(id: string) {
  const rows = await selectRows("todo_templates", { filters: { id }, limit: 1 });
  if (!rows.length) throw new Error("Template was not found.");
  await deleteRows("todo_templates", { id });
  return rows[0];
}

async function templateAndChecklist(id: string) {
  const rows = await selectRows("todo_templates", { filters: { id }, limit: 1 });
  if (!rows.length) throw new Error("Template was not found.");
  const template = rows[0] as TodoTemplate;
  const checklistRows = await selectRows("todo_template_subtasks", { filters: { template_id: id }, order: "sort_order:asc", limit: 500 });
  return { template, checklist: checklistRows.map((row) => text(row.title, 500)).filter(Boolean) };
}

export async function createTodoFromTemplate(template: TodoTemplate, checklist: string[], scheduledDate: string | null, createdBy: string) {
  if (template.is_active === false) throw new Error("This template is inactive.");
  const dueDate = isoDate(scheduledDate) || "";
  const dueTime = dueDate ? timeHHMM(template.due_time) : "";
  const reminderEnabled = Boolean(dueDate && dueTime && template.reminder_enabled && template.assigned_employee_id);
  const item = {
    title: template.title,
    description: template.description || "",
    status: "To Do",
    priority: template.priority || "Normal",
    dueDate,
    dueTime,
    reminderEnabled,
    reminderMinutesBefore: reminderEnabled ? template.reminder_minutes_before : null,
    referenceType: template.reference_type || "None",
    projectCode: template.project_code || "",
    proposalCode: template.proposal_code || "",
    workflowId: template.workflow_id || "",
    assignedEmployeeId: template.assigned_employee_id || "",
    assignedTo: template.assigned_to || "",
  };
  const created = await createTodoItem(item, createdBy);
  try {
    if (checklist.length) {
      const now = new Date().toISOString();
      await insertRows("todo_subtasks", checklist.map((title, index) => ({
        todo_id: created.id,
        todo_code: created.todo_code,
        title,
        sort_order: index * 10,
        is_completed: false,
        created_by_user_key: "todo-template",
        created_by_name: createdBy,
        created_by_role: "system",
        created_at: now,
        updated_at: now,
      })));
    }
    return created as TodoItem;
  } catch (error) {
    await deleteTodoItem(created.todo_code).catch(() => undefined);
    throw error;
  }
}

export async function useTodoTemplate(id: string, scheduledDate: string | null, createdBy: string) {
  const { template, checklist } = await templateAndChecklist(id);
  return createTodoFromTemplate(template, checklist, isoDate(scheduledDate) || null, createdBy);
}

function duplicateError(error: unknown) {
  return /duplicate|unique|23505/i.test(error instanceof Error ? error.message : String(error));
}

export async function processRecurringTodoTemplates(limit = 20) {
  const today = dhakaToday();
  const templates = (await selectRows("todo_templates", { order: "next_run_date:asc", limit: 2000 })) as TodoTemplate[];
  const candidates = templates.filter((row) => row.is_active !== false && row.recurrence_enabled === true && isoDate(row.next_run_date) && compareDate(isoDate(row.next_run_date), today) <= 0);
  let generated = 0;
  let skipped = 0;
  const errors: Array<{ templateCode: string; error: string }> = [];

  for (const template of candidates.slice(0, Math.max(1, limit))) {
    let scheduledDate = isoDate(template.next_run_date);
    if (!scheduledDate) { skipped += 1; continue; }
    if (compareDate(scheduledDate, today) < 0) {
      const normalized = firstOccurrence(template, today);
      if (!normalized) {
        await updateRows("todo_templates", { id: template.id }, { next_run_date: null, updated_at: new Date().toISOString() });
        skipped += 1;
        continue;
      }
      scheduledDate = normalized;
      await updateRows("todo_templates", { id: template.id }, { next_run_date: scheduledDate, updated_at: new Date().toISOString() });
    }

    let runId = "";
    try {
      const run = await insertRows("todo_template_runs", { template_id: template.id, scheduled_date: scheduledDate, status: "processing", created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      runId = text(run[0]?.id, 80);
    } catch (error) {
      if (duplicateError(error)) {
        const next = nextOccurrence(template, scheduledDate) || null;
        await updateRows("todo_templates", { id: template.id }, { next_run_date: next, updated_at: new Date().toISOString() }).catch(() => undefined);
        skipped += 1;
        continue;
      }
      errors.push({ templateCode: template.template_code, error: text(error instanceof Error ? error.message : error, 700) });
      continue;
    }

    try {
      const checklistRows = await selectRows("todo_template_subtasks", { filters: { template_id: template.id }, order: "sort_order:asc", limit: 500 });
      const checklist = checklistRows.map((row) => text(row.title, 500)).filter(Boolean);
      const createdBy = `Recurring Template · ${template.name}`.slice(0, 250);
      const todo = await createTodoFromTemplate(template, checklist, scheduledDate, createdBy);
      const now = new Date().toISOString();
      const next = nextOccurrence(template, scheduledDate) || null;
      await updateRows("todo_template_runs", { id: runId }, { status: "generated", todo_id: todo.id || null, todo_code: todo.todo_code, error: null, updated_at: now });
      await updateRows("todo_templates", { id: template.id }, { next_run_date: next, last_run_at: now, last_error: null, updated_at: now });
      await recordAuditEvent({ user: { userId: "system:todo-recurrence", role: "system", name: "To Do Recurrence" }, action: "todo_recurring_generated", entityType: "todo", entityId: todo.todo_code, after: { templateCode: template.template_code, scheduledDate, nextRunDate: next }, source: "todo-template" });
      generated += 1;
    } catch (error) {
      const message = text(error instanceof Error ? error.message : error, 1000);
      await deleteRows("todo_template_runs", { id: runId }).catch(() => undefined);
      await updateRows("todo_templates", { id: template.id }, { last_error: message, updated_at: new Date().toISOString() }).catch(() => undefined);
      await recordAuditEvent({ user: { userId: "system:todo-recurrence", role: "system", name: "To Do Recurrence" }, action: "todo_recurring_generation", entityType: "todo_template", entityId: template.template_code, outcome: "failure", details: { scheduledDate, error: message }, source: "todo-template" });
      errors.push({ templateCode: template.template_code, error: message });
    }
  }

  return { scanned: candidates.length, generated, skipped, errors: errors.slice(0, 20) };
}
