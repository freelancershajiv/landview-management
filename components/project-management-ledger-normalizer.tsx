"use client";

import { useEffect } from "react";

const money = (value: number) =>
  new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 2,
  }).format(value);

function amount(text: string) {
  const n = Number(String(text || "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function isFullLedger(table: HTMLTableElement) {
  const headers = Array.from(table.querySelectorAll("thead th")).map((th) =>
    String(th.textContent || "").trim().toLowerCase()
  );
  return headers.includes("debit") && headers.includes("credit") && headers.includes("balance");
}

function hashRows(rows: HTMLTableRowElement[]) {
  let hash = 2166136261;
  for (const row of rows) {
    const text = String(row.textContent || "");
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return String(hash >>> 0);
}

function isSattapurDepositRow(row: HTMLTableRowElement) {
  if (row.dataset.sattapurLinkedExpense === "true") return false;
  const cells = row.cells;
  if (cells.length < 9) return false;
  const party = String(cells[1]?.textContent || "").trim().toLowerCase();
  const details = String(cells[2]?.textContent || "").trim().toLowerCase();
  const debit = amount(String(cells[6]?.textContent || ""));
  return debit > 0 && (party.includes("sattapur") || details.includes("sattapur brick"));
}

function parseLedgerDate(row: HTMLTableRowElement) {
  const value = String(row.cells[0]?.textContent || "").trim();
  const normalized = value.replace(/^(\d{2})\s([A-Za-z]{3})\s(\d{4})$/, "$2 $1 $3");
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeLedger(table: HTMLTableElement) {
  if (!isFullLedger(table)) return;
  const body = table.tBodies[0];
  if (!body) return;

  const currentOriginalRows = Array.from(body.rows).filter(
    (row) => row.dataset.sattapurLinkedExpense !== "true"
  );
  if (!currentOriginalRows.length) return;

  const expectedLinkedCount = currentOriginalRows.filter(isSattapurDepositRow).length;
  const currentLinkedCount = body.querySelectorAll('tr[data-sattapur-linked-expense="true"]').length;
  const currentHash = hashRows(currentOriginalRows);
  if (
    table.dataset.pmLedgerNormalizedHash === currentHash &&
    currentLinkedCount === expectedLinkedCount
  ) {
    return;
  }

  body.querySelectorAll('tr[data-sattapur-linked-expense="true"]').forEach((row) => row.remove());

  let ordered = Array.from(body.rows);
  if (ordered.length > 1 && parseLedgerDate(ordered[0]) > parseLedgerDate(ordered[ordered.length - 1])) {
    ordered.reverse().forEach((row) => body.appendChild(row));
  }

  ordered = Array.from(body.rows);
  for (const row of ordered) {
    if (!isSattapurDepositRow(row)) continue;
    const debit = amount(String(row.cells[6]?.textContent || ""));

    const linked = row.cloneNode(true) as HTMLTableRowElement;
    linked.dataset.sattapurLinkedExpense = "true";
    linked.classList.add("pm-linked-sattapur-expense");
    linked.cells[1].textContent = "Sattapur Brick Field";
    linked.cells[2].textContent = "Sattapur Deposit Allocation · linked expense";
    linked.cells[3].textContent = "Bricks";
    linked.cells[4].textContent = "—";
    linked.cells[5].textContent = "—";
    linked.cells[6].textContent = "—";
    linked.cells[7].textContent = money(debit);
    if (linked.cells[9]) linked.cells[9].textContent = "Linked";
    row.insertAdjacentElement("afterend", linked);
  }

  let running = 0;
  for (const row of Array.from(body.rows)) {
    const cells = row.cells;
    if (cells.length < 9) continue;
    const debit = amount(String(cells[6]?.textContent || ""));
    const credit = amount(String(cells[7]?.textContent || ""));
    const heldCheque = Boolean(row.querySelector(".pm-cheque-status.hold"));
    running += (heldCheque ? 0 : debit) - credit;
    cells[8].textContent = money(running);
  }

  const finalOriginalRows = Array.from(body.rows).filter(
    (row) => row.dataset.sattapurLinkedExpense !== "true"
  );
  table.dataset.pmLedgerNormalizedHash = hashRows(finalOriginalRows);
}

export default function ProjectManagementLedgerNormalizer() {
  useEffect(() => {
    if (window.location.pathname !== "/projectmanagement") return;

    let scheduled = false;
    const run = () => {
      scheduled = false;
      document.querySelectorAll<HTMLTableElement>("table.pm-table").forEach(normalizeLedger);
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(run);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
