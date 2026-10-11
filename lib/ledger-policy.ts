export const MAIN_LEDGER_COUNT_START = "2024-12-26";
export const MAIN_LEDGER_LIVE_START = "2026-09-01";
export const MAIN_LEDGER_END = "2026-12-31";

export function ledgerDateKey(value: unknown) {
  const raw = String(value ?? "").trim();
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

export function isPreLedgerCutoff(value: unknown) {
  const date = ledgerDateKey(value);
  return Boolean(date && date < MAIN_LEDGER_COUNT_START);
}

export function countsTowardMainLedger(value: unknown) {
  const date = ledgerDateKey(value);
  return Boolean(date && date >= MAIN_LEDGER_COUNT_START);
}
