"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { landViewApi, type FinanceSheetData } from "@/lib/api";

type CertificateType = "project" | "employee" | "building";
type ProjectCategory = "Running" | "Paused" | "Completed";
type Row = Record<string, any>;
type DriveIndexResponse = { bulk: true; category?: string; projects: Record<string, any> };

type IssuedCertificate = {
  certificateId: string;
  verificationUrl: string;
  qrUrl: string;
  issuedAt: string;
  type: CertificateType;
  name: string;
  address: string;
  position: string;
  subject: string;
  reference: string;
  description: string;
  expiresAt?: string;
};

const HISTORY_KEY = "land_view_certificate_history_v1";

const typeMeta: Record<CertificateType, { label: string; defaultPosition: string; statement: string }> = {
  project: {
    label: "Project Certificate",
    defaultPosition: "Project / Client",
    statement: "This is to certify that the project named above has been recorded and served by LAND VIEW — Engineers and Architects in accordance with the scope stated in this certificate.",
  },
  employee: {
    label: "Employee Certificate",
    defaultPosition: "Employee",
    statement: "This is to certify that the person named above is / was associated with LAND VIEW — Engineers and Architects in the stated position and capacity.",
  },
  building: {
    label: "Building Certificate",
    defaultPosition: "Owner / Representative",
    statement: "This is to certify that the building / property described above has been reviewed or documented by LAND VIEW — Engineers and Architects for the purpose stated in this certificate.",
  },
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function pick(row: Row, keys: string[]) {
  for (const key of keys) {
    if (text(row?.[key])) return row[key];
  }
  return "";
}

function normalizeProjectId(value: unknown) {
  const raw = text(value).toUpperCase();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  return digits ? `LV-${Number(digits)}` : raw;
}

function recordsFromFinance(data: FinanceSheetData): Row[] {
  return (data.rows || []).map((row) => {
    const record: Row = {};
    (data.headers || []).forEach((header, index) => {
      const key = text(header);
      if (key) record[key] = row[index] ?? "";
    });
    return record;
  });
}

function projectId(row: Row) {
  return normalizeProjectId(pick(row, ["FILE ID", "File ID", "File_ID", "Project_ID", "Project ID", "ProjectId"]));
}

function employeeId(row: Row) {
  return text(pick(row, ["Employee_ID", "Employee ID", "EmployeeId"]));
}

function folderDisplayName(folderName: string, id: string) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text(folderName).replace(new RegExp(`^${escaped.replace("-", "[- _]?")}\\s*[-–—:]?\\s*`, "i"), "").trim() || id;
}

function projectLabel(row: Row) {
  const id = projectId(row);
  const client = text(pick(row, ["Client Name", "Client_Name", "CLIENT NAME", "Name", "Client"]));
  const project = text(pick(row, ["Project Name", "Project_Name", "PROJECT NAME", "Project", "Project Type", "Project_Type"]));
  const location = text(pick(row, ["Location", "Project Location", "Project_Location", "Address"]));
  return [id, client || project, location].filter(Boolean).join(" · ") || id || "Unnamed project";
}

async function getDriveIndex(category: ProjectCategory): Promise<DriveIndexResponse> {
  const url = new URL("/api/landview", window.location.origin);
  url.searchParams.set("action", "getProjectServiceFolders");
  url.searchParams.set("bulk", "1");
  url.searchParams.set("category", category);
  const response = await fetch(url.toString(), { method: "GET", cache: "no-store", credentials: "same-origin" });
  const json = await response.json();
  if (!response.ok || !json?.success) throw new Error(String(json?.error || `Could not load ${category} projects.`));
  return json.data as DriveIndexResponse;
}

