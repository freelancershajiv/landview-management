import Link from "next/link";
import { verifyProjectVerification } from "@/lib/billing-verification";
import styles from "./verify.module.css";

export const dynamic = "force-dynamic";

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

type LiveBilling = {
  fileId: string;
  clientName: string;
  status: string;
  categories: Array<{ name: string; gross: number; discount: number; paid: number; due: number }>;
  totals: { gross: number; discount: number; paid: number; due: number };
  lastPaymentDate: string;
  updatedAt: string;
};

async function loadLiveBilling(fileId: string): Promise<LiveBilling> {
  const url = process.env.LAND_VIEW_API_URL || "";
  const proxySecret = process.env.LAND_VIEW_PROXY_SECRET || "";
  if (!url || !proxySecret) throw new Error("Verification service is not configured.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "getPublicBillingVerification", fileId, proxySecret }),
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
    });
    const text = await response.text();
    let json: any;
    try { json = JSON.parse(text); } catch { throw new Error("Verification service returned an invalid response."); }
    if (!response.ok || !json?.success || !json?.data) {
      throw new Error(json?.error || "Current billing record could not be loaded.");
    }
    return json.data as LiveBilling;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function VerifyBillingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const verified = verifyProjectVerification(decodeURIComponent(token || ""));

  if (!verified) {
    return (
      <main className={styles.shell}>
        <section className={styles.card}>
          <div className={styles.brand}>LAND <span>VIEW</span></div>
          <div className={styles.invalidIcon}>!</div>
          <h1>Verification failed</h1>
          <p>This project verification QR is invalid or has been altered.</p>
          <Link href="https://www.landview.com.bd">Visit LAND VIEW</Link>
        </section>
      </main>
    );
  }

  let record: LiveBilling;
  try {
    record = await loadLiveBilling(verified.fileId);
  } catch (error: any) {
    return (
      <main className={styles.shell}>
        <section className={styles.card}>
          <div className={styles.brand}>LAND <span>VIEW</span></div>
          <div className={styles.invalidIcon}>!</div>
          <h1>Live billing temporarily unavailable</h1>
          <p>{error?.message || "The current billing record could not be loaded. Please try again shortly."}</p>
          <p>The QR itself is valid for <strong>{verified.fileId}</strong>.</p>
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
          <div className={styles.verified}><b>✓</b><span>LIVE & VERIFIED</span></div>
        </header>

        <div className={styles.rule} />

        <section className={styles.hero}>
          <span>OFFICIAL LIVE PROJECT BILLING</span>
          <h1>{record.fileId}</h1>
          <p>This permanent project QR always shows the latest billing balance stored by LAND VIEW, regardless of which invoice it was printed on.</p>
        </section>

        <section className={styles.meta}>
          <div><span>Client</span><strong>{record.clientName || "—"}</strong></div>
          <div><span>Last Payment</span><strong>{displayDate(record.lastPaymentDate)}</strong></div>
          <div><span>Last Checked</span><strong>{displayDateTime(record.updatedAt)}</strong></div>
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

        <p className={styles.notice}>Public read-only live billing verification. New bills, discounts and payments are reflected here automatically; scanning this QR cannot edit any LAND VIEW record.</p>

        <footer>
          <strong>LAND VIEW — Engineers and Architects</strong>
          <span>Feni Sadar, Feni, Bangladesh · www.landview.com.bd</span>
        </footer>
      </section>
    </main>
  );
}
