import type { Metadata } from "next";
import Link from "next/link";
import { verifyEstimateVerification } from "@/lib/estimate-verification";
import styles from "../../[token]/verify.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const money = (value: number) => new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
  maximumFractionDigits: 0,
}).format(Number(value || 0));

const numberText = (value: number) => new Intl.NumberFormat("en-BD", { maximumFractionDigits: 2 }).format(Number(value || 0));

function displayDate(value: string) {
  const text = String(value || "").trim();
  if (!text) return "—";
  const date = new Date(`${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export default async function VerifyEstimatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const decodedToken = decodeURIComponent(token || "");
  const record = verifyEstimateVerification(decodedToken);

  if (!record) {
    return (
      <main className={styles.shell}>
        <section className={styles.card}>
          <div className={styles.brand}>LAND <span>VIEW</span></div>
          <div className={styles.invalidIcon}>!</div>
          <h1>Verification failed</h1>
          <p>This estimate verification QR is invalid or has been altered.</p>
          <Link href="https://www.landview.com.bd">Visit LAND VIEW</Link>
        </section>
      </main>
    );
  }

  const compact = record.version === 2;

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <header className={styles.header}>
          <div>
            <div className={styles.brand}>LAND <span>VIEW</span></div>
            <small>Engineers and Architects</small>
          </div>
          <div className={styles.verified}><b>✓</b><span>ISSUED & VERIFIED</span></div>
        </header>

        <div className={styles.rule} />

        <section className={styles.hero}>
          <span>OFFICIAL ESTIMATE VERIFICATION</span>
          <h1>{record.estimateId}</h1>
          <p>{compact
            ? "This short QR confirms the issued Summary Estimate reference, date and total. Its signed fingerprint also binds the QR to the original estimate used when it was generated."
            : "This legacy QR verifies the exact Summary Estimate snapshot issued by LAND VIEW."}</p>
        </section>

        <section className={styles.meta}>
          <div><span>Estimate ID</span><strong>{record.estimateId}</strong></div>
          <div><span>Issue Date</span><strong>{displayDate(record.issueDate)}</strong></div>
          <div><span>File / Proposal ID</span><strong>{record.referenceId || "—"}</strong></div>
          <div><span>Verified Grand Total</span><strong>{money(record.grandTotal)}</strong></div>
          {compact && <div><span>Document Fingerprint</span><strong>{record.fingerprint}</strong></div>}
          {!compact && <>
            <div><span>Client</span><strong>{record.ownerName || "—"}</strong></div>
            <div><span>Contact</span><strong>{record.contactNo || "—"}</strong></div>
            <div><span>Status</span><strong>{record.status || "—"}</strong></div>
            <div><span>Project</span><strong>{record.projectTitle || record.projectType || "—"}</strong></div>
            <div><span>Project Type</span><strong>{record.projectType || "—"}</strong></div>
            <div><span>Floor / Story</span><strong>{record.floorStory || "—"}</strong></div>
            <div><span>Land Area</span><strong>{record.landArea || "—"}</strong></div>
            <div><span>Location</span><strong>{record.location || "—"}</strong></div>
            <div><span>Built-up Area</span><strong>{numberText(record.totalArea)} sft</strong></div>
          </>}
        </section>

        {!compact && <>
          <section className={styles.categories}>
            <article>
              <header><h2>Estimate Basis</h2><strong>{money(record.grandTotal)}</strong></header>
              <div><span>Construction Rate / sft</span><b>{money(record.ratePerSft)}</b></div>
              <div><span>Base Construction</span><b>{money(record.baseCost)}</b></div>
              <div><span>Allowances</span><b>{money(record.allowanceTotal)}</b></div>
              <div className={styles.categoryDue}><span>Contingency</span><b>{money(record.contingency)}</b></div>
            </article>
          </section>

          <section className={styles.totals}>
            <div><span>Base Construction</span><strong>{money(record.baseCost)}</strong></div>
            <div><span>Allowances</span><strong>{money(record.allowanceTotal)}</strong></div>
            <div><span>Contingency</span><strong>{money(record.contingency)}</strong></div>
            <div className={styles.totalDue}><span>Verified Grand Total</span><strong>{money(record.grandTotal)}</strong></div>
          </section>
        </>}

        {compact && <section className={styles.totals}>
          <div><span>Estimate ID</span><strong>{record.estimateId}</strong></div>
          <div><span>Issued</span><strong>{displayDate(record.issueDate)}</strong></div>
          <div><span>Reference</span><strong>{record.referenceId || "Standalone"}</strong></div>
          <div className={styles.totalDue}><span>Verified Grand Total</span><strong>{money(record.grandTotal)}</strong></div>
        </section>}

        <div className={styles.actions}>
          <Link className={styles.primaryAction} href="https://www.landview.com.bd">LAND VIEW Website</Link>
          <span>Read-only verification of an estimate issued by LAND VIEW.</span>
        </div>

        <p className={styles.notice}>{compact
          ? "Compact verification is intentionally designed like the billing QR: short, easy to scan, and cryptographically signed. Any change to the signed reference invalidates the QR."
          : "Legacy verification proves the estimate values signed into this QR."}</p>

        <footer>
          <strong>LAND VIEW — Engineers and Architects</strong>
          <span>Feni Sadar, Feni, Bangladesh · www.landview.com.bd</span>
        </footer>
      </section>
    </main>
  );
}
