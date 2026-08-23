"use client";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";
import { EmptyState, Field, LoadingState, PageHeader, formatDate, pick } from "@/components/lv-ui";
const blank={Project_ID:"",Document_Name:"",Document_Type:"",File_URL:"",Notes:"",Date:""};
export default function DocumentsPage(){const [rows,setRows]=useState<any[]>([]),[projects,setProjects]=useState<any[]>([]),[loading,setLoading]=useState(true),[query,setQuery]=useState(""),[open,setOpen]=useState(false),[form,setForm]=useState(blank),[error,setError]=useState("");
async function load(){setLoading(true);try{const [d,p]=await Promise.all([landViewApi.getDocuments(),landViewApi.getProjects()]);setRows(d);setProjects(p)}catch(e:any){setError(e?.message||"Could not load documents.")}finally{setLoading(false)}}useEffect(()=>{load()},[]);const filtered=useMemo(()=>rows.filter(r=>JSON.stringify(r).toLowerCase().includes(query.toLowerCase())),[rows,query]);async function submit(e: FormEvent) {
  e.preventDefault();
  try {
    await landViewApi.createDocument({
      ...form,
      Upload_Date: form.Date,
      Document_Date: form.Date,
      Drive_URL: form.File_URL,
    });
    setForm(blank);
    setOpen(false);
    await load();
  } catch (e: any) {
    setError(e?.message || "Could not add document.");
  }
}
return <><PageHeader eyebrow="PROJECT RECORDS" title="Documents" description="A central register for project drawings, reports and files." action={<button className="btn btn-dark" onClick={()=>setOpen(true)}>+ Add document</button>}/><div className="toolbar"><div className="search-box"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search documents..."/></div><div className="toolbar-count">{filtered.length} records</div></div>{error&&<div className="notice error"><strong>Notice</strong><span>{error}</span></div>}{loading?<LoadingState/>:!rows.length?<EmptyState title="No documents" text="Add document records as files are created or uploaded to Drive."/>:<div className="card table-card"><div className="table-scroll"><table><thead><tr><th>Document</th><th>Project</th><th>Type</th><th>Date</th><th></th></tr></thead><tbody>{filtered.map((r:any,i)=>{const url=pick(r,["File_URL","File URL","URL","Drive_URL"]);return <tr key={pick(r,["Document_ID"],String(i))}><td><strong>{pick(r,["Document_Name","Document Name","Name"],"Document")}</strong><small>{pick(r,["Document_ID"],"—")}</small></td><td>{pick(r,["Project_ID","Project ID"],"—")}</td><td>{pick(r,["Document_Type","Document Type","Type"],"—")}</td><td>{formatDate(r.Date||r.Document_Date||r.Created_At)}</td><td>{url?<a className="row-link" href={url} target="_blank" rel="noreferrer">Open ↗</a>:"—"}</td></tr>})}</tbody></table></div></div>}
{open&&<div className="modal-backdrop" onMouseDown={()=>setOpen(false)}><form className="modal card" onSubmit={submit} onMouseDown={e=>e.stopPropagation()}><div className="section-title"><div><span>NEW RECORD</span><h2>Add document</h2></div><button type="button" className="icon-button" onClick={()=>setOpen(false)}>×</button></div><div className="form-grid"><Field label="PROJECT"><select value={form.Project_ID} onChange={e=>setForm(v=>({...v,Project_ID:e.target.value}))}><option value="">Select project</option>{projects.map((p:any)=><option key={pick(p,["Project_ID"])} value={pick(p,["Project_ID"])}>{pick(p,["Project_ID"])} — {pick(p,["Project_Name","Client_Name"],"")}</option>)}</select></Field><Field label="DOCUMENT NAME"><input value={form.Document_Name} onChange={e=>setForm(v=>({...v,Document_Name:e.target.value}))}/></Field><Field label="DOCUMENT TYPE"><input value={form.Document_Type} onChange={e=>setForm(v=>({...v,Document_Type:e.target.value}))}/></Field><Field label="DATE"><input type="date" value={form.Date} onChange={e=>setForm(v=>({...v,Date:e.target.value}))}/></Field><Field label="FILE / DRIVE URL"><input value={form.File_URL} onChange={e=>setForm(v=>({...v,File_URL:e.target.value}))}/></Field><Field label="NOTES"><input value={form.Notes} onChange={e=>setForm(v=>({...v,Notes:e.target.value}))}/></Field></div><div className="form-actions"><button type="button" className="btn btn-light" onClick={()=>setOpen(false)}>Cancel</button><button className="btn btn-dark">Add document</button></div></form></div>}</>}
