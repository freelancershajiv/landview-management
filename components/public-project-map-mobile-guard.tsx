"use client";

import { useEffect } from "react";

export default function PublicProjectMapMobileGuard() {
  useEffect(() => {
    let frame = 0;

    const syncLeafletSize = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        window.dispatchEvent(new Event("resize"));
      });
    };

    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", syncLeafletSize);
    window.addEventListener("orientationchange", syncLeafletSize);

    const canvasWrap = document.querySelector<HTMLElement>(".project-map-canvas-wrap");
    const observer = canvasWrap && "ResizeObserver" in window
      ? new ResizeObserver(syncLeafletSize)
      : null;

    if (canvasWrap) observer?.observe(canvasWrap);

    const firstSync = window.setTimeout(syncLeafletSize, 0);
    const settledSync = window.setTimeout(syncLeafletSize, 250);

    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(firstSync);
      window.clearTimeout(settledSync);
      observer?.disconnect();
      viewport?.removeEventListener("resize", syncLeafletSize);
      window.removeEventListener("orientationchange", syncLeafletSize);
    };
  }, []);

  return null;
}
