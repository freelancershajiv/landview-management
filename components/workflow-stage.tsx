"use client";
import { useState, type FormEvent } from "react";
import styles from "./workflow-stage.module.css";
type Row = Record<string, unknown>;
export function stageProgress(task: Row) {
  if(String(task.Status).toLowerCase()==="completed") return 100;
  const value=Number(task.Progress || 0);
  return Number.isFinite(value)?Math.max(0,Math.min(99,value)):0;
}
function dateValue(value:unknown){const text=String(value||"");return /^\d{4}-\d{2}-\d{2}/.test(text)?text.slice(0,10):"";}
function realWorkflowId(value:unknown){const id=String(value||"").trim();return id&& !id.startsWith("AUTO::")?id:"";}
async function saveWorkflowRecord(payload:Record<string,unknown>){
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
  if(!response.ok||!json?.success)throw new Error(String(json?.error||json?.message||"Could not save workflow stage."));
  return (json.data||{}) as Row;
}
export default function WorkflowStage({task,title,index,employees,onSaved}:{task:Row;title:string;index:number;employees:Row[];onSaved:(record:Row)=>void}) {
  const [recordId,setRecordId]=useState(realWorkflowId(task.Task_ID));
  const [draft,setDraft]=useState({Assigned_Employee_ID:String(task.Assigned_Employee_ID||""),Start_Date:dateValue(task.Start_Date),Due_Date:dateValue(task.Due_Date),Status:String(task.Status||"Pending"),Progress:stageProgress(task),Description:String(task.Description||"")});
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[saved,setSaved]=useState(false);
  function change(changes:Partial<typeof draft>){setDraft(v=>({...v,...changes}));setSaved(false);setError("");}
  function status(value:string){change({Status:value,Progress:value==="Completed"?100:value==="Pending"||value==="Draft"?0:Math.min(draft.Progress,99)});}
  async function persist(changes:Record<string,unknown>){
    setBusy(true);setError("");setSaved(false);
    try{
      const base={
        Project_ID:String(task.Project_ID||task["Project ID"]||""),
        Project_Name:String(task.Project_Name||task["Project Name"]||""),
        Task_Title:String(task.Task_Title||task["Task Title"]||title),
        ...changes,
      };
      const record=recordId
        ? await saveWorkflowRecord({workflowOp:"update",id:recordId,...base})
        : await saveWorkflowRecord({workflowOp:"create",...base});
      const nextId=realWorkflowId(record.Task_ID)||recordId;
      if(nextId)setRecordId(nextId);
      // Replace the synthetic AUTO:: task with the real saved Workflow row immediately.
      Object.assign(task, record);
      onSaved(record);
      setDraft({
        Assigned_Employee_ID:String(record.Assigned_Employee_ID||changes.Assigned_Employee_ID||""),
        Start_Date:dateValue(record.Start_Date||changes.Start_Date),
        Due_Date:dateValue(record.Due_Date||changes.Due_Date),
        Status:String(record.Status||changes.Status||"Pending"),
        Progress:stageProgress({...record,...changes}),
        Description:String(record.Description||changes.Description||"")
      });
      setSaved(true);
      return record;
    }catch(e){setError(e instanceof Error?e.message:"Could not save stage.");throw e;}finally{setBusy(false);}
  }
  async function save(event:FormEvent){event.preventDefault();if(busy)return;
    if(draft.Start_Date&&draft.Due_Date&&draft.Due_Date<draft.Start_Date){setError("Deadline must be on or after the start date.");return;}
    const changes={...draft,Completed_At:draft.Status==="Completed"?String(task.Completed_At||new Date().toISOString()):""};
    try{await persist(changes);}catch{}
  }
  async function toggleComplete(){
    if(busy)return;
    const completing=draft.Status!=="Completed";
    const previous={Status:draft.Status,Progress:draft.Progress};
    const next={
      ...draft,
      Status:completing?"Completed":"In Progress",
      Progress:completing?100:Math.min(99,Math.max(1,draft.Progress||1)),
      Completed_At:completing?new Date().toISOString():""
    };
    setDraft(v=>({...v,Status:next.Status,Progress:next.Progress}));
    try{await persist(next);}catch{
      setDraft(v=>({...v,Status:previous.Status,Progress:previous.Progress}));
    }
  }
  const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Dhaka",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const overdue=draft.Due_Date&&draft.Due_Date<today&&draft.Status!=="Completed";
  return <form className={styles.stage} onSubmit={save}>
    <header><span>{String(index+1).padStart(2,"0")}</span><h3>{title}</h3>{overdue&&<b>Overdue</b>}<strong>{draft.Progress}%</strong></header>
    <progress max={100} value={draft.Progress} aria-label={`${title} progress`}/>
    <fieldset disabled={busy}><div className={styles.fields}>
      <label>Assigned employee<select value={draft.Assigned_Employee_ID} onChange={e=>change({Assigned_Employee_ID:e.target.value})}><option value="">Unassigned</option>{draft.Assigned_Employee_ID&&!employees.some(e=>String(e.Employee_ID)===draft.Assigned_Employee_ID)&&<option value={draft.Assigned_Employee_ID}>{draft.Assigned_Employee_ID}</option>}{employees.map(e=><option key={String(e.Employee_ID)} value={String(e.Employee_ID)}>{String(e.Employee_Name||e.Name||e.Employee_ID)}</option>)}</select></label>
      <label>Status<select value={draft.Status} onChange={e=>status(e.target.value)}>{["Draft","Pending","In Progress","Blocked","Completed"].map(s=><option key={s}>{s}</option>)}</select></label>
      <label>Start date<input type="date" value={draft.Start_Date} onChange={e=>change({Start_Date:e.target.value})}/></label>
      <label>Deadline<input type="date" min={draft.Start_Date||undefined} value={draft.Due_Date} onChange={e=>change({Due_Date:e.target.value})}/></label>
      <label>Progress (%)<input type="number" min={0} max={100} step={1} required value={draft.Progress} onChange={e=>{const value=Number(e.target.value);change({Progress:value,Status:value===100?"Completed":draft.Status==="Blocked"?"Blocked":value>0?"In Progress":"Pending"});}}/></label>
      <label className={styles.notes}>Stage notes<textarea rows={2} value={draft.Description} onChange={e=>change({Description:e.target.value})}/></label>
    </div><footer><span>{draft.Status==="Completed"?"Completed":""}</span><button type="button" onClick={toggleComplete}>{busy?"Saving…":draft.Status==="Completed"?"Reopen stage":"Mark complete"}</button><button type="submit">{busy?"Saving…":"Save stage"}</button></footer></fieldset>
    {error&&<p role="alert">{error}</p>}{saved&&<p role="status">Saved</p>}
  </form>;
}
