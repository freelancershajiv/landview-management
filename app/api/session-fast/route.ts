import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "landview_session";
const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";
const CACHE_TTL_MS = 90 * 1000;

type CacheEntry = { expiresAt: number; payload: any };
const cache = new Map<string, CacheEntry>();

function tokenKey(token: string) {
  return createHmac("sha256", PROXY_SECRET).update(token).digest("hex");
}

function clientKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHmac("sha256", PROXY_SECRET).update(forwarded).digest("hex").slice(0, 32);
}

function clearCookie(response: NextResponse) {
  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
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
      signal: AbortSignal.timeout(7000),
    });

    const text = await upstream.text();
    let json: any;
    try { json = JSON.parse(text); }
    catch { return NextResponse.json({ success: false, error: "Invalid session response." }, { status: 502 }); }

    if (!upstream.ok || !json?.success || !json?.data?.authenticated) {
      cache.delete(key);
      const response = NextResponse.json({ success: false, error: json?.message || json?.error || "Session expired." }, { status: 401 });
      clearCookie(response);
      return response;
    }

    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, payload: json });
    if (cache.size > 500) {
      const now = Date.now();
      for (const [k, v] of cache.entries()) if (v.expiresAt <= now) cache.delete(k);
    }

    return NextResponse.json(json, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.name === "TimeoutError" ? "Session validation timed out." : "Could not validate session." },
      { status: 502 },
    );
  }
}
