"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { landViewApi } from "@/lib/api";
import {
  buildSheetInvoices,
  invoiceTabs,
  normalizeFileId,
  type SheetInvoices,
} from "@/lib/sheet-invoices";
import styles from "./invoice.module.css";

const money = (value: number) =>
  new Intl.NumberFormat("en-BD", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(value));

function issueDate() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date());
}

const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function underHundred(value: number) {
  if (value < 20) return ones[value];
  return `${tens[Math.floor(value / 10)]}${value % 10 ? ` ${ones[value % 10]}` : ""}`;
}

function underThousand(value: number) {
  const hundred = Math.floor(value / 100);
  const rest = value % 100;
  return `${hundred ? `${ones[hundred]} Hundred` : ""}${hundred && rest ? " " : ""}${rest ? underHundred(rest) : ""}`;
}

function takaWords(input: number) {
  let value = Math.max(0, Math.round(Math.abs(input)));
  if (!value) return "Zero Taka Only";
  const parts: string[] = [];
  const crore = Math.floor(value / 10000000);
  if (crore) { parts.push(`${underThousand(crore)} Crore`); value %= 10000000; }
  const lakh = Math.floor(value / 100000);
  if (lakh) { parts.push(`${underThousand(lakh)} Lakh`); value %= 100000; }
  const thousand = Math.floor(value / 1000);
  if (thousand) { parts.push(`${underThousand(thousand)} Thousand`); value %= 1000; }
  if (value) parts.push(underThousand(value));
  return `${parts.join(" ")} Taka Only`;
}

function invoiceTitle(name: string) {
  if (name.toLowerCase() === "design") return "Design & Engineering";
  if (name.toLowerCase() === "supervision") return "Supervision";
  return "Other Services";
}

