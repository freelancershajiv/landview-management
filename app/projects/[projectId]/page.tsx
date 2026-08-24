"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
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
  if (fileMatch?.[1]) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileMatch[1])}&sz=w1800`;
  try {
    const parsed = new URL(value);
    if (parsed.hostname === "drive.google.com") {
      const id = parsed.searchParams.get("id");
      if (id) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1800`;
    }
  } catch {}
  return value;
}

export default function PublicProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(String(params.projectId || ""));
  const [project, setProject] = useState<PublicProject | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/public/projects", { cache: "no-store" });
        const json = await response.json();
        const rows = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
        if (!cancelled) setProject(rows.find((item: PublicProject) => String(item.projectId || "") === projectId) || null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [projectId]);

  if (loading) return <main className="public-site"><PublicHeader /><section className="public-section"><div className="public-container"><div className="public-team-empty">Loading project...</div></div></section></main>;
  if (!project) return <main className="public-site"><PublicHeader /><section className="public-section"><div className="public-container"><div className="public-team-empty">Project not found or not available for public display.<br/><br/><Link href="/projects">← Back to Projects</Link></div></div></section></main>;

  const cover = imageUrl(project.coverImageUrl);
  const gallery = (project.galleryImages || []).map(imageUrl).filter(Boolean);

  return (
    <main className="public-site">
      <PublicHeader />
      <section className="public-section public-projects" style={{ paddingTop: 88 }}>
        <div className="public-container">
          <Link href="/projects" className="public-text-link">← All Projects</Link>
          <div className="public-section-head" style={{ marginTop: 28 }}>
            <div><span className="public-section-kicker">{project.category || "LAND VIEW PROJECT"}</span><h1 style={{ margin: 0, fontSize: "clamp(42px, 6vw, 76px)", lineHeight: .95, letterSpacing: "-.05em" }}>{project.title}</h1></div>
            <p>{project.description}</p>
          </div>

          {cover && (
            <div style={{ width: "100%", display: "flex", justifyContent: "center", alignItems: "center", marginBottom: 34 }}>
              <img
                src={cover}
                alt={project.title || "LAND VIEW project"}
                style={{ width: "100%", height: "auto", maxHeight: 900, objectFit: "contain", objectPosition: "center", borderRadius: 18, display: "block" }}
              />
            </div>
          )}

          <div className="public-project-grid" style={{ marginBottom: 40 }}>
            <article className="public-project-card"><div className="public-project-copy"><small>PROJECT ID</small><h3>{project.projectId}</h3><p>{project.location || "Location not published"}</p></div></article>
            <article className="public-project-card"><div className="public-project-copy"><small>BUILDING</small><h3>{project.stories ? `${project.stories} Stories` : project.category || "Project"}</h3><p>{project.area || "Project area not published"}</p></div></article>
            <article className="public-project-card"><div className="public-project-copy"><small>STATUS / YEAR</small><h3>{project.status || "—"}</h3><p>{project.completionYear || "Year not published"}</p></div></article>
          </div>

          {project.services?.length ? <section style={{ marginBottom: 48 }}><span className="public-section-kicker">LAND VIEW SERVICES</span><h2>{project.services.join(" • ")}</h2></section> : null}

          {gallery.length ? (
            <div className="public-project-grid">
              {gallery.map((src, index) => (
                <article className="public-project-card" key={src + index} style={{ display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  <img
                    src={src}
                    alt={`${project.title || "Project"} gallery ${index + 1}`}
                    style={{ width: "100%", height: "auto", maxHeight: 760, objectFit: "contain", objectPosition: "center", display: "block" }}
                  />
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
