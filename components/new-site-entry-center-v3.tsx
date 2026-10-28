"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import WhatsAppNumberCheck from "@/components/whatsapp-number-check";
import ProjectLocationSimplifier, { type ProjectLocationDraft } from "@/components/project-location-simplifier";

type Entry = {
  proposalId: string; prospectId?: string; clientName: string; phone: string; projectTitle?: string; projectLocation?: string;
  projectType?: string; plotArea?: string; floors?: string; approvalStatus?: string; submittedRole?: string; assignedTo?: string;
  createdBy?: string; createdAt?: string; approvalNotes?: string; latitude?: number | string; longitude?: number | string;
};

type FormState = {
  siteVisitDate: string; projectTitle: string; clientName: string; phone: string; email: string; address: string; referredBy: string; refContact: string;
  projectType: string; projectLocation: string; locationTag: string; plotArea: string; floors: string; startDate: string;
  designStageStatus: string; approvalStageStatus: string; supervisionStageStatus: string; siteGeofenceRadiusM: string;
  division: string; district: string; upazilaThana: string; localBodyType: string; localBodyName: string; wardNo: string; villageArea: string; roadHolding: string;
  mouza: string; jlNo: string; dagNo: string; khatianNo: string; latitude: string; longitude: string; locationAccuracyM: string; locationCapturedAt: string; siteNotes: string;
};

