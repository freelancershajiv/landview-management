const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const aliases = JSON.parse(read("tsconfig.json")).compilerOptions.paths;
const actual = read("components/project-billing-document-revamp.tsx");
const shared = read("components/project-billing-document.tsx");
const page = read("app/admin/finance/invoices/page.tsx");

test("the invoice route resolves to the actual print renderer", () => {
  assert.deepEqual(aliases["@/components/project-billing-document"], ["./components/project-billing-document-revamp"]);
  assert.match(page, /import ProjectBillingDocument/);
  assert.match(actual, /OriginalProjectBillingDocument/);
  assert.match(actual, /lvInvoiceRevampPrint/);
  assert.match(actual, /@media print/);
});

test("print payments now separate received, applied and unallocated", () => {
  assert.match(actual, /RECEIVED \(BDT\)/);
  assert.match(actual, /APPLIED \(BDT\)/);
  assert.match(actual, /UNALLOCATED \(BDT\)/);
  assert.match(actual, /APPLIED TO THIS INVOICE \(BDT\)/);
  assert.match(actual, /ledger \? amountText\(ledger\.allocated\) : "—"/);
  assert.match(actual, /ledger \? amountText\(ledger\.unallocated\) : "—"/);
  assert.match(actual, /colSpan=\{result\.document\?\.kind === "single" \? 4 : 6\}/);
  assert.doesNotMatch(actual, /<th>VERIFICATION<\/th><th>AMOUNT \(BDT\)<\/th>/);
});

test("the print summary has high contrast and avoids billing unallocated funds twice", () => {
  assert.match(actual, /\.lvInvoicePage \.lvReconciledPaymentRow\{display:grid!important/);
  assert.match(actual, /background:#eef2f6!important/);
  assert.match(actual, /\.lvInvoicePage \.lvReconciledPaymentRow span/);
  assert.match(actual, /const due = paymentReviewReady/);
  assert.match(actual, /Math\.max\(0, Number\(category\.due \|\| 0\), grandTotal - paid\)/);
  assert.match(actual, /fullyPaid \? "FULL PAID" : "NO DUE"/);
});

test("print identity, amounts and QR remain present", () => {
  assert.match(actual, /statementRef/);
  assert.match(actual, /billingQrSvg/);
  assert.match(actual, /grandTotal = Math\.max\(0, gross - discount\)/);
  assert.match(actual, /discount = Number\(category\.discount/);
  assert.match(actual, /\{amountInWords\(due\)\}/);
  assert.match(shared, /billLineAmounts/);
});

test("real print renderer resolves payment allocations using exact payment codes", () => {
  const page = read("app/admin/finance/invoices/page.tsx");
  const model = read("lib/sheet-invoices.ts");
  assert.match(page, /paymentAllocationLines: bundle\.billPayments/);
  assert.match(page, /paymentAllocationLines: undefined/);
  assert.match(model, /paymentAllocationLines\?: InvoiceAllocationLine\[\]/);
  assert.match(actual, /const ledgerForPayment = \(payment:/);
  assert.match(actual, /const allocationsByPaymentCode = new Map/);
  assert.match(actual, /const exact = paymentByCode\.get\(code\)/);
  assert.match(actual, /allocationsByPaymentCode\.get\(code\)/);
  assert.match(actual, /ledgerForPayment\(payment\)/);
  assert.match(actual, /allocated > received \+ 0\.01/);
  assert.doesNotMatch(actual, /find\(.*payment\.amount.*payment\.date/);
});

test("live print CSS supports six columns without clipping last header", () => {
  const css = read("app/admin/finance/invoices/invoice-revamp-print-fix.css");
  assert.match(css, /\.lvInvoiceRevampRoot \.lvInvoicePage \.lvDepositTable col:nth-child\(6\)/);
  assert.match(css, /\.lvInvoiceRevampRoot \.lvInvoicePage \.lvDepositTable th\{/);
  assert.match(css, /white-space:normal!important/);
  assert.match(css, /\.lvInvoiceRevampRoot \.lvInvoicePage \.lvSingleInvoiceDepositTable col:nth-child\(4\)/);
});

test("server sends exact authority allocation with each deposit sheet payment row", () => {
  const route = read("app/api/project-billing/route.ts");
  const mapping = read("lib/sheet-invoices.ts");
  assert.match(route, /const payRows = \(c: Category\) => groups\[c\]\.payments\.map/);
  assert.match(route, /p\.paymentCode,\s*p\.allocated,\s*p\.unallocated,/);
  assert.match(route, /"Applied to Invoices", "Unallocated"/);
  assert.match(mapping, /allocatedAmount: optionalBillingAmount\(row\[6\]\)/);
  assert.match(mapping, /unallocatedAmount: optionalBillingAmount\(row\[7\]\)/);
});
test("actual printed payment receives native source amount before any supplemental lookup", () => {
  const mapping = read("lib/sheet-invoices.ts");
  assert.match(actual, /typeof applied === "number" && Number\.isFinite\(applied\)/);
  assert.match(actual, /typeof unapplied === "number" && Number\.isFinite\(unapplied\)/);
  assert.match(actual, /Math\.abs\(received - applied - unapplied\) <= 0\.02/);
  assert.match(actual, /const exact = paymentByCode\.get\(code\)/);
  assert.match(actual, /allocationsByPaymentCode\.get\(code\)/);
  assert.match(actual, /allocated: applied,/);
  assert.match(actual, /unallocated: unapplied,/);
  assert.match(mapping, /allocatedAmount: undefined,/);
  assert.match(mapping, /unallocatedAmount: undefined,/);
});
