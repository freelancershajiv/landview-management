"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ProjectLocationDraft = {
  division: string;
  district: string;
  upazilaThana: string;
  localBodyType: string;
  localBodyName: string;
  wardNo: string;
  villageArea: string;
  roadHolding: string;
};

type Option = { name: string; bnName?: string; category?: string };
type LocalOption = Option & { type: "Union Parishad" | "Paurashava / Municipality" };
type LocalResponse = { unions: Option[]; pourashavas: Option[] };

type Props = {
  value: ProjectLocationDraft;
  onChange: (next: ProjectLocationDraft) => void;
  address: string;
  onAddressChange: (value: string) => void;
  locationTag: string;
  onLocationTagChange: (value: string) => void;
  siteLatitude?: string;
  siteLongitude?: string;
  onCoordinatesChange?: (latitude: string, longitude: string) => void;
  title?: string;
  initiallyOpen?: boolean;
};

export const emptyProjectLocationDraft: ProjectLocationDraft = {
  division: "",
  district: "",
  upazilaThana: "",
  localBodyType: "",
  localBodyName: "",
  wardNo: "",
  villageArea: "",
  roadHolding: "",
};

function text(value: unknown) { return String(value ?? "").trim(); }
function key(...values: string[]) { return values.map((value) => text(value).toLowerCase()).join("|"); }

export function buildSimplifiedAddress(value: ProjectLocationDraft) {
  const parts = [
    text(value.roadHolding),
    text(value.villageArea),
    text(value.wardNo) ? `Ward ${text(value.wardNo)}` : "",
    text(value.localBodyName),
    text(value.upazilaThana),
    text(value.district),
    text(value.division),
  ].filter(Boolean);
  return parts.length ? `${parts.join(", ")}, Bangladesh` : "";
}

export function hasStructuredLocation(value: ProjectLocationDraft) {
  return Boolean(text(value.division) || text(value.district) || text(value.upazilaThana) || text(value.localBodyName) || text(value.wardNo) || text(value.villageArea) || text(value.roadHolding));
}

export function structuredLocationPayload(projectId: string, value: ProjectLocationDraft, address: string, locationTag: string, siteLatitude?: string, siteLongitude?: string) {
  return {
    projectId,
    ...value,
    fullAddress: text(address) || buildSimplifiedAddress(value),
    locationTag: text(locationTag),
    siteLatitude: text(siteLatitude),
    siteLongitude: text(siteLongitude),
  };
}

async function getJson(url: string) {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load locations."));
  return json.data;
}

const css = `
.location-simplifier{grid-column:1/-1;border:1px solid rgba(214,31,38,.22);border-radius:10px;background:rgba(214,31,38,.035);overflow:hidden}.location-simplifier-head{width:100%;min-height:48px;padding:10px 12px;border:0;background:transparent;color:inherit;display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;cursor:pointer}.location-simplifier-head strong{display:block;color:var(--theme-ink-_fff,#fff);font-size:12px}.location-simplifier-head small{display:block;margin-top:3px;color:var(--theme-ink-_82909b,#82909b);font-size:10px;line-height:1.4}.location-simplifier-head b{font-size:16px;color:#ef6c66}.location-simplifier-body{display:grid;gap:10px;padding:0 12px 12px}.location-simplifier-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.location-simplifier-grid label{display:grid;gap:5px;color:var(--theme-ink-_8f9aa4,#8f9aa4);font-size:10px;font-weight:800}.location-simplifier-grid label.full{grid-column:1/-1}.location-simplifier-grid input,.location-simplifier-grid select{width:100%;height:38px;border:1px solid rgba(255,255,255,.13);border-radius:7px;background:var(--theme-bg-_111b24,#111b24);color:var(--theme-ink-_eef2f5,#eef2f5);padding:0 9px;font-size:11px;outline:none}.location-simplifier-grid input:focus,.location-simplifier-grid select:focus{border-color:#d61f26}.location-simplifier-map{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:7px;align-items:end}.location-simplifier-map label{display:grid;gap:5px;color:var(--theme-ink-_8f9aa4,#8f9aa4);font-size:10px;font-weight:800}.location-simplifier-btn{height:38px;padding:0 11px;border:1px solid rgba(255,255,255,.14);border-radius:7px;background:var(--theme-bg-_18232d,#18232d);color:#fff;font-size:9px;font-weight:900;cursor:pointer;white-space:nowrap}.location-simplifier-btn.primary{background:#d61f26;border-color:#d61f26}.location-simplifier-btn:disabled{opacity:.48;cursor:not-allowed}.location-simplifier-preview{padding:10px 11px;border:1px solid rgba(255,255,255,.09);border-radius:8px;background:var(--theme-bg-_0d151c,#0d151c);color:var(--theme-ink-_aeb8be,#aeb8be);font-size:10px;line-height:1.5}.location-simplifier-preview strong{color:var(--theme-ink-_eef2f5,#eef2f5)}.location-simplifier-status{font-size:9px;color:var(--theme-ink-_82909b,#82909b);line-height:1.4}.location-simplifier-status.ok{color:#8cd7aa}.location-simplifier-status.err{color:#ff9d96}@media(max-width:700px){.location-simplifier-grid{grid-template-columns:1fr}.location-simplifier-grid label.full{grid-column:auto}.location-simplifier-map{grid-template-columns:1fr}.location-simplifier-btn{width:100%}}
`;

