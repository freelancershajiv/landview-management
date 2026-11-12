const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const source = read("lib/sheet-invoices.ts");
const start = source.indexOf("export function attachInvoicePaymentReview");
const end = source.indexOf("type InvoiceCategoryName", start);
assert.ok(start > -1 && end > start, "Read-only statement reconciliation function exists");
const js = ts.transpileModule(source.slice(start,end), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const exported = {};
new Function("exports", js)(exported);
const attach = exported.attachInvoicePaymentReview;
const base = () => ({
  id: "LV-281",
  invoices: [
    { name: "Engineering", paid: 300, gross: 1000, discount: 0, due: 700 },
    { name: "Supervision", paid: 0, gross: 500, discount: 0, due: 500 },
  ],
  totals: { gross: 1500, paid: 300, discount: 0, due: 1200 },
});
const review = (complete = true) => ({
  complete,
  summary: { collectibleDue: 400, categoryDue: { Engineering: 200, "Design Books": 0, Supervision: 200, Others: 0 } },
  payments: [],
});

test("canonical collectible balance replaces arithmetic due only for complete snapshot", () => {
  const original = base();
  const next = attach(original, review());
  assert.equal(next.totals.due, 400);
  assert.deepEqual(next.invoices.map(x => x.due), [200,200]);
  assert.equal(next.totals.paid, 300);
  assert.equal(original.totals.due, 1200, "input must not mutate");
  assert.equal(original.invoices[0].due, 700);
});
test("incomplete snapshot keeps former due and signals review", () => {
  const next = attach(base(), review(false));
  assert.equal(next.totals.due, 1200);
  assert.equal(next.paymentReview.complete, false);
});
test("missing snapshot is backwards compatible", () => {
  const original = base();
  assert.equal(attach(original), original);
});
test("billing API returns allocations, receipt data and statuses without payment writes", () => {
  const api = read("app/api/project-billing/route.ts");
  assert.match(api, /const paymentReview = \{/);
  assert.match(api, /const effectivePayments = authority\.payments\.filter\(\(row\) => row\.effective\)/);
  assert.match(api, /receiptMatch = .*verify.*receipt/);
  assert.match(api, /receiptMatch \? .*verify\/receipt/);
  assert.doesNotMatch(api, /receiptUrl: \^https\?:/);
  assert.match(api, /allocationStatus:/);
  assert.match(api, /historicalPaidReviewCount:/);
  assert.doesNotMatch(api, /insertRows\(|updateRows\(|deleteRows\(/);
});
test("single invoice omits unrelated project-wide review", () => {
  const page = read("app/admin/finance/invoices/page.tsx");
  assert.match(page, /paymentReview: undefined, \/\/ A single invoice/);
  assert.match(page, /attachInvoicePaymentReview\(verified, bundle\.paymentReview\)/);
  const display = read("components/project-billing-document.tsx");
  assert.match(display, /result\.document\?\.kind === "single" \? undefined : result\.paymentReview/);
  assert.doesNotMatch(display, /gross\s*-\s*discount\s*-\s*paid\s*=\s*due/i);
});
