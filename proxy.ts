import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "landview_session_v2";
const PROTECTED = ["/admin", "/employee", "/client"];

const RATE_LIMITED_POSTS: Record<string, { limit: number; windowMs: number }> = {
  "/api/login-fast": { limit: 12, windowMs: 5 * 60_000 },
  "/api/client-access": { limit: 30, windowMs: 5 * 60_000 },
  "/api/public/enquiry": { limit: 8, windowMs: 10 * 60_000 },
};

type RateBucket = { count: number; resetAt: number };
type RateLimitGlobal = typeof globalThis & { __landviewRateBuckets?: Map<string, RateBucket> };
const rateBuckets = ((globalThis as RateLimitGlobal).__landviewRateBuckets ??= new Map<string, RateBucket>());

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

function requestAddress(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
}

function rateLimitResponse(request: NextRequest, path: string) {
  if (request.method !== "POST") return null;
  const rule = RATE_LIMITED_POSTS[path];
  if (!rule) return null;

  const now = Date.now();
  const key = `${path}:${requestAddress(request)}`;
  let bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + rule.windowMs };
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);

  // Opportunistic cleanup keeps warm edge instances from retaining stale keys.
  if (rateBuckets.size > 1500) {
    for (const [entryKey, entry] of rateBuckets) {
      if (entry.resetAt <= now) rateBuckets.delete(entryKey);
    }
  }

  if (bucket.count <= rule.limit) return null;
  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return NextResponse.json(
    { success: false, error: "Too many requests. Please wait and try again." },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Retry-After": String(retryAfter),
        "X-RateLimit-Limit": String(rule.limit),
        "X-RateLimit-Reset": String(Math.ceil(bucket.resetAt / 1000)),
      },
    },
  );
}

export function proxy(request: NextRequest) {
  const host = normalizeHost(request.headers.get("host"));
  const path = request.nextUrl.pathname;

  const limited = rateLimitResponse(request, path);
  if (limited) return limited;

  // Public content has one production URL; keep workspaces on the app host.
  if (host === "app.landview.com.bd" && (path === "/services" || path.startsWith("/services/") || path === "/projects" || path.startsWith("/projects/") || path === "/team" || path === "/contact")) {
    return NextResponse.redirect(new URL(path + request.nextUrl.search, "https://www.landview.com.bd"), 308);
  }

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

    // This is only an early UX gate. The server layouts and Supabase backend
    // perform authoritative session + role validation.
    if (!request.cookies.get(COOKIE_NAME)?.value) {
      const login = new URL("/login", request.url);
      login.searchParams.set("next", path);
      return NextResponse.redirect(login);
    }
  }

  const response = NextResponse.next();
  if (host === "app.landview.com.bd" || isProtectedPath(path) || path === "/login" || path.startsWith("/verify/") || path.startsWith("/certificate/verify/")) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|favicon.svg|icon-192.png|icon-512.png|manifest.json).*)",
  ],
};
