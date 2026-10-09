"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Entry = {
  proposalId: string;
  prospectId?: string;
  clientName: string;
  phone: string;
  email?: string;
  address?: string;
  projectTitle?: string;
  projectLocation?: string;
  projectType?: string;
  plotArea?: string;
  floors?: string;
  status?: string;
  approvalStatus?: string;
  submittedRole?: string;
  assignedTo?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalNotes?: string;
  siteVisitDate?: string;
  latitude?: number | string;
  longitude?: number | string;
  locationAccuracyM?: number | string;
  locationCapturedAt?: string;
  division?: string;
  district?: string;
  upazilaThana?: string;
  localBodyType?: string;
  localBodyName?: string;
  wardNo?: string;
  villageArea?: string;
  roadHolding?: string;
  mouza?: string;
  jlNo?: string;
  dagNo?: string;
  khatianNo?: string;
  siteNotes?: string;
};

type FormState = {
  siteVisitDate: string;
  clientName: string;
  phone: string;
  email: string;
  address: string;
  projectTitle: string;
  projectType: string;
  plotArea: string;
  floors: string;
  projectLocation: string;
  referredBy: string;
  refContact: string;
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
    clientName: "",
    phone: "",
    email: "",
    address: "",
    projectTitle: "",
    projectType: "Residential",
    plotArea: "",
    floors: "",
    projectLocation: "",
    referredBy: "",
    refContact: "",
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
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

async function requestApi(method: "GET" | "POST", body?: Record<string, unknown>) {
  const response = await fetch("/api/site-entry", {
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

export default function NewSiteEntryCenter() {
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

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function captureLocation() {
    setError("");
    setMessage("");
    if (!navigator.geolocation) {
      setError("Location is not supported by this browser. Enter latitude and longitude manually.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setForm((current) => ({
          ...current,
          latitude: latitude.toFixed(7),
          longitude: longitude.toFixed(7),
          locationAccuracyM: Math.round(accuracy).toString(),
          locationCapturedAt: new Date(position.timestamp || Date.now()).toISOString(),
        }));
        setMessage(`Site location captured · accuracy ±${Math.round(accuracy)} m.`);
        setLocating(false);
      },
      (geoError) => {
        const suffix = geoError.code === geoError.PERMISSION_DENIED
          ? "Allow Location for LAND VIEW in your browser/site settings, or enter coordinates manually."
          : geoError.code === geoError.TIMEOUT
            ? "Location request timed out. Try again outdoors or enter coordinates manually."
            : "Could not read the current location. Try again or enter coordinates manually.";
        setError(suffix);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  async function submit() {
    if (saving) return;
    setError("");
    setMessage("");
    if (!form.clientName.trim()) return setError("Client / owner name is required.");
    if (!form.phone.trim()) return setError("Phone number is required.");
    if (!form.projectLocation.trim() && ![form.roadHolding, form.villageArea, form.localBodyName, form.upazilaThana, form.district, form.division].some((v) => v.trim())) {
      return setError("Enter the site location or administrative address.");
    }
    setSaving(true);
    try {
      const entry = await requestApi("POST", { action: "create", ...form });
      const approved = String(entry?.approvalStatus || "").toLowerCase() === "approved";
      setMessage(
        approved
          ? `${entry.proposalId} created as a Draft proposal. You can open it and use the existing Convert to Project function when accepted.`
          : `${entry.proposalId} submitted. It is waiting for Management/Admin approval before it becomes an active Draft proposal.`,
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
      setMessage(approve
        ? `${entry.proposalId} approved. It is now a Draft proposal and can follow the normal Proposal → Project workflow.`
        : `${entry.proposalId} rejected.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the site entry.");
    } finally {
      setReviewing("");
    }
  }

  const pending = useMemo(() => entries.filter((entry) => String(entry.approvalStatus).toLowerCase() === "pending"), [entries]);
  const approved = useMemo(() => entries.filter((entry) => String(entry.approvalStatus).toLowerCase() === "approved"), [entries]);

  return <div className="new-site-center">
    <style>{`
      .new-site-center{color:var(--theme-ink-_eef2f5,#eef2f5);width:100%;max-width:1500px;margin:0 auto}
      .nse-head{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin-bottom:16px}
      .nse-head h1{margin:5px 0 0;font-size:34px}.nse-head p{margin:6px 0 0;max-width:820px;color:var(--theme-ink-_94a0a9,#94a0a9);font-size:11px;line-height:1.65}
      .nse-role{border:1px solid var(--theme-line-_3a4650,#3a4650);border-radius:999px;padding:7px 10px;color:var(--theme-ink-_bdc6cc,#bdc6cc);font-size:9px;font-weight:900;text-transform:uppercase}
      .nse-msg{padding:11px 13px;border-radius:8px;margin:0 0 12px;font-size:10px;line-height:1.5}.nse-msg.err{border:1px solid var(--theme-line-_74373b,#74373b);background:var(--theme-bg-_351c1e,#351c1e);color:var(--theme-ink-_ffb1ad,#ffb1ad)}.nse-msg.ok{border:1px solid var(--theme-line-_315e45,#315e45);background:var(--theme-bg-_163023,#163023);color:var(--theme-ink-_a8e6bb,#a8e6bb)}
      .nse-flow{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}.nse-flow>div{padding:11px 13px;border:1px solid var(--theme-line-_303b44,#303b44);border-radius:9px;background:var(--theme-bg-_101820,#101820)}.nse-flow b{display:block;font-size:10px}.nse-flow small{display:block;margin-top:4px;color:var(--theme-ink-_83919b,#83919b);font-size:8px;line-height:1.45}
      .nse-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.nse-panel{border:1px solid var(--theme-line-_303b44,#303b44);border-radius:12px;background:var(--theme-bg-_101820,#101820);padding:16px}.nse-panel.full{grid-column:1/-1}.nse-panel h2{margin:0 0 12px;font-size:15px}.nse-panel-sub{margin:-6px 0 12px;color:var(--theme-ink-_7f8c96,#7f8c96);font-size:9px;line-height:1.5}
      .nse-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.nse-fields label{display:grid;gap:5px;color:var(--theme-ink-_8d9aa4,#8d9aa4);font-size:9px}.nse-fields label.full{grid-column:1/-1}
      .nse-fields input,.nse-fields select,.nse-fields textarea{width:100%;min-width:0;border:1px solid var(--theme-line-_36434d,#36434d);border-radius:7px;background:var(--theme-bg-_0a1117,#0a1117);color:var(--theme-ink-_eef2f5,#eef2f5);padding:10px;font-size:10px}.nse-fields textarea{min-height:92px;resize:vertical}
      .nse-location-actions{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}.nse-btn{border:1px solid var(--theme-line-_394650,#394650);border-radius:8px;background:var(--theme-bg-_17222b,#17222b);color:var(--theme-ink-_eef2f5,#eef2f5);padding:10px 13px;text-decoration:none;font-size:10px;font-weight:900;cursor:pointer}.nse-btn.primary{background:#d61f26;border-color:#d61f26}.nse-btn.good{background:var(--theme-bg-_173b2a,#173b2a);border-color:var(--theme-line-_31664a,#31664a);color:var(--theme-ink-_a8e6bb,#a8e6bb)}.nse-btn.danger{background:var(--theme-bg-_32191b,#32191b);border-color:var(--theme-line-_633235,#633235);color:var(--theme-ink-_ffaaa6,#ffaaa6)}.nse-btn:disabled{opacity:.45;cursor:not-allowed}
      .nse-submit-row{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.nse-help{color:var(--theme-ink-_7e8b95,#7e8b95);font-size:9px;line-height:1.5}
      .nse-register{margin-top:18px}.nse-register-head{display:flex;justify-content:space-between;align-items:end;gap:12px;margin-bottom:10px}.nse-register-head h2{margin:0;font-size:18px}.nse-register-head p{margin:4px 0 0;color:var(--theme-ink-_7f8c96,#7f8c96);font-size:9px}
      .nse-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px}.nse-metric{padding:12px;border:1px solid var(--theme-line-_303b44,#303b44);border-radius:9px;background:var(--theme-bg-_101820,#101820)}.nse-metric span{display:block;color:var(--theme-ink-_7f8c96,#7f8c96);font-size:8px;text-transform:uppercase;font-weight:900}.nse-metric strong{display:block;margin-top:5px;font-size:20px}
      .nse-table-wrap{overflow:auto;border:1px solid var(--theme-line-_303b44,#303b44);border-radius:11px;background:var(--theme-bg-_101820,#101820)}.nse-table{width:100%;min-width:1050px;border-collapse:collapse}.nse-table th{padding:10px 11px;background:var(--theme-bg-_17222b,#17222b);text-align:left;color:var(--theme-ink-_83919b,#83919b);font-size:8px;text-transform:uppercase;border-bottom:2px solid #d61f26}.nse-table td{padding:11px;border-bottom:1px solid var(--theme-line-_27323b,#27323b);font-size:9px;vertical-align:top}.nse-table tr:last-child td{border-bottom:0}.nse-id{font-weight:900;color:var(--theme-ink-_ff7d75,#ff7d75)}.nse-sub{display:block;margin-top:4px;color:var(--theme-ink-_77858f,#77858f);font-size:8px}.nse-badge{display:inline-flex;padding:5px 8px;border-radius:999px;background:var(--theme-bg-_3b321c,#3b321c);color:var(--theme-ink-_f3d582,#f3d582);font-size:8px;font-weight:900}.nse-badge.Approved{background:var(--theme-bg-_153a29,#153a29);color:var(--theme-ink-_9ee5b9,#9ee5b9)}.nse-badge.Rejected{background:var(--theme-bg-_3c2022,#3c2022);color:var(--theme-ink-_ffaaa6,#ffaaa6)}.nse-row-actions{display:flex;gap:6px;flex-wrap:wrap}
      @media(max-width:900px){.nse-grid{grid-template-columns:1fr}.nse-panel.full{grid-column:auto}.nse-flow,.nse-metrics{grid-template-columns:1fr}.nse-head{align-items:flex-start;flex-direction:column}}
      @media(max-width:620px){.nse-fields{grid-template-columns:1fr}.nse-fields label.full{grid-column:auto}.nse-submit-row{flex-direction:column}.nse-btn{width:100%;text-align:center}}
    `}</style>

    <header className="nse-head">
      <div>
        <small style={{ color: "#ef6c66", fontWeight: 900, letterSpacing: ".14em" }}>LAND VIEW / FIELD INTAKE</small>
        <h1>New Site Entry</h1>
        <p>Record a new prospective site directly from the field. Employee entries require Management/Admin approval; Management and Admin entries become Draft proposals immediately.</p>
      </div>
      <span className="nse-role">{role || "Loading role"}</span>
    </header>

    <div className="nse-flow">
      <div><b>1 · Site Entry</b><small>Owner, project, land record, administrative address and GPS.</small></div>
      <div><b>2 · Proposal</b><small>{canReview ? "Your entry is approved immediately." : "Employee entry stays Pending Approval until reviewed."}</small></div>
      <div><b>3 · Existing Conversion</b><small>Use the normal Proposal → Project function when the proposal is accepted.</small></div>
    </div>

    {error && <div className="nse-msg err">{error}</div>}
    {message && <div className="nse-msg ok">{message}</div>}

    <div className="nse-grid">
      <section className="nse-panel">
        <h2>Owner & Project</h2>
        <div className="nse-fields">
          <label>Site entry date<input type="date" value={form.siteVisitDate} onChange={(e) => patch("siteVisitDate", e.target.value)} /></label>
          <label>Project type<select value={form.projectType} onChange={(e) => patch("projectType", e.target.value)}><option>Residential</option><option>Commercial</option><option>Mixed Use</option><option>Industrial</option><option>Institutional</option><option>Other</option></select></label>
          <label>Client / owner name<input value={form.clientName} onChange={(e) => patch("clientName", e.target.value)} placeholder="Owner name" /></label>
          <label>Phone number<input inputMode="tel" value={form.phone} onChange={(e) => patch("phone", e.target.value)} placeholder="01XXXXXXXXX" /></label>
          <label>Email<input type="email" value={form.email} onChange={(e) => patch("email", e.target.value)} placeholder="Optional" /></label>
          <label>Project title<input value={form.projectTitle} onChange={(e) => patch("projectTitle", e.target.value)} placeholder="Project / owner title" /></label>
          <label>Plot / land area<input value={form.plotArea} onChange={(e) => patch("plotArea", e.target.value)} placeholder="e.g. 5 Katha / 7,200 sft" /></label>
          <label>Proposed floors / stories<input value={form.floors} onChange={(e) => patch("floors", e.target.value)} placeholder="e.g. G+5 / 6" /></label>
          <label className="full">Client address<input value={form.address} onChange={(e) => patch("address", e.target.value)} placeholder="Present / contact address" /></label>
          <label>Referred by<input value={form.referredBy} onChange={(e) => patch("referredBy", e.target.value)} placeholder="Optional" /></label>
          <label>Referral contact<input value={form.refContact} onChange={(e) => patch("refContact", e.target.value)} placeholder="Optional" /></label>
        </div>
      </section>

      <section className="nse-panel">
        <h2>Land Record</h2>
        <p className="nse-panel-sub">Use these when the information is available at the site. They will be retained through the Proposal → Project conversion.</p>
        <div className="nse-fields">
          <label>Mouza<input value={form.mouza} onChange={(e) => patch("mouza", e.target.value)} /></label>
          <label>JL No.<input value={form.jlNo} onChange={(e) => patch("jlNo", e.target.value)} /></label>
          <label>Dag No.<input value={form.dagNo} onChange={(e) => patch("dagNo", e.target.value)} /></label>
          <label>Khatian No.<input value={form.khatianNo} onChange={(e) => patch("khatianNo", e.target.value)} /></label>
          <label className="full">Site / landmark address<input value={form.projectLocation} onChange={(e) => patch("projectLocation", e.target.value)} placeholder="Exact site description or landmark" /></label>
        </div>
      </section>

      <section className="nse-panel full">
        <h2>Administrative Location & GPS</h2>
        <div className="nse-location-actions">
          <button type="button" className="nse-btn primary" onClick={captureLocation} disabled={locating}>{locating ? "Reading GPS…" : "⌖ Use Current Location"}</button>
          <span className="nse-help">GPS is recommended but manual coordinates remain available if browser permission is blocked.</span>
        </div>
        <div className="nse-fields">
          <label>Division<input value={form.division} onChange={(e) => patch("division", e.target.value)} /></label>
          <label>District<input value={form.district} onChange={(e) => patch("district", e.target.value)} /></label>
          <label>Upazila / Thana<input value={form.upazilaThana} onChange={(e) => patch("upazilaThana", e.target.value)} /></label>
          <label>Local body type<select value={form.localBodyType} onChange={(e) => patch("localBodyType", e.target.value)}><option value="">Select</option><option>City Corporation</option><option>Municipality / Pourashava</option><option>Union Parishad</option><option>Cantonment</option><option>Other</option></select></label>
          <label>Local body name<input value={form.localBodyName} onChange={(e) => patch("localBodyName", e.target.value)} /></label>
          <label>Ward No.<input value={form.wardNo} onChange={(e) => patch("wardNo", e.target.value)} /></label>
          <label>Village / Area<input value={form.villageArea} onChange={(e) => patch("villageArea", e.target.value)} /></label>
          <label>Road / Holding<input value={form.roadHolding} onChange={(e) => patch("roadHolding", e.target.value)} /></label>
          <label>Latitude<input inputMode="decimal" value={form.latitude} onChange={(e) => patch("latitude", e.target.value)} placeholder="e.g. 23.0150000" /></label>
          <label>Longitude<input inputMode="decimal" value={form.longitude} onChange={(e) => patch("longitude", e.target.value)} placeholder="e.g. 91.3970000" /></label>
          <label>GPS accuracy (m)<input inputMode="decimal" value={form.locationAccuracyM} onChange={(e) => patch("locationAccuracyM", e.target.value)} /></label>
          <label>Captured at<input value={form.locationCapturedAt ? dateText(form.locationCapturedAt) : ""} readOnly placeholder="Filled by GPS capture" /></label>
          <label className="full">Site notes / requirements<textarea value={form.siteNotes} onChange={(e) => patch("siteNotes", e.target.value)} placeholder="Client requirements, road condition, access, existing structures, observations, special instructions…" /></label>
        </div>
        <div className="nse-submit-row">
          <button type="button" className="nse-btn" onClick={() => setForm(blankForm())} disabled={saving}>Clear</button>
          <button type="button" className="nse-btn primary" onClick={() => void submit()} disabled={saving}>{saving ? "Saving…" : canReview ? "Create Draft Proposal" : "Submit for Approval"}</button>
        </div>
      </section>
    </div>

    <section className="nse-register">
      <div className="nse-register-head">
        <div><h2>{canReview ? "Site Entry Register & Approval Queue" : "My Site Entries"}</h2><p>{canReview ? "Review employee submissions and open approved proposals." : "Track whether Management/Admin has approved your field submission."}</p></div>
        <button type="button" className="nse-btn" onClick={() => void load()} disabled={loading}>↻ Refresh</button>
      </div>
      <div className="nse-metrics">
        <div className="nse-metric"><span>Total site entries</span><strong>{entries.length}</strong></div>
        <div className="nse-metric"><span>Pending approval</span><strong>{pending.length}</strong></div>
        <div className="nse-metric"><span>Approved proposals</span><strong>{approved.length}</strong></div>
      </div>
      <div className="nse-table-wrap">
        <table className="nse-table">
          <thead><tr><th>Proposal</th><th>Owner / Site</th><th>Project</th><th>Location</th><th>Submitted</th><th>Approval</th><th>Actions</th></tr></thead>
          <tbody>
            {entries.map((entry) => {
              const approval = entry.approvalStatus || "Pending";
              const isPending = approval.toLowerCase() === "pending";
              return <tr key={entry.proposalId}>
                <td><span className="nse-id">{entry.proposalId}</span><span className="nse-sub">{entry.prospectId || "Site entry"}</span></td>
                <td><strong>{entry.clientName}</strong><span className="nse-sub">{entry.phone}</span></td>
                <td><strong>{entry.projectTitle || entry.projectType || "Prospective project"}</strong><span className="nse-sub">{entry.plotArea || "Area —"} · {entry.floors || "Floors —"}</span></td>
                <td>{entry.projectLocation || "—"}<span className="nse-sub">{entry.latitude !== "" && entry.longitude !== "" ? `${entry.latitude}, ${entry.longitude}` : "GPS not captured"}</span></td>
                <td>{dateText(entry.createdAt)}<span className="nse-sub">{entry.submittedRole || "employee"} · {entry.assignedTo || entry.createdBy || ""}</span></td>
                <td><span className={`nse-badge ${approval}`}>{approval}</span>{entry.approvalNotes && <span className="nse-sub">{entry.approvalNotes}</span>}</td>
                <td><div className="nse-row-actions">
                  {canReview && isPending && <button type="button" className="nse-btn good" onClick={() => void review(entry, true)} disabled={Boolean(reviewing)}>{reviewing === entry.proposalId ? "Working…" : "Approve"}</button>}
                  {canReview && isPending && <button type="button" className="nse-btn danger" onClick={() => void review(entry, false)} disabled={Boolean(reviewing)}>Reject</button>}
                  {canReview && approval.toLowerCase() === "approved" && <Link className="nse-btn" href={`/admin/proposals/${encodeURIComponent(entry.proposalId)}`}>Open Proposal</Link>}
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
