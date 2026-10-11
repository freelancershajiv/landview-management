"use client";

import { useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;
const money = (value: unknown) => new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 2 }).format(Number(value || 0));
const dateText = (value: unknown) => {
  const raw = String(value || "");
  const d = new Date(raw.includes("T") ? raw : raw.slice(0, 10) + "T00:00:00");
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};
const dateTimeText = (value: unknown) => {
  const d = new Date(String(value || ""));
  return Number.isNaN(d.getTime()) ? String(value || "") : d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const chequeLabel = (value: unknown) => ({ on_hold: "On Hold", cashed: "Cashed", bounced: "Bounced", cancelled: "Cancelled" }[String(value || "")] || "");

export default function ProjectControlCenterPage() {
  const [data, setData] = useState<Row | null>(null);
  const [project, setProject] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [enableProject, setEnableProject] = useState("");
  const [configSaving, setConfigSaving] = useState(false);

  async function load(code = project) {
    setLoading(true);
    setError("");
    try {
      const url = code ? `/api/project-control-center?projectId=${encodeURIComponent(code)}` : "/api/project-control-center";
      const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Could not load Project Control Center.");
      setData(payload.data);
      if (payload.data?.selectedProject?.projectCode) setProject(payload.data.selectedProject.projectCode);
    } catch (e: any) {
      setError(e?.message || "Could not load Project Control Center.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const code = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("projectId") || "" : "";
    if (code) setProject(code);
    void load(code);
  }, []);

  function chooseProject(code: string) {
    if (!code) return;
    setProject(code);
    if (typeof window !== "undefined") window.history.replaceState(null, "", `/projectmanagement/control?projectId=${encodeURIComponent(code)}`);
    void load(code);
  }

  async function enableSelectedProject() {
    if (!enableProject) return;
    setConfigSaving(true);
    setError("");
    try {
      const response = await fetch("/api/project-control-center", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setProjectManagementEnabled", projectId: enableProject, enabled: true }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Could not enable Project Management.");
      const code = enableProject;
      setEnableProject("");
      chooseProject(code);
    } catch (e: any) {
      setError(e?.message || "Could not enable Project Management.");
    } finally {
      setConfigSaving(false);
    }
  }

  const disabledProjects = useMemo(() => (data?.allProjects || []).filter((p: Row) => !p.enabled), [data]);
  const totals = data?.totals || {};
  const counts = data?.counts || {};
  const selected = data?.selectedProject;

  if (loading && !data) {
    return <main className="cc-loading"><div><span className="cc-spinner"/><strong>Loading Project Control Center</strong><small>Checking finance and project health…</small></div><style jsx>{styles}</style></main>;
  }

  if (!selected) {
    return (
      <main className="cc-page">
        <div className="cc-shell cc-chooser-shell">
          <section className="cc-chooser">
            <span className="cc-kicker">LAND VIEW · PROJECT CONTROL CENTER</span>
            <h1>Select a managed project</h1>
            <p>Open a project to see its cash position, supplier and contractor exposure, cheque status, audit trail and recent activity.</p>
            {error && <div className="cc-alert error">{error}</div>}
            <div className="cc-project-grid">
              {(data?.projects || []).map((p: Row) => <button key={p.id} onClick={() => chooseProject(p.projectCode)}><b>{p.projectCode}</b><strong>{p.projectName}</strong><span>{p.clientName || "Client not recorded"}</span><small>{p.location || "Location not recorded"}</small></button>)}
            </div>
            {!(data?.projects || []).length && <div className="cc-empty">No project currently has Project Management enabled.</div>}
            {data?.canConfigure && disabledProjects.length > 0 && <div className="cc-enable-box"><div><strong>Enable Project Management</strong><span>Enable a project before the first finance entry is created.</span></div><select value={enableProject} onChange={e => setEnableProject(e.target.value)}><option value="">Select project…</option>{disabledProjects.map((p: Row) => <option key={p.id} value={p.projectCode}>{p.projectCode} — {p.projectName}</option>)}</select><button disabled={!enableProject || configSaving} onClick={() => void enableSelectedProject()}>{configSaving ? "Enabling…" : "Enable"}</button></div>}
          </section>
        </div>
        <style jsx>{styles}</style>
      </main>
    );
  }

  const metrics = [
    ["Recorded Funds", totals.recordedFunds, "All project funds entered"],
    ["Actual Cash Income", totals.cashIncome, "Excludes cheques still on hold"],
    ["Recognized Expense", totals.expense, "Project cash already spent"],
    ["Available Cash", totals.cashBalance, "Current usable project cash"],
    ["Cheque on Hold", totals.chequeOnHold, `${counts.heldCheques || 0} held cheque(s)`],
    ["Supplier Advance", totals.supplierAdvance, "Currently held with supplier"],
    ["Contractor Advance", totals.contractorAdvance, "Paid above certified work"],
    ["Contractor Payable", totals.contractorPayable, "Certified but not yet paid"],
  ];

  return (
    <main className="cc-page">
      <div className="cc-shell">
        <header className="cc-head">
          <div><span className="cc-kicker">LAND VIEW · PROJECT CONTROL CENTER</span><h1>{selected.projectCode} <em>{selected.projectName}</em></h1><p>{selected.clientName || "Client not recorded"}{selected.location ? ` · ${selected.location}` : ""}</p></div>
          <div className="cc-head-actions"><select value={selected.projectCode} onChange={e => chooseProject(e.target.value)}>{(data?.projects || []).map((p: Row) => <option key={p.id} value={p.projectCode}>{p.projectCode} — {p.projectName}</option>)}</select><button onClick={() => void load(selected.projectCode)}>↻ Refresh</button></div>
        </header>

        {error && <div className="cc-alert error">{error}</div>}

        <section className="cc-stage"><div><span>PROJECT STAGE</span><strong>{selected.stage || "Supervision / Construction"}</strong></div><div><span>LEDGER HEALTH</span><strong>{Number(counts.entries || 0).toLocaleString("en-BD")} transactions</strong></div><div><span>ACTIVE PARTIES</span><strong>{Number(counts.suppliersAndContractors || 0).toLocaleString("en-BD")} suppliers / contractors</strong></div><div><span>CERTIFIED BILLS</span><strong>{Number(counts.certifiedBills || 0).toLocaleString("en-BD")}</strong></div></section>

        <section className="cc-metrics">{metrics.map(([label, value, note]) => <article key={String(label)}><span>{label}</span><strong>{money(value)}</strong><small>{note}</small></article>)}</section>

        <div className="cc-grid-two">
          <section className="cc-panel"><div className="cc-panel-head"><div><span>NEEDS ATTENTION</span><strong>Project control warnings</strong></div><small>Live from current finance data</small></div><div className="cc-attention">{(data?.attention || []).map((item: Row, index: number) => <button key={index} className={`level-${item.level}`} onClick={() => item.href && window.location.assign(item.href)}><i/><div><strong>{item.title}</strong>{Number(item.amount || 0) > 0 && <span>{money(item.amount)}</span>}</div><b>→</b></button>)}</div></section>
          <section className="cc-panel"><div className="cc-panel-head"><div><span>CONTROL POSITION</span><strong>Supplier & contractor exposure</strong></div><small>Immediate commitments</small></div><div className="cc-position"><div><span>Sattapur Deposit</span><strong>{money(data?.supplier?.sattapurDepositAmount)}</strong></div><div><span>Delivered Brick Value</span><strong>{money(data?.supplier?.sattapurDeliveredValue)}</strong></div><div><span>Supplier Advance</span><strong>{money(data?.supplier?.supplierAdvance)}</strong></div><div><span>Unconfigured Contracts</span><strong>{counts.unconfiguredContracts || 0}</strong></div></div></section>
        </div>

        <section className="cc-panel cc-table-panel"><div className="cc-panel-head"><div><span>RECENT ACTIVITY</span><strong>Latest project transactions</strong></div><button onClick={() => window.location.assign(`/projectmanagement?projectId=${encodeURIComponent(selected.projectCode)}`)}>Open Finance Workspace →</button></div><div className="cc-table-wrap"><table><thead><tr><th>Serial</th><th>Date</th><th>Type</th><th>Party</th><th>Details</th><th>Category</th><th>Status</th><th className="num">Amount</th></tr></thead><tbody>{(data?.recent || []).map((r: Row) => <tr key={r.id}><td><b className="cc-serial">{r.transactionCode}</b></td><td>{dateText(r.date)}</td><td><span className={`cc-type ${r.type}`}>{r.type}</span></td><td>{r.party || "—"}</td><td className="details">{r.details}</td><td>{r.category || "—"}</td><td>{r.chequeStatus ? <span className={`cc-cheque ${r.chequeStatus}`}>{chequeLabel(r.chequeStatus)}</span> : <span className="cc-muted">—</span>}</td><td className="num"><strong>{money(r.amount)}</strong></td></tr>)}{!(data?.recent || []).length && <tr><td colSpan={8} className="cc-empty-cell">No project transactions yet.</td></tr>}</tbody></table></div></section>

        <div className="cc-grid-two">
          <section className="cc-panel"><div className="cc-panel-head"><div><span>CONTRACTOR CONTROL</span><strong>Current contractor accounts</strong></div><button onClick={() => window.location.assign(`/projectmanagement/contractors?projectId=${encodeURIComponent(selected.projectCode)}`)}>Billing & Bills →</button></div><div className="cc-contractors">{(data?.contractors || []).filter((c: Row) => String(c.partyType || "").toLowerCase() === "contractor").slice(0, 8).map((c: Row) => <div key={c.id}><div><strong>{c.name}</strong><span>{c.category}</span></div><p><span>Certified {money(c.certified)}</span><span>Paid {money(c.paid)}</span></p><b className={Number(c.payable || 0) > 0 ? "payable" : "ok"}>{Number(c.payable || 0) > 0 ? `${money(c.payable)} payable` : Number(c.advance || 0) > 0 ? `${money(c.advance)} advance` : "Settled"}</b></div>)}{!(data?.contractors || []).some((c: Row) => String(c.partyType || "").toLowerCase() === "contractor") && <div className="cc-empty">No active contractor account.</div>}</div></section>
          <section className="cc-panel"><div className="cc-panel-head"><div><span>AUDIT HISTORY</span><strong>Recent finance changes</strong></div><small>Database-level audit trail</small></div><div className="cc-audit">{(data?.audit || []).map((a: Row) => <div key={a.id}><i/><div><strong>{String(a.action || "").replace("project_management.", "")}</strong><span>{a.target}</span></div><p>{a.actor}<small>{dateTimeText(a.createdAt)}</small></p></div>)}{!(data?.audit || []).length && <div className="cc-empty">No audit events recorded after Phase 1 activation.</div>}</div></section>
        </div>
      </div>
      <style jsx>{styles}</style>
    </main>
  );
}

const styles = `
.cc-page{min-height:100vh;background:#f3f6f5;color:#17232b;padding:28px 26px 60px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.cc-shell{max-width:1540px;margin:0 auto}.cc-head{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:18px}.cc-kicker{display:block;font-size:10px;letter-spacing:.15em;font-weight:900;color:#1d6b52}.cc-head h1,.cc-chooser h1{margin:8px 0 5px;font-size:clamp(30px,4vw,46px);letter-spacing:-.045em}.cc-head h1 em{font-style:normal;font-size:.52em;font-weight:650;color:#6f7d84;margin-left:8px}.cc-head p,.cc-chooser p{margin:0;color:#718087;font-size:13px}.cc-head-actions{display:flex;gap:8px}.cc-head-actions select,.cc-enable-box select{min-height:42px;border:1px solid #dbe3e5;border-radius:10px;background:#fff;padding:0 12px;font:inherit;color:#27363d}.cc-head-actions button,.cc-enable-box button,.cc-panel-head button{border:1px solid #d9e3df;background:#fff;color:#285e4b;border-radius:10px;padding:10px 13px;font:inherit;font-size:11px;font-weight:800;cursor:pointer}.cc-alert{padding:12px 14px;border-radius:11px;margin:10px 0}.cc-alert.error{background:#fff0ee;color:#9f4038;border:1px solid #efd2ce}.cc-stage{display:grid;grid-template-columns:repeat(4,1fr);background:#17242b;color:#fff;border-radius:16px;overflow:hidden;margin-bottom:14px}.cc-stage>div{padding:14px 17px;border-right:1px solid rgba(255,255,255,.09)}.cc-stage>div:last-child{border:0}.cc-stage span{display:block;color:#9fb2aa;font-size:9px;letter-spacing:.1em;font-weight:850}.cc-stage strong{display:block;margin-top:5px;font-size:14px}.cc-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;margin-bottom:14px}.cc-metrics article{background:#fff;border:1px solid #e1e7e9;border-radius:15px;padding:16px 17px;box-shadow:0 8px 25px rgba(20,38,29,.035)}.cc-metrics article>span{display:block;color:#76858b;font-size:10px;font-weight:800}.cc-metrics article>strong{display:block;margin-top:8px;font-size:24px;letter-spacing:-.035em}.cc-metrics article>small{display:block;color:#97a1a5;font-size:9px;margin-top:5px}.cc-grid-two{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}.cc-panel{background:#fff;border:1px solid #e1e7e9;border-radius:16px;overflow:hidden;box-shadow:0 9px 28px rgba(20,38,29,.035)}.cc-panel-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;padding:15px 17px;border-bottom:1px solid #edf1f2}.cc-panel-head span{display:block;color:#89959b;font-size:9px;letter-spacing:.1em;font-weight:850}.cc-panel-head strong{display:block;margin-top:4px;font-size:17px}.cc-panel-head small{color:#99a3a7;font-size:9px}.cc-attention{padding:10px}.cc-attention button{width:100%;display:flex;align-items:center;gap:10px;border:0;border-bottom:1px solid #eef2f2;background:#fff;padding:12px 8px;text-align:left;cursor:pointer}.cc-attention button:last-child{border:0}.cc-attention i{width:9px;height:9px;border-radius:50%;background:#87949a}.cc-attention .level-warning i{background:#b67b31}.cc-attention .level-info i{background:#4c779d}.cc-attention .level-good i{background:#2c7759}.cc-attention div{flex:1}.cc-attention strong{display:block;font-size:12px}.cc-attention span{display:block;font-size:11px;color:#67767d;margin-top:3px}.cc-attention b{color:#718079}.cc-position{display:grid;grid-template-columns:1fr 1fr}.cc-position>div{padding:18px;border-right:1px solid #edf1f2;border-bottom:1px solid #edf1f2}.cc-position>div:nth-child(even){border-right:0}.cc-position>div:nth-last-child(-n+2){border-bottom:0}.cc-position span{display:block;color:#7f8d93;font-size:10px}.cc-position strong{display:block;margin-top:6px;font-size:19px}.cc-table-panel{margin-bottom:14px}.cc-table-wrap{overflow:auto}.cc-table-wrap table{width:100%;min-width:1080px;border-collapse:collapse;font-size:11px}.cc-table-wrap th{background:#18252c;color:#fff;text-transform:uppercase;letter-spacing:.06em;font-size:9px;padding:10px 11px;text-align:left}.cc-table-wrap td{padding:10px 11px;border-bottom:1px solid #eef2f3;color:#4a5960;white-space:nowrap}.cc-table-wrap td.details{white-space:normal;min-width:260px;font-weight:650;color:#26353d}.cc-table-wrap .num{text-align:right}.cc-serial{color:#1d6b52;font-size:10px}.cc-type,.cc-cheque{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:9px;font-weight:850;text-transform:capitalize}.cc-type.income{background:#edf4fb;color:#456d91}.cc-type.expense{background:#edf8f2;color:#2d7057}.cc-cheque.on_hold{background:#fff3df;color:#946020}.cc-cheque.cashed{background:#edf8f2;color:#2f7058}.cc-muted{color:#b1b9bc}.cc-contractors{padding:4px 14px 10px}.cc-contractors>div{display:grid;grid-template-columns:1.2fr 1fr auto;gap:10px;align-items:center;padding:11px 3px;border-bottom:1px solid #edf1f2}.cc-contractors>div:last-child{border:0}.cc-contractors strong{display:block;font-size:12px}.cc-contractors span{display:block;color:#87949a;font-size:9px;margin-top:2px}.cc-contractors p{display:flex;gap:12px;margin:0}.cc-contractors p span{font-size:9px}.cc-contractors b{font-size:9px;padding:5px 8px;border-radius:999px}.cc-contractors b.payable{background:#fff3df;color:#936020}.cc-contractors b.ok{background:#edf8f2;color:#2d7057}.cc-audit{padding:5px 14px 10px}.cc-audit>div{display:flex;gap:10px;align-items:center;padding:10px 2px;border-bottom:1px solid #edf1f2}.cc-audit>div:last-child{border:0}.cc-audit i{width:8px;height:8px;border-radius:50%;background:#1d6b52}.cc-audit>div>div{flex:1}.cc-audit strong{display:block;font-size:11px;text-transform:capitalize}.cc-audit span{display:block;color:#829097;font-size:9px;margin-top:2px}.cc-audit p{margin:0;text-align:right;font-size:9px;color:#59676e}.cc-audit p small{display:block;color:#98a2a6;margin-top:2px}.cc-chooser-shell{min-height:75vh;display:grid;place-items:center}.cc-chooser{width:min(1080px,100%);background:#fff;border:1px solid #e1e7e9;border-radius:20px;padding:30px;box-shadow:0 20px 60px rgba(20,38,29,.08)}.cc-project-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-top:22px}.cc-project-grid button{display:block;text-align:left;border:1px solid #e0e7e8;background:#fafcfc;border-radius:13px;padding:15px;cursor:pointer}.cc-project-grid button:hover{background:#fff;border-color:#78aa95;box-shadow:0 9px 24px rgba(29,107,82,.08)}.cc-project-grid b{display:block;color:#1d6b52;font-size:10px}.cc-project-grid strong{display:block;margin-top:5px;font-size:15px}.cc-project-grid span,.cc-project-grid small{display:block;color:#849197;font-size:9px;margin-top:4px}.cc-enable-box{display:grid;grid-template-columns:1fr minmax(280px,.8fr) auto;gap:10px;align-items:center;margin-top:22px;padding:14px;border:1px solid #dce7e2;background:#f6faf8;border-radius:13px}.cc-enable-box strong{display:block;font-size:12px}.cc-enable-box span{display:block;color:#83918b;font-size:9px;margin-top:3px}.cc-enable-box button:disabled{opacity:.45;cursor:not-allowed}.cc-empty{padding:18px;text-align:center;color:#8e999e;font-size:10px}.cc-empty-cell{text-align:center!important;padding:35px!important;color:#8e999e!important}.cc-loading{min-height:80vh;display:grid;place-items:center;background:#f3f6f5;font-family:Inter,system-ui}.cc-loading>div{display:flex;flex-direction:column;align-items:center;gap:6px}.cc-loading strong{font-size:14px}.cc-loading small{color:#849198}.cc-spinner{width:26px;height:26px;border:3px solid #dce5e2;border-top-color:#1d6b52;border-radius:50%;animation:ccspin .8s linear infinite}@keyframes ccspin{to{transform:rotate(360deg)}}
@media(max-width:1100px){.cc-metrics{grid-template-columns:repeat(2,1fr)}.cc-stage{grid-template-columns:repeat(2,1fr)}.cc-stage>div:nth-child(2){border-right:0}.cc-grid-two{grid-template-columns:1fr}}
@media(max-width:720px){.cc-page{padding:18px 11px 45px}.cc-head{align-items:flex-start;flex-direction:column}.cc-head-actions{width:100%;flex-direction:column}.cc-metrics,.cc-stage,.cc-position{grid-template-columns:1fr}.cc-stage>div,.cc-position>div{border-right:0!important;border-bottom:1px solid rgba(255,255,255,.09)}.cc-position>div{border-bottom-color:#edf1f2}.cc-enable-box{grid-template-columns:1fr}.cc-contractors>div{grid-template-columns:1fr}.cc-contractors p{justify-content:flex-start}}
`;
