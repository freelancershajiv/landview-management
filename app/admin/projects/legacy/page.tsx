"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { landViewApi, type FinanceSheetData } from "@/lib/api";
import { ErrorState, LoadingState, PageHeader, pick } from "@/components/lv-ui";

type Row = Record<string, unknown>;
type LegacyProject = {
  Project_ID: string;
  Project_Name: string;
  Client_Name: string;
  Phone_Number: string;
  Project_Type: string;
  Location: string;
  Project_Area: string;
  Number_of_Stories: string;
  Status: string;
};

const emptyForm: LegacyProject = {
  Project_ID: "",
  Project_Name: "",
  Client_Name: "",
  Phone_Number: "",
  Project_Type: "",
  Location: "",
  Project_Area: "",
  Number_of_Stories: "",
  Status: "Running",
};

const css = `
.legacy-page{display:grid;gap:18px}.legacy-actions{display:flex;gap:8px;flex-wrap:wrap}.legacy-btn{height:40px;padding:0 14px;border:1px solid rgba(255,255,255,.14);border-radius:8px;background:#18232d;color:#fff;font-size:12px;font-weight:800;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}.legacy-btn.primary{background:#d61f26;border-color:#d61f26}.legacy-btn:disabled{opacity:.5;cursor:not-allowed}.legacy-grid{display:grid;grid-template-columns:minmax(300px,.8fr) minmax(0,1.2fr);gap:16px}.legacy-card{border:1px solid rgba(255,255,255,.11);border-radius:12px;background:#0e1720;overflow:hidden}.legacy-head{padding:15px 16px;border-bottom:1px solid rgba(255,255,255,.08);background:#141e28}.legacy-head strong{display:block;color:#f5f7f8;font-size:13px}.legacy-head small{display:block;margin-top:4px;color:#7f8c97;font-size:11px;line-height:1.5}.legacy-form{display:grid;grid-template-columns:1fr 1fr;gap:11px;padding:16px}.legacy-form label{display:grid;gap:6px;color:#8f9aa4;font-size:11px;font-weight:700}.legacy-form label.full{grid-column:1/-1}.legacy-form input,.legacy-form select{height:40px;border:1px solid rgba(255,255,255,.13);border-radius:7px;background:#111b24;color:#eef2f5;padding:0 10px;font-size:12px}.legacy-form input:focus,.legacy-form select:focus{outline:none;border-color:#d61f26}.legacy-form .submit{grid-column:1/-1}.legacy-message{margin:0 16px 16px;padding:10px 12px;border:1px solid rgba(255,255,255,.1);border-radius:8px;color:#b9c2c9;font-size:11px;line-height:1.55}.legacy-message.ok{border-color:rgba(60,190,120,.3);color:#8ee0ae}.legacy-message.err{border-color:rgba(214,31,38,.35);color:#ff9993}.legacy-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:14px 16px;border-bottom:1px solid rgba(255,255,255,.08)}.legacy-stat{padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:#111b24}.legacy-stat b{display:block;color:#fff;font-size:18px}.legacy-stat span{display:block;margin-top:3px;color:#7f8c97;font-size:10px}.legacy-scroll{max-height:590px;overflow:auto}.legacy-table{width:100%;border-collapse:collapse;min-width:720px}.legacy-table th{position:sticky;top:0;z-index:2;padding:11px 12px;background:#141e28;color:#82909b;border-bottom:1px solid rgba(255,255,255,.09);text-align:left;font-size:10px;letter-spacing:.06em;text-transform:uppercase}.legacy-table td{padding:11px 12px;border-bottom:1px solid rgba(255,255,255,.07);color:#dfe5e9;font-size:11px;background:#0f1821}.legacy-table tr:last-child td{border-bottom:0}.legacy-id{color:#ff756e;font-weight:900}.legacy-muted{color:#788691}.legacy-empty{padding:28px;text-align:center;color:#7f8c97;font-size:12px}.legacy-note{padding:12px 16px;border-top:1px solid rgba(255,255,255,.08);color:#75828d;font-size:11px;line-height:1.55}@media(max-width:980px){.legacy-grid{grid-template-columns:1fr}}@media(max-width:620px){.legacy-form{grid-template-columns:1fr}.legacy-form label.full,.legacy-form .submit{grid-column:auto}.legacy-summary{grid-template-columns:1fr 1fr 1fr}}
`;

