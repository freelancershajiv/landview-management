"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { landViewApi, type FinanceSheetData } from "@/lib/api";
import { ErrorState, LoadingState, PageHeader, StatusBadge, pick } from "@/components/lv-ui";

type ProjectCategory = "Running" | "Paused" | "Completed";
type ProjectRow = Record<string, unknown> & {
  Project_ID?: string;
  Project_Name?: string;
  Client_Name?: string;
  Phone_Number?: string;
  Project_Type?: string;
  Location?: string;
  Status?: string;
  Project_Area?: string;
  Number_of_Stories?: string;
  Legacy_File_ID?: string;
  Public_Display?: unknown;
  Drive_Folder_URL?: string;
};
type TaskRow = Record<string, unknown> & {
  Task_ID?: string;
  Project_ID?: string;
  Task_Title?: string;
  Assigned_Employee_ID?: string;
};
type EmployeeRow = Record<string, unknown> & { Employee_ID?: string };
type DriveIndexResponse = { projects?: Record<string, any> };

const css = `
.projects-register{display:grid;gap:18px}.projects-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.projects-toolbar-left{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.projects-search{min-width:min(100%,360px);height:42px;padding:0 13px;border:1px solid rgba(255,255,255,.13);border-radius:8px;background:#111b24;color:#f4f6f8}.projects-search::placeholder{color:#75818c}.filter-btn{height:38px;padding:0 13px;border:1px solid rgba(255,255,255,.12);border-radius:999px;background:#121c25;color:#9ba7b1;font-size:12px;font-weight:700;cursor:pointer}.filter-btn.active{border-color:#d61f26;background:#d61f26;color:#fff}.refresh-btn{height:40px;padding:0 14px;border:1px solid rgba(255,255,255,.13);border-radius:8px;background:#18232d;color:#fff;font-size:12px;font-weight:800;cursor:pointer}.register-shell{overflow:hidden;border:1px solid rgba(255,255,255,.11);border-radius:12px;background:#0e1720}.register-scroll{overflow-x:auto}.project-table{width:100%;min-width:1120px;border-collapse:collapse}.project-table th{padding:13px 14px;border-bottom:1px solid rgba(255,255,255,.1);background:#141e28;color:#8996a1;text-align:left;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.project-table td{padding:14px;border-bottom:1px solid rgba(255,255,255,.075);background:#0f1821;color:#dce2e7;font-size:12px;vertical-align:middle}.project-table tbody tr:hover>td{background:#121e28}.project-table tbody tr:last-child td{border-bottom:0}.project-main{display:flex;align-items:center;gap:11px;min-width:230px}.project-id{display:grid;place-items:center;min-width:68px;height:32px;padding:0 8px;border:1px solid rgba(214,31,38,.35);border-radius:6px;background:rgba(214,31,38,.08);color:#ff736c;font-size:11px;font-weight:900}.project-main strong,.project-main small{display:block}.project-main strong{color:#f5f7f8;font-size:13px}.project-main small{margin-top:3px;color:#77838d;font-size:11px}.muted{color:#8c98a2}.service-summary{display:flex;align-items:center;gap:8px;min-width:170px}.service-summary b{color:#fff}.team-button{border:1px solid rgba(255,255,255,.13);border-radius:7px;background:#18232d;color:#e8edf0;padding:7px 10px;font-size:11px;font-weight:800;cursor:pointer}.team-button:hover{border-color:#d61f26;color:#ff8179}.drive-link{color:#f07a72;font-weight:800;text-decoration:none}.drive-link:hover{text-decoration:underline}.public-cell{position:sticky;right:0;z-index:2;min-width:150px;background:#111b24!important;box-shadow:-10px 0 18px rgba(0,0,0,.16)}.project-table th.public-cell{z-index:4;background:#17212b!important}.public-wrap{display:flex;align-items:center;justify-content:space-between;gap:9px}.public-wrap span{font-size:11px;color:#94a0aa}.toggle{position:relative;width:42px;height:23px;border:0;border-radius:999px;background:#39434c;cursor:pointer;transition:.18s}.toggle::after{content:"";position:absolute;top:3px;left:3px;width:17px;height:17px;border-radius:50%;background:#fff;transition:.18s}.toggle.on{background:#d61f26}.toggle.on::after{transform:translateX(19px)}.toggle:disabled{cursor:not-allowed;opacity:.45}.team-row td{padding:0!important;background:#0b141c!important}.team-panel{padding:16px 18px 18px;border-bottom:1px solid rgba(255,255,255,.08)}.team-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:12px}.team-panel-head strong{display:block;color:#fff;font-size:13px}.team-panel-head small{display:block;margin-top:4px;color:#7e8b95;font-size:11px}.service-assignments{display:grid;gap:7px}.service-assignment{display:grid;grid-template-columns:minmax(180px,1fr) minmax(240px,1.2fr) auto;align-items:center;gap:12px;padding:10px 12px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:#111b24}.service-assignment strong{color:#edf1f4;font-size:12px}.service-assignment select{height:36px;border:1px solid rgba(255,255,255,.14);border-radius:7px;background:#0d161e;color:#e8edf0;padding:0 10px;font-size:12px}.service-assignment small{color:#71808b;font-size:10px}.team-empty{padding:18px;border:1px dashed rgba(255,255,255,.12);border-radius:8px;color:#7e8b95;text-align:center;font-size:12px}.register-note{padding:12px 14px;border-top:1px solid rgba(255,255,255,.08);background:#0b141c;color:#76838d;font-size:11px;line-height:1.6}.error-inline{padding:11px 14px;border:1px solid rgba(214,31,38,.35);border-radius:8px;background:rgba(214,31,38,.08);color:#ff9c96;font-size:12px}@media(max-width:760px){.projects-toolbar{align-items:stretch}.projects-search{width:100%;min-width:0}.service-assignment{grid-template-columns:1fr}.team-panel-head{flex-direction:column}.public-cell{position:static;box-shadow:none}}
`;

