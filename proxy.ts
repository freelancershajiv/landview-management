import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "landview_session";
const PROTECTED = ["/admin", "/employee", "/client"];

function normalizeHost(value: string | null | undefined) {
  return String(value || "")
    .split(":")[0]
    .trim()
    .toLowerCase();
}

function trustedVercelHosts() {
  return new Set(
    [
      process.env.VERCEL_URL,
      process.env.VERCEL_BRANCH_URL,
      process.env.VERCEL_PROJECT_PRODUCTION_URL,
    ]
      .map(normalizeHost)
      .filter(Boolean)
  );
}

function isAppHost(host: string) {
  return (
    host === "app.landview.com.bd" ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    trustedVercelHosts().has(host)
  );
}

function isProtectedPath(path: string) {
  return PROTECTED.some(
    (prefix) => path === prefix || path.startsWith(prefix + "/")
  );
}

export function proxy(request: NextRequest) {
  const host = normalizeHost(request.headers.get("host"));
  const path = request.nextUrl.pathname;

  if (host === "app.landview.com.bd" && path === "/") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isProtectedPath(path)) {
    // Protected workspaces should never render on the public website host.
    // Redirect to the management app before doing any cookie checks.
    if (!isAppHost(host)) {
      return NextResponse.redirect(
        new URL(path + request.nextUrl.search, "https://app.landview.com.bd")
      );
    }

    // This is only an early UX gate. The server layouts and Apps Script
    // backend perform authoritative session + role validation.
    if (!request.cookies.get(COOKIE_NAME)?.value) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", path);
      return NextResponse.redirect(login);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|favicon.svg|icon-192.png|icon-512.png|manifest.json).*)",
  ],
};
