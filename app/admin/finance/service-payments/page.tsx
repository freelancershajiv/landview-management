"use client";

import { useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;
type Category = "Engineering Bill" | "Other Services Bill" | "Supervision Bill";

function money(v: unknown) { const n = Number(v || 0); return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0); }
function num(v: unknown) { const n = Number(String(v ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; }
function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
async function readJson(response: Response, fallback: string) { const json = await response.json().catch(() => null); if (!response.ok || !json?.success) throw new Error(String(json?.error || fallback)); return json.data; }
async function workflowGet(query: string) { return readJson(await fetch(`/api/service-workflow?${query}`, { credentials: "same-origin", cache: "no-store" }), "Could not load service billing data."); }
async function workflowPost(payload: Row) { return readJson(await fetch("/api/service-workflow", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }), "Could not update service billing data."); }
async function savePayment(payload: Row) { return readJson(await fetch("/api/billing/write", { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "savePayment", ...payload }) }), "Could not save payment."); }

export default function ServicePaymentsPage() {
  const [projects, setProjects] = useState<Row[]>([]);
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState<Row | null>(null);
  const [category, setCategory] = useState<Category>("Engineering Bill");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [discounts, setDiscounts] = useState<Record<string, string>>({});
  const [otherService, setOtherService] = useState("");
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState("Bank Transfer");
  const [account, setAccount] = useState("Bank Account");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => { void workflowGet("mode=billing-projects").then((r) => setProjects(r.projects || [])).catch((e) => setError(e.message)).finally(() => setLoading(false)); }, []);

  async function loadProject(id = projectId) {
    if (!id) { setData(null); return; }
    setLoading(true); setError(""); setMessage("");
    try {
      const next = await workflowGet(`mode=billing&projectId=${encodeURIComponent(id)}`);
      setData(next);
      const nextDiscounts: Record<string, string> = {};
      for (const service of next.services || []) if (service.billingCategory === "Engineering Bill") nextDiscounts[service.serviceKey] = String(service.discount || 0);
      setDiscounts(nextDiscounts); setAllocations({}); setPaymentAmount(""); setOtherService("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load project services."); }
    finally { setLoading(false); }
  }

  const services: Row[] = data?.services || [];
  const categoryServices = useMemo(() => services.filter((s) => s.billingCategory === category), [services, category]);
  const categoryTotal = data?.categoryTotals?.[category] || { gross: 0, discount: 0, net: 0, paid: 0, due: 0 };
  const selectedOther = categoryServices.find((s) => s.serviceKey === otherService);
  const allocatedTotal = Object.values(allocations).reduce((sum, value) => sum + Math.max(0, num(value)), 0);
  const discountTotal = Object.values(discounts).reduce((sum, value) => sum + Math.max(0, num(value)), 0);

  function autoAllocate(raw: string) {
    const value = Math.max(0, num(raw));
    setPaymentAmount(raw);
    if (category !== "Engineering Bill") return;
    let remaining = value;
    const next: Record<string, string> = {};
    for (const service of categoryServices) {
      const applied = Math.min(Math.max(0, num(service.due)), remaining);
      next[service.serviceKey] = applied > 0 ? String(applied) : "";
      remaining = Math.max(0, remaining - applied);
    }
    setAllocations(next);
  }

  async function pay() {
    if (!projectId) return setError("Choose a project first.");
    const amount = Math.max(0, num(paymentAmount));
    if (!(amount > 0)) return setError("Enter a payment amount.");
    if (amount > num(categoryTotal.due) + 0.01) return setError(`Payment cannot exceed ${money(categoryTotal.due)} due.`);
    setBusy(true); setError(""); setMessage("");
    try {
      if (category === "Engineering Bill") {
        if (Math.abs(discountTotal - num(categoryTotal.discount)) > 0.01) throw new Error(`Split the Engineering discount so the service discounts total ${money(categoryTotal.discount)}.`);
        if (Math.abs(allocatedTotal - amount) > 0.01) throw new Error("Allocated service amounts must exactly equal the payment amount.");
        await workflowPost({ action: "redistributeEngineeringDiscount", projectId, services: categoryServices.map((service) => ({ serviceName: service.serviceName, discount: Math.max(0, num(discounts[service.serviceKey])) })) });
        await savePayment({
          Project_ID: projectId, Payment_Date: date, Amount: amount, Payment_Method: method, Deposit_Account: account,
          Reference_No: reference.trim(), Payment_For: category, Income_Category: category, Transaction_Type: "Business Income",
          Affects_Business_Balance: "Yes", Received_From: data?.project?.ownerName || "", Notes: notes.trim(),
          Service_Allocations: categoryServices.map((service) => ({ serviceName: service.serviceName, amount: Math.max(0, num(allocations[service.serviceKey])), discount: Math.max(0, num(discounts[service.serviceKey])) })).filter((row) => row.amount > 0),
          Idempotency_Key: `service-payment-${crypto.randomUUID()}`,
        });
      } else {
        const service = selectedOther || categoryServices[0];
        if (!service) throw new Error("Choose a billed service first.");
        if (amount > num(service.due) + 0.01) throw new Error(`${service.serviceName} has only ${money(service.due)} due.`);
        const serviceType = service.serviceName === "Municipality Approval Contract" ? "Municipality File Pass" : service.serviceName;
        await savePayment({
          Project_ID: projectId, Payment_Date: date, Amount: amount, Payment_Method: method, Deposit_Account: account,
          Reference_No: reference.trim(), Payment_For: category, Income_Category: category,
          Service_Type: category === "Other Services Bill" ? serviceType : "", Transaction_Type: "Business Income",
          Affects_Business_Balance: "Yes", Received_From: data?.project?.ownerName || "", Notes: notes.trim(),
          Idempotency_Key: `service-payment-${crypto.randomUUID()}`,
        });
      }
      setMessage("Payment saved. Any service that is now fully paid has been opened automatically in Project Workflow.");
      await loadProject(projectId);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save service payment."); }
    finally { setBusy(false); }
  }

  return <main className="sp">
    <style>{`
      .sp{max-width:1450px;margin:0 auto;color:var(--lv-text-primary)}.sp *{box-sizing:border-box}.sp-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:15px}.sp-head small{font-size:8px;font-weight:950;letter-spacing:.12em;color:var(--lv-brand-text)}.sp-head h1{margin:5px 0 0;font-size:27px}.sp-head p{margin:5px 0 0;font-size:9px;color:var(--lv-text-secondary)}.sp-card{border:1px solid var(--lv-border-default);border-radius:12px;background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm)}.sp-select{display:grid;grid-template-columns:1.5fr repeat(3,minmax(150px,.55fr));gap:9px;padding:13px;margin-bottom:12px}.sp-field label{display:block;margin-bottom:5px;font-size:7px;font-weight:900;text-transform:uppercase;color:var(--lv-text-muted)}.sp-field input,.sp-field select,.sp-field textarea{width:100%;min-height:38px;padding:8px 10px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:9px}.sp-tabs{display:flex;gap:6px;margin-bottom:12px}.sp-tab{padding:9px 12px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-panel);color:var(--lv-text-secondary);font-size:8px;font-weight:900;cursor:pointer}.sp-tab.active{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.sp-summary{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:12px;margin-bottom:12px}.sp-stat{padding:11px;border:1px solid var(--lv-border-subtle);border-radius:9px;background:var(--lv-surface-muted)}.sp-stat span{display:block;font-size:7px;text-transform:uppercase;color:var(--lv-text-muted)}.sp-stat strong{display:block;margin-top:6px;font-size:15px}.sp-layout{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(330px,.7fr);gap:12px}.sp-table{overflow:auto}.sp-table table{width:100%;border-collapse:collapse;min-width:780px}.sp-table th,.sp-table td{padding:10px;border-bottom:1px solid var(--lv-border-subtle);font-size:8px;text-align:left}.sp-table th{background:var(--lv-surface-muted);color:var(--lv-text-muted);text-transform:uppercase}.sp-table strong{font-size:9px}.sp-table input{width:115px;padding:7px;border:1px solid var(--lv-border-default);border-radius:6px;background:var(--lv-surface-input);color:var(--lv-text-primary)}.sp-paid{color:var(--lv-success);font-weight:900}.sp-due{color:var(--lv-danger);font-weight:900}.sp-panel-head{padding:12px 14px;border-bottom:1px solid var(--lv-border-default);background:var(--lv-surface-muted)}.sp-panel-head h2{margin:0;font-size:12px}.sp-panel-head small{display:block;margin-top:4px;font-size:7px;color:var(--lv-text-muted)}.sp-form{display:grid;gap:9px;padding:13px}.sp-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}.sp-btn{min-height:39px;border:1px solid var(--lv-brand-border);border-radius:8px;background:var(--lv-brand-primary);color:var(--lv-text-inverse);font-size:9px;font-weight:950;cursor:pointer}.sp-btn.secondary{background:var(--lv-surface-input);border-color:var(--lv-border-default);color:var(--lv-text-primary)}.sp-btn:disabled{opacity:.5}.sp-msg{margin-bottom:12px;padding:10px 12px;border-radius:8px;font-size:9px}.sp-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.sp-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}.sp-empty{padding:28px;text-align:center;color:var(--lv-text-muted);font-size:9px}@media(max-width:950px){.sp-select{grid-template-columns:1fr 1fr}.sp-summary{grid-template-columns:repeat(2,1fr)}.sp-layout{grid-template-columns:1fr}}@media(max-width:600px){.sp-select,.sp-two{grid-template-columns:1fr}.sp-tabs{overflow:auto}.sp-summary{grid-template-columns:1fr}}
    `}</style>
    <header className="sp-head"><div><small>LAND VIEW · BILLING → WORKFLOW</small><h1>Service Payments</h1><p>Allocate cash to individual services. A service opens in Project Workflow only when its net due becomes fully paid.</p></div></header>
    {error && <div className="sp-msg bad">{error}</div>}{message && <div className="sp-msg good">{message}</div>}
    <section className="sp-card sp-select">
      <div className="sp-field"><label>Project</label><select value={projectId} onChange={(e)=>{setProjectId(e.target.value);void loadProject(e.target.value)}}><option value="">Choose project</option>{projects.map((p)=><option key={p.projectId} value={p.projectId}>{p.projectId} · {p.ownerName || "Owner"} · {p.story || "Story —"}</option>)}</select></div>
      <div className="sp-field"><label>Payment date</label><input type="date" value={date} onChange={(e)=>setDate(e.target.value)}/></div>
      <div className="sp-field"><label>Method</label><select value={method} onChange={(e)=>setMethod(e.target.value)}><option>Bank Transfer</option><option>Cash</option><option>Cheque</option><option>Mobile Banking</option></select></div>
      <div className="sp-field"><label>Deposit account</label><input value={account} onChange={(e)=>setAccount(e.target.value)}/></div>
    </section>
    {data && <>
      <div className="sp-tabs">{(["Engineering Bill","Other Services Bill","Supervision Bill"] as Category[]).map((item)=><button key={item} className={`sp-tab ${category===item?"active":""}`} onClick={()=>{setCategory(item);setPaymentAmount("");setAllocations({});setOtherService("")}}>{item}</button>)}</div>
      <section className="sp-card sp-summary"><div className="sp-stat"><span>Gross</span><strong>{money(categoryTotal.gross)}</strong></div><div className="sp-stat"><span>Discount</span><strong>{money(categoryTotal.discount)}</strong></div><div className="sp-stat"><span>Net</span><strong>{money(categoryTotal.net)}</strong></div><div className="sp-stat"><span>Paid</span><strong className="sp-paid">{money(categoryTotal.paid)}</strong></div><div className="sp-stat"><span>Due</span><strong className="sp-due">{money(categoryTotal.due)}</strong></div></section>
      <div className="sp-layout">
        <section className="sp-card"><div className="sp-panel-head"><h2>{category === "Engineering Bill" ? "Allocate Payment to Engineering Services" : "Billed Services"}</h2><small>{category === "Engineering Bill" ? "Payment fills the first due in standard order: Architectural → Structural → 3D → Electrical → remaining services." : "Choose the exact service receiving this payment."}</small></div>
          {!categoryServices.length ? <div className="sp-empty">No billed services in this category.</div> : <div className="sp-table"><table><thead><tr><th>Service</th><th>Gross</th><th>Discount</th><th>Net</th><th>Paid</th><th>Due</th>{category === "Engineering Bill" ? <th>Allocate</th> : <th>Select</th>}</tr></thead><tbody>{categoryServices.map((service)=><tr key={service.serviceKey}><td><strong>{service.serviceName}</strong>{service.fullyPaid&&<div className="sp-paid">Fully paid · workflow open</div>}</td><td>{money(service.gross)}</td><td>{category === "Engineering Bill" ? <input inputMode="decimal" value={discounts[service.serviceKey] ?? String(service.discount || 0)} onChange={(e)=>setDiscounts((d)=>({...d,[service.serviceKey]:e.target.value}))}/> : money(service.discount)}</td><td>{money(service.net)}</td><td>{money(service.paid)}</td><td className={service.due>0?"sp-due":"sp-paid"}>{money(service.due)}</td><td>{category === "Engineering Bill" ? <input inputMode="decimal" disabled={service.due<=0} value={allocations[service.serviceKey]||""} onChange={(e)=>setAllocations((a)=>({...a,[service.serviceKey]:e.target.value}))}/> : <input type="radio" name="other-service" checked={otherService===service.serviceKey} onChange={()=>setOtherService(service.serviceKey)}/>}</td></tr>)}</tbody></table></div>}
        </section>
        <aside className="sp-card"><div className="sp-panel-head"><h2>Pay Project Bill</h2><small>{data.project.projectId} · {data.project.ownerName} · {data.project.story}</small></div><div className="sp-form">
          {category !== "Engineering Bill" && categoryServices.length>0 && <div className="sp-field"><label>Service</label><select value={otherService} onChange={(e)=>setOtherService(e.target.value)}><option value="">Choose service</option>{categoryServices.filter((s)=>s.due>0).map((s)=><option key={s.serviceKey} value={s.serviceKey}>{s.serviceName} · Due {money(s.due)}</option>)}</select></div>}
          <div className="sp-field"><label>Amount received</label><input inputMode="decimal" value={paymentAmount} onChange={(e)=>autoAllocate(e.target.value)} placeholder="0"/></div>
          {category === "Engineering Bill" && <><button type="button" className="sp-btn secondary" onClick={()=>autoAllocate(paymentAmount)}>Fill first due automatically</button><div className="sp-stat"><span>Payment allocated</span><strong>{money(allocatedTotal)}</strong></div><div className="sp-stat"><span>Discount split</span><strong>{money(discountTotal)} / {money(categoryTotal.discount)}</strong></div></>}
          <div className="sp-two"><div className="sp-field"><label>Reference</label><input value={reference} onChange={(e)=>setReference(e.target.value)}/></div><div className="sp-field"><label>Category due</label><input disabled value={money(categoryTotal.due)}/></div></div>
          <div className="sp-field"><label>Notes</label><textarea value={notes} onChange={(e)=>setNotes(e.target.value)}/></div>
          <button className="sp-btn" disabled={busy || loading || !categoryServices.length} onClick={()=>void pay()}>{busy?"Saving payment…":"Pay & Update Workflow"}</button>
        </div></aside>
      </div>
    </>}
    {!data && !loading && <div className="sp-card sp-empty">Choose a project to allocate its bill payment to services.</div>}
  </main>;
}
