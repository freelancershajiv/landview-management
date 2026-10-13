type Row = Record<string, unknown>;

export type CanonicalBillingCategory = "Engineering Bill" | "Supervision Bill" | "Other Services Bill";
export type InvoiceBillingCategory = CanonicalBillingCategory | "Design Books";

function text(value: unknown) {
  return String(value ?? "").trim();
}

export function billingAmount(value: unknown) {
  const parsed = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusIsEffective(row: Row) {
  const status = text(row.approval_status ?? row.Approval_Status ?? row.status ?? row.Status)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  return !status || [
    "approved",
    "pre approved",
    "received",
    "paid",
    "verified",
    "complete",
    "completed",
    "full paid",
    "fully paid",
    "posted",
  ].includes(status);
}

function booleanValue(value: unknown) {
  if (typeof value === "boolean") return value;
  return ["true", "1", "yes", "y"].includes(text(value).toLowerCase());
}

function paymentCode(row: Row) {
  return text(row.payment_code ?? row.Payment_ID ?? row.transaction_code ?? row.Transaction_ID).toUpperCase();
}

export function billingPaymentIsEffective(row: Row) {
  const transactionType = text(row.transaction_type ?? row.Transaction_Type).toLowerCase();
  if (transactionType === "personal income") return false;

  const code = paymentCode(row);
  if (code.startsWith("TXN-HIST-") || code.startsWith("TXN-LEDGER-")) return false;
  if (!statusIsEffective(row)) return false;

  const legacyManual = booleanValue(row.is_legacy_manual ?? row.Is_Legacy_Manual ?? row.Legacy_Manual);
  const ledgerImpact = row.affects_business_balance ?? row.Affects_Business_Balance;

  // Normal/current payments keep the existing ledger-impact requirement.
  // Historical Legacy Manual payments are the explicit exception: they count
  // toward client/project settlement while remaining excluded from cash ledger.
  return legacyManual || ledgerImpact !== false;
}

export function billIsEffective(row: Row) {
  const status = text(row.status ?? row.Status).toLowerCase();
  return !["void", "voided", "cancelled", "canceled", "rejected"].includes(status);
}

function categorySource(row: Row) {
  return text(
    row.billing_category ?? row.Billing_Category ??
    row.income_category ?? row.Income_Category ??
    row.category ?? row.Category ??
    row.payment_for ?? row.Payment_For ??
    row.description ?? row.Description,
  ).toLowerCase();
}

export function canonicalBillingCategory(row: Row): CanonicalBillingCategory {
  const source = categorySource(row);
  if (/supervision/.test(source)) return "Supervision Bill";
  if (/other|soil|survey|municipality|file pass/.test(source)) return "Other Services Bill";
  return "Engineering Bill";
}

export function invoiceBillingCategory(row: Row): InvoiceBillingCategory {
  const source = categorySource(row);
  if (/design\s*books?/.test(source)) return "Design Books";
  if (/supervision/.test(source)) return "Supervision Bill";
  if (/other|soil|survey|municipality|file pass/.test(source)) return "Other Services Bill";
  return "Engineering Bill";
}
