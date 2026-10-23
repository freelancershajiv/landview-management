"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import PublicHeader from "@/components/public-header";

type PublicProject = {
  projectId?: string;
  title?: string;
  category?: string;
  location?: string;
  district?: string;
  currentStage?: string;
  area?: string;
  stories?: string;
  completionYear?: string;
  description?: string;
  coverImageUrl?: string;
  galleryImages?: string[];
  services?: string[];
  mapEnabled?: boolean;
  publicReady?: boolean;
};

type Props = { initialProjects: PublicProject[] };
const PAGE_SIZE = 12;
const STAGE_ORDER = ["Design Stage", "Approval Stage", "Supervision / Construction Stage", "Completed"];

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

function text(value?: string) {
  return String(value || "").trim();
}

function normalize(value?: string) {
  return text(value).toLowerCase();
}

function optionList(values: string[]) {
  return Array.from(new Set(values.map(text).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export default function PublicProjectListPaginated({ initialProjects }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [stage, setStage] = useState("All");
  const [district, setDistrict] = useState("All");
  const [service, setService] = useState("All");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const categories = useMemo(() => optionList(initialProjects.map((project) => text(project.category))), [initialProjects]);
  const districts = useMemo(() => optionList(initialProjects.map((project) => text(project.district))), [initialProjects]);
  const services = useMemo(() => optionList(initialProjects.flatMap((project) => project.services || [])), [initialProjects]);
  const stages = useMemo(() => {
    const available = optionList(initialProjects.map((project) => text(project.currentStage)));
    return [...STAGE_ORDER.filter((item) => available.includes(item)), ...available.filter((item) => !STAGE_ORDER.includes(item))];
  }, [initialProjects]);

  const mappedCount = useMemo(() => initialProjects.filter((project) => project.mapEnabled).length, [initialProjects]);
  const activeCount = useMemo(() => initialProjects.filter((project) => project.currentStage && project.currentStage !== "Completed").length, [initialProjects]);

  const filteredProjects = useMemo(() => {
    const tokens = normalize(query).split(/\s+/).filter(Boolean);
    return initialProjects.filter((project) => {
      if (category !== "All" && text(project.category) !== category) return false;
      if (stage !== "All" && text(project.currentStage) !== stage) return false;
      if (district !== "All" && text(project.district) !== district) return false;
      if (service !== "All" && !(project.services || []).some((item) => normalize(item) === normalize(service))) return false;
      if (!tokens.length) return true;
      const haystack = normalize([
        project.projectId,
        project.title,
        project.category,
        project.location,
        project.district,
        project.currentStage,
        project.area,
        project.stories,
        project.completionYear,
        project.description,
        ...(project.services || []),
      ].filter(Boolean).join(" "));
      return tokens.every((token) => haystack.includes(token));
    });
  }, [initialProjects, query, category, stage, district, service]);

  const visibleProjects = filteredProjects.slice(0, visibleCount);
  const hasMore = visibleCount < filteredProjects.length;
  const activeFilters = Boolean(query.trim()) || category !== "All" || stage !== "All" || district !== "All" || service !== "All";

  function updateFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setVisibleCount(PAGE_SIZE);
  }

  function clearFilters() {
    setQuery("");
    setCategory("All");
    setStage("All");
    setDistrict("All");
    setService("All");
    setVisibleCount(PAGE_SIZE);
  }

  return (
    <main className="projects-v2-page">
      <PublicHeader />

      <section className="pv2-hero">
        <div className="pv2-wrap pv2-hero-grid">
          <div>
            <span className="pv2-kicker">LAND VIEW PROJECT PORTFOLIO</span>
            <h1>Real projects. Real locations. Real consultancy scope.</h1>
            <p>Explore selected LAND VIEW architecture and engineering work using the information approved for public display. Filter by project type, current stage, district or service, then open a project for its published images and technical summary.</p>
            <div className="pv2-hero-actions">
              <Link href="/projects/map" className="pv2-btn pv2-btn-primary">Explore Project Map →</Link>
              <Link href="/services" className="pv2-btn">Explore Services</Link>
              <Link href="/contact" className="pv2-btn">Discuss a Project</Link>
            </div>
          </div>
          <div className="pv2-stats" aria-label="Public portfolio summary">
            <div className="pv2-stat"><strong>{initialProjects.length}</strong><span>Published projects</span></div>
            <div className="pv2-stat"><strong>{activeCount}</strong><span>Active stages</span></div>
            <div className="pv2-stat"><strong>{mappedCount}</strong><span>Mapped projects</span></div>
            <div className="pv2-stat"><strong>{districts.length}</strong><span>Districts represented</span></div>
          </div>
        </div>
      </section>

      <section className="pv2-controls" aria-label="Project filters">
        <div className="pv2-wrap">
          <div className="pv2-control-grid">
            <div className="pv2-field"><input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(PAGE_SIZE); }} type="search" placeholder="Search project, location, service or File ID…" aria-label="Search public projects" /></div>
            <div className="pv2-field"><select value={category} onChange={(event) => updateFilter(setCategory, event.target.value)} aria-label="Filter by project category"><option value="All">All categories</option>{categories.map((item) => <option value={item} key={item}>{item}</option>)}</select></div>
            <div className="pv2-field"><select value={stage} onChange={(event) => updateFilter(setStage, event.target.value)} aria-label="Filter by project stage"><option value="All">All stages</option>{stages.map((item) => <option value={item} key={item}>{item}</option>)}</select></div>
            <div className="pv2-field"><select value={district} onChange={(event) => updateFilter(setDistrict, event.target.value)} aria-label="Filter by district"><option value="All">All districts</option>{districts.map((item) => <option value={item} key={item}>{item}</option>)}</select></div>
            <div className="pv2-field"><select value={service} onChange={(event) => updateFilter(setService, event.target.value)} aria-label="Filter by service"><option value="All">All services</option>{services.map((item) => <option value={item} key={item}>{item}</option>)}</select></div>
            <button type="button" className="pv2-clear" disabled={!activeFilters} onClick={clearFilters}>Clear</button>
          </div>
          <div className="pv2-filter-summary" aria-live="polite">Showing <strong>{visibleProjects.length}</strong> of <strong>{filteredProjects.length}</strong> matching projects · {initialProjects.length} public projects total</div>
        </div>
      </section>

      <section className="pv2-content">
        <div className="pv2-wrap">
          {visibleProjects.length ? (
            <>
              <div className="pv2-grid">
                {visibleProjects.map((project, index) => {
                  const id = text(project.projectId);
                  const cover = imageUrl(project.coverImageUrl);
                  const projectServices = (project.services || []).map(text).filter(Boolean);
                  const href = id ? `/projects/${encodeURIComponent(id)}` : "/projects";
                  const fallback = [project.category, project.stories ? `${project.stories} Storeys` : "", project.area].filter(Boolean).join(" · ");
                  return (
                    <Link className="pv2-card" href={href} key={id || `${project.title}-${index}`}>
                      <div className="pv2-media">
                        {cover ? <img src={cover} alt={`${project.title || id || "LAND VIEW project"} preview`} loading={index < 3 ? "eager" : "lazy"} /> : <div className="pv2-placeholder" />}
                        <div className="pv2-badges"><span className="pv2-badge">{project.category || "LAND VIEW PROJECT"}</span>{project.mapEnabled ? <span className="pv2-badge pv2-map-badge">⌖ MAP</span> : null}</div>
                      </div>
                      <div className="pv2-card-body">
                        <div className="pv2-card-topline"><span className="pv2-id">{id || "LAND VIEW"}</span><span className="pv2-stage">{project.currentStage || "Project stage not published"}</span></div>
                        <h2>{project.title || id || "LAND VIEW Project"}</h2>
                        <div className="pv2-location">{project.location || project.district || "Location not published"}</div>
                        <p className="pv2-description">{project.description || fallback || "Selected architecture and engineering work by LAND VIEW Engineers & Architects."}</p>
                        <div className="pv2-facts">{project.stories ? <span className="pv2-fact">{project.stories} Storeys</span> : null}{project.area ? <span className="pv2-fact">{project.area}</span> : null}{project.completionYear ? <span className="pv2-fact">{project.completionYear}</span> : null}{project.district ? <span className="pv2-fact">{project.district}</span> : null}</div>
                        {projectServices.length ? <div className="pv2-services">{projectServices.slice(0, 3).map((item) => <span className="pv2-service" key={item}>{item}</span>)}{projectServices.length > 3 ? <span className="pv2-service">+{projectServices.length - 3} more</span> : null}</div> : null}
                        <div className="pv2-card-link"><span>View Project</span><i>→</i></div>
                      </div>
                    </Link>
                  );
                })}
              </div>
              {hasMore ? <div className="pv2-load-more"><button type="button" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>LOAD MORE PROJECTS</button><span>{filteredProjects.length - visibleProjects.length} more matching project{filteredProjects.length - visibleProjects.length === 1 ? "" : "s"}</span></div> : null}
            </>
          ) : (
            <div className="pv2-empty"><div><strong>No projects match these filters.</strong><span>Try a different district, service, stage or search term.</span>{activeFilters ? <div style={{ marginTop: 18 }}><button type="button" className="pv2-btn" onClick={clearFilters}>Clear Filters</button></div> : null}</div></div>
          )}
        </div>
      </section>

      <section className="pv2-footer-band">
        <div className="pv2-wrap"><div className="pv2-footer-card"><div><span className="pv2-kicker">PLAN A PROJECT WITH LAND VIEW</span><h2>See something relevant to your building?</h2><p>Send the location, intended use, approximate number of floors and the services you need. LAND VIEW can help define the appropriate architecture and engineering consultancy scope.</p></div><div className="pv2-hero-actions"><Link href="/contact" className="pv2-btn pv2-btn-primary">Contact LAND VIEW →</Link><Link href="/services" className="pv2-btn">Services</Link></div></div></div>
      </section>
    </main>
  );
}
