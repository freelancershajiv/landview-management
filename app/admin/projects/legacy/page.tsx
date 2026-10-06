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
  Referred_By: string;
  Ref_Contact: string;
  Project_Type: string;
  Location: string;
  Location_Tag: string;
  Project_Area: string;
  Plot_Area: string;
  Number_of_Stories: string;
  Start_Date: string;
  Completion_Year: string;
  Design_Stage_Status: string;
  Approval_Stage_Status: string;
  Supervision_Stage_Status: string;
  Site_Latitude: string;
  Site_Longitude: string;
  Site_Geofence_Radius_M: string;
  Notes: string;
  Drive_Folder_ID: string;
  Drive_Folder_URL: string;
  Documents_Folder_ID: string;
  Documents_Folder_URL: string;
  Invoices_Folder_ID: string;
  Invoices_Folder_URL: string;
  Client_User_ID: string;
  Client_Username: string;
  Public_Display: boolean;
  Public_Display_Order: string;
  Public_Project_Title: string;
  Public_Description: string;
  Project_Category: string;
  Cover_Image_URL: string;
  Gallery_Images: string;
  Public_Services: string;
  Engineering_Bill: string;
  Supervision_Bill: string;
  Other_Services_Bill: string;
};

const emptyForm: LegacyProject = {
  Project_ID: "",
  Project_Name: "",
  Client_Name: "",
  Phone_Number: "",
  Referred_By: "",
  Ref_Contact: "",
  Project_Type: "",
  Location: "",
  Location_Tag: "",
  Project_Area: "",
  Plot_Area: "",
  Number_of_Stories: "",
  Start_Date: "",
  Completion_Year: "",
  Design_Stage_Status: "In Progress",
  Approval_Stage_Status: "Pending",
  Supervision_Stage_Status: "Completed",
  Site_Latitude: "",
  Site_Longitude: "",
  Site_Geofence_Radius_M: "150",
  Notes: "",
  Drive_Folder_ID: "",
  Drive_Folder_URL: "",
  Documents_Folder_ID: "",
  Documents_Folder_URL: "",
  Invoices_Folder_ID: "",
  Invoices_Folder_URL: "",
  Client_User_ID: "",
  Client_Username: "",
  Public_Display: false,
  Public_Display_Order: "0",
  Public_Project_Title: "",
  Public_Description: "",
  Project_Category: "",
  Cover_Image_URL: "",
  Gallery_Images: "",
  Public_Services: "",
  Engineering_Bill: "",
  Supervision_Bill: "",
  Other_Services_Bill: "",
};

const masterKeys: Array<keyof Omit<LegacyProject, "Engineering_Bill" | "Supervision_Bill" | "Other_Services_Bill">> = [
  "Project_ID", "Project_Name", "Client_Name", "Phone_Number", "Referred_By", "Ref_Contact", "Project_Type", "Location", "Location_Tag",
  "Project_Area", "Plot_Area", "Number_of_Stories", "Start_Date", "Completion_Year", "Design_Stage_Status", "Approval_Stage_Status",
  "Supervision_Stage_Status", "Site_Latitude", "Site_Longitude", "Site_Geofence_Radius_M", "Notes", "Drive_Folder_ID", "Drive_Folder_URL",
  "Documents_Folder_ID", "Documents_Folder_URL", "Invoices_Folder_ID", "Invoices_Folder_URL", "Client_User_ID", "Client_Username", "Public_Display",
  "Public_Display_Order", "Public_Project_Title", "Public_Description", "Project_Category", "Cover_Image_URL", "Gallery_Images", "Public_Services",
];