function buildVisibleProjects(fileList: FinanceSheetData, indexes: DriveIndexResponse[]) {
  const fileRecords = recordsFromFinance(fileList);
  const fileMap = new Map<string, Row>();
  fileRecords.forEach((row) => {
    const id = projectId(row);
    if (id) fileMap.set(id, row);
  });

  const visible = new Map<string, Row>();
  for (const index of indexes) {
    for (const [rawId, item] of Object.entries(index?.projects || {})) {
      const id = normalizeProjectId(rawId || item?.projectId);
      if (!id) continue;
      const fileRow = fileMap.get(id) || {};
      const folderName = text(item?.projectFolderName);
      const fallbackName = folderDisplayName(folderName, id);
      visible.set(id, {
        ...fileRow,
        "FILE ID": id,
        Project_ID: id,
        Project_Name: text(pick(fileRow, ["Project Name", "Project_Name", "Project Type", "Project_Type"])) || fallbackName,
        "Project Name": text(pick(fileRow, ["Project Name", "Project_Name", "Project Type", "Project_Type"])) || fallbackName,
        "Client Name": text(pick(fileRow, ["Client Name", "Client_Name", "Name", "Client"])) || text(fileRow["Project Name"]) || fallbackName,
        Status: text(index.category || item?.category),
        Drive_Folder_Name: folderName,
      });
    }
  }

  return Array.from(visible.values()).sort((a, b) => {
    const aNum = Number(projectId(a).replace(/\D/g, "")) || 0;
    const bNum = Number(projectId(b).replace(/\D/g, "")) || 0;
    return bNum - aNum;
  });
}

