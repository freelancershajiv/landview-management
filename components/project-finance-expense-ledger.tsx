"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import ProjectFinanceLiteStyles from "@/components/project-finance-lite-styles";

const BASE_CATEGORIES = [
  "Bricks","Brick Chips","Masonry","R.C.C Masonry","Finishing Masonry",
  "Stone","Stone & Sand","Cement","Steel","Cement & Steel","Syleth Sand",
  "Normal Sand","Filling Sand","Filling Soil","Security Salary","Security",
  "Electric Contractor","Electrical Materials","Plumbing Contractor","Plumbing Materials",
  "Tiles","Doors & Wood","Door","SS Grills & Works","Grills","Land View","Other Expenses"
];

const num=(v:any)=>{const n=Number(String(v??"").replace(/,/g,"").replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:0};
const money=(v:any)=>new Intl.NumberFormat("en-BD",{style:"currency",currency:"BDT",maximumFractionDigits:2}).format(num(v));
const dateText=(v:any)=>{const s=String(v||"").slice(0,10);const d=new Date(s+"T00:00:00");return Number.isNaN(d.getTime())?s:d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})};
const localDate=()=>{const d=new Date();const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,"0");const day=String(d.getDate()).padStart(2,"0");return `${y}-${m}-${day}`};
const blank=()=>({entryDate:localDate(),paidTo:"",details:"",sft:"",rate:"",amount:"",category:"Other Expenses",memo:""});
const isAdvance=(r:any)=>num(r?.supplier_allocation)>0;
const expenseAmount=(r:any)=>isAdvance(r)?num(r.supplier_allocation):num(r.credit);
const expenseCategory=(r:any)=>isAdvance(r)?"Supplier Advance":String(r.category||"Other Expenses").trim();
function expenseParty(r:any){
  if(isAdvance(r)){
    const explicit=String(r?.supplier_allocation_party||"").trim();
    if(explicit)return explicit;
    const text=String(r?.details||"").toLowerCase();
    if(text.includes("sattapur"))return "Sattapur Brick Field";
    const party=String(r?.supplier||r?.paid_to||"").trim();
    return party&&party.toLowerCase()!=="eng shajiv"?party:"Supplier Advance";
  }
  return String(r?.paid_to||r?.supplier||"").trim();
}

