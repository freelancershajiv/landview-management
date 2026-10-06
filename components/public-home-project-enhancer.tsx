"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

type FeaturedProject = {
  projectId?: string;
  title?: string;
  category?: string;
  location?: string;
  currentStage?: string;
  area?: string;
  stories?: string;
  coverImageUrl?: string;
  curated?: boolean;
};

function imageUrl(url?: string) {
  const value = String(url || "").trim();
  if (!value) return "";
  const match = value.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  if (match?.[1]) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(match[1])}&sz=w1200`;
  return value;
}

function makeCard(project: FeaturedProject) {
  const article = document.createElement("article");
  article.className = "lv-project-card lv-real-project-card";
  article.dataset.lvRealProject = "true";

  const cover = imageUrl(project.coverImageUrl);
  if (cover) {
    const media = document.createElement("div");
    media.className = "lv-real-project-media";
    media.style.backgroundImage = `linear-gradient(180deg,rgba(4,10,16,.05),rgba(4,10,16,.72)),url(${JSON.stringify(cover).slice(1, -1)})`;
    article.appendChild(media);
  }

  const badge = document.createElement("span");
  badge.textContent = `${project.curated ? "CURATED · " : ""}${project.category || "PROJECT"}`;
  article.appendChild(badge);

  const title = document.createElement("h3");
  title.textContent = project.title || project.projectId || "LAND VIEW Project";
  article.appendChild(title);

  const details = document.createElement("p");
  details.textContent = [project.location, project.stories ? `${project.stories} storey` : "", project.area, project.currentStage]
    .filter(Boolean).join(" · ");
  article.appendChild(details);

  const link = document.createElement("a");
  link.href = project.projectId ? `/projects/${encodeURIComponent(project.projectId)}` : "/projects";
  link.textContent = "View Project →";
  article.appendChild(link);
  return article;
}

export default function PublicHomeProjectEnhancer() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/") return;
    let cancelled = false;
    let observer: MutationObserver | null = null;
    let projects: FeaturedProject[] = [];
    let applying = false;

    function addMapToFooter() {
      const footerLinks = document.querySelector<HTMLElement>(".lv-footer-links");
      if (!footerLinks || footerLinks.querySelector("[data-lv-footer-map]")) return;
      const link = document.createElement("a");
      link.href = "/projects/map";
      link.textContent = "Map";
      link.dataset.lvFooterMap = "true";
      footerLinks.insertBefore(link, footerLinks.querySelector('a[href="/team"]') || null);
    }

    function applyProjects() {
      if (cancelled || applying || !projects.length) return;
      const target = document.querySelector<HTMLElement>(".lv-projects-grid");
      if (!target) return;
      const signature = projects.map((item) => item.projectId).join("|");
      if (target.dataset.lvCuratedSignature === signature && target.querySelector("[data-lv-real-project]")) return;
      applying = true;
      const fragment = document.createDocumentFragment();
      projects.forEach((project) => fragment.appendChild(makeCard(project)));
      target.replaceChildren(fragment);
      target.dataset.lvCuratedSignature = signature;
      applying = false;
    }

    async function load() {
      try {
        const response = await fetch("/api/public/featured-projects", { cache: "no-store" });
        const json = await response.json();
        if (cancelled || !response.ok || !json?.success) return;
        projects = Array.isArray(json.data) ? json.data : [];
        applyProjects();
        addMapToFooter();
        observer = new MutationObserver(() => {
          if (applying) return;
          applyProjects();
          addMapToFooter();
        });
        observer.observe(document.body, { subtree: true, childList: true });
      } catch {
        addMapToFooter();
      }
    }

    const timer = window.setTimeout(() => void load(), 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      observer?.disconnect();
    };
  }, [pathname]);

  if (pathname !== "/") return null;
  return <style>{`
    .lv-projects-grid.lv-curated-projects{align-items:stretch}
    .lv-real-project-card{position:relative;overflow:hidden;min-height:320px!important;padding-top:165px!important}
    .lv-real-project-media{position:absolute;inset:0 0 auto;height:150px;background-position:center;background-size:cover;border-bottom:1px solid var(--theme-line-_2a3640,#2a3640)}
    .lv-real-project-card>span,.lv-real-project-card>h3,.lv-real-project-card>p,.lv-real-project-card>a{position:relative;z-index:1}
    .lv-real-project-card>h3{margin-top:22px!important}
    .lv-real-project-card>p{min-height:40px}
    @media(max-width:850px){.lv-real-project-card{min-height:300px!important}}
  `}</style>;
}
