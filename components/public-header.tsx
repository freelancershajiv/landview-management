"use client";

import Link from "next/link";
import { useState } from "react";

const nav = [
  { href: "/#home", label: "Home" },
  { href: "/#about", label: "About Us" },
  { href: "/#services", label: "Services" },
  { href: "/projects", label: "Projects" },
  { href: "/#team", label: "Team" },
  { href: "/#contact", label: "Contact" },
];

const headerCss = `
  .public-header {
    position: sticky;
    top: 0;
    z-index: 100;
    background: rgba(7, 13, 20, .96);
    border-bottom: 1px solid rgba(255,255,255,.08);
    backdrop-filter: blur(16px);
    box-shadow: 0 10px 30px rgba(0,0,0,.18);
  }
  .public-nav-wrap { background: transparent !important; }
  .public-nav-inner { min-height: 88px !important; display: flex; align-items: center !important; gap: 22px; }
  .public-brand { min-width: 310px !important; display: inline-flex; align-items: center; gap: 14px; color: white; }
  .public-brand img { width: 64px !important; height: 64px !important; object-fit: contain; filter: drop-shadow(0 4px 12px rgba(0,0,0,.35)); }
  .public-brand-copy strong, .public-brand-copy span { display: block; }
  .public-brand-copy strong { font-family: Georgia, "Times New Roman", serif; font-size: 22px !important; line-height: 1; letter-spacing: .12em !important; color: #fff; white-space: nowrap; }
  .public-brand-copy strong em { color: #d79a17; font-style: normal; }
  .public-brand-copy span { margin-top: 7px !important; color: #f1f1f1 !important; font-size: 8px !important; font-weight: 700; letter-spacing: .18em !important; }
  .public-nav { display: flex; align-items: stretch; margin-left: auto; }
  .public-nav a { min-height: 88px !important; display: inline-flex; align-items: center; padding: 0 14px !important; border: 0 !important; color: #e6e8ea !important; font-size: 9px !important; font-weight: 700; letter-spacing: .03em !important; text-transform: uppercase; }
  .public-nav a::after { left: 14px !important; right: 14px !important; bottom: 20px !important; height: 2px !important; background: #d79a17 !important; }
  .public-nav a:hover { background: transparent !important; color: #d79a17 !important; }
  .public-header-actions { display: flex; align-items: center; gap: 10px; margin-left: 6px; }
  .public-header-login { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 0 14px; border: 1px solid rgba(215,154,23,.55); border-radius: 7px; background: rgba(215,154,23,.06); color: #f4f5f6 !important; font-size: 9px; font-weight: 900; letter-spacing: .05em; text-transform: uppercase; white-space: nowrap; transition: .18s ease; }
  .public-header-login b { color: #d79a17; font-size: 13px; }
  .public-header-login:hover { border-color: #d79a17; color: #d79a17 !important; background: rgba(215,154,23,.10); transform: translateY(-1px); }
  .public-header-cta { min-height: 44px; display: inline-flex; align-items: center; justify-content: center; padding: 0 18px; border: 1px solid #d79a17; border-radius: 7px; background: linear-gradient(180deg, #e6aa27, #c98709); color: #111820; font-size: 9px; font-weight: 900; letter-spacing: .04em; text-transform: uppercase; box-shadow: inset 0 1px rgba(255,255,255,.25), 0 8px 22px rgba(0,0,0,.18); transition: .18s ease; }
  .public-header-cta:hover { transform: translateY(-1px); filter: brightness(1.08); }
  .public-menu-button { display: none; width: 42px; height: 42px; padding: 10px; border: 1px solid #36414c; background: #101820; }
  .public-menu-button span { display: block; height: 2px; margin: 4px 0; background: white; }
  @media (max-width: 1180px) {
    .public-brand { min-width: 250px !important; }
    .public-brand-copy strong { font-size: 18px !important; }
    .public-header-login { padding: 0 12px; }
    .public-nav a { padding: 0 10px !important; }
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
  }
  @media (max-width: 560px) {
    .public-brand-copy span { display: none; }
    .public-brand-copy strong { font-size: 14px !important; }
    .public-header-login span { display: none; }
    .public-header-login { width: 40px; padding: 0; }
    .public-nav { grid-template-columns: 1fr; }
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
