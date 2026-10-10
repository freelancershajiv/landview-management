type SiteEntryWhatsAppPayload = {
  event: "submitted" | "created" | "approved" | "rejected";
  proposalId: string;
  clientName?: string;
  phone?: string;
  projectTitle?: string;
  projectType?: string;
  projectLocation?: string;
  plotArea?: string;
  floors?: string;
  siteVisitDate?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  locationAccuracyM?: number | string | null;
  mouza?: string;
  jlNo?: string;
  dagNo?: string;
  khatianNo?: string;
  submittedRole?: string;
  submittedBy?: string;
  senderEmployeeId?: string;
  reviewedBy?: string;
  reviewNotes?: string;
};

export type SiteEntryWhatsAppResult = {
  status: "sent" | "skipped" | "failed";
  sender?: "employee" | "admin";
  messageId?: string;
  reason?: string;
};

function text(value: unknown, max = 700) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

function addLine(lines: string[], label: string, value: unknown, max = 700) {
  const cleaned = text(value, max);
  if (cleaned) lines.push(`*${label}:* ${cleaned}`);
}

function finiteNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function landRecordText(payload: SiteEntryWhatsAppPayload) {
  return [
    text(payload.mouza) ? `Mouza ${text(payload.mouza, 160)}` : "",
    text(payload.jlNo) ? `JL ${text(payload.jlNo, 100)}` : "",
    text(payload.dagNo) ? `Dag ${text(payload.dagNo, 180)}` : "",
    text(payload.khatianNo) ? `Khatian ${text(payload.khatianNo, 180)}` : "",
  ].filter(Boolean).join(" · ");
}

export function formatSiteEntryWhatsAppMessage(payload: SiteEntryWhatsAppPayload) {
  const title = payload.event === "approved"
    ? "✅ *LAND VIEW — NEW SITE APPROVED*"
    : payload.event === "rejected"
      ? "❌ *LAND VIEW — NEW SITE REJECTED*"
      : payload.event === "created"
        ? "📍 *LAND VIEW — NEW SITE / DRAFT PROPOSAL*"
        : "📍 *LAND VIEW — NEW SITE ENTRY*";

  const lines: string[] = [title];
  addLine(lines, "Proposal", payload.proposalId, 120);
  addLine(lines, "Client / Owner", payload.clientName, 260);
  addLine(lines, "Phone", payload.phone, 100);
  addLine(lines, "Project", [text(payload.projectTitle, 260), text(payload.projectType, 120)].filter(Boolean).join(" · "), 420);
  addLine(lines, "Site Location", payload.projectLocation, 500);
  addLine(lines, "Site Entry Date", payload.siteVisitDate, 40);
  addLine(lines, "Land Area", payload.plotArea, 140);
  addLine(lines, "Proposed Floors", payload.floors, 100);
  addLine(lines, "Land Record", landRecordText(payload), 650);

  if (payload.event === "submitted" || payload.event === "created") {
    addLine(
      lines,
      "Entered By",
      [text(payload.submittedBy, 200), text(payload.senderEmployeeId, 100), text(payload.submittedRole, 80)].filter(Boolean).join(" · "),
      420,
    );
  } else {
    addLine(lines, payload.event === "approved" ? "Approved By" : "Rejected By", payload.reviewedBy, 260);
    addLine(lines, payload.event === "approved" ? "Approval Note" : "Reason", payload.reviewNotes, 800);
  }

  const lat = finiteNumber(payload.latitude);
  const lon = finiteNumber(payload.longitude);
  const accuracy = finiteNumber(payload.locationAccuracyM);
  if (lat !== null && lon !== null) {
    const gps = [`${lat.toFixed(7)}, ${lon.toFixed(7)}`];
    if (accuracy !== null) gps.push(`GPS ±${Math.round(accuracy)} m`);
    addLine(lines, "GPS", gps.join(" · "), 240);
    lines.push(`📍 https://maps.google.com/?q=${lat},${lon}`);
  }

  lines.push("");
  if (payload.event === "submitted") {
    lines.push("⏳ *Status:* Pending Management/Admin approval.");
  } else if (payload.event === "created") {
    lines.push("✅ *Status:* Draft Proposal created by Management/Admin.");
  } else if (payload.event === "approved") {
    lines.push("✅ *Status:* Approved → Draft Proposal. Use the existing Proposal → Project function when ready.");
  } else {
    lines.push("❌ *Status:* Rejected. This entry cannot be converted to a project.");
  }
  lines.push("🔗 https://app.landview.com.bd/admin/new-site");
  lines.push("_Sent via the LAND VIEW New Site Entry system._");
  return lines.join("\n").slice(0, 4000);
}

async function botRequest(path: string, body: Record<string, unknown>) {
  const base = String(process.env.WHATSAPP_BOT_URL || "").trim().replace(/\/+$/, "");
  const token = String(process.env.WHATSAPP_BOT_API_TOKEN || "").trim();
  if (!base || !token) throw new Error("LAND VIEW WhatsApp service is not configured.");

  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-land-view-bot-token": token,
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const json = await response.json().catch(() => null) as any;
  if (!response.ok || !json?.ok) {
    const error = new Error(text(json?.error || `WhatsApp service returned HTTP ${response.status}.`, 700));
    (error as any).status = response.status;
    throw error;
  }
  return json;
}

async function sendFromAdmin(message: string, groupInviteCode: string): Promise<SiteEntryWhatsAppResult> {
  try {
    const json = await botRequest("/admin/send-group", { groupInviteCode, message });
    return { status: "sent", sender: "admin", messageId: text(json?.messageId, 240) || undefined };
  } catch (error: any) {
    return { status: "failed", sender: "admin", reason: text(error?.message || "Admin WhatsApp send failed.", 700) };
  }
}

async function sendFromEmployee(employeeId: string, message: string, groupInviteCode: string): Promise<SiteEntryWhatsAppResult> {
  try {
    const json = await botRequest("/employee/send", { employeeId, groupInviteCode, message });
    return { status: "sent", sender: "employee", messageId: text(json?.messageId, 240) || undefined };
  } catch (error: any) {
    return { status: "failed", sender: "employee", reason: text(error?.message || "Employee WhatsApp send failed.", 700) };
  }
}

export async function publishSiteEntryToWhatsApp(payload: SiteEntryWhatsAppPayload): Promise<SiteEntryWhatsAppResult> {
  const groupInviteCode = String(process.env.WHATSAPP_SITE_VISIT_GROUP_INVITE_CODE || "").trim();
  const token = String(process.env.WHATSAPP_BOT_API_TOKEN || "").trim();
  const base = String(process.env.WHATSAPP_BOT_URL || "").trim();
  if (!token || !base) return { status: "skipped", reason: "LAND VIEW WhatsApp service is not configured." };
  if (!groupInviteCode) return { status: "skipped", reason: "LAND VIEW Site Visit WhatsApp group is not configured." };

  const message = formatSiteEntryWhatsAppMessage(payload);
  const employeeId = text(payload.senderEmployeeId, 100).toUpperCase();
  const employeeSubmission = payload.event === "submitted" && employeeId;

  if (employeeSubmission) {
    // Employee-originated new-site entries must be sent only from that employee's
    // connected WhatsApp account. Never silently fall back to the Admin/shared sender.
    return sendFromEmployee(employeeId, message, groupInviteCode);
  }

  return sendFromAdmin(message, groupInviteCode);
}
