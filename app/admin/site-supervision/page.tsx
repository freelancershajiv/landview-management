"use client";
import { FormEvent, useEffect, useState } from "react";
import { landViewApi } from "@/lib/api";
import { EmptyState, Field, LoadingState, PageHeader, formatDate, pick } from "@/components/lv-ui";
const blank={Project_ID:"",Visit_Date:"",Engineer:"",Purpose:"",Observation:"",Action_Required:"",Status:"Completed"};
export default function SitePage(){const [rows,setRows]=useState<any[]>([]),[projects,setProjects]=useState<any[]>([]),[form,setForm]=useState(blank),[open,setOpen]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState("");async function load(){setLoading(true);try{const [v,p]=await Promise.all([landViewApi.getSiteVisits(),landViewApi.getProjects()]);setRows(v);setProjects(p)}catch(e:any){setError(e?.message||"Could not load site visits.")}finally{setLoading(false)}}useEffect(()=>{load()},[]);async function submit(e: FormEvent) {
  e.preventDefault();
  try {
    await landViewApi.createSiteVisit({
      ...form,
      Date: form.Visit_Date,
      Visit_Purpose: form.Purpose,
      Observations: form.Observation,
      Notes: form.Observation,
      Visited_By: form.Engineer,
    });
    setOpen(false);
    setForm(blank);
    await load();
  } catch (e: any) {
    setError(e?.message || "Could not save site visit.");
  }
}
return <><PageHeader eyebrow="FIELD OPERATIONS" title="Site supervision" description="Record inspections, observations and required site actions." action={<button className="btn btn-dark" onClick={()=>setOpen(true)}>+ Record visit</button>}/>{error&&<div className="notice error"><strong>Notice</strong><span>{error}</span></div>}{loading?<LoadingState/>:!rows.length?<EmptyState title="No site visits" text="Record the first site supervision visit."/>:<div className="timeline">{[...rows].reverse().map((r:any,i)=><div className="timeline-item" key={pick(r,["Visit_ID"],String(i))}><div className="timeline-date"><strong>{formatDate(r.Visit_Date||r.Date||r.Created_At)}</strong><span>{pick(r,["Visit_ID"],`Visit ${rows.length-i}`)}</span></div><div className="timeline-line"><i/></div><div className="card timeline-card"><div className="timeline-head"><div><span>{pick(r,["Project_ID"],"—")}</span><h3>{pick(r,["Purpose","Visit_Purpose"],"Site visit")}</h3></div><b>{pick(r,["Engineer","Employee_Name","Visited_By"],"LAND VIEW")}</b></div><p>{pick(r,["Observation","Observations","Notes"],"No observation recorded.")}</p>{pick(r,["Action_Required","Action Required"])&&<div className="action-note"><span>ACTION REQUIRED</span>{pick(r,["Action_Required","Action Required"])}</div>}</div></div>)}</div>}
{open&&<div className="modal-backdrop" onMouseDown={()=>setOpen(false)}><form className="modal card wide" onSubmit={submit} onMouseDown={e=>e.stopPropagation()}><div className="section-title"><div><span>FIELD RECORD</span><h2>New site visit</h2></div><button type="button" className="icon-button" onClick={()=>setOpen(false)}>×</button></div><div className="form-grid"><Field label="PROJECT"><select value={form.Project_ID} onChange={e=>setForm(v=>({...v,Project_ID:e.target.value}))}><option value="">Select project</option>{projects.map((p:any)=><option key={pick(p,["Project_ID"])} value={pick(p,["Project_ID"])}>{pick(p,["Project_ID"])} — {pick(p,["Project_Name","Client_Name"],"")}</option>)}</select></Field><Field label="VISIT DATE"><input type="date" value={form.Visit_Date} onChange={e=>setForm(v=>({...v,Visit_Date:e.target.value}))}/></Field><Field label="ENGINEER"><input value={form.Engineer} onChange={e=>setForm(v=>({...v,Engineer:e.target.value}))}/></Field><Field label="PURPOSE"><input value={form.Purpose} onChange={e=>setForm(v=>({...v,Purpose:e.target.value}))}/></Field><Field label="OBSERVATION"><textarea value={form.Observation} onChange={e=>setForm(v=>({...v,Observation:e.target.value}))}/></Field><Field label="ACTION REQUIRED"><textarea value={form.Action_Required} onChange={e=>setForm(v=>({...v,Action_Required:e.target.value}))}/></Field></div><div className="form-actions"><button type="button" className="btn btn-light" onClick={()=>setOpen(false)}>Cancel</button><button className="btn btn-dark">Save visit</button></div></form></div>}</>}
