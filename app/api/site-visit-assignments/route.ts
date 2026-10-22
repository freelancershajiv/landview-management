import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf, userIdOf } from "@/lib/local-session";
import { employeeCodeOf, insertRows, selectRows, updateRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;

function text(value: unknown, max = 2000) {
  return String(value ?? "").trim().slice(0, max);
}

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0", "X-Landview-Data": "supabase" },
  });
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === request.nextUrl.hostname.toLowerCase() || host === "app.landview.com.bd" || host.endsWith(".vercel.app") || host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

function dhakaDate(offsetDays = 0) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === "year")?.value || 0);
  const month = Number(parts.find((part) => part.type === "month")?.value || 1);
  const day = Number(parts.find((part) => part.type === "day")?.value || 1);
  const date = new Date(Date.UTC(year, month - 1, day + offsetDays));
  return date.toISOString().slice(0, 10);
}

function activeAssignmentStatus(value: unknown) {
  return !["completed", "cancelled", "canceled", "closed", "done"].includes(text(value, 80).toLowerCase());
}

function supervisionActive(project: Row) {
  return text(project?.supervision_stage_status || "Completed", 80).toLowerCase() !== "completed";
}

function actorOf(user: Row) {
  return userIdOf(user) || employeeCodeOf(user) || text(user?.name || user?.Name || user?.username || user?.Username, 200);
}

async function sessionUser(request: NextRequest) {
  const user = await requireLocalSession(request) as Row | null;
  if (!user) throw new Error("Session expired.");
  const role = roleOf(user);
  if (!["admin", "manager", "employee"].includes(role)) throw new Error("Site Visit assignment access is not available for this role.");
  return user;
}

async function employeeRecord(user: Row) {
  const code = employeeCodeOf(user);
  if (!code) throw new Error("Employee identity is missing from this session.");
  const rows = await selectRows("employees", { filters: { employee_code: code }, limit: 1 });
  if (!rows.length) throw new Error(`Employee ${code} was not found.`);
  return rows[0];
}

async function loadAssignments(user: Row, date: string) {
  const role = roleOf(user);
  const management = role === "admin" || role === "manager";
  const [employees, projects] = await Promise.all([
    selectRows("employees", { order: "employee_code:asc", limit: 1000 }),
    selectRows("projects", { order: "project_code:asc", limit: 5000 }),
  ]);

  let taskRows: Row[];
  if (management) {
    taskRows = await selectRows("tasks", { filters: { task_type: "Site Visit", due_date: date }, order: "created_at:asc", limit: 5000 });
  } else {
    const employee = await employeeRecord(user);
    taskRows = await selectRows("tasks", {
      filters: { task_type: "Site Visit", due_date: date, assigned_employee_id: employee.id },
      order: "created_at:asc",
      limit: 5000,
    });
  }

  const employeeById = new Map(employees.map((row) => [text(row.id), row]));
  const projectById = new Map(projects.map((row) => [text(row.id), row]));
  const assignments = taskRows.map((row) => {
    const employee = employeeById.get(text(row.assigned_employee_id));
    const project = projectById.get(text(row.project_id));
    return {
      Task_Code: row.task_code,
      Visit_Date: row.due_date,
      Project_ID: project?.project_code || "",
      Project_Name: project?.project_name || project?.client_name_snapshot || "",
      Client_Name: project?.client_name_snapshot || "",
      Location: project?.location || "",
      Employee_ID: employee?.employee_code || "",
      Employee_Name: employee?.name || "",
      Priority: row.priority || "Normal",
      Status: row.status || "Pending",
      Instructions: row.description || "",
      Assigned_By: row.assigned_by || row.source_created_by || "",
      Assigned_At: row.assigned_at || row.created_at || "",
      Completed_At: row.completed_at || "",
      Work_Notes: row.work_notes || "",
    };
  });

  return {
    date,
    tomorrow: dhakaDate(1),
    role,
    assignments,
    employees: management
      ? employees
          .filter((row) => !["former", "inactive", "disabled"].includes(text(row.status, 80).toLowerCase()))
          .map((row) => ({ id: row.id, Employee_ID: row.employee_code, Employee_Name: row.name, Designation: row.designation || "" }))
      : [],
    projects: management
      ? projects
          .filter(supervisionActive)
          .map((row) => ({ id: row.id, Project_ID: row.project_code, Project_Name: row.project_name || row.client_name_snapshot || "", Client_Name: row.client_name_snapshot || "", Location: row.location || "" }))
      : [],
  };
}

