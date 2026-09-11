"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";

type CertificateType = "project" | "employee" | "building";
type Row = Record<string, any>;

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

const typeMeta: Record<CertificateType, { label: string; code: string; defaultPosition: string; statement: string }> = {
  project: {
    label: "Project Certificate",
    code: "PRJ",
    defaultPosition: "Project / Client",
    statement: "This is to certify that the project named above has been recorded and served by LAND VIEW — Engineers and Architects in accordance with the scope stated in this certificate.",
  },
  employee: {
    label: "Employee Certificate",
    code: "EMP",
    defaultPosition: "Employee",
    statement: "This is to certify that the person named above is / was associated with LAND VIEW — Engineers and Architects in the stated position and capacity.",
  },
  building: {
    label: "Building Certificate",
    code: "BLD",
    defaultPosition: "Owner / Representative",
    statement: "This is to certify that the building / property described above has been reviewed or documented by LAND VIEW — Engineers and Architects for the purpose stated in this certificate.",
  },
};

function text(value: unknown) { return String(value ?? "").trim(); }
function pick(row: Row, keys: string[]) {
  for (const key of keys) if (text(row?.[key])) return row[key];
  return "";
}
function projectId(row: Row) { return text(pick(row, ["Project_ID", "Project ID", "ProjectId"])); }
function employeeId(row: Row) { return text(pick(row, ["Employee_ID", "Employee ID", "EmployeeId"])); }
function dateInputToday() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
function displayDate(value: string) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value || "—" : d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
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
  const [error, setError] = useState("");
  const [issued, setIssued] = useState<IssuedCertificate | null>(null);
  const [history, setHistory] = useState<IssuedCertificate[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {}

    Promise.allSettled([landViewApi.getProjects(), landViewApi.getEmployees()])
      .then(([p, e]) => {
        if (p.status === "fulfilled") setProjects(p.value || []);
        if (e.status === "fulfilled") setEmployees(e.value || []);
      })
      .finally(() => setLoadingSources(false));
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
    const row = projects.find((item) => projectId(item) === id);
    if (!row) return;
    setReference(id);
    setName(text(pick(row, ["Client_Name", "Client Name", "Project_Name", "Project Name", "Name"])));
    setSubject(text(pick(row, ["Project_Name", "Project Name", "Project_Type", "Project Type"])) || id);
    setAddress(text(pick(row, ["Location", "Project_Location", "Project Location", "Address"])));
    setPosition("Project / Client");
  }

  function selectEmployee(id: string) {
    const row = employees.find((item) => employeeId(item) === id);
    if (!row) return;
    setReference(id);
    setName(text(pick(row, ["Employee_Name", "Employee Name", "Name"])));
    setAddress(text(pick(row, ["Address", "Present_Address", "Present Address", "Location"])));
    setPosition(text(pick(row, ["Position", "Designation", "Department"])) || "Employee");
    setSubject("Employment / Service Certificate");
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
        .cert-page{display:grid;gap:22px;color:#efefef}.cert-hero{display:flex;justify-content:space-between;align-items:flex-end;gap:22px;padding:8px 2px}.cert-hero small{display:block;color:#ef6e64;font-size:9px;font-weight:900;letter-spacing:.14em}.cert-hero h1{margin:8px 0 5px;font-size:34px;letter-spacing:-.04em}.cert-hero p{margin:0;color:#858b91;font-size:11px}.cert-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.cert-stat{padding:16px;border:1px solid #34373b;border-radius:10px;background:#1d1f21}.cert-stat span{display:block;color:#777d83;font-size:8px;font-weight:900;letter-spacing:.1em}.cert-stat strong{display:block;margin-top:8px;font-size:24px}.cert-layout{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:18px;align-items:start}.cert-panel{border:1px solid #34373b;border-radius:12px;background:#1b1d1f;overflow:hidden}.cert-panel-head{padding:18px 20px;border-bottom:1px solid #323539}.cert-panel-head small{display:block;color:#ef6e64;font-size:8px;font-weight:900;letter-spacing:.12em}.cert-panel-head h2{margin:6px 0 0;font-size:18px}.cert-type-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:14px 18px 0}.cert-type-tabs button{height:54px;border:1px solid #34383c;border-radius:9px;background:#141618;color:#969ca2;font-size:9px;font-weight:900;cursor:pointer}.cert-type-tabs button.active{border-color:#ef493b;background:rgba(239,73,59,.09);color:#fff}.cert-form{padding:18px 20px 22px}.cert-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}.cert-field{display:grid;gap:7px}.cert-field.full{grid-column:1/-1}.cert-field>span{font-size:8px;font-weight:900;letter-spacing:.1em;color:#8c9298}.cert-field input,.cert-field select,.cert-field textarea{width:100%;border:1px solid #34383c;border-radius:8px;background:#101214;color:#f3f3f3;outline:none;padding:0 12px;font-size:11px}.cert-field input,.cert-field select{height:44px}.cert-field textarea{min-height:105px;padding-top:11px;resize:vertical;line-height:1.6}.cert-field input:focus,.cert-field select:focus,.cert-field textarea:focus{border-color:#ef493b;box-shadow:0 0 0 3px rgba(239,73,59,.08)}.cert-error{margin-bottom:14px;padding:11px 12px;border:1px solid rgba(239,73,59,.3);border-radius:8px;background:rgba(239,73,59,.08);color:#f3aca5;font-size:10px}.cert-submit{width:100%;height:49px;margin-top:16px;border:0;border-radius:8px;background:#ef493b;color:white;font-size:9px;font-weight:900;letter-spacing:.1em;cursor:pointer}.cert-submit:disabled{opacity:.55;cursor:not-allowed}.cert-help{padding:18px 20px}.cert-help article{padding:14px 0;border-bottom:1px solid #303337}.cert-help article:last-child{border-bottom:0}.cert-help strong{display:block;font-size:10px}.cert-help p{margin:6px 0 0;color:#81878d;font-size:9px;line-height:1.55}.cert-preview-wrap{scroll-margin-top:120px}.certificate-paper{width:min(100%,980px);aspect-ratio:1.414/1;margin:0 auto;background:white;color:#111;padding:46px 54px;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.25);border:10px solid #fff;outline:2px solid #111;outline-offset:-22px}.certificate-paper:before{content:"";position:absolute;inset:29px;border:1px solid #d4d4d4;pointer-events:none}.certificate-top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.certificate-brand{display:flex;align-items:center;gap:12px}.certificate-brand img{width:64px;height:64px;object-fit:contain}.certificate-brand strong{display:block;font-size:21px;letter-spacing:.1em}.certificate-brand span{display:block;margin-top:3px;color:#555;font-size:8px;letter-spacing:.13em}.certificate-id{text-align:right}.certificate-id span{display:block;color:#777;font-size:8px;text-transform:uppercase;letter-spacing:.1em}.certificate-id strong{display:block;margin-top:5px;font-size:10px}.certificate-title{text-align:center;margin-top:30px}.certificate-title small{display:block;color:#b52d24;font-size:9px;font-weight:900;letter-spacing:.18em}.certificate-title h2{margin:8px 0 2px;font-family:Georgia,serif;font-size:35px;font-weight:500}.certificate-title:after{content:"";display:block;width:70px;height:2px;background:#b52d24;margin:13px auto 0}.certificate-body{text-align:center;max-width:760px;margin:24px auto 0}.certificate-body>span{display:block;color:#666;font-size:11px}.certificate-name{margin:8px 0 7px;font-family:Georgia,serif;font-size:29px;font-weight:500}.certificate-position{font-size:11px;font-weight:700}.certificate-address{margin-top:4px;color:#666;font-size:10px}.certificate-subject{margin:18px auto 0;padding:10px 14px;border-top:1px solid #ddd;border-bottom:1px solid #ddd;font-size:11px;font-weight:800}.certificate-statement{margin:17px auto 0;color:#333;font-size:10px;line-height:1.75}.certificate-bottom{position:absolute;left:54px;right:54px;bottom:46px;display:grid;grid-template-columns:1fr auto 1fr;gap:28px;align-items:end}.certificate-signature{border-top:1px solid #222;padding-top:7px;text-align:center;font-size:8px;color:#555}.certificate-signature strong{display:block;color:#111;font-size:9px;margin-bottom:2px}.certificate-qr{text-align:center}.certificate-qr img{display:block;width:82px;height:82px;margin:auto}.certificate-qr span{display:block;margin-top:5px;font-size:6px;color:#666;letter-spacing:.07em}.certificate-date{text-align:center;border-top:1px solid #222;padding-top:7px;font-size:8px;color:#555}.certificate-date strong{display:block;color:#111;font-size:9px;margin-bottom:2px}.cert-preview-actions{display:flex;gap:9px;justify-content:flex-end;margin-bottom:12px}.cert-preview-actions button,.cert-preview-actions a{height:39px;padding:0 14px;border:1px solid #3a3e42;border-radius:8px;background:#202326;color:#ddd;display:inline-flex;align-items:center;text-decoration:none;font-size:8px;font-weight:900;letter-spacing:.07em;cursor:pointer}.cert-preview-actions .primary{border-color:#ef493b;background:#ef493b;color:#fff}.cert-history{border:1px solid #34373b;border-radius:12px;background:#1b1d1f;overflow:hidden}.cert-history table{width:100%;border-collapse:collapse}.cert-history th,.cert-history td{padding:12px 14px;text-align:left;border-bottom:1px solid #303337;font-size:9px}.cert-history th{color:#777d83;font-size:8px;text-transform:uppercase;letter-spacing:.08em}.cert-history td strong{font-size:10px}.cert-history a{color:#ff746a;text-decoration:none;font-weight:800}.cert-empty{padding:22px;color:#777d83;font-size:10px;text-align:center}@media(max-width:1000px){.cert-layout{grid-template-columns:1fr}.cert-stats{grid-template-columns:1fr 1fr}}@media(max-width:650px){.cert-form-grid{grid-template-columns:1fr}.cert-field.full{grid-column:auto}.cert-type-tabs{grid-template-columns:1fr}.cert-stats{grid-template-columns:1fr 1fr}.certificate-paper{aspect-ratio:auto;min-height:680px;padding:34px}.certificate-bottom{left:34px;right:34px;grid-template-columns:1fr 90px 1fr}.certificate-title h2{font-size:27px}.certificate-name{font-size:24px}.certificate-brand img{width:50px;height:50px}.certificate-brand strong{font-size:16px}}@media print{body *{visibility:hidden!important}.certificate-paper,.certificate-paper *{visibility:visible!important}.certificate-paper{position:absolute;left:0;top:0;width:100%;height:100%;margin:0;box-shadow:none;outline-offset:-18px}.cert-preview-actions{display:none!important}@page{size:A4 landscape;margin:0}}
      `}</style>

      <header className="cert-hero">
        <div><small>OFFICIAL DOCUMENTS</small><h1>Certificate center.</h1><p>Issue QR-verifiable project, employee and building certificates.</p></div>
      </header>

      <section className="cert-stats">
        <div className="cert-stat"><span>RECENT ISSUED</span><strong>{stats.total}</strong></div>
        <div className="cert-stat"><span>PROJECT</span><strong>{stats.project}</strong></div>
        <div className="cert-stat"><span>EMPLOYEE</span><strong>{stats.employee}</strong></div>
        <div className="cert-stat"><span>BUILDING</span><strong>{stats.building}</strong></div>
      </section>

      <div className="cert-layout">
        <section className="cert-panel">
          <div className="cert-panel-head"><small>ISSUE NEW</small><h2>{typeMeta[type].label}</h2></div>
          <div className="cert-type-tabs">
            {(["project", "employee", "building"] as CertificateType[]).map((item) => <button key={item} className={type === item ? "active" : ""} onClick={() => switchType(item)} type="button">{typeMeta[item].label}</button>)}
          </div>
          <form className="cert-form" onSubmit={issueCertificate}>
            {error && <div className="cert-error">{error}</div>}
            <div className="cert-form-grid">
              {type === "project" && <label className="cert-field full"><span>SELECT PROJECT / FILE ID</span><select disabled={loadingSources} value={projects.some((p) => projectId(p) === reference) ? reference : ""} onChange={(e) => selectProject(e.target.value)}><option value="">{loadingSources ? "Loading projects…" : "Choose a project to prefill"}</option>{projects.map((p) => <option key={projectId(p)} value={projectId(p)}>{projectId(p)} — {text(pick(p,["Client_Name","Project_Name","Name"])) || "Project"}</option>)}</select></label>}
              {type === "employee" && <label className="cert-field full"><span>SELECT EMPLOYEE</span><select disabled={loadingSources} value={employees.some((p) => employeeId(p) === reference) ? reference : ""} onChange={(e) => selectEmployee(e.target.value)}><option value="">{loadingSources ? "Loading employees…" : "Choose an employee to prefill"}</option>{employees.map((p) => <option key={employeeId(p)} value={employeeId(p)}>{employeeId(p)} — {text(pick(p,["Employee_Name","Name"])) || "Employee"}</option>)}</select></label>}
              <label className="cert-field"><span>NAME / OWNER / RECIPIENT</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" /></label>
              <label className="cert-field"><span>POSITION / DESIGNATION</span><input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Position or relationship" /></label>
              <label className="cert-field full"><span>ADDRESS</span><input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Full address" /></label>
              <label className="cert-field"><span>SUBJECT / PROJECT / BUILDING NAME</span><input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Certificate subject" /></label>
              <label className="cert-field"><span>REFERENCE / FILE ID</span><input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={type === "project" ? "LV-0001" : type === "employee" ? "EMP-0001" : "Building / holding ref."} /></label>
              <label className="cert-field"><span>ISSUE DATE</span><input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></label>
              <label className="cert-field"><span>EXPIRY DATE (OPTIONAL)</span><input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} /></label>
              <label className="cert-field full"><span>CERTIFICATE STATEMENT</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} /></label>
            </div>
            <button className="cert-submit" type="submit" disabled={loading}>{loading ? "ISSUING CERTIFICATE…" : `ISSUE ${typeMeta[type].label.toUpperCase()}`}</button>
          </form>
        </section>

        <aside className="cert-panel">
          <div className="cert-panel-head"><small>VERIFICATION</small><h2>How it works</h2></div>
          <div className="cert-help">
            <article><strong>1. Issue certificate</strong><p>LAND VIEW creates a unique certificate ID and cryptographically signed verification link.</p></article>
            <article><strong>2. QR is embedded</strong><p>The simple QR printed on the certificate opens the public verification page.</p></article>
            <article><strong>3. Scan to verify</strong><p>The verification page shows the certificate type, name, address, position, subject, reference and issue date.</p></article>
            <article><strong>Tamper protection</strong><p>If certificate details inside the signed verification token are modified, verification fails automatically.</p></article>
          </div>
        </aside>
      </div>

      {issued && <section id="certificate-preview" className="cert-preview-wrap">
        <div className="cert-preview-actions"><button type="button" onClick={copyVerification}>{copied ? "COPIED" : "COPY VERIFY LINK"}</button><a href={issued.verificationUrl} target="_blank" rel="noreferrer">OPEN VERIFICATION</a><button className="primary" type="button" onClick={() => window.print()}>PRINT / SAVE PDF</button></div>
        <article className="certificate-paper">
          <div className="certificate-top">
            <div className="certificate-brand"><img src="/land-view-logo.png" alt="LAND VIEW"/><div><strong>LAND VIEW</strong><span>ENGINEERS & ARCHITECTS</span></div></div>
            <div className="certificate-id"><span>Certificate ID</span><strong>{issued.certificateId}</strong></div>
          </div>
          <div className="certificate-title"><small>OFFICIAL CERTIFICATE</small><h2>{typeMeta[issued.type].label}</h2></div>
          <div className="certificate-body"><span>This certificate is presented to / issued for</span><div className="certificate-name">{issued.name}</div><div className="certificate-position">{issued.position}</div><div className="certificate-address">{issued.address}</div><div className="certificate-subject">{issued.subject}{issued.reference ? ` · ${issued.reference}` : ""}</div><p className="certificate-statement">{issued.description}</p></div>
          <div className="certificate-bottom"><div className="certificate-signature"><strong>Authorized Signatory</strong>LAND VIEW</div><div className="certificate-qr"><img src={issued.qrUrl} alt="Certificate verification QR"/><span>SCAN TO VERIFY</span></div><div className="certificate-date"><strong>{displayDate(issued.issuedAt)}</strong>Date of Issue</div></div>
        </article>
      </section>}

      <section className="cert-history">
        <div className="cert-panel-head"><small>THIS BROWSER</small><h2>Recent issued certificates</h2></div>
        {history.length ? <div style={{overflowX:"auto"}}><table><thead><tr><th>Certificate ID</th><th>Type</th><th>Name</th><th>Subject</th><th>Issued</th><th>Verify</th></tr></thead><tbody>{history.map((item) => <tr key={item.certificateId}><td><strong>{item.certificateId}</strong></td><td>{typeMeta[item.type]?.label || item.type}</td><td>{item.name}</td><td>{item.subject || "—"}</td><td>{displayDate(item.issuedAt)}</td><td><a href={item.verificationUrl} target="_blank" rel="noreferrer">Open ↗</a></td></tr>)}</tbody></table></div> : <div className="cert-empty">No certificate has been issued from this browser yet.</div>}
      </section>
    </div>
  );
}
