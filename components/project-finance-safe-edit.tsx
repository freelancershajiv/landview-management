"use client";

import { useEffect } from "react";

function isReceivedFromSelect(target: EventTarget | null) {
  if (!(target instanceof HTMLSelectElement)) return false;
  const label = target.closest("label");
  return String(label?.querySelector("span")?.textContent || "").trim().toLowerCase() === "received from";
}

function isProjectManagementPut(input: RequestInfo | URL, init?: RequestInit) {
  const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "PUT") return false;
  const raw = input instanceof Request ? input.url : String(input);
  try {
    const url = new URL(raw, window.location.origin);
    return url.origin === window.location.origin && url.pathname === "/api/project-management";
  } catch {
    return raw === "/api/project-management";
  }
}

export default function ProjectFinanceSafeEdit() {
  useEffect(() => {
    const nativeFetch = window.fetch.bind(window);
    let receivedFromExplicitlyChanged = false;

    const onChange = (event: Event) => {
      if (isReceivedFromSelect(event.target)) receivedFromExplicitlyChanged = true;
    };

    const resetOnModalOpen = (mutations: MutationRecord[]) => {
      const openedEditModal = mutations.some((mutation) =>
        Array.from(mutation.addedNodes).some((node) => {
          if (!(node instanceof Element)) return false;
          const modal = node.matches(".pm-entry-modal") ? node : node.querySelector(".pm-entry-modal");
          if (!modal) return false;
          const title = String(modal.querySelector(".pm-modal-head h2")?.textContent || "").trim();
          return /^Edit\b/i.test(title);
        }),
      );
      if (openedEditModal) receivedFromExplicitlyChanged = false;
    };

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!isProjectManagementPut(input, init)) return nativeFetch(input, init);

      try {
        const rawBody = typeof init?.body === "string" ? init.body : "";
        const body = rawBody ? JSON.parse(rawBody) : {};
        const nextInit: RequestInit = {
          ...init,
          method: "PUT",
          headers: { ...(init?.headers || {}), "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, receivedFromExplicitlyChanged }),
        };
        const response = await nativeFetch("/api/project-management-safe-edit", nextInit);
        if (response.ok) receivedFromExplicitlyChanged = false;
        return response;
      } catch {
        return nativeFetch(input, init);
      }
    };

    document.addEventListener("change", onChange, true);
    const observer = new MutationObserver(resetOnModalOpen);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener("change", onChange, true);
      observer.disconnect();
      window.fetch = nativeFetch;
    };
  }, []);

  return null;
}