function localDate() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10); }
function blankForm(): FormState { return {
  siteVisitDate: localDate(), projectTitle: "", clientName: "", phone: "", email: "", address: "", referredBy: "", refContact: "",
  projectType: "Residential", projectLocation: "", locationTag: "", plotArea: "", floors: "", startDate: localDate(),
  designStageStatus: "In Progress", approvalStageStatus: "Pending", supervisionStageStatus: "Completed", siteGeofenceRadiusM: "150",
  division: "", district: "", upazilaThana: "", localBodyType: "", localBodyName: "", wardNo: "", villageArea: "", roadHolding: "",
  mouza: "", jlNo: "", dagNo: "", khatianNo: "", latitude: "", longitude: "", locationAccuracyM: "", locationCapturedAt: "", siteNotes: "",
}; }
function dateText(value?: string) { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleString("en-GB", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" }); }
async function requestApi(method: "GET" | "POST", body?: Record<string, unknown>) {
  const response = await fetch("/api/site-entry-v2", { method, credentials:"same-origin", cache:"no-store", headers: body ? { "Content-Type":"application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Site entry request failed."));
  return json.data;
}

const css = `
.nse{max-width:1500px;margin:0 auto;color:var(--lv-text-primary)}.nse *{box-sizing:border-box}.nse-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:12px}.nse-head small{color:var(--lv-brand-text);font-size:8px;font-weight:950;letter-spacing:.13em}.nse-head h1{margin:5px 0 3px;font-size:29px}.nse-head p{margin:0;max-width:850px;color:var(--lv-text-muted);font-size:9px;line-height:1.55}.nse-role{padding:6px 9px;border:1px solid var(--lv-border-default);border-radius:999px;font-size:8px;font-weight:950;text-transform:uppercase}.nse-flow{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:12px}.nse-flow div,.nse-card,.nse-metric,.nse-table-wrap{border:1px solid var(--lv-border-default);background:var(--lv-surface-panel)}.nse-flow div{padding:10px 12px;border-radius:8px}.nse-flow b{display:block;font-size:9px}.nse-flow small{display:block;margin-top:3px;color:var(--lv-text-muted);font-size:7px;line-height:1.4}.nse-msg{padding:9px 11px;border-radius:8px;margin-bottom:10px;font-size:9px}.nse-msg.err{background:var(--lv-danger-soft);color:var(--lv-danger)}.nse-msg.ok{background:var(--lv-success-soft);color:var(--lv-success)}.nse-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:11px}.nse-card{border-radius:10px;padding:14px}.nse-card.full{grid-column:1/-1}.nse-card h2{margin:0 0 3px;font-size:14px}.nse-card>p{margin:0 0 11px;color:var(--lv-text-muted);font-size:8px;line-height:1.45}.nse-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.nse-fields label{display:grid;gap:5px;color:var(--lv-text-muted);font-size:8px;font-weight:850}.nse-fields label.full{grid-column:1/-1}.nse-fields input,.nse-fields select,.nse-fields textarea{width:100%;min-width:0;min-height:39px;padding:8px 9px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:9px}.nse-fields textarea{min-height:82px;resize:vertical}.nse-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.nse-btn{min-height:36px;padding:0 11px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px;font-weight:950;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}.nse-btn.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.nse-btn.good{background:var(--lv-success-soft);color:var(--lv-success)}.nse-btn.danger{background:var(--lv-danger-soft);color:var(--lv-danger)}.nse-btn:disabled{opacity:.5;cursor:not-allowed}.nse-submit{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:12px}.nse-help{font-size:8px;color:var(--lv-text-muted);line-height:1.45}.nse-register{margin-top:15px}.nse-register-head{display:flex;align-items:end;justify-content:space-between;gap:10px;margin-bottom:8px}.nse-register-head h2{margin:0;font-size:16px}.nse-register-head p{margin:3px 0 0;color:var(--lv-text-muted);font-size:8px}.nse-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:8px}.nse-metric{padding:10px;border-radius:8px}.nse-metric span{display:block;font-size:7px;text-transform:uppercase;color:var(--lv-text-muted);font-weight:900}.nse-metric strong{display:block;margin-top:4px;font-size:17px}.nse-table-wrap{overflow:auto;border-radius:9px}.nse-table{width:100%;min-width:980px;border-collapse:collapse}.nse-table th,.nse-table td{padding:9px 10px;border-bottom:1px solid var(--lv-border-subtle);text-align:left;font-size:8px;vertical-align:top}.nse-table th{background:var(--lv-surface-muted);color:var(--lv-text-muted);font-size:7px;text-transform:uppercase}.nse-id{font-weight:950;color:var(--lv-brand-text)}.nse-sub{display:block;margin-top:3px;color:var(--lv-text-muted);font-size:7px}.nse-badge{display:inline-flex;padding:4px 6px;border-radius:999px;background:var(--lv-warning-soft);color:var(--lv-warning);font-size:7px;font-weight:950}.nse-badge.Approved{background:var(--lv-success-soft);color:var(--lv-success)}.nse-badge.Rejected{background:var(--lv-danger-soft);color:var(--lv-danger)}@media(max-width:900px){.nse-head{align-items:flex-start;flex-direction:column}.nse-grid{grid-template-columns:1fr}.nse-card.full{grid-column:auto}.nse-flow,.nse-metrics{grid-template-columns:1fr}}@media(max-width:620px){.nse-fields{grid-template-columns:1fr}.nse-fields label.full{grid-column:auto}.nse-submit{align-items:stretch;flex-direction:column}.nse-actions .nse-btn,.nse-submit .nse-btn{width:100%}}
`;

export default function NewSiteEntryCenterV3() {
  const [form, setForm] = useState<FormState>(() => blankForm());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [role, setRole] = useState("");
  const [canReview, setCanReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) { setForm((current) => ({ ...current, [key]: value })); }
  async function load() { setLoading(true); setError(""); try { const data = await requestApi("GET"); setRole(String(data?.role || "")); setCanReview(Boolean(data?.canReview)); setEntries(Array.isArray(data?.entries) ? data.entries : []); } catch (e) { setError(e instanceof Error ? e.message : "Could not load site entries."); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, []);

  const locationDraft: ProjectLocationDraft = useMemo(() => ({
    division: form.division, district: form.district, upazilaThana: form.upazilaThana, localBodyType: form.localBodyType,
    localBodyName: form.localBodyName, wardNo: form.wardNo, villageArea: form.villageArea, roadHolding: form.roadHolding,
  }), [form.division, form.district, form.upazilaThana, form.localBodyType, form.localBodyName, form.wardNo, form.villageArea, form.roadHolding]);

  function setLocationDraft(next: ProjectLocationDraft) {
    setForm((current) => ({ ...current, ...next }));
  }

  async function submit() {
    if (saving) return;
    setError(""); setMessage("");
    if (!form.projectTitle.trim()) return setError("Project name / title is required.");
    if (!form.clientName.trim()) return setError("Client / owner name is required.");
    if (!form.phone.trim()) return setError("Phone number is required.");
    if (!form.projectLocation.trim() && ![form.roadHolding, form.villageArea, form.localBodyName, form.upazilaThana, form.district, form.division].some((v) => v.trim())) return setError("Add the site address or location pin first.");
    setSaving(true);
    try {
      const entry = await requestApi("POST", { action:"create", ...form });
      const approvedNow = String(entry?.approvalStatus || "").toLowerCase() === "approved";
      setMessage(approvedNow ? `${entry.proposalId} created as a Draft proposal.` : `${entry.proposalId} submitted for Management/Admin approval.`);
      setForm(blankForm());
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the new site entry."); }
    finally { setSaving(false); }
  }

  async function review(entry: Entry, approve: boolean) {
    if (!canReview || reviewing) return;
    let notes = "";
    if (!approve) { const reason = window.prompt("Reason for rejecting this site entry:", ""); if (reason === null) return; notes = reason.trim(); }
    setReviewing(entry.proposalId); setError(""); setMessage("");
    try { await requestApi("POST", { action: approve ? "approve" : "reject", proposalId: entry.proposalId, notes }); setMessage(approve ? `${entry.proposalId} approved.` : `${entry.proposalId} rejected.`); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update the site entry."); }
    finally { setReviewing(""); }
  }

  const pending = useMemo(() => entries.filter((entry) => String(entry.approvalStatus).toLowerCase() === "pending"), [entries]);
  const approved = useMemo(() => entries.filter((entry) => String(entry.approvalStatus).toLowerCase() === "approved"), [entries]);

  return <main className="nse">
    <style dangerouslySetInnerHTML={{ __html: css }} />
    <header className="nse-head"><div><small>LAND VIEW / SITE → PROPOSAL</small><h1>Enter New Site / Project</h1><p>Project and client details stay the same, but location entry is now pin-first: use current GPS or paste a Google Maps pin and LAND VIEW fills the structured Bangladesh address automatically.</p></div><span className="nse-role">{role || "Loading role"}</span></header>
    <div className="nse-flow"><div><b>1 · Project + Pin</b><small>Enter owner/project basics and capture one location pin.</small></div><div><b>2 · Auto Address</b><small>Division, district, upazila and local details are filled automatically.</small></div><div><b>3 · Proposal</b><small>{canReview ? "Management entries become Draft proposals immediately." : "Employee entries wait for approval."}</small></div></div>
    {error ? <div className="nse-msg err">{error}</div> : null}{message ? <div className="nse-msg ok">{message}</div> : null}

    <div className="nse-grid">
      <section className="nse-card full"><h2>Project & Client</h2><p>Only the normal commercial/contact details are entered manually.</p><div className="nse-fields">
        <label>Project Name / Title<input value={form.projectTitle} onChange={(e) => patch("projectTitle", e.target.value)} placeholder="Project name" /></label>
        <label>Client / Owner Name<input value={form.clientName} onChange={(e) => patch("clientName", e.target.value)} placeholder="Owner name" /></label>
        <label>Phone Number<input inputMode="tel" value={form.phone} onChange={(e) => patch("phone", e.target.value)} placeholder="01XXXXXXXXX" /><WhatsAppNumberCheck phoneNumber={form.phone} /></label>
        <label>Email<input type="email" value={form.email} onChange={(e) => patch("email", e.target.value)} placeholder="Optional" /></label>
        <label>Referred By<input value={form.referredBy} onChange={(e) => patch("referredBy", e.target.value)} placeholder="Referrer name / source" /></label>
        <label>Ref. Contact<input value={form.refContact} onChange={(e) => patch("refContact", e.target.value)} placeholder="Referrer phone / contact" /></label>
        <label>Project Type<select value={form.projectType} onChange={(e) => patch("projectType", e.target.value)}><option>Residential</option><option>Commercial</option><option>Mixed Use</option><option>Industrial</option><option>Institutional</option><option>Other</option></select></label>
        <label>Project Area<input value={form.plotArea} onChange={(e) => patch("plotArea", e.target.value)} placeholder="e.g. 5 decimal / 3200 sft" /></label>
        <label>Stories / Floors<input value={form.floors} onChange={(e) => patch("floors", e.target.value)} placeholder="e.g. 6 / G+5" /></label>
        <label>Start Date<input type="date" value={form.startDate} onChange={(e) => patch("startDate", e.target.value)} /></label>
        <label>Design Stage<select value={form.designStageStatus} onChange={(e) => patch("designStageStatus", e.target.value)}><option>Pending</option><option>In Progress</option><option>Completed</option></select></label>
        <label>Approval Stage<select value={form.approvalStageStatus} onChange={(e) => patch("approvalStageStatus", e.target.value)}><option>Pending</option><option>In Progress</option><option>Completed</option></select></label>
        <label>Supervision / Construction<select value={form.supervisionStageStatus} onChange={(e) => patch("supervisionStageStatus", e.target.value)}><option value="Pending">Pending</option><option value="In Progress">In Progress</option><option value="Completed">Completed / Not Required</option></select></label>
        <label>Site Geofence Radius (m)<input type="number" min="25" max="1000" value={form.siteGeofenceRadiusM} onChange={(e) => patch("siteGeofenceRadiusM", e.target.value)} /></label>
        <label className="full">Client / Contact Address<input value={form.address} onChange={(e) => patch("address", e.target.value)} placeholder="Optional client contact address" /></label>
      </div></section>

      <section className="nse-card full"><h2>Site Location</h2><p>No need to type Division, District, Upazila, Ward or coordinates during normal entry.</p>
        <ProjectLocationSimplifier value={locationDraft} onChange={setLocationDraft} address={form.projectLocation} onAddressChange={(value) => patch("projectLocation", value)} locationTag={form.locationTag} onLocationTagChange={(value) => patch("locationTag", value)} siteLatitude={form.latitude} siteLongitude={form.longitude} onCoordinatesChange={(latitude, longitude) => setForm((current) => ({ ...current, latitude, longitude, locationCapturedAt: new Date().toISOString() }))} title="Site Address & Pin" initiallyOpen />
      </section>

      <section className="nse-card"><h2>Site / Land Record</h2><p>Enter only when these records are available.</p><div className="nse-fields">
        <label>Site Entry Date<input type="date" value={form.siteVisitDate} onChange={(e) => patch("siteVisitDate", e.target.value)} /></label>
        <label>Mouza<input value={form.mouza} onChange={(e) => patch("mouza", e.target.value)} /></label>
        <label>JL No.<input value={form.jlNo} onChange={(e) => patch("jlNo", e.target.value)} /></label>
        <label>Dag No.<input value={form.dagNo} onChange={(e) => patch("dagNo", e.target.value)} /></label>
        <label>Khatian No.<input value={form.khatianNo} onChange={(e) => patch("khatianNo", e.target.value)} /></label>
      </div></section>

      <section className="nse-card"><h2>Site Notes</h2><p>Access, road condition, special requirements or observations.</p><div className="nse-fields"><label className="full">Notes<textarea value={form.siteNotes} onChange={(e) => patch("siteNotes", e.target.value)} placeholder="Optional site notes…" /></label></div>
        <div className="nse-submit"><span className="nse-help">Pin and structured address are stored with the proposal and carried to the project during conversion.</span><div className="nse-actions"><button type="button" className="nse-btn" onClick={() => setForm(blankForm())} disabled={saving}>Clear</button><button type="button" className="nse-btn primary" onClick={() => void submit()} disabled={saving}>{saving ? "Saving…" : canReview ? "Create Draft Proposal" : "Submit for Approval"}</button></div></div>
      </section>
    </div>

    <section className="nse-register"><div className="nse-register-head"><div><h2>{canReview ? "Site Entry Register & Approval Queue" : "My Site Entries"}</h2><p>{canReview ? "Review employee entries and open approved proposals." : "Track Management/Admin approval of submitted proposals."}</p></div><button type="button" className="nse-btn" onClick={() => void load()} disabled={loading}>↻ Refresh</button></div>
      <div className="nse-metrics"><div className="nse-metric"><span>Total Entries</span><strong>{entries.length}</strong></div><div className="nse-metric"><span>Pending</span><strong>{pending.length}</strong></div><div className="nse-metric"><span>Approved</span><strong>{approved.length}</strong></div></div>
      <div className="nse-table-wrap"><table className="nse-table"><thead><tr><th>Proposal</th><th>Owner</th><th>Project</th><th>Location</th><th>Submitted</th><th>Approval</th><th>Actions</th></tr></thead><tbody>{entries.map((entry) => { const approval = entry.approvalStatus || "Pending"; const isPending = approval.toLowerCase() === "pending"; return <tr key={entry.proposalId}>
        <td><span className="nse-id">{entry.proposalId}</span><span className="nse-sub">{entry.prospectId || "Site entry"}</span></td><td><strong>{entry.clientName}</strong><span className="nse-sub">{entry.phone}</span></td><td><strong>{entry.projectTitle || entry.projectType || "Prospective project"}</strong><span className="nse-sub">{entry.plotArea || "Area —"} · {entry.floors || "Floors —"}</span></td><td>{entry.projectLocation || "—"}<span className="nse-sub">{entry.latitude !== "" && entry.longitude !== "" ? `${entry.latitude}, ${entry.longitude}` : "Pin not captured"}</span></td><td>{dateText(entry.createdAt)}<span className="nse-sub">{entry.submittedRole || "employee"} · {entry.assignedTo || entry.createdBy || ""}</span></td><td><span className={`nse-badge ${approval}`}>{approval}</span>{entry.approvalNotes ? <span className="nse-sub">{entry.approvalNotes}</span> : null}</td><td><div className="nse-actions">{canReview && isPending ? <><button type="button" className="nse-btn good" onClick={() => void review(entry, true)} disabled={Boolean(reviewing)}>{reviewing === entry.proposalId ? "Working…" : "Approve"}</button><button type="button" className="nse-btn danger" onClick={() => void review(entry, false)} disabled={Boolean(reviewing)}>Reject</button></> : null}{canReview && approval.toLowerCase() === "approved" ? <Link className="nse-btn" href={`/admin/proposals/${encodeURIComponent(entry.proposalId)}`}>Open Proposal</Link> : null}</div></td>
      </tr>; })}{!entries.length && !loading ? <tr><td colSpan={7} style={{textAlign:"center",padding:26,color:"var(--lv-text-muted)"}}>No site entries yet.</td></tr> : null}{loading ? <tr><td colSpan={7} style={{textAlign:"center",padding:26,color:"var(--lv-text-muted)"}}>Loading site entries…</td></tr> : null}</tbody></table></div>
    </section>
  </main>;
}
