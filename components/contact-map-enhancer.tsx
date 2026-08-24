"use client";

import { useEffect } from "react";

const MAP_SRC = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d4356.190423510396!2d91.39055807588109!3d23.009163916827497!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x375369044c86cf81%3A0x39168eea8573ae31!2sLand%20View%20Building%20Design%20%26%20Architecture!5e1!3m2!1sen!2sbd!4v1787603787955!5m2!1sen!2sbd";

const css = `
  .lv-contact-grid { grid-template-columns: .82fr 1.18fr !important; gap: 54px !important; align-items: start !important; }
  .lv-contact-card.lv-contact-enhanced { padding: 0 !important; overflow: hidden; border-color: #34414c !important; background: #0b151e !important; }
  .lv-contact-details-grid { display: grid; grid-template-columns: 1.35fr 1fr; }
  .lv-contact-details-grid > div { min-height: 94px; padding: 20px 22px !important; border-top: 0 !important; border-bottom: 1px solid #2c3944; }
  .lv-contact-details-grid > div:nth-child(odd) { border-right: 1px solid #2c3944; }
  .lv-contact-details-grid > div:nth-last-child(-n+2) { border-bottom: 0; }
  .lv-contact-map { position: relative; height: 300px; border-top: 1px solid #34414c; background: #07101a; }
  .lv-contact-map iframe { display: block; width: 100%; height: 100%; border: 0; filter: grayscale(.18) brightness(.82) contrast(1.08); }
  .lv-contact-map-label { position: absolute; z-index: 2; left: 18px; top: 18px; padding: 9px 12px; border: 1px solid rgba(239,183,51,.45); border-radius: 5px; background: rgba(7,16,26,.92); color: #efb733; font-size: 7px; font-weight: 900; letter-spacing: .13em; text-transform: uppercase; pointer-events: none; box-shadow: 0 8px 20px rgba(0,0,0,.28); }
  @media (max-width: 850px) {
    .lv-contact-grid { grid-template-columns: 1fr !important; gap: 36px !important; }
    .lv-contact-map { height: 340px; }
  }
  @media (max-width: 560px) {
    .lv-contact-details-grid { grid-template-columns: 1fr; }
    .lv-contact-details-grid > div { min-height: auto; border-right: 0 !important; border-bottom: 1px solid #2c3944 !important; }
    .lv-contact-details-grid > div:last-child { border-bottom: 0 !important; }
    .lv-contact-map { height: 290px; }
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

    map.append(label, iframe);
    card.appendChild(map);
  }, []);

  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
