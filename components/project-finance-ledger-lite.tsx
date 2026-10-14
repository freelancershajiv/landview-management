"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import ProjectFinanceLiteStyles from "@/components/project-finance-lite-styles";

type Mode = "income" | "expense" | "all";
type EntryKind = "income" | "expense";

const INCOME_CATEGORIES = ["Cash","Cheque","Bank Transfer","Scrap Selling"];
const RECEIVED_FROM = ["Mr. Mahi Bhai","Scrap Selling","Mr. Jamaluddin"];
const ALL_CATEGORIES = ["Cash","Cheque","Bank Transfer","Scrap Selling","Bricks","Brick Chips","Masonry","R.C.C Masonry","Finishing Masonry","Stone","Stone & Sand","Cement","Steel","Cement & Steel","Syleth Sand","Normal Sand","Filling Sand","Filling Soil","Security Salary","Security","Electric Contractor","Electrical Materials","Electrical Material","Plumbing Contractor","Plumbing Materials","Plumbing Material","Tiles","Doors & Wood","Door","SS Grills & Works","Grills","Land View","Other Expenses"];

const num=(v:any)=>{const n=Number(String(v??"").replace(/,/g,"").replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:0};
const money=(v:any)=>new Intl.NumberFormat("en-BD",{style:"currency",currency:"BDT",maximumFractionDigits:2}).format(num(v));
const dateText=(v:any)=>{const s=String(v||"").slice(0,10);const d=new Date(s+"T00:00:00");return Number.isNaN(d.getTime())?s:d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})};
const localDate=()=>{const d=new Date();const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,"0");const day=String(d.getDate()).padStart(2,"0");return `${y}-${m}-${day}`};
const chequeStatus=(r:any)=>/^CHEQUE_STATUS:ON_HOLD/i.test(String(r?.memo||""))?"On Hold":"Cashed";
const userMemo=(r:any)=>String(r?.memo||"").replace(/^CHEQUE_STATUS:(?:ON_HOLD|CASHED)\r?\n?/i,"").trim();
const blank=(kind:EntryKind)=>({entryDate:localDate(),receivedFrom:kind==="income"?"Mr. Mahi Bhai":"",paidTo:kind==="income"?"Eng Shajiv":"",details:"",sft:"",rate:"",amount:"",category:kind==="income"?"Cash":"Other Expenses",chequeStatus:"Cashed",memo:""});

