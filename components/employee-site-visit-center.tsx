"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { isSiteVisitPhoto, isSiteVisitOffline, prepareSiteVisitPhoto, siteVisitNetworkError } from "@/lib/site-visit-photo-preparation";

type Row = Record<string, any>;

type LocationState = {
  latitude: number;
  longitude: number;
  accuracyM: number;
  capturedAt: string;
  distanceM: number;
};

function dateText(value: any) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function EmployeeSiteVisitCenter() {
  const [projects, setProjects] = useState<Row[]>([]);
  const [visits, setVisits] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);
  const [uploadStage, setUploadStage] = useState("");
  const [offline, setOffline] = useState(false);
  const visitCameraId = useId();
  const visitGalleryId = useId();
  const problemCameraId = useId();
  const problemGalleryId = useId();
  const [retryingVisit, setRetryingVisit] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [projectId, setProjectId] = useState("");
  const [siteNotes, setSiteNotes] = useState("");
  const [visitPhoto, setVisitPhoto] = useState<File | null>(null);
  const [problemPhoto, setProblemPhoto] = useState<File | null>(null);
  const [location, setLocation] = useState<LocationState | null>(null);
  const [locationChecking, setLocationChecking] = useState(false);
  const [locationPermission, setLocationPermission] = useState<"unknown" | "prompt" | "granted" | "denied">("unknown");
  const [gpsTesting, setGpsTesting] = useState(false);
  const [gpsTestResult, setGpsTestResult] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [projectResponse, visitResponse, whatsAppResponse] = await Promise.all([
        fetch("/api/site-visits?mode=projects", { cache: "no-store", credentials: "same-origin" }).then((r) => r.json()),
        fetch("/api/site-visits", { cache: "no-store", credentials: "same-origin" }).then((r) => r.json()),
        fetch("/api/site-visits/retry-whatsapp", { cache: "no-store", credentials: "same-origin" }).then((r) => r.json()).catch(() => null),
      ]);
      if (!projectResponse?.success) throw new Error(projectResponse?.error || "Could not load projects for Site Visits.");
      if (!visitResponse?.success) throw new Error(visitResponse?.error || "Could not load Site Visits.");
      const projectRows = projectResponse.data || [];
      const statusMap = new Map<string, Row>((whatsAppResponse?.success ? whatsAppResponse.data || [] : []).map((row: Row) => [String(row.Visit_ID || ""), row]));
      const visitRows = (visitResponse.data || []).map((row: Row) => ({ ...row, ...(statusMap.get(String(row.Visit_ID || "")) || {}) }));
      setProjects(projectRows);
      setVisits(visitRows);
      setProjectId((current) => current || String(projectRows?.[0]?.Project_ID || ""));
    } catch (e: any) {
      setError(e?.message || "Could not load Site Visits.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    if (typeof navigator !== "undefined" && navigator.permissions?.query) {
      navigator.permissions.query({ name: "geolocation" } as PermissionDescriptor).then((permission) => {
        setLocationPermission(permission.state as "prompt" | "granted" | "denied");
        permission.onchange = () => setLocationPermission(permission.state as "prompt" | "granted" | "denied");
      }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const update = () => setOffline(navigator.onLine === false);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  function choosePhoto(kind: "visit" | "problem", file: File | null) {
    if (submittingRef.current) return;
    if (file && !isSiteVisitPhoto(file)) {
      setError("Choose a photo from your camera or gallery.");
      return;
    }
    if (kind === "visit") setVisitPhoto(file);
    else setProblemPhoto(file);
    setError("");
  }

  const selectedProject = useMemo(
    () => projects.find((project) => String(project.Project_ID) === String(projectId)),
    [projects, projectId],
  );

  function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
    const toRad = (n: number) => n * Math.PI / 180;
    const radius = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async function getPosition() {
    if (!navigator.geolocation) throw new Error("This device/browser does not support GPS location.");
    return await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
    });
  }

  function locationErrorMessage(e: any) {
    if (e?.code === 1) {
      setLocationPermission("denied");
      return "Location is blocked. Allow Location for LAND VIEW in your browser/site settings and try again.";
    }
    if (e?.code === 2) return "Your phone could not determine its location. Turn on GPS and move to an open area.";
    if (e?.code === 3) return "Location request timed out. Try again from an open area.";
    return e?.message || "Could not verify site location.";
  }

  async function verifyLocation() {
    setError("");
    setNotice("");
    setLocationChecking(true);
    try {
      if (!projectId) throw new Error("Select a project first.");
      const siteLatRaw = selectedProject?.Site_Latitude;
      const siteLonRaw = selectedProject?.Site_Longitude;
      if (siteLatRaw === "" || siteLatRaw === null || siteLatRaw === undefined || siteLonRaw === "" || siteLonRaw === null || siteLonRaw === undefined) {
        throw new Error("This project does not have a registered site location yet. Ask an Admin or Manager to set it first.");
      }
      const position = await getPosition();
      const accuracy = Number(position.coords.accuracy || 0);
      if (!Number.isFinite(accuracy) || accuracy > 100) {
        throw new Error("GPS accuracy is " + Math.round(accuracy) + " m. Move to an open area and try again until accuracy is 100 m or better.");
      }
      const latitude = Number(position.coords.latitude);
      const longitude = Number(position.coords.longitude);
      const siteLat = Number(siteLatRaw);
      const siteLon = Number(siteLonRaw);
      const allowedRadius = Math.max(25, Math.min(1000, Number(selectedProject?.Site_Geofence_Radius_M || 150)));
      const distance = distanceMeters(latitude, longitude, siteLat, siteLon);
      if (distance > allowedRadius) {
        throw new Error("You are about " + Math.round(distance) + " m from the registered project site. Allowed radius: " + Math.round(allowedRadius) + " m.");
      }
      setLocationPermission("granted");
      setLocation({ latitude, longitude, accuracyM: accuracy, capturedAt: new Date().toISOString(), distanceM: distance });
      setNotice("Location verified · " + Math.round(distance) + " m from site.");
    } catch (e: any) {
      setLocation(null);
      setError(locationErrorMessage(e));
    } finally {
      setLocationChecking(false);
    }
  }

  async function testGps() {
    setGpsTesting(true);
    setGpsTestResult("");
    try {
      const position = await getPosition();
      setLocationPermission("granted");
      setGpsTestResult("GPS works · accuracy " + Math.round(Number(position.coords.accuracy || 0)) + " m");
    } catch (e: any) {
      setGpsTestResult(locationErrorMessage(e));
    } finally {
      setGpsTesting(false);
    }
  }

  async function retryWhatsApp(visitId: string) {
    setRetryingVisit(visitId);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/site-visits/retry-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ visitId }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "WhatsApp retry failed."));
      setNotice("Site Visit " + visitId + " · WhatsApp SENT successfully.");
      await load();
    } catch (e: any) {
      setError("Site Visit remains saved. WhatsApp retry failed: " + (e?.message || "Unknown error."));
    } finally {
      setRetryingVisit("");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    let requestStarted = false;
    try {
      if (!projectId) throw new Error("Select a project.");
      if (!location) throw new Error("Verify your location before submitting.");
      if (isSiteVisitOffline()) throw new Error("You are offline. Reconnect before submitting; your notes and photos are preserved.");

      const body = new FormData();
      body.append("projectId", projectId);
      body.append("visitDate", new Date().toISOString().slice(0, 10));
      body.append("purpose", "Site Visit");
      body.append("problemDetails", siteNotes.trim());
      body.append("actionRequired", "");
      body.append("notes", "");
      body.append("locationLatitude", String(location.latitude));
      body.append("locationLongitude", String(location.longitude));
      body.append("locationAccuracyM", String(location.accuracyM));
      body.append("locationCapturedAt", location.capturedAt);
      if (visitPhoto) {
        setUploadStage("Preparing site photo…");
        body.append("visitPhoto", await prepareSiteVisitPhoto(visitPhoto));
      }
      if (problemPhoto) {
        setUploadStage("Preparing problem photo…");
        body.append("problemPhoto", await prepareSiteVisitPhoto(problemPhoto));
      }

      if (isSiteVisitOffline()) throw new Error("You are offline. Reconnect before submitting; your notes and photos are preserved.");
      setUploadStage("Uploading and saving Site Visit… Do not close this page.");
      requestStarted = true;
      const response = await fetch("/api/site-visits", { method: "POST", body, credentials: "same-origin" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not submit Site Visit."));

      const visitId = String(json.data?.Visit_ID || "");
      const whatsAppStatus = String(json.data?.WhatsApp_Publish_Status || "").toLowerCase();
      const whatsAppReason = String(json.data?.WhatsApp_Publish_Reason || "").trim();
      if (whatsAppStatus === "sent") {
        setNotice("Site Visit " + visitId + " submitted · WhatsApp SENT.");
      } else {
        setNotice("Site Visit " + visitId + " submitted · WhatsApp NOT SENT" + (whatsAppReason ? " — " + whatsAppReason : ". Use Retry WhatsApp below."));
      }
      setSiteNotes("");
      setVisitPhoto(null);
      setProblemPhoto(null);
      setLocation(null);
      setUploadStage("Updating visit history…");
      await load();
    } catch (e: unknown) {
      setError(siteVisitNetworkError(e, requestStarted));
    } finally {
      submittingRef.current = false;
      setUploadStage("");
      setSaving(false);
    }
  }

  return <section className="employee-site-visits">
    <style>{`
      .employee-site-visits{display:grid;gap:14px;color:var(--theme-ink-_f5f5f5,#f5f5f5)}
      .sv-hero{padding:18px 20px;border:1px solid var(--theme-line-_303a44,#303a44);border-radius:14px;background:linear-gradient(145deg,var(--theme-bg-_141b22,#141b22),var(--theme-bg-_0d1217,#0d1217))}
      .sv-hero small{color:#ff666c;font-size:8px;font-weight:900;letter-spacing:.16em}.sv-hero h2{margin:5px 0 0;font-size:20px}.sv-hero p{margin:6px 0 0;color:var(--theme-ink-_86929d,#86929d);font-size:9px;line-height:1.5}
      .sv-msg{padding:10px 12px;border-radius:8px;font-size:9px}.sv-msg.err{background:var(--theme-bg-_341617,#341617);border:1px solid var(--theme-line-_6c292e,#6c292e);color:var(--theme-ink-_ffaaa5,#ffaaa5)}.sv-msg.ok{background:var(--theme-bg-_152c1e,#152c1e);border:1px solid var(--theme-line-_2d5f40,#2d5f40);color:var(--theme-ink-_a6dfb8,#a6dfb8)}
      .sv-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,.8fr);gap:14px;align-items:start}.sv-card{border:1px solid var(--theme-line-_2d3740,#2d3740);border-radius:14px;background:linear-gradient(160deg,var(--theme-bg-_11171d,#11171d),var(--theme-bg-_0d1217,#0d1217));overflow:hidden}.sv-card-head{padding:15px 17px;border-bottom:1px solid var(--theme-line-_28333c,#28333c);display:flex;justify-content:space-between;gap:10px;align-items:center}.sv-card-head strong{font-size:12px}.sv-card-head small{display:block;color:var(--theme-ink-_77838e,#77838e);font-size:8px;margin-top:3px}
      .sv-simple-form{padding:16px;display:grid;gap:12px}.sv-step{display:grid;gap:6px}.sv-step>span{color:var(--theme-ink-_84909b,#84909b);font-size:8px;font-weight:900;letter-spacing:.1em}.sv-step select,.sv-step textarea{width:100%;border:1px solid var(--theme-line-_34404a,#34404a);border-radius:9px;background:var(--theme-bg-_0a1015,#0a1015);color:var(--theme-ink-_f1f4f6,#f1f4f6);padding:11px;font-size:10px;outline:none}.sv-step textarea{min-height:84px;resize:vertical}.sv-step select:focus,.sv-step textarea:focus{border-color:#d61f26;box-shadow:0 0 0 3px rgba(214,31,38,.08)}
      .sv-location-box{display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid var(--theme-line-_34404a,#34404a);border-radius:10px;background:var(--theme-bg-_0b1116,#0b1116);padding:12px}.sv-location-copy{display:grid;gap:3px}.sv-location-copy strong{font-size:9px}.sv-location-copy small{color:var(--theme-ink-_7e8993,#7e8993);font-size:8px;line-height:1.4}.sv-location-copy small.ok{color:#9be0ac}.sv-location-btn{flex:0 0 auto;min-width:128px;height:38px;border:1px solid var(--theme-line-_6b3134,#6b3134);border-radius:8px;background:#b91d25;color:#fff;font-size:8px;font-weight:900;cursor:pointer}.sv-location-btn.verified{background:#176b36;border-color:#2e8b4d}.sv-location-btn:disabled{opacity:.55;cursor:wait}
      .sv-uploads{display:grid;grid-template-columns:1fr 1fr;gap:10px}.sv-upload-box{position:relative;min-height:96px;border:1px dashed var(--theme-line-_3b4751,#3b4751);border-radius:10px;background:var(--theme-bg-_0b1116,#0b1116);padding:12px;display:grid;align-content:center;justify-items:center;text-align:center;gap:5px;cursor:pointer}.sv-upload-box strong{font-size:9px}.sv-upload-box small{color:var(--theme-ink-_77838e,#77838e);font-size:8px;line-height:1.4;max-width:180px}.sv-upload-box input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}.sv-upload-box.has-file{border-style:solid;border-color:#2e8b4d;background:#102419}.sv-upload-plus{font-size:20px;line-height:1;color:#e85559}
      .sv-submit{height:44px;border:0;border-radius:9px;background:linear-gradient(180deg,#d61f26,#a9151b);color:#fff;font-size:9px;font-weight:900;cursor:pointer}.sv-submit:disabled{opacity:.5;cursor:wait}.sv-helper{display:flex;justify-content:space-between;gap:10px;align-items:center;color:var(--theme-ink-_7e8993,#7e8993);font-size:8px}.sv-helper button{border:0;background:transparent;color:#ff7770;font-size:8px;font-weight:800;cursor:pointer;padding:0}.sv-gps-test{padding:8px 10px;border-radius:8px;background:var(--theme-bg-_151b20,#151b20);border:1px solid var(--theme-line-_34404a,#34404a);color:var(--theme-ink-_aeb7c1,#aeb7c1);font-size:8px}
      .sv-list{display:grid;gap:8px;padding:12px}.sv-row{border:1px solid var(--theme-line-_2b353e,#2b353e);border-radius:9px;background:var(--theme-bg-_10171d,#10171d);padding:12px;display:grid;grid-template-columns:1fr auto;gap:9px}.sv-row strong{display:block;font-size:10px}.sv-row small{display:block;margin-top:4px;color:var(--theme-ink-_7e8993,#7e8993);font-size:8px}.sv-row p{margin:7px 0 0;color:var(--theme-ink-_abb6be,#abb6be);font-size:9px;line-height:1.45}.sv-photo-row{display:flex;gap:6px;margin-top:8px}.sv-photo-row a{width:52px;height:42px;border-radius:6px;overflow:hidden;border:1px solid var(--theme-line-_35414b,#35414b);background:var(--theme-bg-_0a1014,#0a1014);display:block}.sv-photo-row img{width:100%;height:100%;object-fit:cover}.sv-status{align-self:start;padding:5px 7px;border-radius:999px;background:var(--theme-bg-_173827,#173827);color:var(--theme-ink-_a7dfbb,#a7dfbb);font-size:7px;font-weight:900}.sv-empty{padding:26px;text-align:center;color:var(--theme-ink-_7e8993,#7e8993);font-size:9px}.sv-refresh{border:1px solid var(--theme-line-_3b4650,#3b4650);border-radius:7px;background:transparent;color:var(--theme-ink-_c7d0d7,#c7d0d7);padding:7px 9px;font-size:8px;cursor:pointer}
      .sv-row-side{display:grid;justify-items:end;align-content:start;gap:6px}.sv-wa{max-width:150px;padding:5px 7px;border-radius:7px;font-size:7px;font-weight:900;text-align:right;background:#292015;color:#f1c27d;border:1px solid #5a452a}.sv-wa.sent{background:#102719;color:#9be0ac;border-color:#2d5f40}.sv-wa.failed,.sv-wa.skipped{background:#321718;color:#ffaaa5;border-color:#6c292e}.sv-wa-retry{border:1px solid #6b3134;border-radius:7px;background:#b91d25;color:#fff;padding:6px 8px;font-size:7px;font-weight:900;cursor:pointer}.sv-wa-retry:disabled{opacity:.55;cursor:wait}.sv-wa-reason{max-width:190px;color:#c7908f!important;text-align:right;line-height:1.35}
      @media(max-width:900px){.sv-grid{grid-template-columns:1fr}.sv-card.recent{order:2}}@media(max-width:600px){.sv-hero{padding:16px}.sv-simple-form{padding:13px}.sv-location-box{align-items:stretch;flex-direction:column}.sv-location-btn{width:100%}.sv-uploads{grid-template-columns:1fr 1fr}.sv-upload-box{min-height:88px}.sv-helper{align-items:flex-start;flex-direction:column}.sv-submit{height:46px}.sv-row-side{justify-items:end}}
      /* V5.4 mobile fieldwork: two separate camera/gallery choices, no hidden full-card input. */
      .sv-upload-box{cursor:default;min-width:0}
      .sv-upload-box .sv-file-input{position:absolute;inset:auto;width:1px;height:1px;opacity:0;pointer-events:none}
      .sv-upload-box:focus-within{outline:2px solid var(--lv-brand-primary);outline-offset:2px}
      .sv-upload-actions{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;width:100%}
      .sv-upload-choice{display:inline-flex;align-items:center;justify-content:center;min-height:44px;flex:1 1 110px;padding:8px 10px;
        border:1px solid var(--lv-control-border);border-radius:9px;background:var(--lv-control-bg);color:var(--lv-text-primary);
        -webkit-text-fill-color:currentColor;font-size:12px;font-weight:800;line-height:1.3;cursor:pointer;touch-action:manipulation}
      .sv-upload-choice.camera{background:var(--lv-brand-primary);border-color:var(--lv-brand-primary);color:#fff;-webkit-text-fill-color:#fff}
      .sv-upload-choice.is-disabled{opacity:.55;cursor:wait}
      .sv-upload-remove{min-height:44px;padding:9px 12px;border-radius:9px;font-size:12px;font-weight:800}
      .sv-upload-box small{overflow-wrap:anywhere;max-width:100%;font-size:11px}
      .sv-progress{font-size:12px;line-height:1.5}
      @media(max-width:600px){.sv-uploads{grid-template-columns:minmax(0,1fr)}.sv-step select,.sv-step textarea{font-size:16px;min-height:44px}.sv-msg{font-size:12px;line-height:1.45}.sv-hero p{font-size:12px}.sv-hero small{font-size:10px}.sv-step>span{font-size:11px}.sv-submit{font-size:12px}}
    `}</style>

    <div className="sv-hero">
      <small>SITE SUPERVISION</small>
      <h2>Quick Site Visit</h2>
      <p>Select the project, verify GPS, add photos or a short note, then submit.</p>
    </div>

    {error && <div className="sv-msg err" role="alert">{error}</div>}
    {notice && <div className="sv-msg ok" role="status">{notice}</div>}
    {offline && <div className="sv-msg err" role="status">Offline — reconnect before submitting. Your notes and selected photos remain on this page.</div>}

    <div className="sv-grid">
      <section className="sv-card">
        <div className="sv-card-head"><div><strong>New Site Visit</strong><small>Today's date is added automatically.</small></div><span>EMPLOYEE</span></div>
        <form className="sv-simple-form" onSubmit={submit} aria-busy={saving}>
          <label className="sv-step">
            <span>1 · PROJECT</span>
            <select value={projectId} disabled={saving} onChange={(e) => { setProjectId(e.target.value); setLocation(null); setNotice(""); }}>
              <option value="">Select project</option>
              {projects.map((project) => <option key={project.Project_ID} value={project.Project_ID}>{project.Project_ID} · {project.Project_Name || project.Client_Name || "Project"}</option>)}
            </select>
          </label>

          <div className="sv-step">
            <span>2 · VERIFY LOCATION</span>
            <div className="sv-location-box">
              <div className="sv-location-copy">
                <strong>{location ? "Verified at project site" : "GPS verification required"}</strong>
                <small className={location ? "ok" : ""}>{location ? Math.round(location.distanceM) + " m from site · accuracy " + Math.round(location.accuracyM) + " m" : "Your exact location is checked against the registered project site."}</small>
              </div>
              <button type="button" className={`sv-location-btn${location ? " verified" : ""}`} data-lv-button={location ? "success-solid" : "primary"} onClick={() => void verifyLocation()} disabled={locationChecking || saving || !projectId}>{locationChecking ? "CHECKING GPS…" : location ? "✓ VERIFIED" : locationPermission === "denied" ? "TRY GPS AGAIN" : "VERIFY GPS"}</button>
            </div>
          </div>

          <div className="sv-step">
            <span>3 · PHOTOS</span>
            <div className="sv-uploads">
              <div className={`sv-upload-box${visitPhoto ? " has-file" : ""}`}>
                <span className="sv-upload-plus" aria-hidden="true">{visitPhoto ? "✓" : "+"}</span>
                <strong>SITE PHOTO</strong>
                <small>{visitPhoto ? visitPhoto.name : "Take a picture or select from gallery"}</small>
                <div className="sv-upload-actions">
                  <label className={`sv-upload-choice camera${saving ? " is-disabled" : ""}`} htmlFor={visitCameraId}>📷 Camera</label>
                  <label className={`sv-upload-choice${saving ? " is-disabled" : ""}`} htmlFor={visitGalleryId}>Gallery</label>
                </div>
                <input id={visitCameraId} className="sv-file-input" type="file" accept="image/*" capture="environment" disabled={saving} onChange={(e) => { if (e.target.files?.[0]) choosePhoto("visit", e.target.files[0]); e.target.value = ""; }} />
                <input id={visitGalleryId} className="sv-file-input" type="file" accept="image/*" disabled={saving} onChange={(e) => { if (e.target.files?.[0]) choosePhoto("visit", e.target.files[0]); e.target.value = ""; }} />
                {visitPhoto && <button type="button" className="sv-upload-remove" data-lv-button="danger" disabled={saving} onClick={() => choosePhoto("visit", null)}>Remove site photo</button>}
              </div>
              <div className={`sv-upload-box${problemPhoto ? " has-file" : ""}`}>
                <span className="sv-upload-plus" aria-hidden="true">{problemPhoto ? "✓" : "+"}</span>
                <strong>PROBLEM PHOTO</strong>
                <small>{problemPhoto ? problemPhoto.name : "Optional — camera or gallery"}</small>
                <div className="sv-upload-actions">
                  <label className={`sv-upload-choice camera${saving ? " is-disabled" : ""}`} htmlFor={problemCameraId}>📷 Camera</label>
                  <label className={`sv-upload-choice${saving ? " is-disabled" : ""}`} htmlFor={problemGalleryId}>Gallery</label>
                </div>
                <input id={problemCameraId} className="sv-file-input" type="file" accept="image/*" capture="environment" disabled={saving} onChange={(e) => { if (e.target.files?.[0]) choosePhoto("problem", e.target.files[0]); e.target.value = ""; }} />
                <input id={problemGalleryId} className="sv-file-input" type="file" accept="image/*" disabled={saving} onChange={(e) => { if (e.target.files?.[0]) choosePhoto("problem", e.target.files[0]); e.target.value = ""; }} />
                {problemPhoto && <button type="button" className="sv-upload-remove" data-lv-button="danger" disabled={saving} onClick={() => choosePhoto("problem", null)}>Remove problem photo</button>}
              </div>
            </div>
          </div>

          <label className="sv-step">
            <span>4 · SITE NOTES / PROBLEM</span>
            <textarea value={siteNotes} disabled={saving} onChange={(e) => setSiteNotes(e.target.value)} placeholder="What happened at the site? Add any problem or instruction here. (Optional)" />
          </label>

          {uploadStage && <div className="sv-msg ok sv-progress" role="status" aria-live="polite">{uploadStage}</div>}
          <button className="sv-submit" data-lv-button="primary" disabled={saving || offline || !projectId || !location}>{saving ? "PREPARING / UPLOADING…" : "SUBMIT SITE VISIT"}</button>

          <div className="sv-helper">
            <span>Photos are compressed automatically before upload.</span>
            <button type="button" onClick={() => void testGps()} disabled={gpsTesting || saving}>{gpsTesting ? "Testing GPS…" : "Having GPS trouble? Test location"}</button>
          </div>
          {gpsTestResult && <div className="sv-gps-test">{gpsTestResult}</div>}
        </form>
      </section>

      <section className="sv-card recent">
        <div className="sv-card-head"><div><strong>Recent Site Visits</strong><small>{visits.length} recorded visits</small></div><button type="button" className="sv-refresh" onClick={() => void load()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button></div>
        <div className="sv-list">
          {visits.slice(0, 12).map((visit, index) => {
            const waStatus = String(visit.WhatsApp_Publish_Status || "").toLowerCase();
            const waLabel = waStatus === "sent" ? "WhatsApp · SENT" : waStatus === "failed" ? "WhatsApp · FAILED" : waStatus === "skipped" ? "WhatsApp · NOT SENT" : waStatus === "queued" ? "WhatsApp · QUEUED" : "";
            return <article className="sv-row" key={visit.Visit_ID || index}>
              <div>
                <strong>{visit.Project_ID} · {visit.Purpose || "Site Visit"}</strong>
                <small>{dateText(visit.Visit_Date)} · {visit.Employee_Name || visit.Visited_By || "Employee"}</small>
                {visit.Problem_Details && <p>{visit.Problem_Details}</p>}
                {(visit.Visit_Photo_Available || visit.Problem_Photo_Available) && <div className="sv-photo-row">
                  {visit.Visit_Photo_Available && <a href={"/api/site-visits/media?visitId=" + encodeURIComponent(visit.Visit_ID) + "&kind=visit"} target="_blank" rel="noreferrer"><img loading="lazy" decoding="async" src={"/api/site-visits/media?visitId=" + encodeURIComponent(visit.Visit_ID) + "&kind=visit"} alt="Site visit" /></a>}
                  {visit.Problem_Photo_Available && <a href={"/api/site-visits/media?visitId=" + encodeURIComponent(visit.Visit_ID) + "&kind=problem"} target="_blank" rel="noreferrer"><img loading="lazy" decoding="async" src={"/api/site-visits/media?visitId=" + encodeURIComponent(visit.Visit_ID) + "&kind=problem"} alt="Problem" /></a>}
                </div>}
              </div>
              <div className="sv-row-side">
                <span className="sv-status">{visit.Status || "Completed"}</span>
                {waLabel && <span className={`sv-wa ${waStatus}`}>{waLabel}</span>}
                {waStatus && waStatus !== "sent" && <button type="button" className="sv-wa-retry" data-lv-button="primary" disabled={retryingVisit === visit.Visit_ID} onClick={() => void retryWhatsApp(String(visit.Visit_ID || ""))}>{retryingVisit === visit.Visit_ID ? "RETRYING…" : "RETRY WHATSAPP"}</button>}
                {waStatus && waStatus !== "sent" && visit.WhatsApp_Publish_Reason && <small className="sv-wa-reason">{visit.WhatsApp_Publish_Reason}</small>}
              </div>
            </article>;
          })}
          {!visits.length && <div className="sv-empty">No Site Visits recorded yet.</div>}
        </div>
      </section>
    </div>
  </section>;
}
