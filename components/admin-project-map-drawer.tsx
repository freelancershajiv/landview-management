"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type MapSettings = {
  projectId: string;
  projectTitle: string;
  location: string;
  locationTag: string;
  publicDisplay: boolean;
  publicMapEnabled: boolean;
  publicMapPrecision: "exact" | "approximate";
  publicMapLatitude: number | string;
  publicMapLongitude: number | string;
  mapSource: "location-tag" | "site-coordinates" | "legacy-public-coordinates" | "";
  siteLatitude: number | string;
  siteLongitude: number | string;
};

const css = `
.lv-map-fab{position:fixed;right:22px;bottom:22px;z-index:90;display:flex;align-items:center;gap:8px;min-height:44px;padding:0 15px;border:1px solid rgba(239,73,59,.65);border-radius:999px;background:#171717;color:#fff;font-size:11px;font-weight:900;letter-spacing:.04em;box-shadow:0 12px 30px rgba(0,0,0,.34);cursor:pointer}.lv-map-fab i{width:9px;height:9px;border-radius:50%;background:#ef493b;box-shadow:0 0 0 4px rgba(239,73,59,.13)}
.lv-map-drawer-backdrop{position:fixed;inset:0;z-index:120;background:rgba(0,0,0,.58);backdrop-filter:blur(4px)}.lv-map-drawer{position:absolute;right:0;top:0;bottom:0;width:min(460px,100%);overflow:auto;background:#171717;border-left:1px solid rgba(255,255,255,.1);box-shadow:-24px 0 60px rgba(0,0,0,.36);padding:22px}.lv-map-drawer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding-bottom:18px;border-bottom:1px solid rgba(255,255,255,.08)}.lv-map-drawer-head span{color:#ef6f65;font-size:9px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}.lv-map-drawer-head h2{margin:5px 0 0;color:#fff;font-size:22px}.lv-map-close{width:38px;height:38px;border:1px solid rgba(255,255,255,.12);border-radius:9px;background:#222;color:#fff;font-size:18px;cursor:pointer}.lv-map-copy{margin:15px 0;color:#9ca4aa;font-size:10px;line-height:1.65}.lv-map-warning{margin:14px 0;padding:11px 12px;border:1px solid rgba(239,73,59,.28);border-radius:9px;background:rgba(239,73,59,.06);color:#e9b0ab;font-size:10px;line-height:1.55}.lv-map-form{display:grid;gap:13px}.lv-map-field{display:grid;gap:6px}.lv-map-field>span{color:#8e989f;font-size:8px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.lv-map-field select{width:100%;min-height:42px;padding:0 11px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:#202020;color:#f4f4f4;outline:none}.lv-map-field select:focus{border-color:#ef493b;box-shadow:0 0 0 3px rgba(239,73,59,.1)}.lv-map-toggle{display:flex;align-items:flex-start;gap:10px;padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:9px;background:#1d1d1d;color:#e7e7e7;font-size:10px;line-height:1.5}.lv-map-toggle input{width:18px;height:18px;accent-color:#ef493b}.lv-map-actions{display:flex;gap:8px;flex-wrap:wrap;padding-top:5px}.lv-map-actions button,.lv-map-actions a{min-height:40px;display:inline-flex;align-items:center;justify-content:center;padding:0 13px;border:1px solid rgba(255,255,255,.13);border-radius:8px;background:#262626;color:#fff;font-size:10px;font-weight:800;text-decoration:none;cursor:pointer}.lv-map-actions .primary{background:#d61f26;border-color:#ef493b}.lv-map-actions button:disabled{opacity:.55;cursor:not-allowed}.lv-map-status{min-height:20px;color:#91c9a4;font-size:10px}.lv-map-status.error{color:#ff958d}.lv-map-privacy{padding:12px;border-radius:9px;background:#111;color:#89939a;font-size:9px;line-height:1.6}.lv-map-privacy strong{color:#d7dde0}.lv-map-site{display:grid;gap:5px;padding:10px 12px;border:1px solid rgba(255,255,255,.08);border-radius:8px;color:#9da5aa;font-size:9px}.lv-map-site strong{color:#e8ecee;font-weight:700;overflow-wrap:anywhere}.lv-map-source{color:#91c9a4!important}.lv-map-source.fallback{color:#e7be83!important}
@media(max-width:600px){.lv-map-fab{right:14px;bottom:14px}.lv-map-drawer{padding:18px}}
`;

function projectIdFromPath(pathname: string) {
  const match = pathname.match(/^\/admin\/projects\/([^/]+)\/?$/i);
  if (!match?.[1] || match[1].toLowerCase() === "new") return "";
  try { return decodeURIComponent(match[1]); } catch { return match[1]; }
}

