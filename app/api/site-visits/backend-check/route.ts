import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const url = String(process.env.LAND_VIEW_API_URL || "").trim();
  const secret = String(process.env.LAND_VIEW_PROXY_SECRET || "").trim();
  if (!url || !secret) {
    return NextResponse.json({ success: false, stage: "config", error: "Drive backend is not configured." }, { status: 500 });
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        action: "uploadSiteVisitMedia",
        proxySecret: secret,
        projectId: "LV-DIAGNOSTIC",
        projectName: "Diagnostic",
        visitId: "SV-DIAGNOSTIC",
        kind: "visit",
        fileName: "diagnostic.jpg",
        mimeType: "image/jpeg",
        base64: "",
      }),
      signal: AbortSignal.timeout(15000),
    });
    const json = await response.json().catch(() => null);
    return NextResponse.json({
      success: true,
      upstreamStatus: response.status,
      upstreamSuccess: Boolean(json?.success),
      upstreamError: String(json?.error || ""),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, stage: "request", error: error instanceof Error ? error.message : "Backend check failed." }, { status: 500 });
  }
}
