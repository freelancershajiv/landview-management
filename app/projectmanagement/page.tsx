"use client";

import { useEffect, useMemo, useState } from "react";

type Project={id:string;projectCode:string;projectName:string;clientName:string;location:string;status:string};
type Entry={id:string;entry_date:string;details:string;sft:number;rate:number;debit:number;credit:number;balance:number;category?:string|null;memo?:string|null};
type Workspace={projects:Project[];selectedProject:Project|null;entries:Entry[];totals:{debit:number;credit:number;balance:number};readOnly:boolean};
type Form={entryDate:string;details:string;sft:string;rate:string;debit:string;credit:string;category:string;memo:string};

const money=(v:number)=>new Intl.NumberFormat("en-BD",{style:"currency",currency:"BDT",maximumFractionDigits:2}).format(Number(v||0));
const num=(v:unknown)=>{const n=Number(String(v??"").replace(/,/g,"").replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:0};
const blank=():Form=>({entryDate:new Date().toISOString().slice(0,10),details:"",sft:"",rate:"",debit:"",credit:"",category:"",memo:""});
const dateText=(v:string)=>{const d=new Date((v||"").slice(0,10)+"T00:00:00");return Number.isNaN(d.getTime())?v:d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})};
const page={minHeight:"100vh",padding:"32px 4vw 60px",background:"#0b1116",color:"#eef3f5",fontFamily:"inherit"};
const card={background:"#131d25",border:"1px solid #2b3942",borderRadius:14,padding:18};

