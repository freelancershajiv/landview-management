import { NextRequest, NextResponse } from "next/server";
import { billingQrSvg } from "@/lib/billing-qr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const data = String(request.nextUrl.searchParams.get("data") || "").trim();
  if (!data || data.length > 4096) {
    return new NextResponse("Invalid QR data.", { status: 400 });
  }

  try {
    return new NextResponse(billingQrSvg(data), {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    // A failed image must not masquerade as a successful, printable QR.
    return new NextResponse("Could not encode QR data.", {
      status: 422,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
