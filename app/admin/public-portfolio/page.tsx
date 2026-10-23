"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type PortfolioProject = {
  projectId: string;
  projectName?: string;
  projectType?: string;
  public_display: boolean;
  public_display_order: number;
  website_featured: boolean;
  website_featured_order: number;
  public_project_title: string;
  project_category: string;
  public_description: string;
  public_services: string;
  cover_image_url: string;
  gallery_images: string;
  completion_year: string;
  project_area_text: string;
  number_of_stories_text: string;
  division: string;
  district: string;
  upazila_thana: string;
  local_body_type: string;
  local_body_name: string;
  ward_no: string;
  village_area: string;
  road_holding: string;
  location_tag: string;
  title?: string;
  category?: string;
  location?: string;
  currentStage?: string;
  area?: string;
  stories?: string;
  completionYear?: string;
  description?: string;
  coverImageUrl?: string;
  galleryImages?: string[];
  services?: string[];
  publicReadiness?: number;
  publicReady?: boolean;
  publicMissing?: string[];
};

type Filter = "all" | "published" | "hidden" | "ready" | "incomplete" | "missing-cover" | "missing-description";

const EMPTY_VALUES = new Set(["", "-", "—", "–", "0", "n/a", "na", "nil", "null", "undefined"]);
function clean(value: unknown) {
  const result = String(value ?? "").replace(/\s+/g, " ").trim();
  return EMPTY_VALUES.has(result.toLowerCase()) ? "" : result;
}
function splitList(value: unknown) {
  return String(value ?? "").split(/[\n,;]+/).map(clean).filter(Boolean);
}
function address(project: PortfolioProject) {
  const ward = clean(project.ward_no).replace(/^ward\s*/i, "");
  const localName = clean(project.local_body_name);
  const localType = clean(project.local_body_type).toLowerCase();
  let local = localName;
  if (localName && !/union|paurashava|pourashava|municipality|city corporation/i.test(localName)) {
    if (localType.includes("union")) local = `${localName} Union`;
    else if (localType.includes("city")) local = `${localName} City Corporation`;
    else if (localType.includes("paur") || localType.includes("pour") || localType.includes("municip")) local = `${localName} Paurashava`;
  }
  const parts = [clean(project.road_holding), clean(project.village_area), ward ? `Ward ${ward.padStart(2, "0")}` : "", local, clean(project.upazila_thana), clean(project.district), clean(project.division)].filter(Boolean);
  const seen = new Set<string>();
  return parts.filter((part) => { const key = part.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; }).join(" · ");
}
function liveReadiness(project: PortfolioProject) {
  const title = clean(project.public_project_title) || clean(project.projectName) || project.projectId;
  const category = clean(project.project_category) || clean(project.projectType);
  const location = address(project);
  const cover = clean(project.cover_image_url);
  const description = clean(project.public_description);
  const services = splitList(project.public_services);
  const checks = [
    { label: "Public title", ok: Boolean(clean(project.public_project_title)) },
    { label: "Project category", ok: Boolean(category) },
    { label: "Structured address", ok: Boolean(location) },
    { label: "Cover image", ok: Boolean(cover) },
    { label: "Public description", ok: Boolean(description && description.length >= 40) },
    { label: "Services", ok: Boolean(services.length) },
    { label: "Project ID", ok: Boolean(project.projectId) },
  ];
  const score = Math.round((checks.filter((item) => item.ok).length / checks.length) * 100);
  return { title, category, location, cover, description, services, score, ready: score >= 72 && Boolean(cover && location && title), missing: checks.filter((item) => !item.ok).map((item) => item.label) };
}
function scoreClass(score: number) { return score >= 72 ? "good" : score >= 50 ? "mid" : "low"; }

