"use client";

import { useEffect } from "react";

const KEEPALIVE_MS = 10 * 60 * 1000;

function isPortalPath(pathname: string) {
  return pathname.startsWith("/admin") || pathname.startsWith("/employee") || pathname.startsWith("/client");
}

export default function SessionKeepAlive() {
  useEffect(() => {
    if (window.location.hostname !== "app.landview.com.bd" && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") return;
    if (!isPortalPath(window.location.pathname)) return;

    let stopped = false;
    const ping = async () => {
      if (stopped || document.visibilityState === "hidden") return;
      try {
        await fetch("/api/landview?action=getSession", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          headers: { "x-landview-keepalive": "1" },
        });
      } catch {
        // A keep-alive failure should never interrupt the user's current screen.
      }
    };

    const timer = window.setInterval(() => { void ping(); }, KEEPALIVE_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void ping();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
