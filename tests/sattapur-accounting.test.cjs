/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const modulePromise = import(pathToFileURL(path.resolve(__dirname, "../lib/sattapur-accounting.mjs")).href);

test("Sattapur bank transfer is an expense and supplier deposit, not a delivery", async () => {
  const { accountingRows, isSattapurDelivery, isSattapurPayment, sattapurSnapshot } = await modulePromise;
  const payment = {
    id: "pay-bank",
    entry_date: "2026-10-13",
    created_at: "2026-10-13T01:00:00Z",
    paid_to: "Sattapur Brick Field",
    details: "Advance for bricks",
    debit: 0,
    credit: 500000,
    category: "Bricks",
    payment_method: "Bank Transfer",
    source: "supplier_advance_cash",
    source_type: "supplier_advance_cash",
    supplier_movement_type: "advance_fund",
  };

  assert.equal(isSattapurPayment(payment), true);
  assert.equal(isSattapurDelivery(payment), false);
  const cashRows = accountingRows([payment]);
  assert.equal(cashRows.length, 1);
  assert.equal(cashRows[0].credit, 500000);
  assert.equal(cashRows[0].debit, 0);

  const snapshot = sattapurSnapshot([payment]);
  assert.equal(snapshot.depositAmount, 500000);
  assert.equal(snapshot.deliveredValue, 0);
  assert.equal(snapshot.holdAmount, 500000);
  assert.equal(snapshot.ledger[0].type, "Deposit");
  assert.equal(snapshot.ledger[0].paymentMethod, "Bank Transfer");
  assert.equal(snapshot.ledger[0].runningDeposit, 500000);
});

test("Sattapur cheque payment funds deposit and brick delivery consumes it without a second cash expense", async () => {
  const { accountingRows, sattapurSnapshot } = await modulePromise;
  const rows = [
    {
      id: "pay-cheque",
      entry_date: "2026-10-13",
      created_at: "2026-10-13T01:00:00Z",
      paid_to: "Sattapur Brick Field",
      details: "Cheque advance for bricks",
      debit: 0,
      credit: 500000,
      category: "Bricks",
      payment_method: "Cheque",
      source: "supplier_advance_cash",
      source_type: "supplier_advance_cash",
      supplier_movement_type: "advance_fund",
    },
    {
      id: "delivery-1",
      entry_date: "2026-10-14",
      created_at: "2026-10-14T01:00:00Z",
      paid_to: "Sattapur Brick Field",
      supplier: "Sattapur Brick Field",
      details: "Brick delivery challan 1",
      debit: 0,
      credit: 180000,
      category: "Bricks",
      sft: 12000,
      rate: 15,
      source: "sattapur_bricks_delivery",
      source_type: "supplier_delivery",
      supplier_movement_type: "delivery",
    },
  ];

  const cashRows = accountingRows(rows);
  assert.equal(cashRows.length, 1);
  assert.equal(cashRows[0].id, "pay-cheque");
  assert.equal(cashRows[0].credit, 500000);

  const snapshot = sattapurSnapshot(rows);
  assert.equal(snapshot.depositAmount, 500000);
  assert.equal(snapshot.deliveredValue, 180000);
  assert.equal(snapshot.holdAmount, 320000);
  assert.equal(snapshot.overDeliveredValue, 0);
  assert.deepEqual(snapshot.ledger.map((row) => [row.type, row.runningDeposit]), [
    ["Deposit", 500000],
    ["Delivery", 320000],
  ]);
});

test("legacy Sattapur debit deposit is reclassified as an expense for full-ledger accounting", async () => {
  const { accountingRows, sattapurSnapshot } = await modulePromise;
  const legacy = {
    id: "legacy-deposit",
    entry_date: "2026-01-10",
    paid_to: "Sattapur Brick Field",
    details: "Sattapur advance",
    debit: 250000,
    credit: 0,
    category: "Cheque",
  };

  const cashRows = accountingRows([legacy]);
  assert.equal(cashRows.length, 1);
  assert.equal(cashRows[0].debit, 0);
  assert.equal(cashRows[0].credit, 250000);
  assert.equal(cashRows[0].category, "Bricks");
  assert.equal(cashRows[0].payment_method, "Cheque");
  assert.equal(cashRows[0].supplier_movement_type, "advance_fund");

  const snapshot = sattapurSnapshot([legacy]);
  assert.equal(snapshot.depositAmount, 250000);
  assert.equal(snapshot.holdAmount, 250000);
});

test("two protected historical dates are not reclassified as Sattapur accounting", async () => {
  const { accountingRows, sattapurSnapshot } = await modulePromise;
  const rows = [
    { id: "protected-1", entry_date: "2025-11-20", paid_to: "Sattapur Brick Field", debit: 1000, credit: 0, category: "Cheque" },
    { id: "protected-2", entry_date: "2025-11-23", paid_to: "Sattapur Brick Field", debit: 2000, credit: 0, category: "Cheque" },
  ];

  const cashRows = accountingRows(rows);
  assert.equal(cashRows[0].debit, 1000);
  assert.equal(cashRows[1].debit, 2000);
  const snapshot = sattapurSnapshot(rows);
  assert.equal(snapshot.depositAmount, 0);
});
