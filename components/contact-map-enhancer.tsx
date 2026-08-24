"use client";

import { useEffect } from "react";

const MAP_LINK = "https://www.google.com/maps/search/?api=1&query=Land%20View%20Building%20Design%20%26%20Architecture%2C%20Feni%2C%20Bangladesh";

const css = `
  .lv-contact-grid { grid-template-columns: .82fr 1.18fr !important; gap: 54px !important; align-items: start !important; }
  .lv-contact-card.lv-contact-enhanced { padding: 0 !important; overflow: hidden; border-color: #34414c !important; background: #0b151e !important; }
  .lv-contact-details-grid { display: grid; grid-template-columns: 1.35fr 1fr; }
  .lv-contact-details-grid > div { min-height: 94px; padding: 20px 22px !important; border-top: 0 !important; border-bottom: 1px solid #2c3944; }
  .lv-contact-details-grid > div:nth-child(odd) { border-right: 1px solid #2c3944; }
  .lv-contact-details-grid > div:nth-last-child(-n+2) { border-bottom: 0; }

  .lv-location-card {
    position: relative;
    min-height: 320px;
    display: flex;
    align-items: flex-end;
    overflow: hidden;
    border-top: 1px solid #34414c;
    background:
      radial-gradient(circle at 72% 32%, rgba(215,154,23,.16), transparent 23%),
      linear-gradient(135deg, rgba(12,27,39,.96), rgba(5,12,19,.98));
  }
  .lv-location-card::before {
    content: "";
    position: absolute;
    inset: 0;
    opacity: .28;
    background-image:
      linear-gradient(rgba(255,255,255,.055) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.055) 1px, transparent 1px);
    background-size: 34px 34px;
  }
  .lv-location-card::after {
    content: "";
    position: absolute;
    width: 190px;
    height: 190px;
    right: 9%;
    top: 50%;
    transform: translateY(-50%);
    border: 1px solid rgba(239,183,51,.24);
    border-radius: 50%;
    box-shadow: 0 0 0 32px rgba(239,183,51,.035), 0 0 0 64px rgba(239,183,51,.02);
  }
  .lv-location-pin {
    position: absolute;
    z-index: 2;
    right: calc(9% + 72px);
    top: 50%;
    width: 46px;
    height: 46px;
    transform: translateY(-58%) rotate(45deg);
    border: 2px solid #efb733;
    border-radius: 50% 50% 50% 10px;
    background: #0b151e;
    box-shadow: 0 14px 30px rgba(0,0,0,.35);
  }
  .lv-location-pin::after {
    content: "";
    position: absolute;
    width: 10px;
    height: 10px;
    left: 50%;
    top: 50%;
    transform: translate(-50%,-50%);
    border-radius: 50%;
    background: #efb733;
  }
  .lv-location-copy {
    position: relative;
    z-index: 3;
    width: min(65%, 430px);
    padding: 30px;
  }
  .lv-location-kicker {
    display: block;
    margin-bottom: 10px;
    color: #efb733;
    font-size: 8px;
    font-weight: 900;
    letter-spacing: .16em;
    text-transform: uppercase;
  }
  .lv-location-copy h3 {
    margin: 0;
    color: #fff;
    font: 500 25px/1.15 Georgia, "Times New Roman", serif;
  }
  .lv-location-copy p {
    margin: 10px 0 0;
    color: #9ba6af;
    font-size: 10px;
    line-height: 1.7;
  }
  .lv-location-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 20px;
  }
  .lv-location-button {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 15px;
    border: 1px solid #d79a17;
    border-radius: 5px;
    background: linear-gradient(180deg,#e6aa27,#c98709);
    color: #101820 !important;
    font-size: 7px !important;
    font-weight: 900;
    letter-spacing: .08em;
    text-transform: uppercase;
    box-shadow: 0 8px 20px rgba(0,0,0,.24);
  }
  .lv-location-button:hover { filter: brightness(1.08); transform: translateY(-1px); }
  .lv-location-coords {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    padding: 0 13px;
    border: 1px solid #34414c;
    border-radius: 5px;
    background: rgba(7,16,26,.82);
    color: #91a0ad;
    font-size: 7px;
    letter-spacing: .06em;
  }

  @media (max-width: 850px) {
    .lv-contact-grid { grid-template-columns: 1fr !important; gap: 36px !important; }
  }
  @media (max-width: 560px) {
    .lv-contact-details-grid { grid-template-columns: 1fr; }
    .lv-contact-details-grid > div { min-height: auto; border-right: 0 !important; border-bottom: 1px solid #2c3944 !important; }
    .lv-contact-details-grid > div:last-child { border-bottom: 0 !important; }
    .lv-location-card { min-height: 300px; }
    .lv-location-copy { width: 100%; padding: 24px; }
    .lv-location-card::after, .lv-location-pin { opacity: .42; }
    .lv-location-copy h3 { font-size: 22px; }
    .lv-location-actions { flex-direction: column; align-items: stretch; }
    .lv-location-button, .lv-location-coords { width: 100%; }
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

    const location = document.createElement("div");
    location.className = "lv-location-card";

    const pin = document.createElement("span");
    pin.className = "lv-location-pin";
    pin.setAttribute("aria-hidden", "true");

    const copy = document.createElement("div");
    copy.className = "lv-location-copy";

    const kicker = document.createElement("span");
    kicker.className = "lv-location-kicker";
    kicker.textContent = "VISIT LAND VIEW";

    const title = document.createElement("h3");
    title.textContent = "Find us in Feni";

    const address = document.createElement("p");
    address.textContent = "F. Rahman AC Market (2nd Floor), S.S.K Road, Feni Sadar, Feni-3900, Bangladesh";

    const actions = document.createElement("div");
    actions.className = "lv-location-actions";

    const openMap = document.createElement("a");
    openMap.className = "lv-location-button";
    openMap.href = MAP_LINK;
    openMap.target = "_blank";
    openMap.rel = "noopener noreferrer";
    openMap.textContent = "Open in Google Maps";

    const coords = document.createElement("span");
    coords.className = "lv-location-coords";
    coords.textContent = "23.009164, 91.390558";

    actions.append(openMap, coords);
    copy.append(kicker, title, address, actions);
    location.append(pin, copy);
    card.appendChild(location);
  }, []);

  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
