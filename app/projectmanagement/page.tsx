"use client";

import { useEffect, useMemo, useState } from "react";

const CATEGORIES = ["Cash","Bricks","Masonry","Stone & Sand","Cement & Steel","Security","Other Expenses","Electric Contractor","Electrical Material","Plumbing Contractor","Plumbing Material","Tiles","Door","Grills"];
const money=(v:any)=>new Intl.NumberFormat("en-BD",{style:"currency",currency:"BDT",maximumFractionDigits:2}).format(Number(v||0));
const num=(v:any)=>{const n=Number(String(v??"").replace(/,/g,"").replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:0};
const dateText=(v:any)=>{const d=new Date(String(v||"").slice(0,10)+"T00:00:00");return Number.isNaN(d.getTime())?String(v||""):d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})};
const card:any={background:"#131d25",border:"1px solid #2b3942",borderRadius:14,padding:18};
const blank=()=>({entryDate:new Date().toISOString().slice(0,10),details:"",sft:"",rate:"",debit:"",credit:"",category:"Other Expenses",memo:""});

export default function ProjectManagementPage(){
  const [data,setData]=useState<any>(null),[project,setProject]=useState(""),[loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [tab,setTab]=useState("Summary"),[search,setSearch]=useState(""),[masterOpen,setMasterOpen]=useState(false),[masterSearch,setMasterSearch]=useState(""),[pullCategory,setPullCategory]=useState("Other Expenses"),[pulling,setPulling]=useState("");
  const [form,setForm]=useState<any>(blank()),[editing,setEditing]=useState<any>(null),[formOpen,setFormOpen]=useState(false),[saving,setSaving]=useState(false);

  async function load(code=project){
    setLoading(true);setError("");
    try{
      const r=await fetch(code?"/api/project-management?projectId="+encodeURIComponent(code):"/api/project-management",{credentials:"same-origin",cache:"no-store"});
      const j=await r.json(); if(!r.ok||!j?.success)throw new Error(j?.error||"Could not load Project Management.");
      setData(j.data); if(j.data?.selectedProject?.projectCode)setProject(j.data.selectedProject.projectCode);
    }catch(e:any){setError(e?.message||"Could not load Project Management.");}finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);

  const admin=Boolean(data&&!data.readOnly);
  const entries=data?.entries||[];
  const filtered=useMemo(()=>{const q=search.trim().toLowerCase();return entries.filter((r:any)=>(tab==="Summary"||String(r.category||"Other Expenses")===tab)&&(!q||[r.details,r.category,r.memo,r.entry_date].join(" ").toLowerCase().includes(q)));},[entries,tab,search]);
  const categoryTotals=useMemo(()=>{const x:any={};for(const c of CATEGORIES)x[c]=entries.filter((r:any)=>String(r.category||"Other Expenses")===c).reduce((s:number,r:any)=>s+num(r.credit||r.debit),0);return x;},[entries]);
  const masterRows=useMemo(()=>{const q=masterSearch.trim().toLowerCase();return (data?.masterLedger||[]).filter((r:any)=>!q||[r.sourceCode,r.details,r.masterCategory,r.suggestedCategory,r.entryDate].join(" ").toLowerCase().includes(q));},[data,masterSearch]);

  function openNew(){setEditing(null);setForm(blank());setFormOpen(true);}
  function openEdit(r:any){setEditing(r);setForm({entryDate:String(r.entry_date||"").slice(0,10),details:r.details||"",sft:r.sft||"",rate:r.rate||"",debit:r.debit||"",credit:r.credit||"",category:r.category||"Other Expenses",memo:r.memo||""});setFormOpen(true);}
  async function save(){
    if(!data?.selectedProject)return;
    setSaving(true);setError("");
    try{
      const body={projectId:data.selectedProject.projectCode,entryDate:form.entryDate,details:form.details,sft:num(form.sft),rate:num(form.rate),debit:num(form.debit),credit:num(form.credit),category:form.category,memo:form.memo};
      if(!form.details.trim())throw new Error("Details are required.");
      if((body.debit>0)===(body.credit>0))throw new Error("Enter either Debit or Credit.");
      const r=await fetch("/api/project-management",{method:editing?"PUT":"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(editing?{...body,id:editing.id}:body)});
      const j=await r.json();if(!r.ok||!j?.success)throw new Error(j?.error||"Could not save entry.");
      setFormOpen(false);setEditing(null);setMessage(editing?"Expense updated.":"Expense added.");await load(data.selectedProject.projectCode);
    }catch(e:any){setError(e?.message||"Could not save entry.");}finally{setSaving(false);}
  }
  async function remove(r:any){
    if(!confirm("Delete this entry?\n\n"+r.details))return;
    try{const x=await fetch("/api/project-management?id="+encodeURIComponent(r.id),{method:"DELETE",credentials:"same-origin"}),j=await x.json();if(!x.ok||!j?.success)throw new Error(j?.error||"Could not delete entry.");setMessage("Entry deleted.");await load(data?.selectedProject?.projectCode||project);}catch(e:any){setError(e?.message||"Could not delete entry.");}
  }
  async function pull(r:any){
    const id=r.sourceType+":"+r.sourceId;setPulling(id);setError("");
    try{
      const x=await fetch("/api/project-management",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"pullMaster",projectId:data?.selectedProject?.projectCode,sourceType:r.sourceType,sourceId:r.sourceId,category:pullCategory})});
      const j=await x.json();if(!x.ok||!j?.success)throw new Error(j?.error||"Could not pull master ledger entry.");
      setMessage("Pulled "+r.sourceCode+" into "+pullCategory+".");await load(data?.selectedProject?.projectCode||project);
    }catch(e:any){setError(e?.message||"Could not pull master ledger entry.");}finally{setPulling("");}
  }

  if(loading&&!data)return <main style={{minHeight:"100vh",padding:40,background:"#0b1116",color:"#fff"}}>Loading Project Management…</main>;

  return <main style={{minHeight:"100vh",padding:"32px 4vw 60px",background:"#0b1116",color:"#eef3f5"}}>
    <div style={{maxWidth:1500,margin:"0 auto"}}>
      <header style={{display:"flex",justifyContent:"space-between",gap:20,alignItems:"flex-end",flexWrap:"wrap",marginBottom:20}}>
        <div><div style={{fontSize:11,letterSpacing:".16em",fontWeight:900,color:"#ff8179"}}>LAND VIEW • PROJECT MANAGEMENT</div><h1 style={{fontSize:"clamp(30px,4vw,46px)",margin:"8px 0"}}>Project Expense Management</h1><p style={{color:"#9eabb3",maxWidth:850}}>Separate the project into construction expense tabs and pull existing project debit/expense records from the Master Ledger.</p></div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button onClick={()=>void load(project)}>Refresh</button>{admin&&<><button onClick={openNew}>+ Add Expense</button><button onClick={()=>setMasterOpen(true)}>Pull from Master Ledger</button></>}</div>
      </header>
      {error&&<div style={{...card,marginBottom:12,color:"#ffb6b3",background:"#3a1e20"}}>{error}</div>}
      {message&&<div style={{...card,marginBottom:12,color:"#a9e3c1",background:"#173426"}}>{message}</div>}
      <section style={{...card,display:"flex",gap:18,alignItems:"flex-end",flexWrap:"wrap",marginBottom:16}}>
        <div><label>PROJECT</label><br/><select value={data?.selectedProject?.projectCode||project} onChange={e=>{setProject(e.target.value);void load(e.target.value)}} style={{minWidth:360,padding:10,background:"#0b1218",color:"#fff"}}>{(data?.projects||[]).map((p:any)=><option key={p.id} value={p.projectCode}>{p.projectCode+" — "+(p.clientName||p.projectName)}</option>)}</select></div>
        {data?.selectedProject&&<div><strong>{data.selectedProject.projectName}</strong><div style={{color:"#8e9aa2",fontSize:13}}>{data.selectedProject.location||"Location not recorded"} • {data.selectedProject.status||"Active"}</div></div>}
      </section>
      <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12,marginBottom:16}}>
        <div style={card}><small>Total Debit</small><h2>{money(data?.totals?.debit)}</h2></div><div style={card}><small>Total Credit / Expense</small><h2>{money(data?.totals?.credit)}</h2></div><div style={card}><small>Balance</small><h2>{money(data?.totals?.balance)}</h2></div><div style={card}><small>Entries</small><h2>{entries.length}</h2></div>
      </section>
      <section style={{...card,marginBottom:16,padding:12}}><div style={{display:"flex",gap:7,flexWrap:"wrap"}}>{["Summary",...CATEGORIES].map(c=><button key={c} onClick={()=>setTab(c)} style={{padding:"9px 12px",background:tab===c?"#ff8179":"#18232c",color:tab===c?"#17110f":"#fff"}}>{c}{c!=="Summary"&&<span style={{marginLeft:6,opacity:.7}}>{money(categoryTotals[c]||0)}</span>}</button>)}</div></section>
      <section style={{...card,padding:0,overflow:"hidden"}}>
        <div style={{padding:16,borderBottom:"1px solid #2b3942",display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><h2 style={{margin:0}}>{tab}</h2><small style={{color:"#74828a"}}>{filtered.length} entries</small></div><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{padding:10,background:"#0b1218",color:"#fff"}}/></div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",minWidth:980,borderCollapse:"collapse"}}><thead><tr>{["Date","Details","Category","SFT","Rate","Debit","Credit","Balance"].map(h=><th key={h} style={{padding:10,textAlign:h==="Details"||h==="Category"?"left":"right"}}>{h}</th>)}{admin&&<th/>}</tr></thead><tbody>{filtered.map((r:any)=><tr key={r.id}><td style={{padding:10}}>{dateText(r.entry_date)}</td><td style={{padding:10}}><strong>{r.details}</strong>{r.memo&&String(r.memo).startsWith("MASTER_LEDGER:")&&<small style={{display:"block",color:"#77868f"}}>Pulled from Master Ledger</small>}</td><td style={{padding:10}}>{r.category||"Other Expenses"}</td><td style={{padding:10,textAlign:"right"}}>{r.sft||"—"}</td><td style={{padding:10,textAlign:"right"}}>{r.rate?money(r.rate):"—"}</td><td style={{padding:10,textAlign:"right"}}>{r.debit?money(r.debit):"—"}</td><td style={{padding:10,textAlign:"right"}}>{r.credit?money(r.credit):"—"}</td><td style={{padding:10,textAlign:"right"}}>{money(r.balance)}</td>{admin&&<td style={{padding:10,whiteSpace:"nowrap"}}><button onClick={()=>openEdit(r)}>Edit</button> <button onClick={()=>void remove(r)}>Delete</button></td>}</tr>)}{!filtered.length&&<tr><td colSpan={admin?9:8} style={{padding:40,textAlign:"center",color:"#7e8b93"}}>No entries in this category yet.</td></tr>}</tbody></table></div>
      </section>
    </div>

    {formOpen&&admin&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",display:"grid",placeItems:"center",padding:20,zIndex:100}}><section style={{width:"min(760px,100%)",maxHeight:"90vh",overflow:"auto",...card}}><div style={{display:"flex",justifyContent:"space-between"}}><h2>{editing?"Edit Expense":"Add Expense"}</h2><button onClick={()=>setFormOpen(false)}>×</button></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><label>Date<input type="date" value={form.entryDate} onChange={e=>setForm({...form,entryDate:e.target.value})}/></label><label>Expense Category<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></label><label style={{gridColumn:"1/-1"}}>Details<input value={form.details} onChange={e=>setForm({...form,details:e.target.value})}/></label><label>SFT / Qty<input value={form.sft} onChange={e=>setForm({...form,sft:e.target.value})}/></label><label>Rate<input value={form.rate} onChange={e=>setForm({...form,rate:e.target.value})}/></label><label>Debit<input value={form.debit} onChange={e=>setForm({...form,debit:e.target.value,credit:e.target.value?"":form.credit})}/></label><label>Credit / Expense<input value={form.credit} onChange={e=>setForm({...form,credit:e.target.value,debit:e.target.value?"":form.debit})}/></label><label style={{gridColumn:"1/-1"}}>Memo<input value={form.memo} onChange={e=>setForm({...form,memo:e.target.value})}/></label></div><div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:16}}><button onClick={()=>setFormOpen(false)}>Cancel</button><button onClick={()=>void save()} disabled={saving}>{saving?"Saving…":editing?"Update":"Save"}</button></div></section></div>}

    {masterOpen&&admin&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.78)",display:"grid",placeItems:"center",padding:20,zIndex:120}}><section style={{width:"min(1100px,100%)",maxHeight:"90vh",overflow:"auto",...card}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}><div><h2 style={{margin:"0 0 4px"}}>Pull from Master Ledger</h2><small style={{color:"#8d9aa3"}}>Select an existing project debit/expense and assign it to a category.</small></div><button onClick={()=>setMasterOpen(false)}>×</button></div><div style={{display:"flex",gap:10,margin:"14px 0",flexWrap:"wrap"}}><input value={masterSearch} onChange={e=>setMasterSearch(e.target.value)} placeholder="Search master ledger…" style={{flex:1,minWidth:260,padding:10,background:"#0b1218",color:"#fff"}}/><select value={pullCategory} onChange={e=>setPullCategory(e.target.value)} style={{padding:10,background:"#0b1218",color:"#fff"}}>{CATEGORIES.map(c=><option key={c}>{c}</option>)}</select></div><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:850}}><thead><tr>{["Date","Master Category","Details","Amount","Suggested","Action"].map(h=><th key={h} style={{padding:10}}>{h}</th>)}</tr></thead><tbody>{masterRows.map((r:any)=><tr key={r.sourceType+":"+r.sourceId}><td style={{padding:10}}>{dateText(r.entryDate)}</td><td style={{padding:10}}>{r.masterCategory||"—"}</td><td style={{padding:10}}><strong>{r.details}</strong><small style={{display:"block",color:"#77868f"}}>{r.sourceCode}</small></td><td style={{padding:10,textAlign:"right"}}>{money(r.amount)}</td><td style={{padding:10}}>{r.suggestedCategory}</td><td style={{padding:10,textAlign:"right"}}>{r.pulled?<span style={{color:"#91ddb3"}}>Pulled</span>:<button disabled={pulling===r.sourceType+":"+r.sourceId} onClick={()=>void pull(r)}>{pulling===r.sourceType+":"+r.sourceId?"Pulling…":"Pull"}</button>}</td></tr>)}{!masterRows.length&&<tr><td colSpan={6} style={{padding:30,textAlign:"center"}}>No master-ledger expense records found.</td></tr>}</tbody></table></div></section></div>}
  </main>;
}
