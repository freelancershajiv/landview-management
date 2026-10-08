import { normalizeProjectCode, selectRows } from "@/lib/supabase-data";

type SiteVisitWhatsAppPayload = {
  visitId: string;
  projectId: string;
  projectName?: string;
  projectLocation?: string;
  employeeId?: string;
  employeeName?: string;
  senderEmployeeId?: string;
  visitDate?: string;
  purpose?: string;
  problemDetails?: string;
  actionRequired?: string;
  notes?: string;
  locationLatitude?: number | null;
  locationLongitude?: number | null;
  locationAccuracyM?: number | null;
  locationDistanceM?: number | null;
  locationVerificationStatus?: string;
  visitPhotoUrl?: string;
  problemPhotoUrl?: string;
  visitPhotoBase64?: string;
  visitPhotoMimeType?: string;
  problemPhotoBase64?: string;
  problemPhotoMimeType?: string;
};

export type SiteVisitWhatsAppResult = {
  status: "sent" | "queued" | "skipped" | "failed";
  messageId?: string;
  mediaCount?: number;
  reason?: string;
};

function text(value: unknown, max = 600) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function addLine(lines: string[], label: string, value: unknown, max = 600) {
  const cleaned = text(value, max);
  if (cleaned) lines.push(`*${label}:* ${cleaned}`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function directMedia(payload: SiteVisitWhatsAppPayload) {
  const media: Array<{ mimeType: string; base64: string; caption: string }> = [];
  const visitBase64 = String(payload.visitPhotoBase64 || "").trim();
  if (visitBase64) {
    media.push({
      mimeType: text(payload.visitPhotoMimeType || "image/jpeg", 80).toLowerCase(),
      base64: visitBase64,
      caption: `📷 LAND VIEW Site Visit Photo · ${text(payload.projectId, 80)} · ${text(payload.visitId, 120)}`.slice(0, 700),
    });
  }
  const problemBase64 = String(payload.problemPhotoBase64 || "").trim();
  if (problemBase64) {
    media.push({
      mimeType: text(payload.problemPhotoMimeType || "image/jpeg", 80).toLowerCase(),
      base64: problemBase64,
      caption: `⚠️ LAND VIEW Site Problem Photo · ${text(payload.projectId, 80)} · ${text(payload.visitId, 120)}`.slice(0, 700),
    });
  }
  return media.slice(0, 2);
}

export function formatSiteVisitWhatsAppMessage(payload: SiteVisitWhatsAppPayload) {
  const lines: string[] = ["🏗️ *LAND VIEW — SITE VISIT UPDATE*"];

  addLine(lines, "Visit ID", payload.visitId, 120);
  addLine(lines, "Project", [text(payload.projectId, 80), text(payload.projectName, 220)].filter(Boolean).join(" — "), 320);
  addLine(lines, "Project Location", payload.projectLocation, 300);
  addLine(lines, "Visited By", [text(payload.employeeName, 180), text(payload.employeeId, 80)].filter(Boolean).join(" · "), 280);
  addLine(lines, "Visit Date", payload.visitDate, 40);
  addLine(lines, "Purpose", payload.purpose, 500);
  addLine(lines, "Observation / Problem", payload.problemDetails, 750);
  addLine(lines, "Action Required", payload.actionRequired, 750);
  addLine(lines, "Notes", payload.notes, 600);

  const verification = text(payload.locationVerificationStatus, 80);
  const distance = Number(payload.locationDistanceM);
  const accuracy = Number(payload.locationAccuracyM);
  const locationParts = [
    verification === "VERIFIED" ? "✅ Verified" : verification,
    Number.isFinite(distance) ? `${Math.round(distance)} m from registered site` : "",
    Number.isFinite(accuracy) ? `GPS ±${Math.round(accuracy)} m` : "",
  ].filter(Boolean);
  if (locationParts.length) addLine(lines, "Location Verification", locationParts.join(" · "), 300);

  if (Number.isFinite(Number(payload.locationLatitude)) && Number.isFinite(Number(payload.locationLongitude))) {
    const lat = Number(payload.locationLatitude);
    const lon = Number(payload.locationLongitude);
    lines.push(`📍 https://maps.google.com/?q=${lat},${lon}`);
  }

  if (!payload.visitPhotoBase64) {
    const visitPhotoUrl = text(payload.visitPhotoUrl, 1000);
    if (visitPhotoUrl) lines.push(`📷 *Site Photo:* ${visitPhotoUrl}`);
  }
  if (!payload.problemPhotoBase64) {
    const problemPhotoUrl = text(payload.problemPhotoUrl, 1000);
    if (problemPhotoUrl) lines.push(`⚠️ *Problem Photo:* ${problemPhotoUrl}`);
  }

  lines.push("_Sent via the LAND VIEW Site Visit system._");
  return lines.join("\n").slice(0, 4000);
}

function formatClientSiteVisitMessage(payload: SiteVisitWhatsAppPayload) {
  const lines = [
    "🏗️ *LAND VIEW — PROJECT UPDATE*",
    `A new Site Visit has been recorded for *${text(payload.projectId, 80)}${payload.projectName ? ` — ${text(payload.projectName, 180)}` : ""}*.`,
  ];
  addLine(lines, "Visit Date", payload.visitDate, 40);
  addLine(lines, "Purpose", payload.purpose, 400);
  addLine(lines, "Observation", payload.problemDetails, 600);
  addLine(lines, "Action Required", payload.actionRequired, 600);
  lines.push("", "Reply *2* for the latest Site Visit or *menu* for more options.");
  lines.push("_LAND VIEW Architects & Engineers_");
  return lines.join("\n").slice(0, 4000);
}

async function botStoreRequest(token: string, input: Record<string, unknown>) {
  const url = String(
    process.env.WHATSAPP_BOT_STORE_URL ||
    "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-whatsapp-bot-store",
  ).trim();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-land-view-bot-token": token,
    },
    body: JSON.stringify(input),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as any;
  if (!response.ok || !json?.success) {
    throw new Error(text(json?.error || `WhatsApp queue returned HTTP ${response.status}.`, 500));
  }
  return json.data as any;
}
async function projectQueueRequest(token: string, input: Record<string, unknown>) {
  const url = "https://jupzgjlizxivhbmuigua.supabase.co/functions/v1/landview-whatsapp-project-queue";
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-land-view-bot-token": token,
    },
    body: JSON.stringify({ action: "projectQueue", ...input }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const json = await response.json().catch(() => null) as any;
  if (!response.ok || !json?.success) {
    throw new Error(text(json?.error || `WhatsApp project queue returned HTTP ${response.status}.`, 500));
  }
  return json.data as any;
}

async function wakeBot(token: string, path = "/wake") {
  const base = String(process.env.WHATSAPP_BOT_URL || "").trim().replace(/\/+$/, "");
  if (!base) return;
  try {
    await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "x-land-view-bot-token": token },
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
  } catch {
    // Render free instances can need longer than the request timeout to wake up.
    // Messages are already stored durably in Supabase, so a wake timeout is safe.
  }
}

