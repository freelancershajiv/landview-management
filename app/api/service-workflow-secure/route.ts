import { NextRequest, NextResponse } from "next/server";
import { GET as legacyGET, POST as legacyPOST } from "../service-workflow/route";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { employeeCodeOf, normalizeProjectCode, selectRows } from "@/lib/supabase-data";
import { isAllowedRequestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}

async function assignedProjectCodes(user: Row) {
  const employeeCode = String(employeeCodeOf(user) || "").trim().toUpperCase();
  if (!employeeCode) return new Set<string>();
  const employees = await selectRows("employees", { filters: { employee_code: employeeCode }, limit: 1 });
  const employeeId = employees[0]?.id;
  if (!employeeId) return new Set<string>();
  const links = await selectRows("project_employees", { filters: { employee_id: employeeId, active: true }, limit: 5000 });
  const projectIds = Array.from(new Set(links.map((row) => row.project_id).filter(Boolean)));
  if (!projectIds.length) return new Set<string>();
  const projects = await selectRows("projects", { inFilters: { id: projectIds }, limit: 5000 });
  return new Set(projects.map((row) => normalizeProjectCode(row.project_code)).filter(Boolean));
}

export async function GET(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) return fail("Session expired.", 401);
  const role = roleOf(user);

  if (["admin", "manager", "accounts"].includes(role)) return legacyGET(request);
  if (role !== "employee") return fail("Workflow access is not available for this role.", 403);

  const mode = String(request.nextUrl.searchParams.get("mode") || "project").trim().toLowerCase();
  if (mode !== "project") {
    return fail("Employee access is limited to assigned project workflows.", 403);
  }

  const allowed = await assignedProjectCodes(user);
  const response = await legacyGET(request);
  if (!response.ok) return response;
  const payload = await response.clone().json().catch(() => null) as any;
  if (!payload?.success || !payload?.data) return response;

  const workflows = Array.isArray(payload.data.workflows)
    ? payload.data.workflows.filter((row: Row) => allowed.has(normalizeProjectCode(row.projectId || row.Project_ID)))
    : [];

  return NextResponse.json(
    { ...payload, data: { ...payload.data, workflows } },
    { status: response.status, headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase-scoped" } },
  );
}

export async function POST(request: NextRequest) {
  if (!isAllowedRequestOrigin(request)) return fail("Invalid request origin.", 403);
  const user = await requireLocalSession(request) as Row | null;
  if (!user) return fail("Session expired.", 401);
  if (!["admin", "manager"].includes(roleOf(user))) return fail("Management permission is required.", 403);
  return legacyPOST(request);
}
