"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Tab = "overview" | "proposal" | "finance" | "design" | "approval" | "supervision" | "handover" | "documents" | "activity";
type Row = Record<string, any>;

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "proposal", label: "Proposal" },
  { id: "finance", label: "Finance" },
  { id: "design", label: "Design" },
  { id: "approval", label: "Approval" },
  { id: "supervision", label: "Supervision" },
  { id: "handover", label: "Handover" },
  { id: "documents", label: "Documents" },
  { id: "activity", label: "Activity" },
];

const DESIGN_DISCIPLINES = [
  "Architectural Design", "Structural Design", "3D Design - Exterior", "3D Design - Interior",
  "Electrical Design", "Fire Safety Design", "Plumbing Design", "Plan Approval Design",
  "Estimate & Costing", "Design Books", "Digital Survey", "Other",
];
const DESIGN_STATUSES = ["In Progress", "Submitted", "Approved", "Completed", "Issued"];
const APPROVAL_TYPES = ["Municipality Land NOC", "Municipality Approval", "Fire Service Approval", "District Vetting Committee Approval", "Client Approval", "Other"];
const APPROVAL_STATUSES = ["Pending", "Preparing", "Submitted", "Correction Requested", "Resubmitted", "Approved", "Rejected"];

function text(value: unknown, fallback = "—") { const output = String(value ?? "").trim(); return output || fallback; }
function money(value: unknown) { const n = Number(value || 0); return `BDT ${Number.isFinite(n) ? n.toLocaleString("en-BD", { maximumFractionDigits: 2 }) : "0"}`; }
function dateText(value: unknown, time = false) {
  const raw = String(value || ""); if (!raw) return "—";
  const d = new Date(raw); if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("en-GB", time ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short", year: "numeric" });
}
function statusTone(value: unknown) {
  const s = String(value || "").toLowerCase();
  if (/complete|approved|issued|paid|settled|accepted/.test(s)) return "good";
  if (/reject|failed|overdue|correction/.test(s)) return "bad";
  if (/progress|pending|preparing|submitted|open|resubmitted/.test(s)) return "warn";
  return "";
}

async function requestLifecycle(projectId: string, method: "GET" | "POST" = "GET", body?: Row) {
  const response = await fetch(method === "GET" ? `/api/lifecycle?projectId=${encodeURIComponent(projectId)}` : "/api/lifecycle", {
    method, credentials: "same-origin", cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Lifecycle request failed."));
  return json.data;
}

export default function ProjectLifecycleWorkspace() {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(String(params?.projectId || ""));
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [phase, setPhase] = useState("");
  const [phaseReason, setPhaseReason] = useState("");
  const [design, setDesign] = useState({ discipline: "Architectural Design", title: "", revision: "R0", status: "In Progress", driveUrl: "", comments: "" });
  const [approval, setApproval] = useState({ approvalType: "Municipality Approval", requestedFrom: "", status: "Pending", notes: "" });

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setError("");
    try {
      const detail = await requestLifecycle(projectId);
      setData(detail);
      setPhase(String(detail?.project?.lifecyclePhase || ""));
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load lifecycle workspace."); }
    finally { if (!silent) setLoading(false); }
  }
  useEffect(() => { if (projectId) void load(); }, [projectId]);

  async function act(key: string, body: Row, success: string) {
    if (busy) return;
    setBusy(key); setError(""); setNotice("");
    try { await requestLifecycle(projectId, "POST", { projectId, ...body }); setNotice(success); await load(true); }
    catch (e) { setError(e instanceof Error ? e.message : "Action failed."); }
    finally { setBusy(""); }
  }

  async function submitDesign(event: FormEvent) {
    event.preventDefault();
    await act("design-create", { action: "createDesignSubmission", ...design }, "Design deliverable added to the project record.");
    setDesign((current) => ({ ...current, title: "", revision: "R0", driveUrl: "", comments: "" }));
  }
  async function submitApproval(event: FormEvent) {
    event.preventDefault();
    await act("approval-create", { action: "createApproval", ...approval }, "Approval record added to the project.");
    setApproval((current) => ({ ...current, requestedFrom: "", notes: "" }));
  }
  async function updatePhase() {
    if (!phase || phase === data?.project?.lifecyclePhase) return;
    await act("phase", { action: "setProjectPhase", phase, reason: phaseReason }, `${projectId} moved to ${phase}.`);
    setPhaseReason("");
  }

  const activity = useMemo(() => {
    if (!data) return [];
    const rows: Array<{ at: string; type: string; title: string; detail: string }> = [];
    for (const r of data.transitions || []) rows.push({ at: r.created_at, type: "Lifecycle", title: `${text(r.from_phase, "Start")} → ${text(r.to_phase)}`, detail: text(r.reason, `Changed by ${text(r.changed_by, "system")}`) });
    for (const r of data.design?.submissions || []) rows.push({ at: r.submitted_at || r.created_at, type: "Design", title: `${text(r.discipline)} · ${text(r.drawing_title)}`, detail: `${text(r.revision)} · ${text(r.status)}` });
    for (const r of data.approval?.records || []) rows.push({ at: r.decided_at || r.requested_at || r.created_at, type: "Approval", title: text(r.approval_type, r.approval_code), detail: `${text(r.requested_from)} · ${text(r.status || r.approval_status)}` });
    for (const r of data.supervision?.visits || []) rows.push({ at: r.created_at || r.visit_date, type: "Site Visit", title: `${text(r.visit_code, "Visit")} · ${text(r.visit_purpose || r.purpose, "Inspection")}`, detail: text(r.observations || r.notes, r.action_required || "No additional notes") });
    for (const r of data.recentPayments || []) rows.push({ at: r.created_at || r.payment_date, type: "Payment", title: `${money(r.amount)} received`, detail: `${text(r.payment_method, "Payment")} · ${text(r.payment_for || r.income_category, "Project payment")}` });
    for (const r of data.documents || []) rows.push({ at: r.created_at || r.document_date, type: "Document", title: text(r.title, r.document_code), detail: text(r.document_type, "Project document") });
    return rows.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime()).slice(0, 100);
  }, [data]);

  if (loading) return <div className="lwx-state">Loading project lifecycle…</div>;
  if (!data?.project) return <div className="lwx-state lwx-error">{error || "Project not found."}</div>;

  const project = data.project;
  const commercial = data.finance?.commercial || {};
  const construction = data.finance?.construction || {};
  const next = data.nextAction || { tab: "overview", title: "Review project", detail: "Open the current project record." };
  const fullPipeline = ["Proposal", "Project Registered", ...(data.projectPhases || [])];
  const currentIndex = Math.max(0, (data.projectPhases || []).indexOf(project.lifecyclePhase)) + 2;
  const latestVisit = data.supervision?.visits?.[0];
  const healthComplete = (data.health || []).filter((item: any) => item.complete).length;
  const healthTotal = (data.health || []).length || 1;

  return <main className="lwx">
    <style>{`
      .lwx{max-width:1540px;margin:0 auto;display:grid;gap:14px;color:var(--lv-text-primary)}.lwx *{box-sizing:border-box}.lwx-state{padding:38px;border:1px solid var(--lv-border-default);border-radius:14px;background:var(--lv-surface-panel);text-align:center;color:var(--lv-text-secondary)}.lwx-error{color:var(--lv-danger)}
      .lwx-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:20px;border:1px solid var(--lv-border-default);border-radius:16px;background:linear-gradient(135deg,var(--lv-surface-panel),var(--lv-surface-muted));box-shadow:var(--lv-shadow-sm)}.lwx-kicker{font-size:8px;font-weight:950;letter-spacing:.14em;color:var(--lv-brand-text)}.lwx-hero h1{margin:5px 0 0;font-size:26px;color:var(--lv-text-strong)}.lwx-sub{margin-top:6px;font-size:10px;color:var(--lv-text-secondary)}.lwx-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.lwx-link,.lwx-btn{min-height:36px;display:inline-flex;align-items:center;justify-content:center;padding:0 11px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);text-decoration:none;font-size:8px;font-weight:900;cursor:pointer}.lwx-link.primary,.lwx-btn.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.lwx-btn:disabled{opacity:.45;cursor:not-allowed}
      .lwx-pipeline{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:7px}.lwx-step{min-height:66px;padding:11px;border:1px solid var(--lv-border-default);border-radius:11px;background:var(--lv-surface-panel)}.lwx-step small{display:block;font-size:7px;font-weight:900;color:var(--lv-text-muted)}.lwx-step strong{display:block;margin-top:6px;font-size:9px;color:var(--lv-text-secondary);line-height:1.35}.lwx-step.done{border-color:var(--lv-success-border);background:var(--lv-success-soft)}.lwx-step.done strong{color:var(--lv-success)}.lwx-step.active{border-color:var(--lv-brand-border);box-shadow:0 0 0 1px var(--lv-brand-border) inset}.lwx-step.active strong{color:var(--lv-brand-text)}
      .lwx-tabs{display:flex;gap:4px;padding:5px;border:1px solid var(--lv-border-default);border-radius:11px;background:var(--lv-surface-panel);overflow:auto;position:sticky;top:0;z-index:12}.lwx-tabs button{border:0;border-radius:7px;background:transparent;color:var(--lv-text-secondary);padding:9px 11px;font-size:8px;font-weight:900;white-space:nowrap;cursor:pointer}.lwx-tabs button.active{background:var(--lv-brand-primary);color:var(--lv-text-inverse)}
      .lwx-msg{padding:10px 12px;border-radius:8px;font-size:9px}.lwx-msg.good{background:var(--lv-success-soft);border:1px solid var(--lv-success-border);color:var(--lv-success)}.lwx-msg.bad{background:var(--lv-danger-soft);border:1px solid var(--lv-danger-border);color:var(--lv-danger)}
      .lwx-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.lwx-card,.lwx-panel{border:1px solid var(--lv-border-default);border-radius:12px;background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm)}.lwx-card{padding:14px}.lwx-card span{display:block;font-size:7px;font-weight:900;letter-spacing:.07em;text-transform:uppercase;color:var(--lv-text-muted)}.lwx-card strong{display:block;margin-top:7px;font-size:18px;color:var(--lv-text-strong)}.lwx-card small{display:block;margin-top:5px;font-size:8px;line-height:1.45;color:var(--lv-text-secondary)}
      .lwx-two{display:grid;grid-template-columns:1.2fr .8fr;gap:12px}.lwx-three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.lwx-panel{overflow:hidden}.lwx-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-bottom:1px solid var(--lv-border-default);background:var(--lv-surface-muted)}.lwx-head h2{margin:0;font-size:13px;color:var(--lv-text-strong)}.lwx-head small{display:block;margin-top:3px;font-size:8px;color:var(--lv-text-muted)}.lwx-body{padding:14px}
      .lwx-next{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center;padding:15px;border:1px solid var(--lv-brand-border);border-radius:12px;background:linear-gradient(135deg,var(--lv-surface-panel),var(--lv-brand-soft,rgba(239,73,59,.06)))}.lwx-next small{font-size:7px;font-weight:950;letter-spacing:.1em;color:var(--lv-brand-text)}.lwx-next h3{margin:5px 0 0;font-size:15px;color:var(--lv-text-strong)}.lwx-next p{margin:5px 0 0;font-size:9px;line-height:1.55;color:var(--lv-text-secondary)}
      .lwx-health{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:7px}.lwx-health-item{padding:11px;border:1px solid var(--lv-border-default);border-radius:9px;background:var(--lv-surface-muted)}.lwx-health-item.good{border-color:var(--lv-success-border);background:var(--lv-success-soft)}.lwx-health-item b{display:block;font-size:8px;color:var(--lv-text-primary)}.lwx-health-item span{display:block;margin-top:5px;font-size:8px;color:var(--lv-text-secondary)}
      .lwx-detail{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 16px}.lwx-detail div{padding:9px 0;border-bottom:1px solid var(--lv-border-subtle)}.lwx-detail span{display:block;font-size:7px;font-weight:900;color:var(--lv-text-muted);text-transform:uppercase}.lwx-detail strong{display:block;margin-top:4px;font-size:9px;color:var(--lv-text-primary)}
      .lwx-form{display:grid;gap:9px}.lwx-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.lwx-field label{display:block;margin-bottom:4px;font-size:7px;font-weight:900;color:var(--lv-text-muted)}.lwx-field input,.lwx-field select,.lwx-field textarea{width:100%;padding:9px 10px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:9px}.lwx-field textarea{min-height:68px;resize:vertical}.lwx-wide{grid-column:1/-1}
      .lwx-status{display:inline-flex;padding:5px 8px;border-radius:999px;background:var(--lv-surface-muted);color:var(--lv-text-secondary);font-size:7px;font-weight:900}.lwx-status.good{background:var(--lv-success-soft);color:var(--lv-success)}.lwx-status.warn{background:var(--lv-warning-soft);color:var(--lv-warning)}.lwx-status.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}
      .lwx-table-wrap{overflow:auto}.lwx-table{width:100%;min-width:760px;border-collapse:collapse}.lwx-table th{padding:9px 10px;border-bottom:1px solid var(--lv-border-default);background:var(--lv-surface-muted);font-size:7px;color:var(--lv-text-muted);text-align:left;text-transform:uppercase}.lwx-table td{padding:10px;border-bottom:1px solid var(--lv-border-subtle);font-size:8px;color:var(--lv-text-primary);vertical-align:top}.lwx-table tr:last-child td{border-bottom:0}.lwx-table select{min-width:130px;padding:6px;border:1px solid var(--lv-border-default);border-radius:6px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px}.lwx-empty{padding:24px;text-align:center;font-size:9px;line-height:1.6;color:var(--lv-text-muted)}
      .lwx-list{display:grid}.lwx-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:10px 0;border-bottom:1px solid var(--lv-border-subtle)}.lwx-row:last-child{border-bottom:0}.lwx-row strong{display:block;font-size:9px;color:var(--lv-text-strong)}.lwx-row span{display:block;margin-top:4px;font-size:8px;line-height:1.45;color:var(--lv-text-secondary)}
      .lwx-checks{display:grid;gap:7px}.lwx-check{display:grid;grid-template-columns:24px 1fr;gap:9px;align-items:center;padding:10px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-muted)}.lwx-check i{display:flex;width:24px;height:24px;align-items:center;justify-content:center;border-radius:50%;background:var(--lv-danger-soft);color:var(--lv-danger);font-style:normal;font-weight:950}.lwx-check.good i{background:var(--lv-success-soft);color:var(--lv-success)}.lwx-check strong{font-size:8px;color:var(--lv-text-primary)}
      .lwx-timeline{display:grid}.lwx-event{display:grid;grid-template-columns:110px 78px minmax(0,1fr);gap:10px;padding:10px 0;border-bottom:1px solid var(--lv-border-subtle)}.lwx-event time{font-size:8px;color:var(--lv-text-muted)}.lwx-event b{font-size:8px;color:var(--lv-brand-text)}.lwx-event strong{display:block;font-size:9px;color:var(--lv-text-strong)}.lwx-event span{display:block;margin-top:4px;font-size:8px;line-height:1.5;color:var(--lv-text-secondary)}
      @media(max-width:1180px){.lwx-pipeline{grid-template-columns:repeat(4,1fr)}.lwx-grid{grid-template-columns:repeat(2,1fr)}.lwx-health{grid-template-columns:repeat(4,1fr)}.lwx-two{grid-template-columns:1fr}.lwx-three{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:700px){.lwx-hero{flex-direction:column}.lwx-actions{justify-content:flex-start}.lwx-pipeline,.lwx-grid,.lwx-health,.lwx-three,.lwx-form-grid{grid-template-columns:1fr}.lwx-detail{grid-template-columns:1fr}.lwx-next{grid-template-columns:1fr}.lwx-event{grid-template-columns:1fr}}
    `}</style>

    <section className="lwx-hero">
      <div><div className="lwx-kicker">LAND VIEW · PROJECT OPERATING WORKSPACE</div><h1>{project.projectId} · {text(project.projectName, "Project")}</h1><div className="lwx-sub">{text(project.clientName)} · {text(project.location)} · {text(project.projectType)}</div></div>
      <div className="lwx-actions"><Link className="lwx-link" href="/admin/lifecycle">Lifecycle Center</Link><Link className="lwx-link" href={`/admin/projects/${encodeURIComponent(projectId)}`}>Current View</Link>{project.projectManagementEnabled && <Link className="lwx-link primary" href="/projectmanagement">Project Management</Link>}</div>
    </section>

    <section className="lwx-pipeline">{fullPipeline.map((item, index) => <div key={item} className={`lwx-step ${index < currentIndex ? "done" : ""} ${index === currentIndex ? "active" : ""}`}><small>{String(index + 1).padStart(2, "0")}</small><strong>{item}</strong></div>)}</section>

    <nav className="lwx-tabs">{TABS.map((item) => <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>
    {error && <div className="lwx-msg bad">{error}</div>}{notice && <div className="lwx-msg good">{notice}</div>}

    {tab === "overview" && <>
      <section className="lwx-next"><div><small>NEXT ACTION</small><h3>{next.title}</h3><p>{next.detail}</p></div><button className="lwx-btn primary" onClick={() => setTab(next.tab as Tab)}>Open {String(next.tab).replace(/^./, (m: string) => m.toUpperCase())}</button></section>
      <section className="lwx-grid">
        <div className="lwx-card"><span>Lifecycle Phase</span><strong>{project.lifecyclePhase}</strong><small>Master project stage</small></div>
        <div className="lwx-card"><span>Consultancy Due</span><strong>{money(commercial.due)}</strong><small>{money(commercial.paid)} received / {money(commercial.billed)} billed</small></div>
        <div className="lwx-card"><span>Construction Cash</span><strong>{money(construction.currentBalance)}</strong><small>{construction.ledgerEntryCount || 0} project ledger entries</small></div>
        <div className="lwx-card"><span>Open Tasks</span><strong>{data.openTasks?.length || 0}</strong><small>{latestVisit ? `Last visit ${dateText(latestVisit.visit_date)}` : "No digital visit recorded"}</small></div>
      </section>
      <section className="lwx-panel"><div className="lwx-head"><div><h2>Project Health</h2><small>{healthComplete} of {healthTotal} record areas currently clear</small></div><span className={`lwx-status ${healthComplete === healthTotal ? "good" : "warn"}`}>{Math.round((healthComplete / healthTotal) * 100)}%</span></div><div className="lwx-body lwx-health">{(data.health || []).map((item: any) => <div className={`lwx-health-item ${item.complete ? "good" : ""}`} key={item.key}><b>{item.label}</b><span>{item.value}</span></div>)}</div></section>
      <section className="lwx-two">
        <div className="lwx-panel"><div className="lwx-head"><div><h2>Project Snapshot</h2><small>One master record across every phase</small></div></div><div className="lwx-body lwx-detail">
          <div><span>Client</span><strong>{text(project.clientName)}</strong></div><div><span>Contact</span><strong>{text(project.clientPhone)}</strong></div><div><span>Type</span><strong>{text(project.projectType)}</strong></div><div><span>Floors</span><strong>{text(project.floors)}</strong></div><div><span>Plot Area</span><strong>{text(project.plotArea)}</strong></div><div><span>Start Date</span><strong>{dateText(project.startDate)}</strong></div><div><span>Design</span><strong>{text(project.designStatus)}</strong></div><div><span>Approval</span><strong>{text(project.approvalStatus)}</strong></div><div><span>Supervision</span><strong>{text(project.supervisionStatus)}</strong></div><div><span>Source Proposal</span><strong>{data.proposal?.proposalId || "Legacy / direct registration"}</strong></div>
        </div></div>
        <div className="lwx-panel"><div className="lwx-head"><div><h2>Move Project</h2><small>Every change is written to lifecycle history and Audit Log</small></div></div><div className="lwx-body lwx-form"><div className="lwx-field"><label>Lifecycle Phase</label><select value={phase} onChange={(e) => setPhase(e.target.value)}>{(data.projectPhases || []).map((p: string) => <option key={p}>{p}</option>)}</select></div><div className="lwx-field"><label>Reason / note</label><textarea value={phaseReason} onChange={(e) => setPhaseReason(e.target.value)} placeholder="Why is the project moving to this phase?" /></div><button className="lwx-btn primary" disabled={busy === "phase" || phase === project.lifecyclePhase} onClick={() => void updatePhase()}>{busy === "phase" ? "Updating…" : "Update Phase"}</button></div></div>
      </section>
      <section className="lwx-panel"><div className="lwx-head"><div><h2>Open Work</h2><small>Tasks still requiring attention</small></div></div><div className="lwx-body lwx-list">{(data.openTasks || []).slice(0, 10).map((r: Row) => <div className="lwx-row" key={r.id || r.task_code}><div><strong>{text(r.title || r.task_title || r.task_code, "Task")}</strong><span>{text(r.description || r.notes, "No notes")}</span></div><span className={`lwx-status ${statusTone(r.status)}`}>{text(r.status)}</span></div>)}{!data.openTasks?.length && <div className="lwx-empty">No open project tasks.</div>}</div></section>
    </>}

    {tab === "proposal" && <section className="lwx-panel"><div className="lwx-head"><div><h2>Original Proposal</h2><small>Commercial agreement that started the project</small></div>{data.proposal && <Link className="lwx-link" href={`/admin/proposals/${encodeURIComponent(data.proposal.proposalId)}`}>Open Proposal</Link>}</div>{!data.proposal ? <div className="lwx-empty">No linked digital proposal exists. This project can continue as a legacy/direct registration without rewriting its history.</div> : <><div className="lwx-body lwx-three"><div className="lwx-card"><span>Proposal</span><strong>{data.proposal.proposalId}</strong><small>{data.proposal.status}</small></div><div className="lwx-card"><span>Value</span><strong>{money(data.proposal.netAmount)}</strong><small>Gross {money(data.proposal.grossAmount)}</small></div><div className="lwx-card"><span>Converted Project</span><strong>{text(data.proposal.convertedProjectId)}</strong><small>{text(data.proposal.projectTitle)}</small></div></div><div className="lwx-table-wrap"><table className="lwx-table"><thead><tr><th>Service</th><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th><th>Status</th></tr></thead><tbody>{(data.proposalItems || []).map((r: Row) => <tr key={r.item_code}><td>{text(r.service)}</td><td>{text(r.description)}</td><td>{text(r.quantity)}</td><td>{money(r.rate)}</td><td>{money(r.amount)}</td><td>{text(r.status)}</td></tr>)}</tbody></table></div></>}</section>}

    {tab === "finance" && <><section className="lwx-grid"><div className="lwx-card"><span>Consultancy Billed</span><strong>{money(commercial.billed)}</strong><small>{commercial.billCount || 0} bills</small></div><div className="lwx-card"><span>Received</span><strong>{money(commercial.paid)}</strong><small>{commercial.paymentCount || 0} payments</small></div><div className="lwx-card"><span>Due</span><strong>{money(commercial.due)}</strong><small>Runs across the whole lifecycle</small></div><div className="lwx-card"><span>Construction Balance</span><strong>{money(construction.currentBalance)}</strong><small>Income {money(construction.income)} · Expense {money(construction.expense)}</small></div></section><section className="lwx-three"><div className="lwx-card"><span>Supplier Advance</span><strong>{money(construction.supplierAdvance)}</strong></div><div className="lwx-card"><span>Cheque on Hold</span><strong>{money(construction.chequeOnHold)}</strong></div><div className="lwx-card"><span>Ledger Entries</span><strong>{construction.ledgerEntryCount || 0}</strong></div></section><section className="lwx-panel"><div className="lwx-head"><div><h2>Finance Actions</h2><small>Keep billing and construction accounts in their existing engines</small></div><div className="lwx-actions"><Link className="lwx-link" href="/admin/finance">Consultancy Finance</Link>{project.projectManagementEnabled && <Link className="lwx-link primary" href="/projectmanagement">Construction Finance</Link>}</div></div></section></>}

    {tab === "design" && <section className="lwx-two">
      <div className="lwx-panel"><div className="lwx-head"><div><h2>Design Deliverables</h2><small>{data.design?.submissions?.length || 0} digital submission(s) · stage {text(data.design?.status)}</small></div></div><div className="lwx-table-wrap"><table className="lwx-table"><thead><tr><th>Code</th><th>Discipline</th><th>Deliverable</th><th>Rev.</th><th>Status</th><th>Date</th></tr></thead><tbody>{(data.design?.submissions || []).map((r: Row) => <tr key={r.drawing_code}><td>{text(r.drawing_code)}</td><td>{text(r.discipline)}</td><td>{text(r.drawing_title)}</td><td>{text(r.revision)}</td><td><select disabled={busy === `design-${r.drawing_code}`} value={text(r.status, "In Progress")} onChange={(e) => void act(`design-${r.drawing_code}`, { action: "updateDesignSubmission", drawingCode: r.drawing_code, status: e.target.value }, `${r.drawing_code} updated.`)}>{DESIGN_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></td><td>{dateText(r.submitted_at || r.created_at)}</td></tr>)}{!data.design?.submissions?.length && <tr><td colSpan={6}><div className="lwx-empty">No digital design submission recorded yet.</div></td></tr>}</tbody></table></div></div>
      <div className="lwx-panel"><div className="lwx-head"><div><h2>Add Design Deliverable</h2><small>Register a drawing, book, estimate or design issue</small></div></div><form className="lwx-body lwx-form" onSubmit={(e) => void submitDesign(e)}><div className="lwx-form-grid"><div className="lwx-field"><label>Discipline</label><select value={design.discipline} onChange={(e) => setDesign({ ...design, discipline: e.target.value })}>{DESIGN_DISCIPLINES.map((s) => <option key={s}>{s}</option>)}</select></div><div className="lwx-field"><label>Status</label><select value={design.status} onChange={(e) => setDesign({ ...design, status: e.target.value })}>{DESIGN_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div><div className="lwx-field lwx-wide"><label>Deliverable Title</label><input required value={design.title} onChange={(e) => setDesign({ ...design, title: e.target.value })} placeholder="e.g. Ground Floor Architectural Plan" /></div><div className="lwx-field"><label>Revision</label><input value={design.revision} onChange={(e) => setDesign({ ...design, revision: e.target.value })} /></div><div className="lwx-field"><label>Drive URL (optional)</label><input value={design.driveUrl} onChange={(e) => setDesign({ ...design, driveUrl: e.target.value })} placeholder="https://drive.google.com/..." /></div><div className="lwx-field lwx-wide"><label>Comments</label><textarea value={design.comments} onChange={(e) => setDesign({ ...design, comments: e.target.value })} /></div></div><button className="lwx-btn primary" disabled={busy === "design-create"}>{busy === "design-create" ? "Saving…" : "Add Deliverable"}</button></form></div>
    </section>}

    {tab === "approval" && <section className="lwx-two">
      <div className="lwx-panel"><div className="lwx-head"><div><h2>Approval Register</h2><small>{data.approval?.records?.length || 0} record(s) · stage {text(data.approval?.status)}</small></div></div><div className="lwx-table-wrap"><table className="lwx-table"><thead><tr><th>Code</th><th>Type</th><th>Authority</th><th>Status</th><th>Requested</th><th>Decision</th></tr></thead><tbody>{(data.approval?.records || []).map((r: Row) => <tr key={r.approval_code || r.id}><td>{text(r.approval_code)}</td><td>{text(r.approval_type)}</td><td>{text(r.requested_from)}</td><td><select disabled={busy === `approval-${r.approval_code}`} value={text(r.status || r.approval_status, "Pending")} onChange={(e) => void act(`approval-${r.approval_code}`, { action: "updateApproval", approvalCode: r.approval_code, status: e.target.value }, `${r.approval_code} updated.`)}>{APPROVAL_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></td><td>{dateText(r.requested_at)}</td><td>{dateText(r.decided_at || r.approved_at)}</td></tr>)}{!data.approval?.records?.length && <tr><td colSpan={6}><div className="lwx-empty">No digital approval record exists yet.</div></td></tr>}</tbody></table></div></div>
      <div className="lwx-panel"><div className="lwx-head"><div><h2>Add Approval</h2><small>Municipality, NOC, fire, vetting or client approval</small></div></div><form className="lwx-body lwx-form" onSubmit={(e) => void submitApproval(e)}><div className="lwx-field"><label>Approval Type</label><select value={approval.approvalType} onChange={(e) => setApproval({ ...approval, approvalType: e.target.value })}>{APPROVAL_TYPES.map((s) => <option key={s}>{s}</option>)}</select></div><div className="lwx-field"><label>Requested From / Authority</label><input required value={approval.requestedFrom} onChange={(e) => setApproval({ ...approval, requestedFrom: e.target.value })} placeholder="e.g. Feni Municipality" /></div><div className="lwx-field"><label>Status</label><select value={approval.status} onChange={(e) => setApproval({ ...approval, status: e.target.value })}>{APPROVAL_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div><div className="lwx-field"><label>Notes</label><textarea value={approval.notes} onChange={(e) => setApproval({ ...approval, notes: e.target.value })} /></div><button className="lwx-btn primary" disabled={busy === "approval-create"}>{busy === "approval-create" ? "Saving…" : "Add Approval Record"}</button></form></div>
    </section>}

    {tab === "supervision" && <><section className="lwx-grid"><div className="lwx-card"><span>Stage</span><strong>{text(data.supervision?.status)}</strong><small>{project.projectManagementEnabled ? "Project Management enabled" : "Project Management not enabled"}</small></div><div className="lwx-card"><span>Site Visits</span><strong>{data.supervision?.visits?.length || 0}</strong></div><div className="lwx-card"><span>Suppliers</span><strong>{data.supervision?.suppliers?.length || 0}</strong></div><div className="lwx-card"><span>Contractors</span><strong>{data.supervision?.contractors?.length || 0}</strong></div></section><section className="lwx-two"><div className="lwx-panel"><div className="lwx-head"><div><h2>Recent Site Visits</h2><small>Field activity remains tied to the project</small></div><Link className="lwx-link" href="/admin/site-visits">All Visits</Link></div><div className="lwx-body lwx-list">{(data.supervision?.visits || []).slice(0, 20).map((r: Row) => <div className="lwx-row" key={r.id || r.visit_code}><div><strong>{text(r.visit_code)} · {text(r.visit_purpose || r.purpose, "Site Visit")}</strong><span>{text(r.observations || r.notes, "No observations")}</span></div><div><span className={`lwx-status ${statusTone(r.status)}`}>{text(r.status)}</span><span>{dateText(r.visit_date)}</span></div></div>)}{!data.supervision?.visits?.length && <div className="lwx-empty">No visits recorded.</div>}</div></div><div className="lwx-panel"><div className="lwx-head"><div><h2>Construction Parties</h2><small>Suppliers and contractors</small></div>{project.projectManagementEnabled && <Link className="lwx-link primary" href="/projectmanagement">Open PM</Link>}</div><div className="lwx-body lwx-list">{(data.supervision?.suppliers || []).slice(0, 8).map((r: Row) => <div className="lwx-row" key={`s-${r.id}`}><div><strong>{text(r.supplier_name)}</strong><span>{text(r.primary_category)}</span></div><span className="lwx-status good">Supplier</span></div>)}{(data.supervision?.contractors || []).slice(0, 8).map((r: Row) => <div className="lwx-row" key={`c-${r.id}`}><div><strong>{text(r.contractor_name)}</strong><span>{text(r.category)}</span></div><span className="lwx-status good">Contractor</span></div>)}</div></div></section></>}

    {tab === "handover" && <section className="lwx-two"><div className="lwx-panel"><div className="lwx-head"><div><h2>Handover Checklist</h2><small>All checks must pass before Completed is allowed</small></div><span className={`lwx-status ${data.handover?.ready ? "good" : "warn"}`}>{data.handover?.ready ? "Ready" : "Not ready"}</span></div><div className="lwx-body lwx-checks">{(data.handover?.checks || []).map((item: any) => <div className={`lwx-check ${item.complete ? "good" : ""}`} key={item.key}><i>{item.complete ? "✓" : "!"}</i><strong>{item.label}</strong></div>)}</div></div><div className="lwx-panel"><div className="lwx-head"><div><h2>Close-out Control</h2><small>Use Handover before final archive</small></div></div><div className="lwx-body lwx-form"><div className="lwx-field"><label>Lifecycle Phase</label><select value={phase} onChange={(e) => setPhase(e.target.value)}>{(data.projectPhases || []).map((p: string) => <option key={p}>{p}</option>)}</select></div><div className="lwx-field"><label>Close-out Note</label><textarea value={phaseReason} onChange={(e) => setPhaseReason(e.target.value)} placeholder="Final drawings/books delivered, client acknowledgement, final inspection…" /></div><button className="lwx-btn primary" disabled={busy === "phase" || phase === project.lifecyclePhase} onClick={() => void updatePhase()}>{busy === "phase" ? "Updating…" : "Update Phase"}</button></div></div></section>}

    {tab === "documents" && <section className="lwx-panel"><div className="lwx-head"><div><h2>Project Documents</h2><small>{data.documents?.length || 0} registered file(s)</small></div><Link className="lwx-link" href={`/admin/projects/${encodeURIComponent(projectId)}`}>Manage Documents</Link></div><div className="lwx-table-wrap"><table className="lwx-table"><thead><tr><th>Date</th><th>Code</th><th>Title</th><th>Type</th><th>Client Visible</th><th>File</th></tr></thead><tbody>{(data.documents || []).map((r: Row) => <tr key={r.id || r.document_code}><td>{dateText(r.document_date || r.created_at)}</td><td>{text(r.document_code)}</td><td>{text(r.title)}</td><td>{text(r.document_type)}</td><td>{r.client_visible ? "Yes" : "No"}</td><td>{r.drive_file_url ? <a href={r.drive_file_url} target="_blank" rel="noreferrer">Open</a> : "—"}</td></tr>)}{!data.documents?.length && <tr><td colSpan={6}><div className="lwx-empty">No project documents registered yet.</div></td></tr>}</tbody></table></div></section>}

    {tab === "activity" && <section className="lwx-panel"><div className="lwx-head"><div><h2>Activity Timeline</h2><small>Lifecycle, design, approvals, site visits, payments and documents</small></div><span className="lwx-status">{activity.length} events</span></div><div className="lwx-body lwx-timeline">{activity.map((event, index) => <div className="lwx-event" key={`${event.type}-${event.at}-${index}`}><time>{dateText(event.at, true)}</time><b>{event.type}</b><div><strong>{event.title}</strong><span>{event.detail}</span></div></div>)}{!activity.length && <div className="lwx-empty">No project activity recorded.</div>}</div></section>}
  </main>;
}
