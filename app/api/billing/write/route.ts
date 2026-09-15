import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_COOKIE = "landview_session";
const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

function cleanKey(value: unknown) {
  const key = String(value ?? "").trim();
  return /^[A-Za-z0-9._:-]{12,120}$/.test(key) ? key : "";
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
    if (!APPS_SCRIPT_URL || !PROXY_SECRET) return NextResponse.json({ success: false, error: "LAND VIEW backend is not configured." }, { status: 503 });

    const token = request.cookies.get(SESSION_COOKIE)?.value || "";
    if (!token) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });

    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || "").trim();
    if (action !== "saveBill" && action !== "savePayment") {
      return NextResponse.json({ success: false, error: "Unsupported billing write action." }, { status: 400 });
    }

    const idempotencyKey = cleanKey(body.Idempotency_Key || body.idempotencyKey);
    if (!idempotencyKey) return NextResponse.json({ success: false, error: "A valid idempotency key is required." }, { status: 400 });

    // Intentionally one backend request only. Never automatically retry a money write.
    const backend = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...body, action, token, proxySecret: PROXY_SECRET, Idempotency_Key: idempotencyKey }),
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });

    const raw = await backend.text();
    let json: any;
    try {
      json = JSON.parse(raw);
    } catch {
      return NextResponse.json({ success: false, error: /^\s*</.test(raw) ? "Apps Script returned HTML instead of JSON." : "Apps Script returned invalid JSON." }, { status: 502 });
    }

    const message = String(json?.error || json?.message || "Billing write failed.");
    const status = json?.success ? 200 : /unauthorized|session/i.test(message) ? 401 : /access denied|permission/i.test(message) ? 403 : 502;
    return NextResponse.json(json, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const message = error instanceof Error && error.name === "TimeoutError"
      ? "The billing write response timed out. Refresh Billing before trying again so you do not duplicate a transaction."
      : error instanceof Error ? error.message : "Billing write failed.";
    return NextResponse.json({ success: false, error: message }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
