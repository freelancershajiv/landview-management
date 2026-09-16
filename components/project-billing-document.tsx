"use client";

import { useMemo } from "react";
import { billingQrSvg } from "@/lib/billing-qr";
import type { SheetInvoices } from "@/lib/sheet-invoices";
import styles from "@/app/admin/finance/invoices/invoice.module.css";

const money = (value: number) =>
  new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(Number(value || 0));

const amountText = (value: unknown) => {
  const normalized = String(value ?? "").trim().replace(/BDT|Tk\.?|৳|,/gi, "").replace(/\s/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(parsed)
    : "—";
};

function isSoilTestService(value: unknown) {
  return /\bsoil\s*test\b/i.test(String(value ?? ""));
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function parseBillingDate(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) {
    const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (match) {
    let year = Number(match[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const parsed = new Date(year, Number(match[2]) - 1, Number(match[1]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function paymentDateOnly(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";

  const isoDate = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDate) return isoDate[1];

  const displayDate = raw.match(/^(\d{1,2}[/.]\d{1,2}[/.]\d{2,4})/);
  if (displayDate) return displayDate[1];

  const parsed = parseBillingDate(raw);
  if (!parsed) return raw;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

export function billingIssueDate(result: SheetInvoices) {
  const dates = result.invoices
    .flatMap((category) => category.payments)
    .map((payment) => parseBillingDate(payment.date))
    .filter((date): date is Date => Boolean(date));

  if (!dates.length) return formatDate(new Date());
  return formatDate(new Date(Math.max(...dates.map((date) => date.getTime()))));
}

export function hasBillingData(category: SheetInvoices["invoices"][number]) {
  return category.items.length > 0 ||
    category.payments.length > 0 ||
    Math.abs(Number(category.gross || 0)) > 0.009 ||
    Math.abs(Number(category.discount || 0)) > 0.009 ||
    Math.abs(Number(category.paid || 0)) > 0.009 ||
    Math.abs(Number(category.due || 0)) > 0.009;
}

export function billingVerificationSnapshot(result: SheetInvoices) {
  return {
    clientName: result.client.name || "",
    issueDate: billingIssueDate(result),
    categories: result.invoices.filter(hasBillingData).map((category) => ({
      name: category.name,
      gross: Number(category.gross || 0),
      discount: Number(category.discount || 0),
      paid: Number(category.paid || 0),
      due: Number(category.due || 0),
    })),
    totals: {
      gross: Number(result.totals.gross || 0),
      discount: Number(result.totals.discount || 0),
      paid: Number(result.totals.paid || 0),
      due: Number(result.totals.due || 0),
    },
  };
}

export function safePdfTitle(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._ -]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "LAND-VIEW-Project-Billing-Statement";
}

let billingPrintPending = false;

export async function printBillingPdf(result: SheetInvoices) {
  if (billingPrintPending) return false;
  const root = Array.from(document.querySelectorAll<HTMLElement>("[data-billing-id]"))
    .find((element) => element.dataset.billingId === result.id);
  if (!root) return false;
  const qrImage = root.querySelector<HTMLImageElement>("img[data-billing-qr]");
  if (/^LV-\d+$/.test(result.id) && !qrImage) {
    window.alert("The invoice QR is not ready. Wait for verification to finish, or reload the billing statement and try again.");
    return false;
  }

  billingPrintPending = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const qrSource = qrImage?.src;
  try {
    await Promise.race([
      Promise.all(Array.from(root.querySelectorAll<HTMLImageElement>("img")).map((image) => image.decode())),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Invoice images did not load.")), 10000);
      }),
    ]);
    if (!root.isConnected || root.dataset.billingId !== result.id || qrImage?.src !== qrSource) return false;
  } catch {
    window.alert("The invoice images could not load. Reload the billing statement before saving the PDF.");
    return false;
  } finally {
    clearTimeout(timer);
    billingPrintPending = false;
  }
  const previousTitle = document.title;
  const displayName = result.client.name || result.id || "Project";
  const pdfTitle = safePdfTitle(`${result.id}-${displayName}-Billing-Statement`);
  let restored = false;
  const restoreTitle = () => {
    if (restored) return;
    restored = true;
    document.title = previousTitle;
    window.removeEventListener("afterprint", restoreTitle);
  };

  document.title = pdfTitle;
  window.addEventListener("afterprint", restoreTitle, { once: true });
  window.setTimeout(restoreTitle, 60000);
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      window.print();
      resolve();
    }));
  });
  return true;
}

type Props = {
  result: SheetInvoices;
  verificationUrl?: string;
  verificationError?: string;
};

