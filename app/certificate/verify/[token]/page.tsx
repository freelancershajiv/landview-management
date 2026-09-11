import Link from "next/link";
import { verifyCertificate } from "@/lib/certificate-verification";
import styles from "./verify.module.css";

export const dynamic = "force-dynamic";

type RegistryCertificate = {
  certificateId?: string;
  status?: string;
  revision?: number;
  supersededBy?: string;
  revokedAt?: string;
  revokedReason?: string;
  deletedAt?: string;
  deletedReason?: string;
};

function label(type: string) {
  if (type === "employee") return "Employee Certificate";
  if (type === "building") return "Building Certificate";
  return "Project Certificate";
}

function dateText(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

async function registryStatus(certificateId: string): Promise<{ available: boolean; found: boolean; certificate?: RegistryCertificate }> {
  const url = process.env.LAND_VIEW_API_URL || "";
  const proxySecret = process.env.LAND_VIEW_PROXY_SECRET || "";
  if (!url || !proxySecret) return { available: false, found: false };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "getPublicProjects",
        _certificateVerify: certificateId,
        proxySecret,
      }),
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    const raw = await response.text();
    const json = JSON.parse(raw);
    if (!json?.success) return { available: false, found: false };
    return {
      available: true,
      found: Boolean(json?.data?.found),
      certificate: json?.data?.certificate || undefined,
    };
  } catch {
    return { available: false, found: false };
  }
}

export default async function CertificateVerificationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const certificate = verifyCertificate(decodeURIComponent(token || ""));

  if (!certificate) {
    return (
      <main className={styles.shell}>
        <section className={styles.card}>
          <div className={styles.brand}>LAND <span>VIEW</span></div>
          <div className={styles.invalidIcon}>!</div>
          <h1>Certificate verification failed</h1>
          <p>This certificate QR or verification link is invalid, incomplete, or has been altered.</p>
          <Link href="https://www.landview.com.bd">Visit LAND VIEW</Link>
        </section>
      </main>
    );
  }

  const registry = await registryStatus(certificate.id);
  const liveStatus = String(registry.certificate?.status || "").trim().toLowerCase();
  const expired = certificate.x ? new Date(certificate.x).getTime() < Date.now() : false;
  const revoked = liveStatus === "revoked";
  const deleted = liveStatus === "deleted";
  const superseded = liveStatus === "superseded";

  let badgeClass = styles.verified;
  let badgeIcon = "✓";
  let badgeText = "AUTHENTIC & VERIFIED";
  if (deleted) { badgeClass = styles.deleted; badgeIcon = "!"; badgeText = "WITHDRAWN"; }
  else if (revoked) { badgeClass = styles.revoked; badgeIcon = "!"; badgeText = "REVOKED"; }
  else if (superseded) { badgeClass = styles.superseded; badgeIcon = "↗"; badgeText = "SUPERSEDED"; }
  else if (expired) { badgeClass = styles.expired; badgeIcon = "!"; badgeText = "EXPIRED"; }
  else if (!registry.available || !registry.found) { badgeClass = styles.legacy; badgeIcon = "✓"; badgeText = "SIGNED CERTIFICATE"; }

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <header className={styles.header}>
          <div>
            <div className={styles.brand}>LAND <span>VIEW</span></div>
            <small>Engineers and Architects</small>
          </div>
          <div className={badgeClass}><b>{badgeIcon}</b><span>{badgeText}</span></div>
        </header>

        <div className={styles.rule} />

        <section className={styles.hero}>
          <span>OFFICIAL LAND VIEW CERTIFICATE</span>
          <h1>{label(certificate.t)}</h1>
          <p>The digital signature confirms the certificate data. The registry status above shows its current standing in the LAND VIEW management system.</p>
        </section>

        {(revoked || deleted || superseded || (!registry.available || !registry.found)) && (
          <section className={`${styles.statusNotice} ${revoked || deleted ? styles.statusDanger : ""}`}>
            {revoked && <><strong>This certificate has been revoked.</strong><p>{registry.certificate?.revokedReason || "LAND VIEW administration has revoked this certificate."}</p></>}
            {deleted && <><strong>This certificate has been withdrawn.</strong><p>{registry.certificate?.deletedReason || "LAND VIEW administration has withdrawn this certificate from active use."}</p></>}
            {superseded && <><strong>A newer revision has replaced this certificate.</strong><p>Replacement certificate: {registry.certificate?.supersededBy || "see LAND VIEW administration"}.</p></>}
            {(!registry.available || !registry.found) && !revoked && !deleted && !superseded && <><strong>Signed certificate — registry status unavailable.</strong><p>The QR signature is valid, but this certificate is not currently available in the live registry. This can include certificates issued before the registry was enabled.</p></>}
          </section>
        )}

        <section className={styles.meta}>
          <div><span>Certificate ID</span><strong>{certificate.id}</strong></div>
          <div><span>Revision</span><strong>{registry.certificate?.revision || 1}</strong></div>
          <div><span>Issued To / Name</span><strong>{certificate.n}</strong></div>
          <div><span>Address</span><strong>{certificate.a || "—"}</strong></div>
          <div><span>Position / Designation</span><strong>{certificate.p || "—"}</strong></div>
          <div><span>Subject / Project / Building</span><strong>{certificate.s || "—"}</strong></div>
          <div><span>Reference</span><strong>{certificate.r || "—"}</strong></div>
          <div><span>Issue Date</span><strong>{dateText(certificate.i)}</strong></div>
          <div><span>Expiry</span><strong>{certificate.x ? dateText(certificate.x) : "No expiry"}</strong></div>
          <div><span>Registry Status</span><strong>{registry.certificate?.status || (registry.available ? "Not registered" : "Unavailable")}</strong></div>
        </section>

        {certificate.d && <section className={styles.statement}><span>Certificate Statement</span><p>{certificate.d}</p></section>}

        <p className={styles.notice}>The signed QR protects the issued certificate data from alteration. Revocation, withdrawal and reissue status is checked against the live LAND VIEW certificate registry whenever available.</p>

        <footer>
          <strong>LAND VIEW — Engineers and Architects</strong>
          <span>Feni Sadar, Feni, Bangladesh · www.landview.com.bd</span>
        </footer>
      </section>
    </main>
  );
}
