import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf } from "@/lib/local-session";
import { selectRows, supabaseGateway } from "@/lib/supabase-data";
import { workflowStatusesForService } from "@/lib/service-workflow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Row = Record<string, any>;
const LIMIT = 10000;
const PAGE = 2500;

function text(value: unknown, max = 300) { return String(value ?? "").trim().slice(0, max); }
function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
async function readAll(table: string, select: string, order: string, max = LIMIT) {
  const rows: Row[] = [];
  while (rows.length < max) {
    const batch = await selectRows(table, { select, order, limit: Math.min(PAGE, max - rows.length), offset: rows.length });
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}
export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request);
    if (!user) return json({ success: false, error: "Authentication required." }, 401);
    if (!["admin","manager"].includes(roleOf(user))) return json({ success: false, error: "Access denied." }, 403);

    const [tasks, employees, workflows, subtasks, taskCount, subtaskCount] = await Promise.all([
      readAll("todo_items", "id,todo_code,title,status,priority,due_date,due_time,created_at,updated_at,completed_at,assigned_employee_id,assigned_to,reference_type,project_code,proposal_code,workflow_id", "created_at:desc"),
      readAll("employees", "id,employee_code,name,designation,status", "employee_code:asc", 5000),
      readAll("project_service_workflows", "id,service_name,project_code,status", "created_at:desc", 5000),
      readAll("todo_subtasks", "id,todo_id,is_completed", "created_at:desc"),
      supabaseGateway("countRows", { table: "todo_items" }) as Promise<{count: number}>,
      supabaseGateway("countRows", { table: "todo_subtasks" }) as Promise<{count: number}>,
    ]);
    const employeeMap = new Map(employees.map((row) => [text(row.id), row]));
    const workflowMap = new Map(workflows.map((row) => [text(row.id), row]));
    const checklist = new Map<string, {total: number; completed: number}>();
    for (const row of subtasks) {
      const id = text(row.todo_id);
      const current = checklist.get(id) || { total: 0, completed: 0 };
      current.total += 1;
      if (row.is_completed === true) current.completed += 1;
      checklist.set(id, current);
    }
    const items = tasks.map((todo) => {
      const employee = employeeMap.get(text(todo.assigned_employee_id));
      const workflow = workflowMap.get(text(todo.workflow_id));
      const chain = workflow ? workflowStatusesForService(text(workflow.service_name)) : [];
      const final = Boolean(workflow && chain.length && text(workflow.status) === chain[chain.length - 1]);
      const hasWorkflow = Boolean(todo.workflow_id);
      const isDone = text(todo.status) === "Done";
      return {
        id: text(todo.id),
        todoCode: text(todo.todo_code),
        title: text(todo.title, 250),
        status: text(todo.status) || "To Do",
        priority: text(todo.priority) || "Normal",
        dueDate: text(todo.due_date, 20),
        dueTime: text(todo.due_time, 20),
        createdAt: text(todo.created_at, 80),
        updatedAt: text(todo.updated_at, 80),
        completedAt: text(todo.completed_at, 80),
        assignedEmployeeId: text(todo.assigned_employee_id, 80),
        assignedTo: text(todo.assigned_to, 200),
        employeeName: employee ? text(employee.name, 160) : text(todo.assigned_to, 160),
        employeeCode: employee ? text(employee.employee_code, 50) : "",
        referenceType: text(todo.reference_type),
        projectCode: text(todo.project_code, 80),
        proposalCode: text(todo.proposal_code, 120),
        workflowId: text(todo.workflow_id, 80),
        workflowService: workflow ? text(workflow.service_name, 160) : "",
        workflowStatus: workflow ? text(workflow.status, 100) : "",
        workflowFinal: final,
        workflowMissing: hasWorkflow && !workflow,
        workflowMismatch: hasWorkflow && Boolean(workflow) && (isDone !== final),
        checklist: checklist.get(text(todo.id)) || { total: 0, completed: 0 },
      };
    });
    return json({
      success: true,
      data: {
        items,
        employees: employees.map((row) => ({
          id: text(row.id, 80),
          code: text(row.employee_code, 80),
          name: text(row.name, 160),
          designation: text(row.designation, 160),
          status: text(row.status, 60),
        })),
        totalTasks: Number(taskCount.count || 0),
        totalSubtasks: Number(subtaskCount.count || 0),
        truncated: tasks.length < Number(taskCount.count || 0) || subtasks.length < Number(subtaskCount.count || 0),
        refreshedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    return json({ success: false, error: text(error instanceof Error ? error.message : error, 700) }, 500);
  }
}
