"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Project = {
  projectId?: string;
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
  public_project_title?: string;
  public_description?: string;
  project_category?: string;
  cover_image_url?: string;
  gallery_images?: string;
  public_services?: string;
  completion_year?: string;
  website_featured?: boolean;
  website_featured_order?: number;
};

function scoreTone(score: number) {
  if (score >= 72) return "good";
  if (score >= 50) return "mid";
  return "low";
}

export default function WebsiteCurationPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Project>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"shortlist" | "all">("shortlist");

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/website-curation", { cache: "no-store", credentials: "same-origin" });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load website curation."));
      const rows: Project[] = Array.isArray(json.data) ? json.data : [];
      setProjects(rows);
      setDrafts(Object.fromEntries(rows.filter((item) => item.projectId).map((item) => [String(item.projectId), { ...item }])))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load website curation.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const ranked = useMemo(() => [...projects].sort((a, b) => {
    const af = a.website_featured ? 1 : 0;
    const bf = b.website_featured ? 1 : 0;
    if (af !== bf) return bf - af;
    if (af && bf) {
      const orderDiff = Number(a.website_featured_order || 0) - Number(b.website_featured_order || 0);
      if (orderDiff) return orderDiff;
    }
    const coverDiff = Number(Boolean(b.coverImageUrl || b.cover_image_url)) - Number(Boolean(a.coverImageUrl || a.cover_image_url));
    if (coverDiff) return coverDiff;
    return Number(b.publicReadiness || 0) - Number(a.publicReadiness || 0);
  }), [projects]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = mode === "shortlist" ? ranked.slice(0, 15) : ranked;
    return base.filter((project) => !q || [project.projectId, project.title, project.public_project_title, project.category, project.location]
      .filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [mode, query, ranked]);

  const featuredCount = projects.filter((item) => item.website_featured).length;
  const readyCount = projects.filter((item) => item.publicReady).length;

  function patch(id: string, changes: Partial<Project>) {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] || {}), ...changes } }));
  }

  async function save(id: string) {
    const draft = drafts[id] || {};
    setSaving(id); setError("");
    try {
      const response = await fetch("/api/admin/website-curation", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          projectId: id,
          websiteFeatured: Boolean(draft.website_featured),
          websiteFeaturedOrder: Number(draft.website_featured_order || 0),
          publicTitle: draft.public_project_title || "",
          publicDescription: draft.public_description || "",
          projectCategory: draft.project_category || "",
          coverImageUrl: draft.cover_image_url || "",
          galleryImages: draft.gallery_images || "",
          publicServices: draft.public_services || "",
          completionYear: draft.completion_year || "",
        }),
      });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not save project."));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save project.");
    } finally { setSaving(""); }
  }

  return (
    <main className="wc-page">
      <style>{`
        .wc-page{min-height:100vh;padding:30px;background:#f4f6f8;color:#17212b}.wc-wrap{width:min(100% - 28px,1500px);margin:0 auto}.wc-head{display:flex;align-items:flex-end;justify-content:space-between;gap:22px;margin-bottom:20px}.wc-kicker{display:block;margin-bottom:7px;color:#c6252b;font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.wc-head h1{margin:0;font-size:clamp(30px,4vw,46px);line-height:1}.wc-head p{max-width:760px;margin:10px 0 0;color:#65737e;line-height:1.65}.wc-actions{display:flex;gap:8px;flex-wrap:wrap}.wc-btn{min-height:40px;display:inline-flex;align-items:center;justify-content:center;padding:0 14px;border:1px solid #cbd2d9;border-radius:8px;background:#fff;color:#17212b!important;text-decoration:none;font-size:12px;font-weight:800}.wc-btn.primary{border-color:#c6252b;background:#c6252b;color:#fff!important}.wc-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}.wc-stat{padding:17px;border:1px solid #dce2e7;border-radius:12px;background:#fff}.wc-stat small{display:block;color:#7a8792;font-size:10px;font-weight:900;letter-spacing:.07em;text-transform:uppercase}.wc-stat strong{display:block;margin-top:6px;font-size:28px}.wc-toolbar{display:flex;gap:9px;margin-bottom:14px;padding:12px;border:1px solid #dce2e7;border-radius:12px;background:#fff}.wc-toolbar input{flex:1;min-height:40px;border:1px solid #cbd3da;border-radius:8px;padding:0 11px}.wc-error{margin-bottom:14px;padding:12px 14px;border-left:3px solid #c6252b;border-radius:8px;background:#fff0f0;color:#8f2626}.wc-grid{display:grid;gap:12px}.wc-card{display:grid;grid-template-columns:250px 1fr 1.15fr;border:1px solid #dce2e7;border-radius:12px;background:#fff;overflow:hidden}.wc-preview{padding:16px;border-right:1px solid #edf0f2}.wc-image{aspect-ratio:16/10;border-radius:9px;background:linear-gradient(135deg,#12202b,#09131d);background-position:center;background-size:cover;overflow:hidden}.wc-image.empty{display:grid;place-items:center;color:#fff;font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.wc-preview h2{margin:13px 0 4px;font-size:18px}.wc-preview p{margin:0;color:#697680;font-size:12px;line-height:1.5}.wc-score{display:inline-flex;margin-top:10px;padding:5px 8px;border-radius:999px;font-size:10px;font-weight:900}.wc-score.good{background:#e6f6ec;color:#19703a}.wc-score.mid{background:#fff4d8;color:#855d00}.wc-score.low{background:#fde8e8;color:#a32525}.wc-missing{display:flex;flex-wrap:wrap;gap:5px;margin-top:10px}.wc-chip{padding:4px 6px;border-radius:5px;background:#f1f3f5;color:#5e6972;font-size:9px;font-weight:700}.wc-form{padding:16px;border-right:1px solid #edf0f2}.wc-form:last-child{border-right:0}.wc-form h3{margin:0 0 12px;font-size:13px}.wc-fields{display:grid;grid-template-columns:1fr 1fr;gap:9px}.wc-fields label{display:grid;gap:5px;color:#6d7a85;font-size:9px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.wc-fields input,.wc-fields textarea{width:100%;border:1px solid #cbd3da;border-radius:7px;padding:9px 10px;background:#fff;color:#17212b;font:inherit}.wc-fields textarea{min-height:86px;resize:vertical}.wc-span{grid-column:1/-1}.wc-featured{display:flex;align-items:center;gap:8px;min-height:40px;padding:0 10px;border:1px solid #d8dee4;border-radius:8px;background:#f8fafb;color:#26333e;font-size:11px;font-weight:800}.wc-featured input{width:17px;height:17px;accent-color:#c6252b}.wc-save{grid-column:1/-1;min-height:40px;border:0;border-radius:8px;background:#c6252b;color:#fff;font-weight:900;cursor:pointer}.wc-save:disabled{opacity:.55}.wc-note{margin-bottom:16px;padding:14px 16px;border-left:3px solid #c6252b;border-radius:8px;background:#fff;color:#586670;font-size:12px;line-height:1.6}@media(max-width:1120px){.wc-card{grid-template-columns:220px 1fr}.wc-card .wc-form:last-child{grid-column:1/-1;border-top:1px solid #edf0f2}}@media(max-width:760px){.wc-page{padding:20px 0}.wc-head{align-items:flex-start;flex-direction:column}.wc-stats{grid-template-columns:1fr 1fr}.wc-toolbar{flex-direction:column}.wc-card{grid-template-columns:1fr}.wc-preview,.wc-form{border-right:0;border-bottom:1px solid #edf0f2}.wc-card .wc-form:last-child{grid-column:auto;border-bottom:0}.wc-fields{grid-template-columns:1fr}.wc-span,.wc-save{grid-column:auto}}
      `}</style>
      <div className="wc-wrap">
        <header className="wc-head">
          <div><span className="wc-kicker">Public Portfolio Control</span><h1>Website Curation</h1><p>Finish and rank the strongest LAND VIEW projects here. Mark up to roughly 10–15 as curated; the homepage automatically prioritizes the first six featured projects and falls back to the best-scoring published work while you complete the shortlist.</p></div>
          <div className="wc-actions"><Link className="wc-btn" href="/admin/projects/website-readiness">Website Readiness</Link><Link className="wc-btn primary" href="/admin/website-leads">Project Enquiries</Link></div>
        </header>

        <section className="wc-stats"><article className="wc-stat"><small>Published</small><strong>{projects.length}</strong></article><article className="wc-stat"><small>Website Ready</small><strong>{readyCount}</strong></article><article className="wc-stat"><small>Curated / Featured</small><strong>{featuredCount}</strong></article><article className="wc-stat"><small>Shortlist Target</small><strong>10–15</strong></article></section>
        <div className="wc-note">A project can stay published without being featured. Use a clean public title instead of internal/client shorthand, add a cover image and short description, list the actual services, then mark the strongest work as featured and assign its display order.</div>
        <div className="wc-toolbar"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search File ID, project title, category or location"/><button className={`wc-btn ${mode === "shortlist" ? "primary" : ""}`} onClick={() => setMode("shortlist")}>Top 15</button><button className={`wc-btn ${mode === "all" ? "primary" : ""}`} onClick={() => setMode("all")}>All Published</button><button className="wc-btn" onClick={() => void load()} disabled={loading}>Refresh</button></div>
        {error ? <div className="wc-error">{error}</div> : null}

        <section className="wc-grid">
          {loading ? <div className="wc-note">Loading website projects…</div> : visible.map((project) => {
            const id = String(project.projectId || "");
            const draft = drafts[id] || project;
            const cover = String(draft.cover_image_url || project.coverImageUrl || "").trim();
            const score = Number(project.publicReadiness || 0);
            return <article className="wc-card" key={id || project.title}>
              <div className="wc-preview">
                <div className={`wc-image ${cover ? "" : "empty"}`} style={cover ? { backgroundImage: `url(${cover})` } : undefined}>{cover ? null : <span>{project.category || "LAND VIEW Project"}</span>}</div>
                <h2>{draft.public_project_title || project.title || "Untitled public project"}</h2>
                <p>{id || "No File ID"} · {draft.project_category || project.category || "No category"}</p>
                <p>{project.location || "No structured public location"}</p>
                <span className={`wc-score ${scoreTone(score)}`}>{score}% ready</span>
                <div className="wc-missing">{project.publicMissing?.length ? project.publicMissing.map((item) => <span className="wc-chip" key={item}>{item}</span>) : <span className="wc-chip">Website ready</span>}</div>
                {id ? <div className="wc-actions" style={{marginTop:12}}><Link className="wc-btn" href={`/projects/${encodeURIComponent(id)}`} target="_blank">View Public</Link><Link className="wc-btn" href={`/admin/projects/${encodeURIComponent(id)}`}>Full Project</Link></div> : null}
              </div>
              <div className="wc-form"><h3>Public Portfolio Content</h3><div className="wc-fields">
                <label className="wc-span">Public Title<input value={draft.public_project_title || ""} onChange={(e) => patch(id, { public_project_title: e.target.value })} placeholder="e.g. 7-Storey Residential Building · Feni"/></label>
                <label>Category<input value={draft.project_category || ""} onChange={(e) => patch(id, { project_category: e.target.value })} placeholder="Residential"/></label>
                <label>Completion Year<input value={draft.completion_year || ""} onChange={(e) => patch(id, { completion_year: e.target.value })} placeholder="2026"/></label>
                <label className="wc-span">Cover Image URL<input value={draft.cover_image_url || ""} onChange={(e) => patch(id, { cover_image_url: e.target.value })} placeholder="Google Drive image link or public image URL"/></label>
                <label className="wc-span">Public Description<textarea value={draft.public_description || ""} onChange={(e) => patch(id, { public_description: e.target.value })} placeholder="A concise client-safe description of the project, design intent and delivery scope."/></label>
              </div></div>
              <div className="wc-form"><h3>Services, Gallery & Ranking</h3><div className="wc-fields">
                <label className="wc-span">Public Services<textarea value={draft.public_services || ""} onChange={(e) => patch(id, { public_services: e.target.value })} placeholder="Architectural Design, Structural Design, 3D Design - Exterior"/></label>
                <label className="wc-span">Gallery Image URLs<textarea value={draft.gallery_images || ""} onChange={(e) => patch(id, { gallery_images: e.target.value })} placeholder="One URL per line or comma-separated"/></label>
                <label className="wc-featured"><input type="checkbox" checked={Boolean(draft.website_featured)} onChange={(e) => patch(id, { website_featured: e.target.checked })}/>Curated / homepage eligible</label>
                <label>Featured Order<input type="number" min="0" max="999" value={Number(draft.website_featured_order || 0)} onChange={(e) => patch(id, { website_featured_order: Number(e.target.value) })}/></label>
                <button className="wc-save" onClick={() => void save(id)} disabled={!id || saving === id}>{saving === id ? "Saving…" : "Save Website Project"}</button>
              </div></div>
            </article>;
          })}
        </section>
      </div>
    </main>
  );
}
