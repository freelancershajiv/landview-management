"use client";

import { useMemo } from "react";
import { billingQrSvg } from "@/lib/billing-qr";
import type { SheetInvoices } from "@/lib/sheet-invoices";
import styles from "@/app/admin/finance/invoices/invoice.module.css";
import OriginalProjectBillingDocument, {
  billingIssueDate,
  hasBillingData,
} from "./project-billing-document";

export * from "./project-billing-document";

type Props = {
  result: SheetInvoices;
  verificationUrl?: string;
  verificationError?: string;
};

const amountText = (value: unknown) => {
  const normalized = String(value ?? "")
    .trim()
    .replace(/BDT|Tk\.?|৳|,/gi, "")
    .replace(/\s/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed)
    ? new Intl.NumberFormat("en-BD", { maximumFractionDigits: 0 }).format(parsed)
    : "—";
};

function parseDate(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function belowThousand(value: number) {
  let n = Math.max(0, Math.floor(value));
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)]);
    if (n % 10) parts.push(ONES[n % 10]);
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(" ");
}

function integerWords(value: number): string {
  let n = Math.max(0, Math.floor(value));
  if (n === 0) return "Zero";
  const parts: string[] = [];

  if (n >= 10000000) {
    const crores = Math.floor(n / 10000000);
    parts.push(`${integerWords(crores)} Crore`);
    n %= 10000000;
  }
  if (n >= 100000) {
    parts.push(`${belowThousand(Math.floor(n / 100000))} Lakh`);
    n %= 100000;
  }
  if (n >= 1000) {
    parts.push(`${belowThousand(Math.floor(n / 1000))} Thousand`);
    n %= 1000;
  }
  if (n > 0) parts.push(belowThousand(n));
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function amountInWords(value: number) {
  return `${integerWords(Math.max(0, Math.round(value)))} Taka Only`;
}

function isSoilTestService(value: unknown) {
  return /\bsoil\s*test\b/i.test(String(value ?? ""));
}

export default function ProjectBillingDocumentRevamp({
  result,
  verificationUrl = "",
  verificationError = "",
}: Props) {
  const issueDate = billingIssueDate(result);
  const qrUrl = useMemo(() => {
    if (!verificationUrl) return "";
    try {
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(billingQrSvg(verificationUrl))}`;
    } catch {
      return "";
    }
  }, [verificationUrl]);

  const statementRef = `INV-${result.id.replace(/^LV-/, "")}-01`;
  const projectStatus = Number(result.totals.due || 0) > 0.009 ? "Partial / Due" : "Full Paid";
  const allPayments = result.invoices.flatMap((category) => category.payments);
  const verifiedPayments = allPayments.filter((payment) => payment.verification === "Verified").length;
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

  return (
    <div className="lvInvoiceRevampRoot" data-billing-id={result.id}>
      <div className="lvInvoiceOriginal">
        <OriginalProjectBillingDocument
          result={result}
          verificationUrl={verificationUrl}
          verificationError={verificationError}
        />
      </div>

      <section className={`${styles.printSheets} lvInvoiceRevampPrint`} aria-hidden="true">
        {printCategories.map((category, index) => {
          const gross = Number(category.gross || 0);
          const discount = Number(category.discount || 0);
          const paid = Number(category.paid || 0);
          const due = Math.max(0, Number(category.due || 0));
          const grandTotal = Math.max(0, gross - discount);
          const fullyPaid = due <= 0.009;

          return (
            <article className={`${styles.printPage} lvInvoicePage`} key={`${category.name}-${index}`}>
              <header className="lvInvoiceHeader">
                <div className="lvBrandBlock">
                  <div className="lvBrandLockup">
                    <img src="/land-view-logo.svg" alt="LAND VIEW logo" />
                    <div>
                      <strong>LAND <span>VIEW</span></strong>
                      <small>ENGINEERS AND ARCHITECTS</small>
                    </div>
                  </div>
                  <em>Building a safer tomorrow</em>
                </div>

                <div className="lvTitleBlock">
                  <small>Page {index + 1} of {totalPages}</small>
                  <b>Project Billing Statement</b>
                  <strong>{category.name} Bill</strong>
                </div>

                <div className="lvQrBlock">
                  {qrUrl ? (
                    <img data-billing-qr="true" src={qrUrl} alt={`Verify ${result.id}`} width={84} height={84} />
                  ) : (
                    <div className="lvQrPlaceholder">QR</div>
                  )}
                  <small>Scan to verify</small>
                </div>
              </header>

              <section className="lvInfoBoard">
                <div className="lvMetaRow">
                  <div className="lvMetaPair"><span>Invoice ID</span><strong>{statementRef}</strong></div>
                  <div className="lvMetaPair"><span>Issue Date</span><strong>{issueDate}</strong></div>
                </div>
                <div className="lvInfoHead"><strong>Owner Details</strong><strong>Building Details</strong></div>
                <div className="lvInfoRow"><span>File ID</span><strong>{result.id}</strong><span>Project Type</span><strong>{result.client.type || "—"}</strong></div>
                <div className="lvInfoRow"><span>Name</span><strong>{result.client.name || "—"}</strong><span>Floor/Story</span><strong>{result.client.floor || "—"}</strong></div>
                <div className="lvInfoRow"><span>Address</span><strong>{result.client.address || "—"}</strong><span>Land Area</span><strong>{result.client.area || "—"}</strong></div>
                <div className="lvInfoRow"><span>Contact</span><strong>{result.client.phone || "—"}</strong><span>Status</span><strong>{projectStatus}</strong></div>
                <div className="lvInfoRow"><span>Verification</span><strong>{invoiceVerification}</strong><span>Receipts</span><strong>Verified: {verifiedPayments}/{allPayments.length}</strong></div>
              </section>

              <section className="lvInvoiceBody">
                <h2 className="lvSectionTitle"><span>{category.name.toUpperCase()}</span> <b>BILL</b></h2>

                <div className="lvTableWrap">
                  <table className="lvInvoiceTable lvBillTable">
                    <colgroup><col /><col /><col /><col /><col /></colgroup>
                    <thead><tr><th>SL.</th><th>DESCRIPTION</th><th>RATE (BDT)</th><th>QTY</th><th>AMOUNT (BDT)</th></tr></thead>
                    <tbody>
                      {category.items.length ? category.items.map((item, itemIndex) => {
                        const soilTest = isSoilTestService(item.service);
                        return (
                          <tr key={itemIndex}>
                            <td>{itemIndex + 1}</td>
                            <td>{item.service || "—"}</td>
                            <td>{soilTest && item.price ? amountText(item.price) : ""}</td>
                            <td>{soilTest && item.quantity ? item.quantity : ""}</td>
                            <td>{amountText(item.amount)}</td>
                          </tr>
                        );
                      }) : <tr><td colSpan={5} className="lvEmptyRow">No bill records.</td></tr>}
                    </tbody>
                  </table>
                </div>

                <div className="lvTotalsBlock">
                  <div><span>Bill Subtotal (BDT)</span><strong>{amountText(gross)}</strong></div>
                  <div><span>Discount (BDT)</span><strong>{amountText(discount)}</strong></div>
                  <div className="lvGrandTotal"><span>Grand Total (BDT)</span><strong>{amountText(grandTotal)}</strong></div>
                </div>

                <h2 className="lvSectionTitle lvDepositTitle"><span>{category.name.toUpperCase()}</span> <b>DEPOSIT / PAYMENTS</b></h2>

                <div className="lvTableWrap">
                  <table className="lvInvoiceTable lvDepositTable">
                    <colgroup><col /><col /><col /><col /><col /></colgroup>
                    <thead><tr><th>SL.</th><th>DATE</th><th>PAYMENT DETAILS</th><th>VERIFICATION</th><th>AMOUNT (BDT)</th></tr></thead>
                    <tbody>
                      {category.payments.length ? category.payments.map((payment, paymentIndex) => (
                        <tr key={paymentIndex}>
                          <td>{paymentIndex + 1}</td>
                          <td>{parseDate(payment.date)}</td>
                          <td>{payment.details || "—"}</td>
                          <td className={payment.verification === "Verified" ? "lvVerified" : "lvUnverified"}>{payment.verification || "Unverified"}</td>
                          <td>BDT {amountText(payment.amount)}</td>
                        </tr>
                      )) : <tr><td colSpan={5} className="lvEmptyRow">No deposit records.</td></tr>}
                    </tbody>
                  </table>
                </div>

                {fullyPaid ? (
                  <div className="lvPaidBlock">
                    <div><strong>Payment Status</strong><span>All payments completed. This invoice has been fully settled.</span></div>
                    <b>FULL PAID</b>
                  </div>
                ) : (
                  <div className="lvDueBlock">
                    <div className="lvDueRow"><strong>Due Amount (BDT)</strong><b>{amountText(due)}</b></div>
                    <div className="lvWordsRow"><strong>In Words:</strong><span>{amountInWords(due)}</span></div>
                  </div>
                )}
              </section>

              <footer className="lvInvoiceFooter">
                <strong>LAND VIEW</strong>
                <div className="lvInvoiceFooterDetails">
                  <span>Address: Land View, F.Rahman AC Market (2nd Floor), SSK Road, Feni Sadar, Feni</span>
                  <span>Contact No: +88 0140 80 80 400</span>
                  <span>+88 01902 500 400</span>
                </div>
              </footer>
            </article>
          );
        })}
      </section>

      <style>{`
        .lvInvoiceOriginal .${styles.verificationRef}{display:none!important}

        @media print {
          .lvInvoiceOriginal .${styles.printSheets}{display:none!important}
          .lvInvoiceRevampPrint.${styles.printSheets}{display:block!important}
          .lvInvoicePage.${styles.printPage}{padding:7mm 7.5mm 7mm!important;font-family:Arial,Helvetica,sans-serif!important;color:#111!important}

          .lvInvoiceHeader{display:grid!important;grid-template-columns:1.28fr .92fr 23mm!important;gap:4mm!important;align-items:start!important;border-bottom:.75mm solid #e21f2f!important;padding-bottom:2.7mm!important;margin-bottom:3mm!important}
          .lvBrandBlock{display:flex!important;flex-direction:column!important;min-width:0!important}
          .lvBrandLockup{display:flex!important;align-items:center!important;gap:2.4mm!important}
          .lvBrandLockup img{display:block!important;width:17mm!important;height:17mm!important;object-fit:contain!important}
          .lvBrandLockup>div{display:flex!important;flex-direction:column!important;min-width:0!important}
          .lvBrandLockup strong{font-size:16.5pt!important;line-height:1!important;white-space:nowrap!important;color:#111!important}
          .lvBrandLockup strong span{color:#e21f2f!important}
          .lvBrandLockup small{font-size:7.8pt!important;letter-spacing:.28px!important;margin-top:1mm!important;white-space:nowrap!important;color:#222!important}
          .lvBrandBlock em{font-style:normal!important;font-size:7.6pt!important;color:#666!important;margin:1.2mm 0 0 19.4mm!important}
          .lvTitleBlock{display:flex!important;flex-direction:column!important;align-items:flex-end!important;text-align:right!important;padding-top:.6mm!important}
          .lvTitleBlock small{font-size:7.8pt!important;color:#555!important;margin-bottom:1.4mm!important}
          .lvTitleBlock b{font-size:11pt!important;color:#111!important;white-space:nowrap!important}
          .lvTitleBlock strong{font-size:13pt!important;color:#e21f2f!important;margin-top:.8mm!important;text-transform:capitalize!important;white-space:nowrap!important}
          .lvQrBlock{display:flex!important;flex-direction:column!important;align-items:center!important;gap:.8mm!important}
          .lvQrBlock img,.lvQrPlaceholder{width:19mm!important;height:19mm!important;background:#fff!important;border:1px solid #cfd4d8!important;box-sizing:border-box!important}
          .lvQrPlaceholder{display:grid!important;place-items:center!important;color:#777!important;font-size:7.5pt!important}
          .lvQrBlock small{font-size:7.2pt!important;color:#555!important;white-space:nowrap!important}

          .lvInfoBoard{border:1px solid #aeb6bd!important;margin-bottom:3.4mm!important;width:100%!important;box-sizing:border-box!important}
          .lvMetaRow{display:grid!important;grid-template-columns:1fr 1fr!important}
          .lvMetaPair{display:grid!important;grid-template-columns:24mm minmax(0,1fr)!important}
          .lvMetaPair span,.lvInfoRow span{background:#22282c!important;color:#fff!important;font-size:8.1pt!important;font-weight:700!important;white-space:nowrap!important}
          .lvMetaPair span,.lvMetaPair strong,.lvInfoRow span,.lvInfoRow strong{padding:1.3mm 1.7mm!important;min-height:6.5mm!important;display:flex!important;align-items:center!important;box-sizing:border-box!important;border-right:1px solid #c8ced3!important;border-bottom:1px solid #c8ced3!important}
          .lvMetaPair strong,.lvInfoRow strong{background:#fff!important;color:#111!important;font-size:8.3pt!important;font-weight:700!important;min-width:0!important;overflow-wrap:anywhere!important}
          .lvMetaPair:last-child strong{border-right:0!important}
          .lvInfoHead{display:grid!important;grid-template-columns:1fr 1fr!important}
          .lvInfoHead strong{background:#22282c!important;color:#fff!important;text-align:center!important;font-size:8.4pt!important;padding:1.25mm!important;border-bottom:1px solid #c8ced3!important}
          .lvInfoHead strong:first-child{border-right:1px solid #c8ced3!important}
          .lvInfoRow{display:grid!important;grid-template-columns:23mm minmax(0,1fr) 27mm minmax(0,.92fr)!important}
          .lvInfoRow>*:last-child{border-right:0!important}
          .lvInfoRow:last-child>*{border-bottom:0!important}

          .lvInvoiceBody{width:100%!important;box-sizing:border-box!important}
          .lvSectionTitle{display:flex!important;align-items:center!important;justify-content:center!important;gap:1.2mm!important;margin:0 0 1.8mm!important;font-size:14pt!important;color:#111!important;line-height:1.1!important;text-align:center!important;white-space:nowrap!important}
          .lvSectionTitle:before,.lvSectionTitle:after{content:""!important;height:.35mm!important;background:#e21f2f!important;flex:1!important}
          .lvSectionTitle:before{margin-right:4mm!important}.lvSectionTitle:after{margin-left:4mm!important}
          .lvSectionTitle span{font-weight:800!important}.lvSectionTitle b{color:#e21f2f!important;font-weight:800!important}
          .lvDepositTitle{margin-top:3.8mm!important}

          .lvTableWrap{width:100%!important;border:1px solid #cbd1d6!important;box-sizing:border-box!important;overflow:hidden!important}
          .lvInvoiceTable{width:100%!important;border-collapse:collapse!important;table-layout:fixed!important;font-size:8.3pt!important;color:#111!important}
          .lvInvoiceTable th{background:#22282c!important;color:#fff!important;padding:1.55mm 1.7mm!important;font-size:7.8pt!important;font-weight:800!important;border-right:1px solid #cbd1d6!important;white-space:nowrap!important}
          .lvInvoiceTable td{padding:1.45mm 1.7mm!important;border-top:1px solid #d6dbe0!important;border-right:1px solid #d6dbe0!important;line-height:1.15!important;box-sizing:border-box!important;overflow-wrap:anywhere!important}
          .lvInvoiceTable th:last-child,.lvInvoiceTable td:last-child{border-right:0!important}
          .lvInvoiceTable tbody tr:nth-child(even){background:#fafbfb!important}
          .lvInvoiceTable th:first-child,.lvInvoiceTable td:first-child{text-align:center!important}
          .lvInvoiceTable th:last-child,.lvInvoiceTable td:last-child{text-align:right!important;white-space:nowrap!important}
          .lvEmptyRow{text-align:center!important;color:#666!important;padding:3mm!important}

          .lvBillTable col:nth-child(1){width:8%!important}.lvBillTable col:nth-child(2){width:44%!important}.lvBillTable col:nth-child(3){width:18%!important}.lvBillTable col:nth-child(4){width:10%!important}.lvBillTable col:nth-child(5){width:20%!important}
          .lvBillTable th:nth-child(3),.lvBillTable td:nth-child(3),.lvBillTable th:nth-child(4),.lvBillTable td:nth-child(4){text-align:center!important}
          .lvBillTable td:nth-child(5){text-align:right!important}

          .lvTotalsBlock{width:100%!important;margin-top:0!important;border:1px solid #cbd1d6!important;border-top:0!important;box-sizing:border-box!important}
          .lvTotalsBlock>div{display:grid!important;grid-template-columns:minmax(0,1fr) 42mm!important;align-items:center!important;min-height:6.6mm!important;border-top:1px solid #d6dbe0!important}
          .lvTotalsBlock>div:first-child{border-top:0!important}
          .lvTotalsBlock span,.lvTotalsBlock strong{padding:1.45mm 2mm!important;font-size:8.5pt!important;box-sizing:border-box!important}
          .lvTotalsBlock span{font-weight:700!important}.lvTotalsBlock strong{text-align:right!important;border-left:1px solid #d6dbe0!important;font-variant-numeric:tabular-nums!important}
          .lvGrandTotal{background:#e21f2f!important;color:#fff!important}
          .lvGrandTotal span,.lvGrandTotal strong{font-size:10pt!important;font-weight:900!important;color:#fff!important;border-color:rgba(255,255,255,.45)!important}

          .lvDepositTable col:nth-child(1){width:8%!important}.lvDepositTable col:nth-child(2){width:16%!important}.lvDepositTable col:nth-child(3){width:36%!important}.lvDepositTable col:nth-child(4){width:20%!important}.lvDepositTable col:nth-child(5){width:20%!important}
          .lvDepositTable th:nth-child(2),.lvDepositTable td:nth-child(2),.lvDepositTable th:nth-child(4),.lvDepositTable td:nth-child(4){text-align:center!important;white-space:nowrap!important}
          .lvDepositTable td:nth-child(5){text-align:right!important;white-space:nowrap!important}
          .lvVerified{color:#118a3c!important;font-weight:900!important}.lvUnverified{color:#b42318!important;font-weight:900!important}

          .lvDueBlock,.lvPaidBlock{width:100%!important;margin-top:2.6mm!important;box-sizing:border-box!important}
          .lvDueBlock{border:1px solid #ef8f97!important;background:#fff8f8!important}
          .lvDueRow{display:grid!important;grid-template-columns:minmax(0,1fr) 45mm!important;align-items:center!important}
          .lvDueRow strong{padding:2.1mm 2.4mm!important;color:#d7192d!important;font-size:10.5pt!important}
          .lvDueRow b{padding:2.1mm 2.4mm!important;background:#e21f2f!important;color:#fff!important;text-align:right!important;font-size:12.8pt!important}
          .lvWordsRow{display:grid!important;grid-template-columns:31mm minmax(0,1fr)!important;border-top:1px solid #efb3b8!important}
          .lvWordsRow strong,.lvWordsRow span{padding:1.9mm 2.4mm!important;font-size:9.2pt!important}.lvWordsRow strong{font-weight:800!important}.lvWordsRow span{font-weight:700!important}

          .lvPaidBlock{display:grid!important;grid-template-columns:minmax(0,1fr) 48mm!important;border:1px solid #8bc9a0!important;background:#f2fbf5!important}
          .lvPaidBlock>div{padding:2.1mm 2.5mm!important;display:flex!important;flex-direction:column!important;justify-content:center!important;gap:.7mm!important}
          .lvPaidBlock>div strong{color:#137a3a!important;font-size:10.5pt!important}.lvPaidBlock>div span{font-size:8.3pt!important;color:#2d4935!important}
          .lvPaidBlock>b{display:grid!important;place-items:center!important;background:#138a42!important;color:#fff!important;font-size:14.8pt!important;letter-spacing:.2px!important}

          .lvInvoiceFooter{position:absolute!important;left:7.5mm!important;right:7.5mm!important;bottom:5mm!important;display:flex!important;justify-content:space-between!important;align-items:center!important;border-top:.5mm solid #e21f2f!important;padding-top:1.7mm!important;font-size:7.5pt!important;color:#59636a!important}
          .lvInvoiceFooter strong{color:#111!important;font-size:8.4pt!important}
          .lvInvoiceFooterDetails{display:flex!important;flex-direction:column!important;align-items:flex-end!important;gap:.35mm!important;text-align:right!important;line-height:1.15!important}
          .lvInvoiceFooterDetails span{display:block!important;text-align:right!important}
        }
      `}</style>
    </div>
  );
}
