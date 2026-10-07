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

type DropPlacement = "before" | "after";

const money = new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const DHAKA_MONTH_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Dhaka",
  year: "numeric",
  month: "2-digit",
});

function currentMonthKey() {
  const parts = DHAKA_MONTH_KEY.formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  return year && month ? `${year}-${month}` : "";
}

function activeCurrentMonthTab() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>(".bank-tabs button.active"))
    .some((button) => button.textContent?.trim().toLowerCase() === "current month");
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
    .ledger-order-head{width:64px;text-align:center!important}
    .ledger-order-cell{width:64px;white-space:nowrap;text-align:center!important}
    .ledger-drag-handle{width:34px;height:30px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--theme-line-_4b5963,#4b5963);border-radius:8px;background:var(--theme-bg-_17222b,#17222b);color:var(--theme-ink-_edf2f5,#edf2f5);font-size:20px;font-weight:900;line-height:1;cursor:grab;user-select:none;touch-action:none}
    .ledger-drag-handle:hover{border-color:var(--theme-line-_77858f,#77858f);background:var(--theme-bg-_1d2b35,#1d2b35)}
    .ledger-drag-handle:active{cursor:grabbing}
    .ledger-drag-handle.disabled{opacity:.45;cursor:not-allowed;border-style:dashed}
    .ledger-drag-handle.busy{opacity:.5;cursor:wait}
    tr.transaction-row.ledger-dragging{opacity:.45}
    tr.transaction-row.ledger-drop-before td{box-shadow:inset 0 3px 0 #c83d3f}
    tr.transaction-row.ledger-drop-after td{box-shadow:inset 0 -3px 0 #c83d3f}
  `;
  document.head.appendChild(style);
}

function removeOrderControls(table: HTMLTableElement) {
  table.querySelectorAll("[data-ledger-order-added='true']").forEach((element) => element.remove());
  table.querySelectorAll("tr.transaction-row").forEach((row) => {
    row.classList.remove("ledger-dragging", "ledger-drop-before", "ledger-drop-after");
  });
}

function clearDropClasses(table: HTMLTableElement) {
  table.querySelectorAll("tr.transaction-row").forEach((row) => {
    row.classList.remove("ledger-drop-before", "ledger-drop-after");
  });
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
    let draggingId = "";
    let draggingDate = "";
    let stateRows: LedgerOrderRow[] = [];
    const monthKey = currentMonthKey();

    const stateById = () => new Map(stateRows.map((row) => [row.id, row]));

    async function loadAllState() {
      const response = await fetch("/api/accounts/ledger/order", { credentials: "same-origin", cache: "no-store" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success || !Array.isArray(json.rows)) {
        throw new Error(String(json?.error || "Could not load ledger balance/order state."));
      }
      stateRows = json.rows as LedgerOrderRow[];
    }

    async function moveTo(transactionIdValue: string, targetTransactionId: string, placement: DropPlacement) {
      if (!transactionIdValue || !targetTransactionId || transactionIdValue === targetTransactionId || busyId) return;
      busyId = transactionIdValue;
      apply();
      try {
        const response = await fetch("/api/accounts/ledger/order", {
          method: "PATCH",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transactionId: transactionIdValue, targetTransactionId, placement, month: monthKey }),
        });
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success || !Array.isArray(json.rows)) {
          throw new Error(String(json?.error || "Could not reorder ledger entry."));
        }
        await loadAllState();
      } catch (error) {
        console.error("Current month ledger drag reorder failed", error);
        window.alert(error instanceof Error ? error.message : "Could not reorder ledger entry.");
      } finally {
        busyId = "";
        draggingId = "";
        draggingDate = "";
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
        th.title = "Click and hold the handle, then drag within the same date";
        header.insertBefore(th, header.firstElementChild);
      }

      table.querySelectorAll<HTMLTableRowElement>("tr.transaction-row").forEach((row) => {
        const id = transactionId(row);
        if (!id) return;
        const state = map.get(id);

        let cell = row.querySelector<HTMLTableCellElement>("td[data-ledger-order-added='true']");
        if (!cell) {
          cell = document.createElement("td");
          cell.className = "ledger-order-cell";
          cell.dataset.ledgerOrderAdded = "true";
          row.insertBefore(cell, row.firstElementChild);
        }

        let handle = cell.querySelector<HTMLSpanElement>(".ledger-drag-handle");
        if (!handle) {
          handle = document.createElement("span");
          handle.className = "ledger-drag-handle";
          handle.setAttribute("role", "button");
          handle.setAttribute("tabindex", "0");
          handle.textContent = "⠿";
          cell.replaceChildren(handle);
        }

        const canDrag = Boolean(state && state.dayCount > 1 && !busyId);
        handle.draggable = canDrag;
        handle.classList.toggle("disabled", !state || Boolean(state && state.dayCount <= 1));
        handle.classList.toggle("busy", busyId === id);
        handle.title = !state
          ? "Ordering is unavailable for this ledger entry"
          : state.dayCount <= 1
            ? "This is the only entry on this date"
            : "Click and hold, then drag this entry within the same date";
        handle.setAttribute("aria-label", `Drag ${id} to reorder within ${state?.date || "this date"}`);

        handle.ondragstart = (event) => {
          if (!state || state.dayCount <= 1 || busyId) {
            event.preventDefault();
            return;
          }
          draggingId = id;
          draggingDate = state.date;
          row.classList.add("ledger-dragging");
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", id);
          }
        };

        handle.ondragend = () => {
          draggingId = "";
          draggingDate = "";
          row.classList.remove("ledger-dragging");
          clearDropClasses(table);
        };

        row.ondragover = (event) => {
          if (!draggingId || draggingId === id || !state || state.date !== draggingDate || busyId) return;
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
          clearDropClasses(table);
          const rect = row.getBoundingClientRect();
          const placement: DropPlacement = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
          row.classList.add(placement === "before" ? "ledger-drop-before" : "ledger-drop-after");
        };

        row.ondragleave = (event) => {
          const related = event.relatedTarget as Node | null;
          if (related && row.contains(related)) return;
          row.classList.remove("ledger-drop-before", "ledger-drop-after");
        };

        row.ondrop = (event) => {
          if (!draggingId || draggingId === id || !state || state.date !== draggingDate || busyId) return;
          event.preventDefault();
          const rect = row.getBoundingClientRect();
          const placement: DropPlacement = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
          const sourceId = draggingId;
          clearDropClasses(table);
          row.classList.remove("ledger-dragging");
          void moveTo(sourceId, id, placement);
        };
      });
    }

    function apply() {
      if (disposed) return;
      installStyles();
      const map = stateById();
      const currentMonthActive = activeCurrentMonthTab();
      document.querySelectorAll<HTMLTableElement>("table.bank-table").forEach((table) => {
        // Balance and row order must always come from the same source of truth,
        // regardless of which business-ledger tab is currently visible.
        reorderVisibleRows(table, map);
        updateBalances(table, map);
        if (currentMonthActive) addOrderControls(table, map);
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

    loadAllState()
      .then(apply)
      .catch((error) => console.error("Ledger balance/order state load failed", error));

    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, []);

  return null;
}
