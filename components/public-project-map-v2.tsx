"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import PublicHeader from "@/components/public-header";
import { officeLocations, type OfficeLocation } from "@/lib/office-locations";
import type { PublicProjectSeo } from "@/lib/public-projects-server";

declare global {
  interface Window { L?: any; }
}

type MapMode = "map" | "satellite";

const DEFAULT_CENTER: [number, number] = [23.0159, 91.3976];
const STREET_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const SATELLITE_TILE_URLS = [
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
];

function text(value: unknown) {
  return String(value ?? "").trim();
}

function unique(values: unknown[]) {
  return Array.from(new Set(values.map(text).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function validMapProject(project: PublicProjectSeo) {
  return project.mapEnabled === true && Number.isFinite(Number(project.mapLatitude)) && Number.isFinite(Number(project.mapLongitude));
}

function imageUrl(url?: string) {
  const value = text(url);
  if (!value) return "";
  const match = value.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  if (match?.[1]) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(match[1])}&sz=w1200`;
  try {
    const parsed = new URL(value);
    if (parsed.hostname === "drive.google.com") {
      const id = parsed.searchParams.get("id");
      if (id) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1200`;
    }
  } catch {}
  return value;
}

function projectImage(project: PublicProjectSeo) {
  return imageUrl(project.coverImageUrl) || imageUrl(project.galleryImages?.[0]);
}

function locationLine(project: PublicProjectSeo) {
  const structured = [
    project.villageArea,
    project.wardNo ? `Ward ${project.wardNo}` : "",
    project.localBodyName,
    project.upazilaThana,
    project.district,
    project.division,
  ].map(text).filter(Boolean);
  return structured.length ? structured.join(" · ") : text(project.location) || "Location not specified";
}

function searchText(project: PublicProjectSeo) {
  return [
    project.projectId,
    project.title,
    project.category,
    project.location,
    project.division,
    project.district,
    project.upazilaThana,
    project.localBodyType,
    project.localBodyName,
    project.wardNo,
    project.villageArea,
    project.roadHolding,
    project.currentStage,
    project.area,
    project.stories,
    project.description,
    ...(project.services || []),
  ].map(text).filter(Boolean).join(" ").toLowerCase();
}

function officeIcon(L: any) {
  return L.divIcon({
    className: "lv-office-marker-wrap",
    iconSize: [42, 50],
    iconAnchor: [21, 48],
    tooltipAnchor: [0, -42],
    html: `<span class="lv-office-pin" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path fill="currentColor" d="M7 21V3h10v18h4v-9h-4v9h-3v-4h-4v4H7Zm3-14h4V5h-4v2Zm0 4h4V9h-4v2Zm0 4h4v-2h-4v2ZM3 21h4V9H3v12Zm2-8h2v-2H5v2Zm0 4h2v-2H5v2Zm12 4h4v-7h-4v7Zm0-4h2v-2h-2v2Z"/></svg></span>`,
  });
}

