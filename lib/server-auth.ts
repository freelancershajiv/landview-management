import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

export type PortalRole = "admin" | "manager" | "accounts" | "employee" | "client";

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

function isExplicitAuthFailure(response: Response, json: SessionPayload) {
  if (response.status === 401) return true;
  if (json?.data?.authenticated === false) return true;
  const message = String(json?.error || json?.message || "");
  return json?.success === false && /unauthorized|session\s+expired|invalid\s+session|authentication\s+required/i.test(message);
}

async function validateSession(url: string, cookieHeader: string): Promise<ValidationResult> {
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });

    const text = await response.text();
    let json: SessionPayload;
    try {
      json = JSON.parse(text) as SessionPayload;
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

  const sessionCookie = cookieStore.get("landview_session")?.value;
  if (!sessionCookie) loginRedirect();

  const incomingHost = normalizeHost(requestHeaders.get("host"));
  const host = trustedHosts().has(incomingHost)
    ? incomingHost
    : "app.landview.com.bd";

  const isLocal = host === "localhost" || host === "127.0.0.1";
  const protocol = isLocal ? "http" : "https";
  const origin = `${protocol}://${host}`;
  const cookieHeader = cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${encodeURIComponent(value)}`)
    .join("; ");

  // Fast validation normally comes from its short server cache. If that service
  // is temporarily unavailable, fall back to the fully retried API route.
  // Transport failures must never be interpreted as a logout.
  let validation = await validateSession(`${origin}/api/session-fast`, cookieHeader);
  if (validation.kind === "transient") {
    validation = await validateSession(`${origin}/api/landview?action=getSession`, cookieHeader);
  }

  if (validation.kind === "auth") loginRedirect();
  if (validation.kind !== "ok") {
    throw new Error("LAND VIEW could not validate the current session temporarily. Your sign-in has been preserved; refresh this page to retry.");
  }

  const json = validation.json;
  const user = json.data!.user!;
  const role = String(user?.role || user?.Role || "")
    .trim()
    .toLowerCase() as PortalRole;

  if (!allowedRoles.includes(role)) {
    if (role === "employee") redirect("/employee");
    if (role === "client") redirect("/client");
    if (role === "admin" || role === "manager" || role === "accounts") redirect("/admin");
    loginRedirect();
  }

  return { user, role };
}
