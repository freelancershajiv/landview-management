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
  publicMapPrecision: "exact";
  publicMapLatitude: number | string;
  publicMapLongitude: number | string;
  mapSource: "location-tag" | "site-coordinates" | "";
  siteLatitude: number | string;
  siteLongitude: number | string;
};

const css = `
.lv-map-fab{position:fixed;right:22px;bottom:22px;z-index:90;display:flex;align-items:center;gap:8px;min-height:44px;padding:0 15px;border:1px solid rgba(239,73,59,.65);border-radius:999px;background:#171717;color:#fff;font-size:11px;font-weight:900;letter-spacing:.04em;box-shadow:0 12px 30px rgba(0,0,0,.34);cursor:pointer}.lv-map-fab i{width:9px;height:9px;border-radius:50%;background:#ef493b;box-shadow:0 0 0 4px rgba(239,73,59,.13)}
.lv-map-drawer-backdrop{position:fixed;inset:0;z-index:120;background:rgba(0,0,0,.58);backdrop-filter:blur(4px)}.lv-map-drawer{position:absolute;right:0;top:0;bottom:0;width:min(460px,100%);overflow:auto;background:#171717;border-left:1px solid rgba(255,255,255,.1);box-shadow:-24px 0 60px rgba(0,0,0,.36);padding:22px}.lv-map-drawer-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding-bottom:18px;border-bottom:1px solid rgba(255,255,255,.08)}.lv-map-drawer-head span{color:#ef6f65;font-size:9px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}.lv-map-drawer-head h2{margin:5px 0 0;color:#fff;font-size:22px}.lv-map-close{width:38px;height:38px;border:1px solid rgba(255,255,255,.12);border-radius:9px;background:#222;color:#fff;font-size:18px;cursor:pointer}.lv-map-copy{margin:15px 0;color:#9ca4aa;font-size:10px;line-height:1.65}.lv-map-warning{margin:14px 0;padding:11px 12px;border:1px solid rgba(239,73,59,.28);border-radius:9px;background:rgba(239,73,59,.06);color:#e9b0ab;font-size:10px;line-height:1.55}.lv-map-form{display:grid;gap:13px}.lv-map-auto{display:flex;align-items:flex-start;gap:10px;padding:12px;border:1px solid rgba(145,201,164,.25);border-radius:9px;background:rgba(145,201,164,.06);color:#dce9df;font-size:10px;line-height:1.5}.lv-map-auto i{width:9px;height:9px;margin-top:3px;border-radius:50%;background:#91c9a4;box-shadow:0 0 0 4px rgba(145,201,164,.1)}.lv-map-actions{display:flex;gap:8px;flex-wrap:wrap;padding-top:5px}.lv-map-actions a{min-height:40px;display:inline-flex;align-items:center;justify-content:center;padding:0 13px;border:1px solid rgba(255,255,255,.13);border-radius:8px;background:#262626;color:#fff;font-size:10px;font-weight:800;text-decoration:none;cursor:pointer}.lv-map-privacy{padding:12px;border-radius:9px;background:#111;color:#89939a;font-size:9px;line-height:1.6}.lv-map-privacy strong{color:#d7dde0}.lv-map-site{display:grid;gap:5px;padding:10px 12px;border:1px solid rgba(255,255,255,.08);border-radius:8px;color:#9da5aa;font-size:9px}.lv-map-site strong{color:#e8ecee;font-weight:700;overflow-wrap:anywhere}.lv-map-source{color:#91c9a4!important}.lv-map-source.fallback{color:#e7be83!important}
@media(max-width:600px){.lv-map-fab{right:14px;bottom:14px}.lv-map-drawer{padding:18px}}
`;

function projectIdFromPath(pathname: string) {
  const match = pathname.match(/^\/admin\/projects\/([^/]+)\/?$/i);
  if (!match?.[1] || match[1].toLowerCase() === "new") return "";
  try { return decodeURIComponent(match[1]); } catch { return match[1]; }
}

function sourceLabel(source: MapSettings["mapSource"]) {
  if (source === "location-tag") return "Location Tag — synchronized";
  if (source === "site-coordinates") return "Internal coordinates — temporary fallback";
  return "No valid map location";
}

export default function AdminProjectMapDrawer() {
  const pathname = usePathname();
  const projectId = useMemo(() => projectIdFromPath(pathname || ""), [pathname]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState<MapSettings | null>(null);
  const [error, setError] = useState("");

  async function load() {
    if (!projectId) return;
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/project-public-map?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not load public map status.");
      setSettings(json.data as MapSettings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load public map status.");
    } finally { setLoading(false); }
  }

  useEffect(() => {
    setOpen(false); setSettings(null); setError("");
  }, [projectId]);

  useEffect(() => {
    if (open && projectId && !settings && !loading) void load();
  }, [open, projectId]);

  if (!projectId) return null;

  return <>
    <style dangerouslySetInnerHTML={{ __html: css }} />
    <button type="button" className="lv-map-fab" onClick={() => setOpen(true)} aria-label={`View public map status for ${projectId}`}><i /> Public Map</button>
    {open && <div className="lv-map-drawer-backdrop" role="dialog" aria-modal="true" aria-label="Public project map status" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <aside className="lv-map-drawer">
        <div className="lv-map-drawer-head"><div><span>PUBLIC WEBSITE · {projectId}</span><h2>Project map status</h2></div><button type="button" className="lv-map-close" onClick={() => setOpen(false)} aria-label="Close">×</button></div>
        <p className="lv-map-copy">Public map publishing is automatic. A project with a valid <strong>Location Tag</strong> appears on the map; a project without one stays off the map.</p>
        {loading && <p className="lv-map-copy">Loading project map status…</p>}
        {settings && <div className="lv-map-form">
          {!settings.locationTag && <div className="lv-map-warning">This project has no Location Tag, so it is not shown on the public map. Add a Google Maps Location Tag in the project editor.</div>}
          {settings.locationTag && <div className="lv-map-auto"><i/><span><strong>Automatically published on the map</strong><br/>No separate map switch is required.</span></div>}
          <div className="lv-map-site"><span>Project address</span><strong>{settings.location || "Not set"}</strong></div>
          <div className="lv-map-site"><span>Location Tag</span><strong>{settings.locationTag || "Not set"}</strong></div>
          <div className="lv-map-site"><span>Resolved exact map position</span><strong>{settings.publicMapLatitude !== "" && settings.publicMapLongitude !== "" ? `${settings.publicMapLatitude}, ${settings.publicMapLongitude}` : "Not available"}</strong><strong className={`lv-map-source ${settings.mapSource === "site-coordinates" ? "fallback" : ""}`}>{sourceLabel(settings.mapSource)}</strong></div>
          <div className="lv-map-actions"><Link href="/projects/map" target="_blank">Open public map ↗</Link></div>
          <div className="lv-map-privacy"><strong>Automatic rule:</strong> every project is visible on the public website. Only projects that have a Location Tag are eligible for the map. Short Google Maps links are converted to coordinate-based tags when edited or created.</div>
        </div>}
        {!loading && !settings && error && <div className="lv-map-warning">{error}</div>}
      </aside>
    </div>}
  </>;
}
