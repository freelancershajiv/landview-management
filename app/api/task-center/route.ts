import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf, userIdOf } from "@/lib/local-session";
import { recordAuditEvent } from "@/lib/audit-log";
import { employeeCodeOf, insertRows, normalizeProjectCode, selectRows, updateRows } from "@/lib/supabase-data";
import {
  canonicalProjectService,
  isTaskClosedStatus,
  responsibilityAutomationKey,
  responsibilityTasksForService,
} from "@/lib/project-task-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function text(value: unknown, max = 1000) { return String(value ?? "").trim().slice(0, max); }
function numberOf(value: unknown, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === request.nextUrl.hostname.toLowerCase() || host === "app.landview.com.bd" || host === "www.landview.com.bd" || host === "landview.com.bd" || host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");
  } catch { return false; }
}
function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } }); }
function actorOf(user: Row) { return userIdOf(user) || employeeCodeOf(user) || text(user.name || user.Name, 200); }
function dateOnly(value: unknown) { const raw = text(value, 30); return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : ""; }
function addDays(date: string, days: number) { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function today() { return new Date().toISOString().slice(0, 10); }
function taskCode(projectCode: string) { return `RT-${projectCode.replace(/[^A-Z0-9]/gi, "")}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`; }
function effectiveBill(row: Row) { return !["void", "voided", "cancelled", "canceled", "rejected"].includes(text(row.status).toLowerCase()); }

async function sessionUser(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  const role = roleOf(user);
  if (!["admin", "manager", "employee"].includes(role)) throw new Error("Task Center access is not available for this role.");
  return user;
}

async function employeeRecord(user: Row) {
  if (roleOf(user) !== "employee") return null;
  const code = employeeCodeOf(user);
  if (!code) throw new Error("Employee identity is missing from this session.");
  const rows = await selectRows("employees", { filters: { employee_code: code }, limit: 1 });
  if (!rows.length) throw new Error(`Employee ${code} was not found.`);
  return rows[0];
}

function enrichTasks(tasks: Row[], projects: Row[], employees: Row[]): Row[] {
  const projectById = new Map(projects.map((row) => [text(row.id), row]));
  const employeeById = new Map(employees.map((row) => [text(row.id), row]));
  const byCode = new Map(tasks.map((row) => [text(row.task_code), row]));
  const now = today();
  return tasks.map((row): Row => {
    const project = projectById.get(text(row.project_id));
    const employee = employeeById.get(text(row.assigned_employee_id));
    const dependency = row.dependency_task_code ? byCode.get(text(row.dependency_task_code)) : null;
    const dependencyBlocked = Boolean(dependency && !isTaskClosedStatus(dependency.status));
    const closed = isTaskClosedStatus(row.status);
    const due = dateOnly(row.due_date);
    const overdue = Boolean(!closed && due && due < now);
    const dueToday = Boolean(!closed && due === now);
    const blocked = !closed && (text(row.status).toLowerCase() === "blocked" || Boolean(text(row.blocker_reason)) || dependencyBlocked);
    return {
      ...row,
      project_code: text(project?.project_code),
      project_name: text(project?.project_name || project?.client_name_snapshot),
      employee_code: text(employee?.employee_code),
      employee_name: text(employee?.name),
      employee_designation: text(employee?.designation),
      dependency_title: dependency ? text(dependency.task_title) : "",
      dependency_status: dependency ? text(dependency.status) : "",
      dependency_blocked: dependencyBlocked,
      is_closed: closed,
      is_overdue: overdue,
      is_due_today: dueToday,
      is_blocked: blocked,
    };
  });
}

function buckets(rows: Row[]) {
  const now = today();
  return {
    overdue: rows.filter((row) => row.is_overdue),
    today: rows.filter((row) => row.is_due_today),
    upcoming: rows.filter((row) => !row.is_closed && !row.is_overdue && row.due_date && row.due_date > now),
    blocked: rows.filter((row) => row.is_blocked),
    unassigned: rows.filter((row) => !row.is_closed && !row.assigned_employee_id),
    completed: rows.filter((row) => row.is_closed),
  };
}

async function loadCenter(user: Row, request: NextRequest) {
  const projectCode = normalizeProjectCode(request.nextUrl.searchParams.get("projectId"));
  const [projects, employees, allTasks] = await Promise.all([
    selectRows("projects", { order: "project_code:desc", limit: 5000 }),
    selectRows("employees", { order: "employee_code:asc", limit: 1000 }),
    selectRows("tasks", { order: "due_date:asc,sort_order:asc,created_at:asc", limit: 10000 }),
  ]);
  const project = projectCode ? projects.find((row) => normalizeProjectCode(row.project_code) === projectCode) : null;
  if (projectCode && !project) throw new Error(`Project ${projectCode} was not found.`);

  let tasks = project ? allTasks.filter((row) => text(row.project_id) === text(project.id)) : allTasks;
  const me = await employeeRecord(user);
  if (me) tasks = tasks.filter((row) => text(row.assigned_employee_id) === text(me.id));
  const enriched: Row[] = enrichTasks(tasks, projects, employees);
  const grouped = buckets(enriched);
  const open: Row[] = enriched.filter((row) => !row.is_closed);
  return {
    role: roleOf(user),
    employee: me ? { id: me.id, employeeCode: me.employee_code, name: me.name, designation: me.designation } : null,
    project: project ? { id: project.id, projectCode: project.project_code, projectName: project.project_name || project.client_name_snapshot, lifecyclePhase: project.lifecycle_phase } : null,
    tasks: enriched,
    buckets: grouped,
    metrics: {
      total: enriched.length,
      open: open.length,
      completed: enriched.length - open.length,
      overdue: grouped.overdue.length,
      blocked: grouped.blocked.length,
      unassigned: grouped.unassigned.length,
      requiredOpen: open.filter((row: Row) => row.is_required === true).length,
    },
    employees: employees.filter((row) => text(row.status).toLowerCase() !== "former").map((row) => ({ id: row.id, employeeCode: row.employee_code, name: row.name, designation: row.designation, status: row.status })),
    projects: projects.map((row) => ({ id: row.id, projectCode: row.project_code, projectName: row.project_name || row.client_name_snapshot, lifecyclePhase: row.lifecycle_phase })),
  };
}

async function syncProjectTasks(projectCode: string, actor: string) {
  const projects = await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 });
  if (!projects.length) throw new Error(`Project ${projectCode} was not found.`);
  const project = projects[0];
  const [bills, existing] = await Promise.all([
    selectRows("bills", { filters: { project_id: project.id }, limit: 5000 }),
    selectRows("tasks", { filters: { project_id: project.id }, limit: 5000 }),
  ]);

  const services = Array.from(new Set(bills.filter(effectiveBill).map((row) => canonicalProjectService(`${text(row.description)} ${text(row.billing_category || row.category)}`)).filter(Boolean)));
  const existingByKey = new Map(existing.filter((row) => text(row.automation_key)).map((row) => [text(row.automation_key), row]));
  const created: Row[] = [];
  const baseDate = today();
  let globalOrder = 10;

  for (const service of services) {
    const templates = responsibilityTasksForService(service);
    const codeByTemplate = new Map<string, string>();
    for (const template of templates) {
      const key = responsibilityAutomationKey(projectCode, service, template.key);
      const prior = existingByKey.get(key);
      codeByTemplate.set(template.key, text(prior?.task_code) || taskCode(projectCode));
    }
    for (const template of templates) {
      const automationKey = responsibilityAutomationKey(projectCode, service, template.key);
      if (existingByKey.has(automationKey)) continue;
      const row: Row = {
        task_code: codeByTemplate.get(template.key) || taskCode(projectCode),
        project_id: project.id,
        task_title: template.title,
        description: `Required ${template.stage} responsibility created from ${service}.`,
        assigned_employee_id: null,
        priority: template.priority || "Normal",
        status: "Pending",
        start_date: baseDate,
        due_date: addDays(baseDate, template.dueInDays),
        completed_at: null,
        progress: 0,
        project_name_snapshot: text(project.project_name || project.client_name_snapshot) || projectCode,
        source_created_at: new Date().toISOString(),
        source_created_by: actor || null,
        source_updated_at: new Date().toISOString(),
        automation_generated: true,
        automation_source: "Responsibility Template",
        automation_key: automationKey,
        lifecycle_stage: template.stage,
        task_type: template.type,
        is_required: true,
        dependency_task_code: template.dependencyKey ? codeByTemplate.get(template.dependencyKey) || null : null,
        blocker_reason: null,
        source_service: service,
        sort_order: globalOrder,
        client_visible: Boolean(template.clientVisible),
        work_notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      globalOrder += 10;
      created.push(row);
      existingByKey.set(automationKey, row);
    }
  }
  if (created.length) await insertRows("tasks", created);
  return { projectId: projectCode, services, createdCount: created.length, existingCount: existing.length, created };
}

