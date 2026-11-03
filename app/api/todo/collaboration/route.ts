import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf, userIdOf } from "@/lib/local-session";
import { recordAuditEvent } from "@/lib/audit-log";
import { employeeCodeOf, selectRows } from "@/lib/supabase-data";
import { listTodoItems, type TodoItem } from "@/lib/todo-data";
import { todoCollaborationGateway, type TodoAttachment } from "@/lib/todo-collaboration";
import { deleteTodoAttachment, uploadTodoAttachment } from "@/lib/todo-attachment-r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(["pdf", "jpg", "jpeg", "png", "webp", "doc", "docx", "xls", "xlsx", "csv", "txt", "dwg", "dxf", "zip"]);

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
function safeName(value: unknown) { return text(value, 180).replace(/[\\/\x00-\x1f\x7f]+/g, "-").replace(/\s+/g, " ").trim() || "attachment"; }
function extension(name: string) { return name.includes(".") ? name.split(".").pop()!.toLowerCase() : ""; }

async function access(request: NextRequest): Promise<Access> {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Authentication required.");
  const role = roleOf(user);
  if (!["admin", "manager", "employee"].includes(role)) throw new Error("To Do collaboration is not available for this role.");
  const todos = await listTodoItems();
  if (role !== "employee") return { user, role, employee: null, todos };

  const employeeCode = employeeCodeOf(user);
  if (!employeeCode) throw new Error("Employee identity is missing from this session.");
  const rows = await selectRows("employees", { filters: { employee_code: employeeCode }, limit: 1 });
  if (!rows.length) throw new Error(`Employee ${employeeCode} was not found.`);
  const employee = rows[0];
  if (text(employee.status, 40).toLowerCase() !== "active") throw new Error("Employee account is not active.");
  return {
    user,
    role,
    employee,
    todos: todos.filter((todo) => text(todo.assigned_employee_id, 80) === text(employee.id, 80)),
  };
}

function requireTodo(state: Access, todoCode: string) {
  const todo = state.todos.find((item) => item.todo_code === todoCode);
  if (!todo) throw new Error(state.role === "employee" ? "You can only collaborate on To Dos assigned to you." : "To Do item was not found.");
  return todo;
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
    dueDate: todo.due_date || "",
    dueTime: todo.due_time || "",
  };
}

async function detail(state: Access, todo: TodoItem) {
  const collaboration = await todoCollaborationGateway("list", { todoCode: todo.todo_code }) as { comments?: Row[]; attachments?: TodoAttachment[] };
  const audit = await selectRows("app_audit_log", {
    filters: { entity_type: "todo", entity_id: todo.todo_code },
    order: "created_at:desc",
    limit: 300,
  });
  const employeeId = text(state.employee?.id, 80);
  const attachments = (collaboration.attachments || []).map((item) => ({
    ...item,
    canDelete: state.role !== "employee" || Boolean(employeeId && text(item.uploaded_by_employee_id, 80) === employeeId),
  }));
  const activity = audit.map((row) => ({
    id: text(row.id, 100),
    action: text(row.action, 180),
    outcome: text(row.outcome, 40),
    actorName: text(row.actor_name, 250) || "LAND VIEW",
    actorRole: text(row.actor_role, 80),
    createdAt: text(row.created_at, 100),
    before: row.before_data || null,
    after: row.after_data || null,
    details: row.details || {},
    source: text(row.source, 100),
  }));
  activity.push({
    id: `created:${todo.todo_code}`,
    action: "todo_created",
    outcome: "success",
    actorName: text(todo.created_by, 250) || "LAND VIEW",
    actorRole: "",
    createdAt: text(todo.created_at, 100),
    before: null,
    after: { status: todo.status },
    details: {},
    source: "todo",
  });
  activity.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return { todo: taskSummary(todo), comments: collaboration.comments || [], attachments, activity };
}

