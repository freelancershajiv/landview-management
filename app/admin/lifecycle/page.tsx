"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { PROJECT_LIFECYCLE_PHASES, type ProjectLifecyclePhase } from "@/lib/lifecycle";

type Proposal = {
  proposalId: string;
  clientName: string;
  projectTitle: string;
  status: string;
  approvalStatus: string;
  lifecyclePhase: string;
  convertedProjectId: string;
  entrySource: string;
  assignedTo: string;
  updatedAt: string;
};

type Project = {
  projectId: string;
  projectName: string;
  clientName: string;
  lifecyclePhase: string;
  designStatus: string;
  approvalStatus: string;
  supervisionStatus: string;
  sourceProposalId: string;
  updatedAt: string;
};

type Payload = {
  counts: Record<string, number>;
  proposals: Proposal[];
  projects: Project[];
};

function dateText(value: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function lifecycleRequest(method: "GET" | "POST", body?: Record<string, unknown>) {
  const response = await fetch("/api/lifecycle", {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Lifecycle request failed."));
  return json.data;
}

export default function LifecycleCenterPage() {
  const [data, setData] = useState<Payload>({ counts: {}, proposals: [], projects: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(await lifecycleRequest("GET"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load project lifecycle.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const pendingSites = useMemo(
    () => data.proposals.filter((row) => row.lifecyclePhase === "Site Entry Pending Approval"),
    [data.proposals],
  );
  const activeProposals = useMemo(
    () => data.proposals.filter((row) => ["Proposal Draft", "Proposal Sent", "Proposal Accepted"].includes(row.lifecyclePhase)),
    [data.proposals],
  );
  const visibleProjects = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return data.projects;
    return data.projects.filter((row) => [row.projectId, row.projectName, row.clientName, row.lifecyclePhase, row.sourceProposalId].join(" ").toLowerCase().includes(term));
  }, [data.projects, query]);

  async function setPhase(project: Project, phase: ProjectLifecyclePhase) {
    const key = project.projectId;
    if (saving) return;
    setSaving(key);
    setError("");
    setNotice("");
    try {
      const updated = await lifecycleRequest("POST", { action: "setProjectPhase", projectId: project.projectId, phase });
      setData((current) => ({
        ...current,
        projects: current.projects.map((item) => item.projectId === project.projectId ? updated : item),
      }));
      setNotice(`${project.projectId} moved to ${updated.lifecyclePhase}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update lifecycle phase.");
    } finally {
      setSaving("");
    }
  }

  return <div className="lc-page">
    <style>{`
      .lc-page{max-width:1500px;margin:0 auto;color:var(--lv-text-primary)}
      .lc-head{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin-bottom:16px}.lc-head small{display:block;color:var(--lv-brand-text);font-size:9px;font-weight:950;letter-spacing:.14em}.lc-head h1{margin:4px 0 0;color:var(--lv-text-strong);font-size:30px}.lc-head p{max-width:900px;margin:7px 0 0;color:var(--lv-text-secondary);font-size:11px;line-height:1.6}.lc-head-actions{display:flex;gap:8px;flex-wrap:wrap}.lc-link{display:inline-flex;min-height:40px;align-items:center;padding:0 13px;border:1px solid var(--lv-border-default);border-radius:var(--lv-radius-md);background:var(--lv-surface-panel);color:var(--lv-text-primary);text-decoration:none;font-size:10px;font-weight:900}.lc-link.primary{border-color:var(--lv-brand-border);background:var(--lv-brand-primary);color:var(--lv-text-inverse)}
      .lc-pipeline{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin-bottom:16px}.lc-step{position:relative;min-height:82px;padding:12px;border:1px solid var(--lv-border-default);border-radius:var(--lv-radius-lg);background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm)}.lc-step span{display:block;color:var(--lv-text-muted);font-size:8px;font-weight:900;text-transform:uppercase;line-height:1.35}.lc-step strong{display:block;margin-top:8px;color:var(--lv-text-strong);font-size:22px}.lc-step b{position:absolute;right:-8px;top:31px;color:var(--lv-brand-text);z-index:2}.lc-step:last-child b{display:none}
      .lc-msg{margin-bottom:12px;padding:10px 12px;border-radius:var(--lv-radius-md);font-size:10px}.lc-msg.err{border:1px solid var(--lv-danger-border);background:var(--lv-danger-soft);color:var(--lv-danger)}.lc-msg.ok{border:1px solid var(--lv-success-border);background:var(--lv-success-soft);color:var(--lv-success)}
      .lc-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:14px}.lc-panel{border:1px solid var(--lv-border-default);border-radius:var(--lv-radius-lg);background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm);overflow:hidden}.lc-panel-head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:14px 15px;border-bottom:1px solid var(--lv-border-default);background:var(--lv-surface-muted)}.lc-panel-head h2{margin:0;color:var(--lv-text-strong);font-size:15px}.lc-panel-head small{color:var(--lv-text-muted);font-size:9px}.lc-list{display:grid}.lc-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;padding:12px 15px;border-bottom:1px solid var(--lv-border-subtle)}.lc-row:last-child{border-bottom:0}.lc-row strong{display:block;color:var(--lv-text-strong);font-size:10px}.lc-row span{display:block;margin-top:4px;color:var(--lv-text-secondary);font-size:9px}.lc-badge{align-self:start;padding:5px 8px;border-radius:var(--lv-radius-pill);background:var(--lv-surface-muted);color:var(--lv-text-secondary);font-size:8px;font-weight:900;white-space:nowrap}.lc-empty{padding:20px;color:var(--lv-text-muted);font-size:10px}
      .lc-projects{border:1px solid var(--lv-border-default);border-radius:var(--lv-radius-lg);background:var(--lv-surface-panel);overflow:hidden}.lc-project-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 15px;border-bottom:1px solid var(--lv-border-default);background:var(--lv-surface-muted)}.lc-project-toolbar h2{margin:0;font-size:16px;color:var(--lv-text-strong)}.lc-project-toolbar input{width:min(360px,100%);padding:9px 10px;border:1px solid var(--lv-border-default);border-radius:var(--lv-radius-md);background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:10px}.lc-table-wrap{overflow:auto}.lc-table{width:100%;min-width:1120px;border-collapse:collapse}.lc-table th{padding:10px 11px;background:var(--lv-surface-muted);border-bottom:1px solid var(--lv-border-default);color:var(--lv-text-muted);text-align:left;font-size:8px;text-transform:uppercase;letter-spacing:.08em}.lc-table td{padding:11px;border-bottom:1px solid var(--lv-border-subtle);color:var(--lv-text-primary);font-size:9px;vertical-align:middle}.lc-table tr:last-child td{border-bottom:0}.lc-project-id{font-weight:950;color:var(--lv-brand-text)}.lc-stage-mini{display:grid;gap:3px;color:var(--lv-text-secondary);font-size:8px}.lc-select{min-width:205px;padding:8px;border:1px solid var(--lv-border-default);border-radius:var(--lv-radius-md);background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:9px}.lc-select:disabled{opacity:.55}
      @media(max-width:1100px){.lc-pipeline{grid-template-columns:repeat(4,minmax(0,1fr))}.lc-step b{display:none}}@media(max-width:800px){.lc-head{align-items:flex-start;flex-direction:column}.lc-grid{grid-template-columns:1fr}.lc-pipeline{grid-template-columns:repeat(2,minmax(0,1fr))}.lc-project-toolbar{align-items:stretch;flex-direction:column}.lc-project-toolbar input{width:100%}}@media(max-width:480px){.lc-pipeline{grid-template-columns:1fr}}
    `}</style>

    <header className="lc-head">
      <div>
        <small>LAND VIEW · END-TO-END WORKFLOW</small>
        <h1>Project Lifecycle Center</h1>
        <p>One lifecycle from the first site visit through approval, proposal, project registration, design, authority approval, construction supervision and completion.</p>
      </div>
      <div className="lc-head-actions">
        <Link className="lc-link" href="/admin/new-site">New Site / Approval</Link>
        <Link className="lc-link" href="/admin/proposals">Proposals</Link>
        <Link className="lc-link primary" href="/admin/projects">Projects</Link>
      </div>
    </header>

    <section className="lc-pipeline" aria-label="LAND VIEW lifecycle">
      {[
        ["Site Approval", data.counts["Site Entry Pending Approval"] || 0],
        ["Proposal Draft", data.counts["Proposal Draft"] || 0],
        ["Proposal Sent / Accepted", (data.counts["Proposal Sent"] || 0) + (data.counts["Proposal Accepted"] || 0)],
        ["Design", data.counts["Design Stage"] || 0],
        ["Approval", data.counts["Approval Stage"] || 0],
        ["Supervision / Construction", data.counts["Supervision / Construction Stage"] || 0],
        ["Completed", data.counts.Completed || 0],
      ].map(([label, count], index, all) => <div className="lc-step" key={String(label)}><span>{label}</span><strong>{count}</strong>{index < all.length - 1 && <b>→</b>}</div>)}
    </section>

    {error && <div className="lc-msg err">{error}</div>}
    {notice && <div className="lc-msg ok">{notice}</div>}

    <section className="lc-grid">
      <div className="lc-panel">
        <div className="lc-panel-head"><div><h2>Site Entries Waiting for Approval</h2><small>Employee submissions requiring Management/Admin decision</small></div><Link className="lc-link" href="/admin/new-site">Review</Link></div>
        <div className="lc-list">
          {loading ? <div className="lc-empty">Loading…</div> : pendingSites.length ? pendingSites.slice(0, 8).map((row) => <div className="lc-row" key={row.proposalId}><div><strong>{row.proposalId} · {row.projectTitle || row.clientName}</strong><span>{row.clientName} · {dateText(row.updatedAt)}</span></div><span className="lc-badge">Pending approval</span></div>) : <div className="lc-empty">No site entries are waiting for approval.</div>}
        </div>
      </div>

      <div className="lc-panel">
        <div className="lc-panel-head"><div><h2>Active Proposals</h2><small>Approved site entries and manual proposals before registration</small></div><Link className="lc-link" href="/admin/proposals">Open proposals</Link></div>
        <div className="lc-list">
          {loading ? <div className="lc-empty">Loading…</div> : activeProposals.length ? activeProposals.slice(0, 8).map((row) => <div className="lc-row" key={row.proposalId}><div><strong>{row.proposalId} · {row.projectTitle || row.clientName}</strong><span>{row.clientName} · {dateText(row.updatedAt)}</span></div><span className="lc-badge">{row.lifecyclePhase}</span></div>) : <div className="lc-empty">No active proposals.</div>}
        </div>
      </div>
    </section>

    <section className="lc-projects">
      <div className="lc-project-toolbar"><div><h2>Registered Project Stages</h2><small>Changing the lifecycle phase synchronizes all three project stage fields and is recorded in Audit Log.</small></div><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search project, client or phase…" /></div>
      <div className="lc-table-wrap">
        <table className="lc-table">
          <thead><tr><th>Project</th><th>Client</th><th>Current phase</th><th>Stage state</th><th>Source proposal</th><th>Updated</th><th>Move project</th></tr></thead>
          <tbody>
            {visibleProjects.map((row) => <tr key={row.projectId}>
              <td><Link className="lc-project-id" href={`/admin/projects/${encodeURIComponent(row.projectId)}`}>{row.projectId}</Link><div>{row.projectName}</div></td>
              <td>{row.clientName || "—"}</td>
              <td><span className="lc-badge">{row.lifecyclePhase}</span></td>
              <td><div className="lc-stage-mini"><span>Design · {row.designStatus}</span><span>Approval · {row.approvalStatus}</span><span>Supervision · {row.supervisionStatus}</span></div></td>
              <td>{row.sourceProposalId || "—"}</td>
              <td>{dateText(row.updatedAt)}</td>
              <td><select className="lc-select" disabled={saving === row.projectId} value={row.lifecyclePhase} onChange={(event) => void setPhase(row, event.target.value as ProjectLifecyclePhase)}>{PROJECT_LIFECYCLE_PHASES.map((phase) => <option value={phase} key={phase}>{phase}</option>)}</select></td>
            </tr>)}
            {!loading && !visibleProjects.length && <tr><td colSpan={7}><div className="lc-empty">No matching registered projects.</div></td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}
