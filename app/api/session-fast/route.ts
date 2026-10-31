import { NextRequest, NextResponse } from "next/server";
import { supabaseAuthGateway } from "@/lib/supabase-auth";
import { isAllowedRequestOrigin } from "@/lib/request-origin";
import {
  ACTING_USER_COOKIE,
  QUICK_USER_COOKIE,
  REFRESH_COOKIE,
  REMEMBER_COOKIE,
  SESSION_COOKIE,
  readSignedActingWorkspaceUser,
  requireLocalSession,
  roleOf,
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

function clearAuthCookies(response: NextResponse) {
  const options = cookieOptions(0);
  response.cookies.set(SESSION_COOKIE, "", options);
  response.cookies.set(REFRESH_COOKIE, "", options);
  response.cookies.set(QUICK_USER_COOKIE, "", options);
  response.cookies.set(REMEMBER_COOKIE, "", options);
  response.cookies.set(ACTING_USER_COOKIE, "", options);
}

function effectiveUser(request: NextRequest, originalUser: Record<string, unknown>) {
  if (roleOf(originalUser) !== "admin") return originalUser;
  return readSignedActingWorkspaceUser(request.cookies.get(ACTING_USER_COOKIE)?.value) || originalUser;
}

function sessionResponse(request: NextRequest, user: Record<string, unknown>, refreshed = false) {
  return NextResponse.json(
    {
      success: true,
      data: {
        authenticated: true,
        user,
        remembered: request.cookies.get(REMEMBER_COOKIE)?.value === "1",
        backend: refreshed ? "supabase-auth" : "supabase",
        refreshed,
      },
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Landview-Auth": refreshed ? "supabase-refresh" : "supabase",
      },
    },
  );
}

async function refreshPersistentSession(request: NextRequest) {
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value?.trim() || "";
  if (!refreshToken) {
    const response = NextResponse.json(
      { success: false, error: "Session expired." },
      { status: 401, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
    clearAuthCookies(response);
    return response;
  }

  const remembered = request.cookies.get(REMEMBER_COOKIE)?.value === "1";

  try {
    const data = await supabaseAuthGateway<{
      accessToken: string;
      refreshToken: string;
      user: Record<string, unknown>;
    }>("refresh", { refreshToken });

    if (!data?.accessToken || !data?.refreshToken || !data?.user) {
      throw new Error("Supabase Auth returned an incomplete refresh session.");
    }

    const maxAge = sessionMaxAge(remembered);
    const user = effectiveUser(request, data.user);
    const response = sessionResponse(request, user, true);
    response.cookies.set(SESSION_COOKIE, data.accessToken, cookieOptions(maxAge));
    response.cookies.set(REFRESH_COOKIE, data.refreshToken, cookieOptions(maxAge));
    response.cookies.set(QUICK_USER_COOKIE, signWorkspaceUser(data.user), cookieOptions(maxAge));
    response.cookies.set(REMEMBER_COOKIE, remembered ? "1" : "", cookieOptions(remembered ? maxAge : 0));
    return response;
  } catch (error: any) {
    const status = Number(error?.status || 0);
    const invalidSession = status === 400 || status === 401 || status === 403;

    if (invalidSession) {
      const response = NextResponse.json(
        { success: false, error: "Session expired." },
        { status: 401, headers: { "Cache-Control": "no-store, max-age=0" } },
      );
      clearAuthCookies(response);
      return response;
    }

    console.warn("LAND VIEW persistent session refresh failed", {
      message: error instanceof Error ? error.message.slice(0, 180) : "Unknown error",
    });
    return NextResponse.json(
      { success: false, error: "Session refresh is temporarily unavailable. Your login has been preserved." },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}

/**
 * Safe read-only validation. GET never rotates or mints authentication tokens.
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
    return sessionResponse(request, user, false);
  } catch (error) {
    console.warn("LAND VIEW Supabase session validation failed", {
      message: error instanceof Error ? error.message.slice(0, 180) : "Unknown error",
    });
    return NextResponse.json(
      { success: false, error: "Could not validate session. Your login has been preserved." },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}

/**
 * Authoritative bootstrap/refresh operation. Token rotation is intentionally
 * POST-only and same-origin protected.
 */
export async function POST(request: NextRequest) {
  if (!isAllowedRequestOrigin(request)) {
    return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
  }

  try {
    const user = await requireLocalSession(request);
    if (user) return sessionResponse(request, user, false);
    return refreshPersistentSession(request);
  } catch (error) {
    console.warn("LAND VIEW session bootstrap failed", {
      message: error instanceof Error ? error.message.slice(0, 180) : "Unknown error",
    });
    return refreshPersistentSession(request);
  }
}
