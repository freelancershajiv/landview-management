"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;
const START_GATES = ["None", "Any Payment", "Minimum Amount", "Minimum Percent", "Fully Paid"];
const RELEASE_GATES = ["None", "No Overdue Invoice", "Minimum Amount", "Minimum Percent", "Fully Paid"];

function money(value: unknown) {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(Number(value || 0));
}
function today() { return new Date().toISOString().slice(0, 10); }
async function readJson(response: Response, fallback: string) {
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || fallback));
  return json.data;
}
async function loadControl() {
  return readJson(await fetch("/api/billing/control", { credentials: "same-origin", cache: "no-store" }), "Could not load Billing controls.");
}
async function postControl(payload: Row) {
  return readJson(await fetch("/api/billing/control", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }), "Billing control action failed.");
}
async function approveOverride(serviceId: string, reason: string) {
  return readJson(await fetch("/api/billing/gate-override", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ serviceId, reason }) }), "Could not approve delivery override.");
}

export default function BillingControlPage() {
  const [data, setData] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [projectId, setProjectId] = useState("");
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const [billingDay, setBillingDay] = useState("1");
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState("");

  async function refresh() {
    setLoading(true); setError("");
    try { setData(await loadControl()); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load Billing controls."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void refresh(); }, []);

  const projects: Row[] = data?.projects || [];
  const selected = useMemo(() => projects.find((row) => row.projectId === projectId) || null, [projects, projectId]);
  const services: Row[] = selected?.services || [];
  const supervision = services.find((row) => row.serviceKey === "site-supervision") || null;
  const rule = (data?.rules || []).find((row: Row) => row.project_code === projectId && row.contract_service_id === supervision?.id) || null;

  useEffect(() => {
    if (!projectId && projects.length) setProjectId(projects[0].projectId);
  }, [projects, projectId]);
  useEffect(() => {
    if (rule) {
      setMonthlyAmount(String(rule.monthly_amount || "")); setBillingDay(String(rule.billing_day || 1));
      setStartDate(String(rule.start_date || today())); setEndDate(String(rule.end_date || ""));
    } else {
      setMonthlyAmount(""); setBillingDay("1"); setStartDate(today()); setEndDate("");
    }
  }, [rule?.id, projectId]);

  async function act(key: string, payload: Row, success: string) {
    if (saving) return;
    setSaving(key); setError(""); setMessage("");
    try { setData(await postControl(payload)); setMessage(success); }
    catch (e) { setError(e instanceof Error ? e.message : "Billing action failed."); }
    finally { setSaving(""); }
  }

  async function saveGate(service: Row, startGate: string, startValue: string, releaseGate: string, releaseValue: string) {
    await act(`gate-${service.id}`, { action: "updateGate", serviceId: service.id, startGate, startGateValue: startValue, releaseGate, releaseGateValue: releaseValue }, `${service.serviceName} financial gates updated.`);
  }

  async function overrideGate(service: Row) {
    const reason = window.prompt(`One-time delivery override for ${service.serviceName}\n\nEnter the management reason:`);
    if (!reason?.trim()) return;
    setSaving(`override-${service.id}`); setError(""); setMessage("");
    try { await approveOverride(service.id, reason.trim()); setMessage(`${service.serviceName}: next final delivery is approved for one use (expires in 2 hours).`); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not approve override."); }
    finally { setSaving(""); }
  }

  const s = data?.summary || {};
  return <main className="bc-page">
    <style>{`
      .bc-page{max-width:1500px;margin:0 auto;color:var(--lv-text-primary)}.bc-page *{box-sizing:border-box}.bc-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:14px}.bc-head small{font-size:9px;font-weight:950;letter-spacing:.13em;color:var(--lv-brand-text)}.bc-head h1{margin:5px 0;font-size:29px}.bc-head p{margin:0;color:var(--lv-text-secondary);font-size:10px;max-width:780px}.bc-actions{display:flex;gap:7px;flex-wrap:wrap}.bc-btn{min-height:36px;padding:0 11px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);display:inline-flex;align-items:center;justify-content:center;text-decoration:none;font-size:9px;font-weight:900;cursor:pointer}.bc-btn.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.bc-btn.warn{border-color:var(--lv-warning);color:var(--lv-warning)}.bc-btn:disabled{opacity:.5;cursor:default}.bc-msg{padding:10px 12px;border-radius:8px;margin-bottom:10px;font-size:10px}.bc-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.bc-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}.bc-kpis{display:grid;grid-template-columns:repeat(7,1fr);gap:7px;margin-bottom:12px}.bc-kpi{padding:12px;border:1px solid var(--lv-border-default);border-radius:9px;background:var(--lv-surface-panel)}.bc-kpi span{display:block;font-size:7px;text-transform:uppercase;font-weight:950;color:var(--lv-text-muted)}.bc-kpi strong{display:block;margin-top:6px;font-size:16px}.bc-section{border:1px solid var(--lv-border-default);border-radius:11px;background:var(--lv-surface-panel);margin-bottom:12px;overflow:hidden}.bc-section-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 14px;border-bottom:1px solid var(--lv-border-default)}.bc-section-head h2{margin:0;font-size:13px}.bc-section-head p{margin:3px 0 0;font-size:8px;color:var(--lv-text-muted)}.bc-body{padding:13px}.bc-project{display:grid;grid-template-columns:minmax(260px,1fr) auto;gap:8px;margin-bottom:12px}.bc-input,.bc-select{width:100%;min-height:38px;padding:7px 9px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:9px}.bc-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.bc-field{display:grid;gap:5px}.bc-field label{font-size:7px;text-transform:uppercase;font-weight:950;color:var(--lv-text-muted)}.bc-table-wrap{overflow:auto}.bc-table{width:100%;border-collapse:collapse;min-width:1100px}.bc-table th,.bc-table td{padding:9px 10px;border-bottom:1px solid var(--lv-border-subtle);font-size:8px;text-align:left;vertical-align:middle}.bc-table th{background:var(--lv-surface-muted);color:var(--lv-text-muted);font-size:7px;text-transform:uppercase}.bc-table tr:last-child td{border-bottom:0}.bc-service strong{display:block;font-size:9px}.bc-service span{display:block;margin-top:3px;color:var(--lv-text-muted);font-size:7px}.bc-gates{display:grid;grid-template-columns:150px 90px 150px 90px auto;gap:5px;align-items:center}.bc-gates select,.bc-gates input{min-height:31px;padding:5px 6px;border:1px solid var(--lv-border-default);border-radius:6px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px}.bc-ready{display:grid;grid-template-columns:90px 1fr 1fr 120px 140px;gap:8px;padding:9px 12px;border-bottom:1px solid var(--lv-border-subtle);align-items:center;font-size:8px}.bc-ready:last-child{border-bottom:0}.bc-tag{display:inline-flex;padding:4px 6px;border-radius:999px;background:var(--lv-brand-soft);color:var(--lv-brand-text);font-size:7px;font-weight:950}.bc-empty{padding:20px;text-align:center;color:var(--lv-text-muted);font-size:9px}@media(max-width:1100px){.bc-kpis{grid-template-columns:repeat(4,1fr)}.bc-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:700px){.bc-head{flex-direction:column;align-items:stretch}.bc-actions .bc-btn{flex:1}.bc-kpis{grid-template-columns:repeat(2,1fr)}.bc-project,.bc-grid{grid-template-columns:1fr}.bc-gates{grid-template-columns:1fr}.bc-ready{grid-template-columns:1fr}}
    `}</style>

    <header className="bc-head"><div><small>LAND VIEW / BILLING 2.0 CONTROL LAYER</small><h1>Billing Controls</h1><p>Configure monthly supervision, service payment/release gates and audited delivery overrides. Historical backfilled contracts stay unrestricted until you intentionally enable a gate.</p></div><div className="bc-actions"><button className="bc-btn" disabled={loading} onClick={() => void refresh()}>{loading ? "Refreshing…" : "Refresh"}</button><Link className="bc-btn" href="/admin/finance/adjustments">Credit / Debit Notes</Link><Link className="bc-btn primary" href="/admin/finance/workspace">Billing Workspace</Link></div></header>
    {error && <div className="bc-msg bad">{error}</div>}{message && <div className="bc-msg good">{message}</div>}

    <section className="bc-kpis">
      <div className="bc-kpi"><span>Contract Value</span><strong>{money(s.contractValue)}</strong></div><div className="bc-kpi"><span>Billed</span><strong>{money(s.billed)}</strong></div><div className="bc-kpi"><span>Collected</span><strong>{money(s.paid)}</strong></div><div className="bc-kpi"><span>Current Due</span><strong>{money(s.due)}</strong></div><div className="bc-kpi"><span>Future Revenue</span><strong>{money(s.futureRevenue)}</strong></div><div className="bc-kpi"><span>Ready to Bill</span><strong>{money(s.readyToBill)}</strong></div><div className="bc-kpi"><span>Financially Open</span><strong>{Number(s.financiallyOpen || 0)}</strong></div>
    </section>

    <section className="bc-section"><div className="bc-section-head"><div><h2>Project Control</h2><p>{Number(s.contracts || 0)} contracts · {Number(s.backfilledContracts || 0)} legacy backfilled · {Number(s.activeMonthlySupervisionRules || 0)} active monthly supervision rules</p></div></div><div className="bc-body">
      <div className="bc-project"><select className="bc-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>{projects.map((p) => <option key={p.projectId} value={p.projectId}>{p.projectId} · {p.ownerName || p.projectName}</option>)}</select>{projectId && <Link className="bc-btn" href={`/admin/finance/workspace?fileId=${encodeURIComponent(projectId)}`}>Open {projectId}</Link>}</div>
      {selected && <div className="bc-table-wrap"><table className="bc-table"><thead><tr><th>Service</th><th>Billing Model</th><th>Contract</th><th>Financial Gates</th></tr></thead><tbody>{services.map((service) => <GateRow key={service.id} service={service} saving={saving} onSave={saveGate} onOverride={overrideGate} />)}</tbody></table></div>}
    </div></section>

    <section className="bc-section"><div className="bc-section-head"><div><h2>Monthly Site Supervision</h2><p>Opt-in only. The scheduler creates a Ready-to-Bill milestone on the configured day; it never silently issues the client bill.</p></div>{rule && <span className="bc-tag">{rule.status} · next {String(rule.next_run_date || "—")}</span>}</div><div className="bc-body">
      {!supervision ? <div className="bc-empty">The selected contract has no Site Supervision service.</div> : <><div className="bc-grid"><div className="bc-field"><label>Monthly Amount</label><input className="bc-input" inputMode="decimal" value={monthlyAmount} onChange={(e) => setMonthlyAmount(e.target.value)} placeholder="35000" /></div><div className="bc-field"><label>Billing Day (1-28)</label><input className="bc-input" inputMode="numeric" value={billingDay} onChange={(e) => setBillingDay(e.target.value)} /></div><div className="bc-field"><label>Start Date</label><input className="bc-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div><div className="bc-field"><label>End Date (optional)</label><input className="bc-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div><div className="bc-field"><label>Actions</label><div className="bc-actions"><button className="bc-btn primary" disabled={!!saving} onClick={() => void act("rule", { action: "saveSupervisionRule", projectId, monthlyAmount, billingDay, startDate, endDate, status: "Active" }, `${projectId} monthly supervision rule saved.`)}>Save / Activate</button></div></div></div>{rule && <div className="bc-actions" style={{marginTop:10}}><button className="bc-btn" disabled={!!saving} onClick={() => void act("run", { action: "generateSupervisionNow", ruleId: rule.id }, "Monthly supervision milestone is ready to bill.")}>Generate Current Month Now</button><button className="bc-btn" disabled={!!saving} onClick={() => void act("status", { action: "setRuleStatus", ruleId: rule.id, status: rule.status === "Paused" ? "Active" : "Paused" }, rule.status === "Paused" ? "Monthly supervision resumed." : "Monthly supervision paused.")}>{rule.status === "Paused" ? "Resume" : "Pause"}</button><button className="bc-btn warn" disabled={!!saving} onClick={() => void act("stop", { action: "setRuleStatus", ruleId: rule.id, status: "Stopped" }, "Monthly supervision rule stopped.")}>Stop</button></div>}</>}
    </div></section>

    <section className="bc-section"><div className="bc-section-head"><div><h2>Ready to Bill Queue</h2><p>Workflow/monthly events waiting for Accounts to issue a normal LAND VIEW bill.</p></div><span className="bc-tag">{(data?.ready || []).length} shown</span></div>{(data?.ready || []).length ? (data?.ready || []).map((row: Row) => <div className="bc-ready" key={row.id}><strong>{row.projectId}</strong><span>{row.serviceName}</span><span>{row.milestone}</span><strong>{money(row.amount)}</strong><Link className="bc-btn primary" href={`/admin/finance/workspace?fileId=${encodeURIComponent(row.projectId)}`}>Review / Issue</Link></div>) : <div className="bc-empty">Nothing is waiting to be billed.</div>}</section>
  </main>;
}

function GateRow({ service, saving, onSave, onOverride }: { service: Row; saving: string; onSave: (service: Row, startGate: string, startValue: string, releaseGate: string, releaseValue: string) => Promise<void>; onOverride: (service: Row) => Promise<void> }) {
  const [startGate, setStartGate] = useState(String(service.startGate || "Any Payment"));
  const [startValue, setStartValue] = useState(String(service.startGateValue || 0));
  const [releaseGate, setReleaseGate] = useState(String(service.releaseGate || "None"));
  const [releaseValue, setReleaseValue] = useState(String(service.releaseGateValue || 0));
  useEffect(() => { setStartGate(String(service.startGate || "Any Payment")); setStartValue(String(service.startGateValue || 0)); setReleaseGate(String(service.releaseGate || "None")); setReleaseValue(String(service.releaseGateValue || 0)); }, [service.id, service.startGate, service.releaseGate, service.startGateValue, service.releaseGateValue]);
  return <tr><td className="bc-service"><strong>{service.serviceName}</strong><span>{service.billingCategory}</span></td><td><span className="bc-tag">{service.billingModel || "fixed"}</span></td><td><strong>{money(service.contractNet)}</strong></td><td><div className="bc-gates"><select value={startGate} onChange={(e) => setStartGate(e.target.value)}>{START_GATES.map((g) => <option key={g}>{g}</option>)}</select><input value={startValue} onChange={(e) => setStartValue(e.target.value)} title="Start gate amount or percent" /><select value={releaseGate} onChange={(e) => setReleaseGate(e.target.value)}>{RELEASE_GATES.map((g) => <option key={g}>{g}</option>)}</select><input value={releaseValue} onChange={(e) => setReleaseValue(e.target.value)} title="Release gate amount or percent" /><div className="bc-actions"><button className="bc-btn primary" disabled={!!saving} onClick={() => void onSave(service, startGate, startValue, releaseGate, releaseValue)}>Save</button>{releaseGate !== "None" && <button className="bc-btn warn" disabled={!!saving} onClick={() => void onOverride(service)}>One-Time Override</button>}</div></div></td></tr>;
}
