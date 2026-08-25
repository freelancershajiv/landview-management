"use client";

import { PROJECT_SERVICE_FOLDERS, type ProjectUploadQueue } from "@/lib/project-service-folders";

const css = `
.project-service-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:20px}
.project-service-card{min-width:0;padding:0!important;overflow:hidden;border:1px solid rgba(255,255,255,.1)!important;border-radius:12px!important;background:linear-gradient(145deg,rgba(255,255,255,.035),rgba(255,255,255,.015))!important}
.project-service-head{display:flex;align-items:center;gap:12px;padding:15px 16px;border-bottom:1px solid rgba(255,255,255,.07)}
.project-service-index{flex:0 0 auto;display:grid;place-items:center;width:28px;height:28px;border:1px solid rgba(214,166,44,.3);border-radius:7px;color:#d6a62c;font-size:9px;font-weight:800;letter-spacing:.08em;background:rgba(214,166,44,.06)}
.project-service-title{min-width:0;color:#f5f7f8;font-size:12px;font-weight:700;letter-spacing:.01em}
.project-file-picker{display:flex;align-items:center;gap:12px;margin:14px 16px;padding:11px 12px;border:1px dashed rgba(255,255,255,.15);border-radius:9px;background:rgba(4,13,20,.35);cursor:pointer;transition:.18s ease}
.project-file-picker:hover{border-color:rgba(214,166,44,.5);background:rgba(214,166,44,.04)}
.project-file-picker input{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
.project-file-icon{display:grid;place-items:center;width:30px;height:30px;border-radius:7px;background:rgba(214,166,44,.1);color:#d6a62c;font-size:15px}
.project-file-copy{min-width:0;display:grid;gap:3px}
.project-file-copy strong{margin:0!important;color:#e8edf0!important;font-size:10px!important;letter-spacing:.04em}
.project-file-copy span{color:#75838d;font-size:9px}
.project-file-list{display:grid;gap:6px;padding:0 16px 14px}
.project-file-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:7px;background:rgba(255,255,255,.035)}
.project-file-row small{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#aeb8bf;font-size:9px}
.project-file-row button{flex:0 0 auto;border:0;background:transparent;color:#d6a62c;font-size:8px;font-weight:700;cursor:pointer;text-transform:uppercase;letter-spacing:.08em}
@media(max-width:900px){.project-service-grid{grid-template-columns:1fr}}
`;

export function QueuedProjectFiles({ queue, onChange }: { queue: ProjectUploadQueue; onChange: (queue: ProjectUploadQueue) => void }) {
  return <><style dangerouslySetInnerHTML={{__html:css}}/><div className="project-service-grid">{PROJECT_SERVICE_FOLDERS.map((name,i)=><div className="card project-service-card" key={name}>
    <div className="project-service-head"><span className="project-service-index">{String(i+1).padStart(2,"0")}</span><strong className="project-service-title">{name}</strong></div>
    <label className="project-file-picker"><input type="file" multiple onChange={e=>{const files=Array.from(e.target.files||[]);onChange({...queue,[name]:[...(queue[name]||[]),...files]});e.currentTarget.value="";}}/><span className="project-file-icon">＋</span><span className="project-file-copy"><strong>Choose files</strong><span>{queue[name]?.length?`${queue[name].length} file${queue[name].length===1?"":"s"} selected`:"Click to browse from your device"}</span></span></label>
    {!!queue[name]?.length&&<div className="project-file-list">{queue[name].map((file,index)=><div className="project-file-row" key={`${file.name}-${index}`}><small>{file.name}</small><button type="button" onClick={()=>onChange({...queue,[name]:(queue[name]||[]).filter((_,n)=>n!==index)})}>Remove</button></div>)}</div>}
  </div>)}</div></>;
}
