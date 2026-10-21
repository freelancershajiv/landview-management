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
        .project-operations-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:12px;padding:15px 16px;border:1px solid var(--lv-border-default);border-radius:12px;background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm)}
        .project-operations-heading small{display:block;font-size:10px;font-weight:950;letter-spacing:.13em;color:var(--lv-brand-text)}
        .project-operations-heading h1{margin:5px 0 0;font-size:24px;color:var(--lv-text-strong)}
        .project-operations-heading p{margin:5px 0 0;font-size:11px;line-height:1.5;color:var(--lv-text-secondary)}
        .project-operations-nav{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px}
        .project-operations-nav a{display:block;padding:13px 15px;border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-panel);color:var(--lv-text-primary);text-decoration:none;box-shadow:var(--lv-shadow-sm)}
        .project-operations-nav a strong{display:block;font-size:13px}
        .project-operations-nav a span{display:block;margin-top:4px;font-size:10px;line-height:1.45;color:var(--lv-text-muted)}
        .project-operations-nav a.active{border-color:var(--lv-brand-border);background:var(--lv-brand-primary);color:var(--lv-text-inverse)}
        .project-operations-nav a.active span{color:var(--lv-text-inverse);opacity:.88}
        .project-operations-shell .wf-switch{display:none!important}

        /* Readability scale shared by both Project Operations views */
        .project-operations-shell .byp-head h2,.project-operations-shell .bys-head h2{font-size:24px!important}
        .project-operations-shell .byp-head p,.project-operations-shell .bys-head p{font-size:11px!important;line-height:1.5!important}
        .project-operations-shell .byp-btn,.project-operations-shell .bys-btn{font-size:11px!important;min-height:38px!important;padding-left:13px!important;padding-right:13px!important}
        .project-operations-shell .byp-kpi span,.project-operations-shell .bys-kpi span{font-size:10px!important}
        .project-operations-shell .byp-kpi strong,.project-operations-shell .bys-kpi strong{font-size:21px!important}
        .project-operations-shell .byp-search,.project-operations-shell .bys-search{font-size:12px!important;min-height:42px!important}
        .project-operations-shell .byp-msg,.project-operations-shell .bys-msg{font-size:11px!important;line-height:1.45!important}
        .project-operations-shell .byp-table th,.project-operations-shell .bys-table th{font-size:10px!important;padding-top:11px!important;padding-bottom:11px!important}
        .project-operations-shell .byp-table td,.project-operations-shell .bys-table td{font-size:11px!important;padding-top:12px!important;padding-bottom:12px!important}
        .project-operations-shell .byp-id,.project-operations-shell .bys-project strong{font-size:12px!important}
        .project-operations-shell .byp-owner strong,.project-operations-shell .bys-owner strong,.project-operations-shell .bys-service strong{font-size:11px!important}
        .project-operations-shell .byp-owner span,.project-operations-shell .bys-project span,.project-operations-shell .bys-owner span,.project-operations-shell .bys-service span{font-size:10px!important;line-height:1.4!important}
        .project-operations-shell .byp-chip{font-size:9px!important;padding:5px 8px!important}
        .project-operations-shell .byp-progress-top{font-size:10px!important}
        .project-operations-shell .byp-attn strong{font-size:11px!important}
        .project-operations-shell .byp-attn span{font-size:10px!important}
        .project-operations-shell .byp-small,.project-operations-shell .byp-complete,.project-operations-shell .byp-done,.project-operations-shell .bys-open{font-size:10px!important;min-height:31px!important;padding-left:10px!important;padding-right:10px!important}
        .project-operations-shell .byp-detail-head strong{font-size:12px!important}
        .project-operations-shell .byp-service-name strong{font-size:11px!important}
        .project-operations-shell .byp-service-name span{font-size:9px!important}
        .project-operations-shell .byp-status,.project-operations-shell .bys-status{font-size:10px!important;padding:5px 8px!important}
        .project-operations-shell .byp-money,.project-operations-shell .bys-money{font-size:10px!important}
        .project-operations-shell .byp-money strong,.project-operations-shell .bys-money strong{font-size:11px!important}
        .project-operations-shell .byp-service select,.project-operations-shell .bys-table select{font-size:11px!important;min-height:34px!important}
        .project-operations-shell .byp-empty,.project-operations-shell .bys-empty{font-size:11px!important;line-height:1.5!important}
        .project-operations-shell .bys-tab{font-size:10px!important;min-height:38px!important;padding-left:12px!important;padding-right:12px!important}
        .project-operations-shell .bys-section-head h3{font-size:14px!important}
        .project-operations-shell .bys-section-head p{font-size:10px!important;line-height:1.45!important}
        .project-operations-shell .bys-count{font-size:10px!important;min-width:31px!important;height:27px!important}
        .project-operations-shell .bys-completed-title strong{font-size:12px!important}
        .project-operations-shell .bys-completed-title small{font-size:10px!important;line-height:1.4!important}
        .project-operations-shell .bys-chevron{font-size:16px!important}

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
