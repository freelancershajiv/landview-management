import { getVercelOidcToken } from "@vercel/oidc";

const OUTSOURCING_URL = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-outsourcing";
const AUDIENCE = "https://supabase.landview.internal";

type Row = Record<string, unknown>;

export async function callOutsourcing(input: Row, timeoutMs = 20_000) {
  const oidc = await getVercelOidcToken({ audience: AUDIENCE });
  if (!oidc) throw new Error("Vercel OIDC token is unavailable.");

  const response = await fetch(OUTSOURCING_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${oidc}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });

  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    const error = new Error(String(json?.error || `Outsourcing service returned HTTP ${response.status}.`));
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return json.data;
}
