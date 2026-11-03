import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf, userIdOf } from "@/lib/local-session";
import { recordAuditEvent } from "@/lib/audit-log";
import { selectRows, updateRows } from "@/lib/supabase-data";
import { workflowStatusesForService } from "@/lib/service-workflow";
import { listTodoItems, updateTodoItem, type TodoItem } from "@/lib/todo-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function text(value: unknown, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === request.nextUrl.hostname.toLowerCase() || host === "app.landview.com.bd" || host === "www.landview.com.bd" || host === "landview.com.bd" || host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

async function managementSession(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Authentication required.");
  const role = roleOf(user);
  if (role !== "admin" && role !== "manager") throw new Error("Management permission is required.");
  return user;
}

function actor(user: Row) {
  return text(user.employeeId || user.Employee_ID || user.userId || user.User_ID || user.username || user.Username || user.name || user.Name || userIdOf(user) || "LAND VIEW", 160);
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

function workflowSnapshot(todo: TodoItem, workflow: Row) {
  const statuses = workflowStatusesForService(workflow.service_name);
  const currentIndex = statuses.indexOf(text(workflow.status, 120) as never);
  const finalStatus = String(statuses[statuses.length - 1] || "");
  const nextStatus = currentIndex >= 0 && currentIndex < statuses.length - 1 ? String(statuses[currentIndex + 1]) : "";
  const progress = statuses.length <= 1
    ? (text(workflow.status, 120) === finalStatus ? 100 : 0)
    : Math.max(0, Math.round((Math.max(0, currentIndex) / (statuses.length - 1)) * 100));
  return {
    todoCode: todo.todo_code,
    title: todo.title,
    todoStatus: todo.status,
    priority: todo.priority,
    projectCode: todo.project_code || "",
    assignedEmployeeId: todo.assigned_employee_id || "",
    assignedTo: todo.assigned_to || "",
    dueDate: todo.due_date || "",
    dueTime: todo.due_time || "",
    workflow: {
      id: text(workflow.id, 100),
      serviceName: text(workflow.service_name, 220),
      billingCategory: text(workflow.billing_category, 120),
      workflowType: text(workflow.workflow_type, 80),
      status: text(workflow.status, 120),
      statuses,
      currentIndex,
      nextStatus,
      finalStatus,
      progress,
      updatedAt: text(workflow.updated_at, 100),
      completed: Boolean(finalStatus && text(workflow.status, 120) === finalStatus),
    },
  };
}

async function linkedTodo(todoCode: string) {
  const todos = await listTodoItems();
  const todo = todos.find((row) => row.todo_code === todoCode);
  if (!todo) throw new Error("To Do item was not found.");
  if (todo.reference_type !== "Project" || !todo.project_code || !todo.workflow_id) {
    throw new Error("This To Do is not linked to a Project Workflow service.");
  }
  const rows = await selectRows("project_service_workflows", { filters: { id: todo.workflow_id }, limit: 1 });
  if (!rows.length) throw new Error("The linked Workflow service was not found.");
  const workflow = rows[0];
  if (text(workflow.project_code, 80).toUpperCase() !== text(todo.project_code, 80).toUpperCase()) {
    throw new Error("The linked Workflow service does not belong to this project.");
  }
  const view = workflowSnapshot(todo, workflow);
  if (view.workflow.currentIndex < 0) throw new Error("The linked Workflow has an invalid current status.");
  return { todo, workflow, view };
}

export async function GET(request: NextRequest) {
  try {
    await managementSession(request);
    const [todos, workflows] = await Promise.all([
      listTodoItems(),
      selectRows("project_service_workflows", { order: "updated_at:desc", limit: 10000 }),
    ]);
    const workflowById = new Map(workflows.map((row) => [text(row.id, 100), row]));
    const items = todos
      .filter((todo) => todo.reference_type === "Project" && Boolean(todo.project_code && todo.workflow_id))
      .map((todo) => {
        const workflow = workflowById.get(text(todo.workflow_id, 100));
        return workflow ? workflowSnapshot(todo, workflow) : {
          todoCode: todo.todo_code,
          title: todo.title,
          todoStatus: todo.status,
          priority: todo.priority,
          projectCode: todo.project_code || "",
          assignedEmployeeId: todo.assigned_employee_id || "",
          assignedTo: todo.assigned_to || "",
          dueDate: todo.due_date || "",
          dueTime: todo.due_time || "",
          workflow: null,
        };
      });
    return json({ success: true, data: { items, refreshedAt: new Date().toISOString() } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load linked Workflow To Dos.";
    return json({ success: false, error: message }, /authentication/i.test(message) ? 401 : /permission/i.test(message) ? 403 : 400);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  let user: Row | null = null;
  let input: Row = {};
  try {
    user = await managementSession(request);
    input = await request.json().catch(() => ({})) as Row;
    const action = text(input.action, 80).toLowerCase();
    const todoCode = text(input.todoCode, 80);
    if (!todoCode) throw new Error("To Do code is required.");
    const state = await linkedTodo(todoCode);
    const who = actor(user);

    if (action === "advance") {
      const nextStatus = state.view.workflow.nextStatus;
      if (!nextStatus) throw new Error("Workflow is already at its final status.");
      const previousStatus = state.view.workflow.status;
      const now = new Date().toISOString();
      const updated = await updateRows("project_service_workflows", { id: state.view.workflow.id }, { status: nextStatus, updated_by: who, updated_at: now });
      await recordAuditEvent({
        user,
        request,
        action: "todo_advance_linked_workflow",
        entityType: "todo",
        entityId: todoCode,
        before: { todoStatus: state.todo.status, workflowStatus: previousStatus },
        after: { todoStatus: state.todo.status, workflowStatus: nextStatus },
        details: { projectId: state.todo.project_code, workflowId: state.view.workflow.id, service: state.view.workflow.serviceName },
        source: "todo-workflow",
      });
      return json({ success: true, data: workflowSnapshot(state.todo, updated[0] || { ...state.workflow, status: nextStatus, updated_at: now }) });
    }

    if (action === "finish") {
      const finalStatus = state.view.workflow.finalStatus;
      if (!finalStatus) throw new Error("The linked Workflow has no completion status.");
      const previousWorkflowStatus = state.view.workflow.status;
      const previousTodoStatus = state.todo.status;
      const now = new Date().toISOString();
      let workflowChanged = false;

      if (previousWorkflowStatus !== finalStatus) {
        await updateRows("project_service_workflows", { id: state.view.workflow.id }, { status: finalStatus, updated_by: who, updated_at: now });
        workflowChanged = true;
      }

      let updatedTodo = state.todo;
      if (previousTodoStatus !== "Done") {
        try {
          updatedTodo = await updateTodoItem(todoCode, todoPayload(state.todo, "Done"));
        } catch (todoError) {
          if (workflowChanged) {
            try {
              await updateRows("project_service_workflows", { id: state.view.workflow.id }, { status: previousWorkflowStatus, updated_by: who, updated_at: new Date().toISOString() });
            } catch {}
          }
          throw todoError;
        }
      }

      const workflowRows = await selectRows("project_service_workflows", { filters: { id: state.view.workflow.id }, limit: 1 });
      const finalWorkflow = workflowRows[0] || { ...state.workflow, status: finalStatus, updated_at: now };
      await recordAuditEvent({
        user,
        request,
        action: "todo_finish_linked_workflow",
        entityType: "todo",
        entityId: todoCode,
        before: { todoStatus: previousTodoStatus, workflowStatus: previousWorkflowStatus },
        after: { todoStatus: "Done", workflowStatus: finalStatus },
        details: { projectId: state.todo.project_code, workflowId: state.view.workflow.id, service: state.view.workflow.serviceName },
        source: "todo-workflow",
      });
      return json({ success: true, data: workflowSnapshot(updatedTodo, finalWorkflow) });
    }

    throw new Error("Unsupported Workflow To Do action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update linked Workflow.";
    if (user) {
      await recordAuditEvent({
        user,
        request,
        action: "todo_linked_workflow_update",
        entityType: "todo",
        entityId: text(input.todoCode, 80),
        outcome: "failure",
        details: { requestedAction: text(input.action, 80), error: message },
        source: "todo-workflow",
      }).catch(() => undefined);
    }
    return json({ success: false, error: message }, /authentication/i.test(message) ? 401 : /permission/i.test(message) ? 403 : /required|not found|not linked|does not belong|invalid current status|final status|completion status|financial delivery gate/i.test(message) ? 400 : 500);
  }
}
