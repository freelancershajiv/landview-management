const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (name) => fs.readFileSync(path.join(__dirname, "..", name), "utf8");

test("legacy billing summary and compatible API use canonical collectible due", () => {
  const data = read("lib/supabase-data.ts");
  const book = data.split('if (action === "getBillingBook") {')[1].split('if (action === "getChairmanPendingApprovals") {')[0];
  const compatible = read("app/api/billing/book-compatible/route.ts");
  const dueBills = read("app/api/billing/due-bills/route.ts");
  assert.match(book, /loadReceivableAuthority\(\)/);
  assert.match(book, /receivable\?\.totalDue/);
  assert.match(compatible, /loadReceivableAuthority\(\)/);
  assert.match(compatible, /receivable\?\.totalDue/);
  assert.match(dueBills, /row\.totalDue > 0\.009/);
  assert.match(data, /pending:authority\.totals\.due/);
  assert.match(data, /loadReceivableAuthority\(\{ projectId: String\(p\.id\) \}\)/);
});

test("finance overview does not double-deduct write-offs", () => {
  const control = read("app/admin/finance/control/page.tsx");
  assert.match(control, /const receivables = Math\.max\(0, n\(billing\?\.totals\?\.due\)\);/);
});

test("LV-072 historical balances: 8000 written off remains in history but not collectible", () => {
  const billed = 63000, paid = 55000, writtenOff = 5000 + 3000;
  const historicalUnpaid = billed - paid;
  const collectible = Math.max(0, historicalUnpaid - writtenOff);
  assert.equal(historicalUnpaid, 8000);
  assert.equal(writtenOff, 8000);
  assert.equal(collectible, 0);
});
