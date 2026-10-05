"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import PublicHeader from "@/components/public-header";
import type { PublicProjectSeo } from "@/lib/public-projects-server";

declare global {
  interface Window { maplibregl?: any; }
}

const FENI_CENTER: [number, number] = [91.3976, 23.0159];
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

const css = `
.project-map-page{min-height:100vh;background:#080d12;color:#f4f6f7}.project-map-wrap{width:min(100% - 36px,1320px);margin:auto}.project-map-hero{padding:54px 0 28px;background:radial-gradient(circle at 80% 10%,rgba(214,31,38,.12),transparent 34%),linear-gradient(180deg,#0d151d,#080d12);border-bottom:1px solid rgba(255,255,255,.08)}.project-map-kicker{color:#ef6c66;font-size:10px;font-weight:900;letter-spacing:.16em}.project-map-hero-grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(280px,.75fr);gap:40px;align-items:end}.project-map-hero h1{max-width:820px;margin:12px 0 12px;font-family:Georgia,"Times New Roman",serif;font-size:clamp(42px,6vw,72px);font-weight:400;line-height:.95;letter-spacing:-.045em}.project-map-hero p{max-width:700px;margin:0;color:#9da8b1;font-size:12px;line-height:1.75}.project-map-stats{display:grid;grid-template-columns:repeat(2,1fr);border:1px solid rgba(255,255,255,.1);border-radius:14px;overflow:hidden;background:rgba(255,255,255,.025)}.project-map-stat{padding:16px}.project-map-stat:nth-child(odd){border-right:1px solid rgba(255,255,255,.08)}.project-map-stat strong{display:block;font-size:25px}.project-map-stat span{display:block;margin-top:4px;color:#77838d;font-size:8px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.project-map-toolbar{padding:16px 0;border-bottom:1px solid rgba(255,255,255,.08);background:rgba(8,13,18,.95);position:sticky;top:0;z-index:20;backdrop-filter:blur(14px)}.project-map-controls{display:grid;grid-template-columns:minmax(220px,1fr) auto auto auto;gap:9px;align-items:center}.project-map-search,.project-map-select{height:42px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:#111922;color:#f5f5f5;outline:none;font-size:11px}.project-map-search{padding:0 13px}.project-map-select{padding:0 32px 0 11px}.project-map-search:focus,.project-map-select:focus{border-color:#d61f26;box-shadow:0 0 0 3px rgba(214,31,38,.1)}.project-map-link{height:42px;display:inline-flex;align-items:center;justify-content:center;padding:0 14px;border:1px solid rgba(214,31,38,.55);border-radius:8px;color:#fff;font-size:10px;font-weight:900;text-decoration:none;white-space:nowrap}.project-map-link:hover{background:#d61f26}.project-map-main{padding:24px 0 62px}.project-map-shell{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(310px,.6fr);height:clamp(590px,72vh,790px);min-height:590px;border:1px solid rgba(255,255,255,.1);border-radius:18px;overflow:hidden;background:#0e151c}.project-map-canvas-wrap{position:relative;min-width:0;background:#101821}.project-map-canvas{position:absolute;inset:0}.project-map-loading{position:absolute;left:16px;top:16px;z-index:3;padding:9px 11px;border:1px solid rgba(255,255,255,.13);border-radius:8px;background:rgba(8,13,18,.88);color:#bec6cc;font-size:9px}.project-map-side{min-width:0;display:flex;flex-direction:column;border-left:1px solid rgba(255,255,255,.09);background:#0c1218}.project-map-side-head{padding:16px;border-bottom:1px solid rgba(255,255,255,.08)}.project-map-side-head strong{display:block;font-size:13px}.project-map-side-head span{display:block;margin-top:4px;color:#78848d;font-size:9px}.project-map-list{flex:1;overflow:auto;padding:10px;scrollbar-width:thin}.project-map-card{width:100%;display:grid;grid-template-columns:72px minmax(0,1fr);gap:11px;padding:10px;border:1px solid transparent;border-radius:10px;background:transparent;color:inherit;text-align:left;cursor:pointer}.project-map-card:hover,.project-map-card.active{border-color:rgba(214,31,38,.42);background:rgba(214,31,38,.055)}.project-map-thumb{width:72px;height:72px;border-radius:8px;object-fit:cover;background:linear-gradient(145deg,#1b2731,#0c1217)}.project-map-thumb-fallback{display:grid;place-items:center;width:72px;height:72px;border-radius:8px;background:linear-gradient(145deg,#1b2731,#0c1217);color:rgba(255,255,255,.18);font-weight:900}.project-map-card-id{color:#ef6c66;font-size:8px;font-weight:900;letter-spacing:.09em}.project-map-card h3{margin:4px 0 5px;font-size:12px;line-height:1.25}.project-map-card p{margin:0;color:#89949c;font-size:9px;line-height:1.45}.project-map-card-meta{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px}.project-map-card-meta span{padding:4px 6px;border-radius:5px;background:#17212a;color:#9ba6ae;font-size:7px;font-weight:800}.project-map-empty{padding:28px 18px;text-align:center;color:#78848d;font-size:10px;line-height:1.65}.project-map-detail{position:absolute;left:16px;bottom:16px;z-index:4;width:min(390px,calc(100% - 32px));padding:16px;border:1px solid rgba(255,255,255,.14);border-radius:13px;background:rgba(8,13,18,.93);backdrop-filter:blur(13px);box-shadow:0 18px 50px rgba(0,0,0,.3)}.project-map-detail-top{display:flex;justify-content:space-between;gap:12px}.project-map-detail small{color:#ef6c66;font-size:8px;font-weight:900;letter-spacing:.11em}.project-map-detail h2{margin:5px 0 6px;font-size:20px;line-height:1.05}.project-map-detail p{margin:0;color:#98a2a9;font-size:9px;line-height:1.55}.project-map-detail-close{width:30px;height:30px;border:1px solid rgba(255,255,255,.12);border-radius:7px;background:#151d24;color:#fff;cursor:pointer}.project-map-detail-meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:11px}.project-map-detail-meta span{padding:5px 7px;border:1px solid rgba(255,255,255,.09);border-radius:6px;color:#b0b9bf;font-size:8px}.project-map-detail-actions{display:flex;gap:7px;margin-top:12px}.project-map-detail-actions a{min-height:35px;display:inline-flex;align-items:center;justify-content:center;padding:0 11px;border-radius:7px;border:1px solid rgba(255,255,255,.12);color:#fff;font-size:9px;font-weight:900;text-decoration:none}.project-map-detail-actions a:first-child{border-color:#d61f26;background:#d61f26}.maplibregl-ctrl-group{background:#101820!important;border:1px solid rgba(255,255,255,.12)!important}.maplibregl-ctrl-group button{filter:invert(1)}.maplibregl-ctrl-attrib{background:rgba(8,13,18,.76)!important;color:#b9c0c4!important}.maplibregl-ctrl-attrib a{color:#e1e5e8!important}
@media(max-width:900px){.project-map-hero-grid{grid-template-columns:1fr}.project-map-stats{max-width:500px}.project-map-controls{grid-template-columns:1fr 1fr}.project-map-search{grid-column:1/-1}.project-map-shell{grid-template-columns:1fr;height:auto;min-height:0}.project-map-canvas-wrap{height:520px}.project-map-side{border-left:0;border-top:1px solid rgba(255,255,255,.09);max-height:420px}.project-map-list{max-height:340px}}@media(max-width:560px){.project-map-wrap{width:min(100% - 24px,1320px)}.project-map-hero{padding-top:38px}.project-map-controls{grid-template-columns:1fr}.project-map-search{grid-column:auto}.project-map-canvas-wrap{height:470px}.project-map-detail{left:10px;bottom:10px;width:calc(100% - 20px)}.project-map-card{grid-template-columns:62px 1fr}.project-map-thumb,.project-map-thumb-fallback{width:62px;height:62px}}
`;

