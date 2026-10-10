"use client";

import { useEffect, useMemo, useState } from "react";

type Item = {
  projectId: string;
  projectName: string;
  lifecyclePhase: string;
  designStageStatus: string;
  approvalStageStatus: string;
  supervisionStageStatus: string;
  changedAt?: string;
};

const PHASES = ["Design Stage", "Approval Stage", "Supervision / Construction Stage", "Completed"] as const;

function phaseIndex(value: string) {
  const index = PHASES.indexOf(value as (typeof PHASES)[number]);
  return index < 0 ? 0 : index;
}

export default function ClientLifecycleStrip() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch("/api/client-lifecycle", { cache: "no-store", credentials: "same-origin" })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load project stage."));
        if (active) setItems(Array.isArray(json.data) ? json.data : []);
      })
      .catch((e) => active && setError(e instanceof Error ? e.message : "Could not load project stage."));
    return () => { active = false; };
  }, []);

  const current = items[0];
  const index = useMemo(() => phaseIndex(current?.lifecyclePhase || "Design Stage"), [current?.lifecyclePhase]);
  if (!current && !error) return null;

  return <section className="clifecycle" aria-label="Project lifecycle">
    <style>{`
      .clifecycle{margin:0 auto 16px;width:min(calc(100% - 28px),1480px);padding:14px 16px;border:1px solid var(--lv-border-default);border-radius:var(--lv-radius-lg);background:var(--lv-surface-panel);color:var(--lv-text-primary);box-shadow:var(--lv-shadow-sm)}
      .clifecycle-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:11px}.clifecycle-head strong{font-size:12px}.clifecycle-head span{color:var(--lv-brand-text);font-size:10px;font-weight:900}.clifecycle-head small{display:block;margin-top:3px;color:var(--lv-text-muted);font-size:9px}
      .clifecycle-flow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.clifecycle-step{position:relative;padding:9px 10px;border:1px solid var(--lv-border-default);border-radius:9px;background:var(--lv-surface-muted);color:var(--lv-text-muted);font-size:9px;font-weight:850}.clifecycle-step.done{border-color:var(--lv-success-border);background:var(--lv-success-soft);color:var(--lv-success)}.clifecycle-step.current{border-color:var(--lv-brand-border);background:var(--lv-brand-soft);color:var(--lv-brand-text)}.clifecycle-step b{display:block;margin-bottom:3px;font-size:8px;letter-spacing:.08em}.clifecycle-error{color:var(--lv-danger);font-size:9px}
      @media(max-width:720px){.clifecycle{width:min(calc(100% - 20px),1480px);padding:12px}.clifecycle-head{align-items:flex-start;flex-direction:column}.clifecycle-flow{grid-template-columns:1fr 1fr}}
      @media(max-width:430px){.clifecycle-flow{grid-template-columns:1fr}}
    `}</style>
    {error ? <div className="clifecycle-error">{error}</div> : <>
      <div className="clifecycle-head">
        <div><strong>{current.projectId} · {current.projectName || "LAND VIEW Project"}</strong><small>Live project stage shared with LAND VIEW management</small></div>
        <span>{current.lifecyclePhase}</span>
      </div>
      <div className="clifecycle-flow">
        {PHASES.map((phase, step) => <div key={phase} className={`clifecycle-step${step < index ? " done" : step === index ? " current" : ""}`}><b>{String(step + 1).padStart(2, "0")}</b>{phase}</div>)}
      </div>
    </>}
  </section>;
}
