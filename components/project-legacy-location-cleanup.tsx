"use client";

import { useEffect } from "react";

function text(value: unknown) { return String(value ?? "").trim().toLowerCase(); }

function hideLegacyLocationFields() {
  const labels = Array.from(document.querySelectorAll<HTMLLabelElement>(".legacy-form label"));
  for (const label of labels) {
    const input = label.querySelector<HTMLInputElement>("input");
    const placeholder = text(input?.placeholder);
    const labelText = text(label.firstChild?.textContent || label.textContent);
    const duplicate = placeholder.includes("address or google maps link")
      || placeholder.includes("google maps project location")
      || labelText.includes("site latitude")
      || labelText.includes("site longitude");
    if (duplicate) {
      label.style.display = "none";
      label.dataset.locationCompatibilityField = "true";
    }
  }
}

export default function ProjectLegacyLocationCleanup() {
  useEffect(() => {
    hideLegacyLocationFields();
    const observer = new MutationObserver(hideLegacyLocationFields);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
