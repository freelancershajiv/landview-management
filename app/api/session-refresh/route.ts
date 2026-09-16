import { NextRequest, NextResponse } from "next/server";
import { supabaseAuthGateway } from "@/lib/supabase-auth";
import {
  QUICK_USER_COOKIE,
  REFRESH_COOKIE,
  REMEMBER_COOKIE,
  SESSION_COOKIE,
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
  response.cookies.set(REFRESH_COOKIE, "", cookieOptions(0));
  response.cookies.set(QUICK_USER_COOKIE, "", cookieOptions(0));
  response.cookies.set(REMEMBER_COOKIE, "", cookieOptions(0));
}

export async function GET(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value || "";
  const remembered = request.cookies.get(REMEMBER_COOKIE)?.value === "1";
  if (!refreshToken) {
    const response = NextResponse.json({ success: false, error: "Session expired." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    clearAuth(response);
    return response;
  }

  try {
    const data = await supabaseAuthGateway<{
      accessToken: string;
      refreshToken: string;
      user: Record<string, unknown>;
    }>("refresh", { refreshToken });
    if (!data?.accessToken || !data?.refreshToken || !data?.user) throw new Error("Supabase Auth returned an incomplete refresh session.");

    const maxAge = sessionMaxAge(remembered);
    const response = NextResponse.json(
      { success: true, data: { authenticated: true, user: data.user, remembered, backend: "supabase-auth" } },
      { status: 200, headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Auth": "supabase" } },
    );
    response.cookies.set(SESSION_COOKIE, data.accessToken, cookieOptions(maxAge));
    response.cookies.set(REFRESH_COOKIE, data.refreshToken, cookieOptions(maxAge));
    response.cookies.set(QUICK_USER_COOKIE, signWorkspaceUser(data.user), cookieOptions(maxAge));
    if (remembered) response.cookies.set(REMEMBER_COOKIE, "1", cookieOptions(maxAge));
    return response;
  } catch {
    const response = NextResponse.json({ success: false, error: "Session expired." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    clearAuth(response);
    return response;
  }
}
