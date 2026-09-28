"use client";
// @ts-nocheck
/* eslint-disable */

/* Contractor workspace intentionally performs async state updates from its loader effect. */
/* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";

const CATEGORIES = [
  "Masonry",
  "R.C.C Masonry",
  "Finishing Masonry",
  "Electric Contractor",
  "Plumbing Contractor",
  "Electrical Material",
  "Plumbing Material",
  "Tiles",
  "Door",
  "Grills",
  "Other Expenses",
];

const money = (v:any) => new Intl.NumberFormat("en-BD",{style:"currency",currency:"BDT",maximumFractionDigits:2}).format(Number(v||0));
const num = (v:any) => {
  const n = Number(String(v??"").replace(/,/g,"").replace(/[^0-9.-]/g,""));
  return Number.isFinite(n) ? n : 0;
};
const dateText = (v:any) => {
  const d = new Date(String(v||"").slice(0,10)+"T00:00:00");
  return Number.isNaN(d.getTime()) ? String(v||"") : d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});
};
const today = () => new Date().toISOString().slice(0,10);

const blankContract = {
  id:"",
  contractorName:"",
  category:"Masonry",
  billingUnit:"SFT",
  contractQuantity:"",
  agreedRate:"",
  notes:"",
};

const blankBill = {
  id:"",
  billCode:"",
  contractId:"",
  billDate:today(),
  description:"",
  quantity:"",
  rate:"",
  deduction:"",
  status:"Certified",
  notes:"",
};

export default function ContractorBillsPage(){
  const [project,setProject] = useState("");
  const [data,setData] = useState<any>(null);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState("");
  const [message,setMessage] = useState("");
  const [contractOpen,setContractOpen] = useState(false);
  const [billOpen,setBillOpen] = useState(false);
  const [contractForm,setContractForm] = useState<any>(blankContract);
  const [billForm,setBillForm] = useState<any>(blankBill);
  const [expanded,setExpanded] = useState("");

  async function load(code = project){
    setLoading(true);
    setError("");
    try{
      const r = await fetch(code ? "/api/project-management?projectId="+encodeURIComponent(code) : "/api/project-management",{credentials:"same-origin",cache:"no-store"});
      const j = await r.json();
      if(!r.ok || !j?.success) throw new Error(j?.error || "Could not load contractor bills.");
      setData(j.data);
      if(j.data?.selectedProject?.projectCode) setProject(j.data.selectedProject.projectCode);
    }catch(e:any){
      setError(e?.message || "Could not load contractor bills.");
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{
    const code = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("projectId") || ""
      : "";
    setProject(code);
    void load(code);
  },[]);

  const contractors = data?.contractorBills?.contracts || [];
  const bills = data?.contractorBills?.bills || [];
  const totals = data?.contractorBills?.totals || {
    contractValue:0,certifiedAmount:0,paidAmount:0,advance:0,balancePayable:0,remainingContract:0
  };

  const contractMap = useMemo(()=>new Map(contractors.map((c:any)=>[String(c.id),c])),[contractors]);


  function openNewContract(){
    setContractForm({...blankContract});
    setContractOpen(true);
  }

  function openEditContract(c:any){
    setContractForm({
      id:c.id,
      contractorName:c.contractor_name || "",
      category:c.category || "Masonry",
      billingUnit:c.billing_unit || "SFT",
      contractQuantity:String(c.contract_quantity ?? ""),
      agreedRate:String(c.agreed_rate ?? ""),
      notes:c.notes || "",
    });
    setContractOpen(true);
  }

  function openNewBill(contract?:any){
    const c = contract || contractors[0];
    setBillForm({
      ...blankBill,
      contractId:c?.id || "",
      rate:String(c?.agreed_rate ?? ""),
      description:c ? (c.category+" work bill") : "",
    });
    setBillOpen(true);
  }

  function openEditBill(b:any){
    setBillForm({
      id:b.id,
      billCode:b.bill_code || "",
      contractId:b.contract_id || "",
      billDate:String(b.bill_date||"").slice(0,10),
      description:b.description || "",
      quantity:String(b.quantity ?? ""),
      rate:String(b.rate ?? ""),
      deduction:String(b.deduction ?? ""),
      status:b.status || "Certified",
      notes:b.notes || "",
    });
    setBillOpen(true);
  }

  function selectedContractForBill(){
    return contractors.find((c:any)=>String(c.id)===String(billForm.contractId)) || null;
  }

  const billGross = num(billForm.quantity) * num(billForm.rate);
  const billNet = Math.max(0,billGross-num(billForm.deduction));

  async function saveContract(){
    setSaving(true); setError("");
    try{
      const r = await fetch("/api/project-management",{
        method:"POST",
        credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          action:"saveContractorContract",
          projectId:data?.selectedProject?.projectCode || project,
          id:contractForm.id || undefined,
          contractorName:contractForm.contractorName,
          category:contractForm.category,
          billingUnit:contractForm.billingUnit,
          contractQuantity:num(contractForm.contractQuantity),
          agreedRate:num(contractForm.agreedRate),
          notes:contractForm.notes,
        })
      });
      const j=await r.json();
      if(!r.ok || !j?.success) throw new Error(j?.error || "Could not save contractor contract.");
      setContractOpen(false);
      setMessage(contractForm.id ? "Contractor contract updated." : "Contractor contract added.");
      await load(data?.selectedProject?.projectCode || project);
    }catch(e:any){
      setError(e?.message || "Could not save contractor contract.");
    }finally{
      setSaving(false);
    }
  }

  async function saveBill(){
    const selected = selectedContractForBill();
    if(!selected) { setError("Select a contractor contract."); return; }
    setSaving(true); setError("");
    try{
      const r = await fetch("/api/project-management",{
        method:"POST",
        credentials:"same-origin",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({
          action:"saveContractorBill",
          projectId:data?.selectedProject?.projectCode || project,
          id:billForm.id || undefined,
          billCode:billForm.billCode || undefined,
          contractId:billForm.contractId,
          billDate:billForm.billDate,
          description:billForm.description,
          quantity:num(billForm.quantity),
          rate:num(billForm.rate),
          deduction:num(billForm.deduction),
          status:billForm.status,
          notes:billForm.notes,
        })
      });
      const j=await r.json();
      if(!r.ok || !j?.success) throw new Error(j?.error || "Could not save contractor bill.");
      setBillOpen(false);
      setMessage(billForm.id ? "Contractor bill updated." : "Contractor bill created.");
      await load(data?.selectedProject?.projectCode || project);
    }catch(e:any){
      setError(e?.message || "Could not save contractor bill.");
    }finally{
      setSaving(false);
    }
  }

  async function deleteBill(id:string){
    if(!confirm("Delete this contractor bill?")) return;
    try{
      const r=await fetch("/api/project-management?type=contractor-bill&id="+encodeURIComponent(id),{method:"DELETE",credentials:"same-origin"});
      const j=await r.json();
      if(!r.ok || !j?.success) throw new Error(j?.error || "Could not delete contractor bill.");
      setMessage("Contractor bill deleted.");
      await load(data?.selectedProject?.projectCode || project);
    }catch(e:any){ setError(e?.message || "Could not delete contractor bill."); }
  }

  if(loading && !data){
    return <main className="cb-page"><div className="cb-loading"><div className="cb-spinner"/><strong>Loading Contractor Bills</strong><span>Preparing contract reconciliation…</span></div></main>;
  }

  const admin = Boolean(data && !data.readOnly);

  return (
    <main className="cb-page">
      <div className="cb-shell">
        <header className="cb-header">
          <div>
            <div className="cb-kicker">LAND VIEW · PROJECT MANAGEMENT</div>
            <h1>Contractor Bills</h1>
            <p>Calculate earned contractor bills separately from the payment ledger, then reconcile certified work against actual payments.</p>
            <div className="cb-project-pill">
              <strong>{data?.selectedProject?.projectCode || project || "—"}</strong>
              <span>{data?.selectedProject?.projectName || "Project"}</span>
            </div>
          </div>
          <div className="cb-header-actions">
            <button className="cb-btn cb-btn-secondary" onClick={()=>window.location.assign("/projectmanagement?projectId="+encodeURIComponent(data?.selectedProject?.projectCode||project))}>← Ledger</button>
            <button className="cb-btn cb-btn-secondary" onClick={()=>void load(data?.selectedProject?.projectCode||project)}>↻ Refresh</button>
            {admin && <button className="cb-btn cb-btn-primary" onClick={openNewContract}>＋ Add Contractor</button>}
            {admin && contractors.length>0 && <button className="cb-btn cb-btn-dark" onClick={()=>openNewBill()}>＋ New Bill</button>}
          </div>
        </header>

        {error && <div className="cb-alert cb-error"><span>!</span><div>{error}</div><button onClick={()=>setError("")}>×</button></div>}
        {message && <div className="cb-alert cb-success"><span>✓</span><div>{message}</div><button onClick={()=>setMessage("")}>×</button></div>}

        <section className="cb-explain">
          <div>
            <strong>How this works</strong>
            <span>Contract value = contract quantity × agreed rate. Certified bills come from this screen. Payments come automatically from the existing debit/credit ledger when the project, expense category, and contractor match.</span>
          </div>
          <div className="cb-formula">Certified − Paid = Balance Payable · Paid − Certified = Advance</div>
        </section>

        <section className="cb-stats">
          <div className="cb-stat"><span>Contract Value</span><strong>{money(totals.contractValue)}</strong><small>Agreed quantity × agreed rate</small></div>
          <div className="cb-stat"><span>Certified Bills</span><strong>{money(totals.certifiedAmount)}</strong><small>Certified work only</small></div>
          <div className="cb-stat"><span>Paid from Ledger</span><strong>{money(totals.paidAmount)}</strong><small>Existing contractor payments</small></div>
          <div className="cb-stat"><span>Advance</span><strong>{money(totals.advance)}</strong><small>Paid more than certified</small></div>
          <div className="cb-stat"><span>Balance Payable</span><strong>{money(totals.balancePayable)}</strong><small>Certified but not yet paid</small></div>
          <div className="cb-stat"><span>Remaining Contract</span><strong>{money(totals.remainingContract)}</strong><small>Contract value less certified bills</small></div>
        </section>

        <section className="cb-panel">
          <div className="cb-panel-head">
            <div>
              <span className="cb-label">CONTRACT SETUP</span>
              <h2>Contractors & Reconciliation</h2>
            </div>
            {admin && <button className="cb-small-btn" onClick={openNewContract}>Add Contractor</button>}
          </div>

          <div className="cb-table-wrap">
            <table className="cb-table">
              <thead>
                <tr>
                  <th>Contractor</th>
                  <th>Category</th>
                  <th>Unit</th>
                  <th className="num">Contract Qty</th>
                  <th className="num">Rate</th>
                  <th className="num">Contract Value</th>
                  <th className="num">Certified</th>
                  <th className="num">Paid</th>
                  <th className="num">Advance</th>
                  <th className="num">Balance</th>
                  <th className="num">Remaining</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {contractors.map((c:any)=>{
                  const isExpanded=expanded===c.id;
                  const contractBills=bills.filter((b:any)=>String(b.contract_id)===String(c.id));
                  return (
                    <tr key={c.id} className={isExpanded?"cb-expanded-row":""}>
                      <td colSpan={12} className="cb-contractor-cell">
                        <div className="cb-row-main">
                          <div className="cb-contractor-name"><strong>{c.contractor_name}</strong><small>{c.paymentCount||0} matched ledger payment{(c.paymentCount||0)===1?"":"s"}</small></div>
                          <div><span className="cb-tag">{c.category}</span></div>
                          <div className="cb-center">{c.billing_unit}</div>
                          <div className="num">{num(c.contract_quantity).toLocaleString("en-BD",{maximumFractionDigits:3})}</div>
                          <div className="num">{money(c.agreed_rate)}</div>
                          <div className="num cb-strong">{money(c.contractValue)}</div>
                          <div className="num">{money(c.certifiedAmount)}</div>
                          <div className="num cb-paid">{money(c.paidAmount)}</div>
                          <div className="num cb-advance">{money(c.advance)}</div>
                          <div className="num cb-balance">{money(c.balancePayable)}</div>
                          <div className="num">{money(c.remainingContract)}</div>
                          <div className="cb-actions">
                            {admin && <button className="cb-icon" title="Edit contract" onClick={()=>openEditContract(c)}>✎</button>}
                            {admin && <button className="cb-icon" title="New bill" onClick={()=>openNewBill(c)}>＋</button>}
                            <button className="cb-icon" title="Statement" onClick={()=>setExpanded(isExpanded?"":c.id)}>{isExpanded?"−":"▤"}</button>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="cb-detail">
                            <div className="cb-detail-grid">
                              <div className="cb-detail-card">
                                <span>Payment Reconciliation</span>
                                <strong>{money(c.paidAmount)}</strong>
                                <small>Matched from ledger by category + contractor</small>
                                <div className="cb-mini-list">
                                  {(c.payments||[]).map((p:any)=><div key={p.id}><span>{dateText(p.date)}</span><b>{p.details}</b><strong>{money(p.amount)}</strong></div>)}
                                  {!c.payments?.length && <div className="cb-empty-inline">No matching contractor payments found in the ledger.</div>}
                                </div>
                              </div>
                              <div className="cb-detail-card">
                                <span>Certified Bills</span>
                                <strong>{money(c.certifiedAmount)}</strong>
                                <small>{contractBills.filter((b:any)=>String(b.status).toLowerCase()==="certified").length} certified bill(s)</small>
                                <div className="cb-mini-list">
                                  {contractBills.map((b:any)=><div key={b.id}><span>{dateText(b.bill_date)}</span><b>{b.bill_code} · {b.description}</b><strong>{money(b.net_amount)}</strong></div>)}
                                  {!contractBills.length && <div className="cb-empty-inline">No contractor bills yet.</div>}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!contractors.length && (
                  <tr><td colSpan={12} className="cb-empty"><strong>No contractor contracts set up for this project.</strong><span>Start by adding the contractor, category, project quantity and agreed rate.</span></td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="cb-panel">
          <div className="cb-panel-head">
            <div>
              <span className="cb-label">BILL REGISTER</span>
              <h2>Certified Contractor Bills</h2>
            </div>
            {admin && contractors.length>0 && <button className="cb-small-btn" onClick={()=>openNewBill()}>New Bill</button>}
          </div>
          <div className="cb-table-wrap">
            <table className="cb-table cb-bills-table">
              <thead>
                <tr>
                  <th>Bill</th><th>Date</th><th>Contractor</th><th>Description</th>
                  <th className="num">Qty</th><th className="num">Rate</th><th className="num">Gross</th><th className="num">Deduction</th><th className="num">Net</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b:any)=>{
                  const c=contractMap.get(String(b.contract_id));
                  return <tr key={b.id}>
                    <td><strong>{b.bill_code}</strong></td>
                    <td>{dateText(b.bill_date)}</td>
                    <td><strong>{c?.contractor_name||"—"}</strong><small className="cb-sub">{c?.category||""}</small></td>
                    <td><div className="cb-description">{b.description}</div><small>{b.notes||""}</small></td>
                    <td className="num">{num(b.quantity).toLocaleString("en-BD",{maximumFractionDigits:3})}</td>
                    <td className="num">{money(b.rate)}</td>
                    <td className="num">{money(b.gross_amount)}</td>
                    <td className="num">{money(b.deduction)}</td>
                    <td className="num cb-strong">{money(b.net_amount)}</td>
                    <td><span className={"cb-status "+String(b.status||"").toLowerCase()}>{b.status}</span></td>
                    <td className="cb-actions">
                      {admin && <button className="cb-icon" title="Edit bill" onClick={()=>openEditBill(b)}>✎</button>}
                      {admin && <button className="cb-icon cb-danger" title="Delete bill" onClick={()=>void deleteBill(b.id)}>⌫</button>}
                    </td>
                  </tr>
                })}
                {!bills.length && <tr><td colSpan={11} className="cb-empty"><strong>No contractor bills have been entered.</strong><span>Daily payments stay in the ledger; certified earned amounts are entered here.</span></td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        {contractOpen && admin && (
          <div className="cb-backdrop">
            <section className="cb-modal">
              <div className="cb-modal-head">
                <div><span className="cb-label">CONTRACT SETUP</span><h2>{contractForm.id?"Edit Contractor":"Add Contractor"}</h2><p>Set the project size/quantity and agreed contractor rate.</p></div>
                <button className="cb-close" onClick={()=>setContractOpen(false)}>×</button>
              </div>
              <div className="cb-form">
                <label><span>Contractor Name</span><input value={contractForm.contractorName} onChange={e=>setContractForm({...contractForm,contractorName:e.target.value})} placeholder="Contractor name"/></label>
                <label><span>Expense Category</span><select value={contractForm.category} onChange={e=>setContractForm({...contractForm,category:e.target.value})}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label>
                <label><span>Billing Unit</span><input value={contractForm.billingUnit} onChange={e=>setContractForm({...contractForm,billingUnit:e.target.value})} placeholder="SFT / POINT / FLAT"/></label>
                <label><span>Contract Quantity / Project Size</span><input value={contractForm.contractQuantity} onChange={e=>setContractForm({...contractForm,contractQuantity:e.target.value})} inputMode="decimal" placeholder="0.000"/></label>
                <label><span>Agreed Rate</span><input value={contractForm.agreedRate} onChange={e=>setContractForm({...contractForm,agreedRate:e.target.value})} inputMode="decimal" placeholder="0.00"/></label>
                <div className="cb-calc"><span>Contract Value</span><strong>{money(num(contractForm.contractQuantity)*num(contractForm.agreedRate))}</strong><small>Quantity × Rate</small></div>
                <label className="full"><span>Notes</span><textarea value={contractForm.notes} onChange={e=>setContractForm({...contractForm,notes:e.target.value})} placeholder="Optional contract note"/></label>
              </div>
              <div className="cb-modal-foot"><button className="cb-btn cb-btn-secondary" onClick={()=>setContractOpen(false)}>Cancel</button><button className="cb-btn cb-btn-primary" onClick={()=>void saveContract()} disabled={saving}>{saving?"Saving…":"Save Contractor"}</button></div>
            </section>
          </div>
        )}

        {billOpen && admin && (
          <div className="cb-backdrop">
            <section className="cb-modal">
              <div className="cb-modal-head">
                <div><span className="cb-label">CONTRACTOR BILL</span><h2>{billForm.id?"Edit Bill":"New Contractor Bill"}</h2><p>Enter the completed quantity. The amount is calculated from quantity × rate.</p></div>
                <button className="cb-close" onClick={()=>setBillOpen(false)}>×</button>
              </div>
              <div className="cb-form">
                <label className="full"><span>Contractor / Contract</span><select value={billForm.contractId} onChange={e=>{const id=e.target.value;const c=contractors.find((x:any)=>String(x.id)===String(id));setBillForm({...billForm,contractId:id,rate:String(c?.agreed_rate??""),description:c?(c.category+" work bill"):billForm.description});}}>{contractors.map(c=><option key={c.id} value={c.id}>{c.contractor_name+" · "+c.category}</option>)}</select></label>
                <label><span>Bill Date</span><input type="date" value={billForm.billDate} onChange={e=>setBillForm({...billForm,billDate:e.target.value})}/></label>
                <label><span>Status</span><select value={billForm.status} onChange={e=>setBillForm({...billForm,status:e.target.value})}><option>Draft</option><option>Certified</option><option>Void</option></select></label>
                <label className="full"><span>Description</span><input value={billForm.description} onChange={e=>setBillForm({...billForm,description:e.target.value})} placeholder="Ground floor masonry work / electrical points / plumbing work"/></label>
                <label><span>Completed Quantity</span><input value={billForm.quantity} onChange={e=>setBillForm({...billForm,quantity:e.target.value})} inputMode="decimal" placeholder="0.000"/></label>
                <label><span>Rate</span><input value={billForm.rate} onChange={e=>setBillForm({...billForm,rate:e.target.value})} inputMode="decimal" placeholder="0.00"/></label>
                <label><span>Deduction</span><input value={billForm.deduction} onChange={e=>setBillForm({...billForm,deduction:e.target.value})} inputMode="decimal" placeholder="0.00"/></label>
                <div className="cb-calc"><span>Bill Amount</span><strong>{money(billNet)}</strong><small>Gross {money(billGross)} − Deduction {money(num(billForm.deduction))}</small></div>
                <label className="full"><span>Notes</span><textarea value={billForm.notes} onChange={e=>setBillForm({...billForm,notes:e.target.value})} placeholder="Optional bill note"/></label>
              </div>
              <div className="cb-modal-foot"><button className="cb-btn cb-btn-secondary" onClick={()=>setBillOpen(false)}>Cancel</button><button className="cb-btn cb-btn-primary" onClick={()=>void saveBill()} disabled={saving}>{saving?"Saving…":billForm.id?"Update Bill":"Save Bill"}</button></div>
            </section>
          </div>
        )}

        <style jsx>{`
          .cb-page{min-height:100vh;background:#f3f6f5;color:#17232b;padding:30px 28px 60px;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
          .cb-shell{max-width:1600px;margin:0 auto}
          .cb-header{display:flex;justify-content:space-between;gap:28px;align-items:flex-end;margin-bottom:20px}
          .cb-kicker,.cb-label{font-size:10px;letter-spacing:.14em;font-weight:900;color:#1d6b52}
          .cb-header h1{font-size:clamp(30px,4vw,48px);line-height:1.03;letter-spacing:-.045em;margin:8px 0 8px}
          .cb-header p{max-width:820px;margin:0;color:#6b7880;font-size:13px;line-height:1.65}
          .cb-header-actions{display:flex;gap:9px;flex-wrap:wrap;justify-content:flex-end}
          .cb-project-pill{display:inline-flex;align-items:center;gap:10px;margin-top:14px;padding:8px 11px;border:1px solid #dde6e2;background:#f6faf8;border-radius:10px;color:#5d6d73;font-size:11px}
          .cb-project-pill strong{color:#1d6b52}
          .cb-btn{height:42px;border-radius:11px;padding:0 15px;border:0;font:inherit;font-size:13px;font-weight:800;cursor:pointer}
          .cb-btn-secondary{background:#fff;color:#243038;border:1px solid #dfe6e8}
          .cb-btn-primary{background:#1d6b52;color:#fff;box-shadow:0 8px 18px rgba(29,107,82,.18)}
          .cb-btn-dark{background:#17242b;color:#fff}
          .cb-btn:disabled{opacity:.55;cursor:not-allowed}
          .cb-alert{display:flex;align-items:center;gap:11px;padding:12px 15px;border-radius:12px;margin-bottom:12px;font-size:13px}
          .cb-alert>span{width:24px;height:24px;display:grid;place-items:center;border-radius:50%;font-weight:900}
          .cb-alert button{margin-left:auto;border:0;background:transparent;cursor:pointer;font-size:18px}
          .cb-error{background:#fff0ee;color:#a53c32;border:1px solid #f3d3ce}.cb-error>span{background:#f7d6d1}
          .cb-success{background:#edf8f2;color:#206449;border:1px solid #d3ebdc}.cb-success>span{background:#d5ecde}
          .cb-explain{display:flex;justify-content:space-between;gap:20px;background:#fff;border:1px solid #e1e8e6;border-radius:16px;padding:15px 17px;margin-bottom:14px}
          .cb-explain strong{display:block;font-size:13px}.cb-explain span{display:block;max-width:980px;color:#7c898f;font-size:11px;margin-top:4px;line-height:1.55}.cb-formula{align-self:center;padding:10px 12px;border-radius:9px;background:#f5faf7;border:1px solid #dceae3;color:#356957;font-size:10px;font-weight:850;white-space:nowrap}
          .cb-stats{display:grid;grid-template-columns:repeat(6,1fr);gap:11px;margin-bottom:15px}
          .cb-stat{background:#fff;border:1px solid #e1e8e6;border-radius:15px;padding:16px;min-height:118px}
          .cb-stat span{display:block;color:#7c898e;font-size:10px;font-weight:800;letter-spacing:.04em}.cb-stat strong{display:block;margin-top:10px;font-size:22px;letter-spacing:-.03em}.cb-stat small{display:block;color:#9aa5aa;font-size:9px;margin-top:7px;line-height:1.4}
          .cb-panel{background:#fff;border:1px solid #e1e8e6;border-radius:17px;overflow:hidden;box-shadow:0 12px 30px rgba(20,38,29,.035);margin-bottom:15px}
          .cb-panel-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;padding:16px 18px;border-bottom:1px solid #edf0f1}
          .cb-panel-head h2{margin:5px 0 0;font-size:20px;letter-spacing:-.03em}.cb-small-btn{border:1px solid #d7e4de;background:#f5faf7;color:#2d6755;border-radius:9px;padding:8px 11px;font:inherit;font-size:11px;font-weight:850;cursor:pointer}
          .cb-table-wrap{overflow:auto}
          .cb-table{width:100%;min-width:1380px;border-collapse:separate;border-spacing:0;font-size:11px}
          .cb-table th{padding:10px 11px;background:#f8fafb;color:#859197;border-bottom:1px solid #e8edee;text-align:left;text-transform:uppercase;letter-spacing:.09em;font-size:8px;white-space:nowrap}
          .cb-table td{padding:11px;border-bottom:1px solid #f0f3f4;color:#44525a;vertical-align:middle;white-space:nowrap}
          .cb-table .num{text-align:right}.cb-table tbody tr:last-child td{border-bottom:0}
          .cb-table small.cb-sub,.cb-contractor-name small{display:block;color:#9aa5aa;font-size:9px;margin-top:3px}
          .cb-contractor-cell{padding:0!important;white-space:normal!important}
          .cb-row-main{display:grid;grid-template-columns:1.45fr 1.1fr .55fr .8fr .8fr 1fr 1fr 1fr .9fr 1fr 1fr .8fr;gap:0;align-items:center;padding:11px}
          .cb-contractor-name strong{font-size:12px;color:#25343b}
          .cb-center{text-align:center}
          .cb-tag{display:inline-flex;padding:5px 8px;border-radius:8px;background:#f1f5f3;border:1px solid #e5ebe8;color:#607077;font-size:9px;font-weight:800}
          .cb-strong{font-weight:850;color:#1d6b52}.cb-paid{font-weight:800;color:#315c7f}.cb-advance{font-weight:800;color:#956628}.cb-balance{font-weight:850;color:#8c4b4b}
          .cb-actions{display:flex;gap:5px;justify-content:flex-end}
          .cb-icon{width:28px;height:28px;border-radius:8px;border:1px solid #e0e7e6;background:#f5f7f7;color:#627077;font:inherit;font-size:11px;cursor:pointer}.cb-icon:hover{background:#e8efec;color:#275846}.cb-danger:hover{background:#fff0ee;color:#a4483f}
          .cb-expanded-row{background:#fbfdfc}
          .cb-detail{padding:0 14px 14px 14px}
          .cb-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
          .cb-detail-card{border:1px solid #e2ebe7;border-radius:12px;background:#fff;padding:12px}.cb-detail-card>span{display:block;color:#6f7d83;font-size:10px;font-weight:800}.cb-detail-card>strong{display:block;font-size:18px;margin-top:5px}.cb-detail-card>small{display:block;color:#9aa5aa;font-size:9px;margin-top:3px}
          .cb-mini-list{margin-top:9px;border-top:1px solid #eef2f1}.cb-mini-list>div{display:grid;grid-template-columns:85px 1fr auto;gap:8px;padding:8px 0;border-bottom:1px solid #f1f3f3;font-size:10px}.cb-mini-list>div:last-child{border-bottom:0}.cb-mini-list span{color:#8d989d}.cb-mini-list b{font-weight:700;color:#4b585f}.cb-mini-list strong{color:#245c48}.cb-empty-inline{grid-template-columns:1fr!important;color:#a0aaae}
          .cb-empty{text-align:center!important;padding:42px 20px!important}.cb-empty strong{display:block;color:#56636a;font-size:12px}.cb-empty span{display:block;margin-top:5px;color:#949fa4;font-size:10px}
          .cb-status{display:inline-flex;padding:5px 8px;border-radius:999px;font-size:9px;font-weight:850}.cb-status.certified{background:#edf8f2;color:#2e7157}.cb-status.draft{background:#fff5e4;color:#98652f}.cb-status.void{background:#fff0ee;color:#a74840}
          .cb-description{font-weight:750;color:#33424a}.cb-bills-table td small{display:block;color:#9aa5aa;font-size:9px;margin-top:3px;max-width:300px;overflow:hidden;text-overflow:ellipsis}
          .cb-backdrop{position:fixed;inset:0;z-index:100;background:rgba(13,27,23,.52);backdrop-filter:blur(5px);display:grid;place-items:center;padding:20px}
          .cb-modal{width:min(760px,100%);max-height:92vh;overflow:hidden;background:#fff;border-radius:20px;border:1px solid #dfe6e5;box-shadow:0 28px 80px rgba(13,28,23,.22)}
          .cb-modal-head{display:flex;justify-content:space-between;gap:16px;padding:20px;border-bottom:1px solid #edf0f1}.cb-modal-head h2{margin:5px 0 0;font-size:23px;letter-spacing:-.03em}.cb-modal-head p{margin:4px 0 0;color:#8a969a;font-size:11px}.cb-close{width:34px;height:34px;border:0;border-radius:9px;background:#f4f6f7;color:#647179;font-size:21px;cursor:pointer}
          .cb-form{display:grid;grid-template-columns:1fr 1fr;gap:13px;padding:20px;overflow:auto}.cb-form label{display:block}.cb-form label.full{grid-column:1/-1}.cb-form label span{display:block;margin-bottom:6px;color:#748187;font-size:10px;font-weight:800}.cb-form input,.cb-form select,.cb-form textarea{width:100%;box-sizing:border-box;border:1px solid #dfe6e8;background:#fbfcfc;border-radius:10px;min-height:42px;padding:0 12px;outline:0;font:inherit;font-size:12px;color:#23323a}.cb-form textarea{padding:11px 12px;min-height:78px;resize:vertical}.cb-form input:focus,.cb-form select:focus,.cb-form textarea:focus{border-color:#79ad98;box-shadow:0 0 0 3px rgba(29,107,82,.08)}
          .cb-calc{border:1px solid #deebe5;background:#f6faf8;border-radius:11px;padding:10px 12px;display:flex;flex-direction:column;justify-content:center}.cb-calc span{font-size:9px;color:#718078;font-weight:800}.cb-calc strong{font-size:20px;margin-top:3px;color:#1d6b52}.cb-calc small{font-size:9px;color:#8a969b;margin-top:2px}
          .cb-modal-foot{display:flex;justify-content:flex-end;gap:8px;padding:14px 20px;background:#fafcfc;border-top:1px solid #edf0f1}
          .cb-loading{min-height:100vh;display:grid;place-items:center;align-content:center;gap:8px;color:#26343b}.cb-loading span{font-size:11px;color:#89959a}.cb-spinner{width:28px;height:28px;border-radius:50%;border:3px solid #e5ebea;border-top-color:#1d6b52;animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
          @media(max-width:1250px){.cb-stats{grid-template-columns:repeat(3,1fr)}.cb-row-main{min-width:1380px}.cb-table{min-width:1500px}}
          @media(max-width:800px){.cb-page{padding:18px 12px 45px}.cb-header{align-items:flex-start;flex-direction:column}.cb-header-actions{justify-content:flex-start}.cb-stats{grid-template-columns:1fr 1fr}.cb-explain{flex-direction:column}.cb-form{grid-template-columns:1fr}.cb-form label.full{grid-column:auto}.cb-detail-grid{grid-template-columns:1fr}}
          @media(max-width:540px){.cb-stats{grid-template-columns:1fr}.cb-header-actions .cb-btn{flex:1}.cb-modal-head{padding:16px}.cb-form{padding:16px}.cb-modal-foot{padding:12px 16px}}
        `}</style>
      </div>
    </main>
  );
}
