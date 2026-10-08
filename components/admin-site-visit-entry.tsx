"use client";

import { useEffect, useState } from "react";

type ProjectRow = {
  Project_ID?: string;
  Project_Name?: string;
  Client_Name?: string;
  Location?: string;
  Status?: string;
};

function compressImage(file: File, maxDimension = 1400, quality = 0.78): Promise<File> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Please select an image file."));
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) return reject(new Error("Could not prepare photo."));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error("Could not prepare photo."));
        const base = file.name.replace(/\.(jpe?g|png|webp)$/i, "") || "site-visit";
        resolve(new File([blob], `${base}.jpg`, { type: "image/jpeg" }));
      }, "image/jpeg", quality);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read photo."));
    };
    image.src = url;
  });
}

export default function AdminSiteVisitEntry() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [visitPhoto, setVisitPhoto] = useState<File | null>(null);
  const [problemPhoto, setProblemPhoto] = useState<File | null>(null);
  const [form, setForm] = useState({
    projectId: "",
    visitDate: new Date().toISOString().slice(0, 10),
    purpose: "",
    problemDetails: "",
    actionRequired: "",
    notes: "",
  });

  async function loadProjects() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/site-visits", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load Site Visit projects."));
      const rows = Array.isArray(json.data) ? json.data : [];
      setProjects(rows);
      setForm((current) => current.projectId || !rows[0]?.Project_ID
        ? current
        : { ...current, projectId: String(rows[0].Project_ID) });
    } catch (e: any) {
      setError(e?.message || "Could not load Site Visit projects.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadProjects(); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (!form.projectId) throw new Error("Select a project.");
      if (!form.purpose.trim()) throw new Error("Enter the visit purpose.");

      const body = new FormData();
      Object.entries(form).forEach(([key, value]) => body.append(key, value));
      if (visitPhoto) body.append("visitPhoto", await compressImage(visitPhoto));
      if (problemPhoto) body.append("problemPhoto", await compressImage(problemPhoto));

      const response = await fetch("/api/admin/site-visits", {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not submit Site Visit."));

      const visitId = String(json?.data?.Visit_ID || "");
      const wa = String(json?.data?.WhatsApp_Publish_Status || "");
      setNotice(`Site Visit ${visitId} submitted successfully${wa ? ` · WhatsApp: ${wa}` : ""}.`);
      setVisitPhoto(null);
      setProblemPhoto(null);
      setForm((current) => ({ ...current, purpose: "", problemDetails: "", actionRequired: "", notes: "" }));
      window.setTimeout(() => window.location.reload(), 900);
    } catch (e: any) {
      setError(e?.message || "Could not submit Site Visit.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="admin-site-entry">
    <style>{`
      .admin-site-entry{display:grid;gap:12px;margin-bottom:16px}.ase-bar{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:15px 17px;border:1px solid var(--theme-line-_303a44,#303a44);border-radius:13px;background:linear-gradient(145deg,var(--theme-bg-_151c23,#151c23),var(--theme-bg-_0d1217,#0d1217))}.ase-bar strong{display:block;font-size:12px}.ase-bar small{display:block;margin-top:4px;color:var(--theme-ink-_83909a,#83909a);font-size:8px;line-height:1.45}.ase-toggle{height:38px;padding:0 14px;border:1px solid #8d282d;border-radius:8px;background:#c9232b;color:#fff;font-size:9px;font-weight:900;cursor:pointer;white-space:nowrap}.ase-form{display:grid;grid-template-columns:1fr 1fr;gap:11px;padding:17px;border:1px solid var(--theme-line-_303a44,#303a44);border-radius:13px;background:var(--theme-bg-_0e141a,#0e141a)}.ase-field{display:grid;gap:6px}.ase-field.wide{grid-column:1/-1}.ase-field span{font-size:8px;font-weight:900;letter-spacing:.08em;color:var(--theme-ink-_84909b,#84909b)}.ase-field input,.ase-field select,.ase-field textarea{width:100%;border:1px solid var(--theme-line-_34404a,#34404a);border-radius:8px;background:var(--theme-bg-_0a1015,#0a1015);color:var(--theme-ink-_f1f4f6,#f1f4f6);padding:10px;font-size:10px;outline:none}.ase-field textarea{min-height:80px;resize:vertical}.ase-upload{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:10px}.ase-upload label{display:grid;gap:5px;padding:12px;border:1px dashed var(--theme-line-_3b4751,#3b4751);border-radius:9px;background:var(--theme-bg-_0b1116,#0b1116)}.ase-upload strong{font-size:9px}.ase-upload small{font-size:8px;color:var(--theme-ink-_77838e,#77838e)}.ase-upload input{font-size:8px}.ase-submit{grid-column:1/-1;height:40px;border:0;border-radius:8px;background:linear-gradient(180deg,#e53138,#bd171e);color:#fff;font-size:9px;font-weight:900;cursor:pointer}.ase-submit:disabled{opacity:.55;cursor:wait}.ase-info{grid-column:1/-1;padding:10px 12px;border:1px solid var(--theme-line-_2d5f40,#2d5f40);border-radius:8px;background:var(--theme-bg-_152c1e,#152c1e);color:var(--theme-ink-_a6dfb8,#a6dfb8);font-size:9px;line-height:1.45}.ase-error{padding:10px 12px;border:1px solid var(--theme-line-_6c292e,#6c292e);border-radius:8px;background:var(--theme-bg-_341617,#341617);color:var(--theme-ink-_ffaaa5,#ffaaa5);font-size:9px}.ase-ok{padding:10px 12px;border:1px solid var(--theme-line-_2d5f40,#2d5f40);border-radius:8px;background:var(--theme-bg-_152c1e,#152c1e);color:var(--theme-ink-_a6dfb8,#a6dfb8);font-size:9px}@media(max-width:700px){.ase-bar{align-items:flex-start;flex-direction:column}.ase-toggle{width:100%}.ase-form,.ase-upload{grid-template-columns:1fr}.ase-field.wide,.ase-submit,.ase-upload,.ase-info{grid-column:auto}}
    `}</style>

    <div className="ase-bar">
      <div><strong>Admin Site Visit Entry</strong><small>Create a Site Visit directly from Admin. GPS verification is not required for Admin entries; employee GPS rules remain unchanged.</small></div>
      <button type="button" className="ase-toggle" onClick={() => setOpen((value) => !value)}>{open ? "CLOSE ENTRY" : "+ ADD SITE VISIT"}</button>
    </div>

    {error && <div className="ase-error">{error}</div>}
    {notice && <div className="ase-ok">{notice}</div>}

    {open && <form className="ase-form" onSubmit={submit}>
      <div className="ase-info"><strong>ADMIN ENTRY · GPS NOT REQUIRED</strong><br/>This record will be marked as an Admin-created Site Visit. Photos still upload to the dedicated Site Visit Google Drive folder and the normal WhatsApp update flow is preserved.</div>
      <label className="ase-field"><span>PROJECT</span><select value={form.projectId} onChange={(event) => setForm((value) => ({ ...value, projectId: event.target.value }))} disabled={loading}><option value="">{loading ? "Loading projects…" : "Select active supervision project"}</option>{projects.map((project) => <option key={project.Project_ID} value={project.Project_ID}>{project.Project_ID} · {project.Project_Name || project.Client_Name || "Project"}{project.Location ? ` · ${project.Location}` : ""}</option>)}</select></label>
      <label className="ase-field"><span>VISIT DATE</span><input type="date" value={form.visitDate} onChange={(event) => setForm((value) => ({ ...value, visitDate: event.target.value }))}/></label>
      <label className="ase-field wide"><span>VISIT PURPOSE</span><input value={form.purpose} onChange={(event) => setForm((value) => ({ ...value, purpose: event.target.value }))} placeholder="e.g. Foundation inspection / site measurement"/></label>
      <label className="ase-field wide"><span>PROBLEM / OBSERVATION DETAILS</span><textarea value={form.problemDetails} onChange={(event) => setForm((value) => ({ ...value, problemDetails: event.target.value }))} placeholder="Describe what you observed at site."/></label>
      <label className="ase-field wide"><span>ACTION REQUIRED</span><textarea value={form.actionRequired} onChange={(event) => setForm((value) => ({ ...value, actionRequired: event.target.value }))} placeholder="What needs to be corrected, approved or followed up?"/></label>
      <div className="ase-upload">
        <label><strong>VISIT PHOTO</strong><small>{visitPhoto ? visitPhoto.name : "Upload a general site photo"}</small><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setVisitPhoto(event.target.files?.[0] || null)}/></label>
        <label><strong>PROBLEM PHOTO</strong><small>{problemPhoto ? problemPhoto.name : "Upload evidence of the problem"}</small><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setProblemPhoto(event.target.files?.[0] || null)}/></label>
      </div>
      <label className="ase-field wide"><span>NOTES</span><textarea value={form.notes} onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))} placeholder="Additional site notes (optional)."/></label>
      <button className="ase-submit" disabled={saving || loading}>{saving ? "SUBMITTING SITE VISIT…" : "SUBMIT SITE VISIT"}</button>
    </form>}
  </section>;
}
