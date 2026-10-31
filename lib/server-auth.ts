import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE } from "@/lib/local-session";
import { hasCapability, type Capability } from "@/lib/permissions";

export type PortalRole = "admin" | "manager" | "employee" | "client";

type SessionUser = {
  role?: string;
  Role?: string;
  [key: string]: unknown;
};

type SessionPayload = {
  success?: boolean;
  data?: {
    authenticated?: boolean;
    user?: SessionUser;
  };
  error?: string;
  message?: string;
};

type ValidationResult =
  | { kind: "ok"; json: SessionPayload }
  | { kind: "auth" }
  | { kind: "transient" };

function normalizeHost(value: string | null | undefined) {
  return String(value || "")
    .split(":")[0]
    .trim()
    .toLowerCase();
}

function trustedHosts() {
  return new Set(
    [
      "app.landview.com.bd",
      "localhost",
      "127.0.0.1",
      process.env.VERCEL_URL,
      process.env.VERCEL_BRANCH_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
    ]
      .map(normalizeHost)
      .filter(Boolean)
  );
}

function loginRedirect(): never {
  redirect("/login");
}

function roleOf(user: SessionUser | null | undefined) {
  return String(user?.role || user?.Role || "").trim().toLowerCase() as PortalRole;
}

function redirectForRole(role: PortalRole): never {
  if (role === "employee") redirect("/employee");
  if (role === "client") redirect("/client");
  if (role === "admin" || role === "manager") redirect("/admin");
  loginRedirect();
}

function isExplicitAuthFailure(response: Response, json: SessionPayload) {
  if (response.status === 401) return true;
  if (json?.data?.authenticated === false) return true;
  if (json?.success !== false) return false;
  const message = String(json?.error || json?.message || "").trim().toLowerCase();
  return [
    "unauthorized",
    "session expired",
    "session expired.",
    "invalid session",
    "invalid session.",
    "authentication required",
    "authentication required.",
  ].includes(message);
}

async function validateSession(url: string, cookieHeader: string, method: "GET" | "POST" = "GET"): Promise<ValidationResult> {
  try {
    const response = await fetch(url, {
      method,
      headers: {
        cookie: cookieHeader,
        ...(method === "POST" ? { origin: new URL(url).origin } : {}),
      },
      cache: "no-store",
    });

    const body = await response.text();
    let json: SessionPayload;
    try {
      json = JSON.parse(body) as SessionPayload;
    } catch {
      return { kind: "transient" };
    }

    if (isExplicitAuthFailure(response, json)) return { kind: "auth" };
    if (!response.ok || !json?.success || !json?.data?.authenticated || !json?.data?.user) {
      return { kind: "transient" };
    }
    return { kind: "ok", json };
  } catch {
    return { kind: "transient" };
  }
}

export async function requirePortalSession(allowedRoles: PortalRole[]) {
  const cookieStore = await cookies();
  const requestHeaders = await headers();

  // Presence of the access cookie is only an early gate. The user identity used
  // by protected pages always comes from the session bootstrap endpoint after
  // Supabase validation/refresh. Quick-user cookies are never authoritative.
  if (!cookieStore.get(SESSION_COOKIE)?.value) loginRedirect();

  const incomingHost = normalizeHost(requestHeaders.get("host"));
  const host = trustedHosts().has(incomingHost) ? incomingHost : "app.landview.com.bd";
  const isLocal = host === "localhost" || host === "127.0.0.1";
  const origin = `${isLocal ? "http" : "https"}://${host}`;
  const cookieHeader = cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${encodeURIComponent(value)}`)
    .join("; ");

  // POST is intentional: session-fast may rotate refresh credentials.
  let validation = await validateSession(`${origin}/api/session-fast`, cookieHeader, "POST");
  if (validation.kind === "transient") {
    validation = await validateSession(`${origin}/api/landview?action=getSession`, cookieHeader, "GET");
  }

  if (validation.kind === "auth") loginRedirect();
  if (validation.kind !== "ok") {
    throw new Error(
      "LAND VIEW could not validate the current session temporarily. Your sign-in has been preserved; refresh this page to retry.",
    );
  }

  const user = validation.json.data!.user!;
  const role = roleOf(user);
  if (!allowedRoles.includes(role)) redirectForRole(role);
  return { user, role };
}

/**
 * Server-component authorization by product capability. Prefer this for new
 * protected pages instead of checking role names directly in page code.
 */
export async function requirePortalCapability(capability: Capability) {
  const session = await requirePortalSession(["admin", "manager", "employee", "client"]);
  if (!hasCapability(session.user, capability)) redirectForRole(session.role);
  return session;
}
