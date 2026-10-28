"use client";

import { useEffect } from "react";

function hideLocationFields() {
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(".form-grid input"));
  const address = inputs.find((input) => input.placeholder.toLowerCase().includes("project/site address"));
  const pin = inputs.find((input) => input.placeholder.toLowerCase().includes("google maps link or use current location"));
  for (const input of [address, pin]) {
    const label = input?.closest("label") as HTMLElement | null;
    if (label) {
      label.style.display = "none";
      label.dataset.locationCompatibilityField = "true";
    }
  }
}

export default function ProjectNewLocationCleanup() {
  useEffect(() => {
    hideLocationFields();
    const observer = new MutationObserver(hideLocationFields);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
