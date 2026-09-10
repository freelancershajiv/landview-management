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

export async function GET(request: NextRequest) {
  const data = String(request.nextUrl.searchParams.get("data") || "").trim();
  if (!data || data.length > 4096) {
    return new NextResponse("Invalid QR data.", { status: 400 });
  }

  try {
    const upstream = new URL("https://quickchart.io/qr");
    upstream.searchParams.set("text", data);
    upstream.searchParams.set("size", "320");
    upstream.searchParams.set("margin", "4");
    upstream.searchParams.set("format", "svg");
    // Lower error-correction density keeps the permanent project QR cleaner and easier to scan.
    upstream.searchParams.set("ecLevel", "L");

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
    const fallback = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><rect width="320" height="320" fill="white"/><rect x="1" y="1" width="318" height="318" fill="none" stroke="#cfd6da"/><text x="160" y="154" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" fill="#4b5563">${message}</text><text x="160" y="180" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#6b7280">Use verification link</text></svg>`;
    return new NextResponse(fallback, {
      status: 200,
      headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
