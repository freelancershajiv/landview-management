const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const read = (p) => readFileSync(join(__dirname, "..", p), "utf8");

test("project billing reconciliation is read-only and keyed to canonical invoice allocations", () => {
  const api = read("app/api/project-billing/route.ts");
  assert.match(api, /selectRows\("payment_invoice_allocations"/);
  assert.match(api, /paymentById\.get\(text\(allocation\.payment_id\)\)/);
  assert.match(api, /classifyInvoiceAllocation\(/);
  assert.match(api, /const reconciliationBills = authority\.bills\.map/);
  assert.match(api, /payment\.billCode\.toLowerCase\(\) === bill\.billCode\.toLowerCase\(\)/);
  assert.match(api, /reconciliation, commercial, lifecycle/);
  const newSection = api.split("// Reconciliation is read-only.")[1].split("return NextResponse.json")[0];
  assert.doesNotMatch(newSection, /updateRows|insertRows|upsertRows|deleteRows/);
});

test("single-bill PDF requires allocation review when paid amounts lack payment proof", () => {
  const screen = read("app/admin/finance/invoices/page.tsx");
  const print = read("components/project-billing-document-revamp.tsx");
  const original = read("components/project-billing-document.tsx");
  assert.match(screen, /const allocationReview = Math\.abs\(linkedAmount - paid\) > 0\.01/);
  assert.match(screen, /allocationReview,\n\s*allocatedAmount: linkedAmount/);
  assert.match(print, /const fullyPaid = !reviewNeeded && due <= 0\.009/);
  assert.match(print, /PAYMENT ALLOCATION REVIEW REQUIRED/);
  assert.match(original, /result\.document\?\.allocationReview \? "Allocation review required"/);
});

test("print includes net amount, received, balance due, and payment references", () => {
  const print = read("components/project-billing-document-revamp.tsx");
  assert.match(print, /Net Invoice Amount \(BDT\)/);
  assert.match(print, /Total Recorded Received \(BDT\)/);
  assert.match(print, /Balance Due \(BDT\)/);
  assert.match(print, /Ref: \{payment\.incomeId\}/);
});

test("the screen provides payment evidence, avoids categorizing advances as invoice receipts", () => {
  const page = read("app/admin/finance/invoices/page.tsx");
  const panel = read("components/invoice-payment-reconciliation-panel.tsx");
  assert.match(page, /<InvoicePaymentReconciliationPanel data=\{reconciliation\}/);
  assert.match(panel, /invoice-linked payments/);
  assert.match(panel, /payment\.paymentCode/);
  assert.match(panel, /Unallocated payments/);
  assert.match(panel, /Historical Paid entries are not automatically converted/);
});
