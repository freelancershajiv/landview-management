type SiteVisitWhatsAppPayload = {
  visitId: string;
  projectId: string;
  projectName?: string;
  projectLocation?: string;
  employeeId?: string;
  employeeName?: string;
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
};

export type SiteVisitWhatsAppResult = {
  status: "sent" | "queued" | "skipped" | "failed";
  messageId?: string;
  reason?: string;
};

function text(value: unknown, max = 600) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function addLine(lines: string[], label: string, value: unknown, max = 600) {
  const cleaned = text(value, max);
  if (cleaned) lines.push(`*${label}:* ${cleaned}`);
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

  const visitPhotoUrl = text(payload.visitPhotoUrl, 1000);
  if (visitPhotoUrl) lines.push(`📷 *Site Photo:* ${visitPhotoUrl}`);
  const problemPhotoUrl = text(payload.problemPhotoUrl, 1000);
  if (problemPhotoUrl) lines.push(`⚠️ *Problem Photo:* ${problemPhotoUrl}`);

  lines.push("_Submitted automatically from the LAND VIEW Employee Portal._");
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

async function wakeBot(token: string) {
  const base = String(process.env.WHATSAPP_BOT_URL || "").trim().replace(/\/+$/, "");
  if (!base) return;
  try {
    await fetch(`${base}/wake`, {
      method: "POST",
      headers: { "x-land-view-bot-token": token },
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
  } catch {
    // Render free instances can need longer than the request timeout to wake up.
    // The message is already stored durably in Supabase, so a wake timeout is safe.
  }
}

export async function publishSiteVisitToWhatsApp(payload: SiteVisitWhatsAppPayload): Promise<SiteVisitWhatsAppResult> {
  const token = String(process.env.WHATSAPP_BOT_API_TOKEN || "").trim();
  const groupInviteCode = String(process.env.WHATSAPP_SITE_VISIT_GROUP_INVITE_CODE || "").trim();
  if (!token || !groupInviteCode) {
    return { status: "skipped", reason: "LAND VIEW WhatsApp bot queue is not configured." };
  }

  try {
    const queued = await botStoreRequest(token, {
      action: "enqueue",
      dedupeKey: `site-visit:${text(payload.visitId, 120)}`,
      message: formatSiteVisitWhatsAppMessage(payload),
      groupInviteCode,
    });

    await wakeBot(token);

    const state = text(queued?.status, 40).toLowerCase();
    if (state === "sent") {
      return { status: "sent", messageId: text(queued?.provider_message_id, 240) || undefined };
    }
    return { status: "queued", messageId: text(queued?.id, 240) || undefined };
  } catch (error: any) {
    const reason = text(error?.message || "WhatsApp queue request failed.", 500);
    console.error("[site-visit-whatsapp] queue error", { message: reason });
    return { status: "failed", reason };
  }
}