export async function GET(request: NextRequest) {
  try {
    const user = await sessionUser(request);
    const requested = text(request.nextUrl.searchParams.get("date"), 20);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : dhakaDate(1);
    return json({ success: true, data: await loadAssignments(user, date) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load Site Visit assignments.";
    return json({ success: false, error: message }, /session/i.test(message) ? 401 : /access|role/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 500);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ success: false, error: "Invalid request origin." }, 403);
  try {
    const user = await sessionUser(request);
    const role = roleOf(user);
    if (role !== "admin" && role !== "manager") throw new Error("Admin or Manager access is required to assign Site Visits.");

    const input = await request.json() as Row;
    const action = text(input.action, 60).toLowerCase();
    const tomorrow = dhakaDate(1);
    const now = new Date().toISOString();

    if (action === "cancel") {
      const taskCode = text(input.taskCode, 160);
      if (!taskCode) throw new Error("Assignment code is required.");
      const rows = await selectRows("tasks", { filters: { task_code: taskCode, task_type: "Site Visit" }, limit: 1 });
      if (!rows.length) throw new Error("Site Visit assignment was not found.");
      const updated = await updateRows("tasks", { task_code: taskCode }, {
        status: "Cancelled",
        updated_at: now,
        source_updated_at: now,
        work_notes: text(input.reason, 1000) || "Cancelled by management.",
      });
      return json({ success: true, data: updated[0] || { ...rows[0], status: "Cancelled" } });
    }

    if (action !== "create") throw new Error("Unsupported Site Visit assignment action.");

    const employeeId = text(input.employeeId, 80);
    const projectId = text(input.projectId, 80);
    if (!employeeId) throw new Error("Choose an employee.");
    if (!projectId) throw new Error("Choose a project.");

    const [employeeRows, projectRows] = await Promise.all([
      selectRows("employees", { filters: { id: employeeId }, limit: 1 }),
      selectRows("projects", { filters: { id: projectId }, limit: 1 }),
    ]);
    if (!employeeRows.length) throw new Error("Choose a valid employee.");
    if (!projectRows.length) throw new Error("Choose a valid project.");
    if (!supervisionActive(projectRows[0])) throw new Error("Site Visits can only be assigned to projects in the Supervision / Construction stage.");

    const existing = await selectRows("tasks", {
      filters: { task_type: "Site Visit", project_id: projectId, assigned_employee_id: employeeId, due_date: tomorrow },
      limit: 50,
    });
    if (existing.some((row) => activeAssignmentStatus(row.status))) {
      throw new Error("This employee is already assigned to this project for tomorrow.");
    }

    const projectCode = text(projectRows[0].project_code, 80) || "PROJECT";
    const employeeCode = text(employeeRows[0].employee_code, 80) || "EMP";
    const taskCode = `SVT-${projectCode.replace(/[^A-Z0-9]/gi, "")}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const actor = actorOf(user);
    const instructions = text(input.instructions, 1800);
    const row = {
      task_code: taskCode,
      project_id: projectId,
      task_title: `Site Visit · ${projectCode}`,
      description: instructions || `Next-day Site Visit assigned to ${employeeCode}.`,
      assigned_employee_id: employeeId,
      priority: ["Urgent", "High", "Normal", "Low"].includes(text(input.priority, 40)) ? text(input.priority, 40) : "Normal",
      status: "Pending",
      start_date: tomorrow,
      due_date: tomorrow,
      completed_at: null,
      progress: 0,
      project_name_snapshot: text(projectRows[0].project_name || projectRows[0].client_name_snapshot, 300) || projectCode,
      source_created_at: now,
      source_created_by: actor || null,
      source_updated_at: now,
      automation_generated: false,
      automation_source: "Site Visit Assignment",
      automation_key: null,
      lifecycle_stage: "Supervision / Construction",
      task_type: "Site Visit",
      is_required: true,
      dependency_task_code: null,
      blocker_reason: null,
      source_service: "Site Visit",
      sort_order: 50,
      client_visible: false,
      work_notes: null,
      assigned_by: actor || null,
      assigned_at: now,
      created_at: now,
      updated_at: now,
    };

    const inserted = await insertRows("tasks", row);
    return json({ success: true, data: inserted[0] || row }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save Site Visit assignment.";
    const status = /session/i.test(message) ? 401 : /access|required/i.test(message) ? 403 : /already assigned|only be assigned/i.test(message) ? 409 : /choose|unsupported|code is required/i.test(message) ? 400 : /not found/i.test(message) ? 404 : 500;
    return json({ success: false, error: message }, status);
  }
}
