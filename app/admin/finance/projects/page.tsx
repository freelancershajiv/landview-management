"use client";

import { useEffect, useMemo, useState } from "react";

type FinanceProject = {
  id: string;
  projectId: string;
  projectName: string;
  clientName: string;
  phone: string;
  location: string;
  lifecyclePhase: string;
  financeClosed: boolean;
  financeClosedAt: string | null;
  financeClosedBy: string;
};

async function readJson(response: Response, fallback: string) {
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || fallback));
  return json.data;
}

export default function FinanceProjectsPage() {
  const [projects, setProjects] = useState<FinanceProject[]>([]);
  const [tab, setTab] = useState<"active" | "completed">("active");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setLoading(true); setError("");
    try {
      const data = await readJson(await fetch("/api/finance/projects", { credentials: "same-origin", cache: "no-store" }), "Could not load Finance projects.");
      setProjects(Array.isArray(data?.projects) ? data.projects : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Finance projects.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const activeCount = projects.filter((project) => !project.financeClosed).length;
  const completedCount = projects.filter((project) => project.financeClosed).length;
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((project) => tab === "completed" ? project.financeClosed : !project.financeClosed).filter((project) => {
      if (!q) return true;
      return [project.projectId, project.projectName, project.clientName, project.phone, project.location].some((value) => String(value || "").toLowerCase().includes(q));
    });
  }, [projects, tab, search]);

  async function changeState(project: FinanceProject, close: boolean) {
    if (busy) return;
    if (close && !window.confirm(`Mark ${project.projectId} as completed in Finance?\n\nIt will disappear from Finance project lists and new financial actions will be locked until you reopen it.`)) return;
    setBusy(project.projectId); setError(""); setMessage("");
    try {
      await readJson(await fetch("/api/finance/projects", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.projectId, action: close ? "close" : "reopen" }),
      }), close ? "Could not close the project in Finance." : "Could not reopen the project in Finance.");
      setProjects((current) => current.map((item) => item.projectId === project.projectId ? {
        ...item,
        financeClosed: close,
        financeClosedAt: close ? new Date().toISOString() : null,
      } : item));
      setMessage(close ? `${project.projectId} completed in Finance. Its financial entry options are now closed.` : `${project.projectId} reopened in Finance. Financial entry options are available again.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update project state.");
    } finally { setBusy(""); }
  }

  return <main className="fp-page">
    <style>{`
      .fp-page{max-width:1450px;margin:0 auto;color:var(--lv-text-primary)}.fp-page *{box-sizing:border-box}.fp-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:14px}.fp-head small{font-size:8px;font-weight:950;letter-spacing:.13em;color:var(--lv-brand-text)}.fp-head h1{margin:5px 0 3px;font-size:30px}.fp-head p{margin:0;color:var(--lv-text-muted);font-size:9px;line-height:1.55;max-width:760px}.fp-stats{display:flex;gap:8px}.fp-stat{min-width:110px;padding:10px 12px;border:1px solid var(--lv-border-default);border-radius:9px;background:var(--lv-surface-panel)}.fp-stat span{display:block;font-size:7px;text-transform:uppercase;color:var(--lv-text-muted)}.fp-stat strong{display:block;margin-top:4px;font-size:20px}.fp-toolbar{display:flex;gap:8px;align-items:center;margin-bottom:12px}.fp-tabs{display:flex;gap:6px}.fp-tab,.fp-btn{min-height:38px;padding:0 12px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px;font-weight:950;cursor:pointer}.fp-tab.active{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.fp-search{margin-left:auto;min-width:310px;min-height:38px;padding:8px 10px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary)}.fp-card{border:1px solid var(--lv-border-default);border-radius:11px;background:var(--lv-surface-panel);overflow:hidden}.fp-table{overflow:auto}.fp-table table{width:100%;border-collapse:collapse;min-width:1020px}.fp-table th,.fp-table td{padding:10px 11px;border-bottom:1px solid var(--lv-border-subtle);font-size:8px;text-align:left;vertical-align:middle}.fp-table th{background:var(--lv-surface-muted);color:var(--lv-text-muted);text-transform:uppercase;letter-spacing:.05em}.fp-code{font-weight:950;font-size:10px}.fp-muted{color:var(--lv-text-muted)}.fp-pill{display:inline-flex;align-items:center;min-height:24px;padding:0 8px;border-radius:999px;font-size:7px;font-weight:950}.fp-pill.active{background:var(--lv-success-soft);color:var(--lv-success)}.fp-pill.closed{background:var(--lv-danger-soft);color:var(--lv-danger)}.fp-btn.close{background:var(--lv-danger-soft);border-color:var(--lv-danger);color:var(--lv-danger)}.fp-btn.reopen{background:var(--lv-success-soft);border-color:var(--lv-success);color:var(--lv-success)}.fp-btn:disabled{opacity:.5;cursor:not-allowed}.fp-msg{padding:10px 12px;border-radius:8px;margin-bottom:12px;font-size:9px}.fp-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.fp-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}.fp-empty{padding:30px;text-align:center;color:var(--lv-text-muted);font-size:9px}@media(max-width:760px){.fp-head{align-items:flex-start;flex-direction:column}.fp-stats{width:100%}.fp-stat{flex:1}.fp-toolbar{align-items:stretch;flex-direction:column}.fp-tabs{display:grid;grid-template-columns:1fr 1fr}.fp-search{margin-left:0;min-width:0;width:100%}}
    `}</style>

    <header className="fp-head">
      <div><small>FINANCE / PROJECT CONTROL</small><h1>Finance Projects</h1><p>Complete a project here to remove it from Finance lists and lock new bills, payments, discounts and bill edits. Reopen it from this same page whenever financial work is needed again.</p></div>
      <div className="fp-stats"><div className="fp-stat"><span>Active</span><strong>{activeCount}</strong></div><div className="fp-stat"><span>Completed</span><strong>{completedCount}</strong></div></div>
    </header>

    {error ? <div className="fp-msg bad">{error}</div> : null}
    {message ? <div className="fp-msg good">{message}</div> : null}

    <div className="fp-toolbar">
      <div className="fp-tabs"><button className={`fp-tab ${tab === "active" ? "active" : ""}`} onClick={() => setTab("active")}>Active Projects ({activeCount})</button><button className={`fp-tab ${tab === "completed" ? "active" : ""}`} onClick={() => setTab("completed")}>Completed ({completedCount})</button></div>
      <input className="fp-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search File ID, client, project, phone or location" />
    </div>

    <section className="fp-card fp-table">
      {loading ? <div className="fp-empty">Loading Finance projects…</div> : rows.length ? <table><thead><tr><th>File ID</th><th>Client</th><th>Project</th><th>Location</th><th>Project Lifecycle</th><th>Finance Status</th><th>Action</th></tr></thead><tbody>{rows.map((project) => <tr key={project.id || project.projectId}><td className="fp-code">{project.projectId}</td><td>{project.clientName || "—"}<div className="fp-muted">{project.phone || ""}</div></td><td>{project.projectName || "—"}</td><td>{project.location || "—"}</td><td>{project.lifecyclePhase || "—"}</td><td><span className={`fp-pill ${project.financeClosed ? "closed" : "active"}`}>{project.financeClosed ? "Completed" : "Active"}</span>{project.financeClosedAt ? <div className="fp-muted">{new Date(project.financeClosedAt).toLocaleDateString("en-BD")}</div> : null}</td><td>{project.financeClosed ? <button className="fp-btn reopen" disabled={busy === project.projectId} onClick={() => void changeState(project, false)}>{busy === project.projectId ? "Reopening…" : "Reopen Finance"}</button> : <button className="fp-btn close" disabled={busy === project.projectId} onClick={() => void changeState(project, true)}>{busy === project.projectId ? "Closing…" : "Mark Completed"}</button>}</td></tr>)}</tbody></table> : <div className="fp-empty">No projects found in this list.</div>}
    </section>
  </main>;
}
