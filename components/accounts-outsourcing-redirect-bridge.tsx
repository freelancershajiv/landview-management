"use client";

import { useEffect } from "react";

export default function AccountsOutsourcingRedirectBridge() {
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const button = target?.closest<HTMLButtonElement>("button");
      if (!button || button.textContent?.trim() !== "Outsourcing Payment") return;
      if (!button.closest(".accounts-entry-panel")) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      window.location.assign("/admin/finance/outsourcing");
    };

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);

  return null;
}