function text(value: unknown) { return String(value ?? "").trim(); }
function normalizeProjectId(value: unknown) {
  const raw = text(value).toUpperCase();
  if (!raw) return "";
  const match = raw.match(/LV[\s_-]*0*(\d+)/i);
  if (match?.[1]) return `LV-${Number(match[1])}`;
  const digits = raw.replace(/\D/g, "");
  return digits ? `LV-${Number(digits)}` : raw;
}
function records(data: FinanceSheetData) {
  return (data.rows || []).map((row) => {
    const item: Row = {};
    (data.headers || []).forEach((header, index) => {
      const key = text(header);
      if (key) item[key] = row[index] ?? "";
    });
    return item;
  });
}
function first(row: Row, keys: string[]) {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && text(row[key])) return row[key];
  }
  return "";
}
function fromFileList(row: Row): LegacyProject | null {
  const rawId = first(row, ["FILE ID", "File ID", "File_ID", "Project_ID", "Project ID"]);
  const id = normalizeProjectId(rawId);
  const name = text(first(row, ["Name", "Project Name", "Project_Name", "Client Name"]));
  if (!id || !name) return null;
  return {
    Project_ID: id,
    Project_Name: name,
    Client_Name: text(first(row, ["Client Name", "Client_Name", "Name"])) || name,
    Phone_Number: text(first(row, ["Contact No.", "Contact No", "Phone", "Phone Number", "Phone_Number"])),
    Project_Type: text(first(row, ["Type", "Project Type", "Project_Type"])),
    Location: text(first(row, ["Address", "Location"])),
    Project_Area: text(first(row, ["Area", "Project Area", "Project_Area"])),
    Number_of_Stories: text(first(row, ["Floor", "Floors", "Story", "Number of Stories"])),
    Status: "Running",
  };
}

