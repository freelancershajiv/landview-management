import Link from "next/link";
import { verifyCertificate } from "@/lib/certificate-verification";
import { selectRows } from "@/lib/supabase-data";
import styles from "./verify.module.css";

export const dynamic = "force-dynamic";

type RegistryCertificate = {
  certificateId?: string; status?: string; revision?: number; supersededBy?: string; revokedAt?: string; revokedReason?: string; deletedAt?: string; deletedReason?: string;
  token?: string; type?: string; name?: string; address?: string; position?: string; subject?: string; reference?: string; description?: string; issuedAt?: string; expiresAt?: string;
  fatherName?: string; motherName?: string; nidNo?: string; institution?: string; department?: string; studentId?: string; supervisor?: string; trainingArea?: string; serviceFrom?: string; serviceTo?: string;
};

function recipientLabel(type: string) {
  if (type === "employee") return "Employee Certificate";
  if (type === "intern") return "Intern / Student Certificate";
  if (type === "building") return "Building Certificate";
  return "Project Certificate";
}
function dateText(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) return value || "—"; return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "long", year: "numeric" }).format(date); }
function maskNid(value?: string) { const v=String(value||"").replace(/\s+/g,""); if(!v)return "—"; if(v.length<=4)return "••••"; return `${"•".repeat(Math.min(8,v.length-4))}${v.slice(-4)}`; }
function periodText(from?:string,to?:string){if(!from&&!to)return "—";return `${from?dateText(from):"—"} to ${to?dateText(to):"—"}`;}

async function registryStatus(certificateId: string): Promise<{ available: boolean; found: boolean; certificate?: RegistryCertificate }> {
  if (!certificateId) return { available: true, found: false };
  try {
    const rows = await selectRows("certificates", { filters: { certificate_code: certificateId.toUpperCase() }, limit: 1 });
    const row = rows[0]; if (!row) return { available: true, found: false };
    return { available: true, found: true, certificate: {
      certificateId: row.certificate_code, status: row.status || "Active", revision: Number(row.revision || 1), supersededBy: row.superseded_by || "", revokedAt: row.revoked_at || "", revokedReason: row.revoked_reason || "", deletedAt: row.deleted_at || "", deletedReason: row.deleted_reason || "", token: row.verification_token || "",
      type: row.type || "project", name: row.name || "", address: row.address || "", fatherName: row.father_name || "", motherName: row.mother_name || "", nidNo: row.nid_no || "", position: row.position || "", subject: row.subject || "", reference: row.reference || "", description: row.description || "", issuedAt: row.issued_at || "", expiresAt: row.expires_at || "",
      institution: row.institution || "", department: row.department || "", studentId: row.student_id || "", supervisor: row.supervisor || "", trainingArea: row.training_area || "", serviceFrom: row.service_from || "", serviceTo: row.service_to || "",
    }};
  } catch { return { available: false, found: false }; }
}

