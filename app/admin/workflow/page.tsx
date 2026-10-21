"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;
type Mode = "proposal" | "project";

function text(v: unknown) { return String(v ?? "").trim(); }
function money(v: unknown) {
  const n = Number(v || 0);
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);
}
async function parse(response: Response, fallback: string) {
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || fallback));
  return json.data;
}
async function getData(mode: Mode) {
  return parse(await fetch(`/api/service-workflow?mode=${mode}`, { credentials: "same-origin", cache: "no-store" }), "Could not load workflow.");
}
async function post(payload: Row) {
  return parse(await fetch("/api/service-workflow", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }), "Could not update workflow.");
}

function StepTrack({ statuses, status }: { statuses: string[]; status: string }) {
  const current = Math.max(0, statuses.indexOf(status));
  return <div className="wf-track">{statuses.map((item, index) => <div key={item} className={`wf-step ${index < current ? "done" : ""} ${index === current ? "active" : ""}`}><i/><span>{item}</span></div>)}</div>;
}

export default function WorkflowPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const requestedMode: Mode = searchParams.get("mode") === "project" ? "project" : "proposal";
  const [mode, setMode] = useState<Mode>(requestedMode);
  const [data, setData] = useState<Row>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async (nextMode: Mode) => {
    setLoading(true); setError("");
    try { setData(await getData(nextMode)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load workflow."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    setMode(requestedMode);
    setQuery("");
    void load(requestedMode);
  }, [requestedMode, load]);

  function switchMode(next: Mode) {
    if (next === mode) return;
    router.replace(`/admin/workflow?mode=${next}`);
  }

  async function updateProposal(row: Row, status: string) {
    const key = `P:${row.proposalCode}`;
    if (busy) return;
    setBusy(key); setError(""); setMessage("");
    try {
      const updated = await post({ action: "updateProposalStatus", proposalCode: row.proposalCode, itemCode: row.architecturalItemCode, status });
      setData((current) => ({
        ...current,
        proposals: (current.proposals || []).map((item: Row) => item.proposalCode === row.proposalCode
          ? { ...item, workflowStatus: status, updatedAt: updated?.updated_at || item.updatedAt }
          : item),
      }));
      setMessage(`${row.proposalCode} · Architectural Design moved to ${status}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update proposal workflow."); }
    finally { setBusy(""); }
  }

  async function updateService(row: Row, status: string) {
    const key = `S:${row.id}`;
    if (busy) return;
    setBusy(key); setError(""); setMessage("");
    try {
      const updated = await post({ action: "updateProjectServiceStatus", id: row.id, status });
      setData((current) => ({
        ...current,
        workflows: (current.workflows || []).map((item: Row) => item.id === row.id
          ? { ...item, status, updatedAt: updated?.updated_at || item.updatedAt }
          : item),
      }));
      setMessage(`${row.projectId} · ${row.serviceName} moved to ${status}.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update project service workflow."); }
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
    for (const row of projectRows) {
      const list = map.get(row.projectId) || [];
      list.push(row); map.set(row.projectId, list);
    }
    return Array.from(map.entries()).sort((a,b) => b[0].localeCompare(a[0], undefined, { numeric: true }));
  }, [projectRows]);

  const proposalCounts = useMemo(() => Object.fromEntries(proposalStatuses.map((s) => [s, proposals.filter((p) => p.workflowStatus === s).length])), [proposalStatuses, proposals]);
  const completedStatuses = new Set(["Approved", "Delivered", "Delivered to Client"]);
  const projectCounts = useMemo(() => ({
    projects: new Set(workflows.map((r) => r.projectId)).size,
    active: workflows.filter((r) => !completedStatuses.has(r.status)).length,
    completed: workflows.filter((r) => completedStatuses.has(r.status)).length,
  }), [workflows]);

  return <main className="wf-shell">
    <style>{`
      .wf-shell{max-width:1600px;margin:0 auto;color:var(--lv-text-primary)}.wf-shell *{box-sizing:border-box}
      .wf-header{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:14px}.wf-eyebrow{font-size:8px;font-weight:950;letter-spacing:.14em;color:var(--lv-brand-text)}.wf-header h1{margin:4px 0 0;font-size:28px}.wf-header p{margin:5px 0 0;font-size:9px;color:var(--lv-text-secondary);max-width:780px}.wf-actions{display:flex;gap:7px;flex-wrap:wrap}.wf-btn{display:inline-flex;align-items:center;justify-content:center;min-height:37px;padding:0 12px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);text-decoration:none;font-size:8px;font-weight:900;cursor:pointer}.wf-btn.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}
      .wf-switch{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:6px;border:1px solid var(--lv-border-default);border-radius:12px;background:var(--lv-surface-panel);margin-bottom:12px}.wf-switch button{min-height:43px;border:0;border-radius:8px;background:transparent;color:var(--lv-text-secondary);font-size:10px;font-weight:950;cursor:pointer}.wf-switch button.active{background:var(--lv-brand-primary);color:var(--lv-text-inverse);box-shadow:var(--lv-shadow-sm)}.wf-switch button span{display:block;font-size:7px;font-weight:700;opacity:.72;margin-top:2px}
      .wf-search{width:100%;min-height:41px;margin-bottom:12px;padding:0 12px;border:1px solid var(--lv-border-default);border-radius:9px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:9px}.wf-msg{margin-bottom:12px;padding:10px 12px;border-radius:8px;font-size:9px}.wf-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.wf-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}
      .wf-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:13px}.wf-kpi{padding:13px;border:1px solid var(--lv-border-default);border-radius:11px;background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm)}.wf-kpi span{display:block;font-size:7px;text-transform:uppercase;color:var(--lv-text-muted);font-weight:900;letter-spacing:.07em}.wf-kpi strong{display:block;margin-top:6px;font-size:21px}.wf-kpi small{display:block;margin-top:4px;font-size:7px;color:var(--lv-text-muted)}
      .wf-board{display:grid;grid-template-columns:repeat(4,minmax(240px,1fr));gap:10px;overflow:auto}.wf-column{min-width:240px;border:1px solid var(--lv-border-default);border-radius:12px;background:var(--lv-surface-muted);overflow:hidden}.wf-col-head{display:flex;justify-content:space-between;gap:8px;padding:11px 12px;border-top:3px solid var(--lv-brand-primary);border-bottom:1px solid var(--lv-border-default);background:var(--lv-surface-panel)}.wf-col-head strong{font-size:10px}.wf-col-head span{font-size:8px;color:var(--lv-text-muted)}.wf-cards{display:grid;gap:8px;padding:8px}.wf-card{padding:11px;border:1px solid var(--lv-border-default);border-radius:9px;background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm)}.wf-card-top{display:flex;justify-content:space-between;gap:8px}.wf-card-top strong{font-size:10px;color:var(--lv-text-strong)}.wf-card-top span{font-size:8px;font-weight:900;color:var(--lv-brand-text)}.wf-card h3{margin:7px 0 0;font-size:10px}.wf-card p{margin:4px 0 0;font-size:8px;color:var(--lv-text-secondary);line-height:1.45}.wf-card select{width:100%;margin-top:9px;padding:7px;border:1px solid var(--lv-border-default);border-radius:6px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px}.wf-extra{margin-top:8px;padding:7px;border-radius:6px;background:var(--lv-surface-muted);font-size:7px;color:var(--lv-text-muted);line-height:1.4}
      .wf-project-list{display:grid;gap:11px}.wf-project{border:1px solid var(--lv-border-default);border-radius:12px;background:var(--lv-surface-panel);overflow:hidden;box-shadow:var(--lv-shadow-sm)}.wf-project-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 14px;background:var(--lv-surface-muted);border-bottom:1px solid var(--lv-border-default)}.wf-project-head h2{margin:0;font-size:13px}.wf-project-head p{margin:4px 0 0;font-size:8px;color:var(--lv-text-secondary)}.wf-project-head a{font-size:8px;font-weight:900;color:var(--lv-brand-text);text-decoration:none}.wf-services{display:grid}.wf-service{display:grid;grid-template-columns:minmax(190px,.8fr) minmax(430px,1.9fr) 120px 155px;gap:12px;align-items:center;padding:12px 14px;border-bottom:1px solid var(--lv-border-subtle)}.wf-service:last-child{border-bottom:0}.wf-service-name strong{display:block;font-size:9px}.wf-service-name span{display:block;margin-top:4px;font-size:7px;color:var(--lv-text-muted)}.wf-paid{font-size:8px}.wf-paid strong{display:block;font-size:9px;color:var(--lv-success)}.wf-service select{padding:7px;border:1px solid var(--lv-border-default);border-radius:6px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px}.wf-track{display:flex;align-items:flex-start;min-width:420px}.wf-step{position:relative;flex:1;text-align:center}.wf-step:before{content:"";position:absolute;top:5px;left:0;right:0;height:2px;background:var(--lv-border-default)}.wf-step:first-child:before{left:50%}.wf-step:last-child:before{right:50%}.wf-step i{position:relative;z-index:1;display:block;width:11px;height:11px;margin:0 auto 5px;border:2px solid var(--lv-border-default);border-radius:50%;background:var(--lv-surface-panel)}.wf-step span{display:block;font-size:6px;color:var(--lv-text-muted);line-height:1.2}.wf-step.done:before,.wf-step.active:before{background:var(--lv-success)}.wf-step.done i{border-color:var(--lv-success);background:var(--lv-success)}.wf-step.active i{border-color:var(--lv-brand-primary);background:var(--lv-brand-primary)}.wf-step.active span{color:var(--lv-brand-text);font-weight:900}.wf-empty{padding:28px;text-align:center;color:var(--lv-text-muted);font-size:9px}
      @media(max-width:1100px){.wf-board{grid-template-columns:repeat(2,minmax(260px,1fr))}.wf-service{grid-template-columns:1fr}.wf-track{min-width:0;overflow:auto}.wf-kpis{grid-template-columns:repeat(2,1fr)}}@media(max-width:650px){.wf-header{align-items:flex-start;flex-direction:column}.wf-board,.wf-kpis{grid-template-columns:1fr}.wf-actions{width:100%}.wf-btn{flex:1}.wf-switch{grid-template-columns:1fr}}
    `}</style>

    <header className="wf-header">
      <div><div className="wf-eyebrow">LAND VIEW · WORKFLOW ENGINE</div><h1>{mode === "proposal" ? "Proposal Workflow" : "Project Workflow"}</h1><p>{mode === "proposal" ? "Only Architectural Design is tracked during proposal work. Other quoted services remain available for proposal creation but do not enter workflow until the project is billed and paid." : "Project services open automatically from billing. A service enters this workflow only after its net billed amount is fully paid."}</p></div>
      <div className="wf-actions"><Link className="wf-btn" href="/admin/finance/service-payments">Pay / Allocate Services</Link><Link className="wf-btn primary" href={mode === "proposal" ? "/admin/proposals/new" : "/admin/projects"}>{mode === "proposal" ? "+ New Proposal" : "Open Projects"}</Link></div>
    </header>

    <div className="wf-switch">
      <button className={mode === "proposal" ? "active" : ""} onClick={() => switchMode("proposal")}>Proposal Workflow<span>Architectural Design only</span></button>
      <button className={mode === "project" ? "active" : ""} onClick={() => switchMode("project")}>Project Workflow<span>Paid services from billing</span></button>
    </div>

    <input className="wf-search" type="search" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder={mode === "proposal" ? "Search proposal ID, owner, story, location…" : "Search project ID, owner, story, service, billing category or status…"}/>
    {error && <div className="wf-msg bad">{error}</div>}{message && <div className="wf-msg good">{message}</div>}

    {loading ? <div className="wf-empty">Loading workflow…</div> : mode === "proposal" ? <>
      <section className="wf-kpis">{proposalStatuses.map((status)=><div className="wf-kpi" key={status}><span>{status}</span><strong>{proposalCounts[status] || 0}</strong><small>Architectural Design</small></div>)}</section>
      <section className="wf-board">{proposalStatuses.map((status)=>{const rows=proposalRows.filter((p)=>p.workflowStatus===status);return <div className="wf-column" key={status}><div className="wf-col-head"><strong>{status}</strong><span>{rows.length}</span></div><div className="wf-cards">{rows.map((row)=><article className="wf-card" key={row.proposalCode}><div className="wf-card-top"><strong>{row.proposalCode}</strong><span>{money(row.architecturalAmount)}</span></div><h3>{row.clientName || "Owner"}</h3><p>{row.story || "Story —"} · {row.location || "Location —"}</p><p><b>Architectural Design</b></p>{row.extraServices?.length>0&&<div className="wf-extra">Other quoted services: {row.extraServices.join(", ")}</div>}<select value={row.workflowStatus} disabled={busy===`P:${row.proposalCode}`} onChange={(e)=>void updateProposal(row,e.target.value)}>{proposalStatuses.map((s)=><option key={s}>{s}</option>)}</select></article>)}{!rows.length&&<div className="wf-empty">No proposals.</div>}</div></div>})}</section>
    </> : <>
      <section className="wf-kpis"><div className="wf-kpi"><span>Projects</span><strong>{projectCounts.projects}</strong><small>With paid services opened</small></div><div className="wf-kpi"><span>Service Workflows</span><strong>{workflows.length}</strong><small>All activated services</small></div><div className="wf-kpi"><span>Active Services</span><strong>{projectCounts.active}</strong><small>Still in progress</small></div><div className="wf-kpi"><span>Completed Services</span><strong>{projectCounts.completed}</strong><small>Approved / delivered</small></div></section>
      <section className="wf-project-list">{groupedProjects.map(([projectId, rows])=>{const first=rows[0];return <article className="wf-project" key={projectId}><header className="wf-project-head"><div><h2>{projectId} · {first.ownerName || "Owner"} · {first.story || "Story —"}</h2><p>{first.location || "Location —"} · {rows.length} service workflow{rows.length===1?"":"s"}</p></div><Link href={`/admin/projects/${encodeURIComponent(projectId)}`}>Open Project →</Link></header><div className="wf-services">{rows.map((row)=><div className="wf-service" key={row.id}><div className="wf-service-name"><strong>{row.serviceName}</strong><span>{row.billingCategory}</span></div><StepTrack statuses={row.statuses || []} status={row.status}/><div className="wf-paid"><span>Fully paid</span><strong>{money(row.paidAmount)}</strong></div><select value={row.status} disabled={busy===`S:${row.id}`} onChange={(e)=>void updateService(row,e.target.value)}>{(row.statuses||[]).map((s:string)=><option key={s}>{s}</option>)}</select></div>)}</div></article>})}{!groupedProjects.length&&<div className="wf-empty">No paid service workflows yet. Use Finance → Service Payments. Once a billed service is fully paid, it opens here automatically.</div>}</section>
    </>}
  </main>;
}