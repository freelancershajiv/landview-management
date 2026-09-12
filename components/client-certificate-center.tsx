"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import styles from "@/app/admin/dashboard.module.css";

type RequestRow = { requestId: string; projectId: string; category: string; categoryLabel?: string; subject: string; details?: string; status: string; certificateId?: string; requestedAt?: string; adminNote?: string };
type CertificateRow = { certificateId: string; type: string; category?: string; subject: string; status: string; issuedAt: string; reference: string };
type Project = { projectId: string; projectName?: string };
export type CertificateSummary = { total: number; pending: number };
type Props = { projects: Project[]; refreshKey: number; onSummary: (summary: CertificateSummary | null) => void };

const categories = [
  { value: "project", label: "Project Certificate" },
  { value: "structural_design", label: "Structural Design Certificate" },
  { value: "supervision", label: "Supervision Certificate" },
  { value: "building", label: "Building Certificate" },
];
function dateText(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function statusClass(value: string) {
  const status = String(value || "").toLowerCase();
  if (["active", "issued", "approved"].includes(status)) return styles.complete;
  if (["rejected", "revoked", "deleted"].includes(status)) return styles.paused;
  return styles.other;
}
function categoryLabel(category: string) { return categories.find(item => item.value === category)?.label || category || "Certificate"; }
function errorText(error: unknown) { return error instanceof Error ? error.message : "Certificate service is unavailable. Please retry."; }

export default function ClientCertificateCenter({ projects, refreshKey, onSummary }: Props) {
  const [data, setData] = useState<{ requests: RequestRow[]; certificates: CertificateRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [category, setCategory] = useState("project");
  const [subject, setSubject] = useState("Project Certificate");
  const [details, setDetails] = useState("");
  const submitting = useRef(false);
  const loadVersion = useRef({ version: 0 });
  const selectedProject = projects.some(project => project.projectId === projectId) ? projectId : projects[0]?.projectId || "";

  const load = useCallback(() => {
    const version = ++loadVersion.current.version;
    return fetch("/api/certificate-portal", { cache: "no-store", credentials: "same-origin" }).then(async response => {
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not load certificates.");
      if (!Array.isArray(json.data?.requests) || !Array.isArray(json.data?.certificates)) throw new Error("The certificate service returned an incomplete response. Please retry.");
      if (version !== loadVersion.current.version) return;
      const next = { requests: json.data.requests as RequestRow[], certificates: json.data.certificates as CertificateRow[] };
      setLoadError("");
      setData(next);
      onSummary({ total: next.requests.length, pending: next.requests.filter(row => row.status.toLowerCase() === "pending").length });
    }).catch(error => {
      if (version !== loadVersion.current.version) return;
      setLoadError(errorText(error));
      onSummary(null);
    }).finally(() => {
      if (version === loadVersion.current.version) setLoading(false);
    });
  }, [onSummary]);

  useEffect(() => { const tracker = loadVersion.current; void load(); return () => { tracker.version++; }; }, [load, refreshKey]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !selectedProject || loading || loadError) return;
    if (!subject.trim()) { setSubmitError("Enter a subject or purpose."); return; }
    submitting.current = true;
    setBusy(true); setSubmitError(""); setNotice("");
    try {
      const response = await fetch("/api/certificate-portal", {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ action: "request", projectId: selectedProject, category, subject: subject.trim(), details: details.trim() }),
      });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not submit certificate request.");
      if (!json.data?.request?.requestId) throw new Error("The service did not confirm a request ID. Refresh request history before trying again.");
      setNotice(json.data.duplicate ? `Request ${json.data.request.requestId} is already pending or approved for this category. No duplicate was created.` : `Request ${json.data.request.requestId} sent to LAND VIEW for approval.`);
      if (!json.data.duplicate) setDetails("");
      setLoading(true);
      await load();
    } catch (error) { setSubmitError(errorText(error)); }
    finally { submitting.current = false; setBusy(false); }
  }

  return <section id="certificates" className={`${styles.projects} cp-section`} aria-labelledby="client-certificates-heading">
    <span id="certificate-center" aria-hidden="true" />
    <div className={styles.projectHeader}>
      <div><small className={styles.panelKicker}>CERTIFICATE CENTER</small><h2 id="client-certificates-heading">Certificates & requests</h2></div>
      <button type="button" className={styles.refresh} disabled={loading || busy} onClick={() => { setLoading(true); void load(); }}>{loading ? "Refreshing…" : "Refresh certificates"}</button>
    </div>
    <div style={{ padding: 20 }}>
      {loading && <p role="status">Loading certificate records…</p>}
      {loadError && <p role="alert">{loadError} Use “Refresh certificates” to try again.</p>}
      {notice && <p role="status">{notice}</p>}
      <form onSubmit={submit} aria-label="Request a certificate">
        <h3>Request a certificate</h3>
        <p>Choose the project and certificate you need. LAND VIEW will review your request and issue the approved certificate.</p>
        <fieldset disabled={busy || loading || !!loadError || !selectedProject} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <div className="form-grid">
            <label className="form-field"><span>PROJECT</span><select value={selectedProject} onChange={event => setProjectId(event.target.value)} required>{!selectedProject && <option value="">No project available</option>}{projects.map(project => <option key={project.projectId} value={project.projectId}>{project.projectId}{project.projectName ? ` · ${project.projectName}` : ""}</option>)}</select></label>
            <label className="form-field"><span>CERTIFICATE CATEGORY</span><select value={category} onChange={event => { setCategory(event.target.value); setSubject(categoryLabel(event.target.value)); }}>{categories.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label className="form-field" style={{ gridColumn: "1 / -1" }}><span>SUBJECT / PURPOSE</span><input value={subject} onChange={event => setSubject(event.target.value)} maxLength={160} required /></label>
            <label className="form-field" style={{ gridColumn: "1 / -1" }}><span>DETAILS FOR LAND VIEW</span><textarea value={details} onChange={event => setDetails(event.target.value)} maxLength={800} style={{ minHeight: 110 }} placeholder="Describe the purpose or wording needed for your certificate." /></label>
          </div>
          <div className="form-actions"><button type="submit" className="btn btn-dark">{busy ? "Submitting…" : "Submit request"}</button></div>
        </fieldset>
        {!selectedProject && <p>No accessible project is available. Refresh your project dashboard or contact LAND VIEW.</p>}
        {submitError && <p role="alert">{submitError}</p>}
      </form>
    </div>
    {data && <>
      <div className={styles.projectHeader}><h3>Request history <span>({data.requests.length})</span></h3></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Request / project</th><th>Certificate / purpose</th><th>Status</th><th>Certificate ID</th></tr></thead><tbody>{data.requests.map(row => <tr key={row.requestId}>
        <td><strong>{row.requestId}</strong><small>{row.projectId} · {dateText(row.requestedAt)}</small></td>
        <td><span className={styles.projectName}>{row.categoryLabel || categoryLabel(row.category)}</span><small>{row.subject}</small>{row.details && <small>{row.details}</small>}{row.adminNote && <small>LAND VIEW: {row.adminNote}</small>}</td>
        <td><span className={`${styles.status} ${statusClass(row.status)}`}>{row.status || "Pending"}</span></td><td>{row.certificateId || "—"}</td>
      </tr>)}</tbody></table></div>
      {!data.requests.length && <div className={styles.empty}><h3>No requests yet</h3><p>Submitted requests and review updates will appear here.</p></div>}
      <div className={styles.projectHeader}><h3>Issued certificates <span>({data.certificates.length})</span></h3></div>
      <div className={styles.tableWrap}><table><thead><tr><th>Certificate ID / project</th><th>Category</th><th>Subject</th><th>Status</th><th>Issued</th></tr></thead><tbody>{data.certificates.map(certificate => <tr key={certificate.certificateId}>
        <td><strong>{certificate.certificateId}</strong><small>{certificate.reference}</small></td><td>{categoryLabel(certificate.category || certificate.type)}</td><td><span className={styles.projectName}>{certificate.subject || "Certificate"}</span></td><td><span className={`${styles.status} ${statusClass(certificate.status)}`}>{certificate.status || "Active"}</span></td><td>{dateText(certificate.issuedAt)}</td>
      </tr>)}</tbody></table></div>
      {!data.certificates.length && <div className={styles.empty}><h3>No certificates issued yet</h3><p>Certificates issued for your project will appear here.</p></div>}
    </>}
  </section>;
}