async function queueClientSiteVisitUpdate(token: string, payload: SiteVisitWhatsAppPayload) {
  try {
    const projectCode = normalizeProjectCode(text(payload.projectId, 80));
    const project = (await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 }))[0];
    if (!project || project.whatsapp_updates_enabled !== true) return;

    const checkedPhone = text(project.whatsapp_checked_phone, 100).replace(/\D/g, "");
    const currentPhone = text(project.phone_number_snapshot, 100).replace(/\D/g, "");
    if (project.whatsapp_number_status === "inactive" && checkedPhone && checkedPhone === currentPhone) return;

    await projectQueueRequest(token, {
      projectCode,
      message: formatClientSiteVisitMessage(payload),
      dedupeKey: `client-site-visit:${text(payload.visitId, 120)}`,
      source: "site-visit",
    });
    await wakeBot(token, "/client/wake");
  } catch (error: any) {
    // A missing/invalid client phone must never block the Site Visit.
    console.warn("[site-visit-client-whatsapp] queue skipped", {
      message: text(error?.message || "Client WhatsApp update could not be queued.", 500),
    });
  }
}

async function waitForEmployeeWhatsApp(
  base: string,
  token: string,
  employeeId: string,
): Promise<{ ready: boolean; reason?: string }> {
  const deadline = Date.now() + 60_000;
  let lastState = "";
  let lastError = "";

  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    try {
      const response = await fetch(`${base}/employee/status?employeeId=${encodeURIComponent(employeeId)}`, {
        method: "GET",
        headers: { "x-land-view-bot-token": token },
        cache: "no-store",
        signal: AbortSignal.timeout(Math.max(1_500, Math.min(15_000, remaining))),
      });
      const json = await response.json().catch(() => null) as any;
      lastState = text(json?.connection, 80);
      lastError = text(json?.error || json?.lastError, 500);

      if (response.ok && lastState === "open" && json?.paired !== false) {
        return { ready: true };
      }
      if (lastState === "pairing") {
        return { ready: false, reason: "WhatsApp needs to be linked from the employee dashboard before Site Visit updates can be sent." };
      }
      if (lastState === "logged_out") {
        return { ready: false, reason: "The employee WhatsApp session is logged out. Reconnect it from the employee dashboard." };
      }
    } catch (error: any) {
      lastError = text(error?.message || "WhatsApp service is waking up.", 500);
    }

    if (Date.now() + 1_000 >= deadline) break;
    await sleep(1_000);
  }

  const detail = [lastState ? `state: ${lastState}` : "", lastError].filter(Boolean).join(" · ");
  return {
    ready: false,
    reason: detail
      ? `Employee WhatsApp did not become ready in time (${detail}).`
      : "Employee WhatsApp did not become ready in time. Please try the Site Visit again after the WhatsApp connection is open.",
  };
}

