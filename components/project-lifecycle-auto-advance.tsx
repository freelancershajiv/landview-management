"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type AutomationState = {
  projectId: string;
  phase: string;
  ready: boolean;
  autoEligible: boolean;
  requiresManualClose: boolean;
  nextPhase: string | null;
  blockers: string[];
  completed: number;
  total: number;
  message: string;
};

async function requestAutomation(projectId: string, method: "GET" | "POST" = "GET", body?: Record<string, unknown>) {
  const response = await fetch(
    method === "GET" ? `/api/lifecycle/auto-advance?projectId=${encodeURIComponent(projectId)}` : "/api/lifecycle/auto-advance",
    {
      method,
      credentials: "same-origin",
      cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Lifecycle automation request failed."));
  return json.data;
}

export default function ProjectLifecycleAutoAdvance() {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(String(params?.projectId || ""));
  const [state, setState] = useState<AutomationState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const attempted = useRef("");

  async function refresh() {
    if (!projectId) return;
    try {
      const next = await requestAutomation(projectId);
      setState(next);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not inspect lifecycle automation.");
    }
  }

  async function advanceReadyStage() {
    if (!projectId || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await requestAutomation(projectId, "POST", { projectId, action: "advanceReadyStage" });
      if (result?.state) setState(result.state);
      if (!result?.noOp) setNotice(`${result.fromPhase} completed. Project moved to ${result.toPhase}.`);
      window.dispatchEvent(new CustomEvent("landview:lifecycle-changed", { detail: { projectId } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not advance lifecycle.");
    } finally {
      setBusy(false);
    }
  }

  async function closeSupervision() {
    if (!projectId || busy) return;
    const confirmed = window.confirm("Confirm that the Supervision / Construction scope is complete and move this project to Handover?");
    if (!confirmed) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await requestAutomation(projectId, "POST", { projectId, action: "closeSupervision" });
      if (result?.state) setState(result.state);
      if (!result?.noOp) setNotice("Supervision closed. Project moved to Handover.");
      window.dispatchEvent(new CustomEvent("landview:lifecycle-changed", { detail: { projectId } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not close supervision.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!projectId) return;
    void refresh();
    const interval = window.setInterval(() => void refresh(), 6000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [projectId]);

  useEffect(() => {
    if (!state?.autoEligible || !state.ready || !state.nextPhase || busy) return;
    const key = `${state.projectId}:${state.phase}->${state.nextPhase}`;
    if (attempted.current === key) return;
    attempted.current = key;
    void advanceReadyStage();
  }, [state?.projectId, state?.phase, state?.ready, state?.autoEligible, state?.nextPhase, busy]);

  if (!state && !error) return null;
  if (state?.phase === "Completed" && !error && !notice) return null;

  const blockerCount = state?.blockers?.length || 0;
  const tone = error ? "bad" : state?.ready ? "good" : state?.requiresManualClose ? "warn" : "neutral";

  return <section className={`laa-shell ${tone}`}>
    <style>{`
      .laa-shell{max-width:1540px;margin:0 auto 12px;padding:12px 14px;border:1px solid var(--lv-border-default);border-radius:12px;background:var(--lv-surface-panel);color:var(--lv-text-primary);box-shadow:var(--lv-shadow-sm)}
      .laa-shell.good{border-color:var(--lv-success-border);background:var(--lv-success-soft)}.laa-shell.warn{border-color:var(--lv-warning-border);background:var(--lv-warning-soft)}.laa-shell.bad{border-color:var(--lv-danger-border);background:var(--lv-danger-soft)}
      .laa-main{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center}.laa-kicker{font-size:7px;font-weight:950;letter-spacing:.12em;text-transform:uppercase;color:var(--lv-brand-text)}
      .laa-title{margin-top:4px;font-size:11px;font-weight:950;color:var(--lv-text-strong)}.laa-detail{margin-top:4px;font-size:8px;line-height:1.5;color:var(--lv-text-secondary)}
      .laa-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.laa-pill{display:inline-flex;padding:6px 8px;border-radius:999px;background:var(--lv-surface-muted);font-size:7px;font-weight:900;color:var(--lv-text-secondary)}
      .laa-btn{min-height:34px;padding:0 10px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px;font-weight:900;cursor:pointer}.laa-btn.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.laa-btn:disabled{opacity:.5;cursor:not-allowed}
      .laa-blockers{margin-top:9px;padding-top:9px;border-top:1px solid var(--lv-border-subtle);display:flex;gap:6px;flex-wrap:wrap}.laa-blocker{padding:5px 7px;border-radius:6px;background:var(--lv-surface-muted);font-size:7px;color:var(--lv-text-secondary)}
      .laa-msg{margin-top:8px;font-size:8px;font-weight:800}.laa-msg.good{color:var(--lv-success)}.laa-msg.bad{color:var(--lv-danger)}
      @media(max-width:700px){.laa-main{grid-template-columns:1fr}.laa-actions{justify-content:flex-start}}
    `}</style>
    <div className="laa-main">
      <div>
        <div className="laa-kicker">Smart Lifecycle Handoff</div>
        <div className="laa-title">{state ? `${state.phase}${state.nextPhase ? ` → ${state.nextPhase}` : ""}` : "Lifecycle automation"}</div>
        <div className="laa-detail">{error || state?.message || "Checking current stage requirements…"}</div>
      </div>
      <div className="laa-actions">
        {state?.total > 0 && <span className="laa-pill">{state.completed}/{state.total} complete</span>}
        {state?.autoEligible && !state.ready && <span className="laa-pill">Auto handoff armed</span>}
        {state?.autoEligible && state.ready && <span className="laa-pill">{busy ? "Advancing…" : "Ready"}</span>}
        {state?.requiresManualClose && <button className="laa-btn primary" disabled={busy} onClick={() => void closeSupervision()}>{busy ? "Closing…" : "Close Supervision & Start Handover"}</button>}
        <button className="laa-btn" disabled={busy} onClick={() => void refresh()}>Re-check</button>
      </div>
    </div>
    {blockerCount > 0 && <div className="laa-blockers">{state?.blockers.slice(0, 6).map((blocker) => <span className="laa-blocker" key={blocker}>{blocker}</span>)}</div>}
    {notice && <div className="laa-msg good">{notice}</div>}
    {error && <div className="laa-msg bad">{error}</div>}
  </section>;
}
