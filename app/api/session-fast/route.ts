import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "landview_session";
const QUICK_USER_COOKIE = "landview_quick_user";
const QUICK_LOCK_COOKIE = "landview_quick_locked";
const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";
const CACHE_TTL_MS = 90 * 1000;
const UPSTREAM_TIMEOUT_MS = 7000;
const UPSTREAM_RETRY_DELAYS_MS = [0, 250, 800];

type CacheEntry = { expiresAt: number; payload: any };
const cache = new Map<string, CacheEntry>();

function tokenKey(token: string) {
  return createHmac("sha256", PROXY_SECRET).update(token).digest("hex");
}

function clientKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHmac("sha256", PROXY_SECRET).update(forwarded).digest("hex").slice(0, 32);
}

function clearAuthCookies(response: NextResponse) {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 0,
  };
  response.cookies.set(COOKIE_NAME, "", options);
  response.cookies.set(QUICK_USER_COOKIE, "", options);
  response.cookies.set(QUICK_LOCK_COOKIE, "", options);
}

function explicitSessionFailure(json: any) {
  if (json?.data?.authenticated === false) return true;
  if (json?.success !== false) return false;
  const message = String(json?.message || json?.error || "").trim().toLowerCase();
  return [
    "unauthorized",
    "session expired.",
    "session expired",
    "invalid session.",
    "invalid session",
    "authentication required.",
    "authentication required",
  ].includes(message);
}

async function fetchSession(request: NextRequest, token: string) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < UPSTREAM_RETRY_DELAYS_MS.length; attempt += 1) {
    const delay = UPSTREAM_RETRY_DELAYS_MS[attempt];
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      const upstream = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "getSession",
          token,
          proxySecret: PROXY_SECRET,
          _clientKey: clientKey(request),
        }),
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });

      const text = await upstream.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        lastError = new Error("Invalid session response.");
        if (attempt < UPSTREAM_RETRY_DELAYS_MS.length - 1) continue;
        throw lastError;
      }

      // Only exact session-expiry responses are authoritative. Messages such as
      // "Unauthorized gateway" are infrastructure/configuration failures and
      // must never delete a valid browser session.
      if (explicitSessionFailure(json)) return { upstream, json };

      // Retry temporary upstream/server failures without touching browser cookies.
      if ((!upstream.ok || !json?.success || !json?.data?.authenticated) && attempt < UPSTREAM_RETRY_DELAYS_MS.length - 1) {
        lastError = new Error(String(json?.message || json?.error || `Session service returned HTTP ${upstream.status}.`));
        continue;
      }

      return { upstream, json };
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error || "Could not validate session."));
      if (attempt >= UPSTREAM_RETRY_DELAYS_MS.length - 1) throw lastError;
    }
  }

  throw lastError || new Error("Could not validate session.");
}

export async function GET(request: NextRequest) {
  if (!APPS_SCRIPT_URL || !PROXY_SECRET) {
    return NextResponse.json({ success: false, error: "Session service is not configured." }, { status: 503 });
  }

  const token = request.cookies.get(COOKIE_NAME)?.value || "";
  if (!token) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });

  const key = tokenKey(token);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(cached.payload, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const { upstream, json } = await fetchSession(request, token);

    if (json?.success && json?.data?.authenticated) {
      cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, payload: json });
      if (cache.size > 500) {
        const now = Date.now();
        for (const [k, v] of cache.entries()) if (v.expiresAt <= now) cache.delete(k);
      }
      return NextResponse.json(json, { headers: { "Cache-Control": "no-store" } });
    }

    if (explicitSessionFailure(json)) {
      cache.delete(key);
      const response = NextResponse.json(
        { success: false, error: json?.message || json?.error || "Session expired." },
        { status: 401 },
      );
      clearAuthCookies(response);
      return response;
    }

    console.warn("LAND VIEW session validation preserved after transient backend result", {
      upstreamStatus: upstream.status,
      message: String(json?.message || json?.error || "Unknown session validation result").slice(0, 180),
    });

    // A temporary or malformed backend result must never destroy a valid session.
    return NextResponse.json(
      { success: false, error: json?.message || json?.error || "Could not validate session." },
      { status: upstream.status >= 500 ? 503 : 502 },
    );
  } catch (error: any) {
    console.warn("LAND VIEW session validation request failed; preserving session", {
      name: String(error?.name || "Error"),
      message: String(error?.message || "Could not validate session.").slice(0, 180),
    });
    return NextResponse.json(
      {
        success: false,
        error: error?.name === "TimeoutError" || error?.name === "AbortError"
          ? "Session validation timed out."
          : error?.message || "Could not validate session.",
      },
      { status: 502 },
    );
  }
}
