"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import styles from "@/app/admin/todo/todo.module.css";

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
  reference_type?: TodoReferenceType;
  project_code?: string | null;
  proposal_code?: string | null;
  workflow_id?: string | null;
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
  lifecyclePhase?: string;
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
  assignedTo: string;
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
  assignedTo: "",
};

const COLUMNS: Array<{ status: TodoStatus; label: string; hint: string }> = [
  { status: "To Do", label: "To Do", hint: "Not started" },
  { status: "In Progress", label: "In Progress", hint: "Being worked on" },
  { status: "Done", label: "Done", hint: "Completed" },
];

async function request<T>(method: "GET" | "POST", body?: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/admin/todo", {
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

async function loadWorkflowItems(): Promise<WorkflowItem[]> {
  const response = await fetch("/api/service-workflow?mode=project", {
    credentials: "same-origin",
    cache: "no-store",
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load Workflow services."));
  return Array.isArray(json.data?.workflows) ? json.data.workflows as WorkflowItem[] : [];
}

function isOverdue(item: TodoItem) {
  if (!item.due_date || item.status === "Done") return false;
  const due = new Date(`${item.due_date}T23:59:59`);
  return Number.isFinite(due.getTime()) && due.getTime() < Date.now();
}

function dueLabel(value?: string | null) {
  if (!value) return "No due date";
  const date = new Date(`${value}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
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
    assignedTo: item.assigned_to || "",
  };
}

function finalWorkflowStatus(workflow?: WorkflowItem) {
  if (!workflow?.statuses?.length) return "";
  return workflow.statuses[workflow.statuses.length - 1] || "";
}

export default function AdminTodoBoard() {
  const [items, setItems] = useState<TodoItem[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editingCode, setEditingCode] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [todoItems, workflowItems] = await Promise.all([
        request<TodoItem[]>("GET"),
        loadWorkflowItems(),
      ]);
      setItems(todoItems);
      setWorkflows(workflowItems);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load To Do items.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const workflowById = useMemo(() => new Map(workflows.map((workflow) => [workflow.id, workflow])), [workflows]);

  const projectWorkflows = useMemo(() => {
    if (draft.referenceType !== "Project" || !draft.referenceCode.trim()) return [];
    const projectCode = normalizeProjectCode(draft.referenceCode);
    return workflows
      .filter((workflow) => normalizeProjectCode(String(workflow.projectId || "")) === projectCode)
      .sort((a, b) => a.serviceName.localeCompare(b.serviceName));
  }, [draft.referenceCode, draft.referenceType, workflows]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => {
      const workflow = item.workflow_id ? workflowById.get(item.workflow_id) : undefined;
      return [
        item.title,
        item.description,
        item.project_code,
        item.proposal_code,
        item.reference_type,
        item.assigned_to,
        item.priority,
        item.status,
        workflow?.serviceName,
        workflow?.status,
      ].some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [items, search, workflowById]);

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
      assignedTo: item.assigned_to || "",
    });
    setNotice("");
    setError("");
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim() || busy) return;
    if (draft.referenceType !== "None" && !draft.referenceCode.trim()) {
      setError(`${draft.referenceType} ID is required when linking this To Do.`);
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
        projectCode: draft.referenceType === "Project" ? draft.referenceCode : "",
        proposalCode: draft.referenceType === "Proposal" ? draft.referenceCode : "",
        workflowId: draft.referenceType === "Project" ? draft.workflowId : "",
        assignedTo: draft.assignedTo,
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
    if (busy || item.status === nextStatus) return;
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
    if (busy || !item.workflow_id) return;
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
    if (busy || !window.confirm(`Delete “${item.title}”?`)) return;
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
    <main className={styles.page}>
      <section className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>LAND VIEW WORKSPACE</span>
          <h1>To Do</h1>
          <p>General, Project and Proposal tasks stay separate. Project To Dos can optionally link to an existing Workflow service, and Workflow only changes when you choose Complete + Workflow.</p>
        </div>
        <button className={styles.refreshButton} type="button" onClick={() => void load()} disabled={loading || busy}>
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
          {draft.referenceType !== "None" ? (
            <label>
              <span>{draft.referenceType} ID *</span>
              <input
                value={draft.referenceCode}
                onChange={(event) => setDraft((prev) => ({ ...prev, referenceCode: event.target.value, workflowId: "" }))}
                onBlur={() => draft.referenceType === "Project" && setDraft((prev) => ({ ...prev, referenceCode: normalizeProjectCode(prev.referenceCode) }))}
                placeholder={draft.referenceType === "Project" ? "e.g. LV-209" : "e.g. PROP-2026-0001"}
                maxLength={100}
                required
              />
            </label>
          ) : null}
          {draft.referenceType === "Project" && draft.referenceCode.trim() ? (
            <label>
              <span>Workflow service (optional)</span>
              <select value={draft.workflowId} onChange={(event) => setDraft((prev) => ({ ...prev, workflowId: event.target.value }))}>
                <option value="">No specific Workflow service</option>
                {projectWorkflows.map((workflow) => (
                  <option key={workflow.id} value={workflow.id}>{workflow.serviceName} · {workflow.status}</option>
                ))}
              </select>
              <small className={styles.fieldHint}>
                {projectWorkflows.length ? "Link only when this To Do should be able to update that service." : "No active Workflow services found for this Project ID."}
              </small>
            </label>
          ) : null}
          <label>
            <span>Assigned to</span>
            <input value={draft.assignedTo} onChange={(event) => setDraft((prev) => ({ ...prev, assignedTo: event.target.value }))} placeholder="Name or employee ID" maxLength={200} />
          </label>
          <label className={styles.fieldWide}>
            <span>Description</span>
            <textarea value={draft.description} onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))} placeholder="Notes, instructions, follow-up details…" rows={3} maxLength={4000} />
          </label>
        </div>
        <div className={styles.formActions}>
          <button className={styles.primaryButton} type="submit" disabled={busy || !draft.title.trim() || (draft.referenceType !== "None" && !draft.referenceCode.trim())}>
            {busy ? "Saving…" : editingCode ? "Save changes" : "Add To Do"}
          </button>
        </div>
      </form>

      {error ? <div className={styles.errorBanner} role="alert">{error}</div> : null}
      {notice ? <div className={styles.noticeBanner}>{notice}</div> : null}

      <section className={styles.toolbar}>
        <div>
          <h2>Task board</h2>
          <p>{filteredItems.length} item{filteredItems.length === 1 ? "" : "s"} shown</p>
        </div>
        <label className={styles.searchBox}>
          <span className={styles.srOnly}>Search To Do items</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, project, proposal, workflow, assignee…" />
        </label>
      </section>

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
                  return (
                    <article className={`${styles.todoCard} ${isOverdue(item) ? styles.overdueCard : ""}`} key={item.todo_code}>
                      <div className={styles.cardTopline}>
                        <span className={`${styles.priority} ${styles[`priority${item.priority}`] || ""}`}>{item.priority}</span>
                        <span className={styles.code}>{item.todo_code}</span>
                      </div>
                      <h4>{item.title}</h4>
                      {item.description ? <p className={styles.description}>{item.description}</p> : null}
                      <div className={styles.metaGrid}>
                        <span className={isOverdue(item) ? styles.overdueText : ""}>Due: {dueLabel(item.due_date)}</span>
                        {referenceType === "Project" ? <span>Project: {item.project_code}</span> : null}
                        {referenceType === "Proposal" ? <span>Proposal: {item.proposal_code}</span> : null}
                        {referenceType === "None" ? <span>General task</span> : null}
                        {referenceType === "Project" && item.workflow_id ? (
                          <span>Workflow: {linkedWorkflow ? `${linkedWorkflow.serviceName} · ${linkedWorkflow.status}` : "Linked service unavailable"}</span>
                        ) : null}
                        {referenceType === "Project" && !item.workflow_id ? <span>Workflow: not linked</span> : null}
                        {item.assigned_to ? <span>Assigned: {item.assigned_to}</span> : null}
                        {isOverdue(item) ? <span className={styles.overdueText}>Overdue</span> : null}
                      </div>
                      <div className={styles.cardActions}>
                        <select aria-label={`Status for ${item.title}`} value={item.status} disabled={busy} onChange={(event) => void changeStatus(item, event.target.value as TodoStatus)}>
                          <option>To Do</option><option>In Progress</option><option>Done</option>
                        </select>
                        <button type="button" onClick={() => startEdit(item)} disabled={busy}>Edit</button>
                        <button className={styles.dangerButton} type="button" onClick={() => void remove(item)} disabled={busy}>Delete</button>
                      </div>
                      {referenceType === "Project" ? (
                        <div className={styles.workflowActions}>
                          <a href="/admin/project-operations/by-project">View Workflow</a>
                          {item.workflow_id && linkedWorkflow ? (
                            <button
                              className={styles.workflowPrimary}
                              type="button"
                              disabled={busy || (item.status === "Done" && workflowDone)}
                              onClick={() => void completeWithWorkflow(item)}
                            >
                              {workflowDone ? (item.status === "Done" ? "Workflow completed" : "Complete To Do") : item.status === "Done" ? "Update Workflow" : "Complete + Workflow"}
                            </button>
                          ) : null}
                          {item.workflow_id && item.status !== "Done" ? (
                            <button type="button" disabled={busy} onClick={() => void changeStatus(item, "Done")}>Complete only</button>
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
