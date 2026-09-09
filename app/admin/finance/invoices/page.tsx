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
  if (name.toLowerCase() === "design") return "Design & Engineering Invoice";
  if (name.toLowerCase() === "supervision") return "Supervision Invoice";
  return "Other Services Invoice";
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
              <img src="/land-view-logo.png" alt="LAND VIEW" />
              <div>
                <h2>LAND VIEW</h2>
                <p>Engineers and Architects</p>
              </div>
            </div>
            <div className={styles.invoiceHeading}>
              <strong>INVOICE</strong>
              <span>{invoiceTitle(invoice.name)}</span>
            </div>
          </header>

          <div className={styles.rule} />

          <section className={styles.metaGrid}>
            <div>
              <small>FILE ID</small>
              <strong>{result.id}</strong>
            </div>
            <div>
              <small>ISSUE DATE</small>
              <strong>{issued}</strong>
            </div>
            <div>
              <small>STATUS</small>
              <strong className={invoice.due > 0 ? styles.due : styles.paid}>{invoice.due > 0 ? "DUE" : "PAID"}</strong>
            </div>
          </section>

          <section className={styles.detailsGrid}>
            <div className={styles.detailCard}>
              <small>BILL TO</small>
              <h3>{result.client.name || "—"}</h3>
              <p>{result.client.address || "—"}</p>
              <p>{result.client.phone || "—"}</p>
            </div>
            <div className={styles.detailCard}>
              <small>PROJECT DETAILS</small>
              <dl>
                <div><dt>Floor / Story</dt><dd>{result.client.floor || "—"}</dd></div>
                <div><dt>Building Type</dt><dd>{result.client.type || "—"}</dd></div>
                <div><dt>Land Area</dt><dd>{result.client.area || "—"}</dd></div>
              </dl>
            </div>
          </section>

          <table className={styles.serviceTable}>
            <thead>
              <tr><th>#</th><th>Service Description</th><th>Rate</th><th>Qty</th><th>Amount</th></tr>
            </thead>
            <tbody>
              {invoice.items.length ? invoice.items.map((item, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td>{item.service || "—"}</td>
                  <td>{item.price || "—"}</td>
                  <td>{item.quantity || "—"}</td>
                  <td>৳ {money(item.amount)}</td>
                </tr>
              )) : <tr><td colSpan={5} className={styles.emptyRow}>No service items found.</td></tr>}
            </tbody>
          </table>

          <section className={styles.bottomGrid}>
            <div className={styles.notes}>
              <small>AMOUNT IN WORDS</small>
              <p>{takaWords(invoice.due)}</p>
              <span>This invoice is electronically generated.</span>
            </div>

            <div className={styles.totals}>
              <div><span>Bill Amount</span><strong>৳ {money(invoice.gross)}</strong></div>
              <div><span>Discount</span><strong>{invoice.discount ? `− ৳ ${money(invoice.discount)}` : "—"}</strong></div>
              <div><span>Deposited</span><strong>{invoice.paid ? `− ৳ ${money(invoice.paid)}` : "—"}</strong></div>
              <div className={styles.grandTotal}><span>{invoice.due > 0 ? "Total Due" : "Balance"}</span><strong>৳ {money(invoice.due)}</strong></div>
            </div>
          </section>

          <section className={styles.signatureRow}>
            <div>
              <span>Thank you for choosing LAND VIEW.</span>
            </div>
            <div className={styles.signatureLine}>Authorized Signature</div>
          </section>

          <footer className={styles.invoiceFooter}>
            <strong>LAND VIEW — Engineers and Architects</strong>
            <span>F. Rahman AC Market (2nd Floor), S.S.K Road, Feni Sadar, Feni-3900, Bangladesh</span>
            <span>landviewcivil@gmail.com · +88 01902 500 400 · +88 0140 8080 400</span>
          </footer>
        </article>
      )}
    </div>
  );
}