async function sendFromEmployeeWhatsApp(
  token: string,
  groupInviteCode: string,
  payload: SiteVisitWhatsAppPayload,
): Promise<SiteVisitWhatsAppResult> {
  const base = String(process.env.WHATSAPP_BOT_URL || "").trim().replace(/\/+$/, "");
  const employeeId = text(payload.senderEmployeeId || payload.employeeId, 120);
  if (!base) return { status: "skipped", reason: "LAND VIEW WhatsApp service URL is not configured." };
  if (!employeeId) return { status: "skipped", reason: "Employee ID is missing, so the WhatsApp sender cannot be selected." };

  const readiness = await waitForEmployeeWhatsApp(base, token, employeeId);
  if (!readiness.ready) {
    return { status: "skipped", reason: readiness.reason };
  }

  const message = formatSiteVisitWhatsAppMessage(payload);
  const media = directMedia(payload);
  let lastReason = "Employee WhatsApp send request failed.";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${base}/employee/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-land-view-bot-token": token,
        },
        body: JSON.stringify({
          employeeId,
          groupInviteCode,
          message,
          media,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(45_000),
      });
      const json = await response.json().catch(() => null) as any;

      if (response.status === 409) {
        return {
          status: "skipped",
          reason: text(json?.error || "Connect WhatsApp from the employee dashboard before Site Visit updates can be sent from this number.", 500),
        };
      }
      if (response.ok && json?.ok) {
        return {
          status: "sent",
          messageId: text(json?.messageId, 240) || undefined,
          mediaCount: Number.isFinite(Number(json?.mediaCount)) ? Number(json.mediaCount) : media.length,
        };
      }

      lastReason = text(json?.error || `Employee WhatsApp service returned HTTP ${response.status}.`, 500);
      const retryable = [429, 502, 503, 504].includes(response.status);
      if (!retryable || attempt === 3) {
        return { status: "failed", reason: lastReason };
      }
    } catch (error: any) {
      lastReason = text(error?.message || "Employee WhatsApp send request failed.", 500);
      if (attempt === 3) {
        return { status: "failed", reason: lastReason };
      }
    }

    await sleep(1_500 * attempt);
    const retryReadiness = await waitForEmployeeWhatsApp(base, token, employeeId);
    if (!retryReadiness.ready && attempt === 2) {
      return { status: "skipped", reason: retryReadiness.reason || lastReason };
    }
  }

  return { status: "failed", reason: lastReason };
}

export async function publishSiteVisitToWhatsApp(payload: SiteVisitWhatsAppPayload): Promise<SiteVisitWhatsAppResult> {
  const token = String(process.env.WHATSAPP_BOT_API_TOKEN || "").trim();
  const groupInviteCode = String(process.env.WHATSAPP_SITE_VISIT_GROUP_INVITE_CODE || "").trim();
  if (!token) {
    return { status: "skipped", reason: "LAND VIEW WhatsApp bot token is not configured." };
  }

  const clientUpdate = queueClientSiteVisitUpdate(token, payload);
  if (!groupInviteCode) {
    await clientUpdate;
    return { status: "skipped", reason: "LAND VIEW Site Visit WhatsApp group is not configured." };
  }

  try {
    const result = await sendFromEmployeeWhatsApp(token, groupInviteCode, payload);
    await clientUpdate;
    return result;
  } catch (error: any) {
    await clientUpdate;
    const reason = text(error?.message || "Employee WhatsApp send request failed.", 500);
    console.error("[site-visit-whatsapp] employee send error", { message: reason });
    return { status: "failed", reason };
  }
}
