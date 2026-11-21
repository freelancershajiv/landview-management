const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const read = path => fs.readFileSync(path,"utf8");

// Regression: finance APIs must not expose all-client monetary data to employee sessions.
test("write-offs and due-bills exclude employee read access", () => {
  for (const path of ["app/api/billing/writeoffs/route.ts","app/api/billing/due-bills/route.ts"]) {
    const src = read(path);
    assert.match(src, /const FINANCE_ROLES = new Set\(\["admin", "manager", "accounts"\]\)/);
    assert.doesNotMatch(src, /const FINANCE_ROLES = new Set\([^\n]*"employee"/);
    assert.match(src, /if \(!FINANCE_ROLES\.has\(roleOf\(user\)\)\)/);
  }
});

test("billing adjustments guard both read and write using finance roles", () => {
  const src = read("app/api/billing/adjustments/route.ts");
  assert.match(src, /const WRITE_ROLES = new Set\(\["admin", "manager", "accounts"\]\)/);
  assert.match(src, /if \(write && !WRITE_ROLES\.has\(role\)\)/);
  assert.match(src, /if \(!write && !WRITE_ROLES\.has\(role\)\)/);
  assert.doesNotMatch(src, /\[\.\.\.WRITE_ROLES, "employee"\]/);
});

test("financial mutation routes retain same-origin validation", () => {
  for (const path of ["app/api/billing/writeoffs/route.ts","app/api/billing/adjustments/route.ts"]) {
    const src=read(path);
    assert.match(src,/function sameOrigin\(/);
    assert.match(src,/if \(!sameOrigin\(request\)\)/);
  }
});
