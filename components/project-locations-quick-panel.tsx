"use client";

import { useEffect, useMemo, useState } from "react";
import ProjectLocationSimplifier, {
  buildSimplifiedAddress,
  type ProjectLocationDraft,
} from "@/components/project-location-simplifier";

type ProjectLocation = ProjectLocationDraft & {
  projectId: string;
  projectName: string;
  clientName: string;
  legacyLocation: string;
  locationTag: string;
  siteLatitude: string | number;
  siteLongitude: string | number;
  locationComplete: boolean;
};

type ApiEnvelope = { success?: boolean; error?: string; data?: unknown };

function text(value: unknown) { return String(value ?? "").trim(); }
function numberFromProjectId(value: string) { const match = value.match(/\d+/); return match ? Number(match[0]) : 999999; }

async function apiJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const json = await response.json().catch(() => null) as ApiEnvelope | null;
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Request failed."));
  return json.data;
}

const css = `
.plq{display:grid;gap:10px;margin-bottom:14px;padding:13px;border:1px solid var(--lv-brand-border,rgba(214,31,38,.24));border-radius:12px;background:linear-gradient(135deg,var(--lv-brand-soft,rgba(214,31,38,.05)),var(--lv-surface-panel,#111a22))}.plq-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.plq-head small{display:block;color:var(--lv-brand-text,#ef6c66);font-size:8px;font-weight:950;letter-spacing:.12em}.plq-head h2{margin:4px 0 3px;font-size:17px}.plq-head p{margin:0;color:var(--lv-text-muted,#87939c);font-size:9px;line-height:1.5}.plq-grid{display:grid;grid-template-columns:minmax(260px,1fr) auto;gap:8px;align-items:end}.plq-field{display:grid;gap:5px}.plq-field span{font-size:8px;font-weight:950;text-transform:uppercase;color:var(--lv-text-muted,#87939c)}.plq-field select{min-height:40px;width:100%;padding:0 10px;border:1px solid var(--lv-border-default,rgba(255,255,255,.12));border-radius:7px;background:var(--lv-surface-input,#0d151c);color:var(--lv-text-primary,#fff)}.plq-btn{min-height:40px;padding:0 13px;border:1px solid var(--lv-brand-primary,#d61f26);border-radius:7px;background:var(--lv-brand-primary,#d61f26);color:#fff;font-size:9px;font-weight:950;cursor:pointer}.plq-btn:disabled{opacity:.5;cursor:not-allowed}.plq-status{padding:8px 10px;border-radius:7px;font-size:9px}.plq-status.ok{background:var(--lv-success-soft,rgba(46,160,98,.1));color:var(--lv-success,#8cd7aa)}.plq-status.err{background:var(--lv-danger-soft,rgba(214,31,38,.1));color:var(--lv-danger,#ff9d96)}.plq-meta{color:var(--lv-text-muted,#87939c);font-size:8px}.plq-meta strong{color:var(--lv-text-primary,#fff)}@media(max-width:720px){.plq-head{flex-direction:column}.plq-grid{grid-template-columns:1fr}.plq-btn{width:100%}}
`;

