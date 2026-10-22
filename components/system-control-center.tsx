"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";
import { notifyClientProjectStage } from "@/lib/client-project-whatsapp";

type ProjectRow = Record<string, unknown> & {
  Project_ID?: string;
  Project_Name?: string;
  Client_Name?: string;
  Design_Stage_Status?: string;
  Approval_Stage_Status?: string;
  Supervision_Stage_Status?: string;
};

type StageField = "Design_Stage_Status" | "Approval_Stage_Status" | "Supervision_Stage_Status";

const STAGE_OPTIONS = ["Pending", "In Progress", "Completed"] as const;

const controlLinks = [
  { href: "/admin/access", title: "Permissions", note: "Roles, employee access and module permissions", icon: "⚿" },
  { href: "/admin/security", title: "Security", note: "Login, trusted device and security controls", icon: "◆" },
  { href: "/admin/whatsapp", title: "WhatsApp", note: "Connections, routing and notification controls", icon: "●" },
  { href: "/admin/registers", title: "Documents", note: "Document registry and controlled records", icon: "▧" },
];

function normalizeProjectId(value: unknown) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  const match = raw.match(/LV[\s_-]*0*(\d+)/i);
  if (match?.[1]) return `LV-${String(Number(match[1])).padStart(3, "0")}`;
  const digits = raw.replace(/\D/g, "");
  return digits ? `LV-${String(Number(digits)).padStart(3, "0")}` : raw;
}

function currentStage(project: ProjectRow) {
  const design = String(project.Design_Stage_Status || "Pending");
  const approval = String(project.Approval_Stage_Status || "Pending");
  const supervision = String(project.Supervision_Stage_Status || "Completed");
  if (design !== "Completed") return "Design Stage";
  if (approval !== "Completed") return "Approval Stage";
  if (supervision !== "Completed") return "Supervision / Construction";
  return "Completed";
}

