import { getVercelOidcToken } from "@vercel/oidc";
import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEALTH_URL = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-finance-health";
const OIDC_AUDIENCE = "https://supabase.landview.internal";

type Row = Record<string, any>;

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request) as Row | null;
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!["admin", "manager"].includes(roleOf(user))) {
      return NextResponse.json({ success: false, error: "Admin or Manager finance access is required." }, { status: 403 });
    }

    const oidc = await getVercelOidcToken({ audience: OIDC_AUDIENCE });
    if (!oidc) throw new Error("Vercel OIDC token is unavailable.");

    const response = await fetch(HEALTH_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${oidc}`, "content-type": "application/json" },
      body: JSON.stringify({ action: "snapshot" }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const json = await response.json().catch(() => null) as any;
    if (!response.ok || !json?.success) {
      throw new Error(String(json?.error || `Finance health service returned HTTP ${response.status}.`));
    }

    return NextResponse.json({ success: true, data: json.data }, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "X-Landview-Data": "supabase",
        "X-Landview-Module": "finance-control",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Finance Control Center.";
    return NextResponse.json({ success: false, error: message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
