import { getVercelOidcToken } from "@vercel/oidc";
import { NextRequest, NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  requireLocalSession,
  roleOf,
} from "@/lib/local-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROLE_ADMIN_URL = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-role-admin";
const AUDIENCE = "https://supabase.landview.internal";

type RoleResult = {
  updated: boolean;
  previousRole: "employee" | "manager";
  role: "employee" | "manager";
  user: Record<string, unknown>;
  sessionRefreshRequired?: boolean;
};

function originAllowed(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) {
    return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  }
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === "app.landview.com.bd"
      || host === "www.landview.com.bd"
      || host === "landview.com.bd"
      || host === "localhost"
      || host === "127.0.0.1"
      || host.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function fail(error: string, status: number) {
  return NextResponse.json(
    { success: false, error },
    { status, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export async function POST(request: NextRequest) {
  if (!originAllowed(request)) return fail("Request origin is not allowed.", 403);

  const actor = await requireLocalSession(request);
  if (!actor) return fail("Session expired.", 401);
  if (roleOf(actor) !== "admin") return fail("Admin permission required.", 403);

  const accessToken = request.cookies.get(SESSION_COOKIE)?.value || "";
  if (!accessToken) return fail("Session expired.", 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return fail("Invalid request body.", 400);
  }

  const userId = String(body.userId || "").trim();
  const role = String(body.role || "").trim().toLowerCase();
  if (!userId) return fail("User ID is required.", 400);
  if (role !== "employee" && role !== "manager") {
    return fail("Role must be Employee or Manager.", 400);
  }

  try {
    const oidc = await getVercelOidcToken({ audience: AUDIENCE });
    if (!oidc) throw new Error("Vercel OIDC token is unavailable.");

    const response = await fetch(ROLE_ADMIN_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${oidc}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        action: "updateEmployeeRole",
        accessToken,
        userId,
        role,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });

    const payload = await response.json().catch(() => null) as {
      success?: boolean;
      data?: RoleResult;
      error?: string;
    } | null;

    if (!response.ok || !payload?.success || !payload.data) {
      return fail(String(payload?.error || `Role service returned HTTP ${response.status}.`), response.status || 500);
    }

    return NextResponse.json(
      { success: true, data: payload.data },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not update employee role.", 500);
  }
}
