import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { roleOf } from "@/lib/supabase-data";
import { resolveGoogleMapsLocation } from "@/lib/google-maps-location";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MANAGE_ROLES = new Set(["admin", "manager"]);

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!MANAGE_ROLES.has(roleOf(user))) return NextResponse.json({ success: false, error: "Admin or manager access is required." }, { status: 403 });

    const body = await request.json() as Record<string, unknown>;
    const value = String(body.location || body.url || body.value || "").trim();
    if (!value) return NextResponse.json({ success: false, error: "Google Maps location is required." }, { status: 400 });

    const result = await resolveGoogleMapsLocation(value);
    if (!result) {
      return NextResponse.json({
        success: false,
        error: "Could not find coordinates in that Google Maps location. Use a shared pin/location link from Google Maps, or enter latitude and longitude manually.",
      }, { status: 422, headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({ success: true, data: result }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not resolve Google Maps location." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
