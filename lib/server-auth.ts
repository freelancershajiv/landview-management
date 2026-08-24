import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

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

function loginRedirect() {
  redirect("/login");
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
  const cookieHeader = cookieStore
    .getAll()
    .map(({ name, value }) => `${name}=${encodeURIComponent(value)}`)
    .join("; ");

  let response: Response;

  try {
    response = await fetch(
      `${protocol}://${host}/api/landview?action=getSession`,
      {
        method: "GET",
        headers: { cookie: cookieHeader },
        cache: "no-store",
      }
    );
  } catch {
    loginRedirect();
  }

  let json: SessionPayload;

  try {
    json = (await response!.json()) as SessionPayload;
  } catch {
    loginRedirect();
  }

  const authenticated = Boolean(json!.success && json!.data?.authenticated);
  const user = json!.data?.user;
  const role = String(user?.role || user?.Role || "")
    .trim()
    .toLowerCase() as PortalRole;

  if (!authenticated || !allowedRoles.includes(role)) {
    if (role === "employee") redirect("/employee");
    if (role === "client") redirect("/client");
    if (role === "admin" || role === "manager") redirect("/admin");
    loginRedirect();
  }

  return { user: user!, role };
}
