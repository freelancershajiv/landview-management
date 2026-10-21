"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const operationLinks = [
  {
    href: "/admin/project-operations/by-project",
    label: "By Project",
    description: "Projects first, expand to see only their actual services",
  },
  {
    href: "/admin/project-operations/by-service",
    label: "By Service",
    description: "Choose a service and see every project currently using it",
  },
];

export default function ProjectOperationsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <section className="project-operations-shell">
      <style>{`
        .project-operations-shell{max-width:1600px;margin:0 auto}
        .project-operations-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:12px;padding:13px 14px;border:1px solid var(--lv-border-default);border-radius:12px;background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm)}
        .project-operations-heading small{display:block;font-size:8px;font-weight:950;letter-spacing:.13em;color:var(--lv-brand-text)}
        .project-operations-heading h1{margin:4px 0 0;font-size:20px;color:var(--lv-text-strong)}
        .project-operations-heading p{margin:4px 0 0;font-size:8px;color:var(--lv-text-secondary)}
        .project-operations-nav{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}
        .project-operations-nav a{display:block;padding:11px 13px;border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-panel);color:var(--lv-text-primary);text-decoration:none;box-shadow:var(--lv-shadow-sm)}
        .project-operations-nav a strong{display:block;font-size:10px}
        .project-operations-nav a span{display:block;margin-top:3px;font-size:7px;color:var(--lv-text-muted)}
        .project-operations-nav a.active{border-color:var(--lv-brand-border);background:var(--lv-brand-primary);color:var(--lv-text-inverse)}
        .project-operations-nav a.active span{color:var(--lv-text-inverse);opacity:.8}
        .project-operations-shell .wf-switch{display:none!important}
        @media(max-width:650px){.project-operations-heading{align-items:flex-start;flex-direction:column}.project-operations-nav{grid-template-columns:1fr}}
      `}</style>

      <header className="project-operations-heading">
        <div>
          <small>LAND VIEW · PROJECT OPERATIONS</small>
          <h1>Project Operations</h1>
          <p>Manage active work either project-by-project or service-by-service without a wide workflow matrix.</p>
        </div>
      </header>

      <nav className="project-operations-nav" aria-label="Project Operations views">
        {operationLinks.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
              <strong>{item.label}</strong>
              <span>{item.description}</span>
            </Link>
          );
        })}
      </nav>

      {children}
    </section>
  );
}
