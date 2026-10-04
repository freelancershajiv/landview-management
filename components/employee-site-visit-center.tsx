"use client";

import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";

type Row = Record<string, any>;

function dateText(v:any){const d=new Date(String(v||""));return Number.isNaN(d.getTime())?"—":d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});}
function compressImage(file:File,maxDimension=1600,quality=.82):Promise<File>{
  return new Promise((resolve,reject)=>{
    if(!file.type.startsWith("image/")) return reject(new Error("Please select an image file."));
    const img=new Image();
    const url=URL.createObjectURL(file);
    img.onload=()=>{
      URL.revokeObjectURL(url);
      const scale=Math.min(1,maxDimension/Math.max(img.width,img.height));
      const canvas=document.createElement("canvas");
      canvas.width=Math.max(1,Math.round(img.width*scale));
      canvas.height=Math.max(1,Math.round(img.height*scale));
      const ctx=canvas.getContext("2d");
      if(!ctx) return reject(new Error("Could not prepare photo."));
      ctx.drawImage(img,0,0,canvas.width,canvas.height);
      canvas.toBlob(blob=>{
        if(!blob)return reject(new Error("Could not prepare photo."));
        resolve(new File([blob],file.name.replace(/\.(jpe?g|png|webp)$/i,"")+".jpg",{type:"image/jpeg"}));
      },"image/jpeg",quality);
    };
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("Could not read photo."));};
    img.src=url;
  });
}

