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

const publicMobileFixes = `
  .portfolio-page .portfolio-controls{top:84px!important}
  @media(max-width:900px){
    .portfolio-page .portfolio-controls{top:74px!important}
  }
  @media(max-width:560px){
    .public-site{overflow-x:clip!important;overflow-y:visible!important}
    .public-site .public-nav-inner{min-height:66px!important;width:min(100% - 24px,1240px)!important;gap:10px!important}
    .public-site .public-brand{gap:8px!important}
    .public-site .public-brand img{width:44px!important;height:44px!important}
    .public-site .public-brand-copy strong{font-size:13px!important;letter-spacing:.09em!important}
    .public-site .public-header-actions{gap:6px!important}
    .public-site .public-header-login,.public-site .public-menu-button{width:40px!important;height:40px!important;min-height:40px!important}
    .public-site .public-nav{top:66px!important;max-height:calc(100dvh - 66px)!important;overflow-y:auto!important}
    .public-site .lv-hero-copy{padding:38px 0 30px!important}
    .public-site .lv-eyebrow{margin-bottom:16px!important;font-size:10px!important;letter-spacing:.18em!important;line-height:1.5!important}
    .public-site .lv-hero h1{font-size:clamp(38px,12.5vw,48px)!important;line-height:.96!important;overflow-wrap:anywhere!important}
    .public-site .lv-hero-copy p{font-size:12px!important;line-height:1.65!important}
    .public-site .lv-hero-actions{margin-top:22px!important;gap:9px!important}
    .public-site .lv-hero-visual{min-height:310px!important}
    .public-site .lv-project-badge{left:14px!important;right:14px!important;bottom:14px!important;width:auto!important;max-width:none!important}
    .public-site .lv-hero-services article{min-height:82px!important;padding:16px 18px!important}
    .public-site .lv-section{padding:56px 0!important}
    .public-site .lv-section-head{gap:12px!important;margin-bottom:28px!important}
    .public-site .lv-section-head h2{font-size:clamp(30px,10vw,40px)!important;line-height:1.04!important}
    .public-site .lv-about{padding:56px 0!important}
    .public-site .lv-about-card{padding:20px!important}
    .public-site .lv-contact{padding:56px 0!important}
    .public-site .lv-footer-links{flex-wrap:wrap!important;justify-content:center!important;row-gap:10px!important}
    .portfolio-page .portfolio-controls{top:66px!important}
    .portfolio-page .portfolio-hero{padding-top:64px!important}
    .portfolio-page .portfolio-card{border-radius:12px!important}
    .portfolio-page .portfolio-copy{padding:18px!important}
  }
  @media(max-width:380px){
    .public-site .public-brand img{width:40px!important;height:40px!important}
    .public-site .public-brand-copy strong{font-size:12px!important}
    .public-site .lv-hero h1{font-size:38px!important}
    .public-site .lv-hero-visual{min-height:280px!important}
  }
`;

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
  return !["/admin", "/employee", "/client", "/login", "/owner-access"].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
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

function inferDeviceName(userAgent: string) {
  const ua = String(userAgent || "");
  if (/bot|crawler|spider|headless/i.test(ua)) return "Bot / automated client";
  if (/iPad/i.test(ua)) return "Apple iPad";
  if (/iPhone/i.test(ua)) return "Apple iPhone";
  if (/CrOS/i.test(ua)) return "Chromebook";

  if (/Android/i.test(ua)) {
    const match = ua.match(/Android\s[^;()]+;\s*([^;)]+)/i);
    let model = String(match?.[1] || "").replace(/\s+Build\/.*/i, "").replace(/;\s*wv$/i, "").trim();
    if (!model || /^(K|wv|Mobile)$/i.test(model)) return "Android device";
    if (/^SM-[A-Z0-9-]+$/i.test(model)) model = `Samsung ${model}`;
    return model.slice(0, 120);
  }

  if (/Windows NT/i.test(ua)) return "Windows PC";
  if (/Macintosh|Mac OS X/i.test(ua)) return "Apple Mac";
  if (/Linux/i.test(ua)) return "Linux computer";
  return "Unknown device";
}

function inferPlatform(userAgent: string) {
  const ua = String(userAgent || "");
  const android = ua.match(/Android\s([0-9.]+)/i);
  if (android?.[1]) return `Android ${android[1]}`;
  const ios = ua.match(/(?:CPU (?:iPhone )?OS|iPhone OS)\s([0-9_]+)/i);
  if (ios?.[1]) return `iOS ${ios[1].replace(/_/g, ".")}`;
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macOS";
  if (/CrOS/i.test(ua)) return "ChromeOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "";
}

