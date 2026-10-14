import { insertRows, selectRows } from "@/lib/supabase-data";
import {
  canonicalProjectService,
  responsibilityAutomationKey,
  responsibilityTasksForService,
} from "@/lib/project-task-templates";

type Row = Record<string, any>;

function text(value: unknown, max = 1000) { return String(value ?? "").trim().slice(0, max); }
function effectiveBill(row: Row) { return !["void", "voided", "cancelled", "canceled", "rejected"].includes(text(row.status).toLowerCase()); }
function today() { return new Date().toISOString().slice(0, 10); }
function addDays(date: string, days: number) { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); }
function taskCode(projectCode: string) { return `RT-${projectCode.replace(/[^A-Z0-9]/gi, "")}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`; }

export async function syncResponsibilityTasksForProject(projectCode: string, actor = "", defaultAssignee = "") {
  const projects = await selectRows("projects", { filters: { project_code: projectCode }, limit: 1 });
  if (!projects.length) throw new Error(`Project ${projectCode} was not found.`);
  const project = projects[0];
  const [bills, existing, employees] = await Promise.all([
    selectRows("bills", { filters: { project_id: project.id }, limit: 5000 }),
    selectRows("tasks", { filters: { project_id: project.id }, limit: 5000 }),
    defaultAssignee ? selectRows("employees", { limit: 1000 }) : Promise.resolve([]),
  ]);

  const services = Array.from(new Set(
    bills
      .filter(effectiveBill)
      .map((row) => canonicalProjectService(`${text(row.description)} ${text(row.billing_category || row.category)}`))
      .filter(Boolean),
  ));
  const existingByKey = new Map(existing.filter((row) => text(row.automation_key)).map((row) => [text(row.automation_key), row]));
  const assigneeNeedle = text(defaultAssignee).toLowerCase();
  const assignee = employees.find((row) => [text(row.employee_code), text(row.name), text(row.email)].some((value) => value.toLowerCase() === assigneeNeedle));
  const assigneeId = assignee?.id || null;
  const now = new Date().toISOString();
  const baseDate = today();
  const created: Row[] = [];
  let globalOrder = 10;

  for (const service of services) {
    const templates = responsibilityTasksForService(service);
    const codeByTemplate = new Map<string, string>();
    for (const template of templates) {
      const key = responsibilityAutomationKey(projectCode, service, template.key);
      const prior = existingByKey.get(key);
      codeByTemplate.set(template.key, text(prior?.task_code) || taskCode(projectCode));
    }
    for (const template of templates) {
      const automationKey = responsibilityAutomationKey(projectCode, service, template.key);
      if (existingByKey.has(automationKey)) continue;
      const row = {
        task_code: codeByTemplate.get(template.key) || taskCode(projectCode),
        project_id: project.id,
        task_title: template.title,
        description: `Required ${template.stage} responsibility created from ${service}.`,
        assigned_employee_id: assigneeId,
        priority: template.priority || "Normal",
        status: "Pending",
        start_date: baseDate,
        due_date: addDays(baseDate, template.dueInDays),
        completed_at: null,
        progress: 0,
        project_name_snapshot: text(project.project_name || project.client_name_snapshot) || projectCode,
        source_created_at: now,
        source_created_by: actor || null,
        source_updated_at: now,
        automation_generated: true,
        automation_source: "Responsibility Template",
        automation_key: automationKey,
        lifecycle_stage: template.stage,
        task_type: template.type,
        is_required: true,
        dependency_task_code: template.dependencyKey ? codeByTemplate.get(template.dependencyKey) || null : null,
        blocker_reason: null,
        source_service: service,
        sort_order: globalOrder,
        client_visible: Boolean(template.clientVisible),
        work_notes: null,
        assigned_by: assigneeId ? actor || null : null,
        assigned_at: assigneeId ? now : null,
        created_at: now,
        updated_at: now,
      };
      globalOrder += 10;
      created.push(row);
      existingByKey.set(automationKey, row);
    }
  }

  if (created.length) await insertRows("tasks", created);
  return { projectId: projectCode, services, createdCount: created.length, assignedEmployeeId: assigneeId, created };
}
