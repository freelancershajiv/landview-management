import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAuthGateway } from "@/lib/supabase-auth";
import {
  DEVICE_COOKIE,
  QUICK_USER_COOKIE,
  REFRESH_COOKIE,
  REMEMBER_COOKIE,
  SESSION_COOKIE,
  sessionMaxAge,
  signWorkspaceUser,
} from "@/lib/local-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEVICE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

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

function allowedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === "app.landview.com.bd" || host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request)) {
    return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
  }

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid login request." }, { status: 400 });
  }

  const userId = String(input.userId || input.username || "").trim();
  const password = String(input.password || "");
  const rememberRequested = input.rememberDevice === true || String(input.rememberDevice || "").toLowerCase() === "true";
  if (!userId || !password) {
    return NextResponse.json({ success: false, error: "Enter your User ID and password." }, { status: 400 });
  }

  try {
    const data = await supabaseAuthGateway<{
      accessToken: string;
      refreshToken: string;
      expiresIn?: number;
      user: Record<string, unknown>;
    }>("signIn", { userId, password });

    if (!data?.accessToken || !data?.refreshToken || !data?.user) throw new Error("Supabase Auth returned an incomplete session.");
    const role = String(data.user.role || data.user.Role || "").trim().toLowerCase();
    const remembered = rememberRequested && (role === "admin" || role === "manager");
    const maxAge = sessionMaxAge(remembered);
    const existingDeviceId = request.cookies.get(DEVICE_COOKIE)?.value?.trim();

    const response = NextResponse.json(
      { success: true, data: { user: data.user, remembered, backend: "supabase-auth" } },
      { headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache", "X-Landview-Auth": "supabase" } },
    );
    response.cookies.set(SESSION_COOKIE, data.accessToken, cookieOptions(maxAge));
    response.cookies.set(REFRESH_COOKIE, data.refreshToken, cookieOptions(maxAge));
    response.cookies.set(QUICK_USER_COOKIE, signWorkspaceUser(data.user), cookieOptions(maxAge));
    response.cookies.set(REMEMBER_COOKIE, remembered ? "1" : "", cookieOptions(remembered ? maxAge : 0));
    if (!existingDeviceId) response.cookies.set(DEVICE_COOKIE, `LVD-${randomUUID()}`, cookieOptions(DEVICE_MAX_AGE_SECONDS));
    return response;
  } catch (error: any) {
    const message = String(error?.message || "Invalid User ID or password.");
    const safe = /invalid login credentials|invalid.*password|credentials/i.test(message)
      ? "Invalid User ID or password."
      : message;
    return NextResponse.json(
      { success: false, error: safe },
      { status: Number(error?.status) === 401 ? 401 : 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
