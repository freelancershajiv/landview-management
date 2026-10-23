"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type PublicProject = {
  projectId?: string;
  title?: string;
  category?: string;
  district?: string;
  currentStage?: string;
  coverImageUrl?: string;
  services?: string[];
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function imageUrl(url?: string) {
  const value = String(url || "").trim();
  if (!value) return "";
  const fileMatch = value.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  if (fileMatch?.[1]) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileMatch[1])}&sz=w1200`;
  try {
    const parsed = new URL(value);
    if (parsed.hostname === "drive.google.com") {
      const id = parsed.searchParams.get("id");
      if (id) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1200`;
    }
  } catch {}
  return value;
}

export default function PublicServiceRelatedProjects({ serviceName }: { serviceName: string }) {
  const [projects, setProjects] = useState<PublicProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadProjects() {
      try {
        const response = await fetch("/api/public/projects", { cache: "no-store" });
        const payload = await response.json();
        if (!cancelled) setProjects(Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []);
      } catch {
        if (!cancelled) setProjects([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadProjects();
    return () => { cancelled = true; };
  }, []);

  const related = useMemo(() => {
    const target = normalize(serviceName);
    const targetWords = new Set(target.split(" ").filter((word) => word.length > 2));
    return projects
      .map((project) => {
        const serviceText = (project.services || []).map(normalize).join(" ");
        const exact = (project.services || []).some((service) => normalize(service) === target);
        const overlap = [...targetWords].filter((word) => serviceText.includes(word)).length;
        return { project, score: exact ? 100 : overlap };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || Number(Boolean(b.project.coverImageUrl)) - Number(Boolean(a.project.coverImageUrl)))
      .slice(0, 3)
      .map((item) => item.project);
  }, [projects, serviceName]);

  if (loading) return <div className="sv2-empty">Loading related public projects…</div>;
  if (!related.length) return <div className="sv2-empty">No published project is currently tagged with this service. <Link href="/projects">Explore all public projects →</Link></div>;

  return (
    <div className="sv2-projects-grid">
      {related.map((project, index) => {
        const cover = imageUrl(project.coverImageUrl);
        const href = project.projectId ? `/projects/${encodeURIComponent(project.projectId)}` : "/projects";
        return (
          <article className="sv2-project" key={project.projectId || `${project.title}-${index}`} style={cover ? { backgroundImage: `url(${cover})` } : undefined}>
            <div className="sv2-project-copy">
              <div className="sv2-project-meta">{[project.category, project.currentStage, project.district].filter(Boolean).map((item) => <span key={String(item)}>{item}</span>)}</div>
              <h3>{project.title || project.projectId || "LAND VIEW Project"}</h3>
              <Link href={href}>View project →</Link>
            </div>
          </article>
        );
      })}
    </div>
  );
}
