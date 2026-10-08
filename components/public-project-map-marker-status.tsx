"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

type MarkerState = "completed" | "active" | "hold";

declare global {
  interface Window {
    L?: any;
    __landViewMapMarkerStates?: Record<string, MarkerState>;
    __landViewCircleMarkerPatched?: boolean;
  }
}

const COLORS: Record<MarkerState, string> = {
  completed: "#22c55e",
  active: "#facc15",
  hold: "#ef4444",
};

const css = `
.lv-project-marker-legend{position:absolute;right:16px;top:16px;z-index:500;display:flex;gap:8px;flex-wrap:wrap;max-width:calc(100% - 260px);padding:8px 10px;border:1px solid rgba(255,255,255,.14);border-radius:9px;background:rgba(8,13,18,.9);backdrop-filter:blur(10px);box-shadow:0 8px 24px rgba(0,0,0,.24);pointer-events:none}
.lv-project-marker-legend span{display:inline-flex;align-items:center;gap:6px;color:#cbd3d8;font-size:8px;font-weight:900;letter-spacing:.03em;white-space:nowrap}
.lv-project-marker-legend i{width:10px;height:10px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.18)}
.lv-project-marker-legend .completed{background:#22c55e}.lv-project-marker-legend .active{background:#facc15}.lv-project-marker-legend .hold{background:#ef4444}
.project-map-style-switch{left:52px!important;right:auto!important;top:16px!important}
.project-map-legend{right:16px!important;top:64px!important}
@media(max-width:760px){
  .project-map-style-switch{left:50px!important;right:auto!important;top:10px!important}
  .lv-project-marker-legend{left:10px;right:10px;top:58px;max-width:none;justify-content:center;gap:6px;padding:7px 8px}
  .lv-project-marker-legend span{font-size:7px}
  .project-map-legend{right:10px!important;top:116px!important}
}
@media(max-width:420px){
  .lv-project-marker-legend{top:58px;justify-content:flex-start}
  .project-map-legend{top:126px!important}
}
`;

export default function PublicProjectMapMarkerStatus({ states }: { states: Record<string, MarkerState> }) {
  const [legendHost, setLegendHost] = useState<Element | null>(null);

  useEffect(() => {
    window.__landViewMapMarkerStates = states;
    let attempts = 0;
    const timer = window.setInterval(() => {
      const L = window.L;
      if (L?.circleMarker && !window.__landViewCircleMarkerPatched) {
        const originalCircleMarker = L.circleMarker.bind(L);
        L.circleMarker = (...args: any[]) => {
          const marker = originalCircleMarker(...args);
          const originalBindTooltip = marker.bindTooltip;
          if (typeof originalBindTooltip === "function") {
            marker.bindTooltip = function(content: unknown, ...rest: any[]) {
              const match = String(content ?? "").match(/^\s*(LV-\d+)/i);
              const id = match?.[1]?.toUpperCase();
              const state = id ? window.__landViewMapMarkerStates?.[id] : undefined;
              if (state && typeof marker.setStyle === "function") {
                marker.setStyle({
                  color: "#fff",
                  weight: 2,
                  fillColor: COLORS[state],
                  fillOpacity: 0.96,
                });
              }
              return originalBindTooltip.call(marker, content, ...rest);
            };
          }
          return marker;
        };
        window.__landViewCircleMarkerPatched = true;
      }

      const host = document.querySelector(".project-map-canvas-wrap");
      if (host) setLegendHost(host);
      attempts += 1;
      if ((window.__landViewCircleMarkerPatched && host) || attempts > 400) window.clearInterval(timer);
    }, 15);

    return () => window.clearInterval(timer);
  }, [states]);

  return <>
    <style dangerouslySetInnerHTML={{ __html: css }} />
    {legendHost && createPortal(
      <div className="lv-project-marker-legend" aria-label="Project marker legend">
        <span><i className="completed" />Completed</span>
        <span><i className="active" />Design / Construction in progress</span>
        <span><i className="hold" />On hold</span>
      </div>,
      legendHost,
    )}
  </>;
}
