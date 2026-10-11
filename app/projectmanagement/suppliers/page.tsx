"use client";

import { useEffect, useMemo, useState } from "react";
import "./suppliers.css";

type Row = Record<string, any>;
const money=(v:unknown)=>new Intl.NumberFormat("en-BD",{style:"currency",currency:"BDT",maximumFractionDigits:2}).format(Number(v||0));
const num=(v:unknown)=>{const n=Number(String(v??"").replace(/,/g,"").replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:0};
const dateText=(v:unknown)=>{const d=new Date(String(v||"").slice(0,10)+"T00:00:00");return Number.isNaN(d.getTime())?String(v||""):d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})};
const blankForm=()=>({date:new Date().toISOString().slice(0,10),details:"",quantity:"",rate:"",amount:"",category:"",paymentMethod:"Bank Transfer",receivedFrom:"Mr. Mahi Bhai",chequeStatus:"Cashed",memo:""});

export default function SupplierAccountsPage(){
  const [data,setData]=useState<Row|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [selectedId,setSelectedId]=useState(""),[mode,setMode]=useState("addDelivery"),[form,setForm]=useState<any>(blankForm()),[saving,setSaving]=useState(false);
  const projectId=typeof window!=="undefined"?new URLSearchParams(window.location.search).get("projectId")||"":"";

  async function load(){
    if(!projectId){setLoading(false);return;}
    setLoading(true);setError("");
    try{
      const r=await fetch(`/api/project-supplier-accounts?projectId=${encodeURIComponent(projectId)}`,{credentials:"same-origin",cache:"no-store"});
      const j=await r.json();
      if(!r.ok||!j?.success)throw new Error(j?.error||"Could not load supplier accounts.");
      setData(j.data);
      setSelectedId((prev:string)=>prev&&j.data.accounts.some((a:Row)=>String(a.id)===prev)?prev:String(j.data.accounts[0]?.id||""));
    }catch(e:any){setError(e?.message||"Could not load supplier accounts.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load()},[]);

  const selected=useMemo(()=>data?.accounts?.find((a:Row)=>String(a.id)===String(selectedId))||null,[data,selectedId]);
  useEffect(()=>{if(selected)setForm((f:any)=>({...f,category:selected.primaryCategory||f.category}))},[selectedId]);
  const preview=num(form.quantity)>0&&num(form.rate)>0?num(form.quantity)*num(form.rate):num(form.amount);

  async function save(){
    if(!selected)return;
    setSaving(true);setError("");setMessage("");
    try{
      const body={action:mode,projectId,supplierAccountId:selected.id,...form};
      const r=await fetch("/api/project-supplier-accounts",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const j=await r.json();
      if(!r.ok||!j?.success)throw new Error(j?.error||"Could not save supplier transaction.");
      const label=mode==="addDelivery"?"Delivery recorded.":mode==="addAdvanceFund"?"Supplier funding recorded.":mode==="addAdvanceCash"?"Supplier cash advance recorded.":"Direct purchase recorded.";
      setMessage(label);setForm({...blankForm(),category:selected.primaryCategory||""});await load();
    }catch(e:any){setError(e?.message||"Could not save supplier transaction.");}
    finally{setSaving(false);}
  }

  if(loading&&!data)return <main className="sa-page sa-loading"><div><span className="sa-spinner"/><strong>Loading Supplier Accounts</strong><small>Calculating advances, deliveries and payables…</small></div></main>;
  if(!projectId)return <main className="sa-page"><div className="sa-shell"><section className="sa-panel"><div className="sa-empty">Open a project from the Control Center first, then choose Supplier Accounts.</div></section></div></main>;

  const summary=data?.summary||{};
  const accounts=data?.accounts||[];
  const recent=(selected?.movements||[]).slice(0,100);
  const modeTitle=mode==="addDelivery"?"Record Delivery":mode==="addAdvanceFund"?"New Fund → Supplier":mode==="addAdvanceCash"?"Project Cash → Supplier":"Direct Purchase";
  return <main className="sa-page"><div className="sa-shell">
    <header className="sa-head"><div><span className="sa-kicker">LAND VIEW · UNIVERSAL SUPPLIER ACCOUNTS</span><h1>{data?.selectedProject?.projectCode} Supplier Control</h1><p>{data?.selectedProject?.projectName} · Every supplier now follows the same Payment → Delivery → Advance / Payable structure.</p></div><div className="sa-head-actions"><button className="sa-btn" onClick={()=>void load()}>↻ Refresh</button><button className="sa-btn" onClick={()=>window.location.assign(`/projectmanagement?projectId=${encodeURIComponent(projectId)}`)}>Finance</button></div></header>
    {error&&<div className="sa-alert error">{error}</div>}{message&&<div className="sa-alert success">{message}</div>}
    <section className="sa-summary">
      <article><span>Supplier Accounts</span><strong>{Number(summary.accountCount||0).toLocaleString("en-BD")}</strong><small>Active suppliers</small></article>
      <article><span>Supplier Payments</span><strong>{money(summary.totalPayments)}</strong><small>Funds / advances paid</small></article>
      <article><span>Received Value</span><strong>{money(summary.totalDeliveredValue)}</strong><small>Materials received</small></article>
      <article><span>Supplier Advance</span><strong>{money(summary.supplierAdvance)}</strong><small>Still held by suppliers</small></article>
      <article><span>Supplier Payable</span><strong>{money(summary.supplierPayable)}</strong><small>Delivered above payments</small></article>
      <article><span>Available Cash</span><strong>{money(summary.cashBalance)}</strong><small>After real cash outflow</small></article>
    </section>

    <div className="sa-grid">
      <section className="sa-panel"><div className="sa-panel-head"><div><span>SUPPLIER ACCOUNTS</span><strong>Advance & delivery position</strong></div><small>{accounts.length} active accounts</small></div><div className="sa-accounts">
        {accounts.map((a:Row)=>{const status=num(a.advance)>0?"advance":num(a.payable)>0?"payable":"settled";return <button key={a.id} className={`sa-account ${String(a.id)===String(selectedId)?"active":""}`} onClick={()=>setSelectedId(String(a.id))}>
          <div className="sa-account-name"><strong>{a.supplierName}</strong><span>{(a.categories||[]).join(" · ")||a.primaryCategory}</span></div>
          <div className="sa-account-stat"><span>Paid</span><strong>{money(a.payments)}</strong></div><div className="sa-account-stat"><span>Received</span><strong>{money(a.deliveredValue)}</strong></div><div className="sa-account-stat"><span>{status==="payable"?"Payable":"Advance"}</span><strong>{money(status==="payable"?a.payable:a.advance)}</strong></div><span className={`sa-account-status ${status}`}>{status==="advance"?"ADVANCE":status==="payable"?"PAYABLE":"SETTLED"}</span>
        </button>})}
        {!accounts.length&&<div className="sa-empty">No supplier accounts are configured for this project.</div>}
      </div></section>

      <section className="sa-panel"><div className="sa-panel-head"><div><span>SUPPLIER TRANSACTION</span><strong>{selected?selected.supplierName:"Select a supplier"}</strong></div><small>{selected?.billingUnit||""}</small></div>{selected&&<div className="sa-detail">
        <div className="sa-detail-title"><div><h2>{modeTitle}</h2><p>Use the correct mode so cash, supplier advance and delivered value stay separate.</p></div><div className="sa-detail-balance"><span>CURRENT {num(selected.payable)>0?"PAYABLE":"ADVANCE"}</span><strong>{money(num(selected.payable)>0?selected.payable:selected.advance)}</strong></div></div>
        {!data?.readOnly&&<><div className="sa-action-tabs"><button className={mode==="addDelivery"?"active":""} onClick={()=>setMode("addDelivery")}>Delivery</button><button className={mode==="addAdvanceFund"?"active":""} onClick={()=>setMode("addAdvanceFund")}>New Fund</button><button className={mode==="addAdvanceCash"?"active":""} onClick={()=>setMode("addAdvanceCash")}>Cash Advance</button><button className={mode==="addDirectPurchase"?"active":""} onClick={()=>setMode("addDirectPurchase")}>Direct Purchase</button></div>
        <div className="sa-form"><label><span>Date</span><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label><label><span>Category</span><input value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/></label>
          <label className="full"><span>Details</span><input value={form.details} onChange={e=>setForm({...form,details:e.target.value})} placeholder="Challan / payment / material details"/></label>
          {(mode==="addDelivery"||mode==="addDirectPurchase")&&<><label><span>Quantity ({selected.billingUnit||"Unit"})</span><input value={form.quantity} inputMode="decimal" onChange={e=>setForm({...form,quantity:e.target.value})}/></label><label><span>Rate</span><input value={form.rate} inputMode="decimal" onChange={e=>setForm({...form,rate:e.target.value})}/></label></>}
          <label><span>{mode==="addDelivery"?"Value (if no Qty × Rate)":"Amount"}</span><input value={form.amount} inputMode="decimal" onChange={e=>setForm({...form,amount:e.target.value})}/></label>
          {mode!=="addDelivery"&&<label><span>Payment Method</span><select value={form.paymentMethod} onChange={e=>setForm({...form,paymentMethod:e.target.value})}><option>Bank Transfer</option><option>Cash</option>{mode==="addAdvanceFund"&&<option>Cheque</option>}</select></label>}
          {mode==="addAdvanceFund"&&<label><span>Received From</span><select value={form.receivedFrom} onChange={e=>setForm({...form,receivedFrom:e.target.value})}><option>Mr. Mahi Bhai</option><option>Scrap Selling</option><option>Mr. Jamaluddin</option></select></label>}
          {mode==="addAdvanceFund"&&form.paymentMethod==="Cheque"&&<label><span>Cheque Status</span><select value={form.chequeStatus} onChange={e=>setForm({...form,chequeStatus:e.target.value})}><option>Cashed</option><option>On Hold</option></select></label>}
          <label className="full"><span>Memo / Reference</span><input value={form.memo} onChange={e=>setForm({...form,memo:e.target.value})} placeholder="Optional reference"/></label>
          <div className="sa-form-preview"><span>{mode==="addDelivery"?"DELIVERY VALUE":"TRANSACTION VALUE"}</span><strong>{money(preview)}</strong></div><div className="sa-form-foot"><button className="sa-btn primary" disabled={saving} onClick={()=>void save()}>{saving?"Saving…":"Save Transaction"}</button></div>
        </div></>}</div>}</section>
    </div>

    {selected&&<section className="sa-panel sa-table-panel"><div className="sa-panel-head"><div><span>ACCOUNT HISTORY</span><strong>{selected.supplierName}</strong></div><small>{selected.movementCount} linked transactions</small></div><div className="sa-table-wrap"><table className="sa-table"><thead><tr><th>Serial</th><th>Date</th><th>Movement</th><th>Details</th><th>Category</th><th className="num">Qty</th><th className="num">Rate</th><th className="num">Amount</th><th>By</th></tr></thead><tbody>
      {recent.map((r:Row)=><tr key={r.id}><td>PM-{String(Math.max(0,Math.trunc(num(r.serialNo)))).padStart(6,"0")}</td><td>{dateText(r.date)}</td><td><span className={`sa-movement ${r.movementType}`}>{String(r.movementType||"").replaceAll("_"," ")}</span></td><td className="details">{r.details}</td><td>{r.category||"—"}</td><td className="num">{r.quantity?num(r.quantity).toLocaleString("en-BD"):"—"}</td><td className="num">{r.rate?money(r.rate):"—"}</td><td className="num"><strong>{money(r.amount)}</strong></td><td>{r.createdBy||"—"}</td></tr>)}
      {!recent.length&&<tr><td colSpan={9} className="sa-empty">No linked supplier transactions yet.</td></tr>}
    </tbody></table></div></section>}
  </div></main>;
}