function normalizeProjectId(value: unknown) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  return digits ? `LV-${Number(digits)}` : raw;
}
function truthy(value: unknown) {
  return value === true || ["true", "yes", "1", "on"].includes(String(value || "").trim().toLowerCase());
}
function normalizeCategory(value: unknown): ProjectCategory {
  const text = String(value || "").trim().toLowerCase();
  if (/complete|completed|done|closed|finish/.test(text)) return "Completed";
  if (/pause|paused|hold|inactive|cancel/.test(text)) return "Paused";
  return "Running";
}
function financeRows(data: FinanceSheetData) {
  return (data.rows || []).map((row) => {
    const record: Record<string, unknown> = {};
    (data.headers || []).forEach((header, index) => {
      const key = String(header || "").trim();
      if (key) record[key] = row[index] ?? "";
    });
    return record;
  });
}
function value(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const candidate = record[key];
    if (candidate !== undefined && candidate !== null && String(candidate).trim() !== "") return candidate;
  }
  return "";
}
async function getDriveIndex(category: ProjectCategory): Promise<DriveIndexResponse> {
  const url = new URL("/api/landview", window.location.origin);
  url.searchParams.set("action", "getProjectServiceFolders");
  url.searchParams.set("bulk", "1");
  url.searchParams.set("category", category);
  const response = await fetch(url.toString(), { method: "GET", cache: "no-store", credentials: "same-origin" });
  const json = await response.json();
  if (!response.ok || !json?.success) throw new Error(String(json?.error || `Could not load ${category} project folders.`));
  return json.data || { projects: {} };
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [role, setRole] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"All" | ProjectCategory>("Running");
  const [expanded, setExpanded] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingPublic, setSavingPublic] = useState("");
  const [savingTask, setSavingTask] = useState("");
  const canManage = role === "admin" || role === "manager";

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [session, fileList, dbProjects, employeeRows, taskRows, running, paused, completed] = await Promise.all([
        landViewApi.getSession(),
        landViewApi.getFinanceSheet("File List"),
        landViewApi.getProjects().catch(() => []),
        landViewApi.getEmployees().catch(() => []),
        landViewApi.getErpRecords("tasks").catch(() => []),
        getDriveIndex("Running").catch(() => ({ projects: {} })),
        getDriveIndex("Paused").catch(() => ({ projects: {} })),
        getDriveIndex("Completed").catch(() => ({ projects: {} })),
      ]);

      const dbMap = new Map<string, Record<string, unknown>>();
      (dbProjects || []).forEach((row: Record<string, unknown>) => {
        const id = normalizeProjectId(pick(row, ["Project_ID", "Project ID", "ProjectId"], ""));
        if (id) dbMap.set(id, row);
      });

      const map = new Map<string, ProjectRow>();
      financeRows(fileList).forEach((source) => {
        const rawFileId = value(source, ["FILE ID", "File ID", "File_ID"]);
        const id = normalizeProjectId(rawFileId);
        const name = String(value(source, ["Name", "Project Name", "Client Name"]) || "").trim();
        if (!id || !name) return;
        const existing = dbMap.get(id) || {};
        map.set(id, {
          Project_ID: id,
          Legacy_File_ID: String(rawFileId || "").replace(/\.0$/, ""),
          Project_Name: name,
          Client_Name: String(pick(existing, ["Client_Name", "Client Name"], name) || name),
          Phone_Number: String(value(source, ["Contact No.", "Contact No", "Phone", "Phone Number"]) || ""),
          Project_Type: String(value(source, ["Type", "Project Type"]) || ""),
          Location: String(value(source, ["Address", "Location"]) || ""),
          Project_Area: String(value(source, ["Area", "Project Area"]) || ""),
          Number_of_Stories: String(value(source, ["Floor", "Floors", "Story"]) || ""),
          Status: String(pick(existing, ["Status", "status"], "")),
          Public_Display: pick(existing, ["Public_Display", "Public Display"], false),
          Public_Project_Title: pick(existing, ["Public_Project_Title", "Public Project Title"], ""),
          Public_Description: pick(existing, ["Public_Description", "Public Description"], ""),
          Public_Services: pick(existing, ["Public_Services", "Public Services"], ""),
          Completion_Year: pick(existing, ["Completion_Year", "Completion Year"], ""),
          Public_Display_Order: pick(existing, ["Public_Display_Order", "Public Display Order"], ""),
          Client_User_ID: pick(existing, ["Client_User_ID", "Client User ID"], ""),
          Client_Username: pick(existing, ["Client_Username", "Client Username"], ""),
          Drive_Folder_URL: String(pick(existing, ["Drive_Folder_URL", "Drive Folder URL"], "")),
        });
      });

      const mergeDrive = (source: Record<string, any>, driveCategory: ProjectCategory) => {
        Object.entries(source || {}).forEach(([rawId, item]) => {
          const id = normalizeProjectId(rawId || item?.projectId);
          const current = map.get(id);
          if (!id || !current) return;
          map.set(id, {
            ...current,
            Status: driveCategory,
            Drive_Folder_URL: String(item?.projectFolderUrl || current.Drive_Folder_URL || ""),
          });
        });
      };
      mergeDrive(running.projects || {}, "Running");
      mergeDrive(paused.projects || {}, "Paused");
      mergeDrive(completed.projects || {}, "Completed");

      setProjects(Array.from(map.values()).sort((a, b) => Number(normalizeProjectId(b.Project_ID).replace("LV-", "")) - Number(normalizeProjectId(a.Project_ID).replace("LV-", ""))));
      setEmployees((employeeRows || []).filter((employee: Record<string, unknown>) => !/inactive|former/i.test(String(pick(employee, ["Status", "status"], "")))) as EmployeeRow[]);
      setTasks((taskRows || []) as TaskRow[]);
      setRole(String(session?.user?.role || session?.user?.Role || "").trim().toLowerCase());
    } catch (e: any) {
      setError(e?.message || "Could not load projects from LV - Auto Invoice.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const counts = useMemo(() => ({
    All: projects.length,
    Running: projects.filter((p) => normalizeCategory(p.Status) === "Running").length,
    Paused: projects.filter((p) => normalizeCategory(p.Status) === "Paused").length,
    Completed: projects.filter((p) => normalizeCategory(p.Status) === "Completed").length,
  }), [projects]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return projects.filter((project) => {
      const status = normalizeCategory(project.Status);
      if (category !== "All" && status !== category) return false;
      if (!term) return true;
      return [project.Project_ID, project.Project_Name, project.Client_Name, project.Project_Type, project.Location, project.Project_Area, project.Number_of_Stories, status].join(" ").toLowerCase().includes(term);
    });
  }, [projects, category, query]);

  const tasksByProject = useMemo(() => {
    const map = new Map<string, TaskRow[]>();
    tasks.forEach((task) => {
      const id = normalizeProjectId(pick(task, ["Project_ID", "Project ID", "ProjectId"], ""));
      if (!id) return;
      const bucket = map.get(id) || [];
      bucket.push(task);
      map.set(id, bucket);
    });
    map.forEach((rows) => rows.sort((a,b) => String(pick(a,["Task_Title","Task Title","Title"],"")).localeCompare(String(pick(b,["Task_Title","Task Title","Title"],"")))));
    return map;
  }, [tasks]);

  async function togglePublic(project: ProjectRow) {
    const id = normalizeProjectId(project.Project_ID);
    if (!canManage || !id || savingPublic) return;
    const next = !truthy(project.Public_Display);
    setSavingPublic(id);
    setError("");
    try {
      const response = await fetch("/api/project-public-visibility", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          projectId: id,
          publicDisplay: next,
          project: {
            Legacy_File_ID: project.Legacy_File_ID || id.replace("LV-", ""),
            Project_Name: project.Project_Name || "",
            Client_Name: project.Client_Name || project.Project_Name || "",
            Phone_Number: project.Phone_Number || "",
            Project_Type: project.Project_Type || "",
            Location: project.Location || "",
            Project_Area: project.Project_Area || "",
            Number_of_Stories: project.Number_of_Stories || "",
          },
        }),
      });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(String(json?.error || `Could not update ${id} public visibility.`));
      setProjects((rows) => rows.map((row) => normalizeProjectId(row.Project_ID) === id ? { ...row, Public_Display: next } : row));
    } catch (e: any) {
      setError(e?.message || `Could not update ${id} public visibility.`);
    } finally {
      setSavingPublic("");
    }
  }

  async function assignService(task: TaskRow, employeeId: string) {
    if (!canManage) return;
    const taskId = String(pick(task, ["Task_ID", "Task ID", "TaskId"], "")).trim();
    if (!taskId) return;
    setSavingTask(taskId);
    setError("");
    try {
      const updated = await landViewApi.updateErpRecord("tasks", taskId, { Assigned_Employee_ID: employeeId });
      setTasks((rows) => rows.map((row) => String(pick(row,["Task_ID","Task ID","TaskId"],"")) === taskId ? { ...row, ...(updated as Record<string, unknown>), Assigned_Employee_ID: employeeId } : row));
    } catch (e:any) {
      setError(e?.message || "Could not assign the service team member.");
    } finally {
      setSavingTask("");
    }
  }

  if (loading) return <LoadingState label="Loading projects from LV - Auto Invoice..." />;
  if (error && projects.length === 0) return <ErrorState message={error} onRetry={load} />;

  return <>
    <style dangerouslySetInnerHTML={{ __html: css }} />
    <div className="projects-register">
      <PageHeader eyebrow="AUTO INVOICE PROJECT REGISTER" title="Projects" description="Project names and details come directly from LV - Auto Invoice → File List. Use this page only to assign service responsibility and control public website visibility." action={<button className="refresh-btn" type="button" onClick={load}>Refresh</button>} />
      {error && <div className="error-inline">{error}</div>}
      <div className="projects-toolbar">
        <div className="projects-toolbar-left">
          {(["Running","Paused","Completed","All"] as const).map((item) => <button key={item} type="button" className={`filter-btn ${category===item?"active":""}`} onClick={() => setCategory(item)}>{item} · {counts[item]}</button>)}
        </div>
        <input className="projects-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ID, client, type, location, area or floor" />
      </div>
      <section className="register-shell">
        <div className="register-scroll">
          <table className="project-table">
            <thead><tr><th>Project</th><th>Type</th><th>Location / Area</th><th>Status</th><th>Service team</th><th>Drive</th><th className="public-cell">Public website</th></tr></thead>
            <tbody>
              {filtered.map((project) => {
                const id = normalizeProjectId(project.Project_ID);
                const projectTasks = tasksByProject.get(id) || [];
                const assignedCount = projectTasks.filter((task) => String(pick(task,["Assigned_Employee_ID","Assigned Employee ID"],"")).trim()).length;
                const isExpanded = expanded === id;
                const publicOn = truthy(project.Public_Display);
                const driveUrl = String(project.Drive_Folder_URL || "").trim();
                const name = String(project.Project_Name || id);
                const details = [project.Number_of_Stories, project.Project_Area].filter(Boolean).join(" · ");
                return <Fragment key={id}>
                  <tr>
                    <td><div className="project-main"><span className="project-id">{id}</span><div><strong>{name}</strong>{project.Phone_Number && <small>{String(project.Phone_Number)}</small>}</div></div></td>
                    <td>{String(project.Project_Type || "—")}</td>
                    <td><div>{String(project.Location || "—")}</div>{details && <div className="muted" style={{marginTop:4}}>{details}</div>}</td>
                    <td><StatusBadge value={normalizeCategory(project.Status)} /></td>
                    <td><div className="service-summary"><span><b>{assignedCount}</b>/{projectTasks.length || 0} assigned</span><button className="team-button" type="button" onClick={() => setExpanded(isExpanded?"":id)}>{isExpanded?"Close":"Assign team"}</button></div></td>
                    <td>{driveUrl ? <a className="drive-link" href={driveUrl} target="_blank" rel="noreferrer">Open Drive ↗</a> : <span className="muted">—</span>}</td>
                    <td className="public-cell"><div className="public-wrap"><span>{publicOn?"Shown":"Hidden"}</span><button type="button" className={`toggle ${publicOn?"on":""}`} role="switch" aria-checked={publicOn} aria-label={`${publicOn?"Hide":"Show"} ${id} on the public website`} disabled={!canManage || savingPublic===id} onClick={() => void togglePublic(project)} /></div></td>
                  </tr>
                  {isExpanded && <tr className="team-row"><td colSpan={7}><div className="team-panel">
                    <div className="team-panel-head"><div><strong>Service responsibility · {id}</strong><small>Services are generated from the billing records in LV - Auto Invoice. Assign the responsible team member here.</small></div>{!canManage && <small>Accounts access is view-only for assignments.</small>}</div>
                    {projectTasks.length ? <div className="service-assignments">{projectTasks.map((task) => {
                      const taskId = String(pick(task,["Task_ID","Task ID","TaskId"],""));
                      const title = String(pick(task,["Task_Title","Task Title","Title"],"Service"));
                      const assignedEmployee = String(pick(task,["Assigned_Employee_ID","Assigned Employee ID"],""));
                      return <div className="service-assignment" key={taskId}><strong>{title}</strong><select value={assignedEmployee} disabled={!canManage || savingTask===taskId} onChange={(e) => void assignService(task,e.target.value)}><option value="">Unassigned</option>{employees.map((employee) => {
                        const employeeId = String(pick(employee,["Employee_ID","Employee ID","EmployeeId"],""));
                        const employeeName = String(pick(employee,["Employee_Name","Employee Name","Name"],employeeId));
                        const position = String(pick(employee,["Position","Department"],""));
                        return <option value={employeeId} key={employeeId}>{employeeName}{position?` — ${position}`:""}</option>;
                      })}</select><small>{savingTask===taskId?"Saving…":assignedEmployee || "Not assigned"}</small></div>;
                    })}</div> : <div className="team-empty">No billed service is currently linked to this project in LV - Auto Invoice.</div>}
                  </div></td></tr>}
                </Fragment>;
              })}
            </tbody>
          </table>
        </div>
        {!filtered.length && <div className="team-empty" style={{margin:16}}>No populated projects from the Auto Invoice File List match this view.</div>}
        <div className="register-note">Source of truth: LV - Auto Invoice → File List. Blank File List rows are ignored. LAND VIEW database rows are created automatically only when portal-specific state is needed, such as Public Website visibility.</div>
      </section>
    </div>
  </>;
}
