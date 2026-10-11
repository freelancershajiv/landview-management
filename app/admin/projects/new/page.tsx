"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { landViewApi } from "@/lib/api";
import { ErrorState, LoadingState, PageHeader } from "@/components/lv-ui";
import WhatsAppNumberCheck from "@/components/whatsapp-number-check";
import LegacyProjectFinanceImport, { createEmptyLegacyFinance, type LegacyFinanceDraft } from "@/components/legacy-project-finance-import";

type IdMode = "automatic" | "manual";
type EntryMode = "current" | "legacy";
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

const currentEmptyForm: FormState = {
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

const legacyEmptyForm: FormState = {
  ...currentEmptyForm,
  Start_Date: "",
  Design_Stage_Status: "Completed",
  Approval_Stage_Status: "Completed",
  Supervision_Stage_Status: "Completed",
};

const css = `
.new-project-page{display:grid;gap:18px;max-width:1240px}.new-project-actions{display:flex;gap:8px;flex-wrap:wrap}.new-project-btn{height:40px;padding:0 14px;border:1px solid var(--theme-line-rgba_255_255_255__14_, rgba(255,255,255,.14));border-radius:8px;background:var(--theme-bg-_18232d, #18232d);color:var(--theme-ink-_fff, #fff);font-size:12px;font-weight:800;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.new-project-btn.primary{background:#d61f26;border-color:var(--theme-line-_d61f26, #d61f26)}.new-project-btn:disabled{opacity:.5;cursor:not-allowed}.new-project-card{border:1px solid var(--theme-line-rgba_255_255_255__11_, rgba(255,255,255,.11));border-radius:12px;background:var(--theme-bg-_0e1720, #0e1720);overflow:hidden}.new-project-head{padding:16px;border-bottom:1px solid var(--theme-line-rgba_255_255_255__08_, rgba(255,255,255,.08));background:var(--theme-bg-_141e28, #141e28)}.new-project-head strong{display:block;color:var(--theme-ink-_f4f6f8, #f4f6f8);font-size:14px}.new-project-head small{display:block;margin-top:5px;color:var(--theme-ink-_7e8b95, #7e8b95);font-size:11px;line-height:1.55}.entry-mode-grid,.id-mode-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:16px;border-bottom:1px solid var(--theme-line-rgba_255_255_255__08_, rgba(255,255,255,.08))}.entry-mode,.id-mode{padding:14px;border:1px solid var(--theme-line-rgba_255_255_255__1_, rgba(255,255,255,.1));border-radius:10px;background:var(--theme-bg-_111b24, #111b24);color:var(--theme-ink-_b9c2c9, #b9c2c9);text-align:left;cursor:pointer}.entry-mode.active,.id-mode.active{border-color:var(--theme-line-_d61f26, #d61f26);background:var(--theme-bg-rgba_214_31_38__09_, rgba(214,31,38,.09))}.entry-mode b,.id-mode b{display:block;color:var(--theme-ink-_fff, #fff);font-size:12px}.entry-mode span,.id-mode span{display:block;margin-top:5px;color:var(--theme-ink-_7f8b95, #7f8b95);font-size:11px;line-height:1.5}.entry-mode .tag{display:inline-flex;margin-bottom:8px;padding:3px 6px;border-radius:999px;background:rgba(255,255,255,.07);color:#9ca8b0;font-size:8px;font-weight:900;letter-spacing:.08em}.entry-mode.active .tag{background:rgba(214,31,38,.18);color:#ff9a94}.legacy-banner{margin:14px 16px 0;padding:12px 13px;border:1px solid rgba(214,31,38,.25);border-radius:8px;background:rgba(214,31,38,.06);color:#c9d0d5;font-size:10px;line-height:1.6}.legacy-banner b{color:#ff817a}.id-preview{margin:0 16px 2px;padding:12px 13px;border:1px solid var(--theme-line-rgba_255_255_255__09_, rgba(255,255,255,.09));border-radius:8px;background:var(--theme-bg-_101922, #101922);color:var(--theme-ink-_b8c1c8, #b8c1c8);font-size:11px;line-height:1.6}.id-preview b{color:var(--theme-ink-_ff7a72, #ff7a72)}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:16px}.form-grid>label{display:grid;gap:6px;color:var(--theme-ink-_8d99a3, #8d99a3);font-size:11px;font-weight:700}.form-grid>label.full{grid-column:1/-1}.form-grid>label input,.form-grid>label select,.form-grid>label textarea{border:1px solid var(--theme-line-rgba_255_255_255__13_, rgba(255,255,255,.13));border-radius:7px;background:var(--theme-bg-_111b24, #111b24);color:var(--theme-ink-_edf1f4, #edf1f4);padding:0 10px;font-size:12px}.form-grid>label input,.form-grid>label select{height:41px}.form-grid>label textarea{min-height:96px;padding:10px;resize:vertical}.form-grid>label input:focus,.form-grid>label select:focus,.form-grid>label textarea:focus{outline:none;border-color:var(--theme-line-_d61f26, #d61f26)}.form-grid .submit{grid-column:1/-1}.location-tag-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.location-tag-actions .new-project-btn{height:34px;font-size:10px}.location-tag-status{font-size:10px;color:var(--theme-ink-_7f8b95, #7f8b95);line-height:1.45}.message{margin:0 16px 16px;padding:11px 13px;border:1px solid var(--theme-line-rgba_255_255_255__1_, rgba(255,255,255,.1));border-radius:8px;font-size:11px;line-height:1.55}.message.ok{border-color:var(--theme-line-rgba_59_190_120__35_, rgba(59,190,120,.35));color:var(--theme-ink-_95e2b2, #95e2b2)}.message.err{border-color:var(--theme-line-rgba_214_31_38__35_, rgba(214,31,38,.35));color:var(--theme-ink-_ff9d96, #ff9d96)}.created-box{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.new-project-note{padding:12px 16px;border-top:1px solid var(--theme-line-rgba_255_255_255__08_, rgba(255,255,255,.08));color:var(--theme-ink-_74818c, #74818c);font-size:11px;line-height:1.6}@media(max-width:700px){.entry-mode-grid,.id-mode-grid,.form-grid{grid-template-columns:1fr}.form-grid>label.full,.form-grid .submit{grid-column:auto}}
`;

function text(value: unknown) { return String(value ?? "").trim(); }
function amount(value: unknown) { const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, "")); return Number.isFinite(n) ? n : 0; }
function normalizeProjectId(value: unknown) {
  const raw = text(value).toUpperCase();
  if (!raw) return "";
  const match = raw.match(/LV[\s_-]*0*(\d+)/i);
  if (match?.[1]) return `LV-${String(Number(match[1])).padStart(3, "0")}`;
  const digits = raw.replace(/\D/g, "");
  return digits ? `LV-${String(Number(digits)).padStart(3, "0")}` : "";
}

