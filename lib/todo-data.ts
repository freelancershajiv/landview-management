import { getVercelOidcToken } from "@vercel/oidc";
import {assertProjectWorkTitle,isProjectWorkTodo, type WorkArea} from "@/lib/todo-scope";

const TODO_URL = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-todo";
const AUDIENCE = "https://supabase.landview.internal";

type Row = Record<string, unknown>;

export type TodoItem = {
  id?: string;
  todo_code: string;
  title: string;
  work_area?: WorkArea;
  description?: string | null;
  status: "To Do" | "In Progress" | "Done";
  priority: "Low" | "Normal" | "High" | "Urgent";
  due_date?: string | null;
  due_time?: string | null;
  reminder_enabled?: boolean;
  reminder_minutes_before?: number | null;
  reminder_sent_at?: string | null;
  overdue_notified_at?: string | null;
  notification_last_attempt_at?: string | null;
  notification_last_error?: string | null;
  reference_type?: "None" | "Project" | "Proposal";
  project_code?: string | null;
  proposal_code?: string | null;
  workflow_id?: string | null;
  automation_source?: string | null;
  automation_key?: string | null;
  dependency_todo_code?: string | null;
  is_delivery_step?: boolean;
  workflow_stage?: string | null;
  service_key?: string | null;
  assigned_employee_id?: string | null;
  assigned_to?: string | null;
  created_by?: string | null;
  review_required?: boolean;
  review_state?: "not_submitted" | "submitted" | "revision_requested" | "approved";
  review_note?: string | null;
  review_actor?: string | null;
  review_changed_at?: string | null;
  estimated_minutes?: number | null;
  planned_date?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

async function todoGateway<T>(action: string, input: Row = {}): Promise<T> {
  const oidc = await getVercelOidcToken({ audience: AUDIENCE });
  if (!oidc) throw new Error("Vercel OIDC token is unavailable.");
  const response = await fetch(TODO_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${oidc}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ action, ...input }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(String(json?.error || `To Do service returned HTTP ${response.status}.`));
  }
  return json.data as T;
}

export async function listTodoItems() {
  const rows=await todoGateway<TodoItem[]>("list");
  return rows.filter(isProjectWorkTodo);
}

export function createTodoItem(item: Row, createdBy: string) {
  assertProjectWorkTitle(item.title ?? item.Title);
  return todoGateway<TodoItem>("create", { item, createdBy });
}

export function updateTodoItem(todoCode: string, item: Row) {
  assertProjectWorkTitle(item.title ?? item.Title);
  return todoGateway<TodoItem>("update", { todoCode, item });
}

export function deleteTodoItem(todoCode: string) {
  return todoGateway<{ deleted: boolean; todoCode: string }>("delete", { todoCode });
}

/** Completion is blocked until the entire predecessor chain exists and is complete. */
type DependencyItem = Pick<TodoItem, "todo_code" | "dependency_todo_code" | "status">;
const normalizeDependencyCode = (value: unknown) => String(value ?? "").trim().toUpperCase();
export function todoDependencyIndex(todos: readonly DependencyItem[]) {
  return new Map(todos.map(item => [normalizeDependencyCode(item.todo_code), item]));
}
export function todoDependencyBlocker(todo: Pick<TodoItem, "todo_code" | "dependency_todo_code">, todos: readonly DependencyItem[], index?: ReadonlyMap<string, DependencyItem>): string {
  const normalize = normalizeDependencyCode;
  const byCode = index || todoDependencyIndex(todos);
  const seen = new Set([normalize(todo.todo_code)]);
  let next = normalize(todo.dependency_todo_code);
  while (next) {
    if (seen.has(next)) return "Dependency cycle detected. Review the linked tasks.";
    seen.add(next);
    const predecessor = byCode.get(next);
    if (!predecessor) return "Required predecessor " + next + " was not found.";
    if (predecessor.status !== "Done") return "Complete predecessor " + next + " first.";
    next = normalize(predecessor.dependency_todo_code);
  }
  return "";
}

export function assertTodoDependencies(todo: TodoItem, todos: readonly TodoItem[]) {
  const blocker = todoDependencyBlocker(todo, todos);
  if (blocker) throw new Error(blocker);
}
