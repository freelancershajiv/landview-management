const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = (path) => fs.readFileSync(path, "utf8");
const batch = read("app/api/billing/batch/route.ts");
const full = read("app/admin/finance/direct-bill/direct-full-bill-workspace.tsx");
const payment = read("app/admin/finance/service-payments/page.tsx");
const paymentApi = read("app/api/billing/write/route.ts");
const status = read("app/api/billing/submission-status/route.ts");
const nav = read("components/billing-navigation.tsx");
const home = read("app/admin/finance/page.tsx");
const layout = read("app/admin/finance/layout.tsx");
const config = read("next.config.ts");
const dock = read("components/admin-mobile-dock.tsx");
const jump = read("components/billing-project-jump.tsx");

test("billing V4 has a canonical /admin/billing route with legacy redirects and existing route handlers", () => {
  assert.match(config, /source: "\/admin\/billing\/:path\*", destination: "\/admin\/finance\/:path\*"/);
  assert.match(config, /source: "\/admin\/finance\/:path\*", destination: "\/admin\/billing\/:path\*"/);
  assert.match(layout, /<BillingNavigation \/>/);
  assert.match(nav, /\/admin\/billing\/service-payments/);
  assert.match(dock, /href: "\/admin\/billing"/);
  assert.match(home, /<BillingProjectJump \/>/);
  assert.match(jump, /\/admin\/billing\/all/);
});

test("full bill submission inserts all service rows as one atomic server-side transaction", () => {
  assert.match(full, /fetch\("\/api\/billing\/batch"/);
  assert.doesNotMatch(full, /for \(const \[index, line\] of activeLines\.entries\(\)\)/);
  assert.match(batch, /await insertRows\("bills", rows\)/);
  assert.match(batch, /const rows = checked\.map/);
  assert.match(batch, /idempotencyKey: `billing-v4:/);
  assert.match(batch, /inFilters: \{ idempotency_key: keys \}/);
  assert.match(batch, /verifiedBatch\(matchingBills\)/);
  assert.match(batch, /verifiedBatch\(persisted\)/);
  assert.match(batch, /ROLES\.has\(roleOf\(user\)\)/);
  assert.match(batch, /if \(!sameOrigin\(request\)\)/);
  assert.doesNotMatch(batch, /deleteRows\(|updateRows\(|alter table|create table/i);
});

test("advance payments use canonical project/category safeguards and preserve pending submission key", () => {
  assert.match(payment, /Receive Advance \/ Extra Payment/);
  assert.match(payment, /Receive_Advance: advanceMode/);
  assert.match(payment, /Idempotency_Key: key/);
  assert.match(payment, /sessionStorage\.setItem\(pendingStorageKey/);
  assert.match(payment, /await fingerprint\(payload\)/);
  assert.match(payment, /checkPending\(\)/);
  assert.match(paymentApi, /const receiveAdvance = body\.Receive_Advance === true/);
  assert.match(paymentApi, /BILLING_CATEGORIES\.has\(paymentCategory\)/);
  assert.match(paymentApi, /idempotency_key: idempotencyKey/);
  assert.match(paymentApi, /existing\.length && !matches\(existing\)/);
  assert.match(paymentApi, /item\.billingCategory === "Other Services Bill"/);
  assert.doesNotMatch(paymentApi, /OTHER_SERVICE_TYPES/);
  assert.match(status, /filters: \{ idempotency_key: key \}/);
  assert.match(status, /String\(payment\.project_id\) !== String\(project\.id\)/);
});

test("ledger and outsourcing remain separate and old financial data is not rewritten during navigation", () => {
  assert.match(nav, /Accounts & Ledger \(separate\)/);
  assert.match(home, /Accounting, cash\/bank ledger/);
  assert.match(read("components/management-shell-v5.tsx"), /label: "Billing & Accounts"/);
  assert.match(read("app/admin/finance/billing-v4-accessibility.css"), /@media screen/);
  assert.doesNotMatch(read("app/admin/finance/billing-v4-accessibility.css"), /@media print|create table|alter table/i);
});