function sourceLabel(source: MapSettings["mapSource"]) {
  if (source === "location-tag") return "Location Tag — synchronized";
  if (source === "site-coordinates") return "Internal site coordinates — fallback";
  if (source === "legacy-public-coordinates") return "Legacy public coordinates — fallback";
  return "No valid map location";
}

export default function AdminProjectMapDrawer() {
  const pathname = usePathname();
  const projectId = useMemo(() => projectIdFromPath(pathname || ""), [pathname]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<MapSettings | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    if (!projectId) return;
    setLoading(true); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/project-public-map?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not load public map settings.");
      setSettings(json.data as MapSettings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load public map settings.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    setOpen(false); setSettings(null); setError(""); setMessage("");
  }, [projectId]);

  useEffect(() => {
    if (open && projectId && !settings && !loading) void load();
  }, [open, projectId]);

  async function save() {
    if (!settings || saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/project-public-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: settings.projectId,
          publicMapEnabled: settings.publicMapEnabled,
          publicMapPrecision: settings.publicMapPrecision,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not save public map settings.");
      setSettings(json.data as MapSettings);
      setMessage("Public map settings saved and synchronized with the project Location Tag.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save public map settings.");
    } finally { setSaving(false); }
  }

  if (!projectId) return null;

  return <>
    <style dangerouslySetInnerHTML={{ __html: css }} />
    <button type="button" className="lv-map-fab" onClick={() => setOpen(true)} aria-label={`Edit public map settings for ${projectId}`}><i /> Public Map</button>
    {open && <div className="lv-map-drawer-backdrop" role="dialog" aria-modal="true" aria-label="Public project map settings" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <aside className="lv-map-drawer">
        <div className="lv-map-drawer-head"><div><span>PUBLIC WEBSITE · {projectId}</span><h2>Project map settings</h2></div><button type="button" className="lv-map-close" onClick={() => setOpen(false)} aria-label="Close">×</button></div>
        <p className="lv-map-copy">The public map now follows the project <strong>Location Tag</strong>. There are no separate public latitude/longitude fields to maintain, so the website map cannot drift away from the project record.</p>
        {loading && <p className="lv-map-copy">Loading project map settings…</p>}
        {settings && <div className="lv-map-form">
          {!settings.publicDisplay && <div className="lv-map-warning">This project is currently hidden from the public website. Map publishing can be configured now, but it will not appear publicly until “Show on Public Website” is enabled in the project editor.</div>}
          {!settings.locationTag && <div className="lv-map-warning">This project has no Location Tag. Add one in the project editor before enabling the public map.</div>}
          <label className="lv-map-toggle"><input type="checkbox" checked={settings.publicMapEnabled} onChange={e => setSettings({ ...settings, publicMapEnabled: e.target.checked })}/><span><strong>Show this project on the public map</strong><br/>The marker is generated from the project Location Tag whenever public project data is loaded.</span></label>
          <label className="lv-map-field"><span>Location precision</span><select value={settings.publicMapPrecision} onChange={e => setSettings({ ...settings, publicMapPrecision: e.target.value === "exact" ? "exact" : "approximate" })}><option value="approximate">Approximate — rounds the Location Tag for privacy</option><option value="exact">Exact — uses the precise Location Tag pin</option></select></label>
          <div className="lv-map-site"><span>Project address</span><strong>{settings.location || "Not set"}</strong></div>
          <div className="lv-map-site"><span>Location Tag</span><strong>{settings.locationTag || "Not set"}</strong></div>
          <div className="lv-map-site"><span>Resolved map position</span><strong>{settings.publicMapLatitude !== "" && settings.publicMapLongitude !== "" ? `${settings.publicMapLatitude}, ${settings.publicMapLongitude}` : "Not available"}</strong><strong className={`lv-map-source ${settings.mapSource && settings.mapSource !== "location-tag" ? "fallback" : ""}`}>{sourceLabel(settings.mapSource)}</strong></div>
          <div className="lv-map-actions"><button type="button" className="primary" disabled={saving} onClick={save}>{saving ? "Saving…" : "Save map settings"}</button><Link href="/projects/map" target="_blank">Open public map ↗</Link></div>
          <div className={`lv-map-status ${error ? "error" : ""}`}>{error || message}</div>
          <div className="lv-map-privacy"><strong>How it works:</strong> Location Tag is the first source. Internal site coordinates are used only as a fallback if a tag is missing or temporarily cannot be resolved. Approximate mode still rounds the final coordinates before they reach the public browser.</div>
        </div>}
        {!loading && !settings && error && <><div className="lv-map-warning">{error}</div><div className="lv-map-actions"><button type="button" onClick={load}>Try again</button></div></>}
      </aside>
    </div>}
  </>;
}