export default function SystemControlCenter() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState("");

  async function loadProjects() {
    setLoading(true);
    setError("");
    try {
      const rows = await landViewApi.getProjects();
      setProjects((rows || []) as ProjectRow[]);
    } catch (err: any) {
      setError(err?.message || "Could not load project controls.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadProjects(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((project) => [project.Project_ID, project.Project_Name, project.Client_Name]
      .some((value) => String(value || "").toLowerCase().includes(q)));
  }, [projects, search]);

  async function updateStage(project: ProjectRow, field: StageField, value: string) {
    const projectId = normalizeProjectId(project.Project_ID);
    if (!projectId) return;
    const key = `${projectId}:${field}`;
    setSaving(key);
    setError("");
    try {
      await landViewApi.updateProject(projectId, { [field]: value });
      setProjects((rows) => rows.map((row) => normalizeProjectId(row.Project_ID) === projectId ? { ...row, [field]: value } : row));
      try {
        await notifyClientProjectStage({
          projectId,
          projectName: project.Project_Name,
          clientName: project.Client_Name,
          field,
          value,
        });
      } catch (notifyError: any) {
        setError(`Stage saved, but the client WhatsApp update was not delivered: ${notifyError?.message || "WhatsApp delivery failed."}`);
      }
    } catch (err: any) {
      setError(err?.message || `Could not update ${projectId}.`);
    } finally {
      setSaving("");
    }
  }

  return (
    <main className="system-control">
      <style>{`
        .system-control{display:grid;gap:20px;padding:2px 0 30px;color:var(--theme-ink-_e8edf0,#e8edf0)}
        .sc-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:20px;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:linear-gradient(135deg,rgba(214,31,38,.10),rgba(17,27,36,.92))}
        .sc-kicker{margin:0 0 6px;color:#ef777b;font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.sc-head h1{margin:0;color:#fff;font-size:26px;line-height:1.1}.sc-head p{max-width:760px;margin:8px 0 0;color:#8f9ba5;font-size:12px;line-height:1.6}
        .sc-policy{display:inline-flex;align-items:center;gap:7px;padding:8px 11px;border:1px solid rgba(69,200,132,.25);border-radius:999px;background:rgba(69,200,132,.08);color:#82dca9;font-size:10px;font-weight:900}.sc-policy i{width:7px;height:7px;border-radius:50%;background:#45c884}
        .sc-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.sc-card{display:grid;grid-template-columns:38px 1fr auto;align-items:center;gap:10px;padding:14px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:#111b24;color:inherit;text-decoration:none}.sc-card:hover{border-color:rgba(214,31,38,.42);background:#141f29}.sc-icon{display:grid;place-items:center;width:38px;height:38px;border-radius:9px;background:rgba(214,31,38,.09);color:#ef777b;font-size:16px}.sc-card strong{display:block;color:#edf1f4;font-size:12px}.sc-card small{display:block;margin-top:3px;color:#71808b;font-size:10px;line-height:1.4}.sc-arrow{color:#687680;font-size:16px}
        .sc-section{overflow:hidden;border:1px solid rgba(255,255,255,.1);border-radius:14px;background:#0e1720}.sc-section-head{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 18px;border-bottom:1px solid rgba(255,255,255,.08);background:#121c25}.sc-section-head h2{margin:0;color:#f4f6f8;font-size:15px}.sc-section-head p{margin:4px 0 0;color:#71808b;font-size:10px}.sc-search{width:min(100%,300px);height:38px;padding:0 11px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:#0c151d;color:#eef2f5}.sc-search::placeholder{color:#66747f}.sc-alert{margin:14px 16px 0;padding:10px 12px;border:1px solid rgba(214,31,38,.3);border-radius:8px;background:rgba(214,31,38,.07);color:#f09a9d;font-size:11px}.sc-loading{padding:34px;text-align:center;color:#7c8993;font-size:12px}.sc-scroll{overflow-x:auto}.sc-table{width:100%;min-width:930px;border-collapse:collapse}.sc-table th{padding:11px 13px;border-bottom:1px solid rgba(255,255,255,.08);background:#101a23;color:#778590;text-align:left;font-size:10px;font-weight:900;letter-spacing:.07em;text-transform:uppercase}.sc-table td{padding:12px 13px;border-bottom:1px solid rgba(255,255,255,.065);color:#dce2e7;font-size:11px}.sc-table tbody tr:last-child td{border-bottom:0}.sc-project{display:flex;align-items:center;gap:10px;min-width:220px}.sc-id{min-width:65px;padding:6px 8px;border:1px solid rgba(214,31,38,.32);border-radius:6px;background:rgba(214,31,38,.07);color:#ef777b;text-align:center;font-weight:900}.sc-project strong{display:block;color:#f0f3f5;font-size:11px}.sc-project small{display:block;margin-top:2px;color:#71808b;font-size:9px}.sc-select{height:34px;min-width:128px;padding:0 9px;border:1px solid rgba(255,255,255,.13);border-radius:7px;background:#111b24;color:#e8edf0;font-size:10px;font-weight:800}.sc-select:focus{outline:none;border-color:#d61f26}.sc-select:disabled{opacity:.5}.sc-current{display:inline-flex;padding:6px 8px;border-radius:6px;background:#18232d;color:#cbd4da;font-size:9px;font-weight:900}.sc-empty{padding:28px;text-align:center;color:#71808b;font-size:11px}
        @media(max-width:980px){.sc-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.sc-grid{grid-template-columns:1fr}.sc-section-head{align-items:stretch;flex-direction:column}.sc-search{width:100%}.sc-head h1{font-size:22px}}
      `}</style>

      <section className="sc-head">
        <div>
          <div className="sc-kicker">Admin master controls</div>
          <h1>System Control</h1>
          <p>One place for settings that affect multiple LAND VIEW modules. Repeated system-level editors should be moved here instead of being rebuilt on every page.</p>
        </div>
        <span className="sc-policy"><i /> ADMIN ONLY · CENTRAL EDITING</span>
      </section>

      <section className="sc-grid" aria-label="System control modules">
        {controlLinks.map((item) => (
          <Link className="sc-card" href={item.href} key={item.href}>
            <span className="sc-icon">{item.icon}</span>
            <span><strong>{item.title}</strong><small>{item.note}</small></span>
            <span className="sc-arrow">›</span>
          </Link>
        ))}
      </section>

      <section className="sc-section">
        <header className="sc-section-head">
          <div><h2>Project Lifecycle Control</h2><p>Edit Design, Approval and Supervision / Construction stages centrally.</p></div>
          <input className="sc-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search File ID, project or client…" />
        </header>

        {error && <div className="sc-alert">{error}</div>}
        {loading ? <div className="sc-loading">Loading project controls…</div> : (
          <div className="sc-scroll">
            <table className="sc-table">
              <thead><tr><th>Project</th><th>Design</th><th>Approval</th><th>Supervision / Construction</th><th>Current Stage</th></tr></thead>
              <tbody>
                {filtered.map((project) => {
                  const id = normalizeProjectId(project.Project_ID);
                  return (
                    <tr key={id || String(project.Project_Name)}>
                      <td><div className="sc-project"><span className="sc-id">{id || "—"}</span><span><strong>{String(project.Project_Name || "Untitled project")}</strong><small>{String(project.Client_Name || "No client name")}</small></span></div></td>
                      {(["Design_Stage_Status", "Approval_Stage_Status", "Supervision_Stage_Status"] as StageField[]).map((field) => {
                        const fallback = field === "Supervision_Stage_Status" ? "Completed" : "Pending";
                        const key = `${id}:${field}`;
                        return <td key={field}><select className="sc-select" value={String(project[field] || fallback)} disabled={!id || saving === key} onChange={(e) => void updateStage(project, field, e.target.value)}>{STAGE_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></td>;
                      })}
                      <td><span className="sc-current">{currentStage(project)}</span></td>
                    </tr>
                  );
                })}
                {!filtered.length && <tr><td colSpan={5} className="sc-empty">No matching projects.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
