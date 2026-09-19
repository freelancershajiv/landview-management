"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { landViewApi } from "@/lib/api";
import { ErrorState, LoadingState, PageHeader } from "@/components/lv-ui";

type IdMode = "automatic" | "manual";
type FormState = {
  Project_ID: string;
  Project_Name: string;
  Client_Name: string;
  Phone_Number: string;
  Referred_By: string;
  Ref_Contact: string;
  Project_Type: string;
  Location: string;
  Project_Area: string;
  Number_of_Stories: string;
  Start_Date: string;
  Status: string;
  Notes: string;
};

const emptyForm: FormState = {
  Project_ID: "",
  Project_Name: "",
  Client_Name: "",
  Phone_Number: "",
  Referred_By: "",
  Ref_Contact: "",
  Project_Type: "",
  Location: "",
  Project_Area: "",
  Number_of_Stories: "",
  Start_Date: new Date().toISOString().slice(0, 10),
  Status: "Running",
  Notes: "",
};

const css = `
.new-project-page{display:grid;gap:18px;max-width:1050px}.new-project-actions{display:flex;gap:8px;flex-wrap:wrap}.new-project-btn{height:40px;padding:0 14px;border:1px solid rgba(255,255,255,.14);border-radius:8px;background:#18232d;color:#fff;font-size:12px;font-weight:800;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.new-project-btn.primary{background:#d61f26;border-color:#d61f26}.new-project-btn:disabled{opacity:.5;cursor:not-allowed}.new-project-card{border:1px solid rgba(255,255,255,.11);border-radius:12px;background:#0e1720;overflow:hidden}.new-project-head{padding:16px;border-bottom:1px solid rgba(255,255,255,.08);background:#141e28}.new-project-head strong{display:block;color:#f4f6f8;font-size:14px}.new-project-head small{display:block;margin-top:5px;color:#7e8b95;font-size:11px;line-height:1.55}.id-mode-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:16px;border-bottom:1px solid rgba(255,255,255,.08)}.id-mode{padding:14px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:#111b24;color:#b9c2c9;text-align:left;cursor:pointer}.id-mode.active{border-color:#d61f26;background:rgba(214,31,38,.09)}.id-mode b{display:block;color:#fff;font-size:12px}.id-mode span{display:block;margin-top:5px;color:#7f8b95;font-size:11px;line-height:1.5}.id-preview{margin:0 16px 2px;padding:12px 13px;border:1px solid rgba(255,255,255,.09);border-radius:8px;background:#101922;color:#b8c1c8;font-size:11px;line-height:1.6}.id-preview b{color:#ff7a72}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:16px}.form-grid label{display:grid;gap:6px;color:#8d99a3;font-size:11px;font-weight:700}.form-grid label.full{grid-column:1/-1}.form-grid input,.form-grid select,.form-grid textarea{border:1px solid rgba(255,255,255,.13);border-radius:7px;background:#111b24;color:#edf1f4;padding:0 10px;font-size:12px}.form-grid input,.form-grid select{height:41px}.form-grid textarea{min-height:96px;padding:10px;resize:vertical}.form-grid input:focus,.form-grid select:focus,.form-grid textarea:focus{outline:none;border-color:#d61f26}.form-grid .submit{grid-column:1/-1}.message{margin:0 16px 16px;padding:11px 13px;border:1px solid rgba(255,255,255,.1);border-radius:8px;font-size:11px;line-height:1.55}.message.ok{border-color:rgba(59,190,120,.35);color:#95e2b2}.message.err{border-color:rgba(214,31,38,.35);color:#ff9d96}.created-box{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.new-project-note{padding:12px 16px;border-top:1px solid rgba(255,255,255,.08);color:#74818c;font-size:11px;line-height:1.6}@media(max-width:700px){.id-mode-grid,.form-grid{grid-template-columns:1fr}.form-grid label.full,.form-grid .submit{grid-column:auto}}
`;

