import type { Metadata } from "next";
import PublicInvoiceActions from "@/components/public-invoice-actions";
import { verifyProjectVerification } from "@/lib/billing-verification";
import { loadPublicBillingVerification } from "@/lib/public-billing-verification";
import styles from "../verify.module.css";

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

export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const decodedToken = decodeURIComponent(token || "");
  const verified = verifyProjectVerification(decodedToken);

  if (!verified) {
    return (
      <main className={styles.shell}>
        <section className={styles.card}>
          <div className={styles.brand}>LAND <span>VIEW</span></div>
          <div className={styles.invalidIcon}>!</div>
          <h1>Invoice verification failed</h1>
          <p>This invoice QR is invalid or has been altered.</p>
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
          <h1>Live invoice temporarily unavailable</h1>
          <p>{error?.message || "The current invoice could not be loaded."}</p>
          <p>The QR itself is valid for <strong>{verified.fileId}</strong>.</p>
        </section>
      </main>
    );
  }

  const activeCategories = record.categories.filter(
    (category) => category.items.length || category.payments.length || Math.abs(category.gross) > 0.009 || Math.abs(category.paid) > 0.009,
  );
  const summaryUrl = `/verify/${encodeURIComponent(decodedToken)}`;

  return (
    <main className={`${styles.shell} ${styles.invoiceShell}`}>
      <div className={styles.invoiceActionBar}>
        <PublicInvoiceActions summaryUrl={summaryUrl} />
      </div>

      <article className={`${styles.card} ${styles.invoiceCard}`}>
        <header className={styles.header}>
          <div>
            <div className={styles.brand}>LAND <span>VIEW</span></div>
            <small>Engineers and Architects</small>
          </div>
          <div className={styles.verified}><b>✓</b><span>LIVE & VERIFIED</span></div>
        </header>

        <div className={styles.rule} />

        <section className={styles.invoiceTitle}>
          <div>
            <span>PROJECT BILLING STATEMENT</span>
            <h1>{record.invoiceId}</h1>
          </div>
          <div className={record.status === "FULL PAID" ? styles.invoicePaidStamp : styles.invoiceDueStamp}>{record.status}</div>
        </section>

        <section className={styles.invoiceInfoGrid}>
          <div><span>File / Project ID</span><strong>{record.fileId}</strong></div>
          <div><span>Invoice Date</span><strong>{displayDate(record.invoiceDate)}</strong></div>
          <div><span>Client</span><strong>{record.clientName || "—"}</strong></div>
          <div><span>Project</span><strong>{record.projectName || record.projectType || "—"}</strong></div>
          <div><span>Project Type</span><strong>{record.projectType || "—"}</strong></div>
          <div><span>Floor / Story</span><strong>{record.floors || "—"}</strong></div>
          <div className={styles.invoiceWide}><span>Address</span><strong>{record.address || "—"}</strong></div>
          <div><span>Contact</span><strong>{record.phone || "—"}</strong></div>
        </section>

        {activeCategories.map((category) => (
          <section className={styles.invoiceSection} key={category.name}>
            <header className={styles.invoiceSectionHeader}>
              <div><span>Service Category</span><h2>{category.name}</h2></div>
              <strong>{category.due > 0.009 ? `${money(category.due)} due` : "Paid"}</strong>
            </header>

            <h3>Bill Items</h3>
            {category.items.length ? (
              <div className={styles.invoiceTableWrap}>
                <table className={styles.invoiceTable}>
                  <thead><tr><th>Date</th><th>Description</th><th>Bill Ref.</th><th>Rate</th><th>Qty</th><th>Bill</th><th>Discount</th><th>Net</th></tr></thead>
                  <tbody>
                    {category.items.map((item, index) => (
                      <tr key={`${item.billId}-${index}`}>
                        <td>{displayDate(item.date)}</td>
                        <td>{item.description || "—"}</td>
                        <td>{item.billId || "—"}</td>
                        <td>{item.rate ? money(item.rate) : "—"}</td>
                        <td>{item.quantity || "—"}</td>
                        <td>{money(item.amount)}</td>
                        <td>{money(item.discount)}</td>
                        <td><strong>{money(item.net)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className={styles.invoiceEmpty}>No individual bill items are recorded in this category.</p>}

            <h3>Payment History</h3>
            {category.payments.length ? (
              <div className={styles.invoiceTableWrap}>
                <table className={styles.invoiceTable}>
                  <thead><tr><th>Date</th><th>Payment Ref.</th><th>Method</th><th>Reference</th><th>Status</th><th>Amount</th></tr></thead>
                  <tbody>
                    {category.payments.map((payment, index) => (
                      <tr key={`${payment.paymentId}-${index}`}>
                        <td>{displayDate(payment.date)}</td>
                        <td>{payment.paymentId || "—"}</td>
                        <td>{payment.method || "—"}</td>
                        <td>{payment.reference || "—"}</td>
                        <td>{payment.status || "Approved"}</td>
                        <td><strong>{money(payment.amount)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className={styles.invoiceEmpty}>No deposits are recorded in this category.</p>}

            <div className={styles.invoiceCategoryTotals}>
              <div><span>Bill</span><strong>{money(category.gross)}</strong></div>
              <div><span>Discount</span><strong>{money(category.discount)}</strong></div>
              <div><span>Deposited</span><strong>{money(category.paid)}</strong></div>
              <div><span>Due</span><strong>{money(category.due)}</strong></div>
            </div>
          </section>
        ))}

        <section className={styles.invoiceGrandTotals}>
          <div><span>Total Bill</span><strong>{money(record.totals.gross)}</strong></div>
          <div><span>Total Discount</span><strong>{money(record.totals.discount)}</strong></div>
          <div><span>Total Paid</span><strong>{money(record.totals.paid)}</strong></div>
          <div className={styles.invoiceGrandDue}><span>Current Due</span><strong>{money(record.totals.due)}</strong></div>
        </section>

        <p className={styles.notice}>This is a live, read-only LAND VIEW billing statement. The printed QR remains the same; approved bills, discounts and payments update the figures shown here automatically.</p>

        <footer>
          <strong>LAND VIEW — Engineers and Architects</strong>
          <span>Feni Sadar, Feni, Bangladesh · www.landview.com.bd</span>
        </footer>
      </article>
    </main>
  );
}