export default function NewProjectPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("");
  const [entryMode, setEntryMode] = useState<EntryMode>("current");
  const [mode, setMode] = useState<IdMode>("automatic");
  const [nextId, setNextId] = useState("");
  const [existingIds, setExistingIds] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<FormState>(currentEmptyForm);
  const [legacyFinance, setLegacyFinance] = useState<LegacyFinanceDraft>(() => createEmptyLegacyFinance());
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locationMessage, setLocationMessage] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState<{kind:"ok"|"err"; text:string; id?:string}|null>(null);

  const canManage = role === "admin" || role === "manager";
  const normalizedManual = useMemo(() => normalizeProjectId(form.Project_ID), [form.Project_ID]);
  const manualExists = Boolean(normalizedManual && existingIds.has(normalizedManual));
  const effectiveProjectCode = mode === "manual" ? normalizedManual : nextId;

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

  function chooseEntryMode(next: EntryMode) {
    setEntryMode(next);
    setMessage(null);
    setLegacyFinance(createEmptyLegacyFinance());
    if (next === "legacy") {
      setMode("manual");
      setForm((current) => ({ ...legacyEmptyForm, Project_ID: current.Project_ID }));
    } else {
      setMode("automatic");
      setForm(currentEmptyForm);
    }
    setLocationMessage("");
  }

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
          ? "Location access is blocked. Allow Location for LAND VIEW in your browser/site settings and try again."
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
      setMessage({ kind: "err", text: `${normalizedManual} already exists. Open that project instead of creating a duplicate.` });
      return;
    }
    const activeBills = legacyFinance.bills.filter((bill) => amount(bill.amount) > 0);
    const activePayments = entryMode === "legacy" ? legacyFinance.payments.filter((payment) => amount(payment.amount) > 0) : [];
    const invalidBill = activeBills.find((bill) => !bill.description.trim() || amount(bill.discount) < 0 || amount(bill.discount) > amount(bill.amount));
    if (invalidBill) {
      setMessage({ kind: "err", text: "Check the active bill rows. Each used row needs a service name and discount cannot exceed the gross amount." });
      return;
    }
    setSaving(true);
    try {
      const bills = activeBills.map(({ key: _key, ...row }) => row);
      const payments = activePayments.map(({ key: _key, ...row }) => row);
      const response = await fetch("/api/projects/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          ...form,
          idMode: mode,
          entryMode,
          legacyImport: entryMode === "legacy",
          Project_ID: mode === "manual" ? normalizedManual : "",
          bills,
          payments,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not create the project."));
      const createdId = text(json.data?.Project_ID);
      const billSummary = Number(json.data?.billCount || 0) > 0 ? ` ${Number(json.data?.billCount || 0)} bill(s) saved.` : "";
      const legacySummary = json.data?.legacyImport
        ? ` ${Number(json.data?.paymentCount || 0)} historical payment(s); ${Number(json.data?.verifiedPaymentCount || 0)} ledger verified, ${Number(json.data?.mismatchPaymentCount || 0)} mismatch, ${Number(json.data?.unlinkedPaymentCount || 0)} unlinked.`
        : "";
      setMessage({ kind: "ok", text: `${createdId} was created successfully in Supabase.${billSummary}${legacySummary} You can now open the project or add its structured map address.`, id: createdId });
      setExistingIds((current) => new Set([...current, createdId]));
      setForm(entryMode === "legacy" ? legacyEmptyForm : currentEmptyForm);
      setLegacyFinance(createEmptyLegacyFinance());
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
      <PageHeader eyebrow="LAND VIEW PROJECT REGISTER" title="New Project" description="Register a current project or rebuild a historical project. Standard billing categories are opened automatically so bills can be entered directly in rows." action={<div className="new-project-actions"><Link className="new-project-btn" href="/admin/projects">← Projects</Link><Link className="new-project-btn" href="/admin/projects/locations">Locations</Link><Link className="new-project-btn" href="/admin/projects/legacy">Legacy Projects</Link></div>} />

      <section className="new-project-card">
        <div className="new-project-head"><strong>Project entry type</strong><small>Both modes include the full row-based bill setup. Historical / Old Project additionally lets you enter past payments and reconcile them against the Accounts Ledger.</small></div>
        <div className="entry-mode-grid">
          <button className={`entry-mode ${entryMode === "current" ? "active" : ""}`} type="button" onClick={() => chooseEntryMode("current")}><span className="tag">NORMAL ENTRY</span><b>Current / New Project</b><span>Enter project details and initial billing now. All bill groups are already expanded; blank rows are ignored.</span></button>
          <button className={`entry-mode ${entryMode === "legacy" ? "active" : ""}`} type="button" onClick={() => chooseEntryMode("legacy")}><span className="tag">FULL HISTORY</span><b>Historical / Old Project</b><span>Enter full project details, old bills, old payments and link each deposit to the existing Accounts Ledger for verification.</span></button>
        </div>
        {entryMode === "legacy" && <div className="legacy-banner"><b>No duplicate income:</b> linked historical payments are stored for project billing but are marked not to affect the business balance again. The selected old ledger row remains the authoritative accounting transaction.</div>}

        <div className="new-project-head"><strong>Project ID method</strong><small>{entryMode === "legacy" ? "Manual is selected by default so the original historical LV File ID is preserved. You can still use Automatic if the old project never had an LV number." : "Automatic is the normal choice. Manual is for an intentionally unused LV number."}</small></div>
        <div className="id-mode-grid">
          <button className={`id-mode ${mode === "automatic" ? "active" : ""}`} type="button" onClick={() => setMode("automatic")}><b>Automatic ID</b><span>Uses the next number after the highest project currently in Supabase. Current preview: {nextId || "calculating…"}</span></button>
          <button className={`id-mode ${mode === "manual" ? "active" : ""}`} type="button" onClick={() => setMode("manual")}><b>Manual / Historical ID</b><span>Enter the original LV number. Existing IDs are blocked and cannot be overwritten.</span></button>
        </div>
        <div className="id-preview">
          {mode === "automatic" ? <>This project will normally receive <b>{nextId || "the next available ID"}</b>. The server checks again at save time.</> : <>Manual preview: <b>{normalizedManual || "enter an LV number below"}</b>{manualExists ? " — already in use" : normalizedManual ? " — available" : ""}.</>}
        </div>

        <form className="form-grid" onSubmit={submit}>
          {mode === "manual" && <label>Manual Project ID<input value={form.Project_ID} onChange={(e)=>setForm({...form,Project_ID:e.target.value})} placeholder="LV-072" required /><span style={{fontSize:10,color:manualExists?"#ff8f88":"#6f7d88"}}>{manualExists ? "This ID already exists." : "You may type 72, LV72 or LV-072; it will be stored as LV-072."}</span></label>}
          <label className={mode === "automatic" ? "full" : ""}>Project Name<input value={form.Project_Name} onChange={(e)=>setForm({...form,Project_Name:e.target.value,Client_Name:form.Client_Name || e.target.value})} required /></label>
          <label>Client Name<input value={form.Client_Name} onChange={(e)=>setForm({...form,Client_Name:e.target.value})} /></label>
          <label>Phone Number<input value={form.Phone_Number} onChange={(e)=>setForm({...form,Phone_Number:e.target.value})} /><WhatsAppNumberCheck phoneNumber={form.Phone_Number} /></label>
          <label>Referred By<input value={form.Referred_By} onChange={(e)=>setForm({...form,Referred_By:e.target.value})} placeholder="Referrer name / source" /></label>
          <label>Ref. Contact<input value={form.Ref_Contact} onChange={(e)=>setForm({...form,Ref_Contact:e.target.value})} placeholder="Referrer phone / contact" /></label>
          <label>Project Type<input value={form.Project_Type} onChange={(e)=>setForm({...form,Project_Type:e.target.value})} placeholder="Residential / Commercial / etc." /></label>
          <label>Address<input value={form.Location} onChange={(e)=>setForm({...form,Location:e.target.value})} placeholder="Project/site address" /></label>
          <label>Location Tag<input value={form.Location_Tag} onChange={(e)=>setForm({...form,Location_Tag:e.target.value})} placeholder="Google Maps link or use current location" /><div className="location-tag-actions"><button className="new-project-btn" type="button" onClick={useCurrentLocation} disabled={locating}>{locating ? "Getting location…" : "Use Current Location"}</button>{locationMessage && <span className="location-tag-status">{locationMessage}</span>}</div></label>
          <label>Project Area<input value={form.Project_Area} onChange={(e)=>setForm({...form,Project_Area:e.target.value})} placeholder="e.g. 5 decimal / 3200 sft" /></label>
          <label>Stories / Floors<input value={form.Number_of_Stories} onChange={(e)=>setForm({...form,Number_of_Stories:e.target.value})} /></label>
          <label>Start Date<input type="date" value={form.Start_Date} onChange={(e)=>setForm({...form,Start_Date:e.target.value})} /></label>
          <label>Design Stage<select value={form.Design_Stage_Status} onChange={(e)=>setForm({...form,Design_Stage_Status:e.target.value})}><option>Pending</option><option>In Progress</option><option>Completed</option></select></label>
          <label>Approval Stage<select value={form.Approval_Stage_Status} onChange={(e)=>setForm({...form,Approval_Stage_Status:e.target.value})}><option>Pending</option><option>In Progress</option><option>Completed</option></select></label>
          <label>Supervision / Construction Stage<select value={form.Supervision_Stage_Status} onChange={(e)=>setForm({...form,Supervision_Stage_Status:e.target.value})}><option value="Pending">Pending</option><option value="In Progress">In Progress</option><option value="Completed">Completed / Not Required</option></select></label>
          <label>Site Geofence Radius (m)<input type="number" min="25" max="1000" value={form.Site_Geofence_Radius_M} onChange={(e)=>setForm({...form,Site_Geofence_Radius_M:e.target.value})} /></label>
          <label className="full">Notes<textarea value={form.Notes} onChange={(e)=>setForm({...form,Notes:e.target.value})} placeholder={entryMode === "legacy" ? "Historical project notes / source record notes" : "Optional project notes"} /></label>

          <LegacyProjectFinanceImport mode={entryMode} projectCode={effectiveProjectCode} value={legacyFinance} onChange={setLegacyFinance} />

          <button className="new-project-btn primary submit" type="submit" disabled={!canManage || saving || (mode === "manual" && manualExists)}>{saving ? (entryMode === "legacy" ? "Importing full project history…" : "Creating project and bills…") : entryMode === "legacy" ? `Create Historical Project ${effectiveProjectCode || ""}`.trim() : mode === "automatic" ? "Create Project with Automatic ID" : `Create Project as ${normalizedManual || "Manual ID"}`}</button>
        </form>

        {message && <div className={`message ${message.kind}`}>{message.text}{message.kind === "ok" && message.id && <div className="created-box"><button className="new-project-btn primary" type="button" onClick={()=>router.push(`/admin/projects/${encodeURIComponent(message.id || "")}`)}>Open Project</button><Link className="new-project-btn" href={`/admin/projects/locations?project=${encodeURIComponent(message.id)}`}>Add Structured Address</Link><Link className="new-project-btn" href="/admin/projects">View Projects</Link></div>}</div>}
        {!canManage && <div className="message err">Admin or manager access is required to create projects.</div>}
        <div className="new-project-note">All standard bill rows are shown automatically. Leave a row blank if that service is not part of the project. Historical import is only for genuinely old projects; if the File ID already exists, open that project and correct its billing/payment history instead of creating a duplicate.</div>
      </section>
    </div>
  </>;
}
