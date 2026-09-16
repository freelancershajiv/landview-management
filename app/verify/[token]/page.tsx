import type { Metadata } from "next";
import Link from "next/link";
import { verifyProjectVerification } from "@/lib/billing-verification";
import { loadPublicBillingVerification } from "@/lib/public-billing-verification";
import styles from "./verify.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false } };

const money = (value: number) =>
  new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

function displayDate(value: string) {
  const text = String(value || "").trim();
  if (!text) return "—";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function displayDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function VerifyBillingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const decodedToken = decodeURIComponent(token || "");
  const verified = verifyProjectVerification(decodedToken);

  if (!verified) {
    return (
      <main className={styles.shell}>
        <section className={styles.card}>
          <div className={styles.brand}>LAND <span>VIEW</span></div>
          <div className={styles.invalidIcon}>!</div>
          <h1>Verification failed</h1>
          <p>This invoice verification QR is invalid or has been altered.</p>
          <Link href="https://www.landview.com.bd">Visit LAND VIEW</Link>
        </section>
      </main>
    );
  }

  let record;
  try {
    record = await loadPublicBillingVerification(verified.fileId);
  } catch (error: any) {
    return (
      <main className={styles.shell}>
        <section className={styles.card}>
          <div className={styles.brand}>LAND <span>VIEW</span></div>
          <div className={styles.invalidIcon}>!</div>
          <h1>Live billing temporarily unavailable</h1>
          <p>{error?.message || "The current billing record could not be loaded."}</p>
          <p>The QR itself is valid for <strong>{verified.fileId}</strong>.</p>
          <Link href="https://www.landview.com.bd">Visit LAND VIEW</Link>
        </section>
      </main>
    );
  }

  const fullInvoiceUrl = `/verify/${encodeURIComponent(decodedToken)}/invoice`;

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <header className={styles.header}>
          <div>
            <div className={styles.brand}>LAND <span>VIEW</span></div>
            <small>Engineers and Architects</small>
          </div>
          <div className={styles.verified}><b>✓</b><span>LIVE & VERIFIED</span></div>
        </header>

        <div className={styles.rule} />

        <section className={styles.hero}>
          <span>OFFICIAL INVOICE VERIFICATION</span>
          <h1>{record.invoiceId}</h1>
          <p>This QR verifies the project and always shows the latest approved billing and payment balance held by LAND VIEW.</p>
        </section>

        <section className={styles.meta}>
          <div><span>Project ID</span><strong>{record.fileId}</strong></div>
          <div><span>Client</span><strong>{record.clientName || "—"}</strong></div>
          <div><span>Project</span><strong>{record.projectName || record.projectType || "—"}</strong></div>
          <div><span>Invoice Date</span><strong>{displayDate(record.invoiceDate)}</strong></div>
          <div><span>Last Payment</span><strong>{record.lastPayment ? displayDate(record.lastPayment.date) : "—"}</strong></div>
          <div><span>Status</span><strong className={record.status === "FULL PAID" ? styles.paid : styles.due}>{record.status}</strong></div>
        </section>

        {record.lastPayment && (
          <section className={styles.lastPayment}>
            <div><span>Latest Payment</span><strong>{money(record.lastPayment.amount)}</strong></div>
            <div><span>Method</span><strong>{record.lastPayment.method || "—"}</strong></div>
            <div><span>Payment Ref.</span><strong>{record.lastPayment.paymentId || record.lastPayment.reference || "—"}</strong></div>
          </section>
        )}

        <section className={styles.categories}>
          {record.categories
            .filter((category) => category.items.length || category.payments.length || Math.abs(category.gross) > 0.009 || Math.abs(category.paid) > 0.009)
            .map((category) => (
              <article key={category.name}>
                <header><h2>{category.name}</h2><strong>{money(category.due)}</strong></header>
                <div><span>Bill</span><b>{money(category.gross)}</b></div>
                <div><span>Discount</span><b>{money(category.discount)}</b></div>
                <div><span>Deposited</span><b>{money(category.paid)}</b></div>
                <div className={styles.categoryDue}><span>Due</span><b>{money(category.due)}</b></div>
              </article>
            ))}
        </section>

        <section className={styles.totals}>
          <div><span>Total Bill</span><strong>{money(record.totals.gross)}</strong></div>
          <div><span>Total Discount</span><strong>{money(record.totals.discount)}</strong></div>
          <div><span>Total Paid</span><strong>{money(record.totals.paid)}</strong></div>
          <div className={styles.totalDue}><span>Current Due</span><strong>{money(record.totals.due)}</strong></div>
        </section>

        <div className={styles.actions}>
          <Link className={styles.primaryAction} href={fullInvoiceUrl}>View Full Invoice</Link>
          <span>Full itemized bill, payment history, and Print / Save PDF are available inside.</span>
        </div>

        <p className={styles.notice}>Public read-only invoice verification. New approved bills, discounts and payments are reflected automatically. Last checked {displayDateTime(record.updatedAt)}.</p>

        <footer>
          <strong>LAND VIEW — Engineers and Architects</strong>
          <span>Feni Sadar, Feni, Bangladesh · www.landview.com.bd</span>
        </footer>
      </section>
    </main>
  );
}
