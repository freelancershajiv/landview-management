"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;
const START_GATES = ["None", "Any Payment", "Minimum Amount", "Minimum Percent", "Fully Paid"];
const RELEASE_GATES = ["None", "No Overdue Invoice", "Minimum Amount", "Minimum Percent", "Fully Paid"];

function money(value: unknown) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

async function readJson(response: Response, fallback: string) {
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || fallback));
  return json.data;
}

async function loadControl() {
  return readJson(
    await fetch("/api/billing/control", { credentials: "same-origin", cache: "no-store" }),
    "Could not load Billing controls."
  );
}

async function postControl(payload: Row) {
  return readJson(
    await fetch("/api/billing/control", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
    "Billing control action failed."
  );
}

async function approveOverride(serviceId: string, reason: string) {
  return readJson(
    await fetch("/api/billing/gate-override", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceId, reason }),
    }),
    "Could not approve delivery override."
  );
}

function billingModel(service: Row) {
  if (String(service.serviceKey || "") === "site-supervision") return "Manual / Milestone";
  const raw = String(service.billingModel || "fixed").toLowerCase();
  if (raw === "fixed") return "Fixed / Milestone";
  if (raw === "manual") return "Manual / Milestone";
  return String(service.billingModel || "Fixed / Milestone");
}

