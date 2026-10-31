import { NextRequest, NextResponse } from "next/server";
import { POST as legacyPOST } from "../billing-verification/route";
import { requireLocalSession } from "@/lib/local-session";
import { isAllowedRequestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isAllowedRequestOrigin(request)) {
    return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
  }

  // The legacy handler still performs role/project authorization, but this
  // gateway guarantees it can never authorize from a signed quick-user cookie
  // after the real Supabase access session has expired or been revoked.
  const user = await requireLocalSession(request);
  if (!user) {
    return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
  }

  return legacyPOST(request);
}
