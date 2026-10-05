"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

type AllowanceRow = { id: string; item: string; amount: number };

const money = (value: number) =>
  new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

const uid = () => `allow-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const defaultAllowances: AllowanceRow[] = [
  { id: "allow-preliminary", item: "Preliminary / Site Setup", amount: 0 },
  { id: "allow-foundation", item: "Foundation / Soil Condition Adjustment", amount: 0 },
  { id: "allow-mep", item: "Special MEP / Fire Safety Allowance", amount: 0 },
  { id: "allow-external", item: "External Works", amount: 0 },
  { id: "allow-other", item: "Other Provisional Sum", amount: 0 },
];

export default function SummaryEstimateWorkspace() {
  const [projectName, setProjectName] = useState("");
  const [location, setLocation] = useState("");
  const [floorArea, setFloorArea] = useState(0);
  const [floors, setFloors] = useState(1);
  const [ratePerSft, setRatePerSft] = useState(0);
  const [allowances, setAllowances] = useState<AllowanceRow[]>(defaultAllowances);
  const [contingencyPct, setContingencyPct] = useState(0);

  const totals = useMemo(() => {
    const totalArea = Math.max(0, floorArea) * Math.max(0, floors);
    const baseCost = totalArea * Math.max(0, ratePerSft);
    const allowanceTotal = allowances.reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0);
    const subtotal = baseCost + allowanceTotal;
    const contingency = subtotal * (Math.max(0, contingencyPct) / 100);
    return { totalArea, baseCost, allowanceTotal, subtotal, contingency, grand: subtotal + contingency };
  }, [floorArea, floors, ratePerSft, allowances, contingencyPct]);

  function updateAllowance(id: string, change: Partial<AllowanceRow>) {
    setAllowances((rows) => rows.map((row) => row.id === id ? { ...row, ...change } : row));
  }

  function addAllowance() {
    setAllowances((rows) => [...rows, { id: uid(), item: "Custom Allowance", amount: 0 }]);
  }

  return (
    <div className="se-page">
      <style>{`
        .se-page{max-width:1180px;margin:0 auto;color:var(--theme-ink-_17222b,#17222b)}
        .se-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}
        .se-back,.se-switch{font-size:11px;font-weight:900;text-decoration:none;color:inherit}.se-switch{color:#d61f26}
        .se-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;margin-bottom:16px}
        .se-head small{color:#d61f26;font-size:9px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}
        .se-head h1{font-size:34px;margin:5px 0 7px}.se-head p{max-width:760px;margin:0;color:var(--theme-ink-_687783,#687783);font-size:12px;line-height:1.65}
        .se-btn{border:1px solid var(--theme-line-_d5dde2,#d5dde2);border-radius:9px;background:var(--theme-bg-_fff,#fff);color:inherit;padding:10px 13px;font-size:10px;font-weight:900;cursor:pointer}.se-btn.red{background:#d61f26;border-color:#d61f26;color:#fff}
        .se-grid{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:14px;align-items:start}
        .se-card{border:1px solid var(--theme-line-_dfe5e9,#dfe5e9);border-radius:14px;background:var(--theme-bg-_fff,#fff);overflow:hidden;box-shadow:0 7px 20px rgba(16,24,32,.04)}
        .se-card-head{padding:12px 14px;border-bottom:2px solid #d61f26;background:var(--theme-bg-_f7f9fa,#f7f9fa);display:flex;align-items:center;justify-content:space-between;gap:12px}.se-card-head small{display:block;color:#d61f26;font-size:8px;font-weight:900;letter-spacing:.11em;text-transform:uppercase}.se-card-head strong{display:block;margin-top:3px;font-size:14px}
        .se-body{padding:14px}.se-fields{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.se-field.span2{grid-column:span 2}.se-field label{display:block;margin:0 0 5px;color:var(--theme-ink-_687783,#687783);font-size:8px;font-weight:900;letter-spacing:.05em;text-transform:uppercase}
        .se-field input,.se-table input{width:100%;box-sizing:border-box;border:1px solid var(--theme-line-_d5dde2,#d5dde2);border-radius:8px;background:var(--theme-bg-_fff,#fff);color:inherit;padding:9px 10px;font-size:10px;outline:none}.se-field input:focus,.se-table input:focus{border-color:#d61f26}
        .se-note{margin-top:10px;padding:10px 12px;border-left:3px solid #d61f26;border-radius:6px;background:var(--theme-bg-_f7f9fa,#f7f9fa);color:var(--theme-ink-_687783,#687783);font-size:9px;line-height:1.6}.se-note b{color:inherit}
        .se-table{width:100%;border-collapse:collapse}.se-table th{padding:9px 10px;text-align:left;background:var(--theme-bg-_f7f9fa,#f7f9fa);color:var(--theme-ink-_687783,#687783);font-size:8px;text-transform:uppercase;border-bottom:1px solid var(--theme-line-_e2e7ea,#e2e7ea)}.se-table td{padding:8px 10px;border-bottom:1px solid var(--theme-line-_edf0f2,#edf0f2);font-size:10px}.se-table td:last-child,.se-table th:last-child{text-align:right}.se-table .amount-input{max-width:170px;text-align:right}.se-remove{border:0;background:transparent;color:#d61f26;font-size:10px;font-weight:900;cursor:pointer}
        .se-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
        .se-side{position:sticky;top:12px}.se-metric{padding:13px 14px;border-bottom:1px solid var(--theme-line-_e7ebee,#e7ebee)}.se-metric span{display:block;color:var(--theme-ink-_687783,#687783);font-size:8px;font-weight:900;text-transform:uppercase}.se-metric strong{display:block;margin-top:5px;font-size:18px}.se-total strong{font-size:25px;color:#d61f26}.se-row{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-bottom:1px solid var(--theme-line-_edf0f2,#edf0f2);font-size:10px}.se-row span{color:var(--theme-ink-_687783,#687783)}.se-row.total{font-size:13px;border-bottom:0;padding-top:12px}.se-row.total strong{color:#d61f26}
        .se-print-title{display:none}
        @media(max-width:900px){.se-grid{grid-template-columns:1fr}.se-side{position:static}.se-fields{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media(max-width:620px){.se-head{align-items:flex-start;flex-direction:column}.se-fields{grid-template-columns:1fr}.se-field.span2{grid-column:auto}.se-head h1{font-size:28px}.se-table{min-width:620px}.se-table-wrap{overflow:auto}}
        @media print{.masthead,.se-toolbar,.se-head .se-btn,.se-actions,.se-note,.se-remove{display:none!important}.admin-main,.tmg-admin-main,.content-wrap,.tmg-content-wrap{margin:0!important;padding:0!important;max-width:none!important}.se-grid{display:block}.se-side{position:static;margin-top:14px}.se-card{box-shadow:none;border-color:#bbb}.se-print-title{display:block!important;margin-bottom:15px}.se-page{color:#111!important}.se-card,.se-card-head,.se-field input,.se-table input{background:#fff!important;color:#111!important}.se-card-head,.se-table th{background:#eee!important}.se-table input{border:0!important;padding:0!important}.se-table td,.se-table th{border-color:#ccc!important}}
      `}</style>

      <div className="se-toolbar">
        <Link className="se-back" href="/admin/estimate">← Estimate Types</Link>
        <Link className="se-switch" href="/admin/estimate/detailed">Open Detailed Estimate →</Link>
      </div>

      <header className="se-head">
        <div>
          <small>LAND VIEW / Summary Estimate</small>
          <h1>Summary Building Estimate</h1>
          <p>Fast preliminary budgeting using total built-up area, an entered construction rate and project-specific allowances. This is separate from the Detailed BOQ workflow.</p>
        </div>
        <button className="se-btn red" type="button" onClick={() => window.print()}>Print Summary</button>
      </header>

      <div className="se-print-title">
        <h1>LAND VIEW — Summary Building Estimate</h1>
        <p>{projectName || "Project"}{location ? ` · ${location}` : ""}</p>
      </div>

      <div className="se-grid">
        <main>
          <section className="se-card">
            <div className="se-card-head"><div><small>Project</small><strong>Basic information</strong></div></div>
            <div className="se-body se-fields">
              <div className="se-field span2"><label>Project / Client Reference</label><input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="LV-### · Client / project name" /></div>
              <div className="se-field"><label>Location</label><input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Feni, Bangladesh" /></div>
              <div className="se-field"><label>Typical Floor Area (sft)</label><input type="number" min={0} value={floorArea} onChange={(e) => setFloorArea(Math.max(0, Number(e.target.value) || 0))} /></div>
              <div className="se-field"><label>No. of Floors</label><input type="number" min={1} step={1} value={floors} onChange={(e) => setFloors(Math.max(1, Math.floor(Number(e.target.value) || 1)))} /></div>
              <div className="se-field"><label>Construction Rate (BDT / sft)</label><input type="number" min={0} value={ratePerSft} onChange={(e) => setRatePerSft(Math.max(0, Number(e.target.value) || 0))} /></div>
            </div>
          </section>

          <div style={{height:12}} />

          <section className="se-card">
            <div className="se-card-head"><div><small>Allowances</small><strong>Project-specific additions</strong></div><strong>{money(totals.allowanceTotal)}</strong></div>
            <div className="se-table-wrap">
              <table className="se-table">
                <thead><tr><th>Item</th><th>Amount</th><th style={{width:70}}>Action</th></tr></thead>
                <tbody>
                  {allowances.map((row) => (
                    <tr key={row.id}>
                      <td><input value={row.item} onChange={(e) => updateAllowance(row.id, { item: e.target.value })} /></td>
                      <td><input className="amount-input" type="number" min={0} value={row.amount} onChange={(e) => updateAllowance(row.id, { amount: Math.max(0, Number(e.target.value) || 0) })} /></td>
                      <td><button className="se-remove" type="button" onClick={() => setAllowances((rows) => rows.filter((item) => item.id !== row.id))}>Remove</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="se-body">
              <div className="se-actions"><button className="se-btn" type="button" onClick={addAllowance}>+ Add Allowance</button></div>
              <div className="se-note"><b>Use allowances only for costs not already covered by your entered BDT/sft construction rate.</b> This prevents double-counting.</div>
            </div>
          </section>

          <div style={{height:12}} />

          <section className="se-card">
            <div className="se-card-head"><div><small>Adjustment</small><strong>Contingency</strong></div></div>
            <div className="se-body se-fields">
              <div className="se-field"><label>Contingency (%)</label><input type="number" min={0} step="0.1" value={contingencyPct} onChange={(e) => setContingencyPct(Math.max(0, Number(e.target.value) || 0))} /></div>
              <div className="se-field"><label>Calculated Contingency</label><input readOnly value={money(totals.contingency)} /></div>
              <div className="se-field"><label>Grand Total</label><input readOnly value={money(totals.grand)} /></div>
            </div>
          </section>
        </main>

        <aside className="se-card se-side">
          <div className="se-card-head"><div><small>Summary</small><strong>{projectName || "Unassigned estimate"}</strong></div></div>
          <div className="se-metric"><span>Total built-up area</span><strong>{new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(totals.totalArea)} sft</strong></div>
          <div className="se-metric"><span>Base construction cost</span><strong>{money(totals.baseCost)}</strong></div>
          <div className="se-body">
            <div className="se-row"><span>Base Cost</span><strong>{money(totals.baseCost)}</strong></div>
            <div className="se-row"><span>Allowances</span><strong>{money(totals.allowanceTotal)}</strong></div>
            <div className="se-row"><span>Subtotal</span><strong>{money(totals.subtotal)}</strong></div>
            <div className="se-row"><span>Contingency</span><strong>{money(totals.contingency)}</strong></div>
            <div className="se-row total"><span>Summary Estimate</span><strong>{money(totals.grand)}</strong></div>
          </div>
          <div className="se-metric se-total"><span>Estimated Project Cost</span><strong>{money(totals.grand)}</strong></div>
        </aside>
      </div>
    </div>
  );
}
