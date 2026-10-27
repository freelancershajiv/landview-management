"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type Row = Record<string, any>;

function normalizeProjectCode(value: string) {
  const raw = decodeURIComponent(String(value || "")).trim().toUpperCase();
  const match = raw.match(/LV[\s_-]*0*(\d+)/i);
  if (match?.[1]) return `LV-${String(Number(match[1])).padStart(3, "0")}`;
  return raw;
}

export default function ProjectOutsourcingShortcut() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [projects, setProjects] = useState<Row[]>([]);
  const [projectCode, setProjectCode] = useState("");
  const [error, setError] = useState("");

  const contextProject = useMemo(() => {
    const match = pathname.match(/^\/admin\/projects\/(LV[-_ ]?0*\d+)\/?$/i);
    return match?.[1] ? normalizeProjectCode(match[1]) : "";
  }, [pathname]);

  const onProjectsRoute = pathname === "/admin/projects" || Boolean(contextProject);

  useEffect(() => {
    if (!open || contextProject || projects.length) return;
    setLoading(true);
    setError("");
    void fetch("/api/outsourcing", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load projects."));
        const rows = Array.isArray(json.data?.projects) ? json.data.projects : [];
        setProjects(rows);
        if (!projectCode && rows[0]?.project_code) setProjectCode(String(rows[0].project_code));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load projects."))
      .finally(() => setLoading(false));
  }, [open, contextProject, projects.length, projectCode]);

  if (!onProjectsRoute) return null;

  function goToOutsourcing(code: string) {
    const normalized = normalizeProjectCode(code);
    if (!normalized) return;
    setOpen(false);
    router.push(`/admin/finance/outsourcing/new?project=${encodeURIComponent(normalized)}`);
  }

  return <>
    <button
      type="button"
      onClick={() => contextProject ? goToOutsourcing(contextProject) : setOpen(true)}
      style={{
        position: "fixed", right: 22, bottom: 82, zIndex: 950, minHeight: 42, padding: "0 15px",
        border: "1px solid rgba(214,31,38,.65)", borderRadius: 10, background: "#d61f26", color: "#fff",
        fontSize: 11, fontWeight: 950, letterSpacing: ".02em", cursor: "pointer", boxShadow: "0 12px 30px rgba(0,0,0,.28)",
      }}
      aria-label={contextProject ? `Add outsourcing for ${contextProject}` : "Add outsourcing from a project"}
    >
      + Add Outsourcing{contextProject ? ` · ${contextProject}` : ""}
    </button>

    {open && !contextProject && <div
      role="presentation"
      onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}
      style={{ position: "fixed", inset: 0, zIndex: 1400, display: "grid", placeItems: "center", padding: 18, background: "rgba(3,7,10,.78)", backdropFilter: "blur(5px)" }}
    >
      <section style={{ width: "min(520px,100%)", border: "1px solid #36414a", borderRadius: 14, background: "#11181e", color: "#dbe3e8", boxShadow: "0 24px 80px rgba(0,0,0,.45)" }}>
        <header style={{ padding: 17, borderBottom: "1px solid #313b44" }}>
          <div style={{ fontSize: 9, fontWeight: 950, letterSpacing: ".14em", color: "#ef746d" }}>PROJECTS / OUTSOURCING</div>
          <h2 style={{ margin: "5px 0 5px", fontSize: 19, color: "#fff" }}>Add Outsourcing</h2>
          <p style={{ margin: 0, color: "#9da8b0", fontSize: 10, lineHeight: 1.55 }}>Choose the project first. The outsourcing work will stay permanently linked to that File ID.</p>
        </header>
        <div style={{ display: "grid", gap: 11, padding: 17 }}>
          {error && <div style={{ padding: 10, border: "1px solid rgba(255,92,85,.35)", borderRadius: 8, color: "#ffaaa5", fontSize: 10 }}>{error}</div>}
          <label style={{ display: "grid", gap: 6, fontSize: 9, fontWeight: 900, color: "#9da8b0" }}>
            PROJECT / FILE ID
            <select disabled={loading} value={projectCode} onChange={(e) => setProjectCode(e.target.value)} style={{ height: 40, padding: "0 10px", border: "1px solid #36414a", borderRadius: 8, background: "#0d1318", color: "#e7edf1" }}>
              <option value="">{loading ? "Loading projects…" : "Choose project"}</option>
              {projects.map((project) => <option key={String(project.id || project.project_code)} value={String(project.project_code || "")}>{project.project_code} — {project.client_name || project.project_name || "Project"}</option>)}
            </select>
          </label>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
            <button type="button" onClick={() => setOpen(false)} style={{ minHeight: 38, padding: "0 12px", border: "1px solid #36414a", borderRadius: 8, background: "#151d24", color: "#dbe3e8", fontWeight: 900, cursor: "pointer" }}>Cancel</button>
            <button type="button" disabled={!projectCode || loading} onClick={() => goToOutsourcing(projectCode)} style={{ minHeight: 38, padding: "0 13px", border: "1px solid #d61f26", borderRadius: 8, background: "#d61f26", color: "#fff", fontWeight: 950, cursor: projectCode ? "pointer" : "not-allowed", opacity: projectCode ? 1 : .55 }}>Continue</button>
          </div>
        </div>
      </section>
    </div>}
  </>;
}
