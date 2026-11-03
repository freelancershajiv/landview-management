"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

type Task = { todoCode: string; title: string; status: string; priority: string; projectCode: string; proposalCode: string; assignedTo: string; dueDate: string; dueTime: string };
type Comment = { id: string; body: string; author_name?: string | null; author_role?: string | null; created_at: string };
type Attachment = { id: string; file_name: string; content_type?: string | null; size_bytes: number; uploaded_by_name?: string | null; uploaded_by_role?: string | null; created_at: string; canDelete?: boolean };
type Activity = { id: string; action: string; outcome: string; actorName: string; actorRole: string; createdAt: string; before?: unknown; after?: unknown; details?: Record<string, unknown>; source?: string };
type Detail = { todo: Task; comments: Comment[]; attachments: Attachment[]; activity: Activity[] };

type Props = { mode: "admin" | "employee" };

function text(value: unknown) { return String(value ?? "").trim(); }
function when(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value || "—";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(date);
}
function bytes(value: number) {
  const n = Number(value || 0);
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
function taskRef(task?: Task | null) {
  if (!task) return "";
  return task.projectCode || task.proposalCode || "General";
}
function actionLabel(action: string) {
  const map: Record<string, string> = {
    todo_created: "To Do created",
    employee_todo_status_update: "Employee changed To Do status",
    todo_complete_with_workflow: "To Do + Workflow completed",
    todo_advance_linked_workflow: "Workflow advanced",
    todo_finish_linked_workflow: "To Do + Workflow finished",
    todo_comment_added: "Comment added",
    todo_attachment_added: "Attachment added",
    todo_attachment_deleted: "Attachment removed",
    todo_collaboration_update: "Collaboration action failed",
    todo_linked_workflow_update: "Workflow action failed",
  };
  return map[action] || action.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
function activityNote(item: Activity) {
  const details = item.details || {};
  const after = (item.after && typeof item.after === "object" ? item.after : {}) as Record<string, unknown>;
  const before = (item.before && typeof item.before === "object" ? item.before : {}) as Record<string, unknown>;
  if (details.fileName) return String(details.fileName);
  if (details.service) return [details.service, after.workflowStatus || details.workflowStatus].filter(Boolean).join(" · ");
  if (before.status || after.status) return `${before.status || "—"} → ${after.status || "—"}`;
  if (before.todoStatus || after.todoStatus) return `${before.todoStatus || "—"} → ${after.todoStatus || "—"}`;
  return "";
}

async function api(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "To Do collaboration request failed."));
  return json.data;
}

