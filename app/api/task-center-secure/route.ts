import { NextRequest, NextResponse } from "next/server";
import { GET as legacyGET, POST as legacyPOST } from "../task-center/route";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { employeeCodeOf, normalizeProjectCode, selectRows } from "@/lib/supabase-data";
import { isAllowedRequestOrigin } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status, headers: { "Cache-Control": "no-store" } });
}

async function employeeScope(user: Row) {
  const code = String(employeeCodeOf(user) || "").trim().toUpperCase();
  const employees = code ? await selectRows("employees", { filters: { employee_code: code }, limit: 1 }) : [];
  const employee = employees[0];
  if (!employee?.id) return { employee: null as Row | null, projectIds: new Set<string>(), projectCodes: new Set<string>() };

  const [taskRows, links] = await Promise.all([
    selectRows("tasks", { filters: { assigned_employee_id: employee.id }, limit: 10000 }),
    selectRows("project_employees", { filters: { employee_id: employee.id, active: true }, limit: 5000 }),
  ]);
  const projectIds = new Set<string>([
    ...taskRows.map((row) => String(row.project_id || "")).filter(Boolean),
    ...links.map((row) => String(row.project_id || "")).filter(Boolean),
  ]);
  const projects = projectIds.size ? await selectRows("projects", { inFilters: { id: [...projectIds] }, limit: 5000 }) : [];
  return {
    employee,
    projectIds,
    projectCodes: new Set(projects.map((row) => normalizeProjectCode(row.project_code)).filter(Boolean)),
  };
}

export async function GET(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) return fail("Session expired.", 401);
  const role = roleOf(user);
  if (["admin", "manager"].includes(role)) return legacyGET(request);
  if (role !== "employee") return fail("Task Center access is not available for this role.", 403);

  const scope = await employeeScope(user);
  if (!scope.employee) return fail("Employee record not found.", 403);
  const requested = normalizeProjectCode(request.nextUrl.searchParams.get("projectId"));
  if (requested && !scope.projectCodes.has(requested)) return fail("Access denied for this project.", 403);

  const response = await legacyGET(request);
  if (!response.ok) return response;
  const payload = await response.clone().json().catch(() => null) as any;
  if (!payload?.success || !payload?.data) return response;

  const projects = Array.isArray(payload.data.projects)
    ? payload.data.projects.filter((row: Row) => scope.projectCodes.has(normalizeProjectCode(row.projectCode || row.Project_ID)))
    : [];
  const employees = Array.isArray(payload.data.employees)
    ? payload.data.employees.filter((row: Row) => String(row.id || "") === String(scope.employee!.id))
    : [];

  return NextResponse.json(
    { ...payload, data: { ...payload.data, projects, employees } },
    { status: response.status, headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase-scoped" } },
  );
}

export async function POST(request: NextRequest) {
  if (!isAllowedRequestOrigin(request)) return fail("Invalid request origin.", 403);
  const user = await requireLocalSession(request) as Row | null;
  if (!user) return fail("Session expired.", 401);
  if (!["admin", "manager", "employee"].includes(roleOf(user))) return fail("Task Center access is not available for this role.", 403);
  // The canonical handler independently limits employee mutations to tasks
  // assigned to the authenticated employee.
  return legacyPOST(request);
}
