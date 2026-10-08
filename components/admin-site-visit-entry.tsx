"use client";

import { useEffect, useState } from "react";

type ProjectRow = {
  Project_ID?: string;
  Project_Name?: string;
  Client_Name?: string;
  Location?: string;
  Status?: string;
};

type EmployeeRow = {
  Employee_ID?: string;
  Employee_Name?: string;
  Designation?: string;
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
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [visitPhoto, setVisitPhoto] = useState<File | null>(null);
  const [problemPhoto, setProblemPhoto] = useState<File | null>(null);
  const [form, setForm] = useState({
    projectId: "",
    employeeId: "",
    visitDate: new Date().toISOString().slice(0, 10),
    purpose: "Site Visit",
    problemDetails: "",
    actionRequired: "",
    notes: "",
  });

  async function loadEntryData() {
    setLoading(true);
    setError("");
    try {
      const [projectsResponse, employeesResponse] = await Promise.all([
        fetch("/api/admin/site-visits", { cache: "no-store", credentials: "same-origin" }),
        fetch("/api/admin/site-visits?mode=employees", { cache: "no-store", credentials: "same-origin" }),
      ]);
      const [projectsJson, employeesJson] = await Promise.all([
        projectsResponse.json().catch(() => null),
        employeesResponse.json().catch(() => null),
      ]);
      if (!projectsResponse.ok || !projectsJson?.success) throw new Error(String(projectsJson?.error || "Could not load Site Visit projects."));
      if (!employeesResponse.ok || !employeesJson?.success) throw new Error(String(employeesJson?.error || "Could not load active employees."));

      const projectRows = Array.isArray(projectsJson.data) ? projectsJson.data : [];
      const employeeRows = Array.isArray(employeesJson.data) ? employeesJson.data : [];
      setProjects(projectRows);
      setEmployees(employeeRows);
      setForm((current) => current.projectId || !projectRows[0]?.Project_ID
        ? current
        : { ...current, projectId: String(projectRows[0].Project_ID) });
    } catch (e: any) {
      setError(e?.message || "Could not load Site Visit entry data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadEntryData(); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (!form.projectId) throw new Error("Select a project.");

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
      const employeeName = String(json?.data?.Employee_Name || "Admin");
      const wa = String(json?.data?.WhatsApp_Publish_Status || "");
      const waReason = String(json?.data?.WhatsApp_Publish_Reason || "");
      const waSender = String(json?.data?.WhatsApp_Sender_Employee_ID || "EMP-0002");
      const whatsappDetail = wa
        ? ` · WhatsApp (${waSender}): ${wa}${wa !== "sent" && waReason ? ` — ${waReason}` : ""}`
        : "";
      setNotice(`Site Visit ${visitId} submitted for ${employeeName}${whatsappDetail}.`);
      setVisitPhoto(null);
      setProblemPhoto(null);
      setForm((current) => ({
        ...current,
        visitDate: new Date().toISOString().slice(0, 10),
        purpose: "Site Visit",
        problemDetails: "",
        actionRequired: "",
        notes: "",
      }));
      if (wa === "sent") window.setTimeout(() => window.location.reload(), 1200);
    } catch (e: any) {
      setError(e?.message || "Could not submit Site Visit.");
    } finally {
      setSaving(false);
    }
  }

  return <section className="admin-site-entry">
    <style>{`
      .admin-site-entry{display:grid;gap:12px;margin-bottom:16px}.ase-bar{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:15px 17px;border:1px solid var(--theme-line-_303a44,#303a44);border-radius:13px;background:linear-gradient(145deg,var(--theme-bg-_151c23,#151c23),var(--theme-bg-_0d1217,#0d1217))}.ase-bar strong{display:block;font-size:12px}.ase-bar small{display:block;margin-top:4px;color:var(--theme-ink-_83909a,#83909a);font-size:8px;line-height:1.45}.ase-toggle{height:38px;padding:0 14px;border:1px solid #8d282d;border-radius:8px;background:#c9232b;color:#fff;font-size:9px;font-weight:900;cursor:pointer;white-space:nowrap}.ase-form{display:grid;grid-template-columns:1fr 1fr;gap:11px;padding:17px;border:1px solid var(--theme-line-_303a44,#303a44);border-radius:13px;background:var(--theme-bg-_0e141a,#0e141a)}.ase-field{display:grid;gap:6px}.ase-field.wide{grid-column:1/-1}.ase-field span{font-size:8px;font-weight:900;letter-spacing:.08em;color:var(--theme-ink-_84909b,#84909b)}.ase-field select,.ase-field textarea{width:100%;border:1px solid var(--theme-line-_34404a,#34404a);border-radius:8px;background:var(--theme-bg-_0a1015,#0a1015);color:var(--theme-ink-_f1f4f6,#f1f4f6);padding:11px;font-size:10px;outline:none}.ase-field textarea{min-height:92px;resize:vertical}.ase-field select:focus,.ase-field textarea:focus{border-color:#d61f26;box-shadow:0 0 0 3px rgba(214,31,38,.08)}.ase-upload{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:10px}.ase-upload label{display:grid;gap:6px;min-height:96px;padding:13px;border:1px dashed var(--theme-line-_3b4751,#3b4751);border-radius:9px;background:var(--theme-bg-_0b1116,#0b1116);align-content:center}.ase-upload strong{font-size:9px}.ase-upload small{font-size:8px;color:var(--theme-ink-_77838e,#77838e);line-height:1.45}.ase-upload input{font-size:8px}.ase-submit{grid-column:1/-1;height:42px;border:0;border-radius:8px;background:linear-gradient(180deg,#e53138,#bd171e);color:#fff;font-size:9px;font-weight:900;cursor:pointer}.ase-submit:disabled{opacity:.55;cursor:wait}.ase-info{grid-column:1/-1;padding:9px 11px;border:1px solid var(--theme-line-_2d5f40,#2d5f40);border-radius:8px;background:var(--theme-bg-_152c1e,#152c1e);color:var(--theme-ink-_a6dfb8,#a6dfb8);font-size:8px;line-height:1.5}.ase-error{padding:10px 12px;border:1px solid var(--theme-line-_6c292e,#6c292e);border-radius:8px;background:var(--theme-bg-_341617,#341617);color:var(--theme-ink-_ffaaa5,#ffaaa5);font-size:9px}.ase-ok{padding:10px 12px;border:1px solid var(--theme-line-_2d5f40,#2d5f40);border-radius:8px;background:var(--theme-bg-_152c1e,#152c1e);color:var(--theme-ink-_a6dfb8,#a6dfb8);font-size:9px}@media(max-width:700px){.ase-bar{align-items:flex-start;flex-direction:column}.ase-toggle{width:100%}.ase-form,.ase-upload{grid-template-columns:1fr}.ase-field.wide,.ase-submit,.ase-upload,.ase-info{grid-column:auto}}
    `}</style>

    <div className="ase-bar">
      <div><strong>Admin Site Visit Entry</strong><small>Quick entry for Admin. Date and purpose are filled automatically.</small></div>
      <button type="button" className="ase-toggle" onClick={() => setOpen((value) => !value)}>{open ? "CLOSE" : "+ ADD SITE VISIT"}</button>
    </div>

    {error && <div className="ase-error">{error}</div>}
    {notice && <div className="ase-ok">{notice}</div>}

    {open && <form className="ase-form" onSubmit={submit}>
      <div className="ase-info"><strong>ADMIN ENTRY</strong> · GPS is not required. Select an employee only when you want the visit recorded in that employee&apos;s name.</div>

      <label className="ase-field"><span>PROJECT</span><select value={form.projectId} onChange={(event) => setForm((value) => ({ ...value, projectId: event.target.value }))} disabled={loading}><option value="">{loading ? "Loading projects…" : "Select project"}</option>{projects.map((project) => <option key={project.Project_ID} value={project.Project_ID}>{project.Project_ID} · {project.Project_Name || project.Client_Name || "Project"}</option>)}</select></label>

      <label className="ase-field"><span>ISSUE AS</span><select value={form.employeeId} onChange={(event) => setForm((value) => ({ ...value, employeeId: event.target.value }))} disabled={loading}><option value="">Admin direct entry</option>{employees.map((employee) => <option key={employee.Employee_ID} value={employee.Employee_ID}>{employee.Employee_ID} · {employee.Employee_Name || "Employee"}</option>)}</select></label>

      <div className="ase-upload">
        <label><strong>SITE PHOTO</strong><small>{visitPhoto ? visitPhoto.name : "Take or choose a site photo"}</small><input type="file" accept="image/*" capture="environment" onChange={(event) => setVisitPhoto(event.target.files?.[0] || null)}/></label>
        <label><strong>PROBLEM PHOTO · OPTIONAL</strong><small>{problemPhoto ? problemPhoto.name : "Take or choose a problem photo"}</small><input type="file" accept="image/*" capture="environment" onChange={(event) => setProblemPhoto(event.target.files?.[0] || null)}/></label>
      </div>

      <label className="ase-field wide"><span>SITE NOTES / PROBLEM · OPTIONAL</span><textarea value={form.problemDetails} onChange={(event) => setForm((value) => ({ ...value, problemDetails: event.target.value }))} placeholder="What happened on site? Add a short note only if needed."/></label>

      <button className="ase-submit" disabled={saving || loading}>{saving ? "SUBMITTING…" : "SUBMIT SITE VISIT"}</button>
    </form>}
  </section>;
}
