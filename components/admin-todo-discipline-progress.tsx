"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./admin-todo-discipline-progress.module.css";

type WorkType = "architectural" | "structural" | "threeD" | "electrical" | "plumbing" | "municipality" | "other";
type Task = {
  todoCode: string;
  title: string;
  status: "To Do" | "In Progress" | "Done";
  projectCode?: string;
  proposalCode?: string;
  workflowService?: string;
  employeeName?: string;
  assignedTo?: string;
  dueDate?: string;
  checklist?: { total: number; completed: number };
};
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
        <p>Compare disciplines in side-by-side columns. Each column shows its own progress and the projects and tasks underneath; percentages come from completed To Dos and checklist steps.</p>
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
      <p className={styles.scrollHint}>All disciplines fit across wide desktop screens. Open a project to see its tasks; smaller screens can scroll sideways.</p>
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
                const sorted = [...items].sort((a, b) =>
                  Number(a.status === "Done") - Number(b.status === "Done") || a.todoCode.localeCompare(b.todoCode));
                return <div key={project} className={styles.project}>
                  <div className={styles.projectHead}><span>{project}</span><span>{completionPercent(items)}%</span></div>
                  <ProgressBar label={group.label + " progress for " + project} tasks={items} />
                  <details>
                    <summary>{completed}/{items.length} tasks done · View tasks</summary>
                    <div className={styles.taskList}>
                      {sorted.map(task => <button className={styles.task} key={task.todoCode} type="button" onClick={() => onOpen(task.todoCode)}>
                        <span><strong>{task.title}</strong><small>{task.todoCode} · {task.employeeName || task.assignedTo || "Unassigned"}{task.dueDate ? " · Due " + task.dueDate : ""}</small></span>
                        <em>{task.status}</em>
                      </button>)}
                    </div>
                  </details>
                </div>;
              })}
            </div>
          </article>;
        })}
      </div>
      <p className={styles.cardSmall} style={{ marginTop: 12 }}>Work progress is calculated from recorded tasks and checklist completion. A task reaches 100% only when marked Done; site visits remain in the separate Site Visits section.</p>
    </>}
  </section>;
}