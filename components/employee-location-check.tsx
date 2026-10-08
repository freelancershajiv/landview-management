"use client";

import { useCallback, useEffect, useState } from "react";

type Check = {
  id: string;
  requestedBy?: string;
  requestedAt?: string;
  expiresAt?: string;
  status?: string;
  responseNote?: string;
};

async function jsonRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Location-check request failed."));
  return json.data;
}

function locationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) return "Location permission was denied or blocked in the browser.";
  if (error.code === error.POSITION_UNAVAILABLE) return "Your device could not determine a fresh location.";
  if (error.code === error.TIMEOUT) return "Location request timed out. Move to an open area and try again.";
  return "Could not access device location.";
}

export default function EmployeeLocationCheck() {
  const [check, setCheck] = useState<Check | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await jsonRequest("/api/employee/location-check");
      setCheck(data || null);
    } catch {
      // Keep the employee workspace usable if the check service is unavailable.
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 12000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function sendDenied(reason: string) {
    if (!check?.id) return;
    try {
      await jsonRequest("/api/employee/location-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deny", checkId: check.id, reason }),
      });
      setNotice("Management was informed that location could not be shared.");
      await load();
    } catch {
      // The visible browser error is more useful than a secondary reporting error.
    }
  }

  async function shareLocation() {
    if (!check?.id || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (!navigator.geolocation) throw new Error("This browser does not support device location.");
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });
      const data = await jsonRequest("/api/employee/location-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "respond",
          checkId: check.id,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: position.coords.accuracy,
        }),
      });
      setNotice(String(data?.responseNote || "Location check submitted."));
      await load();
    } catch (err: any) {
      const message = typeof err?.code === "number" ? locationErrorMessage(err as GeolocationPositionError) : String(err?.message || "Could not verify location.");
      setError(message);
      if (typeof err?.code === "number" && err.code === 1) await sendDenied(message);
    } finally {
      setBusy(false);
    }
  }

  if (!check || check.status !== "PENDING") return null;

  return <section className="employee-location-check">
    <style>{`
      .employee-location-check{margin:0 0 16px;padding:16px 17px;border:1px solid #7d5920;border-radius:12px;background:linear-gradient(145deg,#211b11,#15130f);color:#f5f5f5}.elc-top{display:flex;align-items:center;justify-content:space-between;gap:16px}.elc-kicker{display:block;color:#f4b95e;font-size:9px;font-weight:900;letter-spacing:.12em}.elc-title{margin:4px 0 0;font-size:16px}.elc-copy{margin:8px 0 0;max-width:760px;color:#aeb5bc;font-size:10px;line-height:1.55}.elc-action{flex:0 0 auto;height:40px;padding:0 14px;border:0;border-radius:8px;background:#e1473e;color:#fff;font-size:9px;font-weight:900;cursor:pointer}.elc-action:disabled{opacity:.55;cursor:wait}.elc-meta{margin-top:9px;color:#7f8992;font-size:9px}.elc-error,.elc-ok{margin-top:10px;padding:9px 10px;border-radius:8px;font-size:9px}.elc-error{border:1px solid #713337;background:#321719;color:#ffaaa5}.elc-ok{border:1px solid #315d42;background:#14251a;color:#a9dfb8}@media(max-width:700px){.elc-top{align-items:stretch;flex-direction:column}.elc-action{width:100%}}
    `}</style>
    <div className="elc-top">
      <div>
        <span className="elc-kicker">MANAGEMENT LOCATION CHECK</span>
        <h3 className="elc-title">Please verify your current work location</h3>
        <p className="elc-copy">LAND VIEW will compare one fresh GPS reading with registered project sites. Management will only see whether you are on/near a registered site, the matched File ID, distance and GPS accuracy. Your unrelated exact coordinates are not stored.</p>
        <div className="elc-meta">Requested by {check.requestedBy || "Management"} · Request expires in 5 minutes.</div>
      </div>
      <button type="button" className="elc-action" disabled={busy} onClick={() => void shareLocation()}>{busy ? "CHECKING GPS…" : "SHARE LOCATION NOW"}</button>
    </div>
    {error && <div className="elc-error">{error}</div>}
    {notice && <div className="elc-ok">{notice}</div>}
  </section>;
}
