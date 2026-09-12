"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";
import { ErrorState, LoadingState, PageHeader } from "@/components/lv-ui";

type Project = Record<string, unknown>;
type PublicDraft = {
  Public_Display: string;
  Public_Project_Title: string;
  Public_Description: string;
  Project_Category: string;
  Project_Area: string;
  Number_of_Stories: string;
  Public_Services: string;
  Completion_Year: string;
  Public_Display_Order: string;
};

const css = `
.pp{display:grid;gap:16px}.pp-note{padding:14px 16px;border:1px solid rgba(239,73,59,.28);border-radius:10px;background:rgba(239,73,59,.07);color:#c7c7c7;font-size:11px;line-height:1.65}.pp-grid{display:grid;gap:14px}.pp-card{border:1px solid rgba(255,255,255,.09);border-radius:12px;background:#242424;overflow:hidden}.pp-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:17px 18px;border-bottom:1px solid rgba(255,255,255,.07)}.pp-head small{display:block;color:#ef766c;font-size:9px;font-weight:800;letter-spacing:.1em}.pp-head h2{margin:5px 0 0;color:#fff;font-size:17px}.pp-status{display:flex;align-items:center;gap:8px;color:#aaa;font-size:10px}.pp-status input{accent-color:#ef493b}.pp-body{padding:18px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.pp-field{display:grid;gap:6px}.pp-field.full{grid-column:1/-1}.pp-field span{color:#929292;font-size:8px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}.pp-field input,.pp-field textarea{width:100%;border:1px solid #3a3a3a;border-radius:7px;background:#171717;color:#eee;padding:10px 11px;font:inherit;font-size:11px;outline:none}.pp-field textarea{min-height:88px;resize:vertical}.pp-field input:focus,.pp-field textarea:focus{border-color:#ef493b}.pp-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 18px 18px}.pp-actions-left{display:flex;gap:8px;flex-wrap:wrap}.pp-save{border:0;border-radius:7px;background:#ef493b;color:#fff;padding:10px 14px;font-size:10px;font-weight:800;cursor:pointer}.pp-save:disabled{opacity:.55;cursor:wait}.pp-link{border:1px solid #454545;border-radius:7px;color:#ddd;padding:9px 12px;font-size:10px;text-decoration:none}.pp-msg{font-size:10px;color:#9fd6ae}.pp-search{width:100%;max-width:420px;border:1px solid #3a3a3a;border-radius:8px;background:#181818;color:#fff;padding:11px 12px;outline:none}.pp-empty{padding:30px;text-align:center;color:#888}.pp-private{color:#888;font-size:9px}@media(max-width:760px){.pp-body{grid-template-columns:1fr}.pp-field.full{grid-column:auto}.pp-head,.pp-actions{align-items:stretch;flex-direction:column}}
`;

