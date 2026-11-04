"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import styles from "@/app/admin/todo/todo.module.css";
import AdminTodoBulkActions, { type BulkResult } from "@/components/admin-todo-bulk-actions";

type TodoStatus = "To Do" | "In Progress" | "Done";
type TodoPriority = "Low" | "Normal" | "High" | "Urgent";
type TodoReferenceType = "None" | "Project" | "Proposal";

type TodoItem = {
  id?: string;
  todo_code: string;
  title: string;
  description?: string | null;
  status: TodoStatus;
  priority: TodoPriority;
  due_date?: string | null;
  due_time?: string | null;
  reference_type?: TodoReferenceType;
  project_code?: string | null;
  proposal_code?: string | null;
  workflow_id?: string | null;
  automation_source?: string | null;
  dependency_todo_code?: string | null;
  is_delivery_step?: boolean;
  workflow_stage?: string | null;
  assigned_employee_id?: string | null;
  assigned_to?: string | null;
  created_by?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

type WorkflowItem = {
  id: string;
  projectId: string;
  serviceName: string;
  status: string;
  statuses: string[];
  workflowType?: string;
};

type ProjectOption = {
  id: string;
  projectCode: string;
  clientName: string;
  projectName: string;
  location: string;
  lifecyclePhase: string;
};

type ProposalOption = {
  proposalCode: string;
  clientName: string;
  projectTitle: string;
  location: string;
  status: string;
  convertedProjectCode: string;
};

type EmployeeOption = {
  id: string;
  employeeCode: string;
  name: string;
  designation: string;
  department: string;
};

type TodoOptions = {
  projects: ProjectOption[];
  proposals: ProposalOption[];
  employees: EmployeeOption[];
  workflows: WorkflowItem[];
};

type Draft = {
  title: string;
  description: string;
  status: TodoStatus;
  priority: TodoPriority;
  dueDate: string;
  referenceType: TodoReferenceType;
  referenceCode: string;
  workflowId: string;
  assignedEmployeeCode: string;
};

const EMPTY_DRAFT: Draft = {
  title: "",
  description: "",
  status: "To Do",
  priority: "Normal",
  dueDate: "",
  referenceType: "None",
  referenceCode: "",
  workflowId: "",
  assignedEmployeeCode: "",
};

const EMPTY_OPTIONS: TodoOptions = { projects: [], proposals: [], employees: [], workflows: [] };

const COLUMNS: Array<{ status: TodoStatus; label: string; hint: string }> = [
  { status: "To Do", label: "To Do", hint: "Not started" },
  { status: "In Progress", label: "In Progress", hint: "Being worked on" },
  { status: "Done", label: "Done", hint: "Completed" },
];

async function request<T>(method: "GET" | "POST", body?: Record<string, unknown>, query = ""): Promise<T> {
  const response = await fetch(`/api/admin/todo${query}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "To Do request failed."));
  return json.data as T;
}

function isOverdue(item: TodoItem) {
  if (!item.due_date || item.status === "Done") return false;
  const time = /^([01]\d|2[0-3]):[0-5]\d/.test(item.due_time || "") ? String(item.due_time).slice(0, 5) + ":00" : "23:59:59";
  const due = new Date(item.due_date + "T" + time + "+06:00");
  return Number.isFinite(due.getTime()) && due.getTime() < Date.now();
}

function dueLabel(value?: string | null, dueTime?: string | null) {
  if (!value) return "No due date";
  const time = /^([01]\d|2[0-3]):[0-5]\d/.test(dueTime || "") ? String(dueTime).slice(0,5) + ":00" : "23:59:59";
  const date = new Date(value + "T" + time + "+06:00");
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone:"Asia/Dhaka", day:"2-digit", month:"short", year:"numeric",
    ...(dueTime ? { hour:"2-digit", minute:"2-digit", hour12:true } : {})
  }).format(date);
}

function referenceTypeOf(item: TodoItem): TodoReferenceType {
  if (item.reference_type === "Project" || item.reference_type === "Proposal" || item.reference_type === "None") return item.reference_type;
  if (item.proposal_code) return "Proposal";
  if (item.project_code) return "Project";
  return "None";
}

function referenceCodeOf(item: TodoItem) {
  const type = referenceTypeOf(item);
  if (type === "Project") return item.project_code || "";
  if (type === "Proposal") return item.proposal_code || "";
  return "";
}

function normalizeProjectCode(value: string) {
  const raw = value.trim().toUpperCase();
  if (!raw) return "";
  const match = raw.match(/^(?:LV[-\s]?)?(\d+)$/);
  return match ? `LV-${String(Number(match[1])).padStart(3, "0")}` : raw;
}

function normalizeProposalCode(value: string) {
  return value.trim().toUpperCase();
}

function itemPayload(item: TodoItem, statusOverride?: TodoStatus) {
  const referenceType = referenceTypeOf(item);
  const referenceCode = referenceCodeOf(item);
  return {
    title: item.title,
    description: item.description || "",
    status: statusOverride || item.status,
    priority: item.priority,
    dueDate: item.due_date || "",
    referenceType,
    projectCode: referenceType === "Project" ? referenceCode : "",
    proposalCode: referenceType === "Proposal" ? referenceCode : "",
    workflowId: referenceType === "Project" ? item.workflow_id || "" : "",
    assignedEmployeeId: item.assigned_employee_id || "",
    assignedTo: item.assigned_to || "",
  };
}

function finalWorkflowStatus(workflow?: WorkflowItem) {
  if (!workflow?.statuses?.length) return "";
  return workflow.statuses[workflow.statuses.length - 1] || "";
}

export default function AdminTodoBoard() {
  const [items, setItems] = useState<TodoItem[]>([]);
  const [options, setOptions] = useState<TodoOptions>(EMPTY_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editingCode, setEditingCode] = useState("");
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [todoItems, liveOptions] = await Promise.all([
        request<TodoItem[]>("GET"),
        request<TodoOptions>("GET", undefined, "?mode=options"),
      ]);
      setItems(todoItems);
      setOptions(liveOptions || EMPTY_OPTIONS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load To Do items.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("landview:todo:changed", refresh);
    return () => window.removeEventListener("landview:todo:changed", refresh);
  }, []);

  const workflows = options.workflows || [];
  const workflowById = useMemo(() => new Map(workflows.map((workflow) => [workflow.id, workflow])), [workflows]);
  const projectByCode = useMemo(() => new Map(options.projects.map((project) => [normalizeProjectCode(project.projectCode), project])), [options.projects]);
  const proposalByCode = useMemo(() => new Map(options.proposals.map((proposal) => [normalizeProposalCode(proposal.proposalCode), proposal])), [options.proposals]);
  const employeeById = useMemo(() => new Map(options.employees.map((employee) => [employee.id, employee])), [options.employees]);
  const employeeByCode = useMemo(() => new Map(options.employees.map((employee) => [employee.employeeCode.toUpperCase(), employee])), [options.employees]);

  const selectedProject = draft.referenceType === "Project" ? projectByCode.get(normalizeProjectCode(draft.referenceCode)) : undefined;
  const selectedProposal = draft.referenceType === "Proposal" ? proposalByCode.get(normalizeProposalCode(draft.referenceCode)) : undefined;
  const selectedEmployee = draft.assignedEmployeeCode.trim() ? employeeByCode.get(draft.assignedEmployeeCode.trim().toUpperCase()) : undefined;

  const projectWorkflows = useMemo(() => {
    if (!selectedProject) return [];
    return workflows
      .filter((workflow) => normalizeProjectCode(String(workflow.projectId || "")) === normalizeProjectCode(selectedProject.projectCode))
      .sort((a, b) => a.serviceName.localeCompare(b.serviceName));
  }, [selectedProject, workflows]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => {
      const workflow = item.workflow_id ? workflowById.get(item.workflow_id) : undefined;
      const employee = item.assigned_employee_id ? employeeById.get(item.assigned_employee_id) : undefined;
      const project = item.project_code ? projectByCode.get(normalizeProjectCode(item.project_code)) : undefined;
      const proposal = item.proposal_code ? proposalByCode.get(normalizeProposalCode(item.proposal_code)) : undefined;
      return [
        item.title,
        item.description,
        item.project_code,
        project?.clientName,
        project?.projectName,
        item.proposal_code,
        proposal?.clientName,
        proposal?.projectTitle,
        item.reference_type,
        item.assigned_to,
        employee?.employeeCode,
        employee?.name,
        employee?.designation,
        item.priority,
        item.status,
        workflow?.serviceName,
        workflow?.status,
      ].some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [items, search, workflowById, employeeById, projectByCode, proposalByCode]);

  const selectedItems = useMemo(() => {
    const byCode = new Map(items.map(item => [item.todo_code, item]));
    return selectedCodes.map(code => byCode.get(code)).filter((item): item is TodoItem => Boolean(item && item.status !== "Done"));
  }, [items, selectedCodes]);

  function toggleSelection(item: TodoItem) {
    if (busy || bulkBusy || loading || item.status === "Done") return;
    setSelectedCodes(previous => previous.includes(item.todo_code)
      ? previous.filter(code => code !== item.todo_code)
      : previous.length < 25 ? [...previous, item.todo_code] : previous);
    if (!selectedCodes.includes(item.todo_code) && selectedCodes.length >= 25) {
      setError("You can select up to 25 open To Dos in a single batch.");
    }
  }

  function selectMatchingOpen() {
    if (busy || bulkBusy || loading) return;
    const available = filteredItems.filter(item => item.status !== "Done");
    setSelectedCodes(available.slice(0, 25).map(item => item.todo_code));
    setNotice(available.length > 25
      ? "Selected the first 25 matching open To Dos. Narrow the search to bulk-edit others."
      : available.length ? "Selected " + available.length + " matching open To Do(s)." : "No matching open To Dos to select.");
    setError("");
  }

  function bulkApplied(results: BulkResult[]) {
    const cleared = new Set(results.filter(result => result.status === "updated" || result.status === "skipped").map(result => result.todoCode));
    setSelectedCodes(previous => previous.filter(code => !cleared.has(code)));
    if (editingCode && cleared.has(editingCode)) resetForm();
    if (results.some(result => result.status === "updated")) {
      window.dispatchEvent(new Event("landview:todo:changed"));
    }
  }

  const counts = useMemo(() => ({
    total: items.length,
    open: items.filter((item) => item.status !== "Done").length,
    overdue: items.filter(isOverdue).length,
    done: items.filter((item) => item.status === "Done").length,
  }), [items]);

  function resetForm() {
    setDraft(EMPTY_DRAFT);
    setEditingCode("");
  }

  function startEdit(item: TodoItem) {
    const employee = item.assigned_employee_id ? employeeById.get(item.assigned_employee_id) : undefined;
    setEditingCode(item.todo_code);
    setDraft({
      title: item.title || "",
      description: item.description || "",
      status: item.status || "To Do",
      priority: item.priority || "Normal",
      dueDate: item.due_date || "",
      referenceType: referenceTypeOf(item),
      referenceCode: referenceCodeOf(item),
      workflowId: item.workflow_id || "",
      assignedEmployeeCode: employee?.employeeCode || "",
    });
    setNotice("");
    setError("");
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  useEffect(() => {
    const openByCode = (raw: string) => {
      const code = raw.trim().toUpperCase();
      const item = items.find((entry) => entry.todo_code.toUpperCase() === code);
      if (!item) return;
      setSearch(item.todo_code);
      startEdit(item);
    };
    const fromHash = () => {
      const matched = window.location.hash.match(/^#todo=(.+)$/);
      if (!matched) return;
      try { openByCode(decodeURIComponent(matched[1])); }
      catch { openByCode(matched[1]); }
    };
    const fromEvent = (event: Event) => {
      const custom = event as CustomEvent<{ todoCode?: string }>;
      if (custom.detail?.todoCode) openByCode(custom.detail.todoCode);
    };
    window.addEventListener("hashchange", fromHash);
    window.addEventListener("landview:todo:open", fromEvent);
    fromHash();
    return () => {
      window.removeEventListener("hashchange", fromHash);
      window.removeEventListener("landview:todo:open", fromEvent);
    };
  }, [items, employeeById]);

  useEffect(() => {
    const createNew = () => {
      resetForm();
      setSearch("");
      setNotice("");
      setError("");
      window.requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };
    window.addEventListener("landview:todo:new", createNew);
    return () => window.removeEventListener("landview:todo:new", createNew);
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim() || busy || bulkBusy) return;

    const projectCode = normalizeProjectCode(draft.referenceCode);
    const proposalCode = normalizeProposalCode(draft.referenceCode);
    const exactProject = draft.referenceType === "Project" ? projectByCode.get(projectCode) : undefined;
    const exactProposal = draft.referenceType === "Proposal" ? proposalByCode.get(proposalCode) : undefined;
    const exactEmployee = draft.assignedEmployeeCode.trim() ? employeeByCode.get(draft.assignedEmployeeCode.trim().toUpperCase()) : undefined;

    if (draft.referenceType === "Project" && !exactProject) {
      setError("Choose a valid Project from the LAND VIEW project list.");
      return;
    }
    if (draft.referenceType === "Proposal" && !exactProposal) {
      setError("Choose a valid Proposal from the LAND VIEW proposal list.");
      return;
    }
    if (draft.assignedEmployeeCode.trim() && !exactEmployee) {
      setError("Choose an active Employee from the LAND VIEW employee list.");
      return;
    }
    if (draft.workflowId && !projectWorkflows.some((workflow) => workflow.id === draft.workflowId)) {
      setError("Choose a Workflow service that belongs to the selected Project.");
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const item = {
        title: draft.title,
        description: draft.description,
        status: draft.status,
        priority: draft.priority,
        dueDate: draft.dueDate,
        referenceType: draft.referenceType,
        projectCode: draft.referenceType === "Project" ? projectCode : "",
        proposalCode: draft.referenceType === "Proposal" ? proposalCode : "",
        workflowId: draft.referenceType === "Project" ? draft.workflowId : "",
        assignedEmployeeId: exactEmployee?.id || "",
        assignedTo: exactEmployee ? `${exactEmployee.employeeCode} · ${exactEmployee.name}` : "",
      };
      if (editingCode) {
        await request<TodoItem>("POST", { action: "update", todoCode: editingCode, item });
        setNotice("To Do item updated.");
      } else {
        await request<TodoItem>("POST", { action: "create", item });
        setNotice("To Do item added.");
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save To Do item.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(item: TodoItem, nextStatus: TodoStatus) {
    if (busy || bulkBusy || item.status === nextStatus) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request<TodoItem>("POST", {
        action: "update",
        todoCode: item.todo_code,
        item: itemPayload(item, nextStatus),
      });
      setNotice(nextStatus === "Done" && item.workflow_id ? "To Do completed. Workflow was left unchanged." : "To Do status updated.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status.");
    } finally {
      setBusy(false);
    }
  }

  async function completeWithWorkflow(item: TodoItem) {
    if (busy || bulkBusy || !item.workflow_id) return;
    const workflow = workflowById.get(item.workflow_id);
    if (!workflow) {
      setError("The linked Workflow service is no longer available.");
      return;
    }
    const finalStatus = finalWorkflowStatus(workflow);
    const confirmed = window.confirm(
      `Complete “${item.title}” and update ${item.project_code || "the project"} · ${workflow.serviceName} to ${finalStatus || "its final status"}?`,
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await request<{ todo: TodoItem; workflow: { serviceName: string; status: string } }>("POST", {
        action: "completeWithWorkflow",
        todoCode: item.todo_code,
      });
      setNotice(`To Do completed and ${result.workflow.serviceName} moved to ${result.workflow.status}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete To Do with Workflow.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(item: TodoItem) {
    if (busy || bulkBusy || !window.confirm(`Delete “${item.title}”?`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request("POST", { action: "delete", todoCode: item.todo_code });
      if (editingCode === item.todo_code) resetForm();
      setNotice("To Do item deleted.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete To Do item.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main id="todo-board" className={styles.page}>
      <datalist id="todo-project-options">
        {options.projects.map((project) => (
          <option key={project.id || project.projectCode} value={project.projectCode}>
            {[project.clientName, project.projectName, project.location, project.lifecyclePhase].filter(Boolean).join(" · ")}
          </option>
        ))}
      </datalist>
      <datalist id="todo-proposal-options">
        {options.proposals.map((proposal) => (
          <option key={proposal.proposalCode} value={proposal.proposalCode}>
            {[proposal.clientName, proposal.projectTitle, proposal.location, proposal.status].filter(Boolean).join(" · ")}
          </option>
        ))}
      </datalist>
      <datalist id="todo-employee-options">
        {options.employees.map((employee) => (
          <option key={employee.id} value={employee.employeeCode}>
            {[employee.name, employee.designation, employee.department].filter(Boolean).join(" · ")}
          </option>
        ))}
      </datalist>

      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>LAND VIEW WORKSPACE</span>
          <h1>To Do</h1>
          <p>Projects, Proposals and Employees are now selected from live LAND VIEW records. Project Workflow remains optional and only changes through Complete + Workflow.</p>
        </div>
        <button className={styles.refreshButton} type="button" onClick={() => void load()} disabled={loading || busy || bulkBusy}>
          {loading ? "Loading…" : "Refresh"}
        </button>
      </section>

      <section className={styles.metrics} aria-label="To Do summary">
        <div className={styles.metric}><span>Total</span><strong>{counts.total}</strong></div>
        <div className={styles.metric}><span>Open</span><strong>{counts.open}</strong></div>
        <div className={styles.metric}><span>Overdue</span><strong>{counts.overdue}</strong></div>
        <div className={styles.metric}><span>Done</span><strong>{counts.done}</strong></div>
      </section>

      <form ref={formRef} className={styles.formCard} onSubmit={save}>
        <div className={styles.formHeading}>
          <div>
            <span className={styles.eyebrow}>{editingCode ? "EDIT ITEM" : "NEW ITEM"}</span>
            <h2>{editingCode ? "Update To Do" : "Add To Do"}</h2>
          </div>
          {editingCode ? <button className={styles.textButton} type="button" onClick={resetForm}>Cancel edit</button> : null}
        </div>

        <div className={styles.formGrid}>
          <label className={styles.fieldWide}>
            <span>Title *</span>
            <input value={draft.title} onChange={(event) => setDraft((prev) => ({ ...prev, title: event.target.value }))} placeholder="What needs to be done?" required maxLength={240} />
          </label>
          <label>
            <span>Status</span>
            <select value={draft.status} onChange={(event) => setDraft((prev) => ({ ...prev, status: event.target.value as TodoStatus }))}>
              <option>To Do</option><option>In Progress</option><option>Done</option>
            </select>
          </label>
          <label>
            <span>Priority</span>
            <select value={draft.priority} onChange={(event) => setDraft((prev) => ({ ...prev, priority: event.target.value as TodoPriority }))}>
              <option>Low</option><option>Normal</option><option>High</option><option>Urgent</option>
            </select>
          </label>
          <label>
            <span>Due date</span>
            <input type="date" value={draft.dueDate} onChange={(event) => setDraft((prev) => ({ ...prev, dueDate: event.target.value }))} />
          </label>
          <label>
            <span>Link to</span>
            <select
              value={draft.referenceType}
              onChange={(event) => setDraft((prev) => ({
                ...prev,
                referenceType: event.target.value as TodoReferenceType,
                referenceCode: "",
                workflowId: "",
              }))}
            >
              <option value="None">No project / proposal</option>
              <option value="Project">Project</option>
              <option value="Proposal">Proposal</option>
            </select>
          </label>

          {draft.referenceType === "Project" ? (
            <label>
              <span>Project *</span>
              <input
                list="todo-project-options"
                value={draft.referenceCode}
                onChange={(event) => setDraft((prev) => ({ ...prev, referenceCode: event.target.value, workflowId: "" }))}
                onBlur={() => setDraft((prev) => ({ ...prev, referenceCode: normalizeProjectCode(prev.referenceCode) }))}
                placeholder="Search LV ID, client or project"
                autoComplete="off"
                required
              />
              <small className={styles.fieldHint}>
                {selectedProject
                  ? [selectedProject.clientName, selectedProject.projectName, selectedProject.location, selectedProject.lifecyclePhase].filter(Boolean).join(" · ")
                  : "Choose a Project from the live LAND VIEW project list."}
              </small>
            </label>
          ) : null}

          {draft.referenceType === "Proposal" ? (
            <label>
              <span>Proposal *</span>
              <input
                list="todo-proposal-options"
                value={draft.referenceCode}
                onChange={(event) => setDraft((prev) => ({ ...prev, referenceCode: event.target.value, workflowId: "" }))}
                onBlur={() => setDraft((prev) => ({ ...prev, referenceCode: normalizeProposalCode(prev.referenceCode) }))}
                placeholder="Search proposal ID or client"
                autoComplete="off"
                required
              />
              <small className={styles.fieldHint}>
                {selectedProposal
                  ? [selectedProposal.clientName, selectedProposal.projectTitle, selectedProposal.location, selectedProposal.status].filter(Boolean).join(" · ")
                  : "Choose a Proposal from the live LAND VIEW proposal list."}
              </small>
            </label>
          ) : null}

          {draft.referenceType === "Project" && selectedProject ? (
            <label>
              <span>Workflow service (optional)</span>
              <select value={draft.workflowId} onChange={(event) => setDraft((prev) => ({ ...prev, workflowId: event.target.value }))}>
                <option value="">No specific Workflow service</option>
                {projectWorkflows.map((workflow) => (
                  <option key={workflow.id} value={workflow.id}>{workflow.serviceName} · {workflow.status}</option>
                ))}
              </select>
              <small className={styles.fieldHint}>
                {projectWorkflows.length ? "Services are loaded automatically from the selected project." : "This project has no active Workflow services yet."}
              </small>
            </label>
          ) : null}

          <label>
            <span>Assigned employee</span>
            <input
              list="todo-employee-options"
              value={draft.assignedEmployeeCode}
              onChange={(event) => setDraft((prev) => ({ ...prev, assignedEmployeeCode: event.target.value.toUpperCase() }))}
              placeholder="Search employee ID or name"
              autoComplete="off"
            />
            <small className={styles.fieldHint}>
              {selectedEmployee
                ? `${selectedEmployee.name} · ${selectedEmployee.designation || selectedEmployee.department || selectedEmployee.employeeCode}`
                : draft.assignedEmployeeCode.trim()
                  ? "Choose an active employee from the list."
                  : `${options.employees.length} active employee${options.employees.length === 1 ? "" : "s"} available.`}
            </small>
          </label>

          <label className={styles.fieldWide}>
            <span>Description</span>
            <textarea value={draft.description} onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))} placeholder="Notes, instructions, follow-up details…" rows={3} maxLength={4000} />
          </label>
        </div>
        <div className={styles.formActions}>
          <button
            className={styles.primaryButton}
            type="submit"
            disabled={busy || bulkBusy || !draft.title.trim() || (draft.referenceType === "Project" && !selectedProject) || (draft.referenceType === "Proposal" && !selectedProposal) || Boolean(draft.assignedEmployeeCode.trim() && !selectedEmployee)}
          >
            {busy ? "Saving…" : editingCode ? "Save changes" : "Add To Do"}
          </button>
        </div>
      </form>

      {error ? <div className={styles.errorBanner} role="alert">{error}</div> : null}
      {notice ? <div className={styles.noticeBanner}>{notice}</div> : null}

      <section className={styles.toolbar}>
        <div>
          <h2>Task board</h2>
          <p>{filteredItems.length} item{filteredItems.length === 1 ? "" : "s"} shown · {selectedItems.length} selected</p>
          <div className={styles.bulkToolbar}>
            <button type="button" onClick={selectMatchingOpen} disabled={busy || bulkBusy || loading || !filteredItems.some(item => item.status !== "Done")}>
              Select matching open (up to 25)
            </button>
            <button type="button" onClick={() => setSelectedCodes([])} disabled={busy || bulkBusy || selectedCodes.length === 0}>
              Clear selection
            </button>
          </div>
        </div>
        <label className={styles.searchBox}>
          <span className={styles.srOnly}>Search To Do items</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search task, project, proposal, employee, workflow…" />
        </label>
      </section>

      <AdminTodoBulkActions
        selected={selectedItems}
        employees={options.employees}
        disabled={busy || loading}
        onBusyChange={setBulkBusy}
        onApplied={bulkApplied}
      />

      {loading && !items.length ? <div className={styles.emptyState}>Loading To Do items…</div> : null}
      {!loading && !filteredItems.length ? <div className={styles.emptyState}>No To Do items match this view.</div> : null}

      <section className={styles.board}>
        {COLUMNS.map((column) => {
          const columnItems = filteredItems.filter((item) => item.status === column.status);
          return (
            <div className={styles.column} key={column.status}>
              <header className={styles.columnHeader}>
                <div><h3>{column.label}</h3><span>{column.hint}</span></div>
                <strong>{columnItems.length}</strong>
              </header>
              <div className={styles.cardStack}>
                {columnItems.map((item) => {
                  const referenceType = referenceTypeOf(item);
                  const linkedWorkflow = item.workflow_id ? workflowById.get(item.workflow_id) : undefined;
                  const workflowFinal = finalWorkflowStatus(linkedWorkflow);
                  const workflowDone = Boolean(linkedWorkflow && workflowFinal && linkedWorkflow.status === workflowFinal);
                  const assignedEmployee = item.assigned_employee_id ? employeeById.get(item.assigned_employee_id) : undefined;
                  const linkedProject = item.project_code ? projectByCode.get(normalizeProjectCode(item.project_code)) : undefined;
                  const linkedProposal = item.proposal_code ? proposalByCode.get(normalizeProposalCode(item.proposal_code)) : undefined;
                  return (
                    <article className={`${styles.todoCard} ${isOverdue(item) ? styles.overdueCard : ""} ${selectedCodes.includes(item.todo_code) ? styles.bulkSelected : ""}`} key={item.todo_code}>
                      {item.status !== "Done" && <label className={styles.bulkCheck}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${item.todo_code} for bulk actions`}
                          checked={selectedCodes.includes(item.todo_code)}
                          disabled={busy || bulkBusy || loading || (!selectedCodes.includes(item.todo_code) && selectedCodes.length >= 25)}
                          onChange={() => toggleSelection(item)}
                        />
                        <span>Select for bulk action</span>
                      </label>}
                      <div className={styles.cardTopline}>
                        <span className={`${styles.priority} ${styles[`priority${item.priority}`] || ""}`}>{item.priority}</span>
                        <span className={styles.code}>{item.todo_code}</span>
                      </div>
                      <h4>{item.title}</h4>
                      {item.description ? <p className={styles.description}>{item.description}</p> : null}
                      <div className={styles.metaGrid}>
                        <span className={isOverdue(item) ? styles.overdueText : ""}>Due: {dueLabel(item.due_date,item.due_time)}</span>
                        {referenceType === "Project" ? <span>Project: {item.project_code}{linkedProject?.clientName ? ` · ${linkedProject.clientName}` : ""}</span> : null}
                        {referenceType === "Proposal" ? <span>Proposal: {item.proposal_code}{linkedProposal?.clientName ? ` · ${linkedProposal.clientName}` : ""}</span> : null}
                        {referenceType === "None" ? <span>General task</span> : null}
                        {referenceType === "Project" && item.workflow_id ? (
                          <span>Workflow: {linkedWorkflow ? `${linkedWorkflow.serviceName} · ${linkedWorkflow.status}` : "Linked service unavailable"}</span>
                        ) : null}
                        {referenceType === "Project" && !item.workflow_id ? <span>Workflow: not linked</span> : null}
                        {item.automation_source === "Bill Issued" ? <span>⚙ Automatic from issued bill · {item.workflow_stage || "Service"}</span> : null}
                        {item.dependency_todo_code ? <span>Must follow: {items.find((row) => row.todo_code === item.dependency_todo_code)?.title || item.dependency_todo_code}</span> : null}
                        {item.is_delivery_step ? <span style={{ color: "var(--lv-danger)", fontWeight: 850 }}>🔒 Final file delivery requires verified full payment</span> : null}
                        {assignedEmployee ? <span>Assigned: {assignedEmployee.employeeCode} · {assignedEmployee.name}</span> : item.assigned_to ? <span>Assigned: {item.assigned_to}</span> : <span>Unassigned</span>}
                        {isOverdue(item) ? <span className={styles.overdueText}>Overdue</span> : null}
                      </div>
                      <div className={styles.cardActions}>
                        <select aria-label={`Status for ${item.title}`} value={item.status} disabled={busy || bulkBusy} onChange={(event) => void changeStatus(item, event.target.value as TodoStatus)}>
                          <option>To Do</option><option>In Progress</option><option>Done</option>
                        </select>
                        <button type="button" onClick={() => startEdit(item)} disabled={busy || bulkBusy}>Edit</button>
                        <button className={styles.dangerButton} type="button" onClick={() => void remove(item)} disabled={busy || bulkBusy}>Delete</button>
                      </div>
                      {referenceType === "Project" ? (
                        <div className={styles.workflowActions}>
                          <a href="/admin/project-operations/by-project">View Workflow</a>
                          {item.workflow_id && linkedWorkflow ? (
                            <button
                              className={styles.workflowPrimary}
                              type="button"
                              disabled={busy || bulkBusy || (item.status === "Done" && workflowDone)}
                              onClick={() => void completeWithWorkflow(item)}
                            >
                              {workflowDone ? (item.status === "Done" ? "Workflow completed" : "Complete To Do") : item.status === "Done" ? "Update Workflow" : "Complete + Workflow"}
                            </button>
                          ) : null}
                          {item.workflow_id && item.status !== "Done" ? (
                            <button type="button" disabled={busy || bulkBusy} onClick={() => void changeStatus(item, "Done")}>Complete only</button>
                          ) : null}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
                {!columnItems.length ? <div className={styles.columnEmpty}>Nothing here</div> : null}
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
