"use client";

import { useEffect } from "react";
import AccountsBankStatementPage from "@/components/accounts-bank-statement-page";
import { landViewApi, type FinanceSheetData } from "@/lib/api";

const SPECIAL_LEDGER_STATUS = "special ledger";

let patched = false;

function normalize(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function withMainLedgerIsolation(data: FinanceSheetData) {
  if (!data || data.tab !== "Transactions") return data;

  const headers = data.headers || [];
  const statusIndex = headers.indexOf("Status");
  if (statusIndex < 0) return data;

  const rows = (data.rows || []).filter((row) => {
    const status = normalize(row[statusIndex] || "Posted");
    // Municipality File Pass lives only in SPECIAL_LEDGER until an explicit
    // transfer creates a separate Main Accounts transaction.
    return status !== SPECIAL_LEDGER_STATUS;
  });

  return { ...data, rows };
}

function patchFinanceSheetCompatibility() {
  if (patched) return;
  patched = true;

  const original = landViewApi.getFinanceSheet;
  landViewApi.getFinanceSheet = async (tab = "Summary") => {
    const data = await original(tab);
    return tab === "Transactions" ? withMainLedgerIsolation(data) : data;
  };
}

function hideRetiredApprovalCopy() {
  document.querySelectorAll<HTMLElement>(".statement-footer > span").forEach((node) => {
    const copy = normalize(node.textContent);
    if (copy.includes("pending expense") || copy.includes("no pending expenses")) {
      node.style.display = "none";
    }
  });
}

export default function AccountsEffectiveLedgerWrapper() {
  patchFinanceSheetCompatibility();

  useEffect(() => {
    hideRetiredApprovalCopy();
    const observer = new MutationObserver(() => hideRetiredApprovalCopy());
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return <AccountsBankStatementPage />;
}
