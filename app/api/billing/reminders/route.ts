import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { normalizeProjectCode, selectRows } from "@/lib/supabase-data";
import { loadReceivableAuthority } from "@/lib/billing-receivable-authority";
import { invoiceReminderEligibility, queueInvoiceReminder, wakeInvoiceWhatsAppBot } from "@/lib/invoice-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try { return new URL(origin).host === request.nextUrl.host; } catch { return false; }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({ success: false, error: "Invalid request origin." }, { status: 403 });
  try {
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!["admin", "manager"].includes(roleOf(user))) {
      return NextResponse.json({ success: false, error: "Admin or Manager access required to notify clients." }, { status: 403 });
    }
    const body = await request.json().catch(() => ({}));
    if (body.confirmed !== true) return NextResponse.json({ success: false, error: "Explicit reminder confirmation is required." }, { status: 400 });
    const projectCode = normalizeProjectCode(body.projectCode);
    if (!/^LV-\d{3,}$/.test(projectCode)) return NextResponse.json({ success: false, error: "Valid File ID required." }, { status: 400 });
    const projects = await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 });
    const project = projects[0];
    if (!project) return NextResponse.json({ success: false, error: "Project not found." }, { status: 404 });
    const authority = await loadReceivableAuthority({ projectId: String(project.id) });
    const collectibleDue = authority.projects.get(String(project.id))?.totalDue || 0;
    const eligibility = invoiceReminderEligibility(project, collectibleDue);
    if (!eligibility.eligible) return NextResponse.json({ success: false, error: eligibility.reason }, { status: 409 });
    const result = await queueInvoiceReminder(project, collectibleDue);
    if (result.queued) await wakeInvoiceWhatsAppBot();
    return NextResponse.json({ success: true, data: { ...result, projectCode, collectibleDue } }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not queue billing reminder." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
