const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const read = (p) => readFileSync(join(__dirname, "..", p), "utf8");
test("invoice views conditionally render discount rows and columns", () => {
  const original = read("components/project-billing-document.tsx");
  const printed = read("components/project-billing-document-revamp.tsx");
  assert.match(original, /export function hasInvoiceDiscount/);
  assert.match(original, /\{showDiscount && <tr><td colSpan=\{2\}><strong>Total Discount/);
  assert.match(original, /hasInvoiceDiscount\(category\) && <div><span>Discount \(BDT\)/);
  assert.match(printed, /const showDiscount = hasInvoiceDiscount\(category\)/);
  assert.match(printed, /\{showDiscount && <th>DISCOUNT<\/th>\}/);
  assert.match(printed, /\{showDiscount && <div><span>Discount \(BDT\)/);
  assert.match(printed, /simpleEngineeringBill \? <><col \/><col \/><col \/><\/>/);
});
