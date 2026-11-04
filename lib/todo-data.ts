import { getVercelOidcToken } from "@vercel/oidc";

const TODO_URL = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-todo";
const AUDIENCE = "https://supabase.landview.internal";

type Row = Record<string, unknown>;

export type TodoItem = {
  id?: string;
  todo_code: string;
  title: string;
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

export function listTodoItems() {
  return todoGateway<TodoItem[]>("list");
}

export function createTodoItem(item: Row, createdBy: string) {
  return todoGateway<TodoItem>("create", { item, createdBy });
}

export function updateTodoItem(todoCode: string, item: Row) {
  return todoGateway<TodoItem>("update", { todoCode, item });
}

export function deleteTodoItem(todoCode: string) {
  return todoGateway<{ deleted: boolean; todoCode: string }>("delete", { todoCode });
}
