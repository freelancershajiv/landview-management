const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

test("every single bill retains canonical invoice ID, issue date and bill-only payments", () => {
  const source = read("app/admin/finance/invoices/page.tsx");
  assert.match(source, /billInvoiceCode = String\(row\[11\]/);
  assert.match(source, /billIssueDate = String\(row\[12\]/);
  assert.match(source, /payment\.billCode\.toLowerCase\(\) === extended\.billId/);
  assert.match(source, /payments: receivableItem\.billPayments \|\| \[\]/);
  assert.match(source, /invoiceCode: String\(json\.invoiceCode\)/);
});

test("server emits allocations and invoice codes from canonical invoice records", () => {
  const source = read("app/api/project-billing/route.ts");
  assert.match(source, /payment_invoice_allocations/);
  assert.match(source, /paymentById\.get\(text\(allocation\.payment_id\)\)/);
  assert.match(source, /billInvoice\?\.invoiceCode/);
  assert.match(source, /billPayments, (?:reconciliation, )?commercial, lifecycle/);
});

test("invoice token is signed per bill, while old project tokens remain compatible", () => {
  const source = read("lib/billing-verification.ts");
  assert.match(source, /export function signBillVerification/);
  assert.match(source, /v: 5, f: normalizedFile, b: normalizedBill/);
  assert.match(source, /version: 5, fileId, billCode/);
  assert.match(source, /Number\(payload\?\.v\) === 4/);
  assert.match(source, /Number\(payload\?\.v\) === 3/);
});

test("public invoice verification excludes payments for other bills", () => {
  const source = read("lib/public-billing-verification.ts");
  assert.match(source, /invoiceIds\.has\(text\(entry\.invoice_id\)\)/);
  assert.match(source, /paymentsById\.get\(text\(entry\.payment_id\)\)/);
  assert.match(source, /const due = state\.dueBeforeRelief;/);
});

test("due-only printout never re-bills partially paid gross", () => {
  const source = read("components/project-billing-document-revamp.tsx");
  assert.match(source, /const dueBalance = Math\.max\(0, Number\(category\.due \|\| 0\)\)/);
  assert.match(source, /Math\.abs\(itemizedDue - dueBalance\) <= 0\.01/);
  assert.match(source, /gross: dueBalance/);
  assert.match(source, /due: dueBalance/);
});

test("invoice and statement generation have append-only audited snapshots", () => {
  const source = read("app/api/billing-verification/route.ts");
  assert.match(source, /action: "billing\.invoice\.generated"/);
  assert.match(source, /action: "billing\.statement\.generated"/);
  assert.match(source, /await insertRows\("app_audit_log"/);
  assert.doesNotMatch(source, /updateRows\("payments"/);
  assert.doesNotMatch(source, /updateRows\("bills"/);
});
