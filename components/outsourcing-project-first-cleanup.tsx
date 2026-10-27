"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function OutsourcingProjectFirstCleanup() {
  const pathname = usePathname();

  useEffect(() => {
    let observer: MutationObserver | null = null;
    let cancelled = false;

    const apply = () => {
      if (cancelled) return false;

      const financeGroup = Array.from(document.querySelectorAll<HTMLElement>(".lv-nav-group"))
        .find((group) => /finance/i.test(group.querySelector<HTMLButtonElement>(".lv-nav-group-button")?.textContent || ""));

      if (!financeGroup) return false;

      const financeButton = financeGroup.querySelector<HTMLButtonElement>(".lv-nav-group-button");
      const onOutsourcing = pathname === "/admin/finance/outsourcing" || pathname.startsWith("/admin/finance/outsourcing/");

      if (onOutsourcing && financeButton?.getAttribute("aria-expanded") !== "true") {
        financeButton?.click();
        return false;
      }

      const children = financeGroup.querySelector<HTMLElement>(".lv-nav-children");
      if (!children) return false;

      let outsourcingLink = children.querySelector<HTMLAnchorElement>("[data-finance-outsourcing-tab]");
      if (!outsourcingLink) {
        outsourcingLink = document.createElement("a");
        outsourcingLink.dataset.financeOutsourcingTab = "true";
        outsourcingLink.href = "/admin/finance/outsourcing";
        outsourcingLink.innerHTML = '<span class="nav-icon" aria-hidden="true">⇄</span><span>Outsourcing</span>';
        children.appendChild(outsourcingLink);
      }

      if (onOutsourcing) {
        outsourcingLink.classList.add("active");
        outsourcingLink.setAttribute("aria-current", "page");
      } else {
        outsourcingLink.classList.remove("active");
        outsourcingLink.removeAttribute("aria-current");
      }

      // Finance → Outsourcing is now the full control center. Restore every native
      // outsourcing action that the previous project-first bridge used to hide.
      if (onOutsourcing) {
        const actions = document.querySelector<HTMLElement>(".outsource-page .out-actions");
        actions?.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
          button.style.removeProperty("display");
          button.removeAttribute("aria-hidden");
          button.tabIndex = 0;
        });
        document.querySelectorAll("[data-project-outsourcing-entry]").forEach((node) => node.remove());
      }

      return true;
    };

    apply();
    observer = new MutationObserver(() => { apply(); });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-expanded"] });

    return () => {
      cancelled = true;
      observer?.disconnect();
      document.querySelectorAll("[data-finance-outsourcing-tab]").forEach((node) => node.remove());
      document.querySelectorAll("[data-project-outsourcing-entry]").forEach((node) => node.remove());
    };
  }, [pathname]);

  return null;
}
