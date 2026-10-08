"use client";

import { useEffect, useMemo, useState } from "react";

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

function compressImage(file: File, maxDimension = 1400, quality = 0.78): Promise<File> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Please select an image file."));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("Could not prepare photo."));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error("Could not prepare photo."));
        resolve(new File([blob], file.name.replace(/\.(jpe?g|png|webp|heic|heif)$/i, "") + ".jpg", { type: "image/jpeg" }));
      }, "image/jpeg", quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read photo. Please take a new photo and try again."));
    };
    img.src = url;
  });
}

export default function EmployeeSiteVisitCenter() {
  const [projects, setProjects] = useState<Row[]>([]);
  const [visits, setVisits] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
      const [projectResponse, visitResponse] = await Promise.all([
        fetch("/api/site-visits?mode=projects", { cache: "no-store", credentials: "same-origin" }).then((r) => r.json()),
        fetch("/api/site-visits", { cache: "no-store", credentials: "same-origin" }).then((r) => r.json()),
      ]);
      if (!projectResponse?.success) throw new Error(projectResponse?.error || "Could not load projects for Site Visits.");
      if (!visitResponse?.success) throw new Error(visitResponse?.error || "Could not load Site Visits.");
      const projectRows = projectResponse.data || [];
      setProjects(projectRows);
      setVisits(visitResponse.data || []);
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (!projectId) throw new Error("Select a project.");
      if (!location) throw new Error("Verify your location before submitting.");

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
      if (visitPhoto) body.append("visitPhoto", await compressImage(visitPhoto));
      if (problemPhoto) body.append("problemPhoto", await compressImage(problemPhoto));

      const response = await fetch("/api/site-visits", { method: "POST", body, credentials: "same-origin" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not submit Site Visit."));

      setNotice("Site Visit " + (json.data?.Visit_ID || "") + " submitted successfully.");
      setSiteNotes("");
      setVisitPhoto(null);
      setProblemPhoto(null);
      setLocation(null);
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not submit Site Visit.");
    } finally {
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
      .sv-submit{height:44px;border:0;border-radius:9px;background:linear-gradient(180deg,#e53138,#bd171e);color:#fff;font-size:9px;font-weight:900;cursor:pointer}.sv-submit:disabled{opacity:.5;cursor:wait}.sv-helper{display:flex;justify-content:space-between;gap:10px;align-items:center;color:var(--theme-ink-_7e8993,#7e8993);font-size:8px}.sv-helper button{border:0;background:transparent;color:#ff7770;font-size:8px;font-weight:800;cursor:pointer;padding:0}.sv-gps-test{padding:8px 10px;border-radius:8px;background:var(--theme-bg-_151b20,#151b20);border:1px solid var(--theme-line-_34404a,#34404a);color:var(--theme-ink-_aeb7c1,#aeb7c1);font-size:8px}
      .sv-list{display:grid;gap:8px;padding:12px}.sv-row{border:1px solid var(--theme-line-_2b353e,#2b353e);border-radius:9px;background:var(--theme-bg-_10171d,#10171d);padding:12px;display:grid;grid-template-columns:1fr auto;gap:9px}.sv-row strong{display:block;font-size:10px}.sv-row small{display:block;margin-top:4px;color:var(--theme-ink-_7e8993,#7e8993);font-size:8px}.sv-row p{margin:7px 0 0;color:var(--theme-ink-_abb6be,#abb6be);font-size:9px;line-height:1.45}.sv-photo-row{display:flex;gap:6px;margin-top:8px}.sv-photo-row a{width:52px;height:42px;border-radius:6px;overflow:hidden;border:1px solid var(--theme-line-_35414b,#35414b);background:var(--theme-bg-_0a1014,#0a1014);display:block}.sv-photo-row img{width:100%;height:100%;object-fit:cover}.sv-status{align-self:start;padding:5px 7px;border-radius:999px;background:var(--theme-bg-_173827,#173827);color:var(--theme-ink-_a7dfbb,#a7dfbb);font-size:7px;font-weight:900}.sv-empty{padding:26px;text-align:center;color:var(--theme-ink-_7e8993,#7e8993);font-size:9px}.sv-refresh{border:1px solid var(--theme-line-_3b4650,#3b4650);border-radius:7px;background:transparent;color:var(--theme-ink-_c7d0d7,#c7d0d7);padding:7px 9px;font-size:8px;cursor:pointer}
      @media(max-width:900px){.sv-grid{grid-template-columns:1fr}.sv-card.recent{order:2}}@media(max-width:600px){.sv-hero{padding:16px}.sv-simple-form{padding:13px}.sv-location-box{align-items:stretch;flex-direction:column}.sv-location-btn{width:100%}.sv-uploads{grid-template-columns:1fr 1fr}.sv-upload-box{min-height:88px}.sv-helper{align-items:flex-start;flex-direction:column}.sv-submit{height:46px}}
    `}</style>

    <div className="sv-hero">
      <small>SITE SUPERVISION</small>
      <h2>Quick Site Visit</h2>
      <p>Select the project, verify GPS, add photos or a short note, then submit.</p>
    </div>

    {error && <div className="sv-msg err">{error}</div>}
    {notice && <div className="sv-msg ok">{notice}</div>}

    <div className="sv-grid">
      <section className="sv-card">
        <div className="sv-card-head"><div><strong>New Site Visit</strong><small>Today's date is added automatically.</small></div><span>EMPLOYEE</span></div>
        <form className="sv-simple-form" onSubmit={submit}>
          <label className="sv-step">
            <span>1 · PROJECT</span>
            <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setLocation(null); setNotice(""); }}>
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
              <button type="button" className={`sv-location-btn${location ? " verified" : ""}`} onClick={() => void verifyLocation()} disabled={locationChecking || !projectId}>{locationChecking ? "CHECKING GPS…" : location ? "✓ VERIFIED" : locationPermission === "denied" ? "TRY GPS AGAIN" : "VERIFY GPS"}</button>
            </div>
          </div>

          <div className="sv-step">
            <span>3 · PHOTOS</span>
            <div className="sv-uploads">
              <label className={`sv-upload-box${visitPhoto ? " has-file" : ""}`}>
                <span className="sv-upload-plus">{visitPhoto ? "✓" : "+"}</span>
                <strong>SITE PHOTO</strong>
                <small>{visitPhoto ? visitPhoto.name : "Take or choose a site photo"}</small>
                <input type="file" accept="image/*" capture="environment" onChange={(e) => setVisitPhoto(e.target.files?.[0] || null)} />
              </label>
              <label className={`sv-upload-box${problemPhoto ? " has-file" : ""}`}>
                <span className="sv-upload-plus">{problemPhoto ? "✓" : "+"}</span>
                <strong>PROBLEM PHOTO</strong>
                <small>{problemPhoto ? problemPhoto.name : "Optional"}</small>
                <input type="file" accept="image/*" capture="environment" onChange={(e) => setProblemPhoto(e.target.files?.[0] || null)} />
              </label>
            </div>
          </div>

          <label className="sv-step">
            <span>4 · SITE NOTES / PROBLEM</span>
            <textarea value={siteNotes} onChange={(e) => setSiteNotes(e.target.value)} placeholder="What happened at the site? Add any problem or instruction here. (Optional)" />
          </label>

          <button className="sv-submit" disabled={saving || !projectId || !location}>{saving ? "SUBMITTING…" : "SUBMIT SITE VISIT"}</button>

          <div className="sv-helper">
            <span>Photos are compressed automatically before upload.</span>
            <button type="button" onClick={() => void testGps()} disabled={gpsTesting}>{gpsTesting ? "Testing GPS…" : "Having GPS trouble? Test location"}</button>
          </div>
          {gpsTestResult && <div className="sv-gps-test">{gpsTestResult}</div>}
        </form>
      </section>

      <section className="sv-card recent">
        <div className="sv-card-head"><div><strong>Recent Site Visits</strong><small>{visits.length} recorded visits</small></div><button type="button" className="sv-refresh" onClick={() => void load()} disabled={loading}>{loading ? "Loading…" : "Refresh"}</button></div>
        <div className="sv-list">
          {visits.slice(0, 12).map((visit, index) => <article className="sv-row" key={visit.Visit_ID || index}>
            <div>
              <strong>{visit.Project_ID} · {visit.Purpose || "Site Visit"}</strong>
              <small>{dateText(visit.Visit_Date)} · {visit.Employee_Name || visit.Visited_By || "Employee"}</small>
              {visit.Problem_Details && <p>{visit.Problem_Details}</p>}
              {(visit.Visit_Photo_Available || visit.Problem_Photo_Available) && <div className="sv-photo-row">
                {visit.Visit_Photo_Available && <a href={"/api/site-visits/media?visitId=" + encodeURIComponent(visit.Visit_ID) + "&kind=visit"} target="_blank" rel="noreferrer"><img src={"/api/site-visits/media?visitId=" + encodeURIComponent(visit.Visit_ID) + "&kind=visit"} alt="Site visit" /></a>}
                {visit.Problem_Photo_Available && <a href={"/api/site-visits/media?visitId=" + encodeURIComponent(visit.Visit_ID) + "&kind=problem"} target="_blank" rel="noreferrer"><img src={"/api/site-visits/media?visitId=" + encodeURIComponent(visit.Visit_ID) + "&kind=problem"} alt="Problem" /></a>}
              </div>}
            </div>
            <span className="sv-status">{visit.Status || "Completed"}</span>
          </article>)}
          {!visits.length && <div className="sv-empty">No Site Visits recorded yet.</div>}
        </div>
      </section>
    </div>
  </section>;
}
