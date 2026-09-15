"use client";

import { useEffect } from "react";

type PortalType = "admin" | "employee" | "client";
type Entry = { response: Response; expiresAt: number };
type Access = { all?: boolean; permissions?: Record<string, boolean> };

const TTL_MS = 90_000;
const SYNC_INTERVAL_MS = 120_000;
const BACKGROUND_TIMEOUT_MS = 15_000;
const MAX_BACKGROUND_REQUESTS = 2;

function details(input: RequestInfo | URL, init?: RequestInit) {
  const request = input instanceof Request ? input : null;
  const raw = input instanceof URL ? input.href : typeof input === "string" ? input : input.url;
  const url = new URL(raw, window.location.origin);
  url.searchParams.sort();
  return {
    url,
    key: url.pathname + url.search,
    method: String(init?.method || request?.method || "GET").toUpperCase(),
    signal: init?.signal || request?.signal,
  };
}

function isAuthoritativeSessionCheck(url: URL) {
  return url.pathname === "/api/session-fast" ||
    (url.pathname === "/api/landview" && url.searchParams.get("action") === "getSession");
}

function dataPlan(portal: PortalType, role: string, access: Access): string[] {
  const urls = new Set<string>();
  const api = (action: string, params: Record<string, string> = {}) =>
    "/api/landview?" + new URLSearchParams({ action, ...params }).toString();
  const add = (action: string, params?: Record<string, string>) => urls.add(api(action, params));
  const sheet = (tab: string) => add("getFinanceSheet", { tab });
  const allowed = (permission: string) =>
    role === "admin" || role === "manager" || access.all === true || access.permissions?.[permission] === true;

  if (portal === "client" && role === "client") {
    return ["/api/client-access", "/api/certificate-portal"];
  }
  if (portal === "employee" && role === "employee") {
    return [
      "/api/employee-workspace",
      api("getProjects"), api("getSiteVisits"), api("getDocuments"),
      ...["tasks", "attendance", "drawings", "leave"].map(module => api("getErpRecords", { module })),
    ];
  }
  if (portal !== "admin" || !["admin", "manager", "accounts", "employee"].includes(role)) return [];
  if (allowed("dashboard.view")) add("getDashboard");
  if (allowed("projects.view")) add("getProjects");
  if (allowed("finance.view")) {
    for (const tab of ["Summary", "File List", "Design Bill", "Design Deposit", "Supervision Bill", "S Deposit", "Others Bill", "Others Bill Deposit"]) sheet(tab);
    add("getPayments");
  }
  if (allowed("accounts.view") || allowed("ledger.view")) {
    sheet("Accounting Income");
    sheet("Accounting Expenses");
  }
  if (allowed("projects.view")) { add("getDocuments"); add("getSiteVisits"); }
  if (allowed("proposals.view")) add("getErpRecords", { module: "proposalsV2", op: "list" });
  if (allowed("workflow.view")) {
    for (const tab of ["Workflow", "Design Bill", "Others Bill", "Supervision Bill"]) sheet(tab);
  }
  if (allowed("employees.view")) add("getEmployees");
  if (allowed("requests.view")) {
    urls.add("/api/certificate-portal?mode=admin");
    sheet("Certificate Requests");
  }
  if (allowed("certificates.view")) urls.add("/api/certificates");
  return [...urls];
}

