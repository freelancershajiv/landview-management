import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function deny(message: string, status = 403) {
  return NextResponse.json(
    { success: false, error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

async function requireAdminOrManager(request: NextRequest) {
  const user = (await requireLocalSession(request)) as Row | null;
  if (!user) throw new Error("Session expired.");
  const role = roleOf(user);
  if (role !== "admin" && role !== "manager") throw new Error("Admin or Manager access is required.");
  return user;
}

function botConfig() {
  const base = String(process.env.WHATSAPP_BOT_URL || "").trim().replace(/\/+$/, "");
  const token = String(process.env.WHATSAPP_BOT_API_TOKEN || "").trim();
  if (!base || !token) throw new Error("WhatsApp bot is not configured.");
  return { base, token };
}

async function pairingState() {
  const { base, token } = botConfig();
  const response = await fetch(`${base}/pair?key=${encodeURIComponent(token)}`, {
    method: "GET",
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  const html = await response.text();
  if (!response.ok) throw new Error(`WhatsApp bot returned HTTP ${response.status}.`);

  const imageMatch = html.match(/<img\s+src="([^"]+)"/i);
  const qrDataUrl = imageMatch?.[1] || "";
  const connected = /<h2>Connected<\/h2>/i.test(html);
  const loggedOut = /Pairing reset required/i.test(html);

  return {
    connection: connected ? "open" : qrDataUrl ? "pairing" : loggedOut ? "logged_out" : "connecting",
    paired: connected,
    qrAvailable: Boolean(qrDataUrl),
    qrDataUrl: qrDataUrl || null,
  };
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminOrManager(request);
    const state = await pairingState();
    return NextResponse.json(
      { success: true, data: state },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error: any) {
    const message = String(error?.message || "Could not load WhatsApp pairing status.");
    const status = /session expired/i.test(message) ? 401 : /Admin or Manager/i.test(message) ? 403 : 500;
    return deny(message, status);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return deny("Invalid request origin.", 403);
  try {
    await requireAdminOrManager(request);
    const body = (await request.json().catch(() => ({}))) as Row;
    if (String(body?.action || "").trim().toLowerCase() !== "reset") {
      return deny("Unsupported action.", 400);
    }

    const { base, token } = botConfig();
    const response = await fetch(`${base}/admin/reset`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-land-view-bot-token": token,
      },
      body: "{}",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const json = await response.json().catch(() => null) as any;
    if (!response.ok || !json?.ok) {
      throw new Error(String(json?.error || `WhatsApp bot returned HTTP ${response.status}.`));
    }

    return NextResponse.json(
      { success: true, data: { reset: true } },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error: any) {
    const message = String(error?.message || "Could not reset WhatsApp pairing.");
    const status = /session expired/i.test(message) ? 401 : /Admin or Manager/i.test(message) ? 403 : 500;
    return deny(message, status);
  }
}
