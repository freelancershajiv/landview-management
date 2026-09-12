"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PublicHeader from "@/components/public-header";

type PublicProject = {
  projectId?: string;
  title?: string;
  category?: string;
  location?: string;
  status?: string;
  area?: string;
  stories?: string;
  completionYear?: string;
  description?: string;
  coverImageUrl?: string;
  galleryImages?: string[];
  services?: string[];
};

function imageUrl(url?: string) {
  const value = String(url || "").trim();
  if (!value) return "";
  const fileMatch = value.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  if (fileMatch?.[1]) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileMatch[1])}&sz=w1600`;
  try {
    const parsed = new URL(value);
    if (parsed.hostname === "drive.google.com") {
      const id = parsed.searchParams.get("id");
      if (id) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1600`;
    }
  } catch {}
  return value;
}

function projectText(project: PublicProject) {
  return [
    project.projectId,
    project.title,
    project.category,
    project.location,
    project.status,
    project.area,
    project.stories,
    project.completionYear,
    project.description,
    ...(project.services || []),
  ].filter(Boolean).join(" ").toLowerCase();
}

export default function PublicProjectsPage({ initialProjects }: { initialProjects: PublicProject[] }) {
  const [projects, setProjects] = useState<PublicProject[]>(initialProjects);
  const [loading, setLoading] = useState(!initialProjects.length);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");

  async function loadProjects() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/public/projects", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || json?.success === false) throw new Error(json?.error || "Unable to load projects.");
      const rows = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
      setProjects(rows);
    } catch (e: any) {
      setError(e?.message || "Unable to load projects.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (initialProjects.length) return;
    void loadProjects();
  }, [initialProjects.length]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    projects.forEach(project => {
      const category = String(project.category || "").trim();
      if (category) counts.set(category, (counts.get(category) || 0) + 1);
    });
    return counts;
  }, [projects]);

  const categories = useMemo(() => ["All", ...Array.from(categoryCounts.keys()).sort((a, b) => a.localeCompare(b))], [categoryCounts]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return projects.filter(project => {
      if (filter !== "All" && String(project.category || "") !== filter) return false;
      if (term && !projectText(project).includes(term)) return false;
      return true;
    });
  }, [projects, filter, query]);

  const activeFilters = filter !== "All" || Boolean(query.trim());

  return (
    <main className="public-site portfolio-page">
      <style>{`
        .portfolio-page{background:#090d11;color:#f4f6f7;min-height:100vh}.portfolio-wrap{width:min(1240px,calc(100% - 40px));margin:auto}.portfolio-hero{padding:112px 0 42px;border-bottom:1px solid rgba(255,255,255,.09);background:radial-gradient(circle at 78% 15%,rgba(214,31,38,.12),transparent 32%),linear-gradient(180deg,#0d1217,#090d11)}.portfolio-hero-grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(280px,.55fr);gap:56px;align-items:end}.portfolio-kicker{display:flex;align-items:center;gap:10px;color:#ef6c66;font-size:10px;font-weight:900;letter-spacing:.18em}.portfolio-kicker:before{content:"";width:34px;height:1px;background:#d61f26}.portfolio-hero h1{max-width:850px;margin:19px 0 20px;font-size:clamp(48px,7vw,88px);line-height:.9;letter-spacing:-.058em}.portfolio-hero p{max-width:650px;margin:0;color:#919ba4;font-size:15px;line-height:1.75}.portfolio-stats{display:grid;grid-template-columns:repeat(2,1fr);border:1px solid rgba(255,255,255,.1);border-radius:14px;background:rgba(255,255,255,.025);overflow:hidden}.portfolio-stat{padding:18px}.portfolio-stat:nth-child(odd){border-right:1px solid rgba(255,255,255,.08)}.portfolio-stat strong{display:block;font-size:28px}.portfolio-stat span{display:block;margin-top:5px;color:#74808a;font-size:9px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}.portfolio-controls{position:sticky;top:0;z-index:12;padding:18px 0;background:rgba(9,13,17,.94);backdrop-filter:blur(14px);border-bottom:1px solid rgba(255,255,255,.08)}.portfolio-control-row{display:flex;gap:12px;justify-content:space-between;align-items:center}.portfolio-search{position:relative;flex:1;max-width:450px}.portfolio-search input{width:100%;height:46px;padding:0 42px 0 15px;border:1px solid rgba(255,255,255,.13);border-radius:9px;background:#111820;color:#fff;outline:none}.portfolio-search input:focus{border-color:#d61f26;box-shadow:0 0 0 3px rgba(214,31,38,.11)}.portfolio-search button{position:absolute;right:7px;top:7px;width:32px;height:32px;border:0;border-radius:6px;background:transparent;color:#7f8a93;cursor:pointer}.portfolio-result{color:#7f8a93;font-size:11px;white-space:nowrap}.portfolio-filters{display:flex;gap:8px;overflow-x:auto;padding:14px 0 1px;scrollbar-width:none}.portfolio-filters::-webkit-scrollbar{display:none}.portfolio-filter{flex:none;height:34px;padding:0 12px;border:1px solid rgba(255,255,255,.11);border-radius:999px;background:#10161c;color:#8d98a1;font-size:10px;font-weight:800;cursor:pointer}.portfolio-filter.active{border-color:#d61f26;background:#d61f26;color:#fff}.portfolio-filter small{margin-left:6px;opacity:.7}.portfolio-content{padding:38px 0 76px}.portfolio-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}.portfolio-card{position:relative;display:grid;grid-template-columns:minmax(0,1.05fr) minmax(300px,.95fr);min-height:350px;border:1px solid rgba(255,255,255,.1);border-radius:16px;overflow:hidden;background:#0f151b;transition:transform .22s ease,border-color .22s ease,box-shadow .22s ease}.portfolio-card:hover{transform:translateY(-3px);border-color:rgba(214,31,38,.55);box-shadow:0 22px 55px rgba(0,0,0,.28)}.portfolio-media{position:relative;min-height:350px;overflow:hidden;background:linear-gradient(145deg,#131c24,#0a0f14)}.portfolio-media img{width:100%;height:100%;object-fit:cover;transition:transform .45s ease}.portfolio-card:hover .portfolio-media img{transform:scale(1.035)}.portfolio-placeholder{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.045) 1px,transparent 1px);background-size:34px 34px}.portfolio-placeholder:after{content:"LV";position:absolute;left:24px;bottom:18px;color:rgba(255,255,255,.08);font-size:74px;font-weight:900;letter-spacing:-.08em}.portfolio-badges{position:absolute;left:14px;top:14px;right:14px;display:flex;justify-content:space-between;gap:8px}.portfolio-badge{padding:7px 9px;border:1px solid rgba(255,255,255,.15);border-radius:7px;background:rgba(8,12,16,.78);backdrop-filter:blur(8px);color:#e8ecef;font-size:9px;font-weight:900;letter-spacing:.07em;text-transform:uppercase}.portfolio-copy{display:flex;flex-direction:column;padding:25px}.portfolio-id{color:#ef6c66;font-size:9px;font-weight:900;letter-spacing:.15em}.portfolio-copy h2{margin:10px 0 10px;font-size:clamp(22px,2vw,31px);line-height:1.05;letter-spacing:-.035em}.portfolio-location{display:flex;gap:7px;color:#8d98a1;font-size:11px;line-height:1.5}.portfolio-description{margin:17px 0;color:#8b959e;font-size:12px;line-height:1.65;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}.portfolio-meta{display:flex;flex-wrap:wrap;gap:7px;margin-top:auto;padding-top:14px}.portfolio-meta span,.portfolio-service{padding:6px 8px;border:1px solid rgba(255,255,255,.09);border-radius:6px;background:#121b23;color:#95a0a9;font-size:9px}.portfolio-services{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.portfolio-service{color:#c9d0d5}.portfolio-more{color:#707c86!important}.portfolio-cta{display:flex;justify-content:space-between;align-items:center;margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,.08);color:#fff;font-size:10px;font-weight:900;letter-spacing:.08em}.portfolio-cta i{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#d61f26;font-style:normal;transition:transform .2s ease}.portfolio-card:hover .portfolio-cta i{transform:translateX(3px)}.portfolio-state{display:grid;place-items:center;min-height:300px;padding:35px;border:1px dashed rgba(255,255,255,.13);border-radius:14px;background:#0e141a;text-align:center}.portfolio-state strong{display:block;font-size:20px}.portfolio-state p{max-width:520px;margin:10px auto 18px;color:#7e8992;font-size:12px;line-height:1.65}.portfolio-state button{height:38px;padding:0 14px;border:1px solid rgba(255,255,255,.13);border-radius:8px;background:#18212a;color:#fff;font-weight:800;cursor:pointer}.portfolio-skeleton{min-height:350px;border-radius:16px;background:linear-gradient(110deg,#10171d 8%,#17212a 18%,#10171d 33%);background-size:200% 100%;animation:portfolioShimmer 1.5s linear infinite}@keyframes portfolioShimmer{to{background-position-x:-200%}}.portfolio-footer{border-top:1px solid rgba(255,255,255,.09);background:#080b0e}.portfolio-footer .public-footer-grid{padding-top:30px;padding-bottom:30px}@media(max-width:1050px){.portfolio-grid{grid-template-columns:1fr}.portfolio-card{grid-template-columns:minmax(0,1.15fr) minmax(300px,.85fr)}}@media(max-width:760px){.portfolio-wrap{width:min(100% - 28px,1240px)}.portfolio-hero{padding-top:92px}.portfolio-hero-grid{grid-template-columns:1fr;gap:30px}.portfolio-stats{max-width:480px}.portfolio-control-row{align-items:stretch;flex-direction:column}.portfolio-search{max-width:none}.portfolio-result{white-space:normal}.portfolio-card{grid-template-columns:1fr}.portfolio-media{min-height:260px}.portfolio-copy{padding:20px}.portfolio-controls{top:0}.portfolio-grid{gap:16px}}@media(max-width:480px){.portfolio-hero h1{font-size:45px}.portfolio-stat strong{font-size:24px}.portfolio-media{min-height:230px}.portfolio-description{margin-top:13px}.portfolio-content{padding-top:24px}}
      `}</style>

      <PublicHeader />

      <section className="portfolio-hero">
        <div className="portfolio-wrap portfolio-hero-grid">
          <div>
            <span className="portfolio-kicker">LAND VIEW PROJECT PORTFOLIO</span>
            <h1>Designed with purpose. Built for Bangladesh.</h1>
            <p>Explore selected architectural and engineering work by LAND VIEW Engineers &amp; Architects. Only projects approved for public display appear here.</p>
          </div>
          <div className="portfolio-stats" aria-label="Portfolio summary">
            <div className="portfolio-stat"><strong>{projects.length}</strong><span>Published projects</span></div>
            <div className="portfolio-stat"><strong>{categoryCounts.size}</strong><span>Project categories</span></div>
          </div>
        </div>
      </section>

      <section className="portfolio-controls" aria-label="Project filters">
        <div className="portfolio-wrap">
          <div className="portfolio-control-row">
            <div className="portfolio-search">
              <input value={query} onChange={event => setQuery(event.target.value)} type="search" placeholder="Search project, location, service or ID…" aria-label="Search public projects" />
              {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear project search">×</button>}
            </div>
            <div className="portfolio-result">Showing <strong style={{color:"#fff"}}>{filtered.length}</strong> of {projects.length} projects</div>
          </div>
          {categories.length > 1 && <div className="portfolio-filters">
            {categories.map(category => <button type="button" key={category} className={`portfolio-filter ${filter === category ? "active" : ""}`} onClick={() => setFilter(category)}>{category}<small>{category === "All" ? projects.length : categoryCounts.get(category) || 0}</small></button>)}
          </div>}
        </div>
      </section>

      <section className="portfolio-content">
        <div className="portfolio-wrap">
          {loading ? (
            <div className="portfolio-grid" aria-label="Loading projects"><div className="portfolio-skeleton"/><div className="portfolio-skeleton"/></div>
          ) : error ? (
            <div className="portfolio-state"><div><strong>Projects could not be loaded.</strong><p>{error}</p><button type="button" onClick={() => void loadProjects()}>Try again</button></div></div>
          ) : filtered.length ? (
            <div className="portfolio-grid">
              {filtered.map((project, index) => {
                const id = String(project.projectId || "").trim();
                const cover = imageUrl(project.coverImageUrl);
                const services = (project.services || []).filter(Boolean);
                const fallbackDescription = [project.stories ? `${project.stories} Stories` : "", project.area, project.completionYear].filter(Boolean).join(" · ");
                return <Link className="portfolio-card" href={`/projects/${encodeURIComponent(id)}`} key={id || `${project.title}-${index}`} aria-label={`View ${project.title || id || "project"}`}>
                  <div className="portfolio-media">
                    {cover ? <img src={cover} alt={`${project.title || id || "LAND VIEW project"} preview`} loading={index < 2 ? "eager" : "lazy"} /> : <div className="portfolio-placeholder"/>}
                    <div className="portfolio-badges"><span className="portfolio-badge">{project.category || "LAND VIEW"}</span>{project.status && <span className="portfolio-badge">{project.status}</span>}</div>
                  </div>
                  <div className="portfolio-copy">
                    <span className="portfolio-id">{id || "LAND VIEW PROJECT"}</span>
                    <h2>{project.title || "LAND VIEW Project"}</h2>
                    {project.location && <div className="portfolio-location"><span>⌖</span><span>{project.location}</span></div>}
                    <p className="portfolio-description">{project.description || fallbackDescription || "Architectural and engineering work by LAND VIEW Engineers & Architects."}</p>
                    <div className="portfolio-meta">
                      {project.stories && <span>{project.stories} Stories</span>}
                      {project.area && <span>{project.area}</span>}
                      {project.completionYear && <span>{project.completionYear}</span>}
                    </div>
                    {services.length > 0 && <div className="portfolio-services">
                      {services.slice(0,3).map(service => <span className="portfolio-service" key={service}>{service}</span>)}
                      {services.length > 3 && <span className="portfolio-service portfolio-more">+{services.length - 3} services</span>}
                    </div>}
                    <div className="portfolio-cta"><span>VIEW PROJECT</span><i>→</i></div>
                  </div>
                </Link>;
              })}
            </div>
          ) : (
            <div className="portfolio-state"><div><strong>No projects match your search.</strong><p>Try another location, project category, service or project ID.</p>{activeFilters && <button type="button" onClick={() => { setFilter("All"); setQuery(""); }}>Clear filters</button>}</div></div>
          )}
        </div>
      </section>

      <footer className="public-footer portfolio-footer">
        <div className="public-container public-footer-grid">
          <div className="public-footer-brand"><img src="/land-view-logo.png" alt="LAND VIEW" /><div><strong>LAND VIEW</strong><span>ENGINEERS &amp; ARCHITECTS</span></div></div>
          <div className="public-footer-links"><Link href="/#about">About</Link><Link href="/#services">Services</Link><Link href="/projects">Projects</Link><Link href="/#team">Team</Link><Link href="/#contact">Contact</Link></div>
          <div className="public-footer-copy"><span>© 2026 LAND VIEW</span><small>Engineers &amp; Architects</small></div>
        </div>
      </footer>
    </main>
  );
}
