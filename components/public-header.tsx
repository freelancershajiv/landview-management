"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const nav = [
  { href: "/#home", label: "Home" },
  { href: "/#about", label: "About" },
  { href: "/#services", label: "Services" },
  { href: "/projects", label: "Projects" },
  { href: "/#team", label: "Team" },
  { href: "/#process", label: "Process" },
  { href: "/#contact", label: "Contact" },
];

type PublicTheme = "light" | "dark";

const themeCss = `
  .public-theme-toggle {
    flex: 0 0 auto;
    width: 44px;
    height: 44px;
    align-self: center;
    display: inline-grid;
    place-items: center;
    margin-left: 8px;
    border: 1px solid rgba(255,255,255,.16);
    border-radius: 999px;
    background: #1b1b1b;
    color: #fff;
    cursor: pointer;
    transition: transform .18s ease, background .18s ease, border-color .18s ease;
  }
  .public-theme-toggle:hover {
    transform: translateY(-1px);
    border-color: var(--public-accent, #ef493b);
    background: #303030;
  }
  .public-theme-toggle-icon {
    font-size: 17px;
    line-height: 1;
  }

  html[data-public-theme="dark"] .public-site {
    --public-paper: #111315;
    --public-ink: #f1f2ef;
    --public-muted: #a8adb0;
    background: #111315;
    color: #f1f2ef;
  }

  html[data-public-theme="dark"] .public-services,
  html[data-public-theme="dark"] .public-projects,
  html[data-public-theme="dark"] .public-team,
  html[data-public-theme="dark"] .public-section {
    background-color: #111315;
    color: #f1f2ef;
  }

  html[data-public-theme="dark"] .public-service-grid,
  html[data-public-theme="dark"] .public-project-grid,
  html[data-public-theme="dark"] .public-team-grid {
    border-color: #34383b;
  }

  html[data-public-theme="dark"] .public-service-card,
  html[data-public-theme="dark"] .public-project-card,
  html[data-public-theme="dark"] .public-team-card,
  html[data-public-theme="dark"] .public-team-empty,
  html[data-public-theme="dark"] .public-about-card {
    border-color: #34383b;
    background: #1b1e21;
    color: #f1f2ef;
    box-shadow: none;
  }

  html[data-public-theme="dark"] .public-service-card:hover,
  html[data-public-theme="dark"] .public-project-card:hover,
  html[data-public-theme="dark"] .public-team-card:hover {
    border-color: #50565a;
    box-shadow: 0 18px 42px rgba(0,0,0,.28);
  }

  html[data-public-theme="dark"] .public-service-top b,
  html[data-public-theme="dark"] .public-about-row,
  html[data-public-theme="dark"] .public-project-link,
  html[data-public-theme="dark"] .public-team-info-block,
  html[data-public-theme="dark"] .public-team-credentials,
  html[data-public-theme="dark"] .public-team-card-bottom {
    border-color: #34383b;
  }

  html[data-public-theme="dark"] .public-service-top span,
  html[data-public-theme="dark"] .public-section-head > p,
  html[data-public-theme="dark"] .public-service-card p,
  html[data-public-theme="dark"] .public-project-copy p,
  html[data-public-theme="dark"] .public-team-label,
  html[data-public-theme="dark"] .public-team-degree,
  html[data-public-theme="dark"] .public-team-specialities,
  html[data-public-theme="dark"] .public-team-specialities span,
  html[data-public-theme="dark"] .public-about-row small {
    color: #a8adb0;
  }

  html[data-public-theme="dark"] .public-about-card,
  html[data-public-theme="dark"] .public-about-row strong,
  html[data-public-theme="dark"] .public-about-row b,
  html[data-public-theme="dark"] .public-project-copy h3,
  html[data-public-theme="dark"] .public-team-name,
  html[data-public-theme="dark"] .public-team-info-block strong,
  html[data-public-theme="dark"] .public-service-card h3 {
    color: #f1f2ef;
  }

  html[data-public-theme="dark"] .public-quick-links a:not(.dark) {
    background: #f0f1ee;
    color: #34383b;
  }

  html[data-public-theme="dark"] .public-nav-wrap {
    background: #17191b;
  }

  html[data-public-theme="dark"] .public-nav a:hover {
    background: #22262a;
  }

  html[data-public-theme="dark"] .public-menu-button,
  html[data-public-theme="dark"] .public-theme-toggle {
    background: #111315;
    border-color: #3d4246;
  }

  @media (max-width: 860px) {
    .public-theme-toggle {
      margin-left: auto;
      margin-right: 8px;
    }
  }
`;

export default function PublicHeader() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<PublicTheme>("dark");

  useEffect(() => {
    const saved = window.localStorage.getItem("landview-public-theme");
    const nextTheme: PublicTheme = saved === "light" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.publicTheme = nextTheme;
  }, []);

  function toggleTheme() {
    const nextTheme: PublicTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.publicTheme = nextTheme;
    window.localStorage.setItem("landview-public-theme", nextTheme);
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      <header className="public-header">
        <div className="public-utility">
          <div className="public-container public-utility-inner">
            <div className="public-utility-left">
              <a href="https://share.google/cTmtQarK6Oo6KY8Md" target="_blank" rel="noreferrer"><b>●</b> Feni, Bangladesh</a>
              <a href="mailto:landviewcivil@gmail.com"><b>◆</b> landviewcivil@gmail.com</a>
              <a href="tel:+8801902500400"><b>☎</b> +88 01902 500 400</a>
            </div>

            <a href="https://app.landview.com.bd" className="public-employee-link">
              Client / Staff Portal <span>→</span>
            </a>
          </div>
        </div>

        <div className="public-nav-wrap">
          <div className="public-container public-nav-inner">
            <Link href="/#home" className="public-brand" onClick={() => setOpen(false)}>
              <img src="/land-view-logo.png" alt="LAND VIEW logo" />
              <div>
                <strong>LAND VIEW</strong>
                <span>ENGINEERS &amp; ARCHITECTS</span>
              </div>
            </Link>

            <nav className={`public-nav ${open ? "open" : ""}`}>
              {nav.map((item) => (
                <Link key={item.href} href={item.href} onClick={() => setOpen(false)}>
                  {item.label}
                </Link>
              ))}
            </nav>

            <button
              type="button"
              className="public-theme-toggle"
              aria-label={theme === "dark" ? "Switch to normal mode" : "Switch to dark mode"}
              title={theme === "dark" ? "Normal mode" : "Dark mode"}
              onClick={toggleTheme}
            >
              <span className="public-theme-toggle-icon" aria-hidden="true">
                {theme === "dark" ? "☀" : "☾"}
              </span>
            </button>

            <button
              type="button"
              className="public-menu-button"
              aria-label="Toggle website navigation"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>
    </>
  );
}
