import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VISIT_ID = "SV-20261011-F057C3BD";

export async function GET(request: NextRequest) {
  const token = String(process.env.SITE_VISIT_RETRY_TOKEN || "").trim();
  if (!token) {
    return NextResponse.json({ success: false, error: "Recovery token is unavailable." }, { status: 503 });
  }

  const target = new URL("/api/site-visits/retry-whatsapp", request.nextUrl.origin);
  const result = await fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-land-view-site-visit-retry-token": token,
    },
    body: JSON.stringify({ visitId: VISIT_ID }),
    cache: "no-store",
    signal: AbortSignal.timeout(120_000),
  });
  const json = await result.json().catch(() => null);
  return NextResponse.json(json || { success: false, error: `Recovery returned HTTP ${result.status}.` }, {
    status: result.status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
