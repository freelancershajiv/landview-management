const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const modulePromise = import(pathToFileURL(path.resolve(__dirname, "../lib/project-finance-core.mjs")).href);
const baseConfig = {
  enabled: true,
  cutoverAt: "2026-10-11T16:45:40.777187+00:00",
  openingCash: 307588.21,
  openingHeldCheques: [],
};

test("LV-157 cutover cash only changes from post-cutover entries", async () => {
  const { calculateProjectFinanceV2Snapshot } = await modulePromise;
  const rows = [
    { id:"old", created_at:"2026-10-01T00:00:00Z", debit:999999, credit:0, approval_status:"approved" },
    { id:"a", created_at:"2026-10-12T09:52:04Z", entry_type:"expense", debit:0, credit:1200, approval_status:"approved", supplier_movement_type:"direct_purchase", supplier_advance_applied:0 },
    { id:"b", created_at:"2026-10-12T12:03:12Z", entry_type:"expense", debit:0, credit:10005, approval_status:"approved" },
    { id:"c", created_at:"2026-10-12T13:03:20Z", entry_type:"expense", debit:0, credit:7200, approval_status:"approved" },
  ];
  const result = calculateProjectFinanceV2Snapshot(rows, baseConfig);
  assert.equal(result.cashBalance, 289183.21);
  assert.equal(result.postCutoverCashDelta, -18405);
  assert.equal(result.postCutoverEntryCount, 3);
});

test("held cheques do not become cash until cashed", async () => {
  const { calculateProjectFinanceV2Snapshot } = await modulePromise;
  const config = { ...baseConfig, openingCash:1000, openingHeldCheques:[{id:"held-old", amount:500}] };
  const heldRows = [
    { id:"held-old", created_at:"2026-10-10T00:00:00Z", debit:500, credit:0, payment_method:"cheque", cheque_status:"on_hold", approval_status:"approved" },
    { id:"held-new", created_at:"2026-10-12T00:00:00Z", debit:200, credit:0, payment_method:"cheque", cheque_status:"on_hold", approval_status:"approved" },
  ];
  const before = calculateProjectFinanceV2Snapshot(heldRows, config);
  assert.equal(before.cashBalance, 1000);
  assert.equal(before.chequeOnHold, 700);

  heldRows[0].cheque_status = "cashed";
  heldRows[1].cheque_status = "cashed";
  const after = calculateProjectFinanceV2Snapshot(heldRows, config);
  assert.equal(after.cashBalance, 1700);
  assert.equal(after.chequeOnHold, 0);
});

test("supplier movements affect cash only once", async () => {
  const { calculateProjectFinanceV2Snapshot } = await modulePromise;
  const rows = [
    { id:"fund", created_at:"2026-10-12T00:00:00Z", debit:10000, credit:0, source_type:"supplier_advance_fund", supplier_movement_type:"advance_fund", approval_status:"approved" },
    { id:"delivery", created_at:"2026-10-12T01:00:00Z", debit:0, credit:6000, source_type:"supplier_delivery", supplier_movement_type:"delivery", approval_status:"approved" },
    { id:"purchase", created_at:"2026-10-12T02:00:00Z", debit:0, credit:5000, source_type:"supplier_direct_purchase", supplier_movement_type:"direct_purchase", supplier_advance_applied:3000, approval_status:"approved" },
    { id:"advance", created_at:"2026-10-12T03:00:00Z", debit:0, credit:1500, source_type:"supplier_advance_cash", approval_status:"approved" },
  ];
  const result = calculateProjectFinanceV2Snapshot(rows, { ...baseConfig, openingCash:20000 });
  assert.equal(result.postCutoverCashDelta, -3500);
  assert.equal(result.cashBalance, 16500);
});

test("unapproved rows are excluded from finance v2 cash", async () => {
  const { calculateProjectFinanceV2Snapshot } = await modulePromise;
  const rows = [
    { id:"pending", created_at:"2026-10-12T00:00:00Z", debit:5000, credit:0, approval_status:"pending" },
    { id:"rejected", created_at:"2026-10-12T00:01:00Z", debit:0, credit:1000, approval_status:"rejected" },
  ];
  const result = calculateProjectFinanceV2Snapshot(rows, { ...baseConfig, openingCash:1234.56 });
  assert.equal(result.cashBalance, 1234.56);
  assert.equal(result.postCutoverEntryCount, 0);
});
