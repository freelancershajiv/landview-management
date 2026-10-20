import { getVercelOidcToken } from "@vercel/oidc";

const AUTH_URL = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-auth";
const AUDIENCE = "https://supabase.landview.internal";
const CLOCK_SKEW_RETRY_MS = 2500;
const FUTURE_JWT_ERROR = /jwt\s+issued\s+at\s+future|iat.*future/i;

export type LandviewAuthUser = Record<string, unknown>;

type AuthGatewayResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callAuthGateway<T>(oidc: string, action: string, input: Record<string, unknown>) {
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
  return { response, json };
}

export async function supabaseAuthGateway<T = any>(action: string, input: Record<string, unknown> = {}): Promise<T> {
  const oidc = await getVercelOidcToken({ audience: AUDIENCE });
  if (!oidc) throw new Error("Vercel OIDC token is unavailable.");

  let result = await callAuthGateway<T>(oidc, action, input);

  // Vercel and Supabase clocks can occasionally differ by a fraction of a
  // second. Only retry the explicit future-issued JWT failure, using the same
  // signed token after it has aged past the small skew window. All other auth
  // failures remain immediate and are never bypassed.
  if (!result.response.ok && FUTURE_JWT_ERROR.test(String(result.json?.error || ""))) {
    await sleep(CLOCK_SKEW_RETRY_MS);
    result = await callAuthGateway<T>(oidc, action, input);
  }

  if (!result.response.ok || !result.json?.success) {
    const error = new Error(String(result.json?.error || `Supabase Auth service returned HTTP ${result.response.status}.`));
    (error as any).status = result.response.status;
    throw error;
  }
  return result.json.data as T;
}
