"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { landViewApi } from "@/lib/api";
import { Field, PageHeader } from "@/components/lv-ui";
import { QueuedProjectFiles } from "@/components/project-service-folders";
import { ProjectUploadQueue, totalQueuedFiles, uploadQueuedProjectFiles } from "@/lib/project-service-folders";

const initial = {
  Project_ID: "", Project_Name: "", Client_Name: "", Phone_Number: "", Project_Type: "", Location: "", Design_Bill: "", Status: "Active", Start_Date: "",
  Public_Display: "FALSE", Public_Project_Title: "", Public_Description: "", Project_Category: "", Project_Area: "", Number_of_Stories: "", Public_Services: "", Completion_Year: "", Public_Display_Order: "",
};

export default function NewProjectPage() {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [queue, setQueue] = useState<ProjectUploadQueue>({});
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ id: string; username: string; password: string } | null>(null);
  function set(key: string, value: string) { setForm(v => ({ ...v, [key]: value })); }

  async function submit(e: FormEvent) {
    e.preventDefault(); if (saving) return; setSaving(true); setError(""); setProgress("Creating project and Drive structure...");
    try {
      const result = await landViewApi.createProject(form); const id = String(result.Project_ID || form.Project_ID || "").trim();
      if (!id) throw new Error("Project was created without a Project ID.");
      await landViewApi.getProjectServiceFolders(id);
      const total = totalQueuedFiles(queue);
      if (total) await uploadQueuedProjectFiles(id, queue, (done,count,fileName)=>setProgress(done>=count?"Uploads complete.":`Uploading ${done+1} of ${count}: ${fileName}`));
      const account=result.clientAccount;
      if(account?.created&&account.temporaryPassword)setCreated({id,username:account.username||account.userId||"",password:account.temporaryPassword}); else router.push(`/admin/projects/${encodeURIComponent(id)}`);
    } catch(e:any){setError(e?.message||"Unable to create project.");} finally {setSaving(false);setProgress("");}
  }

  return <><PageHeader eyebrow="PROJECT CONTROL" title="Create project" description="Create the project, client record, Drive structure and project-service files in one workflow." action={<Link href="/admin/projects" className="btn btn-light">← Projects</Link>}/>
  <form onSubmit={submit} className="card form-card">
   {error&&<div className="notice error"><strong>Could not save</strong><span>{error}</span></div>}{progress&&<div className="notice"><strong>Working</strong><span>{progress}</span></div>}
   <div className="form-section"><div><span>01</span><h2>Project identity</h2><p>Project ID can be entered manually. If left blank, Code.gs generates an LV- ID.</p></div><div className="form-grid"><Field label="PROJECT ID" hint="Optional"><input value={form.Project_ID} onChange={e=>set("Project_ID",e.target.value)} placeholder="LV-0001"/></Field><Field label="PROJECT NAME"><input value={form.Project_Name} onChange={e=>set("Project_Name",e.target.value)} placeholder="Residence / Commercial Project"/></Field><Field label="PROJECT TYPE"><input value={form.Project_Type} onChange={e=>set("Project_Type",e.target.value)} placeholder="Residential"/></Field><Field label="STATUS"><select value={form.Status} onChange={e=>set("Status",e.target.value)}><option>Active</option><option>Ongoing</option><option>Pending</option><option>Completed</option><option>Inactive</option></select></Field></div></div>
   <div className="form-section"><div><span>02</span><h2>Client & location</h2><p>Record the client contact information and project location.</p></div><div className="form-grid"><Field label="CLIENT NAME"><input value={form.Client_Name} onChange={e=>set("Client_Name",e.target.value)} placeholder="Client name"/></Field><Field label="PHONE NUMBER"><input value={form.Phone_Number} onChange={e=>set("Phone_Number",e.target.value)} placeholder="01XXXXXXXXX"/></Field><Field label="LOCATION"><input value={form.Location} onChange={e=>set("Location",e.target.value)} placeholder="Project location"/></Field><Field label="START DATE"><input type="date" value={form.Start_Date} onChange={e=>set("Start_Date",e.target.value)}/></Field></div></div>
   <div className="form-section"><div><span>03</span><h2>Commercial</h2><p>Initial design bill can be recorded if that column exists in your Projects sheet.</p></div><div className="form-grid single"><Field label="DESIGN BILL"><input type="number" min="0" value={form.Design_Bill} onChange={e=>set("Design_Bill",e.target.value)} placeholder="0"/></Field></div></div>
   <div className="form-section"><div><span>04</span><h2>Project folders & files</h2><p>All 11 service folders are created automatically. Images uploaded to 3D Design - Exterior are used automatically on the public website; name the main image front.jpeg.</p></div><QueuedProjectFiles queue={queue} onChange={setQueue}/><p className="muted">Queued files: {totalQueuedFiles(queue)}. App uploads are limited to 3 MB per file; larger files can be uploaded directly through the Drive folder.</p></div>
   <div className="form-section"><div><span>05</span><h2>Public portfolio</h2><p>Project images come automatically from the 3D Design - Exterior folder. No image URLs are required.</p></div><div className="form-grid"><Field label="SHOW ON WEBSITE"><select value={form.Public_Display} onChange={e=>set("Public_Display",e.target.value)}><option value="FALSE">No</option><option value="TRUE">Yes</option></select></Field><Field label="PUBLIC PROJECT TITLE"><input value={form.Public_Project_Title} onChange={e=>set("Public_Project_Title",e.target.value)} placeholder="7-Storied Residential Building"/></Field><Field label="CATEGORY"><input value={form.Project_Category} onChange={e=>set("Project_Category",e.target.value)} placeholder="Residential"/></Field><Field label="PROJECT AREA"><input value={form.Project_Area} onChange={e=>set("Project_Area",e.target.value)} placeholder="4,500 sft"/></Field><Field label="NUMBER OF STORIES"><input value={form.Number_of_Stories} onChange={e=>set("Number_of_Stories",e.target.value)} placeholder="7"/></Field><Field label="COMPLETION YEAR"><input value={form.Completion_Year} onChange={e=>set("Completion_Year",e.target.value)} placeholder="2026"/></Field><Field label="DISPLAY ORDER"><input type="number" min="0" value={form.Public_Display_Order} onChange={e=>set("Public_Display_Order",e.target.value)} placeholder="1"/></Field><Field label="SERVICES" hint="Separate with • or new lines"><textarea rows={4} value={form.Public_Services} onChange={e=>set("Public_Services",e.target.value)} placeholder="Architectural Design • Structural Design • 3D Design - Exterior"/></Field><Field label="PUBLIC DESCRIPTION"><textarea rows={5} value={form.Public_Description} onChange={e=>set("Public_Description",e.target.value)} placeholder="Short public description of the project."/></Field></div></div>
   <div className="form-actions"><Link className="btn btn-light" href="/admin/projects">Cancel</Link><button disabled={saving} className="btn btn-dark">{saving?(progress||"Saving..."):"Create project"}</button></div>
  </form>
  {created&&<div className="modal-backdrop"><div className="modal card"><div className="section-title"><div><span>CLIENT LOGIN CREATED</span><h2>Client temporary password</h2></div></div><div className="notice"><strong>Save these credentials now</strong><span>The temporary password is shown only once. Give it securely to the client.</span></div><div className="form-grid"><Field label="LOGIN ID"><input readOnly value={created.username}/></Field><Field label="TEMPORARY PASSWORD"><input readOnly value={created.password}/></Field></div><div className="form-actions"><button type="button" className="btn btn-light" onClick={()=>navigator.clipboard.writeText(`Login ID: ${created.username}\nTemporary Password: ${created.password}`)}>Copy credentials</button><button type="button" className="btn btn-dark" onClick={()=>router.push(`/admin/projects/${encodeURIComponent(created.id)}`)}>I saved it — continue</button></div></div></div>}
  </>;
}
