import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { normalizeProjectCode, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function clean(value: unknown, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}
function deny(message: string, status = 403) {
  return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}
async function requireAdminOrManager(request: NextRequest) {
  const user = (await requireLocalSession(request)) as Row | null;
  if (!user) throw new Error("Session expired.");
  const role = roleOf(user);
  if (role !== "admin" && role !== "manager") throw new Error("Admin or Manager access is required.");
  return user;
}
function config() {
  const base = clean(process.env.WHATSAPP_BOT_URL, 1000).replace(/\/+$/, "");
  const token = clean(process.env.WHATSAPP_BOT_API_TOKEN, 1000);
  const storeUrl = clean(process.env.WHATSAPP_BOT_STORE_URL, 1000) || "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-whatsapp-bot-store";
  if (!base || !token) throw new Error("WhatsApp bot is not configured.");
  return { base, token, storeUrl };
}
function retriableBotStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status === 502 || status === 503 || status === 504;
}
function retryDelay(attempt: number) {
  return Math.min(4_000, 1_000 * (attempt + 1));
}
async function storeRequest(action: string, input: Row = {}) {
  const { storeUrl, token } = config();
  const response = await fetch(storeUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-land-view-bot-token": token },
    body: JSON.stringify({ action, ...input }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const json = await response.json().catch(() => null) as any;
  if (!response.ok || !json?.success) throw new Error(clean(json?.error || `WhatsApp store returned HTTP ${response.status}.`, 800));
  return json.data;
}
async function projectQueueRequest(input: Row = {}) {
  const { token } = config();
  const queueUrl = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-whatsapp-project-queue";
  const response = await fetch(queueUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-land-view-bot-token": token },
    body: JSON.stringify({ action: "projectQueue", ...input }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const json = await response.json().catch(() => null) as any;
  if (!response.ok || !json?.success) throw new Error(clean(json?.error || `WhatsApp project queue returned HTTP ${response.status}.`, 800));
  return json.data as any;
}
async function clientPairingState() {
  const { base, token } = config();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(`${base}/client/pair?key=${encodeURIComponent(token)}`, {
        method: "GET",
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
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
            lastError: "WhatsApp client bot is waking or reconnecting. Status will refresh automatically.",
          };
        }
        throw new Error(`WhatsApp client bot returned HTTP ${response.status}.`);
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
    } catch (error) {
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
        lastError: "WhatsApp client bot is waking or reconnecting. Status will refresh automatically.",
      };
    }
  }
  return {
    connection: "connecting",
    paired: false,
    qrAvailable: false,
    qrDataUrl: null,
    temporary: true,
    lastError: "WhatsApp client bot is reconnecting.",
  };
}
async function wakeClientBot() {
  const { base, token } = config();
  try {
    await fetch(`${base}/client/wake`, {
      method: "POST",
      headers: { "x-land-view-bot-token": token },
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
  } catch {
    // Queue is durable; a sleeping free Render instance can wake after this request times out.
  }
}
async function wakeGroupBot() {
  const { base, token } = config();
  try {
    await fetch(`${base}/wake`, {
      method: "POST",
      headers: { "x-land-view-bot-token": token },
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
  } catch {
    // Group queue is durable; Render can drain it after the wake request returns.
  }
}
async function checkWhatsAppNumber(phoneNumber: string) {
  const { base, token } = config();
  await wakeClientBot();
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(`${base}/client/check-number`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-land-view-bot-token": token },
        body: JSON.stringify({ phoneNumber }),
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      const json = await response.json().catch(() => null) as any;
      if (!response.ok || !json?.ok) {
        const error = new Error(clean(json?.error || `WhatsApp bot returned HTTP ${response.status}.`, 800));
        (error as Error & { status?: number }).status = response.status;
        if (retriableBotStatus(response.status) && attempt < 3) {
          lastError = error;
          await new Promise((resolve) => setTimeout(resolve, retryDelay(attempt)));
          continue;
        }
        throw error;
      }
      return json;
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

  throw lastError instanceof Error ? lastError : new Error("WhatsApp number verification is temporarily unavailable.");
}

export async function GET(request: NextRequest) {
  try {
    await requireAdminOrManager(request);
    const mode = clean(request.nextUrl.searchParams.get("mode"), 40).toLowerCase() || "status";
    if (mode === "status") {
      return NextResponse.json({ success: true, data: await clientPairingState() }, { headers: { "Cache-Control": "no-store" } });
    }
    if (mode === "conversations") {
      return NextResponse.json({ success: true, data: await storeRequest("clientList", { limit: 150 }) }, { headers: { "Cache-Control": "no-store" } });
    }
    if (mode === "messages") {
      const conversationId = clean(request.nextUrl.searchParams.get("conversationId"), 100);
      if (!conversationId) return deny("Conversation ID is required.", 400);
      const messages = await storeRequest("clientMessages", { conversationId, limit: 200 });
      await storeRequest("clientMarkRead", { conversationId });
      return NextResponse.json({ success: true, data: messages }, { headers: { "Cache-Control": "no-store" } });
    }
    return deny("Unsupported mode.", 400);
  } catch (error: any) {
    const message = clean(error?.message || "Could not load WhatsApp client bot.", 1000);
    const status = /session expired/i.test(message) ? 401 : /Admin or Manager/i.test(message) ? 403 : 500;
    return deny(message, status);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return deny("Invalid request origin.", 403);
  try {
    await requireAdminOrManager(request);
    const body = await request.json().catch(() => ({})) as Row;
    const action = clean(body.action, 40).toLowerCase();

    if (action === "check-number") {
      const phoneNumber = clean(body.phoneNumber, 100);
      const projectCode = normalizeProjectCode(clean(body.projectCode, 100));
      if (!phoneNumber) return deny("Phone number is required.", 400);
      const json = await checkWhatsAppNumber(phoneNumber);
      if (projectCode) {
        await updateRows("projects", { project_code: projectCode }, {
          whatsapp_number_status: json.registered ? "active" : "inactive",
          whatsapp_number_checked_at: new Date().toISOString(),
          whatsapp_checked_phone: phoneNumber,
          updated_at: new Date().toISOString(),
        });
      }
      return NextResponse.json({ success: true, data: json });
    }

    if (action === "project-update") {
      const projectId = clean(body.projectId, 100);
      const projectCode = clean(body.projectCode, 100);
      const message = clean(body.message, 4000);
      const dedupeKey = clean(body.dedupeKey, 240);
      if ((!projectId && !projectCode) || !message) return deny("Project and update message are required.", 400);

      let projects: Row[] = [];
      if (projectCode) {
        projects = await selectRows("projects", { filters: { project_code: normalizeProjectCode(projectCode) }, limit: 1 });
      } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)) {
        projects = await selectRows("projects", { filters: { id: projectId }, limit: 1 });
      } else {
        projects = await selectRows("projects", { filters: { project_code: normalizeProjectCode(projectId) }, limit: 1 });
      }
      const project = projects[0];
      if (!project) return deny("Project was not found for the WhatsApp update.", 404);

      const directEnabled = project.whatsapp_updates_enabled === true;
      const groupTarget = clean(project.whatsapp_group_target, 200);
      const groupEnabled = project.whatsapp_group_updates_enabled === true && Boolean(groupTarget);
      if (!directEnabled && !groupEnabled) {
        return NextResponse.json({ success: true, data: { skipped: true, reason: "whatsapp-updates-disabled" } });
      }

      const source = clean(body.source, 80) || "project-update";
      const result: Row = {};

      if (directEnabled) {
        const checkedPhone = clean(project.whatsapp_checked_phone, 100).replace(/\D/g, "");
        const currentPhone = clean(project.phone_number_snapshot, 100).replace(/\D/g, "");
        if (project.whatsapp_number_status === "inactive" && checkedPhone && checkedPhone === currentPhone) {
          result.direct = { skipped: true, reason: "whatsapp-number-inactive" };
        } else {
          try {
            result.direct = await projectQueueRequest({ projectId, projectCode: project.project_code || projectCode, message, dedupeKey, source });
            await wakeClientBot();
          } catch (error: any) {
            result.direct = { queued: false, error: clean(error?.message || "Direct WhatsApp update could not be queued.", 800) };
          }
        }
      } else {
        result.direct = { skipped: true, reason: "direct-updates-disabled" };
      }

      if (groupEnabled) {
        try {
          result.group = await storeRequest("enqueue", {
            message,
            groupInviteCode: groupTarget,
            dedupeKey: `${dedupeKey || `${project.project_code || projectCode}:${source}:${Date.now()}`}:group`,
          });
          await wakeGroupBot();
        } catch (error: any) {
          result.group = { queued: false, error: clean(error?.message || "Project-group WhatsApp update could not be queued.", 800) };
        }
      } else {
        result.group = { skipped: true, reason: project.whatsapp_group_updates_enabled === true ? "group-target-missing" : "group-updates-disabled" };
      }

      return NextResponse.json({ success: true, data: result });
    }

    if (action === "reset") {
      await clientPairingState().catch(() => null);
      const { base, token } = config();
      const response = await fetch(`${base}/client/admin/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-land-view-bot-token": token },
        body: "{}",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
      const json = await response.json().catch(() => null) as any;
      if (!response.ok || !json?.ok) throw new Error(clean(json?.error || `WhatsApp bot returned HTTP ${response.status}.`, 800));
      return NextResponse.json({ success: true, data: { reset: true } });
    }

    const conversationId = clean(body.conversationId, 100);
    if (!conversationId) return deny("Conversation ID is required.", 400);

    if (action === "reply") {
      const message = clean(body.message, 4000);
      if (!message) return deny("Reply message is required.", 400);
      const queued = await storeRequest("clientQueue", { conversationId, message, source: "admin-inbox" });
      await wakeClientBot();
      return NextResponse.json({ success: true, data: queued });
    }
    if (action === "mark-read") {
      await storeRequest("clientMarkRead", { conversationId });
      return NextResponse.json({ success: true, data: { markedRead: true } });
    }
    if (action === "handoff") {
      const enabled = body.enabled !== false;
      const result = await storeRequest("clientHandoff", { conversationId, enabled });
      return NextResponse.json({ success: true, data: result });
    }

    return deny("Unsupported action.", 400);
  } catch (error: any) {
    const message = clean(error?.message || "Could not update WhatsApp client bot.", 1000);
    const status = /session expired/i.test(message) ? 401 : /Admin or Manager/i.test(message) ? 403 : 500;
    return deny(message, status);
  }
}
