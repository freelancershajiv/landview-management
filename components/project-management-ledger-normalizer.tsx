"use client";

import { useEffect } from "react";

const SATTAPUR = "sattapur";

function text(value: unknown) {
  return String(value ?? "").trim();
}

function money(value: number) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function numeric(value: unknown) {
  const normalized = text(value)
    .replace(/[\u00A0\u202F\s]/g, "")
    .replace(/[^\d().,\-]/g, "");

  if (!normalized || normalized === "-" || normalized === "—") return 0;

  const negative = /^\(.*\)$/.test(normalized) || normalized.startsWith("-");
  const unsigned = normalized.replace(/[()\-]/g, "");

  let prepared = unsigned;
  if (unsigned.includes(",") && unsigned.includes(".")) {
    prepared =
      unsigned.lastIndexOf(".") > unsigned.lastIndexOf(",")
        ? unsigned.replace(/,/g, "")
        : unsigned.replace(/\./g, "").replace(",", ".");
  } else if (unsigned.includes(",")) {
    const groups = unsigned.split(",");
    const looksGrouped = groups.slice(1).every((group) => group.length === 3);
    prepared = looksGrouped ? groups.join("") : `${groups.slice(0, -1).join("")}.${groups.at(-1)}`;
  }

  const parsed = Number(prepared);
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : 0;
}

function isProjectManagementPage() {
  return window.location.pathname.replace(/\/+$/, "") === "/projectmanagement";
}

function tableHeaders(table: HTMLTableElement) {
  return Array.from(table.querySelectorAll("thead th")).map((cell) => text(cell.textContent));
}

function columnIndex(headers: string[], name: string) {
  return headers.findIndex((header) => header.toLowerCase() === name.toLowerCase());
}

function factualRows(table: HTMLTableElement) {
  return Array.from(table.querySelectorAll<HTMLTableRowElement>("tbody tr")).filter(
    (row) => !row.hasAttribute("data-ledger-linked-expense") && row.querySelectorAll("td").length > 1,
  );
}

function isSattapurDeposit(row: HTMLTableRowElement, headers: string[]) {
  const dateIndex = Math.max(0, columnIndex(headers, "Date"));
  const rowDate = text(row.children[dateIndex]?.textContent);
  if (/^(20\s+Nov|23\s+Nov)\s+2025$/i.test(rowDate)) return false;

  const debitIndex = columnIndex(headers, "Debit");
  const categoryIndex = columnIndex(headers, "Category");
  if (debitIndex < 0 || categoryIndex < 0) return false;

  const debit = numeric(row.children[debitIndex]?.textContent);
  if (debit <= 0) return false;

  const category = text(row.children[categoryIndex]?.textContent).toLowerCase();
  if (!["cash", "bank transfer", "cheque"].includes(category)) return false;

  const partyIndex = columnIndex(headers, "Paid To / Supplier");
  const detailsIndex = columnIndex(headers, "Details");
  const matchText = [
    partyIndex >= 0 ? row.children[partyIndex]?.textContent : "",
    detailsIndex >= 0 ? row.children[detailsIndex]?.textContent : "",
    categoryIndex >= 0 ? row.children[categoryIndex]?.textContent : "",
  ]
    .map((value) => text(value).toLowerCase())
    .join(" ");

  return matchText.includes(SATTAPUR);
}

function normalizeLedgerTable(table: HTMLTableElement) {
  const headers = tableHeaders(table);
  const debitIndex = columnIndex(headers, "Debit");
  const creditIndex = columnIndex(headers, "Credit");
  const balanceIndex = columnIndex(headers, "Balance");
  if (debitIndex < 0 || creditIndex < 0 || balanceIndex < 0) return;

  // Clear DOM-only Sattapur allocation rows left by an older render. The six
  // real supplier-deposit records stay in the data and in the Sattapur view.
  table.querySelectorAll("[data-ledger-linked-expense]").forEach((row) => row.remove());

  let runningBalance = 0;
  for (const row of factualRows(table)) {
    const debit = numeric(row.children[debitIndex]?.textContent);
    const credit = numeric(row.children[creditIndex]?.textContent);
    const sattapurAllocation = isSattapurDeposit(row, headers) ? debit : 0;

    // A Sattapur deposit is already cash paid out as supplier advance. Apply
    // its cash effect invisibly instead of manufacturing a second expense row.
    runningBalance += debit - credit - sattapurAllocation;

    const balanceCell = row.children[balanceIndex] as HTMLElement | undefined;
    if (!balanceCell) continue;
    balanceCell.textContent = money(runningBalance);
    balanceCell.classList.toggle("negative", runningBalance < 0);
    balanceCell.classList.toggle("positive", runningBalance >= 0);
  }
}

function normalizeProjectLedger() {
  if (!isProjectManagementPage()) return;
  document.querySelectorAll<HTMLTableElement>(".pm-workspace .pm-table").forEach((table) => {
    const headers = tableHeaders(table);
    if (headers.includes("Debit") && headers.includes("Credit") && headers.includes("Balance")) {
      normalizeLedgerTable(table);
    }
  });
}

export default function ProjectManagementLedgerNormalizer() {
  useEffect(() => {
    if (!isProjectManagementPage()) return;

    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        normalizeProjectLedger();
      });
    };

    schedule();
    const observer = new MutationObserver(() => schedule());
    observer.observe(document.body, { childList: true, subtree: true });

    const onClick = () => window.setTimeout(schedule, 0);
    const onHistory = () => schedule();
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onHistory);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onHistory);
    };
  }, []);

  return null;
}
