import { NextRequest, NextResponse } from "next/server";
import { loadReceivableAuthority } from "@/lib/billing-receivable-authority";
import { selectRows } from "@/lib/supabase-data";
import { invoiceReminderEligibility, queueInvoiceReminder, wakeInvoiceWhatsAppBot } from "@/lib/invoice-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const token = process.env.CRON_SECRET;
  if (!token || request.headers.get("authorization") !== "Bearer " + token) {
    return NextResponse.json({ success: false, error: "Unauthorized." }, { status: 401 });
  }
  // Explicit release flag: adding the cron route can never silently start
  // sending real financial messages. Enable only after reviewing consent,
  // message content, WhatsApp health and the recoverable production backup.
  if (process.env.INVOICE_REMINDERS_ENABLED !== "true") {
    return NextResponse.json({ success: true, enabled: false, queued: 0 }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const [projects, authority] = await Promise.all([
      selectRows("projects", {
        select: "id,project_code,phone_number_snapshot,whatsapp_updates_enabled,whatsapp_number_status,whatsapp_checked_phone",
        limit: 5000,
      }),
      loadReceivableAuthority(),
    ]);
    if (projects.length >= 5000 || authority.invoices.length >= 10000 ||
        authority.bills.length >= 10000 || authority.payments.length >= 10000) {
      return NextResponse.json({ success: false, error: "Incomplete financial snapshot; no reminders queued." }, { status: 503 });
    }
    const eligible = projects.filter((project) => {
      const due = authority.projects.get(String(project.id))?.totalDue || 0;
      return invoiceReminderEligibility(project, due).eligible;
    }).sort((a, b) => String(a.project_code).localeCompare(String(b.project_code), undefined, { numeric: true }));
    let queued = 0;
    let existing = 0;
    const errors: string[] = [];
    // Modest weekly batch; outbox dedupe limits each project to 1/month.
    let examined = 0;
    for (const project of eligible) {
      if (examined >= 100 || queued >= 20) break;
      examined += 1;
      const due = authority.projects.get(String(project.id))?.totalDue || 0;
      try {
        const result = await queueInvoiceReminder(project, due);
        if (result.queued) queued += 1;
        else existing += 1;
      } catch {
        errors.push(String(project.project_code) + ": queue error");
      }
    }
    if (queued) await wakeInvoiceWhatsAppBot();
    return NextResponse.json({ success: errors.length === 0, enabled: true, eligible: eligible.length, queued, existing, errors },
      { status: errors.length ? 207 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Invoice reminder cron failed." }, { status: 503 });
  }
}
