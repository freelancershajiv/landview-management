"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import WhatsAppNumberCheck from "@/components/whatsapp-number-check";

type Entry = {
  proposalId: string;
  prospectId?: string;
  clientName: string;
  phone: string;
  projectTitle?: string;
  projectLocation?: string;
  projectType?: string;
  plotArea?: string;
  floors?: string;
  approvalStatus?: string;
  submittedRole?: string;
  assignedTo?: string;
  createdBy?: string;
  createdAt?: string;
  approvalNotes?: string;
  latitude?: number | string;
  longitude?: number | string;
};

type FormState = {
  siteVisitDate: string;
  projectTitle: string;
  clientName: string;
  phone: string;
  email: string;
  address: string;
  referredBy: string;
  refContact: string;
  projectType: string;
  projectLocation: string;
  locationTag: string;
  plotArea: string;
  floors: string;
  startDate: string;
  designStageStatus: string;
  approvalStageStatus: string;
  supervisionStageStatus: string;
  siteGeofenceRadiusM: string;
  division: string;
  district: string;
  upazilaThana: string;
  localBodyType: string;
  localBodyName: string;
  wardNo: string;
  villageArea: string;
  roadHolding: string;
  mouza: string;
  jlNo: string;
  dagNo: string;
  khatianNo: string;
  latitude: string;
  longitude: string;
  locationAccuracyM: string;
  locationCapturedAt: string;
  siteNotes: string;
};

function localDate() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function blankForm(): FormState {
  return {
    siteVisitDate: localDate(),
    projectTitle: "",
    clientName: "",
    phone: "",
    email: "",
    address: "",
    referredBy: "",
    refContact: "",
    projectType: "Residential",
    projectLocation: "",
    locationTag: "",
    plotArea: "",
    floors: "",
    startDate: localDate(),
    designStageStatus: "In Progress",
    approvalStageStatus: "Pending",
    supervisionStageStatus: "Completed",
    siteGeofenceRadiusM: "150",
    division: "",
    district: "",
    upazilaThana: "",
    localBodyType: "",
    localBodyName: "",
    wardNo: "",
    villageArea: "",
    roadHolding: "",
    mouza: "",
    jlNo: "",
    dagNo: "",
    khatianNo: "",
    latitude: "",
    longitude: "",
    locationAccuracyM: "",
    locationCapturedAt: "",
    siteNotes: "",
  };
}

