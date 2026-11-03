import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf, userIdOf } from "@/lib/local-session";
import { recordAuditEvent } from "@/lib/audit-log";
import { selectRows, updateRows } from "@/lib/supabase-data";
import { workflowStatusesForService } from "@/lib/service-workflow";
import { createTodoItem, deleteTodoItem, listTodoItems, updateTodoItem, type TodoItem } from "@/lib/todo-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

function text(value: unknown, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function originAllowed(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === "app.landview.com.bd" || host === "www.landview.com.bd" || host === "landview.com.bd" || host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function ok(data: unknown) {
  return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

function fail(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error || "Request failed.");
  return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function requireTodoUser(request: NextRequest) {
  const user = await requireLocalSession(request);
  if (!user) throw new Error("Authentication required.");
  const role = roleOf(user);
  if (role !== "admin" && role !== "manager") throw new Error("Access denied.");
  return user;
}

function todoPayload(todo: TodoItem, status: TodoItem["status"] = todo.status) {
  return {
    title: todo.title,
    description: todo.description || "",
    status,
    priority: todo.priority,
    dueDate: todo.due_date || "",
    dueTime: todo.due_time || "",
    reminderEnabled: todo.reminder_enabled === true,
    reminderMinutesBefore: todo.reminder_enabled === true ? todo.reminder_minutes_before : null,
    referenceType: todo.reference_type || (todo.project_code ? "Project" : todo.proposal_code ? "Proposal" : "None"),
    projectCode: todo.project_code || "",
    proposalCode: todo.proposal_code || "",
    workflowId: todo.workflow_id || "",
    assignedEmployeeId: todo.assigned_employee_id || "",
    assignedTo: todo.assigned_to || "",
  };
}

async function todoOptions() {
  const [projects, proposals, employees, workflows] = await Promise.all([
    selectRows("projects", { order: "project_code:desc", limit: 5000 }),
    selectRows("proposals", { order: "updated_at:desc", limit: 5000 }),
    selectRows("employees", { order: "employee_code:asc", limit: 5000 }),
    selectRows("project_service_workflows", { order: "updated_at:desc", limit: 10000 }),
  ]);

  return {
    projects: projects
      .filter((row) => text(row.project_code, 80))
      .map((row) => ({
        id: text(row.id, 80),
        projectCode: text(row.project_code, 80),
        clientName: text(row.client_name_snapshot || row.project_name, 180),
        projectName: text(row.project_name || row.public_project_title, 220),
        location: text(row.location, 220),
        lifecyclePhase: text(row.lifecycle_phase, 100),
      })),
    proposals: proposals
      .filter((row) => text(row.proposal_code, 120))
      .map((row) => ({
        proposalCode: text(row.proposal_code, 120),
        clientName: text(row.client_name, 180),
        projectTitle: text(row.project_title, 220),
        location: text(row.project_location, 220),
        status: text(row.status, 100),
        convertedProjectCode: text(row.converted_project_code, 80),
      })),
    employees: employees
      .filter((row) => text(row.status, 40).toLowerCase() === "active")
      .map((row) => ({
        id: text(row.id, 80),
        employeeCode: text(row.employee_code, 80),
        name: text(row.name, 180),
        designation: text(row.designation, 180),
        department: text(row.department, 120),
      })),
    workflows: workflows
      .filter((row) => text(row.id, 80) && text(row.project_code, 80))
      .map((row) => ({
        id: text(row.id, 80),
        projectId: text(row.project_code, 80),
        serviceName: text(row.service_name, 220),
        status: text(row.status, 120),
        statuses: workflowStatusesForService(row.service_name),
        workflowType: text(row.workflow_type, 80),
      })),
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireTodoUser(request);
    const mode = text(request.nextUrl.searchParams.get("mode"), 40).toLowerCase();
    if (mode === "options") return ok(await todoOptions());
    return ok(await listTodoItems());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(error, /authentication/i.test(message) ? 401 : /access denied/i.test(message) ? 403 : 500);
  }
}

export async function POST(request: NextRequest) {
  if (!originAllowed(request)) return fail(new Error("Invalid request origin."), 403);
  try {
    const user = await requireTodoUser(request);
    const input = await request.json().catch(() => ({})) as Row;
    const action = String(input.action || "").trim().toLowerCase();
    if (action === "create") {
      const createdBy = String((user as Row).name || (user as Row).Name || userIdOf(user) || "LAND VIEW").trim();
      return ok(await createTodoItem((input.item || {}) as Row, createdBy));
    }
    if (action === "update") {
      const todoCode = String(input.todoCode || "").trim();
      if (!todoCode) throw new Error("To Do code is required.");
      return ok(await updateTodoItem(todoCode, (input.item || {}) as Row));
    }
    if (action === "completewithworkflow") {
      const todoCode = text(input.todoCode, 80);
      if (!todoCode) throw new Error("To Do code is required.");

      const todos = await listTodoItems();
      const todo = todos.find((row) => row.todo_code === todoCode);
      if (!todo) throw new Error("To Do item was not found.");
      if (todo.reference_type !== "Project" || !todo.project_code || !todo.workflow_id) {
        throw new Error("This To Do is not linked to a Project Workflow service.");
      }

      const workflowRows = await selectRows("project_service_workflows", { filters: { id: todo.workflow_id }, limit: 1 });
      if (!workflowRows.length) throw new Error("The linked Workflow service was not found.");
      const workflow = workflowRows[0] as Record<string, any>;
      if (text(workflow.project_code, 80).toUpperCase() !== text(todo.project_code, 80).toUpperCase()) {
        throw new Error("The linked Workflow service does not belong to this project.");
      }

      const statuses = workflowStatusesForService(workflow.service_name);
      const finalStatus = String(statuses[statuses.length - 1] || "").trim();
      if (!finalStatus) throw new Error("The Workflow service has no completion status.");
      const previousStatus = text(workflow.status, 120);
      const now = new Date().toISOString();
      const userRow = user as Row;
      const who = text(userRow.employeeId || userRow.Employee_ID || userRow.userId || userRow.User_ID || userRow.username || userRow.Username || userRow.name || userRow.Name || userIdOf(user) || "LAND VIEW", 160);
      let workflowChanged = false;

      if (previousStatus !== finalStatus) {
        await updateRows("project_service_workflows", { id: todo.workflow_id }, { status: finalStatus, updated_by: who, updated_at: now });
        workflowChanged = true;
      }

      let updatedTodo: TodoItem;
      try {
        updatedTodo = await updateTodoItem(todoCode, todoPayload(todo, "Done"));
      } catch (todoError) {
        if (workflowChanged) {
          try {
            await updateRows("project_service_workflows", { id: todo.workflow_id }, { status: previousStatus, updated_by: who, updated_at: new Date().toISOString() });
          } catch {}
        }
        throw todoError;
      }

      await recordAuditEvent({
        user,
        request,
        action: "todo_complete_with_workflow",
        entityType: "todo",
        entityId: todoCode,
        before: { todoStatus: todo.status, workflowStatus: previousStatus },
        after: { todoStatus: "Done", workflowStatus: finalStatus },
        details: { projectId: todo.project_code, workflowId: todo.workflow_id, service: workflow.service_name },
        source: "todo",
      });

      return ok({
        todo: updatedTodo,
        workflow: {
          id: todo.workflow_id,
          projectId: todo.project_code,
          serviceName: workflow.service_name,
          previousStatus,
          status: finalStatus,
        },
      });
    }
    if (action === "delete") {
      const todoCode = String(input.todoCode || "").trim();
      if (!todoCode) throw new Error("To Do code is required.");
      return ok(await deleteTodoItem(todoCode));
    }
    throw new Error("Unsupported To Do action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(error, /authentication/i.test(message) ? 401 : /access denied/i.test(message) ? 403 : /required|unsupported|not linked|not found|does not belong|no completion|only an active employee|reminder/i.test(message) ? 400 : 500);
  }
}
