import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";

function hostAllowed(request: NextRequest) {
  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  if (["www.landview.com.bd", "landview.com.bd", "localhost", "127.0.0.1"].includes(host)) return true;
  const vercelHost = process.env.VERCEL_URL?.toLowerCase();
  return Boolean(vercelHost && host === vercelHost);
}

export async function GET(request: NextRequest) {
  try {
    if (!hostAllowed(request)) return NextResponse.json({ success: false, error: "Not found." }, { status: 404 });
    if (!APPS_SCRIPT_URL || !PROXY_SECRET) return NextResponse.json({ success: false, error: "Public team service is not configured." }, { status: 503 });

    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "getPublicTeam", proxySecret: PROXY_SECRET }),
      cache: "no-store",
      redirect: "follow",
    });

    const text = await response.text();
    let json: unknown;
    try { json = JSON.parse(text); }
    catch { return NextResponse.json({ success: false, error: "Invalid team response." }, { status: 502 }); }

    return NextResponse.json(json, {
      status: response.ok ? 200 : response.status,
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" },
    });
  } catch {
    return NextResponse.json({ success: false, error: "Unable to load team." }, { status: 502 });
  }
}
