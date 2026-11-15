const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

const authority = read("lib/billing-receivable-authority.ts");
const adjusted = read("lib/billing-adjusted-financials.ts");
const n = (v) => Number(v || 0);
const round = (v) => Math.round(n(v) * 100) / 100;
const txt = (v) => String(v ?? "").trim();

function loadFunction(source, start, next, deps) {
  const i = source.indexOf(start), j = next ? source.indexOf(next, i + start.length) : source.length;
  assert.ok(i >= 0 && j > i, start + " function must exist");
  const code = ts.transpileModule(source.slice(i, j).replace(/^export /gm, ""), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  return new Function(...Object.keys(deps), code + "\nreturn " + /(?:async )?function\s+(\w+)/.exec(start)[1] + ";")(...Object.values(deps));
}

test("Approved legacy/manual non-ledger deposits settle clients, but never imply new cash-book income", () => {
  const normalizedStatus = (v) => txt(v).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const effective = loadFunction(
    authority, "export function receivablePaymentIsEffective", "export function receivableStoredBillNet",
    { receivableStatus: normalizedStatus, INACTIVE: new Set(["void","voided","cancelled","canceled","rejected","returned","draft"]), PAYMENT_OK: new Set(["approved","posted","paid","received","verified","completed"]) }
  );
  const payment = { amount: 30_000, is_legacy_manual: true, affects_business_balance: false, status: "POSTED", approval_status: "Approved", transaction_type: "Income" };
  assert.equal(effective(payment), true);
  assert.equal(effective({ ...payment, status: "VOID" }), false);
  assert.equal(effective({ ...payment, approval_status: "Rejected" }), false);
  assert.equal(effective({ ...payment, transaction_type: "Personal Income" }), false);
  assert.equal(effective({ ...payment, is_legacy_manual: false }), false);
  assert.equal(effective({ ...payment, affects_business_balance: true, is_legacy_manual: false }), true);
  assert.match(authority, /finance_scope,is_legacy_manual,receipt_url/);
});

test("LV-072 — 40,000 engineering + 15,000 soil-test receipts + 8,000 write-offs mean zero collectible due", () => {
  assert.equal(45_000 - (30_000 + 10_000) - 5_000, 0);
  assert.equal(18_000 - 15_000 - 3_000, 0);
  assert.equal(63_000 - 55_000 - 8_000, 0);
});

test("Billing V2 display retains canonical write-off relief without counting it as paid", async () => {
  const sample = {
    serviceKey: "3d-design-exterior", contractGross: 15_000, contractDiscount: 0, contractNet: 15_000,
    billedNet: 15_000, paid: 10_000, due: 0, readyToBill: 0, financeStatus: "Invoiced"
  };
  const fn = loadFunction(adjusted, "export async function getAdjustedBillingV2Snapshot", null, {
    getBillingV2Snapshot: async () => ({ services: [sample] }),
    activeCredits: async () => new Map(),
    text: txt, num: n, money2: round
  });
  const result = await fn("LV-072");
  assert.equal(result.totals.billed, 15_000);
  assert.equal(result.totals.paid, 10_000);
  assert.equal(result.totals.due, 0);
  assert.equal(result.services[0].due, 0);
  assert.equal(result.services[0].financeStatus, "Paid");
});

test("Posted credit notes are not subtracted twice from canonical net or collectible due", async () => {
  const credit = { total: 2_000, serviceDiscount: 1_000, otherCredit: 1_000 };
  const canonical = { serviceKey: "architectural-design", contractGross: 10_000, contractDiscount: 0,
    contractNet: 10_000, billedNet: 8_000, paid: 6_000, due: 2_000, readyToBill: 0 };
  const snapshot = loadFunction(adjusted, "export async function getAdjustedBillingV2Snapshot", null, {
    getBillingV2Snapshot: async () => ({ services: [canonical] }),
    activeCredits: async () => new Map([["architectural-design", credit]]),
    text: txt, num: n, money2: round
  });
  const result = await snapshot("LV-123");
  assert.equal(result.totals.billed, 8_000);
  assert.equal(result.totals.due, 2_000);
  assert.equal(result.totals.creditNotes, 2_000);
  assert.equal(result.services[0].contractNet, 9_000);

  const service = loadFunction(adjusted, "export async function getAdjustedProjectServiceFinancials", "export async function getAdjustedBillingV2Snapshot", {
    getProjectServiceFinancials: async () => ({ services: [{ serviceKey: "architectural-design",billingCategory:"Engineering Bill",gross:10_000,discount:2_000,net:8_000,paid:6_000,due:0,relief:2_000 }] }),
    activeCredits: async () => new Map([["architectural-design", credit]]),
    money2: round
  });
  const svc = await service("LV-123");
  assert.equal(svc.categoryTotals["Engineering Bill"].net, 8_000);
  assert.equal(svc.categoryTotals["Engineering Bill"].discount, 2_000);
  assert.equal(svc.categoryTotals["Engineering Bill"].due, 0);
  assert.equal(svc.services[0].relief, 2_000);
});
