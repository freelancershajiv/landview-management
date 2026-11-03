"use client";

import { useMemo, useState } from "react";

export type BulkTask = {
  todo_code: string;
  title: string;
  status: string;
  updated_at?: string;
  workflow_id?: string | null;
};
export type BulkEmployee = { id: string; employeeCode: string; name: string };
export type BulkResult = {
  todoCode: string;
  status: "ready" | "updated" | "skipped" | "conflict" | "error";
  message: string;
};
type Response = {
  phase: "preview" | "apply";
  operation: string;
  description: string;
  results: BulkResult[];
  summary: { total: number; ready: number; updated: number; skipped: number; conflicts: number; failed: number };
  warnings: string[];
  workflowUnchanged: boolean;
};
type Props = {
  selected: BulkTask[];
  employees: BulkEmployee[];
  disabled?: boolean;
  onApplied: (results: BulkResult[]) => void;
  onBusyChange?: (busy: boolean) => void;
};
type Operation = "assign" | "priority" | "deadline" | "complete";
const MAX_ITEMS = 25;
const css = [
  ".tb-shell{margin:12px 0 18px;border:1px solid #d8dde3;border-radius:14px;background:#fff;color:#202831;overflow:hidden}",
  ".tb-shell *{box-sizing:border-box}",
  ".tb-heading{padding:14px 16px;background:#f6f7f9;border-bottom:1px solid #e1e5e9;display:flex;align-items:center;justify-content:space-between;gap:10px}",
  ".tb-heading strong{font-size:13px}.tb-heading span{display:block;font-size:11px;color:#64717c;margin-top:4px}",
  ".tb-count{background:#fbe9eb;border:1px solid #f0c8cb;color:#a51d25;padding:6px 10px;border-radius:999px;font-weight:900;font-size:11px;white-space:nowrap}",
  ".tb-body{padding:15px 16px}.tb-description{font-size:11px;color:#607080;margin:0;line-height:1.5}",
  ".tb-samples{display:flex;flex-wrap:wrap;gap:6px;margin:11px 0 14px}.tb-samples span{background:#f4f5f7;border:1px solid #e0e4e8;border-radius:7px;font-size:10px;font-weight:750;color:#40515b;padding:5px 8px}",
  ".tb-controls{display:flex;flex-wrap:wrap;gap:10px;align-items:end}",
  ".tb-field{display:grid;gap:6px;min-width:150px;flex:1 1 175px;font-size:10px;font-weight:850;color:#53606b}",
  ".tb-field select,.tb-field input{width:100%;min-height:37px;border:1px solid #d8dfe4;border-radius:8px;padding:7px 9px;background:#fff;color:#202831;font-size:12px}",
  ".tb-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:15px}",
  ".tb-button{min-height:37px;padding:7px 13px;background:#fff;color:#24323c;border:1px solid #ccd4db;font-size:11px;font-weight:900;border-radius:8px;cursor:pointer}",
  ".tb-button.primary{color:#fff;background:#a51d25;border-color:#a51d25}.tb-button:disabled{opacity:.45;cursor:default}",
  ".tb-caution{font-size:10px;line-height:1.5;color:#7a4b27;margin:12px 0 0}",
  ".tb-result{margin-top:13px;padding:12px;border:1px solid #e0e4e9;border-radius:10px;background:#fafbfc}",
  ".tb-result h4{font-size:12px;margin:0 0 5px}.tb-result p{margin:0;font-size:11px;color:#596875;line-height:1.5}",
  ".tb-items{margin-top:9px;max-height:210px;overflow-y:auto;border-top:1px solid #e7ebef}.tb-items div{display:flex;justify-content:space-between;gap:9px;align-items:start;font-size:10px;border-bottom:1px solid #edf0f2;padding:7px 0}",
  ".tb-items strong{font-size:10px}.tb-items em{font-size:10px;font-style:normal;color:#65717a}.tb-items .ok{color:#146b46}.tb-items .bad{color:#aa232b}",
  ".tb-error{color:#9d2229;font-size:11px;padding:10px 11px;border-radius:8px;background:#fef0f1;margin-top:10px}",
  ".tb-note{font-size:10px;color:#67727e;margin:9px 0 0}",
  "@media(max-width:700px){.tb-heading{flex-direction:column;align-items:flex-start}.tb-body{padding:12px}.tb-controls{display:grid;grid-template-columns:1fr 1fr}.tb-field{min-width:0}.tb-field.wide{grid-column:1/-1}.tb-actions .tb-button{flex:1 1 130px}}",
].join("");

