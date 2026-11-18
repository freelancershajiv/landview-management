"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { workItemHref, workScope, workScopeQuery, workTaskHref, type WorkScope } from "@/lib/work-task-links";

type Task = { todo_code: string; title: string; status: string; priority: string; due_date?: string; due_time?: string; assigned_to?: string; review_state?: string; is_delivery_step?: boolean };
function deadline(task: Task) {
  return task.due_date ? Date.parse(task.due_date + "T" + (task.due_time?.slice(0,5) || "23:59") + ":00+06:00") : Infinity;
}
function Panel({ scope }: { scope: WorkScope }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setTasks(null); setError("");
    async function load() {
      try {
        const response = await fetch("/api/admin/todo?" + workScopeQuery(scope), { cache: "no-store", credentials: "same-origin", signal: controller.signal });
        const json = await response.json();
        if (!response.ok || !json?.success || !Array.isArray(json.data)) throw new Error(json?.error || "Could not load linked tasks.");
        if (active) setTasks(json.data);
      } catch (err) { if (active) setError(err instanceof Error ? err.message : "Could not load linked tasks."); }
    }
    void load();
    return () => { active = false; controller.abort(); };
  }, [scope.type, scope.code, refresh]); // primitive reference identity
  const open = (tasks || []).filter(task => task.status !== "Done");
  const overdue = open.filter(task => deadline(task) < Date.now()).length;
  const review = open.filter(task => task.review_state === "submitted").length;
  const ordered = [...open].sort((a,b) => deadline(a) - deadline(b) || a.todo_code.localeCompare(b.todo_code));
  return <section className="linked-work-panel">
    <style>{".linked-work-panel{margin:0 0 14px;padding:14px 16px;background:var(--lv-surface-panel);color:var(--lv-text-primary);border:1px solid var(--lv-border-default);border-radius:12px}.linked-work-top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.linked-work-top h2{margin:0;font-size:17px}.linked-work-top p,.linked-work-summary{margin:5px 0 0;font-size:12px;color:var(--lv-text-secondary)}.linked-work-actions{display:flex;gap:8px;flex-wrap:wrap}.linked-work-actions a,.linked-work-actions button{display:inline-flex;align-items:center;padding:8px 11px;min-height:36px;border:1px solid var(--lv-border-default);background:var(--lv-surface-muted);color:var(--lv-text-primary);border-radius:8px;font-size:12px;text-decoration:none;cursor:pointer}.linked-work-actions a.primary{background:var(--lv-brand-primary);color:var(--lv-text-inverse);border-color:var(--lv-brand-border)}.linked-work-list{margin:9px 0 0;display:grid;gap:0}.linked-work-list a{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--lv-border-subtle);color:var(--lv-text-primary);text-decoration:none;font-size:13px}.linked-work-list small{color:var(--lv-text-secondary);font-size:11px;display:block;margin-top:4px}.linked-work-list a:hover strong{color:var(--lv-brand-text)}@media(max-width:600px){.linked-work-panel{padding:12px}.linked-work-list a{align-items:flex-start;flex-direction:column;gap:4px}}"}</style>
    <div className="linked-work-top"><div><h2>Work Management</h2><p>Daily assignments for {scope.code}; separate from official lifecycle requirements.</p></div>
      <div className="linked-work-actions"><Link href={workTaskHref(scope)}>All linked tasks</Link><Link className="primary" href={workTaskHref(scope, "New task — " + scope.code)}>+ New task</Link><button type="button" onClick={() => setRefresh(n => n + 1)}>Refresh</button></div></div>
    {error && <p role="alert" className="linked-work-summary">{error}</p>}
    {!error && tasks === null && <p className="linked-work-summary" role="status">Loading linked work…</p>}
    {tasks !== null && <><p className="linked-work-summary">{open.length} open · {overdue} overdue · {review} for review · {tasks.length - open.length} completed{tasks.length >= 5000 ? " · display limit reached" : ""}</p>
    {ordered.length ? <div className="linked-work-list">{ordered.slice(0,5).map(task => <Link key={task.todo_code} href={workItemHref(task.todo_code)}><span><strong>{task.title}</strong><small>{task.assigned_to || "Unassigned"} · {task.todo_code}</small></span><span>{task.review_state === "submitted" ? "For review" : task.status}<small>{task.due_date || "No deadline"}{task.is_delivery_step ? " · Payment verification" : ""}</small></span></Link>)}</div> : <p className="linked-work-summary">No open daily tasks linked to this record.</p>}</>}
  </section>;
}
export default function LinkedWorkPanel({ type, code }: { type: "project" | "proposal"; code?: string }) {
  const params = useParams<{ projectId?: string; proposalId?: string }>();
  const scope = workScope(type, code || (type === "project" ? params?.projectId : params?.proposalId));
  return scope ? <Panel key={scope.type + scope.code} scope={scope}/> : null;
}