export default function InvoicePage() {
  const [fileId, setFileId] = useState("");
  const [result, setResult] = useState<SheetInvoices | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(0);
  const [issued, setIssued] = useState("");
  const request = useRef(0);

  async function load(event: FormEvent) {
    event.preventDefault();
    const id = normalizeFileId(fileId);
    if (!id) {
      setError("Enter a File ID such as 209 or LV-209.");
      return;
    }

    const version = ++request.current;
    setBusy(true);
    setError("");
    setResult(null);

    try {
      const sheets = await Promise.all(invoiceTabs.map((tab) => landViewApi.getFinanceSheet(tab)));
      const invoices = buildSheetInvoices(sheets, id);
      if (version === request.current) {
        setResult(invoices);
        setIssued(issueDate());
        setSelected(0);
      }
    } catch (err) {
      if (version === request.current) setError(err instanceof Error ? err.message : "Could not load invoices.");
    } finally {
      if (version === request.current) setBusy(false);
    }
  }

  const invoice = result?.invoices[selected];
  const numericId = result?.id.replace(/\D/g, "") || "000";
  const invoiceNo = invoice ? `INV-${numericId}-${String(selected + 1).padStart(2, "0")}` : "";

  return (
    <div className={styles.workspace}>
      <div className={styles.controls}>
        <div className={styles.controlTop}>
          <div>
            <Link href="/admin/finance">← Finance</Link>
            <h1>Invoice</h1>
          </div>
          {result && <button className={styles.printButton} type="button" onClick={() => window.print()}>Print / Save PDF</button>}
        </div>

        <form onSubmit={load}>
          <label htmlFor="invoice-file">File ID</label>
          <input id="invoice-file" placeholder="209 or LV-209" value={fileId} onChange={(event) => { setFileId(event.target.value); setResult(null); setError(""); request.current++; setBusy(false); }} required autoComplete="off" />
          <button disabled={busy}>{busy ? "Loading…" : "Load invoice"}</button>
        </form>

        {error && <p role="alert">{error}</p>}
        {busy && <p role="status">Loading billing information…</p>}

        {result && (
          <nav aria-label="Invoice type">
            {result.invoices.map((item, index) => (
              <button key={item.name} type="button" aria-pressed={selected === index} onClick={() => setSelected(index)}>
                {item.name} · ৳{money(item.due)}
              </button>
            ))}
          </nav>
        )}
      </div>

      {result && invoice && (
        <article className={styles.paper}>
          <header className={styles.invoiceHeader}>
            <div className={styles.brand}>
              <div>
                <h2>LAND <span>VIEW</span></h2>
                <p>Engineers and Architects</p>
                <small>Building a safer tomorrow</small>
              </div>
            </div>
            <div className={styles.contactBlock}>
              <span>Feni Sadar, Feni, Bangladesh</span>
              <span>+88 01902 500 400</span>
              <span>landviewcivil@gmail.com</span>
              <span>www.landview.com.bd</span>
            </div>
          </header>

          <div className={styles.accentRule} />

          <section className={styles.titleRow}>
            <div />
            <h1>INVOICE</h1>
          </section>

          <section className={styles.clientMeta}>
            <div className={styles.invoiceTo}>
              <small>Invoice To:</small>
              <h3>{result.client.name || "—"}</h3>
              <p>{result.client.address || "—"}</p>
              <p>{result.client.phone || "—"}</p>
            </div>
            <dl className={styles.invoiceMeta}>
              <div><dt>Invoice No</dt><dd>{invoiceNo}</dd></div>
              <div><dt>Issue Date</dt><dd>{issued}</dd></div>
              <div><dt>Project ID</dt><dd>{result.id}</dd></div>
              <div><dt>Project Type</dt><dd>{result.client.type || "—"}</dd></div>
              <div><dt>Status</dt><dd><span className={invoice.due > 0 ? styles.statusDue : styles.statusPaid}>{invoice.due > 0 ? "Due" : "Paid"}</span></dd></div>
            </dl>
          </section>

          <table className={styles.serviceTable}>
            <thead>
              <tr><th>SL.</th><th>Service Description</th><th>Rate (BDT)</th><th>Qty.</th><th>Total (BDT)</th></tr>
            </thead>
            <tbody>
              {invoice.items.length ? invoice.items.map((item, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td>{item.service || "—"}</td>
                  <td>{item.price ? money(Number(item.price) || 0) : "—"}</td>
                  <td>{item.quantity || "—"}</td>
                  <td>{money(item.amount)}</td>
                </tr>
              )) : <tr><td colSpan={5} className={styles.emptyRow}>No service items found.</td></tr>}
            </tbody>
          </table>

          <section className={styles.summaryGrid}>
            <div className={styles.leftSummary}>
              <div className={styles.words}>
                <small>Amount In Words:</small>
                <strong>{takaWords(invoice.due)}</strong>
              </div>
              <p className={styles.thanks}>Thank you for your business!</p>
              <div className={styles.paymentInfo}>
                <h4>Payment Info:</h4>
                <p><span>Account Name</span><b>LAND VIEW</b></p>
                <p><span>Payment Method</span><b>Bank Transfer / Cash / bKash</b></p>
              </div>
            </div>

            <div className={styles.totals}>
              <div><span>Sub Total</span><strong>৳ {money(invoice.gross)}</strong></div>
              <div><span>Discount</span><strong>{invoice.discount ? `− ৳ ${money(invoice.discount)}` : "৳ 0"}</strong></div>
              <div><span>Deposited</span><strong>{invoice.paid ? `− ৳ ${money(invoice.paid)}` : "৳ 0"}</strong></div>
              <div className={styles.grandTotal}><span>{invoice.due > 0 ? "Total Due" : "Balance"}</span><strong>৳ {money(invoice.due)}</strong></div>
            </div>
          </section>

          <section className={styles.signatureRow}>
            <div />
            <div className={styles.signatureLine}>
              <span>Authorized Signature</span>
              <strong>LAND VIEW</strong>
            </div>
          </section>

          <footer className={styles.invoiceFooter}>
            <div className={styles.footerRule} />
            <strong>DESIGN&nbsp;&nbsp;|&nbsp;&nbsp;DRAWING&nbsp;&nbsp;|&nbsp;&nbsp;SUPERVISION</strong>
            <span>A SAFER BUILT ENVIRONMENT FOR A BETTER TOMORROW</span>
          </footer>
        </article>
      )}
    </div>
  );
}
