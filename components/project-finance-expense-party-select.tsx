"use client";

import { useEffect, useState } from "react";

const FALLBACK = "Eng Shajiv";

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

function setNativeValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export default function ProjectFinanceExpensePartySelect() {
  const [contractors, setContractors] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);

  useEffect(() => {
    const projectId = new URLSearchParams(window.location.search).get("projectId") || "";
    if (!projectId) return;

    let cancelled = false;
    void fetch(`/api/project-management?projectId=${encodeURIComponent(projectId)}`, {
      credentials: "same-origin",
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled || !payload?.success) return;
        const rows = Array.isArray(payload?.data?.contractorBills?.contracts) ? payload.data.contractorBills.contracts : [];
        setContractors(unique(rows.filter((row: any) => String(row?.party_type || "Contractor") === "Contractor").map((row: any) => row?.contractor_name)));
        setSuppliers(unique(rows.filter((row: any) => String(row?.party_type || "") === "Supplier").map((row: any) => row?.contractor_name)));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const allowed = new Set([FALLBACK, ...contractors, ...suppliers]);

    const enhance = () => {
      const modals = Array.from(document.querySelectorAll<HTMLElement>(".pfl-modal"));
      for (const modal of modals) {
        const title = String(modal.querySelector("h3")?.textContent || "");
        if (!/Expense/i.test(title)) continue;

        const labels = Array.from(modal.querySelectorAll<HTMLLabelElement>("label"));
        const label = labels.find((item) => String(item.querySelector("span")?.textContent || "").trim() === "Paid To");
        if (!label) continue;

        const input = label.querySelector<HTMLInputElement>("input");
        if (!input || input.dataset.groupedPartySelect === "1") continue;

        const select = document.createElement("select");
        select.className = "pfl-select pfl-expense-party-select";
        select.setAttribute("aria-label", "Paid To");

        const current = String(input.value || "").trim();
        const fallbackOption = document.createElement("option");
        fallbackOption.value = FALLBACK;
        fallbackOption.textContent = `${FALLBACK} · Unassigned / Other`;
        select.appendChild(fallbackOption);

        const contractorGroup = document.createElement("optgroup");
        contractorGroup.label = "Contractors";
        for (const name of contractors) {
          const option = document.createElement("option");
          option.value = name;
          option.textContent = name;
          contractorGroup.appendChild(option);
        }
        select.appendChild(contractorGroup);

        const supplierGroup = document.createElement("optgroup");
        supplierGroup.label = "Suppliers";
        for (const name of suppliers) {
          const option = document.createElement("option");
          option.value = name;
          option.textContent = name;
          supplierGroup.appendChild(option);
        }
        select.appendChild(supplierGroup);

        if (current && !allowed.has(current)) {
          const legacy = document.createElement("option");
          legacy.value = current;
          legacy.textContent = `${current} · legacy`;
          select.insertBefore(legacy, select.firstChild);
        }

        const selected = current || FALLBACK;
        select.value = selected;
        if (!current) setNativeValue(input, FALLBACK);

        select.addEventListener("change", () => setNativeValue(input, select.value));
        input.dataset.groupedPartySelect = "1";
        input.style.display = "none";
        label.appendChild(select);
      }
    };

    const observer = new MutationObserver(enhance);
    observer.observe(document.body, { childList: true, subtree: true });
    enhance();
    return () => observer.disconnect();
  }, [contractors, suppliers]);

  return null;
}
