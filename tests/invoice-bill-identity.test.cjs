const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");
const invoicePage = read("app/admin/finance/invoices/page.tsx");
const invoiceMapping = read("lib/sheet-invoices.ts");

// Exercise the exact bill-selection predicate from the production invoice page.
// The predicate must never fall back to description+amount when either side has an ID.
const finderSource = invoicePage.match(
  /      const index = rows\.findIndex\(\(row, rowIndex\) => \{[\s\S]*?\n      \}\);/
)?.[0];
assert.ok(finderSource, "canonical row-matching predicate must be present");
const findRow = new Function(
  "rows", "used", "billId", "targetService", "targetAmount", "normalizedService", "moneyValue",
  finderSource + "\nreturn index;",
);
const normalizedService = (value) => String(value || "").trim().toLowerCase();
const moneyValue = (value) => Number(value);

const samePriced = [
  ["LV-999", "Structural Design", "20000", "1", "20000", "BILL-LV999-ONE"],
  ["LV-999", "Structural Design", "20000", "1", "20000", "BILL-LV999-TWO"],
];

test("same-priced services match their own permanent bill ID, not first display match", () => {
  const index = findRow(samePriced, new Set(), "BILL-LV999-TWO", "structural design", 20000, normalizedService, moneyValue);
  assert.equal(index, 1);
});

test("unknown bill ID fails closed rather than attaching another bill's paid/due values", () => {
  const index = findRow(samePriced, new Set(), "BILL-LV999-UNKNOWN", "structural design", 20000, normalizedService, moneyValue);
  assert.equal(index, -1);
});

test("legacy description matching is used only when neither item nor row has an ID", () => {
  const index = findRow([["LV-1", "Structural Design", "20000", "1", "20000", ""]], new Set(), "", "structural design", 20000, normalizedService, moneyValue);
  assert.equal(index, 0);
  const nonLegacyIndex = findRow(samePriced, new Set(), "", "structural design", 20000, normalizedService, moneyValue);
  assert.equal(nonLegacyIndex, -1);
});

test("bill identity survives sheet parsing, sorting and workspace merging", () => {
  assert.match(invoiceMapping, /const billId = String\(row\[5\] \?\? ""\)\.trim\(\)/);
  assert.match(invoiceMapping, /\.\.\.\(billId \? \{ billId \} : \{\}\)/);
  assert.match(invoiceMapping, /billId\.toLowerCase\(\) === existingId\.toLowerCase\(\)/);
  assert.match(invoiceMapping, /if \(billId \|\| existingId\)/);
});

test("single invoice picker excludes drafts and voided bills", () => {
  assert.match(invoicePage, /\["draft", "void", "voided", "cancelled", "canceled", "rejected"\]\.includes\(status\)/);
  assert.match(invoicePage, /billId \|\| ""\)\.startsWith\("BILL-"\)/);
});
