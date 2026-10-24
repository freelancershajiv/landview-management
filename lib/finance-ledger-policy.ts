/**
 * Canonical LAND VIEW main-ledger/current-balance policy.
 *
 * Keep approval workflow state separate from cash-effect rules:
 * - Posted rows appear in the canonical main ledger.
 * - Real operating expenses reduce available cash while pending approval,
 *   but are excluded when rejected/returned/cancelled/void/draft.
 * - Income affects current cash only when posted.
 * - Municipality File Pass, transfers and personal transactions do not affect
 *   the main business ledger/current balance.
 */

export type FinanceTransactionRow = Record<string, unknown>;

export const LEDGER_LIVE_START = "2026-09-01";
export const LEDGER_END = "2026-12-31";
export const MUNICIPALITY_SCOPE = "municipality_file_pass";

export const NON_EFFECTIVE_EXPENSE_STATUSES = new Set([
  "rejected",
  "returned",
  "cancelled",
  "canceled",
  "void",
  "voided",
  "draft",
]);

export function financeText(value: unknown) {
  return String(value ?? "").trim();
}

export function financeAmount(value: unknown) {
  const n = Number(financeText(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function normalizeFinanceStatus(value: unknown) {
  return financeText(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function financeDateKey(value: unknown) {
  const raw = financeText(value);
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D|$)/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

export function financeTransactionAmounts(row: FinanceTransactionRow) {
  const transactionType = normalizeFinanceStatus(row.transaction_type);
  const direction = financeText(row.direction).toUpperCase();
  const fallback = financeAmount(row.amount);
  let debit = financeAmount(row.debit);
  let credit = financeAmount(row.credit);

  if (!debit && !credit && fallback > 0) {
    if (direction === "DEBIT" || transactionType === "expense") debit = fallback;
    if (direction === "CREDIT" || transactionType === "income") credit = fallback;
  }

  return { debit, credit, transactionType };
}

export function isHistoricalLedgerTransaction(row: FinanceTransactionRow) {
  const id = financeText(row.transaction_code);
  return id.startsWith("TXN-LEDGER-2025-") || id.startsWith("TXN-HIST-2026-");
}

export function isMunicipalityTransaction(row: FinanceTransactionRow) {
  return financeText(row.finance_scope) === MUNICIPALITY_SCOPE;
}

export function baseMainLedgerEligibility(row: FinanceTransactionRow) {
  if (isMunicipalityTransaction(row)) return false;

  const id = financeText(row.transaction_code);
  const date = financeDateKey(row.transaction_date);
  const { debit, credit, transactionType } = financeTransactionAmounts(row);
  if (!id || !date || (debit <= 0 && credit <= 0)) return false;

  if (isHistoricalLedgerTransaction(row)) return true;

  if (["transfer", "personal income", "personal expense"].includes(transactionType)) return false;
  return date >= LEDGER_LIVE_START && date <= LEDGER_END;
}

export function includedInMainLedger(row: FinanceTransactionRow) {
  if (!baseMainLedgerEligibility(row)) return false;
  if (isHistoricalLedgerTransaction(row)) return true;
  return normalizeFinanceStatus(row.status || "Posted") === "posted";
}

export function includedInCurrentBalance(row: FinanceTransactionRow) {
  if (!baseMainLedgerEligibility(row)) return false;
  if (isHistoricalLedgerTransaction(row)) return true;

  const { debit, transactionType } = financeTransactionAmounts(row);
  const status = normalizeFinanceStatus(row.status || "Posted");

  if (transactionType === "expense" && debit > 0) {
    return !NON_EFFECTIVE_EXPENSE_STATUSES.has(status);
  }

  return status === "posted";
}
