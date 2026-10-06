import { NextRequest, NextResponse } from "next/server";
import { insertRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown, max = 1000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function services(value: unknown) {
  const values = Array.isArray(value) ? value : String(value ?? "").split(/[\n,;]+/);
  return [...new Set(values.map((item) => text(item, 100)).filter(Boolean))].slice(0, 12);
}

function safeEmail(value: unknown) {
  const email = text(value, 180).toLowerCase();
  if (!email) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function safePhone(value: unknown) {
  const phone = text(value, 40);
  if (!phone) return "";
  return /^[+()\-\s0-9]{7,40}$/.test(phone) ? phone : "";
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) {
      return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    }

    const body = await request.json() as Record<string, unknown>;
    if (text(body.website, 120)) {
      return NextResponse.json({ success: true, data: { accepted: true } });
    }

    const name = text(body.name, 120);
    const phone = safePhone(body.phone);
    const email = safeEmail(body.email);
    if (name.length < 2) {
      return NextResponse.json({ success: false, error: "Please enter your name." }, { status: 400 });
    }
    if (!phone && !email) {
      return NextResponse.json({ success: false, error: "Please provide a valid phone number or email address." }, { status: 400 });
    }

    const sourcePath = text(body.sourcePath, 300) || text(request.nextUrl.searchParams.get("source"), 300) || "/";
    const sourceReferrer = text(body.sourceReferrer, 500) || text(request.headers.get("referer"), 500);
    const rows = await insertRows("website_leads", {
      name,
      phone: phone || null,
      email: email || null,
      project_location: text(body.projectLocation, 300) || null,
      project_type: text(body.projectType, 100) || null,
      proposed_floors: text(body.proposedFloors, 80) || null,
      services: services(body.services),
      message: text(body.message, 1800) || null,
      source_path: sourcePath || null,
      source_referrer: sourceReferrer || null,
      utm_source: text(body.utmSource, 120) || null,
      utm_medium: text(body.utmMedium, 120) || null,
      utm_campaign: text(body.utmCampaign, 160) || null,
      status: "New",
      priority: "Normal",
    });
    const lead = rows[0] || {};

    return NextResponse.json(
      { success: true, data: { leadCode: lead.lead_code || "", status: lead.status || "New" } },
      { status: 201, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Could not submit your project enquiry." },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