function createBaseLayer(L: any, mode: MapMode, satelliteIndex = 0) {
  if (mode === "satellite") {
    return L.tileLayer(SATELLITE_TILE_URLS[Math.min(satelliteIndex, SATELLITE_TILE_URLS.length - 1)], {
      maxZoom: 19,
      attribution: "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    });
  }
  return L.tileLayer(STREET_TILE_URL, { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" });
}

function officePhone(value: string) {
  return value.replace(/\s+/g, "");
}

function whatsappUrl(project: PublicProjectSeo) {
  const message = `Hello LAND VIEW, I want to discuss ${text(project.projectId) || "this project"}${project.title ? ` — ${project.title}` : ""} and a similar project.`;
  return `https://wa.me/8801902500400?text=${encodeURIComponent(message)}`;
}

export default function PublicProjectMapV2({ initialProjects }: { initialProjects: PublicProjectSeo[] }) {
  const [projects, setProjects] = useState<PublicProjectSeo[]>(initialProjects);
  const mappedProjects = useMemo(() => projects.filter(validMapProject), [projects]);
  const [query, setQuery] = useState("");
  const [division, setDivision] = useState("All");
  const [district, setDistrict] = useState("All");
  const [upazila, setUpazila] = useState("All");
  const [localBody, setLocalBody] = useState("All");
  const [ward, setWard] = useState("All");
  const [category, setCategory] = useState("All");
  const [stage, setStage] = useState("All");
  const [service, setService] = useState("All");
  const [selectedId, setSelectedId] = useState("");
  const [selectedOfficeId, setSelectedOfficeId] = useState("");
  const [mapMode, setMapMode] = useState<MapMode>("map");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [scriptReady, setScriptReady] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState("");

  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const officeLayerRef = useRef<any>(null);
  const tileLayerRef = useRef<any>(null);
  const tileModeRef = useRef<MapMode>("map");
  const markerRef = useRef<Record<string, any>>({});
  const officeMarkerRef = useRef<Record<string, any>>({});

  const divisions = useMemo(() => ["All", ...unique(mappedProjects.map((p) => p.division))], [mappedProjects]);
  const districtPool = useMemo(() => mappedProjects.filter((p) => division === "All" || text(p.division) === division), [mappedProjects, division]);
  const districts = useMemo(() => ["All", ...unique(districtPool.map((p) => p.district))], [districtPool]);
  const upazilaPool = useMemo(() => districtPool.filter((p) => district === "All" || text(p.district) === district), [districtPool, district]);
  const upazilas = useMemo(() => ["All", ...unique(upazilaPool.map((p) => p.upazilaThana))], [upazilaPool]);
  const localPool = useMemo(() => upazilaPool.filter((p) => upazila === "All" || text(p.upazilaThana) === upazila), [upazilaPool, upazila]);
  const localBodies = useMemo(() => ["All", ...unique(localPool.map((p) => p.localBodyName))], [localPool]);
  const wardPool = useMemo(() => localPool.filter((p) => localBody === "All" || text(p.localBodyName) === localBody), [localPool, localBody]);
  const wards = useMemo(() => ["All", ...unique(wardPool.map((p) => p.wardNo))], [wardPool]);
  const categories = useMemo(() => ["All", ...unique(mappedProjects.map((p) => p.category))], [mappedProjects]);
  const stages = useMemo(() => ["All", ...unique(mappedProjects.map((p) => p.currentStage))], [mappedProjects]);
  const services = useMemo(() => ["All", ...unique(mappedProjects.flatMap((p) => p.services || []))], [mappedProjects]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return mappedProjects.filter((project) =>
      (division === "All" || text(project.division) === division) &&
      (district === "All" || text(project.district) === district) &&
      (upazila === "All" || text(project.upazilaThana) === upazila) &&
      (localBody === "All" || text(project.localBodyName) === localBody) &&
      (ward === "All" || text(project.wardNo) === ward) &&
      (category === "All" || text(project.category) === category) &&
      (stage === "All" || text(project.currentStage) === stage) &&
      (service === "All" || (project.services || []).some((item) => text(item) === service)) &&
      (!term || searchText(project).includes(term))
    );
  }, [mappedProjects, query, division, district, upazila, localBody, ward, category, stage, service]);

  const selected = useMemo(() => mappedProjects.find((p) => text(p.projectId) === selectedId) || null, [mappedProjects, selectedId]);
  const selectedOffice = useMemo(() => officeLocations.find((office) => office.id === selectedOfficeId) || null, [selectedOfficeId]);
  const completedCount = mappedProjects.filter((p) => p.currentStage === "Completed").length;
  const districtCount = unique(mappedProjects.map((p) => p.district)).length;
  const activeFilterCount = [query, division, district, upazila, localBody, ward, category, stage, service].reduce((count, value, index) => count + (index === 0 ? (text(value) ? 1 : 0) : (value !== "All" ? 1 : 0)), 0);

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        const response = await fetch(`/api/public/projects?mapRefresh=${Date.now()}`, { cache: "no-store" });
        const json = await response.json();
        if (!cancelled && response.ok && json?.success && Array.isArray(json.data)) setProjects(json.data);
      } catch {}
    }
    void refresh();
    const onPageShow = () => void refresh();
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && window.L) setScriptReady(true);
  }, []);

  useEffect(() => {
    if (!scriptReady || !mapNode.current || mapRef.current || !window.L) return;
    try {
      const L = window.L;
      const map = L.map(mapNode.current, { zoomControl: true, preferCanvas: true }).setView(DEFAULT_CENTER, 8);
      mapRef.current = map;
      tileLayerRef.current = createBaseLayer(L, "map").addTo(map);
      tileModeRef.current = "map";
      layerRef.current = L.layerGroup().addTo(map);
      officeLayerRef.current = L.layerGroup().addTo(map);
      setMapReady(true);
      window.setTimeout(() => map.invalidateSize(), 80);
    } catch (error) {
      console.error(error);
      setMapError("Interactive map could not initialize on this browser.");
    }
    return () => {
      try { mapRef.current?.remove(); } catch {}
      mapRef.current = null;
      layerRef.current = null;
      officeLayerRef.current = null;
      tileLayerRef.current = null;
      markerRef.current = {};
      officeMarkerRef.current = {};
      setMapReady(false);
    };
  }, [scriptReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.L || tileModeRef.current === mapMode) return;
    const L = window.L;
    const map = mapRef.current;
    const previous = tileLayerRef.current;
    let cancelled = false;
    let pending: any = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };
    const activate = (layer: any, mode: MapMode) => {
      if (cancelled) return;
      clearTimer();
      try { if (previous && previous !== layer && map.hasLayer(previous)) map.removeLayer(previous); } catch {}
      tileLayerRef.current = layer;
      tileModeRef.current = mode;
      setMapError("");
    };

    if (mapMode === "map") {
      const layer = createBaseLayer(L, "map");
      pending = layer;
      layer.once("tileload", () => activate(layer, "map"));
      layer.addTo(map);
      timer = setTimeout(() => activate(layer, "map"), 1800);
    } else {
      let index = 0;
      const trySatellite = () => {
        if (cancelled) return;
        let errors = 0;
        let loaded = false;
        const layer = createBaseLayer(L, "satellite", index);
        pending = layer;
        const success = () => {
          if (cancelled || loaded) return;
          loaded = true;
          activate(layer, "satellite");
        };
        const fallback = () => {
          if (cancelled || loaded) return;
          clearTimer();
          try { if (map.hasLayer(layer)) map.removeLayer(layer); } catch {}
          index += 1;
          if (index < SATELLITE_TILE_URLS.length) { trySatellite(); return; }
          setMapError("Satellite imagery could not load on this network. Map view has been restored.");
          tileModeRef.current = "map";
          setMapMode("map");
        };
        layer.once("tileload", success);
        layer.on("tileerror", () => { errors += 1; if (errors >= 4) fallback(); });
        layer.addTo(map);
        timer = setTimeout(fallback, 6000);
      };
      trySatellite();
    }

    return () => {
      cancelled = true;
      clearTimer();
      try { if (pending && pending !== tileLayerRef.current && map.hasLayer(pending)) map.removeLayer(pending); } catch {}
    };
  }, [mapMode, mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !officeLayerRef.current || !window.L) return;
    const L = window.L;
    officeLayerRef.current.clearLayers();
    officeMarkerRef.current = {};
    officeLocations.forEach((office: OfficeLocation) => {
      const marker = L.marker([office.latitude, office.longitude], { icon: officeIcon(L), zIndexOffset: 1000 });
      marker.bindTooltip(`${office.shortName} · LAND VIEW Office`, { direction: "top", offset: [0, -7] });
      marker.on("click", () => { setSelectedId(""); setSelectedOfficeId(office.id); });
      marker.addTo(officeLayerRef.current);
      officeMarkerRef.current[office.id] = marker;
    });
  }, [mapReady]);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !layerRef.current || !window.L) return;
    const L = window.L;
    const map = mapRef.current;
    layerRef.current.clearLayers();
    markerRef.current = {};
    const bounds: any[] = [];

    filtered.forEach((project) => {
      const lat = Number(project.mapLatitude);
      const lng = Number(project.mapLongitude);
      const id = text(project.projectId);
      bounds.push([lat, lng]);
      const marker = L.circleMarker([lat, lng], { radius: 9, color: "#fff", weight: 2, fillColor: "#d61f26", fillOpacity: .96 });
      marker.bindTooltip(`${id} · ${text(project.title) || "LAND VIEW Project"}`, { direction: "top", offset: [0, -8] });
      marker.on("click", () => { setSelectedOfficeId(""); setSelectedId(id); });
      marker.addTo(layerRef.current);
      markerRef.current[id] = marker;
    });

    if (!selectedId && !selectedOfficeId) {
      if (bounds.length === 1) map.setView(bounds[0], 14, { animate: true });
      else if (bounds.length > 1) map.fitBounds(bounds, { padding: [45, 45], maxZoom: 13 });
      else if (officeLocations.length === 1) map.setView([officeLocations[0].latitude, officeLocations[0].longitude], 13, { animate: true });
      else if (officeLocations.length > 1) map.fitBounds(officeLocations.map((office) => [office.latitude, office.longitude]), { padding: [45, 45], maxZoom: 13 });
      else map.setView(DEFAULT_CENTER, 8);
    }
    window.setTimeout(() => map.invalidateSize(), 40);
  }, [filtered, mapReady]);

  useEffect(() => {
    Object.values(markerRef.current).forEach((marker: any) => {
      try { marker.setRadius?.(9); marker.setStyle?.({ weight: 2, color: "#fff" }); } catch {}
    });
    if (!selected || !mapReady || !mapRef.current) return;
    const lat = Number(selected.mapLatitude);
    const lng = Number(selected.mapLongitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const zoom = Math.max(Number(mapRef.current.getZoom?.() || 0), 15);
    mapRef.current.setView([lat, lng], zoom, { animate: true });
    const marker = markerRef.current[text(selected.projectId)];
    try { marker?.setRadius?.(13); marker?.setStyle?.({ weight: 3, color: "#fff" }); marker?.openTooltip?.(); } catch {}
  }, [selected, mapReady]);

  useEffect(() => {
    if (!selectedOffice || !mapReady || !mapRef.current) return;
    const zoom = Math.max(Number(mapRef.current.getZoom?.() || 0), 16);
    mapRef.current.setView([selectedOffice.latitude, selectedOffice.longitude], zoom, { animate: true });
    officeMarkerRef.current[selectedOffice.id]?.openTooltip?.();
  }, [selectedOffice, mapReady]);

  useEffect(() => {
    if (selectedId && !filtered.some((p) => text(p.projectId) === selectedId)) setSelectedId("");
  }, [filtered, selectedId]);

  function resetFilters() {
    setQuery(""); setDivision("All"); setDistrict("All"); setUpazila("All"); setLocalBody("All");
    setWard("All"); setCategory("All"); setStage("All"); setService("All"); setSelectedId(""); setSelectedOfficeId("");
  }
  function selectDivision(value: string) { setDivision(value); setDistrict("All"); setUpazila("All"); setLocalBody("All"); setWard("All"); setSelectedId(""); }
  function selectDistrict(value: string) { setDistrict(value); setUpazila("All"); setLocalBody("All"); setWard("All"); setSelectedId(""); }
  function selectUpazila(value: string) { setUpazila(value); setLocalBody("All"); setWard("All"); setSelectedId(""); }
  function selectLocal(value: string) { setLocalBody(value); setWard("All"); setSelectedId(""); }
  function selectOffice(id: string) { setSelectedId(""); setSelectedOfficeId(id); }
  function selectProject(id: string) { setSelectedOfficeId(""); setSelectedId(id); }

  const previewImage = selected ? projectImage(selected) : "";
  const previewServices = selected?.services?.filter(Boolean).slice(0, 3) || [];

  return (
    <main className="public-site project-map-page">
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <Script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" strategy="afterInteractive" onLoad={() => setScriptReady(true)} />
      <PublicHeader />

      <section className="project-map-hero">
        <div className="project-map-wrap project-map-hero-grid">
          <div>
            <span className="project-map-kicker">LAND VIEW PROJECT &amp; OFFICE DIRECTORY</span>
            <h1>Explore LAND VIEW projects by location.</h1>
            <p>Browse published architecture and engineering projects across Bangladesh. Select a marker or project card to see a photo-rich project preview, then open the full case-study page or contact LAND VIEW directly.</p>
          </div>
          <div className="project-map-stats" aria-label="Project map summary">
            <div className="project-map-stat"><strong>{mappedProjects.length}</strong><span>Mapped projects</span></div>
            <div className="project-map-stat"><strong>{districtCount}</strong><span>Districts</span></div>
            <div className="project-map-stat"><strong>{completedCount}</strong><span>Completed</span></div>
            <div className="project-map-stat"><strong>{filtered.length}</strong><span>Current results</span></div>
          </div>
        </div>
      </section>

      <section className="project-map-toolbar" aria-label="Map filters">
        <div className="project-map-wrap">
          <button className="project-map-filter-toggle" type="button" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen}>
            <span>{filtersOpen ? "Hide map filters" : "Filter projects"}</span><span className="project-map-filter-count">{activeFilterCount}</span>
          </button>
          <div className={`project-map-filter-panel ${filtersOpen ? "open" : ""}`}>
            <div className="project-map-controls">
              <input className="project-map-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search File ID, project, service or location…" aria-label="Search mapped projects" />
              <select className="project-map-select" value={division} onChange={(e) => selectDivision(e.target.value)} aria-label="Filter by division">{divisions.map((value) => <option key={value} value={value}>{value === "All" ? "All divisions" : value}</option>)}</select>
              <select className="project-map-select" value={district} onChange={(e) => selectDistrict(e.target.value)} disabled={districts.length <= 1} aria-label="Filter by district">{districts.map((value) => <option key={value} value={value}>{value === "All" ? "All districts / zila" : value}</option>)}</select>
              <select className="project-map-select" value={upazila} onChange={(e) => selectUpazila(e.target.value)} disabled={upazilas.length <= 1} aria-label="Filter by upazila or thana">{upazilas.map((value) => <option key={value} value={value}>{value === "All" ? "All upazila / thana" : value}</option>)}</select>
              <select className="project-map-select" value={localBody} onChange={(e) => selectLocal(e.target.value)} disabled={localBodies.length <= 1} aria-label="Filter by local authority">{localBodies.map((value) => <option key={value} value={value}>{value === "All" ? "All union / municipality" : value}</option>)}</select>
            </div>
            <div className="project-map-controls second">
              <select className="project-map-select" value={ward} onChange={(e) => { setWard(e.target.value); setSelectedId(""); }} disabled={wards.length <= 1} aria-label="Filter by ward">{wards.map((value) => <option key={value} value={value}>{value === "All" ? "All wards" : `Ward ${value}`}</option>)}</select>
              <select className="project-map-select" value={category} onChange={(e) => { setCategory(e.target.value); setSelectedId(""); }} aria-label="Filter by project type">{categories.map((value) => <option key={value} value={value}>{value === "All" ? "All project types" : value}</option>)}</select>
              <select className="project-map-select" value={stage} onChange={(e) => { setStage(e.target.value); setSelectedId(""); }} aria-label="Filter by project stage">{stages.map((value) => <option key={value} value={value}>{value === "All" ? "All stages" : value}</option>)}</select>
              <select className="project-map-select" value={service} onChange={(e) => { setService(e.target.value); setSelectedId(""); }} aria-label="Filter by LAND VIEW service">{services.map((value) => <option key={value} value={value}>{value === "All" ? "All services" : value}</option>)}</select>
              <button className="project-map-reset" type="button" onClick={resetFilters}>Reset filters</button>
            </div>
          </div>
        </div>
      </section>

      <section className="project-map-main">
        <div className="project-map-wrap">
          <div className="project-map-shell">
            <div className="project-map-canvas-wrap">
              <div ref={mapNode} className="project-map-canvas" />
              {!mapReady && !mapError && <div className="project-map-loading">Loading interactive map…</div>}
              {mapError && <div className="project-map-error">{mapError}</div>}

              {mapReady && <>
                <div className="project-map-style-switch" aria-label="Map style">
                  <button type="button" className={mapMode === "map" ? "active" : ""} aria-pressed={mapMode === "map"} onClick={() => { setMapError(""); setMapMode("map"); }}>Map</button>
                  <button type="button" className={mapMode === "satellite" ? "active" : ""} aria-pressed={mapMode === "satellite"} onClick={() => { setMapError(""); setMapMode("satellite"); }}>Satellite</button>
                </div>
                <div className="project-map-legend"><span><i className="project-map-legend-project" />Projects</span><span><i className="project-map-legend-office">⌂</i>LAND VIEW Offices</span></div>
              </>}

              {selected && <article className="project-map-preview" aria-label={`${text(selected.title) || text(selected.projectId)} project preview`}>
                <div className="project-map-preview-media">
                  {previewImage ? <img src={previewImage} alt={`${text(selected.title) || text(selected.projectId)} project`} /> : <div className="project-map-preview-fallback">LV</div>}
                  <div className="project-map-preview-shade" />
                  <button type="button" className="project-map-preview-close" onClick={() => setSelectedId("")} aria-label="Close project preview">×</button>
                  <div className="project-map-preview-badges">{selected.category && <span>{selected.category}</span>}{selected.currentStage && <span>{selected.currentStage}</span>}</div>
                </div>
                <div className="project-map-preview-body">
                  <span className="project-map-preview-id">{text(selected.projectId)}</span>
                  <h2>{text(selected.title) || "LAND VIEW Project"}</h2>
                  <p className="project-map-preview-location">⌖ {locationLine(selected)}</p>
                  {selected.description && <p className="project-map-preview-description">{selected.description}</p>}
                  <div className="project-map-preview-meta">{selected.stories && <span>{selected.stories} Stories</span>}{selected.area && <span>{selected.area}</span>}{selected.completionYear && <span>{selected.completionYear}</span>}</div>
                  {previewServices.length > 0 && <div className="project-map-preview-services">{previewServices.map((item) => <span key={item}>{item}</span>)}{(selected.services?.length || 0) > 3 && <span>+{(selected.services?.length || 0) - 3} more</span>}</div>}
                  <div className="project-map-preview-actions">
                    <Link className="primary" href={`/projects/${encodeURIComponent(text(selected.projectId))}`}>View Project</Link>
                    <a href={whatsappUrl(selected)} target="_blank" rel="noopener noreferrer">WhatsApp</a>
                    <a href={`https://www.google.com/maps?q=${Number(selected.mapLatitude)},${Number(selected.mapLongitude)}`} target="_blank" rel="noopener noreferrer">Directions</a>
                  </div>
                </div>
              </article>}

              {selectedOffice && <article className="project-map-preview project-map-office-preview" aria-label={`${selectedOffice.name} office details`}>
                <button type="button" className="project-map-preview-close" onClick={() => setSelectedOfficeId("")} aria-label="Close office preview">×</button>
                <span className="project-map-preview-id">LAND VIEW OFFICE · {selectedOffice.shortName.toUpperCase()}</span>
                <h2>{selectedOffice.name}</h2>
                <p className="project-map-preview-location">{selectedOffice.address}</p>
                <div className="project-map-preview-meta"><span>Engineering {selectedOffice.engineeringPhone}</span><span>Architecture {selectedOffice.architecturePhone}</span></div>
                <div className="project-map-preview-actions">
                  <a className="primary" href={selectedOffice.mapUrl} target="_blank" rel="noopener noreferrer">Get Directions</a>
                  <a href={`tel:${officePhone(selectedOffice.engineeringPhone)}`}>Call Office</a>
                  <a href="https://wa.me/8801902500400" target="_blank" rel="noopener noreferrer">WhatsApp</a>
                </div>
              </article>}
            </div>

            <aside className="project-map-side">
              <div className="project-map-side-head"><strong>{filtered.length} mapped project{filtered.length === 1 ? "" : "s"}</strong><span>Select any marker or project below to open its photo and project details directly on the map.</span></div>
              <div className="project-map-offices"><span className="project-map-offices-label">LAND VIEW Offices</span>{officeLocations.map((office) => <button type="button" key={office.id} className={`project-map-office-card ${selectedOfficeId === office.id ? "active" : ""}`} onClick={() => selectOffice(office.id)}><span className="project-map-office-card-icon">⌂</span><span><strong>{office.shortName}</strong><p>{office.address}</p></span></button>)}</div>
              <div className="project-map-list">
                {filtered.length ? filtered.map((project) => {
                  const id = text(project.projectId);
                  const thumb = projectImage(project);
                  return <button type="button" key={id} className={`project-map-card ${selectedId === id ? "active" : ""}`} onClick={() => selectProject(id)} aria-label={`Show ${text(project.title) || id} on map`}>
                    {thumb ? <img className="project-map-thumb" src={thumb} alt="" /> : <span className="project-map-thumb-fallback">LV</span>}
                    <span><span className="project-map-card-id">{id}</span><h3>{text(project.title) || "LAND VIEW Project"}</h3><p>{locationLine(project)}</p><span className="project-map-card-meta">{project.category && <span>{project.category}</span>}{project.currentStage && <span>{project.currentStage}</span>}{project.stories && <span>{project.stories} Stories</span>}</span></span>
                  </button>;
                }) : <div className="project-map-empty">No mapped projects match these filters. LAND VIEW office locations remain available above.</div>}
              </div>
            </aside>
          </div>
        </div>
      </section>
    </main>
  );
}
