"use client";

import Link from "next/link";
import { useState } from "react";

const nav = [
  { href: "/#home", label: "Home" },
  { href: "/#about", label: "About Us" },
  { href: "/services", label: "Services" },
  { href: "/projects", label: "Projects" },
  { href: "/team", label: "Team" },
  { href: "/#contact", label: "Contact" },
];

const headerCss = `
  .public-header {
    position: sticky;
    top: 0;
    z-index: 100;
    background: #060b10;
    border-bottom: 1px solid rgba(255,255,255,.10);
    backdrop-filter: blur(16px);
    box-shadow: none;
  }
  .public-nav-wrap { background: transparent !important; }
  .public-nav-inner {
    width: min(100% - 44px, 1240px) !important;
    min-height: 84px !important;
    display: flex;
    align-items: center !important;
    gap: 18px;
  }
  .public-brand {
    min-width: 300px !important;
    display: inline-flex;
    align-items: center;
    gap: 13px;
    color: white;
  }
  .public-brand img {
    width: 60px !important;
    height: 60px !important;
    object-fit: contain;
    filter: drop-shadow(0 4px 12px rgba(0,0,0,.35));
  }
  .public-brand-copy strong, .public-brand-copy span { display: block; }
  .public-brand-copy strong {
    font-family: Georgia, "Times New Roman", serif;
    font-size: 21px !important;
    line-height: 1;
    letter-spacing: .12em !important;
    color: #fff;
    white-space: nowrap;
  }
  .public-brand-copy strong em { color: #d79a17; font-style: normal; }
  .public-brand-copy span {
    margin-top: 6px !important;
    color: #f1f1f1 !important;
    font-size: 7px !important;
    font-weight: 700;
    letter-spacing: .18em !important;
  }
  .public-nav { display: flex; align-items: stretch; margin-left: auto; }
  .public-nav a {
    min-height: 84px !important;
    display: inline-flex;
    align-items: center;
    padding: 0 12px !important;
    border: 0 !important;
    color: #e6e8ea !important;
    font-size: 8px !important;
    font-weight: 800;
    letter-spacing: .02em !important;
    text-transform: uppercase;
  }
  .public-nav a::after {
    left: 12px !important;
    right: 12px !important;
    bottom: 18px !important;
    height: 2px !important;
    background: #d79a17 !important;
  }
  .public-nav a:hover { background: transparent !important; color: #d79a17 !important; }
  .public-header-actions { display: flex; align-items: center; gap: 9px; margin-left: 8px; }
  .public-header-login {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 0 14px;
    border: 1px solid rgba(215,154,23,.55);
    border-radius: 7px;
    background: rgba(215,154,23,.03);
    color: #f4f5f6 !important;
    font-size: 8px;
    font-weight: 900;
    letter-spacing: .05em;
    text-transform: uppercase;
    white-space: nowrap;
    transition: .18s ease;
  }
  .public-header-login b { color: #d79a17; font-size: 12px; }
  .public-header-login:hover {
    border-color: #d79a17;
    color: #d79a17 !important;
    background: rgba(215,154,23,.08);
    transform: translateY(-1px);
  }
  .public-header-cta {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0 18px;
    border: 1px solid #d79a17;
    border-radius: 7px;
    background: linear-gradient(180deg, #e6aa27, #c98709);
    color: #111820;
    font-size: 8px;
    font-weight: 900;
    letter-spacing: .04em;
    text-transform: uppercase;
    box-shadow: inset 0 1px rgba(255,255,255,.25);
    transition: .18s ease;
  }
  .public-header-cta:hover { transform: translateY(-1px); filter: brightness(1.08); }
  .public-menu-button { display: none; width: 42px; height: 42px; padding: 10px; border: 1px solid #36414c; background: #101820; }
  .public-menu-button span { display: block; height: 2px; margin: 4px 0; background: white; }

  /* Homepage reference match */
  .public-site .public-container { width: min(100% - 44px, 1240px) !important; }
  .public-site .lv-hero {
    padding: 0 0 32px !important;
    background: linear-gradient(90deg,#06101a 0%,#07131e 47%,#081019 100%) !important;
  }
  .public-site .lv-hero-grid {
    min-height: 570px !important;
    grid-template-columns: .92fr 1.08fr !important;
    gap: 0 !important;
    align-items: stretch !important;
  }
  .public-site .lv-hero-copy {
    max-width: none !important;
    padding: 64px 68px 54px 0 !important;
    display: flex !important;
    flex-direction: column;
    justify-content: center;
  }
  .public-site .lv-eyebrow {
    margin-bottom: 24px !important;
    color: #96b9d2 !important;
    font-size: 7px !important;
    font-weight: 800 !important;
    letter-spacing: .28em !important;
  }
  .public-site .lv-hero h1 {
    margin: 0 !important;
    font-family: Georgia, "Times New Roman", serif !important;
    font-size: clamp(58px, 4.5vw, 78px) !important;
    line-height: .94 !important;
    letter-spacing: -.035em !important;
    font-weight: 400 !important;
    color: #fff !important;
  }
  .public-site .lv-hero h1 em {
    color: #e5a719 !important;
    font-style: normal !important;
  }
  .public-site .lv-gold-rule {
    width: 84px !important;
    height: 3px !important;
    margin: 26px 0 20px !important;
    background: #d79a17 !important;
  }
  .public-site .lv-hero-copy p {
    max-width: 550px !important;
    margin: 0 !important;
    color: #f1f4f6 !important;
    font-size: 12px !important;
    line-height: 1.8 !important;
  }
  .public-site .lv-hero-actions {
    margin-top: 30px !important;
    gap: 10px !important;
  }
  .public-site .lv-btn {
    min-height: 46px !important;
    padding: 0 22px !important;
    border-radius: 6px !important;
    font-size: 8px !important;
    font-weight: 900 !important;
    letter-spacing: .03em !important;
  }
  .public-site .lv-btn-gold {
    background: linear-gradient(180deg,#e4a820,#c98b0c) !important;
    color: #071019 !important;
    border-color: #e2a21a !important;
  }
  .public-site .lv-btn-outline {
    color: #fff !important;
    background: transparent !important;
    border-color: #b78316 !important;
  }
  .public-site .lv-hero-visual {
    min-height: 570px !important;
    border-left: 1px solid rgba(255,255,255,.05) !important;
    background-position: center 44% !important;
    background-size: cover !important;
    box-shadow: inset 80px 0 90px rgba(4,10,16,.34) !important;
  }
  .public-site .lv-hero-visual::before {
    background: linear-gradient(90deg, rgba(6,15,24,.42) 0%, rgba(6,15,24,.06) 30%, rgba(6,15,24,.03) 100%), linear-gradient(0deg, rgba(5,10,14,.23), transparent 42%) !important;
  }
  .public-site .lv-project-badge {
    right: 20px !important;
    bottom: 22px !important;
    width: 250px !important;
    max-width: calc(100% - 40px) !important;
    padding: 14px 16px !important;
    border-left: 3px solid #d79a17 !important;
    border-radius: 0 !important;
    background: rgba(5,10,15,.90) !important;
    backdrop-filter: blur(10px) !important;
  }
  .public-site .lv-project-badge small {
    color: #d79a17 !important;
    font-size: 7px !important;
    font-weight: 900 !important;
    letter-spacing: .12em !important;
  }
  .public-site .lv-project-badge strong {
    margin-top: 4px !important;
    font-family: Georgia, "Times New Roman", serif !important;
    font-size: 17px !important;
    font-weight: 400 !important;
    line-height: 1.15 !important;
  }
  .public-site .lv-project-badge span {
    margin-top: 5px !important;
    color: #8d99a4 !important;
    font-size: 7px !important;
  }
  .public-site .lv-hero-services {
    position: relative !important;
    z-index: 5 !important;
    margin-top: 0 !important;
    grid-template-columns: repeat(4,1fr) !important;
    border: 1px solid rgba(255,255,255,.18) !important;
    border-radius: 12px !important;
    background: #09131d !important;
    overflow: hidden !important;
    box-shadow: none !important;
  }
  .public-site .lv-hero-services article {
    min-height: 96px !important;
    padding: 20px 28px !important;
    border-right: 1px solid rgba(255,255,255,.16) !important;
  }
  .public-site .lv-hero-services article:last-child { border-right: 0 !important; }
  .public-site .lv-hero-services b {
    color: #e1a316 !important;
    font-size: 24px !important;
  }
  .public-site .lv-hero-services strong {
    color: #fff !important;
    font-size: 9px !important;
    font-weight: 900 !important;
    letter-spacing: .02em !important;
  }
  .public-site .lv-hero-services span {
    color: #c6d0d7 !important;
    font-size: 8px !important;
    line-height: 1.55 !important;
  }

  @media (max-width: 1180px) {
    .public-brand { min-width: 250px !important; }
    .public-brand-copy strong { font-size: 18px !important; }
    .public-header-login { padding: 0 12px; }
    .public-nav a { padding: 0 9px !important; }
    .public-site .lv-hero-copy { padding-right: 42px !important; }
  }
  @media (max-width: 900px) {
    .public-nav-inner { min-height: 74px !important; }
    .public-brand { min-width: 0 !important; }
    .public-brand img { width: 52px !important; height: 52px !important; }
    .public-brand-copy strong { font-size: 16px !important; }
    .public-brand-copy span { font-size: 6px !important; }
    .public-header-actions { margin-left: auto; }
    .public-header-login { min-height: 40px; padding: 0 11px; font-size: 8px; }
    .public-header-cta { display: none; }
    .public-menu-button { display: block; }
    .public-nav { position: absolute; left: 0; right: 0; top: 74px; display: none; grid-template-columns: repeat(2, minmax(0,1fr)); background: #09111a; border-top: 1px solid rgba(255,255,255,.08); box-shadow: 0 18px 30px rgba(0,0,0,.28); }
    .public-nav.open { display: grid; }
    .public-nav a { min-height: 52px !important; justify-content: flex-start; padding: 0 22px !important; border-bottom: 1px solid rgba(255,255,255,.07) !important; }
    .public-nav a::after { display: none; }
    .public-site .lv-hero-grid { grid-template-columns: 1fr !important; }
    .public-site .lv-hero-copy { padding: 52px 0 42px !important; }
    .public-site .lv-hero-visual { min-height: 520px !important; }
    .public-site .lv-hero-services { grid-template-columns: repeat(2,1fr) !important; }
    .public-site .lv-hero-services article:nth-child(2) { border-right: 0 !important; }
    .public-site .lv-hero-services article:nth-child(-n+2) { border-bottom: 1px solid rgba(255,255,255,.16) !important; }
  }
  @media (max-width: 560px) {
    .public-brand-copy span { display: none; }
    .public-brand-copy strong { font-size: 14px !important; }
    .public-header-login span { display: none; }
    .public-header-login { width: 40px; padding: 0; }
    .public-nav { grid-template-columns: 1fr; }
    .public-site .lv-hero h1 { font-size: 14vw !important; }
    .public-site .lv-hero-visual { min-height: 430px !important; }
    .public-site .lv-hero-services { grid-template-columns: 1fr !important; }
    .public-site .lv-hero-services article { border-right: 0 !important; border-bottom: 1px solid rgba(255,255,255,.16) !important; }
    .public-site .lv-hero-services article:last-child { border-bottom: 0 !important; }
  }
`;

export default function PublicHeader() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: headerCss }} />
      <header className="public-header">
        <div className="public-nav-wrap">
          <div className="public-container public-nav-inner">
            <Link href="/#home" className="public-brand" onClick={() => setOpen(false)}>
              <img src="/land-view-logo.svg" alt="LAND VIEW logo" />
              <div className="public-brand-copy"><strong>LAND <em>VIEW</em></strong><span>ENGINEERS &amp; ARCHITECTS</span></div>
            </Link>
            <nav className={`public-nav ${open ? "open" : ""}`}>
              {nav.map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>{item.label}</Link>)}
            </nav>
            <div className="public-header-actions">
              <a className="public-header-login" href="https://app.landview.com.bd/login" onClick={() => setOpen(false)}><b>↪</b><span>Login</span></a>
              <a className="public-header-cta" href="/#contact">Get in touch</a>
              <button type="button" className="public-menu-button" aria-label="Toggle website navigation" aria-expanded={open} onClick={() => setOpen((value) => !value)}><span /><span /><span /></button>
            </div>
          </div>
        </div>
      </header>
    </>
  );
}
