"use client";

import { useEffect } from "react";

const MAP_LINK = "https://maps.app.goo.gl/oCLmqzJFdiDbngu36";

const css = `
  .lv-contact { padding: 88px 0 52px !important; }
  .lv-contact-grid { display: block !important; }
  .lv-contact-copy { max-width: 760px; }
  .lv-contact-card { display: none !important; }

  .lv-contact-location-section {
    padding: 72px 0 88px;
    border-top: 1px solid rgba(215,154,23,.18);
    background: linear-gradient(125deg,#09131d,#07101a);
    color: #fff;
  }
  .lv-contact-location-shell {
    width: min(100% - 44px, 1320px);
    margin: 0 auto;
  }
  .lv-contact-location-head {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 40px;
    margin-bottom: 28px;
  }
  .lv-contact-location-head > div { max-width: 720px; }
  .lv-contact-location-head span {
    display: block;
    margin-bottom: 10px;
    color: #efb733;
    font-size: 8px;
    font-weight: 900;
    letter-spacing: .18em;
    text-transform: uppercase;
  }
  .lv-contact-location-head h2 {
    margin: 0;
    font: 500 clamp(32px,4vw,50px)/1 Georgia,"Times New Roman",serif;
  }
  .lv-contact-location-head p {
    max-width: 420px;
    margin: 0;
    color: #95a1ab;
    font-size: 10px;
    line-height: 1.75;
  }
  .lv-contact-location-grid {
    display: grid;
    grid-template-columns: 1fr 1.05fr;
    gap: 18px;
    align-items: stretch;
  }
  .lv-contact-info-card,
  .lv-location-card {
    border: 1px solid #34414c;
    background: #0b151e;
  }
  .lv-contact-info-card {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .lv-contact-info-item {
    min-height: 116px;
    padding: 22px 24px;
    border-bottom: 1px solid #2c3944;
  }
  .lv-contact-info-item:nth-child(odd) { border-right: 1px solid #2c3944; }
  .lv-contact-info-item:nth-last-child(-n+2) { border-bottom: 0; }
  .lv-contact-info-item span {
    display: block;
    margin-bottom: 9px;
    color: #efb733;
    font-size: 7px;
    font-weight: 900;
    letter-spacing: .12em;
  }
  .lv-contact-info-item strong,
  .lv-contact-info-item a {
    color: #fff;
    font-size: 11px;
  }
  .lv-contact-info-item p {
    margin: 7px 0 0;
    color: #96a2ac;
    font-size: 9px;
    line-height: 1.6;
  }

  .lv-location-card {
    position: relative;
    min-height: 250px;
    display: flex;
    align-items: flex-end;
    overflow: hidden;
    background:
      radial-gradient(circle at 74% 35%, rgba(215,154,23,.17), transparent 24%),
      linear-gradient(135deg, rgba(12,27,39,.96), rgba(5,12,19,.98));
  }
  .lv-location-card::before {
    content: "";
    position: absolute;
    inset: 0;
    opacity: .24;
    background-image:
      linear-gradient(rgba(255,255,255,.055) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.055) 1px, transparent 1px);
    background-size: 34px 34px;
  }
  .lv-location-card::after {
    content: "";
    position: absolute;
    width: 170px;
    height: 170px;
    right: 8%;
    top: 50%;
    transform: translateY(-50%);
    border: 1px solid rgba(239,183,51,.24);
    border-radius: 50%;
    box-shadow: 0 0 0 28px rgba(239,183,51,.035),0 0 0 56px rgba(239,183,51,.02);
  }
  .lv-location-pin {
    position: absolute;
    z-index: 2;
    right: calc(8% + 62px);
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
    width: min(66%, 430px);
    padding: 30px;
  }
  .lv-location-kicker {
    display: block;
    margin-bottom: 10px;
    color: #efb733;
    font-size: 8px;
    font-weight: 900;
    letter-spacing: .16em;
  }
  .lv-location-copy h3 {
    margin: 0;
    color: #fff;
    font: 500 25px/1.15 Georgia,"Times New Roman",serif;
  }
  .lv-location-copy p {
    margin: 10px 0 0;
    color: #9ba6af;
    font-size: 10px;
    line-height: 1.7;
  }
  .lv-location-button {
    min-height: 42px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-top: 20px;
    padding: 0 16px;
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

  @media(max-width:850px){
    .lv-contact-location-head{align-items:flex-start;flex-direction:column;gap:16px}
    .lv-contact-location-grid{grid-template-columns:1fr}
  }
  @media(max-width:560px){
    .lv-contact-location-shell{width:min(100% - 28px,1320px)}
    .lv-contact-info-card{grid-template-columns:1fr}
    .lv-contact-info-item{min-height:auto;border-right:0!important;border-bottom:1px solid #2c3944!important}
    .lv-contact-info-item:last-child{border-bottom:0!important}
    .lv-location-card{min-height:300px}
    .lv-location-copy{width:100%;padding:24px}
    .lv-location-card::after,.lv-location-pin{opacity:.4}
  }
`;

export default function ContactMapEnhancer() {
  useEffect(() => {
    const contactSection = document.querySelector<HTMLElement>(".lv-contact");
    const originalCard = document.querySelector<HTMLElement>(".lv-contact-card");
    if (!contactSection || !originalCard || document.querySelector(".lv-contact-location-section")) return;

    const section = document.createElement("section");
    section.className = "lv-contact-location-section";

    const shell = document.createElement("div");
    shell.className = "lv-contact-location-shell";

    const head = document.createElement("div");
    head.className = "lv-contact-location-head";
    head.innerHTML = `<div><span>CONTACT & LOCATION</span><h2>Reach LAND VIEW or visit our office.</h2></div><p>Contact our engineering or architecture team directly, or open our verified Google Maps location for directions.</p>`;

    const grid = document.createElement("div");
    grid.className = "lv-contact-location-grid";

    const info = document.createElement("div");
    info.className = "lv-contact-info-card";

    Array.from(originalCard.children).forEach((node) => {
      const item = document.createElement("div");
      item.className = "lv-contact-info-item";
      item.innerHTML = (node as HTMLElement).innerHTML;
      info.appendChild(item);
    });

    const location = document.createElement("div");
    location.className = "lv-location-card";
    location.innerHTML = `
      <span class="lv-location-pin" aria-hidden="true"></span>
      <div class="lv-location-copy">
        <span class="lv-location-kicker">LAND VIEW · FENI</span>
        <h3>Find us on Google Maps</h3>
        <p>F. Rahman AC Market (2nd Floor), S.S.K Road, Feni Sadar, Feni-3900, Bangladesh</p>
        <a class="lv-location-button" href="${MAP_LINK}" target="_blank" rel="noopener noreferrer">Open Location in Google Maps →</a>
      </div>`;

    grid.append(info, location);
    shell.append(head, grid);
    section.appendChild(shell);
    contactSection.insertAdjacentElement("afterend", section);
  }, []);

  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}
