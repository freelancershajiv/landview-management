"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";
import { EmptyState, ErrorState, LoadingState, Money, PageHeader, StatusBadge, pick, formatDate } from "@/components/lv-ui";

type PublicProjectPreview={projectId?:string;coverImageUrl?:string};
type ProjectFinance={billed:number;paid:number;due:number;status:string};

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

function normalizeFinanceId(value:unknown){
  const raw=String(value||"").trim().toUpperCase();
  if(!raw)return "";
  return raw.startsWith("LV-")?raw:`LV-${raw.replace(/\D/g,"")}`;
}
function moneyNumber(value:unknown){
  const n=Number(String(value??0).replace(/,/g,"").replace(/[^0-9.-]/g,""));
  return Number.isFinite(n)?n:0;
}
function buildFinanceMap(rows:string[][]){
  const map:Record<string,ProjectFinance>={};
  rows.forEach(row=>{
    const id=normalizeFinanceId(row[0]);
    if(!id)return;
    const gross=moneyNumber(row[3])+moneyNumber(row[7])+moneyNumber(row[11]);
    const discount=moneyNumber(row[4])+moneyNumber(row[8])+moneyNumber(row[12]);
    const paid=moneyNumber(row[5])+moneyNumber(row[9])+moneyNumber(row[13]);
    const due=moneyNumber(row[15]);
    map[id]={billed:gross-discount,paid,due,status:String(row[16]||"").trim()||(due>0?"Due":"Full Paid")};
  });
  return map;
}

export default function ProjectsPage(){
  const [projects,setProjects]=useState<any[]>([]);
  const [previews,setPreviews]=useState<Record<string,string>>({});
  const [finance,setFinance]=useState<Record<string,ProjectFinance>>({});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");

  async function load(){
    setLoading(true);setError("");
    try{
      const [rows,documents,summary]=await Promise.all([
        landViewApi.getProjects(),
        landViewApi.getDocuments().catch(()=>[]),
        landViewApi.getFinanceSheet("Summary").catch(()=>null),
      ]);
      setProjects(rows);
      setFinance(summary?buildFinanceMap(summary.rows):{});

      const map=buildDocumentPreviewMap(documents);

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
      .project-finance-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:16px 0 2px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08)}
      .project-finance-strip div{min-width:0;padding:9px;border-radius:7px;background:#171f26}
      .project-finance-strip span{display:block;color:#7f8991;font-size:7px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
      .project-finance-strip strong{display:block;margin-top:5px;color:#f1f3f4;font-size:10px;overflow-wrap:anywhere}
      .project-finance-strip .project-due strong{color:#ff8c83}
      .project-finance-status{display:inline-flex;margin-top:10px;padding:5px 8px;border-radius:5px;background:#333;color:#bbb;font-size:8px;font-weight:700}
      .project-finance-status.paid{background:#223b2c;color:#a7dfba}.project-finance-status.due{background:#472824;color:#ff9a91}
    `}</style>

    <PageHeader eyebrow="PROJECT CONTROL" title="Projects" description="Manage every LAND VIEW project from one workspace with live finance status." action={<Link className="btn btn-dark" href="/admin/projects/new">+ New project</Link>}/>
    <div className="toolbar"><div className="search-box"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search project, client, location..."/></div><div className="toolbar-count">{filtered.length} records</div></div>

    {loading?<LoadingState label="Loading projects..."/>:error?<ErrorState message={error} onRetry={load}/>:!projects.length?<EmptyState title="No projects yet" text="Create the first LAND VIEW project." href="/admin/projects/new" action="Create project"/>:<div className="project-grid">
      {filtered.map((p,i)=>{
        const id=pick(p,["Project_ID","Project ID","ProjectId"],`Project-${i+1}`);
        const cover=previews[id];
        const account=finance[normalizeFinanceId(id)];
        return <Link href={`/admin/projects/${encodeURIComponent(id)}`} className="project-card admin-project-card" key={id}>
          {cover&&<div className="admin-project-preview"><img src={cover} alt={`${pick(p,["Project_Name","Project Name","Name"],id)} preview`}/><span className="admin-project-preview-badge">3D EXTERIOR</span></div>}
          <div className="admin-project-body">
            <div className="project-card-top"><span className="project-index">{String(i+1).padStart(2,"0")}</span><StatusBadge value={pick(p,["Status","status","Active"],"Active")}/></div>
            <h3>{pick(p,["Project_Name","Project Name","Name","Project_Type","Project Type"],id)}</h3>
            <p>{pick(p,["Location","Address","Project_Location"],"Location not set")}</p>
            <div className="project-meta"><div><span>PROJECT ID</span><strong>{id}</strong></div><div><span>CLIENT</span><strong>{pick(p,["Client_Name","Client Name","Client"],"—")}</strong></div></div>
            {account&&<><div className="project-finance-strip"><div><span>Billed</span><strong><Money value={account.billed}/></strong></div><div><span>Received</span><strong><Money value={account.paid}/></strong></div><div className="project-due"><span>Due</span><strong><Money value={account.due}/></strong></div></div><span className={`project-finance-status ${account.due>0?"due":"paid"}`}>{account.status}</span></>}
            <div className="project-card-foot"><span>{formatDate(p.Start_Date||p["Start Date"]||p.Created_Date)}</span><b>Open project →</b></div>
          </div>
        </Link>;
      })}
    </div>}
  </>;
}
