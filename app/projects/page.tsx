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

export default function PublicProjectsPage() {
  const [projects, setProjects] = useState<PublicProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/public/projects", { cache: "no-store" });
        const json = await response.json();
        if (!response.ok || json?.success === false) throw new Error(json?.error || "Unable to load projects.");
        const rows = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
        if (!cancelled) setProjects(rows);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Unable to load projects.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const categories = useMemo(() => {
    const values = Array.from(new Set(projects.map(p => String(p.category || "").trim()).filter(Boolean)));
    return ["All", ...values];
  }, [projects]);

  const filtered = useMemo(
    () => filter === "All" ? projects : projects.filter(p => p.category === filter),
    [projects, filter]
  );

  return (
    <main className="public-site">
      <PublicHeader />

      <section className="public-section public-projects" style={{ paddingTop: 88 }}>
        <div className="public-container">
          <div className="public-section-head">
            <div>
              <span className="public-section-kicker">PROJECT PORTFOLIO</span>
              <h1 style={{ margin: 0, fontSize: "clamp(42px, 6vw, 76px)", lineHeight: .95, letterSpacing: "-.05em" }}>Selected LAND VIEW projects.</h1>
            </div>
            <p>Public architectural and engineering work by LAND VIEW Engineers &amp; Architects. Only projects approved for public display are shown here.</p>
          </div>

          {categories.length > 1 && (
            <div className="public-quick-links" style={{ marginBottom: 34, flexWrap: "wrap" }}>
              {categories.map(category => (
                <button
                  type="button"
                  key={category}
                  onClick={() => setFilter(category)}
                  className={filter === category ? "dark" : ""}
                  style={{ cursor: "pointer" }}
                >
                  {category}
                </button>
              ))}
            </div>
          )}

          {loading ? (
            <div className="public-team-empty">Loading projects...</div>
          ) : error ? (
            <div className="public-team-empty">{error}</div>
          ) : filtered.length ? (
            <div className="public-project-grid">
              {filtered.map((project, index) => {
                const cover = imageUrl(project.coverImageUrl);
                return (
                  <article className="public-project-card" key={project.projectId || `${project.title}-${index}`}>
                    <div
                      className="public-project-art"
                      style={cover ? {
                        backgroundImage: `url(${cover})`,
                        backgroundSize: "contain",
                        backgroundPosition: "center",
                        backgroundRepeat: "no-repeat"
                      } : undefined}
                    >
                      {!cover && <div className="public-project-lines" />}
                      <span>{project.category || project.status || "LAND VIEW"}</span>
                    </div>
                    <div className="public-project-copy">
                      <small>{project.projectId || "LAND VIEW PROJECT"}</small>
                      <h2>{project.title || "Untitled Project"}</h2>
                      <p>{project.description || [project.location, project.stories ? `${project.stories} Storied` : "", project.area].filter(Boolean).join(" · ")}</p>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "16px 0" }}>
                        {project.location && <span>{project.location}</span>}
                        {project.stories && <span>{project.stories} Stories</span>}
                        {project.area && <span>{project.area}</span>}
                        {project.completionYear && <span>{project.completionYear}</span>}
                      </div>
                      {project.services?.length ? <p><strong>Services:</strong> {project.services.join(" • ")}</p> : null}
                      <Link className="public-project-link" href={`/projects/${encodeURIComponent(project.projectId || "")}`}>View Project →</Link>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="public-team-empty">No public projects have been published yet.</div>
          )}
        </div>
      </section>

      <footer className="public-footer">
        <div className="public-container public-footer-grid">
          <div className="public-footer-brand"><img src="/land-view-logo.png" alt="LAND VIEW" /><div><strong>LAND VIEW</strong><span>ENGINEERS &amp; ARCHITECTS</span></div></div>
          <div className="public-footer-links"><Link href="/#about">About</Link><Link href="/#services">Services</Link><Link href="/projects">Projects</Link><Link href="/#team">Team</Link><Link href="/#contact">Contact</Link></div>
          <div className="public-footer-copy"><span>© 2026 LAND VIEW</span><small>Engineers &amp; Architects</small></div>
        </div>
      </footer>
    </main>
  );
}
