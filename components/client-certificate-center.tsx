"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "@/app/client/client.module.css";

type CertificateRow = {
  certificateId: string;
  type: string;
  category?: string;
  subject: string;
  status: string;
  issuedAt: string;
  reference: string;
  verificationUrl?: string;
};
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
  if (["revoked", "deleted", "superseded"].includes(status)) return styles.paused;
  return styles.other;
}
function categoryLabel(category: string) { return categories.find(item => item.value === category)?.label || category || "Certificate"; }
function errorText(error: unknown) { return error instanceof Error ? error.message : "Certificate service is unavailable. Please retry."; }

export default function ClientCertificateCenter({ refreshKey, onSummary }: Props) {
  const [data, setData] = useState<{ certificates: CertificateRow[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const loadVersion = useRef({ version: 0 });

  const load = useCallback(() => {
    const version = ++loadVersion.current.version;
    return fetch("/api/certificate-portal", { cache: "no-store", credentials: "same-origin" }).then(async response => {
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not load certificates.");
      if (!Array.isArray(json.data?.certificates)) throw new Error("The certificate service returned an incomplete response. Please retry.");
      if (version !== loadVersion.current.version) return;
      const certificates = json.data.certificates as CertificateRow[];
      setLoadError("");
      setData({ certificates });
      onSummary({ total: certificates.length, pending: 0 });
    }).catch(error => {
      if (version !== loadVersion.current.version) return;
      setLoadError(errorText(error));
      onSummary(null);
    }).finally(() => {
      if (version === loadVersion.current.version) setLoading(false);
    });
  }, [onSummary]);

  useEffect(() => {
    const tracker = loadVersion.current;
    void load();
    return () => { tracker.version++; };
  }, [load, refreshKey]);

  return <section id="certificates" className={`${styles.projects} cp-section`} aria-labelledby="client-certificates-heading">
    <span id="certificate-center" aria-hidden="true" />
    <div className={styles.projectHeader}>
      <div><small className={styles.panelKicker}>CERTIFICATE CENTER</small><h2 id="client-certificates-heading">Issued Certificates</h2></div>
      <button type="button" className={styles.refresh} disabled={loading} onClick={() => { setLoading(true); void load(); }}>{loading ? "Refreshing…" : "Refresh certificates"}</button>
    </div>
    <div style={{ padding: 20 }}>
      {loading && <p role="status">Loading issued certificates…</p>}
      {loadError && <p role="alert">{loadError} Use “Refresh certificates” to try again.</p>}
      {!loading && !loadError && <p>Certificates issued for your Project ID are shown here automatically. There is no certificate request option in the client portal.</p>}
    </div>
    {data && (
      <>
        <div className={styles.tableWrap}><table><thead><tr><th>Certificate ID / project</th><th>Category</th><th>Subject</th><th>Status</th><th>Issued</th><th>Access</th></tr></thead><tbody>{data.certificates.map(certificate => <tr key={certificate.certificateId}>
          <td><strong>{certificate.certificateId}</strong><small>{certificate.reference}</small></td>
          <td>{categoryLabel(certificate.category || certificate.type)}</td>
          <td><span className={styles.projectName}>{certificate.subject || "Certificate"}</span></td>
          <td><span className={`${styles.status} ${statusClass(certificate.status)}`}>{certificate.status || "Active"}</span></td>
          <td>{dateText(certificate.issuedAt)}</td>
          <td>{certificate.verificationUrl ? <a className="btn btn-light" href={certificate.verificationUrl} target="_blank" rel="noreferrer">View Certificate</a> : "—"}</td>
        </tr>)}</tbody></table></div>
        {!data.certificates.length && <div className={styles.empty}><h3>No certificates issued</h3><p>If LAND VIEW has not issued a certificate for your Project ID, nothing will be displayed here.</p></div>}
      </>
    )}
  </section>;
}
