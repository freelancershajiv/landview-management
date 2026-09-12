"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { readSessionCache } from "@/lib/api";

type PortalType = "admin" | "employee" | "client";
type WarmEntry = { response: Response; expiresAt: number };
type WarmState = {
  installed: boolean;
  originalFetch: typeof window.fetch;
  entries: Map<string, WarmEntry>;
  inflight: Map<string, Promise<void>>;
  generation: number;
};

declare global {
  interface Window {
    __landViewPortalWarmState?: WarmState;
  }
}

const WARM_TTL_MS = 90_000;
const MUTATING_PATHS = new Set([
  "/api/landview",
  "/api/client-access",
  "/api/employee-workspace",
  "/api/certificate-portal",
  "/api/certificates",
  "/api/workflow",
]);

function requestDetails(input: RequestInfo | URL, init?: RequestInit) {
  const request = input instanceof Request ? input : null;
  const method = String(init?.method || request?.method || "GET").toUpperCase();
  const rawUrl = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
  const url = new URL(rawUrl, window.location.origin);
  const sorted = new URLSearchParams(Array.from(url.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b)));
  const query = sorted.toString();
  return {
    method,
    url,
    key: `GET ${url.pathname}${query ? `?${query}` : ""}`,
  };
}

function getWarmState() {
  if (typeof window === "undefined") return null;
  if (window.__landViewPortalWarmState) return window.__landViewPortalWarmState;

  const state: WarmState = {
    installed: true,
    originalFetch: window.fetch.bind(window),
    entries: new Map(),
    inflight: new Map(),
    generation: 0,
  };

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const details = requestDetails(input, init);
    const isSameOrigin = details.url.origin === window.location.origin;

    if (isSameOrigin && details.method !== "GET" && MUTATING_PATHS.has(details.url.pathname)) {
      state.generation += 1;
      state.entries.clear();
    }

    if (isSameOrigin && details.method === "GET") {
      const warmInFlight = state.inflight.get(details.key);
      if (warmInFlight) {
        await warmInFlight;
      }

      const entry = state.entries.get(details.key);
      if (entry) {
        state.entries.delete(details.key);
        if (entry.expiresAt > Date.now()) return entry.response.clone();
      }
    }

    return state.originalFetch(input, init);
  }) as typeof window.fetch;

  window.__landViewPortalWarmState = state;
  return state;
}

async function warmGet(url: string) {
  const state = getWarmState();
  if (!state) return;

  const details = requestDetails(url, { method: "GET" });
  if (details.url.origin !== window.location.origin) return;

  const existing = state.entries.get(details.key);
  if (existing?.expiresAt && existing.expiresAt > Date.now()) return;
  if (state.inflight.has(details.key)) return state.inflight.get(details.key);

  const generation = state.generation;
  const task = state.originalFetch(details.url.toString(), {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
  }).then((response) => {
    if (response.ok && generation === state.generation) {
      state.entries.set(details.key, { response: response.clone(), expiresAt: Date.now() + WARM_TTL_MS });
    }
  }).catch(() => {}).finally(() => {
    state.inflight.delete(details.key);
  });

  state.inflight.set(details.key, task);
  return task;
}

function roleFromCache() {
  const session = readSessionCache();
  return String(session?.user?.role || session?.user?.Role || "").trim().toLowerCase();
}

function adminRoutes(role: string) {
  const shared = ["/admin", "/admin/projects", "/admin/finance", "/admin/finance/invoices"];
  if (role === "accounts") return shared;
  return [...shared, "/admin/workflow", "/admin/employees", "/admin/certificate-requests", "/admin/certificates"];
}

function adminPrimaryData() {
  return [
    "/api/landview?action=getSession",
    "/api/landview?action=getDashboard",
    "/api/landview?action=getFinanceSheet&tab=Summary",
    "/api/landview?action=getProjectServiceFolders&bulk=1&category=Running",
  ];
}

function adminSecondaryData(role: string) {
  const urls = [
    "/api/landview?action=getFinanceSheet&tab=File%20List",
    "/api/landview?action=getProjectServiceFolders&bulk=1&category=Paused",
    "/api/landview?action=getProjectServiceFolders&bulk=1&category=Completed",
    "/api/landview?action=getDocuments",
    "/api/landview?action=getFinanceSheet&tab=Design%20Bill",
    "/api/landview?action=getFinanceSheet&tab=Design%20Deposit",
    "/api/landview?action=getFinanceSheet&tab=Supervision%20Bill",
    "/api/landview?action=getFinanceSheet&tab=S%20Deposit",
    "/api/landview?action=getFinanceSheet&tab=Others%20Bill",
    "/api/landview?action=getFinanceSheet&tab=Others%20Bill%20Deposit",
  ];
  if (role !== "accounts") {
    urls.push(
      "/api/landview?action=getEmployees",
      "/api/landview?action=getFinanceSheet&tab=Workflow",
      "/api/landview?action=getSiteVisits",
    );
  }
  return urls;
}

function employeeData() {
  return [
    "/api/landview?action=getSession",
    "/api/employee-workspace",
    "/api/landview?action=getProjects",
    "/api/landview?action=getSiteVisits",
    "/api/landview?action=getDocuments",
    "/api/landview?action=getErpRecords&module=attendance",
    "/api/landview?action=getErpRecords&module=drawings",
    "/api/landview?action=getFinanceSheet&tab=Workflow",
    "/api/landview?action=getFinanceSheet&tab=Design%20Bill",
    "/api/landview?action=getFinanceSheet&tab=Others%20Bill",
    "/api/landview?action=getFinanceSheet&tab=Supervision%20Bill",
  ];
}

function clientData() {
  return [
    "/api/landview?action=getSession",
    "/api/client-access",
    "/api/certificate-portal",
  ];
}

function scheduleIdle(callback: () => void, delay = 700) {
  const idleWindow = window as typeof window & {
    requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };

  if (typeof idleWindow.requestIdleCallback === "function") {
    const id = idleWindow.requestIdleCallback(callback, { timeout: delay + 900 });
    return () => idleWindow.cancelIdleCallback?.(id);
  }

  const id = window.setTimeout(callback, delay);
  return () => window.clearTimeout(id);
}

export default function PortalPreloader({ portal }: { portal: PortalType }) {
  const router = useRouter();

  useEffect(() => {
    getWarmState();
    let cancelled = false;
    let cancelSecondary = () => {};

    const run = async () => {
      if (portal === "admin") {
        const role = roleFromCache();
        for (const route of adminRoutes(role)) router.prefetch(route);
        await Promise.allSettled(adminPrimaryData().map((url) => warmGet(url)));
        if (cancelled) return;
        cancelSecondary = scheduleIdle(() => {
          void Promise.allSettled(adminSecondaryData(role).map((url) => warmGet(url)));
        }, 800);
        return;
      }

      if (portal === "employee") {
        router.prefetch("/employee");
        await Promise.allSettled(employeeData().map((url) => warmGet(url)));
        return;
      }

      router.prefetch("/client");
      await Promise.allSettled(clientData().map((url) => warmGet(url)));
    };

    void run();
    return () => {
      cancelled = true;
      cancelSecondary();
    };
  }, [portal, router]);

  return null;
}
