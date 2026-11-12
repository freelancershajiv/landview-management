import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { selectRows } from "@/lib/supabase-data";
import { loadReceivableAuthority } from "@/lib/billing-receivable-authority";
import { invoiceCenterRow, invoiceCenterSummary } from "@/lib/invoice-center";
import { invoiceReminderReviewProjects } from "@/lib/invoice-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!["admin", "manager", "accounts"].includes(roleOf(user))) {
      return NextResponse.json({ success: false, error: "Accounts access is required." }, { status: 403 });
    }

    const [projects, authority] = await Promise.all([
      selectRows("projects", {
        select: "id,project_code,project_name,client_name_snapshot,phone_number_snapshot,whatsapp_updates_enabled,whatsapp_number_status,whatsapp_checked_phone",
        limit: 5000,
      }),
      loadReceivableAuthority(),
    ]);
    const byId = new Map(projects.map((project) => [String(project.id), project]));
    const reviewProjects = invoiceReminderReviewProjects(authority.bills);
    const remindersEnabled = process.env.VERCEL_ENV === "production" &&
      process.env.INVOICE_REMINDERS_MANUAL_ENABLED === "true" &&
      ["admin", "manager"].includes(roleOf(user));
    const rows = authority.invoices.map((invoice) => {
      const project = byId.get(invoice.projectId);
      if (!project) return null;
      return invoiceCenterRow(invoice, project, authority.projects.get(invoice.projectId), String(authority.billByCode.get(invoice.billCode)?.row.description || ""), reviewProjects.has(invoice.projectId));
    }).filter((row): row is NonNullable<typeof row> => row !== null)
      .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.projectCode.localeCompare(a.projectCode, undefined, { numeric: true }));

    const summary = invoiceCenterSummary(rows, authority.totals);
    // This authority loads finite slices. Never present a truncated set as a
    // complete receivable audit if a source reaches its maximum page size.
    const complete = projects.length < 5000 && authority.complete;
    return NextResponse.json({
      success: true,
      data: { snapshotAt: new Date().toISOString(), complete, remindersEnabled: remindersEnabled && complete, summary, rows },
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "canonical-receivable-authority" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load Invoice Center." },
      { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
