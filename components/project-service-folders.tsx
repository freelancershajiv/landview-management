"use client";

import { PROJECT_SERVICE_FOLDERS, ProjectUploadQueue } from "@/lib/project-service-folders";

export function QueuedProjectFiles({ queue, onChange }: { queue: ProjectUploadQueue; onChange: (queue: ProjectUploadQueue) => void }) {
  return <div className="project-service-grid">{PROJECT_SERVICE_FOLDERS.map((name, i) => <div className="card" key={name}><strong>{String(i + 1).padStart(2, "0")} · {name}</strong><input type="file" multiple onChange={e => { const files = Array.from(e.target.files || []); onChange({ ...queue, [name]: [...(queue[name] || []), ...files] }); e.currentTarget.value = ""; }} />{(queue[name] || []).map((file, index) => <div key={`${file.name}-${index}`}><small>{file.name}</small><button type="button" onClick={() => onChange({ ...queue, [name]: (queue[name] || []).filter((_, n) => n !== index) })}>Remove</button></div>)}</div>)}</div>;
}
