"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { clearStoredSession, saveSessionCache } from "@/lib/api";

const IDLE_MS = 30 * 60 * 1000;
const ABSOLUTE_MS = 8 * 60 * 60 * 1000;
const KEEPALIVE_MS = 10 * 60 * 1000;
const LAST_ACTIVITY_KEY = "landview_last_activity";
const LOGIN_AT_KEY = "landview_login_at";
const CHECK_MS = 15 * 1000;
const ACTIVITY_WRITE_THROTTLE_MS = 30 * 1000;

function protectedPortal(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/") ||
    pathname === "/employee" || pathname.startsWith("/employee/") ||
    pathname === "/client" || pathname.startsWith("/client/") ||
    pathname === "/account" || pathname.startsWith("/account/") ||
    pathname === "/projectmanagement" || pathname.startsWith("/projectmanagement/");
}

function portalPathForRole(value: unknown) {
  const role = String(value || "").trim().toLowerCase();
  if (role === "admin" || role === "manager") return "/admin";
  if (role === "employee") return "/employee";
  if (role === "client") return "/client";
  return "";
}

function explicitAuthFailure(response: Response, json: any) {
  if (response.status === 401) return true;
  const message = String(json?.error || json?.message || "").trim().toLowerCase();
  return json?.success === false && [
    "unauthorized",
    "session expired.",
    "session expired",
    "invalid session.",
    "invalid session",
    "authentication required.",
    "authentication required",
  ].includes(message);
}

async function bootstrapBrowserSession() {
  const response = await fetch("/api/session-fast", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "x-landview-session-bootstrap": "1" },
  });
  const json = await response.json().catch(() => null);
  return { response, json };
}

export default function SessionExpiryGuard() {
  const pathname = usePathname();
  const lastWrite = useRef(0);
  const loggingOut = useRef(false);
  const validating = useRef(false);

  useEffect(() => {
    let stopped = false;

    // Login is the safe hand-off point for a remembered session whose access
    // token expired while the app was closed. POST rotates the refresh token in
    // the browser, so the new HttpOnly cookies are available to later requests.
    if (pathname === "/login") {
      void (async () => {
        try {
          const { response, json } = await bootstrapBrowserSession();
          if (stopped || !response.ok || !json?.success || !json?.data?.authenticated || !json?.data?.user) return;
          const destination = portalPathForRole(json.data.user?.role || json.data.user?.Role);
          if (!destination) return;
          saveSessionCache({ authenticated: true, user: json.data.user });
          window.location.replace(destination);
        } catch {
          // No usable remembered session: leave the normal login form available.
        }
      })();
      return () => { stopped = true; };
    }

    if (!protectedPortal(pathname)) return;

    const now = Date.now();
    try {
      if (!Number(localStorage.getItem(LOGIN_AT_KEY))) localStorage.setItem(LOGIN_AT_KEY, String(now));
      if (!Number(localStorage.getItem(LAST_ACTIVITY_KEY))) localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
    } catch {}

    const recordActivity = () => {
      const time = Date.now();
      if (time - lastWrite.current < ACTIVITY_WRITE_THROTTLE_MS) return;
      lastWrite.current = time;
      try { localStorage.setItem(LAST_ACTIVITY_KEY, String(time)); } catch {}
    };

    const expireLocally = (reason: string) => {
      if (loggingOut.current) return;
      loggingOut.current = true;
      clearStoredSession();
      try {
        localStorage.removeItem(LOGIN_AT_KEY);
        localStorage.removeItem(LAST_ACTIVITY_KEY);
      } catch {}
      window.location.replace(`/login?expired=${encodeURIComponent(reason)}`);
    };

    const refreshBrowserSession = async (reason: string, resetActivity: boolean) => {
      if (validating.current || loggingOut.current || stopped) return;
      validating.current = true;
      try {
        const { response, json } = await bootstrapBrowserSession();
        if (response.ok && json?.success && json?.data?.authenticated) {
          if (resetActivity) {
            const time = Date.now();
            try {
              localStorage.setItem(LOGIN_AT_KEY, String(time));
              localStorage.setItem(LAST_ACTIVITY_KEY, String(time));
            } catch {}
          }
          return;
        }

        // Only a confirmed authentication failure may end the browser session.
        // Temporary backend/network failures preserve the current screen.
        if (explicitAuthFailure(response, json)) expireLocally(reason);
      } catch {
        // Network failures are transient. Preserve the login and retry later.
      } finally {
        validating.current = false;
      }
    };

    const check = () => {
      const time = Date.now();
      let loginAt = time;
      let lastActivity = time;
      try {
        loginAt = Number(localStorage.getItem(LOGIN_AT_KEY)) || time;
        lastActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY)) || loginAt;
      } catch {}
      if (time - loginAt >= ABSOLUTE_MS) void refreshBrowserSession("Maximum session duration", true);
      else if (time - lastActivity >= IDLE_MS) void refreshBrowserSession("Idle timeout", true);
    };

    const keepAlive = () => {
      if (document.visibilityState === "visible") void refreshBrowserSession("Session expired", false);
    };

    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "scroll", "touchstart"];
    events.forEach((event) => window.addEventListener(event, recordActivity, { passive: true }));
    const checkTimer = window.setInterval(check, CHECK_MS);
    const keepAliveTimer = window.setInterval(keepAlive, KEEPALIVE_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") keepAlive();
    };
    document.addEventListener("visibilitychange", onVisibility);
    check();

    return () => {
      stopped = true;
      events.forEach((event) => window.removeEventListener(event, recordActivity));
      window.clearInterval(checkTimer);
      window.clearInterval(keepAliveTimer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [pathname]);

  return null;
}
