// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { calculateProjectFinanceV2Snapshot } from "@/lib/project-finance-core.mjs";
import { requireLocalSession } from "@/lib/local-session";
import { normalizeProjectCode, selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

function text(value: unknown, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function roleOf(user: Row | null) {
  return text(user?.role || user?.Role, 30).toLowerCase();
}

function projectIdsOf(user: Row) {
  const raw = text(user.projectIds || user.Project_IDs || user.project_ids, 3000);
  return Array.from(new Set(raw.split(/[;,\s]+/).map(normalizeProjectCode).filter(Boolean)));
}

function fail(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error || "Project Finance V2 request failed.");
  return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
}

function statusFor(message: string) {
  if (/session expired/i.test(message)) return 401;
  if (/access denied|restricted|not available/i.test(message)) return 403;
  if (/required|not found/i.test(message)) return 400;
  return 500;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request) as Row | null;
    if (!user) throw new Error("Session expired.");
    const role = roleOf(user);
    if (!["admin", "manager", "client"].includes(role)) {
      throw new Error("Project Finance access is restricted to management and client accounts.");
    }

    const projectCode = normalizeProjectCode(request.nextUrl.searchParams.get("projectId") || "");
    if (!projectCode) throw new Error("Project is required.");
    if (role === "client" && !projectIdsOf(user).includes(projectCode)) {
      throw new Error("Access denied for this project.");
    }

    const projects = await selectRows("projects", { filters: { project_code: projectCode, record_type: "project" }, limit: 1 });
    const project = projects[0];
    if (!project) throw new Error("Project not found.");

    const [summaryRows, ledgerRows] = await Promise.all([
      selectRows("project_management_summary", { filters: { project_id: project.id }, limit: 1 }),
      selectRows("project_management_ledger", { filters: { project_id: project.id }, order: "entry_date:asc", limit: 10000 }),
    ]);
    const summary = summaryRows[0] || {};
    const snapshot = calculateProjectFinanceV2Snapshot(ledgerRows, {
      enabled: summary.finance_v2_enabled === true,
      cutoverAt: summary.finance_v2_cutover_at || null,
      openingCash: summary.finance_v2_opening_cash ?? null,
      openingHeldCheques: summary.finance_v2_opening_held_cheques || [],
    });

    return NextResponse.json({
      success: true,
      data: {
        projectId: project.project_code,
        projectName: project.project_name || project.project_code,
        financeV2Enabled: Boolean(summary.finance_v2_enabled),
        snapshot,
      },
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Finance": "v2" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(message, statusFor(message));
  }
}
