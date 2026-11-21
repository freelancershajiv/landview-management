"use client";
import "./billing-workspace.css";

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
    

    <header className="b2-head"><div><small>LAND VIEW / BILLING 2.0</small><h1>Workflow-Driven Billing</h1><p>One commercial workspace linking the project contract, service workflow, billing milestones, issued bills, payments, due and future unbilled revenue.</p></div><div className="b2-head-actions">
      {project.projectCode && <Link className="b2-btn" data-lv-button="secondary" href={`/admin/project-operations/by-project?projectId=${encodeURIComponent(project.projectCode)}`}>Project Workflow</Link>}
      {project.projectCode && <Link className="b2-btn" data-lv-button="secondary" href={`/admin/finance/service-payments?fileId=${encodeURIComponent(project.projectCode)}`}>Receive Payment</Link>}
      {project.projectCode && <Link className="b2-btn primary" data-lv-button="primary" href={`/admin/finance/invoices?fileId=${encodeURIComponent(project.projectCode)}`}>Invoice / Statement</Link>}
    </div></header>

    <section className="b2-picker"><label>Project / File ID<input list="billing-v2-projects" value={projectId} onChange={(e) => setProjectId(e.target.value)} placeholder={loadingProjects ? "Loading projects…" : "LV-157"} onKeyDown={(e) => { if (e.key === "Enter") void load(); }} /><datalist id="billing-v2-projects">{projects.map((item) => <option key={item.projectId} value={item.projectId}>{item.ownerName || item.projectName}</option>)}</datalist></label><button className="b2-btn primary" data-lv-button="primary" disabled={loading || loadingProjects} onClick={() => void load()}>{loading ? "Loading…" : "Open Billing Workspace"}</button></section>

    {error && <div className="b2-msg bad">{error}</div>}{message && <div className="b2-msg good">{message}</div>}
    {!data && !loading && <div className="b2-empty">Choose a LAND VIEW project to open its commercial workflow.</div>}
    {data && <>
      <section className="b2-project"><div><strong>{project.projectCode} · {project.ownerName || project.projectName}</strong><span>{[project.projectName !== project.ownerName ? project.projectName : "", project.location].filter(Boolean).join(" · ") || "Project details"}</span></div><div className="b2-project-meta"><div className="badges"><b>{project.lifecyclePhase || "Active"}</b><b className={`finance ${financialCloseStatus === "Closed" ? "closed" : financialCloseStatus === "Financially Open" ? "open" : ""}`}>{financialCloseStatus === "Closed" ? "Financially Closed" : financialCloseStatus}</b></div><small>{project.proposalCode ? `Contract source: ${project.proposalCode}` : "Legacy / direct contract"}</small></div></section>
      <section className="b2-kpis"><div className="b2-kpi"><span>Contract Net</span><strong>{money(totals.contract)}</strong></div><div className="b2-kpi"><span>Billed</span><strong>{money(totals.billed)}</strong></div><div className="b2-kpi paid"><span>Paid</span><strong>{money(totals.paid)}</strong></div><div className="b2-kpi due"><span>Current Due</span><strong>{money(totals.due)}</strong></div><div className="b2-kpi"><span>Unbilled</span><strong>{money(totals.unbilled)}</strong></div><div className="b2-kpi ready"><span>Ready to Bill</span><strong>{money(totals.readyToBill)}</strong></div></section>
      {readyMilestones.length > 0 && <section className="b2-alert"><div><strong>{readyMilestones.length} billing milestone{readyMilestones.length === 1 ? " is" : "s are"} ready</strong><span>Workflow has reached the required stage. Review and issue the bill when appropriate.</span></div><button className="b2-btn primary" data-lv-button="primary" onClick={() => setTab("schedule")}>Review Ready Bills</button></section>}
      {canCloseFinancially && <section className="b2-alert close"><div><strong>Project is ready for financial close</strong><span>Operational project is completed, all contract value is billed, and no current due remains.</span></div><button className="b2-btn success" data-lv-button="success" disabled={busy === "financial-close"} onClick={() => void closeContract()}>{busy === "financial-close" ? "Closing…" : "Close Financial Contract"}</button></section>}
      {String(project.lifecyclePhase || "").toLowerCase() === "completed" && financialCloseStatus === "Financially Open" && !canCloseFinancially && <section className="b2-alert"><div><strong>Operationally completed · financially open</strong><span>Resolve remaining due, unbilled value or ready milestones before financial close.</span></div></section>}

      <div className="b2-tabs"><button className={`b2-tab ${tab === "services" ? "active" : ""}`} data-lv-button={tab==="services"?"primary":"secondary"} aria-pressed={tab==="services"} onClick={() => setTab("services")}>Services</button><button className={`b2-tab ${tab === "schedule" ? "active" : ""}`} data-lv-button={tab==="schedule"?"primary":"secondary"} aria-pressed={tab==="schedule"} onClick={() => setTab("schedule")}>Billing Schedule</button><button className={`b2-tab ${tab === "activity" ? "active" : ""}`} data-lv-button={tab==="activity"?"primary":"secondary"} aria-pressed={tab==="activity"} onClick={() => setTab("activity")}>Activity</button></div>

      {tab === "services" && <div className="b2-table-wrap"><table role="table" data-mobile-table="" className="b2-table"><thead role="rowgroup"><tr role="row"><th role="columnheader">Service</th><th role="columnheader">Workflow</th><th role="columnheader">Finance</th><th role="columnheader">Contract</th><th role="columnheader">Billed</th><th role="columnheader">Paid</th><th role="columnheader">Due</th><th role="columnheader">Unbilled</th><th role="columnheader">Next Billing Trigger</th><th role="columnheader" style={{textAlign:"right"}}>Action</th></tr></thead><tbody role="rowgroup">{(data.services || []).map((service: Row) => {
        const open = expanded === service.id; const next = service.nextMilestone;
        return <Fragment key={service.id}><tr role="row"><td role="cell" data-mobile-label="Service" className="b2-service"><strong>{service.serviceName}</strong><span>{service.billingCategory}</span></td><td role="cell" data-mobile-label="Workflow"><span className="b2-status neutral">{service.workflowStatus}</span></td><td role="cell" data-mobile-label="Finance"><span className={`b2-status ${statusClass(service.financeStatus)}`}>{service.financeStatus}</span></td><td role="cell" data-mobile-label="Contract" className="b2-money"><strong>{money(service.contractNet)}</strong><span>{service.startGate}</span></td><td role="cell" data-mobile-label="Billed">{money(service.billedNet)}</td><td role="cell" data-mobile-label="Paid">{money(service.paid)}</td><td role="cell" data-mobile-label="Due">{money(service.due)}</td><td role="cell" data-mobile-label="Unbilled">{money(service.unbilled)}</td><td role="cell" data-mobile-label="Next Billing Trigger" className="b2-next">{next ? <><strong>{next.milestone_name}</strong><span>{next.trigger_status} · {money(next.net_amount)}</span></> : <span>All milestones issued</span>}</td><td role="cell" data-mobile-label="Action"><div className="b2-row-actions"><button className="b2-small" onClick={() => setExpanded(open ? null : service.id)}>{open ? "Close" : "Milestones"}</button></div></td></tr>
        {open && <tr role="row" className="b2-expand"><td role="cell" colSpan={10}><div className="b2-milestones">{(service.milestones || []).map((milestone: Row) => <div className="b2-milestone" key={milestone.id}><span className="seq">{milestone.sequence_no}</span><div><b>{milestone.milestone_name}</b><br/><small>{milestone.trigger_status}</small></div><span className={`b2-status ${String(milestone.status).toLowerCase() === "ready_to_bill" ? "ready" : String(milestone.status).toLowerCase() === "invoiced" ? "good" : "neutral"}`}>{String(milestone.status).replaceAll("_", " ")}</span><b>{money(milestone.net_amount)}</b><small>{Number(milestone.percentage || 0) * 100}%</small><div className="b2-row-actions">{String(milestone.status).toLowerCase() === "ready_to_bill" && <button className="b2-small primary" data-lv-button="primary" disabled={busy === milestone.id} onClick={() => void act("issueMilestone", milestone)}>{busy === milestone.id ? "Issuing…" : "Issue Bill"}</button>}{String(milestone.status).toLowerCase() === "scheduled" && <button className="b2-small" disabled={busy === milestone.id} onClick={() => void act("markMilestoneReady", milestone)}>Mark Ready</button>}{milestone.bill_code && <span><small>{milestone.bill_code}</small></span>}</div></div>)}</div></td></tr>}</Fragment>;
      })}</tbody></table></div>}

      {tab === "schedule" && <div className="b2-table-wrap"><table role="table" data-mobile-table="" className="b2-table"><thead role="rowgroup"><tr role="row"><th role="columnheader">#</th><th role="columnheader">Service</th><th role="columnheader">Milestone</th><th role="columnheader">Workflow Trigger</th><th role="columnheader">Status</th><th role="columnheader">Gross</th><th role="columnheader">Discount</th><th role="columnheader">Net</th><th role="columnheader">Ready / Issued</th><th role="columnheader" style={{textAlign:"right"}}>Action</th></tr></thead><tbody role="rowgroup">{allMilestones.map((milestone: Row) => <tr role="row" key={milestone.id}><td role="cell" data-mobile-label="#">{milestone.sequence_no}</td><td role="cell" data-mobile-label="Service" className="b2-service"><strong>{milestone.service_name}</strong><span>{milestone.billing_category}</span></td><td role="cell" data-mobile-label="Milestone"><strong>{milestone.milestone_name}</strong></td><td role="cell" data-mobile-label="Workflow Trigger">{milestone.trigger_status}</td><td role="cell" data-mobile-label="Status"><span className={`b2-status ${String(milestone.status).toLowerCase() === "ready_to_bill" ? "ready" : String(milestone.status).toLowerCase() === "invoiced" ? "good" : "neutral"}`}>{String(milestone.status).replaceAll("_", " ")}</span></td><td role="cell" data-mobile-label="Gross">{money(milestone.gross_amount)}</td><td role="cell" data-mobile-label="Discount">{money(milestone.discount_amount)}</td><td role="cell" data-mobile-label="Net"><strong>{money(milestone.net_amount)}</strong></td><td role="cell" data-mobile-label="Ready / Issued">{milestone.issued_at ? dateTime(milestone.issued_at) : milestone.ready_at ? dateTime(milestone.ready_at) : "—"}</td><td role="cell" data-mobile-label="Action"><div className="b2-row-actions">{String(milestone.status).toLowerCase() === "ready_to_bill" && <button className="b2-small primary" data-lv-button="primary" disabled={busy === milestone.id} onClick={() => void act("issueMilestone", milestone)}>{busy === milestone.id ? "Issuing…" : "Issue Bill"}</button>}{String(milestone.status).toLowerCase() === "scheduled" && <button className="b2-small" disabled={busy === milestone.id} onClick={() => void act("markMilestoneReady", milestone)}>Mark Ready</button>}{milestone.bill_code && <span><small>{milestone.bill_code}</small></span>}</div></td></tr>)}</tbody></table></div>}

      {tab === "activity" && <div className="b2-activity">{(data.events || []).length ? (data.events || []).map((event: Row) => <div className="b2-event" key={event.id}><span>{dateTime(event.created_at)}</span><strong>{String(event.event_type || "Event").replaceAll("_", " ")}</strong><span>{[event.service_name, event.workflow_status].filter(Boolean).join(" · ") || "Project commercial activity"}</span><strong>{event.amount ? money(event.amount) : "—"}</strong></div>) : <div className="b2-empty">No Billing 2.0 activity yet.</div>}</div>}
    </>}
  </main>;
}