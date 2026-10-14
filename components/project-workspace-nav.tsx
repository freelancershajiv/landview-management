"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

export default function ProjectWorkspaceNav() {
  const params = useParams<{ projectId: string }>();
  const pathname = usePathname();
  const projectId = decodeURIComponent(String(params?.projectId || ""));
  if (!projectId) return null;

  const encoded = encodeURIComponent(projectId);
  const lifecycleHref = `/admin/projects/${encoded}/lifecycle`;
  const legacyHref = `/admin/projects/${encoded}`;
  const onLifecycle = pathname === lifecycleHref || pathname.startsWith(`${lifecycleHref}/`);

  return <div className="project-workspace-switcher">
    <style>{`
      .project-workspace-switcher{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px;padding:9px 10px;border:1px solid var(--lv-border-default);border-radius:var(--lv-radius-lg);background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm)}
      .project-workspace-switcher-copy{min-width:0}.project-workspace-switcher-copy strong{display:block;color:var(--lv-text-strong);font-size:10px}.project-workspace-switcher-copy span{display:block;margin-top:2px;color:var(--lv-text-muted);font-size:8px}
      .project-workspace-switcher-actions{display:flex;gap:6px;flex-wrap:wrap}.project-workspace-switcher a{display:inline-flex;min-height:34px;align-items:center;padding:0 10px;border:1px solid var(--lv-border-default);border-radius:var(--lv-radius-md);background:var(--lv-surface-muted);color:var(--lv-text-primary);font-size:9px;font-weight:900;text-decoration:none}
      .project-workspace-switcher a.active{border-color:var(--lv-brand-border);background:var(--lv-brand-primary);color:var(--lv-text-inverse)}
      @media(max-width:640px){.project-workspace-switcher{align-items:flex-start;flex-direction:column}.project-workspace-switcher-actions{width:100%}.project-workspace-switcher a{flex:1;justify-content:center}}
    `}</style>
    <div className="project-workspace-switcher-copy">
      <strong>{projectId} · Project Workspace</strong>
      <span>The lifecycle workspace is the new master view. The current project view remains available during migration.</span>
    </div>
    <div className="project-workspace-switcher-actions">
      <Link className={onLifecycle ? "active" : ""} href={lifecycleHref}>Lifecycle Workspace</Link>
      <Link className={!onLifecycle ? "active" : ""} href={legacyHref}>Current Project View</Link>
    </div>
  </div>;
}
