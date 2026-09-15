import { createHmac } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "landview_session";
const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";

function normalizeHost(value: string | null | undefined) {
  return String(value || "").split(":")[0].trim().toLowerCase();
}

function allowedHost(host: string) {
  const vercelHosts = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
    .map(normalizeHost)
    .filter(Boolean);
  return host === "app.landview.com.bd" || host === "localhost" || host === "127.0.0.1" || vercelHosts.includes(host);
}

function clientKey(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHmac("sha256", PROXY_SECRET).update(forwarded).digest("hex").slice(0, 32);
}

export async function GET(request: NextRequest) {
  try {
    if (!APPS_SCRIPT_URL || !PROXY_SECRET) {
      return NextResponse.json({ success: false, error: "LAND VIEW analytics backend is not configured." }, { status: 503 });
    }

    if (!allowedHost(normalizeHost(request.headers.get("host")))) {
      return NextResponse.json({ success: false, error: "Website analytics is available only inside the LAND VIEW management app." }, { status: 403 });
    }

    const token = request.cookies.get(COOKIE_NAME)?.value || "";
    if (!token) {
      return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    }

    const backend = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "getVisitorAnalytics",
        token,
        proxySecret: PROXY_SECRET,
        _clientKey: clientKey(request),
      }),
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });

    const raw = await backend.text();
    let json: any;
    try {
      json = JSON.parse(raw);
    } catch {
      return NextResponse.json({ success: false, error: "Analytics backend returned an invalid response." }, { status: 502 });
    }

    if (!backend.ok || !json?.success) {
      const message = String(json?.error || json?.message || "Could not load visitor analytics.");
      const status = /session|unauthorized|authentication/i.test(message) ? 401 : /access|admin/i.test(message) ? 403 : 502;
      return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({ success: true, data: json.data || {} }, { headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load visitor analytics.";
    return NextResponse.json({ success: false, error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
