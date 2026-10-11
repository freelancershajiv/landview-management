"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PROJECT_LIFECYCLE_PHASES, nextProjectLifecyclePhase, type ProjectLifecyclePhase } from "@/lib/lifecycle";

type Proposal = {
  proposalId: string; clientName: string; projectTitle: string; status: string; approvalStatus: string;
  lifecyclePhase: string; convertedProjectId: string; entrySource: string; assignedTo: string; updatedAt: string;
};
type Project = {
  projectId: string; projectName: string; clientName: string; lifecyclePhase: ProjectLifecyclePhase; nextPhase?: string;
  designStatus: string; approvalStatus: string; supervisionStatus: string; sourceProposalId: string; sourceLeadCode?: string; updatedAt: string;
};
type Transition = {
  id: string; projectId: string; fromPhase: string; toPhase: string; type: string; reason: string;
  changedBy: string; changedByRole: string; source: string; createdAt: string;
};
type Payload = {
  role: string; canCorrect: boolean; counts: Record<string, number>; proposals: Proposal[]; projects: Project[]; transitions: Transition[];
};

function dateText(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
async function lifecycleRequest(method: "GET" | "POST", body?: Record<string, unknown>) {
  const response = await fetch("/api/lifecycle", {
    method, credentials: "same-origin", cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Lifecycle request failed."));
  return json.data;
}

export default function LifecycleCenterPage() {
  const [data, setData] = useState<Payload>({ role: "", canCorrect: false, counts: {}, proposals: [], projects: [], transitions: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true); setError("");
    try { setData(await lifecycleRequest("GET")); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load project lifecycle."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const pendingSites = useMemo(() => data.proposals.filter((r) => r.lifecyclePhase === "Site Entry Pending Approval"), [data.proposals]);
  const activeProposals = useMemo(() => data.proposals.filter((r) => ["Proposal Draft", "Proposal Sent", "Proposal Accepted"].includes(r.lifecyclePhase)), [data.proposals]);
  const visibleProjects = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return data.projects;
    return data.projects.filter((r) => [r.projectId, r.projectName, r.clientName, r.lifecyclePhase, r.sourceProposalId, r.sourceLeadCode].join(" ").toLowerCase().includes(term));
  }, [data.projects, query]);

  async function mutate(project: Project, body: Record<string, unknown>) {
    if (saving) return;
    setSaving(project.projectId); setError(""); setNotice("");
    try {
      const updated = await lifecycleRequest("POST", { projectId: project.projectId, ...body });
      setNotice(`${project.projectId} moved from ${project.lifecyclePhase} to ${updated.lifecyclePhase}.`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update lifecycle phase."); }
    finally { setSaving(""); }
  }

  async function advance(project: Project) {
    if (project.lifecyclePhase === "Completed") return;
    const next = nextProjectLifecyclePhase(project.lifecyclePhase);
    if (!window.confirm(`Advance ${project.projectId} from ${project.lifecyclePhase} to ${next}?`)) return;
    await mutate(project, { action: "advanceProject" });
  }

  async function correct(project: Project, phase: ProjectLifecyclePhase) {
    if (!data.canCorrect || phase === project.lifecyclePhase) return;
    const reason = window.prompt(`Admin correction: move ${project.projectId} from ${project.lifecyclePhase} to ${phase}.\n\nEnter the reason for this correction:`, "");
    if (reason === null) return;
    if (reason.trim().length < 5) { setError("Enter a clear correction reason of at least 5 characters."); return; }
    await mutate(project, { action: "setProjectPhase", phase, reason: reason.trim() });
  }

  const pipeline = [
    ["Site Approval", data.counts["Site Entry Pending Approval"] || 0],
    ["Proposal Draft", data.counts["Proposal Draft"] || 0],
    ["Sent / Accepted", (data.counts["Proposal Sent"] || 0) + (data.counts["Proposal Accepted"] || 0)],
    ["Design", data.counts["Design Stage"] || 0],
    ["Approval", data.counts["Approval Stage"] || 0],
    ["Construction", data.counts["Supervision / Construction Stage"] || 0],
    ["Completed", data.counts.Completed || 0],
  ] as const;

  return <div className="lc4">
    <style>{`
      .lc4{max-width:1540px;margin:0 auto;color:var(--lv-text-primary)}.head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:14px}.eyebrow{color:var(--lv-brand-text);font-size:9px;font-weight:950;letter-spacing:.14em}.head h1{margin:4px 0 0;font-size:30px;color:var(--lv-text-strong)}.head p{margin:6px 0 0;max-width:880px;color:var(--lv-text-secondary);font-size:10px;line-height:1.6}.actions{display:flex;gap:7px;flex-wrap:wrap}.btn,.link{border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-panel);color:var(--lv-text-primary);padding:9px 11px;text-decoration:none;font-size:9px;font-weight:900;cursor:pointer}.btn.primary,.link.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.btn:disabled{opacity:.45;cursor:not-allowed}
      .pipeline{display:grid;grid-template-columns:repeat(7,1fr);gap:7px;margin-bottom:14px}.step{padding:11px;border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-panel)}.step span{display:block;color:var(--lv-text-muted);font-size:8px;font-weight:900;text-transform:uppercase}.step strong{display:block;margin-top:7px;font-size:22px;color:var(--lv-text-strong)}.msg{margin-bottom:12px;padding:10px 12px;border-radius:8px;font-size:10px}.err{background:var(--lv-danger-soft);color:var(--lv-danger);border:1px solid var(--lv-danger-border)}.ok{background:var(--lv-success-soft);color:var(--lv-success);border:1px solid var(--lv-success-border)}
      .two{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}.panel{border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-panel);overflow:hidden}.ph{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:12px 13px;background:var(--lv-surface-muted);border-bottom:1px solid var(--lv-border-default)}.ph h2{margin:0;font-size:14px}.ph small{display:block;margin-top:3px;color:var(--lv-text-muted);font-size:8px}.item{display:flex;justify-content:space-between;gap:10px;padding:10px 13px;border-bottom:1px solid var(--lv-border-subtle);font-size:9px}.item:last-child{border-bottom:0}.item strong{display:block;color:var(--lv-text-strong)}.item span{display:block;margin-top:3px;color:var(--lv-text-secondary)}.badge{display:inline-flex;align-items:center;height:max-content;padding:4px 7px;border-radius:999px;background:var(--lv-surface-muted);color:var(--lv-text-secondary);font-size:8px;font-weight:900;white-space:nowrap}.empty{padding:16px;color:var(--lv-text-muted);font-size:9px}
      .toolbar{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:12px 13px;background:var(--lv-surface-muted);border-bottom:1px solid var(--lv-border-default)}.toolbar h2{margin:0;font-size:15px}.toolbar input{width:min(360px,100%);padding:8px 9px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:9px}.wrap{overflow:auto}.table{width:100%;min-width:1240px;border-collapse:collapse}.table th{padding:9px 10px;background:var(--lv-surface-muted);border-bottom:1px solid var(--lv-border-default);text-align:left;color:var(--lv-text-muted);font-size:8px;text-transform:uppercase}.table td{padding:10px;border-bottom:1px solid var(--lv-border-subtle);vertical-align:middle;font-size:9px}.pid{color:var(--lv-brand-text);font-weight:950;text-decoration:none}.stages{display:grid;gap:2px;color:var(--lv-text-secondary);font-size:8px}.move{display:flex;gap:6px;align-items:center}.correct{max-width:150px;padding:8px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px}.history{margin-top:12px}.history-grid{display:grid;grid-template-columns:repeat(2,1fr)}.history .item{min-height:62px}.history .item:nth-child(odd){border-right:1px solid var(--lv-border-subtle)}
      @media(max-width:1100px){.pipeline{grid-template-columns:repeat(4,1fr)}.two{grid-template-columns:1fr}}@media(max-width:760px){.head{align-items:flex-start;flex-direction:column}.pipeline{grid-template-columns:repeat(2,1fr)}.toolbar{align-items:stretch;flex-direction:column}.toolbar input{width:100%}.history-grid{grid-template-columns:1fr}.history .item:nth-child(odd){border-right:0}}@media(max-width:460px){.pipeline{grid-template-columns:1fr}}
    `}</style>

    <header className="head"><div><div className="eyebrow">LAND VIEW · PROJECT CONTROL</div><h1>Project Lifecycle Center</h1><p>One controlled workflow from new-site approval and proposal through project registration, design, authority approval, supervision/construction and completion. Every project transition is permanently recorded.</p></div><div className="actions"><Link className="link" href="/admin/new-site">New Site</Link><Link className="link" href="/admin/proposals">Proposals</Link><Link className="link primary" href="/projectmanagement">Project Management</Link></div></header>

    <section className="pipeline">{pipeline.map(([label,count]) => <div className="step" key={label}><span>{label}</span><strong>{count}</strong></div>)}</section>
    {error && <div className="msg err">{error}</div>}{notice && <div className="msg ok">{notice}</div>}

    <section className="two">
      <div className="panel"><div className="ph"><div><h2>Site Entries Waiting for Approval</h2><small>Employee entries that need Management/Admin review</small></div><Link className="link" href="/admin/new-site">Review</Link></div>{loading ? <div className="empty">Loading…</div> : pendingSites.length ? pendingSites.slice(0,8).map(r => <div className="item" key={r.proposalId}><div><strong>{r.proposalId} · {r.projectTitle || r.clientName}</strong><span>{r.clientName} · {dateText(r.updatedAt)}</span></div><b className="badge">Pending</b></div>) : <div className="empty">No site entries are waiting for approval.</div>}</div>
      <div className="panel"><div className="ph"><div><h2>Active Proposals</h2><small>Approved site entries and manual proposals before registration</small></div><Link className="link" href="/admin/proposals">Open</Link></div>{loading ? <div className="empty">Loading…</div> : activeProposals.length ? activeProposals.slice(0,8).map(r => <div className="item" key={r.proposalId}><div><strong>{r.proposalId} · {r.projectTitle || r.clientName}</strong><span>{r.clientName} · {dateText(r.updatedAt)}</span></div><b className="badge">{r.lifecyclePhase}</b></div>) : <div className="empty">No active proposals.</div>}</div>
    </section>

    <section className="panel"><div className="toolbar"><div><h2>Registered Project Stages</h2><small>Managers advance one stage at a time. Admin corrections require a reason.</small></div><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search project, client, proposal or lead…" /></div><div className="wrap"><table className="table"><thead><tr><th>Project</th><th>Client</th><th>Current phase</th><th>Stage state</th><th>Source</th><th>Updated</th><th>Next action</th></tr></thead><tbody>{visibleProjects.map(row => <tr key={row.projectId}><td><Link className="pid" href={`/admin/projects/${encodeURIComponent(row.projectId)}`}>{row.projectId}</Link><div>{row.projectName}</div></td><td>{row.clientName || "—"}</td><td><b className="badge">{row.lifecyclePhase}</b></td><td><div className="stages"><span>Design · {row.designStatus}</span><span>Approval · {row.approvalStatus}</span><span>Supervision · {row.supervisionStatus}</span></div></td><td>{row.sourceProposalId || row.sourceLeadCode || "—"}</td><td>{dateText(row.updatedAt)}</td><td><div className="move"><button className="btn primary" disabled={saving===row.projectId || row.lifecyclePhase==="Completed"} onClick={()=>void advance(row)}>{row.lifecyclePhase==="Completed" ? "Completed" : `Advance → ${row.nextPhase || nextProjectLifecyclePhase(row.lifecyclePhase)}`}</button>{data.canCorrect && <select className="correct" value="" disabled={saving===row.projectId} onChange={e=>{const phase=e.target.value as ProjectLifecyclePhase;if(phase)void correct(row,phase)}}><option value="">Admin correction…</option>{PROJECT_LIFECYCLE_PHASES.filter(p=>p!==row.lifecyclePhase).map(p=><option key={p} value={p}>{p}</option>)}</select>}</div></td></tr>)}{!loading && !visibleProjects.length && <tr><td colSpan={7}><div className="empty">No matching registered projects.</div></td></tr>}</tbody></table></div></section>

    <section className="panel history"><div className="ph"><div><h2>Recent Lifecycle History</h2><small>Registration, stage advancement and Admin correction trail</small></div><span className="badge">{data.transitions.length} loaded</span></div><div className="history-grid">{data.transitions.slice(0,12).map(t=><div className="item" key={t.id}><div><strong>{t.projectId} · {t.fromPhase || "Registered"} → {t.toPhase}</strong><span>{t.type} · {t.changedBy || "system"} · {dateText(t.createdAt)}{t.reason ? ` · ${t.reason}` : ""}</span></div><b className="badge">{t.changedByRole || t.type}</b></div>)}{!loading && !data.transitions.length && <div className="empty">No lifecycle history has been recorded yet.</div>}</div></section>
  </div>;
}
