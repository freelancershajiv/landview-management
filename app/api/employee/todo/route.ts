import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { recordAuditEvent } from "@/lib/audit-log";
import { employeeCodeOf, selectRows } from "@/lib/supabase-data";
import { listTodoItems, updateTodoItem, type TodoItem } from "@/lib/todo-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

type EmployeeTodoItem = TodoItem & {
  project_name?: string;
  project_client?: string;
  proposal_title?: string;
  proposal_client?: string;
  workflow_service?: string;
  workflow_status?: string;
};

function text(value: unknown, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
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

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

async function employeeSession(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  if (roleOf(user) !== "employee") throw new Error("Employee To Do access is not available for this role.");

  const employeeCode = employeeCodeOf(user);
  if (!employeeCode) throw new Error("Employee identity is missing from this session.");
  const rows = await selectRows("employees", { filters: { employee_code: employeeCode }, limit: 1 });
  if (!rows.length) throw new Error(`Employee ${employeeCode} was not found.`);
  const employee = rows[0];
  if (text(employee.status, 40).toLowerCase() !== "active") throw new Error("Employee account is not active.");
  return { user, employee };
}

function todoPayload(todo: TodoItem, status: TodoItem["status"]) {
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

async function loadEmployeeTodos(employee: Row) {
  const [todos, projects, proposals, workflows] = await Promise.all([
    listTodoItems(),
    selectRows("projects", { order: "project_code:desc", limit: 5000 }),
    selectRows("proposals", { order: "updated_at:desc", limit: 5000 }),
    selectRows("project_service_workflows", { order: "updated_at:desc", limit: 10000 }),
  ]);

  const projectByCode = new Map(projects.map((row) => [text(row.project_code, 80).toUpperCase(), row]));
  const proposalByCode = new Map(proposals.map((row) => [text(row.proposal_code, 120).toUpperCase(), row]));
  const workflowById = new Map(workflows.map((row) => [text(row.id, 80), row]));

  const items: EmployeeTodoItem[] = todos
    .filter((todo) => text(todo.assigned_employee_id, 80) === text(employee.id, 80))
    .map((todo) => {
      const project = todo.project_code ? projectByCode.get(text(todo.project_code, 80).toUpperCase()) : null;
      const proposal = todo.proposal_code ? proposalByCode.get(text(todo.proposal_code, 120).toUpperCase()) : null;
      const workflow = todo.workflow_id ? workflowById.get(text(todo.workflow_id, 80)) : null;
      return {
        ...todo,
        project_name: text(project?.project_name || project?.public_project_title, 220),
        project_client: text(project?.client_name_snapshot, 180),
        proposal_title: text(proposal?.project_title, 220),
        proposal_client: text(proposal?.client_name, 180),
        workflow_service: text(workflow?.service_name, 220),
        workflow_status: text(workflow?.status, 120),
      };
    });

  return {
    employee: {
      id: employee.id,
      employeeCode: employee.employee_code,
      name: employee.name,
      designation: employee.designation,
    },
    items,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { employee } = await employeeSession(request);
    return json({ success: true, data: await loadEmployeeTodos(employee) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load My To Dos.";
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /access|role|identity|active/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 500);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  let user: Row | null = null;
  let input: Row = {};
  try {
    const session = await employeeSession(request);
    user = session.user;
    const employee = session.employee;
    input = await request.json().catch(() => ({})) as Row;
    const action = text(input.action, 80).toLowerCase();
    if (action !== "updatestatus") throw new Error("Employees can only update To Do status.");

    const todoCode = text(input.todoCode, 80);
    if (!todoCode) throw new Error("To Do code is required.");
    const nextStatus = text(input.status, 40) as TodoItem["status"];
    if (!["To Do", "In Progress", "Done"].includes(nextStatus)) throw new Error("Choose a valid To Do status.");

    const todos = await listTodoItems();
    const todo = todos.find((row) => row.todo_code === todoCode);
    if (!todo) throw new Error("To Do item was not found.");
    if (text(todo.assigned_employee_id, 80) !== text(employee.id, 80)) throw new Error("You can only update To Dos assigned to you.");

    const updated = await updateTodoItem(todo.todo_code, todoPayload(todo, nextStatus));
    await recordAuditEvent({
      user,
      request,
      action: "employee_todo_status_update",
      entityType: "todo",
      entityId: todo.todo_code,
      before: { status: todo.status },
      after: { status: nextStatus },
      details: { employeeCode: employee.employee_code, workflowUnchanged: Boolean(todo.workflow_id) },
      source: "employee-todo",
    });

    return json({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update To Do.";
    if (user) {
      await recordAuditEvent({
        user,
        request,
        action: "employee_todo_status_update",
        entityType: "todo",
        entityId: text(input.todoCode, 80),
        outcome: "failure",
        details: { error: message },
        source: "employee-todo",
      }).catch(() => undefined);
    }
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /access|only update|assigned to you|identity|active/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400);
  }
}
