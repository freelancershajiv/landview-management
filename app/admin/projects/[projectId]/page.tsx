"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { landViewApi } from "@/lib/api";
import { ErrorState, Field, LoadingState, Money, PageHeader, StatusBadge, formatDate, pick } from "@/components/lv-ui";

export default function ProjectDetailPage(){
 const params=useParams<{projectId:string}>(); const router=useRouter(); const projectId=decodeURIComponent(String(params.projectId||""));
 const [project,setProject]=useState<any>(null); const [employees,setEmployees]=useState<any[]>([]); const [assigned,setAssigned]=useState<string[]>([]); const [billing,setBilling]=useState<any>(null); const [drive,setDrive]=useState<any>(null); const [visits,setVisits]=useState<any[]>([]); const [documents,setDocuments]=useState<any[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [editing,setEditing]=useState(false); const [draft,setDraft]=useState<any>({}); const [savingTeam,setSavingTeam]=useState(false);
 async function load(){setLoading(true);setError("");try{const [p,allEmp,assignedEmp,bill,folder,sv,docs]=await Promise.all([landViewApi.getProject(projectId),landViewApi.getEmployees(),landViewApi.getProjectEmployees(projectId),landViewApi.getProjectBilling(projectId),landViewApi.getProjectDriveFolder(projectId),landViewApi.getSiteVisits(projectId),landViewApi.getDocuments(projectId)]);setProject(p);setDraft(p);setEmployees(allEmp);setAssigned(assignedEmp.map((e:any)=>pick(e,["Employee_ID","Employee ID","EmployeeId"])).filter(Boolean));setBilling(bill);setDrive(folder);setVisits(sv);setDocuments(docs);}catch(e:any){setError(e?.message||"Could not load project.");}finally{setLoading(false)}}
 useEffect(()=>{if(projectId)load()},[projectId]);
 async function saveEdit(e:FormEvent){e.preventDefault();try{await landViewApi.updateProject(projectId,draft);setEditing(false);await load();}catch(e:any){setError(e?.message||"Update failed.")}}
 async function saveTeam(){setSavingTeam(true);try{await landViewApi.updateProjectEmployees(projectId,assigned);await load();}catch(e:any){setError(e?.message||"Could not update team.");}finally{setSavingTeam(false)}}
 async function remove(){if(!window.confirm(`Delete ${projectId}? This deletes the project row.`))return;try{await landViewApi.deleteProject(projectId);router.push("/admin/projects");}catch(e:any){setError(e?.message||"Delete failed.")}}
 if(loading)return <LoadingState label="Loading project..."/>; if(error&&!project)return <ErrorState message={error} onRetry={load}/>;
 const title=pick(project,["Project_Name","Project Name","Name","Project_Type","Project Type"],projectId);
 return <>
  <PageHeader eyebrow={projectId} title={title} description={`${pick(project,["Client_Name","Client Name","Client"],"No client")} · ${pick(project,["Location","Address"],"Location not set")}`} action={<div className="button-row"><button className="btn btn-light" onClick={()=>setEditing(v=>!v)}>{editing?"Close edit":"Edit project"}</button>{drive?.url&&<a className="btn btn-dark" href={drive.url} target="_blank" rel="noreferrer">Drive folder ↗</a>}</div>}/>
  {error&&<div className="notice error"><strong>Notice</strong><span>{error}</span></div>}
  <div className="project-detail-grid">
   <section className="card project-summary"><div className="section-title"><div><span>PROJECT PROFILE</span><h2>Overview</h2></div><StatusBadge value={pick(project,["Status","status","Active"],"Active")}/></div>
    <div className="detail-list"><div><span>Client</span><strong>{pick(project,["Client_Name","Client Name"],"—")}</strong></div><div><span>Phone</span><strong>{pick(project,["Phone_Number","Phone Number","Phone"],"—")}</strong></div><div><span>Type</span><strong>{pick(project,["Project_Type","Project Type"],"—")}</strong></div><div><span>Start date</span><strong>{formatDate(project.Start_Date||project["Start Date"])}</strong></div><div><span>Public website</span><strong>{String(pick(project,["Public_Display","Public Display"],"FALSE")).toUpperCase()==="TRUE"?"Visible":"Hidden"}</strong></div></div>
   </section>
   <section className="card card-dark finance-mini"><div className="card-kicker">PROJECT FINANCE</div><div className="finance-number"><Money value={billing?.due||0}/></div><p>Outstanding balance</p><div className="detail-list dark-list"><div><span>Total billed</span><strong><Money value={billing?.totalBill||0}/></strong></div><div><span>Total paid</span><strong><Money value={billing?.totalPaid||0}/></strong></div></div><Link href="/admin/finance">Manage finance →</Link></section>
  </div>
  {editing&&<form className="card form-card compact" onSubmit={saveEdit}>
   <div className="section-title"><div><span>EDIT</span><h2>Project details</h2></div></div>
   <div className="form-grid">
    {[['Project_Name','PROJECT NAME'],['Client_Name','CLIENT NAME'],['Phone_Number','PHONE'],['Project_Type','PROJECT TYPE'],['Location','LOCATION'],['Design_Bill','DESIGN BILL'],['Status','STATUS'],['Start_Date','START DATE']].map(([key,label])=><Field key={key} label={label}><input type={key==='Start_Date'?'date':'text'} value={String(draft?.[key]??'')} onChange={e=>setDraft((v:any)=>({...v,[key]:e.target.value}))}/></Field>)}
   </div>
   <div className="form-section">
    <div><span>PUBLIC</span><h2>Website portfolio</h2><p>Only public fields below are exposed on the LAND VIEW website.</p></div>
    <div className="form-grid">
     <Field label="SHOW ON WEBSITE"><select value={String(draft?.Public_Display??'FALSE')} onChange={e=>setDraft((v:any)=>({...v,Public_Display:e.target.value}))}><option value="FALSE">No</option><option value="TRUE">Yes</option></select></Field>
     <Field label="PUBLIC PROJECT TITLE"><input value={String(draft?.Public_Project_Title??'')} onChange={e=>setDraft((v:any)=>({...v,Public_Project_Title:e.target.value}))}/></Field>
     <Field label="CATEGORY"><input value={String(draft?.Project_Category??'')} onChange={e=>setDraft((v:any)=>({...v,Project_Category:e.target.value}))}/></Field>
     <Field label="PROJECT AREA"><input value={String(draft?.Project_Area??'')} onChange={e=>setDraft((v:any)=>({...v,Project_Area:e.target.value}))}/></Field>
     <Field label="NUMBER OF STORIES"><input value={String(draft?.Number_of_Stories??'')} onChange={e=>setDraft((v:any)=>({...v,Number_of_Stories:e.target.value}))}/></Field>
     <Field label="COMPLETION YEAR"><input value={String(draft?.Completion_Year??'')} onChange={e=>setDraft((v:any)=>({...v,Completion_Year:e.target.value}))}/></Field>
     <Field label="COVER IMAGE URL"><input value={String(draft?.Cover_Image_URL??'')} onChange={e=>setDraft((v:any)=>({...v,Cover_Image_URL:e.target.value}))}/></Field>
     <Field label="DISPLAY ORDER"><input type="number" value={String(draft?.Public_Display_Order??'')} onChange={e=>setDraft((v:any)=>({...v,Public_Display_Order:e.target.value}))}/></Field>
     <Field label="SERVICES" hint="Separate with • or new lines"><textarea rows={4} value={String(draft?.Public_Services??'')} onChange={e=>setDraft((v:any)=>({...v,Public_Services:e.target.value}))}/></Field>
     <Field label="GALLERY IMAGE URLS" hint="One URL per line"><textarea rows={4} value={String(draft?.Gallery_Images??'')} onChange={e=>setDraft((v:any)=>({...v,Gallery_Images:e.target.value}))}/></Field>
     <Field label="PUBLIC DESCRIPTION"><textarea rows={5} value={String(draft?.Public_Description??'')} onChange={e=>setDraft((v:any)=>({...v,Public_Description:e.target.value}))}/></Field>
    </div>
   </div>
   <div className="form-actions"><button type="button" onClick={remove} className="btn btn-danger">Delete project</button><button className="btn btn-dark">Save changes</button></div>
  </form>}
  <div className="two-col">
   <section className="card"><div className="section-title"><div><span>TEAM</span><h2>Assigned employees</h2></div><button className="btn btn-small" disabled={savingTeam} onClick={saveTeam}>{savingTeam?"Saving...":"Save team"}</button></div><div className="check-list">{employees.length?employees.map((e:any)=>{const id=pick(e,["Employee_ID","Employee ID","EmployeeId"]);return <label key={id}><input type="checkbox" checked={assigned.includes(id)} onChange={ev=>setAssigned(v=>ev.target.checked?[...v,id]:v.filter(x=>x!==id))}/><span><strong>{pick(e,["Employee_Name","Employee Name","Name"],id)}</strong><small>{pick(e,["Position","Department"],"Team member")}</small></span></label>}):<p className="muted">No employees available.</p>}</div></section>
   <section className="card"><div className="section-title"><div><span>PROJECT RECORDS</span><h2>Activity</h2></div></div><div className="detail-list"><div><span>Documents</span><strong>{documents.length}</strong></div><div><span>Site visits</span><strong>{visits.length}</strong></div><div><span>Bills</span><strong>{billing?.bills?.length||0}</strong></div><div><span>Payments</span><strong>{billing?.payments?.length||0}</strong></div></div></section>
  </div>
 </>;
}
