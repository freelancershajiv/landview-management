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

type BillingItem = SheetInvoices["invoices"][number]["items"][number] & {
  billStatus?: string;
  billNetAmount?: number;
  billDiscount?: number;
  billDueAmount?: number;
};

type Props = {
  result: SheetInvoices;
  verificationUrl?: string;
  verificationError?: string;
  dueOnly?: boolean;
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

function isEngineeringCategory(value: unknown) {
  return String(value ?? "").trim().toLowerCase() === "engineering";
}

export default function ProjectBillingDocumentRevamp({
  result,
  verificationUrl = "",
  verificationError = "",
  dueOnly = false,
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

  const statementRef = dueOnly
    ? `DUE-${result.id}-${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date()).replace(/-/g, "")}`
    : result.document?.invoiceCode || `STMT-${result.id}-${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date()).replace(/-/g, "")}`;
  const displayBilling = useMemo(() => {
    if (!dueOnly) return result;
    const dueInvoices = result.invoices
      .filter((category) => Number(category.due || 0) > 0.009)
      .map((category) => {
        const dueBalance = Math.max(0, Number(category.due || 0));
        const sourceItems = category.items as BillingItem[];
        const allocatedBills = sourceItems.filter((item) =>
          typeof item.billDueAmount === "number" && Number.isFinite(item.billDueAmount) && item.billDueAmount > 0.009,
        );
        const itemizedDue = allocatedBills.reduce((sum, item) => sum + Math.max(0, Number(item.billDueAmount)), 0);
        // If every remaining taka can be traced to a canonical bill, itemize it.
        // Otherwise show the authoritative outstanding balance instead of
        // accidentally re-billing the full amount of partially paid items.
        const canItemize = allocatedBills.length > 0 && Math.abs(itemizedDue - dueBalance) <= 0.01;
        const dueItems = canItemize
          ? allocatedBills.map((item) => ({
              ...item,
              price: "",
              quantity: "",
              amount: Math.max(0, Number(item.billDueAmount)),
              billNetAmount: Math.max(0, Number(item.billDueAmount)),
              billDiscount: 0,
            }))
          : [{
              service: `Outstanding ${category.name} balance`,
              price: "",
              quantity: "",
              amount: dueBalance,
              billNetAmount: dueBalance,
              billDiscount: 0,
            }];
        return {
          ...category,
          items: dueItems,
          gross: dueBalance,
          discount: 0,
          paid: 0,
          due: dueBalance,
          payments: [],
        };
      });
    return {
      ...result,
      invoices: dueInvoices,
      totals: {
        gross: dueInvoices.reduce((sum, category) => sum + category.gross, 0),
        discount: dueInvoices.reduce((sum, category) => sum + category.discount, 0),
        paid: 0,
        due: dueInvoices.reduce((sum, category) => sum + category.due, 0),
      },
    };
  }, [dueOnly, result]);
  const projectPaymentReview = result.document?.kind === "single" || dueOnly ? undefined : result.paymentReview;
  const paymentReviewReady = Boolean(projectPaymentReview?.complete);
  const paymentByCode = new Map(
    (projectPaymentReview?.payments || []).map((payment) => [payment.paymentCode.toLowerCase(), payment]),
  );
  const projectStatus = result.client.status ||
    (Number(result.totals.due || 0) > 0.009 ? "Balance Due" : "No Collectible Balance");

  const activeCategories = displayBilling.invoices.filter(hasBillingData);
  const printCategories = activeCategories.length ? activeCategories : displayBilling.invoices.slice(0, 1);
  const totalPages = printCategories.length;

  return (
    <div className="lvInvoiceRevampRoot" data-billing-id={result.id}>
      <div className="lvInvoiceOriginal">
        <OriginalProjectBillingDocument
          result={displayBilling}
          verificationUrl={verificationUrl}
          verificationError={verificationError}
        />
      </div>

      <section className={`${styles.printSheets} lvInvoiceRevampPrint`} aria-hidden="true">
        {printCategories.map((category, index) => {
          const gross = Number(category.gross || 0);
          const discount = Number(category.discount || 0);
          const grandTotal = Math.max(0, gross - discount);
          const paid = Math.max(0, Number(category.paid || 0));
          // A complete project review provides the collectible balance after
          // allocations/relief. For a single invoice retain the conservative
          // bill-specific protection against stale zero-due snapshots.
          const due = paymentReviewReady
            ? Math.max(0, Number(category.due || 0))
            : Math.max(0, Number(category.due || 0), grandTotal - paid);
          const noCollectibleDue = due <= 0.009;
          const fullyPaid = noCollectibleDue && paid >= grandTotal - 0.009;
          const linkedPayments = category.payments.map((entry) =>
            paymentByCode.get(String(entry.incomeId || "").trim().toLowerCase()));
          const allPaymentsLinked = paymentReviewReady && linkedPayments.every(Boolean);
          const appliedToInvoices = allPaymentsLinked
            ? linkedPayments.reduce((sum, item) => sum + Number(item?.allocated || 0), 0)
            : null;
          const unallocatedReceipts = allPaymentsLinked
            ? linkedPayments.reduce((sum, item) => sum + Number(item?.unallocated || 0), 0)
            : null;
          const engineeringBill = isEngineeringCategory(result.document?.kind === "single" ? result.document.category : category.name);

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
                  <b>{dueOnly ? "DUE STATEMENT" : result.document?.kind === "single" ? "Service Invoice" : "Project Billing Statement"}</b>
                  <strong>{dueOnly ? "Outstanding Due" : `${category.name} Bill`}</strong>
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
                <div className="lvInfoRow"><span>{result.document?.kind === "single" ? "Invoice ID" : "Statement Ref"}</span><strong>{statementRef}</strong><span>Issue Date</span><strong>{issueDate}</strong></div>
                <div className="lvInfoRow"><span>Owner Name</span><strong>{result.client.name || "—"}</strong><span>File ID</span><strong>{result.client.fileId || result.id || "—"}</strong></div>
                <div className="lvInfoRow"><span>Contact No</span><strong>{result.client.phone || "—"}</strong><span>Project Type</span><strong>{result.client.type || "—"}</strong></div>
                <div className="lvInfoRow"><span>Referred By</span><strong>{result.client.referredBy || "—"}</strong><span>Floor/Story</span><strong>{result.client.floor || "—"}</strong></div>
                <div className="lvInfoRow"><span>Ref. Contact</span><strong>{result.client.refContact || "—"}</strong><span>Land Area</span><strong>{result.client.area || "—"}</strong></div>
                <div className="lvInfoRow"><span>Address</span><strong>{result.client.address || "—"}</strong><span>Status</span><strong>{projectStatus}</strong></div>
              </section>

              <section className="lvInvoiceBody">
                <h2 className="lvSectionTitle"><span>{dueOnly ? "OUTSTANDING" : category.name.toUpperCase()}</span> <b>{dueOnly ? "DUE BILL" : "BILL"}</b></h2>

                <div className="lvTableWrap">
                  <table className={`lvInvoiceTable lvBillTable ${engineeringBill ? "lvEngineeringBillTable" : ""}`}>
                    <colgroup><col /><col /><col /><col /><col /></colgroup>
                    <thead>
                      <tr>
                        <th>SL.</th>
                        <th>DESCRIPTION</th>
                        {engineeringBill ? <>
                          <th>AMOUNT</th>
                          <th>DISCOUNT</th>
                          <th>NET AMOUNT</th>
                        </> : <>
                          <th>RATE (BDT)</th>
                          <th>QTY</th>
                          <th>AMOUNT (BDT)</th>
                        </>}
                      </tr>
                    </thead>
                    <tbody>
                      {category.items.length ? category.items.map((item, itemIndex) => {
                        const billingItem = item as BillingItem;
                        const soilTest = isSoilTestService(item.service);
                        const amount = Number.isFinite(item.amount) ? Math.max(0, Number(item.amount)) : 0;
                        const serviceDiscount = engineeringBill && Number.isFinite(billingItem.billDiscount)
                          ? Math.max(0, Number(billingItem.billDiscount))
                          : 0;
                        const serviceNet = engineeringBill
                          ? Number.isFinite(billingItem.billNetAmount)
                            ? Math.max(0, Number(billingItem.billNetAmount))
                            : Math.max(0, amount - serviceDiscount)
                          : amount;
                        return (
                          <tr key={itemIndex}>
                            <td>{itemIndex + 1}</td>
                            <td>{item.service || "—"}</td>
                            {engineeringBill ? <>
                              <td>{amountText(amount)}</td>
                              <td>{serviceDiscount > 0.009 ? amountText(serviceDiscount) : "—"}</td>
                              <td>{amountText(serviceNet)}</td>
                            </> : <>
                              <td>{soilTest && item.price ? amountText(item.price) : ""}</td>
                              <td>{soilTest && item.quantity ? item.quantity : ""}</td>
                              <td>{amountText(amount)}</td>
                            </>}
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

                {!dueOnly && <>
                  <h2 className="lvSectionTitle lvDepositTitle"><span>{category.name.toUpperCase()}</span> <b>PAYMENT RECORDS</b></h2>
                  <div className="lvTableWrap">
                    <table className={`lvInvoiceTable lvDepositTable ${result.document?.kind === "single" ? "lvSingleInvoiceDepositTable" : ""}`}>
                      {result.document?.kind === "single"
                        ? <colgroup><col /><col /><col /><col /></colgroup>
                        : <colgroup><col /><col /><col /><col /><col /><col /></colgroup>}
                      <thead>
                        {result.document?.kind === "single"
                          ? <tr><th>SL.</th><th>DATE</th><th>PAYMENT / RECEIPT</th><th>APPLIED TO THIS INVOICE (BDT)</th></tr>
                          : <tr><th>SL.</th><th>DATE</th><th>PAYMENT / RECEIPT</th><th>RECEIVED (BDT)</th><th>APPLIED (BDT)</th><th>UNALLOCATED (BDT)</th></tr>}
                      </thead>
                      <tbody>
                        {category.payments.length ? category.payments.map((payment, paymentIndex) => {
                          const ledger = paymentByCode.get(String(payment.incomeId || "").trim().toLowerCase());
                          const assignedRefs = ledger?.invoices.map((part) => part.invoiceCode || part.billCode).filter(Boolean) || [];
                          return <tr key={`${payment.incomeId || "historical"}-${paymentIndex}`}>
                            <td>{paymentIndex + 1}</td>
                            <td>{parseDate(payment.date)}</td>
                            <td className="lvPaymentDescription">
                              <strong>{payment.details || ledger?.method || "Client payment"}</strong>
                              <small>{payment.incomeId ? `Payment: ${payment.incomeId}` : "Payment reference unavailable"}</small>
                              <small>{result.document?.kind === "single" ? "Applied to this invoice" : ledger ? ledger.allocationStatus : payment.verification === "Verified" ? "Recorded · allocation unknown" : "Verification required"}</small>
                              {assignedRefs.length > 0 && <small>Invoices: {assignedRefs.join(", ")}</small>}
                            </td>
                            <td>{amountText(payment.amount)}</td>
                            {result.document?.kind !== "single" && <>
                              <td>{ledger ? amountText(ledger.allocated) : "—"}</td>
                              <td>{ledger ? amountText(ledger.unallocated) : "—"}</td>
                            </>}
                          </tr>;
                        }) : <tr><td colSpan={result.document?.kind === "single" ? 4 : 6} className="lvEmptyRow">No recorded payments.</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </>}

                <div className="lvReconciledPaymentRow">
                  <span>Received: <b>BDT {amountText(paid)}</b></span>
                  {result.document?.kind !== "single" && appliedToInvoices !== null && <span>Applied to invoices: <b>BDT {amountText(appliedToInvoices)}</b></span>}
                  {result.document?.kind !== "single" && unallocatedReceipts !== null && <span>Unallocated: <b>BDT {amountText(unallocatedReceipts)}</b></span>}
                  <span>Collectible due: <b>BDT {amountText(due)}</b></span>
                </div>
                {noCollectibleDue ? (
                  <div className="lvPaidBlock">
                    <div>
                      <strong>{fullyPaid ? "Payment Status" : "Collectible Balance"}</strong>
                      <span>{fullyPaid ? "All required payments have been received." : "No collectible balance remains. Payment allocations or adjustments may still require review."}</span>
                    </div>
                    <b>{fullyPaid ? "FULL PAID" : "NO DUE"}</b>
                  </div>
                ) : (
                  <div className="lvDueBlock">
                    <div className="lvDueRow"><strong>Payment Status</strong><b>{paid > 0.009 ? "PARTIALLY PAID" : "UNPAID"}</b></div>
                    <div className="lvDueRow"><strong>Collectible Due (BDT)</strong><b>{amountText(due)}</b></div>
                    <div className="lvWordsRow"><strong>{dueOnly ? "Due Amount in Words:" : "In Words:"}</strong><span>{amountInWords(due)}</span></div>
                  </div>
                )}
              </section>

              <footer className="lvInvoiceFooter">
                <strong>LAND VIEW</strong>
                <div className="lvInvoiceFooterDetails">
                  <span>Address: Land View, F.Rahman AC Market (2nd Floor), SSK Road, Feni Sadar, Feni</span>
                  <span>Contact No: +88 0140 80 80 400</span>
                  <span>+88 01902 500 400</span>
                  <span>Generated: {new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" }).format(new Date(result.document?.generatedAt || Date.now()))}</span>
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
          .lvInfoRow{display:grid!important;grid-template-columns:25mm minmax(0,1.18fr) 25mm minmax(0,.82fr)!important}
          .lvInfoRow span{background:#22282c!important;color:#fff!important;font-size:8.1pt!important;font-weight:700!important;white-space:nowrap!important}
          .lvInfoRow span,.lvInfoRow strong{padding:1.3mm 1.7mm!important;min-height:6.5mm!important;display:flex!important;align-items:center!important;box-sizing:border-box!important;border-right:1px solid #c8ced3!important;border-bottom:1px solid #c8ced3!important}
          .lvInfoRow strong{background:#fff!important;color:#111!important;font-size:8.3pt!important;font-weight:700!important;min-width:0!important;overflow-wrap:anywhere!important}
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

          .lvBillTable col:nth-child(1){width:7%!important}.lvBillTable col:nth-child(2){width:42%!important}.lvBillTable col:nth-child(3){width:18%!important}.lvBillTable col:nth-child(4){width:12%!important}.lvBillTable col:nth-child(5){width:21%!important}
          .lvBillTable th:nth-child(3),.lvBillTable td:nth-child(3),.lvBillTable th:nth-child(4),.lvBillTable td:nth-child(4){text-align:center!important}
          .lvBillTable th:nth-child(5),.lvBillTable td:nth-child(5){text-align:right!important;white-space:nowrap!important}
          .lvEngineeringBillTable col:nth-child(1){width:7%!important}.lvEngineeringBillTable col:nth-child(2){width:42%!important}.lvEngineeringBillTable col:nth-child(3){width:17%!important}.lvEngineeringBillTable col:nth-child(4){width:16%!important}.lvEngineeringBillTable col:nth-child(5){width:18%!important}
          .lvEngineeringBillTable th:nth-child(3),.lvEngineeringBillTable td:nth-child(3),.lvEngineeringBillTable th:nth-child(4),.lvEngineeringBillTable td:nth-child(4),.lvEngineeringBillTable th:nth-child(5),.lvEngineeringBillTable td:nth-child(5){text-align:right!important;white-space:nowrap!important}
          .lvEngineeringBillTable td:nth-child(4){color:#d7192d!important;font-weight:800!important}
          .lvEngineeringBillTable td:nth-child(5){color:#111!important;font-weight:800!important}

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
          /* Invoice Data 3.1: the actual print template, not the older hidden screen template. */
          .lvInvoicePage .lvInfoRow span{background:#edf1f4!important;color:#26343d!important;font-size:8.6pt!important;white-space:normal!important}
          .lvInvoicePage .lvInfoRow strong{font-size:9pt!important;line-height:1.3!important;overflow-wrap:break-word!important;word-break:normal!important}
          .lvInvoicePage .lvInvoiceTable{font-size:9pt!important;line-height:1.3!important}
          .lvInvoicePage .lvInvoiceTable th{font-size:8.1pt!important;line-height:1.2!important;white-space:normal!important;padding:1.5mm 1.1mm!important}
          .lvInvoicePage .lvInvoiceTable td{font-size:8.8pt!important;line-height:1.25!important;padding:1.4mm 1.1mm!important}
          .lvInvoicePage .lvDepositTable col:nth-child(1){width:7%!important}
          .lvInvoicePage .lvDepositTable col:nth-child(2){width:16%!important}
          .lvInvoicePage .lvDepositTable col:nth-child(3){width:33%!important}
          .lvInvoicePage .lvDepositTable col:nth-child(4){width:15%!important}
          .lvInvoicePage .lvDepositTable col:nth-child(5){width:14%!important}
          .lvInvoicePage .lvDepositTable col:nth-child(6){width:15%!important}
          .lvInvoicePage .lvDepositTable td:nth-child(n+4),.lvInvoicePage .lvDepositTable th:nth-child(n+4){text-align:right!important;white-space:nowrap!important;font-variant-numeric:tabular-nums!important}
          .lvInvoicePage .lvSingleInvoiceDepositTable col:nth-child(1){width:8%!important}
          .lvInvoicePage .lvSingleInvoiceDepositTable col:nth-child(2){width:18%!important}
          .lvInvoicePage .lvSingleInvoiceDepositTable col:nth-child(3){width:47%!important}
          .lvInvoicePage .lvSingleInvoiceDepositTable col:nth-child(4){width:27%!important}
          .lvInvoicePage .lvPaymentDescription strong,.lvInvoicePage .lvPaymentDescription small{display:block!important;color:#1c2830!important}
          .lvInvoicePage .lvPaymentDescription small{font-size:7.2pt!important;line-height:1.26!important;margin-top:.45mm!important;overflow-wrap:anywhere!important}
          .lvInvoicePage .lvReconciledPaymentRow{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:1.1mm 4mm!important;margin-top:2mm!important;padding:2mm 2.4mm!important;background:#eef2f6!important;border:1px solid #b5c1ca!important;color:#14222c!important;box-sizing:border-box!important;font-size:8.8pt!important;font-weight:700!important}
          .lvInvoicePage .lvReconciledPaymentRow span,.lvInvoicePage .lvReconciledPaymentRow b{color:#14222c!important;background:transparent!important}
          .lvInvoicePage .lvReconciledPaymentRow b{font-variant-numeric:tabular-nums!important}
          .lvInvoicePage .lvInvoiceFooter{color:#3e4d57!important}
        }
      `}</style>
    </div>
  );
}