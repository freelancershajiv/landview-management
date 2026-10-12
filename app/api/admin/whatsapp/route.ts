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

function retriableBotStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status === 502 || status === 503 || status === 504;
}

function retryDelay(attempt: number) {
  return Math.min(4_000, 1_000 * (attempt + 1));
}

async function pairingState() {
  const { base, token } = botConfig();
  let lastMessage = "WhatsApp service is reconnecting.";

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(`${base}/pair?key=${encodeURIComponent(token)}`, {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        lastMessage = `WhatsApp bot returned HTTP ${response.status}.`;
        if (retriableBotStatus(response.status) && attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt)));
          continue;
        }
        if (retriableBotStatus(response.status)) {
          return {
            connection: "connecting",
            paired: false,
            qrAvailable: false,
            qrDataUrl: null,
            temporary: true,
            lastError: "WhatsApp service is waking or reconnecting. Status will refresh automatically.",
          };
        }
        throw new Error(lastMessage);
      }

      const html = await response.text();
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
    } catch (error: any) {
      lastMessage = String(error?.message || "WhatsApp service is reconnecting.");
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt)));
        continue;
      }
      return {
        connection: "connecting",
        paired: false,
        qrAvailable: false,
        qrDataUrl: null,
        temporary: true,
        lastError: "WhatsApp service is waking or reconnecting. Status will refresh automatically.",
      };
    }
  }

  return {
    connection: "connecting",
    paired: false,
    qrAvailable: false,
    qrDataUrl: null,
    temporary: true,
    lastError: lastMessage,
  };
}

async function groupsState() {
  const { base, token } = botConfig();
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(`${base}/groups`, {
        headers: { "x-land-view-bot-token": token },
        cache: "no-store",
        signal: AbortSignal.timeout(12_000),
      });
      const json = await response.json().catch(() => null) as any;
      if (!response.ok || !json?.ok) {
        const error = new Error(String(json?.error || `WhatsApp bot returned HTTP ${response.status}.`));
        (error as Error & { status?: number }).status = response.status;
        if (retriableBotStatus(response.status) && attempt < 3) {
          lastError = error;
          await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt)));
          continue;
        }
        throw error;
      }
      return Array.isArray(json.groups) ? json.groups : [];
    } catch (error: any) {
      lastError = error;
      const status = Number(error?.status) || 0;
      if ((!status || retriableBotStatus(status)) && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt)));
        continue;
      }
      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Could not load WhatsApp groups.");
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminOrManager(request);
    const mode = String(request.nextUrl.searchParams.get("mode") || "status").trim().toLowerCase();
    if (mode === "groups") {
      const groups = await groupsState();
      return NextResponse.json({ success: true, data: groups }, { headers: { "Cache-Control": "no-store" } });
    }
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

    // Warm a sleeping Render instance before issuing the non-idempotent reset.
    await pairingState().catch(() => null);

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
