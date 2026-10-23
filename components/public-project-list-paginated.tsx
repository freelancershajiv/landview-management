"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import PublicHeader from "@/components/public-header";

type PublicProject = {
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
};

type CategoryCount = {
  name: string;
  count: number;
};

type Props = {
  initialProjects: PublicProject[];
  initialTotal: number;
  initialPublishedTotal: number;
  initialCategories: CategoryCount[];
};

const PAGE_SIZE = 12;

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

function mergeUniqueProjects(current: PublicProject[], incoming: PublicProject[]) {
  const seen = new Set(current.map((project) => String(project.projectId || "").trim()).filter(Boolean));
  const merged = [...current];
  for (const project of incoming) {
    const id = String(project.projectId || "").trim();
    if (id && seen.has(id)) continue;
    if (id) seen.add(id);
    merged.push(project);
  }
  return merged;
}

export default function PublicProjectListPaginated({
  initialProjects,
  initialTotal,
  initialPublishedTotal,
  initialCategories,
}: Props) {
  const [projects, setProjects] = useState<PublicProject[]>(initialProjects);
  const [total, setTotal] = useState(initialTotal);
  const [publishedTotal, setPublishedTotal] = useState(initialPublishedTotal);
  const [categories, setCategories] = useState<CategoryCount[]>(initialCategories);
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const firstFilterPass = useRef(true);
  const requestSerial = useRef(0);

  async function fetchProjects(options: { reset: boolean }) {
    const serial = ++requestSerial.current;
    const offset = options.reset ? 0 : projects.length;

    if (options.reset) {
      setLoading(true);
      setError("");
    } else {
      setLoadingMore(true);
    }

    try {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(PAGE_SIZE),
      });
      const trimmedQuery = query.trim();
      if (trimmedQuery) params.set("q", trimmedQuery);
      if (filter !== "All") params.set("category", filter);

      const response = await fetch(`/api/public/projects?${params.toString()}`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || json?.success === false) throw new Error(json?.error || "Unable to load projects.");
      if (serial !== requestSerial.current) return;

      const rows = Array.isArray(json?.data) ? json.data : [];
      const pagination = json?.pagination || {};
      const meta = json?.meta || {};

      setProjects((current) => options.reset ? rows : mergeUniqueProjects(current, rows));
      setTotal(Number.isFinite(Number(pagination.total)) ? Number(pagination.total) : rows.length);
      if (Number.isFinite(Number(meta.publishedTotal))) setPublishedTotal(Number(meta.publishedTotal));
      if (Array.isArray(meta.categories)) setCategories(meta.categories);
      setError("");
    } catch (e: any) {
      if (serial !== requestSerial.current) return;
      setError(e?.message || "Unable to load projects.");
    } finally {
      if (serial === requestSerial.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }

  useEffect(() => {
    if (firstFilterPass.current) {
      firstFilterPass.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      void fetchProjects({ reset: true });
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, filter]);

  const hasMoreProjects = projects.length < total;
  const remainingProjects = Math.max(total - projects.length, 0);
  const nextBatchSize = Math.min(PAGE_SIZE, remainingProjects);
  const activeFilters = filter !== "All" || Boolean(query.trim());

  function clearFilters() {
    setQuery("");
    setFilter("All");
  }

  return (
    <main className="public-site portfolio-page">
      <PublicHeader />

      <section className="portfolio-hero">
        <div className="portfolio-wrap portfolio-hero-grid">
          <div>
            <span className="portfolio-kicker">LAND VIEW PROJECT PORTFOLIO</span>
            <h1>Designed with purpose. Built for Bangladesh.</h1>
            <p>Explore selected architectural and engineering work by LAND VIEW Engineers &amp; Architects. Only projects approved for public display appear here.</p>
          </div>
          <div className="portfolio-stats" aria-label="Portfolio summary">
            <div className="portfolio-stat"><strong>{publishedTotal}</strong><span>Published projects</span></div>
            <div className="portfolio-stat"><strong>{categories.length}</strong><span>Project categories</span></div>
          </div>
        </div>
      </section>

      <section className="portfolio-controls" aria-label="Project filters">
        <div className="portfolio-wrap">
          <div className="portfolio-control-row">
            <div className="portfolio-search">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                type="search"
                placeholder="Search project, location, service or ID…"
                aria-label="Search public projects"
              />
              {query && <button type="button" onClick={() => setQuery("")} aria-label="Clear project search">×</button>}
            </div>
            <div className="portfolio-result" aria-live="polite">
              Showing <strong style={{color:"var(--theme-ink-_fff, #fff)"}}>{projects.length}</strong> of {total} matching projects
            </div>
          </div>

          {categories.length > 0 && <div className="portfolio-filters">
            <button type="button" className={`portfolio-filter ${filter === "All" ? "active" : ""}`} onClick={() => setFilter("All")}>All<small>{publishedTotal}</small></button>
            {categories.map((category) => (
              <button
                type="button"
                key={category.name}
                className={`portfolio-filter ${filter === category.name ? "active" : ""}`}
                onClick={() => setFilter(category.name)}
              >
                {category.name}<small>{category.count}</small>
              </button>
            ))}
          </div>}
        </div>
      </section>

      <section className="portfolio-content">
        <div className="portfolio-wrap">
          {loading ? (
            <div className="portfolio-grid" aria-label="Loading projects"><div className="portfolio-skeleton"/><div className="portfolio-skeleton"/></div>
          ) : error && projects.length === 0 ? (
            <div className="portfolio-state"><div><strong>Projects could not be loaded.</strong><p>{error}</p><button type="button" onClick={() => void fetchProjects({ reset: true })}>Try again</button></div></div>
          ) : projects.length ? (
            <>
              <div className="portfolio-grid">
                {projects.map((project, index) => {
                  const id = String(project.projectId || "").trim();
                  const cover = imageUrl(project.coverImageUrl);
                  const services = (project.services || []).filter(Boolean);
                  const fallbackDescription = [project.stories ? `${project.stories} Stories` : "", project.area, project.completionYear].filter(Boolean).join(" · ");

                  return <Link className="portfolio-card" href={`/projects/${encodeURIComponent(id)}`} key={id || `${project.title}-${index}`} aria-label={`View ${project.title || id || "project"}`}>
                    <div className="portfolio-media">
                      {cover ? <img src={cover} alt={`${project.title || id || "LAND VIEW project"} preview`} loading={index < 2 ? "eager" : "lazy"} /> : <div className="portfolio-placeholder"/>}
                      <div className="portfolio-badges"><span className="portfolio-badge">{project.category || "LAND VIEW"}</span>{project.currentStage && <span className="portfolio-badge">{project.currentStage}</span>}</div>
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
                        {services.slice(0,3).map((service) => <span className="portfolio-service" key={service}>{service}</span>)}
                        {services.length > 3 && <span className="portfolio-service portfolio-more">+{services.length - 3} services</span>}
                      </div>}
                      <div className="portfolio-cta"><span>VIEW PROJECT</span><i>→</i></div>
                    </div>
                  </Link>;
                })}
              </div>

              {error && <div className="portfolio-state" style={{minHeight:"auto", marginTop:20}}><div><strong>More projects could not be loaded.</strong><p>{error}</p><button type="button" onClick={() => void fetchProjects({ reset: false })}>Try again</button></div></div>}

              {hasMoreProjects && !error && <div className="portfolio-load-more">
                <button type="button" disabled={loadingMore} onClick={() => void fetchProjects({ reset: false })}>
                  {loadingMore ? "LOADING PROJECTS…" : `LOAD ${nextBatchSize} MORE PROJECTS`}
                </button>
                <span>{remainingProjects} more project{remainingProjects === 1 ? "" : "s"} available</span>
              </div>}
            </>
          ) : (
            <div className="portfolio-state"><div><strong>No projects match your search.</strong><p>Try another location, project category, service or project ID.</p>{activeFilters && <button type="button" onClick={clearFilters}>Clear filters</button>}</div></div>
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