const css = `
.legacy-page{display:grid;gap:18px}.legacy-actions{display:flex;gap:8px;flex-wrap:wrap}.legacy-btn{height:40px;padding:0 14px;border:1px solid var(--theme-line-rgba_255_255_255__14_,rgba(255,255,255,.14));border-radius:8px;background:var(--theme-bg-_18232d,#18232d);color:var(--theme-ink-_fff,#fff);font-size:12px;font-weight:800;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}.legacy-btn.primary{background:#d61f26;border-color:var(--theme-line-_d61f26,#d61f26)}.legacy-btn:disabled{opacity:.5;cursor:not-allowed}.legacy-grid{display:grid;grid-template-columns:minmax(420px,1fr) minmax(0,1fr);gap:16px}.legacy-card{border:1px solid var(--theme-line-rgba_255_255_255__11_,rgba(255,255,255,.11));border-radius:12px;background:var(--theme-bg-_0e1720,#0e1720);overflow:hidden}.legacy-head{padding:15px 16px;border-bottom:1px solid var(--theme-line-rgba_255_255_255__08_,rgba(255,255,255,.08));background:var(--theme-bg-_141e28,#141e28)}.legacy-head strong{display:block;color:var(--theme-ink-_f5f7f8,#f5f7f8);font-size:13px}.legacy-head small{display:block;margin-top:4px;color:var(--theme-ink-_7f8c97,#7f8c97);font-size:11px;line-height:1.5}.legacy-form{display:grid;grid-template-columns:1fr 1fr;gap:11px;padding:16px}.legacy-form label{display:grid;gap:6px;color:var(--theme-ink-_8f9aa4,#8f9aa4);font-size:11px;font-weight:700}.legacy-form label.full,.legacy-section-title,.legacy-form .submit{grid-column:1/-1}.legacy-form input,.legacy-form select,.legacy-form textarea{border:1px solid var(--theme-line-rgba_255_255_255__13_,rgba(255,255,255,.13));border-radius:7px;background:var(--theme-bg-_111b24,#111b24);color:var(--theme-ink-_eef2f5,#eef2f5);padding:0 10px;font-size:12px}.legacy-form input,.legacy-form select{height:40px}.legacy-form textarea{padding:10px;resize:vertical;line-height:1.5}.legacy-form input:focus,.legacy-form select:focus,.legacy-form textarea:focus{outline:none;border-color:var(--theme-line-_d61f26,#d61f26)}.legacy-form input:read-only{opacity:.75;cursor:not-allowed}.legacy-section-title{margin-top:4px;padding:10px 11px;border:1px solid var(--theme-line-rgba_255_255_255__08_,rgba(255,255,255,.08));border-radius:8px;background:var(--theme-bg-_141e28,#141e28)}.legacy-section-title strong{display:block;color:var(--theme-ink-_fff,#fff);font-size:12px}.legacy-section-title small{display:block;margin-top:3px;color:var(--theme-ink-_82909b,#82909b);font-size:10px;line-height:1.45}.legacy-edit-state{grid-column:1/-1;padding:10px 12px;border-radius:8px;border:1px solid rgba(214,31,38,.25);background:rgba(214,31,38,.06);color:var(--theme-ink-_dfe5e9,#dfe5e9);font-size:11px;line-height:1.5}.legacy-check{display:flex!important;align-items:center;gap:9px!important;min-height:40px;padding:9px 10px;border:1px solid var(--theme-line-rgba_255_255_255__13_,rgba(255,255,255,.13));border-radius:7px;background:var(--theme-bg-_111b24,#111b24)}.legacy-check input{width:16px;height:16px;margin:0}.billing-box{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:12px;border:1px solid var(--theme-line-rgba_214_31_38__22_,rgba(214,31,38,.22));border-radius:9px;background:var(--theme-bg-rgba_214_31_38__05_,rgba(214,31,38,.05))}.billing-box>div{grid-column:1/-1}.billing-box strong{display:block;color:var(--theme-ink-_fff,#fff);font-size:12px}.billing-box small{display:block;margin-top:3px;color:var(--theme-ink-_8996a1,#8996a1);font-size:10px;line-height:1.45}.legacy-message{margin:0 16px 16px;padding:10px 12px;border:1px solid var(--theme-line-rgba_255_255_255__1_,rgba(255,255,255,.1));border-radius:8px;color:var(--theme-ink-_b9c2c9,#b9c2c9);font-size:11px;line-height:1.55}.legacy-message.ok{border-color:var(--theme-line-rgba_60_190_120__3_,rgba(60,190,120,.3));color:var(--theme-ink-_8ee0ae,#8ee0ae)}.legacy-message.err{border-color:var(--theme-line-rgba_214_31_38__35_,rgba(214,31,38,.35));color:var(--theme-ink-_ff9993,#ff9993)}.legacy-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:14px 16px;border-bottom:1px solid var(--theme-line-rgba_255_255_255__08_,rgba(255,255,255,.08))}.legacy-stat{padding:10px;border:1px solid var(--theme-line-rgba_255_255_255__08_,rgba(255,255,255,.08));border-radius:8px;background:var(--theme-bg-_111b24,#111b24)}.legacy-stat b{display:block;color:var(--theme-ink-_fff,#fff);font-size:18px}.legacy-stat span{display:block;margin-top:3px;color:var(--theme-ink-_7f8c97,#7f8c97);font-size:10px}.legacy-scroll{max-height:860px;overflow:auto}.legacy-table{width:100%;border-collapse:collapse;min-width:760px}.legacy-table th{position:sticky;top:0;z-index:2;padding:11px 12px;background:var(--theme-bg-_141e28,#141e28);color:var(--theme-ink-_82909b,#82909b);border-bottom:1px solid var(--theme-line-rgba_255_255_255__09_,rgba(255,255,255,.09));text-align:left;font-size:10px;letter-spacing:.06em;text-transform:uppercase}.legacy-table td{padding:11px 12px;border-bottom:1px solid var(--theme-line-rgba_255_255_255__07_,rgba(255,255,255,.07));color:var(--theme-ink-_dfe5e9,#dfe5e9);font-size:11px;background:var(--theme-bg-_0f1821,#0f1821)}.legacy-table tr:last-child td{border-bottom:0}.legacy-id{color:var(--theme-ink-_ff756e,#ff756e);font-weight:900}.legacy-muted{color:var(--theme-ink-_788691,#788691)}.legacy-state{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.04em;border:1px solid rgba(255,255,255,.1)}.legacy-state.registered{color:#8ee0ae;border-color:rgba(60,190,120,.3);background:rgba(60,190,120,.08)}.legacy-state.missing{color:#ffb3ae;border-color:rgba(214,31,38,.28);background:rgba(214,31,38,.07)}.legacy-empty{padding:28px;text-align:center;color:var(--theme-ink-_7f8c97,#7f8c97);font-size:12px}.legacy-note{padding:12px 16px;border-top:1px solid var(--theme-line-rgba_255_255_255__08_,rgba(255,255,255,.08));color:var(--theme-ink-_75828d,#75828d);font-size:11px;line-height:1.55}@media(max-width:1100px){.legacy-grid{grid-template-columns:1fr}}@media(max-width:700px){.legacy-form{grid-template-columns:1fr}.legacy-form label.full,.legacy-form .submit,.legacy-section-title,.legacy-edit-state,.billing-box{grid-column:auto}.billing-box{grid-template-columns:1fr}.billing-box>div{grid-column:auto}.legacy-summary{grid-template-columns:1fr 1fr 1fr}}
`;

