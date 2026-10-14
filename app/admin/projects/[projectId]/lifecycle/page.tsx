"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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

function money(value: unknown) {
  const number = Number(value || 0);
  return `BDT ${Number.isFinite(number) ? number.toLocaleString("en-BD", { maximumFractionDigits: 2 }) : "0"}`;
}
function dateText(value: unknown, includeTime = false) {
  const raw = String(value || "");
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString("en-GB", includeTime
    ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "numeric" });
}
function text(value: unknown, fallback = "—") {
  const output = String(value ?? "").trim();
  return output || fallback;
}
function statusClass(value: unknown) {
  const normalized = String(value || "").toLowerCase();
  if (/complete|approved|paid|accepted|verified/.test(normalized)) return "good";
  if (/progress|sent|pending|draft|open/.test(normalized)) return "warn";
  if (/reject|overdue|due|failed|cancel/.test(normalized)) return "bad";
  return "";
}

async function lifecycleRequest(projectId: string, method: "GET" | "POST" = "GET", body?: Row) {
  const url = method === "GET" ? `/api/lifecycle?projectId=${encodeURIComponent(projectId)}` : "/api/lifecycle";
  const response = await fetch(url, {
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

export default function ProjectLifecycleWorkspacePage() {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(String(params?.projectId || ""));
  const [tab, setTab] = useState<Tab>("overview");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [savingPhase, setSavingPhase] = useState(false);
  const [nextPhase, setNextPhase] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const detail = await lifecycleRequest(projectId);
      setData(detail);
      setNextPhase(String(detail?.project?.lifecyclePhase || ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load project lifecycle.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (projectId) void load(); }, [projectId]);

  async function updatePhase() {
    if (!data?.project || !nextPhase || savingPhase) return;
    setSavingPhase(true);
    setError("");
    setNotice("");
    try {
      const updated = await lifecycleRequest(projectId, "POST", {
        action: "setProjectPhase",
        projectId,
        phase: nextPhase,
        reason: reason.trim(),
      });
      setNotice(`${projectId} moved to ${updated.lifecyclePhase}.`);
      setReason("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update lifecycle phase.");
    } finally {
      setSavingPhase(false);
    }
  }

  const activity = useMemo(() => {
    if (!data) return [];
    const events: Array<{ at: string; type: string; title: string; detail: string }> = [];
    for (const row of data.transitions || []) events.push({
      at: row.created_at || "",
      type: "Lifecycle",
      title: `${text(row.from_phase, "Start")} → ${text(row.to_phase)}`,
      detail: text(row.reason, `Changed by ${text(row.changed_by, "system")}`),
    });
    for (const row of data.supervision?.visits || []) events.push({
      at: row.created_at || row.visit_date || "",
      type: "Site Visit",
      title: `${text(row.visit_code, "Site visit")} · ${text(row.visit_purpose || row.purpose, "Site inspection")}`,
      detail: text(row.observations || row.notes, text(row.action_required, "No additional notes")),
    });
    for (const row of data.design?.submissions || []) events.push({
      at: row.submitted_at || row.created_at || "",
      type: "Design",
      title: `${text(row.discipline, "Drawing")} · ${text(row.drawing_title, row.drawing_code || "Submission")}`,
      detail: `Revision ${text(row.revision, "—")} · ${text(row.status, "—")}`,
    });
    for (const row of data.approval?.records || []) events.push({
      at: row.decided_at || row.requested_at || row.created_at || "",
      type: "Approval",
      title: text(row.approval_type || row.description, row.approval_code || "Approval"),
      detail: `${text(row.requested_from, "Authority")} · ${text(row.status || row.approval_status, "—")}`,
    });
    for (const row of data.documents || []) events.push({
      at: row.created_at || row.document_date || "",
      type: "Document",
      title: text(row.title, row.document_code || "Document"),
      detail: text(row.document_type, "Project document"),
    });
    for (const row of data.recentPayments || []) events.push({
      at: row.created_at || row.payment_date || "",
      type: "Payment",
      title: `${money(row.amount)} received`,
      detail: `${text(row.payment_method, "Payment")} · ${text(row.payment_for || row.income_category, "Project payment")}`,
    });
    return events.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime()).slice(0, 100);
  }, [data]);

  if (loading) return <div className="plw-state">Loading project lifecycle…</div>;
  if (!data?.project) return <div className="plw-state error">{error || "Project lifecycle could not be loaded."}</div>;

  const project = data.project;
  const commercial = data.finance?.commercial || {};
  const construction = data.finance?.construction || {};
  const phaseIndex = Math.max(0, (data.projectPhases || []).indexOf(project.lifecyclePhase));
  const fullPipeline = ["Proposal", "Project Registered", ...(data.projectPhases || [])];
  const activePipelineIndex = phaseIndex + 2;
  const latestVisit = data.supervision?.visits?.[0];

  return <main className="plw">
    <style>{`
      .plw{display:grid;gap:14px;max-width:1540px;margin:0 auto;color:var(--lv-text-primary)}.plw *{box-sizing:border-box}
      .plw-state{padding:36px;border:1px solid var(--lv-border-default);border-radius:var(--lv-radius-lg);background:var(--lv-surface-panel);color:var(--lv-text-secondary);text-align:center}.plw-state.error{color:var(--lv-danger)}
      .plw-hero{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;padding:20px;border:1px solid var(--lv-border-default);border-radius:var(--lv-radius-xl);background:linear-gradient(135deg,var(--lv-surface-panel),var(--lv-surface-muted));box-shadow:var(--lv-shadow-sm)}.plw-kicker{color:var(--lv-brand-text);font-size:9px;font-weight:950;letter-spacing:.14em;text-transform:uppercase}.plw-hero h1{margin:5px 0 0;color:var(--lv-text-strong);font-size:26px}.plw-sub{margin-top:6px;color:var(--lv-text-secondary);font-size:10px}.plw-hero-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.plw-link,.plw-button{display:inline-flex;min-height:38px;align-items:center;justify-content:center;padding:0 12px;border:1px solid var(--lv-border-default);border-radius:var(--lv-radius-md);background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:9px;font-weight:900;text-decoration:none;cursor:pointer}.plw-link.primary,.plw-button.primary{border-color:var(--lv-brand-border);background:var(--lv-brand-primary);color:var(--lv-text-inverse)}.plw-button:disabled{opacity:.55;cursor:not-allowed}
      .plw-pipeline{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:7px}.plw-phase{position:relative;padding:12px 10px;border:1px solid var(--lv-border-default);border-radius:var(--lv-radius-lg);background:var(--lv-surface-panel);min-height:70px}.plw-phase small{display:block;color:var(--lv-text-muted);font-size:7px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.plw-phase strong{display:block;margin-top:7px;color:var(--lv-text-secondary);font-size:9px;line-height:1.35}.plw-phase.done{border-color:var(--lv-success-border);background:var(--lv-success-soft)}.plw-phase.done strong{color:var(--lv-success)}.plw-phase.active{border-color:var(--lv-brand-border);box-shadow:0 0 0 1px var(--lv-brand-border) inset}.plw-phase.active strong{color:var(--lv-brand-text)}
      .plw-tabs{display:flex;gap:5px;padding:5px;border:1px solid var(--lv-border-default);border-radius:var(--lv-radius-lg);background:var(--lv-surface-panel);overflow:auto;position:sticky;top:0;z-index:10}.plw-tabs button{border:0;border-radius:var(--lv-radius-md);background:transparent;color:var(--lv-text-secondary);padding:10px 12px;font-size:9px;font-weight:900;white-space:nowrap;cursor:pointer}.plw-tabs button.active{background:var(--lv-brand-primary);color:var(--lv-text-inverse)}
      .plw-msg{padding:10px 12px;border-radius:var(--lv-radius-md);font-size:9px}.plw-msg.error{border:1px solid var(--lv-danger-border);background:var(--lv-danger-soft);color:var(--lv-danger)}.plw-msg.good{border:1px solid var(--lv-success-border);background:var(--lv-success-soft);color:var(--lv-success)}
      .plw-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.plw-card,.plw-panel{border:1px solid var(--lv-border-default);border-radius:var(--lv-radius-lg);background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm)}.plw-card{padding:15px}.plw-card span{display:block;color:var(--lv-text-muted);font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.plw-card strong{display:block;margin-top:8px;color:var(--lv-text-strong);font-size:18px;overflow-wrap:anywhere}.plw-card small{display:block;margin-top:5px;color:var(--lv-text-secondary);font-size:8px;line-height:1.45}.plw-panel{overflow:hidden}.plw-panel-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:13px 14px;border-bottom:1px solid var(--lv-border-default);background:var(--lv-surface-muted)}.plw-panel-head h2{margin:0;color:var(--lv-text-strong);font-size:14px}.plw-panel-head small{display:block;margin-top:3px;color:var(--lv-text-muted);font-size:8px}.plw-panel-body{padding:14px}.plw-two{display:grid;grid-template-columns:1.25fr .75fr;gap:12px}.plw-three{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .plw-status{display:inline-flex;padding:5px 8px;border-radius:999px;background:var(--lv-surface-muted);color:var(--lv-text-secondary);font-size:8px;font-weight:900}.plw-status.good{background:var(--lv-success-soft);color:var(--lv-success)}.plw-status.warn{background:var(--lv-warning-soft);color:var(--lv-warning)}.plw-status.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}
      .plw-detail-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 18px}.plw-detail{padding:9px 0;border-bottom:1px solid var(--lv-border-subtle)}.plw-detail span{display:block;color:var(--lv-text-muted);font-size:7px;text-transform:uppercase;font-weight:900}.plw-detail strong{display:block;margin-top:4px;color:var(--lv-text-primary);font-size:9px;overflow-wrap:anywhere}
      .plw-phase-editor{display:grid;gap:8px}.plw-field label{display:block;margin-bottom:4px;color:var(--lv-text-muted);font-size:8px;font-weight:900}.plw-field select,.plw-field input,.plw-field textarea{width:100%;padding:9px 10px;border:1px solid var(--lv-border-default);border-radius:var(--lv-radius-md);background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:9px}.plw-field textarea{min-height:72px;resize:vertical}
      .plw-table-wrap{overflow:auto}.plw-table{width:100%;min-width:720px;border-collapse:collapse}.plw-table th{padding:9px 10px;border-bottom:1px solid var(--lv-border-default);background:var(--lv-surface-muted);color:var(--lv-text-muted);font-size:7px;text-align:left;text-transform:uppercase;letter-spacing:.07em}.plw-table td{padding:10px;border-bottom:1px solid var(--lv-border-subtle);color:var(--lv-text-primary);font-size:9px;vertical-align:top}.plw-table tr:last-child td{border-bottom:0}.plw-table a{color:var(--lv-brand-text)}
      .plw-empty{padding:24px;text-align:center;color:var(--lv-text-muted);font-size:9px;line-height:1.6}.plw-list{display:grid}.plw-list-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:11px 0;border-bottom:1px solid var(--lv-border-subtle)}.plw-list-row:last-child{border-bottom:0}.plw-list-row strong{display:block;color:var(--lv-text-strong);font-size:9px}.plw-list-row span{display:block;margin-top:4px;color:var(--lv-text-secondary);font-size:8px;line-height:1.45}
      .plw-checks{display:grid;gap:8px}.plw-check{display:grid;grid-template-columns:24px minmax(0,1fr);gap:10px;align-items:center;padding:11px;border:1px solid var(--lv-border-default);border-radius:var(--lv-radius-md);background:var(--lv-surface-muted)}.plw-check i{display:flex;width:24px;height:24px;align-items:center;justify-content:center;border-radius:50%;background:var(--lv-danger-soft);color:var(--lv-danger);font-style:normal;font-weight:950}.plw-check.done i{background:var(--lv-success-soft);color:var(--lv-success)}.plw-check strong{color:var(--lv-text-primary);font-size:9px}.plw-check span{display:block;margin-top:3px;color:var(--lv-text-muted);font-size:8px}
      .plw-timeline{display:grid}.plw-event{display:grid;grid-template-columns:92px 76px minmax(0,1fr);gap:10px;padding:11px 0;border-bottom:1px solid var(--lv-border-subtle)}.plw-event:last-child{border-bottom:0}.plw-event time{color:var(--lv-text-muted);font-size:8px}.plw-event b{color:var(--lv-brand-text);font-size:8px}.plw-event strong{display:block;color:var(--lv-text-strong);font-size:9px}.plw-event span{display:block;margin-top:4px;color:var(--lv-text-secondary);font-size:8px;line-height:1.5}
      @media(max-width:1180px){.plw-pipeline{grid-template-columns:repeat(4,minmax(0,1fr))}.plw-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.plw-two{grid-template-columns:1fr}.plw-three{grid-template-columns:1fr 1fr}}
      @media(max-width:700px){.plw-hero{flex-direction:column}.plw-hero-actions{justify-content:flex-start}.plw-pipeline{grid-template-columns:repeat(2,minmax(0,1fr))}.plw-grid,.plw-three{grid-template-columns:1fr}.plw-detail-list{grid-template-columns:1fr}.plw-event{grid-template-columns:1fr}.plw-tabs{top:0}}
    `}</style>

    <section className="plw-hero">
      <div>
        <div className="plw-kicker">LAND VIEW · FULL PROJECT LIFECYCLE</div>
        <h1>{project.projectId} · {text(project.projectName, "Project")}</h1>
        <div className="plw-sub">{text(project.clientName)} · {text(project.location)} · {text(project.projectType)}</div>
      </div>
      <div className="plw-hero-actions">
        <Link className="plw-link" href="/admin/lifecycle">All Lifecycle</Link>
        <Link className="plw-link" href={`/admin/projects/${encodeURIComponent(projectId)}`}>Current Project View</Link>
        {project.projectManagementEnabled && <Link className="plw-link primary" href="/projectmanagement">Project Management</Link>}
      </div>
    </section>

    <section className="plw-pipeline">
      {fullPipeline.map((phase, index) => {
        const done = index < activePipelineIndex;
        const active = index === activePipelineIndex;
        return <div className={`plw-phase ${done ? "done" : ""} ${active ? "active" : ""}`} key={phase}>
          <small>{String(index + 1).padStart(2, "0")}</small>
          <strong>{phase}</strong>
        </div>;
      })}
    </section>

    <nav className="plw-tabs" aria-label="Project lifecycle workspace">
      {TABS.map((item) => <button className={tab === item.id ? "active" : ""} key={item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}
    </nav>

    {error && <div className="plw-msg error">{error}</div>}
    {notice && <div className="plw-msg good">{notice}</div>}

    {tab === "overview" && <>
      <section className="plw-grid">
        <div className="plw-card"><span>Current Phase</span><strong>{project.lifecyclePhase}</strong><small>Changed {dateText(project.updatedAt, true)}</small></div>
        <div className="plw-card"><span>Consultancy Due</span><strong>{money(commercial.due)}</strong><small>{money(commercial.paid)} received against {money(commercial.billed)}</small></div>
        <div className="plw-card"><span>Project Cash</span><strong>{money(construction.currentBalance)}</strong><small>{project.projectManagementEnabled ? `${construction.ledgerEntryCount || 0} construction ledger entries` : "Construction finance is not enabled"}</small></div>
        <div className="plw-card"><span>Latest Site Visit</span><strong>{latestVisit ? dateText(latestVisit.visit_date) : "No visit"}</strong><small>{latestVisit ? text(latestVisit.visit_purpose || latestVisit.purpose) : "No digital site visits recorded"}</small></div>
      </section>

      <section className="plw-two">
        <div className="plw-panel">
          <div className="plw-panel-head"><div><h2>Project Snapshot</h2><small>One master record across the full lifecycle</small></div><span className={`plw-status ${statusClass(project.lifecyclePhase)}`}>{project.lifecyclePhase}</span></div>
          <div className="plw-panel-body plw-detail-list">
            <div className="plw-detail"><span>Client</span><strong>{text(project.clientName)}</strong></div>
            <div className="plw-detail"><span>Contact</span><strong>{text(project.clientPhone)}</strong></div>
            <div className="plw-detail"><span>Project Type</span><strong>{text(project.projectType)}</strong></div>
            <div className="plw-detail"><span>Floors</span><strong>{text(project.floors)}</strong></div>
            <div className="plw-detail"><span>Plot Area</span><strong>{text(project.plotArea)}</strong></div>
            <div className="plw-detail"><span>Start Date</span><strong>{dateText(project.startDate)}</strong></div>
            <div className="plw-detail"><span>Design Stage</span><strong>{text(project.designStatus)}</strong></div>
            <div className="plw-detail"><span>Approval Stage</span><strong>{text(project.approvalStatus)}</strong></div>
            <div className="plw-detail"><span>Supervision Stage</span><strong>{text(project.supervisionStatus)}</strong></div>
            <div className="plw-detail"><span>Source Proposal</span><strong>{data.proposal?.proposalId || "Legacy / direct registration"}</strong></div>
          </div>
        </div>

        <div className="plw-panel">
          <div className="plw-panel-head"><div><h2>Move Project</h2><small>Lifecycle changes are written to history and Audit Log</small></div></div>
          <div className="plw-panel-body plw-phase-editor">
            <div className="plw-field"><label>Lifecycle Phase</label><select value={nextPhase} onChange={(event) => setNextPhase(event.target.value)}>{(data.projectPhases || []).map((phase: string) => <option key={phase} value={phase}>{phase}</option>)}</select></div>
            <div className="plw-field"><label>Reason / note</label><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional note for this lifecycle transition…" /></div>
            <button className="plw-button primary" disabled={savingPhase || !nextPhase || nextPhase === project.lifecyclePhase} onClick={() => void updatePhase()}>{savingPhase ? "Updating…" : "Update Lifecycle Phase"}</button>
          </div>
        </div>
      </section>
    </>}

    {tab === "proposal" && <section className="plw-panel">
      <div className="plw-panel-head"><div><h2>Original Proposal</h2><small>The commercial agreement that started this project</small></div>{data.proposal && <Link className="plw-link" href={`/admin/proposals/${encodeURIComponent(data.proposal.proposalId)}`}>Open Proposal</Link>}</div>
      {!data.proposal ? <div className="plw-empty">No linked digital proposal exists for this project. This is normal for legacy or directly registered projects; the project lifecycle can continue without rewriting historical data.</div> : <>
        <div className="plw-panel-body plw-three">
          <div className="plw-card"><span>Proposal</span><strong>{data.proposal.proposalId}</strong><small>{data.proposal.status} · {data.proposal.lifecyclePhase}</small></div>
          <div className="plw-card"><span>Proposal Value</span><strong>{money(data.proposal.netAmount)}</strong><small>Gross {money(data.proposal.grossAmount)} · Discount {money(data.proposal.discount)}</small></div>
          <div className="plw-card"><span>Converted Project</span><strong>{text(data.proposal.convertedProjectId)}</strong><small>{text(data.proposal.projectTitle)}</small></div>
        </div>
        <div className="plw-table-wrap"><table className="plw-table"><thead><tr><th>Service</th><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th><th>Status</th></tr></thead><tbody>
          {(data.proposalItems || []).map((row: Row) => <tr key={row.item_code}><td>{text(row.service)}</td><td>{text(row.description)}</td><td>{text(row.quantity)}</td><td>{money(row.rate)}</td><td>{money(row.amount)}</td><td><span className={`plw-status ${statusClass(row.status)}`}>{text(row.status)}</span></td></tr>)}
          {!data.proposalItems?.length && <tr><td colSpan={6}><div className="plw-empty">No proposal line items are stored.</div></td></tr>}
        </tbody></table></div>
      </>}
    </section>}

    {tab === "finance" && <>
      <section className="plw-grid">
        <div className="plw-card"><span>Consultancy Billed</span><strong>{money(commercial.billed)}</strong><small>{commercial.billCount || 0} effective bills</small></div>
        <div className="plw-card"><span>Consultancy Received</span><strong>{money(commercial.paid)}</strong><small>{commercial.paymentCount || 0} effective payments</small></div>
        <div className="plw-card"><span>Consultancy Due</span><strong>{money(commercial.due)}</strong><small>Billing runs across every lifecycle phase</small></div>
        <div className="plw-card"><span>Construction Cash</span><strong>{money(construction.currentBalance)}</strong><small>Income {money(construction.income)} · Expense {money(construction.expense)}</small></div>
      </section>
      <section className="plw-three">
        <div className="plw-card"><span>Supplier Advance</span><strong>{money(construction.supplierAdvance)}</strong></div>
        <div className="plw-card"><span>Cheque on Hold</span><strong>{money(construction.chequeOnHold)}</strong></div>
        <div className="plw-card"><span>Construction Ledger</span><strong>{construction.ledgerEntryCount || 0}</strong><small>Entries preserved in Project Management</small></div>
      </section>
      <section className="plw-two">
        <div className="plw-panel"><div className="plw-panel-head"><div><h2>Recent Bills</h2><small>Consultancy / service billing</small></div><Link className="plw-link" href="/admin/finance">Open Billing</Link></div><div className="plw-table-wrap"><table className="plw-table"><thead><tr><th>Date</th><th>Bill</th><th>Category</th><th>Description</th><th>Net</th></tr></thead><tbody>
          {(data.recentBills || []).map((row: Row) => <tr key={row.id || row.bill_code}><td>{dateText(row.bill_date)}</td><td>{text(row.bill_code)}</td><td>{text(row.billing_category || row.category)}</td><td>{text(row.description)}</td><td>{money(row.net_amount ?? row.amount)}</td></tr>)}
          {!data.recentBills?.length && <tr><td colSpan={5}><div className="plw-empty">No bills recorded.</div></td></tr>}
        </tbody></table></div></div>
        <div className="plw-panel"><div className="plw-panel-head"><div><h2>Recent Payments</h2><small>Money received for this project</small></div></div><div className="plw-table-wrap"><table className="plw-table"><thead><tr><th>Date</th><th>Payment</th><th>For</th><th>Method</th><th>Amount</th></tr></thead><tbody>
          {(data.recentPayments || []).map((row: Row) => <tr key={row.id || row.payment_code}><td>{dateText(row.payment_date)}</td><td>{text(row.payment_code)}</td><td>{text(row.payment_for || row.income_category)}</td><td>{text(row.payment_method)}</td><td>{money(row.amount)}</td></tr>)}
          {!data.recentPayments?.length && <tr><td colSpan={5}><div className="plw-empty">No payments recorded.</div></td></tr>}
        </tbody></table></div></div>
      </section>
    </>}

    {tab === "design" && <section className="plw-panel">
      <div className="plw-panel-head"><div><h2>Design Delivery</h2><small>Architectural, structural, 3D, MEP, fire safety, estimate and design books</small></div><span className={`plw-status ${statusClass(data.design?.status)}`}>{text(data.design?.status)}</span></div>
      <div className="plw-table-wrap"><table className="plw-table"><thead><tr><th>Code</th><th>Discipline</th><th>Drawing / Deliverable</th><th>Revision</th><th>Assigned</th><th>Status</th><th>Submitted</th></tr></thead><tbody>
        {(data.design?.submissions || []).map((row: Row) => <tr key={row.drawing_code}><td>{text(row.drawing_code)}</td><td>{text(row.discipline)}</td><td>{text(row.drawing_title)}</td><td>{text(row.revision)}</td><td>{text(row.assigned_employee_code)}</td><td><span className={`plw-status ${statusClass(row.status)}`}>{text(row.status)}</span></td><td>{dateText(row.submitted_at || row.created_at)}</td></tr>)}
        {!data.design?.submissions?.length && <tr><td colSpan={7}><div className="plw-empty">No digital drawing submissions are attached yet. The lifecycle stage status is still preserved, so legacy completed design work remains valid.</div></td></tr>}
      </tbody></table></div>
    </section>}

    {tab === "approval" && <section className="plw-panel">
      <div className="plw-panel-head"><div><h2>Authority & Client Approvals</h2><small>Municipality, NOC, Fire Service, vetting and other approval records</small></div><span className={`plw-status ${statusClass(data.approval?.status)}`}>{text(data.approval?.status)}</span></div>
      <div className="plw-table-wrap"><table className="plw-table"><thead><tr><th>Approval</th><th>Type</th><th>Requested From</th><th>Status</th><th>Requested</th><th>Decided</th><th>Notes</th></tr></thead><tbody>
        {(data.approval?.records || []).map((row: Row) => <tr key={row.id || row.approval_code}><td>{text(row.approval_code)}</td><td>{text(row.approval_type || row.category)}</td><td>{text(row.requested_from)}</td><td><span className={`plw-status ${statusClass(row.status || row.approval_status)}`}>{text(row.status || row.approval_status)}</span></td><td>{dateText(row.requested_at)}</td><td>{dateText(row.decided_at || row.approved_at)}</td><td>{text(row.decision_notes || row.review_notes)}</td></tr>)}
        {!data.approval?.records?.length && <tr><td colSpan={7}><div className="plw-empty">No digital approval records are attached to this project yet.</div></td></tr>}
      </tbody></table></div>
    </section>}

    {tab === "supervision" && <>
      <section className="plw-grid">
        <div className="plw-card"><span>Supervision Status</span><strong>{text(data.supervision?.status)}</strong><small>{data.supervision?.projectManagementEnabled ? "Project Management enabled" : "Project Management not enabled"}</small></div>
        <div className="plw-card"><span>Site Visits</span><strong>{data.supervision?.visits?.length || 0}</strong><small>Digital visit records</small></div>
        <div className="plw-card"><span>Suppliers</span><strong>{data.supervision?.suppliers?.length || 0}</strong><small>Project supplier accounts</small></div>
        <div className="plw-card"><span>Contractors</span><strong>{data.supervision?.contractors?.length || 0}</strong><small>Project contracts</small></div>
      </section>
      <section className="plw-two">
        <div className="plw-panel"><div className="plw-panel-head"><div><h2>Recent Site Visits</h2><small>Location, observations and actions stay with the project</small></div><Link className="plw-link" href="/admin/site-visits">All Site Visits</Link></div><div className="plw-panel-body plw-list">
          {(data.supervision?.visits || []).slice(0, 20).map((row: Row) => <div className="plw-list-row" key={row.id || row.visit_code}><div><strong>{text(row.visit_code)} · {text(row.visit_purpose || row.purpose, "Site Visit")}</strong><span>{text(row.observations || row.notes, "No observations")} {row.action_required ? ` · Action: ${row.action_required}` : ""}</span></div><div><span className={`plw-status ${statusClass(row.status)}`}>{text(row.status)}</span><span>{dateText(row.visit_date)}</span></div></div>)}
          {!data.supervision?.visits?.length && <div className="plw-empty">No site visits recorded.</div>}
        </div></div>
        <div className="plw-panel"><div className="plw-panel-head"><div><h2>Construction Parties</h2><small>Suppliers and contractors connected to this project</small></div>{data.supervision?.projectManagementEnabled && <Link className="plw-link" href="/projectmanagement">Open Project Management</Link>}</div><div className="plw-panel-body plw-list">
          {(data.supervision?.suppliers || []).slice(0, 10).map((row: Row) => <div className="plw-list-row" key={`s-${row.id}`}><div><strong>{text(row.supplier_name)}</strong><span>{text(row.primary_category)} · {text(row.billing_unit)}</span></div><span className={`plw-status ${row.active === false ? "bad" : "good"}`}>{row.active === false ? "Inactive" : "Active"}</span></div>)}
          {(data.supervision?.contractors || []).slice(0, 10).map((row: Row) => <div className="plw-list-row" key={`c-${row.id}`}><div><strong>{text(row.contractor_name)}</strong><span>{text(row.category)} · {text(row.scope_description)}</span></div><span className={`plw-status ${row.active === false ? "bad" : "good"}`}>{row.active === false ? "Inactive" : "Active"}</span></div>)}
          {!data.supervision?.suppliers?.length && !data.supervision?.contractors?.length && <div className="plw-empty">No suppliers or contractors connected yet.</div>}
        </div></div>
      </section>
    </>}

    {tab === "handover" && <section className="plw-two">
      <div className="plw-panel"><div className="plw-panel-head"><div><h2>Handover Readiness</h2><small>A project should pass these checks before completion</small></div><span className={`plw-status ${data.handover?.ready ? "good" : "warn"}`}>{data.handover?.ready ? "Ready" : "Needs attention"}</span></div><div className="plw-panel-body plw-checks">
        {(data.handover?.checks || []).map((item: any) => <div className={`plw-check ${item.complete ? "done" : ""}`} key={item.key}><i>{item.complete ? "✓" : "!"}</i><div><strong>{item.label}</strong><span>{item.complete ? "Complete" : "Pending"}</span></div></div>)}
      </div></div>
      <div className="plw-panel"><div className="plw-panel-head"><div><h2>Close-out</h2><small>Handover sits between execution and archive</small></div></div><div className="plw-panel-body">
        <p style={{margin:"0 0 12px",fontSize:"9px",lineHeight:1.7,color:"var(--lv-text-secondary)"}}>Move the project to <strong>Handover</strong> when active design/approval/supervision work is finished. After documents, payments and open tasks are cleared, move it to <strong>Completed</strong>. Projects without supervision can move directly from Approval to Handover.</p>
        <div className="plw-phase-editor"><div className="plw-field"><label>Current phase</label><select value={nextPhase} onChange={(event) => setNextPhase(event.target.value)}>{(data.projectPhases || []).map((phase: string) => <option key={phase} value={phase}>{phase}</option>)}</select></div><div className="plw-field"><label>Close-out note</label><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Final drawing/books delivered, client acknowledged, remaining notes…" /></div><button className="plw-button primary" disabled={savingPhase || !nextPhase || nextPhase === project.lifecyclePhase} onClick={() => void updatePhase()}>{savingPhase ? "Updating…" : "Update Phase"}</button></div>
      </div></div>
    </section>}

    {tab === "documents" && <section className="plw-panel">
      <div className="plw-panel-head"><div><h2>Project Documents</h2><small>Files stay attached to the master project record</small></div><Link className="plw-link" href={`/admin/projects/${encodeURIComponent(projectId)}`}>Upload / Manage</Link></div>
      <div className="plw-table-wrap"><table className="plw-table"><thead><tr><th>Date</th><th>Code</th><th>Title</th><th>Type</th><th>Client Visible</th><th>File</th></tr></thead><tbody>
        {(data.documents || []).map((row: Row) => <tr key={row.id || row.document_code}><td>{dateText(row.document_date || row.created_at)}</td><td>{text(row.document_code)}</td><td>{text(row.title)}</td><td>{text(row.document_type)}</td><td>{row.client_visible ? "Yes" : "No"}</td><td>{row.drive_file_url ? <a href={row.drive_file_url} target="_blank" rel="noreferrer">Open file</a> : "—"}</td></tr>)}
        {!data.documents?.length && <tr><td colSpan={6}><div className="plw-empty">No project documents are registered yet.</div></td></tr>}
      </tbody></table></div>
    </section>}

    {tab === "activity" && <section className="plw-panel">
      <div className="plw-panel-head"><div><h2>Project Activity Timeline</h2><small>Lifecycle, site, design, approval, document and payment events in one stream</small></div><span className="plw-status">{activity.length} recent events</span></div>
      <div className="plw-panel-body plw-timeline">
        {activity.map((event, index) => <div className="plw-event" key={`${event.type}-${event.at}-${index}`}><time>{dateText(event.at, true)}</time><b>{event.type}</b><div><strong>{event.title}</strong><span>{event.detail}</span></div></div>)}
        {!activity.length && <div className="plw-empty">No lifecycle activity is available yet.</div>}
      </div>
    </section>}
  </main>;
}