function dateText(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function requestApi(method: "GET" | "POST", body?: Record<string, unknown>) {
  const response = await fetch("/api/site-entry-v2", {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Site entry request failed."));
  return json.data;
}

export default function NewSiteEntryCenterV2() {
  const [form, setForm] = useState<FormState>(() => blankForm());
  const [entries, setEntries] = useState<Entry[]>([]);
  const [role, setRole] = useState("");
  const [canReview, setCanReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState("");
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await requestApi("GET");
      setRole(String(data?.role || ""));
      setCanReview(Boolean(data?.canReview));
      setEntries(Array.isArray(data?.entries) ? data.entries : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load site entries.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function captureLocation() {
    setError("");
    setMessage("");
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError("Current location requires HTTPS.");
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Location is not supported by this browser. Enter the coordinates or Maps link manually.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude.toFixed(8));
        const longitude = Number(position.coords.longitude.toFixed(8));
        const accuracy = Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : 0;
        setForm((current) => ({
          ...current,
          latitude: String(latitude),
          longitude: String(longitude),
          locationAccuracyM: accuracy ? String(accuracy) : "",
          locationCapturedAt: new Date(position.timestamp || Date.now()).toISOString(),
          locationTag: `https://www.google.com/maps?q=${latitude},${longitude}`,
        }));
        setMessage(`Current site location added${accuracy ? ` · accuracy ±${accuracy} m` : ""}.`);
        setLocating(false);
      },
      (geoError) => {
        setError(
          geoError.code === geoError.PERMISSION_DENIED
            ? "Location access is blocked. Allow Location for LAND VIEW in your browser/site settings, or enter the Maps link/coordinates manually."
            : geoError.code === geoError.POSITION_UNAVAILABLE
              ? "Your current location could not be determined. Check GPS and try again."
              : "Location request timed out. Check GPS and try again.",
        );
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  async function submit() {
    if (saving) return;
    setError("");
    setMessage("");
    if (!form.projectTitle.trim()) return setError("Project name / title is required.");
    if (!form.clientName.trim()) return setError("Client / owner name is required.");
    if (!form.phone.trim()) return setError("Phone number is required.");
    if (!form.projectLocation.trim() && ![form.roadHolding, form.villageArea, form.localBodyName, form.upazilaThana, form.district, form.division].some((v) => v.trim())) {
      return setError("Enter the project/site address or administrative location.");
    }

    setSaving(true);
    try {
      const entry = await requestApi("POST", { action: "create", ...form });
      const approved = String(entry?.approvalStatus || "").toLowerCase() === "approved";
      setMessage(
        approved
          ? `${entry.proposalId} created as a Draft proposal with the full New Project details saved for later conversion.`
          : `${entry.proposalId} submitted with the full New Project details. Management/Admin approval is required before it becomes a Draft proposal.`,
      );
      setForm(blankForm());
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the new site entry.");
    } finally {
      setSaving(false);
    }
  }

  async function review(entry: Entry, approve: boolean) {
    if (!canReview || reviewing) return;
    let notes = "";
    if (!approve) {
      const reason = window.prompt("Reason for rejecting this site entry:", "");
      if (reason === null) return;
      notes = reason.trim();
    }
    setReviewing(entry.proposalId);
    setError("");
    setMessage("");
    try {
      await requestApi("POST", { action: approve ? "approve" : "reject", proposalId: entry.proposalId, notes });
      setMessage(approve ? `${entry.proposalId} approved and ready for the normal Proposal → Project workflow.` : `${entry.proposalId} rejected.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the site entry.");
    } finally {
      setReviewing("");
    }
  }

  const pending = useMemo(() => entries.filter((entry) => String(entry.approvalStatus).toLowerCase() === "pending"), [entries]);
  const approved = useMemo(() => entries.filter((entry) => String(entry.approvalStatus).toLowerCase() === "approved"), [entries]);

  return <div className="nsp-page">
    <style>{`
      .nsp-page{color:var(--theme-ink-_eef2f5,#eef2f5);width:100%;max-width:1500px;margin:0 auto}.nsp-head{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin-bottom:14px}.nsp-head h1{margin:5px 0 0;font-size:32px}.nsp-head p{max-width:900px;margin:6px 0 0;color:var(--theme-ink-_94a0a9,#94a0a9);font-size:11px;line-height:1.6}.nsp-role{border:1px solid var(--theme-line-_3a4650,#3a4650);border-radius:999px;padding:7px 10px;font-size:9px;font-weight:900;text-transform:uppercase}
      .nsp-flow{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}.nsp-flow>div,.nsp-panel,.nsp-metric,.nsp-table-wrap{border:1px solid var(--theme-line-_303b44,#303b44);background:var(--theme-bg-_101820,#101820)}.nsp-flow>div{padding:11px 13px;border-radius:9px}.nsp-flow b{display:block;font-size:10px}.nsp-flow small{display:block;margin-top:4px;color:var(--theme-ink-_83919b,#83919b);font-size:8px;line-height:1.45}
      .nsp-msg{padding:11px 13px;border-radius:8px;margin:0 0 12px;font-size:10px;line-height:1.5}.nsp-msg.err{border:1px solid #74373b;background:#351c1e;color:#ffb1ad}.nsp-msg.ok{border:1px solid #315e45;background:#163023;color:#a8e6bb}
      .nsp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.nsp-panel{border-radius:12px;padding:16px}.nsp-panel.full{grid-column:1/-1}.nsp-panel h2{margin:0 0 4px;font-size:15px}.nsp-panel p{margin:0 0 12px;color:var(--theme-ink-_7f8c96,#7f8c96);font-size:9px;line-height:1.5}.nsp-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.nsp-fields label{display:grid;gap:5px;color:var(--theme-ink-_8d9aa4,#8d9aa4);font-size:9px}.nsp-fields label.full{grid-column:1/-1}.nsp-fields input,.nsp-fields select,.nsp-fields textarea{width:100%;min-width:0;border:1px solid var(--theme-line-_36434d,#36434d);border-radius:7px;background:var(--theme-bg-_0a1117,#0a1117);color:var(--theme-ink-_eef2f5,#eef2f5);padding:10px;font-size:10px}.nsp-fields textarea{min-height:92px;resize:vertical}
      .nsp-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.nsp-btn{border:1px solid var(--theme-line-_394650,#394650);border-radius:8px;background:var(--theme-bg-_17222b,#17222b);color:var(--theme-ink-_eef2f5,#eef2f5);padding:10px 13px;text-decoration:none;font-size:10px;font-weight:900;cursor:pointer}.nsp-btn.primary{background:#d61f26;border-color:#d61f26}.nsp-btn.good{background:#173b2a;border-color:#31664a;color:#a8e6bb}.nsp-btn.danger{background:#32191b;border-color:#633235;color:#ffaaa6}.nsp-btn:disabled{opacity:.45;cursor:not-allowed}.nsp-submit{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:14px}.nsp-help{color:var(--theme-ink-_7e8b95,#7e8b95);font-size:9px;line-height:1.5}
      .nsp-register{margin-top:18px}.nsp-register-head{display:flex;justify-content:space-between;align-items:end;gap:12px;margin-bottom:10px}.nsp-register-head h2{margin:0;font-size:18px}.nsp-register-head p{margin:4px 0 0;color:var(--theme-ink-_7f8c96,#7f8c96);font-size:9px}.nsp-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px}.nsp-metric{padding:12px;border-radius:9px}.nsp-metric span{display:block;color:var(--theme-ink-_7f8c96,#7f8c96);font-size:8px;text-transform:uppercase;font-weight:900}.nsp-metric strong{display:block;margin-top:5px;font-size:20px}.nsp-table-wrap{overflow:auto;border-radius:11px}.nsp-table{width:100%;min-width:1000px;border-collapse:collapse}.nsp-table th{padding:10px 11px;background:var(--theme-bg-_17222b,#17222b);text-align:left;color:var(--theme-ink-_83919b,#83919b);font-size:8px;text-transform:uppercase;border-bottom:2px solid #d61f26}.nsp-table td{padding:11px;border-bottom:1px solid var(--theme-line-_27323b,#27323b);font-size:9px;vertical-align:top}.nsp-id{font-weight:900;color:#ff7d75}.nsp-sub{display:block;margin-top:4px;color:var(--theme-ink-_77858f,#77858f);font-size:8px}.nsp-badge{display:inline-flex;padding:5px 8px;border-radius:999px;background:#3b321c;color:#f3d582;font-size:8px;font-weight:900}.nsp-badge.Approved{background:#153a29;color:#9ee5b9}.nsp-badge.Rejected{background:#3c2022;color:#ffaaa6}
      @media(max-width:900px){.nsp-grid{grid-template-columns:1fr}.nsp-panel.full{grid-column:auto}.nsp-flow,.nsp-metrics{grid-template-columns:1fr}.nsp-head{align-items:flex-start;flex-direction:column}}@media(max-width:620px){.nsp-fields{grid-template-columns:1fr}.nsp-fields label.full{grid-column:auto}.nsp-submit{align-items:stretch;flex-direction:column}.nsp-actions .nsp-btn,.nsp-submit .nsp-btn{width:100%;text-align:center}}
    `}</style>

    <header className="nsp-head">
      <div>
        <small style={{ color: "#ef6c66", fontWeight: 900, letterSpacing: ".14em" }}>LAND VIEW / SITE → PROPOSAL</small>
        <h1>Enter New Site / Project as Proposal</h1>
        <p>This intake now contains the same project-registration options as New Project, plus field survey, land-record and administrative-location details. Project ID is assigned only when the accepted proposal is converted to a project.</p>
      </div>
      <span className="nsp-role">{role || "Loading role"}</span>
    </header>

    <div className="nsp-flow">
      <div><b>1 · Full Site / Project Entry</b><small>Enter the same details used by New Project, plus site-specific records.</small></div>
      <div><b>2 · Proposal Approval</b><small>{canReview ? "Admin/Management entries become Draft proposals immediately." : "Employee entries wait for Admin/Management approval."}</small></div>
      <div><b>3 · Convert to Project</b><small>Saved project options are carried into the project automatically during conversion.</small></div>
    </div>

    {error && <div className="nsp-msg err">{error}</div>}
    {message && <div className="nsp-msg ok">{message}</div>}

    <div className="nsp-grid">
      <section className="nsp-panel full">
        <h2>Project Details</h2>
        <p>Matches the normal New Project registration options. The LV Project ID remains reserved for conversion time.</p>
        <div className="nsp-fields">
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
          <label>Supervision / Construction Stage<select value={form.supervisionStageStatus} onChange={(e) => patch("supervisionStageStatus", e.target.value)}><option value="Pending">Pending</option><option value="In Progress">In Progress</option><option value="Completed">Completed / Not Required</option></select></label>
          <label>Site Geofence Radius (m)<input type="number" min="25" max="1000" value={form.siteGeofenceRadiusM} onChange={(e) => patch("siteGeofenceRadiusM", e.target.value)} /></label>
          <label className="full">Project / Site Address<input value={form.projectLocation} onChange={(e) => patch("projectLocation", e.target.value)} placeholder="Same purpose as Address in New Project" /></label>
          <label className="full">Location Tag<input value={form.locationTag} onChange={(e) => patch("locationTag", e.target.value)} placeholder="Google Maps link or use Current Location below" /></label>
          <label className="full">Client / Contact Address<input value={form.address} onChange={(e) => patch("address", e.target.value)} placeholder="Optional client contact address" /></label>
        </div>
      </section>

      <section className="nsp-panel">
        <h2>Site Entry & Land Record</h2>
        <p>Extra proposal/site information that remains attached through conversion.</p>
        <div className="nsp-fields">
          <label>Site Entry Date<input type="date" value={form.siteVisitDate} onChange={(e) => patch("siteVisitDate", e.target.value)} /></label>
          <label>Mouza<input value={form.mouza} onChange={(e) => patch("mouza", e.target.value)} /></label>
          <label>JL No.<input value={form.jlNo} onChange={(e) => patch("jlNo", e.target.value)} /></label>
          <label>Dag No.<input value={form.dagNo} onChange={(e) => patch("dagNo", e.target.value)} /></label>
          <label>Khatian No.<input value={form.khatianNo} onChange={(e) => patch("khatianNo", e.target.value)} /></label>
        </div>
      </section>

      <section className="nsp-panel">
        <h2>Administrative Address</h2>
        <p>Used for structured project location and public-map filtering after conversion.</p>
        <div className="nsp-fields">
          <label>Division<input value={form.division} onChange={(e) => patch("division", e.target.value)} /></label>
          <label>District<input value={form.district} onChange={(e) => patch("district", e.target.value)} /></label>
          <label>Upazila / Thana<input value={form.upazilaThana} onChange={(e) => patch("upazilaThana", e.target.value)} /></label>
          <label>Local Body Type<select value={form.localBodyType} onChange={(e) => patch("localBodyType", e.target.value)}><option value="">Select</option><option>City Corporation</option><option>Municipality / Pourashava</option><option>Union Parishad</option><option>Cantonment</option><option>Other</option></select></label>
          <label>Local Body Name<input value={form.localBodyName} onChange={(e) => patch("localBodyName", e.target.value)} /></label>
          <label>Ward No.<input value={form.wardNo} onChange={(e) => patch("wardNo", e.target.value)} /></label>
          <label>Village / Area<input value={form.villageArea} onChange={(e) => patch("villageArea", e.target.value)} /></label>
          <label>Road / Holding<input value={form.roadHolding} onChange={(e) => patch("roadHolding", e.target.value)} /></label>
        </div>
      </section>

      <section className="nsp-panel full">
        <h2>GPS & Notes</h2>
        <p>Current Location fills latitude, longitude and the same Google Maps Location Tag used by New Project.</p>
        <div className="nsp-actions" style={{ marginBottom: 10 }}>
          <button type="button" className="nsp-btn primary" onClick={captureLocation} disabled={locating}>{locating ? "Getting location…" : "⌖ Use Current Location"}</button>
          <span className="nsp-help">If browser location is blocked, paste a Maps link above and/or enter the coordinates manually.</span>
        </div>
        <div className="nsp-fields">
          <label>Latitude<input inputMode="decimal" value={form.latitude} onChange={(e) => patch("latitude", e.target.value)} /></label>
          <label>Longitude<input inputMode="decimal" value={form.longitude} onChange={(e) => patch("longitude", e.target.value)} /></label>
          <label>GPS Accuracy (m)<input inputMode="decimal" value={form.locationAccuracyM} onChange={(e) => patch("locationAccuracyM", e.target.value)} /></label>
          <label>Captured At<input value={form.locationCapturedAt ? dateText(form.locationCapturedAt) : ""} readOnly placeholder="Filled by GPS capture" /></label>
          <label className="full">Project / Site Notes<textarea value={form.siteNotes} onChange={(e) => patch("siteNotes", e.target.value)} placeholder="Project requirements, site observations, access, road condition, special instructions…" /></label>
        </div>
        <div className="nsp-submit">
          <span className="nsp-help">All project fields are saved on the proposal and copied to the final project when converted.</span>
          <div className="nsp-actions">
            <button type="button" className="nsp-btn" onClick={() => setForm(blankForm())} disabled={saving}>Clear</button>
            <button type="button" className="nsp-btn primary" onClick={() => void submit()} disabled={saving}>{saving ? "Saving…" : canReview ? "Create Draft Proposal" : "Submit for Approval"}</button>
          </div>
        </div>
      </section>
    </div>

    <section className="nsp-register">
      <div className="nsp-register-head">
        <div><h2>{canReview ? "Site Entry Register & Approval Queue" : "My Site Entries"}</h2><p>{canReview ? "Review employee entries and open approved proposals." : "Track Management/Admin approval of your submitted proposals."}</p></div>
        <button type="button" className="nsp-btn" onClick={() => void load()} disabled={loading}>↻ Refresh</button>
      </div>
      <div className="nsp-metrics">
        <div className="nsp-metric"><span>Total Site Entries</span><strong>{entries.length}</strong></div>
        <div className="nsp-metric"><span>Pending Approval</span><strong>{pending.length}</strong></div>
        <div className="nsp-metric"><span>Approved Proposals</span><strong>{approved.length}</strong></div>
      </div>
      <div className="nsp-table-wrap">
        <table className="nsp-table">
          <thead><tr><th>Proposal</th><th>Owner</th><th>Project</th><th>Location</th><th>Submitted</th><th>Approval</th><th>Actions</th></tr></thead>
          <tbody>
            {entries.map((entry) => {
              const approval = entry.approvalStatus || "Pending";
              const isPending = approval.toLowerCase() === "pending";
              return <tr key={entry.proposalId}>
                <td><span className="nsp-id">{entry.proposalId}</span><span className="nsp-sub">{entry.prospectId || "Site entry"}</span></td>
                <td><strong>{entry.clientName}</strong><span className="nsp-sub">{entry.phone}</span></td>
                <td><strong>{entry.projectTitle || entry.projectType || "Prospective project"}</strong><span className="nsp-sub">{entry.plotArea || "Area —"} · {entry.floors || "Floors —"}</span></td>
                <td>{entry.projectLocation || "—"}<span className="nsp-sub">{entry.latitude !== "" && entry.longitude !== "" ? `${entry.latitude}, ${entry.longitude}` : "GPS not captured"}</span></td>
                <td>{dateText(entry.createdAt)}<span className="nsp-sub">{entry.submittedRole || "employee"} · {entry.assignedTo || entry.createdBy || ""}</span></td>
                <td><span className={`nsp-badge ${approval}`}>{approval}</span>{entry.approvalNotes && <span className="nsp-sub">{entry.approvalNotes}</span>}</td>
                <td><div className="nsp-actions">
                  {canReview && isPending && <button type="button" className="nsp-btn good" onClick={() => void review(entry, true)} disabled={Boolean(reviewing)}>{reviewing === entry.proposalId ? "Working…" : "Approve"}</button>}
                  {canReview && isPending && <button type="button" className="nsp-btn danger" onClick={() => void review(entry, false)} disabled={Boolean(reviewing)}>Reject</button>}
                  {canReview && approval.toLowerCase() === "approved" && <Link className="nsp-btn" href={`/admin/proposals/${encodeURIComponent(entry.proposalId)}`}>Open Proposal</Link>}
                </div></td>
              </tr>;
            })}
            {!entries.length && !loading && <tr><td colSpan={7} style={{ textAlign: "center", padding: 28, color: "var(--theme-ink-_7f8b95,#7f8b95)" }}>No site entries yet.</td></tr>}
            {loading && <tr><td colSpan={7} style={{ textAlign: "center", padding: 28, color: "var(--theme-ink-_7f8b95,#7f8b95)" }}>Loading site entries…</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  </div>;
}
