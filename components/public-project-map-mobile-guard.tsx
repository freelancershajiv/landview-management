"use client";

import { useEffect } from "react";

export default function PublicProjectMapMobileGuard() {
  useEffect(() => {
    let frame = 0;
    let settleTimer = 0;

    const fireLeafletResize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        window.dispatchEvent(new Event("resize"));
      });
    };

    const syncLeafletSize = () => {
      fireLeafletResize();

      // Mobile browser chrome and orientation changes often finish in two
      // stages. A second resize after layout settles prevents partially
      // rendered/grey Leaflet tiles without constantly polling the page.
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(fireLeafletResize, 140);
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") syncLeafletSize();
    };

    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", syncLeafletSize, { passive: true });
    window.addEventListener("orientationchange", syncLeafletSize, { passive: true });
    window.addEventListener("pageshow", syncLeafletSize, { passive: true });
    document.addEventListener("visibilitychange", handleVisibility);

    const observedElements = [
      document.querySelector<HTMLElement>(".project-map-canvas-wrap"),
      document.querySelector<HTMLElement>(".project-map-shell"),
    ].filter((element): element is HTMLElement => Boolean(element));

    const observer = "ResizeObserver" in window
      ? new ResizeObserver(syncLeafletSize)
      : null;

    observedElements.forEach((element) => observer?.observe(element));

    const firstSync = window.setTimeout(syncLeafletSize, 0);
    const hydratedSync = window.setTimeout(syncLeafletSize, 280);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(firstSync);
      window.clearTimeout(hydratedSync);
      window.clearTimeout(settleTimer);
      observer?.disconnect();
      viewport?.removeEventListener("resize", syncLeafletSize);
      window.removeEventListener("orientationchange", syncLeafletSize);
      window.removeEventListener("pageshow", syncLeafletSize);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  return null;
}
