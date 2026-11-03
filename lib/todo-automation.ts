import { createTodoItem, deleteTodoItem, type TodoItem } from "@/lib/todo-data";
import { insertRows, selectRows, updateRows } from "@/lib/supabase-data";
import { recordAuditEvent } from "@/lib/audit-log";

type Row = Record<string, any>;
type Candidate = {
  ruleKey: string; eventKey: string; sourceTable: string; sourceId: string; eventAt: string;
  title: string; description: string; priority: "Normal" | "High" | "Urgent";
  referenceType: "None" | "Project" | "Proposal"; projectCode?: string; proposalCode?: string;
  workflowId?: string; employeeId?: string; checklist: string[]; dueDate: string;
};
export type AutomationRule = Row & {
  rule_key: string; label: string; description: string; enabled: boolean; due_days: number;
  assigned_employee_id?: string | null; active_since: string;
};
const DAY = 86400000;
const DHAKA = 21600000;
const KEYS = new Set(["project_created","service_activated","proposal_sent","site_issue","ready_to_print","invoice_overdue","document_followup"]);
function text(value: unknown, max = 800) { return String(value ?? "").trim().slice(0, max); }
function amount(value: unknown) { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function dateMs(value: unknown) { const ms = Date.parse(text(value, 80)); return Number.isFinite(ms) ? ms : NaN; }
function dateOnly(value: unknown) { const s = text(value, 50); const m = s.match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : ""; }
function isoDate(ms: number) { return new Date(ms).toISOString().slice(0, 10); }
function dhakaDate(value: unknown) { const ms = dateMs(value); return Number.isFinite(ms) ? isoDate(ms + DHAKA) : ""; }
function addDate(value: string, days: number) { const date = Date.parse(value + "T00:00:00Z"); return isoDate(date + days * DAY); }
function triggered(value: unknown, rule: AutomationRule) {
  const ms = dateMs(value);
  return Number.isFinite(ms) && ms >= dateMs(rule.active_since);
}
function status(value: unknown) { return text(value, 100).toLowerCase().replace(/[_-]+/g, " "); }
function populated(value: unknown) { return text(value).length > 0; }
function reference(project: Row | undefined) { return text(project?.project_code, 80); }
function newCandidate(rule: AutomationRule, sourceTable: string, sourceId: string, eventAt: string,
  title: string, description: string, checklist: string[], options: Partial<Candidate> = {}): Candidate {
  const eventDate = dhakaDate(eventAt) || new Date().toISOString().slice(0, 10);
  return {
    ruleKey: rule.rule_key, eventKey: sourceTable + ":" + sourceId, sourceTable, sourceId, eventAt,
    title: text(title, 240), description: text(description, 3500),
    checklist: checklist.slice(0, 20), dueDate: addDate(eventDate, Math.max(0, Number(rule.due_days) || 0)),
    priority: "Normal", referenceType: "None", ...options,
  };
}
function visitIssue(row: Row) {
  if (populated(row.action_required) || populated(row.problem_photo_path) || populated(row.problem_photo_drive_file_id)) return true;
  const media = Array.isArray(row.media_items) ? row.media_items : [];
  return media.some((item: Row) => /problem|issue|defect/i.test(text(item.type || item.category || item.media_type, 80)));
}
function overdueInvoice(row: Row, today: string) {
  const dueDate = dateOnly(row.due_date);
  if (!dueDate || dueDate >= today || /paid|void|cancel|reject/i.test(status(row.status)) && !/partially paid/i.test(status(row.status))) return false;
  const due = row.due_amount_snapshot != null ? amount(row.due_amount_snapshot) : amount(row.amount) - amount(row.paid_amount_snapshot);
  return due > 0;
}
function pendingDoc(row: Row) {
  if (row.archived_at || row.is_required === false) return false;
  const s = status(row.status || row.collection_status);
  if (/received|collected|delivered|complete|approved|printed|returned|cancel/.test(s)) return false;
  if (populated(row.file_url) || populated(row.drive_file_url)) return false;
  return true;
}
function canUseEmployee(id: string, active: Set<string>) { return id && active.has(id) ? id : ""; }

export async function listAutomationDashboard() {
  const [rules, events] = await Promise.all([
    selectRows("todo_automation_rules", { order: "rule_key:asc", limit: 100 }),
    selectRows("todo_automation_events", { order: "created_at:desc", limit: 150 }),
  ]);
  return { rules: rules as AutomationRule[], events };
}

export async function saveAutomationRule(key: string, input: Row) {
  if (!KEYS.has(key)) throw new Error("Unknown automation rule.");
  const rows = await selectRows("todo_automation_rules", { filters: { rule_key: key }, limit: 1 });
  const current = rows[0];
  if (!current) throw new Error("Automation rule was not found.");
  const dueDays = Number(input.dueDays);
  if (!Number.isInteger(dueDays) || dueDays < 0 || dueDays > 90) throw new Error("Due offset must be between 0 and 90 days.");
  const employeeId = text(input.assignedEmployeeId, 80);
  if (employeeId) {
    const employees = await selectRows("employees", { filters: { id: employeeId }, limit: 1 });
    if (!employees.length || status(employees[0].status) !== "active") throw new Error("Select an active employee.");
  }
  const enabled = input.enabled === true;
  const changes: Row = {
    enabled, assigned_employee_id: employeeId || null, due_days: dueDays, updated_at: new Date().toISOString(),
  };
  if (enabled && current.enabled !== true) changes.active_since = new Date().toISOString();
  const updated = await updateRows("todo_automation_rules", { rule_key: key }, changes);
  if (!updated.length) throw new Error("Automation rule could not be updated.");
  return updated[0] as AutomationRule;
}

async function collectCandidates(rules: AutomationRule[]): Promise<Candidate[]> {
  const enabled = new Map(rules.filter((row) => row.enabled === true).map((row) => [row.rule_key, row]));
  if (!enabled.size) return [];
  const need = (key: string) => enabled.has(key);
  const fetch = async (table: string, required: boolean, order = "created_at:desc") =>
    required ? selectRows(table, { order, limit: 5000 }) : Promise.resolve([] as Row[]);
  const [projects, workflows, proposals, visits, invoices, docRegisters, drawings, employees] = await Promise.all([
    fetch("projects", true, "created_at:desc"),
    fetch("project_service_workflows", need("service_activated") || need("ready_to_print"), "updated_at:desc"),
    fetch("proposals", need("proposal_sent"), "updated_at:desc"),
    fetch("site_visits", need("site_issue"), "created_at:desc"),
    fetch("invoices", need("invoice_overdue"), "created_at:desc"),
    fetch("client_document_register", need("document_followup"), "created_at:desc"),
    fetch("project_service_documents", need("document_followup") || need("ready_to_print"), "created_at:desc"),
    fetch("employees", true, "employee_code:asc"),
  ]);
  const projectMap = new Map(projects.map((r) => [text(r.id, 80), r]));
  const workflowMap = new Map(workflows.map((r) => [text(r.id, 80), r]));
  const activeEmployees = new Set(employees.filter((r) => status(r.status) === "active").map((r) => text(r.id, 80)));
  const chosen = (rule: AutomationRule, fallback = "") => canUseEmployee(text(rule.assigned_employee_id, 80), activeEmployees) || canUseEmployee(fallback, activeEmployees);
  const today = new Date(Date.now() + DHAKA).toISOString().slice(0, 10);
  const all: Candidate[] = [];

  const projectRule = enabled.get("project_created");
  if (projectRule) for (const project of projects) {
    if (!triggered(project.created_at, projectRule) || status(project.lifecycle_phase) === "completed" || !populated(project.project_code)) continue;
    const code = text(project.project_code, 80);
    all.push(newCandidate(projectRule, "projects", text(project.id, 80), text(project.created_at),
      "Kick off " + code + " — " + text(project.project_name || "New project", 140),
      "Confirm the project brief and start the design-stage handover. Client: " + text(project.client_name_snapshot, 160),
      ["Confirm client contact and site details", "Review scope, soil report and survey", "Assign the design team", "Confirm paid services and design schedule"],
      { referenceType: "Project", projectCode: code, employeeId: chosen(projectRule), priority: "High" }));
  }
  const serviceRule = enabled.get("service_activated");
  if (serviceRule) for (const wf of workflows) {
    if (!triggered(wf.activated_at, serviceRule) || amount(wf.paid_amount) <= 0 || !populated(wf.project_code)) continue;
    if (/delivered|printed|cancel/i.test(status(wf.status))) continue;
    all.push(newCandidate(serviceRule, "project_service_workflows", text(wf.id, 80), text(wf.activated_at),
      "Start " + text(wf.service_name, 130) + " — " + text(wf.project_code, 80),
      "Service activated after payment. Confirm the work scope and move the linked Workflow only through explicit management actions.",
      ["Confirm service scope and payment allocation", "Assign designer and review inputs", "Start service deliverables", "Update official Workflow as work progresses"],
      { referenceType: "Project", projectCode: text(wf.project_code, 80), workflowId: text(wf.id, 80), employeeId: chosen(serviceRule), priority: "High" }));
  }
  const proposalRule = enabled.get("proposal_sent");
  if (proposalRule) for (const prop of proposals) {
    if (status(prop.status) !== "sent" || !triggered(prop.updated_at, proposalRule)) continue;
    all.push(newCandidate(proposalRule, "proposals", text(prop.proposal_code, 120), text(prop.updated_at),
      "Follow up proposal " + text(prop.proposal_code, 100),
      "Client: " + text(prop.client_name, 160) + ". " + text(prop.project_title, 180) + ". Contact the client and record the response.",
      ["Confirm proposal was received", "Discuss questions or revisions", "Record response and next action"],
      { referenceType: "Proposal", proposalCode: text(prop.proposal_code, 120), employeeId: chosen(proposalRule) }));
  }
  const visitRule = enabled.get("site_issue");
  if (visitRule) for (const visit of visits) {
    if (!triggered(visit.created_at, visitRule) || !visitIssue(visit)) continue;
    const project = projectMap.get(text(visit.project_id, 80));
    if (!reference(project)) continue;
    const code = reference(project);
    all.push(newCandidate(visitRule, "site_visits", text(visit.id, 80), text(visit.created_at),
      "Resolve site issue — " + code + " / " + text(visit.visit_code || "Site visit", 70),
      "Site observation: " + text(visit.observations || visit.notes, 1000) + ". Action required: " + text(visit.action_required || "Review the reported problem and photos.", 1000),
      ["Review the site visit and issue photos", "Confirm corrective action with responsible engineer", "Record resolution and close the issue"],
      { referenceType: "Project", projectCode: code, employeeId: chosen(visitRule, text(visit.employee_id, 80)), priority: "Urgent" }));
  }
  const printRule = enabled.get("ready_to_print");
  const readyWorkflowIds = new Set<string>();
  if (printRule) for (const wf of workflows) {
    if (status(wf.status) !== "ready to print" || !triggered(wf.updated_at, printRule)) continue;
    readyWorkflowIds.add(text(wf.id, 80));
    all.push(newCandidate(printRule, "print_workflow", text(wf.id, 80), text(wf.updated_at),
      "Print " + text(wf.service_name, 130) + " — " + text(wf.project_code, 80),
      "Linked Workflow has reached Ready to Print. Verify print quantity, final files, and approved revisions.",
      ["Confirm final approved revision", "Check paper size and quantities", "Print and quality-check sheets", "Record printing in Workflow"],
      { referenceType: "Project", projectCode: text(wf.project_code, 80), workflowId: text(wf.id, 80), employeeId: chosen(printRule), priority: "High" }));
  }
  if (printRule) for (const doc of drawings) {
    if (!triggered(doc.ready_to_print_at, printRule) || doc.archived_at || status(doc.status) !== "ready to print") continue;
    if (readyWorkflowIds.has(text(doc.service_workflow_id, 80))) continue;
    const projectCode = text(doc.project_code || projectMap.get(text(doc.project_id, 80))?.project_code, 80);
    if (!projectCode) continue;
    all.push(newCandidate(printRule, "print_document", text(doc.id, 80), text(doc.ready_to_print_at),
      "Print drawing " + text(doc.document_name || doc.document_code, 130) + " — " + projectCode,
      "Drawing is Ready to Print. Verify final revision and quantity. " + text(doc.remarks, 500),
      ["Verify drawing number and approved revision", "Check print quantity / paper size", "Print and quality-check", "Record completion in document register"],
      { referenceType: "Project", projectCode, workflowId: workflowMap.has(text(doc.service_workflow_id, 80)) ? text(doc.service_workflow_id, 80) : "", employeeId: chosen(printRule), priority: "High" }));
  }
  const invoiceRule = enabled.get("invoice_overdue");
  if (invoiceRule) for (const invoice of invoices) {
    if (!triggered(invoice.created_at, invoiceRule) || !overdueInvoice(invoice, today)) continue;
    const project = projectMap.get(text(invoice.project_id, 80));
    all.push(newCandidate(invoiceRule, "invoices", text(invoice.id, 80), text(invoice.created_at),
      "Payment follow-up — " + text(invoice.invoice_code, 90),
      "Invoice due date " + dateOnly(invoice.due_date) + ". Outstanding amount: BDT " + (invoice.due_amount_snapshot != null ? amount(invoice.due_amount_snapshot) : amount(invoice.amount) - amount(invoice.paid_amount_snapshot)).toFixed(2) + ". Check payment status and contact the client as appropriate.",
      ["Verify invoice and payments in Finance", "Contact the client about outstanding payment", "Record response and follow-up date"],
      { referenceType: reference(project) ? "Project" : "None", projectCode: reference(project), employeeId: chosen(invoiceRule), priority: "High", dueDate: today }));
  }
  const docRule = enabled.get("document_followup");
  if (docRule) {
    for (const doc of docRegisters) {
      if (!triggered(doc.created_at, docRule) || !pendingDoc(doc)) continue;
      const elapsed = Date.now() - dateMs(doc.created_at);
      if (elapsed < Number(docRule.due_days || 0) * DAY) continue;
      const projectCode = reference(projectMap.get(text(doc.project_id, 80)));
      all.push(newCandidate(docRule, "client_document_register", text(doc.id, 80), text(doc.created_at),
        "Collect document: " + text(doc.document_name || doc.document_type, 150) + (projectCode ? " — " + projectCode : ""),
        "Client document remains uncollected. " + text(doc.remarks, 900),
        ["Confirm required document with client", "Arrange collection and verify originals", "Update document register"],
        { referenceType: projectCode ? "Project" : "None", projectCode, employeeId: chosen(docRule) }));
    }
    for (const doc of drawings) {
      if (!triggered(doc.created_at, docRule) || !pendingDoc(doc)) continue;
      if (Date.now() - dateMs(doc.created_at) < Number(docRule.due_days || 0) * DAY) continue;
      const projectCode = text(doc.project_code || projectMap.get(text(doc.project_id, 80))?.project_code, 80);
      if (!projectCode) continue;
      all.push(newCandidate(docRule, "project_service_documents", text(doc.id, 80), text(doc.created_at),
        "Required drawing follow-up: " + text(doc.document_name || doc.document_code, 130) + " — " + projectCode,
        "Required drawing has no uploaded file. Check the document stage and required inputs.",
        ["Confirm drawing requirement", "Request missing inputs or files", "Update the drawing register"],
        { referenceType: "Project", projectCode, workflowId: workflowMap.has(text(doc.service_workflow_id, 80)) ? text(doc.service_workflow_id, 80) : "", employeeId: chosen(docRule) }));
    }
  }
  return all.filter((r) => r.eventKey.length > 1 && r.sourceId && r.title).sort((a,b) => a.eventAt.localeCompare(b.eventAt));
}

export async function previewTodoAutomations() {
  const state = await listAutomationDashboard();
  const candidates = await collectCandidates(state.rules);
  const eventRows = await selectRows("todo_automation_events", { order: "created_at:desc", limit: 5000 });
  const known = new Set(eventRows.map((r) => text(r.rule_key) + "|" + text(r.event_key)));
  const pending = candidates.filter((c) => !known.has(c.ruleKey + "|" + c.eventKey));
  const counts: Record<string, number> = {};
  for (const item of pending) counts[item.ruleKey] = (counts[item.ruleKey] || 0) + 1;
  return { pending: pending.length, counts, samples: pending.slice(0, 12).map((c) => ({ ruleKey: c.ruleKey, title: c.title, dueDate: c.dueDate })) };
}

export async function processTodoAutomations(limit = 20) {
  const state = await listAutomationDashboard();
  const candidates = await collectCandidates(state.rules);
  const known = new Set(state.events.map((r) => text(r.rule_key) + "|" + text(r.event_key)));
  let generated = 0, skipped = 0;
  const errors: Array<{ ruleKey: string; eventKey: string; error: string }> = [];
  for (const c of candidates) {
    if (generated + errors.length >= Math.max(1, Math.min(40, limit))) break;
    if (known.has(c.ruleKey + "|" + c.eventKey)) { skipped++; continue; }
    let eventId = "";
    try {
      const rows = await insertRows("todo_automation_events", { rule_key: c.ruleKey, event_key: c.eventKey, source_table: c.sourceTable, source_id: c.sourceId, event_at: c.eventAt, status: "processing" });
      eventId = text(rows[0]?.id, 80);
    } catch (error) {
      if (/unique|duplicate|23505/i.test(text(error instanceof Error ? error.message : error, 700))) { skipped++; continue; }
      errors.push({ ruleKey: c.ruleKey, eventKey: c.eventKey, error: text(error instanceof Error ? error.message : error, 600) });
      continue;
    }
    let todo: TodoItem | null = null;
    try {
      todo = await createTodoItem({
        title: c.title, description: c.description, status: "To Do", priority: c.priority,
        dueDate: c.dueDate, reminderEnabled: false, referenceType: c.referenceType,
        projectCode: c.projectCode || "", proposalCode: c.proposalCode || "",
        workflowId: c.workflowId || "", assignedEmployeeId: c.employeeId || "",
      }, "LAND VIEW Automation");
      if (c.checklist.length) {
        const now = new Date().toISOString();
        await insertRows("todo_subtasks", c.checklist.map((title, index) => ({
          todo_id: todo!.id, todo_code: todo!.todo_code, title, sort_order: index * 10,
          is_completed: false, created_by_name: "LAND VIEW Automation", created_by_user_key: "todo-automation",
          created_by_role: "system", created_at: now, updated_at: now,
        })));
      }
      const completed = await updateRows("todo_automation_events", { id: eventId }, { status: "generated", todo_code: todo.todo_code, error: null, updated_at: new Date().toISOString() });
      if (!completed.length) throw new Error("Could not finalize automation record.");
      await recordAuditEvent({ user: { userId: "system:todo-automation", role: "system", name: "LAND VIEW Automation" },
        action: "todo_automation_generated", entityType: "todo", entityId: todo.todo_code,
        after: { ruleKey: c.ruleKey, eventKey: c.eventKey, sourceId: c.sourceId, dueDate: c.dueDate }, source: "todo-automation" });
      generated++;
    } catch (error) {
      const message = text(error instanceof Error ? error.message : error, 900);
      if (todo?.todo_code) {
        try { await deleteTodoItem(todo.todo_code); todo = null; } catch {}
      }
      await updateRows("todo_automation_events", { id: eventId }, {
        status: "failed", todo_code: todo?.todo_code || null, error: message, updated_at: new Date().toISOString(),
      }).catch(() => undefined);
      errors.push({ ruleKey: c.ruleKey, eventKey: c.eventKey, error: message });
    }
  }
  return { scanned: candidates.length, generated, skipped, errors: errors.slice(0, 20) };
}
