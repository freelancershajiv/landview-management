"use client";
// @ts-nocheck
import { useEffect, useMemo, useState } from "react";

const money = (value: unknown) => new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 2 }).format(Number(value || 0));
const num = (value: unknown) => Number(value || 0);
const pct = (value: unknown) => value === null || value === undefined ? "Not reported" : `${num(value).toFixed(1)}%`;
const dateText = (value: unknown) => {
  const raw = String(value || "");
  if (!raw) return "—";
  const d = new Date(raw.includes("T") ? raw : `${raw}T00:00:00`);
  return Number.isNaN(d.getTime()) ? raw : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};
const today = () => new Date().toISOString().slice(0, 10);
const CATEGORIES = ["Masonry", "R.C.C Masonry", "Finishing Masonry", "Electric Contractor", "Plumbing Contractor", "Painting Contractor", "Tiles Contractor", "Aluminium Contractor", "Other Contractor"];
const UNITS = ["SFT", "CFT", "RFT", "POINT", "NOS", "DAY", "JOB", "LS"];

export default function ContractorAccountsPage() {
  const [project, setProject] = useState("");
  const [data, setData] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState("");
  const [modal, setModal] = useState("");
  const [contractForm, setContractForm] = useState<any>({});
  const [billForm, setBillForm] = useState<any>({});
  const [progressForm, setProgressForm] = useState<any>({});

  async function discoverProjects() {
    try {
      const response = await fetch("/api/project-control-center", { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json();
      if (payload?.success) setProjects(payload.data?.projects || []);
    } catch {}
  }

  async function load(code = project) {
    if (!code) { setLoading(false); await discoverProjects(); return; }
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/project-contractor-accounts?projectId=${encodeURIComponent(code)}`, { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Could not load contractor accounts.");
      setData(payload.data);
      setProject(payload.data?.selectedProject?.projectCode || code);
    } catch (e: any) { setError(e?.message || "Could not load contractor accounts."); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("projectId") || "";
    setProject(code);
    void load(code);
  }, []);

  function chooseProject(code: string) {
    setProject(code);
    window.history.replaceState(null, "", `/projectmanagement/contractors?projectId=${encodeURIComponent(code)}`);
    void load(code);
  }

  async function post(action: string, body: any) {
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/project-contractor-accounts", {
        method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, projectId: project, ...body }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Could not save contractor data.");
      setModal("");
      await load(project);
    } catch (e: any) { setError(e?.message || "Could not save contractor data."); }
    finally { setSaving(false); }
  }

  async function remove(type: string, id: string) {
    if (!window.confirm(`Delete this ${type} record?`)) return;
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/project-contractor-accounts?projectId=${encodeURIComponent(project)}&type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`, { method: "DELETE", credentials: "same-origin" });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Could not delete record.");
      await load(project);
    } catch (e: any) { setError(e?.message || "Could not delete record."); }
    finally { setSaving(false); }
  }

  function openContract(account?: any) {
    setContractForm(account ? {
      id: account.id, contractorName: account.contractorName, category: account.category, billingUnit: account.billingUnit,
      pricingType: account.pricingType, contractQuantity: account.contractQuantity, agreedRate: account.agreedRate,
      contractAmount: account.contractAmount, scopeDescription: account.scopeDescription, startDate: account.startDate,
      targetCompletionDate: account.targetCompletionDate, notes: account.notes,
    } : { contractorName: "", category: "Masonry", billingUnit: "SFT", pricingType: "rate", contractQuantity: "", agreedRate: "", contractAmount: "", scopeDescription: "", startDate: "", targetCompletionDate: "", notes: "" });
    setModal("contract");
  }

  function openBill(account: any, bill?: any) {
    setBillForm(bill ? {
      id: bill.id, billCode: bill.billCode, contractId: account.id, billDate: bill.date, description: bill.description,
      quantity: bill.quantity, rate: bill.rate, deduction: bill.deduction, status: bill.status, notes: bill.notes,
    } : { contractId: account.id, billDate: today(), description: "", quantity: "", rate: account.agreedRate || "", deduction: 0, status: "Certified", notes: "" });
    setModal("bill");
  }

  function openProgress(account: any, progress?: any) {
    setProgressForm(progress ? {
      id: progress.id, contractId: account.id, progressDate: progress.date, progressPercent: progress.percent,
      completedQuantity: progress.completedQuantity, stageName: progress.stageName, floorLabel: progress.floorLabel,
      description: progress.description, notes: progress.notes,
    } : { contractId: account.id, progressDate: today(), progressPercent: account.physicalProgress ?? "", completedQuantity: "", stageName: "", floorLabel: "", description: "", notes: "" });
    setModal("progress");
  }

  const summary = data?.summary || {};
  const accounts = data?.accounts || [];
  const selected = data?.selectedProject;
  const readOnly = Boolean(data?.readOnly);
  const canDelete = Boolean(data?.canDelete);
  const unconfigured = useMemo(() => accounts.filter((a: any) => !a.contractConfigured).length, [accounts]);

  if (loading && !data) return <main className="ca-page ca-loading"><div className="spinner"/><strong>Loading Contractor Accounts</strong><small>Linking contracts, certified work, payments and site progress…</small><style jsx>{styles}</style></main>;

  if (!project || !selected) {
    return <main className="ca-page"><section className="chooser"><span className="kicker">LAND VIEW · PHASE 3</span><h1>Contractor Accounts</h1><p>Select a managed project to open contractor financial control and work progress.</p>{error && <div className="alert">{error}</div>}<select value={project} onChange={e => chooseProject(e.target.value)}><option value="">Select project…</option>{projects.map((p: any) => <option key={p.id || p.projectCode} value={p.projectCode}>{p.projectCode} — {p.projectName}</option>)}</select></section><style jsx>{styles}</style></main>;
  }

  return <main className="ca-page">
    <div className="ca-shell">
      <header className="hero">
        <div><span className="kicker">LAND VIEW · CONTRACTOR CONTROL</span><h1>{selected.projectCode} <em>{selected.projectName}</em></h1><p>Contract value, certified work, paid amount and physical site progress are controlled separately.</p></div>
        <div className="hero-actions"><button onClick={() => void load(project)}>↻ Refresh</button>{!readOnly && <button className="primary" onClick={() => openContract()}>+ Contractor</button>}</div>
      </header>
      {error && <div className="alert">{error}</div>}

      <section className="metrics">
        <Metric label="Contract Value" value={money(summary.contractValue)} note={`${summary.configuredContractCount || 0} configured`} />
        <Metric label="Certified Work" value={money(summary.certifiedAmount)} note={summary.certifiedProgress == null ? "Contract values not fully set" : `${pct(summary.certifiedProgress)} of configured value`} />
        <Metric label="Paid" value={money(summary.paidAmount)} note={`${accounts.reduce((s:any,a:any)=>s+num(a.paymentCount),0)} linked payments`} />
        <Metric label="Contractor Advance" value={money(summary.contractorAdvance)} note="Paid above certified work" tone={num(summary.contractorAdvance)>0?"warn":""} />
        <Metric label="Contractor Payable" value={money(summary.contractorPayable)} note="Certified but unpaid" tone={num(summary.contractorPayable)>0?"danger":""} />
        <Metric label="Physical Progress" value={pct(summary.overallPhysicalProgress)} note={`${summary.physicalProgressReportedCount || 0}/${accounts.length} contractors reported`} />
      </section>

      {unconfigured > 0 && <div className="notice"><strong>{unconfigured} contractor account{unconfigured===1?" is":"s are"} not financially configured.</strong><span>Historical bills and payments remain visible; add contract value only when the real agreement is known.</span></div>}

      <section className="contract-list">
        {accounts.map((a: any) => {
          const isOpen = expanded === a.id;
          return <article className="contract-card" key={a.id}>
            <div className="contract-main">
              <div className="identity"><span>{a.category}</span><h2>{a.contractorName}</h2><p>{a.scopeDescription || a.notes || "Scope not recorded"}</p></div>
              <div className="money-grid"><div><span>Contract</span><strong>{a.contractConfigured ? money(a.contractValue) : "Not set"}</strong></div><div><span>Certified</span><strong>{money(a.certifiedAmount)}</strong></div><div><span>Paid</span><strong>{money(a.paidAmount)}</strong></div><div><span>{a.payable>0?"Payable":a.advance>0?"Advance":"Position"}</span><strong className={a.payable>0?"danger-text":a.advance>0?"warn-text":"good-text"}>{a.payable>0?money(a.payable):a.advance>0?money(a.advance):"Settled"}</strong></div></div>
              <div className="progress-grid">
                <Progress label="Physical" value={a.physicalProgress} empty="Not reported" />
                <Progress label="Certified" value={a.certifiedProgress} empty="Contract not set" />
                <Progress label="Paid" value={a.paymentProgress} empty="Contract not set" />
              </div>
              <div className="card-actions"><button onClick={() => setExpanded(isOpen?"":a.id)}>{isOpen?"Close":"Details"}</button>{!readOnly && <><button onClick={() => openProgress(a)}>Update Progress</button><button onClick={() => openBill(a)}>New Bill</button><button onClick={() => openContract(a)}>Edit Contract</button></>}</div>
            </div>
            {isOpen && <div className="details-zone">
              <section><div className="section-head"><div><span>WORK PROGRESS</span><strong>Physical site history</strong></div>{!readOnly && <button onClick={() => openProgress(a)}>+ Progress</button>}</div>{a.latestProgress && <div className="latest-progress"><b>{pct(a.latestProgress.percent)}</b><div><strong>{a.latestProgress.stageName || "Site progress"}{a.latestProgress.floorLabel?` · ${a.latestProgress.floorLabel}`:""}</strong><span>{dateText(a.latestProgress.date)} · {a.latestProgress.description}</span></div></div>}<div className="mini-table"><table><thead><tr><th>Date</th><th>Stage / Floor</th><th>Description</th><th className="num">Physical</th><th></th></tr></thead><tbody>{a.progressHistory.map((r:any)=><tr key={r.id}><td>{dateText(r.date)}</td><td>{[r.stageName,r.floorLabel].filter(Boolean).join(" · ")||"—"}</td><td>{r.description}</td><td className="num"><strong>{pct(r.percent)}</strong></td><td className="actions">{!readOnly&&<button onClick={()=>openProgress(a,r)}>Edit</button>}{canDelete&&<button onClick={()=>void remove("progress",r.id)}>Delete</button>}</td></tr>)}{!a.progressHistory.length&&<tr><td colSpan={5} className="empty">No physical progress has been reported yet.</td></tr>}</tbody></table></div></section>
              <section><div className="section-head"><div><span>CERTIFIED WORK</span><strong>Bills & certifications</strong></div>{!readOnly && <button onClick={() => openBill(a)}>+ Bill</button>}</div><div className="mini-table"><table><thead><tr><th>Date</th><th>Bill</th><th>Description</th><th>Status</th><th className="num">Net Amount</th><th></th></tr></thead><tbody>{a.bills.map((b:any)=><tr key={b.id}><td>{dateText(b.date)}</td><td><b>{b.billCode}</b></td><td>{b.description}</td><td><span className={`status ${String(b.status).toLowerCase()}`}>{b.status}</span></td><td className="num"><strong>{money(b.netAmount)}</strong></td><td className="actions">{!readOnly&&<button onClick={()=>openBill(a,b)}>Edit</button>}{canDelete&&<button onClick={()=>void remove("bill",b.id)}>Delete</button>}</td></tr>)}{!a.bills.length&&<tr><td colSpan={6} className="empty">No contractor bills recorded.</td></tr>}</tbody></table></div></section>
              <section><div className="section-head"><div><span>PAYMENT LEDGER</span><strong>Money paid to contractor</strong></div><small>{a.paymentCount} linked entries</small></div><div className="mini-table"><table><thead><tr><th>Date</th><th>Details</th><th>Category</th><th className="num">Amount</th><th className="num">Cumulative Paid</th></tr></thead><tbody>{a.paymentLedger.map((r:any)=><tr key={r.id}><td>{dateText(r.date)}</td><td>{r.details}</td><td>{r.category||"—"}</td><td className="num"><strong>{money(r.amount)}</strong></td><td className="num">{money(r.runningPaid)}</td></tr>)}{!a.paymentLedger.length&&<tr><td colSpan={5} className="empty">No linked contractor payments.</td></tr>}</tbody></table></div></section>
            </div>}
          </article>;
        })}
        {!accounts.length && <div className="empty-card">No contractor accounts are configured for this project.</div>}
      </section>
    </div>

    {modal === "contract" && <Modal title={contractForm.id?"Edit Contractor Contract":"New Contractor Contract"} onClose={()=>setModal("")}>
      <div className="form-grid"><Field label="Contractor Name"><input value={contractForm.contractorName||""} onChange={e=>setContractForm({...contractForm,contractorName:e.target.value})}/></Field><Field label="Category"><select value={contractForm.category||"Masonry"} onChange={e=>setContractForm({...contractForm,category:e.target.value})}>{CATEGORIES.map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Pricing Type"><select value={contractForm.pricingType||"rate"} onChange={e=>setContractForm({...contractForm,pricingType:e.target.value})}><option value="rate">Quantity × Rate</option><option value="lump_sum">Lump Sum</option></select></Field><Field label="Billing Unit"><select value={contractForm.billingUnit||"SFT"} onChange={e=>setContractForm({...contractForm,billingUnit:e.target.value})}>{UNITS.map(x=><option key={x}>{x}</option>)}</select></Field>{contractForm.pricingType==="lump_sum"?<Field label="Contract Amount"><input type="number" value={contractForm.contractAmount||""} onChange={e=>setContractForm({...contractForm,contractAmount:e.target.value})}/></Field>:<><Field label="Contract Quantity"><input type="number" value={contractForm.contractQuantity||""} onChange={e=>setContractForm({...contractForm,contractQuantity:e.target.value})}/></Field><Field label="Agreed Rate"><input type="number" value={contractForm.agreedRate||""} onChange={e=>setContractForm({...contractForm,agreedRate:e.target.value})}/></Field></>}<Field label="Start Date"><input type="date" value={contractForm.startDate||""} onChange={e=>setContractForm({...contractForm,startDate:e.target.value})}/></Field><Field label="Target Completion"><input type="date" value={contractForm.targetCompletionDate||""} onChange={e=>setContractForm({...contractForm,targetCompletionDate:e.target.value})}/></Field><Field label="Scope" full><textarea value={contractForm.scopeDescription||""} onChange={e=>setContractForm({...contractForm,scopeDescription:e.target.value})}/></Field><Field label="Notes" full><textarea value={contractForm.notes||""} onChange={e=>setContractForm({...contractForm,notes:e.target.value})}/></Field></div><ModalActions saving={saving} onCancel={()=>setModal("")} onSave={()=>void post("saveContract",contractForm)}/>
    </Modal>}

    {modal === "bill" && <Modal title="Contractor Bill / Certification" onClose={()=>setModal("")}>
      <div className="form-grid"><Field label="Bill Date"><input type="date" value={billForm.billDate||""} onChange={e=>setBillForm({...billForm,billDate:e.target.value})}/></Field><Field label="Status"><select value={billForm.status||"Certified"} onChange={e=>setBillForm({...billForm,status:e.target.value})}><option>Draft</option><option>Certified</option><option>Void</option></select></Field><Field label="Description" full><input value={billForm.description||""} onChange={e=>setBillForm({...billForm,description:e.target.value})}/></Field><Field label="Completed Quantity"><input type="number" value={billForm.quantity||""} onChange={e=>setBillForm({...billForm,quantity:e.target.value})}/></Field><Field label="Rate"><input type="number" value={billForm.rate||""} onChange={e=>setBillForm({...billForm,rate:e.target.value})}/></Field><Field label="Deduction"><input type="number" value={billForm.deduction||0} onChange={e=>setBillForm({...billForm,deduction:e.target.value})}/></Field><div className="calculated"><span>Net Amount</span><strong>{money(Math.max(0,num(billForm.quantity)*num(billForm.rate)-num(billForm.deduction)))}</strong></div><Field label="Notes" full><textarea value={billForm.notes||""} onChange={e=>setBillForm({...billForm,notes:e.target.value})}/></Field></div><ModalActions saving={saving} onCancel={()=>setModal("")} onSave={()=>void post("saveBill",billForm)}/>
    </Modal>}

    {modal === "progress" && <Modal title="Physical Work Progress" onClose={()=>setModal("")}>
      <div className="progress-warning">Physical progress is a site measurement. It does not automatically change certified bills or contractor payments.</div><div className="form-grid"><Field label="Progress Date"><input type="date" value={progressForm.progressDate||""} onChange={e=>setProgressForm({...progressForm,progressDate:e.target.value})}/></Field><Field label="Physical Progress %"><input type="number" min="0" max="100" step="0.01" value={progressForm.progressPercent??""} onChange={e=>setProgressForm({...progressForm,progressPercent:e.target.value})}/></Field><Field label="Stage"><input placeholder="e.g. Finishing Works" value={progressForm.stageName||""} onChange={e=>setProgressForm({...progressForm,stageName:e.target.value})}/></Field><Field label="Floor / Zone"><input placeholder="e.g. 2nd Floor" value={progressForm.floorLabel||""} onChange={e=>setProgressForm({...progressForm,floorLabel:e.target.value})}/></Field><Field label="Completed Quantity"><input type="number" value={progressForm.completedQuantity||""} onChange={e=>setProgressForm({...progressForm,completedQuantity:e.target.value})}/></Field><Field label="Description" full><textarea value={progressForm.description||""} onChange={e=>setProgressForm({...progressForm,description:e.target.value})}/></Field><Field label="Notes" full><textarea value={progressForm.notes||""} onChange={e=>setProgressForm({...progressForm,notes:e.target.value})}/></Field></div><ModalActions saving={saving} onCancel={()=>setModal("")} onSave={()=>void post("saveProgress",progressForm)}/>
    </Modal>}
    <style jsx>{styles}</style>
  </main>;
}

function Metric({label,value,note,tone=""}:any){return <article className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>}
function Progress({label,value,empty}:any){const has=value!==null&&value!==undefined;const width=Math.max(0,Math.min(100,num(value)));return <div className="progress"><div><span>{label}</span><strong>{has?pct(value):empty}</strong></div><i><b style={{width:`${has?width:0}%`}}/></i></div>}
function Field({label,children,full=false}:any){return <label className={full?"field full":"field"}><span>{label}</span>{children}</label>}
function Modal({title,onClose,children}:any){return <div className="modal-backdrop" onMouseDown={e=>{if(e.currentTarget===e.target)onClose()}}><section className="modal"><header><div><span>LAND VIEW · PHASE 3</span><strong>{title}</strong></div><button onClick={onClose}>×</button></header>{children}</section></div>}
function ModalActions({saving,onCancel,onSave}:any){return <div className="modal-actions"><button onClick={onCancel}>Cancel</button><button className="primary" disabled={saving} onClick={onSave}>{saving?"Saving…":"Save"}</button></div>}

const styles = `
.ca-page{min-height:100vh;background:#f3f6f5;color:#17232b;padding:28px 26px 70px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.ca-shell{max-width:1540px;margin:0 auto}.ca-loading{display:flex;min-height:65vh;align-items:center;justify-content:center;flex-direction:column;gap:8px}.ca-loading small{color:#7f8d92}.spinner{width:34px;height:34px;border:3px solid #d8e4df;border-top-color:#1d6b52;border-radius:50%;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.hero{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:18px}.kicker{display:block;color:#1d6b52;font-size:9px;font-weight:900;letter-spacing:.16em}.hero h1,.chooser h1{margin:7px 0 4px;font-size:clamp(30px,4vw,46px);letter-spacing:-.045em}.hero h1 em{font-style:normal;font-size:.52em;color:#76838a;font-weight:650}.hero p,.chooser p{margin:0;color:#74828a;font-size:12px}.hero-actions{display:flex;gap:8px}.hero-actions button,.card-actions button,.section-head button,.modal-actions button,.actions button{border:1px solid #dbe4e0;background:#fff;color:#285e4b;border-radius:9px;padding:9px 11px;font:inherit;font-size:10px;font-weight:850;cursor:pointer}.primary{background:#1d6b52!important;color:#fff!important;border-color:#1d6b52!important}.metrics{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:14px}.metric{background:#fff;border:1px solid #e0e7e5;border-radius:14px;padding:15px;box-shadow:0 8px 20px rgba(18,41,31,.035)}.metric span{font-size:9px;color:#75838a;font-weight:850}.metric strong{display:block;margin:8px 0 4px;font-size:19px;letter-spacing:-.03em}.metric small{font-size:8px;color:#98a2a6}.metric.warn strong,.warn-text{color:#a66a17}.metric.danger strong,.danger-text{color:#b34940}.good-text{color:#27735a}.notice{display:flex;justify-content:space-between;gap:20px;padding:12px 15px;margin-bottom:14px;background:#fff9e8;border:1px solid #ead9a4;border-radius:12px;color:#72591f;font-size:10px}.notice span{color:#907b4c}.contract-list{display:grid;gap:12px}.contract-card{background:#fff;border:1px solid #dfe7e4;border-radius:16px;overflow:hidden;box-shadow:0 10px 28px rgba(15,37,28,.035)}.contract-main{display:grid;grid-template-columns:minmax(220px,1.15fr) 1.3fr 1.2fr auto;gap:18px;align-items:center;padding:18px}.identity>span,.section-head>div>span{font-size:8px;letter-spacing:.12em;font-weight:900;color:#1d6b52}.identity h2{margin:5px 0 4px;font-size:17px}.identity p{margin:0;color:#889399;font-size:9px;line-height:1.5}.money-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.money-grid div{padding:9px 10px;border:1px solid #edf1ef;border-radius:9px}.money-grid span{display:block;font-size:8px;color:#889397}.money-grid strong{display:block;margin-top:3px;font-size:11px}.progress-grid{display:grid;gap:7px}.progress>div{display:flex;justify-content:space-between;gap:10px;font-size:8px;color:#748187}.progress>div strong{color:#29383e}.progress i{height:5px;background:#edf1ef;border-radius:99px;overflow:hidden;display:block;margin-top:4px}.progress i b{display:block;height:100%;background:#1d6b52;border-radius:99px}.card-actions{display:flex;flex-direction:column;gap:5px}.details-zone{background:#f9fbfa;border-top:1px solid #e7ecea;padding:14px;display:grid;gap:13px}.details-zone section{background:#fff;border:1px solid #e5ebe8;border-radius:12px;padding:13px}.section-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.section-head strong{display:block;font-size:12px;margin-top:2px}.section-head small{color:#89969b;font-size:8px}.latest-progress{display:flex;align-items:center;gap:12px;background:#edf7f2;border:1px solid #d5e9df;border-radius:10px;padding:11px;margin-bottom:10px}.latest-progress>b{font-size:22px;color:#1d6b52}.latest-progress div strong,.latest-progress div span{display:block}.latest-progress div strong{font-size:10px}.latest-progress div span{font-size:8px;color:#73827f;margin-top:3px}.mini-table{overflow:auto}.mini-table table{width:100%;border-collapse:collapse;font-size:9px;min-width:720px}.mini-table th{text-align:left;color:#7c898e;font-size:8px;padding:8px;border-bottom:1px solid #e7ecea}.mini-table td{padding:8px;border-bottom:1px solid #f0f3f2;vertical-align:top}.mini-table tr:last-child td{border-bottom:0}.num{text-align:right!important;white-space:nowrap}.actions{white-space:nowrap;text-align:right}.actions button{padding:5px 7px;margin-left:4px;font-size:8px}.status{display:inline-flex;padding:3px 6px;border-radius:99px;background:#eef2f1;font-size:7px;font-weight:850}.status.certified{background:#e8f5ee;color:#24694f}.status.void{background:#f9ecea;color:#9e433c}.empty,.empty-card{text-align:center;color:#8d989c;padding:20px!important}.empty-card{background:#fff;border:1px dashed #cfdad5;border-radius:14px}.chooser{max-width:620px;margin:80px auto;background:#fff;border:1px solid #dfe7e4;border-radius:18px;padding:28px}.chooser select{width:100%;min-height:44px;margin-top:22px;border:1px solid #d7e0dd;border-radius:10px;padding:0 12px;background:#fff}.alert{margin:10px 0;padding:11px 13px;border:1px solid #efcfc9;background:#fff0ed;color:#9b4038;border-radius:10px;font-size:10px}.modal-backdrop{position:fixed;inset:0;z-index:200;background:rgba(7,18,14,.58);display:flex;align-items:center;justify-content:center;padding:22px}.modal{width:min(760px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:16px;box-shadow:0 30px 90px rgba(0,0,0,.28)}.modal>header{display:flex;justify-content:space-between;align-items:center;padding:16px 18px;border-bottom:1px solid #e4eae7}.modal>header span{display:block;font-size:8px;color:#1d6b52;letter-spacing:.12em;font-weight:900}.modal>header strong{display:block;margin-top:3px;font-size:15px}.modal>header button{border:0;background:#f1f4f3;width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:20px}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:18px}.field{display:grid;gap:5px}.field.full{grid-column:1/-1}.field>span{font-size:8px;font-weight:850;color:#6d7d82}.field input,.field select,.field textarea{width:100%;border:1px solid #d9e2df;border-radius:9px;padding:9px 10px;font:inherit;font-size:11px;background:#fff;color:#1c292f;box-sizing:border-box}.field textarea{min-height:74px;resize:vertical}.calculated{align-self:end;padding:9px 10px;background:#f3f7f5;border-radius:9px}.calculated span{font-size:8px;color:#78868b}.calculated strong{display:block;margin-top:3px;font-size:13px}.modal-actions{display:flex;justify-content:flex-end;gap:8px;padding:14px 18px;border-top:1px solid #e4eae7}.progress-warning{margin:16px 18px 0;padding:10px 12px;border-radius:9px;background:#eef5f2;color:#42645a;font-size:9px;line-height:1.5}
@media(max-width:1180px){.metrics{grid-template-columns:repeat(3,1fr)}.contract-main{grid-template-columns:1fr 1fr}.card-actions{flex-direction:row;grid-column:1/-1;justify-content:flex-end}}
@media(max-width:720px){.ca-page{padding:18px 10px 60px}.hero{align-items:flex-start;flex-direction:column}.hero-actions{width:100%}.hero-actions button{flex:1}.metrics{grid-template-columns:1fr 1fr}.contract-main{grid-template-columns:1fr}.card-actions{grid-column:auto;display:grid;grid-template-columns:1fr 1fr}.notice{flex-direction:column}.form-grid{grid-template-columns:1fr}.field.full{grid-column:auto}.modal-backdrop{padding:8px}.modal{max-height:95vh}.metric strong{font-size:16px}}
`;