async function send(input: Record<string, unknown>): Promise<Response> {
  const response = await fetch("/api/admin/todo/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
    credentials: "same-origin",
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Bulk action failed."));
  return json.data as Response;
}

export default function AdminTodoBulkActions({ selected, employees, disabled = false, onApplied, onBusyChange }: Props) {
  const [operation, setOperation] = useState<Operation>("assign");
  const [employeeId, setEmployeeId] = useState("");
  const [priority, setPriority] = useState("Normal");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [busy, setBusy] = useState<"" | "preview" | "apply">("");
  const [result, setResult] = useState<Response | null>(null);
  const [previewKey, setPreviewKey] = useState("");
  const [error, setError] = useState("");

  const items = useMemo(
    () => selected.map(item => ({ todoCode: item.todo_code, expectedUpdatedAt: item.updated_at || "" })),
    [selected],
  );
  const payload = useMemo(() => ({
    operation,
    items,
    ...(operation === "assign" ? { assignedEmployeeId: employeeId } : {}),
    ...(operation === "priority" ? { priority } : {}),
    ...(operation === "deadline" ? { dueDate, dueTime } : {}),
  }), [operation, items, employeeId, priority, dueDate, dueTime]);
  const signature = JSON.stringify(payload);
  const isPreviewCurrent = result?.phase === "preview" && previewKey === signature;
  const canApply = isPreviewCurrent && (result?.summary.ready || 0) > 0 && !busy && !disabled;

  async function runPreview() {
    if (busy || disabled || !selected.length || selected.length > MAX_ITEMS) return;
    if (operation === "deadline" && !dueDate && dueTime) { setError("Clear the time when clearing a deadline."); return; }
    setBusy("preview");
    onBusyChange?.(true);
    setError("");
    setResult(null);
    setPreviewKey("");
    try {
      const response = await send({ phase: "preview", ...payload });
      setResult(response);
      setPreviewKey(signature);
    } catch (err) { setError(err instanceof Error ? err.message : "Preview failed."); }
    finally { setBusy(""); onBusyChange?.(false); }
  }

  async function runApply() {
    if (!canApply || !result) return;
    const ready = result.summary.ready;
    const withWorkflow = selected.filter(item => item.workflow_id).length;
    const operationName = operation === "complete"
      ? "complete"
      : operation === "deadline" ? "change deadlines for"
      : operation === "assign" ? "assign" : "change priorities for";
    const warning = operation === "complete" && withWorkflow
      ? "\n" + withWorkflow + " selected To Do(s) are linked to Workflow. Their Workflow statuses will NOT change."
      : "";
    if (!window.confirm("Confirm bulk action: " + operationName + " " + ready + " eligible To Do(s)?" + warning + "\n\nOnly eligible tasks will be modified. Conflicts will be reported separately.")) return;
    setBusy("apply");
    onBusyChange?.(true);
    setError("");
    try {
      const response = await send({ phase: "apply", ...payload });
      setResult(response);
      setPreviewKey("");
      onApplied(response.results);
    } catch (err) { setError(err instanceof Error ? err.message : "Bulk action failed."); }
    finally { setBusy(""); onBusyChange?.(false); }
  }

  const view = result && (result.phase === "apply" || isPreviewCurrent) ? result : null;
  return <section className="tb-shell" aria-label="Bulk To Do actions">
    <style>{css}</style>
    <div className="tb-heading">
      <div><strong>Bulk To Do Actions</strong><span>Select open tasks, preview all changes, and confirm before applying.</span></div>
      <span className="tb-count">{selected.length} selected / {MAX_ITEMS} max</span>
    </div>
    <div className="tb-body">
      {selected.length === 0
        ? <p className="tb-description">Use the checkbox on any open task, or choose “Select matching open” above the board.</p>
        : <>
          <div className="tb-samples">
            {selected.slice(0, 8).map(item => <span key={item.todo_code}>{item.todo_code}</span>)}
            {selected.length > 8 && <span>+{selected.length - 8} more</span>}
          </div>
          <div className="tb-controls">
            <label className="tb-field wide">Action
              <select disabled={Boolean(busy) || disabled} value={operation} onChange={e => setOperation(e.target.value as Operation)}>
                <option value="assign">Assign / Unassign</option>
                <option value="priority">Set priority</option>
                <option value="deadline">Change deadline</option>
                <option value="complete">Mark Done (To Do only)</option>
              </select>
            </label>
            {operation === "assign" && <label className="tb-field wide">Employee
              <select disabled={Boolean(busy) || disabled} value={employeeId} onChange={e => setEmployeeId(e.target.value)}>
                <option value="">Unassign selected tasks</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.employeeCode} · {emp.name}</option>)}
              </select>
            </label>}
            {operation === "priority" && <label className="tb-field">Priority
              <select disabled={Boolean(busy) || disabled} value={priority} onChange={e => setPriority(e.target.value)}>
                <option>Low</option><option>Normal</option><option>High</option><option>Urgent</option>
              </select>
            </label>}
            {operation === "deadline" && <>
              <label className="tb-field">Due date (blank to clear)
                <input type="date" value={dueDate} disabled={Boolean(busy) || disabled} onChange={e => { setDueDate(e.target.value); if (!e.target.value) setDueTime(""); }}/>
              </label>
              <label className="tb-field">Due time · Bangladesh
                <input type="time" value={dueTime} disabled={Boolean(busy) || disabled || !dueDate} onChange={e => setDueTime(e.target.value)}/>
              </label>
            </>}
          </div>
          <div className="tb-actions">
            <button type="button" className="tb-button" disabled={Boolean(busy) || disabled} onClick={() => void runPreview()}>
              {busy === "preview" ? "Checking…" : "Preview changes"}
            </button>
            <button type="button" className="tb-button primary" disabled={!canApply} onClick={() => void runApply()}>
              {busy === "apply" ? "Applying…" : "Apply to " + (isPreviewCurrent ? result?.summary.ready || 0 : 0) + " tasks"}
            </button>
          </div>
          {operation === "complete" && <p className="tb-caution">Only the To Do status changes. Linked Workflow services remain unchanged, even when the To Do is marked Done.</p>}
          {operation === "deadline" && !dueDate && <p className="tb-caution">Leaving the date blank clears deadlines and turns off those tasks' scheduled reminders.</p>}
        </>}
      {error && <div className="tb-error" role="alert">{error}</div>}
      {view && <div className="tb-result" role="status" aria-live="polite">
        <h4>{view.phase === "preview" ? "Preview — no changes made" : "Bulk action results"}</h4>
        <p>
          {view.phase === "preview"
            ? view.summary.ready + " ready · " + view.summary.skipped + " unchanged · " + view.summary.conflicts + " conflicts"
            : view.summary.updated + " updated · " + view.summary.skipped + " unchanged · " + view.summary.conflicts + " conflicts · " + view.summary.failed + " errors"}
        </p>
        <div className="tb-items">
          {view.results.map(r => <div key={r.todoCode}>
            <strong>{r.todoCode}</strong>
            <em className={r.status === "error" || r.status === "conflict" ? "bad" : r.status === "updated" || r.status === "ready" ? "ok" : ""}>
              {r.status}: {r.message}
            </em>
          </div>)}
        </div>
        {view.warnings.length > 0 && <p className="tb-note">{view.warnings.join(" · ")}</p>}
      </div>}
      <p className="tb-note">Limit: 25 tasks per batch. Changes are applied per task, so partial results are possible; conflicting tasks are never silently overwritten.</p>
    </div>
  </section>;
}
