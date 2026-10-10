"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function CertificateRegistryPrintBridge() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname !== "/admin/certificates") return;

    const addPrintButtons = () => {
      document.querySelectorAll<HTMLTableRowElement>(".registry tbody tr").forEach(row => {
        const actions = row.querySelector<HTMLElement>(".rowActions");
        const certificateId = row.querySelector("td strong")?.textContent?.trim();
        if (!actions || !certificateId || actions.querySelector("[data-registry-print]")) return;

        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn";
        button.textContent = "Print";
        button.setAttribute("data-registry-print", "true");
        button.setAttribute("aria-label", `Print ${certificateId}`);
        button.addEventListener("click", () => {
          router.push(`/admin/certificates/print/${encodeURIComponent(certificateId)}`);
        });
        actions.prepend(button);
      });
    };

    addPrintButtons();
    const observer = new MutationObserver(addPrintButtons);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname, router]);

  return null;
}
