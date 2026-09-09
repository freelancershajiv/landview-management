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
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).formatToParts(new Date());
  const day = parts.find((part) => part.type === "day")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const year = parts.find((part) => part.type === "year")?.value || "";
  return `${day}-${month}-${year}`;
}

const ones = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
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
  if (crore) {
    parts.push(`${underThousand(crore)} Crore`);
    value %= 10000000;
  }
  const lakh = Math.floor(value / 100000);
  if (lakh) {
    parts.push(`${underThousand(lakh)} Lakh`);
    value %= 100000;
  }
  const thousand = Math.floor(value / 1000);
  if (thousand) {
    parts.push(`${underThousand(thousand)} Thousand`);
    value %= 1000;
  }
  if (value) parts.push(underThousand(value));
  return `${parts.join(" ")} Taka Only`;
}

function invoiceLabel(name: string) {
  if (name.toLowerCase() === "design") return "ENGINEERING BILL";
  if (name.toLowerCase() === "supervision") return "SUPERVISION BILL";
  return "OTHERS BILL";
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
      const sheets = await Promise.all(
        invoiceTabs.map((tab) => landViewApi.getFinanceSheet(tab))
      );
      const invoices = buildSheetInvoices(sheets, id);
      if (version === request.current) {
        setResult(invoices);
        setIssued(issueDate());
        setSelected(0);
      }
    } catch (err) {
      if (version === request.current) {
        setError(err instanceof Error ? err.message : "Could not load invoices.");
      }
    } finally {
      if (version === request.current) setBusy(false);
    }
  }

  const invoice = result?.invoices[selected];
  const rows = invoice
    ? Array.from({ length: Math.max(14, invoice.items.length) }, (_, index) =>
        invoice.items[index] || null
      )
    : [];

  return (
    <div className={styles.workspace}>
      <div className={styles.controls}>
        <Link href="/admin/finance">← Finance</Link>
        <h1>Invoices</h1>
        <form onSubmit={load}>
          <label htmlFor="invoice-file">File ID</label>
          <input
            id="invoice-file"
            placeholder="209 or LV-209"
            value={fileId}
            onChange={(event) => {
              setFileId(event.target.value);
              setResult(null);
              setError("");
              request.current++;
              setBusy(false);
            }}
            required
            autoComplete="off"
          />
          <button disabled={busy}>{busy ? "Loading…" : "Load invoices"}</button>
        </form>

        {error && <p role="alert">{error}</p>}
        {busy && <p role="status">Loading bills and deposits…</p>}
        {!result && !busy && !error && (
          <p>Enter a File ID to prepare the LAND VIEW invoice.</p>
        )}

        {result && (
          <nav aria-label="Invoice type">
            {result.invoices.map((item, index) => (
              <button
                key={item.name}
                type="button"
                aria-pressed={selected === index}
                onClick={() => setSelected(index)}
              >
                {item.name} · ৳{money(item.due)}
              </button>
            ))}
            <button type="button" className={styles.printButton} onClick={() => window.print()}>
              Print / Save as PDF
            </button>
          </nav>
        )}
      </div>

      {result && invoice && (
        <article className={styles.paper}>
          <header className={styles.invoiceHeader}>
            <div className={styles.logoPanel}>
              <img src="/land-view-logo.png" alt="LAND VIEW" />
            </div>
            <div className={styles.headerStripe} aria-hidden="true" />
            <div className={styles.titlePanel}>
              <h2>INVOICE</h2>
              <div className={styles.wordmark}>L@ND VIEW</div>
              <p>BUILDING DESIGN &amp; ARCHITECTURE</p>
              <div className={styles.billRibbon}>{invoiceLabel(invoice.name)}</div>
            </div>
          </header>

          <section className={styles.idRow}>
            <strong>File ID:</strong>
            <span>{result.id}</span>
            <strong>Issue Date</strong>
            <span>{issued}</span>
          </section>

          <section className={styles.detailTable}>
            <div className={styles.detailHeading}>Owner Details</div>
            <div className={styles.detailHeading}>Building Details</div>

            <div className={styles.ownerDetails}>
              <div><b>Name:</b><span>{result.client.name || "—"}</span></div>
              <div><b>Address:</b><span>{result.client.address || "—"}</span></div>
              <div><b>Contact:</b><span>{result.client.phone || "—"}</span></div>
            </div>

            <div className={styles.buildingDetails}>
              <div><b>Floor/Story</b><span>{result.client.floor || "—"}</span></div>
              <div><b>Build Type:</b><span>{result.client.type || "—"}</span></div>
              <div><b>Land Area:</b><span>{result.client.area || "—"}</span></div>
            </div>
          </section>

          <table className={styles.serviceTable}>
            <colgroup>
              <col className={styles.colSl} />
              <col className={styles.colService} />
              <col className={styles.colPrice} />
              <col className={styles.colQty} />
              <col className={styles.colAmount} />
            </colgroup>
            <thead>
              <tr>
                <th>SL No.</th>
                <th>Engineering Services</th>
                <th>Price</th>
                <th>Qty</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item, index) => (
                <tr key={index}>
                  <td>{item ? index + 1 : ""}</td>
                  <td>{item?.service || "-"}</td>
                  <td>{item?.price || "-"}</td>
                  <td>{item?.quantity || "-"}</td>
                  <td>{item ? money(item.amount) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <section className={styles.summaryArea}>
            <div className={styles.wordsPanel}>
              <div className={styles.wordsTop}>
                <strong>Total Due<br />in Words:</strong>
                <span>{takaWords(invoice.due)}</span>
              </div>
              <div className={styles.generatedNote}>
                Electrically Generated Invoice No<br />Signature Required!
              </div>
            </div>

            <div className={styles.totalPanel}>
              <div><b>BILL AMOUNT</b><strong>{money(invoice.gross)}</strong></div>
              <div><b>DISCOUNT&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;(-)</b><strong>{invoice.discount ? money(invoice.discount) : "-"}</strong></div>
              <div><b>DEPOSITED&nbsp;&nbsp;&nbsp;&nbsp;(-)</b><strong>{invoice.paid ? money(invoice.paid) : "-"}</strong></div>
              <div><b>{invoice.due > 0 ? "TOTAL DUE" : "BILL PAID"}</b><strong>{invoice.due > 0 ? money(invoice.due) : "-"}</strong></div>
            </div>
          </section>

          <div className={styles.signature}>(Author Signature)</div>

          <footer className={styles.invoiceFooter}>
            <div className={styles.footerLeft}>
              <strong>Thanks for your business!</strong>
              <span>F.Rahman AC Market (2nd Floor),</span>
              <span>S.S.K Road, Feni Sadar, Feni-3900, Bangladesh</span>
            </div>
            <div className={styles.footerRight}>
              <span>E-mail: landviewcivil@gmail.com</span>
              <span>Contact (Engr. Rony): +88 0140 8080 400</span>
              <span>Arch. Shajiv: +88 01902 500 400</span>
            </div>
          </footer>
        </article>
      )}
    </div>
  );
}