function text(value: unknown) { return String(value ?? "").trim(); }
function normalizeProjectId(value: unknown) {
  const raw = text(value).toUpperCase();
  if (!raw) return "";
  const match = raw.match(/LV[\s_-]*0*(\d+)/i);
  if (match?.[1]) return `LV-${Number(match[1])}`;
  const digits = raw.replace(/\D/g, "");
  return digits ? `LV-${Number(digits)}` : "";
}

export default function NewProjectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("");
  const [mode, setMode] = useState<IdMode>("automatic");
  const [nextId, setNextId] = useState("");
  const [existingIds, setExistingIds] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState<{kind:"ok"|"err"; text:string; id?:string}|null>(null);

  const canManage = role === "admin" || role === "manager";
  const normalizedManual = useMemo(() => normalizeProjectId(form.Project_ID), [form.Project_ID]);
  const manualExists = Boolean(normalizedManual && existingIds.has(normalizedManual));

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [session, projects, idResponse] = await Promise.all([
        landViewApi.getSession(),
        landViewApi.getProjects(),
        fetch("/api/projects/new", { cache: "no-store", credentials: "same-origin" }).then(async (response) => {
          const json = await response.json();
          if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not calculate the next project ID."));
          return json.data;
        }),
      ]);
      setRole(text(session?.user?.role || session?.user?.Role).toLowerCase());
      setNextId(text(idResponse?.nextId));
      const ids = new Set<string>();
      (projects || []).forEach((project: Record<string, unknown>) => {
        const id = normalizeProjectId(project.Project_ID || project["Project ID"] || project.project_code);
        if (id) ids.add(id);
      });
      setExistingIds(ids);
    } catch (e:any) {
      setError(e?.message || "Could not load the new project form.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canManage || saving) return;
    setMessage(null);
    if (mode === "manual" && !normalizedManual) {
      setMessage({ kind: "err", text: "Enter a valid manual ID, for example LV-72." });
      return;
    }
    if (mode === "manual" && manualExists) {
      setMessage({ kind: "err", text: `${normalizedManual} already exists. Choose an unused gap.` });
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/projects/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({ ...form, idMode: mode, Project_ID: mode === "manual" ? normalizedManual : "" }),
      });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not create the project."));
      const createdId = text(json.data?.Project_ID);
      setMessage({ kind: "ok", text: `${createdId} was created successfully in Supabase.`, id: createdId });
      setExistingIds((current) => new Set([...current, createdId]));
      setForm({ ...emptyForm, Start_Date: new Date().toISOString().slice(0, 10) });
      const refresh = await fetch("/api/projects/new", { cache: "no-store", credentials: "same-origin" }).then(r => r.json()).catch(() => null);
      if (refresh?.success) setNextId(text(refresh.data?.nextId));
    } catch (e:any) {
      setMessage({ kind: "err", text: e?.message || "Could not create the project." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="Preparing new project registration..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return <>
    <style dangerouslySetInnerHTML={{__html:css}} />
    <div className="new-project-page">
      <PageHeader eyebrow="LAND VIEW PROJECT REGISTER" title="New Project" description="Create a new Supabase project using the normal automatic LV number or intentionally reuse a genuinely unused historical gap." action={<div className="new-project-actions"><Link className="new-project-btn" href="/admin/projects">← Projects</Link><Link className="new-project-btn" href="/admin/projects/legacy">Legacy Projects</Link></div>} />

      <section className="new-project-card">
        <div className="new-project-head"><strong>Project ID method</strong><small>Automatic is the normal choice. Manual is for an intentionally unused LV number that you know will never belong to its original lost project.</small></div>
        <div className="id-mode-grid">
          <button className={`id-mode ${mode === "automatic" ? "active" : ""}`} type="button" onClick={() => setMode("automatic")}><b>Automatic ID</b><span>Uses the next number after the highest project currently in Supabase. Current preview: {nextId || "calculating…"}</span></button>
          <button className={`id-mode ${mode === "manual" ? "active" : ""}`} type="button" onClick={() => setMode("manual")}><b>Manual ID</b><span>Enter an unused gap such as LV-72. Existing IDs are blocked and cannot be overwritten.</span></button>
        </div>
        <div className="id-preview">
          {mode === "automatic" ? <>This project will normally receive <b>{nextId || "the next available ID"}</b>. The server checks again at save time.</> : <>Manual preview: <b>{normalizedManual || "enter an LV number below"}</b>{manualExists ? " — already in use" : normalizedManual ? " — appears unused" : ""}.</>}
        </div>

        <form className="form-grid" onSubmit={submit}>
          {mode === "manual" && <label>Manual Project ID<input value={form.Project_ID} onChange={(e)=>setForm({...form,Project_ID:e.target.value})} placeholder="LV-72" required /><span style={{fontSize:10,color:manualExists?"#ff8f88":"#6f7d88"}}>{manualExists ? "This ID already exists." : "You may type 72, LV72 or LV-072; it will be stored as LV-72."}</span></label>}
          <label className={mode === "automatic" ? "full" : ""}>Project Name<input value={form.Project_Name} onChange={(e)=>setForm({...form,Project_Name:e.target.value,Client_Name:form.Client_Name || e.target.value})} required /></label>
          <label>Client Name<input value={form.Client_Name} onChange={(e)=>setForm({...form,Client_Name:e.target.value})} /></label>
          <label>Phone Number<input value={form.Phone_Number} onChange={(e)=>setForm({...form,Phone_Number:e.target.value})} /></label>
          <label>Referred By<input value={form.Referred_By} onChange={(e)=>setForm({...form,Referred_By:e.target.value})} placeholder="Referrer name / source" /></label>
          <label>Ref. Contact<input value={form.Ref_Contact} onChange={(e)=>setForm({...form,Ref_Contact:e.target.value})} placeholder="Referrer phone / contact" /></label>
          <label>Project Type<input value={form.Project_Type} onChange={(e)=>setForm({...form,Project_Type:e.target.value})} placeholder="Residential / Commercial / etc." /></label>
          <label>Location<input value={form.Location} onChange={(e)=>setForm({...form,Location:e.target.value})} /></label>
          <label>Project Area<input value={form.Project_Area} onChange={(e)=>setForm({...form,Project_Area:e.target.value})} placeholder="e.g. 5 decimal / 3200 sft" /></label>
          <label>Stories / Floors<input value={form.Number_of_Stories} onChange={(e)=>setForm({...form,Number_of_Stories:e.target.value})} /></label>
          <label>Start Date<input type="date" value={form.Start_Date} onChange={(e)=>setForm({...form,Start_Date:e.target.value})} /></label>
          <label>Status<select value={form.Status} onChange={(e)=>setForm({...form,Status:e.target.value})}><option value="Running">Ongoing</option><option value="Paused">On Hold</option><option value="Completed">Completed</option><option value="Cancelled">Cancelled</option></select></label>
          <label className="full">Notes<textarea value={form.Notes} onChange={(e)=>setForm({...form,Notes:e.target.value})} placeholder="Optional project notes" /></label>
          <button className="new-project-btn primary submit" type="submit" disabled={!canManage || saving || (mode === "manual" && manualExists)}>{saving ? "Creating project…" : mode === "automatic" ? "Create Project with Automatic ID" : `Create Project as ${normalizedManual || "Manual ID"}`}</button>
        </form>

        {message && <div className={`message ${message.kind}`}>{message.text}{message.kind === "ok" && message.id && <div className="created-box"><Link className="new-project-btn" href="/admin/projects">View Projects</Link><button className="new-project-btn" type="button" onClick={()=>router.push(`/admin/projects/${encodeURIComponent(message.id || "")}`)}>Open Project</button></div>}</div>}
        {!canManage && <div className="message err">Admin or manager access is required to create projects.</div>}
        <div className="new-project-note">Manual gap reuse keeps the LV numbering sequence compact, but it does not materially reduce database storage. Use a manual ID only when you are certain the old number is permanently abandoned.</div>
      </section>
    </div>
  </>;
}