function validMapProject(project: PublicProjectSeo) {
  return project.mapEnabled === true && Number.isFinite(Number(project.mapLatitude)) && Number.isFinite(Number(project.mapLongitude));
}

function searchText(project: PublicProjectSeo) {
  return [project.projectId, project.title, project.category, project.location, project.currentStage, project.area, project.stories, project.description, ...(project.services || [])].filter(Boolean).join(" ").toLowerCase();
}

function imageUrl(url?: string) {
  const value = String(url || "").trim();
  if (!value) return "";
  const fileMatch = value.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  if (fileMatch?.[1]) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileMatch[1])}&sz=w500`;
  try {
    const parsed = new URL(value);
    if (parsed.hostname === "drive.google.com") {
      const id = parsed.searchParams.get("id");
      if (id) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w500`;
    }
  } catch {}
  return value;
}

export default function PublicProjectMap({ initialProjects }: { initialProjects: PublicProjectSeo[] }) {
  const mappedProjects = useMemo(() => initialProjects.filter(validMapProject), [initialProjects]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [stage, setStage] = useState("All");
  const [selectedId, setSelectedId] = useState("");
  const [scriptReady, setScriptReady] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);

  const categories = useMemo(() => ["All", ...Array.from(new Set(mappedProjects.map(p => String(p.category || "").trim()).filter(Boolean))).sort()], [mappedProjects]);
  const stages = useMemo(() => ["All", ...Array.from(new Set(mappedProjects.map(p => String(p.currentStage || "").trim()).filter(Boolean))).sort()], [mappedProjects]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return mappedProjects.filter(project => {
      if (category !== "All" && String(project.category || "") !== category) return false;
      if (stage !== "All" && String(project.currentStage || "") !== stage) return false;
      return !term || searchText(project).includes(term);
    });
  }, [mappedProjects, query, category, stage]);
  const selected = useMemo(() => filtered.find(project => project.projectId === selectedId) || mappedProjects.find(project => project.projectId === selectedId) || null, [filtered, mappedProjects, selectedId]);
  const completedCount = mappedProjects.filter(p => p.currentStage === "Completed").length;
  const exactCount = mappedProjects.filter(p => p.mapPrecision === "exact").length;

  function geoJson(rows: PublicProjectSeo[]) {
    return {
      type: "FeatureCollection",
      features: rows.map(project => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [Number(project.mapLongitude), Number(project.mapLatitude)] },
        properties: { projectId: String(project.projectId || ""), title: String(project.title || ""), category: String(project.category || ""), stage: String(project.currentStage || "") },
      })),
    };
  }

  useEffect(() => {
    if (!scriptReady || !mapNode.current || mapRef.current || !window.maplibregl) return;
    const maplibregl = window.maplibregl;
    const map = new maplibregl.Map({ container: mapNode.current, style: MAP_STYLE, center: FENI_CENTER, zoom: 8.6, attributionControl: true });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.addSource("landview-projects", { type: "geojson", data: geoJson(filtered), cluster: true, clusterMaxZoom: 13, clusterRadius: 48 });
      map.addLayer({ id: "lv-clusters", type: "circle", source: "landview-projects", filter: ["has", "point_count"], paint: { "circle-color": "#151d24", "circle-radius": ["step", ["get", "point_count"], 20, 8, 25, 20, 31], "circle-stroke-color": "#ef493b", "circle-stroke-width": 3 } });
      map.addLayer({ id: "lv-cluster-count", type: "symbol", source: "landview-projects", filter: ["has", "point_count"], layout: { "text-field": ["get", "point_count_abbreviated"], "text-size": 11 }, paint: { "text-color": "#ffffff" } });
      map.addLayer({ id: "lv-project-points", type: "circle", source: "landview-projects", filter: ["!", ["has", "point_count"]], paint: { "circle-color": "#d61f26", "circle-radius": 8, "circle-stroke-color": "#ffffff", "circle-stroke-width": 2 } });
      map.on("click", "lv-project-points", (event: any) => {
        const feature = event.features?.[0]; const id = String(feature?.properties?.projectId || "");
        if (id) setSelectedId(id);
      });
      map.on("click", "lv-clusters", async (event: any) => {
        const features = map.queryRenderedFeatures(event.point, { layers: ["lv-clusters"] });
        const clusterId = features[0]?.properties?.cluster_id;
        const source = map.getSource("landview-projects");
        if (clusterId === undefined || !source?.getClusterExpansionZoom) return;
        try { const zoom = await source.getClusterExpansionZoom(clusterId); map.easeTo({ center: features[0].geometry.coordinates, zoom }); } catch {}
      });
      for (const layer of ["lv-project-points", "lv-clusters"]) {
        map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
      }
      setMapReady(true);
    });
    return () => { setMapReady(false); map.remove(); mapRef.current = null; };
  }, [scriptReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) return;
    const source = map.getSource("landview-projects");
    if (source?.setData) source.setData(geoJson(filtered));
    if (!filtered.length) return;
    if (filtered.length === 1) {
      map.easeTo({ center: [Number(filtered[0].mapLongitude), Number(filtered[0].mapLatitude)], zoom: 13, duration: 700 });
      return;
    }
    const bounds = new window.maplibregl.LngLatBounds();
    filtered.forEach(project => bounds.extend([Number(project.mapLongitude), Number(project.mapLatitude)]));
    map.fitBounds(bounds, { padding: 70, maxZoom: 13, duration: 700 });
  }, [filtered, mapReady]);

  useEffect(() => {
    if (!selected || !mapRef.current || !mapReady) return;
    mapRef.current.flyTo({ center: [Number(selected.mapLongitude), Number(selected.mapLatitude)], zoom: Math.max(mapRef.current.getZoom(), 13.4), duration: 650, essential: true });
  }, [selectedId, mapReady]);

  return <main className="project-map-page public-site">
    <style dangerouslySetInnerHTML={{ __html: css }} />
    <link rel="stylesheet" href="https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.css" />
    <Script src="https://unpkg.com/maplibre-gl@6.11.2/dist/maplibre-gl.js" strategy="afterInteractive" onLoad={() => setScriptReady(true)} />
    <PublicHeader />
    <section className="project-map-hero"><div className="project-map-wrap project-map-hero-grid"><div><span className="project-map-kicker">LAND VIEW · PROJECT NETWORK</span><h1>Explore our work across the map.</h1><p>Browse selected LAND VIEW architectural and engineering projects by location. Private residential projects may use an intentionally approximate pin to protect client privacy.</p></div><div className="project-map-stats"><div className="project-map-stat"><strong>{mappedProjects.length}</strong><span>Mapped projects</span></div><div className="project-map-stat"><strong>{completedCount}</strong><span>Completed</span></div><div className="project-map-stat"><strong>{Math.max(0, mappedProjects.length - completedCount)}</strong><span>Active / design</span></div><div className="project-map-stat"><strong>{exactCount}</strong><span>Exact public pins</span></div></div></div></section>
    <section className="project-map-toolbar"><div className="project-map-wrap project-map-controls"><input className="project-map-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search project, File ID, location or service…" aria-label="Search mapped projects"/><select className="project-map-select" value={category} onChange={e => setCategory(e.target.value)} aria-label="Filter by category">{categories.map(item => <option key={item}>{item}</option>)}</select><select className="project-map-select" value={stage} onChange={e => setStage(e.target.value)} aria-label="Filter by stage">{stages.map(item => <option key={item}>{item}</option>)}</select><Link className="project-map-link" href="/projects">Portfolio view</Link></div></section>
    <section className="project-map-main"><div className="project-map-wrap"><div className="project-map-shell"><div className="project-map-canvas-wrap"><div ref={mapNode} className="project-map-canvas" aria-label="Interactive LAND VIEW project map"/>{!mapReady && <div className="project-map-loading">Loading interactive map…</div>}{selected && <article className="project-map-detail"><div className="project-map-detail-top"><div><small>{selected.projectId} · {selected.mapPrecision === "approximate" ? "APPROXIMATE LOCATION" : "PROJECT LOCATION"}</small><h2>{selected.title || selected.projectId}</h2><p>{selected.location || "Bangladesh"}</p></div><button type="button" className="project-map-detail-close" onClick={() => setSelectedId("")} aria-label="Close project details">×</button></div><div className="project-map-detail-meta">{selected.category && <span>{selected.category}</span>}{selected.currentStage && <span>{selected.currentStage}</span>}{selected.stories && <span>{selected.stories} stories</span>}{selected.area && <span>{selected.area}</span>}</div><div className="project-map-detail-actions"><Link href={`/projects/${encodeURIComponent(String(selected.projectId || ""))}`}>View project →</Link><button type="button" className="project-map-detail-close" style={{width:"auto",padding:"0 10px",fontSize:9}} onClick={() => setSelectedId("")}>Back to map</button></div></article>}</div><aside className="project-map-side"><div className="project-map-side-head"><strong>{filtered.length} project{filtered.length === 1 ? "" : "s"} in view</strong><span>Tap a project to focus its location.</span></div><div className="project-map-list">{filtered.length ? filtered.map(project => { const image = imageUrl(project.coverImageUrl); const active = selectedId === project.projectId; return <button type="button" key={project.projectId} className={`project-map-card ${active ? "active" : ""}`} onClick={() => setSelectedId(String(project.projectId || ""))}>{image ? <img className="project-map-thumb" src={image} alt=""/> : <span className="project-map-thumb-fallback">LV</span>}<span><span className="project-map-card-id">{project.projectId}{project.mapPrecision === "approximate" ? " · APPROX." : ""}</span><h3>{project.title || project.projectId}</h3><p>{project.location || "Location published on map"}</p><span className="project-map-card-meta">{project.category && <span>{project.category}</span>}{project.currentStage && <span>{project.currentStage}</span>}</span></span></button>; }) : <div className="project-map-empty">{mappedProjects.length ? "No mapped projects match these filters." : <>No projects have been approved for public map display yet.<br/><br/>Projects remain in the normal portfolio until an Admin or Manager explicitly publishes a map location.</>}</div>}</div></aside></div></div></section>
  </main>;
}
