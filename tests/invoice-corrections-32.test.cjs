const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");
const route = read("app/api/billing/allocation-corrections/route.ts");
const page = read("app/admin/finance/allocation-corrections/page.tsx");
const policy = read("lib/invoice-correction-policy.ts");
const history = read("app/api/billing-document-history/route.ts");
const invoicePage = read("app/admin/finance/invoices/page.tsx");

test("correction endpoints require session, finance role, same origin and admin approval", () => {
  assert.match(route, /await requireLocalSession\(request\)/);
  assert.match(route, /EDIT_ROLES\.includes\(roleOf\(user\)\)/);
  assert.match(route, /if \(!sameOrigin\(request\)\)/);
  assert.match(route, /roleOf\(user\) !== "admin"/);
  assert.match(route, /proposal\.requestedBy === actor/);
  assert.match(route, /user\.userId \|\| user\.User_ID \|\| user\.employeeId \|\| user\.Employee_ID/);
  assert.match(route, /reason\.length < 12/);
});
test("approval is one existing allocation reassignment with audited before/after", () => {
  assert.match(route, /allocationMoveError\(/);
  assert.match(route, /if \(!approved\) throw new Error/);
  assert.match(route, /updateRows\("payment_invoice_allocations", \{/);
  assert.match(route, /invoice_id: check\.allocation\.invoiceId/);
  assert.match(route, /allocated_amount: check\.allocation\.amount/);
  assert.match(route, /\}, \{ invoice_id: proposal\.toInvoiceId \}\)/);
  assert.match(route, /ACTION_APPLIED/);
  assert.match(route, /ACTION_FAILED/);
  assert.doesNotMatch(route, /updateRows\("(?:payments|bills|invoices|transactions)"/);
  assert.doesNotMatch(route, /deleteRows\(|upsertRows\(/);
  assert.match(route, /allocations\.length >= 5000/);
  assert.match(route, /entry\.toInvoiceId === toInvoiceId/);
});
test("cross-project, historical paid and capacity constraints fail closed", () => {
  assert.match(policy, /Cross-project allocation changes are prohibited/);
  assert.match(policy, /historical settled bill/);
  assert.match(policy, /same billing category/);
  assert.match(policy, /destination\.allocated \+ allocation\.amount > destination\.amount \+ 0\.01/);
});
test("ledger verification and history remain reviewable without mutating original bills", () => {
  assert.match(route, /invoiceLedgerComparison\(/);
  assert.match(route, /selectRows\("transactions"/);
  assert.match(route, /ledgerAvailable: ledgerRows\.available/);
  assert.match(history, /"billing\.allocation\.correction\.applied"/);
  assert.match(history, /"billing_adjustments"/);
  assert.match(invoicePage, /Invoice Revisions & Financial Corrections/);
  assert.match(invoicePage, /allocation-corrections\?projectId=/);
});
test("user must choose a specific recorded allocation and a compatible invoice", () => {
  assert.match(page, /loaded\.allocations\.filter\(\(item\) => item\.effective\)/);
  assert.match(page, /row\.category === activeInvoice\.category/);
  assert.match(page, /window\.confirm\(/);
  assert.match(page, /Approve/);
  assert.match(page, /Reject/);
});
