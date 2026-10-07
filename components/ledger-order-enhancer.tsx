"use client";

import { useEffect } from "react";

type LedgerOrderRow = {
  id: string;
  date: string;
  order: number | null;
  position: number;
  dayCount: number;
  balance: number;
};

const money = new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function activeLedgerTab() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>(".bank-tabs button.active"))
    .some((button) => button.textContent?.trim().toLowerCase().includes("ledger"));
}

function transactionId(row: HTMLTableRowElement) {
  return row.querySelector<HTMLElement>(".tx-id")?.textContent?.trim() || "";
}

function dateLabel(row: HTMLTableRowElement) {
  return row.querySelector<HTMLElement>(".date-cell")?.textContent?.trim() || "";
}

function installStyles() {
  if (document.getElementById("ledger-order-enhancer-style")) return;
  const style = document.createElement("style");
  style.id = "ledger-order-enhancer-style";
  style.textContent = `
    .ledger-order-head{width:72px;text-align:center!important}
    .ledger-order-cell{width:72px;white-space:nowrap;text-align:center!important}
    .ledger-order-controls{display:inline-flex;align-items:center;gap:4px}
    .ledger-order-btn{width:27px;height:27px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--theme-line-_4b5963,#4b5963);border-radius:7px;background:var(--theme-bg-_17222b,#17222b);color:var(--theme-ink-_edf2f5,#edf2f5);font-size:14px;font-weight:900;line-height:1;cursor:pointer}
    .ledger-order-btn:hover:not(:disabled){border-color:var(--theme-line-_77858f,#77858f);background:var(--theme-bg-_1d2b35,#1d2b35)}
    .ledger-order-btn:disabled{opacity:.24;cursor:not-allowed}
    .ledger-order-btn.busy{opacity:.5;cursor:wait}
  `;
  document.head.appendChild(style);
}

function removeOrderControls(table: HTMLTableElement) {
  table.querySelectorAll("[data-ledger-order-added='true']").forEach((element) => element.remove());
}

function reorderVisibleRows(table: HTMLTableElement, stateById: Map<string, LedgerOrderRow>) {
  const tbody = table.tBodies.item(0);
  if (!tbody) return;

  const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>("tr.transaction-row"));
  let index = 0;
  while (index < rows.length) {
    const groupDate = dateLabel(rows[index]);
    const group: HTMLTableRowElement[] = [];
    let cursor = index;
    while (cursor < rows.length && dateLabel(rows[cursor]) === groupDate) {
      group.push(rows[cursor]);
      cursor += 1;
    }

    const sorted = [...group].sort((a, b) => {
      const aState = stateById.get(transactionId(a));
      const bState = stateById.get(transactionId(b));
      return (aState?.position ?? Number.MAX_SAFE_INTEGER) - (bState?.position ?? Number.MAX_SAFE_INTEGER);
    });

    const changed = group.some((row, groupIndex) => row !== sorted[groupIndex]);
    if (changed) {
      const marker = group[group.length - 1].nextSibling;
      sorted.forEach((row) => tbody.insertBefore(row, marker));
    }
    index = cursor;
  }
}

function updateBalances(table: HTMLTableElement, stateById: Map<string, LedgerOrderRow>) {
  table.querySelectorAll<HTMLTableRowElement>("tr.transaction-row").forEach((row) => {
    const state = stateById.get(transactionId(row));
    const balanceCell = row.querySelector<HTMLElement>(".balance");
    if (!state || !balanceCell) return;
    const formatted = money.format(state.balance || 0);
    if (balanceCell.textContent !== formatted) balanceCell.textContent = formatted;
    balanceCell.classList.toggle("negative", state.balance < 0);
    balanceCell.classList.toggle("positive", state.balance >= 0);
  });
}

