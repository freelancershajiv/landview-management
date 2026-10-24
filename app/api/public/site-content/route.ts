import { NextResponse } from "next/server";
import { defaultWebsiteContent, normalizeWebsiteContent } from "@/lib/website-content";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_URL = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-website-content";

export async function GET() {
  try {
    const response = await fetch(CONTENT_URL, { method: "GET", next: { revalidate: 60 }, signal: AbortSignal.timeout(10_000) });
    const json = await response.json().catch(() => null);
    if (!response.ok || !json?.success) throw new Error(String(json?.error || `Website content service returned HTTP ${response.status}.`));
    return NextResponse.json({ success: true, data: normalizeWebsiteContent(json.data), meta: json.meta || {} }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch {
    return NextResponse.json({ success: true, data: defaultWebsiteContent, meta: { fallback: true } }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" } });
  }
}
