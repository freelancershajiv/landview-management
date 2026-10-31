import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "landview_session_v2";
const PROTECTED = ["/admin", "/employee", "/client", "/account", "/projectmanagement"];
const STRICT_APP_POSTS = new Set([
  "/api/login-fast",
  "/api/session-fast",
  "/api/session-refresh",
  "/api/client-access",
  "/api/landview",
  "/api/landview-hybrid",
  "/api/project-management",
  "/api/billing-verification",
  "/api/document-register",
  "/api/service-workflow",
  "/api/outsourcing",
]);

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
    [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
      .map(normalizeHost)
      .filter(Boolean),
  );
}

function isAppHost(host: string) {
  return host === "app.landview.com.bd" || host === "localhost" || host === "127.0.0.1" || trustedVercelHosts().has(host);
}

function strictAppOriginResponse(request: NextRequest, path: string) {
  if (request.method !== "POST" || !STRICT_APP_POSTS.has(path)) return null;
  const origin = request.headers.get("origin");
  if (!origin) {
    if (process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin") return null;
    return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
  }
  try {
    if (isAppHost(normalizeHost(new URL(origin).hostname))) return null;
  } catch {}
  return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
}

function isProtectedPath(path: string) {
  return PROTECTED.some((prefix) => path === prefix || path.startsWith(prefix + "/"));
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
  if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + rule.windowMs };
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (rateBuckets.size > 1500) {
    for (const [entryKey, entry] of rateBuckets) if (entry.resetAt <= now) rateBuckets.delete(entryKey);
  }
  if (bucket.count <= rule.limit) return null;
  const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  return NextResponse.json(
    { success: false, error: "Too many requests. Please wait and try again." },
    { status: 429, headers: { "Cache-Control": "no-store, max-age=0", "Retry-After": String(retryAfter), "X-RateLimit-Limit": String(rule.limit), "X-RateLimit-Reset": String(Math.ceil(bucket.resetAt / 1000)) } },
  );
}

function billingCompatibilityRewrite(request: NextRequest) {
  if (request.method !== "GET") return null;
  const url = request.nextUrl.clone();
  if (url.pathname === "/api/project-billing") {
    url.pathname = "/api/project-billing-compatible";
    return NextResponse.rewrite(url);
  }
  if (url.pathname !== "/api/landview") return null;
  const action = url.searchParams.get("action");
  if (action === "getBillingBook") {
    url.pathname = "/api/billing/book-compatible";
    url.searchParams.delete("action");
    return NextResponse.rewrite(url);
  }
  if (action === "getProjectBilling") {
    const projectId = url.searchParams.get("projectId") || url.searchParams.get("Project_ID") || "";
    url.pathname = "/api/project-billing-compatible";
    url.searchParams.delete("action");
    url.searchParams.set("response", "summary");
    if (projectId) url.searchParams.set("projectId", projectId);
    return NextResponse.rewrite(url);
  }
  return null;
}

function compatibilitySecurityRewrite(request: NextRequest) {
  const url = request.nextUrl.clone();
  const rewrites: Record<string, string> = {
    "/api/billing-verification": "/api/billing-verification-secure",
    "/api/document-register": "/api/document-register-secure",
    "/api/service-workflow": "/api/service-workflow-secure",
    "/api/outsourcing": "/api/outsourcing-secure",
    "/api/landview": "/api/landview-secure",
  };
  const target = rewrites[url.pathname];
  if (!target) return null;
  url.pathname = target;
  return NextResponse.rewrite(url);
}

export function proxy(request: NextRequest) {
  const host = normalizeHost(request.headers.get("host"));
  const path = request.nextUrl.pathname;

  const invalidOrigin = strictAppOriginResponse(request, path);
  if (invalidOrigin) return invalidOrigin;
  const limited = rateLimitResponse(request, path);
  if (limited) return limited;
  const billingRewrite = billingCompatibilityRewrite(request);
  if (billingRewrite) return billingRewrite;
  const securedCompatibility = compatibilitySecurityRewrite(request);
  if (securedCompatibility) return securedCompatibility;

  if (host === "app.landview.com.bd" && (path === "/services" || path.startsWith("/services/") || path === "/projects" || path.startsWith("/projects/") || path === "/team" || path === "/contact")) {
    return NextResponse.redirect(new URL(path + request.nextUrl.search, "https://www.landview.com.bd"), 308);
  }
  if (host === "app.landview.com.bd" && path === "/") return NextResponse.redirect(new URL("/login", request.url));

  if (isProtectedPath(path)) {
    if (!isAppHost(host)) return NextResponse.redirect(new URL(path + request.nextUrl.search, "https://app.landview.com.bd"));
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.svg|icon-192.png|icon-512.png|manifest.json).*)"],
};
