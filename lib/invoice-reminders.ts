import { insertRows, selectRows } from "@/lib/supabase-data";

type Row = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "").trim();
const money = (value: number) => "BDT " + Math.max(0, value).toLocaleString("en-BD", { maximumFractionDigits: 2 });

export function bangladeshPhone(value: unknown) {
  let digits = text(value).replace(/\D/g, "");
  if (digits.startsWith("880")) digits = "0" + digits.slice(3);
  else if (digits.startsWith("88") && digits.length === 13) digits = digits.slice(2);
  if (digits.length === 10 && digits.startsWith("1")) digits = "0" + digits;
  return /^01\d{9}$/.test(digits) ? digits : "";
}
export function invoiceReminderMonth(date = new Date()) {
  // Use local Dhaka calendar month, not UTC month at the boundary.
  return new Date(date.getTime() + 6 * 60 * 60 * 1000).toISOString().slice(0, 7);
}
export function invoiceReminderReviewProjects(bills: Array<{
  projectId: string; settled: boolean; allocated: number; effectiveAmount: number;
}>) {
  return new Set(bills.filter((bill) => bill.settled &&
    bill.effectiveAmount > 0.009 && bill.allocated + 0.01 < bill.effectiveAmount)
    .map((bill) => bill.projectId));
}

export function invoiceReminderEligibility(project: Row, collectibleDue: number, needsReconciliation = false) {
  if (project.whatsapp_updates_enabled !== true) return { eligible: false, reason: "Client updates are disabled." };
  if (!Number.isFinite(collectibleDue) || collectibleDue <= 0.009) return { eligible: false, reason: "No collectible project due." };
  if (needsReconciliation) return { eligible: false, reason: "Historical Paid/allocation differences require reconciliation before contacting this client." };
  const phone = bangladeshPhone(project.phone_number_snapshot);
  if (!phone) return { eligible: false, reason: "Missing or invalid Bangladesh mobile number." };
  const checked = bangladeshPhone(project.whatsapp_checked_phone);
  if (text(project.whatsapp_number_status).toLowerCase() === "inactive" && checked === phone) {
    return { eligible: false, reason: "Number has been verified as inactive on WhatsApp." };
  }
  return { eligible: true, reason: "", phone };
}

export function invoiceReminderMessage(projectCode: string, collectibleDue: number, date = new Date()) {
  const dateDhaka = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dhaka" }).format(date);
  return [
    "LAND VIEW Architects & Engineers",
    "Billing reminder for project " + projectCode,
    "Current outstanding project balance: " + money(collectibleDue),
    "Balance checked on " + dateDhaka + ".",
    "Please contact our office if you have paid recently or need to reconcile your records.",
    "This is a payment reminder, not a payment receipt.",
  ].join("\n");
}

export async function queueInvoiceReminder(project: Row, collectibleDue: number, date = new Date(), needsReconciliation = false) {
  const eligibility = invoiceReminderEligibility(project, collectibleDue, needsReconciliation);
  if (!eligibility.eligible || !eligibility.phone) return { queued: false, reason: eligibility.reason, status: "skipped" };

  const projectCode = text(project.project_code);
  const dedupeKey = "invoice-reminder:" + projectCode + ":" + invoiceReminderMonth(date);
  const existing = await selectRows("whatsapp_client_outbox", { filters: { dedupe_key: dedupeKey }, limit: 1 });
  if (existing.length) return { queued: false, reason: "Already queued this month.", status: text(existing[0].status) || "pending" };

  const now = date.toISOString();
  try {
    // The UNIQUE dedupe_key index is the concurrency gate. Never upsert an
    // existing outbox record because that could resend a settled notification.
    await insertRows("whatsapp_client_outbox", {
      conversation_id: null,
      to_jid: "88" + eligibility.phone + "@s.whatsapp.net",
      message: invoiceReminderMessage(projectCode, collectibleDue, date),
      status: "pending",
      attempt_count: 0,
      next_attempt_at: now,
      last_error: null,
      provider_message_id: null,
      dedupe_key: dedupeKey,
      source: "invoice-reminder",
      event_key: "invoice-reminder:" + projectCode,
      priority: "routine",
      recipient_group: "client",
      template_key: "invoice_due",
      media_json: null,
      updated_at: now,
    });
  } catch (error) {
    // If a concurrent request won the unique insert, report its status.
    const concurrent = await selectRows("whatsapp_client_outbox", { filters: { dedupe_key: dedupeKey }, limit: 1 }).catch(() => []);
    if (concurrent.length) return { queued: false, reason: "Already queued this month.", status: text(concurrent[0].status) || "pending" };
    throw error;
  }
  return { queued: true, reason: "", status: "pending" };
}

export async function wakeInvoiceWhatsAppBot() {
  const base = text(process.env.WHATSAPP_BOT_URL).replace(/\/+$/, "");
  const token = text(process.env.WHATSAPP_BOT_API_TOKEN);
  if (!base || !token) return;
  try {
    await fetch(base + "/client/wake", {
      method: "POST",
      headers: { "x-land-view-bot-token": token },
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
    });
  } catch {
    // Outbox is durable and the bot will process it when connected.
  }
}
