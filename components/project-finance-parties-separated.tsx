"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import ProjectFinanceLiteStyles from "@/components/project-finance-lite-styles";

const PARTY_CATEGORIES=["Bricks","Brick Chips","Masonry","R.C.C Masonry","Finishing Masonry","Stone","Stone & Sand","Cement","Steel","Cement & Steel","Syleth Sand","Normal Sand","Filling Sand","Filling Soil","Security","Electric Contractor","Electrical Materials","Electrical Material","Plumbing Contractor","Plumbing Materials","Plumbing Material","Tiles","Doors & Wood","Door","SS Grills & Works","Grills","Other Expenses"];
const num=(v:any)=>{const n=Number(String(v??"").replace(/,/g,"").replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:0};
const money=(v:any)=>new Intl.NumberFormat("en-BD",{style:"currency",currency:"BDT",maximumFractionDigits:2}).format(num(v));
const emptyForm=(partyType:"Supplier"|"Contractor"="Supplier")=>({id:"",name:"",partyType,category:partyType==="Supplier"?"Bricks":"Masonry",billingUnit:"SFT",quantity:"0",rate:"0",notes:""});

export default function ProjectFinancePartiesSeparated(){
  const params=useSearchParams();
  const pathname=usePathname();
  const projectId=String(params.get("projectId")||"").trim();
  const [data,setData]=useState<any>(null),[loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [search,setSearch]=useState(""),[categoryFilter,setCategoryFilter]=useState("all");
  const [modalOpen,setModalOpen]=useState(false),[form,setForm]=useState<any>(emptyForm()),[saving,setSaving]=useState(false);

  async function load(code=projectId){
    setLoading(true);setError("");
    try{
      const r=await fetch(code?`/api/project-management?projectId=${encodeURIComponent(code)}`:"/api/project-management",{credentials:"same-origin",cache:"no-store"});
      const j=await r.json();
      if(!r.ok||!j?.success)throw new Error(j?.error||"Could not load parties.");
      setData(j.data);
    }catch(e:any){setError(e?.message||"Could not load parties.");}
    finally{setLoading(false);}
  }

  useEffect(()=>{void load(projectId)},[projectId]);
  const admin=Boolean(data&&!data.readOnly);
  const rows=Array.isArray(data?.contractorBills?.contracts)?data.contractorBills.contracts:[];
  const categories=useMemo(()=>Array.from(new Set(rows.map((r:any)=>String(r.category||"").trim()).filter(Boolean))).sort(),[rows]);
  const filtered=useMemo(()=>{const q=search.trim().toLowerCase();return rows.filter((r:any)=>(categoryFilter==="all"||String(r.category||"")===categoryFilter)&&(!q||[r.contractor_name,r.party_type,r.category,r.billing_unit,r.notes].join(" ").toLowerCase().includes(q))).sort((a:any,b:any)=>String(a.contractor_name||"").localeCompare(String(b.contractor_name||"")))},[rows,search,categoryFilter]);
  const contractors=filtered.filter((r:any)=>String(r.party_type||"Contractor")!=="Supplier");
  const suppliers=filtered.filter((r:any)=>String(r.party_type||"")==="Supplier");
  const contractorNames=new Set(rows.filter((r:any)=>String(r.party_type||"Contractor")!=="Supplier").map((r:any)=>String(r.contractor_name||"").trim()).filter(Boolean));
  const supplierNames=new Set(rows.filter((r:any)=>String(r.party_type||"")==="Supplier").map((r:any)=>String(r.contractor_name||"").trim()).filter(Boolean));

  function switchProject(code:string){if(code)window.location.assign(`${pathname}?projectId=${encodeURIComponent(code)}`)}
  function openAdd(partyType:"Supplier"|"Contractor"){setForm(emptyForm(partyType));setModalOpen(true)}
  function openEdit(row:any){setForm({id:String(row.id||""),name:String(row.contractor_name||""),partyType:String(row.party_type||"Contractor"),category:String(row.category||"Other Expenses"),billingUnit:String(row.billing_unit||"SFT"),quantity:String(row.contract_quantity||0),rate:String(row.agreed_rate||0),notes:String(row.notes||"")});setModalOpen(true)}

  async function save(){
    if(!data?.selectedProject?.projectCode)return;
    if(!form.name.trim()){setError("Party name is required.");return;}
    setSaving(true);setError("");setMessage("");
    try{
      const r=await fetch("/api/project-management",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"saveContractorContract",projectId:data.selectedProject.projectCode,id:form.id||undefined,contractorName:form.name,partyType:form.partyType,category:form.category,billingUnit:form.billingUnit||"SFT",contractQuantity:num(form.quantity),agreedRate:num(form.rate),notes:form.notes||""})});
      const j=await r.json();
      if(!r.ok||!j?.success)throw new Error(j?.error||"Could not save party.");
      setModalOpen(false);setMessage(form.id?`${form.partyType} updated successfully.`:`${form.partyType} added successfully.`);await load(data.selectedProject.projectCode);
    }catch(e:any){setError(e?.message||"Could not save party.");}
    finally{setSaving(false);}
  }

  async function remove(row:any){
    if(!confirm(`Remove “${row.contractor_name}” from the active ${String(row.party_type||"party").toLowerCase()} list?\n\nExisting ledger payments and bills will remain intact.`))return;
    setError("");
    try{
      const r=await fetch("/api/project-management",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"removeContractorContract",projectId:data.selectedProject.projectCode,id:row.id})});
      const j=await r.json();
      if(!r.ok||!j?.success)throw new Error(j?.error||"Could not remove party.");
      setMessage(`${row.party_type||"Party"} removed from the active list.`);await load(data.selectedProject.projectCode);
    }catch(e:any){setError(e?.message||"Could not remove party.");}
  }

  const table=(list:any[],type:"Contractor"|"Supplier")=><div className="pfl-table-shell" style={{marginTop:12}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,padding:"14px 16px",borderBottom:"1px solid #e7eeeb",background:"#fbfdfc"}}><div><span className="pfl-eyebrow">{type.toUpperCase()}S</span><div style={{fontSize:16,fontWeight:800,color:"#263b34",marginTop:3}}>{type}s</div></div>{admin&&<button className={type==="Contractor"?"pfl-btn pfl-btn-dark":"pfl-btn pfl-btn-primary"} onClick={()=>openAdd(type)}>＋ Add {type}</button>}</div><div className="pfl-table-wrap"><table className="pfl-table pfl-party-table"><thead><tr><th>{type} Name</th><th>Category</th><th>Unit</th><th className="num">Contract Qty</th><th className="num">Rate</th><th>Notes</th>{admin&&<th/>}</tr></thead><tbody>{list.map((r:any)=><tr key={r.id}><td className="pfl-name">{r.contractor_name}</td><td><span className="pfl-category">{r.category||"—"}</span></td><td>{r.billing_unit||"SFT"}</td><td className="num">{num(r.contract_quantity)?num(r.contract_quantity).toLocaleString("en-BD"):"—"}</td><td className="num">{num(r.agreed_rate)?money(r.agreed_rate):"—"}</td><td><div className="pfl-note">{r.notes||"—"}</div></td>{admin&&<td><div className="pfl-actions"><button className="pfl-btn" onClick={()=>openEdit(r)}>Edit</button><button className="pfl-btn pfl-btn-danger" onClick={()=>void remove(r)}>Remove</button></div></td>}</tr>)}{!list.length&&<tr><td className="pfl-empty" colSpan={admin?7:6}>No {type.toLowerCase()}s match the current filters.</td></tr>}</tbody></table></div></div>;

  if(loading&&!data)return <><ProjectFinanceLiteStyles/><section className="pfl-page"><div className="pfl-head"><div><span className="pfl-eyebrow">PROJECT FINANCE</span><h2>Parties</h2><p>Loading contractors and suppliers…</p></div></div></section></>;

  return <><ProjectFinanceLiteStyles/><section className="pfl-page"><div className="pfl-head"><div><span className="pfl-eyebrow">PROJECT FINANCE · PARTIES</span><h2>Contractors & Suppliers</h2><p>Contractors and Suppliers are kept as two separate party groups. Unassigned / other project expenses are recorded under Eng Shajiv instead of creating placeholder parties.</p></div><div className="pfl-head-actions"><button className="pfl-btn" onClick={()=>void load(data?.selectedProject?.projectCode||projectId)}>↻ Refresh</button></div></div><div className="pfl-project-bar"><span>ACTIVE PROJECT</span><select value={data?.selectedProject?.projectCode||""} onChange={e=>switchProject(e.target.value)}><option value="">Select project</option>{(data?.projects||[]).map((p:any)=><option key={p.id||p.projectCode} value={p.projectCode}>{p.projectCode} · {p.projectName}</option>)}</select></div>{error&&<div className="pfl-alert error">{error}</div>}{message&&<div className="pfl-alert ok">{message}</div>}{data?.selectedProject&&<><div className="pfl-summary"><div><span>Contractors</span><strong>{contractorNames.size.toLocaleString("en-BD")}</strong><small>Separate contractor group</small></div><div><span>Suppliers</span><strong>{supplierNames.size.toLocaleString("en-BD")}</strong><small>Separate supplier group</small></div><div><span>Unassigned / Other</span><strong>Eng Shajiv</strong><small>Default expense payee</small></div></div><div className="pfl-filters" style={{gridTemplateColumns:"minmax(260px,1.4fr) minmax(180px,.8fr) auto"}}><input className="pfl-input pfl-search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search contractor or supplier…"/><select className="pfl-select" value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="all">All categories</option>{categories.map((c:any)=><option key={c}>{c}</option>)}</select><button className="pfl-btn" onClick={()=>{setSearch("");setCategoryFilter("all")}}>Clear</button></div>{table(contractors,"Contractor")}{table(suppliers,"Supplier")}</>}</section>{modalOpen&&<div className="pfl-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setModalOpen(false)}}><div className="pfl-modal"><div className="pfl-modal-head"><div><h3>{form.id?"Edit":"Add"} {form.partyType}</h3><p>Contractors and Suppliers remain separate party types.</p></div><button className="pfl-close" onClick={()=>!saving&&setModalOpen(false)}>×</button></div><div className="pfl-form"><label className="full"><span>{form.partyType} Name</span><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label><span>Party Type</span><select value={form.partyType} onChange={e=>setForm({...form,partyType:e.target.value})}><option>Contractor</option><option>Supplier</option></select></label><label><span>Category</span><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{form.category&&!PARTY_CATEGORIES.includes(form.category)&&<option>{form.category}</option>}{PARTY_CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label><label><span>Billing Unit</span><input value={form.billingUnit} onChange={e=>setForm({...form,billingUnit:e.target.value})}/></label><label><span>Contract Quantity</span><input inputMode="decimal" value={form.quantity} onChange={e=>setForm({...form,quantity:e.target.value})}/></label><label><span>Agreed Rate</span><input inputMode="decimal" value={form.rate} onChange={e=>setForm({...form,rate:e.target.value})}/></label><label className="full"><span>Notes</span><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label></div><div className="pfl-modal-foot"><button className="pfl-btn" disabled={saving} onClick={()=>setModalOpen(false)}>Cancel</button><button className="pfl-btn pfl-btn-primary" disabled={saving} onClick={()=>void save()}>{saving?"Saving…":"Save"}</button></div></div></div>}</>;
}
