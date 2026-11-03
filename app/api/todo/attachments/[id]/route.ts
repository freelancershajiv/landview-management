import { NextRequest } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { employeeCodeOf, selectRows } from "@/lib/supabase-data";
import { listTodoItems } from "@/lib/todo-data";
import { todoCollaborationGateway, type TodoAttachment } from "@/lib/todo-collaboration";
import { readTodoAttachment } from "@/lib/todo-attachment-r2";

type Row = Record<string, any>;

function text(value: unknown, max = 1000) { return String(value ?? "").trim().slice(0, max); }
function errorResponse(message: string, status: number) { return Response.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } }); }
function fileName(value: unknown) { return text(value, 180).replace(/[\\/\x00-\x1f\x7f]+/g, "-") || "attachment"; }

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireLocalSession(request) as Row | null;
    if (!user) return errorResponse("Authentication required.", 401);
    const role = roleOf(user);
    if (!["admin", "manager", "employee"].includes(role)) return errorResponse("Attachment access is not available for this role.", 403);

    const { id } = await context.params;
    const attachment = await todoCollaborationGateway("getAttachment", { id: text(id, 80) }) as TodoAttachment;
    const todos = await listTodoItems();
    const todo = todos.find((item) => item.todo_code === attachment.todo_code);
    if (!todo) return errorResponse("To Do item was not found.", 404);

    if (role === "employee") {
      const code = employeeCodeOf(user);
      if (!code) return errorResponse("Employee identity is missing from this session.", 403);
      const employees = await selectRows("employees", { filters: { employee_code: code }, limit: 1 });
      const employee = employees[0];
      if (!employee || text(employee.status, 40).toLowerCase() !== "active") return errorResponse("Employee account is not active.", 403);
      if (text(todo.assigned_employee_id, 80) !== text(employee.id, 80)) return errorResponse("You can only open attachments for To Dos assigned to you.", 403);
    }

    const stored = await readTodoAttachment(attachment.file_id);
    const name = fileName(attachment.file_name);
    const encoded = encodeURIComponent(name);
    return new Response(stored.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": text(attachment.content_type, 180) || stored.contentType || "application/octet-stream",
        "Content-Length": String(stored.bytes.length),
        "Content-Disposition": `attachment; filename="${name.replace(/\"/g, "")}"; filename*=UTF-8''${encoded}`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not open attachment.";
    return errorResponse(message, /authentication|session/i.test(message) ? 401 : /role|assigned to you|identity|active/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400);
  }
}
