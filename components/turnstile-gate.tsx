"use client";

import { useEffect, useRef, useState } from "react";

type PortalType = "admin" | "employee" | "client";

type TurnstileWidgetId = string | number;

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action?: string;
      theme?: "auto" | "light" | "dark";
      size?: "normal" | "compact" | "flexible";
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: (code?: string) => void;
      "timeout-callback"?: () => void;
    }
  ) => TurnstileWidgetId;
  reset: (widgetId?: TurnstileWidgetId) => void;
  remove: (widgetId: TurnstileWidgetId) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type TurnstileGateProps = {
  portal: PortalType;
  resetKey: number;
  onVerified: (token: string) => void;
  onError: (message: string) => void;
};

const SCRIPT_ID = "cloudflare-turnstile-script";
const SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export default function TurnstileGate({
  portal,
  resetKey,
  onVerified,
  onError,
}: TurnstileGateProps) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<TurnstileWidgetId | null>(null);
  const onVerifiedRef = useRef(onVerified);
  const onErrorRef = useRef(onError);
  const [scriptReady, setScriptReady] = useState(false);

  useEffect(() => {
    onVerifiedRef.current = onVerified;
  }, [onVerified]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!siteKey) return;

    if (window.turnstile) {
      setScriptReady(true);
      return;
    }

    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    let created = false;

    const handleLoad = () => setScriptReady(true);
    const handleError = () =>
      onErrorRef.current(
        "Cloudflare security verification could not load. Check your internet connection and try again."
      );

    if (!script) {
      script = document.createElement("script");
      script.id = SCRIPT_ID;
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
      created = true;
    }

    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);

    return () => {
      script?.removeEventListener("load", handleLoad);
      script?.removeEventListener("error", handleError);
      // Keep the shared Turnstile script mounted for later portal changes.
      void created;
    };
  }, [siteKey]);

  useEffect(() => {
    if (!siteKey || !scriptReady || !containerRef.current || !window.turnstile) {
      return;
    }

    if (widgetIdRef.current !== null) {
      try {
        window.turnstile.remove(widgetIdRef.current);
      } catch {
        // Widget may already have been removed during navigation.
      }
      widgetIdRef.current = null;
    }

    containerRef.current.innerHTML = "";
    onVerifiedRef.current("");

    const widgetId = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action: `landview_${portal}_login`,
      theme: "light",
      size: "flexible",
      callback: (token) => {
        onErrorRef.current("");
        onVerifiedRef.current(token);
      },
      "expired-callback": () => {
        onVerifiedRef.current("");
        onErrorRef.current("Security verification expired. Please verify again.");
      },
      "timeout-callback": () => {
        onVerifiedRef.current("");
        onErrorRef.current("Security verification timed out. Please try again.");
      },
      "error-callback": () => {
        onVerifiedRef.current("");
        onErrorRef.current("Cloudflare could not verify this browser. Please try again.");
      },
    });

    widgetIdRef.current = widgetId;

    return () => {
      if (window.turnstile && widgetIdRef.current !== null) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Ignore cleanup races.
        }
      }
      widgetIdRef.current = null;
    };
  }, [portal, resetKey, scriptReady, siteKey]);

  if (!siteKey) {
    return (
      <div className="turnstile-config-error" role="alert">
        <strong>Security verification is not configured</strong>
        <span>
          Add NEXT_PUBLIC_TURNSTILE_SITE_KEY to .env.local and restart the Next.js server.
        </span>
      </div>
    );
  }

  return (
    <div className="turnstile-gate">
      <div className="turnstile-gate-head">
        <span>STEP 2</span>
        <div>
          <strong>Verify you are human</strong>
          <p>Cloudflare security check is required before credentials are accepted.</p>
        </div>
      </div>
      <div className="turnstile-widget-wrap" ref={containerRef} />
    </div>
  );
}
