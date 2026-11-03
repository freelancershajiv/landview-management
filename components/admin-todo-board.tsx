"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import styles from "@/app/admin/todo/todo.module.css";

type TodoStatus = "To Do" | "In Progress" | "Done";
type TodoPriority = "Low" | "Normal" | "High" | "Urgent";

type TodoItem = {
  id?: string;
  todo_code: string;
  title: string;
  description?: string | null;
  status: TodoStatus;
  priority: TodoPriority;
  due_date?: string | null;
  project_code?: string | null;
  assigned_to?: string | null;
  created_by?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
};

type Draft = {
  title: string;
  description: string;
  status: TodoStatus;
  priority: TodoPriority;
  dueDate: string;
  projectCode: string;
  assignedTo: string;
};

const EMPTY_DRAFT: Draft = {
  title: "",
  description: "",
  status: "To Do",
  priority: "Normal",
  dueDate: "",
  projectCode: "",
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

export default function AdminTodoBoard() {
  const [items, setItems] = useState<TodoItem[]>([]);
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
      setItems(await request<TodoItem[]>("GET"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load To Do items.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => [item.title, item.description, item.project_code, item.assigned_to, item.priority, item.status]
      .some((value) => String(value || "").toLowerCase().includes(query)));
  }, [items, search]);

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
      projectCode: item.project_code || "",
      assignedTo: item.assigned_to || "",
    });
    setNotice("");
    setError("");
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.title.trim() || busy) return;
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
        projectCode: draft.projectCode,
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
        item: {
          title: item.title,
          description: item.description || "",
          status: nextStatus,
          priority: item.priority,
          dueDate: item.due_date || "",
          projectCode: item.project_code || "",
          assignedTo: item.assigned_to || "",
        },
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update status.");
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
          <p>A separate work list for reminders and internal tasks. Nothing here changes Project Workflow.</p>
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
            <span>Project ID (optional)</span>
            <input value={draft.projectCode} onChange={(event) => setDraft((prev) => ({ ...prev, projectCode: event.target.value }))} placeholder="e.g. LV-209" maxLength={80} />
          </label>
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
          <button className={styles.primaryButton} type="submit" disabled={busy || !draft.title.trim()}>
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
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, project, assignee…" />
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
                {columnItems.map((item) => (
                  <article className={`${styles.todoCard} ${isOverdue(item) ? styles.overdueCard : ""}`} key={item.todo_code}>
                    <div className={styles.cardTopline}>
                      <span className={`${styles.priority} ${styles[`priority${item.priority}`] || ""}`}>{item.priority}</span>
                      <span className={styles.code}>{item.todo_code}</span>
                    </div>
                    <h4>{item.title}</h4>
                    {item.description ? <p className={styles.description}>{item.description}</p> : null}
                    <div className={styles.metaGrid}>
                      <span className={isOverdue(item) ? styles.overdueText : ""}>Due: {dueLabel(item.due_date)}</span>
                      {item.project_code ? <span>Project: {item.project_code}</span> : null}
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
                  </article>
                ))}
                {!columnItems.length ? <div className={styles.columnEmpty}>Nothing here</div> : null}
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
