"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { CertificateDocument, printCertificate } from "@/components/certificate-document";
import { landViewApi, type FinanceSheetData } from "@/lib/api";

type CertificateType = "project" | "employee" | "building";
type ProjectCategory = "Running" | "Paused" | "Completed";
type Row = Record<string, any>;
type DriveIndexResponse = { bulk: true; category?: string; projects: Record<string, any> };

type CertificateRecord = {
  certificateId: string;
  verificationUrl?: string;
  qrUrl?: string;
  issuedAt: string;
  type: CertificateType;
  name: string;
  address: string;
  position: string;
  subject: string;
  reference: string;
  description: string;
  expiresAt?: string;
  status?: string;
  revision?: number;
  parentId?: string;
  supersededBy?: string;
  revokedAt?: string;
  revokedReason?: string;
  deletedAt?: string;
  deletedReason?: string;
};

const meta: Record<CertificateType, { label: string; position: string; statement: string }> = {
  project: {
    label: "Project Certificate",
    position: "Project / Client",
    statement: "This is to certify that the project named above has been recorded and served by LAND VIEW — Engineering & Architectural Consultancy in accordance with the scope stated in this certificate.",
  },
  employee: {
    label: "Experience Certificate",
    position: "Employee",
    statement: "During the tenure, the employee has been primarily responsible for site management, construction supervision, coordination, and day-to-day monitoring across structural and architectural projects. Major duties and responsibilities included:\n• Managing day-to-day site activities and monitoring the progress of construction work.\n• Supervising construction materials, concrete work, reinforcement layouts, and other site operations.\n• Coordinating with contractors, masons, laboratory technicians, suppliers, and project personnel.\n• Maintaining daily site records, progress reports, work schedules, and quality-control documentation.\n\nThroughout the service period, the employee’s professional conduct, site management capability, coordination skills, problem-solving ability, and commitment to project quality have been highly commendable. The employee has demonstrated dedication, responsibility, and technical capability.\n\nWe wish continued success.",
  },
  building: {
    label: "Building Certificate",
    position: "Owner / Representative",
    statement: "This is to certify that the building / property described above has been reviewed or documented by LAND VIEW — Engineering & Architectural Consultancy for the purpose stated in this certificate.",
  },
};

