"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;
type Mode = "proposal" | "project";

function text(v: unknown) { return String(v ?? "").trim(); }
function money(v: unknown) { const n = Number(v || 0); return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0); }
async function parse(response: Response, fallback: string) { const json = await response.json().catch(() => null); if (!response.ok || !json?.success) throw new Error(String(json?.error || fallback)); return json.data; }
async function getData(mode: Mode) { return parse(await fetch(`/api/service-workflow?mode=${mode}`, { credentials: "same-origin", cache: "no-store" }), "Could not load workflow."); }
async function post(payload: Row) { return parse(await fetch("/api/service-workflow", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }), "Could not update workflow."); }

function StepTrack({ statuses, status }: { statuses: string[]; status: string }) {
  const current = Math.max(0, statuses.indexOf(status));
  return <div className="wfx-track">{statuses.map((item, index) => <div key={item} className={`wfx-step ${index < current ? "done" : ""} ${index === current ? "active" : ""}`}><i/><span>{item}</span></div>)}</div>;
}

export default function WorkflowPage() {
  const [mode, setMode] = useState<Mode>("proposal");
  const [data, setData] = useState<Row>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async (nextMode = mode) => {
    setLoading(true); setError("");
    try { setData(await getData(nextMode)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load workflow."); }
    finally { setLoading(false); }
  }, [mode]);
  useEffect(() => { void load(mode); }, [mode, load]);

  async function updateProposal(row: Row, status: string) {
    const key = `P:${row.proposalCode}`; if (busy) return;
    setBusy(key); setError(""); setMessage("");
    try { await post({ action: "updateProposalStatus", proposalCode: row.proposalCode, itemCode: row.architecturalItemCode, status }); await load("proposal"); setMessage(`${row.proposalCode} Architectural Design moved to ${status}.`); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update proposal workflow."); }
    finally { setBusy(""); }
  }

  async function updateService(row: Row, status: string) {
    const key = `S:${row.id}`; if (busy) return;
    setBusy(key); setError(""); setMessage("");
    try { await post({ action: "updateProjectServiceStatus", id: row.id, status }); await load("project"); setMessage(`${row.projectId} · ${row.serviceName} moved to ${status}.`); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update project service workflow."); }
    finally { setBusy(""); }
  }

  const proposals: Row[] = data.proposals || [];
  const proposalStatuses: string[] = data.statuses || ["Working", "Ready", "Sent", "Approved"];
  const proposalRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return !q ? proposals : proposals.filter((row) => [row.proposalCode,row.clientName,row.story,row.location,row.projectTitle,row.assignedTo,row.extraServices?.join(" ")].join(" ").toLowerCase().includes(q));
  }, [proposals, query]);

  const workflows: Row[] = data.workflows || [];
  const projectRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return !q ? workflows : workflows.filter((row) => [row.projectId,row.ownerName,row.story,row.location,row.serviceName,row.status,row.billingCategory].join(" ").toLowerCase().includes(q));
  }, [workflows, query]);
  const groupedProjects = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of projectRows) { const list = map.get(row.projectId) || []; list.push(row); map.set(row.projectId, list); }
    return Array.from(map.entries()).sort((a,b) => b[0].localeCompare(a[0], undefined, { numeric: true }));
  }, [projectRows]);

  const projectCounts = useMemo(() => {
    const distinct = new Set(workflows.map((r) => r.projectId));
    return { projects: distinct.size, active: workflows.filter((r) => !["Approved","Delivered","Delivered to Client"].includes(r.status)).length, completed: workflows.filter((r) => ["Approved","Delivered","Delivered to Client"].includes(r.status)).length };
  }, [workflows]);

  return <main className="wfx">
    <style>{`
      .wfx{max-width:1580px;margin:0 auto;color:var(--lv-text-primary)}.wfx *{box-sizing:border-box}.wfx-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:14px}.wfx-head small{font-size:8px;font-weight:950;letter-spacing:.12em;color:var(--lv-brand-text)}.wfx-head h1{margin:4px 0 0;font-size:28px}.wfx-head p{margin:5px 0 0;font-size:9px;color:var(--lv-text-secondary)}.wfx-actions{display:flex;gap:7px;flex-wrap:wrap}.wfx-btn{min-height:37px;padding:0 12px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);text-decoration:none;font-size:8px;font-weight:900;cursor:pointer}.wfx-btn.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.wfx-switch{display:flex;gap:6px;padding:5px;border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-panel);margin-bottom:13px}.wfx-switch button{flex:1;min-height:40px;border:0;border-radius:7px;background:transparent;color:var(--lv-text-secondary);font-size:9px;font-weight:950;cursor:pointer}.wfx-switch button.active{background:var(--lv-brand-primary);color:var(--lv-text-inverse)}.wfx-search{width:100%;min-height:40px;margin-bottom:13px;padding:0 12px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:9px}.wfx-msg{margin-bottom:12px;padding:10px 12px;border-radius:8px;font-size:9px}.wfx-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.wfx-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}.wfx-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:13px}.wfx-kpi{padding:13px;border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-panel)}.wfx-kpi span{display:block;font-size:7px;text-transform:uppercase;color:var(--lv-text-muted);font-weight:900}.wfx-kpi strong{display:block;margin-top:6px;font-size:20px}.wfx-board{display:grid;grid-template-columns:repeat(4,minmax(230px,1fr));gap:10px;overflow:auto}.wfx-column{min-width:230px;border:1px solid var(--lv-border-default);border-radius:11px;background:var(--lv-surface-muted);overflow:hidden}.wfx-col-head{display:flex;justify-content:space-between;gap:8px;padding:11px 12px;border-bottom:2px solid var(--lv-brand-primary);background:var(--lv-surface-panel)}.wfx-col-head strong{font-size:9px}.wfx-col-head span{font-size:8px;color:var(--lv-text-muted)}.wfx-cards{display:grid;gap:8px;padding:8px}.wfx-card{padding:11px;border:1px solid var(--lv-border-default);border-radius:9px;background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm)}.wfx-card-top{display:flex;justify-content:space-between;gap:8px}.wfx-card-top strong{font-size:10px;color:var(--lv-text-strong)}.wfx-card h3{margin:7px 0 0;font-size:10px}.wfx-card p{margin:4px 0 0;font-size:8px;color:var(--lv-text-secondary);line-height:1.45}.wfx-card select{width:100%;margin-top:9px;padding:7px;border:1px solid var(--lv-border-default);border-radius:6px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px}.wfx-extra{margin-top:8px;font-size:7px;color:var(--lv-text-muted)}.wfx-project-list{display:grid;gap:11px}.wfx-project{border:1px solid var(--lv-border-default);border-radius:12px;background:var(--lv-surface-panel);overflow:hidden}.wfx-project-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;background:var(--lv-surface-muted);border-bottom:1px solid var(--lv-border-default)}.wfx-project-head h2{margin:0;font-size:13px}.wfx-project-head p{margin:4px 0 0;font-size:8px;color:var(--lv-text-secondary)}.wfx-project-head a{font-size:8px;font-weight:900;color:var(--lv-brand-text);text-decoration:none}.wfx-services{display:grid}.wfx-service{display:grid;grid-template-columns:minmax(190px,.8fr) minmax(420px,1.8fr) 110px 150px;gap:12px;align-items:center;padding:12px 14px;border-bottom:1px solid var(--lv-border-subtle)}.wfx-service:last-child{border-bottom:0}.wfx-service-name strong{display:block;font-size:9px}.wfx-service-name span{display:block;margin-top:4px;font-size:7px;color:var(--lv-text-muted)}.wfx-money{font-size:8px}.wfx-money strong{display:block;font-size:9px;color:var(--lv-success)}.wfx-service select{padding:7px;border:1px solid var(--lv-border-default);border-radius:6px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px}.wfx-track{display:flex;align-items:flex-start;min-width:410px}.wfx-step{position:relative;flex:1;text-align:center}.wfx-step:before{content:"";position:absolute;top:5px;left:0;right:0;height:2px;background:var(--lv-border-default)}.wfx-step:first-child:before{left:50%}.wfx-step:last-child:before{right:50%}.wfx-step i{position:relative;z-index:1;display:block;width:11px;height:11px;margin:0 auto 5px;border:2px solid var(--lv-border-default);border-radius:50%;background:var(--lv-surface-panel)}.wfx-step span{display:block;font-size:6px;color:var(--lv-text-muted);white-space:normal;line-height:1.2}.wfx-step.done:before,.wfx-step.active:before{background:var(--lv-success)}.wfx-step.done i{border-color:var(--lv-success);background:var(--lv-success)}.wfx-step.active i{border-color:var(--lv-brand-primary);background:var(--lv-brand-primary)}.wfx-step.active span{color:var(--lv-brand-text);font-weight:900}.wfx-empty{padding:28px;text-align:center;color:var(--lv-text-muted);font-size:9px}@media(max-width:1100px){.wfx-board{grid-template-columns:repeat(2,minmax(260px,1fr))}.wfx-service{grid-template-columns:1fr}.wfx-track{min-width:0;overflow:auto}}@media(max-width:650px){.wfx-head{align-items:flex-start;flex-direction:column}.wfx-board,.wfx-kpis{grid-template-columns:1fr}.wfx-actions{width:100%}.wfx-btn{flex:1}}
    `}</style>
    <header className="wfx-head"><div><small>LAND VIEW · WORKFLOW ENGINE</small><h1>{mode === "proposal" ? "Proposal Workflow" : "Project Workflow"}</h1><p>{mode === "proposal" ? "Proposal stage tracks Architectural Design only. Other services remain selectable in the proposal and activate later from paid project bills." : "Each service opens automatically only after its net bill is fully paid."}</p></div><div className="wfx-actions"><Link className="wfx-btn" href="/admin/finance/service-payments">Service Payments</Link><Link className="wfx-btn primary" href={mode === "proposal" ? "/admin/proposals/new" : "/admin/projects"}>{mode === "proposal" ? "+ New Proposal" : "Projects"}</Link></div></header>
    <div className="wfx-switch"><button className={mode==="proposal"?"active":""} onClick={()=>{setMode("proposal");setQuery("")}}>Proposal Workflow</button><button className={mode==="project"?"active":""} onClick={()=>{setMode("project");setQuery("")}}>Project Workflow</button></div>
    <input className="wfx-search" type="search" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder={mode === "proposal" ? "Search proposal ID, owner, story, location…" : "Search project ID, owner, story, service, status…"}/>
    {error&&<div className="wfx-msg bad">{error}</div>}{message&&<div className="wfx-msg good">{message}</div>}
    {loading ? <div className="wfx-empty">Loading workflow…</div> : mode === "proposal" ? <>
      <section className="wfx-kpis">{proposalStatuses.map((status)=><div className="wfx-kpi" key={status}><span>{status}</span><strong>{proposals.filter((p)=>p.workflowStatus===status).length}</strong></div>)}</section>
      <section className="wfx-board">{proposalStatuses.map((status)=>{const rows=proposalRows.filter((p)=>p.workflowStatus===status);return <div className="wfx-column" key={status}><div className="wfx-col-head"><strong>{status}</strong><span>{rows.length}</span></div><div className="wfx-cards">{rows.map((row)=><article className="wfx-card" key={row.proposalCode}><div className="wfx-card-top"><strong>{row.proposalCode}</strong><span>{money(row.architecturalAmount)}</span></div><h3>{row.clientName || "Owner"}</h3><p>{row.story || "Story —"} · {row.location || "Location —"}</p><p>Architectural Design</p>{row.extraServices?.length>0&&<div className="wfx-extra">Also quoted: {row.extraServices.join(", ")}</div>}<select value={row.workflowStatus} disabled={busy===`P:${row.proposalCode}`} onChange={(e)=>void updateProposal(row,e.target.value)}>{proposalStatuses.map((s)=><option key={s}>{s}</option>)}</select></article>)}{!rows.length&&<div className="wfx-empty">No proposals.</div>}</div></div>})}</section>
    </> : <>
      <section className="wfx-kpis"><div className="wfx-kpi"><span>Projects with open services</span><strong>{projectCounts.projects}</strong></div><div className="wfx-kpi"><span>Service workflows</span><strong>{workflows.length}</strong></div><div className="wfx-kpi"><span>Active services</span><strong>{projectCounts.active}</strong></div><div className="wfx-kpi"><span>Completed services</span><strong>{projectCounts.completed}</strong></div></section>
      <section className="wfx-project-list">{groupedProjects.map(([projectId, rows])=>{const first=rows[0];return <article className="wfx-project" key={projectId}><header className="wfx-project-head"><div><h2>{projectId} · {first.ownerName || "Owner"} · {first.story || "Story —"}</h2><p>{first.location || "Location —"} · {first.lifecyclePhase || "Project"}</p></div><Link href={`/admin/projects/${encodeURIComponent(projectId)}`}>Open Project →</Link></header><div className="wfx-services">{rows.sort((a,b)=>a.serviceName.localeCompare(b.serviceName)).map((row)=><div className="wfx-service" key={row.id}><div className="wfx-service-name"><strong>{row.serviceName}</strong><span>{row.billingCategory} · Fully paid</span></div><StepTrack statuses={row.statuses||[]} status={row.status}/><div className="wfx-money"><span>Paid / Net</span><strong>{money(row.paidAmount)} / {money(row.netAmount)}</strong></div><select value={row.status} disabled={busy===`S:${row.id}`} onChange={(e)=>void updateService(row,e.target.value)}>{(row.statuses||[]).map((s:string)=><option key={s}>{s}</option>)}</select></div>)}</div></article>})}{!groupedProjects.length&&<div className="wfx-empty">No fully paid project services have opened yet. Allocate a payment in Finance → Service Payments.</div>}</section>
    </>}
  </main>;
}
