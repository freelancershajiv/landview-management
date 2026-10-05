import { NextRequest, NextResponse } from "next/server";
import { normalizeEstimateVerificationSnapshot, signEstimateVerification } from "@/lib/estimate-verification";
import { requireLocalSession, readSignedWorkspaceUser, roleOf } from "@/lib/local-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QUICK_USER_COOKIE = "landview_quick_user";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });

    let user = readSignedWorkspaceUser(request.cookies.get(QUICK_USER_COOKIE)?.value);
    if (!user) user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });

    const role = roleOf(user);
    if (role === "client") return NextResponse.json({ success: false, error: "Clients cannot issue estimate verification records." }, { status: 403 });

    const body = await request.json().catch(() => null);
    const snapshot = normalizeEstimateVerificationSnapshot(body?.snapshot || body || {});
    if (snapshot.grandTotal < 0) return NextResponse.json({ success: false, error: "Invalid estimate total." }, { status: 400 });

    const token = signEstimateVerification(snapshot);
    const origin = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const url = `${origin}/verify/estimate/${encodeURIComponent(token)}`;

    return NextResponse.json({ success: true, url, estimateId: snapshot.estimateId, permanent: true }, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error: any) {
    const message = error?.message || "Could not create estimate verification link.";
    const status = /unauthorized|session expired|authentication required|invalid session/i.test(message) ? 401 : /client|access|role/i.test(message) ? 403 : /invalid/i.test(message) ? 400 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