export default function PublicPortfolioPage() {
  const [projects, setProjects] = useState<PortfolioProject[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<PortfolioProject | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load(preferId = selectedId) {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/public-portfolio", { cache: "no-store", credentials: "same-origin" });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load public portfolio."));
      const rows = (Array.isArray(json.data) ? json.data : []) as PortfolioProject[];
      setProjects(rows);
      const nextId = rows.some((row) => row.projectId === preferId) ? preferId : String(rows[0]?.projectId || "");
      setSelectedId(nextId);
      setDraft(rows.find((row) => row.projectId === nextId) ? { ...rows.find((row) => row.projectId === nextId)! } : null);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load public portfolio."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(""); }, []);

  const stats = useMemo(() => ({
    total: projects.length,
    published: projects.filter((project) => project.public_display).length,
    hidden: projects.filter((project) => !project.public_display).length,
    ready: projects.filter((project) => project.publicReady).length,
    incomplete: projects.filter((project) => !project.publicReady).length,
  }), [projects]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((project) => {
      if (filter === "published" && !project.public_display) return false;
      if (filter === "hidden" && project.public_display) return false;
      if (filter === "ready" && !project.publicReady) return false;
      if (filter === "incomplete" && project.publicReady) return false;
      if (filter === "missing-cover" && !project.publicMissing?.includes("Cover image")) return false;
      if (filter === "missing-description" && !project.publicMissing?.includes("Public description")) return false;
      if (!q) return true;
      return [project.projectId, project.projectName, project.title, project.category, project.location, project.public_project_title]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [filter, projects, query]);

  function select(project: PortfolioProject) {
    setSelectedId(project.projectId); setDraft({ ...project }); setMessage(""); setError("");
  }
  function patch(changes: Partial<PortfolioProject>) { setDraft((current) => current ? { ...current, ...changes } : current); }

  async function save() {
    if (!draft || saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/public-portfolio", {
        method: "PATCH", credentials: "same-origin", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: draft.projectId,
          publicDisplay: draft.public_display,
          publicDisplayOrder: draft.public_display_order,
          websiteFeatured: draft.website_featured,
          websiteFeaturedOrder: draft.website_featured_order,
          publicTitle: draft.public_project_title,
          projectCategory: draft.project_category,
          publicDescription: draft.public_description,
          publicServices: draft.public_services,
          coverImageUrl: draft.cover_image_url,
          galleryImages: draft.gallery_images,
          completionYear: draft.completion_year,
          projectAreaText: draft.project_area_text,
          numberOfStoriesText: draft.number_of_stories_text,
          division: draft.division,
          district: draft.district,
          upazilaThana: draft.upazila_thana,
          localBodyType: draft.local_body_type,
          localBodyName: draft.local_body_name,
          wardNo: draft.ward_no,
          villageArea: draft.village_area,
          roadHolding: draft.road_holding,
          locationTag: draft.location_tag,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not save public portfolio project."));
      const saved = json.data as PortfolioProject;
      setProjects((current) => current.map((project) => project.projectId === saved.projectId ? saved : project));
      setDraft({ ...saved });
      setMessage(`${saved.projectId} public portfolio details saved.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save public portfolio project."); }
    finally { setSaving(false); }
  }

  const live = draft ? liveReadiness(draft) : null;
  const selectedSaved = projects.find((project) => project.projectId === selectedId);
  const dirty = Boolean(draft && selectedSaved && JSON.stringify(draft) !== JSON.stringify(selectedSaved));

  return <main className="ppm-page">
    <style>{`
      .ppm-page{min-height:100vh;padding:26px;background:#f4f6f8;color:#18222c}.ppm-wrap{width:min(100% - 28px,1600px);margin:0 auto}.ppm-head{display:flex;justify-content:space-between;align-items:flex-end;gap:22px;margin-bottom:16px}.ppm-kicker{display:block;color:#c6252b;font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px}.ppm-head h1{margin:0;font-size:clamp(28px,4vw,44px);line-height:1}.ppm-head p{max-width:820px;margin:10px 0 0;color:#64727e;font-size:13px;line-height:1.6}.ppm-actions{display:flex;gap:8px;flex-wrap:wrap}.ppm-btn{min-height:42px;display:inline-flex;align-items:center;justify-content:center;padding:0 14px;border:1px solid #cbd3d9;border-radius:9px;background:#fff;color:#1b2731!important;text-decoration:none;font-size:11px;font-weight:900;cursor:pointer}.ppm-btn.primary{border-color:#c6252b;background:#c6252b;color:#fff!important}.ppm-btn:disabled{opacity:.5;cursor:not-allowed}.ppm-stats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:12px}.ppm-stat{padding:14px 16px;border:1px solid #dce2e7;border-radius:11px;background:#fff}.ppm-stat small{display:block;color:#7a8791;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.ppm-stat strong{display:block;margin-top:5px;font-size:25px}.ppm-toolbar{display:flex;gap:8px;padding:11px;border:1px solid #dce2e7;border-radius:11px;background:#fff;margin-bottom:12px}.ppm-search,.ppm-filter{min-height:42px;border:1px solid #cbd3da;border-radius:8px;background:#fff;color:#18222c;padding:0 11px;font:inherit}.ppm-search{flex:1}.ppm-filter{min-width:190px}.ppm-alert{margin-bottom:12px;padding:11px 13px;border-radius:9px;font-size:12px}.ppm-alert.err{background:#fff0f0;color:#8e2222;border:1px solid #f0caca}.ppm-alert.ok{background:#edf9f1;color:#196c39;border:1px solid #cae8d4}.ppm-layout{display:grid;grid-template-columns:340px minmax(0,1fr);gap:12px;align-items:start}.ppm-list{position:sticky;top:12px;max-height:calc(100vh - 130px);overflow:auto;border:1px solid #dce2e7;border-radius:12px;background:#fff}.ppm-list-head{position:sticky;top:0;z-index:2;padding:12px 14px;border-bottom:1px solid #e7ebee;background:#f9fafb;font-size:10px;font-weight:900;color:#67747e}.ppm-row{display:block;width:100%;padding:12px 14px;border:0;border-bottom:1px solid #eef1f3;background:#fff;text-align:left;cursor:pointer}.ppm-row:hover,.ppm-row.active{background:#fff7f7}.ppm-row.active{box-shadow:inset 3px 0 #c6252b}.ppm-row-top{display:flex;justify-content:space-between;gap:8px}.ppm-row strong{font-size:12px}.ppm-row small{display:block;margin-top:4px;color:#71808b;font-size:10px;line-height:1.4}.ppm-badges{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}.ppm-badge{display:inline-flex;align-items:center;padding:4px 7px;border-radius:999px;background:#f0f2f4;color:#5d6972;font-size:8px;font-weight:900}.ppm-badge.published,.ppm-score.good{background:#e6f6ec;color:#19703a}.ppm-badge.hidden{background:#eceff2;color:#5b6770}.ppm-score.mid{background:#fff4d8;color:#865f00}.ppm-score.low{background:#fde8e8;color:#a32525}.ppm-workspace{display:grid;gap:12px}.ppm-editor-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;border:1px solid #dce2e7;border-radius:12px;background:#fff}.ppm-editor-head h2{margin:0;font-size:18px}.ppm-editor-head p{margin:4px 0 0;color:#74818c;font-size:10px}.ppm-save-state{font-size:9px;font-weight:900;color:#c6252b}.ppm-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,.65fr);gap:12px;align-items:start}.ppm-form{display:grid;gap:10px}.ppm-section{padding:15px;border:1px solid #dce2e7;border-radius:12px;background:#fff}.ppm-section h3{margin:0 0 3px;font-size:13px}.ppm-section>p{margin:0 0 12px;color:#76838d;font-size:10px;line-height:1.5}.ppm-fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.ppm-field{display:grid;gap:5px;color:#65727c;font-size:8px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.ppm-field.span{grid-column:1/-1}.ppm-field input,.ppm-field select,.ppm-field textarea{width:100%;border:1px solid #cbd3da;border-radius:8px;padding:9px 10px;background:#fff;color:#18222c;font:inherit;font-size:11px;letter-spacing:0;text-transform:none}.ppm-field input,.ppm-field select{min-height:40px}.ppm-field textarea{min-height:86px;resize:vertical}.ppm-toggle{display:flex;align-items:center;gap:9px;min-height:42px;padding:0 10px;border:1px solid #d6dde2;border-radius:8px;background:#f8fafb;color:#26333d;font-size:10px;font-weight:800;letter-spacing:0;text-transform:none}.ppm-toggle input{width:18px;height:18px;accent-color:#c6252b}.ppm-preview{position:sticky;top:12px;display:grid;gap:10px}.ppm-preview-card{overflow:hidden;border:1px solid #dce2e7;border-radius:13px;background:#fff}.ppm-cover{aspect-ratio:16/10;background:linear-gradient(135deg,#182631,#0a1117);background-position:center;background-size:cover;display:grid;place-items:center;color:#fff;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.ppm-preview-body{padding:15px}.ppm-preview-body h3{margin:0;font-size:18px;line-height:1.25}.ppm-preview-body p{margin:6px 0 0;color:#687681;font-size:11px;line-height:1.5}.ppm-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.ppm-chip{padding:5px 7px;border-radius:6px;background:#f1f3f5;color:#5c6871;font-size:8px;font-weight:800}.ppm-readiness{padding:14px;border:1px solid #dce2e7;border-radius:12px;background:#fff}.ppm-readiness-top{display:flex;justify-content:space-between;align-items:center}.ppm-readiness strong{font-size:20px}.ppm-meter{height:7px;margin:9px 0;background:#edf0f2;border-radius:99px;overflow:hidden}.ppm-meter span{display:block;height:100%;background:#c6252b;border-radius:99px}.ppm-missing{display:flex;gap:5px;flex-wrap:wrap}.ppm-empty{padding:50px 20px;text-align:center;border:1px solid #dce2e7;border-radius:12px;background:#fff;color:#6e7a84}.ppm-help{padding:11px 13px;border-left:3px solid #c6252b;border-radius:8px;background:#fff;color:#5c6974;font-size:10px;line-height:1.6}@media(max-width:1180px){.ppm-layout{grid-template-columns:290px minmax(0,1fr)}.ppm-grid{grid-template-columns:1fr}.ppm-preview{position:static;grid-template-columns:1fr 1fr}}@media(max-width:820px){.ppm-page{padding:18px 0}.ppm-head{align-items:flex-start;flex-direction:column}.ppm-stats{grid-template-columns:repeat(2,1fr)}.ppm-toolbar{flex-direction:column}.ppm-filter{min-width:0}.ppm-layout{grid-template-columns:1fr}.ppm-list{position:static;max-height:360px}.ppm-preview{grid-template-columns:1fr}.ppm-fields{grid-template-columns:1fr}.ppm-field.span{grid-column:auto}.ppm-editor-head{align-items:flex-start;flex-direction:column}.ppm-actions{width:100%}.ppm-actions .ppm-btn{flex:1}}@media(max-width:480px){.ppm-wrap{width:min(100% - 18px,1600px)}.ppm-stats{grid-template-columns:1fr 1fr}.ppm-stat{padding:12px}.ppm-stat strong{font-size:21px}}
    `}</style>
    <div className="ppm-wrap">
      <header className="ppm-head"><div><span className="ppm-kicker">Website · Central Control</span><h1>Public Portfolio Management</h1><p>One authoritative editor for everything shown on LAND VIEW public project pages. Internal project, finance, workflow and client records stay separate.</p></div><div className="ppm-actions"><Link className="ppm-btn" href="/admin/projects">Project List</Link><Link className="ppm-btn" href="/admin/projects/locations">Location Tools</Link><a className="ppm-btn primary" href="/projects" target="_blank" rel="noreferrer">Open Public Portfolio</a></div></header>
      <section className="ppm-stats"><article className="ppm-stat"><small>Total Projects</small><strong>{stats.total}</strong></article><article className="ppm-stat"><small>Published</small><strong>{stats.published}</strong></article><article className="ppm-stat"><small>Hidden</small><strong>{stats.hidden}</strong></article><article className="ppm-stat"><small>Website Ready</small><strong>{stats.ready}</strong></article><article className="ppm-stat"><small>Need Attention</small><strong>{stats.incomplete}</strong></article></section>
      <div className="ppm-toolbar"><input className="ppm-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search File ID, project title, category or location"/><select className="ppm-filter" value={filter} onChange={(event) => setFilter(event.target.value as Filter)}><option value="all">All projects</option><option value="published">Published</option><option value="hidden">Hidden</option><option value="ready">Website ready</option><option value="incomplete">Needs attention</option><option value="missing-cover">Missing cover image</option><option value="missing-description">Missing description</option></select><button className="ppm-btn" onClick={() => void load(selectedId)} disabled={loading}>Refresh</button></div>
      {error ? <div className="ppm-alert err">{error}</div> : null}{message ? <div className="ppm-alert ok">{message}</div> : null}
      <div className="ppm-layout">
        <aside className="ppm-list"><div className="ppm-list-head">{loading ? "Loading projects…" : `${visible.length} matching projects`}</div>{visible.map((project) => <button type="button" key={project.projectId} className={`ppm-row ${project.projectId === selectedId ? "active" : ""}`} onClick={() => select(project)}><div className="ppm-row-top"><strong>{project.projectId}</strong><span className={`ppm-badge ${project.public_display ? "published" : "hidden"}`}>{project.public_display ? "Published" : "Hidden"}</span></div><small>{project.public_project_title || project.title || project.projectName || "Untitled project"}</small><small>{project.project_category || project.category || "No category"} · {project.location || "No public address"}</small><div className="ppm-badges"><span className={`ppm-badge ppm-score ${scoreClass(Number(project.publicReadiness || 0))}`}>{Number(project.publicReadiness || 0)}% ready</span>{project.website_featured ? <span className="ppm-badge">Featured #{project.website_featured_order || "—"}</span> : null}</div></button>)}</aside>
        {!draft || !live ? <div className="ppm-empty">Select a project to manage its public portfolio details.</div> : <section className="ppm-workspace">
          <div className="ppm-editor-head"><div><h2>{draft.projectId} · {live.title || "Untitled project"}</h2><p>{draft.projectName || "No internal project name"} · {draft.currentStage || "Stage unavailable"}</p></div><div className="ppm-actions">{dirty ? <span className="ppm-save-state">Unsaved changes</span> : null}<Link className="ppm-btn" href={`/admin/projects/${encodeURIComponent(draft.projectId)}`}>Internal Project</Link>{draft.public_display ? <a className="ppm-btn" href={`/projects/${encodeURIComponent(draft.projectId)}`} target="_blank" rel="noreferrer">Public Page</a> : null}<button className="ppm-btn primary" onClick={() => void save()} disabled={saving || !dirty}>{saving ? "Saving…" : dirty ? "Save Changes" : "Saved"}</button></div></div>
          <div className="ppm-grid"><div className="ppm-form">
            <section className="ppm-section"><h3>Publishing & ranking</h3><p>Publishing is independent from readiness. Incomplete projects are never hidden automatically.</p><div className="ppm-fields"><label className="ppm-field span"><span className="ppm-toggle"><input type="checkbox" checked={draft.public_display} onChange={(event) => patch({ public_display: event.target.checked })}/>{draft.public_display ? "Published on the public website" : "Hidden from the public website"}</span></label><label className="ppm-field">Public display order<input type="number" min="0" max="9999" value={draft.public_display_order || 0} onChange={(event) => patch({ public_display_order: Number(event.target.value) || 0 })}/></label><label className="ppm-field"><span className="ppm-toggle"><input type="checkbox" checked={draft.website_featured} onChange={(event) => patch({ website_featured: event.target.checked })}/>Feature on website</span></label><label className="ppm-field">Featured order<input type="number" min="0" max="999" value={draft.website_featured_order || 0} onChange={(event) => patch({ website_featured_order: Number(event.target.value) || 0 })}/></label></div></section>
            <section className="ppm-section"><h3>Public identity</h3><p>Client-safe naming used only on the website.</p><div className="ppm-fields"><label className="ppm-field span">Public project title<input value={draft.public_project_title || ""} onChange={(event) => patch({ public_project_title: event.target.value })} placeholder="e.g. 7-Storey Residential Building · Feni"/></label><label className="ppm-field">Project category<input value={draft.project_category || ""} onChange={(event) => patch({ project_category: event.target.value })} placeholder="Residential"/></label><label className="ppm-field">Completion year<input value={draft.completion_year || ""} onChange={(event) => patch({ completion_year: event.target.value })} placeholder="2026"/></label><label className="ppm-field">Public area<input value={draft.project_area_text || ""} onChange={(event) => patch({ project_area_text: event.target.value })} placeholder="1960 sq ft · 4.5 Decimal"/></label><label className="ppm-field">Stories / floors<input value={draft.number_of_stories_text || ""} onChange={(event) => patch({ number_of_stories_text: event.target.value })} placeholder="G+7"/></label></div></section>
            <section className="ppm-section"><h3>Structured public address & map</h3><p>This is the address displayed publicly. Use Location Tools for map-coordinate verification when needed.</p><div className="ppm-fields"><label className="ppm-field">Division<input value={draft.division || ""} onChange={(event) => patch({ division: event.target.value })}/></label><label className="ppm-field">District<input value={draft.district || ""} onChange={(event) => patch({ district: event.target.value })}/></label><label className="ppm-field">Upazila / Thana<input value={draft.upazila_thana || ""} onChange={(event) => patch({ upazila_thana: event.target.value })}/></label><label className="ppm-field">Local body type<select value={draft.local_body_type || ""} onChange={(event) => patch({ local_body_type: event.target.value })}><option value="">Select type</option><option>Union Parishad</option><option>Paurashava / Municipality</option><option>City Corporation</option></select></label><label className="ppm-field">Local body name<input value={draft.local_body_name || ""} onChange={(event) => patch({ local_body_name: event.target.value })}/></label><label className="ppm-field">Ward no.<input value={draft.ward_no || ""} onChange={(event) => patch({ ward_no: event.target.value })}/></label><label className="ppm-field">Village / area<input value={draft.village_area || ""} onChange={(event) => patch({ village_area: event.target.value })}/></label><label className="ppm-field">Road / holding<input value={draft.road_holding || ""} onChange={(event) => patch({ road_holding: event.target.value })}/></label><label className="ppm-field span">Google Maps location tag<input value={draft.location_tag || ""} onChange={(event) => patch({ location_tag: event.target.value })} placeholder="Google Maps URL or verified location tag"/></label></div></section>
            <section className="ppm-section"><h3>Media</h3><p>Use one cover image and optional gallery images. Google Drive image links are supported by the public renderer.</p><div className="ppm-fields"><label className="ppm-field span">Cover image URL<input value={draft.cover_image_url || ""} onChange={(event) => patch({ cover_image_url: event.target.value })}/></label><label className="ppm-field span">Gallery image URLs<textarea value={draft.gallery_images || ""} onChange={(event) => patch({ gallery_images: event.target.value })} placeholder="One URL per line or comma-separated"/></label></div></section>
            <section className="ppm-section"><h3>Public content</h3><p>A description of at least 40 characters and a service list improve website readiness.</p><div className="ppm-fields"><label className="ppm-field span">Public services<textarea value={draft.public_services || ""} onChange={(event) => patch({ public_services: event.target.value })} placeholder="Architectural Design, Structural Design, 3D Design - Exterior"/></label><label className="ppm-field span">Public description<textarea value={draft.public_description || ""} onChange={(event) => patch({ public_description: event.target.value })} placeholder="Client-safe project summary, design intent and delivery scope."/></label></div></section>
            <div className="ppm-help"><strong>Centralized control:</strong> public portfolio fields belong here. The normal project page remains for internal project/client/workflow/finance data, while location verification can still use the dedicated Location Tools screen.</div>
          </div><aside className="ppm-preview">
            <div className="ppm-preview-card"><div className="ppm-cover" style={live.cover ? { backgroundImage: `url(${live.cover})` } : undefined}>{live.cover ? null : <span>{live.category || "LAND VIEW Project"}</span>}</div><div className="ppm-preview-body"><span className={`ppm-badge ${draft.public_display ? "published" : "hidden"}`}>{draft.public_display ? "Published" : "Hidden"}</span><h3>{live.title || "Untitled public project"}</h3><p>{draft.projectId} · {live.category || "No category"}</p><p>{live.location || "No structured public address"}</p>{live.description ? <p>{live.description}</p> : null}<div className="ppm-meta">{live.services.slice(0, 5).map((service) => <span className="ppm-chip" key={service}>{service}</span>)}{draft.completion_year ? <span className="ppm-chip">{draft.completion_year}</span> : null}{draft.project_area_text ? <span className="ppm-chip">{draft.project_area_text}</span> : null}{draft.number_of_stories_text ? <span className="ppm-chip">{draft.number_of_stories_text}</span> : null}</div></div></div>
            <div className="ppm-readiness"><div className="ppm-readiness-top"><div><span className="ppm-kicker" style={{margin:0}}>Live readiness</span><strong>{live.score}%</strong></div><span className={`ppm-badge ppm-score ${scoreClass(live.score)}`}>{live.ready ? "Website ready" : "Needs attention"}</span></div><div className="ppm-meter"><span style={{width:`${live.score}%`}}/></div><div className="ppm-missing">{live.missing.length ? live.missing.map((item) => <span className="ppm-chip" key={item}>{item}</span>) : <span className="ppm-chip">All readiness checks complete</span>}</div></div>
          </aside></div>
        </section>}
      </div>
    </div>
  </main>;
}
