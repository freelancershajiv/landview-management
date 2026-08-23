"use client";

import Link from "next/link";
import { useState } from "react";

const nav = [
  { href: "/#home", label: "Home" },
  { href: "/#about", label: "About" },
  { href: "/#services", label: "Services" },
  { href: "/#projects", label: "Projects" },
  { href: "/#process", label: "Process" },
  { href: "/#contact", label: "Contact" },
];

export default function PublicHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="public-header">
      <div className="public-utility">
        <div className="public-container public-utility-inner">
          <div className="public-utility-left">
            <span><b>●</b> Feni, Bangladesh</span>
            <a href="mailto:landviewcivil@gmail.com"><b>◆</b> landviewcivil@gmail.com</a>
            <a href="tel:+8801902500400"><b>☎</b> +88 01902 500 400</a>
          </div>

          <Link href="/login" className="public-employee-link">
            Login <span>→</span>
          </Link>
        </div>
      </div>

      <div className="public-nav-wrap">
        <div className="public-container public-nav-inner">
          <Link href="/#home" className="public-brand" onClick={() => setOpen(false)}>
            <img src="/land-view-logo.png" alt="LAND VIEW logo" />
            <div>
              <strong>LAND VIEW</strong>
              <span>ARCHITECTS & ENGINEERS</span>
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
  );
}
