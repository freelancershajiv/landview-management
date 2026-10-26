import { getVercelOidcToken } from "@vercel/oidc";
import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { roleOf } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OUTSOURCING_URL = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-outsourcing";
const AUDIENCE = "https://supabase.landview.internal";

type Row = Record<string, unknown>;

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

function actorOf(user: Row) {
  return text(
    user.User_ID || user.userId || user.Employee_ID || user.employeeId || user.username || user.Username || "LAND VIEW",
    160,
  );
}

async function requireFinanceUser(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  const role = roleOf(user);
  if (role !== "admin" && role !== "manager") throw new Error("Admin or Manager access is required.");
  return user;
}

async function callOutsourcing(input: Row) {
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
    signal: AbortSignal.timeout(20_000),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    const error = new Error(String(json?.error || `Outsourcing service returned HTTP ${response.status}.`));
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return json.data;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Outsourcing request failed.";
  const upstream = Number((error as Error & { status?: number })?.status || 0);
  const status = /session/i.test(message) ? 401 : /access/i.test(message) ? 403 : upstream >= 400 && upstream < 500 ? upstream : 502;
  return NextResponse.json(
    { success: false, error: message },
    { status, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function GET(request: NextRequest) {
  try {
    await requireFinanceUser(request);
    const data = await callOutsourcing({ action: "snapshot" });
    return NextResponse.json(
      { success: true, data },
      { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase-outsourcing" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) {
      return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    }
    const user = await requireFinanceUser(request);
    const body = await request.json() as Row;
    const action = text(body.action, 80);
    if (!action || action === "snapshot") {
      return NextResponse.json({ success: false, error: "A valid outsourcing action is required." }, { status: 400 });
    }
    const data = await callOutsourcing({ ...body, action, actor: actorOf(user) });
    return NextResponse.json(
      { success: true, data },
      { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase-outsourcing" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
