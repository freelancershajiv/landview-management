"use client";

import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";

type Row = Record<string, any>;

function text(value: unknown) { return String(value ?? "").trim(); }
function idOf(row: Row) { return text(row.Project_ID || row["Project ID"] || row.projectId); }
function stageOf(row: Row) {
  return text(row.Lifecycle_Phase || row.Current_Stage || row["Current Stage"]) || "Design Stage";
}
function visitEligible(row: Row) {
  if (typeof row.Site_Visit_Eligible === "boolean") return row.Site_Visit_Eligible;
  return /supervision|construction/i.test(stageOf(row));
}

export default function EmployeeProjectStageStrip({ visitMode = false }: { visitMode?: boolean }) {
  const [projects, setProjects] = useState<Row[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void landViewApi.getProjects()
      .then((rows) => active && setProjects(Array.isArray(rows) ? rows : []))
      .catch((e) => active && setError(e instanceof Error ? e.message : "Could not load project stages."));
    return () => { active = false; };
  }, []);

  const visible = useMemo(() => {
    const rows = visitMode ? projects.filter(visitEligible) : projects.filter((row) => stageOf(row) !== "Completed");
    return rows.slice(0, 8);
  }, [projects, visitMode]);

  if (!visible.length && !error) return null;

  return <section className="eps-stage" aria-label="Employee project stages">
    <style>{`
      .eps-stage{margin:0 0 16px;padding:15px 16px;border:1px solid var(--lv-border-default);border-radius:var(--lv-radius-lg);background:var(--lv-surface-panel);color:var(--lv-text-primary);box-shadow:var(--lv-shadow-sm)}
      .eps-stage-head{display:flex;justify-content:space-between;gap:12px;align-items:end;margin-bottom:10px}.eps-stage-head h2{margin:0;font-size:14px}.eps-stage-head p{margin:4px 0 0;color:var(--lv-text-muted);font-size:9px}.eps-stage-head span{color:var(--lv-brand-text);font-size:9px;font-weight:900}.eps-stage-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.eps-stage-card{padding:10px;border:1px solid var(--lv-border-default);border-radius:9px;background:var(--lv-surface-muted)}.eps-stage-card strong{display:block;font-size:10px}.eps-stage-card span{display:block;margin-top:5px;color:var(--lv-brand-text);font-size:8px;font-weight:900}.eps-stage-card small{display:block;margin-top:4px;color:var(--lv-text-muted);font-size:8px}.eps-stage-card.visit{border-color:var(--lv-success-border);background:var(--lv-success-soft)}.eps-stage-error{color:var(--lv-danger);font-size:9px}
      @media(max-width:900px){.eps-stage-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:520px){.eps-stage{padding:12px}.eps-stage-head{align-items:flex-start;flex-direction:column}.eps-stage-grid{grid-template-columns:1fr}}
    `}</style>
    {error ? <div className="eps-stage-error">{error}</div> : <>
      <div className="eps-stage-head"><div><h2>{visitMode ? "Site Visit Eligible Projects" : "My Project Stages"}</h2><p>{visitMode ? "Only Supervision / Construction projects should receive field site visits." : "Current LAND VIEW lifecycle stage for your active projects."}</p></div><span>{visible.length} SHOWN</span></div>
      <div className="eps-stage-grid">{visible.map((project, index) => <div className={`eps-stage-card${visitEligible(project) ? " visit" : ""}`} key={idOf(project) || index}><strong>{idOf(project) || "Project"}</strong><span>{stageOf(project)}</span><small>{text(project.Project_Name || project.Client_Name) || "LAND VIEW project"}</small></div>)}</div>
    </>}
  </section>;
}
