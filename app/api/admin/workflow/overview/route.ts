import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { selectRows, updateRows } from "@/lib/supabase-data";
import { recordAuditEvent } from "@/lib/audit-log";
import { workflowStatusesForService } from "@/lib/service-workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Existing LAND VIEW data gateway returns heterogeneous row shapes.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const STAGES = ["Design Stage", "Approval Stage", "Supervision / Construction Stage"] as const;
type Stage = typeof STAGES[number];

function text(value: unknown, max = 400): string { return String(value ?? "").trim().slice(0, max); }
function projectCode(value: unknown) {
  const raw = text(value, 80).toUpperCase();
  const match = raw.match(/^LV[-\s]?(\d+)$/);
  return match ? `LV-${match[1].padStart(3, "0")}` : raw;
}
function completed(status: unknown) { return ["completed", "done"].includes(text(status).toLowerCase()); }
function localDay() {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (part: string) => parts.find((entry) => entry.type === part)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
function clamp(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}
function stageOfService(row: Row): Stage {
  const name = text(row.service_name || row.serviceName).toLowerCase();
  if (/supervision|construction/.test(name)) return STAGES[2];
  if (text(row.workflow_type || row.workflowType).toLowerCase() === "municipality" || /approval|noc|vetting|file pass|submission fee|fire service/.test(name)) return STAGES[1];
  return STAGES[0];
}
function stageOfTask(row: Row): Stage | "Unstaged" {
  const stage = text(row.lifecycle_stage || row.stage);
  if (STAGES.includes(stage as Stage)) return stage as Stage;
  if (/approval/i.test(stage)) return STAGES[1];
  if (/supervision|construction|handover/i.test(stage)) return STAGES[2];
  if (!stage && text(row.source_service)) return stageOfService({ service_name: row.source_service });
  return "Unstaged";
}
function stageStatus(row: Row, stage: Stage) {
  const key = stage === STAGES[0] ? "design_stage_status" : stage === STAGES[1] ? "approval_stage_status" : "supervision_stage_status";
  return text(row[key]) || "Pending";
}
function workflowProgress(row: Row) {
  const chain = workflowStatusesForService(row.service_name);
  const index = chain.findIndex((value) => value === text(row.status));
  return { statuses: chain, progress: index < 0 ? 0 : chain.length <= 1 ? 100 : Math.round(index * 100 / (chain.length - 1)), done: chain.length > 0 && index === chain.length - 1 };
}
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } }); }
async function management(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  if (!["admin", "manager"].includes(roleOf(user))) throw new Error("Management permission is required.");
  return user;
}
function errorStatus(message: string) { return /session expired/i.test(message) ? 401 : /permission/i.test(message) ? 403 : /not found|invalid|required|dependency|blocked|different project|cycle|changed/i.test(message) ? 400 : 500; }
function details(value: unknown): Row {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Row;
  if (typeof value === "string") { try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" ? parsed : {}; } catch {} }
  return {};
}

export async function GET(request: NextRequest) {
  try {
    await management(request);
    const [projects, serviceRows, taskRows, todoRows, employeeRows, transitionRows, auditRows, contractRows] = await Promise.all([
      selectRows("projects", { select: "id,project_code,project_name,client_name_snapshot,lifecycle_phase,design_stage_status,approval_stage_status,supervision_stage_status", order: "project_code:desc", limit: 5000 }),
      selectRows("project_service_workflows", { select: "id,project_id,project_code,service_name,workflow_type,billing_category,status,net_amount,paid_amount,updated_at", order: "updated_at:desc", limit: 10000 }),
      selectRows("tasks", { select: "id,task_code,project_id,task_title,status,priority,progress,lifecycle_stage,source_service,due_date,dependency_task_code,blocker_reason,assigned_employee_id,completed_at,updated_at,sort_order", order: "created_at:desc", limit: 10000 }),
      selectRows("todo_items", { select: "todo_code,title,project_code,reference_type,workflow_id,status,priority,due_date,due_time,assigned_employee_id,assigned_to,updated_at", order: "created_at:desc", limit: 10000 }),
      selectRows("employees", { select: "id,employee_code,name,status,designation", order: "employee_code:asc", limit: 5000 }),
      selectRows("project_lifecycle_transitions", { select: "id,project_code,from_phase,to_phase,changed_by,reason,created_at", order: "created_at:desc", limit: 1000 }),
      selectRows("app_audit_log", { select: "id,entity_type,entity_id,action,actor_name,source,details,created_at,outcome", order: "created_at:desc", limit: 1000 }),
      selectRows("project_contract_services", { select: "project_id,service_key,contract_net,active", limit: 10000 }),
    ]);
    const contractByKey = new Map<string, number>();
    for (const service of contractRows) {
      if (service.active === false) continue;
      const key = `${text(service.project_id)}::${text(service.service_key)}`;
      contractByKey.set(key, Math.max(contractByKey.get(key) || 0, Number(service.contract_net || 0)));
    }
    const now = localDay();
    const localClock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
    const employees = employeeRows.map((r: Row) => ({ id: text(r.id, 80), code: text(r.employee_code), name: text(r.name), status: text(r.status), designation: text(r.designation) }));
    const employeeById = new Map(employees.map((e) => [e.id, e]));
    const projectById = new Map(projects.map((p: Row) => [text(p.id, 80), projectCode(p.project_code)]));
    const workflowById = new Map(serviceRows.map((w: Row) => [text(w.id, 80), w]));
    const taskByCode = new Map(taskRows.map((t: Row) => [text(t.task_code, 120), t]));
    const taskProject = (task: Row) => projectById.get(text(task.project_id, 80)) || "";
    const workflowProject = (w: Row) => projectCode(w.project_code) || projectById.get(text(w.project_id, 80)) || "";
    const activityByProject = new Map<string, Row[]>();
    function addActivity(code: string, row: Row) {
      if (!code) return;
      const group = activityByProject.get(code) || [];
      group.push(row); activityByProject.set(code, group);
    }
    for (const entry of transitionRows) addActivity(projectCode(entry.project_code), {
      id: text(entry.id), type: "stage", title: `Stage: ${text(entry.from_phase) || "New"} → ${text(entry.to_phase)}`,
      actor: text(entry.changed_by) || "System", at: text(entry.created_at), note: text(entry.reason, 400),
    });
    for (const entry of auditRows) {
      if (text(entry.outcome).toLowerCase() === "failure") continue;
      const info = details(entry.details);
      const key = text(entry.entity_id);
      const work = workflowById.get(key);
      const task = taskByCode.get(key);
      const code = projectCode(info.projectId || info.projectCode) || (work ? workflowProject(work) : "") || (task ? taskProject(task) : "") || (text(entry.entity_type) === "project" ? projectCode(key) : "");
      if (!code) continue;
      addActivity(code, { id: text(entry.id), type: "audit", title: text(entry.action).replace(/_/g, " "), actor: text(entry.actor_name) || "Team", at: text(entry.created_at), note: text(info.service || info.reason || "", 400) });
    }
    const groupedTasks = new Map<string, Row[]>();
    for (const task of taskRows) { const code = taskProject(task); if (!code) continue; const group = groupedTasks.get(code) || []; group.push(task); groupedTasks.set(code, group); }
    const groupedServices = new Map<string, Row[]>();
    for (const workflow of serviceRows) { const code = workflowProject(workflow); if (!code) continue; const group = groupedServices.get(code) || []; group.push(workflow); groupedServices.set(code, group); }
    const groupedTodos = new Map<string, Row[]>();
    for (const todo of todoRows) {
      if (text(todo.reference_type) !== "Project") continue;
      const code = projectCode(todo.project_code);
      if (!code) continue;
      const group = groupedTodos.get(code) || []; group.push(todo); groupedTodos.set(code, group);
    }
    const items = projects.map((project: Row) => {
      const code = projectCode(project.project_code);
      const rawTasks = groupedTasks.get(code) || [];
      const rawServices = groupedServices.get(code) || [];
      const rawTodos = groupedTodos.get(code) || [];
      const tasks = rawTasks.map((task) => {
        const dependencyCode = text(task.dependency_task_code, 120);
        const parent = dependencyCode ? taskByCode.get(dependencyCode) : undefined;
        const invalidDependency = Boolean(dependencyCode && (!parent || taskProject(parent) !== code));
        const waitingFor = !invalidDependency && parent && !completed(parent.status) ? text(parent.task_title) || dependencyCode : "";
        const blockerReason = text(task.blocker_reason);
        const done = completed(task.status);
        const blocked = !done && Boolean(blockerReason || waitingFor || invalidDependency);
        const dueDate = text(task.due_date, 20);
        return {
          id: text(task.id), code: text(task.task_code), title: text(task.task_title, 250),
          stage: stageOfTask(task), service: text(task.source_service), status: text(task.status) || "Pending",
          priority: text(task.priority) || "Normal", progress: done ? 100 : clamp(task.progress),
          done, blocked, blockerReason, dependencyCode, waitingFor: invalidDependency ? "Missing dependency" : waitingFor,
          dueDate, overdue: !done && Boolean(dueDate && dueDate < now),
          employeeId: text(task.assigned_employee_id), employee: employeeById.get(text(task.assigned_employee_id))?.name || "",
          updatedAt: text(task.updated_at), sortOrder: Number(task.sort_order || 0),
        };
      });
      const services = rawServices.map((row) => {
        const state = workflowProgress(row);
        const required = Math.max(Number(row.net_amount || 0), contractByKey.get(`${text(row.project_id)}::${text(row.service_key)}`) || 0);
        const paid = Number(row.paid_amount || 0);
        const deliveryDue = Math.max(0, required - paid);
        return { id: text(row.id), name: text(row.service_name), status: text(row.status), stage: stageOfService(row), progress: state.progress, done: state.done, statuses: state.statuses, billingCategory: text(row.billing_category), paid, net: required, deliveryDue, deliveryLocked: !state.done && deliveryDue > 0.01, updatedAt: text(row.updated_at) };
      });
      const todos = rawTodos.map((todo) => {
        const workflow = workflowById.get(text(todo.workflow_id));
        const serviceState = workflow ? workflowProgress(workflow) : null;
        const done = completed(todo.status);
        const dueDate = text(todo.due_date, 20);
        const stage = workflow ? stageOfService(workflow) : STAGES.includes(text(project.lifecycle_phase) as Stage) ? text(project.lifecycle_phase) as Stage : STAGES[0];
        return {
          code: text(todo.todo_code), title: text(todo.title, 250), status: text(todo.status), priority: text(todo.priority),
          done, progress: done ? 100 : text(todo.status) === "In Progress" ? 50 : 0, dueDate, dueTime: text(todo.due_time),
          overdue: !done && Boolean(dueDate && (dueDate < now || (dueDate === now && text(todo.due_time).slice(0, 5) && text(todo.due_time).slice(0, 5) < localClock))), stage, workflowId: text(todo.workflow_id),
          workflowName: workflow ? text(workflow.service_name) : "", workflowStatus: workflow ? text(workflow.status) : "",
          mismatch: Boolean(workflow && serviceState && done !== serviceState.done),
          missingWorkflow: Boolean(todo.workflow_id && !workflow),
          employee: employeeById.get(text(todo.assigned_employee_id))?.name || text(todo.assigned_to),
        };
      });
      const stages = STAGES.map((name) => {
        const group: Row[] = [
          ...tasks.filter((task) => task.stage === name),
          ...services.filter((service) => service.stage === name),
          ...todos.filter((todo) => todo.stage === name),
        ];
        const status = stageStatus(project, name);
        const done = group.filter((entry) => entry.done).length;
        return { name, status, total: group.length, done, progress: status === "Completed" ? 100 : group.length ? Math.round(group.reduce((sum, entry) => sum + entry.progress, 0) / group.length) : 0, overdue: group.filter((entry) => entry.overdue).length, blocked: group.filter((entry) => entry.blocked).length };
      });
      const activeStages = stages.filter((stage) => stage.total || stage.status === "Completed");
      const overallProgress = text(project.lifecycle_phase) === "Completed" ? 100 : activeStages.length ? Math.round(activeStages.reduce((sum, stage) => sum + stage.progress, 0) / activeStages.length) : 0;
      const activity = (activityByProject.get(code) || []).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 12);
      return {
        code, name: text(project.project_name || project.client_name_snapshot, 220), lifecyclePhase: text(project.lifecycle_phase),
        progress: overallProgress, stages, services, tasks, todos, activity,
        overdue: tasks.filter((entry) => entry.overdue).length + todos.filter((entry) => entry.overdue).length,
        blocked: tasks.filter((entry) => entry.blocked).length,
        unassigned: tasks.filter((entry) => !entry.done && !entry.employeeId).length,
        syncIssues: todos.filter((entry) => entry.mismatch || entry.missingWorkflow).length,
        lastUpdated: [ ...tasks.map((t) => t.updatedAt), ...services.map((s) => s.updatedAt) ].sort().reverse()[0] || "",
      };
    });
    return json({ success: true, data: {
      projects: items, employees, today: now, refreshedAt: new Date().toISOString(),
      source: "Live Project, Workflow, Responsibility Tasks and To Do", historyLimit: 1000,
      totals: { projects: projects.length, services: serviceRows.length, tasks: taskRows.length, todos: todoRows.length },
    } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Workflow overview.";
    return json({ success: false, error: message }, errorStatus(message));
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  let user: Row | null = null;
  try {
    user = await management(request);
    const body = await request.json().catch(() => ({})) as Row;
    const action = text(body.action, 50);
    const code = text(body.taskCode, 120);
    if (!code) throw new Error("Task code is required.");
    const rows = await selectRows("tasks", { filters: { task_code: code }, limit: 1 });
    const task = rows[0];
    if (!task) throw new Error("Responsibility task not found.");
    const changes: Row = {};
    const now = new Date().toISOString();
    if (action === "setStatus") {
      const status = text(body.status, 40);
      if (!["Pending", "In Progress", "Completed"].includes(status)) throw new Error("Invalid task status.");
      if (status === "Completed") {
        if (text(task.blocker_reason)) throw new Error("Clear the task blocker before completion.");
        const dependentCode = text(task.dependency_task_code, 120);
        if (dependentCode) {
          const dependencies = await selectRows("tasks", { filters: { task_code: dependentCode }, limit: 1 });
          if (!dependencies.length || text(dependencies[0].project_id) !== text(task.project_id) || !completed(dependencies[0].status)) throw new Error("Complete the required dependency before this task.");
        }
      }
      changes.status = status; changes.progress = status === "Completed" ? 100 : status === "Pending" ? 0 : (completed(task.status) ? 0 : clamp(task.progress));
      changes.completed_at = status === "Completed" ? now : null;
    } else if (action === "assign") {
      const employeeId = text(body.employeeId, 80);
      if (employeeId) {
        const employees = await selectRows("employees", { filters: { id: employeeId }, limit: 1 });
        if (!employees.length || text(employees[0].status).toLowerCase() === "former") throw new Error("Invalid or inactive employee.");
      }
      changes.assigned_employee_id = employeeId || null; changes.assigned_at = employeeId ? now : null;
      changes.assigned_by = text(user.employeeId || user.Employee_ID || user.username || user.Username || user.name, 150);
    } else if (action === "block") {
      const reason = text(body.reason, 500);
      if (!reason) throw new Error("A blocker reason is required.");
      if (completed(task.status)) throw new Error("Reopen a completed task before adding a blocker.");
      changes.blocker_reason = reason;
    } else if (action === "unblock") {
      changes.blocker_reason = null;
    } else if (action === "dependency") {
      const dependency = text(body.dependencyCode, 120);
      if (dependency === code) throw new Error("A task cannot depend on itself.");
      if (dependency) {
        const projectTasks = await selectRows("tasks", { filters: { project_id: task.project_id }, limit: 5000 });
        const byCode = new Map(projectTasks.map((t: Row) => [text(t.task_code, 120), t]));
        if (!byCode.has(dependency)) throw new Error("Dependency must be from the same project.");
        if (completed(task.status) && !completed(byCode.get(dependency)?.status)) throw new Error("A completed task cannot depend on unfinished work. Reopen it first.");
        const seen = new Set([code]); let cursor = dependency;
        while (cursor) {
          if (seen.has(cursor)) throw new Error("Dependency cycle is not permitted.");
          seen.add(cursor); cursor = text(byCode.get(cursor)?.dependency_task_code, 120);
          if (cursor && !byCode.has(cursor)) throw new Error("The dependency chain includes a missing task.");
        }
      }
      changes.dependency_task_code = dependency || null;
    } else if (action === "dueDate") {
      const dueDate = text(body.dueDate, 10);
      if (dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`)))) throw new Error("Invalid due date.");
      changes.due_date = dueDate || null;
    } else {
      throw new Error("Unsupported Workflow task action.");
    }
    changes.updated_at = now; changes.source_updated_at = now;
    const updated = await updateRows("tasks", { id: task.id }, changes);
    if (!updated.length) throw new Error("Task changed or could not be updated.");
    const projects = await selectRows("projects", { filters: { id: task.project_id }, limit: 1 });
    const projectId = projectCode(projects[0]?.project_code);
    await recordAuditEvent({
      user, request, action: `workflow_task_${action}`, entityType: "task", entityId: code,
      before: task, after: updated[0], details: { projectId, taskCode: code }, source: "workflow-overview",
    });
    return json({ success: true, data: { taskCode: code, changes, projectId } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Workflow task update failed.";
    return json({ success: false, error: message }, errorStatus(message));
  }
}
