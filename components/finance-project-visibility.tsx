"use client";

import { useEffect, useRef } from "react";

function normalizeProjectId(value: unknown) {
  const raw = String(value ?? "").trim().toUpperCase();
  const match = raw.match(/^(?:LV[\s_-]*)?0*(\d+)$/i);
  return match ? `LV-${Number(match[1])}` : raw;
}

export default function FinanceProjectVisibility() {
  const closedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let active = true;

    function apply() {
      const closed = closedRef.current;
      document.querySelectorAll<HTMLSelectElement>("select").forEach((select) => {
        Array.from(select.options).forEach((option) => {
          const code = normalizeProjectId(option.value);
          if (!/^LV-\d+$/.test(code)) return;
          const isClosed = closed.has(code);
          option.hidden = isClosed;
          option.disabled = isClosed;
          if (isClosed) option.dataset.financeClosed = "1";
          else delete option.dataset.financeClosed;
        });
        const selected = normalizeProjectId(select.value);
        if (selected && closed.has(selected)) select.value = "";
      });

      document.querySelectorAll<HTMLDataListElement>("datalist").forEach((list) => {
        Array.from(list.options).forEach((option) => {
          const code = normalizeProjectId(option.value);
          if (!/^LV-\d+$/.test(code)) return;
          const isClosed = closed.has(code);
          option.hidden = isClosed;
          option.disabled = isClosed;
          if (isClosed) option.dataset.financeClosed = "1";
          else delete option.dataset.financeClosed;
        });
      });
    }

    async function load() {
      try {
        const response = await fetch("/api/finance/projects", { credentials: "same-origin", cache: "no-store" });
        const json = await response.json().catch(() => null);
        if (!active || !response.ok || !json?.success) return;
        const projects = Array.isArray(json?.data?.projects) ? json.data.projects : [];
        closedRef.current = new Set(projects.filter((project: any) => project?.financeClosed).map((project: any) => normalizeProjectId(project.projectId)).filter(Boolean));
        apply();
      } catch {}
    }

    const observer = new MutationObserver(() => apply());
    observer.observe(document.body, { childList: true, subtree: true });

    const onStateChange = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string; closed?: boolean }>).detail || {};
      const code = normalizeProjectId(detail.projectId);
      if (!code) return;
      const next = new Set(closedRef.current);
      if (detail.closed) next.add(code); else next.delete(code);
      closedRef.current = next;
      apply();
    };
    window.addEventListener("finance-project-state-changed", onStateChange as EventListener);
    void load();

    return () => {
      active = false;
      observer.disconnect();
      window.removeEventListener("finance-project-state-changed", onStateChange as EventListener);
    };
  }, []);

  return null;
}
