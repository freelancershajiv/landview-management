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
type ResolveData = ProjectLocationDraft & {
  locationTag?: string;
  latitude?: string | number;
  longitude?: string | number;
  displayName?: string;
  matched?: { division?: boolean; district?: boolean; upazila?: boolean; localBody?: boolean };
};

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
  division: "", district: "", upazilaThana: "", localBodyType: "", localBodyName: "", wardNo: "", villageArea: "", roadHolding: "",
};

function text(value: unknown) { return String(value ?? "").trim(); }
function key(...values: string[]) { return values.map((value) => text(value).toLowerCase()).join("|"); }

export function buildSimplifiedAddress(value: ProjectLocationDraft) {
  const parts = [
    text(value.roadHolding), text(value.villageArea), text(value.wardNo) ? `Ward ${text(value.wardNo)}` : "",
    text(value.localBodyName), text(value.upazilaThana), text(value.district), text(value.division),
  ].filter(Boolean);
  return parts.length ? `${parts.join(", ")}, Bangladesh` : "";
}

export function hasStructuredLocation(value: ProjectLocationDraft) {
  return Boolean(text(value.division) || text(value.district) || text(value.upazilaThana) || text(value.localBodyName) || text(value.wardNo) || text(value.villageArea) || text(value.roadHolding));
}

export function structuredLocationPayload(projectId: string, value: ProjectLocationDraft, address: string, locationTag: string, siteLatitude?: string, siteLongitude?: string) {
  return { projectId, ...value, fullAddress: text(address) || buildSimplifiedAddress(value), locationTag: text(locationTag), siteLatitude: text(siteLatitude), siteLongitude: text(siteLongitude) };
}

async function getJson(url: string) {
  const response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load locations."));
  return json.data;
}

const css = `
.location-simplifier{grid-column:1/-1;border:1px solid var(--lv-border-default,rgba(255,255,255,.12));border-radius:12px;background:var(--lv-surface-panel,#111a22);overflow:hidden}.location-simplifier-head{width:100%;min-height:50px;padding:11px 13px;border:0;background:transparent;color:inherit;display:flex;align-items:center;justify-content:space-between;gap:12px;text-align:left;cursor:pointer}.location-simplifier-head strong{display:block;color:var(--lv-text-primary,#fff);font-size:12px}.location-simplifier-head small{display:block;margin-top:3px;color:var(--lv-text-muted,#82909b);font-size:9px;line-height:1.45}.location-simplifier-head b{font-size:18px;color:var(--lv-brand-primary,#d61f26)}.location-simplifier-body{display:grid;gap:10px;padding:0 13px 13px}.location-quick{display:grid;gap:8px;padding:11px;border:1px solid var(--lv-brand-border,rgba(214,31,38,.28));border-radius:10px;background:var(--lv-brand-soft,rgba(214,31,38,.05))}.location-quick label,.location-simplifier-grid label{display:grid;gap:5px;color:var(--lv-text-muted,#8f9aa4);font-size:9px;font-weight:850}.location-quick input,.location-simplifier-grid input,.location-simplifier-grid select{width:100%;min-width:0;height:39px;border:1px solid var(--lv-border-default,rgba(255,255,255,.13));border-radius:7px;background:var(--lv-surface-input,#0d151c);color:var(--lv-text-primary,#eef2f5);padding:0 9px;font-size:10px;outline:none}.location-quick input:focus,.location-simplifier-grid input:focus,.location-simplifier-grid select:focus{border-color:var(--lv-brand-primary,#d61f26);box-shadow:0 0 0 2px var(--lv-brand-ring,rgba(214,31,38,.1))}.location-pin-row{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:7px;align-items:end}.location-pin-actions{display:flex;gap:7px;flex-wrap:wrap}.location-simplifier-btn{min-height:38px;padding:0 11px;border:1px solid var(--lv-border-default,rgba(255,255,255,.14));border-radius:7px;background:var(--lv-surface-input,#18232d);color:var(--lv-text-primary,#fff);font-size:9px;font-weight:900;cursor:pointer;white-space:nowrap;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.location-simplifier-btn.primary{background:var(--lv-brand-primary,#d61f26);border-color:var(--lv-brand-primary,#d61f26);color:#fff}.location-simplifier-btn:disabled{opacity:.48;cursor:not-allowed}.location-simplifier-status{padding:8px 9px;border-radius:7px;background:var(--lv-surface-muted,#0d151c);font-size:9px;color:var(--lv-text-muted,#82909b);line-height:1.45}.location-simplifier-status.ok{color:var(--lv-success,#8cd7aa)}.location-simplifier-status.err{color:var(--lv-danger,#ff9d96)}.location-advanced-toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;min-height:38px;padding:0 10px;border:1px solid var(--lv-border-subtle,rgba(255,255,255,.09));border-radius:8px;background:var(--lv-surface-muted,#0d151c);color:var(--lv-text-secondary,#aeb8be);font-size:9px;font-weight:900;cursor:pointer}.location-simplifier-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.location-simplifier-grid label.full{grid-column:1/-1}.location-simplifier-preview{padding:9px 10px;border:1px solid var(--lv-border-subtle,rgba(255,255,255,.09));border-radius:8px;background:var(--lv-surface-muted,#0d151c);color:var(--lv-text-muted,#aeb8be);font-size:9px;line-height:1.5}.location-simplifier-preview strong{color:var(--lv-text-primary,#eef2f5)}@media(max-width:700px){.location-pin-row,.location-simplifier-grid{grid-template-columns:1fr}.location-simplifier-grid label.full{grid-column:auto}.location-pin-row .location-simplifier-btn{width:100%}}
`;