export default async function CertificateVerificationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params; const decoded = decodeURIComponent(token || "");
  const shortId = /^LVC-(?:EMP|INT|PRJ|BLD)-/i.test(decoded) ? decoded.toUpperCase() : "";
  const shortRegistry = shortId ? await registryStatus(shortId) : null;
  const row: any = shortRegistry?.certificate || {}; const storedToken = String(row.token || "").trim();
  let certificate: any = storedToken ? verifyCertificate(storedToken) : verifyCertificate(decoded);
  if (!certificate && shortRegistry?.found) {
    certificate = { id: shortId, t: String(row.type || "project").toLowerCase(), n: row.name || "LAND VIEW certificate holder", a: row.address || "", p: row.position || "", s: row.subject || "", r: row.reference || "", d: row.description || "", i: row.issuedAt || "", x: row.expiresAt || "", f: row.fatherName || "", m: row.motherName || "", nid: row.nidNo || "", institution: row.institution || "", department: row.department || "", studentId: row.studentId || "", supervisor: row.supervisor || "", trainingArea: row.trainingArea || "", serviceFrom: row.serviceFrom || "", serviceTo: row.serviceTo || "" };
  }
  if (!certificate) return <main className={styles.shell}><section className={styles.card}><div className={styles.brand}>LAND <span>VIEW</span></div><div className={styles.invalidIcon}>!</div><h1>Certificate verification failed</h1><p>This certificate QR or verification link is invalid, incomplete, or has been altered.</p><Link href="https://www.landview.com.bd">Visit LAND VIEW</Link></section></main>;

  const registry = shortRegistry || await registryStatus(certificate.id); const liveStatus = String(registry.certificate?.status || "").trim().toLowerCase();
  const expired = certificate.x ? new Date(certificate.x).getTime() < Date.now() : false; const revoked = liveStatus === "revoked"; const withdrawn = liveStatus === "withdrawn" || liveStatus === "deleted"; const superseded = liveStatus === "superseded";
  let badgeClass = styles.verified; let badgeIcon = "✓"; let badgeText = "AUTHENTIC & VERIFIED";
  if (withdrawn) { badgeClass = styles.deleted; badgeIcon = "!"; badgeText = "WITHDRAWN"; }
  else if (revoked) { badgeClass = styles.revoked; badgeIcon = "!"; badgeText = "REVOKED"; }
  else if (superseded) { badgeClass = styles.superseded; badgeIcon = "↗"; badgeText = "SUPERSEDED"; }
  else if (expired) { badgeClass = styles.expired; badgeIcon = "!"; badgeText = "EXPIRED"; }
  else if (!registry.available || !registry.found) { badgeClass = styles.legacy; badgeIcon = "✓"; badgeText = "SIGNED CERTIFICATE"; }

  const data:any = registry.certificate || {};
  const exactTitle = String(data.subject || certificate.s || recipientLabel(certificate.t));
  const institution=data.institution||certificate.institution||""; const department=data.department||certificate.department||""; const studentId=data.studentId||certificate.studentId||""; const supervisor=data.supervisor||certificate.supervisor||""; const trainingArea=data.trainingArea||certificate.trainingArea||""; const serviceFrom=data.serviceFrom||certificate.serviceFrom||""; const serviceTo=data.serviceTo||certificate.serviceTo||"";

  return <main className={styles.shell}><section className={styles.card}>
    <header className={styles.header}><div><div className={styles.brand}>LAND <span>VIEW</span></div><small>Engineers and Architects</small></div><div className={badgeClass}><b>{badgeIcon}</b><span>{badgeText}</span></div></header>
    <div className={styles.rule}/><section className={styles.hero}><span>OFFICIAL LAND VIEW CERTIFICATE</span><h1>{exactTitle}</h1><p>The digital signature confirms the issued certificate data. The live registry status above shows its current standing in the LAND VIEW management system.</p></section>

    {(revoked || withdrawn || superseded || (!registry.available || !registry.found)) && <section className={`${styles.statusNotice} ${revoked || withdrawn ? styles.statusDanger : ""}`}>
      {revoked&&<><strong>This certificate has been revoked.</strong><p>{registry.certificate?.revokedReason || "LAND VIEW administration has revoked this certificate."}</p></>}
      {withdrawn&&<><strong>This certificate has been withdrawn.</strong><p>{registry.certificate?.deletedReason || "LAND VIEW administration has withdrawn this certificate from active use."}</p></>}
      {superseded&&<><strong>A newer revision has replaced this certificate.</strong><p>Replacement certificate: {registry.certificate?.supersededBy || "see LAND VIEW administration"}.</p></>}
      {(!registry.available||!registry.found)&&!revoked&&!withdrawn&&!superseded&&<><strong>Signed certificate — registry status unavailable.</strong><p>The QR signature is valid, but this certificate is not currently available in the live registry.</p></>}
    </section>}

    <section className={styles.meta}>
      <div><span>Certificate ID</span><strong>{certificate.id}</strong></div><div><span>Revision</span><strong>{registry.certificate?.revision || 1}</strong></div>
      <div><span>Issued To / Name</span><strong>{certificate.n}</strong></div><div><span>Recipient Type</span><strong>{recipientLabel(certificate.t)}</strong></div>
      <div><span>Address</span><strong>{certificate.a || "—"}</strong></div><div><span>Position / Designation</span><strong>{certificate.p || "—"}</strong></div>
      <div><span>Certificate Type</span><strong>{exactTitle}</strong></div><div><span>Reference</span><strong>{certificate.r || studentId || "—"}</strong></div>
      {certificate.t === "employee" && <div><span>Father's Name</span><strong>{certificate.f || "—"}</strong></div>}
      {certificate.t === "employee" && <div><span>Mother's Name</span><strong>{certificate.m || "—"}</strong></div>}
      {certificate.t === "employee" && <div><span>NID No.</span><strong>{maskNid(certificate.nid)}</strong></div>}
      {certificate.t === "intern" && <div><span>Institute / College</span><strong>{institution || "—"}</strong></div>}
      {certificate.t === "intern" && <div><span>Department / Technology</span><strong>{department || "—"}</strong></div>}
      {certificate.t === "intern" && <div><span>Student ID / Roll</span><strong>{studentId || "—"}</strong></div>}
      {certificate.t === "intern" && <div><span>Internship Period</span><strong>{periodText(serviceFrom,serviceTo)}</strong></div>}
      {certificate.t === "intern" && supervisor && <div><span>Supervisor</span><strong>{supervisor}</strong></div>}
      {certificate.t === "intern" && trainingArea && <div><span>Training Area</span><strong>{trainingArea}</strong></div>}
      <div><span>Issue Date</span><strong>{dateText(certificate.i)}</strong></div><div><span>Expiry</span><strong>{certificate.x ? dateText(certificate.x) : "No expiry"}</strong></div><div><span>Registry Status</span><strong>{registry.certificate?.status || (registry.available ? "Not registered" : "Unavailable")}</strong></div>
    </section>
    {certificate.d&&<section className={styles.statement}><span>Certificate Statement</span><p>{certificate.d}</p></section>}
    <p className={styles.notice}>The signed QR protects the issued certificate data from alteration. Revocation, withdrawal and reissue status is checked against the live LAND VIEW certificate registry. Sensitive identification numbers are masked on this public page.</p>
    <footer><strong>LAND VIEW — Engineers and Architects</strong><span>Feni Sadar, Feni, Bangladesh · www.landview.com.bd</span></footer>
  </section></main>;
}
