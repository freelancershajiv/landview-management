import { getVercelOidcToken } from "@vercel/oidc";
import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { roleOf } from "@/lib/supabase-data";
import { normalizeWebsiteContent } from "@/lib/website-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_URL = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-website-content";
const AUDIENCE = "https://supabase.landview.internal";
const MANAGE_ROLES = new Set(["admin", "manager"]);

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

async function manager(request: NextRequest) {
  const user = await requireLocalSession(request);
  if (!user) return { error: NextResponse.json({ success: false, error: "Session expired." }, { status: 401 }) };
  if (!MANAGE_ROLES.has(roleOf(user))) return { error: NextResponse.json({ success: false, error: "Admin or manager access is required." }, { status: 403 }) };
  return { user };
}

async function callContent(action: "get" | "update", input: Record<string, unknown> = {}) {
  const oidc = await getVercelOidcToken({ audience: AUDIENCE });
  if (!oidc) throw new Error("Vercel OIDC token is unavailable.");
  const response = await fetch(CONTENT_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${oidc}`, "content-type": "application/json" },
    body: JSON.stringify({ action, ...input }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || `Website content service returned HTTP ${response.status}.`));
  return json;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await manager(request); if (auth.error) return auth.error;
    const json = await callContent("get");
    return NextResponse.json({ success: true, data: normalizeWebsiteContent(json.data), meta: json.meta || {} }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load website content." }, { status: 502 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const auth = await manager(request); if (auth.error) return auth.error;
    const body = await request.json() as Record<string, unknown>;
    const content = normalizeWebsiteContent(body.content);
    const user = auth.user as Record<string, unknown>;
    const updatedBy = String(user.name || user.Name || user.username || user.Username || "LAND VIEW Admin");
    const json = await callContent("update", { content, updatedBy });
    return NextResponse.json({ success: true, data: normalizeWebsiteContent(json.data), meta: json.meta || {} }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not save website content." }, { status: 502 });
  }
}