function dateInputToday() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function displayDate(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? value || "—"
    : d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

export default function CertificatesPage() {
  const [type, setType] = useState<CertificateType>("project");
  const [projects, setProjects] = useState<Row[]>([]);
  const [employees, setEmployees] = useState<Row[]>([]);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [position, setPosition] = useState(typeMeta.project.defaultPosition);
  const [subject, setSubject] = useState("");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState(typeMeta.project.statement);
  const [issueDate, setIssueDate] = useState(dateInputToday());
  const [expiryDate, setExpiryDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingSources, setLoadingSources] = useState(true);
  const [sourceError, setSourceError] = useState("");
  const [error, setError] = useState("");
  const [issued, setIssued] = useState<IssuedCertificate | null>(null);
  const [history, setHistory] = useState<IssuedCertificate[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {}

    let cancelled = false;

    async function loadSources() {
      setLoadingSources(true);
      setSourceError("");

      const [fileListResult, runningResult, pausedResult, completedResult, employeeResult] = await Promise.allSettled([
        landViewApi.getFinanceSheet("File List"),
        getDriveIndex("Running"),
        getDriveIndex("Paused"),
        getDriveIndex("Completed"),
        landViewApi.getEmployees(),
      ]);

      if (cancelled) return;

      if (employeeResult.status === "fulfilled") setEmployees(employeeResult.value || []);

      if (fileListResult.status !== "fulfilled") {
        setProjects([]);
        setSourceError(`Could not load File List: ${String((fileListResult.reason as any)?.message || fileListResult.reason || "unknown error")}`);
        setLoadingSources(false);
        return;
      }

      const indexes = [runningResult, pausedResult, completedResult]
        .filter((result): result is PromiseFulfilledResult<DriveIndexResponse> => result.status === "fulfilled")
        .map((result) => result.value);

      if (!indexes.length) {
        setProjects([]);
        setSourceError("Could not load the projects currently visible in Projects.");
        setLoadingSources(false);
        return;
      }

      const nextProjects = buildVisibleProjects(fileListResult.value, indexes);
      setProjects(nextProjects);
      if (!nextProjects.length) setSourceError("No projects currently visible in Projects were found.");
      setLoadingSources(false);
    }

    void loadSources();
    return () => { cancelled = true; };
  }, []);

  function switchType(next: CertificateType) {
    setType(next);
    setName("");
    setAddress("");
    setPosition(typeMeta[next].defaultPosition);
    setSubject("");
    setReference("");
    setDescription(typeMeta[next].statement);
    setExpiryDate("");
    setIssued(null);
    setError("");
  }

  function selectProject(id: string) {
    const normalized = normalizeProjectId(id);
    const row = projects.find((item) => projectId(item) === normalized);
    if (!row) return;

    const clientName = text(pick(row, ["Client Name", "Client_Name", "CLIENT NAME", "Name", "Client"]));
    const projectName = text(pick(row, ["Project Name", "Project_Name", "PROJECT NAME", "Project", "Project Type", "Project_Type", "Drive_Folder_Name"]));
    const location = text(pick(row, ["Location", "Project Location", "Project_Location", "Address", "Site Location"]));

    setReference(normalized);
    setName(clientName || projectName || normalized);
    setSubject(projectName || `Project ${normalized}`);
    setAddress(location);
    setPosition("Project / Client");
    setError("");
  }

  function selectEmployee(id: string) {
    const row = employees.find((item) => employeeId(item) === id);
    if (!row) return;
    setReference(id);
    setName(text(pick(row, ["Employee_Name", "Employee Name", "Name"])));
    setAddress(text(pick(row, ["Address", "Present_Address", "Present Address", "Location"])));
    setPosition(text(pick(row, ["Position", "Designation", "Department"])) || "Employee");
    setSubject("Employment / Service Certificate");
    setError("");
  }

  function saveHistory(item: IssuedCertificate) {
    const next = [item, ...history.filter((x) => x.certificateId !== item.certificateId)].slice(0, 50);
    setHistory(next);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
  }

  async function issueCertificate(e: FormEvent) {
    e.preventDefault();
    if (loading) return;
    if (!name.trim()) { setError("Name is required."); return; }
    if (!address.trim()) { setError("Address is required."); return; }
    if (!position.trim()) { setError("Position / designation is required."); return; }
    if (!subject.trim()) { setError("Certificate subject is required."); return; }

    setLoading(true);
    setError("");
    setCopied(false);

    try {
      const response = await fetch("/api/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        cache: "no-store",
        body: JSON.stringify({
          type,
          name,
          address,
          position,
          subject,
          reference,
          description,
          issuedAt: new Date(`${issueDate}T12:00:00+06:00`).toISOString(),
          expiresAt: expiryDate ? new Date(`${expiryDate}T23:59:59+06:00`).toISOString() : "",
        }),
      });

      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not issue certificate.");

      const item: IssuedCertificate = {
        ...json.data,
        type,
        name: name.trim(),
        address: address.trim(),
        position: position.trim(),
        subject: subject.trim(),
        reference: reference.trim(),
        description: description.trim(),
        expiresAt: expiryDate ? new Date(`${expiryDate}T23:59:59+06:00`).toISOString() : undefined,
      };

      setIssued(item);
      saveHistory(item);
      setTimeout(() => document.getElementById("certificate-preview")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (err: any) {
      setError(err?.message || "Could not issue certificate.");
    } finally {
      setLoading(false);
    }
  }

  async function copyVerification() {
    if (!issued?.verificationUrl) return;
    try {
      await navigator.clipboard.writeText(issued.verificationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  const stats = useMemo(() => ({
    total: history.length,
    project: history.filter((x) => x.type === "project").length,
    employee: history.filter((x) => x.type === "employee").length,
    building: history.filter((x) => x.type === "building").length,
  }), [history]);

  return (
    <div className="cert-page">
      <style>{`
        .cert-page{display:grid;gap:22px;color:#efefef}.cert-hero small{display:block;color:#ef6e64;font-size:9px;font-weight:900;letter-spacing:.14em}.cert-hero h1{margin:8px 0 5px;font-size:34px;letter-spacing:-.04em}.cert-hero p{margin:0;color:#858b91;font-size:11px}.cert-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.cert-stat{padding:16px;border:1px solid #34373b;border-radius:10px;background:#1d1f21}.cert-stat span{display:block;color:#777d83;font-size:8px;font-weight:900;letter-spacing:.1em}.cert-stat strong{display:block;margin-top:8px;font-size:24px}.cert-layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:18px;align-items:start}.cert-panel{border:1px solid #34373b;border-radius:12px;background:#1b1d1f;overflow:hidden}.cert-panel-head{padding:18px 20px;border-bottom:1px solid #323539}.cert-panel-head small{display:block;color:#ef6e64;font-size:8px;font-weight:900;letter-spacing:.12em}.cert-panel-head h2{margin:6px 0 0;font-size:18px}.cert-type-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:14px 18px 0}.cert-type-tabs button{height:54px;border:1px solid #34383c;border-radius:9px;background:#141618;color:#969ca2;font-size:9px;font-weight:900;cursor:pointer}.cert-type-tabs button.active{border-color:#ef493b;background:rgba(239,73,59,.09);color:#fff}.cert-form{padding:18px 20px 22px}.cert-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}.cert-field{display:grid;gap:7px}.cert-field.full{grid-column:1/-1}.cert-field>span{font-size:8px;font-weight:900;letter-spacing:.1em;color:#8c9298}.cert-field input,.cert-field select,.cert-field textarea{width:100%;border:1px solid #34383c;border-radius:8px;background:#101214;color:#f3f3f3;outline:none;padding:0 12px;font-size:11px}.cert-field input,.cert-field select{height:44px}.cert-field textarea{min-height:105px;padding-top:11px;resize:vertical;line-height:1.6}.cert-field input:focus,.cert-field select:focus,.cert-field textarea:focus{border-color:#ef493b;box-shadow:0 0 0 3px rgba(239,73,59,.08)}.cert-error,.cert-source-error{margin-bottom:14px;padding:11px 12px;border-radius:8px;font-size:10px}.cert-error{border:1px solid rgba(239,73,59,.3);background:rgba(239,73,59,.08);color:#f3aca5}.cert-source-error{border:1px solid rgba(222,171,79,.28);background:rgba(222,171,79,.07);color:#dcb972}.cert-submit{width:100%;height:49px;margin-top:16px;border:0;border-radius:8px;background:#ef493b;color:white;font-size:9px;font-weight:900;letter-spacing:.1em;cursor:pointer}.cert-submit:disabled{opacity:.55;cursor:not-allowed}.cert-help{padding:18px 20px}.cert-help article{padding:14px 0;border-bottom:1px solid #303337}.cert-help article:last-child{border-bottom:0}.cert-help strong{display:block;font-size:10px}.cert-help p{margin:6px 0 0;color:#81878d;font-size:9px;line-height:1.55}.cert-preview-wrap{scroll-margin-top:120px}.cert-preview-actions{display:flex;gap:9px;justify-content:flex-end;margin-bottom:12px}.cert-preview-actions button,.cert-preview-actions a{height:39px;padding:0 14px;border:1px solid #3a3e42;border-radius:8px;background:#202326;color:#ddd;display:inline-flex;align-items:center;text-decoration:none;font-size:8px;font-weight:900;letter-spacing:.07em;cursor:pointer}.cert-preview-actions .primary{border-color:#ef493b;background:#ef493b;color:#fff}.certificate-paper{width:min(100%,980px);aspect-ratio:1.414/1;margin:0 auto;background:#fff;color:#111;padding:46px 54px;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.25);outline:2px solid #111;outline-offset:-22px}.certificate-paper:before{content:"";position:absolute;inset:29px;border:1px solid #d4d4d4;pointer-events:none}.certificate-top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px}.certificate-brand{display:flex;align-items:center;gap:12px}.certificate-brand img{width:64px;height:64px;object-fit:contain}.certificate-brand strong{display:block;font-size:21px;letter-spacing:.1em}.certificate-brand span{display:block;margin-top:3px;color:#555;font-size:8px;letter-spacing:.13em}.certificate-id{text-align:right}.certificate-id span{display:block;color:#777;font-size:8px;text-transform:uppercase;letter-spacing:.1em}.certificate-id strong{display:block;margin-top:5px;font-size:10px}.certificate-title{text-align:center;margin-top:26px}.certificate-title small{display:block;color:#b52d24;font-size:9px;font-weight:900;letter-spacing:.18em}.certificate-title h2{margin:8px 0 2px;font-family:Georgia,serif;font-size:35px;font-weight:500}.certificate-body{text-align:center;max-width:760px;margin:22px auto 0}.certificate-body>span{display:block;color:#666;font-size:11px}.certificate-name{margin:8px 0 7px;font-family:Georgia,serif;font-size:29px;font-weight:500}.certificate-position{font-size:11px;font-weight:700}.certificate-address{margin-top:4px;color:#666;font-size:10px}.certificate-subject{margin:18px auto 0;padding:10px 14px;border-top:1px solid #ddd;border-bottom:1px solid #ddd;font-size:11px;font-weight:800}.certificate-statement{margin:17px auto 0;color:#333;font-size:10px;line-height:1.75}.certificate-bottom{position:absolute;left:54px;right:54px;bottom:46px;display:grid;grid-template-columns:1fr auto 1fr;gap:28px;align-items:end}.certificate-signature,.certificate-date{border-top:1px solid #222;padding-top:7px;text-align:center;font-size:8px;color:#555}.certificate-signature strong,.certificate-date strong{display:block;color:#111;font-size:9px;margin-bottom:2px}.certificate-qr{text-align:center}.certificate-qr img{display:block;width:82px;height:82px;margin:auto}.certificate-qr span{display:block;margin-top:5px;font-size:6px;color:#666;letter-spacing:.07em}.cert-history{border:1px solid #34373b;border-radius:12px;background:#1b1d1f;overflow:hidden}.cert-history table{width:100%;border-collapse:collapse}.cert-history th,.cert-history td{padding:12px 14px;text-align:left;border-bottom:1px solid #303337;font-size:9px}.cert-history th{color:#777d83;font-size:8px;text-transform:uppercase;letter-spacing:.08em}.cert-history a{color:#ff746a;text-decoration:none;font-weight:800}.cert-empty{padding:22px;color:#777d83;font-size:10px;text-align:center}@media(max-width:1000px){.cert-layout{grid-template-columns:1fr}.cert-stats{grid-template-columns:1fr 1fr}}@media(max-width:650px){.cert-form-grid{grid-template-columns:1fr}.cert-field.full{grid-column:auto}.cert-type-tabs{grid-template-columns:1fr}.certificate-paper{aspect-ratio:auto;min-height:680px;padding:34px}.certificate-bottom{left:34px;right:34px;grid-template-columns:1fr 90px 1fr}}@media print{body *{visibility:hidden!important}.certificate-paper,.certificate-paper *{visibility:visible!important}.certificate-paper{position:absolute;left:0;top:0;width:100%;height:100%;margin:0;box-shadow:none}.cert-preview-actions{display:none!important}@page{size:A4 landscape;margin:0}}
      `}</style>

      <header className="cert-hero">
        <small>OFFICIAL DOCUMENTS</small>
        <h1>Certificate center.</h1>
        <p>Issue QR-verifiable project, employee and building certificates.</p>
      </header>

      <section className="cert-stats">
        <article className="cert-stat"><span>ISSUED ON THIS BROWSER</span><strong>{stats.total}</strong></article>
        <article className="cert-stat"><span>PROJECT</span><strong>{stats.project}</strong></article>
        <article className="cert-stat"><span>EMPLOYEE</span><strong>{stats.employee}</strong></article>
        <article className="cert-stat"><span>BUILDING</span><strong>{stats.building}</strong></article>
      </section>

      <section className="cert-layout">
        <div className="cert-panel">
          <div className="cert-panel-head"><small>CERTIFICATE ISSUANCE</small><h2>Create official certificate</h2></div>

          <div className="cert-type-tabs">
            {(["project", "employee", "building"] as CertificateType[]).map((item) => (
              <button key={item} type="button" className={type === item ? "active" : ""} onClick={() => switchType(item)}>{typeMeta[item].label}</button>
            ))}
          </div>

          <form className="cert-form" onSubmit={issueCertificate}>
            {sourceError && type === "project" && <div className="cert-source-error">{sourceError}</div>}
            {error && <div className="cert-error">{error}</div>}

            <div className="cert-form-grid">
              {type === "project" && (
                <label className="cert-field full">
                  <span>SELECT PROJECT ({projects.length})</span>
                  <select value={reference} onChange={(e) => selectProject(e.target.value)} disabled={loadingSources}>
                    <option value="">{loadingSources ? "Loading visible projects…" : projects.length ? "Choose a project shown in Projects" : "No visible projects found"}</option>
                    {projects.map((row) => {
                      const id = projectId(row);
                      return <option key={id} value={id}>{projectLabel(row)}</option>;
                    })}
                  </select>
                </label>
              )}

              {type === "employee" && (
                <label className="cert-field full">
                  <span>SELECT EMPLOYEE ({employees.length})</span>
                  <select value={reference} onChange={(e) => selectEmployee(e.target.value)} disabled={loadingSources}>
                    <option value="">{loadingSources ? "Loading employees…" : "Choose employee"}</option>
                    {employees.map((row) => {
                      const id = employeeId(row);
                      const employeeName = text(pick(row, ["Employee_Name", "Employee Name", "Name"]));
                      return <option key={id || employeeName} value={id}>{id} · {employeeName}</option>;
                    })}
                  </select>
                </label>
              )}

              <label className="cert-field"><span>NAME / OWNER / CLIENT</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Certificate holder name" /></label>
              <label className="cert-field"><span>POSITION / DESIGNATION</span><input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Position or role" /></label>
              <label className="cert-field full"><span>ADDRESS</span><input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Address / project location" /></label>
              <label className="cert-field full"><span>CERTIFICATE SUBJECT</span><input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Project / building / certificate subject" /></label>
              <label className="cert-field"><span>REFERENCE / FILE ID</span><input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="LV-0001 / EMP-0001 / reference" /></label>
              <label className="cert-field"><span>ISSUE DATE</span><input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></label>
              <label className="cert-field"><span>EXPIRY DATE (OPTIONAL)</span><input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></label>
              <label className="cert-field full"><span>CERTIFICATE STATEMENT</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} /></label>
            </div>

            <button className="cert-submit" type="submit" disabled={loading}>{loading ? "ISSUING CERTIFICATE…" : "ISSUE CERTIFICATE & CREATE QR"}</button>
          </form>
        </div>

        <aside className="cert-panel">
          <div className="cert-panel-head"><small>HOW IT WORKS</small><h2>Verification control</h2></div>
          <div className="cert-help">
            <article><strong>1. Select the source record</strong><p>Project certificates use the same Running, Paused and Completed Drive project folders as the Projects page. File List only enriches those visible projects.</p></article>
            <article><strong>2. Review certificate details</strong><p>Edit the name, address, position, subject and statement before issuing.</p></article>
            <article><strong>3. Issue & print</strong><p>The certificate receives its own signed ID and QR code. Print it or save it as PDF.</p></article>
            <article><strong>4. Public verification</strong><p>Scanning the QR opens a public LAND VIEW authenticity page. Altered signed data fails verification.</p></article>
          </div>
        </aside>
      </section>

      {issued && (
        <section className="cert-preview-wrap" id="certificate-preview">
          <div className="cert-preview-actions">
            <button type="button" onClick={copyVerification}>{copied ? "COPIED" : "COPY VERIFY LINK"}</button>
            <a href={issued.verificationUrl} target="_blank" rel="noreferrer">VERIFY ONLINE</a>
            <button type="button" className="primary" onClick={() => window.print()}>PRINT / SAVE PDF</button>
          </div>

          <article className="certificate-paper">
            <div className="certificate-top">
              <div className="certificate-brand">
                <img src="/land-view-logo.png" alt="LAND VIEW" />
                <div><strong>LAND VIEW</strong><span>ENGINEERS & ARCHITECTS</span></div>
              </div>
              <div className="certificate-id"><span>Certificate ID</span><strong>{issued.certificateId}</strong></div>
            </div>

            <div className="certificate-title"><small>OFFICIAL CERTIFICATE</small><h2>{typeMeta[issued.type].label}</h2></div>

            <div className="certificate-body">
              <span>This certificate is issued to</span>
              <div className="certificate-name">{issued.name}</div>
              <div className="certificate-position">{issued.position}</div>
              <div className="certificate-address">{issued.address}</div>
              <div className="certificate-subject">{issued.subject}{issued.reference ? ` · ${issued.reference}` : ""}</div>
              <p className="certificate-statement">{issued.description}</p>
            </div>

            <div className="certificate-bottom">
              <div className="certificate-signature"><strong>Authorized Signatory</strong>LAND VIEW — Engineers & Architects</div>
              <div className="certificate-qr"><img src={issued.qrUrl} alt="Certificate verification QR" /><span>SCAN TO VERIFY</span></div>
              <div className="certificate-date"><strong>{displayDate(issued.issuedAt)}</strong>Date of Issue</div>
            </div>
          </article>
        </section>
      )}

      <section className="cert-history">
        <div className="cert-panel-head"><small>RECENT</small><h2>Certificates issued on this browser</h2></div>
        {history.length ? (
          <table>
            <thead><tr><th>Certificate</th><th>Type</th><th>Name</th><th>Reference</th><th>Verify</th></tr></thead>
            <tbody>{history.slice(0, 20).map((item) => (
              <tr key={item.certificateId}>
                <td><strong>{item.certificateId}</strong></td>
                <td>{typeMeta[item.type].label}</td>
                <td>{item.name}</td>
                <td>{item.reference || "—"}</td>
                <td><a href={item.verificationUrl} target="_blank" rel="noreferrer">OPEN</a></td>
              </tr>
            ))}</tbody>
          </table>
        ) : <div className="cert-empty">No certificates have been issued from this browser yet.</div>}
      </section>
    </div>
  );
}
