"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";
import { EmptyState, ErrorState, LoadingState, PageHeader, pick } from "@/components/lv-ui";

type Task = Record<string, unknown>;
type Filter = "All" | "Pending" | "In Progress" | "Blocked" | "Completed";

function value(row:Task, keys:string[]){ return String(pick(row, keys, "") || "").trim(); }
function normalizeId(input:unknown){ const raw=String(input||"").trim().toUpperCase(); const digits=raw.replace(/\D/g,""); return digits?`LV-${Number(digits)}`:raw; }
function taskId(task:Task){ return value(task,["Task_ID","Task ID","TaskId"]); }
function taskTitle(task:Task){ return value(task,["Task_Title","Task Title","Title"]); }
function isAutoTask(task:Task){ const id=taskId(task); return !id || id.startsWith("AUTO::"); }

async function saveWorkflow(payload:Record<string,unknown>){
  const response=await fetch("/api/workflow",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    credentials:"same-origin",
    cache:"no-store",
    body:JSON.stringify(payload),
  });
  const text=await response.text();
  let json:any;
  try{json=JSON.parse(text);}catch{throw new Error(/^\s*</.test(text)?"Apps Script returned HTML instead of JSON.":"Workflow save returned an invalid response.");}
  if(!response.ok||!json?.success)throw new Error(String(json?.error||json?.message||"Could not save workflow status."));
  return (json.data||{}) as Task;
}

