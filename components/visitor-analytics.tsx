"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import styles from "./visitor-analytics.module.css";

const VISITOR_KEY = "lv_visitor_id";
const SESSION_KEY = "lv_session_id";
const LOCATION_STATE_KEY = "lv_location_state";
const LOCATION_PROMPTED_AT_KEY = "lv_location_prompted_at";
const LOCATION_PROMPT_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;

function makeId(prefix: "vis" | "ses") {
  return `${prefix}_${crypto.randomUUID()}`;
}

function setVisitorCookie(visitorId: string) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${VISITOR_KEY}=${encodeURIComponent(visitorId)}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
}

function getVisitorId() {
  let visitorId = window.localStorage.getItem(VISITOR_KEY) || "";
  if (!/^vis_[0-9a-f-]{36}$/i.test(visitorId)) {
    visitorId = makeId("vis");
    window.localStorage.setItem(VISITOR_KEY, visitorId);
  }
  setVisitorCookie(visitorId);
  return visitorId;
}

function getSessionId() {
  let sessionId = window.sessionStorage.getItem(SESSION_KEY) || "";
  if (!/^ses_[0-9a-f-]{36}$/i.test(sessionId)) {
    sessionId = makeId("ses");
    window.sessionStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}

function isPublicWebsitePage(pathname: string) {
  const host = window.location.hostname.toLowerCase();
  if (host === "app.landview.com.bd" || host === "localhost" || host === "127.0.0.1") return false;

  return ![
    "/admin",
    "/employee",
    "/client",
    "/login",
    "/owner-access",
  ].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function safePath(pathname: string) {
  if (/^\/verify\//i.test(pathname)) return "/verify/[redacted]";
  if (/^\/certificate\/verify\//i.test(pathname)) return "/certificate/verify/[redacted]";
  if (/^\/owner-access\//i.test(pathname)) return "/owner-access/[redacted]";
  return pathname.slice(0, 300) || "/";
}

function safeReferrer() {
  if (!document.referrer) return "";
  try {
    const url = new URL(document.referrer);
    return `${url.origin}${safePath(url.pathname)}`.slice(0, 500);
  } catch {
    return "";
  }
}

async function sendEvent(payload: Record<string, unknown>) {
  try {
    await fetch("/api/analytics/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      keepalive: true,
      body: JSON.stringify(payload),
    });
  } catch {
    // Analytics must never interfere with the visitor experience.
  }
}

export default function VisitorAnalytics() {
  const pathname = usePathname() || "/";
  const lastTrackedPath = useRef("");
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [requestingLocation, setRequestingLocation] = useState(false);

  useEffect(() => {
    if (!isPublicWebsitePage(pathname)) return;

    const visitorId = getVisitorId();
    const sessionId = getSessionId();
    const path = safePath(pathname);

    if (lastTrackedPath.current !== path) {
      lastTrackedPath.current = path;
      void sendEvent({
        eventType: "page_view",
        visitorId,
        sessionId,
        path,
        title: document.title.slice(0, 180),
        referrer: safeReferrer(),
        language: navigator.language || "",
        screenWidth: window.screen?.width || 0,
        screenHeight: window.screen?.height || 0,
      });
    }

    const state = window.localStorage.getItem(LOCATION_STATE_KEY) || "";
    if (state === "allowed" || state === "denied") return;

    const lastPrompt = Number(window.localStorage.getItem(LOCATION_PROMPTED_AT_KEY) || 0);
    if (!lastPrompt || Date.now() - lastPrompt >= LOCATION_PROMPT_COOLDOWN_MS) {
      setShowLocationPrompt(true);
    }
  }, [pathname]);

  function dismissLocationPrompt() {
    window.localStorage.setItem(LOCATION_STATE_KEY, "dismissed");
    window.localStorage.setItem(LOCATION_PROMPTED_AT_KEY, String(Date.now()));
    setShowLocationPrompt(false);
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      dismissLocationPrompt();
      return;
    }

    setRequestingLocation(true);
    const visitorId = getVisitorId();
    const sessionId = getSessionId();

    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.localStorage.setItem(LOCATION_STATE_KEY, "allowed");
        window.localStorage.setItem(LOCATION_PROMPTED_AT_KEY, String(Date.now()));
        setShowLocationPrompt(false);
        setRequestingLocation(false);

        void sendEvent({
          eventType: "precise_location",
          visitorId,
          sessionId,
          path: safePath(pathname),
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => {
        window.localStorage.setItem(
          LOCATION_STATE_KEY,
          error.code === error.PERMISSION_DENIED ? "denied" : "dismissed",
        );
        window.localStorage.setItem(LOCATION_PROMPTED_AT_KEY, String(Date.now()));
        setShowLocationPrompt(false);
        setRequestingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10_000,
        maximumAge: 300_000,
      },
    );
  }

  if (!showLocationPrompt || !isPublicWebsitePage(pathname)) return null;

  return (
    <aside className={styles.prompt} role="dialog" aria-labelledby="lv-location-title" aria-describedby="lv-location-copy">
      <p className={styles.eyebrow}>LAND VIEW location</p>
      <h2 id="lv-location-title" className={styles.title}>Share your location?</h2>
      <p id="lv-location-copy" className={styles.copy}>
        Allow location to help LAND VIEW understand where visitors need architectural and engineering services. Your browser will ask for permission before sharing precise coordinates.
      </p>
      <div className={styles.actions}>
        <button className={styles.button} type="button" onClick={requestLocation} disabled={requestingLocation}>
          {requestingLocation ? "Requesting…" : "Allow location"}
        </button>
        <button className={styles.secondaryButton} type="button" onClick={dismissLocationPrompt} disabled={requestingLocation}>
          Not now
        </button>
      </div>
      <p className={styles.note}>
        Approximate location may also be derived from your IP address for website analytics.
      </p>
    </aside>
  );
}
