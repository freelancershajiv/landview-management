const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = (file) => fs.readFileSync(file, "utf8");

const page = read("app/admin/finance/writeoffs/page.tsx");
const css = read("app/admin/finance/writeoffs/writeoffs.css");
const api = read("app/api/billing/writeoffs/route.ts");
const due = read("app/admin/finance/due-bills/page.tsx");
const nav = read("components/billing-navigation.tsx");
const layout = read("app/admin/finance/layout.tsx");
const rewrite = read("next.config.ts");

test("write-off UI is reachable from billing overview, navigation and both Due Bills views", () => {
  assert.match(rewrite, /source: "\/admin\/billing\/:path\*", destination: "\/admin\/finance\/:path\*"/);
  assert.match(nav, /\/admin\/billing\/writeoffs/);
  assert.match(layout, /<BillingNavigation\s*\/>/);
  assert.equal((due.match(/\/admin\/billing\/writeoffs\?fileId=/g) || []).length, 2);
});

test("write-off and recovery use separate audited API actions with confirmations and idempotency", () => {
  assert.match(page, /action === "saveWriteOff"/);
  assert.match(page, /action === "recoverWriteOff"/);
  assert.match(page, /fetch\(url, \{ credentials: "same-origin"/);
  assert.match(page, /readJson\("\/api\/billing\/writeoffs"/);
  assert.match(page, /crypto\.randomUUID\(\)/);
  assert.match(page, /window\.confirm\(prompt\)/);
  assert.match(page, /value > limit \+ 0\.009/);
  assert.match(page, /reason\.trim\(\) \|\| !notes\.trim\(\)/);
  assert.match(api, /WRITEOFF_ROLES = new Set\(\["admin", "manager", "accounts"\]\)/);
  assert.match(api, /supabaseGateway\("applyBillingWriteOff"/);
  assert.match(api, /supabaseGateway\("recoverBillingWriteOff"/);
  assert.match(api, /sameOrigin\(request\)/);
});

test("write-offs preserve original billing and use live due balances; recoveries record genuine payments", () => {
  assert.match(page, /readJson\("\/api\/billing\/due-bills"\)/);
  assert.match(page, /categoryDue\(matchingDue, category\)/);
  assert.match(page, /activeByCategory/);
  assert.match(page, /No payment will be recorded/);
  assert.match(page, /Recovery creates a real client payment/);
  assert.doesNotMatch(page, /updateRows\(|deleteRows\(|\bDROP TABLE\b|\bTRUNCATE\b/i);
  assert.match(css, /@media\(max-width:560px\)/);
});
