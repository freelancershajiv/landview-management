import { getVercelOidcToken } from "@vercel/oidc";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATA_URL = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-data";
const AUDIENCE = "https://supabase.landview.internal";

export async function GET() {
  try {
    const token = await getVercelOidcToken({ audience: AUDIENCE });
    if (!token) throw new Error("OIDC unavailable");
    const response = await fetch(DATA_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ action: "health" }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const payload = await response.json().catch(() => null);
    const ok = response.ok && payload?.success === true && payload?.data?.backend === "supabase";
    return NextResponse.json(
      { ok, backend: ok ? "supabase" : "unavailable" },
      { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store", "X-Landview-Data": ok ? "supabase" : "fallback" } },
    );
  } catch {
    return NextResponse.json({ ok: false, backend: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
