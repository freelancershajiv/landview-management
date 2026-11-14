const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../lib/invoice-allocation-assessment.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const exportsObject = {};
new Function("exports", compiled)(exportsObject);
const classify = exportsObject.classifyInvoiceAllocation;
const base = { netAmount: 1000, allocatedAmount: 0, recordedPaid: 0, settled: false, invoiceCount: 1 };

test("invoice statuses are computed from linked allocations, not label text", () => {
  assert.equal(classify(base).status, "unpaid");
  assert.equal(classify({ ...base, allocatedAmount: 350, recordedPaid: 350 }).status, "partial");
  assert.equal(classify({ ...base, allocatedAmount: 1000, recordedPaid: 1000 }).status, "paid");
});

test("historical Paid without allocations is a review exception, not fresh due", () => {
  const result = classify({ ...base, settled: true, recordedPaid: 1000 });
  assert.equal(result.status, "review");
  assert.match(result.reason, /Do not create new debt/);
});

test("overallocations, missing invoice links, and mismatched paid amounts are reviewed", () => {
  assert.equal(classify({ ...base, allocatedAmount: 1200, recordedPaid: 1000 }).status, "review");
  assert.equal(classify({ ...base, invoiceCount: 0 }).status, "review");
  assert.equal(classify({ ...base, recordedPaid: 250 }).status, "review");
});

test("zero net bills have no remaining collectible amount", () => {
  assert.equal(classify({ ...base, netAmount: 0 }).status, "paid");
});