export default function EmployeeSiteVisitCenter(){
  const [projects,setProjects]=useState<Row[]>([]);
  const [visits,setVisits]=useState<Row[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [form,setForm]=useState({projectId:"",visitDate:new Date().toISOString().slice(0,10),purpose:"",problemDetails:"",actionRequired:"",notes:""});
  const [visitPhoto,setVisitPhoto]=useState<File|null>(null);
  const [problemPhoto,setProblemPhoto]=useState<File|null>(null);

  async function load(){
    setLoading(true);setError("");
    try{
      const [p,v]=await Promise.all([
        fetch("/api/site-visits?mode=projects",{cache:"no-store",credentials:"same-origin"}).then(r=>r.json()),
        fetch("/api/site-visits",{cache:"no-store",credentials:"same-origin"}).then(r=>r.json())
      ]);
      if(!p?.success)throw new Error(p?.error||"Could not load Projects for Site Visits.");
      if(!v?.success)throw new Error(v?.error||"Could not load Site Visits.");
      setProjects(p.data||[]);setVisits(v.data||[]);
      if(!form.projectId && p?.[0]?.Project_ID)setForm(x=>({...x,projectId:String(p[0].Project_ID)}));
    }catch(e:any){setError(e?.message||"Could not load Site Visits.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);

  useMemo(()=>projects.find(p=>String(p.Project_ID)===String(form.projectId)),[projects,form.projectId]);

  async function submit(e:React.FormEvent){
    e.preventDefault();setSaving(true);setError("");setNotice("");
    try{
      if(!form.projectId)throw new Error("Select a project.");
      if(!form.purpose.trim())throw new Error("Enter the visit purpose.");
      const body=new FormData();
      Object.entries(form).forEach(([k,v])=>body.append(k,v));
      if(visitPhoto)body.append("visitPhoto",await compressImage(visitPhoto));
      if(problemPhoto)body.append("problemPhoto",await compressImage(problemPhoto));
      const response=await fetch("/api/site-visits",{method:"POST",body,credentials:"same-origin"});
      const json=await response.json().catch(()=>null);
      if(!response.ok||!json?.success)throw new Error(String(json?.error||"Could not submit Site Visit."));
      setNotice("Site Visit "+(json.data?.Visit_ID||"")+" submitted successfully.");
      setVisitPhoto(null);setProblemPhoto(null);
      setForm(v=>({...v,purpose:"",problemDetails:"",actionRequired:"",notes:""}));
      await load();
    }catch(e:any){setError(e?.message||"Could not submit Site Visit.");}
    finally{setSaving(false);}
  }

  return <section className="employee-site-visits">
    <style>{`
      .employee-site-visits{display:grid;gap:16px}.sv-hero{padding:22px 24px;border:1px solid #303a44;border-radius:16px;background:radial-gradient(circle at 90% 0%,rgba(214,31,38,.14),transparent 30%),linear-gradient(145deg,#141b22,#0d1217)}.sv-hero small{color:#ff666c;font-size:8px;font-weight:900;letter-spacing:.18em}.sv-hero h2{margin:6px 0 0;font-size:22px}.sv-hero p{margin:7px 0 0;color:#86929d;font-size:10px;line-height:1.55}.sv-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:16px}.sv-card{border:1px solid #2d3740;border-radius:15px;background:linear-gradient(160deg,#11171d,#0d1217);overflow:hidden}.sv-card-head{padding:17px 18px;border-bottom:1px solid #28333c;display:flex;justify-content:space-between;gap:12px;align-items:center}.sv-card-head strong{font-size:12px}.sv-card-head small{display:block;color:#77838e;font-size:8px;margin-top:3px}.sv-form{padding:17px;display:grid;grid-template-columns:1fr 1fr;gap:11px}.sv-field{display:grid;gap:6px}.sv-field.wide{grid-column:1/-1}.sv-field span{color:#84909b;font-size:8px;font-weight:900;letter-spacing:.1em}.sv-field input,.sv-field select,.sv-field textarea{width:100%;border:1px solid #34404a;border-radius:8px;background:#0a1015;color:#f1f4f6;padding:10px;font-size:10px;outline:none}.sv-field textarea{min-height:82px;resize:vertical}.sv-field input:focus,.sv-field select:focus,.sv-field textarea:focus{border-color:#d61f26;box-shadow:0 0 0 3px rgba(214,31,38,.08)}.sv-upload{display:grid;grid-template-columns:1fr 1fr;gap:10px}.sv-upload-box{min-height:92px;border:1px dashed #3b4751;border-radius:9px;background:#0b1116;padding:12px;display:grid;align-content:center;gap:5px}.sv-upload-box strong{font-size:9px}.sv-upload-box small{color:#77838e;font-size:8px;line-height:1.4}.sv-upload-box input{font-size:8px;color:#9ba6af}.sv-submit{grid-column:1/-1;height:40px;border:0;border-radius:8px;background:linear-gradient(180deg,#e53138,#bd171e);color:#fff;font-size:9px;font-weight:900;cursor:pointer}.sv-submit:disabled{opacity:.5;cursor:wait}.sv-msg{padding:10px 12px;border-radius:8px;font-size:9px}.sv-msg.err{background:#341617;border:1px solid #6c292e;color:#ffaaa5}.sv-msg.ok{background:#152c1e;border:1px solid #2d5f40;color:#a6dfb8}.sv-list{display:grid;gap:9px;padding:13px}.sv-row{border:1px solid #2b353e;border-radius:10px;background:#10171d;padding:13px;display:grid;grid-template-columns:1fr auto;gap:10px}.sv-row strong{display:block;font-size:11px}.sv-row small{display:block;margin-top:4px;color:#7e8993;font-size:8px}.sv-row p{margin:8px 0 0;color:#abb6be;font-size:9px;line-height:1.5}.sv-photo-row{display:flex;gap:6px;margin-top:9px}.sv-photo-row a{width:54px;height:44px;border-radius:6px;overflow:hidden;border:1px solid #35414b;background:#0a1014;display:block}.sv-photo-row img{width:100%;height:100%;object-fit:cover}.sv-status{align-self:start;padding:5px 7px;border-radius:999px;background:#173827;color:#a7dfbb;font-size:7px;font-weight:900}.sv-empty{padding:28px;text-align:center;color:#7e8993;font-size:9px}.sv-help{padding:13px 17px;border-top:1px solid #28333c;color:#7e8993;font-size:8px;line-height:1.5}@media(max-width:900px){.sv-grid{grid-template-columns:1fr}}@media(max-width:600px){.sv-form,.sv-upload{grid-template-columns:1fr}.sv-field.wide{grid-column:auto}.sv-submit{grid-column:auto}}
    `}</style>

    <div className="sv-hero"><small>SITE SUPERVISION</small><h2>Site Visits</h2><p>Record what happened on site, attach evidence, and keep the project team and client informed.</p></div>
    {error&&<div className="sv-msg err">{error}</div>}{notice&&<div className="sv-msg ok">{notice}</div>}

    <div className="sv-grid">
      <section className="sv-card">
        <div className="sv-card-head"><div><strong>Add Site Visit</strong><small>All LAND VIEW projects are available for site visits.</small></div><span>EMPLOYEE</span></div>
        <form className="sv-form" onSubmit={submit}>
          <label className="sv-field"><span>PROJECT</span><select value={form.projectId} onChange={e=>setForm(v=>({...v,projectId:e.target.value}))}><option value="">Select project</option>{projects.map(p=><option key={p.Project_ID} value={p.Project_ID}>{p.Project_ID} · {p.Project_Name||p.Client_Name||"Project"}</option>)}</select></label>
          <label className="sv-field"><span>VISIT DATE</span><input type="date" value={form.visitDate} onChange={e=>setForm(v=>({...v,visitDate:e.target.value}))}/></label>
          <label className="sv-field wide"><span>VISIT PURPOSE</span><input value={form.purpose} onChange={e=>setForm(v=>({...v,purpose:e.target.value}))} placeholder="e.g. Foundation inspection / site measurement"/></label>
          <label className="sv-field wide"><span>PROBLEM / OBSERVATION DETAILS</span><textarea value={form.problemDetails} onChange={e=>setForm(v=>({...v,problemDetails:e.target.value}))} placeholder="Describe what you observed at site."/></label>
          <label className="sv-field wide"><span>ACTION REQUIRED</span><textarea value={form.actionRequired} onChange={e=>setForm(v=>({...v,actionRequired:e.target.value}))} placeholder="What needs to be corrected, approved or followed up?"/></label>
          <div className="sv-upload wide">
            <label className="sv-upload-box"><strong>VISIT PHOTO</strong><small>{visitPhoto?visitPhoto.name:"Upload a general site photo"}</small><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setVisitPhoto(e.target.files?.[0]||null)}/></label>
            <label className="sv-upload-box"><strong>PROBLEM PHOTO</strong><small>{problemPhoto?problemPhoto.name:"Upload evidence of the problem"}</small><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setProblemPhoto(e.target.files?.[0]||null)}/></label>
          </div>
          <label className="sv-field wide"><span>NOTES</span><textarea value={form.notes} onChange={e=>setForm(v=>({...v,notes:e.target.value}))} placeholder="Additional site notes (optional)."/></label>
          <button className="sv-submit" disabled={saving}>{saving?"SUBMITTING SITE VISIT…":"SUBMIT SITE VISIT"}</button>
        </form>
        <div className="sv-help">Photos are stored securely. Admin, Manager and the client linked to the project can view this Site Visit.</div>
      </section>

      <section className="sv-card">
        <div className="sv-card-head"><div><strong>Recent Site Visits</strong><small>{visits.length} recorded visits</small></div><button type="button" className="employee-action" onClick={()=>void load()} disabled={loading}>{loading?"Loading…":"Refresh"}</button></div>
        <div className="sv-list">
          {visits.slice(0,20).map((visit,i)=><article className="sv-row" key={visit.Visit_ID||i}>
            <div><strong>{visit.Project_ID} · {visit.Purpose||"Site Visit"}</strong><small>{dateText(visit.Visit_Date)} · {visit.Employee_Name||visit.Visited_By||"Employee"}</small>{visit.Problem_Details&&<p>{visit.Problem_Details}</p>}
              {(visit.Visit_Photo_Available||visit.Problem_Photo_Available)&&<div className="sv-photo-row">{visit.Visit_Photo_Available&&<a href={"/api/site-visits/media?visitId="+encodeURIComponent(visit.Visit_ID)+"&kind=visit"} target="_blank" rel="noreferrer"><img src={"/api/site-visits/media?visitId="+encodeURIComponent(visit.Visit_ID)+"&kind=visit"} alt="Site visit"/></a>}{visit.Problem_Photo_Available&&<a href={"/api/site-visits/media?visitId="+encodeURIComponent(visit.Visit_ID)+"&kind=problem"} target="_blank" rel="noreferrer"><img src={"/api/site-visits/media?visitId="+encodeURIComponent(visit.Visit_ID)+"&kind=problem"} alt="Problem"/></a>}</div>}
            </div><span className="sv-status">{visit.Status||"Completed"}</span>
          </article>)}
          {!visits.length&&<div className="sv-empty">No Site Visits have been recorded by you yet.</div>}
        </div>
      </section>
    </div>
  </section>;
}
