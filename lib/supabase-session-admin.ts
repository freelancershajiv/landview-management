import { getVercelOidcToken } from "@vercel/oidc";

const SESSION_ADMIN_URL = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-session-admin";
const AUDIENCE = "https://supabase.landview.internal";

type Row = Record<string, unknown>;

export async function supabaseSessionAdmin<T = unknown>(action: "list" | "annotate" | "terminate", input: Row = {}) {
  const oidc = await getVercelOidcToken({ audience: AUDIENCE });
  if (!oidc) throw new Error("Vercel OIDC token is unavailable.");

  const response = await fetch(SESSION_ADMIN_URL, {
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
    throw new Error(String(json?.error || `Supabase session service returned HTTP ${response.status}.`));
  }
  return json.data as T;
}