export default function TodoCollaborationCenter({ mode }: Props) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadTasks() {
    setLoading(true); setError("");
    try {
      const data = await api("/api/todo/collaboration") as { tasks: Task[] };
      const rows = data.tasks || [];
      setTasks(rows);
      setSelected((current) => current && rows.some((item) => item.todoCode === current) ? current : rows[0]?.todoCode || "");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load To Dos."); }
    finally { setLoading(false); }
  }

  async function loadDetail(code = selected, silent = false) {
    if (!code) { setDetail(null); return; }
    if (!silent) setLoading(true);
    setError("");
    try { setDetail(await api(`/api/todo/collaboration?todoCode=${encodeURIComponent(code)}`) as Detail); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load collaboration details."); }
    finally { if (!silent) setLoading(false); }
  }

  useEffect(() => { void loadTasks(); }, []);
  useEffect(() => { if (selected) void loadDetail(selected); else setDetail(null); }, [selected]);

  const selectedTask = useMemo(() => tasks.find((item) => item.todoCode === selected) || null, [tasks, selected]);

  async function addComment(event: FormEvent) {
    event.preventDefault();
    if (!selected || !comment.trim() || busy) return;
    setBusy("comment"); setError(""); setNotice("");
    try {
      await api("/api/todo/collaboration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "comment", todoCode: selected, body: comment.trim() }) });
      setComment(""); setNotice("Comment added."); await loadDetail(selected, true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not add comment."); }
    finally { setBusy(""); }
  }

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!selected || !file || busy) return;
    setBusy("upload"); setError(""); setNotice("");
    try {
      const form = new FormData(); form.set("todoCode", selected); form.set("file", file);
      await api("/api/todo/collaboration", { method: "POST", body: form });
      setFile(null); const input = document.getElementById(`todo-file-${mode}`) as HTMLInputElement | null; if (input) input.value = "";
      setNotice("Attachment uploaded."); await loadDetail(selected, true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not upload attachment."); }
    finally { setBusy(""); }
  }

  async function removeAttachment(item: Attachment) {
    if (!selected || busy || !item.canDelete || !window.confirm(`Remove “${item.file_name}”?`)) return;
    setBusy(`delete:${item.id}`); setError(""); setNotice("");
    try {
      await api("/api/todo/collaboration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "deleteAttachment", todoCode: selected, id: item.id }) });
      setNotice("Attachment removed."); await loadDetail(selected, true);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not remove attachment."); }
    finally { setBusy(""); }
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) { setFile(event.target.files?.[0] || null); }

  return <section className="tc-shell">
    <style>{`
      .tc-shell{margin:${mode === "admin" ? "18px 28px 0" : "18px 0 0"};border:1px solid var(--lv-border-default);border-radius:16px;background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm);overflow:hidden;color:var(--lv-text-primary)}.tc-shell *{box-sizing:border-box}
      .tc-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:18px 20px;border-bottom:1px solid var(--lv-border-default);background:var(--lv-surface-muted)}.tc-head h2{margin:0;font-size:19px}.tc-head p{margin:5px 0 0;color:var(--lv-text-secondary);font-size:11px;line-height:1.5}.tc-select{min-width:280px;max-width:460px;width:42%;min-height:40px;padding:0 11px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-weight:800}
      .tc-context{padding:10px 18px;border-bottom:1px solid var(--lv-border-subtle);font-size:10px;color:var(--lv-text-secondary)}.tc-context strong{color:var(--lv-text-strong)}
      .tc-msg{margin:12px 16px 0;padding:9px 10px;border-radius:8px;font-size:10px;font-weight:800}.tc-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.tc-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}
      .tc-grid{display:grid;grid-template-columns:1.05fr .95fr 1.15fr;gap:0;border-top:1px solid var(--lv-border-subtle);margin-top:12px}.tc-panel{min-width:0;padding:16px;border-right:1px solid var(--lv-border-default)}.tc-panel:last-child{border-right:0}.tc-panel h3{margin:0 0 10px;font-size:13px}.tc-empty{padding:18px 8px;text-align:center;color:var(--lv-text-muted);font-size:10px}
      .tc-comment-form textarea{width:100%;min-height:74px;padding:9px 10px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);resize:vertical}.tc-form-row{display:flex;gap:7px;align-items:center;margin-top:7px}.tc-btn{min-height:33px;padding:0 10px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:10px;font-weight:900;cursor:pointer}.tc-btn.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.tc-btn.danger{color:var(--lv-danger)}.tc-btn:disabled{opacity:.5;cursor:not-allowed}
      .tc-list{display:grid;gap:8px;margin-top:12px;max-height:430px;overflow:auto}.tc-comment,.tc-file,.tc-activity{padding:10px;border:1px solid var(--lv-border-subtle);border-radius:8px;background:var(--lv-surface-muted)}.tc-comment p{margin:0;font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere}.tc-meta{margin-top:6px;color:var(--lv-text-muted);font-size:9px}.tc-file{display:flex;gap:8px;align-items:center;justify-content:space-between}.tc-file-main{min-width:0}.tc-file-main a{display:block;color:var(--lv-brand-primary);font-size:10px;font-weight:900;text-decoration:none;overflow-wrap:anywhere}.tc-file-main span{display:block;margin-top:4px;color:var(--lv-text-muted);font-size:9px}.tc-upload input{width:100%;font-size:10px}.tc-help{margin-top:6px;color:var(--lv-text-muted);font-size:9px;line-height:1.4}
      .tc-activity strong{display:block;font-size:10px}.tc-activity span{display:block;margin-top:4px;color:var(--lv-text-muted);font-size:9px}.tc-activity.bad{border-color:var(--lv-danger-border);background:var(--lv-danger-soft)}
      @media(max-width:1000px){.tc-grid{grid-template-columns:1fr}.tc-panel{border-right:0;border-bottom:1px solid var(--lv-border-default)}.tc-panel:last-child{border-bottom:0}}@media(max-width:700px){.tc-shell{margin:${mode === "admin" ? "14px 12px 0" : "14px 0 0"}}.tc-head{flex-direction:column}.tc-select{min-width:0;max-width:none;width:100%}.tc-file{align-items:flex-start;flex-direction:column}.tc-file .tc-btn{width:100%}}
    `}</style>

    <header className="tc-head">
      <div><h2>Comments · Files · Activity</h2><p>{mode === "employee" ? "Discuss your assigned To Dos, attach working files, and see the task history." : "Keep discussion, working files, and the audit trail together with each To Do."}</p></div>
      <select className="tc-select" value={selected} onChange={(e) => setSelected(e.target.value)} disabled={loading || !tasks.length}>
        {!tasks.length ? <option value="">No To Dos available</option> : null}
        {tasks.map((task) => <option key={task.todoCode} value={task.todoCode}>{task.todoCode} · {task.title}</option>)}
      </select>
    </header>

    {selectedTask ? <div className="tc-context"><strong>{selectedTask.todoCode} · {selectedTask.title}</strong> · {taskRef(selectedTask)} · {selectedTask.status}{selectedTask.assignedTo ? ` · ${selectedTask.assignedTo}` : ""}</div> : null}
    {error ? <div className="tc-msg bad">{error}</div> : null}{notice ? <div className="tc-msg good">{notice}</div> : null}

    {!selected ? <div className="tc-empty">No To Do is available for collaboration.</div> : <div className="tc-grid">
      <div className="tc-panel">
        <h3>Comments {detail ? `(${detail.comments.length})` : ""}</h3>
        <form className="tc-comment-form" onSubmit={addComment}><textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={4000} placeholder="Add a comment, instruction, update or clarification…" /><div className="tc-form-row"><button className="tc-btn primary" type="submit" disabled={busy === "comment" || !comment.trim()}>{busy === "comment" ? "Adding…" : "Add comment"}</button></div></form>
        <div className="tc-list">{detail?.comments.map((item) => <div className="tc-comment" key={item.id}><p>{item.body}</p><div className="tc-meta">{item.author_name || "LAND VIEW"}{item.author_role ? ` · ${item.author_role}` : ""} · {when(item.created_at)}</div></div>)}{detail && !detail.comments.length ? <div className="tc-empty">No comments yet.</div> : null}</div>
      </div>

      <div className="tc-panel">
        <h3>Attachments {detail ? `(${detail.attachments.length})` : ""}</h3>
        <form className="tc-upload" onSubmit={upload}><input id={`todo-file-${mode}`} type="file" onChange={chooseFile} accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt,.dwg,.dxf,.zip" /><div className="tc-help">Private files · max 4 MB · PDF, images, Office, DWG/DXF, ZIP and text.</div><div className="tc-form-row"><button className="tc-btn primary" type="submit" disabled={busy === "upload" || !file}>{busy === "upload" ? "Uploading…" : "Upload file"}</button></div></form>
        <div className="tc-list">{detail?.attachments.map((item) => <div className="tc-file" key={item.id}><div className="tc-file-main"><a href={`/api/todo/attachments/${encodeURIComponent(item.id)}`}>{item.file_name}</a><span>{bytes(item.size_bytes)} · {item.uploaded_by_name || "LAND VIEW"} · {when(item.created_at)}</span></div>{item.canDelete ? <button className="tc-btn danger" type="button" disabled={busy === `delete:${item.id}`} onClick={() => void removeAttachment(item)}>{busy === `delete:${item.id}` ? "Removing…" : "Remove"}</button> : null}</div>)}{detail && !detail.attachments.length ? <div className="tc-empty">No attachments yet.</div> : null}</div>
      </div>

      <div className="tc-panel">
        <h3>Activity {detail ? `(${detail.activity.length})` : ""}</h3>
        <div className="tc-list">{detail?.activity.map((item) => <div className={`tc-activity${item.outcome === "failure" ? " bad" : ""}`} key={item.id}><strong>{actionLabel(item.action)}</strong><span>{item.actorName}{item.actorRole ? ` · ${item.actorRole}` : ""} · {when(item.createdAt)}</span>{activityNote(item) ? <span>{activityNote(item)}</span> : null}</div>)}{detail && !detail.activity.length ? <div className="tc-empty">No activity recorded yet.</div> : null}</div>
      </div>
    </div>}
  </section>;
}
