"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";

type Party = {
  id: string;
  name: string;
  partyType: "Supplier" | "Contractor";
  category: string;
};

type PartyGroup = {
  name: string;
  partyType: "Supplier" | "Contractor";
  categories: string[];
};

const SUPPLIER_CATEGORIES = new Set([
  "bricks",
  "brick chips",
  "stone",
  "stone & sand",
  "cement",
  "steel",
  "cement & steel",
  "syleth sand",
  "normal sand",
  "filling sand",
  "filling soil",
  "electrical material",
  "electrical materials",
  "plumbing material",
  "plumbing materials",
  "tiles",
  "door",
  "doors & wood",
  "grills",
  "ss grills & works",
]);

const clean = (value: unknown) => String(value || "").trim();
const key = (value: unknown) => clean(value).toLowerCase().replace(/\s+/g, " ");

function categoryMatches(expenseCategory: string, partyCategory: string) {
  const expense = key(expenseCategory);
  const party = key(partyCategory);
  if (!expense || !party) return false;
  if (expense === party) return true;

  const aliases: Record<string, string[]> = {
    masonry: ["masonry"],
    "r.c.c masonry": ["masonry", "r.c.c masonry"],
    "finishing masonry": ["masonry", "finishing masonry"],
    cement: ["cement", "cement & steel"],
    steel: ["steel", "cement & steel"],
    "cement & steel": ["cement", "steel", "cement & steel"],
    stone: ["stone", "stone & sand"],
    "stone & sand": ["stone", "stone & sand", "syleth sand", "normal sand"],
    "syleth sand": ["syleth sand", "stone & sand"],
    "normal sand": ["normal sand", "stone & sand"],
    "filling sand": ["filling sand", "stone & sand"],
    "electric contractor": ["electric contractor"],
    "electrical material": ["electrical material", "electrical materials"],
    "electrical materials": ["electrical material", "electrical materials"],
    "plumbing contractor": ["plumbing contractor"],
    "plumbing material": ["plumbing material", "plumbing materials"],
    "plumbing materials": ["plumbing material", "plumbing materials"],
    door: ["door", "doors & wood"],
    "doors & wood": ["door", "doors & wood"],
    grills: ["grills", "ss grills & works"],
    "ss grills & works": ["grills", "ss grills & works"],
  };

  return (aliases[expense] || []).includes(party);
}

function preferredPartyType(category: string): "Supplier" | "Contractor" | null {
  const normalized = key(category);
  if (!normalized) return null;
  if (SUPPLIER_CATEGORIES.has(normalized)) return "Supplier";
  if (/contractor|masonry/.test(normalized)) return "Contractor";
  return null;
}

function setReactInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function labelByText(root: ParentNode, text: string) {
  return Array.from(root.querySelectorAll("label")).find((label) =>
    clean(label.querySelector("span")?.textContent).toLowerCase() === text.toLowerCase()
  ) as HTMLLabelElement | undefined;
}

