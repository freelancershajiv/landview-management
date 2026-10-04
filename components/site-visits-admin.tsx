"use client";

import { useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;
function dateText(v:any){const d=new Date(String(v||""));return Number.isNaN(d.getTime())?"—":d.toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"});}

export default function SiteVisitsAdmin(){
  const [visits,setVisits]=useState<Row[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [projectFilter,setProjectFilter]=useState("all");
  const [selected,setSelected]=useState<Row|null>(null);

  async function load(){
    setLoading(true);setError("");
    try{
      const r=await fetch("/api/site-visits",{cache:"no-store",credentials:"same-origin"});
      const j=await r.json();
      if(!r.ok||!j?.success)throw new Error(j?.error||"Could not load Site Visits.");
      setVisits(Array.isArray(j.data)?j.data:[]);
    }catch(e:any){setError(e?.message||"Could not load Site Visits.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);

  const projects=useMemo(()=>Array.from(new Set(visits.map(v=>String(v.Project_ID||"")).filter(Boolean))).sort(),[visits]);
  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return visits.filter(v=>{
      const matchProject=projectFilter==="all"||String(v.Project_ID)===projectFilter;
      const hay=[v.Visit_ID,v.Project_ID,v.Project_Name,v.Client_Name,v.Employee_ID,v.Employee_Name,v.Purpose,v.Problem_Details,v.Location,v.Status].join(" ").toLowerCase();
      return matchProject && (!q||hay.includes(q));
    });
  },[visits,query,projectFilter]);

  return <section className="site-visits-admin">
    <style>{\`
      .site-visits-admin{color:#eef2f5;display:grid;gap:16px}.sva-hero{padding:24px 26px;border:1px solid #303a44;border-radius:18px;background:radial-gradient(circle at 90% 0%,rgba(214,31,38,.16),transparent 28%),linear-gradient(135deg,#171e25,#0c1116);position:relative;overflow:hidden}.sva-hero:after{content:"SITE";position:absolute;right:18px;bottom:8px;color:rgba(255,255,255,.035);font-size:76px;font-weight:900;letter-spacing:-.08em}.sva-hero small{color:#ff666c;font-size:8px;font-weight:900;letter-spacing:.2em}.sva-hero h1{margin:7px 0 0;font-size:30px}.sva-hero p{margin:8px 0 0;color:#89959f;font-size:10px;line-height:1.55;max-width:680px}.sva-toolbar{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.sva-search,.sva-select{height:40px;border:1px solid #34404a;border-radius:8px;background:#0b1116;color:#fff;padding:0 12px;font-size:10px;outline:none}.sva-search{flex:1;min-width:220px}.sva-select{min-width:170px}.sva-toolbar button{height:40px;border:1px solid #34404a;border-radius:8px;background:#151c23;color:#fff;padding:0 12px;font-size:9px;font-weight:900;cursor:pointer}.sva-list{display:grid;gap:10px}.sva-row{border:1px solid #2d3740;border-radius:13px;background:linear-gradient(160deg,#11171d,#0d1217);overflow:hidden}.sva-row-main{padding:16px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:15px;cursor:pointer}.sva-row:hover{border-color:#414c56}.sva-row h3{margin:0;font-size:13px}.sva-row-meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:7px}.sva-pill{padding:5px 7px;border-radius:999px;background:#19222a;color:#98a5af;font-size:7px;font-weight:900}.sva-pill.red{background:#32171a;color:#ff9d9f}.sva-row-purpose{margin-top:10px;color:#b5bfc7;font-size:9px;line-height:1.5}.sva-status{align-self:start;padding:5px 8px;border-radius:999px;background:#173827;color:#a8dfbb;font-size:7px;font-weight:900}.sva-details{border-top:1px solid #29333c;padding:15px 16px;background:#0e141a}.sva-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.sva-detail-grid>div{border:1px solid #2a343d;border-radius:8px;background:#11181f;padding:11px}.sva-detail-grid span{display:block;color:#7d8994;font-size:7px;text-transform:uppercase;letter-spacing:.08em}.sva-detail-grid strong{display:block;margin-top:5px;font-size:10px;color:#eef2f5;white-space:pre-wrap}.sva-photos{display:flex;gap:10px;margin-top:14px;flex-wrap:wrap}.sva-photo{width:180px;height:130px;border:1px solid #33414c;border-radius:9px;overflow:hidden;background:#080d11;display:block}.sva-photo img{width:100%;height:100%;object-fit:cover}@media(max-width:700px){.sva-detail-grid{grid-template-columns:1fr}.sva-photo{width:100%;max-width:280px}}
    \`}</style>

    <div className="sva-hero"><small>SITE SUPERVISION</small><h1>Site Visits</h1><p>Review field reports submitted by Employees. Each record is linked to its project and can be viewed by Admin, Manager and the relevant Client.</p></div>
    {error&&<div className="sva-details" style={{border:"1px solid #6c292e",borderRadius:9,color:"#ffaaa5"}}>{error}</div>}
    <div className="sva-toolbar">
      <input className="sva-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search visit, project, client, employee, problem…"/>
      <select className="sva-select" value={projectFilter} onChange={e=>setProjectFilter(e.target.value)}><option value="all">All projects</option>{projects.map(p=><option key={p} value={p}>{p}</option>)}</select>
      <button type="button" onClick={()=>void load()}>{loading?"Loading…":"Refresh"}</button>
      <span style={{marginLeft:"auto",color:"#7d8994",fontSize:9}}>{filtered.length} visits</span>
    </div>
    <div className="sva-list">
      {filtered.map(visit=>{
        const open=selected?.Visit_ID===visit.Visit_ID;
        const visitUrl="/api/site-visits/media?visitId="+encodeURIComponent(visit.Visit_ID)+"&kind=visit";
        const problemUrl="/api/site-visits/media?visitId="+encodeURIComponent(visit.Visit_ID)+"&kind=problem";
        return <article className="sva-row" key={visit.Visit_ID}>
          <div className="sva-row-main" onClick={()=>setSelected(open?null:visit)}>
            <div><h3>{visit.Project_ID} · {visit.Purpose||"Site Visit"}</h3><div className="sva-row-meta"><span className="sva-pill">{dateText(visit.Visit_Date)}</span><span className="sva-pill">{visit.Employee_Name||visit.Employee_ID||"Employee"}</span>{visit.Client_Name&&<span className="sva-pill">{visit.Client_Name}</span>}{visit.Location&&<span className="sva-pill">{visit.Location}</span>}{visit.Visit_Photo_Available&&<span className="sva-pill red">VISIT PHOTO</span>}{visit.Problem_Photo_Available&&<span className="sva-pill red">PROBLEM PHOTO</span>}</div><div className="sva-row-purpose">{visit.Problem_Details||visit.Action_Required||"No problem details recorded."}</div></div>
            <span className="sva-status">{visit.Status||"Completed"}</span>
          </div>
          {open&&<div className="sva-details">
            <div className="sva-detail-grid"><div><span>Purpose</span><strong>{visit.Purpose||"—"}</strong></div><div><span>Employee</span><strong>{visit.Employee_Name||visit.Employee_ID||"—"}</strong></div><div><span>Problem / Observation</span><strong>{visit.Problem_Details||"—"}</strong></div><div><span>Action Required</span><strong>{visit.Action_Required||"—"}</strong></div><div><span>Notes</span><strong>{visit.Notes||"—"}</strong></div><div><span>Created</span><strong>{dateText(visit.Created_At)}</strong></div></div>
            {(visit.Visit_Photo_Available||visit.Problem_Photo_Available)&&<div className="sva-photos">{visit.Visit_Photo_Available&&<a className="sva-photo" href={visitUrl} target="_blank" rel="noreferrer"><img src={visitUrl} alt="Site visit"/></a>}{visit.Problem_Photo_Available&&<a className="sva-photo" href={problemUrl} target="_blank" rel="noreferrer"><img src={problemUrl} alt="Problem evidence"/></a>}</div>}
          </div>}
        </article>;
      })}
      {!loading&&!filtered.length&&<div style={{padding:"50px",textAlign:"center",color:"#77848e",border:"1px dashed #34404a",borderRadius:12}}>No Site Visits match the current filter.</div>}
    </div>
  </section>;
}