export default function LedgerOrderEnhancer() {
  useEffect(() => {
    let disposed = false;
    let scheduled = false;
    let busyId = "";
    let stateRows: LedgerOrderRow[] = [];

    const stateById = () => new Map(stateRows.map((row) => [row.id, row]));

    async function move(transactionIdValue: string, direction: "up" | "down") {
      if (!transactionIdValue || busyId) return;
      busyId = transactionIdValue;
      apply();
      try {
        const response = await fetch("/api/accounts/ledger/order", {
          method: "PATCH",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactionId: transactionIdValue, direction }),
        });
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success || !Array.isArray(json.rows)) {
          throw new Error(String(json?.error || "Could not reorder ledger entry."));
        }
        stateRows = json.rows as LedgerOrderRow[];
      } catch (error) {
        console.error("Ledger reorder failed", error);
        window.alert(error instanceof Error ? error.message : "Could not reorder ledger entry.");
      } finally {
        busyId = "";
        apply();
      }
    }

    function addOrderControls(table: HTMLTableElement, map: Map<string, LedgerOrderRow>) {
      const header = table.tHead?.rows.item(0);
      if (header && !header.querySelector("[data-ledger-order-added='true']")) {
        const th = document.createElement("th");
        th.className = "ledger-order-head";
        th.dataset.ledgerOrderAdded = "true";
        th.textContent = "Order";
        header.insertBefore(th, header.firstElementChild);
      }

      table.querySelectorAll<HTMLTableRowElement>("tr.transaction-row").forEach((row) => {
        const id = transactionId(row);
        const state = map.get(id);
        if (!id || !state) return;

        let cell = row.querySelector<HTMLTableCellElement>("td[data-ledger-order-added='true']");
        if (!cell) {
          cell = document.createElement("td");
          cell.className = "ledger-order-cell";
          cell.dataset.ledgerOrderAdded = "true";
          row.insertBefore(cell, row.firstElementChild);
        }

        if (!cell.querySelector(".ledger-order-controls")) {
          const controls = document.createElement("span");
          controls.className = "ledger-order-controls";
          const up = document.createElement("button");
          up.type = "button";
          up.className = "ledger-order-btn ledger-order-up";
          up.title = "Move entry up";
          up.setAttribute("aria-label", `Move ${id} up`);
          up.textContent = "↑";
          const down = document.createElement("button");
          down.type = "button";
          down.className = "ledger-order-btn ledger-order-down";
          down.title = "Move entry down";
          down.setAttribute("aria-label", `Move ${id} down`);
          down.textContent = "↓";
          controls.append(up, down);
          cell.appendChild(controls);
        }

        const up = cell.querySelector<HTMLButtonElement>(".ledger-order-up");
        const down = cell.querySelector<HTMLButtonElement>(".ledger-order-down");
        if (up) {
          up.disabled = state.position <= 1 || Boolean(busyId);
          up.classList.toggle("busy", busyId === id);
          up.onclick = () => void move(id, "up");
        }
        if (down) {
          down.disabled = state.position >= state.dayCount || Boolean(busyId);
          down.classList.toggle("busy", busyId === id);
          down.onclick = () => void move(id, "down");
        }
      });
    }

    function apply() {
      if (disposed) return;
      installStyles();
      const map = stateById();
      document.querySelectorAll<HTMLTableElement>("table.bank-table").forEach((table) => {
        reorderVisibleRows(table, map);
        updateBalances(table, map);
        if (activeLedgerTab()) addOrderControls(table, map);
        else removeOrderControls(table);
      });
    }

    function scheduleApply() {
      if (scheduled || disposed) return;
      scheduled = true;
      window.setTimeout(() => {
        scheduled = false;
        apply();
      }, 0);
    }

    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, { childList: true, subtree: true });

    fetch("/api/accounts/ledger/order", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success || !Array.isArray(json.rows)) {
          throw new Error(String(json?.error || "Could not load ledger order."));
        }
        stateRows = json.rows as LedgerOrderRow[];
        apply();
      })
      .catch((error) => console.error("Ledger order load failed", error));

    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, []);

  return null;
}
