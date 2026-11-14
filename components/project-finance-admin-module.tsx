"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type ProjectOption = { id: string; projectCode: string; projectName: string; status?: string };
type ProjectList = { projects: ProjectOption[]; selectedCode: string; error: string; loading: boolean };

const sections = [
  { href: "/projectmanagement", label: "Overview", symbol: "▦", hint: "Financial dashboard" },
  { href: "/projectmanagement/income", label: "Income", symbol: "↙", hint: "Funds received" },
  { href: "/projectmanagement/expenses", label: "Expenses", symbol: "↗", hint: "Payments made" },
  { href: "/projectmanagement/ledger", label: "Combined Ledger", symbol: "≡", hint: "All transactions" },
  { href: "/projectmanagement/parties", label: "Suppliers & Contractors", symbol: "♧", hint: "Project parties" },
  { href: "/projectmanagement/bills", label: "Contracts & Bills", symbol: "▤", hint: "Work and payments" },
  { href: "/projectmanagement/reports", label: "Reports", symbol: "▥", hint: "Monthly reports" },
] as const;

export default function ProjectFinanceAdminModule() {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const queryCode = String(params.get("projectId") || "").trim();
  const classic = params.get("classic") === "1" && pathname === "/projectmanagement";
  const [list, setList] = useState<ProjectList>({ projects: [], selectedCode: "", error: "", loading: true });

  useEffect(() => {
    const controller = new AbortController();
    setList(previous => ({ ...previous, loading: true, error: "" }));
    const path = queryCode ? "/api/project-management?projectId=" + encodeURIComponent(queryCode) : "/api/project-management";
    void fetch(path, { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok || !payload?.success) throw new Error(payload?.error || "Unable to load projects");
        const projects = Array.isArray(payload.data?.projects) ? payload.data.projects : [];
        if (!controller.signal.aborted) setList({
          projects, selectedCode: String(payload.data?.selectedProject?.projectCode || queryCode || ""),
          error: "", loading: false,
        });
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) setList(previous => ({
          ...previous, loading: false, error: error?.message || "Unable to load projects",
        }));
      });
    return () => controller.abort();
  }, [queryCode]);

  const activeCode = queryCode || list.selectedCode;
  const projectLabel = list.projects.find(project => project.projectCode === activeCode)?.projectName || "";
  const linkTo = (href: string) => activeCode ? href + "?projectId=" + encodeURIComponent(activeCode) : href;
  const selectProject = (code: string) => {
    if (!code) return;
    const destination = pathname + "?projectId=" + encodeURIComponent(code);
    router.push(destination);
  };

  return (
    <header className="pmx-topbar" aria-label="Project Management workspace">
      <div className="pmx-topbar-main">
        <div className="pmx-topbar-heading">
          <span className="pmx-workspace-overline"><span className="pmx-overline-mark" aria-hidden="true" /> LAND VIEW / OPERATIONS</span>
          <div className="pmx-heading-line">
            <h1>Project Management</h1>
            <span className="pmx-header-label">Finance workspace</span>
          </div>
          <p>One place for project funds, expenses, suppliers, contractors, bills and reporting.</p>
        </div>
        <div className="pmx-project-control">
          <label htmlFor="pmx-project-selector">ACTIVE PROJECT</label>
          <select id="pmx-project-selector" aria-label="Select Project Management project"
            value={activeCode} onChange={event => selectProject(event.target.value)}
            disabled={list.loading && list.projects.length === 0}>
            <option value="">{list.loading ? "Loading projects…" : "Choose a project"}</option>
            {list.projects.map(project => (
              <option key={project.id || project.projectCode} value={project.projectCode}>
                {project.projectCode} · {project.projectName}
              </option>
            ))}
          </select>
          <div className="pmx-project-caption">
            {list.error ? <span role="alert">{list.error}</span> :
              activeCode ? <span><strong>{activeCode}</strong>{projectLabel ? " · " + projectLabel : ""}</span> :
              <span>Select a project to see its finances</span>}
          </div>
        </div>
      </div>
      <nav className="pmx-nav" aria-label="Project Management sections">
        {sections.map(section => {
          const active = !classic && pathname === section.href;
          return (
            <Link href={linkTo(section.href)} key={section.href} className={"pmx-nav-link" + (active ? " is-active" : "")}
              aria-current={active ? "page" : undefined} title={section.hint}>
              <span className="pmx-nav-symbol" aria-hidden="true">{section.symbol}</span>
              {section.label}
            </Link>
          );
        })}
        <Link className={"pmx-nav-link pmx-classic-link" + (classic ? " is-active" : "")}
          href={activeCode ? "/projectmanagement?classic=1&projectId=" + encodeURIComponent(activeCode) : "/projectmanagement?classic=1"}
          aria-current={classic ? "page" : undefined}>Classic view</Link>
      </nav>
    </header>
  );
}
