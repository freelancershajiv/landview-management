import { NextRequest, NextResponse } from "next/server";
import { supabaseGateway } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_PATTERN = /^(vis|ses)_[0-9a-f-]{36}$/i;

function text(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function decodeHeader(value: string | null) {
  if (!value) return "";
  try {
    return decodeURIComponent(value).slice(0, 160);
  } catch {
    return value.slice(0, 160);
  }
}

function safePath(value: unknown) {
  let path = text(value, 300) || "/";
  if (!path.startsWith("/")) path = "/";
  if (/^\/verify\//i.test(path)) return "/verify/[redacted]";
  if (/^\/certificate\/verify\//i.test(path)) return "/certificate/verify/[redacted]";
  if (/^\/owner-access\//i.test(path)) return "/owner-access/[redacted]";
  return path;
}

function allowedOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") === "same-origin" || process.env.NODE_ENV !== "production";
  try {
    const originUrl = new URL(origin);
    const requestHost = request.nextUrl.hostname.toLowerCase();
    return originUrl.protocol === request.nextUrl.protocol && originUrl.hostname.toLowerCase() === requestHost;
  } catch {
    return false;
  }
}

function numberInRange(value: unknown, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

export async function POST(request: NextRequest) {
  if (!allowedOrigin(request)) {
    return NextResponse.json({ success: false, error: "Origin not allowed." }, { status: 403 });
  }

  let input: Record<string, unknown>;
  try {
    input = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request." }, { status: 400 });
  }

  const eventType = text(input.eventType, 40);
  if (eventType !== "page_view" && eventType !== "precise_location") {
    return NextResponse.json({ success: false, error: "Invalid analytics event." }, { status: 400 });
  }

  const visitorId = text(input.visitorId, 64);
  const sessionId = text(input.sessionId, 64);
  if (!ID_PATTERN.test(visitorId) || !ID_PATTERN.test(sessionId) || !visitorId.startsWith("vis_") || !sessionId.startsWith("ses_")) {
    return NextResponse.json({ success: false, error: "Invalid visitor identifiers." }, { status: 400 });
  }

  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const userAgent = text(request.headers.get("user-agent"), 500);
  const latitude = eventType === "precise_location" ? numberInRange(input.latitude, -90, 90) : null;
  const longitude = eventType === "precise_location" ? numberInRange(input.longitude, -180, 180) : null;
  const accuracy = eventType === "precise_location" ? numberInRange(input.accuracy, 0, 100_000) : null;

  if (eventType === "precise_location" && (latitude === null || longitude === null || accuracy === null)) {
    return NextResponse.json({ success: false, error: "Invalid location coordinates." }, { status: 400 });
  }

  const payload = {
    eventType,
    visitorId,
    sessionId,
    path: safePath(input.path),
    title: text(input.title, 180),
    referrer: text(input.referrer, 500),
    language: text(input.language, 40),
    screenWidth: numberInRange(input.screenWidth, 0, 20_000) ?? 0,
    screenHeight: numberInRange(input.screenHeight, 0, 20_000) ?? 0,
    preciseLatitude: latitude,
    preciseLongitude: longitude,
    preciseAccuracyM: accuracy,
    ipAddress: text(forwarded, 128),
    ipCountry: decodeHeader(request.headers.get("x-vercel-ip-country")),
    ipRegion: decodeHeader(request.headers.get("x-vercel-ip-country-region")),
    ipCity: decodeHeader(request.headers.get("x-vercel-ip-city")),
    ipLatitude: decodeHeader(request.headers.get("x-vercel-ip-latitude")),
    ipLongitude: decodeHeader(request.headers.get("x-vercel-ip-longitude")),
    ipTimezone: decodeHeader(request.headers.get("x-vercel-ip-timezone")),
    ipContinent: decodeHeader(request.headers.get("x-vercel-ip-continent")),
    userAgent,
    isBot: /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot/i.test(userAgent),
    sourceHost: text(request.nextUrl.hostname, 160),
  };

  let lastError = "Analytics storage failed.";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await supabaseGateway("trackVisitorAnalytics", payload, 15_000);
      return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store, max-age=0" } });
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Analytics backend unavailable.";
      console.error("Visitor analytics Supabase write failed", { attempt, eventType, error: lastError });
    }
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 300));
  }

  return NextResponse.json(
    { success: false, error: "Analytics storage temporarily unavailable." },
    { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
