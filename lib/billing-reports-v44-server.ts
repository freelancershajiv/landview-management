import type { NextRequest } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { selectRows } from "@/lib/supabase-data";
import { loadReceivableAuthority } from "@/lib/billing-receivable-authority";
import { compileFinancialReportV44 } from "@/lib/billing-reports-v44";

const FINANCE_ROLES = new Set(["admin","manager","accounts"]);
export async function buildBillingReportV44(request: NextRequest) {
  const user = await requireLocalSession(request);
  if (!user) throw Object.assign(new Error("Session expired."), { status: 401 });
  if (!FINANCE_ROLES.has(roleOf(user))) throw Object.assign(new Error("Accounts permissions are required."), { status: 403 });
  const [projects, authority] = await Promise.all([
    selectRows("projects", {
      select:"id,project_code,project_name,client_name_snapshot",limit:5000,
    }),loadReceivableAuthority(),
  ]);
  return compileFinancialReportV44(authority, projects);
}
