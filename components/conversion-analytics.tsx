"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const VISITOR_KEY = "lv_visitor_id";
const SESSION_KEY = "lv_session_id";

function makeId(prefix: "vis" | "ses") {
  return `${prefix}_${crypto.randomUUID()}`;
}

function getIds() {
  let visitorId = window.localStorage.getItem(VISITOR_KEY) || "";
  if (!/^vis_[0-9a-f-]{36}$/i.test(visitorId)) {
    visitorId = makeId("vis");
    window.localStorage.setItem(VISITOR_KEY, visitorId);
  }
  let sessionId = window.sessionStorage.getItem(SESSION_KEY) || "";
  if (!/^ses_[0-9a-f-]{36}$/i.test(sessionId)) {
    sessionId = makeId("ses");
    window.sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  return { visitorId, sessionId };
}

function isPublicPage(pathname: string) {
  const host = window.location.hostname.toLowerCase();
  if (host === "app.landview.com.bd" || host === "localhost" || host === "127.0.0.1") return false;
  return !["/admin", "/employee", "/client", "/login", "/owner-access"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function deviceName() {
  const ua = navigator.userAgent || "";
  if (/iPad/i.test(ua)) return "Apple iPad";
  if (/iPhone/i.test(ua)) return "Apple iPhone";
  if (/Android/i.test(ua)) {
    const match = ua.match(/Android\s[^;()]+;\s*([^;)]+)/i);
    const model = String(match?.[1] || "Android device").replace(/\s+Build\/.*/i, "").replace(/;\s*wv$/i, "").trim();
    return /^SM-/i.test(model) ? `Samsung ${model}` : model;
  }
  if (/Windows NT/i.test(ua)) return "Windows PC";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Apple Mac";
  return "Other device";
}

function platformName() {
  const ua = navigator.userAgent || "";
  const android = ua.match(/Android\s([0-9.]+)/i);
  if (android?.[1]) return `Android ${android[1]}`;
  if (/iPhone|iPad/i.test(ua)) return "iOS / iPadOS";
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macOS";
  return "";
}

async function sendInteraction(name: string, target = "", label = "") {
  const { visitorId, sessionId } = getIds();
  const body = JSON.stringify({
    visitorId,
    sessionId,
    path: window.location.pathname,
    interactionName: name,
    interactionTarget: target,
    interactionLabel: label,
    referrer: document.referrer || "",
    deviceName: deviceName(),
    platform: platformName(),
  });
  try {
    await fetch("/api/analytics/interaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      keepalive: true,
      body,
    });
  } catch {}
}

function anchorPath(anchor: HTMLAnchorElement) {
  try { return new URL(anchor.href, window.location.origin).pathname; }
  catch { return ""; }
}

export default function ConversionAnalytics() {
  const pathname = usePathname() || "/";

  useEffect(() => {
    if (!isPublicPage(pathname)) return;

    function onClick(event: MouseEvent) {
      const raw = event.target;
      if (!(raw instanceof Element)) return;
      const element = raw.closest("a,button");
      if (!(element instanceof HTMLElement)) return;
      const label = (element.getAttribute("aria-label") || element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 260);

      if (element.matches(".lv-public-enquiry")) {
        void sendInteraction("enquiry_open", pathname, label || "Project Enquiry");
        return;
      }

      const mapCard = element.closest(".project-map-card");
      if (mapCard) {
        const id = mapCard.querySelector(".project-map-card-id")?.textContent?.trim() || "";
        const title = mapCard.querySelector("h3")?.textContent?.trim() || label;
        void sendInteraction("map_project_select", id, title);
        return;
      }

      if (!(element instanceof HTMLAnchorElement)) return;
      const href = element.href || "";
      if (/https:\/\/(?:www\.)?wa\.me\//i.test(href)) {
        void sendInteraction("whatsapp_click", href.replace(/\?.*$/, ""), label || "WhatsApp");
        return;
      }
      if (/^tel:/i.test(element.getAttribute("href") || "")) {
        void sendInteraction("call_click", element.getAttribute("href") || "", label || "Call");
        return;
      }

      const path = anchorPath(element);
      if (path === "/projects/map") {
        void sendInteraction("map_open", path, label || "Project Map");
        return;
      }
      if (/^\/services\/[^/]+/i.test(path)) {
        void sendInteraction("service_click", path, label);
        return;
      }
      if (/^\/projects\/[^/]+/i.test(path)) {
        void sendInteraction("project_click", path, label);
      }
    }

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, [pathname]);

  return null;
}