type DeviceContext = { deviceName: string; platform: string };
let deviceContextPromise: Promise<DeviceContext> | null = null;

async function getDeviceContext(): Promise<DeviceContext> {
  if (deviceContextPromise) return deviceContextPromise;
  deviceContextPromise = (async () => {
    const fallback: DeviceContext = {
      deviceName: inferDeviceName(navigator.userAgent || ""),
      platform: inferPlatform(navigator.userAgent || ""),
    };
    try {
      const nav = navigator as Navigator & { userAgentData?: { platform?: string; getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>> } };
      if (!nav.userAgentData?.getHighEntropyValues) return fallback;
      const hints = await nav.userAgentData.getHighEntropyValues(["model", "platform", "platformVersion"]);
      const model = String(hints.model || "").trim();
      const platformName = String(hints.platform || nav.userAgentData.platform || "").trim();
      const platformVersion = String(hints.platformVersion || "").trim();
      return {
        deviceName: model ? (/^SM-/i.test(model) ? `Samsung ${model}` : model).slice(0, 120) : fallback.deviceName,
        platform: [platformName, platformVersion].filter(Boolean).join(" ").slice(0, 100) || fallback.platform,
      };
    } catch {
      return fallback;
    }
  })();
  return deviceContextPromise;
}

async function sendEvent(payload: Record<string, unknown>) {
  const device = await getDeviceContext().catch(() => ({ deviceName: "", platform: "" }));
  const body = JSON.stringify({ ...payload, ...device });
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch("/api/analytics/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        keepalive: true,
        body,
      });
      if (response.ok) return;
    } catch {}
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 700));
  }
}

function distanceMetres(latitudeA: number, longitudeA: number, latitudeB: number, longitudeB: number) {
  const earthRadiusM = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(latitudeB - latitudeA);
  const deltaLon = toRadians(longitudeB - longitudeA);
  const lat1 = toRadians(latitudeA);
  const lat2 = toRadians(latitudeB);
  const haversine = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadiusM * Math.asin(Math.sqrt(haversine));
}

type SentLocation = { latitude: number; longitude: number; accuracy: number; sentAt: number };

export default function VisitorAnalytics() {
  const pathname = usePathname() || "/";
  const lastTrackedPath = useRef("");
  const liveWatchId = useRef<number | null>(null);
  const lastSentLocation = useRef<SentLocation | null>(null);
  const currentPath = useRef(pathname);
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [requestingLocation, setRequestingLocation] = useState(false);

  useEffect(() => { currentPath.current = pathname; }, [pathname]);

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
        const next = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, sentAt: now };
        const previous = lastSentLocation.current;
        const enoughTimePassed = !previous || now - previous.sentAt >= LIVE_LOCATION_MIN_INTERVAL_MS;
        const movedEnough = !previous || distanceMetres(previous.latitude, previous.longitude, next.latitude, next.longitude) >= LIVE_LOCATION_MIN_DISTANCE_M;
        const meaningfullyMoreAccurate = !!previous && next.accuracy + 15 < previous.accuracy;
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
            language: navigator.language || "",
            screenWidth: window.screen?.width || 0,
            screenHeight: window.screen?.height || 0,
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
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 5_000 },
    );
  }, [stopLiveLocation]);

  useEffect(() => {
    if (!isPublicWebsitePage(pathname)) {
      stopLiveLocation();
      setShowLocationPrompt(false);
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
    if (!lastPrompt || Date.now() - lastPrompt >= LOCATION_PROMPT_COOLDOWN_MS) setShowLocationPrompt(true);
  }, [pathname, startLiveLocation, stopLiveLocation]);

  useEffect(() => () => stopLiveLocation(), [stopLiveLocation]);

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
          language: navigator.language || "",
          screenWidth: window.screen?.width || 0,
          screenHeight: window.screen?.height || 0,
        });
        startLiveLocation();
      },
      (error) => {
        window.localStorage.setItem(LOCATION_STATE_KEY, error.code === error.PERMISSION_DENIED ? "denied" : "dismissed");
        setShowLocationPrompt(false);
        setRequestingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  }

  return (
    <>
      <style>{publicMobileFixes}</style>
      {showLocationPrompt ? (
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
            <button className={styles.secondaryButton} type="button" onClick={dismissLocationPrompt} disabled={requestingLocation}>Not now</button>
          </div>
          <p className={styles.note}>Precise location requires browser permission. Approximate location may also be derived from the visitor&apos;s IP address.</p>
        </aside>
      ) : null}
    </>
  );
}