const text = (value: unknown) => String(value ?? "").trim();
function pick(row: Row, keys: string[]) { for (const key of keys) if (text(row?.[key])) return row[key]; return ""; }
function normalizeProjectId(value: unknown) { const raw = text(value).toUpperCase(); const digits = raw.replace(/\D/g, ""); return digits ? `LV-${Number(digits)}` : raw; }
function projectId(row: Row) { return normalizeProjectId(pick(row, ["FILE ID", "File ID", "File_ID", "Project_ID", "Project ID", "ProjectId"])); }
function employeeId(row: Row) { return text(pick(row, ["Employee_ID", "Employee ID", "EmployeeId"])); }
function localDate(value?: string) { if (!value) return ""; const d = new Date(value); if (Number.isNaN(d.getTime())) return ""; const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 10); }
function today() { return localDate(new Date().toISOString()); }
function displayDate(value?: string) { if (!value) return "—"; const d = new Date(value); return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" }); }

function recordsFromFinance(data: FinanceSheetData): Row[] {
  return (data.rows || []).map((row) => Object.fromEntries((data.headers || []).map((header, index) => [text(header), row[index] ?? ""]).filter(([key]) => key)));
}

function folderDisplayName(folderName: string, id: string) {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text(folderName).replace(new RegExp(`^${escaped.replace("-", "[- _]?")}\\s*[-–—:]?\\s*`, "i"), "").trim() || id;
}

function projectLabel(row: Row) {
  const id = projectId(row);
  const client = text(pick(row, ["Client Name", "Client_Name", "Name", "Client"]));
  const project = text(pick(row, ["Project Name", "Project_Name", "Project Type", "Project_Type"]));
  const location = text(pick(row, ["Location", "Project Location", "Project_Location", "Address"]));
  return [id, client || project, location].filter(Boolean).join(" · ");
}

async function getDriveIndex(category: ProjectCategory): Promise<DriveIndexResponse> {
  const url = new URL("/api/landview", window.location.origin);
  url.searchParams.set("action", "getProjectServiceFolders");
  url.searchParams.set("bulk", "1");
  url.searchParams.set("category", category);
  const response = await fetch(url.toString(), { cache: "no-store", credentials: "same-origin" });
  const json = await response.json();
  if (!response.ok || !json?.success) throw new Error(json?.error || `Could not load ${category} projects.`);
  return json.data as DriveIndexResponse;
}

function visibleProjects(fileList: FinanceSheetData, indexes: DriveIndexResponse[]) {
  const fileMap = new Map<string, Row>();
  recordsFromFinance(fileList).forEach((row) => { const id = projectId(row); if (id) fileMap.set(id, row); });
  const map = new Map<string, Row>();
  indexes.forEach((index) => Object.entries(index.projects || {}).forEach(([rawId, item]) => {
    const id = normalizeProjectId(rawId || item?.projectId); if (!id) return;
    const row = fileMap.get(id) || {};
    const folder = text(item?.projectFolderName);
    const fallback = folderDisplayName(folder, id);
    map.set(id, {
      ...row,
      "FILE ID": id,
      Project_ID: id,
      Project_Name: text(pick(row, ["Project Name", "Project_Name", "Project Type", "Project_Type"])) || fallback,
      "Project Name": text(pick(row, ["Project Name", "Project_Name", "Project Type", "Project_Type"])) || fallback,
      "Client Name": text(pick(row, ["Client Name", "Client_Name", "Name", "Client"])) || fallback,
      Status: index.category || item?.category,
      Drive_Folder_Name: folder,
    });
  }));
  return [...map.values()].sort((a, b) => Number(projectId(b).replace(/\D/g, "")) - Number(projectId(a).replace(/\D/g, "")));
}

export default function CertificatesPage() {
  const [type, setType] = useState<CertificateType>("project");
  const [projects, setProjects] = useState<Row[]>([]);
  const [employees, setEmployees] = useState<Row[]>([]);
  const [records, setRecords] = useState<CertificateRecord[]>([]);
  const [registryError, setRegistryError] = useState("");
  const [sourceError, setSourceError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingSources, setLoadingSources] = useState(true);
  const [loadingRegistry, setLoadingRegistry] = useState(true);
  const [issued, setIssued] = useState<CertificateRecord | null>(null);
  const [reissueOf, setReissueOf] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [position, setPosition] = useState(meta.project.position);
  const [subject, setSubject] = useState("");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState(meta.project.statement);
  const [issueDate, setIssueDate] = useState(today());
  const [expiryDate, setExpiryDate] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  async function loadRegistry() {
    setLoadingRegistry(true); setRegistryError("");
    try {
      const response = await fetch("/api/certificates", { cache: "no-store", credentials: "same-origin" });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not load certificate registry.");
      setRecords(Array.isArray(json?.data?.certificates) ? json.data.certificates : []);
    } catch (e: any) { setRegistryError(e?.message || "Could not load certificate registry."); }
    finally { setLoadingRegistry(false); }
  }

  useEffect(() => {
    let cancelled = false;
    void loadRegistry();
    (async () => {
      const [file, running, paused, completed, employee] = await Promise.allSettled([
        landViewApi.getFinanceSheet("File List"),
        getDriveIndex("Running"),
        getDriveIndex("Paused"),
        getDriveIndex("Completed"),
        landViewApi.getEmployees(),
      ]);
      if (cancelled) return;
      if (employee.status === "fulfilled") setEmployees(employee.value || []);
      if (file.status === "fulfilled") {
        const indexes = [running, paused, completed].filter((x): x is PromiseFulfilledResult<DriveIndexResponse> => x.status === "fulfilled").map((x) => x.value);
        if (indexes.length) setProjects(visibleProjects(file.value, indexes)); else setSourceError("Could not load visible projects.");
      } else setSourceError("Could not load File List project details.");
      setLoadingSources(false);
    })();
    return () => { cancelled = true; };
  }, []);

  function resetForm(next: CertificateType = type) {
    setType(next); setName(""); setAddress(""); setPosition(meta[next].position); setSubject(""); setReference(""); setDescription(meta[next].statement); setIssueDate(today()); setExpiryDate(""); setReissueOf(""); setIssued(null); setError("");
  }

  function selectProject(id: string) {
    const normalized = normalizeProjectId(id); const row = projects.find((item) => projectId(item) === normalized); if (!row) return;
    const client = text(pick(row, ["Client Name", "Client_Name", "Name", "Client"]));
    const project = text(pick(row, ["Project Name", "Project_Name", "Project Type", "Project_Type", "Drive_Folder_Name"]));
    setReference(normalized); setName(client || project || normalized); setSubject(project || `Project ${normalized}`); setAddress(text(pick(row, ["Location", "Project Location", "Project_Location", "Address"]))); setPosition("Project / Client");
  }

  function selectEmployee(id: string) {
    const row = employees.find((item) => employeeId(item) === id); if (!row) return;
    setReference(id);
    setName(text(pick(row, ["Employee_Name", "Employee Name", "Name"])));
    setAddress(text(pick(row, ["Address", "Present_Address", "Present Address", "Location"])));
    setPosition(text(pick(row, ["Position", "Designation", "Department"])) || "Employee");
    setSubject("Experience Certificate");
    setDescription(meta.employee.statement);
  }

  function editReissue(item: CertificateRecord) {
    setType(item.type); setName(item.name || ""); setAddress(item.address || ""); setPosition(item.position || meta[item.type].position); setSubject(item.subject || ""); setReference(item.reference || ""); setDescription(item.description || meta[item.type].statement); setIssueDate(today()); setExpiryDate(localDate(item.expiresAt)); setReissueOf(item.certificateId); setIssued(null); setError(""); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function issue(e: FormEvent) {
    e.preventDefault(); if (loading) return;
    if (!name.trim() || !address.trim() || !position.trim() || !subject.trim()) { setError("Name, address, position and certificate subject are required."); return; }
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ type, name, address, position, subject, reference, description, reissueOf, issuedAt: new Date(`${issueDate}T12:00:00+06:00`).toISOString(), expiresAt: expiryDate ? new Date(`${expiryDate}T23:59:59+06:00`).toISOString() : "" }),
      });
      const json = await response.json(); if (!response.ok || !json?.success) throw new Error(json?.error || "Could not issue certificate.");
      setIssued(json.data); setReissueOf(""); await loadRegistry();
      setTimeout(() => document.getElementById("certificate-preview")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e: any) { setError(e?.message || "Could not issue certificate."); }
    finally { setLoading(false); }
  }

  async function statusAction(item: CertificateRecord, action: "revoke" | "delete") {
    if (action === "revoke") {
      const reason = window.prompt(`Reason for revoking ${item.certificateId}:`, ""); if (reason === null) return;
      if (!window.confirm(`Revoke ${item.certificateId}? Its QR will show REVOKED.`)) return;
      await patch(item.certificateId, action, reason);
    } else {
      if (!window.confirm(`Withdraw ${item.certificateId}? Its QR will show WITHDRAWN. This does not erase the audit record.`)) return;
      const reason = window.prompt("Withdrawal reason (optional):", "") ?? "";
      await patch(item.certificateId, action, reason);
    }
  }

  async function patch(certificateId: string, action: string, reason: string) {
    try {
      const response = await fetch("/api/certificates", { method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ certificateId, action, reason }) });
      const json = await response.json(); if (!response.ok || !json?.success) throw new Error(json?.error || "Could not update certificate.");
      await loadRegistry();
    } catch (e: any) { window.alert(e?.message || "Could not update certificate."); }
  }

  const stats = useMemo(() => ({
    total: records.length,
    active: records.filter((x) => (x.status || "Active") === "Active").length,
    superseded: records.filter((x) => x.status === "Superseded").length,
    inactive: records.filter((x) => x.status === "Revoked" || x.status === "Deleted").length,
  }), [records]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return records.filter((x) => !q || [x.certificateId, x.type, x.name, x.reference, x.subject, x.status].join(" ").toLowerCase().includes(q));
  }, [records, query]);

  return <div className="cert-page">
    <style>{`
      .cert-page{display:grid;gap:20px;color:#eee}.cert-hero small,.cert-head small{color:#ef6e64;font-size:12px;font-weight:900;letter-spacing:.13em}.cert-hero h1{font-size:34px;margin:7px 0 4px}.cert-hero p{margin:0;color:#858b91;font-size:12px}.cert-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.cert-stat,.cert-panel,.cert-registry{border:1px solid #34373b;background:#1b1d1f;border-radius:12px}.cert-stat{padding:15px}.cert-stat span{color:#7d848b;font-size:12px;font-weight:900}.cert-stat strong{display:block;font-size:24px;margin-top:7px}.cert-layout{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:16px}.cert-head{padding:17px 19px;border-bottom:1px solid #303438}.cert-head h2{font-size:17px;margin:6px 0 0}.cert-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;padding:14px 18px 0}.cert-tabs button,.cert-actions button,.cert-actions a,.cert-toolbar button{border:1px solid #3a3f44;background:#151719;color:#ddd;border-radius:7px;cursor:pointer;text-decoration:none}.cert-tabs button{height:48px;font-size:12px;font-weight:900}.cert-tabs button.active{border-color:var(--brand-red);background:rgba(239,73,59,.1);color:white}.cert-form{padding:18px}.cert-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.cert-field{display:grid;gap:6px}.cert-field.full{grid-column:1/-1}.cert-field span{color:#8b9298;font-size:12px;font-weight:900;letter-spacing:.08em}.cert-field input,.cert-field select,.cert-field textarea,.cert-search{width:100%;border:1px solid #383c40;border-radius:8px;background:#101214;color:#eee;outline:none;padding:0 11px}.cert-field input,.cert-field select{height:43px}.cert-field textarea{min-height:146px;padding-top:10px;line-height:1.5}.cert-submit{height:48px;width:100%;border:0;border-radius:8px;background:var(--brand-red);color:#fff;font-size:12px;font-weight:900;margin-top:15px;cursor:pointer}.cert-submit:disabled{opacity:.55}.cert-alert{margin-bottom:12px;padding:10px;border-radius:8px;background:#321c19;color:#f1aaa2;font-size:12px}.cert-reissue{margin-bottom:12px;padding:11px;border:1px solid #645127;border-radius:8px;background:#221f17;color:#dfc67c;font-size:12px}.cert-help{padding:18px}.cert-help article{padding:12px 0;border-bottom:1px solid #303337}.cert-help strong{font-size:12px}.cert-help p{font-size:12px;color:#838a90;line-height:1.55;margin:5px 0 0}.cert-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px 16px;border-bottom:1px solid #303438}.cert-search{height:40px;max-width:360px}.cert-toolbar button{height:39px;padding:0 13px;font-size:12px;font-weight:900}.cert-table-wrap{overflow:auto}.cert-table{width:100%;border-collapse:collapse;min-width:900px}.cert-table th,.cert-table td{padding:11px 13px;text-align:left;border-bottom:1px solid #2e3236;font-size:12px}.cert-table th{color:#777f86;font-size:12px}.cert-status{display:inline-flex;padding:5px 7px;border-radius:999px;font-size:12px;font-weight:900;background:#233026;color:#9dd2ab}.cert-status.superseded{background:#332d1c;color:#dcc276}.cert-status.revoked,.cert-status.deleted{background:#3b211e;color:#ee9e94}.cert-actions{display:flex;gap:5px;flex-wrap:wrap}.cert-actions button,.cert-actions a{padding:6px 8px;font-size:12px;font-weight:900}.cert-actions .danger{border-color:#5c302a;color:#ef998f}.cert-actions button:disabled{opacity:.4;cursor:not-allowed}.certificate-wrap{scroll-margin-top:120px}.certificate-actions{display:flex;justify-content:flex-end;gap:8px;margin-bottom:10px}.certificate-actions a,.certificate-actions button{height:38px;padding:0 13px;border:1px solid #3a3e42;border-radius:7px;background:#202326;color:#ddd;text-decoration:none;display:inline-flex;align-items:center;font-size:12px;font-weight:900}
      @media(max-width:950px){.cert-layout{grid-template-columns:1fr}.cert-stats{grid-template-columns:1fr 1fr}}@media(max-width:620px){.cert-grid{grid-template-columns:1fr}.cert-field.full{grid-column:auto}.cert-tabs{grid-template-columns:1fr}}
    `}</style>

    <header className="cert-hero"><small>OFFICIAL DOCUMENTS</small><h1>Certificate center.</h1><p>Issue, reissue, revoke and withdraw QR-verifiable LAND VIEW certificates.</p></header>

    <section className="cert-stats">
      <article className="cert-stat"><span>TOTAL REGISTRY</span><strong>{stats.total}</strong></article>
      <article className="cert-stat"><span>ACTIVE</span><strong>{stats.active}</strong></article>
      <article className="cert-stat"><span>SUPERSEDED</span><strong>{stats.superseded}</strong></article>
      <article className="cert-stat"><span>REVOKED / WITHDRAWN</span><strong>{stats.inactive}</strong></article>
    </section>

    <section className="cert-layout">
      <div className="cert-panel">
        <div className="cert-head"><small>{reissueOf ? "REVISION MODE" : "CERTIFICATE ISSUANCE"}</small><h2>{reissueOf ? `Reissue ${reissueOf}` : "Create official certificate"}</h2></div>
        <div className="cert-tabs">{(["project", "employee", "building"] as CertificateType[]).map((item) => <button key={item} type="button" className={type === item ? "active" : ""} onClick={() => resetForm(item)}>{meta[item].label}</button>)}</div>
        <form className="cert-form" onSubmit={issue}>
          {reissueOf && <div className="cert-reissue">Editing an issued certificate creates a new revision. The old QR will remain traceable and show SUPERSEDED.</div>}
          {error && <div className="cert-alert">{error}</div>}
          {sourceError && type === "project" && <div className="cert-alert">{sourceError}</div>}
          <div className="cert-grid">
            {type === "project" && <label className="cert-field full"><span>SELECT VISIBLE PROJECT ({projects.length})</span><select value={reference} onChange={(e) => selectProject(e.target.value)} disabled={loadingSources}><option value="">{loadingSources ? "Loading visible projects…" : "Choose project"}</option>{projects.map((row) => <option key={projectId(row)} value={projectId(row)}>{projectLabel(row)}</option>)}</select></label>}
            {type === "employee" && <label className="cert-field full"><span>SELECT EMPLOYEE ({employees.length})</span><select value={reference} onChange={(e) => selectEmployee(e.target.value)} disabled={loadingSources}><option value="">Choose employee</option>{employees.map((row) => <option key={employeeId(row)} value={employeeId(row)}>{employeeId(row)} · {text(pick(row, ["Employee_Name", "Employee Name", "Name"]))}</option>)}</select></label>}
            <label className="cert-field"><span>NAME / OWNER / CLIENT</span><input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label className="cert-field"><span>POSITION / DESIGNATION</span><input value={position} onChange={(e) => setPosition(e.target.value)} /></label>
            <label className="cert-field full"><span>ADDRESS</span><input value={address} onChange={(e) => setAddress(e.target.value)} /></label>
            <label className="cert-field full"><span>CERTIFICATE SUBJECT</span><input value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
            <label className="cert-field"><span>REFERENCE / FILE ID</span><input value={reference} onChange={(e) => setReference(e.target.value)} /></label>
            <label className="cert-field"><span>ISSUE DATE</span><input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></label>
            <label className="cert-field"><span>EXPIRY DATE (OPTIONAL)</span><input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></label>
            <label className="cert-field full"><span>CERTIFICATE STATEMENT (FULL TEXT OR DUTIES AND CLOSING)</span><textarea maxLength={3000} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
          </div>
          <button className="cert-submit" disabled={loading}>{loading ? "SAVING…" : reissueOf ? "ISSUE NEW REVISION" : "ISSUE CERTIFICATE & CREATE QR"}</button>
        </form>
      </div>

      <aside className="cert-panel"><div className="cert-head"><small>LIFECYCLE CONTROL</small><h2>Official record rules</h2></div><div className="cert-help">
        <article><strong>Edit = Reissue</strong><p>Issued content is never overwritten. Editing creates a new revision and marks the old certificate Superseded.</p></article>
        <article><strong>Revoke</strong><p>The certificate remains in the registry, but its QR immediately shows REVOKED with the reason.</p></article>
        <article><strong>Withdraw</strong><p>Admin delete is a soft withdrawal for audit safety. The old QR shows WITHDRAWN instead of disappearing.</p></article>
        <article><strong>Central registry</strong><p>Records are stored in the Finance workbook Certificates tab, not only in this browser.</p></article>
      </div></aside>
    </section>

    {issued && <section className="certificate-wrap" id="certificate-preview">
      <div className="certificate-actions"><a href={issued.verificationUrl} target="_blank" rel="noreferrer">VERIFY ONLINE</a><button onClick={() => void printCertificate().catch((error: Error) => window.alert(error.message))}>PRINT / SAVE PDF</button></div>
      <CertificateDocument issued={issued} />
    </section>}

    <section className="cert-registry">
      <div className="cert-head"><small>CENTRAL REGISTRY</small><h2>Issued certificates</h2></div>
      <div className="cert-toolbar"><input className="cert-search" placeholder="Search ID, name, project, status…" value={query} onChange={(e) => setQuery(e.target.value)} /><button onClick={loadRegistry} disabled={loadingRegistry}>{loadingRegistry ? "REFRESHING…" : "REFRESH"}</button></div>
      {registryError && <div className="cert-alert" style={{ margin: 14 }}>{registryError}</div>}
      {!loadingRegistry && !filtered.length ? <div className="cert-empty">No certificates in the central registry yet.</div> : <div className="cert-table-wrap"><table className="cert-table"><thead><tr><th>Certificate</th><th>Name / Subject</th><th>Reference</th><th>Revision</th><th>Status</th><th>Issued</th><th>Actions</th></tr></thead><tbody>{filtered.map((item) => {
        const status = item.status || "Active"; const disabled = status === "Deleted" || status === "Revoked" || status === "Superseded";
        return <tr key={item.certificateId}><td><strong>{item.certificateId}</strong><br/>{meta[item.type]?.label || item.type}</td><td><strong>{item.name}</strong><br/>{item.subject}</td><td>{item.reference || "—"}</td><td>R{item.revision || 1}</td><td><span className={`cert-status ${status.toLowerCase()}`}>{status.toUpperCase()}</span>{item.supersededBy ? <><br/>→ {item.supersededBy}</> : null}</td><td>{displayDate(item.issuedAt)}</td><td><div className="cert-actions">{item.verificationUrl && <a href={item.verificationUrl} target="_blank" rel="noreferrer">VERIFY</a>}<button onClick={() => { setIssued(item); setTimeout(() => document.getElementById("certificate-preview")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }}>PREVIEW / PRINT</button><button onClick={() => editReissue(item)} disabled={status === "Deleted"}>EDIT / REISSUE</button><button onClick={() => statusAction(item, "revoke")} disabled={disabled}>REVOKE</button><button className="danger" onClick={() => statusAction(item, "delete")} disabled={status === "Deleted"}>WITHDRAW</button></div></td></tr>;
      })}</tbody></table></div>}
    </section>
  </div>;
}