export default function LegacyProjectsPage() {
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("");
  const [legacy, setLegacy] = useState<LegacyProject[]>([]);
  const [registered, setRegistered] = useState<Set<string>>(new Set());
  const [form, setForm] = useState<LegacyProject>(emptyForm);
  const [saving, setSaving] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [message, setMessage] = useState<{kind:"ok"|"err"; text:string}|null>(null);
  const [error, setError] = useState("");

  const canManage = role === "admin" || role === "manager";

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [session, fileList, dbProjects] = await Promise.all([
        landViewApi.getSession(),
        landViewApi.getFinanceSheet("File List"),
        landViewApi.getProjects(),
      ]);
      const nextRole = text(session?.user?.role || session?.user?.Role).toLowerCase();
      setRole(nextRole);
      const ids = new Set<string>();
      (dbProjects || []).forEach((row: Row) => {
        const id = normalizeProjectId(pick(row, ["Project_ID", "Project ID", "ProjectId"], ""));
        if (id) ids.add(id);
      });
      setRegistered(ids);
      const found = records(fileList).map(fromFileList).filter(Boolean) as LegacyProject[];
      const unique = new Map<string, LegacyProject>();
      found.forEach((project) => unique.set(project.Project_ID, project));
      setLegacy(Array.from(unique.values()).sort((a,b) => Number(b.Project_ID.replace(/\D/g,"")) - Number(a.Project_ID.replace(/\D/g,""))));
    } catch (e:any) {
      setError(e?.message || "Could not load legacy projects.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const missing = useMemo(() => legacy.filter((project) => !registered.has(project.Project_ID)), [legacy, registered]);

  function edit(project: LegacyProject) {
    setForm(project);
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function register(project: LegacyProject) {
    const id = normalizeProjectId(project.Project_ID);
    if (!canManage) throw new Error("Admin or manager access is required.");
    if (!id) throw new Error("Enter the historical project ID, for example LV-69.");
    if (!text(project.Project_Name)) throw new Error("Project name is required.");
    if (registered.has(id)) throw new Error(`${id} already exists in Supabase. Nothing was overwritten.`);
    setSaving(id);
    try {
      await landViewApi.createProject({
        ...project,
        Project_ID: id,
        Client_Name: text(project.Client_Name) || text(project.Project_Name),
        Status: text(project.Status) || "Running",
        Notes: "Legacy project registered from historical LAND VIEW records.",
      });
      setRegistered((current) => new Set([...current, id]));
      return id;
    } finally {
      setSaving("");
    }
  }

  async function submitManual(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      const id = await register(form);
      setMessage({ kind: "ok", text: `${id} was registered in Supabase with its historical project number.` });
      setForm(emptyForm);
    } catch (e:any) {
      setMessage({ kind: "err", text: e?.message || "Could not register the project." });
    }
  }

  async function importAllMissing() {
    if (!canManage || !missing.length || bulkSaving) return;
    if (!window.confirm(`Register ${missing.length} missing legacy project(s) in Supabase? Existing project IDs will not be changed.`)) return;
    setBulkSaving(true);
    setMessage(null);
    let created = 0;
    const failed: string[] = [];
    try {
      for (const project of missing) {
        try {
          await register(project);
          created += 1;
        } catch (e:any) {
          failed.push(`${project.Project_ID}: ${e?.message || "failed"}`);
        }
      }
      if (failed.length) {
        setMessage({ kind: "err", text: `Registered ${created} project(s). ${failed.length} failed: ${failed.slice(0,4).join(" | ")}${failed.length > 4 ? " …" : ""}` });
      } else {
        setMessage({ kind: "ok", text: `Registered all ${created} missing legacy project(s). Historical LV numbers were preserved.` });
      }
    } finally {
      setBulkSaving(false);
    }
  }

  if (loading) return <LoadingState label="Comparing old projects with Supabase..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return <>
    <style dangerouslySetInnerHTML={{__html:css}} />
    <div className="legacy-page">
      <PageHeader eyebrow="LAND VIEW DATABASE" title="Legacy Project Registration" description="Register historical projects in Supabase without changing their original LV project numbers." action={<div className="legacy-actions"><Link className="legacy-btn" href="/admin/projects">← Projects</Link><button className="legacy-btn" type="button" onClick={load}>Refresh</button></div>} />

      <div className="legacy-grid">
        <section className="legacy-card">
          <div className="legacy-head"><strong>Register an old project</strong><small>Use the original project number. Example: entering 69, LV69 or LV-069 is stored as LV-69.</small></div>
          <form className="legacy-form" onSubmit={submitManual}>
            <label>Historical Project ID<input value={form.Project_ID} onChange={(e)=>setForm({...form,Project_ID:e.target.value})} placeholder="LV-69" required /></label>
            <label>Status<select value={form.Status} onChange={(e)=>setForm({...form,Status:e.target.value})}><option value="Running">Ongoing</option><option value="Paused">On Hold</option><option value="Completed">Completed</option><option value="Cancelled">Cancelled</option></select></label>
            <label className="full">Project / Client Name<input value={form.Project_Name} onChange={(e)=>setForm({...form,Project_Name:e.target.value,Client_Name:form.Client_Name || e.target.value})} required /></label>
            <label>Client Name<input value={form.Client_Name} onChange={(e)=>setForm({...form,Client_Name:e.target.value})} /></label>
            <label>Phone<input value={form.Phone_Number} onChange={(e)=>setForm({...form,Phone_Number:e.target.value})} /></label>
            <label>Project Type<input value={form.Project_Type} onChange={(e)=>setForm({...form,Project_Type:e.target.value})} /></label>
            <label>Location<input value={form.Location} onChange={(e)=>setForm({...form,Location:e.target.value})} /></label>
            <label>Project Area<input value={form.Project_Area} onChange={(e)=>setForm({...form,Project_Area:e.target.value})} /></label>
            <label>Stories / Floors<input value={form.Number_of_Stories} onChange={(e)=>setForm({...form,Number_of_Stories:e.target.value})} /></label>
            <button className="legacy-btn primary submit" type="submit" disabled={!canManage || Boolean(saving) || bulkSaving}>{saving ? `Registering ${saving}…` : "Register Legacy Project"}</button>
          </form>
          {message && <div className={`legacy-message ${message.kind}`}>{message.text}</div>}
          {!canManage && <div className="legacy-message err">Admin or manager access is required to register projects.</div>}
        </section>

        <section className="legacy-card">
          <div className="legacy-head"><strong>Old File List comparison</strong><small>These records come from LV - Auto Invoice → File List. Only missing IDs are offered for import.</small></div>
          <div className="legacy-summary">
            <div className="legacy-stat"><b>{legacy.length}</b><span>Old records found</span></div>
            <div className="legacy-stat"><b>{legacy.length - missing.length}</b><span>Already in Supabase</span></div>
            <div className="legacy-stat"><b>{missing.length}</b><span>Missing</span></div>
          </div>
          <div style={{padding:"12px 16px",borderBottom:"1px solid rgba(255,255,255,.08)"}}><button className="legacy-btn primary" type="button" disabled={!canManage || !missing.length || bulkSaving || Boolean(saving)} onClick={()=>void importAllMissing()}>{bulkSaving ? "Importing…" : `Import All Missing (${missing.length})`}</button></div>
          <div className="legacy-scroll">
            {missing.length ? <table className="legacy-table"><thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Location</th><th></th></tr></thead><tbody>{missing.map((project)=><tr key={project.Project_ID}><td className="legacy-id">{project.Project_ID}</td><td>{project.Project_Name}<div className="legacy-muted">{project.Phone_Number || "No phone"}</div></td><td>{project.Project_Type || "—"}</td><td>{project.Location || "—"}</td><td><button className="legacy-btn" type="button" disabled={!canManage || Boolean(saving) || bulkSaving} onClick={()=>edit(project)}>Review</button></td></tr>)}</tbody></table> : <div className="legacy-empty">Every project in the old File List is already registered in Supabase.</div>}
          </div>
          <div className="legacy-note">Safety rule: this page never renumbers an old project. Bulk import skips IDs already present in Supabase. Manual entry also blocks an existing ID instead of overwriting it.</div>
        </section>
      </div>
    </div>
  </>;
}
