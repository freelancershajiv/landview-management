import { getVercelOidcToken } from "@vercel/oidc";

const URL = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-todo-collaboration";
const AUDIENCE = "https://supabase.landview.internal";

type Row = Record<string, unknown>;

export async function todoCollaborationGateway(action: string, input: Row = {}, timeoutMs = 15000) {
  const oidc = await getVercelOidcToken({ audience: AUDIENCE });
  if (!oidc) throw new Error("Vercel OIDC token is unavailable.");
  const response = await fetch(URL, {
    method: "POST",
    headers: { authorization: `Bearer ${oidc}`, "content-type": "application/json" },
    body: JSON.stringify({ action, ...input }),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(String(json?.error || `To Do collaboration service returned HTTP ${response.status}.`));
  }
  return json.data;
}

export type TodoComment = {
  id: string;
  todo_code: string;
  body: string;
  author_user_key?: string | null;
  author_employee_id?: string | null;
  author_name?: string | null;
  author_role?: string | null;
  created_at: string;
  updated_at: string;
};

export type TodoAttachment = {
  id: string;
  todo_code: string;
  file_name: string;
  file_id: string;
  content_type?: string | null;
  size_bytes: number;
  uploaded_by_user_key?: string | null;
  uploaded_by_employee_id?: string | null;
  uploaded_by_name?: string | null;
  uploaded_by_role?: string | null;
  created_at: string;
};
