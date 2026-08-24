"use client";

import { useEffect } from "react";

const MAP_LINK = "https://maps.app.goo.gl/oCLmqzJFdiDbngu36";

const css = `
  .lv-contact-grid { grid-template-columns: .82fr 1.18fr !important; gap: 54px !important; align-items: start !important; }
  .lv-contact-card.lv-contact-enhanced { padding: 0 !important; overflow: hidden; border-color: #34414c !important; background: #0b151e !important; }
  .lv-contact-details-grid { display: grid; grid-template-columns: 1.35fr 1fr; }
  .lv-contact-details-grid > div { min-height: 94px; padding: 20px 22px !important; border-top: 0 !important; border-bottom: 1px solid #2c3944; }
  .lv-contact-details-grid > div:nth-child(odd) { border-right: 1px solid #2c3944; }
  .lv-contact-details-grid > div:nth-last-child(-n+2) { border-bottom: 0; }

  .lv-location-card {
    position: relative;
    min-height: 300px;
    display: grid;
    grid-template-columns: 1.1fr .9fr;
    align-items: stretch;
    overflow: hidden;
    border-top: 1px solid #34414c;
    background:
      radial-gradient(circle at 80% 30%, rgba(215,154,23,.18), transparent 26%),
      linear-gradient(135deg, #0d1b27, #061019 72%);
  }
  .lv-location-card::before {
    content: "";
    position: absolute;
    inset: 0;
    opacity: .2;
    background-image:
      linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px);
    background-size: 34px 34px;
  }
  .lv-location-card::after {
    content: "";
    position: absolute;
    inset: auto -60px -80px auto;
    width: 260px;
    height: 260px;
    border: 1px solid rgba(239,183,51,.2);
    border-radius: 50%;
    box-shadow: 0 0 0 38px rgba(239,183,51,.03), 0 0 0 76px rgba(239,183,51,.018);
  }

  .lv-location-copy {
    position: relative;
    z-index: 3;
    padding: 34px 30px;
    align-self: center;
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
    font: 500 27px/1.12 Georgia, "Times New Roman", serif;
  }
  .lv-location-copy p {
    max-width: 470px;
    margin: 11px 0 0;
    color: #9ba6af;
    font-size: 10px;
    line-height: 1.75;
  }

  .lv-location-action {
    position: relative;
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 26px;
  }
  .lv-location-link {
    position: relative;
    width: min(100%, 260px);
    min-height: 170px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 24px;
    overflow: hidden;
    border: 1px solid rgba(239,183,51,.42);
    border-radius: 16px;
    background: linear-gradient(145deg, rgba(19,31,43,.96), rgba(8,15,22,.98));
    color: #fff !important;
    text-align: center;
    box-shadow: 0 18px 40px rgba(0,0,0,.3);
    transition: transform .2s ease, border-color .2s ease, box-shadow .2s ease;
  }
  .lv-location-link::before {
    content: "";
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 50% 20%, rgba(239,183,51,.15), transparent 34%);
    pointer-events: none;
  }
  .lv-location-link:hover {
    transform: translateY(-4px);
    border-color: #efb733;
    box-shadow: 0 24px 52px rgba(0,0,0,.38), 0 0 0 1px rgba(239,183,51,.08);
  }
  .lv-location-icon {
    position: relative;
    width: 48px;
    height: 48px;
    border: 2px solid #efb733;
    border-radius: 50% 50% 50% 10px;
    transform: rotate(45deg);
    background: #0b151e;
    box-shadow: 0 10px 22px rgba(0,0,0,.35);
  }
  .lv-location-icon::after {
    content: "";
    position: absolute;
    width: 11px;
    height: 11px;
    left: 50%;
    top: 50%;
    transform: translate(-50%,-50%);
    border-radius: 50%;
    background: #efb733;
  }
  .lv-location-link strong,
  .lv-location-link span,
  .lv-location-link small {
    position: relative;
    z-index: 1;
    display: block;
  }
  .lv-location-link strong {
    margin-top: 4px;
    font: 500 18px/1.2 Georgia, "Times New Roman", serif;
  }
  .lv-location-link span {
    color: #efb733;
    font-size: 8px;
    font-weight: 900;
    letter-spacing: .12em;
    text-transform: uppercase;
  }
  .lv-location-link small {
    color: #8e9aa5;
    font-size: 8px;
    letter-spacing: .04em;
  }

  @media (max-width: 850px) {
    .lv-contact-grid { grid-template-columns: 1fr !important; gap: 36px !important; }
  }
  @media (max-width: 620px) {
    .lv-contact-details-grid { grid-template-columns: 1fr; }
    .lv-contact-details-grid > div { min-height: auto; border-right: 0 !important; border-bottom: 1px solid #2c3944 !important; }
    .lv-contact-details-grid > div:last-child { border-bottom: 0 !important; }
    .lv-location-card { grid-template-columns: 1fr; min-height: auto; }
    .lv-location-copy { padding: 28px 24px 14px; }
    .lv-location-action { padding: 14px 24px 28px; }
    .lv-location-link { width: 100%; min-height: 150px; }
    .lv-location-copy h3 { font-size: 23px; }
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

    const copy = document.createElement("div");
    copy.className = "lv-location-copy";

    const kicker = document.createElement("span");
    kicker.className = "lv-location-kicker";
    kicker.textContent = "OUR LOCATION";

    const title = document.createElement("h3");
    title.textContent = "Visit LAND VIEW in Feni";

    const address = document.createElement("p");
    address.textContent = "F. Rahman AC Market (2nd Floor), S.S.K Road, Feni Sadar, Feni-3900, Bangladesh";

    copy.append(kicker, title, address);

    const action = document.createElement("div");
    action.className = "lv-location-action";

    const openMap = document.createElement("a");
    openMap.className = "lv-location-link";
    openMap.href = MAP_LINK;
    openMap.target = "_blank";
    openMap.rel = "noopener noreferrer";
    openMap.setAttribute("aria-label", "Open LAND VIEW location in Google Maps");

    const icon = document.createElement("span");
    icon.className = "lv-location-icon";
    icon.setAttribute("aria-hidden", "true");

    const openLabel = document.createElement("span");
    openLabel.textContent = "Open in Google Maps";

    const openTitle = document.createElement("strong");
    openTitle.textContent = "LAND VIEW · Feni";

    const openHint = document.createElement("small");
    openHint.textContent = "Tap for directions & location";

    openMap.append(icon, openLabel, openTitle, openHint);
    action.appendChild(openMap);
    location.append(copy, action);
    card.appendChild(location);
  }, []);

  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
