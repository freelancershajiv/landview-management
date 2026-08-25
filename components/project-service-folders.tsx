"use client";

import { PROJECT_SERVICE_FOLDERS, type ProjectUploadQueue } from "@/lib/project-service-folders";

const css = `
  .project-service-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:18px}
  .project-service-grid>.card{padding:16px;border-color:rgba(255,255,255,.12);background:rgba(255,255,255,.025)}
  .project-service-grid>.card>strong{display:block;margin-bottom:12px;color:#fff;font-size:12px}
  .project-service-grid input[type=file]{display:block;width:100%;font-size:10px;color:#aab4bc}
  .project-service-grid>.card>div{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.08)}
  .project-service-grid small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#9aa5ae;font-size:9px}
  .project-service-grid button{border:0;background:transparent;color:#efb733;font-size:9px;cursor:pointer}
  @media(max-width:760px){.project-service-grid{grid-template-columns:1fr}}
`;

export function QueuedProjectFiles({ queue, onChange }: { queue: ProjectUploadQueue; onChange: (queue: ProjectUploadQueue) => void }) {
  return <><style dangerouslySetInnerHTML={{__html:css}}/><div className="project-service-grid">{PROJECT_SERVICE_FOLDERS.map((name, i) => <div className="card" key={name}><strong>{String(i + 1).padStart(2, "0")} · {name}</strong><input type="file" multiple onChange={e => { const files = Array.from(e.target.files || []); onChange({ ...queue, [name]: [...(queue[name] || []), ...files] }); e.currentTarget.value = ""; }} />{(queue[name] || []).map((file, index) => <div key={`${file.name}-${index}`}><small>{file.name}</small><button type="button" onClick={() => onChange({ ...queue, [name]: (queue[name] || []).filter((_, n) => n !== index) })}>Remove</button></div>)}</div>)}</div></>;
}
