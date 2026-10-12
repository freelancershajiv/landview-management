"use client";

import { useEffect } from "react";

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function setReactInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  descriptor?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

export default function ProjectFinanceLocalDate() {
  useEffect(() => {
    const fixNewEntryDate = () => {
      const utcDate = new Date().toISOString().slice(0, 10);
      const localDate = localDateValue();
      if (utcDate === localDate) return;

      for (const modal of Array.from(document.querySelectorAll<HTMLElement>(".pm-entry-modal"))) {
        const title = String(modal.querySelector(".pm-modal-head h2")?.textContent || "").trim();
        if (!/^Add\b/i.test(title)) continue;
        const dateLabel = Array.from(modal.querySelectorAll("label")).find((label) =>
          String(label.querySelector("span")?.textContent || "").trim().toLowerCase() === "date",
        );
        const input = dateLabel?.querySelector<HTMLInputElement>("input[type='date']");
        if (!input || input.dataset.pfLocalDateFixed === "1") continue;
        input.dataset.pfLocalDateFixed = "1";
        if (input.value === utcDate) setReactInputValue(input, localDate);
      }
    };

    fixNewEntryDate();
    const observer = new MutationObserver(fixNewEntryDate);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
}
