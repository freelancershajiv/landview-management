import { NextRequest, NextResponse } from "next/server";
import { requireApiCapability, permissionStatus } from "@/lib/permission-guard";
import { selectRows } from "@/lib/supabase-data";
import { scanOrganizationHealth } from "@/lib/action-center";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Row = Record<string, any>;

function text(value: unknown) { return String(value ?? "").trim(); }
function amount(value: unknown) {
  const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function dhakaDay(value: Date | string | number = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
function isEffectivePayment(row: Row) {
  if (row.affects_business_balance === false || text(row.transaction_type).toLowerCase() === "personal income") return false;
  const status = text(row.approval_status || row.status).toLowerCase().replace(/[_-]+/g, " ");
  return !status || ["approved", "received", "paid", "verified", "complete", "completed", "full paid", "fully paid", "posted"].includes(status);
}
function isEffectiveExpense(row: Row) {
  const status = text(row.approval_status || row.status).toLowerCase().replace(/[_-]+/g, " ");
  return !["rejected", "declined", "cancelled", "canceled", "void", "voided"].includes(status);
}

export async function GET(request: NextRequest) {
  try {
    await requireApiCapability(request, "systemHealth.view");
    const today = dhakaDay();
    const [payments, expenses, visits, dueTasks, proposals, projects, leads, health] = await Promise.all([
      selectRows("payments", { filters: { payment_date: today }, limit: 3000 }),
      selectRows("expenses", { filters: { expense_date: today }, limit: 3000 }),
      selectRows("site_visits", { filters: { visit_date: today }, limit: 3000 }),
      selectRows("tasks", { filters: { due_date: today }, limit: 3000 }),
      selectRows("proposals", { order: "created_at:desc", limit: 500 }),
      selectRows("projects", { order: "lifecycle_changed_at:desc", limit: 500 }),
      selectRows("website_leads", { order: "created_at:desc", limit: 500 }),
      scanOrganizationHealth(),
    ]);

    const received = payments.filter(isEffectivePayment).reduce((sum, row) => sum + Math.abs(amount(row.amount)), 0);
    const spent = expenses.filter(isEffectiveExpense).reduce((sum, row) => sum + Math.abs(amount(row.amount)), 0);
    const createdToday = (row: Row) => dhakaDay(row.created_at || row.source_created_at) === today;
    const newSiteEntries = proposals.filter((row) => createdToday(row) && text(row.entry_source).toLowerCase() === "site entry");
    const proposalsToday = proposals.filter(createdToday);
    const stageChanges = projects.filter((row) => dhakaDay(row.lifecycle_changed_at) === today);
    const newLeads = leads.filter(createdToday);
    const openDueTasks = dueTasks.filter((row) => !["completed", "complete", "resolved", "closed", "cancelled", "canceled"].includes(text(row.status).toLowerCase()));

    const dateLabel = new Intl.DateTimeFormat("en-BD", { timeZone: "Asia/Dhaka", dateStyle: "long" }).format(new Date());
    const money = (n: number) => n.toLocaleString("en-BD", { maximumFractionDigits: 2 });
    const lines = [
      "*LAND VIEW — DAILY MANAGEMENT BRIEF*",
      dateLabel,
      "",
      `*Organization Health:* ${health.score}/100 · ${health.status.toUpperCase()}`,
      `*Action Required:* ${health.counts.total} open (${health.counts.critical} critical · ${health.counts.warning} warning)`,
      "",
      `*Received Today:* BDT ${money(received)}`,
      `*Expenses Today:* BDT ${money(spent)}`,
      `*Net Movement:* BDT ${money(received - spent)}`,
      "",
      `*New Site Entries:* ${newSiteEntries.length}`,
      `*Proposals Added:* ${proposalsToday.length}`,
      `*Site Visits:* ${visits.length}`,
      `*Project Stage Changes:* ${stageChanges.length}`,
      `*Tasks Due Today:* ${openDueTasks.length}`,
      `*New Website Enquiries:* ${newLeads.length}`,
      "",
      health.counts.critical > 0 ? "⚠ Critical items are waiting in Action Required." : "✓ No critical Action Required items detected.",
    ];

    return NextResponse.json({
      success: true,
      data: {
        date: today,
        dateLabel,
        finance: { received, spent, netMovement: received - spent },
        operations: {
          newSiteEntries: newSiteEntries.length,
          proposals: proposalsToday.length,
          siteVisits: visits.length,
          projectStageChanges: stageChanges.length,
          tasksDue: openDueTasks.length,
          websiteEnquiries: newLeads.length,
        },
        actionCenter: { score: health.score, status: health.status, counts: health.counts },
        message: lines.join("\n"),
        generatedAt: new Date().toISOString(),
      },
    }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Could not generate daily management brief." },
      { status: permissionStatus(error), headers: { "Cache-Control": "no-store" } },
    );
  }
}