export default function ProjectLocationSimplifier({ value, onChange, address, onAddressChange, locationTag, onLocationTagChange, siteLatitude = "", siteLongitude = "", onCoordinatesChange, title = "Location Simplifier", initiallyOpen = true }: Props) {
  const [open, setOpen] = useState(initiallyOpen);
  const [divisions, setDivisions] = useState<Option[]>([]);
  const [districts, setDistricts] = useState<Option[]>([]);
  const [upazilas, setUpazilas] = useState<Option[]>([]);
  const [locals, setLocals] = useState<LocalOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err" | ""; text: string }>({ kind: "", text: "" });
  const requestKey = useRef("");

  const preview = useMemo(() => buildSimplifiedAddress(value), [value]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getJson("/api/bangladesh-locations?level=divisions")
      .then((data) => { if (active) setDivisions(data || []); })
      .catch((error) => { if (active) setStatus({ kind: "err", text: error?.message || "Could not load divisions." }); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const division = text(value.division);
    if (!division) { setDistricts([]); return; }
    const current = `d:${division}`; requestKey.current = current;
    void getJson(`/api/bangladesh-locations?level=districts&division=${encodeURIComponent(division)}`)
      .then((data) => { if (requestKey.current === current) setDistricts(data || []); })
      .catch(() => {});
  }, [value.division]);

  useEffect(() => {
    const division = text(value.division), district = text(value.district);
    if (!division || !district) { setUpazilas([]); return; }
    const current = `u:${key(division, district)}`; requestKey.current = current;
    void getJson(`/api/bangladesh-locations?level=upazilas&division=${encodeURIComponent(division)}&district=${encodeURIComponent(district)}`)
      .then((data) => { if (requestKey.current === current) setUpazilas(data || []); })
      .catch(() => {});
  }, [value.division, value.district]);

  useEffect(() => {
    const division = text(value.division), district = text(value.district), upazila = text(value.upazilaThana);
    if (!division || !district || !upazila) { setLocals([]); return; }
    const current = `l:${key(division, district, upazila)}`; requestKey.current = current;
    void getJson(`/api/bangladesh-locations?level=local&division=${encodeURIComponent(division)}&district=${encodeURIComponent(district)}&upazila=${encodeURIComponent(upazila)}`)
      .then((data: LocalResponse) => {
        if (requestKey.current !== current) return;
        const localData = data || { unions: [], pourashavas: [] };
        setLocals([
          ...(localData.unions || []).map((item) => ({ ...item, type: "Union Parishad" as const })),
          ...(localData.pourashavas || []).map((item) => ({ ...item, type: "Paurashava / Municipality" as const })),
        ]);
      })
      .catch(() => {});
  }, [value.division, value.district, value.upazilaThana]);

  function patch(changes: Partial<ProjectLocationDraft>) {
    const next = { ...value, ...changes };
    onChange(next);
  }

  function applyAddress() {
    if (!preview) return setStatus({ kind: "err", text: "Choose location details first." });
    onAddressChange(preview);
    setStatus({ kind: "ok", text: "Simplified address applied to the project address field." });
  }

  async function resolveMapLink() {
    if (!text(locationTag)) return setStatus({ kind: "err", text: "Paste a Google Maps link first." });
    setResolving(true); setStatus({ kind: "", text: "" });
    try {
      const response = await fetch("/api/projects/resolve-location", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store",
        body: JSON.stringify({ location: locationTag }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not resolve the map link."));
      const latitude = String(json.data?.latitude ?? "");
      const longitude = String(json.data?.longitude ?? "");
      if (latitude && longitude) {
        onCoordinatesChange?.(latitude, longitude);
        onLocationTagChange(`https://www.google.com/maps?q=${latitude},${longitude}`);
      }
      setStatus({ kind: "ok", text: latitude && longitude ? `Map pin resolved: ${latitude}, ${longitude}` : "Map link resolved." });
    } catch (error: any) {
      setStatus({ kind: "err", text: error?.message || "Could not resolve the map link." });
    } finally { setResolving(false); }
  }

  function useCurrentLocation() {
    if (locating) return;
    setStatus({ kind: "", text: "" });
    if (typeof window !== "undefined" && !window.isSecureContext) return setStatus({ kind: "err", text: "Current location requires HTTPS." });
    if (typeof navigator === "undefined" || !navigator.geolocation) return setStatus({ kind: "err", text: "Location is not available in this browser." });
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude.toFixed(8));
        const longitude = Number(position.coords.longitude.toFixed(8));
        const accuracy = Number.isFinite(position.coords.accuracy) ? Math.round(position.coords.accuracy) : 0;
        onCoordinatesChange?.(String(latitude), String(longitude));
        onLocationTagChange(`https://www.google.com/maps?q=${latitude},${longitude}`);
        setStatus({ kind: "ok", text: `Current pin added${accuracy ? ` · accuracy ±${accuracy} m` : ""}.` });
        setLocating(false);
      },
      (error) => {
        setStatus({ kind: "err", text: error.code === error.PERMISSION_DENIED ? "Location permission is blocked. Allow it in browser settings and retry." : "Could not determine current location." });
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  return <div className="location-simplifier">
    <style dangerouslySetInnerHTML={{ __html: css }} />
    <button className="location-simplifier-head" type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
      <span><strong>{title}</strong><small>Build a clean Bangladesh address and save the map pin without typing everything manually.</small></span><b>{open ? "−" : "+"}</b>
    </button>
    {open && <div className="location-simplifier-body">
      <div className="location-simplifier-grid">
        <label>Division<select value={value.division} disabled={loading} onChange={(event) => patch({ division: event.target.value, district: "", upazilaThana: "", localBodyType: "", localBodyName: "" })}><option value="">Select Division</option>{divisions.map((item) => <option key={item.name} value={item.name}>{item.name}{item.bnName ? ` · ${item.bnName}` : ""}</option>)}</select></label>
        <label>District<select value={value.district} disabled={!value.division} onChange={(event) => patch({ district: event.target.value, upazilaThana: "", localBodyType: "", localBodyName: "" })}><option value="">Select District</option>{districts.map((item) => <option key={item.name} value={item.name}>{item.name}{item.bnName ? ` · ${item.bnName}` : ""}</option>)}</select></label>
        <label>Upazila / Thana<select value={value.upazilaThana} disabled={!value.district} onChange={(event) => patch({ upazilaThana: event.target.value, localBodyType: "", localBodyName: "" })}><option value="">Select Upazila / Thana</option>{upazilas.map((item) => <option key={item.name} value={item.name}>{item.name}{item.bnName ? ` · ${item.bnName}` : ""}</option>)}</select></label>
        <label>Union / Municipality<select value={value.localBodyName} disabled={!value.upazilaThana} onChange={(event) => { const selected = locals.find((item) => item.name === event.target.value); patch({ localBodyName: event.target.value, localBodyType: selected?.type || "" }); }}><option value="">Select Union / Municipality</option>{locals.map((item) => <option key={`${item.type}:${item.name}`} value={item.name}>{item.name} · {item.type}</option>)}</select></label>
        <label>Ward No.<input value={value.wardNo} onChange={(event) => patch({ wardNo: event.target.value })} placeholder="e.g. 05" /></label>
        <label>Village / Area<input value={value.villageArea} onChange={(event) => patch({ villageArea: event.target.value })} placeholder="Village, para, mahalla or area" /></label>
        <label className="full">Road / Holding / Landmark<input value={value.roadHolding} onChange={(event) => patch({ roadHolding: event.target.value })} placeholder="Road, holding, mouja or landmark" /></label>
      </div>
      <div className="location-simplifier-preview"><strong>Address preview</strong><br />{preview || "Choose the location levels above. The clean address will appear here."}</div>
      <button className="location-simplifier-btn primary" type="button" onClick={applyAddress} disabled={!preview}>Use This Simplified Address</button>
      <div className="location-simplifier-map">
        <label>Google Maps pin<input value={locationTag} onChange={(event) => onLocationTagChange(event.target.value)} placeholder="Paste Google Maps link" /></label>
        <button className="location-simplifier-btn" type="button" onClick={resolveMapLink} disabled={resolving || !text(locationTag)}>{resolving ? "Resolving…" : "Resolve Pin"}</button>
        <button className="location-simplifier-btn" type="button" onClick={useCurrentLocation} disabled={locating}>{locating ? "Locating…" : "Current Location"}</button>
      </div>
      {(siteLatitude || siteLongitude) && <div className="location-simplifier-status ok">Stored coordinates: {siteLatitude || "—"}, {siteLongitude || "—"}</div>}
      {status.text && <div className={`location-simplifier-status ${status.kind}`}>{status.text}</div>}
    </div>}
  </div>;
}
