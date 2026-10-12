"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const MODULE_ROUTE_BY_LABEL: Record<string, string> = {
  Overview: "/projectmanagement",
  Ledger: "/projectmanagement/ledger",
  Income: "/projectmanagement/income",
  Expenses: "/projectmanagement/expenses",
  Suppliers: "/projectmanagement/parties",
};

const MODULE_LABEL_BY_PATH: Record<string, string> = {
  "/projectmanagement": "Overview",
  "/projectmanagement/ledger": "Ledger",
  "/projectmanagement/income": "Income",
  "/projectmanagement/expenses": "Expenses",
  "/projectmanagement/parties": "Suppliers",
};

function normalizePath(path: string) {
  const clean = String(path || "").replace(/\/+$/, "");
  return clean || "/";
}

function projectIdFromLocation() {
  return new URLSearchParams(window.location.search).get("projectId") || "";
}

function hrefWithProject(path: string, projectId = projectIdFromLocation()) {
  return projectId ? `${path}?projectId=${encodeURIComponent(projectId)}` : path;
}

function navLabel(button: HTMLButtonElement) {
  return String(button.textContent || "").trim();
}

function hideRetiredLegacyModules() {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".pm-module-nav button"));
  for (const button of buttons) {
    if (navLabel(button) === "Sattapur Bricks") button.style.display = "none";
  }
}

export default function ProjectFinanceRouteController() {
  const pathname = usePathname();
  useEffect(() => {
    if (!normalizePath(window.location.pathname).startsWith("/projectmanagement")) return;

    let syncing = false;
    let scheduled = false;

    const scheduleSync = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        hideRetiredLegacyModules();
        syncModuleToRoute();
      });
    };

    const syncModuleToRoute = () => {
      const path = normalizePath(window.location.pathname);
      const targetLabel = MODULE_LABEL_BY_PATH[path];
      if (!targetLabel) return;

      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(".pm-module-nav button"));
      const target = buttons.find((button) => navLabel(button) === targetLabel);
      if (!target || target.classList.contains("is-active")) return;

      const desiredUrl = hrefWithProject(path);
      syncing = true;
      target.click();
      syncing = false;

      window.setTimeout(() => {
        if (normalizePath(window.location.pathname) !== path || window.location.search !== new URL(desiredUrl, window.location.origin).search) {
          window.history.replaceState(null, "", desiredUrl);
        }
      }, 0);
    };

    const go = (path: string) => {
      const next = hrefWithProject(path);
      if (`${window.location.pathname}${window.location.search}` === next) {
        scheduleSync();
        return;
      }
      window.location.assign(next);
    };

    const onClickCapture = (event: MouseEvent) => {
      if (syncing) return;
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>("button");
      if (!button) return;

      if (button.closest(".pm-module-nav")) {
        const label = navLabel(button);
        if (label === "Sattapur Bricks") {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        const route = MODULE_ROUTE_BY_LABEL[label];
        if (route) {
          event.preventDefault();
          event.stopPropagation();
          go(route);
          return;
        }
        if (/Monthly Report/i.test(label)) {
          event.preventDefault();
          event.stopPropagation();
          go("/projectmanagement/reports");
          return;
        }
        if (/Billing\s*&\s*Bills/i.test(label)) {
          event.preventDefault();
          event.stopPropagation();
          go("/projectmanagement/bills");
          return;
        }
      }

      const label = navLabel(button);
      if (/Suppliers\s*\/\s*Contractors/i.test(label)) {
        event.preventDefault();
        event.stopPropagation();
        go("/projectmanagement/parties");
      } else if (/Monthly Report/i.test(label)) {
        event.preventDefault();
        event.stopPropagation();
        go("/projectmanagement/reports");
      } else if (/Billing\s*&\s*Bills/i.test(label)) {
        event.preventDefault();
        event.stopPropagation();
        go("/projectmanagement/bills");
      }
    };

    const onChangeCapture = (event: Event) => {
      const select = (event.target as HTMLElement | null)?.closest<HTMLSelectElement>(".pm-project-select select");
      if (!select) return;
      const path = normalizePath(window.location.pathname);
      if (!MODULE_LABEL_BY_PATH[path]) return;
      const nextProject = select.value;
      window.setTimeout(() => {
        window.history.replaceState(null, "", hrefWithProject(path, nextProject));
        scheduleSync();
      }, 0);
    };

    const onProjectChoiceCapture = (event: MouseEvent) => {
      const choice = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>(".pm-project-option");
      if (!choice) return;
      const path = normalizePath(window.location.pathname);
      if (!MODULE_LABEL_BY_PATH[path] || path === "/projectmanagement") return;
      const code = String(choice.querySelector(".pm-option-code")?.textContent || "").trim();
      if (!code) return;
      window.setTimeout(() => {
        window.history.replaceState(null, "", hrefWithProject(path, code));
        scheduleSync();
      }, 0);
    };

    document.addEventListener("click", onClickCapture, true);
    document.addEventListener("click", onProjectChoiceCapture, true);
    document.addEventListener("change", onChangeCapture, true);

    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleSync();

    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClickCapture, true);
      document.removeEventListener("click", onProjectChoiceCapture, true);
      document.removeEventListener("change", onChangeCapture, true);
    };
  }, [pathname]);

  return null;
}
