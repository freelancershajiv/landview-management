/** Read-only interpretation of existing To Do and linked service-workflow records.
 * No synthetic steps or manually inferred file custody. */
export type TrackedTodo = {
  todoCode: string;
  title: string;
  status: "To Do" | "In Progress" | "Done";
  projectCode?: string;
  proposalCode?: string;
  workflowId?: string;
  workflowService?: string;
  workflowStatus?: string;
  workflowStage?: string;
  assignedTo?: string;
  employeeName?: string;
  dueDate?: string;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string;
  checklist?: { total: number; completed: number };
  dependencyTodoCode?: string;
  dependencyBlocker?: string;
  deliveryStep?: boolean;
  reviewRequired?: boolean;
  reviewState?: string;
};
export type FileProgress = {
  key: string;
  service: string;
  linked: boolean;
  workflowStatus: string;
  current: TrackedTodo | null;
  next: TrackedTodo | null;
  tasks: TrackedTodo[];
  completed: number;
  percent: number;
  state: string;
  latestUpdate: string;
};

const IDENTIFIABLE_SERVICE = /^(architectur|structur|3d |3d design|electri|plumb|municipal|plan approval|district vetting|fire service|fire safety|design books|estimate|re.design)/i;
function manualService(title: string): string {
  const prefix = title.split(":")[0]?.trim() || "";
  return prefix && prefix.length <= 90 && IDENTIFIABLE_SERVICE.test(prefix) ? prefix : "Additional project tasks";
}
function normalize(text: string) { return text.trim().toLowerCase().replace(/\s+/g, " "); }
export function taskProgressValue(task: TrackedTodo): number {
  if (task.status === "Done") return 1;
  const steps = task.checklist;
  if (!steps || steps.total <= 0) return 0;
  return Math.max(0, Math.min(.95, steps.completed / steps.total));
}
export function fileProgressPercent(tasks: readonly TrackedTodo[]): number {
  if (!tasks.length) return 0;
  return Math.round(tasks.reduce((n, task) => n + taskProgressValue(task), 0) / tasks.length * 100);
}
function orderedSteps(tasks: TrackedTodo[]): TrackedTodo[] {
  const earliest = [...tasks].sort((a,b) =>
    (a.dueDate || "9999-99-99").localeCompare(b.dueDate || "9999-99-99") ||
    (a.createdAt || "").localeCompare(b.createdAt || "") ||
    a.todoCode.localeCompare(b.todoCode)
  );
  const byCode = new Map(tasks.map(task => [task.todoCode.toUpperCase(), task]));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const result: TrackedTodo[] = [];
  function add(task: TrackedTodo) {
    const code = task.todoCode.toUpperCase();
    if (visited.has(code) || visiting.has(code)) return;
    visiting.add(code);
    const predecessor = byCode.get((task.dependencyTodoCode || "").toUpperCase());
    if (predecessor) add(predecessor);
    visiting.delete(code);
    visited.add(code);
    result.push(task);
  }
  earliest.forEach(add);
  return result;
}
export function stepState(task: TrackedTodo): string {
  if (task.status === "Done") return "Done";
  if (task.reviewState === "submitted") return "For review";
  if (task.reviewState === "revision_requested") return "Revision needed";
  if (task.status === "In Progress") return "In progress";
  if (task.dependencyBlocker) return "Waiting";
  return "Not started";
}
function fileState(current: TrackedTodo | null): string {
  if (!current) return "All steps completed";
  if (current.reviewState === "submitted") return "Awaiting management review";
  if (current.reviewState === "revision_requested") return "Revision requested";
  if (current.status === "In Progress") return "In progress";
  if (current.dependencyBlocker) return "Waiting for preceding task";
  return "Next step not started";
}
export function buildFileProgress(tasks: readonly TrackedTodo[]): FileProgress[] {
  const groups = new Map<string, { service: string; linked: boolean; tasks: TrackedTodo[] }>();
  for (const task of tasks) {
    const service = (task.workflowService || "").trim() || manualService(task.title);
    const key = task.workflowId?.trim() || "manual:" + normalize(service);
    const group = groups.get(key) || { service, linked: Boolean(task.workflowId && task.workflowService), tasks: [] };
    group.tasks.push(task);
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key,group]) => {
    const ordered = orderedSteps(group.tasks);
    const current = ordered.find(task => task.status === "In Progress") ||
      ordered.find(task => task.status !== "Done") || null;
    const next = current ? ordered.slice(ordered.indexOf(current) + 1).find(task => task.status !== "Done") || null : null;
    const completed = ordered.filter(task => task.status === "Done").length;
    return {
      key,
      service: group.service,
      linked: group.linked,
      workflowStatus: ordered.find(task => task.workflowStatus)?.workflowStatus || "",
      current,
      next,
      tasks: ordered,
      completed,
      percent: fileProgressPercent(ordered),
      state: fileState(current),
      latestUpdate: ordered.map(task => task.updatedAt || task.completedAt || "")
        .filter(Boolean).sort().at(-1) || "",
    };
  }).sort((a,b) => Number(Boolean(a.current)) * -1 - Number(Boolean(b.current)) * -1 ||
    a.service.localeCompare(b.service));
}
