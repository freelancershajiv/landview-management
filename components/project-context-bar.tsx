"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type Context = {
  projectId: string;
  ownerName: string;
  story: string;
  lifecyclePhase: string;
  identity: string;
  phases: string[];
};

async function readContext(projectId: string) {
  const response = await fetch(`/api/project-context?projectId=${encodeURIComponent(projectId)}`, {
    credentials: "same-origin",
    cache: "no-store",
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load project context."));
  return json.data as Context;
}

async function updateStatus(projectId: string, phase: string, reason: string) {
  const response = await fetch("/api/lifecycle", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "setProjectPhase", projectId, phase, reason }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not update project status."));
  return json.data;
}

export default function ProjectContextBar() {
  const params = useParams<{ projectId: string }>();
  const router = useRouter();
  const projectId = decodeURIComponent(String(params?.projectId || ""));
  const [context, setContext] = useState<Context | null>(null);
  const [phase, setPhase] = useState("");
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    if (!projectId) return;
    try {
      const next = await readContext(projectId);
      setContext(next);
      setPhase(next.lifecyclePhase);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load project context.");
    }
  }

  useEffect(() => { void load(); }, [projectId]);

  const isRollback = useMemo(() => {
    if (!context) return false;
    const current = context.phases.indexOf(context.lifecyclePhase);
    const target = context.phases.indexOf(phase);
    return current >= 0 && target >= 0 && target < current;
  }, [context, phase]);

  async function save() {
    if (!context || !phase || phase === context.lifecyclePhase || busy) return;
    if (isRollback && !reason.trim()) {
      setError("Add a reason before moving a project backward or reopening a completed project.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await updateStatus(context.projectId, phase, reason.trim());
      const previous = context.lifecyclePhase;
      await load();
      setReason("");
      setEditing(false);
      setNotice(previous === "Completed" ? `Project reopened as ${phase}.` : `Project status changed to ${phase}.`);
      router.refresh();
      window.dispatchEvent(new CustomEvent("landview:project-status-changed", { detail: { projectId: context.projectId, phase } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update project status.");
    } finally {
      setBusy(false);
    }
  }

  if (!projectId) return null;

  return <section className="pcb-shell">
    <style>{`
      .pcb-shell{margin:0 0 14px;border:1px solid var(--lv-border-default);border-radius:12px;background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm);overflow:hidden;color:var(--lv-text-primary)}
      .pcb-main{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:11px 14px}.pcb-id{min-width:0}.pcb-id small{display:block;font-size:7px;font-weight:950;letter-spacing:.1em;text-transform:uppercase;color:var(--lv-text-muted)}.pcb-id strong{display:block;margin-top:4px;font-size:13px;line-height:1.35;color:var(--lv-text-strong);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pcb-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}.pcb-status{display:inline-flex;align-items:center;min-height:30px;padding:0 10px;border-radius:999px;background:var(--lv-surface-muted);border:1px solid var(--lv-border-default);font-size:8px;font-weight:900}.pcb-status.completed{background:var(--lv-success-soft);border-color:var(--lv-success-border);color:var(--lv-success)}.pcb-btn{min-height:32px;padding:0 10px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px;font-weight:900;cursor:pointer}.pcb-btn.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.pcb-btn:disabled{opacity:.45;cursor:not-allowed}.pcb-editor{display:grid;grid-template-columns:minmax(180px,.65fr) minmax(260px,1fr) auto;gap:8px;padding:10px 14px;border-top:1px solid var(--lv-border-default);background:var(--lv-surface-muted)}.pcb-editor select,.pcb-editor input{width:100%;min-height:34px;padding:0 9px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px}.pcb-msg{padding:7px 14px;border-top:1px solid var(--lv-border-subtle);font-size:8px}.pcb-msg.bad{color:var(--lv-danger);background:var(--lv-danger-soft)}.pcb-msg.good{color:var(--lv-success);background:var(--lv-success-soft)}
      @media(max-width:760px){.pcb-main{align-items:flex-start;flex-direction:column}.pcb-actions{justify-content:flex-start}.pcb-id strong{white-space:normal}.pcb-editor{grid-template-columns:1fr}}
    `}</style>
    <div className="pcb-main">
      <div className="pcb-id"><small>Project</small><strong>{context?.identity || projectId}</strong></div>
      <div className="pcb-actions">
        {context && <span className={`pcb-status ${context.lifecyclePhase === "Completed" ? "completed" : ""}`}>{context.lifecyclePhase}</span>}
        <button className="pcb-btn" onClick={() => { setEditing((value) => !value); setError(""); setNotice(""); }} disabled={!context}>{context?.lifecyclePhase === "Completed" ? "Reopen / Change Status" : "Change Status"}</button>
      </div>
    </div>
    {editing && context && <div className="pcb-editor">
      <select value={phase} onChange={(e) => setPhase(e.target.value)}>{context.phases.map((item) => <option key={item}>{item}</option>)}</select>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={isRollback ? "Reason required for rollback / reopen" : "Reason or note (optional)"} />
      <button className="pcb-btn primary" disabled={busy || phase === context.lifecyclePhase} onClick={() => void save()}>{busy ? "Updating…" : context.lifecyclePhase === "Completed" && phase !== "Completed" ? "Reopen Project" : "Update Status"}</button>
    </div>}
    {error && <div className="pcb-msg bad">{error}</div>}
    {notice && <div className="pcb-msg good">{notice}</div>}
  </section>;
}
