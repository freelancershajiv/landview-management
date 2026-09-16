import { NextRequest, NextResponse } from "next/server";
import {
  QUICK_USER_COOKIE,
  REMEMBER_COOKIE,
  SESSION_COOKIE,
  requireLocalSession,
} from "@/lib/local-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clearAuthCookies(response: NextResponse) {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
  response.cookies.set(SESSION_COOKIE, "", options);
  response.cookies.set(QUICK_USER_COOKIE, "", options);
  response.cookies.set(REMEMBER_COOKIE, "", options);
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request);
    if (!user) {
      const response = NextResponse.json(
        { success: false, error: "Session expired." },
        { status: 401, headers: { "Cache-Control": "no-store, max-age=0" } },
      );
      clearAuthCookies(response);
      return response;
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
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-Landview-Data": "supabase",
        },
      },
    );
  } catch (error) {
    console.warn("LAND VIEW Supabase session validation failed", {
      message: error instanceof Error ? error.message.slice(0, 180) : "Unknown error",
    });
    return NextResponse.json(
      { success: false, error: "Could not validate session." },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
