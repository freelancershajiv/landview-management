"use client";

import { useCallback, useEffect, useRef } from "react";

type BalanceResponse = {
  success?: boolean;
  data?: {
    currentBalance?: number;
  };
  error?: string;
};

function money(value: number) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function labelOf(node: Element) {
  return String(node.querySelector("span")?.textContent || "").trim().toLowerCase();
}

function setBalanceValue(container: Element | null, value: number) {
  if (!container) return;
  const strong = container.querySelector<HTMLElement>("strong");
  if (!strong) return;

  const formatted = money(value);
  if (strong.textContent !== formatted) strong.textContent = formatted;
  strong.classList.remove("positive", "negative");
  strong.classList.add(value < 0 ? "negative" : "positive");
  container.setAttribute("data-canonical-balance", String(value));
}

function applyCanonicalBalance(value: number) {
  const root = document.querySelector(".bank-accounts-page");
  if (!root) return;

  const currentMetric = Array.from(root.querySelectorAll(".bank-metric"))
    .find((node) => labelOf(node) === "current balance") || null;
  setBalanceValue(currentMetric, value);

  const closingStat = Array.from(root.querySelectorAll(".head-stat"))
    .find((node) => labelOf(node) === "closing / live") || null;
  setBalanceValue(closingStat, value);

  const note = currentMetric?.querySelector<HTMLElement>("p");
  const canonicalNote = "Canonical LAND VIEW server-ledger balance · one authoritative balance source.";
  if (note && note.textContent !== canonicalNote) note.textContent = canonicalNote;
}

export default function AccountsCanonicalBalanceBridge() {
  const currentRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin-balance-overview", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const json = await response.json().catch(() => null) as BalanceResponse | null;
      if (!response.ok || !json?.success) return;

      const next = Number(json.data?.currentBalance);
      if (!Number.isFinite(next)) return;
      currentRef.current = next;
      applyCanonicalBalance(next);
    } catch {
      // Keep the locally rendered ledger value if the canonical endpoint is temporarily unavailable.
    }
  }, []);

  useEffect(() => {
    void load();

    const observer = new MutationObserver(() => {
      if (currentRef.current === null) return;
      window.requestAnimationFrame(() => applyCanonicalBalance(currentRef.current as number));
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const refresh = () => { void load(); };
    const visibilityRefresh = () => {
      if (document.visibilityState === "visible") void load();
    };

    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", visibilityRefresh);
    const timer = window.setInterval(refresh, 30000);

    return () => {
      observer.disconnect();
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", visibilityRefresh);
      window.clearInterval(timer);
    };
  }, [load]);

  return null;
}
