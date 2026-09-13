import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPS_SCRIPT_URL = process.env.LAND_VIEW_API_URL || "";
const PROXY_SECRET = process.env.LAND_VIEW_PROXY_SECRET || "";
const SESSION_COOKIE = "landview_session";
const RETRY_DELAYS = [0, 250, 700];

type BackendJson = {
  success?: boolean;
  data?: any;
  error?: string;
  message?: string;
};

async function callBackend(payload: Record<string, unknown>): Promise<BackendJson> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt += 1) {
    if (RETRY_DELAYS[attempt] > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]));
    }

    try {
      const backend = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        cache: "no-store",
        redirect: "follow",
      });

      const text = await backend.text();
      let json: BackendJson;
      try {
        json = JSON.parse(text) as BackendJson;
      } catch {
        lastError = new Error(/^\s*</.test(text) ? "Apps Script returned HTML instead of JSON." : "Apps Script returned invalid JSON.");
        if (attempt < RETRY_DELAYS.length - 1) continue;
        throw lastError;
      }

      if (backend.status >= 500 && attempt < RETRY_DELAYS.length - 1) {
        lastError = new Error(`Apps Script returned HTTP ${backend.status}.`);
        continue;
      }

      return json;
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error || "Backend request failed."));
      if (attempt >= RETRY_DELAYS.length - 1) throw lastError;
    }
  }

  throw lastError || new Error("Employee workspace backend did not respond.");
}

function roleOf(user: any) {
  return String(user?.role || user?.Role || "").trim().toLowerCase();
}

function employeeIdOf(user: any) {
  return String(user?.employeeId || user?.Employee_ID || user?.userId || user?.User_ID || "").trim();
}

function projectIdOf(row: any) {
  return String(row?.Project_ID || row?.["Project ID"] || row?.ProjectId || row?.FILE_ID || row?.["FILE ID"] || "").trim();
}

function assignedEmployeeOf(row: any) {
  return String(row?.Assigned_Employee_ID || row?.["Assigned Employee ID"] || "").trim();
}

function ok(data: any) {
  return NextResponse.json(
    { success: true, data },
    { status: 200, headers: { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } }
  );
}

export async function GET(request: NextRequest) {
  try {
    if (!APPS_SCRIPT_URL || !PROXY_SECRET) {
      return NextResponse.json({ success: false, error: "LAND VIEW backend is not configured." }, { status: 500 });
    }

    const token = request.cookies.get(SESSION_COOKIE)?.value || "";
    if (!token) {
      return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });
    }

    const base = { token, proxySecret: PROXY_SECRET };

    // Validate the same session used by the rest of the portal before loading
    // the specialized employee workbook bridge.
    const sessionJson = await callBackend({ ...base, action: "getSession" });
    const sessionUser = sessionJson?.data?.user;
    if (!sessionJson?.success || !sessionJson?.data?.authenticated || roleOf(sessionUser) !== "employee") {
      const response = NextResponse.json({ success: false, error: "Employee session expired." }, { status: 401 });
      response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
      return response;
    }

    const employeeId = employeeIdOf(sessionUser);

    // Preferred source: billing-driven workflow from the LV Auto Invoice workbook.
    const workspaceJson = await callBackend({
      ...base,
      action: "getPublicProjects",
      _employeeWorkspace: "1",
    });

    if (workspaceJson?.success) {
      return ok(workspaceJson.data || {});
    }

    // If the specialized Apps Script bridge is unavailable or on an older
    // deployment, keep the employee portal usable using the normal,
    // role-filtered LAND VIEW endpoints. These endpoints enforce the same
    // employee project/task permissions server-side.
    console.warn("[employee-workspace] specialized bridge failed; using secure fallback:", String(workspaceJson?.error || workspaceJson?.message || "unknown error"));

    const [projectsJson, tasksJson] = await Promise.all([
      callBackend({ ...base, action: "getProjects" }).catch((error) => ({ success: false, error: error?.message || String(error) })),
      callBackend({ ...base, action: "getErpRecords", module: "tasks" }).catch((error) => ({ success: false, error: error?.message || String(error) })),
    ]);

    const projects = projectsJson?.success && Array.isArray(projectsJson.data) ? projectsJson.data : [];
    const allowedProjectIds = Array.from(new Set(projects.map(projectIdOf).filter(Boolean)));
    const allowedSet = new Set(allowedProjectIds);

    const rawTasks = tasksJson?.success && Array.isArray(tasksJson.data) ? tasksJson.data : [];
    const workflow = rawTasks.filter((row: any) => {
      const projectId = projectIdOf(row);
      const assignedEmployee = assignedEmployeeOf(row);
      return Boolean(projectId && allowedSet.has(projectId) && (!assignedEmployee || !employeeId || assignedEmployee === employeeId));
    });
    const assignedWorkflow = workflow.filter((row: any) => employeeId && assignedEmployeeOf(row) === employeeId);
    const unassignedWorkflow = workflow.filter((row: any) => !assignedEmployeeOf(row));

    return ok({
      workflow,
      assignedWorkflow,
      unassignedWorkflow,
      allowedProjectIds,
      employeeId,
      source: tasksJson?.success ? "LAND VIEW Tasks fallback" : "LAND VIEW Projects fallback",
      degraded: true,
      updatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Employee workspace request failed." },
      { status: 502, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
