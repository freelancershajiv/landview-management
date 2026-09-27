"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./projectmanagement.module.css";

type Project={id:string;projectCode:string;projectName:string;clientName:string;location:string;status:string};
type Entry={id:string;entry_date:string;details:string;sft:number;rate:number;debit:number;credit:number;balance:number;category?:string|null;memo?:string|null};
type Workspace={projects:Project[];selectedProject:Project|null;entries:Entry[];totals:{debit:number;credit:number;balance:number};readOnly:boolean};
type Form={entryDate:string;details:string;sft:string;rate:string;debit:string;credit:string;category:string;memo:string};

const blank=():Form=>({entryDate:new Date().toISOString().slice(0,10),details:"",sft:"",rate:"",debit:"",credit:"",category:"",memo:""});
const money=(v:number)=>new Intl.NumberFormat("en-BD",{style:"currency",currency:"BDT",maximumFractionDigits:2}).format(Number(v||0));
const num=(v:unknown)=>{const n=Number(String(v??"").replace(/,/g,"").replace(/[^0-9.-]/g,""));return Number.isFinite(n)?n:0};
const dateText=(v:string)=>{const d=new Date((v||"").includes("T")?v:v+"T00:00:00");return Number.isNaN(d.getTime())?v:d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})};

export default function ProjectManagementPage(){
  const [data,setData]=useState<Workspace|null>(null),[project,setProject]=useState(""),[form,setForm]=useState<Form>(blank()),[editing,setEditing]=useState<Entry|null>(null);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState(""),[query,setQuery]=useState(""),[open,setOpen]=useState(false);

  async function load(code=project){
    setLoading(true);setError("");
    try{
      const url=code?"/api/project-management?projectId="+encodeURIComponent(code):"/api/project-management";
      const r=await fetch(url,{credentials:"same-origin",cache:"no-store"}),j=await r.json();
      if(!r.ok||!j?.success)throw new Error(j?.error||"Could not load Project Management.");
      setData(j.data);
      if(j.data?.selectedProject?.projectCode)setProject(j.data.selectedProject.projectCode);
    }catch(e:any){setError(e?.message||"Could not load Project Management.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);

  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return (data?.entries||[]).filter(r=>!q||[r.details,r.category,r.memo,r.entry_date].some(v=>String(v||"").toLowerCase().includes(q)));
  },[data,query]);
  const admin=Boolean(data&&!data.readOnly), totals=data?.totals||{debit:0,credit:0,balance:0};

  function startAdd(){setEditing(null);setForm(blank());setError("");setMessage("");setOpen(true);}
  function startEdit(r:Entry){setEditing(r);setForm({entryDate:r.entry_date.slice(0,10),details:r.details||"",sft:r.sft?String(r.sft):"",rate:r.rate?String(r.rate):"",debit:r.debit?String(r.debit):"",credit:r.credit?String(r.credit):"",category:r.category||"",memo:r.memo||""});setError("");setMessage("");setOpen(true);}
  function setField(k:keyof Form,v:string){setForm(x=>({...x,[k]:v}));}
  function debit(v:string){setForm(x=>({...x,debit:v,credit:v?"":x.credit}));}
  function credit(v:string){setForm(x=>({...x,credit:v,debit:v?"":x.debit}));}

  async function save(){
    if(!data?.selectedProject)return;
    setSaving(true);setError("");setMessage("");
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
    if(!window.confirm("Delete this ledger entry?\n\n"+r.details+"\n"+money(r.credit||r.debit)))return;
    try{const x=await fetch("/api/project-management?id="+encodeURIComponent(r.id),{method:"DELETE",credentials:"same-origin"}),j=await x.json();if(!x.ok||!j?.success)throw new Error(j?.error||"Could not delete ledger entry.");setMessage("Ledger entry deleted.");await load(data?.selectedProject?.projectCode||project);}
    catch(e:any){setError(e?.message||"Could not delete ledger entry.");}
  }

  if(loading&&!data)return <main className={styles.page}><div className={styles.loading}>Loading Project Management…</div></main>;
  return <main className={styles.page}>
    <header className={styles.hero}><div><span className={styles.eyebrow}>LAND VIEW • PROJECT MANAGEMENT</span><h1>Project Debit & Credit Ledger</h1><p>Track project funds and expenses in one live ledger. Admin manages entries; clients have read-only access to their linked project.</p></div><div className={styles.heroActions}><button className={styles.secondaryButton} onClick={()=>void load(project)} disabled={loading}>↻ Refresh</button>{admin&&<button className={styles.primaryButton} onClick={startAdd}>+ Add Entry</button>}</div></header>
    {error&&<div className={styles.error}>{error}</div>}{message&&<div className={styles.success}>{message}</div>}
    <section className={styles.projectBar}><div><label>Project</label><select value={data?.selectedProject?.projectCode||project} onChange={e=>{setProject(e.target.value);void load(e.target.value);}}>{(data?.projects||[]).map(p=><option key={p.id} value={p.projectCode}>{p.projectCode+" — "+(p.clientName||p.projectName)}</option>)}</select></div>{data?.selectedProject&&<div className={styles.projectMeta}><strong>{data.selectedProject.projectName}</strong><span>{data.selectedProject.location||"Location not recorded"}</span><span>{data.selectedProject.status||"Active"}</span></div>}</section>
    <section className={styles.cards}><div className={styles.card}><span>Total Debit</span><strong>{money(totals.debit)}</strong><small>Debit entries</small></div><div className={styles.card}><span>Total Credit</span><strong>{money(totals.credit)}</strong><small>Credit entries</small></div><div className={styles.card}><span>Current Balance</span><strong>{money(totals.balance)}</strong><small>Credit − Debit</small></div><div className={styles.card}><span>Entries</span><strong>{data?.entries.length||0}</strong><small>{data?.readOnly?"Client read-only view":"Admin management view"}</small></div></section>
    <section className={styles.ledgerCard}><div className={styles.toolbar}><div><h2>Ledger</h2><p>Date | Details | SFT | Rate | Debit | Credit | Balance</p></div><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search details, category…" /></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Date</th><th>Details</th><th>SFT</th><th>Rate</th><th>Debit</th><th>Credit</th><th>Balance</th>{admin&&<th>Action</th>}</tr></thead><tbody>{filtered.length?filtered.map(r=><tr key={r.id}><td>{dateText(r.entry_date)}</td><td><strong>{r.details}</strong>{r.category&&<small>{r.category}</small>}{r.memo&&<em>{r.memo}</em>}</td><td>{r.sft?r.sft.toLocaleString("en-BD"):"—"}</td><td>{r.rate?money(r.rate):"—"}</td><td className={r.debit?styles.debit:""}>{r.debit?money(r.debit):"—"}</td><td className={r.credit?styles.credit:""}>{r.credit?money(r.credit):"—"}</td><td className={styles.balance}>{money(r.balance)}</td>{admin&&<td><div className={styles.actions}><button onClick={()=>startEdit(r)}>Edit</button><button className={styles.deleteButton} onClick={()=>void remove(r)}>Delete</button></div></td>}</tr>):<tr><td colSpan={admin?8:7} className={styles.empty}>No ledger entries for this project yet.</td></tr>}</tbody></table></div>
    </section>
    {open&&admin&&<div className={styles.modalBackdrop} onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setOpen(false);}}><section className={styles.modal}><div className={styles.modalHead}><div><span className={styles.eyebrow}>{editing?"EDIT ENTRY":"NEW ENTRY"}</span><h2>{editing?"Edit Ledger Entry":"Add Ledger Entry"}</h2></div><button onClick={()=>setOpen(false)}>×</button></div>
      <div className={styles.formGrid}><label>Date<input type="date" value={form.entryDate} onChange={e=>setField("entryDate",e.target.value)}/></label><label>Details<textarea value={form.details} onChange={e=>setField("details",e.target.value)} placeholder="e.g. Contractor payment"/></label><label>SFT / Qty<input inputMode="decimal" value={form.sft} onChange={e=>setField("sft",e.target.value)}/></label><label>Rate<input inputMode="decimal" value={form.rate} onChange={e=>setField("rate",e.target.value)}/></label><label>Debit<input inputMode="decimal" value={form.debit} onChange={e=>debit(e.target.value)} placeholder="0.00"/></label><label>Credit<input inputMode="decimal" value={form.credit} onChange={e=>credit(e.target.value)} placeholder="0.00"/></label><label>Category<input value={form.category} onChange={e=>setField("category",e.target.value)} placeholder="Labour, Material, Contractor…"/></label><label>Memo<textarea value={form.memo} onChange={e=>setField("memo",e.target.value)} placeholder="Optional note"/></label></div>
      <div className={styles.modalFoot}><button className={styles.secondaryButton} onClick={()=>setOpen(false)} disabled={saving}>Cancel</button><button className={styles.primaryButton} onClick={()=>void save()} disabled={saving}>{saving?"Saving…":editing?"Update Entry":"Save Entry"}</button></div>
    </section></div>}
  </main>;
}
