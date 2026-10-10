import { NextRequest, NextResponse } from "next/server";
import { requireApiCapability, permissionStatus } from "@/lib/permission-guard";
import { selectRows } from "@/lib/supabase-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, any>;
const text = (v: unknown) => String(v ?? "").trim();
const lower = (v: unknown) => text(v).toLowerCase();
const dateOnly = (v: unknown) => text(v).slice(0, 10);
function dhakaDay(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function isOpen(row: Row) { return !["completed", "complete", "resolved", "closed", "cancelled", "canceled"].includes(lower(row.status)); }
function isActiveEmployee(row: Row) { return !["inactive", "former", "resigned", "terminated", "left", "disabled"].includes(lower(row.status)); }

export async function GET(request: NextRequest) {
  try {
    await requireApiCapability(request, "systemHealth.view");
    const [tasks, employees] = await Promise.all([
      selectRows("tasks", { order: "updated_at:desc", limit: 5000 }),
      selectRows("employees", { order: "employee_code:asc", limit: 1000 }),
    ]);
    const today = dhakaDay();
    const nextWeek = dhakaDay(7);
    const open = tasks.filter(isOpen);
    const activeEmployees = employees.filter(isActiveEmployee);
    const byEmployee = new Map<string, Row[]>();
    for (const task of open) {
      const id = text(task.assigned_employee_id);
      if (!id) continue;
      const bucket = byEmployee.get(id) || [];
      bucket.push(task); byEmployee.set(id, bucket);
    }
    const rows = activeEmployees.map((employee) => {
      const assigned = byEmployee.get(text(employee.id)) || [];
      const overdue = assigned.filter((task) => dateOnly(task.due_date) && dateOnly(task.due_date) < today);
      const upcoming = assigned.filter((task) => dateOnly(task.due_date) >= today && dateOnly(task.due_date) <= nextWeek);
      const high = assigned.filter((task) => ["high", "critical", "urgent"].includes(lower(task.priority)));
      return {
        employeeId: employee.id,
        employeeCode: text(employee.employee_code),
        name: text(employee.name),
        designation: text(employee.designation),
        openTasks: assigned.length,
        overdueTasks: overdue.length,
        upcoming7Days: upcoming.length,
        highPriority: high.length,
      };
    }).sort((a, b) => b.overdueTasks - a.overdueTasks || b.openTasks - a.openTasks || a.employeeCode.localeCompare(b.employeeCode));

    const unassigned = open.filter((task) => !text(task.assigned_employee_id));
    const automatedUnassigned = unassigned.filter((task) => task.automation_generated === true);
    const overdueTotal = open.filter((task) => dateOnly(task.due_date) && dateOnly(task.due_date) < today).length;
    return NextResponse.json({ success: true, data: {
      summary: {
        activeEmployees: activeEmployees.length,
        openTasks: open.length,
        overdueTasks: overdueTotal,
        unassignedTasks: unassigned.length,
        automatedUnassigned: automatedUnassigned.length,
        dueNext7Days: open.filter((task) => dateOnly(task.due_date) >= today && dateOnly(task.due_date) <= nextWeek).length,
      },
      employees: rows,
      unassigned: unassigned.slice(0, 20).map((task) => ({
        id: task.id, taskCode: task.task_code, title: task.task_title, priority: task.priority,
        dueDate: task.due_date, automated: task.automation_generated === true, source: task.automation_source,
      })),
      generatedAt: new Date().toISOString(),
    } }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not calculate workload." }, { status: permissionStatus(error), headers: { "Cache-Control": "no-store" } });
  }
}
