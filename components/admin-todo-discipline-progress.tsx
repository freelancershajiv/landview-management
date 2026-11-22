"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./admin-todo-discipline-progress.module.css";
import { buildFileProgress, stepState, type TrackedTodo } from "@/lib/todo-file-tracker";

type WorkType = "architectural" | "structural" | "threeD" | "electrical" | "plumbing" | "municipality" | "other";
type Task = TrackedTodo;
type Dashboard = { items: Task[]; truncated?: boolean; totalTasks?: number };
type WorkGroup = { key: WorkType; label: string };

const GROUPS: WorkGroup[] = [
  { key: "architectural", label: "Architectural" },
  { key: "structural", label: "Structural" },
  { key: "threeD", label: "3D Design" },
  { key: "electrical", label: "Electrical Design" },
  { key: "plumbing", label: "Plumbing Design" },
  { key: "municipality", label: "Municipality Works" },
  { key: "other", label: "Other Project Work" },
];

function detectWorkType(value: string): WorkType {
  const name = value.toLowerCase().replace(/[_–—-]+/g, " ");
  if (/\bmunicipal(?:ity)?\b|\bland noc\b|\bplan approval\b|\bfile pass\b|\bvetting committee\b/.test(name)) return "municipality";
  if (/\b3d\b|\b3 d\b|\brender(?:ing)?\b|\bvisuali[sz]ation\b/.test(name)) return "threeD";
  if (/\belectrical\b|\belectric\b|\bwiring\b/.test(name)) return "electrical";
  if (/\bplumbing\b|\bsanitary\b|\bdrainage\b|\bwater supply\b/.test(name)) return "plumbing";
  if (/\bstructur(?:al|e)?\b|\bfoundation design\b|\brcc design\b/.test(name)) return "structural";
  if (/\barchitectur(?:al|e)?\b|\bfloor plan\b|\belevation design\b/.test(name)) return "architectural";
  return "other";
}

function groupOf(task: Task): WorkType {
  // The explicitly linked service takes priority over words in a task title.
  return task.workflowService?.trim() ? detectWorkType(task.workflowService) : detectWorkType(task.title);
}

function projectOf(task: Task) {
  return task.projectCode?.trim() || task.proposalCode?.trim() || "General / Unassigned";
}

function shortStep(task: Task, service: string): string {
  const prefix = service + ":";
  return task.title.toLowerCase().startsWith(prefix.toLowerCase())
    ? task.title.slice(prefix.length).trim() : task.title;
}
function localDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka", day: "2-digit", month: "short", year: "numeric",
  }).format(date);
}

function taskProgress(task: Task): number {
  if (task.status === "Done") return 1;
  const checklist = task.checklist;
  if (!checklist || checklist.total <= 0) return 0;
  // Completing a checklist does not mean the parent task has passed review.
  return Math.min(0.95, Math.max(0, checklist.completed / checklist.total));
}

function completionPercent(tasks: readonly Task[]) {
  if (!tasks.length) return 0;
  return Math.round(tasks.reduce((sum, task) => sum + taskProgress(task), 0) / tasks.length * 100);
}

function ProgressBar({ label, tasks }: { label: string; tasks: readonly Task[] }) {
  const percent = completionPercent(tasks);
  return <>
    <div className={styles.track} role="progressbar" aria-label={label} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className={styles.fill} style={{ width: percent + "%" }} />
    </div>
    <div className={styles.progressHint}>
      <span>{tasks.length ? percent + "% tracked progress" : "No tracked tasks"}</span>
      <span>{tasks.filter((task) => task.status === "Done").length} / {tasks.length} tasks completed</span>
    </div>
  </>;
}

