import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  }[char] || char));
}

// This endpoint returns an SVG QR through Google's chart image service when available
// without exposing that third-party URL to the browser. The browser always loads a
// same-origin LAND VIEW URL, which is more reliable for screen display and printing.
export async function GET(request: NextRequest) {
  const data = String(request.nextUrl.searchParams.get("data") || "").trim();
  if (!data || data.length > 4096) {
    return new NextResponse("Invalid QR data.", { status: 400 });
  }

  try {
    const upstream = new URL("https://quickchart.io/qr");
    upstream.searchParams.set("text", data);
    upstream.searchParams.set("size", "220");
    upstream.searchParams.set("margin", "2");
    upstream.searchParams.set("format", "svg");
    upstream.searchParams.set("ecLevel", "M");

    const response = await fetch(upstream, { cache: "no-store" });
    if (!response.ok) throw new Error(`QR service returned ${response.status}`);
    const svg = await response.text();
    if (!svg.includes("<svg")) throw new Error("QR service returned invalid SVG.");

    return new NextResponse(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    const message = escapeXml("QR unavailable");
    const fallback = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220"><rect width="220" height="220" fill="white"/><rect x="1" y="1" width="218" height="218" fill="none" stroke="#cfd6da"/><text x="110" y="106" text-anchor="middle" font-family="Arial,sans-serif" font-size="14" fill="#4b5563">${message}</text><text x="110" y="128" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" fill="#6b7280">Use verification link</text></svg>`;
    return new NextResponse(fallback, {
      status: 200,
      headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
