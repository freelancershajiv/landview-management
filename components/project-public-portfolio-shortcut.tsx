"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

export default function ProjectPublicPortfolioShortcut() {
  const params = useParams<{ projectId: string }>();
  const projectId = decodeURIComponent(String(params?.projectId || "")).trim();

  return (
    <aside className="project-public-portfolio-shortcut" aria-label="Public portfolio centralized control">
      <div>
        <span>PUBLIC WEBSITE</span>
        <strong>Public portfolio fields are managed centrally.</strong>
        <small>{projectId ? `${projectId} · ` : ""}Visibility, public title, media, address, services, readiness and website ranking now have one authoritative editor.</small>
      </div>
      <Link href="/admin/public-portfolio">Manage Public Portfolio →</Link>
    </aside>
  );
}
