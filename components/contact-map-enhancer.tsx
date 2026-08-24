"use client";

import { useEffect } from "react";

const MAP_SRC = "https://www.google.com/maps?q=23.009163916827497,91.39055807588109&z=17&output=embed";
const MAP_LINK = "https://www.google.com/maps/search/?api=1&query=23.009163916827497,91.39055807588109";

const css = `
  .lv-contact-grid { grid-template-columns: .82fr 1.18fr !important; gap: 54px !important; align-items: start !important; }
  .lv-contact-card.lv-contact-enhanced { padding: 0 !important; overflow: hidden; border-color: #34414c !important; background: #0b151e !important; }
  .lv-contact-details-grid { display: grid; grid-template-columns: 1.35fr 1fr; }
  .lv-contact-details-grid > div { min-height: 94px; padding: 20px 22px !important; border-top: 0 !important; border-bottom: 1px solid #2c3944; }
  .lv-contact-details-grid > div:nth-child(odd) { border-right: 1px solid #2c3944; }
  .lv-contact-details-grid > div:nth-last-child(-n+2) { border-bottom: 0; }
  .lv-contact-map { position: relative; height: 320px; border-top: 1px solid #34414c; background: #07101a; }
  .lv-contact-map iframe { display: block; width: 100%; height: 100%; border: 0; filter: grayscale(.12) brightness(.86) contrast(1.06); }
  .lv-contact-map-label { position: absolute; z-index: 2; left: 18px; top: 18px; padding: 9px 12px; border: 1px solid rgba(239,183,51,.45); border-radius: 5px; background: rgba(7,16,26,.92); color: #efb733; font-size: 7px; font-weight: 900; letter-spacing: .13em; text-transform: uppercase; pointer-events: none; box-shadow: 0 8px 20px rgba(0,0,0,.28); }
  .lv-contact-map-link { position: absolute; z-index: 3; right: 16px; bottom: 16px; min-height: 36px; display: inline-flex; align-items: center; justify-content: center; padding: 0 13px; border: 1px solid #d79a17; border-radius: 5px; background: rgba(7,16,26,.94); color: #efb733 !important; font-size: 7px !important; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; box-shadow: 0 8px 20px rgba(0,0,0,.28); }
  .lv-contact-map-link:hover { background: #d79a17; color: #08111a !important; }
  @media (max-width: 850px) {
    .lv-contact-grid { grid-template-columns: 1fr !important; gap: 36px !important; }
    .lv-contact-map { height: 340px; }
  }
  @media (max-width: 560px) {
    .lv-contact-details-grid { grid-template-columns: 1fr; }
    .lv-contact-details-grid > div { min-height: auto; border-right: 0 !important; border-bottom: 1px solid #2c3944 !important; }
    .lv-contact-details-grid > div:last-child { border-bottom: 0 !important; }
    .lv-contact-map { height: 300px; }
  }
`;

export default function ContactMapEnhancer() {
  useEffect(() => {
    const card = document.querySelector<HTMLElement>(".lv-contact-card");
    if (!card || card.dataset.mapEnhanced === "true") return;

    card.dataset.mapEnhanced = "true";
    card.classList.add("lv-contact-enhanced");

    const details = document.createElement("div");
    details.className = "lv-contact-details-grid";
    while (card.firstChild) details.appendChild(card.firstChild);
    card.appendChild(details);

    const map = document.createElement("div");
    map.className = "lv-contact-map";

    const label = document.createElement("span");
    label.className = "lv-contact-map-label";
    label.textContent = "LAND VIEW · FENI";

    const iframe = document.createElement("iframe");
    iframe.src = MAP_SRC;
    iframe.title = "LAND VIEW office location on Google Maps";
    iframe.loading = "lazy";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    iframe.allowFullscreen = true;

    const openMap = document.createElement("a");
    openMap.className = "lv-contact-map-link";
    openMap.href = MAP_LINK;
    openMap.target = "_blank";
    openMap.rel = "noreferrer";
    openMap.textContent = "Open in Google Maps";

    map.append(label, iframe, openMap);
    card.appendChild(map);
  }, []);

  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
