"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import PublicHeader from "@/components/public-header";
import { publicServices } from "@/lib/public-services";

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

function normalize(value?: string) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function serviceHref(serviceName: string) {
  const wanted = normalize(serviceName);
  const exact = publicServices.find((service) => normalize(service.name) === wanted);
  if (exact) return `/services/${exact.slug}`;
  const partial = publicServices.find((service) => wanted.includes(normalize(service.name)) || normalize(service.name).includes(wanted));
  return partial ? `/services/${partial.slug}` : "/services";
}

function overview(project: PublicProject) {
  const subject = project.title || project.category || "This LAND VIEW project";
  const location = project.location ? ` in ${project.location}` : "";
  const building = project.stories ? ` The published project data records ${project.stories} stories` : "";
  const area = project.area ? `${building ? " and" : " The published project data records"} an area of ${project.area}` : "";
  const scope = project.services?.length ? ` LAND VIEW's published scope includes ${project.services.join(", ")}.` : "";
  return `${subject}${location} is part of the LAND VIEW public architecture and engineering portfolio.${building}${area}.${scope}`.replace("..", ".");
}

export default function PublicProjectDetailPage({ initialProject }: { initialProject: PublicProject | null }) {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(String(params.projectId || ""));
  const [project, setProject] = useState<PublicProject | null>(initialProject);
  const [loading, setLoading] = useState(!initialProject);
  const [fullImage, setFullImage] = useState<{ src: string; alt: string } | null>(null);

  useEffect(() => {
    if (initialProject) return;
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/public/projects", { cache: "no-store" });
        const json = await response.json();
        const rows = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : [];
        if (!cancelled) setProject(rows.find((item: PublicProject) => String(item.projectId || "") === projectId) || null);
      } catch {
        // Preserve the unavailable state when the public backend cannot respond.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [projectId, initialProject]);

  useEffect(() => {
    if (!fullImage) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullImage(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [fullImage]);

  if (loading) return <main className="public-site"><PublicHeader /><section className="public-section"><div className="public-container"><div className="public-team-empty">Loading project...</div></div></section></main>;
  if (!project) return <main className="public-site"><PublicHeader /><section className="public-section"><div className="public-container"><div className="public-team-empty">Project not found or not available for public display.<br/><br/><Link href="/projects">← Back to Projects</Link></div></div></section></main>;

  const cover = imageUrl(project.coverImageUrl);
  const gallery = (project.galleryImages || []).map(imageUrl).filter(Boolean);
  const openImage = (src: string, alt: string) => setFullImage({ src, alt });
  const projectAlt = [project.title || "LAND VIEW project", project.category, project.location].filter(Boolean).join(" — ");

  return (
    <main className="public-site">
      <PublicHeader />
      <section className="public-section public-projects" style={{ paddingTop: 88 }}>
        <div className="public-container">
          <nav aria-label="Breadcrumb" style={{ marginBottom: 18 }}><Link href="/" className="public-text-link">Home</Link><span aria-hidden="true"> / </span><Link href="/projects" className="public-text-link">Projects</Link><span aria-hidden="true"> / </span><span>{project.title || project.projectId}</span></nav>
          <div className="public-section-head" style={{ marginTop: 28 }}>
            <div><span className="public-section-kicker">{project.category || "LAND VIEW PROJECT"}</span><h1 style={{ margin: 0, fontSize: "clamp(42px, 6vw, 76px)", lineHeight: .95, letterSpacing: "-.05em" }}>{project.title || project.projectId}</h1></div>
            <p>{project.description || overview(project)}</p>
          </div>

          {cover && (
            <figure style={{ width: "100%", margin: "0 0 34px", display: "flex", flexDirection: "column", gap: 10 }}>
              <img
                src={cover}
                alt={projectAlt}
                onClick={() => openImage(cover, projectAlt)}
                title="Click to view full screen"
                style={{ width: "100%", height: "auto", maxHeight: 900, objectFit: "contain", objectPosition: "center", borderRadius: 18, display: "block", cursor: "zoom-in" }}
              />
              <figcaption style={{ color: "#8d99a3", fontSize: 12 }}>{project.title || "LAND VIEW project"}{project.location ? ` · ${project.location}` : ""}</figcaption>
            </figure>
          )}

          <section aria-labelledby="project-overview" style={{ marginBottom: 46, padding: "28px", border: "1px solid #2b3843", background: "#101a24", borderRadius: 14 }}>
            <span className="public-section-kicker">PROJECT CASE STUDY</span>
            <h2 id="project-overview" style={{ marginTop: 8 }}>Project overview</h2>
            <p style={{ maxWidth: 900, color: "#b5bec6", lineHeight: 1.8 }}>{overview(project)}</p>
            {project.description ? <p style={{ maxWidth: 900, color: "#b5bec6", lineHeight: 1.8 }}>{project.description}</p> : null}
          </section>

          <div className="public-project-grid" style={{ marginBottom: 40 }}>
            <article className="public-project-card"><div className="public-project-copy"><small>PROJECT ID</small><h3>{project.projectId}</h3><p>{project.location || "Location not published"}</p></div></article>
            <article className="public-project-card"><div className="public-project-copy"><small>BUILDING</small><h3>{project.stories ? `${project.stories} Stories` : project.category || "Project"}</h3><p>{project.area || "Project area not published"}</p></div></article>
            <article className="public-project-card"><div className="public-project-copy"><small>STATUS / YEAR</small><h3>{project.status || "—"}</h3><p>{project.completionYear || "Year not published"}</p></div></article>
          </div>

          {project.services?.length ? <section style={{ marginBottom: 48 }}>
            <span className="public-section-kicker">LAND VIEW CONSULTANCY SCOPE</span>
            <h2 style={{ marginBottom: 18 }}>Services published for this project</h2>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{project.services.map((service) => <Link key={service} href={serviceHref(service)} style={{ padding: "11px 14px", border: "1px solid rgba(239,74,80,.5)", borderRadius: 8, color: "#fff", background: "#0d1721", fontSize: 13 }}>{service} →</Link>)}</div>
          </section> : null}

          {gallery.length ? (
            <section aria-labelledby="project-gallery">
              <span className="public-section-kicker">PROJECT GALLERY</span>
              <h2 id="project-gallery" style={{ marginBottom: 22 }}>Published project images</h2>
              <div className="public-project-grid">
                {gallery.map((src, index) => {
                  const alt = `${projectAlt} — project image ${index + 1}`;
                  return (
                    <figure className="public-project-card" key={src + index} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", overflow: "hidden", margin: 0 }}>
                      <img
                        src={src}
                        alt={alt}
                        onClick={() => openImage(src, alt)}
                        title="Click to view full screen"
                        style={{ width: "100%", height: "auto", maxHeight: 760, objectFit: "contain", objectPosition: "center", display: "block", cursor: "zoom-in" }}
                      />
                    </figure>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section style={{ marginTop: 54, paddingTop: 30, borderTop: "1px solid #2b3843" }}>
            <span className="public-section-kicker">PLANNING A PROJECT?</span>
            <h2>Discuss architecture and engineering consultancy with LAND VIEW.</h2>
            <p style={{ maxWidth: 760, color: "#9ba6af", lineHeight: 1.75 }}>Share your project location, building type and required services. LAND VIEW can confirm an appropriate consultancy scope and whether site attendance is practical for the location.</p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 20 }}><Link href="/contact" className="public-text-link">Contact LAND VIEW →</Link><Link href="/services" className="public-text-link">Explore services →</Link><Link href="/bn" className="public-text-link">বাংলায় পড়ুন →</Link></div>
          </section>
        </div>
      </section>

      {fullImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Full screen project image"
          onClick={() => setFullImage(null)}
          style={{ position: "fixed", inset: 0, zIndex: 99999, background: "rgba(0,0,0,.94)", display: "flex", alignItems: "center", justifyContent: "center", padding: "clamp(12px, 2vw, 28px)", cursor: "zoom-out" }}
        >
          <img src={fullImage.src} alt={fullImage.alt} onClick={() => setFullImage(null)} style={{ width: "auto", height: "auto", maxWidth: "100%", maxHeight: "100%", objectFit: "contain", objectPosition: "center", display: "block", cursor: "zoom-out", userSelect: "none" }} />
        </div>
      )}
    </main>
  );
}
