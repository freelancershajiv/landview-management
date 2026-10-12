"use client";

import { useEffect } from "react";

export default function ProjectFinanceCategoryTotalStrip() {
  useEffect(() => {
    const stripId = "pfl-selected-category-total";

    const sync = () => {
      const pages = Array.from(document.querySelectorAll<HTMLElement>(".pfl-page"));
      for (const page of pages) {
        const filters = Array.from(page.querySelectorAll<HTMLElement>(".pfl-filters"));
        if (!filters.length) continue;

        const categorySelect = Array.from(filters[0].querySelectorAll<HTMLSelectElement>("select")).find((select) =>
          Array.from(select.options).some((option) => option.textContent?.trim() === "All categories")
        );
        if (!categorySelect) continue;

        let strip = page.querySelector<HTMLElement>(`#${stripId}`);
        const category = categorySelect.value;

        if (!category || category === "all") {
          strip?.remove();
          continue;
        }

        const summaryCards = Array.from(page.querySelectorAll<HTMLElement>(".pfl-summary > div"));
        const totalCard = summaryCards[1];
        const total = totalCard?.querySelector("strong")?.textContent?.trim() || "BDT 0.00";
        const note = totalCard?.querySelector("small")?.textContent?.trim() || "Selected category total";

        if (!strip) {
          strip = document.createElement("div");
          strip.id = stripId;
          strip.className = "pfl-category-total-strip";
          filters[0].insertAdjacentElement("afterend", strip);
        }

        strip.innerHTML = `
          <div class="pfl-category-total-copy">
            <span>SELECTED CATEGORY</span>
            <strong>${escapeHtml(category)}</strong>
            <small>${escapeHtml(note)}</small>
          </div>
          <div class="pfl-category-total-amount">
            <span>TOTAL</span>
            <strong>${escapeHtml(total)}</strong>
          </div>
        `;
      }
    };

    const escapeHtml = (value: string) =>
      value.replace(/[&<>'"]/g, (ch) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      }[ch] || ch));

    const onChange = (event: Event) => {
      const target = event.target as HTMLSelectElement | null;
      if (!target || target.tagName !== "SELECT") return;
      if (Array.from(target.options).some((option) => option.textContent?.trim() === "All categories")) {
        requestAnimationFrame(() => requestAnimationFrame(sync));
      }
    };

    document.addEventListener("change", onChange, true);
    const observer = new MutationObserver(() => requestAnimationFrame(sync));
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    sync();

    return () => {
      document.removeEventListener("change", onChange, true);
      observer.disconnect();
      document.getElementById(stripId)?.remove();
    };
  }, []);

  return (
    <style jsx global>{`
      .pfl-category-total-strip {
        margin: -2px 0 14px;
        padding: 13px 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 18px;
        border: 1px solid #b7dec8;
        border-radius: 13px;
        background: #f2fbf6;
        box-shadow: 0 3px 12px rgba(24, 92, 58, 0.06);
      }
      .pfl-category-total-copy,
      .pfl-category-total-amount {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .pfl-category-total-copy > span,
      .pfl-category-total-amount > span {
        font-size: 9px;
        font-weight: 800;
        letter-spacing: .12em;
        color: #5b7d6c;
      }
      .pfl-category-total-copy > strong {
        font-size: 14px;
        color: #203d30;
      }
      .pfl-category-total-copy > small {
        font-size: 10px;
        color: #6f857a;
      }
      .pfl-category-total-amount {
        align-items: flex-end;
        min-width: 150px;
      }
      .pfl-category-total-amount > strong {
        font-size: 20px;
        line-height: 1.1;
        color: #0c6b3d;
        white-space: nowrap;
      }
      @media (max-width: 680px) {
        .pfl-category-total-strip {
          align-items: flex-start;
          flex-direction: column;
        }
        .pfl-category-total-amount {
          align-items: flex-start;
          min-width: 0;
        }
      }
    `}</style>
  );
}
