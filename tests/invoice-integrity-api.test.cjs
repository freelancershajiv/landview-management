const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (filename) => fs.readFileSync(path.join(__dirname, "..", filename), "utf8");
const route = read("app/api/billing/integrity/route.ts");
const page = read("app/admin/finance/integrity/page.tsx");

test("integrity API requires session and finance-admin role before reading data", () => {
  assert.match(route, /await requireLocalSession\(request\)/);
  assert.match(route, /\["admin", "manager", "accounts"\]\.includes\(roleOf\(user\)\)/);
  assert.ok(route.indexOf("await requireLocalSession(request)") < route.indexOf("await Promise.all(["));
});

test("integrity API is read only and never posts payments or changes billing", () => {
  assert.match(route, /export async function GET\(request: NextRequest\)/);
  assert.doesNotMatch(route, /export async function POST|export async function PATCH|export async function DELETE/);
  assert.doesNotMatch(route, /insertRows|updateRows|deleteRows|upsertRows|\.rpc\(/);
  for (const table of ["projects", "bills", "invoices", "payments", "payment_invoice_allocations"]) {
    assert.ok(route.includes(`selectRows("${table}"`), `must read ${table}`);
  }
});

test("paid-vs-allocation gap is explicitly a review exception, not an automatic debt", () => {
  assert.match(route, /status === "paid" && invoice/);
  assert.match(route, /allocated \+ 0\.01 < net/);
  assert.match(route, /type: "paid_allocation_gap"/);
  assert.match(page, /not<\/b> a verified outstanding receivable/);
});

test("integrity page is available from finance navigation", () => {
  const layout = read("app/admin/finance/layout.tsx");
  assert.match(layout, /href="\/admin\/finance\/integrity"/);
  assert.match(page, /fetch\("\/api\/billing\/integrity"/);
});
