const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root,file), "utf8");

test("payment reconciliation applies canonical due only after a complete read", () => {
  const model = read("lib/sheet-invoices.ts");
  assert.match(model, /export function attachInvoicePaymentReview\(/);
  assert.match(model, /if \(!review\) return billing/);
  assert.match(model, /if \(!review\.complete\) return \{ \.\.\.billing, paymentReview: review \}/);
  assert.match(model, /due: Math\.max\(0, \(review\.summary\.categoryDue as Record<string, number>\)\[category\.name\] \?\? category\.due\)/);
  assert.match(model, /due: Math\.max\(0, review\.summary\.collectibleDue\)/);
  assert.match(model, /totals: \{ \.\.\.billing\.totals/);
});

test("source read model keeps payment receipt, allocation and due amounts separate", () => {
  const api = read("app/api/project-billing/route.ts");
  assert.match(api, /const paymentReview = \{/);
  assert.match(api, /const effectivePayments = authority\.payments\.filter\(\(row\) => row\.effective\)/);
  assert.match(api, /received: effectivePayments\.reduce/);
  assert.match(api, /allocated: effectivePayments\.reduce/);
  assert.match(api, /unallocated: effectivePayments\.reduce/);
  assert.match(api, /collectibleDue: projectReceivable\?\.totalDue/);
  assert.match(api, /historicalPaidReviewCount:/);
  assert.doesNotMatch(api, /insertRows\(|updateRows\(|deleteRows\(/);
});

test("receipt destinations are restricted to validated internal verification paths", () => {
  const api = read("app/api/project-billing/route.ts");
  assert.match(api, /receiptMatch = .*verify.*receipt/);
  assert.match(api, /receiptMatch \? .*verify\/receipt/);
  assert.match(api, /receiptUrl: receiptMatch/);
  assert.doesNotMatch(api, /receiptUrl: \^https\?:/);
});

test("single invoice never inherits the project-wide payment review", () => {
  const page = read("app/admin/finance/invoices/page.tsx");
  assert.match(page, /paymentReview: undefined, \/\/ A single invoice/);
  assert.match(page, /attachInvoicePaymentReview\(verified, bundle\.paymentReview\)/);
  const display = read("components/project-billing-document.tsx");
  assert.match(display, /result\.document\?\.kind === "single" \? undefined : result\.paymentReview/);
  assert.match(display, /<th>Unallocated \(BDT\)<\/th>/);
  assert.doesNotMatch(display, /gross\s*-\s*discount\s*-\s*paid\s*=\s*due/i);
});

test("test harness never evaluates loaded application source", () => {
  const currentTest = read("tests/invoice-payment-review.test.cjs");
  assert.doesNotMatch(currentTest, /new Function|eval\(|runInNewContext|transpileModule/);
});