function text(value: unknown) { return String(value ?? "").trim(); }
function amount(value: unknown) {
  const parsed = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
function normalizeProjectId(value: unknown) {
  const raw = text(value).toUpperCase();
  if (!raw) return "";
  const match = raw.match(/LV[\s_-]*0*(\d+)/i);
  if (match?.[1]) return `LV-${String(Number(match[1])).padStart(3, "0")}`;
  const digits = raw.replace(/\D/g, "");
  return digits ? `LV-${String(Number(digits)).padStart(3, "0")}` : raw;
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
  const id = normalizeProjectId(first(row, ["FILE ID", "File ID", "File_ID", "Project_ID", "Project ID"]));
  const projectName = text(first(row, ["Project Name", "Project_Name", "Name", "Client Name", "Client_Name"]));
  if (!id || !projectName) return null;
  const historicalStatus = text(first(row, ["Status"])).toLowerCase();
  const completed = historicalStatus === "completed" || historicalStatus === "complete";
  return {
    ...emptyForm,
    Project_ID: id,
    Project_Name: projectName,
    Client_Name: text(first(row, ["Client Name", "Client_Name", "Name"])) || projectName,
    Phone_Number: text(first(row, ["Contact No.", "Contact No", "Phone", "Phone Number", "Phone_Number"])),
    Referred_By: text(first(row, ["Referred By", "Referred_By", "Referral", "Reference"])),
    Ref_Contact: text(first(row, ["Ref. Contact", "Ref Contact", "Ref_Contact", "Reference Contact"])),
    Project_Type: text(first(row, ["Type", "Project Type", "Project_Type"])),
    Location: text(first(row, ["Address", "Location"])),
    Location_Tag: text(first(row, ["Location Tag", "Location_Tag", "Map", "Map Link"])),
    Project_Area: text(first(row, ["Area", "Project Area", "Project_Area"])),
    Plot_Area: text(first(row, ["Plot Area", "Plot_Area"])),
    Number_of_Stories: text(first(row, ["Floor", "Floors", "Story", "Number of Stories", "Number_of_Stories"])),
    Start_Date: text(first(row, ["Start Date", "Start_Date"])),
    Completion_Year: text(first(row, ["Completion Year", "Completion_Year"])),
    Design_Stage_Status: completed ? "Completed" : "In Progress",
    Approval_Stage_Status: completed ? "Completed" : "Pending",
    Supervision_Stage_Status: "Completed",
    Site_Latitude: text(first(row, ["Site Latitude", "Site_Latitude", "Latitude"])),
    Site_Longitude: text(first(row, ["Site Longitude", "Site_Longitude", "Longitude"])),
    Notes: text(first(row, ["Notes", "Remarks"])),
  };
}
function mergeRegisteredProject(fallback: LegacyProject, row: Row): LegacyProject {
  const merged: LegacyProject = { ...fallback };
  for (const key of masterKeys) {
    if (!Object.prototype.hasOwnProperty.call(row, key)) continue;
    if (key === "Public_Display") {
      merged.Public_Display = Boolean(row[key]);
    } else {
      (merged as unknown as Record<string, unknown>)[key] = text(row[key]);
    }
  }
  merged.Project_ID = normalizeProjectId(merged.Project_ID || fallback.Project_ID);
  merged.Site_Geofence_Radius_M = merged.Site_Geofence_Radius_M || "150";
  merged.Public_Display_Order = merged.Public_Display_Order || "0";
  merged.Design_Stage_Status = merged.Design_Stage_Status || "Pending";
  merged.Approval_Stage_Status = merged.Approval_Stage_Status || "Pending";
  merged.Supervision_Stage_Status = merged.Supervision_Stage_Status || "Completed";
  return merged;
}
function projectPayload(project: LegacyProject, id: string) {
  return {
    Project_ID: id,
    Project_Name: text(project.Project_Name),
    Client_Name: text(project.Client_Name) || text(project.Project_Name),
    Phone_Number: text(project.Phone_Number),
    Referred_By: text(project.Referred_By),
    Ref_Contact: text(project.Ref_Contact),
    Project_Type: text(project.Project_Type),
    Location: text(project.Location),
    Location_Tag: text(project.Location_Tag),
    Project_Area: text(project.Project_Area),
    Plot_Area: text(project.Plot_Area),
    Number_of_Stories: text(project.Number_of_Stories),
    Floors: text(project.Number_of_Stories),
    Start_Date: text(project.Start_Date),
    Completion_Year: text(project.Completion_Year),
    Design_Stage_Status: text(project.Design_Stage_Status) || "Pending",
    Approval_Stage_Status: text(project.Approval_Stage_Status) || "Pending",
    Supervision_Stage_Status: text(project.Supervision_Stage_Status) || "Completed",
    Site_Latitude: text(project.Site_Latitude),
    Site_Longitude: text(project.Site_Longitude),
    Site_Geofence_Radius_M: text(project.Site_Geofence_Radius_M) || "150",
    Notes: text(project.Notes),
    Drive_Folder_ID: text(project.Drive_Folder_ID),
    Drive_Folder_URL: text(project.Drive_Folder_URL),
    Documents_Folder_ID: text(project.Documents_Folder_ID),
    Documents_Folder_URL: text(project.Documents_Folder_URL),
    Invoices_Folder_ID: text(project.Invoices_Folder_ID),
    Invoices_Folder_URL: text(project.Invoices_Folder_URL),
    Client_User_ID: text(project.Client_User_ID),
    Client_Username: text(project.Client_Username),
    Public_Display: project.Public_Display,
    Public_Display_Order: text(project.Public_Display_Order) || "0",
    Public_Project_Title: text(project.Public_Project_Title),
    Public_Description: text(project.Public_Description),
    Project_Category: text(project.Project_Category),
    Cover_Image_URL: text(project.Cover_Image_URL),
    Gallery_Images: text(project.Gallery_Images),
    Public_Services: text(project.Public_Services),
  };
}

export default function LegacyProjectsPage() {
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState("");
  const [legacy, setLegacy] = useState<LegacyProject[]>([]);
  const [registered, setRegistered] = useState<Set<string>>(new Set());
  const [registeredProjects, setRegisteredProjects] = useState<Map<string, Row>>(new Map());
  const [editingOriginalId, setEditingOriginalId] = useState("");
  const [form, setForm] = useState<LegacyProject>(emptyForm);
  const [saving, setSaving] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [message, setMessage] = useState<{kind:"ok"|"err"; text:string}|null>(null);
  const [error, setError] = useState("");

  const canManage = role === "admin" || role === "manager";
  const formId = normalizeProjectId(form.Project_ID);
  const formIsRegistered = registered.has(editingOriginalId || formId);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [session, fileList, dbProjects] = await Promise.all([
        landViewApi.getSession(),
        landViewApi.getFinanceSheet("File List"),
        landViewApi.getProjects(),
      ]);
      setRole(text(session?.user?.role || session?.user?.Role).toLowerCase());
      const ids = new Set<string>();
      const projectMap = new Map<string, Row>();
      (dbProjects || []).forEach((row: Row) => {
        const id = normalizeProjectId(pick(row, ["Project_ID", "Project ID", "ProjectId"], ""));
        if (!id) return;
        ids.add(id);
        projectMap.set(id, row);
      });
      setRegistered(ids);
      setRegisteredProjects(projectMap);
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

  function setField<K extends keyof LegacyProject>(key: K, value: LegacyProject[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function edit(project: LegacyProject) {
    const id = normalizeProjectId(project.Project_ID);
    const current = registeredProjects.get(id);
    setForm(current ? mergeRegisteredProject(project, current) : { ...project, Project_ID: id });
    setEditingOriginalId(id);
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function hydrateExistingProject() {
    const id = normalizeProjectId(form.Project_ID);
    if (!id) return;
    const current = registeredProjects.get(id);
    if (current) {
      setForm((previous) => mergeRegisteredProject({ ...previous, Project_ID: id }, current));
      setEditingOriginalId(id);
    } else {
      setForm((previous) => ({ ...previous, Project_ID: id }));
      if (editingOriginalId && !registered.has(editingOriginalId)) setEditingOriginalId(id);
    }
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingOriginalId("");
  }

  async function saveOpeningBills(project: LegacyProject, id: string) {
    const billSpecs = [
      { value: amount(project.Engineering_Bill), category: "Engineering Bill", description: "Legacy opening Engineering / Design Bill", key: "engineering" },
      { value: amount(project.Supervision_Bill), category: "Supervision Bill", description: "Legacy opening Supervision Bill", key: "supervision" },
      { value: amount(project.Other_Services_Bill), category: "Other Services Bill", description: "Legacy opening Other Services Bill", key: "other-services" },
    ];
    let created = 0;
    for (const spec of billSpecs) {
      if (spec.value <= 0) continue;
      await landViewApi.createBill({
        Project_ID: id,
        Billing_Category: spec.category,
        Category: spec.category,
        Description: spec.description,
        Amount: spec.value,
        Discount: 0,
        Status: "ACTIVE",
        Notes: "Opening balance entered during legacy project registration.",
        Idempotency_Key: `legacy-registration:${id}:${spec.key}`,
      });
      created += 1;
    }
    return created;
  }

  async function register(project: LegacyProject, useEditingContext = true) {
    const id = normalizeProjectId(project.Project_ID);
    if (!canManage) throw new Error("Admin or manager access is required.");
    if (!id) throw new Error("Enter the historical project ID, for example LV-069.");
    if (!text(project.Project_Name)) throw new Error("Project name is required.");

    const originalId = useEditingContext && editingOriginalId && registered.has(editingOriginalId)
      ? editingOriginalId
      : registered.has(id) ? id : "";
    if (originalId && id !== originalId) throw new Error("A registered legacy Project ID is protected. Update the other project details, or change the ID from the main project editor if required.");

    const payload = projectPayload(project, id);
    setSaving(id);
    try {
      if (originalId) await landViewApi.updateProject(originalId, payload);
      else await landViewApi.createProject(payload);

      const billsCreated = await saveOpeningBills(project, id);
      setRegistered((current) => new Set([...current, id]));
      setRegisteredProjects((current) => {
        const next = new Map(current);
        next.set(id, payload);
        return next;
      });
      return { id, createdProject: !originalId, updatedProject: Boolean(originalId), billsCreated };
    } finally {
      setSaving("");
    }
  }

  async function submitManual(event: React.FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      const result = await register(form);
      const projectPart = result.createdProject ? "project registered" : "project details updated";
      const billPart = result.billsCreated ? `${result.billsCreated} opening bill categor${result.billsCreated === 1 ? "y" : "ies"} synced` : "no opening bill entered";
      setMessage({ kind: "ok", text: `${result.id}: ${projectPart}; ${billPart}.` });
      resetForm();
    } catch (e:any) {
      setMessage({ kind: "err", text: e?.message || "Could not save the legacy project." });
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
          const result = await register(project, false);
          if (result.createdProject) created += 1;
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
      setEditingOriginalId("");
      setBulkSaving(false);
    }
  }

  if (loading) return <LoadingState label="Comparing old projects with Supabase..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return <>
    <style dangerouslySetInnerHTML={{__html:css}} />
    <div className="legacy-page">
      <PageHeader eyebrow="LAND VIEW DATABASE" title="Legacy Project Registration" description="Register missing historical projects or open an already-registered legacy project and update its full project record from the same screen." action={<div className="legacy-actions"><Link className="legacy-btn" href="/admin/projects">← Projects</Link><button className="legacy-btn" type="button" onClick={load}>Refresh</button></div>} />

      <div className="legacy-grid">
        <section className="legacy-card">
          <div className="legacy-head"><strong>{formIsRegistered ? "Update registered legacy project" : "Register legacy project"}</strong><small>Registered projects load their current Supabase values. All project details below can be updated here; the historical Project ID is protected after registration.</small></div>
          <form className="legacy-form" onSubmit={submitManual}>
            {formIsRegistered && <div className="legacy-edit-state"><strong>{editingOriginalId || formId}</strong> is already registered. Saving this form will update its project master record instead of leaving it unchanged.</div>}

            <div className="legacy-section-title"><strong>Project details</strong><small>Core client, referral, project and date information.</small></div>
            <label>Historical Project ID<input value={form.Project_ID} onChange={(e)=>setField("Project_ID",e.target.value)} onBlur={hydrateExistingProject} placeholder="LV-069" readOnly={formIsRegistered} required /></label>
            <label>Project Type<input value={form.Project_Type} onChange={(e)=>setField("Project_Type",e.target.value)} /></label>
            <label className="full">Project Name<input value={form.Project_Name} onChange={(e)=>setForm((current)=>({...current,Project_Name:e.target.value,Client_Name:current.Client_Name || e.target.value}))} required /></label>
            <label>Client Name<input value={form.Client_Name} onChange={(e)=>setField("Client_Name",e.target.value)} /></label>
            <label>Phone<input value={form.Phone_Number} onChange={(e)=>setField("Phone_Number",e.target.value)} /></label>
            <label>Referred By<input value={form.Referred_By} onChange={(e)=>setField("Referred_By",e.target.value)} /></label>
            <label>Ref. Contact<input value={form.Ref_Contact} onChange={(e)=>setField("Ref_Contact",e.target.value)} /></label>
            <label className="full">Location / Address<input value={form.Location} onChange={(e)=>setField("Location",e.target.value)} placeholder="Address or Google Maps link" /></label>
            <label className="full">Location Tag / Map Link<input value={form.Location_Tag} onChange={(e)=>setField("Location_Tag",e.target.value)} placeholder="Google Maps project location" /></label>
            <label>Project Area<input value={form.Project_Area} onChange={(e)=>setField("Project_Area",e.target.value)} /></label>
            <label>Plot Area<input inputMode="decimal" value={form.Plot_Area} onChange={(e)=>setField("Plot_Area",e.target.value)} /></label>
            <label>Stories / Floors<input value={form.Number_of_Stories} onChange={(e)=>setField("Number_of_Stories",e.target.value)} /></label>
            <label>Start Date<input type="date" value={form.Start_Date} onChange={(e)=>setField("Start_Date",e.target.value)} /></label>
            <label>Completion Year<input value={form.Completion_Year} onChange={(e)=>setField("Completion_Year",e.target.value)} placeholder="2026" /></label>
            <label className="full">Notes<textarea rows={3} value={form.Notes} onChange={(e)=>setField("Notes",e.target.value)} /></label>

            <div className="legacy-section-title"><strong>Workflow & site location</strong><small>Project lifecycle stages and location-verification coordinates.</small></div>
            <label>Design Stage<select value={form.Design_Stage_Status} onChange={(e)=>setField("Design_Stage_Status",e.target.value)}><option>Pending</option><option>In Progress</option><option>Completed</option></select></label>
            <label>Approval Stage<select value={form.Approval_Stage_Status} onChange={(e)=>setField("Approval_Stage_Status",e.target.value)}><option>Pending</option><option>In Progress</option><option>Completed</option></select></label>
            <label>Supervision / Construction<select value={form.Supervision_Stage_Status} onChange={(e)=>setField("Supervision_Stage_Status",e.target.value)}><option>Pending</option><option>In Progress</option><option>Completed</option></select></label>
            <label>Geofence Radius (m)<input type="number" min="25" max="1000" value={form.Site_Geofence_Radius_M} onChange={(e)=>setField("Site_Geofence_Radius_M",e.target.value)} /></label>
            <label>Site Latitude<input inputMode="decimal" value={form.Site_Latitude} onChange={(e)=>setField("Site_Latitude",e.target.value)} /></label>
            <label>Site Longitude<input inputMode="decimal" value={form.Site_Longitude} onChange={(e)=>setField("Site_Longitude",e.target.value)} /></label>

            <div className="legacy-section-title"><strong>Public website</strong><small>Control whether and how this project appears on the public project profile/map.</small></div>
            <label className="legacy-check"><input type="checkbox" checked={form.Public_Display} onChange={(e)=>setField("Public_Display",e.target.checked)} /><span>{form.Public_Display ? "Visible on public website" : "Hidden from public website"}</span></label>
            <label>Public Display Order<input type="number" value={form.Public_Display_Order} onChange={(e)=>setField("Public_Display_Order",e.target.value)} /></label>
            <label>Public Project Title<input value={form.Public_Project_Title} onChange={(e)=>setField("Public_Project_Title",e.target.value)} /></label>
            <label>Project Category<input value={form.Project_Category} onChange={(e)=>setField("Project_Category",e.target.value)} /></label>
            <label className="full">Cover Image URL<input value={form.Cover_Image_URL} onChange={(e)=>setField("Cover_Image_URL",e.target.value)} /></label>
            <label className="full">Gallery Images<textarea rows={3} value={form.Gallery_Images} onChange={(e)=>setField("Gallery_Images",e.target.value)} /></label>
            <label className="full">Public Services<textarea rows={3} value={form.Public_Services} onChange={(e)=>setField("Public_Services",e.target.value)} /></label>
            <label className="full">Public Description<textarea rows={4} value={form.Public_Description} onChange={(e)=>setField("Public_Description",e.target.value)} /></label>

            <div className="legacy-section-title"><strong>Google Drive & system links</strong><small>Maintain the project workspace folder references and client-account links.</small></div>
            <label>Drive Folder ID<input value={form.Drive_Folder_ID} onChange={(e)=>setField("Drive_Folder_ID",e.target.value)} /></label>
            <label>Drive Folder URL<input value={form.Drive_Folder_URL} onChange={(e)=>setField("Drive_Folder_URL",e.target.value)} /></label>
            <label>Documents Folder ID<input value={form.Documents_Folder_ID} onChange={(e)=>setField("Documents_Folder_ID",e.target.value)} /></label>
            <label>Documents Folder URL<input value={form.Documents_Folder_URL} onChange={(e)=>setField("Documents_Folder_URL",e.target.value)} /></label>
            <label>Invoices Folder ID<input value={form.Invoices_Folder_ID} onChange={(e)=>setField("Invoices_Folder_ID",e.target.value)} /></label>
            <label>Invoices Folder URL<input value={form.Invoices_Folder_URL} onChange={(e)=>setField("Invoices_Folder_URL",e.target.value)} /></label>
            <label>Client User ID<input value={form.Client_User_ID} onChange={(e)=>setField("Client_User_ID",e.target.value)} /></label>
            <label>Client Username<input value={form.Client_Username} onChange={(e)=>setField("Client_Username",e.target.value)} /></label>

            <div className="billing-box">
              <div><strong>Opening billing</strong><small>Optional. These values create real billing records and use stable idempotency keys, so re-saving does not duplicate the same opening category.</small></div>
              <label>Design / Engineering Bill<input inputMode="decimal" value={form.Engineering_Bill} onChange={(e)=>setField("Engineering_Bill",e.target.value)} placeholder="0" /></label>
              <label>Supervision Bill<input inputMode="decimal" value={form.Supervision_Bill} onChange={(e)=>setField("Supervision_Bill",e.target.value)} placeholder="0" /></label>
              <label>Other Services Bill<input inputMode="decimal" value={form.Other_Services_Bill} onChange={(e)=>setField("Other_Services_Bill",e.target.value)} placeholder="0" /></label>
            </div>
            <button className="legacy-btn primary submit" type="submit" disabled={!canManage || Boolean(saving) || bulkSaving}>{saving ? `Saving ${saving}…` : formIsRegistered ? "Update Legacy Project" : "Register Legacy Project"}</button>
          </form>
          {message && <div className={`legacy-message ${message.kind}`}>{message.text}</div>}
          {!canManage && <div className="legacy-message err">Admin or manager access is required to register or update projects.</div>}
        </section>

        <section className="legacy-card">
          <div className="legacy-head"><strong>Historical list comparison</strong><small>Registered records stay visible so you can reopen and update them. Missing records can still be registered individually or in bulk.</small></div>
          <div className="legacy-summary">
            <div className="legacy-stat"><b>{legacy.length}</b><span>Historical records found</span></div>
            <div className="legacy-stat"><b>{legacy.length - missing.length}</b><span>Already in Supabase</span></div>
            <div className="legacy-stat"><b>{missing.length}</b><span>Missing</span></div>
          </div>
          <div style={{padding:"12px 16px",borderBottom:"1px solid var(--theme-line-rgba_255_255_255__08_,rgba(255,255,255,.08))"}}><button className="legacy-btn primary" type="button" disabled={!canManage || !missing.length || bulkSaving || Boolean(saving)} onClick={()=>void importAllMissing()}>{bulkSaving ? "Importing…" : `Import All Missing (${missing.length})`}</button></div>
          <div className="legacy-scroll">
            {legacy.length ? <table className="legacy-table"><thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Location</th><th>State</th><th></th></tr></thead><tbody>{legacy.map((project)=>{const exists=registered.has(project.Project_ID);return <tr key={project.Project_ID}><td className="legacy-id">{project.Project_ID}</td><td>{project.Project_Name}<div className="legacy-muted">{project.Phone_Number || "No phone"}</div></td><td>{project.Project_Type || "—"}</td><td>{project.Location || "—"}</td><td><span className={`legacy-state ${exists ? "registered" : "missing"}`}>{exists ? "Registered" : "Missing"}</span></td><td><button className="legacy-btn" type="button" disabled={!canManage || Boolean(saving) || bulkSaving} onClick={()=>edit(project)}>{exists ? "Edit / Update" : "Review / Register"}</button></td></tr>})}</tbody></table> : <div className="legacy-empty">No historical project records were found.</div>}
          </div>
          <div className="legacy-note">Registered legacy projects now load their current Supabase record into the form. Saving updates that project instead of silently keeping the old master data unchanged. Opening billing remains idempotent and separate from the project-detail update.</div>
        </section>
      </div>
    </div>
  </>;
}
