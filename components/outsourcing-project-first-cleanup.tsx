"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export default function OutsourcingProjectFirstCleanup() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname !== "/admin/finance/outsourcing") return;

    let observer: MutationObserver | null = null;
    let cancelled = false;

    const apply = () => {
      if (cancelled) return false;
      const actions = document.querySelector<HTMLElement>(".outsource-page .out-actions");
      if (!actions) return false;

      actions.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
        if (/new outsource work/i.test(button.textContent || "")) {
          button.style.display = "none";
          button.setAttribute("aria-hidden", "true");
          button.tabIndex = -1;
        }
      });

      let projectLink = actions.querySelector<HTMLAnchorElement>("[data-project-outsourcing-entry]");
      if (!projectLink) {
        projectLink = document.createElement("a");
        projectLink.dataset.projectOutsourcingEntry = "true";
        projectLink.href = "/admin/projects";
        projectLink.textContent = "+ Add from Projects";
        projectLink.className = "out-btn primary";
        projectLink.style.display = "inline-flex";
        projectLink.style.alignItems = "center";
        projectLink.style.justifyContent = "center";
        projectLink.style.textDecoration = "none";
        actions.prepend(projectLink);
      }

      return true;
    };

    if (!apply()) {
      observer = new MutationObserver(() => { if (apply()) observer?.disconnect(); });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      document.querySelectorAll("[data-project-outsourcing-entry]").forEach((node) => node.remove());
    };
  }, [pathname]);

  return null;
}
