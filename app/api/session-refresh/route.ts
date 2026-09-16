import { NextRequest, NextResponse } from "next/server";
import {
  QUICK_USER_COOKIE,
  REMEMBER_COOKIE,
  SESSION_COOKIE,
  requireLocalSession,
  sessionMaxAge,
  signWorkspaceUser,
} from "@/lib/local-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
    priority: "high" as const,
  };
}

function clearAuth(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
  response.cookies.set(QUICK_USER_COOKIE, "", cookieOptions(0));
  response.cookies.set(REMEMBER_COOKIE, "", cookieOptions(0));
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value || "";
  const remembered = request.cookies.get(REMEMBER_COOKIE)?.value === "1";

  try {
    const user = await requireLocalSession(request);
    if (!token || !user) {
      const response = NextResponse.json(
        { success: false, error: "Session expired." },
        { status: 401, headers: { "Cache-Control": "no-store, max-age=0" } },
      );
      clearAuth(response);
      return response;
    }

    const maxAge = sessionMaxAge(remembered);
    const response = NextResponse.json(
      { success: true, data: { authenticated: true, user, remembered, backend: "supabase" } },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-Landview-Data": "supabase",
        },
      },
    );
    response.cookies.set(SESSION_COOKIE, token, cookieOptions(maxAge));
    response.cookies.set(QUICK_USER_COOKIE, signWorkspaceUser(user), cookieOptions(maxAge));
    if (remembered) response.cookies.set(REMEMBER_COOKIE, "1", cookieOptions(maxAge));
    return response;
  } catch (error) {
    console.warn("LAND VIEW Supabase session refresh failed", {
      message: error instanceof Error ? error.message.slice(0, 180) : "Unknown error",
    });
    return NextResponse.json(
      { success: false, error: "Could not refresh session." },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
