"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { landViewApi, type FinanceSheetData } from "@/lib/api";
import {
  buildSheetInvoices,
  invoiceTabs,
  normalizeFileId,
  type SheetInvoices,
} from "@/lib/sheet-invoices";
import styles from "./invoice.module.css";

const money = (value: number) =>
  new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(value);

function statementDate() {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", year: "numeric" }).format(new Date());
}

async function loadFinanceTabs() {
  const results: FinanceSheetData[] = new Array(invoiceTabs.length);
  let cursor = 0;
  async function worker() {
    while (cursor < invoiceTabs.length) {
      const index = cursor++;
      results[index] = await landViewApi.getFinanceSheet(invoiceTabs[index]);
    }
  }
  await Promise.all(Array.from({ length: 3 }, () => worker()));
  return results;
}

export default function ProjectBillingPage() {
  const [fileId, setFileId] = useState("");
  const [result, setResult] = useState<SheetInvoices | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState("");
  const [verificationUrl, setVerificationUrl] = useState("");
  const [verificationError, setVerificationError] = useState("");
  const request = useRef(0);

  async function createVerification(billing: SheetInvoices, version: number) {
    try {
      const response = await fetch("/api/billing-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: billing.id }),
      });
      const json = await response.json();
      if (!response.ok || !json?.success || !json?.url) throw new Error(json?.error || "Could not create verification link.");
      if (request.current === version) setVerificationUrl(String(json.url));
    } catch (err) {
      if (request.current === version) setVerificationError(err instanceof Error ? err.message : "Could not create verification link.");
    }
  }

  async function load(event: FormEvent) {
    event.preventDefault();
    const id = normalizeFileId(fileId);
    if (!id) return setError("Enter a File ID such as 209 or LV-209.");
    const version = ++request.current;
    setBusy(true); setError(""); setResult(null); setVerificationUrl(""); setVerificationError("");
    try {
      const billing = buildSheetInvoices(await loadFinanceTabs(), id);
      if (version === request.current) {
        setResult(billing);
        setGenerated(statementDate());
        void createVerification(billing, version);
      }
    } catch (err) {
      if (version === request.current) setError(err instanceof Error ? err.message : "Could not load project billing.");
    } finally {
      if (version === request.current) setBusy(false);
    }
  }

  const qrUrl = verificationUrl ? `/api/billing-verification/qr?data=${encodeURIComponent(verificationUrl)}` : "";

  const renderTable = (category: SheetInvoices["invoices"][number], type: "bill" | "deposit") => {
    if (type === "bill") {
      if (!category.items.length) return <p className={styles.empty}>No bill records.</p>;
      return <div className={styles.tableWrap}><table><thead><tr><th>SL.</th><th>Description</th><th>Rate</th><th>Qty.</th><th>Amount</th></tr></thead><tbody>{category.items.map((item,index)=><tr key={index}><td>{index+1}</td><td>{item.service||"—"}</td><td>{item.price||"—"}</td><td>{item.quantity||"—"}</td><td>{money(item.amount)}</td></tr>)}</tbody></table></div>;
    }
    if (!category.payments.length) return <p className={styles.empty}>No deposit records.</p>;
    return <div className={styles.tableWrap}><table><thead><tr><th>SL.</th><th>Date</th><th>Details</th><th>Amount</th></tr></thead><tbody>{category.payments.map((payment,index)=><tr key={index}><td>{index+1}</td><td>{payment.date||"—"}</td><td>{payment.details||"—"}</td><td>{money(payment.amount)}</td></tr>)}</tbody></table></div>;
  };

  const PrintHeader = ({ page, title }: { page: number; title: string }) => (
    <>
      <header className={styles.sheetHeader}>
        <div className={styles.sheetBrand}><strong>LAND <span>VIEW</span></strong><small>ENGINEERS AND ARCHITECTS</small><em>Building a safer tomorrow</em></div>
        <div className={styles.sheetContact}><span>Feni Sadar, Feni, Bangladesh</span><span>+88 01902 500 400</span><span>landviewcivil@gmail.com</span><span>www.landview.com.bd</span></div>
        <div className={styles.sheetTitle}><small>Page {page} of 3</small><b>Project Billing Statement</b><strong>{title}</strong></div>
      </header>
      <section className={styles.sheetClient}>
        <div>
          <span>Invoice ID</span><strong>{result?.id ? `INV-${result.id.replace("LV-", "")}` : "—"}</strong>
          <span>File ID</span><strong>{result?.id || "—"}</strong>
          <span>Client Name</span><strong>{result?.client.name || "—"}</strong>
          <span>Address</span><strong>{result?.client.address || "—"}</strong>
          <span>Phone</span><strong>{result?.client.phone || "—"}</strong>
        </div>
        <div>
          <span>Date</span><strong>{generated || "—"}</strong>
          <span>Project Type</span><strong>{result?.client.type || "—"}</strong>
          <span>Story</span><strong>{result?.client.floor || "—"}</strong>
          <span>Area</span><strong>{result?.client.area || "—"}</strong>
          <span>Status</span><strong>{result && result.totals.due > 0 ? "Partial / Due" : "Full Paid"}</strong>
        </div>
      </section>
    </>
  );

  const engineering = result?.invoices.find((c) => c.name === "Engineering") || result?.invoices[0];
  const supervision = result?.invoices.find((c) => c.name === "Supervision") || result?.invoices[1];
  const others = result?.invoices.find((c) => c.name === "Others") || result?.invoices[2];

  return (
    <div className={styles.workspace}>
      <div className={styles.header}>
        <div><Link href="/admin/finance">← Finance</Link><span className={styles.eyebrow}>LAND VIEW / ACCOUNTS</span><h1>Project Billing Lookup</h1><p>Enter a File ID to pull every bill and deposit and calculate the live balance.</p></div>
        {result && <button className={styles.printButton} type="button" onClick={() => window.print()}>Print / Save PDF</button>}
      </div>

      <form className={styles.lookup} onSubmit={load}><label htmlFor="billing-file">File ID</label><input id="billing-file" placeholder="209 or LV-209" value={fileId} onChange={(event)=>{setFileId(event.target.value);setResult(null);setError("");setVerificationUrl("");setVerificationError("");request.current++;setBusy(false);}} required autoComplete="off"/><button disabled={busy}>{busy?"Loading…":"View billing"}</button></form>
      {error && <div className={styles.error} role="alert">{error}</div>}{busy && <div className={styles.loading} role="status">Pulling bill and deposit records…</div>}

      {result && <>
        <main className={styles.report}>
          <header className={styles.printHeader}><div><strong>LAND <span>VIEW</span></strong><small>Engineers and Architects</small></div><div><h2>PROJECT BILLING STATEMENT</h2><p>Generated {generated}</p></div></header>
          <section className={styles.projectCard}><div><span>FILE ID</span><strong>{result.id}</strong></div><div><span>CLIENT</span><strong>{result.client.name||"—"}</strong><small>{result.client.phone||"—"}</small></div><div><span>PROJECT TYPE</span><strong>{result.client.type||"—"}</strong><small>{result.client.floor||"—"}</small></div><div className={styles.totalDueCard}><span>TOTAL DUE</span><strong>{money(result.totals.due)}</strong></div></section>
          <section className={styles.categoryGrid}>{result.invoices.map(category=><article className={styles.category} key={category.name}><div className={styles.categoryHeader}><div><span>{category.name.toUpperCase()}</span><h2>{category.name} Billing</h2></div><div className={category.due>0?styles.dueBadge:styles.paidBadge}>{category.due>0?"DUE":"PAID"}</div></div><div className={styles.metrics}><div><span>Bill</span><strong>{money(category.gross)}</strong></div><div><span>Discount</span><strong>{money(category.discount)}</strong></div><div><span>Deposited</span><strong>{money(category.paid)}</strong></div><div><span>Due</span><strong>{money(category.due)}</strong></div></div><div className={styles.split}><section><h3>{category.name} Bill</h3>{renderTable(category,"bill")}</section><section><h3>{category.name} Deposit</h3>{renderTable(category,"deposit")}</section></div><div className={styles.formula}><span>{money(category.gross)} − {money(category.discount)} − {money(category.paid)}</span><strong>= {money(category.due)}</strong></div></article>)}</section>
          <section className={styles.grandSummary}><div><span>Total Bill</span><strong>{money(result.totals.gross)}</strong></div><div><span>Total Discount</span><strong>{money(result.totals.discount)}</strong></div><div><span>Total Deposited</span><strong>{money(result.totals.paid)}</strong></div><div className={styles.grandDue}><span>Grand Total Due</span><strong>{money(result.totals.due)}</strong></div></section>
          <section className={styles.verificationBlock}><div><span className={styles.verificationLabel}>PROJECT QR</span><strong>{verificationUrl?"Permanent project verification":"Preparing project QR…"}</strong><p>{verificationUrl?"This same QR always opens the latest billing balance for this project.":verificationError||"A secure project verification link is being generated."}</p>{verificationUrl&&<a href={verificationUrl} target="_blank" rel="noreferrer">Open live billing ↗</a>}</div>{qrUrl&&<img className={styles.qrCode} src={qrUrl} alt={`Permanent QR code for ${result.id}`} width={132} height={132}/>}</section>
        </main>

        <section className={styles.printSheets}>
          {engineering && <article className={styles.printPage}><PrintHeader page={1} title="Engineering Bill"/><section className={styles.portraitSection}><div className={styles.sheetMain}><h2>ENGINEERING <span>BILL</span></h2>{renderTable(engineering,"bill")}<h2 className={styles.depositHeading}>ENGINEERING <span>DEPOSIT / PAYMENTS</span></h2>{renderTable(engineering,"deposit")}</div><aside className={styles.sheetSummary}><h3>ENGINEERING SUMMARY</h3><div><span>Total Bill</span><strong>{money(engineering.gross)}</strong></div><div><span>Discount</span><strong>{money(engineering.discount)}</strong></div><div><span>Total Deposit</span><strong>{money(engineering.paid)}</strong></div><div className={styles.sheetDue}><span>Due</span><strong>{money(engineering.due)}</strong></div></aside></section><footer className={styles.sheetFooter}><strong>LAND VIEW</strong><span>A SAFER BUILT ENVIRONMENT FOR A BETTER TOMORROW</span></footer></article>}

          {supervision && <article className={styles.printPage}><PrintHeader page={2} title="Supervision Bill"/><section className={styles.portraitSection}><div className={styles.sheetMain}><h2>SUPERVISION <span>BILL</span></h2>{renderTable(supervision,"bill")}<h2 className={styles.depositHeading}>SUPERVISION <span>DEPOSIT / PAYMENTS</span></h2>{renderTable(supervision,"deposit")}</div><aside className={styles.sheetSummary}><h3>SUPERVISION SUMMARY</h3><div><span>Total Bill</span><strong>{money(supervision.gross)}</strong></div><div><span>Discount</span><strong>{money(supervision.discount)}</strong></div><div><span>Total Deposit</span><strong>{money(supervision.paid)}</strong></div><div className={styles.sheetDue}><span>Due</span><strong>{money(supervision.due)}</strong></div></aside></section><footer className={styles.sheetFooter}><strong>LAND VIEW</strong><span>A SAFER BUILT ENVIRONMENT FOR A BETTER TOMORROW</span></footer></article>}

          {others && <article className={styles.printPage}><PrintHeader page={3} title="Others Bill & Summary"/><section className={styles.portraitSection}><div className={styles.sheetMain}><h2>OTHERS <span>BILL</span></h2>{renderTable(others,"bill")}<h2 className={styles.depositHeading}>OTHERS <span>DEPOSIT / PAYMENTS</span></h2>{renderTable(others,"deposit")}</div><aside className={styles.sheetSummary}><h3>OTHERS SUMMARY</h3><div><span>Total Bill</span><strong>{money(others.gross)}</strong></div><div><span>Discount</span><strong>{money(others.discount)}</strong></div><div><span>Total Deposit</span><strong>{money(others.paid)}</strong></div><div className={styles.sheetDue}><span>Others Due</span><strong>{money(others.due)}</strong></div><h3 className={styles.grandHeading}>GRAND SUMMARY</h3>{result.invoices.map(c=><div key={c.name}><span>{c.name === "Engineering" ? "Engineering" : c.name} Due</span><strong>{money(c.due)}</strong></div>)}<div className={styles.sheetGrandDue}><span>GRAND TOTAL DUE</span><strong>{money(result.totals.due)}</strong></div></aside></section><div className={styles.sheetBottom}><div className={styles.sheetThanks}>Thank you for your trust in LAND VIEW.<br/>For any query, please contact us.</div><div className={styles.sheetSignature}>Authorized Signature<br/><strong>LAND VIEW</strong></div><div className={styles.sheetQr}>{qrUrl?<img src={qrUrl} alt={`Permanent QR code for ${result.id}`} width={220} height={220}/>:<div className={styles.qrPlaceholder}>{verificationError||"Preparing QR…"}</div>}<div><strong>Scan for live billing</strong><span>Permanent project QR</span><b>{result.id}</b></div></div></div><footer className={styles.sheetFooter}><strong>LAND VIEW</strong><span>A SAFER BUILT ENVIRONMENT FOR A BETTER TOMORROW</span></footer></article>}
        </section>
      </>}
    </div>
  );
}
