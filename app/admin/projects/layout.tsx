import Link from "next/link";

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return <div>
    <style>{`
      .projects-section-nav{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}.projects-section-link{height:36px;padding:0 12px;border:1px solid var(--theme-line-rgba_255_255_255__12_, rgba(255,255,255,.12));border-radius:8px;background:var(--theme-bg-_121c25, #121c25);color:var(--theme-ink-_cbd3d8, #cbd3d8);text-decoration:none;font-size:10px;font-weight:900;display:inline-flex;align-items:center}.projects-section-link.primary{background:#d61f26;border-color:var(--theme-line-_d61f26, #d61f26);color:#fff}.projects-section-link:hover{border-color:var(--theme-line-_d61f26, #d61f26);color:var(--theme-ink-_fff, #fff)}
    `}</style>
    <nav className="projects-section-nav" aria-label="Project management">
      <Link className="projects-section-link" href="/admin/projects">Projects</Link>
      <Link className="projects-section-link primary" href="/admin/projects/new">+ New Project</Link>
      <Link className="projects-section-link" href="/admin/projects/legacy">Legacy Registration</Link>
      <Link className="projects-section-link" href="/admin/projects/reclassify">Move to Proposals</Link>
    </nav>
    {children}
  </div>;
}
