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
  return lines.join("\n").slice(0, 4000);
}

function inviteCodeFrom(value: string) {
  const cleaned = value.trim();
  if (!cleaned) return "";
  const match = cleaned.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i);
  return text(match?.[1] || cleaned, 160);
}

function extractGroupId(value: any): string {
  const candidates = [
    value?.id,
    value?.group_id,
    value?.groupId,
    value?.chat_id,
    value?.chatId,
    value?.group?.id,
    value?.data?.id,
    value?.data?.group_id,
    value?.data?.groupId,
  ];
  for (const candidate of candidates) {
    const id = text(candidate, 240);
    if (id && (id.includes("@g.us") || id.includes("@lid"))) return id;
  }
  return "";
}

async function whapiRequest(path: string, token: string, init?: RequestInit) {
  const base = String(process.env.WHAPI_API_BASE || "https://gate.whapi.cloud").trim().replace(/\/+$/, "");
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  const json = await response.json().catch(() => null) as any;
  return { response, json };
}

async function resolveWhapiGroupId(token: string) {
  const configuredId = text(process.env.WHATSAPP_SITE_VISIT_GROUP_ID, 240);
  if (configuredId) return configuredId;

  const inviteCode = inviteCodeFrom(String(process.env.WHATSAPP_SITE_VISIT_GROUP_INVITE_CODE || ""));
  if (!inviteCode) return "";

  // If the paired WhatsApp account is not yet in the group, accept the supplied
  // normal WhatsApp invite first. Whapi documents PUT /groups with invite_code.
  const joined = await whapiRequest("/groups", token, {
    method: "PUT",
    body: JSON.stringify({ invite_code: inviteCode }),
  });

  let groupId = extractGroupId(joined.json);
  if (joined.response.ok && groupId) return groupId;

  // It may already be a member; resolving the invite still gives us the group ID.
  const resolved = await whapiRequest(`/groups/link/${encodeURIComponent(inviteCode)}`, token, { method: "GET" });
  groupId = extractGroupId(resolved.json);
  if (resolved.response.ok && groupId) return groupId;

  const message = text(
    joined.json?.message || joined.json?.error || resolved.json?.message || resolved.json?.error || `HTTP ${resolved.response.status}`,
    500,
  );
  throw new Error(message || "Could not resolve the WhatsApp group from its invite link.");
}

export async function publishSiteVisitToWhatsApp(payload: SiteVisitWhatsAppPayload): Promise<SiteVisitWhatsAppResult> {
  const token = String(process.env.WHAPI_TOKEN || "").trim();
  if (!token) {
    return { status: "skipped", reason: "Whapi WhatsApp session is not configured." };
  }

  try {
    const groupId = await resolveWhapiGroupId(token);
    if (!groupId) {
      return { status: "skipped", reason: "WhatsApp Site Visit group is not configured." };
    }

    const { response, json } = await whapiRequest("/messages/text", token, {
      method: "POST",
      body: JSON.stringify({
        to: groupId,
        body: formatSiteVisitWhatsAppMessage(payload),
      }),
    });

    if (!response.ok) {
      const apiMessage = text(json?.message || json?.error || json?.detail || `HTTP ${response.status}`, 500);
      console.error("[site-visit-whatsapp] Whapi publish failed", { status: response.status, message: apiMessage });
      return { status: "failed", reason: apiMessage || "WhatsApp rejected the message." };
    }

    const messageId = text(json?.id || json?.message_id || json?.messageId || json?.data?.id, 240);
    return { status: "sent", messageId: messageId || undefined };
  } catch (error: any) {
    const reason = text(error?.message || "WhatsApp request failed.", 500);
    console.error("[site-visit-whatsapp] Whapi publish error", { message: reason });
    return { status: "failed", reason };
  }
}
