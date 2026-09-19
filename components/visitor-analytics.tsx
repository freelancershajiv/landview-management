"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./visitor-analytics.module.css";

const VISITOR_KEY = "lv_visitor_id";
const SESSION_KEY = "lv_session_id";
const LOCATION_STATE_KEY = "lv_location_state";
const LOCATION_PROMPTED_AT_KEY = "lv_location_prompted_at";
const LOCATION_PROMPT_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const LIVE_LOCATION_MIN_INTERVAL_MS = 15_000;
const LIVE_LOCATION_MIN_DISTANCE_M = 20;

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

function distanceMetres(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
) {
  const earthRadiusM = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(latitudeB - latitudeA);
  const deltaLon = toRadians(longitudeB - longitudeA);
  const lat1 = toRadians(latitudeA);
  const lat2 = toRadians(latitudeB);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.sqrt(haversine));
}

type SentLocation = {
  latitude: number;
  longitude: number;
  accuracy: number;
  sentAt: number;
};

export default function VisitorAnalytics() {
  const pathname = usePathname() || "/";
  const lastTrackedPath = useRef("");
  const liveWatchId = useRef<number | null>(null);
  const lastSentLocation = useRef<SentLocation | null>(null);
  const currentPath = useRef(pathname);
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [requestingLocation, setRequestingLocation] = useState(false);

  useEffect(() => {
    currentPath.current = pathname;
  }, [pathname]);

  const stopLiveLocation = useCallback(() => {
    if (liveWatchId.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(liveWatchId.current);
      liveWatchId.current = null;
    }
  }, []);

  const startLiveLocation = useCallback(() => {
    if (!navigator.geolocation || liveWatchId.current !== null) return;

    const visitorId = getVisitorId();
    const sessionId = getSessionId();

    liveWatchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          sentAt: now,
        };
        const previous = lastSentLocation.current;

        const enoughTimePassed =
          !previous || now - previous.sentAt >= LIVE_LOCATION_MIN_INTERVAL_MS;
        const movedEnough =
          !previous ||
          distanceMetres(
            previous.latitude,
            previous.longitude,
            next.latitude,
            next.longitude,
          ) >= LIVE_LOCATION_MIN_DISTANCE_M;
        const meaningfullyMoreAccurate =
          !!previous && next.accuracy + 15 < previous.accuracy;

        if (!previous || (enoughTimePassed && (movedEnough || meaningfullyMoreAccurate))) {
          lastSentLocation.current = next;
          void sendEvent({
            eventType: "precise_location",
            visitorId,
            sessionId,
            path: safePath(currentPath.current),
            latitude: next.latitude,
            longitude: next.longitude,
            accuracy: next.accuracy,
          });
        }
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          window.localStorage.setItem(LOCATION_STATE_KEY, "denied");
          stopLiveLocation();
        }
        setRequestingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 5_000,
      },
    );
  }, [stopLiveLocation]);

  useEffect(() => {
    if (!isPublicWebsitePage(pathname)) {
      stopLiveLocation();
      return;
    }

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
    if (state === "allowed") {
      startLiveLocation();
      return;
    }
    if (state === "denied") return;

    const lastPrompt = Number(window.localStorage.getItem(LOCATION_PROMPTED_AT_KEY) || 0);
    if (!lastPrompt || Date.now() - lastPrompt >= LOCATION_PROMPT_COOLDOWN_MS) {
      setShowLocationPrompt(true);
    }
  }, [pathname, startLiveLocation, stopLiveLocation]);

  useEffect(() => {
    return () => stopLiveLocation();
  }, [stopLiveLocation]);

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
    window.localStorage.setItem(LOCATION_PROMPTED_AT_KEY, String(Date.now()));

    navigator.geolocation.getCurrentPosition(
      (position) => {
        window.localStorage.setItem(LOCATION_STATE_KEY, "allowed");
        setShowLocationPrompt(false);
        setRequestingLocation(false);

        const visitorId = getVisitorId();
        const sessionId = getSessionId();
        const initialLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          sentAt: Date.now(),
        };
        lastSentLocation.current = initialLocation;

        void sendEvent({
          eventType: "precise_location",
          visitorId,
          sessionId,
          path: safePath(pathname),
          latitude: initialLocation.latitude,
          longitude: initialLocation.longitude,
          accuracy: initialLocation.accuracy,
        });

        startLiveLocation();
      },
      (error) => {
        window.localStorage.setItem(
          LOCATION_STATE_KEY,
          error.code === error.PERMISSION_DENIED ? "denied" : "dismissed",
        );
        setShowLocationPrompt(false);
        setRequestingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 15_000,
        maximumAge: 0,
      },
    );
  }

  if (!showLocationPrompt || !isPublicWebsitePage(pathname)) return null;

  return (
    <aside className={styles.prompt} role="dialog" aria-labelledby="lv-location-title" aria-describedby="lv-location-copy">
      <p className={styles.eyebrow}>LAND VIEW location</p>
      <h2 id="lv-location-title" className={styles.title}>Share your live location?</h2>
      <p id="lv-location-copy" className={styles.copy}>
        Allow location to help LAND VIEW understand where visitors need architectural and engineering services. If you allow it, your browser may share updated precise coordinates while this website remains open.
      </p>
      <div className={styles.actions}>
        <button className={styles.button} type="button" onClick={requestLocation} disabled={requestingLocation}>
          {requestingLocation ? "Requesting…" : "Allow live location"}
        </button>
        <button className={styles.secondaryButton} type="button" onClick={dismissLocationPrompt} disabled={requestingLocation}>
          Not now
        </button>
      </div>
      <p className={styles.note}>
        Precise location requires browser permission. Approximate location may also be derived from the visitor&apos;s IP address.
      </p>
    </aside>
  );
}
