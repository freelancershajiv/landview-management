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
  status: "sent" | "skipped" | "failed";
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

  // WhatsApp text messages have a finite body size. Keep a safety margin while
  // preserving the most important visit metadata at the top of the message.
  return lines.join("\n").slice(0, 4000);
}

export async function publishSiteVisitToWhatsApp(payload: SiteVisitWhatsAppPayload): Promise<SiteVisitWhatsAppResult> {
  const accessToken = String(process.env.WHATSAPP_ACCESS_TOKEN || "").trim();
  const phoneNumberId = String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  const groupId = String(process.env.WHATSAPP_SITE_VISIT_GROUP_ID || "").trim();
  const graphVersion = String(process.env.WHATSAPP_GRAPH_VERSION || "").trim();

  if (!accessToken || !phoneNumberId || !groupId || !graphVersion) {
    return { status: "skipped", reason: "WhatsApp Groups API is not configured." };
  }

  try {
    const response = await fetch(`https://graph.facebook.com/${encodeURIComponent(graphVersion)}/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "group",
        to: groupId,
        type: "text",
        text: {
          preview_url: true,
          body: formatSiteVisitWhatsAppMessage(payload),
        },
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });

    const json = await response.json().catch(() => null) as any;
    if (!response.ok) {
      const apiMessage = text(json?.error?.message || json?.error?.error_user_msg || `HTTP ${response.status}`, 500);
      console.error("[site-visit-whatsapp] publish failed", { status: response.status, message: apiMessage });
      return { status: "failed", reason: apiMessage || "WhatsApp rejected the message." };
    }

    const messageId = text(json?.messages?.[0]?.id, 240);
    return { status: "sent", messageId: messageId || undefined };
  } catch (error: any) {
    const reason = text(error?.message || "WhatsApp request failed.", 500);
    console.error("[site-visit-whatsapp] publish error", { message: reason });
    return { status: "failed", reason };
  }
}
