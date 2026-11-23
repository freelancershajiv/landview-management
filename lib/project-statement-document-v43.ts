import { DEVELOPER_CREDIT_HTML } from "@/lib/developer-credit";
import type { ProjectStatementV43 } from "@/lib/project-statement-v43";

/** Deterministic paginated A4 HTML; browser print and exported PDF share these exact pages. */
const esc = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const fmt = (value: number) => "BDT " + Math.max(0, Number(value || 0)).toLocaleString("en-BD", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const date = (value: unknown) => {
  const raw = String(value ?? "");
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "—";
};
const chunks = <T,>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_,i) => items.slice(i*size,(i+1)*size));
const cell = (value: unknown, className = "") => `<td class="${className}">${esc(value)}</td>`;
const note = (value: unknown, max = 90) => {
  const txt = String(value ?? "").trim();
  return txt.length <= max ? txt : txt.slice(0, max - 1) + "…";
};
const table = (headings: string[], rows: string[][], empty: string) => `<table><thead><tr>${
  headings.map(item => `<th>${esc(item)}</th>`).join("")
}</tr></thead><tbody>${rows.length
  ? rows.map(cols => `<tr>${cols.map((value,i) => cell(value, i > 1 ? "numeric" : "")).join("")}</tr>`).join("")
  : `<tr><td colspan="${headings.length}">${esc(empty)}</td></tr>`
}</tbody></table>`;

