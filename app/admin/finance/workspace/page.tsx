"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;
type ProjectOption = { projectId: string; ownerName: string; projectName: string; lifecyclePhase: string; location: string };

function money(value: unknown) {
  const n = Number(value || 0);
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);
}
function dateTime(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
async function readJson(response: Response, fallback: string) {
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || fallback));
  return json.data;
}
async function getProjects() {
  return readJson(await fetch("/api/billing/project-workspace?mode=projects", { credentials: "same-origin", cache: "no-store" }), "Could not load projects.");
}
async function getWorkspace(projectId: string) {
  return readJson(await fetch(`/api/billing/project-workspace?projectId=${encodeURIComponent(projectId)}`, { credentials: "same-origin", cache: "no-store" }), "Could not load Billing 2.0 workspace.");
}
async function postAction(payload: Row) {
  return readJson(await fetch("/api/billing/project-workspace", {
    method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  }), "Billing action failed.");
}
function statusClass(status: string) {
  const value = status.toLowerCase();
  if (value === "paid" || value.includes("invoiced") && !value.includes("partially")) return "good";
  if (value.includes("ready")) return "ready";
  if (value.includes("partially")) return "warn";
  return "neutral";
}

export default function BillingWorkspacePage() {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState<Row | null>(null);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<"services" | "schedule" | "activity">("services");

  useEffect(() => {
    let active = true;
    setLoadingProjects(true);
    getProjects().then((result) => {
      if (!active) return;
      setProjects(result.projects || []);
      const params = new URLSearchParams(window.location.search);
      const requested = params.get("fileId") || params.get("projectId") || "";
      if (requested) setProjectId(requested.toUpperCase());
    }).catch((e) => active && setError(e instanceof Error ? e.message : "Could not load projects."))
      .finally(() => active && setLoadingProjects(false));
    return () => { active = false; };
  }, []);

  async function load(id = projectId) {
    const normalized = String(id || "").trim().toUpperCase();
    if (!normalized) return setError("Choose a project first.");
    setProjectId(normalized); setLoading(true); setError(""); setMessage("");
    try {
      const next = await getWorkspace(normalized);
      setData(next);
      const url = new URL(window.location.href);
      url.searchParams.set("fileId", normalized);
      window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
    } catch (e) {
      setData(null); setError(e instanceof Error ? e.message : "Could not load Billing 2.0 workspace.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (projectId && !data && !loading && !loadingProjects) void load(projectId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingProjects]);

  async function act(action: "issueMilestone" | "markMilestoneReady", milestone: Row) {
    if (!data?.project?.projectCode || !milestone?.id || busy) return;
    if (action === "issueMilestone") {
      const confirmed = window.confirm(`Issue ${milestone.milestone_name} for ${milestone.service_name}?\n\nAmount: ${money(milestone.net_amount)}\n\nThis creates a normal LAND VIEW bill and makes it available to the existing payment and ledger workflow.`);
      if (!confirmed) return;
    }
    setBusy(String(milestone.id)); setError(""); setMessage("");
    try {
      const next = await postAction({ action, projectId: data.project.projectCode, milestoneId: milestone.id });
      setData(next);
      setMessage(action === "issueMilestone" ? `${milestone.service_name} · ${milestone.milestone_name} issued successfully.` : `${milestone.service_name} · ${milestone.milestone_name} is ready to bill.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Billing action failed."); }
    finally { setBusy(""); }
  }

  async function closeContract() {
    if (!data?.project?.projectCode || busy) return;
    const confirmed = window.confirm(`Financially close ${data.project.projectCode}?\n\nThis is allowed only after the operational project is Completed, all contract value is billed, and current due is zero.`);
    if (!confirmed) return;
    setBusy("financial-close"); setError(""); setMessage("");
    try {
      const next = await postAction({ action: "closeContract", projectId: data.project.projectCode });
      setData(next); setMessage(`${data.project.projectCode} is financially closed.`);
    } catch (e) { setError(e instanceof Error ? e.message : "Financial close failed."); }
    finally { setBusy(""); }
  }

  const allMilestones = useMemo(() => {
    const services: Row[] = data?.services || [];
    return services.flatMap((service) => (service.milestones || []).map((milestone: Row) => ({ ...milestone, service })))
      .sort((a, b) => String(a.service?.serviceName || "").localeCompare(String(b.service?.serviceName || "")) || Number(a.sequence_no || 0) - Number(b.sequence_no || 0));
  }, [data]);
  const readyMilestones = useMemo(() => allMilestones.filter((row) => String(row.status).toLowerCase() === "ready_to_bill"), [allMilestones]);
  const totals = data?.totals || { contract: 0, billed: 0, paid: 0, due: 0, unbilled: 0, readyToBill: 0 };
  const project = data?.project || {};
  const financialCloseStatus = String(data?.financialCloseStatus || "Open");
  const canCloseFinancially = String(project.lifecyclePhase || "").toLowerCase() === "completed" && financialCloseStatus !== "Closed" && Number(totals.due || 0) <= .01 && Number(totals.unbilled || 0) <= .01 && Number(totals.readyToBill || 0) <= .01;

  return <main className="b2-shell">
    <style>{`
      .b2-shell{max-width:1500px;margin:0 auto;color:var(--lv-text-primary)}.b2-shell *{box-sizing:border-box}
      .b2-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:14px}.b2-head small{display:block;font-size:8px;font-weight:950;letter-spacing:.13em;color:var(--lv-brand-text)}.b2-head h1{margin:5px 0 0;font-size:28px}.b2-head p{margin:5px 0 0;font-size:10px;color:var(--lv-text-secondary);max-width:760px}.b2-head-actions{display:flex;gap:7px;flex-wrap:wrap}.b2-btn{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 12px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:10px;font-weight:900;text-decoration:none;cursor:pointer}.b2-btn.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.b2-btn.success{background:var(--lv-success-soft);border-color:var(--lv-success-border);color:var(--lv-success)}.b2-btn:disabled{opacity:.5;cursor:default}
      .b2-picker{display:grid;grid-template-columns:minmax(280px,1.5fr) auto;gap:8px;padding:12px;margin-bottom:12px;border:1px solid var(--lv-border-default);border-radius:11px;background:var(--lv-surface-panel)}.b2-picker label{display:grid;gap:5px;font-size:8px;font-weight:900;text-transform:uppercase;color:var(--lv-text-muted)}.b2-picker input{width:100%;min-height:40px;padding:8px 11px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:10px}
      .b2-msg{margin-bottom:12px;padding:10px 12px;border-radius:8px;font-size:10px}.b2-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.b2-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}
      .b2-project{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:13px 14px;margin-bottom:10px;border:1px solid var(--lv-border-default);border-radius:11px;background:var(--lv-surface-panel)}.b2-project strong{display:block;font-size:17px}.b2-project span{display:block;margin-top:4px;font-size:9px;color:var(--lv-text-muted)}.b2-project-meta{text-align:right}.b2-project-meta .badges{display:flex;gap:5px;justify-content:flex-end;flex-wrap:wrap}.b2-project-meta b{display:inline-flex;padding:5px 8px;border-radius:999px;background:var(--lv-brand-soft);color:var(--lv-brand-text);font-size:9px}.b2-project-meta b.finance{background:var(--lv-surface-muted);color:var(--lv-text-secondary)}.b2-project-meta b.finance.closed{background:var(--lv-success-soft);color:var(--lv-success)}.b2-project-meta b.finance.open{background:var(--lv-warning-soft);color:var(--lv-warning)}.b2-project-meta small{display:block;margin-top:5px;font-size:8px;color:var(--lv-text-muted)}
      .b2-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:12px}.b2-kpi{padding:12px;border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-panel)}.b2-kpi span{display:block;font-size:7px;font-weight:900;text-transform:uppercase;color:var(--lv-text-muted)}.b2-kpi strong{display:block;margin-top:6px;font-size:17px}.b2-kpi.due strong{color:var(--lv-danger)}.b2-kpi.ready strong{color:var(--lv-brand-primary)}.b2-kpi.paid strong{color:var(--lv-success)}
      .b2-alert{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px 13px;margin-bottom:12px;border:1px solid var(--lv-brand-border);border-radius:9px;background:var(--lv-brand-soft)}.b2-alert strong{font-size:11px}.b2-alert span{display:block;margin-top:3px;font-size:8px;color:var(--lv-text-secondary)}.b2-alert.close{border-color:var(--lv-success-border);background:var(--lv-success-soft)}
      .b2-tabs{display:flex;gap:6px;margin-bottom:9px}.b2-tab{min-height:35px;padding:0 11px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-panel);color:var(--lv-text-secondary);font-size:9px;font-weight:900;cursor:pointer}.b2-tab.active{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}
      .b2-table-wrap{overflow:auto;border:1px solid var(--lv-border-default);border-radius:11px;background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm)}.b2-table{width:100%;border-collapse:collapse;min-width:1100px}.b2-table th{padding:10px 11px;background:var(--lv-surface-muted);border-bottom:1px solid var(--lv-border-default);font-size:8px;text-align:left;text-transform:uppercase;color:var(--lv-text-muted)}.b2-table td{padding:11px;border-bottom:1px solid var(--lv-border-subtle);font-size:9px;vertical-align:middle}.b2-table tr:last-child td{border-bottom:0}.b2-service strong{display:block;font-size:10px}.b2-service span{display:block;margin-top:3px;font-size:8px;color:var(--lv-text-muted)}.b2-status{display:inline-flex;padding:5px 7px;border-radius:999px;font-size:8px;font-weight:950}.b2-status.good{background:var(--lv-success-soft);color:var(--lv-success)}.b2-status.ready{background:var(--lv-brand-soft);color:var(--lv-brand-text)}.b2-status.warn{background:var(--lv-warning-soft);color:var(--lv-warning)}.b2-status.neutral{background:var(--lv-surface-muted);color:var(--lv-text-secondary)}.b2-money strong{display:block;font-size:10px}.b2-money span{display:block;margin-top:2px;font-size:7px;color:var(--lv-text-muted)}.b2-next strong{display:block;font-size:9px}.b2-next span{display:block;margin-top:3px;font-size:7px;color:var(--lv-text-muted)}.b2-row-actions{display:flex;justify-content:flex-end;gap:5px}.b2-small{min-height:30px;padding:0 8px;border:1px solid var(--lv-border-default);border-radius:6px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px;font-weight:900;cursor:pointer}.b2-small.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}
      .b2-expand td{padding:0;background:var(--lv-surface-muted)}.b2-milestones{padding:10px 12px;display:grid;gap:6px}.b2-milestone{display:grid;grid-template-columns:42px minmax(170px,1fr) minmax(140px,.8fr) 115px 110px minmax(120px,.7fr);align-items:center;gap:8px;padding:8px 9px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-panel)}.b2-milestone b{font-size:9px}.b2-milestone small{font-size:7px;color:var(--lv-text-muted)}.b2-milestone .seq{width:28px;height:28px;display:grid;place-items:center;border-radius:50%;background:var(--lv-surface-muted);font-size:8px;font-weight:950}
      .b2-activity{display:grid;gap:7px}.b2-event{display:grid;grid-template-columns:150px 160px 1fr 120px;gap:10px;padding:10px 11px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-panel);font-size:8px}.b2-event strong{font-size:9px}.b2-empty{padding:30px;text-align:center;color:var(--lv-text-muted);font-size:10px}
      @media(max-width:1100px){.b2-kpis{grid-template-columns:repeat(3,1fr)}}@media(max-width:700px){.b2-head,.b2-project{flex-direction:column;align-items:stretch}.b2-head-actions{width:100%}.b2-head-actions .b2-btn{flex:1}.b2-project-meta{text-align:left}.b2-project-meta .badges{justify-content:flex-start}.b2-kpis{grid-template-columns:repeat(2,1fr)}.b2-picker{grid-template-columns:1fr}.b2-alert{align-items:flex-start;flex-direction:column}.b2-milestone{grid-template-columns:36px 1fr}.b2-event{grid-template-columns:1fr}.b2-tabs{display:grid;grid-template-columns:repeat(3,1fr)}}
    `}</style>

    <header className="b2-head"><div><small>LAND VIEW / BILLING 2.0</small><h1>Workflow-Driven Billing</h1><p>One commercial workspace linking the project contract, service workflow, billing milestones, issued bills, payments, due and future unbilled revenue.</p></div><div className="b2-head-actions">
      {project.projectCode && <Link className="b2-btn" href={`/admin/project-operations/by-project?projectId=${encodeURIComponent(project.projectCode)}`}>Project Workflow</Link>}
      {project.projectCode && <Link className="b2-btn" href={`/admin/finance/service-payments?fileId=${encodeURIComponent(project.projectCode)}`}>Receive Payment</Link>}
      {project.projectCode && <Link className="b2-btn primary" href={`/admin/finance/invoices?fileId=${encodeURIComponent(project.projectCode)}`}>Invoice / Statement</Link>}
    </div></header>

    <section className="b2-picker"><label>Project / File ID<input list="billing-v2-projects" value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder={loadingProjects ? "Loading projects…" : "LV-157"} onKeyDown={(e) => { if (e.key === "Enter") void load(); }} /><datalist id="billing-v2-projects">{projects.map((item) => <option key={item.projectId} value={item.projectId}>{item.ownerName || item.projectName}</option>)}</datalist></label><button className="b2-btn primary" disabled={loading || loadingProjects} onClick={() => void load()}>{loading ? "Loading…" : "Open Billing Workspace"}</button></section>

    {error && <div className="b2-msg bad">{error}</div>}{message && <div className="b2-msg good">{message}</div>}
    {!data && !loading && <div className="b2-empty">Choose a LAND VIEW project to open its commercial workflow.</div>}
    {data && <>
      <section className="b2-project"><div><strong>{project.projectCode} · {project.ownerName || project.projectName}</strong><span>{[project.projectName !== project.ownerName ? project.projectName : "", project.location].filter(Boolean).join(" · ") || "Project details"}</span></div><div className="b2-project-meta"><div className="badges"><b>{project.lifecyclePhase || "Active"}</b><b className={`finance ${financialCloseStatus === "Closed" ? "closed" : financialCloseStatus === "Financially Open" ? "open" : ""}`}>{financialCloseStatus === "Closed" ? "Financially Closed" : financialCloseStatus}</b></div><small>{project.proposalCode ? `Contract source: ${project.proposalCode}` : "Legacy / direct contract"}</small></div></section>
      <section className="b2-kpis"><div className="b2-kpi"><span>Contract Net</span><strong>{money(totals.contract)}</strong></div><div className="b2-kpi"><span>Billed</span><strong>{money(totals.billed)}</strong></div><div className="b2-kpi paid"><span>Paid</span><strong>{money(totals.paid)}</strong></div><div className="b2-kpi due"><span>Current Due</span><strong>{money(totals.due)}</strong></div><div className="b2-kpi"><span>Unbilled</span><strong>{money(totals.unbilled)}</strong></div><div className="b2-kpi ready"><span>Ready to Bill</span><strong>{money(totals.readyToBill)}</strong></div></section>
      {readyMilestones.length > 0 && <section className="b2-alert"><div><strong>{readyMilestones.length} billing milestone{readyMilestones.length === 1 ? " is" : "s are"} ready</strong><span>Workflow has reached the required stage. Review and issue the bill when appropriate.</span></div><button className="b2-btn primary" onClick={() => setTab("schedule")}>Review Ready Bills</button></section>}
      {canCloseFinancially && <section className="b2-alert close"><div><strong>Project is ready for financial close</strong><span>Operational project is completed, all contract value is billed, and no current due remains.</span></div><button className="b2-btn success" disabled={busy === "financial-close"} onClick={() => void closeContract()}>{busy === "financial-close" ? "Closing…" : "Close Financial Contract"}</button></section>}
      {String(project.lifecyclePhase || "").toLowerCase() === "completed" && financialCloseStatus === "Financially Open" && !canCloseFinancially && <section className="b2-alert"><div><strong>Operationally completed · financially open</strong><span>Resolve remaining due, unbilled value or ready milestones before financial close.</span></div></section>}

      <div className="b2-tabs"><button className={`b2-tab ${tab === "services" ? "active" : ""}`} onClick={() => setTab("services")}>Services</button><button className={`b2-tab ${tab === "schedule" ? "active" : ""}`} onClick={() => setTab("schedule")}>Billing Schedule</button><button className={`b2-tab ${tab === "activity" ? "active" : ""}`} onClick={() => setTab("activity")}>Activity</button></div>

      {tab === "services" && <div className="b2-table-wrap"><table className="b2-table"><thead><tr><th>Service</th><th>Workflow</th><th>Finance</th><th>Contract</th><th>Billed</th><th>Paid</th><th>Due</th><th>Unbilled</th><th>Next Billing Trigger</th><th style={{textAlign:"right"}}>Action</th></tr></thead><tbody>{(data.services || []).map((service: Row) => {
        const open = expanded === service.id; const next = service.nextMilestone;
        return <Fragment key={service.id}><tr><td className="b2-service"><strong>{service.serviceName}</strong><span>{service.billingCategory}</span></td><td><span className="b2-status neutral">{service.workflowStatus}</span></td><td><span className={`b2-status ${statusClass(service.financeStatus)}`}>{service.financeStatus}</span></td><td className="b2-money"><strong>{money(service.contractNet)}</strong><span>{service.startGate}</span></td><td>{money(service.billedNet)}</td><td>{money(service.paid)}</td><td>{money(service.due)}</td><td>{money(service.unbilled)}</td><td className="b2-next">{next ? <><strong>{next.milestone_name}</strong><span>{next.trigger_status} · {money(next.net_amount)}</span></> : <span>All milestones issued</span>}</td><td><div className="b2-row-actions"><button className="b2-small" onClick={() => setExpanded(open ? null : service.id)}>{open ? "Close" : "Milestones"}</button></div></td></tr>
        {open && <tr className="b2-expand"><td colSpan={10}><div className="b2-milestones">{(service.milestones || []).map((milestone: Row) => <div className="b2-milestone" key={milestone.id}><span className="seq">{milestone.sequence_no}</span><div><b>{milestone.milestone_name}</b><br/><small>{milestone.trigger_status}</small></div><span className={`b2-status ${String(milestone.status).toLowerCase() === "ready_to_bill" ? "ready" : String(milestone.status).toLowerCase() === "invoiced" ? "good" : "neutral"}`}>{String(milestone.status).replaceAll("_", " ")}</span><b>{money(milestone.net_amount)}</b><small>{Number(milestone.percentage || 0) * 100}%</small><div className="b2-row-actions">{String(milestone.status).toLowerCase() === "ready_to_bill" && <button className="b2-small primary" disabled={busy === milestone.id} onClick={() => void act("issueMilestone", milestone)}>{busy === milestone.id ? "Issuing…" : "Issue Bill"}</button>}{String(milestone.status).toLowerCase() === "scheduled" && <button className="b2-small" disabled={busy === milestone.id} onClick={() => void act("markMilestoneReady", milestone)}>Mark Ready</button>}{milestone.bill_code && <span><small>{milestone.bill_code}</small></span>}</div></div>)}</div></td></tr>}</Fragment>;
      })}</tbody></table></div>}

      {tab === "schedule" && <div className="b2-table-wrap"><table className="b2-table"><thead><tr><th>#</th><th>Service</th><th>Milestone</th><th>Workflow Trigger</th><th>Status</th><th>Gross</th><th>Discount</th><th>Net</th><th>Ready / Issued</th><th style={{textAlign:"right"}}>Action</th></tr></thead><tbody>{allMilestones.map((milestone: Row) => <tr key={milestone.id}><td>{milestone.sequence_no}</td><td className="b2-service"><strong>{milestone.service_name}</strong><span>{milestone.billing_category}</span></td><td><strong>{milestone.milestone_name}</strong></td><td>{milestone.trigger_status}</td><td><span className={`b2-status ${String(milestone.status).toLowerCase() === "ready_to_bill" ? "ready" : String(milestone.status).toLowerCase() === "invoiced" ? "good" : "neutral"}`}>{String(milestone.status).replaceAll("_", " ")}</span></td><td>{money(milestone.gross_amount)}</td><td>{money(milestone.discount_amount)}</td><td><strong>{money(milestone.net_amount)}</strong></td><td>{milestone.issued_at ? dateTime(milestone.issued_at) : milestone.ready_at ? dateTime(milestone.ready_at) : "—"}</td><td><div className="b2-row-actions">{String(milestone.status).toLowerCase() === "ready_to_bill" && <button className="b2-small primary" disabled={busy === milestone.id} onClick={() => void act("issueMilestone", milestone)}>{busy === milestone.id ? "Issuing…" : "Issue Bill"}</button>}{String(milestone.status).toLowerCase() === "scheduled" && <button className="b2-small" disabled={busy === milestone.id} onClick={() => void act("markMilestoneReady", milestone)}>Mark Ready</button>}{milestone.bill_code && <span><small>{milestone.bill_code}</small></span>}</div></td></tr>)}</tbody></table></div>}

      {tab === "activity" && <div className="b2-activity">{(data.events || []).length ? (data.events || []).map((event: Row) => <div className="b2-event" key={event.id}><span>{dateTime(event.created_at)}</span><strong>{String(event.event_type || "Event").replaceAll("_", " ")}</strong><span>{[event.service_name, event.workflow_status].filter(Boolean).join(" · ") || "Project commercial activity"}</span><strong>{event.amount ? money(event.amount) : "—"}</strong></div>) : <div className="b2-empty">No Billing 2.0 activity yet.</div>}</div>}
    </>}
  </main>;
}