import { getVercelOidcToken } from "@vercel/oidc";

const AUTH_URL = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-auth";
const AUDIENCE = "https://supabase.landview.internal";

export type LandviewAuthUser = Record<string, unknown>;

type AuthGatewayResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export async function supabaseAuthGateway<T = any>(action: string, input: Record<string, unknown> = {}): Promise<T> {
  const oidc = await getVercelOidcToken({ audience: AUDIENCE });
  if (!oidc) throw new Error("Vercel OIDC token is unavailable.");

  const response = await fetch(AUTH_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${oidc}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ action, ...input }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });

  const json = (await response.json().catch(() => null)) as AuthGatewayResponse<T> | null;
  if (!response.ok || !json?.success) {
    const error = new Error(String(json?.error || `Supabase Auth service returned HTTP ${response.status}.`));
    (error as any).status = response.status;
    throw error;
  }
  return json.data as T;
}