function GateRow({
  service,
  saving,
  onSave,
  onOverride,
}: {
  service: Row;
  saving: string;
  onSave: (service: Row, startGate: string, startValue: string, releaseGate: string, releaseValue: string) => Promise<void>;
  onOverride: (service: Row) => Promise<void>;
}) {
  const [startGate, setStartGate] = useState(String(service.startGate || "None"));
  const [startValue, setStartValue] = useState(String(service.startGateValue || ""));
  const [releaseGate, setReleaseGate] = useState(String(service.releaseGate || "None"));
  const [releaseValue, setReleaseValue] = useState(String(service.releaseGateValue || ""));

  useEffect(() => {
    setStartGate(String(service.startGate || "None"));
    setStartValue(String(service.startGateValue || ""));
    setReleaseGate(String(service.releaseGate || "None"));
    setReleaseValue(String(service.releaseGateValue || ""));
  }, [service.id, service.startGate, service.startGateValue, service.releaseGate, service.releaseGateValue]);

  const needsStartValue = startGate === "Minimum Amount" || startGate === "Minimum Percent";
  const needsReleaseValue = releaseGate === "Minimum Amount" || releaseGate === "Minimum Percent";
  const busy = saving === `gate-${service.id}` || saving === `override-${service.id}`;

  return (
    <tr>
      <td className="bc-service">
        <strong>{service.serviceName}</strong>
        <span>{service.billingCategory || "—"}</span>
      </td>
      <td><span className="bc-tag">{billingModel(service)}</span></td>
      <td><strong>{money(service.contractNet)}</strong></td>
      <td>
        <div className="bc-gates">
          <select value={startGate} onChange={(e) => setStartGate(e.target.value)}>
            {START_GATES.map((gate) => <option key={gate}>{gate}</option>)}
          </select>
          <input
            value={startValue}
            disabled={!needsStartValue}
            onChange={(e) => setStartValue(e.target.value)}
            placeholder={startGate === "Minimum Percent" ? "%" : "BDT"}
          />
          <select value={releaseGate} onChange={(e) => setReleaseGate(e.target.value)}>
            {RELEASE_GATES.map((gate) => <option key={gate}>{gate}</option>)}
          </select>
          <input
            value={releaseValue}
            disabled={!needsReleaseValue}
            onChange={(e) => setReleaseValue(e.target.value)}
            placeholder={releaseGate === "Minimum Percent" ? "%" : "BDT"}
          />
          <div className="bc-row-actions">
            <button className="bc-btn primary" disabled={busy} onClick={() => void onSave(service, startGate, startValue, releaseGate, releaseValue)}>
              {saving === `gate-${service.id}` ? "Saving…" : "Save Gates"}
            </button>
            <button className="bc-btn" disabled={busy} onClick={() => void onOverride(service)}>
              Override
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
}

export default function BillingControlPage() {
  const [data, setData] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [projectId, setProjectId] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      setData(await loadControl());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Billing controls.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); }, []);

  const projects: Row[] = data?.projects || [];
  const selected = useMemo(
    () => projects.find((row) => row.projectId === projectId) || null,
    [projects, projectId]
  );
  const services: Row[] = selected?.services || [];

  useEffect(() => {
    if (!projectId && projects.length) setProjectId(projects[0].projectId);
  }, [projects, projectId]);

  async function saveGate(service: Row, startGate: string, startValue: string, releaseGate: string, releaseValue: string) {
    if (saving) return;
    setSaving(`gate-${service.id}`);
    setError("");
    setMessage("");
    try {
      setData(await postControl({
        action: "updateGate",
        serviceId: service.id,
        startGate,
        startGateValue: startValue,
        releaseGate,
        releaseGateValue: releaseValue,
      }));
      setMessage(`${service.serviceName} financial gates updated.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update financial gates.");
    } finally {
      setSaving("");
    }
  }

  async function overrideGate(service: Row) {
    const reason = window.prompt(`One-time delivery override for ${service.serviceName}\n\nEnter the management reason:`);
    if (!reason?.trim() || saving) return;
    setSaving(`override-${service.id}`);
    setError("");
    setMessage("");
    try {
      await approveOverride(service.id, reason.trim());
      setMessage(`${service.serviceName}: next final delivery is approved for one use (expires in 2 hours).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not approve override.");
    } finally {
      setSaving("");
    }
  }

  const s = data?.summary || {};
  const ready: Row[] = data?.ready || [];

  return (
    <main className="bc-page">
      <style>{`
        .bc-page{max-width:1500px;margin:0 auto;color:var(--lv-text-primary)}.bc-page *{box-sizing:border-box}.bc-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:14px}.bc-head small{font-size:9px;font-weight:950;letter-spacing:.13em;color:var(--lv-brand-text)}.bc-head h1{margin:5px 0;font-size:29px}.bc-head p{margin:0;color:var(--lv-text-secondary);font-size:10px;max-width:800px}.bc-actions,.bc-row-actions{display:flex;gap:7px;flex-wrap:wrap}.bc-btn{min-height:34px;padding:0 10px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);display:inline-flex;align-items:center;justify-content:center;text-decoration:none;font-size:8px;font-weight:900;cursor:pointer}.bc-btn.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.bc-btn:disabled{opacity:.5;cursor:default}.bc-msg{padding:10px 12px;border-radius:8px;margin-bottom:10px;font-size:10px}.bc-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.bc-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}.bc-note{margin-bottom:12px;padding:11px 13px;border:1px solid var(--lv-brand-border);border-radius:9px;background:var(--lv-brand-soft);font-size:9px;color:var(--lv-text-secondary)}.bc-note strong{color:var(--lv-brand-text)}.bc-kpis{display:grid;grid-template-columns:repeat(7,1fr);gap:7px;margin-bottom:12px}.bc-kpi{padding:12px;border:1px solid var(--lv-border-default);border-radius:9px;background:var(--lv-surface-panel)}.bc-kpi span{display:block;font-size:7px;text-transform:uppercase;font-weight:950;color:var(--lv-text-muted)}.bc-kpi strong{display:block;margin-top:6px;font-size:16px}.bc-section{border:1px solid var(--lv-border-default);border-radius:11px;background:var(--lv-surface-panel);margin-bottom:12px;overflow:hidden}.bc-section-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 14px;border-bottom:1px solid var(--lv-border-default)}.bc-section-head h2{margin:0;font-size:13px}.bc-section-head p{margin:3px 0 0;font-size:8px;color:var(--lv-text-muted)}.bc-body{padding:13px}.bc-project{display:grid;grid-template-columns:minmax(260px,1fr) auto;gap:8px;margin-bottom:12px}.bc-select{width:100%;min-height:38px;padding:7px 9px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:9px}.bc-table-wrap{overflow:auto}.bc-table{width:100%;border-collapse:collapse;min-width:1120px}.bc-table th,.bc-table td{padding:9px 10px;border-bottom:1px solid var(--lv-border-subtle);font-size:8px;text-align:left;vertical-align:middle}.bc-table th{background:var(--lv-surface-muted);color:var(--lv-text-muted);font-size:7px;text-transform:uppercase}.bc-service strong{display:block;font-size:9px}.bc-service span{display:block;margin-top:3px;color:var(--lv-text-muted);font-size:7px}.bc-gates{display:grid;grid-template-columns:150px 90px 150px 90px minmax(150px,auto);gap:5px;align-items:center}.bc-gates select,.bc-gates input{min-height:31px;padding:5px 6px;border:1px solid var(--lv-border-default);border-radius:6px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px}.bc-gates input:disabled{opacity:.45}.bc-ready{display:grid;grid-template-columns:90px 1fr 1fr 120px 140px;gap:8px;padding:9px 12px;border-bottom:1px solid var(--lv-border-subtle);align-items:center;font-size:8px}.bc-ready:last-child{border-bottom:0}.bc-tag{display:inline-flex;padding:4px 6px;border-radius:999px;background:var(--lv-brand-soft);color:var(--lv-brand-text);font-size:7px;font-weight:950}.bc-empty{padding:20px;text-align:center;color:var(--lv-text-muted);font-size:9px}@media(max-width:1100px){.bc-kpis{grid-template-columns:repeat(4,1fr)}}@media(max-width:700px){.bc-head{flex-direction:column;align-items:stretch}.bc-actions .bc-btn{flex:1}.bc-kpis{grid-template-columns:repeat(2,1fr)}.bc-project{grid-template-columns:1fr}.bc-gates{grid-template-columns:1fr}.bc-ready{grid-template-columns:1fr}}
      `}</style>

      <header className="bc-head">
        <div>
          <small>LAND VIEW / BILLING 2.0 CONTROL LAYER</small>
          <h1>Billing Controls</h1>
          <p>Configure service payment gates, delivery release gates and audited management overrides. Site Supervision is manual / milestone-based only.</p>
        </div>
        <div className="bc-actions">
          <button className="bc-btn" disabled={loading} onClick={() => void refresh()}>{loading ? "Refreshing…" : "Refresh"}</button>
          <Link className="bc-btn" href="/admin/finance/adjustments">Credit / Debit Notes</Link>
          <Link className="bc-btn primary" href="/admin/finance/workspace">Billing Workspace</Link>
        </div>
      </header>

      <div className="bc-note"><strong>Monthly supervision billing is disabled.</strong> Site Supervision bills are created manually or through an approved project milestone. No monthly scheduler is running.</div>
      {error && <div className="bc-msg bad">{error}</div>}
      {message && <div className="bc-msg good">{message}</div>}

      <section className="bc-kpis">
        <div className="bc-kpi"><span>Contract Value</span><strong>{money(s.contractValue)}</strong></div>
        <div className="bc-kpi"><span>Billed</span><strong>{money(s.billed)}</strong></div>
        <div className="bc-kpi"><span>Collected</span><strong>{money(s.paid)}</strong></div>
        <div className="bc-kpi"><span>Current Due</span><strong>{money(s.due)}</strong></div>
        <div className="bc-kpi"><span>Future Revenue</span><strong>{money(s.futureRevenue)}</strong></div>
        <div className="bc-kpi"><span>Ready to Bill</span><strong>{money(s.readyToBill)}</strong></div>
        <div className="bc-kpi"><span>Financially Open</span><strong>{Number(s.financiallyOpen || 0)}</strong></div>
      </section>

      <section className="bc-section">
        <div className="bc-section-head">
          <div>
            <h2>Project Financial Controls</h2>
            <p>{Number(s.contracts || 0)} contracts · {Number(s.backfilledContracts || 0)} legacy backfilled</p>
          </div>
        </div>
        <div className="bc-body">
          <div className="bc-project">
            <select className="bc-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => <option key={p.projectId} value={p.projectId}>{p.projectId} · {p.ownerName || p.projectName}</option>)}
            </select>
            {projectId && <Link className="bc-btn" href={`/admin/finance/workspace?fileId=${encodeURIComponent(projectId)}`}>Open {projectId}</Link>}
          </div>
          {selected ? (
            <div className="bc-table-wrap">
              <table className="bc-table">
                <thead><tr><th>Service</th><th>Billing Model</th><th>Contract</th><th>Financial Gates</th></tr></thead>
                <tbody>{services.map((service) => <GateRow key={service.id} service={service} saving={saving} onSave={saveGate} onOverride={overrideGate} />)}</tbody>
              </table>
            </div>
          ) : <div className="bc-empty">No Billing 2.0 contract selected.</div>}
        </div>
      </section>

      <section className="bc-section">
        <div className="bc-section-head">
          <div><h2>Ready to Bill Queue</h2><p>Workflow milestones waiting for Accounts to review and issue a normal LAND VIEW bill.</p></div>
          <span className="bc-tag">{ready.length} shown</span>
        </div>
        {ready.length ? ready.map((row) => (
          <div className="bc-ready" key={row.id}>
            <strong>{row.projectId}</strong><span>{row.serviceName}</span><span>{row.milestone}</span><strong>{money(row.amount)}</strong>
            <Link className="bc-btn primary" href={`/admin/finance/workspace?fileId=${encodeURIComponent(row.projectId)}`}>Review / Issue</Link>
          </div>
        )) : <div className="bc-empty">Nothing is currently waiting to be billed.</div>}
      </section>
    </main>
  );
}
