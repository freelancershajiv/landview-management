"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { clearStoredSession } from "@/lib/api";

const IDLE_MS = 30 * 60 * 1000;
const ABSOLUTE_MS = 8 * 60 * 60 * 1000;
const LAST_ACTIVITY_KEY = "landview_last_activity";
const LOGIN_AT_KEY = "landview_login_at";
const CHECK_MS = 15 * 1000;
const ACTIVITY_WRITE_THROTTLE_MS = 30 * 1000;

function protectedPortal(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/") ||
    pathname === "/employee" || pathname.startsWith("/employee/") ||
    pathname === "/client" || pathname.startsWith("/client/");
}

export default function SessionExpiryGuard() {
  const pathname = usePathname();
  const lastWrite = useRef(0);
  const loggingOut = useRef(false);

  useEffect(() => {
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

    const logout = async (reason: string) => {
      if (loggingOut.current) return;
      loggingOut.current = true;
      try {
        await fetch("/api/landview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          cache: "no-store",
          body: JSON.stringify({ action: "logout", logoutReason: reason }),
        });
      } catch {}
      clearStoredSession();
      try {
        localStorage.removeItem(LOGIN_AT_KEY);
        localStorage.removeItem(LAST_ACTIVITY_KEY);
      } catch {}
      window.location.replace(`/login?expired=${encodeURIComponent(reason)}`);
    };

    const check = () => {
      const time = Date.now();
      let loginAt = time;
      let lastActivity = time;
      try {
        loginAt = Number(localStorage.getItem(LOGIN_AT_KEY)) || time;
        lastActivity = Number(localStorage.getItem(LAST_ACTIVITY_KEY)) || loginAt;
      } catch {}
      if (time - loginAt >= ABSOLUTE_MS) void logout("Maximum session duration");
      else if (time - lastActivity >= IDLE_MS) void logout("Idle timeout");
    };

    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "scroll", "touchstart"];
    events.forEach((event) => window.addEventListener(event, recordActivity, { passive: true }));
    const timer = window.setInterval(check, CHECK_MS);
    check();

    return () => {
      events.forEach((event) => window.removeEventListener(event, recordActivity));
      window.clearInterval(timer);
    };
  }, [pathname]);

  return null;
}
