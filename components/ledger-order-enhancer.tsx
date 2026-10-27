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

function installStyles() {
  if (document.getElementById("ledger-order-enhancer-style")) return;
  const style = document.createElement("style");
  style.id = "ledger-order-enhancer-style";
  style.textContent = `
    .ledger-order-head{width:88px;text-align:center!important}
    .ledger-order-cell{width:88px;white-space:nowrap;text-align:center!important}
    .ledger-order-wrap{display:inline-flex;align-items:center;justify-content:center;gap:7px}
    .ledger-serial{min-width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--theme-line-_4b5963,#4b5963);border-radius:7px;background:var(--theme-bg-_101820,#101820);color:var(--theme-ink-_edf2f5,#edf2f5);font-size:9px;font-weight:900;font-variant-numeric:tabular-nums}
    .ledger-drag-handle{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--theme-line-_4b5963,#4b5963);border-radius:7px;background:var(--theme-bg-_17222b,#17222b);color:var(--theme-ink-_aeb8be,#aeb8be);font-size:17px;font-weight:900;line-height:1;cursor:grab;user-select:none;touch-action:none}
    .ledger-drag-handle:hover{border-color:var(--theme-line-_77858f,#77858f);background:var(--theme-bg-_1d2b35,#1d2b35);color:var(--theme-ink-_edf2f5,#edf2f5)}
    .ledger-drag-handle:active{cursor:grabbing}
    .ledger-drag-handle.disabled{opacity:.4;cursor:not-allowed;border-style:dashed}
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

  const allRows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>("tr.transaction-row"));
  const rows = allRows.filter((row) => stateById.has(transactionId(row)));
  if (rows.length <= 1) return;

  const sorted = [...rows].sort((a, b) => {
    const aState = stateById.get(transactionId(a));
    const bState = stateById.get(transactionId(b));
    const dateOrder = String(bState?.date || "").localeCompare(String(aState?.date || ""));
    if (dateOrder) return dateOrder;
    return (bState?.position ?? Number.MIN_SAFE_INTEGER) - (aState?.position ?? Number.MIN_SAFE_INTEGER);
  });

  const changed = rows.some((row, index) => row !== sorted[index]);
  if (!changed) return;

  const marker = rows[rows.length - 1].nextSibling;
  sorted.forEach((row) => tbody.insertBefore(row, marker));
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
    let stateRows: LedgerOrderRow[] = [];
    const monthKey = currentMonthKey();

    const stateById = () => new Map(stateRows.map((row) => [row.id, row]));

    async function loadAllState() {
      const query = monthKey ? `?month=${encodeURIComponent(monthKey)}` : "";
      const response = await fetch(`/api/accounts/ledger/order${query}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
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
        stateRows = json.rows as LedgerOrderRow[];
      } catch (error) {
        console.error("Current month ledger drag reorder failed", error);
        window.alert(error instanceof Error ? error.message : "Could not reorder ledger entry.");
      } finally {
        busyId = "";
        draggingId = "";
        apply();
      }
    }

    function addOrderControls(table: HTMLTableElement, map: Map<string, LedgerOrderRow>) {
      const header = table.tHead?.rows.item(0);
      if (header && !header.querySelector("[data-ledger-order-added='true']")) {
        const th = document.createElement("th");
        th.className = "ledger-order-head";
        th.dataset.ledgerOrderAdded = "true";
        th.textContent = "S.L";
        th.title = "Monthly ledger serial. Drag to change the current-month order.";
        header.insertBefore(th, header.firstElementChild);
      }

      table.querySelectorAll<HTMLTableRowElement>("tr.transaction-row").forEach((row) => {
        const id = transactionId(row);
        if (!id) return;
        const state = map.get(id);
        if (!state) return;

        let cell = row.querySelector<HTMLTableCellElement>("td[data-ledger-order-added='true']");
        if (!cell) {
          cell = document.createElement("td");
          cell.className = "ledger-order-cell";
          cell.dataset.ledgerOrderAdded = "true";
          row.insertBefore(cell, row.firstElementChild);
        }

        let wrap = cell.querySelector<HTMLSpanElement>(".ledger-order-wrap");
        if (!wrap) {
          wrap = document.createElement("span");
          wrap.className = "ledger-order-wrap";
          cell.replaceChildren(wrap);
        }

        let serial = wrap.querySelector<HTMLSpanElement>(".ledger-serial");
        if (!serial) {
          serial = document.createElement("span");
          serial.className = "ledger-serial";
          wrap.appendChild(serial);
        }
        serial.textContent = String(state.position);
        serial.title = `Ledger serial ${state.position}`;

        let handle = wrap.querySelector<HTMLSpanElement>(".ledger-drag-handle");
        if (!handle) {
          handle = document.createElement("span");
          handle.className = "ledger-drag-handle";
          handle.setAttribute("role", "button");
          handle.setAttribute("tabindex", "0");
          handle.textContent = "⠿";
          wrap.appendChild(handle);
        }

        const canDrag = state.dayCount > 1 && !busyId;
        handle.draggable = canDrag;
        handle.classList.toggle("disabled", state.dayCount <= 1);
        handle.classList.toggle("busy", busyId === id);
        handle.title = state.dayCount <= 1
          ? "This is the only entry in the month"
          : "Drag to change this entry's monthly serial";
        handle.setAttribute("aria-label", `Drag ledger serial ${state.position} to reorder within ${monthKey}`);

        handle.ondragstart = (event) => {
          if (state.dayCount <= 1 || busyId) {
            event.preventDefault();
            return;
          }
          draggingId = id;
          row.classList.add("ledger-dragging");
          if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", id);
          }
        };

        handle.ondragend = () => {
          draggingId = "";
          row.classList.remove("ledger-dragging");
          clearDropClasses(table);
        };

        row.ondragover = (event) => {
          if (!draggingId || draggingId === id || busyId) return;
          event.preventDefault();
          if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
          clearDropClasses(table);
          const rect = row.getBoundingClientRect();
          const dropPlacement: DropPlacement = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
          row.classList.add(dropPlacement === "before" ? "ledger-drop-before" : "ledger-drop-after");
        };

        row.ondragleave = (event) => {
          const related = event.relatedTarget as Node | null;
          if (related && row.contains(related)) return;
          row.classList.remove("ledger-drop-before", "ledger-drop-after");
        };

        row.ondrop = (event) => {
          if (!draggingId || draggingId === id || busyId) return;
          event.preventDefault();
          const rect = row.getBoundingClientRect();
          const dropPlacement: DropPlacement = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
          const sourceId = draggingId;
          clearDropClasses(table);
          row.classList.remove("ledger-dragging");
          void moveTo(sourceId, id, dropPlacement);
        };
      });
    }

    function apply() {
      if (disposed) return;
      installStyles();
      const map = stateById();
      const currentMonthActive = activeCurrentMonthTab();
      document.querySelectorAll<HTMLTableElement>("table.bank-table").forEach((table) => {
        if (currentMonthActive) {
          reorderVisibleRows(table, map);
          updateBalances(table, map);
          addOrderControls(table, map);
        } else {
          removeOrderControls(table);
        }
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
