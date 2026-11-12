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
