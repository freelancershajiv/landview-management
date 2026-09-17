"use client";

import { useMemo, useState } from "react";

type BuildingType = "Residential" | "Commercial" | "Mixed Use" | "Institutional";
type FoundationType = "Isolated Footing" | "Combined Footing" | "Raft Foundation" | "Pile Foundation";
type FinishGrade = "Economy" | "Standard" | "Premium";

const money = (value: number) =>
  new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);

const number = (value: number, digits = 0) =>
  new Intl.NumberFormat("en-BD", { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0);

const allocation = [
  { label: "RCC structure & foundation", share: 38 },
  { label: "Masonry & plaster", share: 12 },
  { label: "Doors & windows", share: 8 },
  { label: "Flooring & architectural finishes", share: 16 },
  { label: "Electrical", share: 8 },
  { label: "Plumbing & sanitary", share: 7 },
  { label: "Painting", share: 5 },
  { label: "External works & miscellaneous", share: 6 },
];

export default function EstimatePage() {
  const [projectName, setProjectName] = useState("");
  const [buildingType, setBuildingType] = useState<BuildingType>("Residential");
  const [foundationType, setFoundationType] = useState<FoundationType>("Isolated Footing");
  const [finishGrade, setFinishGrade] = useState<FinishGrade>("Standard");
  const [floors, setFloors] = useState(6);
  const [floorArea, setFloorArea] = useState(2500);
  const [rate, setRate] = useState(0);
  const [locationAdjustment, setLocationAdjustment] = useState(0);
  const [overheadPct, setOverheadPct] = useState(0);
  const [contingencyPct, setContingencyPct] = useState(3);
  const [discountPct, setDiscountPct] = useState(0);

  const result = useMemo(() => {
    const safeFloors = Math.max(0, Number(floors) || 0);
    const safeArea = Math.max(0, Number(floorArea) || 0);
    const safeRate = Math.max(0, Number(rate) || 0);
    const totalArea = safeFloors * safeArea;
    const baseCost = totalArea * safeRate;
    const locationAmount = baseCost * (Number(locationAdjustment) || 0) / 100;
    const adjustedConstruction = Math.max(0, baseCost + locationAmount);
    const overheadAmount = adjustedConstruction * Math.max(0, Number(overheadPct) || 0) / 100;
    const contingencyBase = adjustedConstruction + overheadAmount;
    const contingencyAmount = contingencyBase * Math.max(0, Number(contingencyPct) || 0) / 100;
    const subtotal = contingencyBase + contingencyAmount;
    const discountAmount = subtotal * Math.min(100, Math.max(0, Number(discountPct) || 0)) / 100;
    const grandTotal = Math.max(0, subtotal - discountAmount);
    const effectiveRate = totalArea > 0 ? grandTotal / totalArea : 0;
    return { totalArea, baseCost, locationAmount, adjustedConstruction, overheadAmount, contingencyAmount, subtotal, discountAmount, grandTotal, effectiveRate };
  }, [floors, floorArea, rate, locationAdjustment, overheadPct, contingencyPct, discountPct]);

  const hasEstimate = result.totalArea > 0 && rate > 0;

  function reset() {
    setProjectName("");
    setBuildingType("Residential");
    setFoundationType("Isolated Footing");
    setFinishGrade("Standard");
    setFloors(6);
    setFloorArea(2500);
    setRate(0);
    setLocationAdjustment(0);
    setOverheadPct(0);
    setContingencyPct(3);
    setDiscountPct(0);
  }

  return <div className="estimate-page">
    <style>{`
      .estimate-page{color:#eef2f5}.ec-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;margin-bottom:18px}.ec-head h1{font-size:36px;margin:5px 0 0}.ec-head p{margin:6px 0 0;color:#8e9ba5;font-size:11px;line-height:1.6;max-width:760px}.ec-actions{display:flex;gap:8px;flex-wrap:wrap}.ec-btn{border:1px solid #394650;border-radius:8px;background:#17222b;color:#eef2f5;padding:10px 13px;font-size:10px;font-weight:900;cursor:pointer}.ec-btn.primary{background:#d61f26;border-color:#d61f26}.ec-btn:disabled{opacity:.45;cursor:not-allowed}.ec-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(340px,.9fr);gap:14px;align-items:start}.ec-panel{border:1px solid #303b44;border-radius:12px;background:#101820;overflow:hidden}.ec-panel-head{padding:14px 16px;background:#17222b;border-bottom:2px solid #d61f26}.ec-panel-head small{display:block;color:#ef6c66;font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.ec-panel-head strong{display:block;margin-top:4px;font-size:15px}.ec-form{padding:16px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.ec-field{min-width:0}.ec-field.full{grid-column:1/-1}.ec-field label{display:block;margin-bottom:6px;color:#8b98a2;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}.ec-field input,.ec-field select{width:100%;box-sizing:border-box;border:1px solid #35414b;border-radius:8px;background:#0b1218;color:#eef2f5;padding:11px 12px;font-size:12px;outline:none}.ec-field input:focus,.ec-field select:focus{border-color:#d61f26;box-shadow:0 0 0 2px rgba(214,31,38,.12)}.ec-note{grid-column:1/-1;padding:11px 12px;border:1px solid #3c4650;border-radius:9px;background:#131d25;color:#9aa6af;font-size:10px;line-height:1.55}.ec-note b{color:#eef2f5}.ec-metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:#303b44}.ec-metric{padding:16px;background:#101820}.ec-metric span{display:block;color:#7f8c96;font-size:9px;font-weight:900;text-transform:uppercase}.ec-metric strong{display:block;margin-top:7px;font-size:21px;word-break:break-word}.ec-metric.accent strong{color:#ff8179}.ec-summary{padding:15px 16px}.ec-summary-row{display:flex;justify-content:space-between;gap:16px;padding:8px 0;border-bottom:1px solid #27323b;font-size:10px}.ec-summary-row span{color:#89969f}.ec-summary-row strong{text-align:right}.ec-summary-row.total{padding-top:12px;border-bottom:0;font-size:13px}.ec-summary-row.total span,.ec-summary-row.total strong{color:#eef2f5}.ec-breakdown{margin-top:14px}.ec-table-wrap{overflow:auto}.ec-table{width:100%;border-collapse:collapse;min-width:620px}.ec-table th{padding:10px 12px;background:#17222b;color:#83919b;text-align:left;font-size:9px;text-transform:uppercase;border-bottom:2px solid #d61f26}.ec-table td{padding:11px 12px;border-bottom:1px solid #27323b;font-size:10px}.ec-table td:last-child,.ec-table th:last-child{text-align:right}.ec-table td:nth-child(2),.ec-table th:nth-child(2){text-align:center}.ec-empty{padding:28px;text-align:center;color:#7f8b95;font-size:11px;line-height:1.6}.ec-disclaimer{margin-top:12px;padding:12px 14px;border-left:3px solid #d61f26;background:#131d25;color:#909da6;font-size:10px;line-height:1.55}.ec-disclaimer strong{color:#eef2f5}@media(max-width:920px){.ec-grid{grid-template-columns:1fr}}@media(max-width:640px){.ec-head{align-items:flex-start;flex-direction:column}.ec-form{grid-template-columns:1fr}.ec-field.full,.ec-note{grid-column:auto}.ec-metrics{grid-template-columns:1fr}.ec-actions{width:100%}.ec-btn{flex:1}}@media print{.masthead,.ec-form-panel,.ec-actions{display:none!important}.admin-main,.tmg-admin-main,.content-wrap,.tmg-content-wrap{margin:0!important;padding:0!important;max-width:none!important}.estimate-page{color:#111!important}.ec-head small,.ec-head p{color:#555!important}.ec-panel,.ec-metric{background:#fff!important;color:#111!important;border-color:#bbb!important}.ec-panel-head,.ec-table th{background:#eee!important;color:#111!important;border-color:#a00!important}.ec-summary-row,.ec-table td{border-color:#ccc!important}.ec-metric span,.ec-summary-row span,.ec-table th,.ec-disclaimer{color:#555!important}.ec-metric.accent strong{color:#a00!important}.ec-disclaimer{background:#f7f7f7!important;border-color:#a00!important}}
    `}</style>

    <header className="ec-head">
      <div><small style={{color:"#ef6c66",fontWeight:900,letterSpacing:".14em"}}>LAND VIEW / ESTIMATE &amp; COSTING</small><h1>Building Cost Estimate</h1><p>Create a fast preliminary construction budget from the building area and your chosen rate. Detailed BOQ quantities can be added later without changing this workflow.</p></div>
      <div className="ec-actions"><button type="button" className="ec-btn" onClick={reset}>Reset</button><button type="button" className="ec-btn primary" onClick={() => window.print()} disabled={!hasEstimate}>Print Estimate</button></div>
    </header>

    <div className="ec-grid">
      <section className="ec-panel ec-form-panel">
        <div className="ec-panel-head"><small>Required inputs</small><strong>Project &amp; calculation data</strong></div>
        <div className="ec-form">
          <div className="ec-field full"><label>Project / Client Reference</label><input value={projectName} onChange={e=>setProjectName(e.target.value)} placeholder="e.g. LV-0245 · Mr. Rahman Residence" /></div>
          <div className="ec-field"><label>Building Type</label><select value={buildingType} onChange={e=>setBuildingType(e.target.value as BuildingType)}><option>Residential</option><option>Commercial</option><option>Mixed Use</option><option>Institutional</option></select></div>
          <div className="ec-field"><label>Foundation Type</label><select value={foundationType} onChange={e=>setFoundationType(e.target.value as FoundationType)}><option>Isolated Footing</option><option>Combined Footing</option><option>Raft Foundation</option><option>Pile Foundation</option></select></div>
          <div className="ec-field"><label>Finishing Grade</label><select value={finishGrade} onChange={e=>setFinishGrade(e.target.value as FinishGrade)}><option>Economy</option><option>Standard</option><option>Premium</option></select></div>
          <div className="ec-field"><label>Number of Floors</label><input type="number" min="1" step="1" value={floors} onChange={e=>setFloors(Math.max(0,Number(e.target.value)||0))}/></div>
          <div className="ec-field"><label>Average Floor Area (sft)</label><input type="number" min="0" step="1" value={floorArea} onChange={e=>setFloorArea(Math.max(0,Number(e.target.value)||0))}/></div>
          <div className="ec-field"><label>Construction Rate (BDT / sft)</label><input type="number" min="0" step="1" value={rate || ""} onChange={e=>setRate(Math.max(0,Number(e.target.value)||0))} placeholder="Enter current rate"/></div>
          <div className="ec-field"><label>Location Adjustment (%)</label><input type="number" step="0.1" value={locationAdjustment} onChange={e=>setLocationAdjustment(Number(e.target.value)||0)}/></div>
          <div className="ec-field"><label>Overhead (%)</label><input type="number" min="0" step="0.1" value={overheadPct} onChange={e=>setOverheadPct(Math.max(0,Number(e.target.value)||0))}/></div>
          <div className="ec-field"><label>Contingency (%)</label><input type="number" min="0" step="0.1" value={contingencyPct} onChange={e=>setContingencyPct(Math.max(0,Number(e.target.value)||0))}/></div>
          <div className="ec-field"><label>Discount (%)</label><input type="number" min="0" max="100" step="0.1" value={discountPct} onChange={e=>setDiscountPct(Math.min(100,Math.max(0,Number(e.target.value)||0)))}/></div>
          <div className="ec-note"><b>Rate stays manual in v1.</b> This keeps the estimate tied to the current market rate you choose rather than an outdated hard-coded price. Later we can connect this field to a LAND VIEW rate library.</div>
        </div>
      </section>

      <section className="ec-panel">
        <div className="ec-panel-head"><small>Live result</small><strong>{projectName.trim() || "Preliminary estimate"}</strong></div>
        <div className="ec-metrics">
          <div className="ec-metric"><span>Total built-up area</span><strong>{number(result.totalArea)} sft</strong></div>
          <div className="ec-metric"><span>Entered base rate</span><strong>{money(rate)} / sft</strong></div>
          <div className="ec-metric accent"><span>Estimated total</span><strong>{money(result.grandTotal)}</strong></div>
          <div className="ec-metric"><span>Effective cost / sft</span><strong>{money(result.effectiveRate)}</strong></div>
        </div>
        <div className="ec-summary">
          <div className="ec-summary-row"><span>Base construction cost</span><strong>{money(result.baseCost)}</strong></div>
          <div className="ec-summary-row"><span>Location adjustment ({number(locationAdjustment,1)}%)</span><strong>{money(result.locationAmount)}</strong></div>
          <div className="ec-summary-row"><span>Overhead ({number(overheadPct,1)}%)</span><strong>{money(result.overheadAmount)}</strong></div>
          <div className="ec-summary-row"><span>Contingency ({number(contingencyPct,1)}%)</span><strong>{money(result.contingencyAmount)}</strong></div>
          <div className="ec-summary-row"><span>Discount ({number(discountPct,1)}%)</span><strong>− {money(result.discountAmount)}</strong></div>
          <div className="ec-summary-row total"><span>Grand Total</span><strong>{money(result.grandTotal)}</strong></div>
        </div>
      </section>
    </div>

    <section className="ec-panel ec-breakdown">
      <div className="ec-panel-head"><small>Automatic planning allocation</small><strong>Preliminary cost breakdown</strong></div>
      {hasEstimate ? <div className="ec-table-wrap"><table className="ec-table"><thead><tr><th>Cost category</th><th>Allocation</th><th>Estimated amount</th></tr></thead><tbody>{allocation.map(item=><tr key={item.label}><td>{item.label}</td><td>{item.share}%</td><td><strong>{money(result.grandTotal*item.share/100)}</strong></td></tr>)}</tbody></table></div> : <div className="ec-empty">Enter a construction rate above to generate the estimate and category breakdown.</div>}
    </section>

    <div className="ec-disclaimer"><strong>Preliminary estimate only.</strong> The category allocation is a planning breakdown, not a measured BOQ. Foundation type, finishing grade and building type are recorded now so we can use them when the detailed quantity engine is added.</div>
  </div>;
}
