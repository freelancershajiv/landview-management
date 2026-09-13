"use client";

import { useEffect } from "react";

export default function ClientInvoiceLinkUpgrade() {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button");
      if (!button) return;
      const label = String(button.textContent || "").trim().toUpperCase();
      if (label !== "GENERATE INVOICE") return;
      event.preventDefault();
      event.stopPropagation();
      window.location.href = "/client/billing/current";
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  return null;
}
