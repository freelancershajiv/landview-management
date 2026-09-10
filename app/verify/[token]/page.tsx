import Link from "next/link";
import { verifyBillingVerification } from "@/lib/billing-verification";
import styles from "./verify.module.css";

export const dynamic = "force-dynamic";

const money = (value: number) =>
  new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(value);

function dateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
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
  const record = verifyBillingVerification(decodeURIComponent(token || ""));

  if (!record) {
    return (
      <main className={styles.shell}>
        <section className={styles.card}>
          <div className={styles.brand}>LAND <span>VIEW</span></div>
          <div className={styles.invalidIcon}>!</div>
          <h1>Verification failed</h1>
          <p>This billing verification link is invalid, incomplete, or has been altered.</p>
          <Link href="https://www.landview.com.bd">Visit LAND VIEW</Link>
        </section>
      </main>
    );
  }

  const status = record.totals.due > 0 ? "DUE" : record.totals.due < 0 ? "CREDIT" : "FULL PAID";

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <header className={styles.header}>
          <div>
            <div className={styles.brand}>LAND <span>VIEW</span></div>
            <small>Engineers and Architects</small>
          </div>
          <div className={styles.verified}><b>✓</b><span>VERIFIED</span></div>
        </header>

        <div className={styles.rule} />

        <section className={styles.hero}>
          <span>OFFICIAL BILLING RECORD</span>
          <h1>{record.fileId}</h1>
          <p>This record was digitally signed by the LAND VIEW management system.</p>
        </section>

        <section className={styles.meta}>
          <div><span>Client</span><strong>{record.clientName || "—"}</strong></div>
          <div><span>Project Type</span><strong>{record.projectType || "—"}</strong></div>
          <div><span>Issued</span><strong>{dateTime(record.issuedAt)}</strong></div>
          <div><span>Status</span><strong className={status === "FULL PAID" ? styles.paid : styles.due}>{status}</strong></div>
        </section>

        <section className={styles.categories}>
          {record.categories.map((category) => (
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
          <div><span>Total Deposited</span><strong>{money(record.totals.paid)}</strong></div>
          <div className={styles.totalDue}><span>Grand Total Due</span><strong>{money(record.totals.due)}</strong></div>
        </section>

        <p className={styles.notice}>This page verifies the billing snapshot encoded in the printed statement. Later payments or billing changes may produce a newer verified statement with different balances.</p>

        <footer>
          <strong>LAND VIEW — Engineers and Architects</strong>
          <span>Feni Sadar, Feni, Bangladesh · www.landview.com.bd</span>
        </footer>
      </section>
    </main>
  );
}
