"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { landViewApi } from "@/lib/api";
import { ErrorState, LoadingState, PageHeader } from "@/components/lv-ui";
import WhatsAppNumberCheck from "@/components/whatsapp-number-check";

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
  Location_Tag: string;
  Project_Area: string;
  Number_of_Stories: string;
  Start_Date: string;
  Design_Stage_Status: string;
  Approval_Stage_Status: string;
  Supervision_Stage_Status: string;
  Site_Latitude: string;
  Site_Longitude: string;
  Site_Geofence_Radius_M: string;
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
  Location_Tag: "",
  Project_Area: "",
  Number_of_Stories: "",
  Start_Date: new Date().toISOString().slice(0, 10),
  Design_Stage_Status: "In Progress",
  Approval_Stage_Status: "Pending",
  Supervision_Stage_Status: "Completed",
  Site_Latitude: "",
  Site_Longitude: "",
  Site_Geofence_Radius_M: "150",
  Notes: "",
};

const css = `
/* New Project geometry and colors are intentionally scoped to this route.
   Semantic colors come from the centralized private light/dark palette. */
.new-project-page {
  display:grid; gap:18px; max-width:1050px; min-width:0;
  color:var(--lv-text-primary);
}
.new-project-page .new-project-actions,
.new-project-page .location-tag-actions,
.new-project-page .created-box {
  display:flex; align-items:center; gap:8px; flex-wrap:wrap;
}
.new-project-page .new-project-btn {
  min-height:40px; padding:0 14px; border:1px solid var(--lv-control-border);
  border-radius:8px; background:var(--lv-control-bg);
  color:var(--lv-text-primary); -webkit-text-fill-color:currentColor;
  font-size:12px; font-weight:800; cursor:pointer; text-decoration:none;
  display:inline-flex; align-items:center; justify-content:center;
}
.new-project-page .new-project-btn:not(.primary):hover:not(:disabled) {
  background:var(--lv-control-bg-hover); border-color:var(--lv-border-strong);
  color:var(--lv-text-strong); -webkit-text-fill-color:currentColor;
}
.new-project-page .new-project-btn.primary {
  background:var(--lv-brand-primary); border-color:var(--lv-brand-primary);
  color:#fff; -webkit-text-fill-color:#fff;
}
.new-project-page .new-project-btn.primary:hover:not(:disabled) {
  background:var(--lv-brand-primary-hover);
  border-color:var(--lv-brand-primary-hover);
  color:#fff; -webkit-text-fill-color:#fff;
}
.new-project-page .new-project-btn:disabled { opacity:.55; cursor:not-allowed; }
.new-project-page .new-project-card {
  overflow:hidden; border:1px solid var(--lv-border-default);
  border-radius:12px; background:var(--lv-surface-panel); color:var(--lv-text-primary);
}
.new-project-page .new-project-head {
  padding:16px; border-bottom:1px solid var(--lv-border-soft);
  background:var(--lv-surface-muted);
}
.new-project-page .new-project-head strong {
  display:block; color:var(--lv-text-strong); font-size:14px;
}
.new-project-page .new-project-head small {
  display:block; margin-top:5px; color:var(--lv-text-secondary);
  font-size:11px; line-height:1.55;
}
.new-project-page .id-mode-grid {
  display:grid; grid-template-columns:1fr 1fr; gap:10px;
  padding:16px; border-bottom:1px solid var(--lv-border-soft);
}
.new-project-page .id-mode {
  padding:14px; border:1px solid var(--lv-control-border);
  border-radius:10px; background:var(--lv-control-bg);
  color:var(--lv-text-primary); -webkit-text-fill-color:currentColor;
  text-align:left; cursor:pointer;
}
.new-project-page .id-mode:hover {
  border-color:var(--lv-brand-border);
  background:var(--lv-surface-hover);
}
.new-project-page .id-mode.active {
  border-color:var(--lv-brand-border);
  background:var(--lv-brand-soft);
}
.new-project-page .id-mode.active:hover { background:var(--lv-brand-soft-strong); }
.new-project-page .id-mode b {
  display:block; color:var(--lv-text-strong); font-size:12px;
}
.new-project-page .id-mode span {
  display:block; margin-top:5px; color:var(--lv-text-secondary);
  font-size:11px; line-height:1.5;
}
.new-project-page .id-preview {
  margin:0 16px 2px; padding:12px 13px;
  border:1px solid var(--lv-border-default); border-radius:8px;
  background:var(--lv-surface-muted); color:var(--lv-text-secondary);
  font-size:11px; line-height:1.6;
}
.new-project-page .id-preview b { color:var(--lv-brand-text); }
.new-project-page .form-grid {
  display:grid; grid-template-columns:1fr 1fr; gap:12px; padding:16px;
}
.new-project-page .form-grid label {
  display:grid; gap:6px; color:var(--lv-text-secondary);
  font-size:11px; font-weight:700;
}
.new-project-page .form-grid label.full { grid-column:1 / -1; }
.new-project-page .form-grid :is(input,select,textarea) {
  border:1px solid var(--lv-control-border); border-radius:7px;
  background:var(--lv-control-bg); color:var(--lv-text-primary);
  padding:0 10px; font-size:12px;
}
.new-project-page .form-grid :is(input,select) { min-height:41px; }
.new-project-page .form-grid textarea {
  min-height:96px; padding:10px; resize:vertical;
}
.new-project-page .form-grid :is(input,select,textarea):focus-visible {
  outline:2px solid var(--lv-brand-primary); outline-offset:2px;
  border-color:var(--lv-brand-primary);
}
.new-project-page .form-grid .submit { grid-column:1 / -1; }
.new-project-page .location-tag-actions .new-project-btn {
  min-height:34px; font-size:10px;
}
.new-project-page .location-tag-status {
  font-size:10px; color:var(--lv-text-secondary); line-height:1.45;
}
.new-project-page .message {
  margin:0 16px 16px; padding:11px 13px; border:1px solid var(--lv-border-default);
  border-radius:8px; color:var(--lv-text-primary); background:var(--lv-surface-muted);
  font-size:11px; line-height:1.55;
}
.new-project-page .message.ok {
  border-color:var(--lv-success-border); background:var(--lv-success-soft);
  color:var(--lv-success);
}
.new-project-page .message.err {
  border-color:var(--lv-danger-border); background:var(--lv-danger-soft);
  color:var(--lv-danger);
}
.new-project-page .created-box { margin-top:10px; }
.new-project-page .new-project-note {
  padding:12px 16px; border-top:1px solid var(--lv-border-soft);
  color:var(--lv-text-secondary); font-size:11px; line-height:1.6;
}
.new-project-page :is(button,a):focus-visible {
  outline:2px solid var(--lv-brand-primary); outline-offset:3px;
}
@media (max-width:700px) {
  .new-project-page .id-mode-grid,
  .new-project-page .form-grid { grid-template-columns:1fr; }
  .new-project-page .form-grid label.full,
  .new-project-page .form-grid .submit { grid-column:auto; }
}
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
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
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

  function useCurrentLocation() {
    if (locating) return;
    setLocationMessage("");
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setLocationMessage("Current location requires HTTPS.");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationMessage("Current location is not available in this browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      position => {
        const latitude = Number(position.coords.latitude.toFixed(8));
        const longitude = Number(position.coords.longitude.toFixed(8));
        const accuracy = Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : 0;
        setForm(current => ({
          ...current,
          Location_Tag: `https://www.google.com/maps?q=${latitude},${longitude}`,
          Site_Latitude: String(latitude),
          Site_Longitude: String(longitude),
        }));
        setLocationMessage(`Current location added${accuracy ? ` · accuracy ±${accuracy} m` : ""}. Coordinates will be stored internally.`);
        setLocating(false);
      },
      geolocationError => {
        setLocationMessage(geolocationError.code === geolocationError.PERMISSION_DENIED
          ? "Location is blocked. Allow Location for LAND VIEW in your browser/site settings and try again."
          : geolocationError.code === geolocationError.POSITION_UNAVAILABLE
            ? "Your current location could not be determined. Check GPS and try again."
            : "Location request timed out. Check GPS and try again.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!canManage || saving) return;
    setMessage(null);
    if (mode === "manual" && !normalizedManual) {
      setMessage({ kind: "err", text: "Enter a valid manual ID, for example LV-072." });
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
      setMessage({ kind: "ok", text: `${createdId} was created successfully in Supabase. Add its structured address next so it can be filtered by Division, District, Upazila, local body and Ward on the public map.`, id: createdId });
      setExistingIds((current) => new Set([...current, createdId]));
      setForm({ ...emptyForm, Start_Date: new Date().toISOString().slice(0, 10) });
      setLocationMessage("");
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
      <PageHeader eyebrow="LAND VIEW PROJECT REGISTER" title="New Project" description="Create a new project with a distinct Project Name and Owner Name. Project Name describes the building/work; Owner Name identifies the client/owner." action={<div className="new-project-actions"><Link className="new-project-btn" data-lv-button="secondary" href="/admin/projects">← Projects</Link><Link className="new-project-btn" data-lv-button="secondary" href="/admin/projects/locations">Locations</Link><Link className="new-project-btn" data-lv-button="secondary" href="/admin/projects/legacy">Legacy Projects</Link></div>} />

      <section className="new-project-card">
        <div className="new-project-head"><strong>Project ID method</strong><small>Automatic is the normal choice. Manual is for an intentionally unused LV number that you know will never belong to its original lost project.</small></div>
        <div className="id-mode-grid">
          <button className={`id-mode ${mode === "automatic" ? "active" : ""}`} aria-pressed={mode === "automatic"} type="button" onClick={() => setMode("automatic")}><b>Automatic ID</b><span>Uses the next number after the highest project currently in Supabase. Current preview: {nextId || "calculating…"}</span></button>
          <button className={`id-mode ${mode === "manual" ? "active" : ""}`} aria-pressed={mode === "manual"} type="button" onClick={() => setMode("manual")}><b>Manual ID</b><span>Enter an unused gap such as LV-72. Existing IDs are blocked and cannot be overwritten.</span></button>
        </div>
        <div className="id-preview">
          {mode === "automatic" ? <>This project will normally receive <b>{nextId || "the next available ID"}</b>. The server checks again at save time.</> : <>Manual preview: <b>{normalizedManual || "enter an LV number below"}</b>{manualExists ? " — already in use" : normalizedManual ? " — appears unused" : ""}.</>}
        </div>

        <form className="form-grid" onSubmit={submit}>
          {mode === "manual" && <label>Manual Project ID<input value={form.Project_ID} onChange={(e)=>setForm({...form,Project_ID:e.target.value})} placeholder="LV-072" required /><span style={{fontSize:10,color:manualExists?"var(--lv-danger)":"var(--lv-text-secondary)"}}>{manualExists ? "This ID already exists." : "You may type 72, LV72 or LV-072; it will be stored as LV-072."}</span></label>}
          <label className={mode === "automatic" ? "full" : ""}>Project Name<input value={form.Project_Name} onChange={(e)=>setForm({...form,Project_Name:e.target.value})} placeholder="e.g. 7 Storied Residential Building" required /></label>
          <label>Owner Name<input value={form.Client_Name} onChange={(e)=>setForm({...form,Client_Name:e.target.value})} placeholder="Client / property owner name" required /></label>
          <label>Phone Number<input value={form.Phone_Number} onChange={(e)=>setForm({...form,Phone_Number:e.target.value})} /><WhatsAppNumberCheck phoneNumber={form.Phone_Number} /></label>
          <label>Referred By<input value={form.Referred_By} onChange={(e)=>setForm({...form,Referred_By:e.target.value})} placeholder="Referrer name / source" /></label>
          <label>Ref. Contact<input value={form.Ref_Contact} onChange={(e)=>setForm({...form,Ref_Contact:e.target.value})} placeholder="Referrer phone / contact" /></label>
          <label>Project Type<input value={form.Project_Type} onChange={(e)=>setForm({...form,Project_Type:e.target.value})} placeholder="Residential / Commercial / etc." /></label>
          <label>Address<input value={form.Location} onChange={(e)=>setForm({...form,Location:e.target.value})} placeholder="Project/site address" /></label>
          <label>Location Tag<input value={form.Location_Tag} onChange={(e)=>setForm({...form,Location_Tag:e.target.value})} placeholder="Google Maps link or use current location" /><div className="location-tag-actions"><button className="new-project-btn" data-lv-button="secondary" type="button" onClick={useCurrentLocation} disabled={locating}>{locating ? "Getting location…" : "Use Current Location"}</button>{locationMessage && <span className="location-tag-status">{locationMessage}</span>}</div></label>
          <label>Project Area<input value={form.Project_Area} onChange={(e)=>setForm({...form,Project_Area:e.target.value})} placeholder="e.g. 5 decimal / 3200 sft" /></label>
          <label>Stories / Floors<input value={form.Number_of_Stories} onChange={(e)=>setForm({...form,Number_of_Stories:e.target.value})} /></label>
          <label>Start Date<input type="date" value={form.Start_Date} onChange={(e)=>setForm({...form,Start_Date:e.target.value})} /></label>
          <label>Design Stage<select value={form.Design_Stage_Status} onChange={(e)=>setForm({...form,Design_Stage_Status:e.target.value})}><option>Pending</option><option>In Progress</option><option>Completed</option></select></label>
          <label>Approval Stage<select value={form.Approval_Stage_Status} onChange={(e)=>setForm({...form,Approval_Stage_Status:e.target.value})}><option>Pending</option><option>In Progress</option><option>Completed</option></select></label>
          <label>Supervision / Construction Stage<select value={form.Supervision_Stage_Status} onChange={(e)=>setForm({...form,Supervision_Stage_Status:e.target.value})}><option value="Pending">Pending</option><option value="In Progress">In Progress</option><option value="Completed">Completed / Not Required</option></select></label>
          <label>Site Geofence Radius (m)<input type="number" min="25" max="1000" value={form.Site_Geofence_Radius_M} onChange={(e)=>setForm({...form,Site_Geofence_Radius_M:e.target.value})} /></label>
          <label className="full">Notes<textarea value={form.Notes} onChange={(e)=>setForm({...form,Notes:e.target.value})} placeholder="Optional project notes" /></label>
          <button className="new-project-btn primary submit" data-lv-button="primary" type="submit" disabled={!canManage || saving || (mode === "manual" && manualExists)}>{saving ? "Creating project…" : mode === "automatic" ? "Create Project with Automatic ID" : `Create Project as ${normalizedManual || "Manual ID"}`}</button>
        </form>

        {message && <div className={`message ${message.kind}`}>{message.text}{message.kind === "ok" && message.id && <div className="created-box"><Link className="new-project-btn primary" data-lv-button="primary" href={`/admin/projects/locations?project=${encodeURIComponent(message.id)}`}>Add Structured Address</Link><Link className="new-project-btn" data-lv-button="secondary" href="/admin/projects">View Projects</Link><button className="new-project-btn" data-lv-button="secondary" type="button" onClick={()=>router.push(`/admin/projects/${encodeURIComponent(message.id || "")}`)}>Open Project</button></div>}</div>}
        {!canManage && <div className="message err">Admin or manager access is required to create projects.</div>}
        <div className="new-project-note">Project Name and Owner Name are stored separately. Do not use the owner&apos;s name as the Project Name unless that is genuinely the project&apos;s official name.</div>
      </section>
    </div>
  </>;
}
