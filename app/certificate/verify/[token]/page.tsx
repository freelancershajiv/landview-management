import Link from "next/link";
import { verifyCertificate } from "@/lib/certificate-verification";
import styles from "./verify.module.css";

export const dynamic = "force-dynamic";

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

  const expired = certificate.x ? new Date(certificate.x).getTime() < Date.now() : false;

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <header className={styles.header}>
          <div>
            <div className={styles.brand}>LAND <span>VIEW</span></div>
            <small>Engineers and Architects</small>
          </div>
          <div className={expired ? styles.expired : styles.verified}><b>{expired ? "!" : "✓"}</b><span>{expired ? "EXPIRED" : "AUTHENTIC & VERIFIED"}</span></div>
        </header>

        <div className={styles.rule} />

        <section className={styles.hero}>
          <span>OFFICIAL LAND VIEW CERTIFICATE</span>
          <h1>{label(certificate.t)}</h1>
          <p>The digital signature embedded in this QR confirms that the certificate was issued through the LAND VIEW management system.</p>
        </section>

        <section className={styles.meta}>
          <div><span>Certificate ID</span><strong>{certificate.id}</strong></div>
          <div><span>Issued To / Name</span><strong>{certificate.n}</strong></div>
          <div><span>Address</span><strong>{certificate.a || "—"}</strong></div>
          <div><span>Position / Designation</span><strong>{certificate.p || "—"}</strong></div>
          <div><span>Subject / Project / Building</span><strong>{certificate.s || "—"}</strong></div>
          <div><span>Reference</span><strong>{certificate.r || "—"}</strong></div>
          <div><span>Issue Date</span><strong>{dateText(certificate.i)}</strong></div>
          <div><span>Expiry</span><strong>{certificate.x ? dateText(certificate.x) : "No expiry"}</strong></div>
        </section>

        {certificate.d && <section className={styles.statement}><span>Certificate Statement</span><p>{certificate.d}</p></section>}

        <p className={styles.notice}>Verification result generated from a cryptographically signed LAND VIEW certificate token. Any change to the certificate data invalidates the QR verification.</p>

        <footer>
          <strong>LAND VIEW — Engineers and Architects</strong>
          <span>Feni Sadar, Feni, Bangladesh · www.landview.com.bd</span>
        </footer>
      </section>
    </main>
  );
}