export default function ProjectLocationSimplifier({ value, onChange, address, onAddressChange, locationTag, onLocationTagChange, siteLatitude = "", siteLongitude = "", onCoordinatesChange, title = "Easy Location", initiallyOpen = true }: Props) {
  const [open, setOpen] = useState(initiallyOpen);
  const [advancedOpen, setAdvancedOpen] = useState(false);
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
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const division = text(value.division);
    if (!division) { setDistricts([]); return; }
    const current = `d:${division}`; requestKey.current = current;
    void getJson(`/api/bangladesh-locations?level=districts&division=${encodeURIComponent(division)}`)
      .then((data) => { if (requestKey.current === current) setDistricts(data || []); }).catch(() => {});
  }, [value.division]);

  useEffect(() => {
    const division = text(value.division), district = text(value.district);
    if (!division || !district) { setUpazilas([]); return; }
    const current = `u:${key(division, district)}`; requestKey.current = current;
    void getJson(`/api/bangladesh-locations?level=upazilas&division=${encodeURIComponent(division)}&district=${encodeURIComponent(district)}`)
      .then((data) => { if (requestKey.current === current) setUpazilas(data || []); }).catch(() => {});
  }, [value.division, value.district]);

  useEffect(() => {
    const division = text(value.division), district = text(value.district), upazila = text(value.upazilaThana);
    if (!division || !district || !upazila) { setLocals([]); return; }
    const current = `l:${key(division, district, upazila)}`; requestKey.current = current;
    void getJson(`/api/bangladesh-locations?level=local&division=${encodeURIComponent(division)}&district=${encodeURIComponent(district)}&upazila=${encodeURIComponent(upazila)}`)
      .then((data: LocalResponse) => {
        if (requestKey.current !== current) return;
        const localData = data || { unions: [], pourashavas: [] };
        setLocals([...(localData.unions || []).map((item) => ({ ...item, type: "Union Parishad" as const })), ...(localData.pourashavas || []).map((item) => ({ ...item, type: "Paurashava / Municipality" as const }))]);
      }).catch(() => {});
  }, [value.division, value.district, value.upazilaThana]);

  function patch(changes: Partial<ProjectLocationDraft>) { onChange({ ...value, ...changes }); }

  function applyAddress() {
    if (!preview) return setStatus({ kind: "err", text: "Add address details first." });
    onAddressChange(preview);
    setStatus({ kind: "ok", text: "Structured address applied." });
  }

  async function resolvePin(raw?: string) {
    const pin = text(raw ?? locationTag);
    if (!pin || resolving) return;
    setResolving(true); setStatus({ kind: "", text: "" });
    try {
      const response = await fetch("/api/projects/locations/resolve", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store",
        body: JSON.stringify({ locationTag: pin }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not resolve the map pin."));
      const data = (json.data || {}) as ResolveData;
      const next: ProjectLocationDraft = {
        division: text(data.division) || value.division,
        district: text(data.district) || value.district,
        upazilaThana: text(data.upazilaThana) || value.upazilaThana,
        localBodyType: text(data.localBodyType) || value.localBodyType,
        localBodyName: text(data.localBodyName) || value.localBodyName,
        wardNo: text(data.wardNo) || value.wardNo,
        villageArea: text(data.villageArea) || value.villageArea,
        roadHolding: text(data.roadHolding) || value.roadHolding,
      };
      onChange(next);
      const latitude = text(data.latitude), longitude = text(data.longitude);
      if (latitude && longitude) onCoordinatesChange?.(latitude, longitude);
      onLocationTagChange(text(data.locationTag) || (latitude && longitude ? `https://www.google.com/maps?q=${latitude},${longitude}` : pin));
      const cleanAddress = buildSimplifiedAddress(next) || text(data.displayName);
      if (cleanAddress) onAddressChange(cleanAddress);
      const matched = data.matched || {};
      const fullMatch = Boolean(matched.division && matched.district && matched.upazila);
      setStatus({ kind: "ok", text: fullMatch ? "Pin found · address filled automatically." : "Pin found · address filled as far as possible. Open Fine tune only if correction is needed." });
    } catch (error: any) {
      setStatus({ kind: "err", text: error?.message || "Could not resolve the map pin." });
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
        const pin = `https://www.google.com/maps?q=${latitude},${longitude}`;
        onCoordinatesChange?.(String(latitude), String(longitude));
        onLocationTagChange(pin);
        setStatus({ kind: "ok", text: `Current pin captured${accuracy ? ` · ±${accuracy} m` : ""}. Filling address…` });
        setLocating(false);
        void resolvePin(pin);
      },
      (error) => {
        setStatus({ kind: "err", text: error.code === error.PERMISSION_DENIED ? "Location permission is blocked. Allow Location for LAND VIEW and retry." : "Could not determine current location. You can paste a Google Maps pin instead." });
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  const mapHref = siteLatitude && siteLongitude ? `https://www.google.com/maps?q=${encodeURIComponent(siteLatitude)},${encodeURIComponent(siteLongitude)}` : (text(locationTag).startsWith("http") ? locationTag : "");

  return <div className="location-simplifier">
    <style dangerouslySetInnerHTML={{ __html: css }} />
    <button className="location-simplifier-head" type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
      <span><strong>{title}</strong><small>Normal flow: use current GPS or paste a Google Maps pin. LAND VIEW fills the address automatically.</small></span><b>{open ? "−" : "+"}</b>
    </button>
    {open && <div className="location-simplifier-body">
      <div className="location-quick">
        <label>Project / Site Address<input value={address} onChange={(event) => onAddressChange(event.target.value)} placeholder="Address fills automatically from the pin, or type it here" /></label>
        <div className="location-pin-row">
          <label>Location Pin<input value={locationTag} onChange={(event) => onLocationTagChange(event.target.value)} onPaste={(event) => { const pasted = event.clipboardData.getData("text"); if (text(pasted)) window.setTimeout(() => void resolvePin(pasted), 30); }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void resolvePin(); } }} placeholder="Paste Google Maps link or coordinates" /></label>
          <button className="location-simplifier-btn primary" type="button" onClick={useCurrentLocation} disabled={locating || resolving}>{locating ? "Getting GPS…" : "⌖ Use Current"}</button>
          <button className="location-simplifier-btn" type="button" onClick={() => void resolvePin()} disabled={resolving || !text(locationTag)}>{resolving ? "Finding…" : "Find Pin"}</button>
        </div>
        <div className="location-pin-actions">
          {mapHref && <a className="location-simplifier-btn" href={mapHref} target="_blank" rel="noreferrer">Open in Maps ↗</a>}
          {(siteLatitude || siteLongitude) && <span className="location-simplifier-status ok">Pin: {siteLatitude || "—"}, {siteLongitude || "—"}</span>}
        </div>
        {status.text && <div className={`location-simplifier-status ${status.kind}`}>{status.text}</div>}
      </div>

      <button className="location-advanced-toggle" type="button" onClick={() => setAdvancedOpen((current) => !current)}><span>Fine tune address · optional</span><span>{advancedOpen ? "Hide −" : "Show +"}</span></button>
      {advancedOpen && <>
        <div className="location-simplifier-grid">
          <label>Division<select value={value.division} disabled={loading} onChange={(event) => patch({ division: event.target.value, district: "", upazilaThana: "", localBodyType: "", localBodyName: "" })}><option value="">Select Division</option>{divisions.map((item) => <option key={item.name} value={item.name}>{item.name}{item.bnName ? ` · ${item.bnName}` : ""}</option>)}</select></label>
          <label>District<select value={value.district} disabled={!value.division} onChange={(event) => patch({ district: event.target.value, upazilaThana: "", localBodyType: "", localBodyName: "" })}><option value="">Select District</option>{districts.map((item) => <option key={item.name} value={item.name}>{item.name}{item.bnName ? ` · ${item.bnName}` : ""}</option>)}</select></label>
          <label>Upazila / Thana<select value={value.upazilaThana} disabled={!value.district} onChange={(event) => patch({ upazilaThana: event.target.value, localBodyType: "", localBodyName: "" })}><option value="">Select Upazila / Thana</option>{upazilas.map((item) => <option key={item.name} value={item.name}>{item.name}{item.bnName ? ` · ${item.bnName}` : ""}</option>)}</select></label>
          <label>Union / Municipality<select value={value.localBodyName} disabled={!value.upazilaThana} onChange={(event) => { const selected = locals.find((item) => item.name === event.target.value); patch({ localBodyName: event.target.value, localBodyType: selected?.type || "" }); }}><option value="">Select Union / Municipality</option>{locals.map((item) => <option key={`${item.type}:${item.name}`} value={item.name}>{item.name} · {item.type}</option>)}</select></label>
          <label>Ward No.<input value={value.wardNo} onChange={(event) => patch({ wardNo: event.target.value })} placeholder="e.g. 05" /></label>
          <label>Village / Area<input value={value.villageArea} onChange={(event) => patch({ villageArea: event.target.value })} placeholder="Village, para, mahalla or area" /></label>
          <label className="full">Road / Holding / Landmark<input value={value.roadHolding} onChange={(event) => patch({ roadHolding: event.target.value })} placeholder="Road, holding, mouja or landmark" /></label>
        </div>
        <div className="location-simplifier-preview"><strong>Structured address preview</strong><br />{preview || "No structured address yet."}</div>
        <button className="location-simplifier-btn" type="button" onClick={applyAddress} disabled={!preview}>Use Structured Address</button>
      </>}
    </div>}
  </div>;
}