export default function ProjectFinanceExpenseLedger(){
  const params=useSearchParams();
  const pathname=usePathname();
  const projectId=String(params.get("projectId")||"").trim();
  const [data,setData]=useState<any>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [search,setSearch]=useState(""),[category,setCategory]=useState("all"),[party,setParty]=useState("all"),[dateFrom,setDateFrom]=useState(""),[dateTo,setDateTo]=useState("");
  const [pageSize,setPageSize]=useState(20),[page,setPage]=useState(1);
  const [modalOpen,setModalOpen]=useState(false),[editing,setEditing]=useState<any>(null),[form,setForm]=useState<any>(blank()),[saving,setSaving]=useState(false);

  async function load(code=projectId){
    setLoading(true);setError("");
    try{
      const url=code?`/api/project-management?projectId=${encodeURIComponent(code)}`:"/api/project-management";
      const r=await fetch(url,{credentials:"same-origin",cache:"no-store"});
      const j=await r.json();
      if(!r.ok||!j?.success)throw new Error(j?.error||"Could not load expense ledger.");
      setData(j.data);
    }catch(e:any){setError(e?.message||"Could not load expense ledger.");}
    finally{setLoading(false);}
  }

  useEffect(()=>{void load(projectId)},[projectId]);
  useEffect(()=>{setPage(1)},[search,category,party,dateFrom,dateTo,pageSize]);

  const admin=Boolean(data&&!data.readOnly);
  const entries=Array.isArray(data?.entries)?data.entries:[];
  const rows=useMemo(()=>entries
    .filter((r:any)=>num(r.credit)>0||isAdvance(r))
    .slice()
    .sort((a:any,b:any)=>String(b.entry_date||"").localeCompare(String(a.entry_date||""))||String(b.created_at||"").localeCompare(String(a.created_at||""))||String(b.id||"").localeCompare(String(a.id||""))),[entries]);
  const categories=useMemo(()=>Array.from(new Set<string>(rows.map((r:any)=>expenseCategory(r)).filter(Boolean))).sort((a,b)=>a.localeCompare(b)),[rows]);
  const parties=useMemo(()=>Array.from(new Set<string>(rows.map((r:any)=>expenseParty(r)).filter(Boolean))).sort((a,b)=>a.localeCompare(b)),[rows]);
  const formCategories=useMemo(()=>Array.from(new Set<string>([
    ...BASE_CATEGORIES,
    ...entries.filter((r:any)=>num(r.credit)>0).map((r:any)=>String(r.category||"").trim()).filter(Boolean)
  ])).sort((a,b)=>a.localeCompare(b)),[entries]);
  const filtered=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return rows.filter((r:any)=>{
      const d=String(r.entry_date||"").slice(0,10);
      const rowCategory=expenseCategory(r);
      const rowParty=expenseParty(r);
      return (category==="all"||rowCategory===category)
        &&(party==="all"||rowParty===party)
        &&(!dateFrom||d>=dateFrom)
        &&(!dateTo||d<=dateTo)
        &&(!q||[r.entry_date,rowParty,r.details,rowCategory,r.memo].join(" ").toLowerCase().includes(q));
    });
  },[rows,search,category,party,dateFrom,dateTo]);

  const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
  const safePage=Math.min(page,totalPages);
  const start=(safePage-1)*pageSize;
  const visible=filtered.slice(start,start+pageSize);
  const totalExpense=filtered.reduce((s:number,r:any)=>s+expenseAmount(r),0);
  const latestCash=entries.length?num(entries[entries.length-1]?.available_cash_balance):0;
  const totalLabel=category==="all"?"Filtered Expense":`${category} Total`;
  const supplierAdvanceTotal=rows.filter(isAdvance).reduce((s:number,r:any)=>s+expenseAmount(r),0);

  function switchProject(code:string){if(code)window.location.assign(`${pathname}?projectId=${encodeURIComponent(code)}`)}
  function resetFilters(){setSearch("");setCategory("all");setParty("all");setDateFrom("");setDateTo("");}
  function openNew(){setEditing(null);setForm(blank());setModalOpen(true)}
  function openEdit(row:any){
    if(isAdvance(row))return;
    setEditing(row);
    setForm({entryDate:String(row.entry_date||"").slice(0,10),paidTo:String(row.paid_to||row.supplier||""),details:String(row.details||""),sft:String(row.sft||""),rate:String(row.rate||""),amount:String(num(row.credit)),category:String(row.category||"Other Expenses"),memo:String(row.memo||"")});
    setModalOpen(true);
  }

  async function save(){
    if(!data?.selectedProject?.projectCode)return;
    if(!form.details.trim()){setError("Details are required.");return;}
    if(num(form.amount)<=0){setError("Enter a positive amount.");return;}
    setSaving(true);setError("");setMessage("");
    try{
      const body:any={projectId:data.selectedProject.projectCode,entryDate:form.entryDate,receivedFrom:"",paidTo:form.paidTo,supplier:form.paidTo,details:form.details,sft:num(form.sft),rate:num(form.rate),debit:0,credit:num(form.amount),category:form.category,memo:String(form.memo||"")};
      let url="/api/project-management",method="POST";
      if(editing){url="/api/project-management-safe-edit";method="PUT";body.id=editing.id;body.receivedFromExplicitlyChanged=false;}
      const r=await fetch(url,{method,credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const j=await r.json();
      if(!r.ok||!j?.success)throw new Error(j?.error||"Could not save expense entry.");
      setModalOpen(false);setEditing(null);setMessage(`Expense ${editing?"updated":"added"}.`);await load(data.selectedProject.projectCode);
    }catch(e:any){setError(e?.message||"Could not save expense entry.");}
    finally{setSaving(false);}
  }

  async function remove(row:any){
    if(isAdvance(row))return;
    if(!confirm(`Delete this ledger entry?\n\n${row.details||""}`))return;
    setError("");
    try{
      const r=await fetch(`/api/project-management?id=${encodeURIComponent(row.id)}`,{method:"DELETE",credentials:"same-origin"});
      const j=await r.json();
      if(!r.ok||!j?.success)throw new Error(j?.error||"Could not delete ledger entry.");
      setMessage("Ledger entry deleted.");await load(data.selectedProject.projectCode);
    }catch(e:any){setError(e?.message||"Could not delete ledger entry.");}
  }

  function exportCsv(){
    const heads=["Date","Paid To","Details","Category","Quantity","Rate","Expense","Balance"];
    const out=filtered.map((r:any)=>[r.entry_date,expenseParty(r),r.details,expenseCategory(r),isAdvance(r)?"":r.sft,isAdvance(r)?"":r.rate,expenseAmount(r),num(r.available_cash_balance)]);
    const cell=(v:any)=>`"${String(v??"").replace(/"/g,'""')}"`;
    const csv=[heads,...out].map(x=>x.map(cell).join(",")).join("\r\n");
    const url=URL.createObjectURL(new Blob(["\ufeff",csv],{type:"text/csv;charset=utf-8"}));
    const a=document.createElement("a");a.href=url;a.download=`${data?.selectedProject?.projectCode||"project"}-expense-ledger.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  if(loading&&!data)return <><ProjectFinanceLiteStyles/><section className="pfl-page"><div className="pfl-head"><div><span className="pfl-eyebrow">PROJECT FINANCE</span><h2>Expense Ledger</h2><p>Loading project expenses…</p></div></div></section></>;

  return <>
    <ProjectFinanceLiteStyles/>
    <section className="pfl-page">
      <div className="pfl-head"><div><span className="pfl-eyebrow">PROJECT FINANCE · EXPENSE</span><h2>Expense Ledger</h2><p>Project cash outflow, supplier advances, supplier payments and contractor payments.</p></div><div className="pfl-head-actions"><button className="pfl-btn" onClick={()=>void load(data?.selectedProject?.projectCode||projectId)}>↻ Refresh</button>{data?.selectedProject&&<button className="pfl-btn" onClick={exportCsv}>Export CSV</button>}{admin&&<button className="pfl-btn pfl-btn-primary" onClick={openNew}>＋ Add Expense</button>}</div></div>
      <div className="pfl-project-bar"><span>ACTIVE PROJECT</span><select value={data?.selectedProject?.projectCode||""} onChange={e=>switchProject(e.target.value)}><option value="">Select project</option>{(data?.projects||[]).map((p:any)=><option key={p.id||p.projectCode} value={p.projectCode}>{p.projectCode} · {p.projectName}</option>)}</select></div>
      {error&&<div className="pfl-alert error">{error}</div>}{message&&<div className="pfl-alert ok">{message}</div>}
      {data?.selectedProject&&<>
        <div className="pfl-summary"><div><span>Matching Records</span><strong>{filtered.length.toLocaleString("en-BD")}</strong><small>Cash expenses + supplier advances</small></div><div><span>{totalLabel}</span><strong>{money(totalExpense)}</strong><small>{category==="all"?`Supplier advances ${money(supplierAdvanceTotal)}`:`${filtered.length.toLocaleString("en-BD")} matching ${filtered.length===1?"entry":"entries"}`}</small></div><div><span>Current Available Cash</span><strong>{money(latestCash)}</strong><small>After supplier allocation and cheque holds</small></div></div>
        <div className="pfl-filters"><input className="pfl-input pfl-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search details, party or category…"/><select className="pfl-select" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">All categories</option>{categories.map(c=><option key={c}>{c}</option>)}</select><select className="pfl-select" value={party} onChange={e=>setParty(e.target.value)}><option value="all">All parties</option>{parties.map(p=><option key={p}>{p}</option>)}</select><input className="pfl-input" type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/><button className="pfl-btn" onClick={resetFilters}>Clear</button></div>
        <div className="pfl-filters" style={{gridTemplateColumns:"minmax(150px,.6fr) 1fr"}}><input className="pfl-input" type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/><div style={{display:"flex",alignItems:"center",fontSize:10,color:"#7b8b84"}}>Supplier advances are shown as expense outflows but remain linked to their original funding receipts.</div></div>
        {category!=="all"&&<div style={{margin:"0 0 14px",padding:"14px 16px",border:"1px solid #b8dec9",borderRadius:14,background:"#f3fbf6",display:"flex",justifyContent:"space-between",alignItems:"center",gap:16,flexWrap:"wrap"}}><div><div style={{fontSize:10,fontWeight:800,letterSpacing:".08em",textTransform:"uppercase",color:"#5d756a"}}>Selected Category</div><div style={{fontSize:15,fontWeight:800,color:"#263b34",marginTop:3}}>{category} · {filtered.length.toLocaleString("en-BD")} {filtered.length===1?"entry":"entries"}</div></div><strong style={{fontSize:22,color:"#176b45"}}>{money(totalExpense)}</strong></div>}
        <div className="pfl-table-shell"><div className="pfl-table-wrap"><table className="pfl-table"><thead><tr><th>Date</th><th>Paid To</th><th>Details</th><th>Category</th><th className="num">Qty / Rate</th><th className="num">Expense</th><th className="num">Balance</th>{admin&&<th/>}</tr></thead><tbody>
          {visible.map((r:any)=><tr key={`${r.id}-${isAdvance(r)?"advance":"expense"}`}><td><span className="pfl-date">{dateText(r.entry_date)}</span></td><td><span className="pfl-party">{expenseParty(r)||"—"}</span></td><td><div className="pfl-detail">{r.details}{isAdvance(r)&&<div className="pfl-subchips"><span className="pfl-chip">Supplier allocation</span></div>}</div></td><td><span className="pfl-category">{expenseCategory(r)}</span></td><td className="num">{isAdvance(r)?"—":num(r.sft)?`${num(r.sft).toLocaleString("en-BD")} @ ${money(r.rate)}`:"—"}</td><td className="num pfl-money-out">{money(expenseAmount(r))}</td><td className="num pfl-balance">{money(r.available_cash_balance)}</td>{admin&&<td>{isAdvance(r)?<span className="pfl-chip">Linked</span>:<div className="pfl-actions"><button className="pfl-icon" title="Edit" onClick={()=>openEdit(r)}>✎</button><button className="pfl-icon danger" title="Delete" onClick={()=>void remove(r)}>⌫</button></div>}</td>}</tr>)}
          {!visible.length&&<tr><td className="pfl-empty" colSpan={admin?8:7}>No expense entries match the current filters.</td></tr>}
        </tbody></table></div><div className="pfl-footer"><div className="pfl-footer-left"><span>{filtered.length?`Showing ${start+1}–${Math.min(start+visible.length,filtered.length)} of ${filtered.length}`:"0 records"}</span><label className="pfl-size">Rows <select value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select></label></div><div className="pfl-pages"><button disabled={safePage<=1} onClick={()=>setPage(Math.max(1,safePage-1))}>Previous</button><span>Page {safePage} / {totalPages}</span><button disabled={safePage>=totalPages} onClick={()=>setPage(Math.min(totalPages,safePage+1))}>Next</button></div></div></div>
      </>}
    </section>
    {modalOpen&&<div className="pfl-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setModalOpen(false)}}><div className="pfl-modal"><div className="pfl-modal-head"><div><h3>{editing?"Edit":"Add"} Expense</h3><p>Supplier advances are linked automatically and are not edited here.</p></div><button className="pfl-close" onClick={()=>!saving&&setModalOpen(false)}>×</button></div><div className="pfl-form"><label><span>Date</span><input type="date" value={form.entryDate} onChange={e=>setForm({...form,entryDate:e.target.value})}/></label><label><span>Paid To</span><input value={form.paidTo} onChange={e=>setForm({...form,paidTo:e.target.value})}/></label><label><span>Category</span><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{form.category&&!formCategories.includes(form.category)&&<option>{form.category}</option>}{formCategories.map(c=><option key={c}>{c}</option>)}</select></label><label className="full"><span>Details</span><input value={form.details} onChange={e=>setForm({...form,details:e.target.value})}/></label><label><span>Quantity / SFT</span><input inputMode="decimal" value={form.sft} onChange={e=>setForm({...form,sft:e.target.value})}/></label><label><span>Rate</span><input inputMode="decimal" value={form.rate} onChange={e=>setForm({...form,rate:e.target.value})}/></label><label><span>Expense Amount</span><input inputMode="decimal" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label><label className="full"><span>Memo</span><textarea value={form.memo} onChange={e=>setForm({...form,memo:e.target.value})}/></label></div><div className="pfl-modal-foot"><button className="pfl-btn" disabled={saving} onClick={()=>setModalOpen(false)}>Cancel</button><button className="pfl-btn pfl-btn-primary" disabled={saving} onClick={()=>void save()}>{saving?"Saving…":"Save Entry"}</button></div></div></div>}
  </>;
}
