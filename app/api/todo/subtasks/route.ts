import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf, userIdOf } from "@/lib/local-session";
import { employeeCodeOf, selectRows } from "@/lib/supabase-data";
import { recordAuditEvent } from "@/lib/audit-log";
import { listTodoItems, type TodoItem } from "@/lib/todo-data";
import { todoSubtaskGateway, type TodoSubtask } from "@/lib/todo-subtasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
type Access = { user: Row; role: string; employee: Row | null; todos: TodoItem[] };

function text(value: unknown, max = 4000) { return String(value ?? "").trim().slice(0, max); }
function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0" } }); }
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === request.nextUrl.hostname.toLowerCase() || host === "app.landview.com.bd" || host === "www.landview.com.bd" || host === "landview.com.bd" || host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");
  } catch { return false; }
}
function actorName(user: Row) { return text(user.name || user.Name || user.employeeName || user.Employee_Name || user.username || user.Username || userIdOf(user) || "LAND VIEW", 250); }
function actorKey(user: Row) { return text(userIdOf(user) || user.employeeId || user.Employee_ID || user.username || user.Username, 200); }

async function access(request: NextRequest): Promise<Access> {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Authentication required.");
  const role = roleOf(user);
  if (!["admin", "manager", "employee"].includes(role)) throw new Error("To Do checklist is not available for this role.");
  const todos = await listTodoItems();
  if (role !== "employee") return { user, role, employee: null, todos };

  const employeeCode = employeeCodeOf(user);
  if (!employeeCode) throw new Error("Employee identity is missing from this session.");
  const rows = await selectRows("employees", { filters: { employee_code: employeeCode }, limit: 1 });
  if (!rows.length) throw new Error(`Employee ${employeeCode} was not found.`);
  const employee = rows[0];
  if (text(employee.status, 40).toLowerCase() !== "active") throw new Error("Employee account is not active.");
  return { user, role, employee, todos: todos.filter((todo) => text(todo.assigned_employee_id, 80) === text(employee.id, 80)) };
}

function requireTodo(state: Access, todoCode: string) {
  const todo = state.todos.find((item) => item.todo_code === todoCode);
  if (!todo) throw new Error(state.role === "employee" ? "You can only use checklists on To Dos assigned to you." : "To Do item was not found.");
  return todo;
}
function requireManagement(state: Access) {
  if (state.role !== "admin" && state.role !== "manager") throw new Error("Only management can change checklist structure.");
}
function taskSummary(todo: TodoItem) {
  return {
    todoCode: todo.todo_code,
    title: todo.title,
    status: todo.status,
    priority: todo.priority,
    projectCode: todo.project_code || "",
    proposalCode: todo.proposal_code || "",
    assignedTo: todo.assigned_to || "",
  };
}
async function itemFor(todoCode: string, id: string) {
  const items = await todoSubtaskGateway("list", { todoCode }) as TodoSubtask[];
  const item = items.find((row) => row.id === id);
  if (!item) throw new Error("Checklist item was not found.");
  return item;
}

export async function GET(request: NextRequest) {
  try {
    const state = await access(request);
    const todoCode = text(request.nextUrl.searchParams.get("todoCode"), 80);
    if (!todoCode) return json({ success: true, data: { tasks: state.todos.map(taskSummary), canManage: state.role !== "employee" } });
    const todo = requireTodo(state, todoCode);
    const items = await todoSubtaskGateway("list", { todoCode }) as TodoSubtask[];
    return json({ success: true, data: { todo: taskSummary(todo), items, canManage: state.role !== "employee" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load To Do checklist.";
    return json({ success: false, error: message }, /authentication|session/i.test(message) ? 401 : /role|assigned to you|identity|active/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  let state: Access | null = null;
  let todoCode = "";
  let input: Row = {};
  try {
    state = await access(request);
    input = await request.json().catch(() => ({})) as Row;
    const action = text(input.action, 80).toLowerCase();
    todoCode = text(input.todoCode, 80);
    const todo = requireTodo(state, todoCode);
    const actor = {
      actorUserKey: actorKey(state.user),
      actorEmployeeId: text(state.employee?.id, 80) || null,
      actorName: actorName(state.user),
      actorRole: state.role,
    };

    if (action === "create") {
      requireManagement(state);
      const title = text(input.title, 500);
      if (!title) throw new Error("Checklist item cannot be empty.");
      const created = await todoSubtaskGateway("create", { todoCode, title, ...actor }) as TodoSubtask;
      await recordAuditEvent({ user: state.user, request, action: "todo_subtask_created", entityType: "todo", entityId: todo.todo_code, after: { subtaskId: created.id, title: created.title }, source: "todo-subtasks" });
      return json({ success: true, data: created });
    }

    if (action === "rename") {
      requireManagement(state);
      const id = text(input.id, 80);
      const title = text(input.title, 500);
      if (!title) throw new Error("Checklist item cannot be empty.");
      const before = await itemFor(todoCode, id);
      const updated = await todoSubtaskGateway("rename", { todoCode, id, title }) as TodoSubtask;
      await recordAuditEvent({ user: state.user, request, action: "todo_subtask_renamed", entityType: "todo", entityId: todo.todo_code, before: { subtaskId: id, title: before.title }, after: { subtaskId: id, title: updated.title }, source: "todo-subtasks" });
      return json({ success: true, data: updated });
    }

    if (action === "toggle") {
      const id = text(input.id, 80);
      const completed = input.completed === true;
      const before = await itemFor(todoCode, id);
      const updated = await todoSubtaskGateway("toggle", { todoCode, id, completed, ...actor }) as TodoSubtask;
      await recordAuditEvent({
        user: state.user,
        request,
        action: completed ? "todo_subtask_completed" : "todo_subtask_reopened",
        entityType: "todo",
        entityId: todo.todo_code,
        before: { subtaskId: id, title: before.title, completed: before.is_completed },
        after: { subtaskId: id, title: updated.title, completed: updated.is_completed },
        details: { employeeSelfUpdate: state.role === "employee" },
        source: "todo-subtasks",
      });
      return json({ success: true, data: updated });
    }

    if (action === "delete") {
      requireManagement(state);
      const id = text(input.id, 80);
      const before = await itemFor(todoCode, id);
      await todoSubtaskGateway("delete", { todoCode, id });
      await recordAuditEvent({ user: state.user, request, action: "todo_subtask_deleted", entityType: "todo", entityId: todo.todo_code, before: { subtaskId: id, title: before.title, completed: before.is_completed }, source: "todo-subtasks" });
      return json({ success: true, data: { deleted: true, id } });
    }

    if (action === "reorder") {
      requireManagement(state);
      const ids = Array.isArray(input.ids) ? input.ids.map((value: unknown) => text(value, 80)).filter(Boolean) : [];
      const updated = await todoSubtaskGateway("reorder", { todoCode, ids }) as TodoSubtask[];
      await recordAuditEvent({ user: state.user, request, action: "todo_subtasks_reordered", entityType: "todo", entityId: todo.todo_code, details: { count: updated.length }, source: "todo-subtasks" });
      return json({ success: true, data: updated });
    }

    throw new Error("Unsupported To Do checklist action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "To Do checklist request failed.";
    if (state?.user && todoCode) {
      await recordAuditEvent({ user: state.user, request, action: "todo_subtask_update", entityType: "todo", entityId: todoCode, outcome: "failure", details: { requestedAction: text(input.action, 80), error: message }, source: "todo-subtasks" }).catch(() => undefined);
    }
    return json({ success: false, error: message }, /authentication|session/i.test(message) ? 401 : /role|assigned to you|only management|identity|active/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400);
  }
}
