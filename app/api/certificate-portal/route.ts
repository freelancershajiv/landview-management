import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";
const COOKIE_NAME = "landview_session";

function clean(value: unknown, max = 500) { return String(value ?? "").trim().slice(0, max); }
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

async function backend(request: NextRequest, certificatePortalOp: string, payload: Record<string, unknown> = {}) {
  if (!APPS_SCRIPT_URL || !PROXY_SECRET) throw new Error("Certificate portal backend is not configured.");
  const token = request.cookies.get(COOKIE_NAME)?.value || "";
  if (!token) throw new Error("Session expired.");
  const response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    cache: "no-store",
    redirect: "follow",
    body: JSON.stringify({ action: "getPublicProjects", _certificatePortal: "1", certificatePortalOp, proxySecret: PROXY_SECRET, token, ...payload }),
  });
  const raw = await response.text();
  let json: any;
  try { json = JSON.parse(raw); }
  catch { throw new Error(/^\s*</.test(raw) ? "Apps Script returned HTML instead of JSON." : "Certificate portal returned invalid JSON."); }
  if (!json?.success) throw new Error(String(json?.error || json?.message || "Certificate portal request failed."));
  return json.data || {};
}

export async function GET(request: NextRequest) {
  try {
    const mode = clean(request.nextUrl.searchParams.get("mode"), 30).toLowerCase();
    const data = await backend(request, mode === "admin" ? "adminList" : "mine");
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error: any) {
    const message = error?.message || "Could not load certificate portal.";
    return NextResponse.json({ success: false, error: message }, { status: /session|access|unauthorized/i.test(message) ? 401 : 502 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    const input = await request.json();
    const action = clean(input?.action, 30).toLowerCase();
    if (action === "request") {
      const data = await backend(request, "request", {
        category: clean(input?.category, 40), projectId: clean(input?.projectId, 60).toUpperCase(),
        subject: clean(input?.subject, 160), details: clean(input?.details, 800),
      });
      return NextResponse.json({ success: true, data });
    }
    if (action === "review") {
      const data = await backend(request, "review", {
        requestId: clean(input?.requestId, 80), decision: clean(input?.decision, 20), note: clean(input?.note, 400),
      });
      return NextResponse.json({ success: true, data });
    }
    if (action === "link-issued") {
      const data = await backend(request, "linkIssued", {
        requestId: clean(input?.requestId, 80), certificateId: clean(input?.certificateId, 80).toUpperCase(),
      });
      return NextResponse.json({ success: true, data });
    }
    return NextResponse.json({ success: false, error: "Unknown certificate portal action." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Certificate portal request failed." }, { status: 500 });
  }
}
