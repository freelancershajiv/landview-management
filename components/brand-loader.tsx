"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const INITIAL_MIN_MS = 720;
const ROUTE_MIN_MS = 420;
const PUBLIC_PREFIXES = ["/services", "/projects", "/team", "/contact", "/feni", "/bn"];

function isPublicMarketingPath(pathname: string) {
  if (pathname === "/") return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export default function BrandLoader() {
  const pathname = usePathname();
  const firstPath = useRef(pathname);
  const [visible, setVisible] = useState(true);
  const [phase, setPhase] = useState<"boot" | "route">("boot");
  const publicMarketingPage = isPublicMarketingPath(pathname || "/");

  useEffect(() => {
    if (publicMarketingPage) {
      setVisible(false);
      return;
    }
    const started = performance.now();
    const finish = () => {
      const remaining = Math.max(0, INITIAL_MIN_MS - (performance.now() - started));
      window.setTimeout(() => setVisible(false), remaining);
    };

    if (document.readyState === "complete") {
      finish();
      return;
    }

    window.addEventListener("load", finish, { once: true });
    const fallback = window.setTimeout(finish, 2600);

    return () => {
      window.removeEventListener("load", finish);
      window.clearTimeout(fallback);
    };
  }, [publicMarketingPage]);

  useEffect(() => {
    if (pathname === firstPath.current) return;
    firstPath.current = pathname;
    if (publicMarketingPage) {
      setVisible(false);
      return;
    }
    setPhase("route");
    setVisible(true);
    const timer = window.setTimeout(() => setVisible(false), ROUTE_MIN_MS);
    return () => window.clearTimeout(timer);
  }, [pathname, publicMarketingPage]);

  if (publicMarketingPage) return null;

  return (
    <div
      className={"landview-loader " + (visible ? "is-visible" : "is-hidden") + " phase-" + phase}
      aria-hidden="true"
    >
      <div className="landview-loader-grid" />
      <div className="landview-loader-glow landview-loader-glow-a" />
      <div className="landview-loader-glow landview-loader-glow-b" />

      <div className="landview-loader-center">
        <div className="landview-loader-logo-wrap">
          <div className="landview-loader-orbit orbit-one" />
          <div className="landview-loader-orbit orbit-two" />
          <Image
            className="landview-loader-logo"
            src="/land-view-logo-light.svg"
            alt=""
            width={360}
            height={240}
            priority
          />
        </div>

        <div className="landview-loader-rule">
          <span />
          <i />
          <span />
        </div>

        <div className="landview-loader-status">
          <span className="landview-loader-dot" />
          <span>{phase === "route" ? "Loading workspace" : "Preparing your workspace"}</span>
        </div>

        <div className="landview-loader-progress">
          <span />
        </div>
      </div>

      <div className="landview-loader-footer">
        <span>LAND VIEW</span>
        <span>ARCHITECTS &amp; ENGINEERS</span>
        <span>BUILDING A SAFER TOMORROW</span>
      </div>
    </div>
  );
}
