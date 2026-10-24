import { getVercelOidcToken } from "@vercel/oidc";
import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { roleOf } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TESTIMONIALS_URL = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-testimonials";
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

async function callTestimonials(action: string, input: Record<string, unknown> = {}) {
  const oidc = await getVercelOidcToken({ audience: AUDIENCE });
  if (!oidc) throw new Error("Vercel OIDC token is unavailable.");
  const response = await fetch(TESTIMONIALS_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${oidc}`, "content-type": "application/json" },
    body: JSON.stringify({ action, ...input }),
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || `Testimonial service returned HTTP ${response.status}.`));
  return json.data;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await manager(request); if (auth.error) return auth.error;
    const data = await callTestimonials("list");
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load testimonials." }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const auth = await manager(request); if (auth.error) return auth.error;
    const body = await request.json() as Record<string, unknown>;
    const data = await callTestimonials("create", body);
    return NextResponse.json({ success: true, data }, { status: 201, headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not create testimonial." }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const auth = await manager(request); if (auth.error) return auth.error;
    const body = await request.json() as Record<string, unknown>;
    const data = await callTestimonials("update", body);
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not update testimonial." }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const auth = await manager(request); if (auth.error) return auth.error;
    const body = await request.json() as Record<string, unknown>;
    const data = await callTestimonials("delete", body);
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not delete testimonial." }, { status: 502 });
  }
}
