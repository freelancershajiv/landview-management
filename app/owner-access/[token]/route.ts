import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Permanent bearer-link owner access is retired.
 * Admin/manager/accounts users must authenticate through the normal login flow.
 */
export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login?notice=owner-link-retired", request.url));
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
