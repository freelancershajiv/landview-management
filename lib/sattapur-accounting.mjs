function num(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function clean(value, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function lower(value) {
  return clean(value).toLowerCase();
}

function paymentMethodOf(row) {
  const explicit = clean(row?.payment_method, 40);
  if (explicit) return explicit;
  const category = lower(row?.category);
  if (category === "cheque") return "Cheque";
  if (category === "bank transfer" || category === "bank_transfer") return "Bank Transfer";
  if (category === "cash") return "Cash";
  return "";
}

export function isSattapur(row) {
  const date = String(row?.entry_date || "").slice(0, 10);
  // These two historical rows are intentionally ordinary project entries.
  if (date === "2025-11-20" || date === "2025-11-23") return false;
  const party = lower(row?.paid_to || row?.supplier || "");
  const details = lower(row?.details || "");
  return party.includes("sattapur") || details.includes("sattapur brick");
}

export function isSattapurDelivery(row) {
  if (!isSattapur(row) || num(row?.credit) <= 0) return false;
  const source = lower(row?.source_type || row?.source);
  const movement = lower(row?.supplier_movement_type);
  const memo = lower(row?.memo);
  if (source === "sattapur_bricks_delivery" || source === "supplier_delivery") return true;
  if (movement === "delivery") return true;
  if (memo.includes("sattpur_bricks_delivery") || memo.includes("sattapur_bricks_delivery")) return true;

  // Legacy deliveries predate explicit movement markers. Quantity/rate makes
  // them distinguishable from a supplier payment in the same Bricks category.
  return lower(row?.category) === "bricks"
    && (num(row?.sft) > 0 || num(row?.rate) > 0)
    && source !== "supplier_advance_cash";
}

export function isLegacySattapurDeposit(row) {
  return isSattapur(row)
    && !isSattapurDelivery(row)
    && num(row?.debit) > 0
    && num(row?.credit) === 0;
}

export function isSattapurPayment(row) {
  return isSattapur(row)
    && !isSattapurDelivery(row)
    && num(row?.credit) > 0
    && num(row?.debit) === 0;
}

export function normalizeSattapurCashRow(row) {
  if (!isLegacySattapurDeposit(row)) return row;
  const amount = num(row?.debit);
  const paymentMethod = paymentMethodOf(row);
  return {
    ...row,
    debit: 0,
    credit: amount,
    category: "Bricks",
    payment_method: paymentMethod || "Bank Transfer",
    entry_type: "expense",
    source: "supplier_advance_cash",
    source_type: "supplier_advance_cash",
    supplier_movement_type: "advance_fund",
    legacy_sattapur_original_debit: amount,
    legacy_sattapur_reclassified: true,
  };
}

export function accountingRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => !isSattapurDelivery(row))
    .map(normalizeSattapurCashRow);
}

export function sattapurSnapshot(rows) {
  const ledgerRows = Array.isArray(rows) ? rows : [];
  const depositRows = ledgerRows
    .filter((row) => isLegacySattapurDeposit(row) || isSattapurPayment(row))
    .map(normalizeSattapurCashRow);
  const deliveryRows = ledgerRows.filter(isSattapurDelivery);

  const depositAmount = depositRows.reduce((sum, row) => sum + num(row?.credit), 0);
  const deliveredQuantity = deliveryRows.reduce((sum, row) => sum + num(row?.sft), 0);
  const deliveredValue = deliveryRows.reduce((sum, row) => sum + num(row?.credit), 0);
  const holdAmount = Math.max(0, depositAmount - deliveredValue);
  const overDeliveredValue = Math.max(0, deliveredValue - depositAmount);

  const deposits = depositRows.map((row) => ({
    id: row.id,
    date: row.entry_date,
    createdAt: row.created_at || "",
    details: row.details,
    amount: num(row.credit),
    category: "Bricks",
    paymentMethod: paymentMethodOf(row) || "—",
    memo: row.memo || "",
    legacyReclassified: Boolean(row.legacy_sattapur_reclassified),
  }));

  const deliveries = deliveryRows
    .slice()
    .sort((a, b) => String(b.entry_date || "").localeCompare(String(a.entry_date || "")))
    .map((row) => ({
      id: row.id,
      date: row.entry_date,
      createdAt: row.created_at || "",
      details: row.details,
      quantity: num(row.sft),
      rate: num(row.rate),
      value: num(row.credit),
      memo: row.memo || "",
    }));

  const movements = [
    ...deposits.map((row) => ({
      id: `deposit-${row.id}`,
      sourceId: row.id,
      date: row.date,
      createdAt: row.createdAt,
      type: "Deposit",
      details: row.details,
      paymentMethod: row.paymentMethod,
      deposit: row.amount,
      delivery: 0,
      effect: row.amount,
      memo: row.memo,
    })),
    ...deliveries.map((row) => ({
      id: `delivery-${row.id}`,
      sourceId: row.id,
      date: row.date,
      createdAt: row.createdAt,
      type: "Delivery",
      details: row.details,
      paymentMethod: "—",
      deposit: 0,
      delivery: row.value,
      effect: -row.value,
      quantity: row.quantity,
      rate: row.rate,
      memo: row.memo,
    })),
  ].sort((a, b) => {
    const dateOrder = String(a.date || "").localeCompare(String(b.date || ""));
    if (dateOrder) return dateOrder;
    const createdOrder = String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    if (createdOrder) return createdOrder;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });

  let runningDeposit = 0;
  const ledger = movements.map((movement) => {
    runningDeposit += num(movement.effect);
    return { ...movement, runningDeposit };
  });

  return {
    depositAmount,
    depositCount: deposits.length,
    deliveredQuantity,
    deliveredValue,
    deliveryCount: deliveries.length,
    holdAmount,
    overDeliveredValue,
    deposits,
    deliveries,
    ledger,
  };
}