async function taskForWrite(taskCodeValue: unknown) {
  const taskCodeValueText = text(taskCodeValue, 200);
  if (!taskCodeValueText) throw new Error("Task code is required.");
  const rows = await selectRows("tasks", { filters: { task_code: taskCodeValueText }, limit: 1 });
  if (!rows.length) throw new Error("Task was not found.");
  return rows[0];
}

export async function GET(request: NextRequest) {
  try {
    const user = await sessionUser(request);
    return json({ success: true, data: await loadCenter(user, request) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Task Center.";
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /access|role/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 500);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  let user: Row | null = null;
  let input: Row = {};
  try {
    user = await sessionUser(request);
    input = await request.json() as Row;
    const action = text(input.action, 80).toLowerCase();
    const role = roleOf(user);
    const management = role === "admin" || role === "manager";
    const actor = actorOf(user);
    const now = new Date().toISOString();

    if (action === "syncprojecttasks") {
      if (!management) throw new Error("Management access is required to sync project tasks.");
      const projectId = normalizeProjectCode(input.projectId || input.Project_ID);
      if (!projectId) throw new Error("Project ID is required.");
      const result = await syncProjectTasks(projectId, actor);
      await recordAuditEvent({ user, request, action: "project_responsibility_tasks_sync", entityType: "project", entityId: projectId, details: { services: result.services, createdCount: result.createdCount }, source: "task-center" });
      return json({ success: true, data: result });
    }

    if (action === "createtask") {
      if (!management) throw new Error("Management access is required to create tasks.");
      const projectId = normalizeProjectCode(input.projectId || input.Project_ID);
      const projects = await selectRows("projects", { filters: { project_code: projectId }, limit: 1 });
      if (!projects.length) throw new Error("Choose a valid project.");
      const title = text(input.title || input.taskTitle, 300);
      if (!title) throw new Error("Task title is required.");
      const assignee = text(input.assignedEmployeeId, 80) || null;
      const row = {
        task_code: taskCode(projectId), project_id: projects[0].id, task_title: title,
        description: text(input.description, 1500) || null, assigned_employee_id: assignee,
        priority: text(input.priority, 40) || "Normal", status: text(input.status, 60) || "Pending",
        start_date: dateOnly(input.startDate) || today(), due_date: dateOnly(input.dueDate) || null,
        progress: Math.max(0, Math.min(100, numberOf(input.progress))), project_name_snapshot: text(projects[0].project_name || projects[0].client_name_snapshot) || projectId,
        source_created_at: now, source_created_by: actor || null, source_updated_at: now, automation_generated: false,
        lifecycle_stage: text(input.lifecycleStage, 120) || null, task_type: text(input.taskType, 120) || "Manual",
        is_required: input.isRequired === true, blocker_reason: text(input.blockerReason, 1000) || null,
        source_service: text(input.sourceService, 200) || null, sort_order: numberOf(input.sortOrder, 1000),
        client_visible: input.clientVisible === true, work_notes: text(input.workNotes, 2000) || null,
        assigned_by: assignee ? actor || null : null, assigned_at: assignee ? now : null, created_at: now, updated_at: now,
      };
      const inserted = await insertRows("tasks", row);
      await recordAuditEvent({ user, request, action: "project_task_create", entityType: "task", entityId: row.task_code, after: row, source: "task-center" });
      return json({ success: true, data: inserted[0] || row });
    }

    const task = await taskForWrite(input.taskCode || input.Task_ID || input.id);
    const me = await employeeRecord(user);
    if (!management && (!me || text(task.assigned_employee_id) !== text(me.id))) throw new Error("You can only update tasks assigned to you.");

    if (action === "assigntask") {
      if (!management) throw new Error("Management access is required to assign tasks.");
      const employeeId = text(input.assignedEmployeeId, 80) || null;
      if (employeeId) {
        const employeeRows = await selectRows("employees", { filters: { id: employeeId }, limit: 1 });
        if (!employeeRows.length) throw new Error("Choose a valid employee.");
      }
      const changes = { assigned_employee_id: employeeId, assigned_by: employeeId ? actor || null : null, assigned_at: employeeId ? now : null, updated_at: now, source_updated_at: now };
      const updated = await updateRows("tasks", { task_code: task.task_code }, changes);
      await recordAuditEvent({ user, request, action: "project_task_assign", entityType: "task", entityId: task.task_code, before: { assigned_employee_id: task.assigned_employee_id }, after: changes, source: "task-center" });
      return json({ success: true, data: updated[0] || { ...task, ...changes } });
    }

    if (action === "blocktask" || action === "unblocktask") {
      if (!management) throw new Error("Management access is required to manage blockers.");
      const blocking = action === "blocktask";
      const reason = text(input.reason || input.blockerReason, 1000);
      if (blocking && !reason) throw new Error("Blocker reason is required.");
      const changes = { status: blocking ? "Blocked" : (text(input.status, 60) || "Pending"), blocker_reason: blocking ? reason : null, updated_at: now, source_updated_at: now };
      const updated = await updateRows("tasks", { task_code: task.task_code }, changes);
      await recordAuditEvent({ user, request, action: blocking ? "project_task_block" : "project_task_unblock", entityType: "task", entityId: task.task_code, before: { status: task.status, blocker_reason: task.blocker_reason }, after: changes, source: "task-center" });
      return json({ success: true, data: updated[0] || { ...task, ...changes } });
    }

    if (action === "updatetask") {
      const changes: Row = { updated_at: now, source_updated_at: now };
      const requestedStatus = text(input.status, 60);
      if (requestedStatus) {
        if (!management && !["Pending", "In Progress", "Waiting", "Completed"].includes(requestedStatus)) throw new Error("Choose a valid employee task status.");
        if (requestedStatus === "Completed" && task.dependency_task_code) {
          const deps = await selectRows("tasks", { filters: { task_code: task.dependency_task_code }, limit: 1 });
          if (deps.length && !isTaskClosedStatus(deps[0].status)) throw new Error(`Complete the dependency first: ${text(deps[0].task_title) || task.dependency_task_code}.`);
        }
        changes.status = requestedStatus;
        if (requestedStatus === "Completed") { changes.completed_at = now; changes.progress = 100; }
        else if (isTaskClosedStatus(task.status)) changes.completed_at = null;
      }
      if (input.progress !== undefined && requestedStatus !== "Completed") changes.progress = Math.max(0, Math.min(100, numberOf(input.progress)));
      if (input.workNotes !== undefined) changes.work_notes = text(input.workNotes, 3000) || null;
      if (management) {
        if (input.priority !== undefined) changes.priority = text(input.priority, 40) || "Normal";
        if (input.dueDate !== undefined) changes.due_date = dateOnly(input.dueDate) || null;
        if (input.startDate !== undefined) changes.start_date = dateOnly(input.startDate) || null;
        if (input.description !== undefined) changes.description = text(input.description, 1500) || null;
        if (input.lifecycleStage !== undefined) changes.lifecycle_stage = text(input.lifecycleStage, 120) || null;
        if (input.taskType !== undefined) changes.task_type = text(input.taskType, 120) || null;
        if (input.isRequired !== undefined) changes.is_required = input.isRequired === true;
        if (input.clientVisible !== undefined) changes.client_visible = input.clientVisible === true;
        if (input.blockerReason !== undefined) changes.blocker_reason = text(input.blockerReason, 1000) || null;
      }
      const updated = await updateRows("tasks", { task_code: task.task_code }, changes);
      await recordAuditEvent({ user, request, action: "project_task_update", entityType: "task", entityId: task.task_code, before: task, after: changes, source: "task-center" });
      return json({ success: true, data: updated[0] || { ...task, ...changes } });
    }

    throw new Error("Unsupported Task Center action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update task.";
    if (user) await recordAuditEvent({ user, request, action: "project_task_action", entityType: "task", entityId: text(input.taskCode || input.id, 200), outcome: "failure", details: { action: text(input.action, 80), error: message }, source: "task-center" });
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /access|only update|management/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400);
  }
}
