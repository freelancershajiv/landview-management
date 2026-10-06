"use client";

import { useEffect } from "react";

const ADDRESS_SELECTOR = ".billing-page .billing-address";
const LOCATION_TAG_SEPARATOR = " · ";

function removeBillingLocationTags() {
  document.querySelectorAll<HTMLElement>(ADDRESS_SELECTOR).forEach((element) => {
    const current = String(element.textContent || "").trim();
    if (!current) return;

    const prefix = current.startsWith("Address:") ? "Address:" : "";
    const value = prefix ? current.slice(prefix.length).trim() : current;
    const separatorIndex = value.indexOf(LOCATION_TAG_SEPARATOR);
    if (separatorIndex < 0) return;

    const addressOnly = value.slice(0, separatorIndex).trim();
    element.textContent = prefix ? `${prefix} ${addressOnly}` : addressOnly;
  });
}

export default function BillingLocationTagCleaner() {
  useEffect(() => {
    removeBillingLocationTags();

    const observer = new MutationObserver(removeBillingLocationTags);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => observer.disconnect();
  }, []);

  return null;
}
