import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";
import { roleOf, selectRows } from "@/lib/supabase-data";
import { loadReceivableAuthority } from "@/lib/billing-receivable-authority";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FINANCE_ROLES = new Set(["admin", "manager", "accounts", "employee"]);
type Row = Record<string, any>;

function text(value: unknown) { return String(value ?? "").trim(); }
function compareProjectCodeDesc(a: string, b: string) {
  return b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" });
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    if (!FINANCE_ROLES.has(roleOf(user))) return NextResponse.json({ success: false, error: "Finance access is required." }, { status: 403 });

    const [projects, authority] = await Promise.all([
      selectRows("projects", { select: "id,project_code,project_name,client_name_snapshot,phone_number_snapshot,location", limit: 5000 }),
      loadReceivableAuthority(),
    ]);

    const rows = (projects as Row[]).map((project) => {
      const state = authority.projects.get(text(project.id));
      if (!state) return null;
      return {
        projectId: text(project.project_code),
        projectName: text(project.project_name),
        clientName: text(project.client_name_snapshot),
        phone: text(project.phone_number_snapshot),
        address: text(project.location),
        engineeringDue: state.engineeringDue,
        supervisionDue: state.supervisionDue,
        otherDue: state.otherDue,
        totalDue: state.totalDue,
        invoiceDueTotal: state.invoiceDueTotal,
        writeoffTotal: state.writeoffTotal,
        unallocatedAmount: state.remainingUnallocated,
        openInvoiceCount: state.openInvoiceCount,
        lastPaymentDate: state.lastPaymentDate,
        lastPaymentAmount: state.lastPaymentAmount,
      };
    }).filter((row): row is NonNullable<typeof row> => !!row && row.totalDue > 0.009)
      .sort((a, b) => compareProjectCodeDesc(a.projectId, b.projectId) || b.totalDue - a.totalDue);

    const totals = rows.reduce((sum, row) => ({
      engineering: sum.engineering + row.engineeringDue,
      supervision: sum.supervision + row.supervisionDue,
      other: sum.other + row.otherDue,
      total: sum.total + row.totalDue,
      unallocated: sum.unallocated + row.unallocatedAmount,
    }), { engineering: 0, supervision: 0, other: 0, total: 0, unallocated: 0 });

    return NextResponse.json({ success: true, data: { rows, totals } }, {
      headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "canonical-receivable-authority" },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load due bills." }, {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