function uniqueGroups(parties: Party[]): PartyGroup[] {
  const groups = new Map<string, PartyGroup>();
  for (const party of parties) {
    const nameKey = key(party.name);
    if (!nameKey) continue;
    const existing = groups.get(nameKey);
    if (existing) {
      if (!existing.categories.includes(party.category)) existing.categories.push(party.category);
      if (existing.partyType !== "Supplier" && party.partyType === "Supplier") existing.partyType = "Supplier";
      continue;
    }
    groups.set(nameKey, {
      name: party.name,
      partyType: party.partyType,
      categories: party.category ? [party.category] : [],
    });
  }
  return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export default function ProjectFinancePartyEnhancer() {
  const params = useSearchParams();
  const projectId = clean(params.get("projectId"));
  const queryKey = useMemo(() => projectId, [projectId]);

  useEffect(() => {
    if (!queryKey) return;
    let disposed = false;
    let parties: Party[] = [];
    let observer: MutationObserver | null = null;

    const syncSelectFromInput = (input: HTMLInputElement, select: HTMLSelectElement) => {
      const current = clean(input.value);
      if (current && Array.from(select.options).some((option) => option.value === current)) {
        select.value = current;
      }
    };

    const populate = (
      input: HTMLInputElement,
      select: HTMLSelectElement,
      categorySelect: HTMLSelectElement,
      forceSuggestion = false,
    ) => {
      const groups = uniqueGroups(parties);
      const category = clean(categorySelect.value);
      const desiredType = preferredPartyType(category);
      const current = clean(input.value);

      const suggested = groups.filter((party) => {
        const categoryMatch = party.categories.some((partyCategory) => categoryMatches(category, partyCategory));
        if (!categoryMatch) return false;
        return !desiredType || party.partyType === desiredType;
      });

      const remaining = groups.filter((party) => !suggested.some((item) => key(item.name) === key(party.name)));
      const previous = select.value;
      select.innerHTML = "";

      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "Select named supplier / contractor";
      placeholder.disabled = true;
      select.appendChild(placeholder);

      const addGroup = (label: string, values: PartyGroup[]) => {
        if (!values.length) return;
        const group = document.createElement("optgroup");
        group.label = label;
        for (const party of values) {
          const option = document.createElement("option");
          option.value = party.name;
          option.textContent = `${party.name} · ${party.partyType}`;
          group.appendChild(option);
        }
        select.appendChild(group);
      };

      addGroup(category ? `Suggested for ${category}` : "Suggested", suggested);
      addGroup("Other named parties", remaining);

      const masterHasCurrent = groups.some((party) => key(party.name) === key(current));
      if (current && !masterHasCurrent) {
        const legacy = document.createElement("optgroup");
        legacy.label = "Current legacy value";
        const option = document.createElement("option");
        option.value = current;
        option.textContent = `${current} · legacy entry`;
        legacy.appendChild(option);
        select.appendChild(legacy);
      }

      const validCurrent = current && Array.from(select.options).some((option) => option.value === current);
      const validPrevious = previous && Array.from(select.options).some((option) => option.value === previous);
      if (validCurrent) {
        select.value = current;
      } else if (validPrevious) {
        select.value = previous;
      } else if (forceSuggestion && suggested.length === 1) {
        select.value = suggested[0].name;
        setReactInputValue(input, suggested[0].name);
      } else {
        select.value = "";
      }
    };

    const enhanceExpenseModal = () => {
      const modals = Array.from(document.querySelectorAll(".pm-entry-modal"));
      for (const modal of modals) {
        const categoryLabel = labelByText(modal, "Expense Category");
        if (!categoryLabel) continue;
        const categorySelect = categoryLabel.querySelector("select") as HTMLSelectElement | null;
        const paidToLabel = labelByText(modal, "Paid To");
        const input = paidToLabel?.querySelector("input") as HTMLInputElement | null;
        if (!categorySelect || !paidToLabel || !input) continue;

        let select = paidToLabel.querySelector("select[data-pf-party-select='1']") as HTMLSelectElement | null;
        if (!select) {
          select = document.createElement("select");
          select.dataset.pfPartySelect = "1";
          select.className = "pf-party-select";
          select.setAttribute("aria-label", "Paid To / Supplier / Contractor");
          paidToLabel.appendChild(select);
          input.dataset.pfPartyNative = "1";

          select.addEventListener("change", () => {
            setReactInputValue(input, select?.value || "");
          });

          categorySelect.addEventListener("change", () => {
            window.setTimeout(() => populate(input, select as HTMLSelectElement, categorySelect, true), 0);
          });
        }

        populate(input, select, categorySelect, false);
        syncSelectFromInput(input, select);
      }
    };

    const enhancePartyCount = () => {
      const table = document.querySelector(".pm-party-table");
      const head = table?.closest(".pm-party-list-wrap")?.querySelector(".pm-party-list-head span") as HTMLElement | null;
      if (!head) return;
      const uniqueCount = uniqueGroups(parties).length;
      head.textContent = `${uniqueCount.toLocaleString("en-BD")} named parties`;
    };

    const enhance = () => {
      if (disposed || !parties.length) return;
      enhanceExpenseModal();
      enhancePartyCount();
    };

    const loadParties = async () => {
      try {
        const response = await fetch(`/api/project-management?projectId=${encodeURIComponent(queryKey)}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        const payload = await response.json();
        if (!response.ok || !payload?.success) return;
        const contracts = Array.isArray(payload?.data?.contractorBills?.contracts)
          ? payload.data.contractorBills.contracts
          : [];
        parties = contracts
          .filter((row: any) => row?.active !== false)
          .map((row: any) => ({
            id: clean(row.id),
            name: clean(row.contractor_name),
            partyType: clean(row.party_type) === "Supplier" ? "Supplier" : "Contractor",
            category: clean(row.category),
          }))
          .filter((row: Party) => Boolean(row.name));
        enhance();
      } catch {
        // Keep the original form available if the enhancement cannot load.
      }
    };

    observer = new MutationObserver(() => enhance());
    observer.observe(document.body, { childList: true, subtree: true });
    void loadParties();

    return () => {
      disposed = true;
      observer?.disconnect();
    };
  }, [queryKey]);

  return null;
}