export default function ProjectBillingDocument({ result, verificationUrl = "", verificationError = "" }: Props) {
  const issueDate = billingIssueDate(result);
  const qr = useMemo(() => {
    if (!verificationUrl) return { url: "", error: "" };
    try {
      return { url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(billingQrSvg(verificationUrl))}`, error: "" };
    } catch {
      return { url: "", error: "Could not generate the invoice QR. Reload the billing statement and try again." };
    }
  }, [verificationUrl]);
  const qrUrl = qr.url;
  const statementRef = `INV-${result.id.replace(/^LV-/, "")}-01`;
  const projectStatus = result.totals.due > 0 ? "Partial / Due" : "Full Paid";
  const allPayments = result.invoices.flatMap((category) => category.payments);
  const verifiedPayments = allPayments.filter((payment) => payment.verification === "Verified").length;
  const unverifiedPayments = Math.max(0, allPayments.length - verifiedPayments);
  const invoiceVerification = allPayments.length === 0
    ? "Unverified"
    : verifiedPayments === allPayments.length
      ? "Verified"
      : verifiedPayments === 0
        ? "Unverified"
        : "Partially Verified";

  const activeCategories = result.invoices.filter(hasBillingData);
  const printCategories = activeCategories.length ? activeCategories : result.invoices.slice(0, 1);
  const totalPages = printCategories.length;

  const renderTable = (category: SheetInvoices["invoices"][number], type: "bill" | "deposit") => {
    if (type === "bill") {
      if (!category.items.length) return <p className={styles.empty}>No bill records.</p>;
      return <div className={styles.tableWrap}><table className={styles.billTable}><thead><tr><th>SL.</th><th>Description</th><th>Rate (BDT)</th><th>QTY</th><th>AMOUNT (BDT)</th></tr></thead><tbody>{category.items.map((item,index)=>{const soilTest=isSoilTestService(item.service);return <tr key={index}><td>{index+1}</td><td>{item.service||"—"}</td><td>{soilTest&&item.price?amountText(item.price):""}</td><td>{soilTest&&item.quantity?item.quantity:""}</td><td className={styles.moneyCell}>{amountText(item.amount)}</td></tr>;})}</tbody></table></div>;
    }

    if (!category.payments.length) return <p className={styles.empty}>No deposit records.</p>;
    return <div className={styles.tableWrap}><table className={styles.depositTable}><thead><tr><th>SL.</th><th>Date</th><th>Details</th><th>Amount</th><th>Verification</th></tr></thead><tbody>{category.payments.map((payment,index)=><tr key={index}><td>{index+1}</td><td className={styles.dateCell}>{paymentDateOnly(payment.date)}</td><td className={styles.detailsCell}>{payment.details||"—"}</td><td className={styles.moneyCell}>{money(payment.amount)}</td><td className={styles.verificationCell}><strong className={payment.verification === "Verified" ? styles.verificationVerified : styles.verificationUnverified}>{payment.verification||"Unverified"}</strong>{payment.incomeId&&<small className={styles.verificationRef}>Ref: {payment.incomeId}</small>}</td></tr>)}</tbody></table></div>;
  };

  const PrintHeader = ({ page, title }: { page: number; title: string }) => <>
    <header className={styles.sheetHeader}>
      <div className={styles.sheetBrand}><div className={styles.sheetBrandLockup}><img className={styles.sheetBrandLogo} src="/land-view-logo.svg" alt="LAND VIEW logo"/><div className={styles.sheetBrandWords}><strong>LAND <span>VIEW</span></strong><small>ENGINEERS AND ARCHITECTS</small></div></div><em>Building a safer tomorrow</em></div>
      <div className={styles.sheetTitle}><small>Page {page} of {totalPages}</small><b>Project Billing Statement</b><strong>{title}</strong></div>
      <div className={styles.sheetHeaderQr}>{qrUrl ? <img data-billing-qr="true" className={styles.sheetHeaderQrImage} src={qrUrl} loading="eager" alt={`Verify ${result.id}`} width={96} height={96}/> : <div className={styles.sheetHeaderQrPlaceholder}>QR</div>}<small>Scan to verify</small></div>
    </header>
    <section className={styles.sheetInfoBoard}>
      <div className={styles.sheetMetaRow}><div className={styles.sheetMetaPair}><span>Invoice ID</span><strong>{statementRef}</strong></div><div className={styles.sheetMetaPair}><span>Issue Date</span><strong>{issueDate}</strong></div></div>
      <div className={styles.sheetPanelTitles}><strong>Owner Details</strong><strong>Building Details</strong></div>
      <div className={styles.sheetInfoRow}><span>File ID</span><strong>{result.id}</strong><span>Project Type</span><strong>{result.client.type || "—"}</strong></div>
      <div className={styles.sheetInfoRow}><span>Name</span><strong>{result.client.name || "—"}</strong><span>Floor/Story</span><strong>{result.client.floor || "—"}</strong></div>
      <div className={styles.sheetInfoRow}><span>Address</span><strong>{result.client.address || "—"}</strong><span>Land Area</span><strong>{result.client.area || "—"}</strong></div>
      <div className={styles.sheetInfoRow}><span>Contact</span><strong>{result.client.phone || "—"}</strong><span>Status</span><strong>{projectStatus}</strong></div>
      <div className={styles.sheetInfoRow}><span>Verification</span><strong className={invoiceVerification === "Verified" ? styles.statusVerified : invoiceVerification === "Partially Verified" ? styles.statusPartial : styles.statusUnverified}>{invoiceVerification}</strong><span>Receipts</span><strong>Verified: {verifiedPayments}/{allPayments.length}{unverifiedPayments > 0 ? ` · Pending: ${unverifiedPayments}` : ""}</strong></div>
    </section>
  </>;

  return <div data-billing-id={result.id}>
    <main className={styles.report}>
      <header className={styles.printHeader}><div><strong>LAND <span>VIEW</span></strong><small>Engineers and Architects</small></div><div><h2>PROJECT BILLING STATEMENT</h2><p>Issue date {issueDate}</p></div></header>
      <section className={styles.projectCard}><div><span>FILE ID</span><strong>{result.id}</strong></div><div><span>CLIENT</span><strong>{result.client.name||"—"}</strong><small>{result.client.phone||"—"}</small></div><div><span>PROJECT TYPE</span><strong>{result.client.type||"—"}</strong><small>{result.client.floor||"—"}</small></div><div className={styles.totalDueCard}><span>TOTAL DUE (BDT)</span><strong>{amountText(result.totals.due)}</strong></div></section>
      <section className={styles.categoryGrid}>{activeCategories.map(category=><article className={styles.category} key={category.name}><div className={styles.categoryHeader}><div><span>{category.name.toUpperCase()}</span><h2>{category.name} Billing</h2></div><div className={category.due>0?styles.dueBadge:styles.paidBadge}>{category.due>0?"DUE":"PAID"}</div></div><div className={styles.metrics}><div><span>Bill (BDT)</span><strong>{amountText(category.gross)}</strong></div><div><span>Discount (BDT)</span><strong>{amountText(category.discount)}</strong></div><div><span>Deposited (BDT)</span><strong>{amountText(category.paid)}</strong></div><div><span>Due (BDT)</span><strong>{amountText(category.due)}</strong></div></div><div className={styles.split}><section><h3>{category.name} Bill</h3>{renderTable(category,"bill")}</section><section><h3>{category.name} Deposit</h3>{renderTable(category,"deposit")}</section></div><div className={styles.formula}><span>{amountText(category.gross)} − {amountText(category.discount)} − {amountText(category.paid)}</span><strong>= {amountText(category.due)}</strong></div></article>)}</section>
      <section className={styles.grandSummary}><div><span>Total Bill (BDT)</span><strong>{amountText(result.totals.gross)}</strong></div><div><span>Total Discount (BDT)</span><strong>{amountText(result.totals.discount)}</strong></div><div><span>Total Deposit (BDT)</span><strong>{amountText(result.totals.paid)}</strong></div><div className={styles.grandDue}><span>Grand Total Due (BDT)</span><strong>{amountText(result.totals.due)}</strong></div></section>
      <section className={styles.verificationBlock}><div><span className={styles.verificationLabel}>PROJECT QR</span><strong>{qr.error || verificationError ? "QR unavailable" : verificationUrl ? "Live billing verification" : "Preparing project QR…"}</strong><p>{qr.error || verificationError || (verificationUrl ? "Scan this QR to view the project’s current billing and payment verification." : "A secure project verification link is being generated.")}</p>{verificationUrl&&<a href={verificationUrl} target="_blank" rel="noreferrer">Open billing verification ↗</a>}</div>{qrUrl&&<img data-billing-qr="true" className={styles.qrCode} src={qrUrl} loading="eager" alt={`Billing QR for ${result.id}`} width={132} height={132}/>}</section>
    </main>

    <section className={styles.printSheets}>
      {printCategories.map((category, index) => {
        const last = index === printCategories.length - 1;
        return <article className={styles.printPage} key={category.name}>
          <PrintHeader page={index + 1} title={`${category.name} Bill`}/>
          <section className={styles.portraitSection}>
            <div className={styles.sheetMain}><h2>{category.name.toUpperCase()} <span>BILL</span></h2>{renderTable(category,"bill")}<h2 className={styles.depositHeading}>{category.name.toUpperCase()} <span>DEPOSIT / PAYMENTS</span></h2>{renderTable(category,"deposit")}</div>
            <aside className={styles.sheetSummary}><h3>{category.name.toUpperCase()} SUMMARY</h3><div><span>Total Bill (BDT)</span><strong>{amountText(category.gross)}</strong></div><div><span>Discount (BDT)</span><strong>{amountText(category.discount)}</strong></div><div><span>Total Deposit (BDT)</span><strong>{amountText(category.paid)}</strong></div><div className={styles.sheetDue}><span>Due (BDT)</span><strong>{amountText(category.due)}</strong></div></aside>
          </section>
          <footer className={styles.sheetFooter}><strong>LAND VIEW</strong><span>{last ? `Grand Total Due (BDT): ${amountText(result.totals.due)} · ` : ""}Feni Sadar, Feni · +88 01902 500 400 · landviewcivil@gmail.com · www.landview.com.bd</span></footer>
        </article>;
      })}
    </section>
  </div>;
}
