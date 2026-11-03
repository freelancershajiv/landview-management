const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(__dirname, "../app/admin/finance/invoices/page.tsx"), "utf8");
// Exercise the actual JavaScript balance calculation extracted from the TSX handler.
const balanceSource = source.match(
  /  const explicitPaid = receivableItem\.billPaidAmount;[\s\S]*?  const due = Math\.max\(0, netAmount - paid\);/
)?.[0];
assert.ok(balanceSource, "single-bill payment balance calculation must be present");
const balance = new Function("receivableItem", "netAmount", "fullyPaid", balanceSource + "\nreturn { paid, due };");

test("LV-209 newly issued single bill with no allocated payment remains due", () => {
  assert.deepEqual(balance({ billPaidAmount: 0, billDueAmount: 0 }, 20_000, false), {
    paid: 0, due: 20_000,
  });
  assert.deepEqual(balance({ billPaidAmount: 0, billDueAmount: 20_000 }, 20_000, false), {
    paid: 0, due: 20_000,
  });
});

test("only allocated payments reduce that single bill's balance", () => {
  assert.deepEqual(balance({ billPaidAmount: 10_000, billDueAmount: 0 }, 20_000, false), {
    paid: 10_000, due: 10_000,
  });
  assert.deepEqual(balance({ billPaidAmount: 20_000, billDueAmount: 0 }, 20_000, false), {
    paid: 20_000, due: 0,
  });
});

test("due-only canonical record reconciles and missing values do not become zero", () => {
  assert.deepEqual(balance({ billDueAmount: 5_000 }, 20_000, false), {
    paid: 15_000, due: 5_000,
  });
  assert.deepEqual(balance({}, 20_000, false), { paid: 0, due: 20_000 });
});

test("single-bill status is computed from its own paid and due figures", () => {
  assert.match(source, /client: \{ \.\.\.result\.client, status: due > 0\.009/);
  assert.match(source, /extended\.billStatus = String\(row\[6\]\)/);
});
