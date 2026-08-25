"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, pick, formatDate } from "@/components/lv-ui";

type PublicProjectPreview={projectId?:string;coverImageUrl?:string};

function imageUrl(url?:string){
  const value=String(url||"").trim(); if(!value)return "";
  const fileMatch=value.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  if(fileMatch?.[1])return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileMatch[1])}&sz=w1200`;
  try{const parsed=new URL(value);if(parsed.hostname==="drive.google.com"){const id=parsed.searchParams.get("id");if(id)return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1200`;}}catch{}
  return value;
}

export default function ProjectsPage(){
  const [projects,setProjects]=useState<any[]>([]); const [previews,setPreviews]=useState<Record<string,string>>({}); const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [query,setQuery]=useState("");
  async function load(){setLoading(true);setError("");try{
    const rows=await landViewApi.getProjects(); setProjects(rows);
    try{const response=await fetch("/api/public/projects",{cache:"no-store"});const json=await response.json();const publicRows:PublicProjectPreview[]=Array.isArray(json?.data)?json.data:Array.isArray(json)?json:[];const map:Record<string,string>={};publicRows.forEach(p=>{const id=String(p.projectId||"").trim();const cover=imageUrl(p.coverImageUrl);if(id&&cover)map[id]=cover;});setPreviews(map);}catch{setPreviews({});}
  }catch(e:any){setError(e?.message||"Could not load projects.");}finally{setLoading(false)}}
  useEffect(()=>{load()},[]);
  const filtered=useMemo(()=>projects.filter(p=>JSON.stringify(p).toLowerCase().includes(query.toLowerCase())),[projects,query]);
  return <>
    <style>{`.admin-project-preview{position:relative;height:210px;margin:-1px -1px 18px;overflow:hidden;border-bottom:1px solid rgba(255,255,255,.09);background:linear-gradient(135deg,#111e28,#071019)}.admin-project-preview img{width:100%;height:100%;display:block;object-fit:cover;transition:transform .45s ease}.project-card:hover .admin-project-preview img{transform:scale(1.035)}.admin-project-preview-empty{position:absolute;inset:0;display:grid;place-items:center;color:rgba(214,166,44,.45);font-size:10px;font-weight:800;letter-spacing:.16em}.admin-project-preview-empty:before{content:"LV";font-family:Georgia,serif;font-size:58px;color:rgba(214,166,44,.08);position:absolute}.admin-project-preview-badge{position:absolute;left:14px;bottom:12px;padding:6px 8px;border:1px solid rgba(214,166,44,.28);border-radius:5px;background:rgba(4,12,18,.82);color:#d6a62c;font-size:8px;font-weight:800;letter-spacing:.1em}`}</style>
    <PageHeader eyebrow="PROJECT CONTROL" title="Projects" description="Manage every LAND VIEW project from one workspace." action={<Link className="btn btn-dark" href="/admin/projects/new">+ New project</Link>}/>
    <div className="toolbar"><div className="search-box"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search project, client, location..."/></div><div className="toolbar-count">{filtered.length} records</div></div>
    {loading?<LoadingState label="Loading projects..."/>:error?<ErrorState message={error} onRetry={load}/>:!projects.length?<EmptyState title="No projects yet" text="Create the first LAND VIEW project." href="/admin/projects/new" action="Create project"/>:<div className="project-grid">
      {filtered.map((p,i)=>{const id=pick(p,["Project_ID","Project ID","ProjectId"],`Project-${i+1}`);const cover=previews[id];return <Link href={`/admin/projects/${encodeURIComponent(id)}`} className="project-card" key={id}>
        <div className="admin-project-preview">{cover?<img src={cover} alt={`${pick(p,["Project_Name","Project Name","Name"],id)} preview`}/>:<div className="admin-project-preview-empty">PROJECT PREVIEW</div>}<span className="admin-project-preview-badge">3D EXTERIOR</span></div>
        <div className="project-card-top"><span className="project-index">{String(i+1).padStart(2,"0")}</span><StatusBadge value={pick(p,["Status","status","Active"],"Active")}/></div>
        <h3>{pick(p,["Project_Name","Project Name","Name","Project_Type","Project Type"],id)}</h3><p>{pick(p,["Location","Address","Project_Location"],"Location not set")}</p>
        <div className="project-meta"><div><span>PROJECT ID</span><strong>{id}</strong></div><div><span>CLIENT</span><strong>{pick(p,["Client_Name","Client Name","Client"],"—")}</strong></div></div>
        <div className="project-card-foot"><span>{formatDate(p.Start_Date||p["Start Date"]||p.Created_Date)}</span><b>Open project →</b></div>
      </Link>})}
    </div>}
  </>;
}
