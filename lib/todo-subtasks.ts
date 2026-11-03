import { getVercelOidcToken } from "@vercel/oidc";

const SUBTASKS_URL = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-todo-subtasks";
const OIDC_AUDIENCE = "https://supabase.landview.internal";

export type TodoSubtask = {
  id: string;
  todo_id: string;
  todo_code: string;
  title: string;
  sort_order: number;
  is_completed: boolean;
  completed_at?: string | null;
  completed_by_user_key?: string | null;
  completed_by_employee_id?: string | null;
  completed_by_name?: string | null;
  completed_by_role?: string | null;
  created_by_user_key?: string | null;
  created_by_name?: string | null;
  created_by_role?: string | null;
  created_at: string;
  updated_at: string;
};

export async function todoSubtaskGateway(action: string, input: Record<string, unknown> = {}) {
  const oidc = await getVercelOidcToken({ audience: OIDC_AUDIENCE });
  if (!oidc) throw new Error("Vercel OIDC token is unavailable.");
  const response = await fetch(SUBTASKS_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${oidc}`, "content-type": "application/json" },
    body: JSON.stringify({ action, ...input }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const json = await response.json().catch(() => null) as any;
  if (!response.ok || !json?.success) throw new Error(String(json?.error || `To Do subtasks service returned HTTP ${response.status}.`));
  return json.data;
}