export async function GET(request: NextRequest) {
  try {
    const state = await access(request);
    const todoCode = text(request.nextUrl.searchParams.get("todoCode"), 80);
    if (!todoCode) return json({ success: true, data: { tasks: state.todos.map(taskSummary) } });
    const todo = requireTodo(state, todoCode);
    return json({ success: true, data: await detail(state, todo) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load To Do collaboration.";
    return json({ success: false, error: message }, /authentication|session/i.test(message) ? 401 : /role|assigned to you|identity|active/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  let state: Access | null = null;
  let todoCode = "";
  try {
    state = await access(request);
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      todoCode = text(form.get("todoCode"), 80);
      const todo = requireTodo(state, todoCode);
      const file = form.get("file");
      if (!(file instanceof File)) throw new Error("Choose a file to attach.");
      if (file.size <= 0) throw new Error("Attachment is empty.");
      if (file.size > MAX_FILE_BYTES) throw new Error("Attachment exceeds the 4 MB limit.");
      const fileName = safeName(file.name);
      if (!ALLOWED_EXTENSIONS.has(extension(fileName))) throw new Error("This attachment file type is not allowed.");
      const bytes = Buffer.from(await file.arrayBuffer());
      const stored = await uploadTodoAttachment({ todoCode, fileName, contentType: text(file.type, 180) || "application/octet-stream", bytes });
      let attachment: Row;
      try {
        attachment = await todoCollaborationGateway("addAttachment", {
          todoCode,
          fileName: stored.fileName,
          fileId: stored.fileId,
          contentType: stored.contentType,
          sizeBytes: stored.size,
          uploadedByUserKey: actorKey(state.user),
          uploadedByEmployeeId: text(state.employee?.id, 80) || null,
          uploadedByName: actorName(state.user),
          uploadedByRole: state.role,
        }) as Row;
      } catch (error) {
        await deleteTodoAttachment(stored.fileId).catch(() => undefined);
        throw error;
      }
      await recordAuditEvent({ user: state.user, request, action: "todo_attachment_added", entityType: "todo", entityId: todo.todo_code, after: { attachmentId: attachment.id, fileName: stored.fileName, sizeBytes: stored.size }, source: "todo-collaboration" });
      return json({ success: true, data: attachment });
    }

    const input = await request.json().catch(() => ({})) as Row;
    const action = text(input.action, 80).toLowerCase();
    todoCode = text(input.todoCode, 80);
    const todo = requireTodo(state, todoCode);

    if (action === "comment") {
      const body = text(input.body, 4000);
      if (!body) throw new Error("Comment cannot be empty.");
      const comment = await todoCollaborationGateway("addComment", {
        todoCode,
        body,
        authorUserKey: actorKey(state.user),
        authorEmployeeId: text(state.employee?.id, 80) || null,
        authorName: actorName(state.user),
        authorRole: state.role,
      });
      await recordAuditEvent({ user: state.user, request, action: "todo_comment_added", entityType: "todo", entityId: todo.todo_code, details: { commentId: (comment as Row)?.id }, source: "todo-collaboration" });
      return json({ success: true, data: comment });
    }

    if (action === "deleteattachment") {
      const id = text(input.id, 80);
      if (!id) throw new Error("Attachment ID is required.");
      const attachment = await todoCollaborationGateway("getAttachment", { id }) as TodoAttachment;
      if (text(attachment.todo_code, 80) !== todo.todo_code) throw new Error("Attachment does not belong to this To Do.");
      if (state.role === "employee" && text(attachment.uploaded_by_employee_id, 80) !== text(state.employee?.id, 80)) {
        throw new Error("Employees can only delete attachments they uploaded themselves.");
      }
      await deleteTodoAttachment(attachment.file_id);
      await todoCollaborationGateway("deleteAttachment", { id, todoCode });
      await recordAuditEvent({ user: state.user, request, action: "todo_attachment_deleted", entityType: "todo", entityId: todo.todo_code, before: { attachmentId: id, fileName: attachment.file_name }, source: "todo-collaboration" });
      return json({ success: true, data: { deleted: true, id } });
    }

    throw new Error("Unsupported To Do collaboration action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "To Do collaboration request failed.";
    if (state?.user && todoCode) {
      await recordAuditEvent({ user: state.user, request, action: "todo_collaboration_update", entityType: "todo", entityId: todoCode, outcome: "failure", details: { error: message }, source: "todo-collaboration" }).catch(() => undefined);
    }
    return json({ success: false, error: message }, /authentication|session/i.test(message) ? 401 : /role|assigned to you|only delete|identity|active/i.test(message) ? 403 : /not found|does not belong/i.test(message) ? 404 : 400);
  }
}
