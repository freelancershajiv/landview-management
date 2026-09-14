import { createHmac, timingSafeEqual } from "node:crypto";
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

const QUICK_USER_COOKIE = "landview_quick_user";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";

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
  if (role === "admin" || role === "manager" || role === "accounts") redirect("/admin");
  loginRedirect();
}

function hmac(value: string) {
  return createHmac("sha256", PROXY_SECRET).update(value).digest("hex");
}

function secureEqual(a: string, b: string) {
  const aa = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function readSignedWorkspaceUser(value: string | undefined): SessionUser | null {
  if (!PROXY_SECRET) return null;
  const text = String(value || "");
  const dot = text.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = text.slice(0, dot);
  const signature = text.slice(dot + 1);
  if (!secureEqual(signature, hmac(`quick-user|${payload}`))) return null;
  try {
    const user = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as SessionUser;
    const role = roleOf(user);
    return ["admin", "manager", "accounts", "employee", "client"].includes(role) ? user : null;
  } catch {
    return null;
  }
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

  // Fast path: normal login and Quick PIN login both mint this server-signed,
  // HttpOnly identity cookie. Verify it locally instead of making another
  // Apps Script round trip on every page navigation.
  const signedUser = readSignedWorkspaceUser(cookieStore.get(QUICK_USER_COOKIE)?.value);
  if (signedUser) {
    const role = roleOf(signedUser);
    if (allowedRoles.includes(role)) return { user: signedUser, role };
    redirectForRole(role);
  }

  // Compatibility path for sessions created before the signed identity cookie
  // existed. It preserves existing users until their next normal sign-in.
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
  const role = roleOf(user);

  if (!allowedRoles.includes(role)) redirectForRole(role);
  return { user, role };
}