export default function WorkflowPage(){
  const [tasks,setTasks]=useState<Task[]>([]);
  const [projects,setProjects]=useState<Record<string,string>>({});
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState<Filter>("All");
  const [saving,setSaving]=useState<Record<string,boolean>>({});

  async function load(){
    setLoading(true);setError("");
    try{
      const [taskRows,fileList]=await Promise.all([
        landViewApi.getErpRecords("tasks"),
        landViewApi.getFinanceSheet("File List").catch(()=>null),
      ]);
      const projectMap:Record<string,string>={};
      (fileList?.rows||[]).forEach(row=>{
        const id=normalizeId(row[0]);
        const name=String(row[1]||"").trim();
        if(id&&name)projectMap[id]=name;
      });
      setProjects(projectMap);
      setTasks((taskRows||[]).filter(task=>normalizeId(value(task,["Project_ID","Project ID","ProjectId"]))));
    }catch(e:any){
      setError(e?.message||"Could not load workflow records.");
    }finally{setLoading(false);}
  }

  useEffect(()=>{void load()},[]);

  const counts=useMemo(()=>{
    const result={All:tasks.length,Pending:0,"In Progress":0,Blocked:0,Completed:0} as Record<Filter,number>;
    tasks.forEach(task=>{
      const status=value(task,["Status","status"]) as Filter;
      if(status in result)result[status]++;
    });
    return result;
  },[tasks]);

  const rows=useMemo(()=>{
    const term=query.trim().toLowerCase();
    return tasks.filter(task=>{
      const projectId=normalizeId(value(task,["Project_ID","Project ID","ProjectId"]));
      const status=value(task,["Status","status"])||"Pending";
      if(filter!=="All"&&status!==filter)return false;
      const haystack=[projectId,projects[projectId],taskTitle(task),value(task,["Assigned_Employee_ID","Assigned Employee ID"]),status].join(" ").toLowerCase();
      return !term||haystack.includes(term);
    }).sort((a,b)=>{
      const aId=Number(normalizeId(value(a,["Project_ID","Project ID","ProjectId"])).replace("LV-",""));
      const bId=Number(normalizeId(value(b,["Project_ID","Project ID","ProjectId"])).replace("LV-",""));
      return bId-aId;
    });
  },[tasks,projects,query,filter]);

  const projectProgress=useMemo(()=>{
    const grouped:Record<string,{done:number;total:number}>={};
    tasks.forEach(task=>{
      const id=normalizeId(value(task,["Project_ID","Project ID","ProjectId"]));
      if(!id)return;
      grouped[id] ||= {done:0,total:0};
      grouped[id].total++;
      if(value(task,["Status","status"]).toLowerCase()==="completed")grouped[id].done++;
    });
    return grouped;
  },[tasks]);

  function replaceTask(original:Task,saved:Task){
    const originalId=taskId(original);
    const projectId=normalizeId(value(original,["Project_ID","Project ID","ProjectId"]));
    const title=taskTitle(original);
    setTasks(current=>current.map(row=>{
      const sameId=originalId&&taskId(row)===originalId;
      const sameSynthetic=!originalId||originalId.startsWith("AUTO::")
        ? normalizeId(value(row,["Project_ID","Project ID","ProjectId"]))===projectId&&taskTitle(row)===title
        : false;
      return sameId||sameSynthetic?{...row,...saved}:row;
    }));
  }

  async function completeService(task:Task){
    const projectId=normalizeId(value(task,["Project_ID","Project ID","ProjectId"]));
    const title=taskTitle(task);
    const key=`service:${projectId}:${title}`;
    if(saving[key])return;
    setSaving(v=>({...v,[key]:true}));setError("");
    try{
      const base={
        Project_ID:projectId,
        Project_Name:projects[projectId]||value(task,["Project_Name","Project Name"]),
        Task_Title:title,
        Assigned_Employee_ID:value(task,["Assigned_Employee_ID","Assigned Employee ID"]),
        Start_Date:value(task,["Start_Date","Start Date"]),
        Due_Date:value(task,["Due_Date","Due Date"]),
        Status:"Completed",
        Progress:100,
        Description:value(task,["Description","Notes"]),
        Completed_At:new Date().toISOString(),
      };
      const saved=isAutoTask(task)
        ? await saveWorkflow({workflowOp:"create",...base})
        : await saveWorkflow({workflowOp:"update",id:taskId(task),...base});
      replaceTask(task,saved);
    }catch(e:any){setError(e?.message||"Could not mark service complete.");}
    finally{setSaving(v=>({...v,[key]:false}));}
  }

  async function completeProject(projectId:string){
    const id=normalizeId(projectId);
    const projectTasks=tasks.filter(task=>normalizeId(value(task,["Project_ID","Project ID","ProjectId"]))===id);
    const remaining=projectTasks.filter(task=>value(task,["Status","status"]).toLowerCase()!=="completed");
    if(!remaining.length)return;
    if(!window.confirm(`Mark all ${remaining.length} remaining workflow services for ${id} as completed?`))return;
    const key=`project:${id}`;
    if(saving[key])return;
    setSaving(v=>({...v,[key]:true}));setError("");
    try{
      for(const task of remaining){
        const title=taskTitle(task);
        const base={
          Project_ID:id,
          Project_Name:projects[id]||value(task,["Project_Name","Project Name"]),
          Task_Title:title,
          Assigned_Employee_ID:value(task,["Assigned_Employee_ID","Assigned Employee ID"]),
          Start_Date:value(task,["Start_Date","Start Date"]),
          Due_Date:value(task,["Due_Date","Due Date"]),
          Status:"Completed",
          Progress:100,
          Description:value(task,["Description","Notes"]),
          Completed_At:new Date().toISOString(),
        };
        const saved=isAutoTask(task)
          ? await saveWorkflow({workflowOp:"create",...base})
          : await saveWorkflow({workflowOp:"update",id:taskId(task),...base});
        replaceTask(task,saved);
      }
    }catch(e:any){setError(e?.message||`Could not complete ${id}.`);}
    finally{setSaving(v=>({...v,[key]:false}));}
  }

  return <>
    <style>{`
      .wf-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:18px}.wf-card{padding:16px;border:1px solid rgba(255,255,255,.09);border-radius:10px;background:#171f27}.wf-card span{display:block;color:#8f9aa3;font-size:8px;text-transform:uppercase;letter-spacing:.09em}.wf-card strong{display:block;margin-top:7px;color:#fff;font-size:20px}.wf-filters{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}.wf-filters button{border:1px solid rgba(255,255,255,.12);background:#171f27;color:#aeb7be;border-radius:999px;padding:8px 12px;font-size:10px;font-weight:700;cursor:pointer}.wf-filters button.active{background:#ef493b;border-color:#ef493b;color:#fff}.wf-filters b{margin-left:6px}.wf-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:14px}.wf-toolbar input{width:min(420px,100%);background:#151d24;border:1px solid rgba(255,255,255,.12);border-radius:8px;color:#fff;padding:10px 12px}.wf-table{overflow:auto;border:1px solid rgba(255,255,255,.08);border-radius:10px}.wf-table table{width:100%;border-collapse:collapse;min-width:1120px}.wf-table th,.wf-table td{padding:11px 12px;border-bottom:1px solid rgba(255,255,255,.07);text-align:left;font-size:10px;color:#ccd2d7}.wf-table th{color:#7f8991;font-size:8px;text-transform:uppercase;letter-spacing:.08em;background:#11181e}.wf-table tr:last-child td{border-bottom:0}.wf-status{display:inline-flex;padding:5px 8px;border-radius:999px;background:#303840;color:#c7cdd1;font-size:8px;font-weight:800}.wf-status.completed{background:#21382a;color:#a9deb8}.wf-status.blocked{background:#472824;color:#ff9a91}.wf-status.in-progress{background:#453a20;color:#f1cc76}.wf-progress{min-width:130px}.wf-progress-bar{height:6px;background:#303840;border-radius:999px;overflow:hidden}.wf-progress-bar i{display:block;height:100%;background:#ef493b}.wf-progress small{display:block;margin-top:4px;color:#7f8991}.wf-link{color:#f07a70;font-weight:700}.wf-stage{font-weight:700;color:#f2f4f5}.wf-empty-name{color:#727d85}.wf-actions{display:flex;gap:6px;flex-wrap:wrap;min-width:210px}.wf-action{border:1px solid rgba(255,255,255,.14);background:#202932;color:#d9dee2;border-radius:7px;padding:7px 9px;font-size:8px;font-weight:800;cursor:pointer;white-space:nowrap}.wf-action:hover{border-color:#ef493b;color:#fff}.wf-action.complete{background:#21382a;border-color:#31513d;color:#a9deb8}.wf-action.project{background:#472824;border-color:#67352f;color:#ffb0a9}.wf-action:disabled{opacity:.45;cursor:not-allowed}@media(max-width:900px){.wf-summary{grid-template-columns:repeat(2,1fr)}.wf-toolbar{align-items:stretch;flex-direction:column}.wf-toolbar input{width:100%}}@media(max-width:520px){.wf-summary{grid-template-columns:1fr 1fr}}
    `}</style>

    <PageHeader eyebrow="PROJECT DELIVERY" title="Workflow" description="Manage billed project services from one admin view. Complete an individual service or finish a project's remaining workflow in one action." />

    <section className="wf-summary">
      <div className="wf-card"><span>Workflow records</span><strong>{tasks.length}</strong></div>
      <div className="wf-card"><span>Projects tracked</span><strong>{Object.keys(projectProgress).length}</strong></div>
      <div className="wf-card"><span>In progress</span><strong>{counts["In Progress"]}</strong></div>
      <div className="wf-card"><span>Completed</span><strong>{counts.Completed}</strong></div>
    </section>

    <div className="wf-filters">{(["All","Pending","In Progress","Blocked","Completed"] as const).map(item=><button type="button" key={item} className={filter===item?"active":""} onClick={()=>setFilter(item)}>{item}<b>{counts[item]}</b></button>)}</div>

    <div className="wf-toolbar"><input type="search" placeholder="Search File ID, project, stage or employee..." value={query} onChange={e=>setQuery(e.target.value)}/><span>{rows.length} records</span></div>

    {loading?<LoadingState label="Loading project workflow..."/>:error?<><ErrorState message={error} onRetry={load}/>{tasks.length?null:null}</>:!tasks.length?<EmptyState title="No workflow records" text="Workflow services appear automatically from billed project services." href="/admin/projects" action="Open projects"/>:<div className="wf-table"><table><thead><tr><th>Project</th><th>Stage</th><th>Assigned</th><th>Status</th><th>Project Progress</th><th>Quick actions</th><th>Open</th></tr></thead><tbody>{rows.map((task,index)=>{const id=normalizeId(value(task,["Project_ID","Project ID","ProjectId"]));const status=value(task,["Status","status"])||"Pending";const progress=projectProgress[id]||{done:0,total:0};const pct=progress.total?Math.round(progress.done/progress.total*100):0;const serviceKey=`service:${id}:${taskTitle(task)}`;const projectKey=`project:${id}`;const completed=status.toLowerCase()==="completed";return <tr key={`${id}-${taskId(task)||taskTitle(task)}-${index}`}><td><strong>{id}</strong><br/><span className={projects[id]?"":"wf-empty-name"}>{projects[id]||"Project name not found in File List"}</span></td><td className="wf-stage">{taskTitle(task)||"—"}</td><td>{value(task,["Assigned_Employee_ID","Assigned Employee ID"])||"Unassigned"}</td><td><span className={`wf-status ${status.toLowerCase().replace(/\s+/g,"-")}`}>{status}</span></td><td><div className="wf-progress"><div className="wf-progress-bar"><i style={{width:`${pct}%`}}/></div><small>{progress.done}/{progress.total} completed · {pct}%</small></div></td><td><div className="wf-actions"><button type="button" className="wf-action complete" disabled={completed||saving[serviceKey]||saving[projectKey]} onClick={()=>void completeService(task)}>{completed?"Completed":saving[serviceKey]?"Saving…":"✓ Complete service"}</button><button type="button" className="wf-action project" disabled={pct===100||saving[projectKey]} onClick={()=>void completeProject(id)}>{pct===100?"Project complete":saving[projectKey]?"Completing…":"✓ Complete project"}</button></div></td><td><Link className="wf-link" href={`/admin/projects/${encodeURIComponent(id)}`}>Open project →</Link></td></tr>})}</tbody></table></div>}
  </>;
}