type Sheet = { eyebrow: string; heading: string; subtitle: string; body: string };
export function renderProjectStatementV43(data: ProjectStatementV43, autoPrint = false) {
  const p = data.project, t = data.totals;
  const screens: Sheet[] = [];
  const summary = `<div class="hero">
    <span class="overline">CLIENT PROJECT STATEMENT · CURRENT STATUS</span>
    <h2>${esc(p.code)} <span>— ${esc(note(p.name, 65) || "Project")}</span></h2>
    <div class="meta-grid">
      <div><span>Client</span><strong>${esc(p.client || "—")}</strong></div>
      <div><span>Location</span><strong>${esc(note(p.location, 90) || "—")}</strong></div>
      <div><span>Statement generated</span><strong>${esc(date(data.generatedAt))}</strong></div>
      <div><span>Financial basis</span><strong>Current billing ledger</strong></div>
    </div>
  </div>
  <div class="featured">
    <span>Current amount payable</span><strong>${esc(fmt(t.amountDue))}</strong>
    <small>After payments, posted adjustments, write-offs and applicable project-level advances</small>
  </div>
  <div class="totals-grid">
    <div><span>Net billed services</span><strong>${esc(fmt(t.billedNetAfterAdjustments))}</strong></div>
    <div><span>Payments received</span><strong>${esc(fmt(t.receivedPayments))}</strong></div>
    <div><span>Net written off</span><strong>${esc(fmt(t.netWriteoffs))}</strong></div>
    <div><span>Invoice-unallocated payments</span><strong>${esc(fmt(t.invoiceUnallocated))}</strong></div>
    <div><span>Advance remaining after offsets</span><strong>${esc(fmt(t.remainingAdvanceAfterOffsets))}</strong></div>
    <div><span>Outstanding before project-level offsets</span><strong>${esc(fmt(t.invoiceDueBeforeProjectOffsets))}</strong></div>
  </div>
  <h3>Outstanding by billing category</h3>
  <div class="category-grid">
    <div><span>Engineering Bill</span><strong>${esc(fmt(t.engineeringDue))}</strong></div>
    <div><span>Other Services Bill</span><strong>${esc(fmt(t.otherDue))}</strong></div>
    <div><span>Supervision Bill</span><strong>${esc(fmt(t.supervisionDue))}</strong></div>
  </div>
  <div class="explain">
    <strong>How to read this statement</strong>
    <p>Individual invoice balances shown on following pages are before project-level offsets.
    The amount payable above comes from LAND VIEW's canonical receivable calculation.
    Invoice-unallocated money may already reduce the project amount payable. Remaining advance is the
    unused credit after those offsets, not an additional amount due.</p>
    <p>This is a current status snapshot, not a reconstructed balance for an earlier date.
    A payment without an online issued receipt may still be a genuine historical client payment;
    it must not be counted as new debt solely because a digital receipt is unavailable.</p>
  </div>`;
  screens.push({ eyebrow: "OVERVIEW", heading: "Consolidated project statement",
    subtitle: "Bills, payments, advances and current receivables", body: summary });

  const serviceRows = data.invoices.map(line => [
    line.invoiceCode || line.billCode,
    note(line.service, 59) + " (" + date(line.billDate) + ")",
    fmt(line.gross), fmt(line.directDiscount),
    fmt(line.debitNote), fmt(line.creditNote),
    fmt(line.net), fmt(line.allocated), fmt(line.invoiceDueBeforeProjectOffsets),
  ]);
  const pagesInvoices = chunks(serviceRows, 10);
  for (const [i,items] of pagesInvoices.entries()) screens.push({
    eyebrow: "BILL DETAILS", heading: "Issued service bills & invoice balances",
    subtitle: `Service register · Part ${i+1} of ${pagesInvoices.length}`,
    body: `<p class="section-note">Net includes posted debit and credit adjustments. Invoice balances are shown before project-wide advance or write-off relief.</p>${table(
      ["Invoice / Bill", "Service & date", "Gross", "Bill disc.", "Debit note", "Credit note", "Net", "Allocated", "Open*"],
      items, "No active service bills in this project.")}`,
  });
  const paymentRows = data.payments.map(payment => [
    payment.paymentCode, date(payment.date) + " · " + note(payment.method || payment.category, 33),
    fmt(payment.amount), fmt(payment.allocatedToInvoices), fmt(payment.notAllocatedToInvoices),
    note(payment.receiptCode || (payment.legacyManual ? "Legacy / not online" : "Not issued online"), 40),
  ]);
  const pagesPayments = chunks(paymentRows, 13);
  for (const [i,items] of pagesPayments.entries()) screens.push({
    eyebrow: "PAYMENTS & ADVANCES", heading: "Recorded project payments",
    subtitle: `Payments credited to this project · Part ${i+1} of ${pagesPayments.length}`,
    body: `<p class="section-note">Received payments include effective historical manual receipts. An unavailable online receipt does not negate a recorded client payment.</p>${table(
      ["Payment ID", "Date · method", "Received", "To invoices", "Not allocated", "Online receipt"],
      items, "No project payments have been recorded.")}`,
  });
  const adjustmentRows = data.adjustments.map(item => [
    item.code, item.billCode, date(item.date), item.kind, fmt(item.amount), note(item.reason, 95),
  ]);
  const pagesAdjustments = chunks(adjustmentRows, 12);
  for (const [i,items] of pagesAdjustments.entries()) screens.push({
    eyebrow: "AUDITABLE CORRECTIONS", heading: "Credit / debit note history",
    subtitle: `Posted adjustment evidence · Part ${i+1} of ${pagesAdjustments.length}`,
    body: `<p class="section-note">These entries are already reflected in the billed amount, and are not extra customer charges.</p>${table(
      ["Adjustment", "Original bill", "Date", "Type", "Value", "Reason"],
      items, "No posted adjustments.")}`,
  });
  const writeoffRows = data.writeoffs.map(item => [
    date(item.date), note(item.category, 40), note(item.kind.replaceAll("_", " "), 35), fmt(item.amount),
  ]);
  const pagesWriteoffs = chunks(writeoffRows, 16);
  for (const [i,items] of pagesWriteoffs.entries()) screens.push({
    eyebrow: "WRITEOFFS & RECOVERIES", heading: "Recorded relief and recoveries",
    subtitle: `Financial write-off history · Part ${i+1} of ${pagesWriteoffs.length}`,
    body: `<p class="section-note">Write-offs and recoveries are part of the amount-due calculation; each event is shown for transparency.</p>${table(
      ["Effective date", "Category", "Event", "Amount"],
      items, "No write-off entries.")}`,
  });
  if (screens.length > 100) throw new Error("Statement exceeds the 100-page document limit.");

  const sheets = screens.map((page,index) => `<section class="statement-page" data-statement-page="${index+1}">
    <header class="doc-header">
      <div class="identity"><img src="/land-view-logo.svg" alt="LAND VIEW logo"/><div>
        <strong>LAND <b>VIEW</b></strong><small>Architects &amp; Engineers · Feni, Bangladesh</small>
      </div></div>
      <div class="doc-type">PROJECT BILLING<br/>STATEMENT · V4.3</div>
    </header>
    <div class="doc-heading"><span>${esc(page.eyebrow)}</span><h1>${esc(page.heading)}</h1>
      <p>${esc(page.subtitle)} · File ${esc(p.code)}</p></div>
    <div class="doc-content">${page.body}</div>
    <footer class="doc-footer"><div><strong>LAND VIEW — Architects &amp; Engineers</strong>
      <span>Feni Sadar, Feni, Bangladesh · landview.com.bd</span>
      <span>Current data captured: ${esc(data.generatedAt.slice(0,19).replace("T"," "))} UTC</span>
      <span>${DEVELOPER_CREDIT_HTML}</span></div>
      <div>Page ${index+1} / ${screens.length}<small>Private client statement</small></div></footer>
  </section>`).join("");
  const autoScript = autoPrint ? `<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},500)},{once:true});</script>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="robots" content="noindex,nofollow,noarchive"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${esc(p.code)} · LAND VIEW Project Statement</title>
  <style>
  @page{size:A4 portrait;margin:0}
  *{box-sizing:border-box}html,body{margin:0;padding:0;background:#e8ecf0;color:#1c2c3a;font-family:Arial,Helvetica,sans-serif}
  .tools{max-width:794px;margin:16px auto;padding:0 4px;display:flex;gap:9px;align-items:center}
  .tools button,.tools a{border:1px solid #c9d3dc;border-radius:8px;min-height:42px;padding:10px 15px;font-size:13px;font-weight:750;background:white;color:#23384a;text-decoration:none;cursor:pointer}
  .tools button{background:#b9232b;color:#fff;border-color:#b9232b}
  .statement-page{position:relative;width:794px;height:1120px;margin:0 auto 16px;padding:40px 43px 104px;background:white;overflow:hidden;box-shadow:0 12px 28px #14263818}
  .doc-header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #b9232b;padding-bottom:14px;gap:16px}
  .identity{display:flex;gap:10px;align-items:center}.identity img{width:39px;height:39px;object-fit:contain}
  .identity strong{font-size:25px;letter-spacing:.06em}.identity strong b{color:#b9232b}
  .identity small{font-size:10px;color:#657583;display:block;margin-top:3px}
  .doc-type{font-weight:900;font-size:10px;line-height:1.45;letter-spacing:.08em;color:#6a7b89;text-align:right}
  .doc-heading{padding:21px 0 12px}.doc-heading>span,.overline{font-size:10px;letter-spacing:.13em;color:#a52a31;font-weight:900}
  .doc-heading h1{font-size:24px;line-height:1.24;margin:7px 0 5px}
  .doc-heading p{margin:0;font-size:11px;color:#657583}
  .doc-content{font-size:12px}
  .hero{border:1px solid #dbe2e8;border-radius:9px;padding:15px}
  .hero h2{font-size:19px;margin:6px 0 13px}.hero h2 span{font-weight:500;font-size:15px}
  .meta-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .meta-grid span,.totals-grid span,.category-grid span{display:block;font-size:9px;text-transform:uppercase;color:#637585;margin-bottom:5px}
  .meta-grid strong{font-size:12px;overflow-wrap:anywhere}
  .featured{background:#192e40;color:white;padding:17px 20px;border-radius:9px;margin:14px 0}
  .featured span{font-size:10px;text-transform:uppercase;color:#d5dce4;letter-spacing:.12em}
  .featured strong{display:block;font-size:29px;margin:7px 0}.featured small{font-size:10px;color:#dde4eb;line-height:1.4}
  .totals-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
  .totals-grid>div,.category-grid>div{padding:10px;border:1px solid #dae3eb;background:#fbfcfd;border-radius:7px;min-height:57px}
  .totals-grid strong,.category-grid strong{display:block;font-size:12px}
  h3{font-size:13px;margin:16px 0 8px}.category-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .explain{padding:12px;background:#faf7f2;border-left:3px solid #b9232b;margin-top:14px}
  .explain strong{font-size:11px}.explain p{font-size:10px;line-height:1.5;margin:5px 0}
  .section-note{background:#f5f7f9;padding:10px 12px;margin:0 0 14px;font-size:11px;line-height:1.5;color:#4e6274;border-left:3px solid #b9232b}
  table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px}
  th,td{text-align:left;padding:9px 5px;border-bottom:1px solid #e0e5e9;vertical-align:top;word-wrap:break-word}
  th{font-size:9px;color:#607281;background:#f4f6f8;font-weight:800}
  td.numeric{text-align:right;white-space:normal;font-variant-numeric:tabular-nums}
  .doc-footer{position:absolute;left:43px;right:43px;bottom:33px;padding-top:12px;border-top:1px solid #d8e0e7;display:flex;align-items:flex-end;justify-content:space-between;gap:16px;font-size:9px;color:#6b7d8b}
  .doc-footer strong{display:block;color:#243746}.doc-footer span{display:block;margin-top:4px}
  .doc-footer>div:last-child{text-align:right;font-weight:900;font-size:11px}
  .doc-footer small{display:block;font-weight:400;color:#7b8995;margin-top:5px}
  @media(max-width:820px){.tools{padding:0 16px}.statement-page{transform-origin:top center;width:794px;max-width:none}}
  @media print{html,body{background:white!important;width:210mm!important;margin:0!important;padding:0!important}
    .tools{display:none!important}.statement-page{width:210mm!important;height:296.3mm!important;margin:0!important;padding:10.6mm 11.4mm 27.5mm!important;box-shadow:none!important;break-after:page!important;page-break-after:always!important}
    .statement-page:last-child{break-after:auto!important;page-break-after:auto!important}
    .doc-footer{left:11.4mm!important;right:11.4mm!important;bottom:8.7mm!important}
    .featured{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    table thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}
  }
  </style></head><body><div class="tools">
    <button type="button" onclick="window.print()">Print / Save PDF</button>
    <a href="/admin/billing/project-statement?fileId=${encodeURIComponent(p.code)}">Back to statement</a></div>
    <main class="statement-pages">${sheets}</main>${autoScript}</body></html>`;
}
