"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, pick, formatDate } from "@/components/lv-ui";

type PublicProjectPreview={projectId?:string;coverImageUrl?:string};

function imageUrl(url?:string){
  const value=String(url||"").trim();
  if(!value)return "";
  const fileMatch=value.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  if(fileMatch?.[1])return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileMatch[1])}&sz=w1200`;
  try{
    const parsed=new URL(value);
    if(parsed.hostname==="drive.google.com"){
      const id=parsed.searchParams.get("id");
      if(id)return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1200`;
    }
  }catch{}
  return value;
}

function isExteriorDocument(document:any){
  const type=String(pick(document,["Document_Type","Document Type","Type"],"")).trim().toLowerCase();
  const name=String(pick(document,["Document_Name","Document Name","Name"],"")).trim().toLowerCase();
  return type==="3d design - exterior" && /\.(jpe?g|png|webp)$/i.test(name);
}

function buildDocumentPreviewMap(documents:any[]){
  const grouped:Record<string,any[]>={};
  documents.filter(isExteriorDocument).forEach(document=>{
    const projectId=String(pick(document,["Project_ID","Project ID","ProjectId"],"")).trim();
    if(!projectId)return;
    (grouped[projectId] ||= []).push(document);
  });

  const map:Record<string,string>={};
  Object.entries(grouped).forEach(([projectId,rows])=>{
    rows.sort((a,b)=>{
      const an=String(pick(a,["Document_Name","Document Name","Name"],""));
      const bn=String(pick(b,["Document_Name","Document Name","Name"],""));
      const af=/^front\.(jpe?g|png|webp)$/i.test(an)?0:1;
      const bf=/^front\.(jpe?g|png|webp)$/i.test(bn)?0:1;
      return af-bf || an.localeCompare(bn,undefined,{numeric:true,sensitivity:"base"});
    });
    const fileUrl=String(pick(rows[0],["File_URL","File URL","URL","Document_URL"],""));
    const cover=imageUrl(fileUrl);
    if(cover)map[projectId]=cover;
  });
  return map;
}

export default function ProjectsPage(){
  const [projects,setProjects]=useState<any[]>([]);
  const [previews,setPreviews]=useState<Record<string,string>>({});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");

  async function load(){
    setLoading(true);setError("");
    try{
      const [rows,documents]=await Promise.all([
        landViewApi.getProjects(),
        landViewApi.getDocuments().catch(()=>[]),
      ]);
      setProjects(rows);

      const map=buildDocumentPreviewMap(documents);

      // Public portfolio data is only a fallback. Admin previews do not depend on
      // the project being publicly visible when an uploaded document record exists.
      try{
        const response=await fetch("/api/public/projects",{cache:"no-store"});
        const json=await response.json();
        const publicRows:PublicProjectPreview[]=Array.isArray(json?.data)?json.data:Array.isArray(json)?json:[];
        publicRows.forEach(p=>{
          const id=String(p.projectId||"").trim();
          const cover=imageUrl(p.coverImageUrl);
          if(id&&cover&&!map[id])map[id]=cover;
        });
      }catch{}

      setPreviews(map);
    }catch(e:any){
      setError(e?.message||"Could not load projects.");
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{load()},[]);
  const filtered=useMemo(()=>projects.filter(p=>JSON.stringify(p).toLowerCase().includes(query.toLowerCase())),[projects,query]);

  return <>
    <style>{`
      .admin-project-card{overflow:hidden!important;padding:0!important;background:#0d1822!important;border:1px solid rgba(255,255,255,.12)!important}
      .admin-project-card::before,.admin-project-card::after{display:none!important;content:none!important}
      .admin-project-preview{position:relative;height:220px;overflow:hidden;border-bottom:1px solid rgba(255,255,255,.09);background:#0b151e}
      .admin-project-preview img{width:100%;height:100%;display:block;object-fit:cover;object-position:center;transition:transform .45s ease}
      .admin-project-card:hover .admin-project-preview img{transform:scale(1.035)}
      .admin-project-preview-badge{position:absolute;left:16px;bottom:14px;padding:6px 9px;border:1px solid rgba(214,166,44,.35);border-radius:6px;background:rgba(4,12,18,.86);color:#d6a62c;font-size:8px;font-weight:800;letter-spacing:.1em}
      .admin-project-body{padding:20px 22px 18px}
      .admin-project-card .project-card-top{margin:0 0 18px!important}
      .admin-project-card h3{margin-top:0!important}
      .admin-project-card .project-card-foot{margin-bottom:0!important}
    `}</style>

    <PageHeader eyebrow="PROJECT CONTROL" title="Projects" description="Manage every LAND VIEW project from one workspace." action={<Link className="btn btn-dark" href="/admin/projects/new">+ New project</Link>}/>
    <div className="toolbar"><div className="search-box"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search project, client, location..."/></div><div className="toolbar-count">{filtered.length} records</div></div>

    {loading?<LoadingState label="Loading projects..."/>:error?<ErrorState message={error} onRetry={load}/>:!projects.length?<EmptyState title="No projects yet" text="Create the first LAND VIEW project." href="/admin/projects/new" action="Create project"/>:<div className="project-grid">
      {filtered.map((p,i)=>{
        const id=pick(p,["Project_ID","Project ID","ProjectId"],`Project-${i+1}`);
        const cover=previews[id];
        return <Link href={`/admin/projects/${encodeURIComponent(id)}`} className="project-card admin-project-card" key={id}>
          {cover&&<div className="admin-project-preview"><img src={cover} alt={`${pick(p,["Project_Name","Project Name","Name"],id)} preview`}/><span className="admin-project-preview-badge">3D EXTERIOR</span></div>}
          <div className="admin-project-body">
            <div className="project-card-top"><span className="project-index">{String(i+1).padStart(2,"0")}</span><StatusBadge value={pick(p,["Status","status","Active"],"Active")}/></div>
            <h3>{pick(p,["Project_Name","Project Name","Name","Project_Type","Project Type"],id)}</h3>
            <p>{pick(p,["Location","Address","Project_Location"],"Location not set")}</p>
            <div className="project-meta"><div><span>PROJECT ID</span><strong>{id}</strong></div><div><span>CLIENT</span><strong>{pick(p,["Client_Name","Client Name","Client"],"—")}</strong></div></div>
            <div className="project-card-foot"><span>{formatDate(p.Start_Date||p["Start Date"]||p.Created_Date)}</span><b>Open project →</b></div>
          </div>
        </Link>;
      })}
    </div>}
  </>;
}
