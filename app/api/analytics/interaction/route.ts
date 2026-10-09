import { NextRequest, NextResponse } from "next/server";
import { insertRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_PATTERN = /^(vis|ses)_[0-9a-f-]{36}$/i;
const ALLOWED_INTERACTIONS = new Set([
  "enquiry_open",
  "whatsapp_click",
  "call_click",
  "service_click",
  "project_click",
  "map_open",
  "map_project_select",
]);

function text(value: unknown, max = 300) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function safePath(value: unknown) {
  let path = text(value, 300) || "/";
  try {
    if (/^https?:\/\//i.test(path)) path = new URL(path).pathname;
  } catch {}
  if (!path.startsWith("/")) path = "/";
  if (/^\/verify\//i.test(path)) return "/verify/[redacted]";
  if (/^\/certificate\/verify\//i.test(path)) return "/certificate/verify/[redacted]";
  if (/^\/owner-access\//i.test(path)) return "/owner-access/[redacted]";
  return path;
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") === "same-origin" || process.env.NODE_ENV !== "production";
  try {
    const parsed = new URL(origin);
    return parsed.protocol === request.nextUrl.protocol && parsed.hostname.toLowerCase() === request.nextUrl.hostname.toLowerCase();
  } catch { return false; }
}

function decodeHeader(value: string | null) {
  if (!value) return "";
  try { return decodeURIComponent(value).slice(0, 160); }
  catch { return value.slice(0, 160); }
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function duplicateEvent(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /duplicate key|already exists|23505/i.test(message) && /event_id|website_analytics_interactions/i.test(message);
}

async function writeInteraction(row: Record<string, unknown>) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await insertRows("website_analytics_interactions", row);
      return;
    } catch (error) {
      if (duplicateEvent(error)) return;
      lastError = error;
      if (attempt < 2) await wait(250 * (attempt + 1));
    }
  }
  throw lastError || new Error("Analytics interaction write failed after retries.");
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Origin not allowed." }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const visitorId = text(body.visitorId, 64);
    const sessionId = text(body.sessionId, 64);
    const interactionName = text(body.interactionName, 60);

    if (!ID_PATTERN.test(visitorId) || !visitorId.startsWith("vis_") || !ID_PATTERN.test(sessionId) || !sessionId.startsWith("ses_")) {
      return NextResponse.json({ success: false, error: "Invalid visitor identifiers." }, { status: 400 });
    }
    if (!ALLOWED_INTERACTIONS.has(interactionName)) {
      return NextResponse.json({ success: false, error: "Invalid interaction type." }, { status: 400 });
    }

    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
    const row = {
      event_id: `int_${crypto.randomUUID()}`,
      visitor_id: visitorId,
      session_id: sessionId,
      occurred_at: new Date().toISOString(),
      page: safePath(body.path),
      interaction_name: interactionName,
      interaction_target: text(body.interactionTarget, 300) || null,
      interaction_label: text(body.interactionLabel, 300) || null,
      referrer: text(body.referrer, 500) || null,
      ip: text(forwarded, 128) || null,
      country: decodeHeader(request.headers.get("x-vercel-ip-country")) || null,
      region: decodeHeader(request.headers.get("x-vercel-ip-country-region")) || null,
      city: decodeHeader(request.headers.get("x-vercel-ip-city")) || null,
      device_name: text(body.deviceName, 120) || null,
      platform: text(body.platform, 100) || null,
      source_host: text(request.nextUrl.hostname, 160) || null,
    };

    await writeInteraction(row);
    return NextResponse.json({ success: true }, { status: 201, headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    console.error("Website interaction analytics write failed", error);
    return NextResponse.json({ success: false, error: "Analytics storage temporarily unavailable." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
