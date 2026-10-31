import { NextRequest, NextResponse } from "next/server";
import { REMEMBER_COOKIE, requireLocalSession } from "@/lib/local-session";
import { POST as bootstrapSession } from "../session-fast/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Backward-compatible read-only session probe used by the login page.
 * GET never rotates access or refresh tokens.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request);
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Session expired." },
        { status: 401, headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          authenticated: true,
          user,
          remembered: request.cookies.get(REMEMBER_COOKIE)?.value === "1",
          backend: "supabase",
        },
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Could not validate session." },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}

/**
 * Explicit refresh remains available for older callers but delegates to the
 * canonical POST-only session bootstrap implementation.
 */
export async function POST(request: NextRequest) {
  return bootstrapSession(request);
}
