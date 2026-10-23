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
};

type Props = {
  initialProject: PublicProject | null;
  relatedProjects?: PublicProject[];
};

function imageUrl(url?: string, size = "w1800") {
  const value = String(url || "").trim();
  if (!value) return "";
  const fileMatch = value.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  if (fileMatch?.[1]) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileMatch[1])}&sz=${size}`;
  try {
    const parsed = new URL(value);
    if (parsed.hostname === "drive.google.com") {
      const id = parsed.searchParams.get("id");
      if (id) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=${size}`;
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
  const subject = project.title || project.projectId || "This LAND VIEW project";
  const location = project.location ? ` in ${project.location}` : "";
  const category = project.category ? ` The published project category is ${project.category}.` : "";
  const building = project.stories ? ` The public record lists ${project.stories} storeys.` : "";
  const area = project.area ? ` The published area is ${project.area}.` : "";
  const stage = project.currentStage ? ` Its current published stage is ${project.currentStage}.` : "";
  return `${subject}${location} is part of the LAND VIEW public architecture and engineering portfolio.${category}${building}${area}${stage}`;
}

export default function PublicProjectDetailPage({ initialProject, relatedProjects = [] }: Props) {
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
        // Keep the unavailable state if the public backend cannot respond.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [projectId, initialProject]);

  useEffect(() => {
    if (!fullImage) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setFullImage(null); };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [fullImage]);

  if (loading) return <main className="project-detail-v2"><PublicHeader /><section className="pv2-content"><div className="pv2-wrap"><div className="pv2-empty"><div><strong>Loading project…</strong><span>Retrieving the public LAND VIEW project record.</span></div></div></div></section></main>;
  if (!project) return <main className="project-detail-v2"><PublicHeader /><section className="pv2-content"><div className="pv2-wrap"><div className="pv2-empty"><div><strong>Project not available.</strong><span>This project was not found or is not approved for public display.</span><div style={{ marginTop: 18 }}><Link className="pv2-btn" href="/projects">← Back to Projects</Link></div></div></div></div></section></main>;

  const cover = imageUrl(project.coverImageUrl);
  const gallery = Array.from(new Set((project.galleryImages || []).map((item) => imageUrl(item)).filter(Boolean))).filter((src) => src !== cover);
  const altBase = [project.title || project.projectId || "LAND VIEW project", project.category, project.district || project.location].filter(Boolean).join(" — ");
  const displayOverview = project.description || overview(project);
  const whatsappMessage = `Hello LAND VIEW, I would like to discuss a project similar to ${project.projectId || project.title || "a project on your website"}. My project location: ____. Proposed building type/floors: ____. Services needed: ____.`;
  const whatsappUrl = `https://wa.me/8801902500400?text=${encodeURIComponent(whatsappMessage)}`;

  return (
    <main className="project-detail-v2">
      <PublicHeader />

      <section className="pdv2-hero">
        <div className="pv2-wrap">
          <nav className="pdv2-breadcrumb" aria-label="Breadcrumb"><Link href="/">Home</Link><span>/</span><Link href="/projects">Projects</Link><span>/</span><span>{project.projectId || project.title}</span></nav>
          <div className="pdv2-head">
            <div>
              <span className="pv2-kicker">{project.category || "LAND VIEW PROJECT"}</span>
              <h1>{project.title || project.projectId || "LAND VIEW Project"}</h1>
              <p>{displayOverview}</p>
              <div className="pdv2-actions">
                <a className="pv2-btn pv2-btn-primary" href={whatsappUrl} target="_blank" rel="noopener noreferrer">Discuss on WhatsApp →</a>
                {project.mapEnabled ? <Link className="pv2-btn" href="/projects/map">View Project Map</Link> : null}
                <Link className="pv2-btn" href="/projects">All Projects</Link>
              </div>
            </div>
            <aside className="pdv2-head-aside">
              <small>PROJECT IDENTIFICATION</small>
              <strong>{project.projectId || "LAND VIEW"}</strong>
              <span>{project.currentStage || "Project stage not published"}</span>
              <span>{project.location || project.district || "Location not published"}</span>
            </aside>
          </div>
        </div>
      </section>

      {cover ? <section className="pdv2-visual"><div className="pv2-wrap"><figure className="pdv2-cover"><button type="button" aria-label="Open project cover image full screen" onClick={() => setFullImage({ src: cover, alt: altBase })}><img src={cover} alt={altBase} /></button><figcaption className="pdv2-cover-caption"><span>{project.title || project.projectId || "LAND VIEW Project"}</span><span>Click image to enlarge</span></figcaption></figure></div></section> : null}

      <section className="pdv2-main">
        <div className="pv2-wrap pdv2-layout">
          <div className="pdv2-stack">
            <article className="pdv2-panel">
              <span className="pv2-kicker">PROJECT OVERVIEW</span>
              <h2>Published project information</h2>
              <p>{overview(project)}</p>
              {project.description ? <p style={{ marginTop: 14 }}>{project.description}</p> : null}
            </article>

            <article className="pdv2-panel">
              <span className="pv2-kicker">PROJECT DATA</span>
              <h2>At a glance</h2>
              <div className="pdv2-facts">
                <div className="pdv2-fact"><small>Project ID</small><strong>{project.projectId || "Not published"}</strong></div>
                <div className="pdv2-fact"><small>Category</small><strong>{project.category || "Not published"}</strong></div>
                <div className="pdv2-fact"><small>Current Stage</small><strong>{project.currentStage || "Not published"}</strong></div>
                <div className="pdv2-fact"><small>District</small><strong>{project.district || "Not published"}</strong></div>
                <div className="pdv2-fact"><small>Storeys</small><strong>{project.stories || "Not published"}</strong></div>
                <div className="pdv2-fact"><small>Area</small><strong>{project.area || "Not published"}</strong></div>
                <div className="pdv2-fact"><small>Completion Year</small><strong>{project.completionYear || "Not published"}</strong></div>
                <div className="pdv2-fact"><small>Map</small><strong>{project.mapEnabled ? "Available" : "Not published"}</strong></div>
              </div>
            </article>

            {project.services?.length ? <article className="pdv2-panel"><span className="pv2-kicker">LAND VIEW CONSULTANCY SCOPE</span><h2>Services published for this project</h2><p style={{ marginBottom: 18 }}>Open a service to understand its typical scope, deliverables and preparation requirements.</p><div className="pdv2-service-list">{project.services.map((service) => <Link key={service} href={serviceHref(service)}>{service} →</Link>)}</div></article> : null}
          </div>

          <aside className="pdv2-side">
            <div className="pdv2-panel"><span className="pv2-kicker">LOCATION</span><h2>Project location</h2><p>{project.location || project.district || "A detailed public location has not been published for this project."}</p>{project.mapEnabled ? <div className="pdv2-side-links"><Link href="/projects/map">Open public project map <span>→</span></Link></div> : null}</div>
            <div className="pdv2-panel"><span className="pv2-kicker">EXPLORE LAND VIEW</span><h2>Continue exploring</h2><div className="pdv2-side-links"><Link href="/projects">All projects <span>→</span></Link><Link href="/services">Architecture & engineering services <span>→</span></Link><Link href="/team">Meet the team <span>→</span></Link><Link href="/contact">Contact LAND VIEW <span>→</span></Link></div></div>
          </aside>
        </div>
      </section>

      {gallery.length ? <section className="pdv2-gallery"><div className="pv2-wrap"><div className="pdv2-gallery-head"><div><span className="pv2-kicker">PROJECT GALLERY</span><h2>Published project images</h2></div><p>These images come from the public project record. Select an image to view it full screen.</p></div><div className="pdv2-gallery-grid">{gallery.map((src, index) => { const alt = `${altBase} — image ${index + 1}`; return <button type="button" className="pdv2-gallery-item" key={`${src}-${index}`} onClick={() => setFullImage({ src, alt })} aria-label={`Open project image ${index + 1} full screen`}><img src={src} alt={alt} loading="lazy" /></button>; })}</div></div></section> : null}

      {relatedProjects.length ? <section className="pdv2-related"><div className="pv2-wrap"><div className="pdv2-related-head"><div><span className="pv2-kicker">RELATED PROJECTS</span><h2>Continue through the portfolio</h2></div><p>Related projects are selected from shared category, location, stage and LAND VIEW service information.</p></div><div className="pdv2-related-grid">{relatedProjects.map((item, index) => { const id = String(item.projectId || "").trim(); const image = imageUrl(item.coverImageUrl, "w1000"); return <Link href={id ? `/projects/${encodeURIComponent(id)}` : "/projects"} className="pdv2-related-card" key={id || `${item.title}-${index}`}><div className="pdv2-related-image">{image ? <img src={image} alt={`${item.title || id || "LAND VIEW project"} preview`} loading="lazy" /> : null}</div><div className="pdv2-related-copy"><small>{id || item.category || "LAND VIEW PROJECT"}</small><h3>{item.title || id || "LAND VIEW Project"}</h3><span>{[item.category, item.district, item.currentStage].filter(Boolean).join(" · ")}</span></div></Link>; })}</div></div></section> : null}

      <section className="pdv2-cta"><div className="pv2-wrap"><div className="pdv2-cta-card"><div><span className="pv2-kicker">PLANNING YOUR OWN PROJECT?</span><h2>Use the portfolio as a starting point, not a template.</h2><p>Every site and building brief needs its own architecture and engineering decisions. Share your location, intended use, approximate floor count and required services so LAND VIEW can define an appropriate consultancy scope.</p></div><div className="pdv2-cta-actions"><a className="pv2-btn pv2-btn-primary" href={whatsappUrl} target="_blank" rel="noopener noreferrer">WhatsApp 01902 500 400 →</a><Link className="pv2-btn" href="/contact">Contact Details</Link></div></div></div></section>

      {fullImage ? <div className="pdv2-modal" role="dialog" aria-modal="true" aria-label="Full screen project image" onClick={() => setFullImage(null)}><img src={fullImage.src} alt={fullImage.alt} /></div> : null}
    </main>
  );
}
