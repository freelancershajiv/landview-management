import { NextRequest, NextResponse } from "next/server";
import { GET as legacyGET, POST as legacyPOST } from "../document-register/route";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { isAllowedRequestOrigin } from "@/lib/request-origin";
import { employeeCodeOf, selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}

async function employeeCanReadWorkflow(user: Row, workflowId: string) {
  if (!workflowId) return false;
  const code = String(employeeCodeOf(user) || "").trim().toUpperCase();
  if (!code) return false;

  const [employees, workflows] = await Promise.all([
    selectRows("employees", { filters: { employee_code: code }, limit: 1 }),
    selectRows("project_service_workflows", { filters: { id: workflowId }, limit: 1 }),
  ]);
  const employee = employees[0];
  const workflow = workflows[0];
  if (!employee?.id || !workflow?.project_id) return false;

  const assignments = await selectRows("project_employees", {
    filters: { employee_id: employee.id, project_id: workflow.project_id, active: true },
    limit: 1,
  });
  return assignments.length > 0;
}

export async function GET(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) return fail("Session expired.", 401);

  const role = roleOf(user);
  if (!["admin", "manager", "accounts", "employee"].includes(role)) {
    return fail("Document Register access is not available for this role.", 403);
  }

  if (role === "employee") {
    const workflowId = String(request.nextUrl.searchParams.get("workflowId") || "").trim();
    if (!(await employeeCanReadWorkflow(user, workflowId))) {
      return fail("Permission denied for this project workflow.", 403);
    }
  }

  return legacyGET(request);
}

export async function POST(request: NextRequest) {
  if (!isAllowedRequestOrigin(request)) return fail("Invalid request origin.", 403);

  const user = await requireLocalSession(request) as Row | null;
  if (!user) return fail("Session expired.", 401);
  if (!["admin", "manager"].includes(roleOf(user))) {
    return fail("Management permission is required.", 403);
  }

  return legacyPOST(request);
}
