"use client";

import AccountsBankStatementPage from "@/components/accounts-bank-statement-page";
import { landViewApi, type FinanceSheetData } from "@/lib/api";

const NON_EFFECTIVE_EXPENSE_STATUSES = new Set([
  "rejected",
  "returned",
  "cancelled",
  "canceled",
  "void",
  "voided",
  "draft",
  "special ledger",
]);

let patched = false;

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function amount(value: unknown) {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function withEffectiveExpenseStatus(data: FinanceSheetData) {
  if (!data || data.tab !== "Transactions") return data;

  const headers = data.headers || [];
  const typeIndex = headers.indexOf("Transaction_Type");
  const debitIndex = headers.indexOf("Debit");
  const statusIndex = headers.indexOf("Status");
  if (typeIndex < 0 || debitIndex < 0 || statusIndex < 0) return data;

  const rows = (data.rows || []).map((source) => {
    const row = [...source];
    const type = normalize(row[typeIndex]);
    const status = normalize(row[statusIndex] || "Posted");
    const debit = amount(row[debitIndex]);

    // LAND VIEW's canonical balance deducts a real MAIN-LEDGER operating expense
    // as soon as it exists, even while EMP-0001 approval is pending. Municipality
    // File Pass transactions use SPECIAL_LEDGER and must stay isolated in their
    // own ledger, so they are deliberately never promoted to Posted here.
    if (
      type === "expense" &&
      debit > 0 &&
      status !== "posted" &&
      !NON_EFFECTIVE_EXPENSE_STATUSES.has(status)
    ) {
      row[statusIndex] = "Posted";
    }

    return row;
  });

  return { ...data, rows };
}

function patchFinanceSheetCompatibility() {
  if (patched) return;
  patched = true;

  const original = landViewApi.getFinanceSheet;
  landViewApi.getFinanceSheet = async (tab = "Summary") => {
    const data = await original(tab);
    return tab === "Transactions" ? withEffectiveExpenseStatus(data) : data;
  };
}

export default function AccountsEffectiveLedgerWrapper() {
  patchFinanceSheetCompatibility();
  return <AccountsBankStatementPage />;
}