function value(row: Project, keys: string[]) {
  for (const key of keys) {
    const v = row[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return "";
}

function projectId(row: Project) {
  return value(row, ["Project_ID", "Project ID", "ProjectId"]);
}

function isTrue(v: unknown) {
  return ["true", "yes", "1"].includes(String(v ?? "").trim().toLowerCase());
}

function makeDraft(row: Project): PublicDraft {
  return {
    Public_Display: isTrue(value(row, ["Public_Display", "Public Display", "Show_Publicly", "Show Publicly"])) ? "TRUE" : "FALSE",
    Public_Project_Title: value(row, ["Public_Project_Title", "Public Project Title"]),
    Public_Description: value(row, ["Public_Description", "Public Description"]),
    Project_Category: value(row, ["Project_Category", "Project Category", "Project_Type", "Project Type"]),
    Project_Area: value(row, ["Project_Area", "Project Area", "Plot_Area", "Plot Area", "Land_Area", "Land Area"]),
    Number_of_Stories: value(row, ["Number_of_Stories", "Number of Stories", "Floors", "Floor_Story", "Floor/Story"]),
    Public_Services: value(row, ["Public_Services", "Public Services"]),
    Completion_Year: value(row, ["Completion_Year", "Completion Year"]),
    Public_Display_Order: value(row, ["Public_Display_Order", "Public Display Order"]) || "9999",
  };
}

export default function PublicProjectsAdminPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [drafts, setDrafts] = useState<Record<string, PublicDraft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState("");
  const [message, setMessage] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [allowed, setAllowed] = useState(true);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [session, rows] = await Promise.all([landViewApi.getSession(), landViewApi.getProjects()]);
      const role = String(session?.user?.role || session?.user?.Role || "").trim().toLowerCase();
      setAllowed(role === "admin" || role === "manager");
      setProjects(rows || []);
      const next: Record<string, PublicDraft> = {};
      for (const row of rows || []) {
        const id = projectId(row);
        if (id) next[id] = makeDraft(row);
      }
      setDrafts(next);
    } catch (e: any) {
      setError(e?.message || "Could not load projects.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((row) => [
      projectId(row),
      value(row, ["Project_Name", "Project Name", "Name"]),
      value(row, ["Client_Name", "Client Name"]),
      value(row, ["Location", "Project_Location", "Project Location"]),
    ].some((v) => v.toLowerCase().includes(q)));
  }, [projects, query]);

  function patch(id: string, changes: Partial<PublicDraft>) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], ...changes } }));
    setMessage((current) => ({ ...current, [id]: "" }));
  }

  async function save(id: string) {
    const draft = drafts[id];
    if (!draft || saving) return;
    setSaving(id);
    setMessage((current) => ({ ...current, [id]: "" }));
    try {
      await landViewApi.updateProject(id, draft);
      setMessage((current) => ({ ...current, [id]: draft.Public_Display === "TRUE" ? "Published settings saved." : "Project kept off the public website." }));
      setProjects((current) => current.map((row) => projectId(row) === id ? { ...row, ...draft } : row));
    } catch (e: any) {
      setError(e?.message || `Could not save ${id}.`);
    } finally {
      setSaving("");
    }
  }

  if (loading) return <LoadingState label="Loading public portfolio settings..." />;
  if (error && !projects.length) return <ErrorState message={error} onRetry={load} />;

  return <><style dangerouslySetInnerHTML={{ __html: css }} /><div className="pp">
    <PageHeader eyebrow="PUBLIC WEBSITE" title="Project portfolio publishing" description="Control which LAND VIEW projects appear on the public website and edit only the public-facing project metadata." action={<Link href="/admin/projects" className="btn">← Projects</Link>} />

    {!allowed ? <div className="pp-note">Only Admin or Manager accounts can change public project publishing. This page is read-only for your current role.</div> : null}
    <div className="pp-note"><strong>Images:</strong> the public portfolio reads eligible JPG/JPEG/PNG/WEBP images from each project’s configured Drive image source. Turning on <strong>Show on Website</strong> is the publication gate; private client contact data is not part of the public-project response.</div>
    {error ? <div className="pp-note">{error}</div> : null}
    <input className="pp-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search project ID, name, client or location…" />

    <div className="pp-grid">
      {filtered.map((row) => {
        const id = projectId(row);
        const draft = drafts[id];
        if (!id || !draft) return null;
        const internalName = value(row, ["Project_Name", "Project Name", "Name"]) || id;
        return <section className="pp-card" key={id}>
          <div className="pp-head">
            <div><small>{id}</small><h2>{internalName}</h2><div className="pp-private">Internal project name — public title can be different.</div></div>
            <label className="pp-status"><input type="checkbox" checked={draft.Public_Display === "TRUE"} disabled={!allowed} onChange={(e) => patch(id, { Public_Display: e.target.checked ? "TRUE" : "FALSE" })} /> Show on Website</label>
          </div>
          <div className="pp-body">
            <label className="pp-field"><span>Public project title</span><input disabled={!allowed} value={draft.Public_Project_Title} onChange={(e) => patch(id, { Public_Project_Title: e.target.value })} placeholder={`${id} Project`} /></label>
            <label className="pp-field"><span>Category</span><input disabled={!allowed} value={draft.Project_Category} onChange={(e) => patch(id, { Project_Category: e.target.value })} placeholder="Residential" /></label>
            <label className="pp-field"><span>Project area</span><input disabled={!allowed} value={draft.Project_Area} onChange={(e) => patch(id, { Project_Area: e.target.value })} placeholder="1960 Sqft" /></label>
            <label className="pp-field"><span>Stories</span><input disabled={!allowed} value={draft.Number_of_Stories} onChange={(e) => patch(id, { Number_of_Stories: e.target.value })} placeholder="7 Stories" /></label>
            <label className="pp-field"><span>Completion year</span><input disabled={!allowed} value={draft.Completion_Year} onChange={(e) => patch(id, { Completion_Year: e.target.value })} placeholder="2026" /></label>
            <label className="pp-field"><span>Display order</span><input disabled={!allowed} inputMode="numeric" value={draft.Public_Display_Order} onChange={(e) => patch(id, { Public_Display_Order: e.target.value })} placeholder="9999" /></label>
            <label className="pp-field full"><span>Public services — separate with | or one per line</span><textarea disabled={!allowed} value={draft.Public_Services} onChange={(e) => patch(id, { Public_Services: e.target.value })} placeholder="Architectural Design | Structural Design | 3D Exterior Design" /></label>
            <label className="pp-field full"><span>Public description</span><textarea disabled={!allowed} value={draft.Public_Description} onChange={(e) => patch(id, { Public_Description: e.target.value })} placeholder="Public-facing factual project description." /></label>
          </div>
          <div className="pp-actions">
            <div className="pp-actions-left"><button className="pp-save" type="button" disabled={!allowed || saving === id} onClick={() => void save(id)}>{saving === id ? "Saving…" : "Save public settings"}</button>{draft.Public_Display === "TRUE" ? <a className="pp-link" href={`https://www.landview.com.bd/projects/${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">Open public page ↗</a> : null}</div>
            {message[id] ? <span className="pp-msg">{message[id]}</span> : null}
          </div>
        </section>;
      })}
      {!filtered.length ? <div className="pp-empty">No matching projects.</div> : null}
    </div>
  </div></>;
}