export default function PortalPreloader({ portal }: { portal: PortalType }) {
  useEffect(() => {
    // Cache belongs only to this mounted, authenticated portal. Never persist billing data.
    const originalFetch = window.fetch;
    const network = originalFetch.bind(window);
    const entries = new Map<string, Entry>();
    const background = new Map<string, AbortController>();
    let generation = 0;
    let stopped = false;
    let sessionExpired = false;
    let running = false;
    let foreground = 0;
    let mutations = 0;
    let rerun = false;
    let lastRun = 0;
    let scheduled: ReturnType<typeof setTimeout> | undefined;

    const invalidate = () => {
      generation += 1;
      entries.clear();
      for (const controller of background.values()) controller.abort();
      background.clear();
    };
    const canRun = () => !stopped && !sessionExpired && navigator.onLine && document.visibilityState === "visible";

    const schedule = (delay = 1500) => {
      if (stopped || sessionExpired) return;
      clearTimeout(scheduled);
      scheduled = setTimeout(() => { void run(); }, delay);
    };

    const wrappedFetch: typeof window.fetch = async (input, init) => {
      const info = details(input, init);
      if (info.url.origin !== window.location.origin || !info.url.pathname.startsWith("/api/")) {
        return network(input, init);
      }
      if (info.signal?.aborted) throw new DOMException("The request was aborted.", "AbortError");
      const mutating = !["GET", "HEAD", "OPTIONS"].includes(info.method);
      if (mutating) {
        mutations += 1;
        invalidate();
      }
      if (info.method === "GET") {
        const entry = entries.get(info.key);
        entries.delete(info.key);
        // One-use warm responses accelerate navigation; subsequent refreshes hit the server.
        if (!mutations && !sessionExpired && entry && entry.expiresAt > Date.now()) return entry.response.clone();
        // A page request takes priority; never wait for a slow background request.
        background.get(info.key)?.abort();
      }
      foreground += 1;
      try {
        const response = await network(input, init);
        // A 401 from a feature route can mean permission/access failure and is
        // not authoritative proof that the login cookie is dead. Only dedicated
        // session endpoints are allowed to poison the preloader session state.
        if (response.status === 401 && isAuthoritativeSessionCheck(info.url)) {
          sessionExpired = true;
          invalidate();
        } else if (response.status === 401 || response.status === 403) {
          invalidate();
        }
        return response;
      } finally {
        foreground -= 1;
        if (mutating) {
          mutations -= 1;
          // Invalidate again after the write so reads started during it cannot survive.
          invalidate();
          schedule();
        }
      }
    };
    window.fetch = wrappedFetch;

    async function read(url: string) {
      const info = details(url);
      const key = info.key;
      const controller = new AbortController();
      const version = generation;
      background.set(key, controller);
      const timer = setTimeout(() => controller.abort(), BACKGROUND_TIMEOUT_MS);
      try {
        const response = await network(url, {
          credentials: "same-origin", cache: "no-store", signal: controller.signal,
        });
        if (response.status === 401 && isAuthoritativeSessionCheck(info.url)) {
          sessionExpired = true;
          invalidate();
          return null;
        }
        if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return null;
        const json = await response.clone().json();
        if (stopped || controller.signal.aborted || version !== generation || json?.success !== true) return null;
        return { response, json };
      } catch {
        return null;
      } finally {
        clearTimeout(timer);
        if (background.get(key) === controller) background.delete(key);
      }
    }

    async function run() {
      if (!canRun()) return;
      if (running) { rerun = true; return; }
      if (foreground || mutations) { schedule(); return; }
      running = true;
      rerun = false;
      lastRun = Date.now();
      const version = generation;
      try {
        // Session and permissions always come from the server, never from warmed responses.
        const session = await read("/api/session-fast");
        if (!session?.json?.data?.authenticated) { invalidate(); return; }
        const user = session.json.data.user;
        const role = String(user?.role || user?.Role || "").trim().toLowerCase();
        let access: Access = {};
        if (portal === "admin") {
          const permissions = await read("/api/landview?action=getErpRecords&module=workspacePermissionsV2");
          if (!permissions) return;
          access = permissions.json.data || {};
        }
        if (version !== generation || !canRun()) return;
        // Discard the previous cycle, including entries whose permissions may have changed.
        entries.clear();
        const queue = dataPlan(portal, role, access);
        let cursor = 0;
        async function worker() {
          while (cursor < queue.length && version === generation && canRun()) {
            if (foreground || mutations) {
              await new Promise<void>(resolve => setTimeout(resolve, 250));
              continue;
            }
            const url = queue[cursor++];
            const result = await read(url);
            if (result && version === generation && canRun() && !mutations) {
              entries.set(details(url).key, { response: result.response, expiresAt: Date.now() + TTL_MS });
            }
          }
        }
        await Promise.allSettled(Array.from({ length: MAX_BACKGROUND_REQUESTS }, () => worker()));
      } finally {
        running = false;
        if (rerun && canRun()) schedule();
      }
    }

    const resume = () => {
      if (canRun() && Date.now() - lastRun > 30_000) schedule();
    };
    const pause = () => {
      if (!navigator.onLine || document.visibilityState !== "visible") invalidate();
      else resume();
    };
    const accountChanged = (event: StorageEvent) => {
      if (event.key === null || event.key === "land_view_session_cache_v1") {
        invalidate();
        // Another tab changed accounts or signed out: validate before warming again.
        sessionExpired = false;
        schedule();
      }
    };
    schedule();
    const interval = setInterval(() => { if (canRun()) schedule(); }, SYNC_INTERVAL_MS);
    window.addEventListener("online", resume);
    window.addEventListener("offline", pause);
    window.addEventListener("focus", resume);
    window.addEventListener("storage", accountChanged);
    document.addEventListener("visibilitychange", pause);
    return () => {
      stopped = true;
      clearTimeout(scheduled);
      clearInterval(interval);
      invalidate();
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", pause);
      window.removeEventListener("focus", resume);
      window.removeEventListener("storage", accountChanged);
      document.removeEventListener("visibilitychange", pause);
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
    };
  }, [portal]);

  return null;
}