export default function ProjectManagementPage(){
  const [data,setData]=useState<Workspace|null>(null),[project,setProject]=useState(""),[form,setForm]=useState<Form>(blank()),[editing,setEditing]=useState<Entry|null>(null);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[query,setQuery]=useState(""),[open,setOpen]=useState(false);

  async function load(code=project){
    setLoading(true);setError("");
    try{
      const url=code?"/api/project-management?projectId="+encodeURIComponent(code):"/api/project-management";
      const r=await fetch(url,{credentials:"same-origin",cache:"no-store"}),j=await r.json();
      if(!r.ok||!j?.success)throw new Error(j?.error||"Could not load Project Management.");
      setData(j.data);if(j.data?.selectedProject?.projectCode)setProject(j.data.selectedProject.projectCode);
    }catch(e:any){setError(e?.message||"Could not load Project Management.");}finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);

  const filtered=useMemo(()=>{const q=query.trim().toLowerCase();return (data?.entries||[]).filter(r=>!q||[r.details,r.category,r.memo,r.entry_date].some(v=>String(v||"").toLowerCase().includes(q)));},[data,query]);
  const admin=Boolean(data&&!data.readOnly), totals=data?.totals||{debit:0,credit:0,balance:0};
  const setField=(k:keyof Form,v:string)=>setForm(x=>({...x,[k]:v}));

  async function save(){
    if(!data?.selectedProject)return;
    setSaving(true);setError("");
    try{
      const d=num(form.debit),c=num(form.credit);
      if(!form.details.trim())throw new Error("Details are required.");
      if((d>0)===(c>0))throw new Error("Enter either Debit or Credit.");
      const body={projectId:data.selectedProject.projectCode,entryDate:form.entryDate,details:form.details,sft:num(form.sft),rate:num(form.rate),debit:d,credit:c,category:form.category,memo:form.memo};
      const r=await fetch("/api/project-management",{method:editing?"PUT":"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify(editing?{...body,id:editing.id}:body)});
      const j=await r.json();if(!r.ok||!j?.success)throw new Error(j?.error||"Could not save ledger entry.");
      setOpen(false);setEditing(null);setMessage(editing?"Ledger entry updated.":"Ledger entry added.");await load(data.selectedProject.projectCode);
    }catch(e:any){setError(e?.message||"Could not save ledger entry.");}finally{setSaving(false);}
  }
  async function remove(r:Entry){
    if(!window.confirm("Delete this ledger entry?\n\n"+r.details))return;
    try{const x=await fetch("/api/project-management?id="+encodeURIComponent(r.id),{method:"DELETE",credentials:"same-origin"}),j=await x.json();if(!x.ok||!j?.success)throw new Error(j?.error||"Could not delete ledger entry.");setMessage("Ledger entry deleted.");await load(data?.selectedProject?.projectCode||project);}catch(e:any){setError(e?.message||"Could not delete ledger entry.");}
  }
  function edit(r:Entry){setEditing(r);setForm({entryDate:r.entry_date.slice(0,10),details:r.details||"",sft:r.sft?String(r.sft):"",rate:r.rate?String(r.rate):"",debit:r.debit?String(r.debit):"",credit:r.credit?String(r.credit):"",category:r.category||"",memo:r.memo||""});setOpen(true);}

  if(loading&&!data)return <main style={page}><p>Loading Project Management…</p></main>;

  return <main style={page}>
    <div style={{maxWidth:1500,margin:"0 auto"}}>
      <header style={{display:"flex",justifyContent:"space-between",gap:20,alignItems:"flex-end",marginBottom:20,flexWrap:"wrap"}}>
        <div><div style={{fontSize:11,letterSpacing:".16em",fontWeight:900,color:"#ff8179"}}>LAND VIEW • PROJECT MANAGEMENT</div><h1 style={{fontSize:"clamp(30px,4vw,46px)",margin:"8px 0"}}>Project Debit & Credit Ledger</h1><p style={{color:"#9eabb3",maxWidth:800}}>Admin can add, edit and delete project ledger entries. Clients see only their linked project in read-only mode.</p></div>
        <div style={{display:"flex",gap:8}}><button onClick={()=>void load(project)} disabled={loading} style={{padding:"11px 15px",borderRadius:9,border:"1px solid #34434d",background:"#1c2730",color:"#fff"}}>Refresh</button>{admin&&<button onClick={()=>{setEditing(null);setForm(blank());setOpen(true);}} style={{padding:"11px 15px",borderRadius:9,border:0,background:"#ff8179",fontWeight:800}}>+ Add Entry</button>}</div>
      </header>
      {error&&<div style={{...card,marginBottom:12,color:"#ffb6b3",background:"#3a1e20"}}>{error}</div>}
      {message&&<div style={{...card,marginBottom:12,color:"#a9e3c1",background:"#173426"}}>{message}</div>}
      <section style={{...card,display:"flex",gap:18,alignItems:"flex-end",flexWrap:"wrap",marginBottom:16}}>
        <div><label style={{display:"block",fontSize:12,color:"#91a0a9",fontWeight:800,marginBottom:6}}>PROJECT</label><select value={data?.selectedProject?.projectCode||project} onChange={e=>{setProject(e.target.value);void load(e.target.value)}} style={{minWidth:360,maxWidth:"80vw",padding:10,borderRadius:8,background:"#0b1218",color:"#fff",border:"1px solid #34434d"}}>{(data?.projects||[]).map(p=><option key={p.id} value={p.projectCode}>{p.projectCode+" — "+(p.clientName||p.projectName)}</option>)}</select></div>
        {data?.selectedProject&&<div><strong>{data.selectedProject.projectName}</strong><div style={{color:"#8e9aa2",fontSize:13}}>{data.selectedProject.location||"Location not recorded"} • {data.selectedProject.status||"Active"}</div></div>}
      </section>
      <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:12,marginBottom:16}}>
        <div style={card}><small>Total Debit</small><h2>{money(totals.debit)}</h2></div><div style={card}><small>Total Credit</small><h2>{money(totals.credit)}</h2></div><div style={card}><small>Current Balance</small><h2>{money(totals.balance)}</h2></div><div style={card}><small>Entries</small><h2>{data?.entries.length||0}</h2></div>
      </section>
      <section style={{...card,padding:0,overflow:"hidden"}}>
        <div style={{padding:16,borderBottom:"1px solid #2b3942",display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><h2 style={{margin:0}}>Ledger</h2><small style={{color:"#74828a"}}>Date | Details | SFT | Rate | Debit | Credit | Balance</small></div><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search…" style={{padding:10,borderRadius:8,border:"1px solid #34434d",background:"#0b1218",color:"#fff"}}/></div>
        <div style={{overflowX:"auto"}}><table style={{width:"100%",minWidth:900,borderCollapse:"collapse"}}><thead><tr>{["Date","Details","SFT","Rate","Debit","Credit","Balance"].map(h=><th key={h} style={{padding:11,textAlign:h==="Details"?"left":"right",fontSize:11,color:"#81909a",background:"#101820"}}>{h}</th>)}{admin&&<th/>}</tr></thead><tbody>{filtered.map(r=><tr key={r.id}>{<td style={{padding:11,borderTop:"1px solid #24313a"}}>{dateText(r.entry_date)}</td>}<td style={{padding:11,borderTop:"1px solid #24313a",textAlign:"left"}}><strong>{r.details}</strong>{r.category&&<small style={{display:"block",color:"#77868f"}}>{r.category}</small>}</td><td style={{padding:11,borderTop:"1px solid #24313a",textAlign:"right"}}>{r.sft||"—"}</td><td style={{padding:11,borderTop:"1px solid #24313a",textAlign:"right"}}>{r.rate?money(r.rate):"—"}</td><td style={{padding:11,borderTop:"1px solid #24313a",textAlign:"right",color:r.debit?"#ff9e98":"#77868f"}}>{r.debit?money(r.debit):"—"}</td><td style={{padding:11,borderTop:"1px solid #24313a",textAlign:"right",color:r.credit?"#91ddb3":"#77868f"}}>{r.credit?money(r.credit):"—"}</td><td style={{padding:11,borderTop:"1px solid #24313a",textAlign:"right",fontWeight:800}}>{money(r.balance)}</td>{admin&&<td style={{padding:11,borderTop:"1px solid #24313a"}}><button onClick={()=>edit(r)} style={{marginRight:5}}>Edit</button><button onClick={()=>void remove(r)}>Delete</button></td>}</tr>)}{!filtered.length&&<tr><td colSpan={admin?8:7} style={{padding:40,textAlign:"center",color:"#7e8b93"}}>No ledger entries for this project yet.</td></tr>}</tbody></table></div>
      </section>
    </div>
    {open&&admin&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.72)",display:"grid",placeItems:"center",padding:20,zIndex:100}}><section style={{width:"min(760px,100%)",maxHeight:"90vh",overflow:"auto",...card}}><div style={{display:"flex",justifyContent:"space-between"}}><h2>{editing?"Edit Ledger Entry":"Add Ledger Entry"}</h2><button onClick={()=>setOpen(false)}>×</button></div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>{[["entryDate","Date"],["details","Details"],["sft","SFT / Qty"],["rate","Rate"],["debit","Debit"],["credit","Credit"],["category","Category"],["memo","Memo"]].map(([k,label])=><label key={k} style={{display:"block",gridColumn:k==="details"||k==="memo"?"1 / -1":"auto"}}>{label}<input value={form[k as keyof Form]} onChange={e=>{const v=e.target.value;setForm(x=>({...x,[k]:v,...(k==="debit"&&v?{credit:""}:{}),...(k==="credit"&&v?{debit:""}:{})}))}} type={k==="entryDate"?"date":"text"} style={{width:"100%",boxSizing:"border-box",padding:10,marginTop:5,borderRadius:8,background:"#0b1218",color:"#fff",border:"1px solid #34434d"}}/></label>)}</div><div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:16}}><button onClick={()=>setOpen(false)}>Cancel</button><button onClick={()=>void save()} disabled={saving}>{saving?"Saving…":editing?"Update Entry":"Save Entry"}</button></div></section></div>}
  </main>;
}
