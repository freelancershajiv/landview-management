"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";

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
};

type Slide = {
  src: string;
  project: PublicProject;
  imageNumber: number;
  projectImageCount: number;
};

type Props = { projects: PublicProject[] };

function text(value?: string) {
  return String(value || "").trim();
}

function normalize(value?: string) {
  return text(value).toLowerCase();
}

function imageUrl(url?: string, size = "w1800") {
  const value = text(url);
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

function projectImages(project: PublicProject) {
  const urls = [project.coverImageUrl, ...(project.galleryImages || [])]
    .map((item) => imageUrl(item))
    .filter(Boolean);
  return Array.from(new Set(urls));
}

function buildSlides(projects: PublicProject[]) {
  return projects.flatMap((project) => {
    const images = projectImages(project);
    return images.map((src, index) => ({
      src,
      project,
      imageNumber: index + 1,
      projectImageCount: images.length,
    }));
  });
}

function readCurrentFilters() {
  if (typeof document === "undefined") {
    return { query: "", category: "All", stage: "All", district: "All", service: "All" };
  }
  const query = document.querySelector<HTMLInputElement>('input[aria-label="Search public projects"]')?.value || "";
  const category = document.querySelector<HTMLSelectElement>('select[aria-label="Filter by project category"]')?.value || "All";
  const stage = document.querySelector<HTMLSelectElement>('select[aria-label="Filter by project stage"]')?.value || "All";
  const district = document.querySelector<HTMLSelectElement>('select[aria-label="Filter by district"]')?.value || "All";
  const service = document.querySelector<HTMLSelectElement>('select[aria-label="Filter by service"]')?.value || "All";
  return { query, category, stage, district, service };
}

function filterProjects(projects: PublicProject[]) {
  const { query, category, stage, district, service } = readCurrentFilters();
  const tokens = normalize(query).split(/\s+/).filter(Boolean);

  return projects.filter((project) => {
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
}

export default function PublicProjectSlideshow({ projects }: Props) {
  const [portalTarget, setPortalTarget] = useState<Element | null>(null);
  const [open, setOpen] = useState(false);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const viewerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchStartX = useRef<number | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const hasAnyImages = useMemo(() => projects.some((project) => projectImages(project).length > 0), [projects]);

  useEffect(() => {
    setPortalTarget(document.querySelector(".pv2-hero-actions"));
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "ArrowRight") setIndex((value) => slides.length ? (value + 1) % slides.length : 0);
      if (event.key === "ArrowLeft") setIndex((value) => slides.length ? (value - 1 + slides.length) % slides.length : 0);
      if (event.key === " " && event.target === document.body) {
        event.preventDefault();
        setPlaying((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      previousFocus.current?.focus();
    };
  }, [open, slides.length]);

  useEffect(() => {
    if (!open || !playing || slides.length < 2) return;
    const timer = window.setInterval(() => {
      setIndex((value) => (value + 1) % slides.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, [open, playing, slides.length]);

  useEffect(() => {
    const onFullscreenChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  function openSlideshow() {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const nextSlides = buildSlides(filterProjects(projects));
    setSlides(nextSlides);
    setIndex(0);
    setPlaying(false);
    setOpen(true);
  }

  function closeSlideshow() {
    setPlaying(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    setOpen(false);
  }

  function next() {
    if (!slides.length) return;
    setIndex((value) => (value + 1) % slides.length);
  }

  function previous() {
    if (!slides.length) return;
    setIndex((value) => (value - 1 + slides.length) % slides.length);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await viewerRef.current?.requestFullscreen();
    } catch {
      // Fullscreen can be unavailable or blocked by the browser.
    }
  }

  function onTouchStart(event: React.TouchEvent) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function onTouchEnd(event: React.TouchEvent) {
    if (touchStartX.current === null) return;
    const endX = event.changedTouches[0]?.clientX ?? touchStartX.current;
    const distance = endX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(distance) < 48) return;
    if (distance < 0) next();
    else previous();
  }

  if (!hasAnyImages) return null;

  const current = slides[index];
  const id = text(current?.project.projectId);
  const title = current?.project.title || id || "LAND VIEW Project";
  const location = current?.project.location || current?.project.district || "Location not published";
  const projectHref = id ? `/projects/${encodeURIComponent(id)}` : "/projects";

  const trigger = portalTarget ? createPortal(
    <button type="button" className="pv2-btn pv2-slideshow-trigger" onClick={openSlideshow} aria-haspopup="dialog">
      <span aria-hidden="true">▶</span> Slideshow
    </button>,
    portalTarget,
  ) : null;

  return <>
    {trigger}
    {open ? <div className="pv2-slideshow-modal" role="dialog" aria-modal="true" aria-label="LAND VIEW project slideshow">
      <div className="pv2-slideshow-shell" ref={viewerRef}>
        <header className="pv2-slideshow-header">
          <div className="pv2-slideshow-heading">
            <span className="pv2-slideshow-id">{current ? (id || current.project.category || "LAND VIEW PROJECT") : "LAND VIEW PROJECTS"}</span>
            <strong>{current ? title : "Project Slideshow"}</strong>
            <small>{current ? location : "No published images match the current project filters."}</small>
          </div>
          <div className="pv2-slideshow-header-actions">
            {current ? <span className="pv2-slideshow-count">{index + 1} / {slides.length}</span> : null}
            <button ref={closeRef} type="button" className="pv2-slideshow-icon-btn" onClick={closeSlideshow} aria-label="Close slideshow">×</button>
          </div>
        </header>

        {current ? <div className="pv2-slideshow-stage" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <img src={current.src} alt={`${title} — published project image ${current.imageNumber}`} />
          {slides.length > 1 ? <>
            <button type="button" className="pv2-slideshow-nav pv2-slideshow-prev" onClick={previous} aria-label="Previous project image">‹</button>
            <button type="button" className="pv2-slideshow-nav pv2-slideshow-next" onClick={next} aria-label="Next project image">›</button>
          </> : null}
          <div className="pv2-slideshow-caption">
            <span>{[current.project.category, current.project.currentStage].filter(Boolean).join(" · ") || "LAND VIEW Engineers & Architects"}</span>
            <span>Image {current.imageNumber} of {current.projectImageCount} for this project</span>
          </div>
        </div> : <div className="pv2-slideshow-empty">
          <strong>No slideshow images found.</strong>
          <span>Change or clear the project filters, then open Slideshow again.</span>
          <button type="button" className="pv2-btn" onClick={closeSlideshow}>Close</button>
        </div>}

        {current ? <footer className="pv2-slideshow-footer">
          <div className="pv2-slideshow-thumbs" aria-label="Slideshow thumbnails">
            {slides.map((slide, slideIndex) => {
              const slideId = text(slide.project.projectId) || slide.project.title || "LAND VIEW";
              return <button type="button" key={`${slide.src}-${slideIndex}`} className={slideIndex === index ? "is-active" : ""} onClick={() => setIndex(slideIndex)} aria-label={`Show ${slideId}, image ${slide.imageNumber}`} aria-current={slideIndex === index ? "true" : undefined}>
                <img src={imageUrl(slide.src, "w300")} alt="" loading="lazy" />
                <span>{slideId}</span>
              </button>;
            })}
          </div>
          <div className="pv2-slideshow-toolbar">
            <div className="pv2-slideshow-toolbar-group">
              <button type="button" className="pv2-btn" onClick={() => setPlaying((value) => !value)} aria-pressed={playing}>{playing ? "❚❚ Pause" : "▶ Play"}</button>
              <button type="button" className="pv2-btn" onClick={toggleFullscreen}>{fullscreen ? "Exit Fullscreen" : "⛶ Fullscreen"}</button>
            </div>
            <Link className="pv2-btn pv2-btn-primary" href={projectHref} onClick={() => setOpen(false)}>View Project →</Link>
          </div>
        </footer> : null}
      </div>
    </div> : null}
  </>;
}