export default function ProjectFinanceLedgerLite({mode}:{mode:Mode}){
  const params=useSearchParams();
  const pathname=usePathname();
  const projectId=String(params.get("projectId")||"").trim();
  const [data,setData]=useState<any>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [search,setSearch]=useState(""),[category,setCategory]=useState("all"),[party,setParty]=useState("all"),[dateFrom,setDateFrom]=useState(""),[dateTo,setDateTo]=useState("");
  const [pageSize,setPageSize]=useState(20),[page,setPage]=useState(1);
  const [modalOpen,setModalOpen]=useState(false),[editing,setEditing]=useState<any>(null),[kind,setKind]=useState<EntryKind>(mode==="expense"?"expense":"income"),[form,setForm]=useState<any>(blank(mode==="expense"?"expense":"income")),[saving,setSaving]=useState(false),[sourceChanged,setSourceChanged]=useState(false);

  async function load(code=projectId){
    setLoading(true);setError("");
    try{
      const url=code?`/api/project-management?projectId=${encodeURIComponent(code)}`:"/api/project-management";
      const r=await fetch(url,{credentials:"same-origin",cache:"no-store"});
      const j=await r.json();
      if(!r.ok||!j?.success)throw new Error(j?.error||"Could not load ledger.");
      setData(j.data);
    }catch(e:any){setError(e?.message||"Could not load ledger.");}
    finally{setLoading(false);}
  }

  useEffect(()=>{void load(projectId)},[projectId]);
  useEffect(()=>{setPage(1)},[search,category,party,dateFrom,dateTo,pageSize,mode]);

  const admin=Boolean(data&&!data.readOnly);
  const entries=Array.isArray(data?.entries)?data.entries:[];
  const baseRows=useMemo(()=>entries.filter((r:any)=>mode==="all"||(mode==="income"?num(r.debit)>0:num(r.credit)>0)).slice().sort((a:any,b:any)=>String(b.entry_date||"").localeCompare(String(a.entry_date||""))||String(b.created_at||"").localeCompare(String(a.created_at||""))||String(b.id||"").localeCompare(String(a.id||""))),[entries,mode]);
  const categories=useMemo(()=>Array.from(new Set<string>(baseRows.map((r:any)=>String(r.category||"Other Expenses").trim()).filter(Boolean))).sort(),[baseRows]);
  const parties=useMemo(()=>Array.from(new Set<string>(baseRows.map((r:any)=>String(mode==="income"?(r.received_from||""):(mode==="expense"?(r.paid_to||r.supplier||""):(r.received_from||r.paid_to||r.supplier||""))).trim()).filter(Boolean))).sort(),[baseRows,mode]);
  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return baseRows.filter((r:any)=>{
      const d=String(r.entry_date||"").slice(0,10);
      const rowParty=String(mode==="income"?(r.received_from||""):(mode==="expense"?(r.paid_to||r.supplier||""):(r.received_from||r.paid_to||r.supplier||""))).trim();
      return (category==="all"||String(r.category||"Other Expenses")===category)&&(party==="all"||rowParty===party)&&(!dateFrom||d>=dateFrom)&&(!dateTo||d<=dateTo)&&(!q||[r.entry_date,r.received_from,r.paid_to,r.supplier,r.details,r.category,r.memo].join(" ").toLowerCase().includes(q));
    });
  },[baseRows,search,category,party,dateFrom,dateTo,mode]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
  const safePage=Math.min(page,totalPages);
  const start=(safePage-1)*pageSize;
  const visible=filtered.slice(start,start+pageSize);
  const totalIncome=filtered.reduce((s:number,r:any)=>s+num(r.debit),0);
  const totalExpense=filtered.reduce((s:number,r:any)=>s+num(r.credit),0);
  const latestCash=entries.length?num(entries[entries.length-1]?.available_cash_balance):0;
  const primaryTotal=mode==="expense"?totalExpense:totalIncome;
  const primaryTotalLabel=mode==="all"?"Filtered Income":category==="all"?(mode==="expense"?"Filtered Expense":"Filtered Income"):`${category} Total`;
  const primaryTotalNote=category==="all"?(mode==="all"?`Expense ${money(totalExpense)}`:"Current filtered total"):`${filtered.length.toLocaleString("en-BD")} matching ${filtered.length===1?"entry":"entries"}`;

  function switchProject(code:string){if(!code)return;window.location.assign(`${pathname}?projectId=${encodeURIComponent(code)}`)}
  function resetFilters(){setSearch("");setCategory("all");setParty("all");setDateFrom("");setDateTo("");}
  function openNew(nextKind:EntryKind){setEditing(null);setKind(nextKind);setForm(blank(nextKind));setSourceChanged(false);setModalOpen(true)}
  function openEdit(row:any){
    const resolved:EntryKind=num(row.debit)>0?"income":"expense";
    setKind(resolved);setEditing(row);setSourceChanged(false);
    setForm({entryDate:String(row.entry_date||"").slice(0,10),receivedFrom:String(row.received_from||""),paidTo:String(row.paid_to||row.supplier||""),details:String(row.details||""),sft:String(row.sft||""),rate:String(row.rate||""),amount:String(resolved==="income"?num(row.debit):num(row.credit)),category:String(row.category||(resolved==="income"?"Cash":"Other Expenses")),chequeStatus:chequeStatus(row),memo:userMemo(row)});
    setModalOpen(true);
  }

  async function save(){
    if(!data?.selectedProject?.projectCode)return;
    if(!form.details.trim()){setError("Details are required.");return;}
    if(num(form.amount)<=0){setError("Enter a positive amount.");return;}
    setSaving(true);setError("");setMessage("");
    try{
      const memo=form.category==="Cheque"?`CHEQUE_STATUS:${form.chequeStatus==="On Hold"?"ON_HOLD":"CASHED"}${String(form.memo||"").trim()?`\n${String(form.memo).trim()}`:""}`:String(form.memo||"");
      const body:any={projectId:data.selectedProject.projectCode,entryDate:form.entryDate,receivedFrom:form.receivedFrom,paidTo:form.paidTo,supplier:form.paidTo,details:form.details,sft:num(form.sft),rate:num(form.rate),debit:kind==="income"?num(form.amount):0,credit:kind==="expense"?num(form.amount):0,category:form.category,memo};
      let url="/api/project-management",method="POST";
      if(editing){url="/api/project-management-safe-edit";method="PUT";body.id=editing.id;body.receivedFromExplicitlyChanged=sourceChanged;}
      const r=await fetch(url,{method,credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const j=await r.json();
      if(!r.ok||!j?.success)throw new Error(j?.error||"Could not save ledger entry.");
      setModalOpen(false);setMessage(`${kind==="income"?"Income":"Expense"} ${editing?"updated":"added"}.`);setEditing(null);await load(data.selectedProject.projectCode);
    }catch(e:any){setError(e?.message||"Could not save ledger entry.");}
    finally{setSaving(false);}
  }

  async function remove(row:any){
    if(!confirm(`Delete this ledger entry?\n\n${row.details||""}`))return;
    setError("");
    try{const r=await fetch(`/api/project-management?id=${encodeURIComponent(row.id)}`,{method:"DELETE",credentials:"same-origin"});const j=await r.json();if(!r.ok||!j?.success)throw new Error(j?.error||"Could not delete ledger entry.");setMessage("Ledger entry deleted.");await load(data.selectedProject.projectCode);}catch(e:any){setError(e?.message||"Could not delete ledger entry.");}
  }

  function exportCsv(){
    const heads=mode==="income"?["Date","Received From","Paid To","Details","Category","Income","Income Running Total"]:mode==="expense"?["Date","Paid To","Details","Category","Quantity","Rate","Expense","Expense Running Total"]:["Date","Party","Details","Category","Income","Expense","Supplier Allocation","Cheque on Hold","Available Cash"];
    const rows=filtered.map((r:any)=>mode==="income"?[r.entry_date,r.received_from,r.paid_to,r.details,r.category,num(r.debit),num(r.income_balance)]:mode==="expense"?[r.entry_date,r.paid_to||r.supplier,r.details,r.category,r.sft,r.rate,num(r.credit),num(r.expense_balance)]:[r.entry_date,r.received_from||r.paid_to||r.supplier,r.details,r.category,num(r.debit),num(r.credit),num(r.supplier_allocation),num(r.cheque_on_hold),num(r.available_cash_balance)]);
    const cell=(v:any)=>`"${String(v??"").replace(/"/g,'""')}"`;const csv=[heads,...rows].map(x=>x.map(cell).join(",")).join("\r\n");const url=URL.createObjectURL(new Blob(["\ufeff",csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=`${data?.selectedProject?.projectCode||"project"}-${mode}-ledger.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  const title=mode==="income"?"Income Ledger":mode==="expense"?"Expense Ledger":"Combined Ledger";
  const note=mode==="income"?"Project receipts and deposits.":mode==="expense"?"Project cash outflow and supplier / contractor payments.":"Income and expenses together in the same clean row style as the individual ledgers.";

  if(loading&&!data)return <><ProjectFinanceLiteStyles/><section className="pfl-page"><div className="pfl-head"><div><span className="pfl-eyebrow">PROJECT FINANCE</span><h2>{title}</h2><p>Loading project ledger…</p></div></div></section></>;

  return <>
    <ProjectFinanceLiteStyles/>
    <section className="pfl-page">
      <div className="pfl-head"><div><span className="pfl-eyebrow">PROJECT FINANCE · {mode.toUpperCase()}</span><h2>{title}</h2><p>{note} Only the selected number of rows are mounted at once for better performance on lower-end computers.</p></div><div className="pfl-head-actions"><button className="pfl-btn" onClick={()=>void load(data?.selectedProject?.projectCode||projectId)}>↻ Refresh</button>{data?.selectedProject&&<button className="pfl-btn" onClick={exportCsv}>Export CSV</button>}{admin&&(mode==="income"||mode==="all")&&<button className="pfl-btn pfl-btn-dark" onClick={()=>openNew("income")}>＋ Add Income</button>}{admin&&(mode==="expense"||mode==="all")&&<button className="pfl-btn pfl-btn-primary" onClick={()=>openNew("expense")}>＋ Add Expense</button>}</div></div>
      <div className="pfl-project-bar"><span>ACTIVE PROJECT</span><select value={data?.selectedProject?.projectCode||""} onChange={e=>switchProject(e.target.value)}><option value="">Select project</option>{(data?.projects||[]).map((p:any)=><option key={p.id||p.projectCode} value={p.projectCode}>{p.projectCode} · {p.projectName}</option>)}</select></div>
      {error&&<div className="pfl-alert error">{error}</div>}{message&&<div className="pfl-alert ok">{message}</div>}
      {data?.selectedProject&&<>
        <div className="pfl-summary"><div><span>Matching Records</span><strong>{filtered.length.toLocaleString("en-BD")}</strong><small>After current filters</small></div><div><span>{primaryTotalLabel}</span><strong>{money(primaryTotal)}</strong><small>{primaryTotalNote}</small></div><div><span>Current Available Cash</span><strong>{money(latestCash)}</strong><small>Latest ledger running cash balance</small></div></div>
        <div className="pfl-filters"><input className="pfl-input pfl-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search details, party, category or memo…"/><select className="pfl-select" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(c=><option key={c}>{c}</option>)}</select><select className="pfl-select" value={party} onChange={e=>setParty(e.target.value)}><option value="all">All parties</option>{parties.map(p=><option key={p}>{p}</option>)}</select><input className="pfl-input" type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/><button className="pfl-btn" onClick={resetFilters}>Clear</button></div>
        <div className="pfl-filters" style={{gridTemplateColumns:"minmax(150px,.6fr) 1fr"}}><input className="pfl-input" type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/><div style={{display:"flex",alignItems:"center",fontSize:10,color:"#7b8b84"}}>Date range is optional. Search and filters apply to all records, while only the selected page is rendered.</div></div>
        <div className="pfl-table-shell"><div className="pfl-table-wrap"><table className="pfl-table"><thead>{mode==="income"?<tr><th>Date</th><th>Received From</th><th>Paid To</th><th>Details</th><th>Category</th><th className="num">Income</th><th className="num">Income Total</th>{admin&&<th/>}</tr>:mode==="expense"?<tr><th>Date</th><th>Paid To</th><th>Details</th><th>Category</th><th className="num">Qty / Rate</th><th className="num">Expense</th><th className="num">Expense Total</th>{admin&&<th/>}</tr>:<tr><th>Date</th><th>Party</th><th>Details</th><th>Category</th><th className="num">Income</th><th className="num">Expense</th><th className="num">Available Cash</th>{admin&&<th/>}</tr>}</thead><tbody>
          {visible.map((r:any)=>{const income=num(r.debit)>0;return <tr key={r.id}><td><span className="pfl-date">{dateText(r.entry_date)}</span></td>{mode==="income"?<><td><span className="pfl-party">{r.received_from||"—"}</span></td><td><span className="pfl-party">{r.paid_to||"—"}</span></td><td><div className="pfl-detail">{r.details}</div></td><td><span className="pfl-category">{r.category||"—"}</span>{String(r.category||"").toLowerCase()==="cheque"&&<div className="pfl-subchips"><span className={`pfl-chip ${chequeStatus(r)==="On Hold"?"warn":""}`}>{chequeStatus(r)}</span></div>}</td><td className="num pfl-money-in">{money(r.debit)}</td><td className="num pfl-balance">{money(r.income_balance)}</td></>:mode==="expense"?<><td><span className="pfl-party">{r.paid_to||r.supplier||"—"}</span></td><td><div className="pfl-detail">{r.details}</div></td><td><span className="pfl-category">{r.category||"—"}</span></td><td className="num">{num(r.sft)?`${num(r.sft).toLocaleString("en-BD")} @ ${money(r.rate)}`:"—"}</td><td className="num pfl-money-out">{money(r.credit)}</td><td className="num pfl-balance">{money(r.expense_balance)}</td></>:<><td><span className="pfl-party"><small>{income?"From":"To"}</small>{income?(r.received_from||"—"):(r.paid_to||r.supplier||"—")}</span></td><td><div className="pfl-detail">{r.details}{(num(r.supplier_allocation)>0||num(r.cheque_on_hold)>0)&&<div className="pfl-subchips">{num(r.supplier_allocation)>0&&<span className="pfl-chip">Supplier allocation {money(r.supplier_allocation)}</span>}{num(r.cheque_on_hold)>0&&<span className="pfl-chip warn">Cheque hold {money(r.cheque_on_hold)}</span>}</div>}</div></td><td><span className="pfl-category">{r.category||"—"}</span></td><td className="num pfl-money-in">{income?money(r.debit):"—"}</td><td className="num pfl-money-out">{!income?money(r.credit):"—"}</td><td className="num pfl-balance">{money(r.available_cash_balance)}</td></>}{admin&&<td><div className="pfl-actions"><button className="pfl-icon" title="Edit" onClick={()=>openEdit(r)}>✎</button><button className="pfl-icon danger" title="Delete" onClick={()=>void remove(r)}>⌫</button></div></td>}</tr>})}
          {!visible.length&&<tr><td className="pfl-empty" colSpan={mode==="all"?(admin?8:7):(admin?8:7)}>No ledger entries match the current filters.</td></tr>}
        </tbody></table></div><div className="pfl-footer"><div className="pfl-footer-left"><span>{filtered.length?`Showing ${start+1}–${Math.min(start+visible.length,filtered.length)} of ${filtered.length}`:"0 records"}</span><label className="pfl-size">Rows <select value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select></label></div><div className="pfl-pages"><button disabled={safePage<=1} onClick={()=>setPage(Math.max(1,safePage-1))}>Previous</button><span>Page {safePage} / {totalPages}</span><button disabled={safePage>=totalPages} onClick={()=>setPage(Math.min(totalPages,safePage+1))}>Next</button></div></div></div>
      </>}
    </section>
    {modalOpen&&<div className="pfl-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setModalOpen(false)}}><div className="pfl-modal"><div className="pfl-modal-head"><div><h3>{editing?"Edit":"Add"} {kind==="income"?"Income":"Expense"}</h3><p>Update the ledger entry without loading the full Project Management page.</p></div><button className="pfl-close" onClick={()=>!saving&&setModalOpen(false)}>×</button></div><div className="pfl-form"><label><span>Date</span><input type="date" value={form.entryDate} onChange={e=>setForm({...form,entryDate:e.target.value})}/></label>{kind==="income"?<label><span>Received From</span><select value={form.receivedFrom} onChange={e=>{setSourceChanged(true);setForm({...form,receivedFrom:e.target.value})}}>{form.receivedFrom&&!RECEIVED_FROM.includes(form.receivedFrom)&&<option value={form.receivedFrom}>{form.receivedFrom} · legacy</option>}{RECEIVED_FROM.map(x=><option key={x}>{x}</option>)}</select></label>:<label><span>Paid To</span><input value={form.paidTo} onChange={e=>setForm({...form,paidTo:e.target.value})}/></label>}{kind==="income"&&<label><span>Paid To</span><input value={form.paidTo} onChange={e=>setForm({...form,paidTo:e.target.value})}/></label>}<label><span>Category</span><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{form.category&&!(kind==="income"?INCOME_CATEGORIES:ALL_CATEGORIES.filter(c=>!INCOME_CATEGORIES.includes(c))).includes(form.category)&&<option>{form.category}</option>}{(kind==="income"?INCOME_CATEGORIES:ALL_CATEGORIES.filter(c=>!INCOME_CATEGORIES.includes(c))).map(c=><option key={c}>{c}</option>)}</select></label><label className="full"><span>Details</span><input value={form.details} onChange={e=>setForm({...form,details:e.target.value})}/></label>{kind==="expense"&&<><label><span>Quantity / SFT</span><input inputMode="decimal" value={form.sft} onChange={e=>setForm({...form,sft:e.target.value})}/></label><label><span>Rate</span><input inputMode="decimal" value={form.rate} onChange={e=>setForm({...form,rate:e.target.value})}/></label></>}<label><span>{kind==="income"?"Income":"Expense"} Amount</span><input inputMode="decimal" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label>{kind==="income"&&form.category==="Cheque"&&<label><span>Cheque Status</span><select value={form.chequeStatus} onChange={e=>setForm({...form,chequeStatus:e.target.value})}><option>Cashed</option><option>On Hold</option></select></label>}<label className="full"><span>Memo</span><textarea value={form.memo} onChange={e=>setForm({...form,memo:e.target.value})}/></label></div><div className="pfl-modal-foot"><button className="pfl-btn" disabled={saving} onClick={()=>setModalOpen(false)}>Cancel</button><button className="pfl-btn pfl-btn-primary" disabled={saving} onClick={()=>void save()}>{saving?"Saving…":"Save Entry"}</button></div></div></div>}
  </>;
}
