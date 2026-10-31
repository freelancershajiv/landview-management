import { NextRequest, NextResponse } from "next/server";
import { GET as legacyGET, POST as legacyPOST } from "../outsourcing/route";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { isAllowedRequestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;
const FINANCE_ROLES = new Set(["admin", "manager", "accounts"]);

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) return fail("Session expired.", 401);
  if (!FINANCE_ROLES.has(roleOf(user))) return fail("Finance access is required.", 403);
  return legacyGET(request);
}

export async function POST(request: NextRequest) {
  if (!isAllowedRequestOrigin(request)) return fail("Invalid request origin.", 403);
  const user = await requireLocalSession(request) as Row | null;
  if (!user) return fail("Session expired.", 401);
  if (!["admin", "manager"].includes(roleOf(user))) return fail("Admin or Manager access is required.", 403);
  return legacyPOST(request);
}
