const EXCLUDED_APPROVAL_STATUSES = new Set(["pending", "rejected", "void", "voided", "cancelled", "canceled", "draft"]);

function num(value) {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function money(value) {
  return Math.round((num(value) + Number.EPSILON) * 100) / 100;
}

function lower(value) {
  return String(value ?? "").trim().toLowerCase();
}

function approved(row) {
  return !EXCLUDED_APPROVAL_STATUSES.has(lower(row?.approval_status));
}

function chequeStatus(row) {
  const explicit = lower(row?.cheque_status);
  if (explicit === "on_hold" || explicit === "cashed") return explicit;
  const memo = String(row?.memo ?? "");
  if (/^CHEQUE_STATUS:ON_HOLD/i.test(memo)) return "on_hold";
  if (/^CHEQUE_STATUS:CASHED/i.test(memo)) return "cashed";
  return "";
}

function isCheque(row) {
  return lower(row?.payment_method) === "cheque" || lower(row?.category) === "cheque";
}

function sourceOf(row) {
  return lower(row?.source_type || row?.source);
}

function movementOf(row) {
  return lower(row?.supplier_movement_type);
}

function rowCashDelta(row) {
  if (!approved(row)) return 0;
  const debit = Math.max(0, num(row?.debit));
  const credit = Math.max(0, num(row?.credit));
  const source = sourceOf(row);
  const movement = movementOf(row);
  const advanceApplied = Math.max(0, num(row?.supplier_advance_applied));

  if (debit > 0 && credit === 0) {
    if (isCheque(row) && chequeStatus(row) === "on_hold") return 0;
    if (source === "supplier_advance_fund" || movement === "advance_fund") return 0;
    return debit;
  }

  if (credit > 0 && debit === 0) {
    if (source === "supplier_delivery" || source === "sattapur_bricks_delivery" || movement === "delivery") return 0;
    if (source === "supplier_direct_purchase" || movement === "direct_purchase") {
      return -Math.max(credit - advanceApplied, 0);
    }
    return -credit;
  }

  return debit - credit;
}

function parseOpeningHeldCheques(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function calculateProjectFinanceV2Snapshot(rows, config) {
  if (!config?.enabled) return null;
  const cutoverMs = Date.parse(String(config?.cutoverAt || ""));
  if (!Number.isFinite(cutoverMs) || config?.openingCash === null || config?.openingCash === undefined) return null;

  const ledgerRows = Array.isArray(rows) ? rows : [];
  const rowsById = new Map(ledgerRows.map((row) => [String(row?.id || ""), row]));
  const openingHeldCheques = parseOpeningHeldCheques(config?.openingHeldCheques);

  let openingHeldChequeTotal = 0;
  let releasedOpeningHeldChequeTotal = 0;
  for (const item of openingHeldCheques) {
    const amount = Math.max(0, num(item?.amount));
    openingHeldChequeTotal += amount;
    const currentRow = rowsById.get(String(item?.id || ""));
    if (currentRow && chequeStatus(currentRow) === "cashed") releasedOpeningHeldChequeTotal += amount;
  }

  let postCutoverCashDelta = 0;
  let newHeldChequeTotal = 0;
  let postCutoverEntryCount = 0;
  for (const row of ledgerRows) {
    const createdMs = Date.parse(String(row?.created_at || ""));
    if (!Number.isFinite(createdMs) || createdMs < cutoverMs || !approved(row)) continue;
    postCutoverEntryCount += 1;
    if (Math.max(0, num(row?.debit)) > 0 && isCheque(row) && chequeStatus(row) === "on_hold") {
      newHeldChequeTotal += Math.max(0, num(row?.debit));
    }
    postCutoverCashDelta += rowCashDelta(row);
  }

  const chequeOnHold = Math.max(0, openingHeldChequeTotal - releasedOpeningHeldChequeTotal + newHeldChequeTotal);
  const cashBalance = num(config.openingCash) + releasedOpeningHeldChequeTotal + postCutoverCashDelta;

  return {
    enabled: true,
    cutoverAt: String(config.cutoverAt),
    openingCash: money(config.openingCash),
    openingHeldChequeTotal: money(openingHeldChequeTotal),
    releasedOpeningHeldChequeTotal: money(releasedOpeningHeldChequeTotal),
    newHeldChequeTotal: money(newHeldChequeTotal),
    postCutoverCashDelta: money(postCutoverCashDelta),
    postCutoverEntryCount,
    cashBalance: money(cashBalance),
    chequeOnHold: money(chequeOnHold),
  };
}
