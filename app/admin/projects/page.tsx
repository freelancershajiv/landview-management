"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";
import { EmptyState, ErrorState, LoadingState, PageHeader, StatusBadge, pick, formatDate } from "@/components/lv-ui";

export default function ProjectsPage() {
  const [projects,setProjects]=useState<any[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [query,setQuery]=useState("");
  async function load(){setLoading(true);setError("");try{setProjects(await landViewApi.getProjects());}catch(e:any){setError(e?.message||"Could not load projects.");}finally{setLoading(false)}}
  useEffect(()=>{load()},[]);
  const filtered=useMemo(()=>projects.filter(p=>JSON.stringify(p).toLowerCase().includes(query.toLowerCase())),[projects,query]);
  return <>
    <PageHeader eyebrow="PROJECT CONTROL" title="Projects" description="Manage every LAND VIEW project from one workspace." action={<Link className="btn btn-dark" href="/admin/projects/new">+ New project</Link>}/>
    <div className="toolbar"><div className="search-box"><span>⌕</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search project, client, location..."/></div><div className="toolbar-count">{filtered.length} records</div></div>
    {loading ? <LoadingState label="Loading projects..."/> : error ? <ErrorState message={error} onRetry={load}/> : !projects.length ? <EmptyState title="No projects yet" text="Create the first LAND VIEW project." href="/admin/projects/new" action="Create project"/> : <div className="project-grid">
      {filtered.map((p,i)=>{const id=pick(p,["Project_ID","Project ID","ProjectId"],`Project-${i+1}`);return <Link href={`/admin/projects/${encodeURIComponent(id)}`} className="project-card" key={id}>
        <div className="project-card-top"><span className="project-index">{String(i+1).padStart(2,"0")}</span><StatusBadge value={pick(p,["Status","status","Active"],"Active")}/></div>
        <h3>{pick(p,["Project_Name","Project Name","Name","Project_Type","Project Type"],id)}</h3><p>{pick(p,["Location","Address","Project_Location"],"Location not set")}</p>
        <div className="project-meta"><div><span>PROJECT ID</span><strong>{id}</strong></div><div><span>CLIENT</span><strong>{pick(p,["Client_Name","Client Name","Client"],"—")}</strong></div></div>
        <div className="project-card-foot"><span>{formatDate(p.Start_Date || p["Start Date"] || p.Created_Date)}</span><b>Open project →</b></div>
      </Link>})}
    </div>}
  </>;
}