export default function AdminTodoDisciplineProgress({ onOpen }: { onOpen: (code: string) => void }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [projectFilter, setProjectFilter] = useState("");
  const [hideSidebar, setHideSidebar] = useState(true);

  useEffect(() => {
    const sync = () => setHideSidebar(Boolean(document.querySelector(".portal-admin.lv-sidebar-collapsed")));
    sync();
    window.addEventListener("landview:admin-sidebar-state", sync);
    return () => window.removeEventListener("landview:admin-sidebar-state", sync);
  }, []);

  const toggleSidebar = () => window.dispatchEvent(new CustomEvent("landview:admin-sidebar-request", {
    detail: { collapsed: !hideSidebar },
  }));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let pending = false;
    const controller = new AbortController();
    async function refresh() {
      if (!active || pending) return;
      pending = true;
      try {
        const response = await fetch("/api/admin/todo/dashboard", {
          credentials: "same-origin", cache: "no-store", signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok || !result?.success || !Array.isArray(result?.data?.items)) {
          throw new Error(result?.error || "Could not load work progress.");
        }
        if (active) {
          setData(result.data as Dashboard);
          setError("");
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load work progress.");
      } finally {
        pending = false;
        if (active) setLoading(false);
      }
    }
    const whenVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    void refresh();
    const timer = window.setInterval(whenVisible, 60000);
    window.addEventListener("focus", whenVisible);
    window.addEventListener("landview:todo:changed", whenVisible);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", whenVisible);
      window.removeEventListener("landview:todo:changed", whenVisible);
    };
  }, []);

  const tasks = data?.items || [];
  const projects = useMemo(() =>
    [...new Set(tasks.map(projectOf))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [tasks]
  );
  const scoped = useMemo(() => tasks.filter(task => !projectFilter || projectOf(task) === projectFilter), [tasks, projectFilter]);
  const grouped = useMemo(() => {
    return GROUPS.map(group => {
      const matching = scoped.filter(task => groupOf(task) === group.key);
      const byProject = new Map<string, Task[]>();
      for (const task of matching) {
        const key = projectOf(task);
        byProject.set(key, [...(byProject.get(key) || []), task]);
      }
      const projects = [...byProject.entries()].sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }));
      return { ...group, tasks: matching, projects };
    }).filter(group => group.key !== "other" || group.tasks.length > 0);
  }, [scoped]);

  const done = scoped.filter(task => task.status === "Done").length;
  return <section className={styles.tdp} aria-label="Work progress by discipline" data-work-type-board="true">
    <div className={styles.heading}>
      <div>
        <h2>Work by discipline</h2>
        <p>Compare disciplines in side-by-side columns. Each column tracks its project files through recorded workflow statuses, responsible staff, and step-by-step tasks. Progress uses completed To Dos and checklists.</p>
      </div>
      <div className={styles.controls}>
        <label>Project
          <select value={projectFilter} onChange={event => setProjectFilter(event.target.value)} aria-label="Filter work progress by project">
            <option value="">All projects</option>
            {projects.map(project => <option key={project} value={project}>{project}</option>)}
          </select>
        </label>
        <button type="button" aria-pressed={hideSidebar} onClick={toggleSidebar}>{hideSidebar ? "Show sidebar" : "Hide sidebar"}</button>
        <button type="button" onClick={() => window.dispatchEvent(new Event("landview:todo:changed"))}>Refresh</button>
      </div>
    </div>
    {error && <p className={styles.message} role="alert">{error}{data ? " Showing the last successful result." : ""}</p>}
    {data?.truncated && <p className={styles.message} role="status">Task data is limited. Percentages represent only the tasks returned, not the full history.</p>}
    {loading && !data ? <p className={styles.message} role="status">Loading work progress…</p> : !data ? <p className={styles.empty}>Work progress is unavailable. Try refreshing.</p> : <>
      <div className={styles.summary} aria-label="Task progress summary">
        <span><strong>{scoped.length}</strong> tracked tasks</span>
        <span><strong>{scoped.length - done}</strong> open</span>
        <span><strong>{done}</strong> completed</span>
        <span><strong>{completionPercent(scoped)}%</strong> overall progress</span>
      </div>
      <p className={styles.scrollHint}>All disciplines fit across wide desktop screens. Open a file's steps to inspect who is responsible and what is next; smaller screens can scroll sideways.</p>
      <div className={styles.grid} role="region" aria-label="Discipline progress columns" tabIndex={0} style={{ gridTemplateColumns: `repeat(${grouped.length}, minmax(0, 1fr))` }}>
        {grouped.map(group => {
          const count = group.tasks.length;
          const finished = group.tasks.filter(task => task.status === "Done").length;
          return <article key={group.key} className={styles.card}>
            <div className={styles.cardHeader}>
              <div><h3>{group.label}</h3><span className={styles.cardSmall}>{count ? group.projects.length + " project(s) · " + (count - finished) + " open task(s)" : "No recorded tasks"}</span></div>
              <span className={styles.number}>{count ? completionPercent(group.tasks) + "%" : "—"}</span>
            </div>
            <ProgressBar label={group.label + " progress"} tasks={group.tasks} />
            <div className={styles.projectScroller} aria-label={group.label + " projects"}>
              {count === 0 && <p className={styles.emptyColumn}>No project tasks recorded.</p>}
              {group.projects.map(([project, items]) => {
                const completed = items.filter(task => task.status === "Done").length;
                return <div key={project} className={styles.project}>
                  <div className={styles.projectHead}><span>{project}</span><span>{completionPercent(items)}%</span></div>
                  <ProgressBar label={group.label + " progress for " + project} tasks={items} />
                  <div className={styles.fileList}>
                    {buildFileProgress(items).map(file => <section key={file.key} className={styles.fileCard} aria-label={project + " " + file.service + " file progress"}>
                      <div className={styles.fileHeading}>
                        <strong title={file.service}>{file.service}</strong>
                        <span>{file.percent}%</span>
                      </div>
                      <div className={styles.fileProgressTrack} role="progressbar" aria-label={project + " " + file.service + " steps"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={file.percent}>
                        <div style={{ width: file.percent + "%" }} />
                      </div>
                      <div className={styles.fileStatusRow}>
                        <span>{file.completed}/{file.tasks.length} steps complete</span>
                        <span>{file.state}</span>
                      </div>
                      <p className={styles.fileWorkflow}>
                        <span>File status</span>
                        <strong>{file.workflowStatus || "Not recorded"}</strong>
                      </p>
                      {!file.linked && <p className={styles.fileFootnote}>No service workflow linked; tracking available To Dos only.</p>}
                      <p className={styles.fileCurrent}><span>{file.current?.status === "In Progress" ? "Working on" : file.current ? "Next action" : "Last action"}</span>
                        <strong>{file.current ? shortStep(file.current, file.service) : "All recorded tasks completed"}</strong>
                      </p>
                      {file.current && <div className={styles.fileMeta}>
                        <span>Assigned: {file.current.employeeName || file.current.assignedTo || "Unassigned"}</span>
                        {file.current.dueDate && <span>Due: {file.current.dueDate}</span>}
                        {file.current.checklist && file.current.checklist.total > 0 && <span>Checklist: {file.current.checklist.completed}/{file.current.checklist.total}</span>}
                        {file.current.reviewState === "submitted" && <span className={styles.fileAttention}>Submitted for management review</span>}
                        {file.current.reviewState === "revision_requested" && <span className={styles.fileAttention}>Revision requested</span>}
                        {file.current.dependencyBlocker && <span className={styles.fileAttention}>Dependency: {file.current.dependencyBlocker}</span>}
                        {file.current.deliveryStep && <span>Final handover requires payment clearance</span>}
                        {file.next && <span>After this: {shortStep(file.next, file.service)}</span>}
                      </div>}
                      <details className={styles.stepDisclosure}>
                        <summary>Track all {file.tasks.length} steps</summary>
                        <ol className={styles.stepList}>
                          {file.tasks.map((task, stepIndex) => <li key={task.todoCode} className={task.status === "Done" ? styles.stepDone : task.todoCode === file.current?.todoCode ? styles.stepCurrent : styles.stepPending}>
                            <button type="button" className={styles.stepButton} onClick={() => onOpen(task.todoCode)}>
                              <span className={styles.stepNumber} aria-hidden="true">{task.status === "Done" ? "✓" : stepIndex + 1}</span>
                              <span className={styles.stepContent}><strong>{shortStep(task, file.service)}</strong><small>{stepState(task)} · {task.employeeName || task.assignedTo || "Unassigned"}{task.dueDate ? " · " + task.dueDate : ""}</small></span>
                            </button>
                          </li>)}
                        </ol>
                      </details>
                      {file.latestUpdate && <small className={styles.fileUpdated}>Last recorded update: {localDate(file.latestUpdate)}</small>}
                    </section>)}
                  </div>
                </div>;
              })}
            </div>
          </article>;
        })}
      </div>
      <p className={styles.cardSmall} style={{ marginTop: 12 }}>File status comes from linked Workflow records, while the step tracker shows recorded To Dos. Assignment does not establish physical file custody. Final handover still requires verified payment; Site Visits remain separate.</p>
    </>}
  </section>;
}