export default function ProjectLocationsQuickPanel() {
  const [projects, setProjects] = useState<ProjectLocation[]>([]);
  const [projectId, setProjectId] = useState("");
  const [draft, setDraft] = useState<ProjectLocationDraft>({ division: "", district: "", upazilaThana: "", localBodyType: "", localBodyName: "", wardNo: "", villageArea: "", roadHolding: "" });
  const [address, setAddress] = useState("");
  const [locationTag, setLocationTag] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    apiJson("/api/projects/locations")
      .then((data) => {
        if (!active) return;
        const rows = (Array.isArray(data) ? data : []) as ProjectLocation[];
        rows.sort((a, b) => numberFromProjectId(a.projectId) - numberFromProjectId(b.projectId));
        setProjects(rows);
        const requested = new URLSearchParams(window.location.search).get("fileId") || "";
        const first = rows.find((row) => row.projectId.toLowerCase() === requested.toLowerCase()) || rows.find((row) => !row.locationComplete) || rows[0];
        if (first) setProjectId(first.projectId);
      })
      .catch((error: unknown) => active && setMessage({ kind: "err", text: error instanceof Error ? error.message : "Could not load projects." }))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const selected = useMemo(() => projects.find((row) => row.projectId === projectId) || null, [projects, projectId]);

  useEffect(() => {
    if (!selected) return;
    const next: ProjectLocationDraft = {
      division: text(selected.division), district: text(selected.district), upazilaThana: text(selected.upazilaThana),
      localBodyType: text(selected.localBodyType), localBodyName: text(selected.localBodyName), wardNo: text(selected.wardNo),
      villageArea: text(selected.villageArea), roadHolding: text(selected.roadHolding),
    };
    setDraft(next);
    setAddress(text(selected.legacyLocation) || buildSimplifiedAddress(next));
    setLocationTag(text(selected.locationTag));
    setLatitude(text(selected.siteLatitude));
    setLongitude(text(selected.siteLongitude));
    setMessage(null);
  }, [selected]);

  async function save() {
    if (!selected || saving) return;
    if (!address.trim() && !buildSimplifiedAddress(draft)) return setMessage({ kind: "err", text: "Add an address or capture a pin before saving." });
    setSaving(true); setMessage(null);
    try {
      const saved = await apiJson("/api/projects/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selected.projectId,
          ...draft,
          fullAddress: address.trim() || buildSimplifiedAddress(draft),
          locationTag,
          siteLatitude: latitude,
          siteLongitude: longitude,
        }),
      }) as ProjectLocation;
      setProjects((current) => current.map((row) => row.projectId === selected.projectId ? { ...row, ...saved } : row));
      setMessage({ kind: "ok", text: `${selected.projectId} location saved. The advanced register below has been updated too.` });
    } catch (error) {
      setMessage({ kind: "err", text: error instanceof Error ? error.message : "Could not save location." });
    } finally { setSaving(false); }
  }

  return <section className="plq">
    <style dangerouslySetInnerHTML={{ __html: css }} />
    <div className="plq-head">
      <div><small>QUICK LOCATION ENTRY</small><h2>Pin first. LAND VIEW fills the rest.</h2><p>Select a File ID, use current GPS or paste a Google Maps pin, then save. The detailed location register remains below for rare corrections.</p></div>
      {selected ? <div className="plq-meta"><strong>{selected.projectId}</strong><br />{selected.clientName || selected.projectName || "Project"}</div> : null}
    </div>
    <div className="plq-grid">
      <label className="plq-field"><span>Project / File ID</span><select value={projectId} disabled={loading || saving} onChange={(event) => setProjectId(event.target.value)}><option value="">{loading ? "Loading projects…" : "Select project"}</option>{projects.map((row) => <option key={row.projectId} value={row.projectId}>{row.projectId} · {row.clientName || row.projectName || "Project"}{row.locationComplete ? " · Saved" : " · Location needed"}</option>)}</select></label>
      <button className="plq-btn" type="button" disabled={!selected || saving} onClick={() => void save()}>{saving ? "Saving…" : "Save Location"}</button>
    </div>
    {selected ? <ProjectLocationSimplifier
      value={draft}
      onChange={setDraft}
      address={address}
      onAddressChange={setAddress}
      locationTag={locationTag}
      onLocationTagChange={setLocationTag}
      siteLatitude={latitude}
      siteLongitude={longitude}
      onCoordinatesChange={(lat, lng) => { setLatitude(lat); setLongitude(lng); }}
      title={`${selected.projectId} · Easy Location`}
      initiallyOpen
    /> : null}
    {message ? <div className={`plq-status ${message.kind}`}>{message.text}</div> : null}
  </section>;
}
