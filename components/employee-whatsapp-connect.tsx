"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

type WhatsAppStatus = {
  employeeId?: string;
  connection?: string;
  paired?: boolean;
  qrAvailable?: boolean;
  qrDataUrl?: string | null;
  phoneNumber?: string | null;
  lastError?: string | null;
};

function phoneText(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return `+${digits}`;
}

export default function EmployeeWhatsAppConnect() {
  const [status, setStatus] = useState<WhatsAppStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const result = await fetch("/api/employee-whatsapp", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      const json = await result.json().catch(() => null);
      if (!result.ok || !json?.success) throw new Error(String(json?.error || "Could not load WhatsApp status."));
      setStatus(json.data || {});
    } catch (e: any) {
      setError(e?.message || "Could not load WhatsApp status.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (status?.paired) return;
    const timer = window.setInterval(() => void load(true), 4000);
    return () => window.clearInterval(timer);
  }, [load, status?.paired]);

  async function reset() {
    setResetting(true);
    setError("");
    try {
      const result = await fetch("/api/employee-whatsapp", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const json = await result.json().catch(() => null);
      if (!result.ok || !json?.success) throw new Error(String(json?.error || "Could not reset WhatsApp connection."));
      setStatus(json.data || {});
      window.setTimeout(() => void load(true), 1200);
    } catch (e: any) {
      setError(e?.message || "Could not reset WhatsApp connection.");
    } finally {
      setResetting(false);
    }
  }

  const connection = String(status?.connection || "").toLowerCase();
  const connected = Boolean(status?.paired);
  const qr = String(status?.qrDataUrl || "");
  const phone = phoneText(status?.phoneNumber);

  return <section className="employee-wa-card" aria-label="Employee WhatsApp connection">
    <style>{`
      .employee-wa-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:center;margin:0 0 18px;padding:18px 20px;border:1px solid var(--theme-line-_2d3740,#2d3740);border-radius:15px;background:linear-gradient(145deg,var(--theme-bg-_11171d,#11171d),var(--theme-bg-_0d1217,#0d1217));box-shadow:0 10px 28px rgba(0,0,0,.08)}
      .employee-wa-main{display:grid;gap:7px;min-width:0}.employee-wa-kicker{font-size:8px;font-weight:900;letter-spacing:.15em;color:#6ed59a}.employee-wa-title{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.employee-wa-title h2{margin:0;font-size:16px}.employee-wa-dot{width:8px;height:8px;border-radius:999px;background:#69737d;box-shadow:0 0 0 4px rgba(105,115,125,.12)}.employee-wa-dot.on{background:#42c978;box-shadow:0 0 0 4px rgba(66,201,120,.12)}.employee-wa-copy{margin:0;color:var(--theme-ink-_8f9ba5,#8f9ba5);font-size:10px;line-height:1.55;max-width:780px}.employee-wa-state{font-size:10px;font-weight:800;color:var(--theme-ink-_e9edf0,#e9edf0)}.employee-wa-state strong{color:#6ed59a}.employee-wa-error{margin-top:3px;padding:8px 10px;border:1px solid #6c292e;border-radius:8px;background:#341617;color:#ffaaa5;font-size:9px;line-height:1.45}.employee-wa-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.employee-wa-btn{min-height:36px;padding:0 13px;border:1px solid var(--theme-line-_3b4751,#3b4751);border-radius:8px;background:var(--theme-bg-_171e25,#171e25);color:#fff;font-size:9px;font-weight:900;cursor:pointer}.employee-wa-btn.primary{border-color:#27794a;background:#176a3b}.employee-wa-btn:disabled{opacity:.55;cursor:wait}.employee-wa-qr{grid-column:1/-1;display:grid;grid-template-columns:auto minmax(0,1fr);gap:18px;align-items:center;padding-top:14px;border-top:1px solid var(--theme-line-_27313a,#27313a)}.employee-wa-qr-box{padding:10px;border-radius:12px;background:#fff;line-height:0}.employee-wa-qr-copy{display:grid;gap:7px}.employee-wa-qr-copy strong{font-size:12px}.employee-wa-qr-copy p{margin:0;color:var(--theme-ink-_8f9ba5,#8f9ba5);font-size:10px;line-height:1.55}.employee-wa-qr-copy b{color:#fff}.employee-wa-loading{font-size:10px;color:var(--theme-ink-_8f9ba5,#8f9ba5)}
      @media(max-width:700px){.employee-wa-card{grid-template-columns:1fr;padding:15px}.employee-wa-actions{justify-content:flex-start}.employee-wa-qr{grid-template-columns:1fr}.employee-wa-qr-box{width:max-content;max-width:100%;margin:auto}.employee-wa-qr-copy{text-align:center}}
    `}</style>

    <div className="employee-wa-main">
      <span className="employee-wa-kicker">WHATSAPP · SITE VISITS</span>
      <div className="employee-wa-title">
        <span className={`employee-wa-dot${connected ? " on" : ""}`} />
        <h2>{connected ? "Your WhatsApp is connected" : "Connect your WhatsApp"}</h2>
      </div>
      <p className="employee-wa-copy">Link the WhatsApp account you use on your phone. After it is connected, Site Visit updates you submit will be posted to the LAND VIEW WhatsApp group from this WhatsApp number.</p>
      {loading ? <span className="employee-wa-loading">Checking WhatsApp connection…</span> : <span className="employee-wa-state">{connected ? <>Connected {phone ? <>as <strong>{phone}</strong></> : null}</> : connection === "pairing" ? "Waiting for QR scan" : connection === "connecting" || connection === "resetting" ? "Preparing secure connection…" : connection === "logged_out" ? "WhatsApp was disconnected" : "Not connected"}</span>}
      {(error || status?.lastError) && <div className="employee-wa-error">{error || status?.lastError}</div>}
    </div>

    <div className="employee-wa-actions">
      <button type="button" className="employee-wa-btn primary" disabled={loading} onClick={() => void load()}>{connected ? "CHECK CONNECTION" : "CONNECT WHATSAPP"}</button>
      <button type="button" className="employee-wa-btn" disabled={resetting} onClick={() => void reset()}>{resetting ? "RESETTING…" : connected ? "RECONNECT" : "NEW QR"}</button>
    </div>

    {!connected && qr && <div className="employee-wa-qr">
      <div className="employee-wa-qr-box"><Image src={qr} alt="WhatsApp linked device QR code" width={220} height={220} unoptimized priority /></div>
      <div className="employee-wa-qr-copy">
        <strong>Scan this QR with the employee&apos;s WhatsApp</strong>
        <p>On the phone open <b>WhatsApp → Linked devices → Link a device</b>, then scan this QR. The employee keeps using WhatsApp normally on the phone.</p>
        <p>Each employee has a separate LAND VIEW linked-device session. Another employee cannot use or replace this connection from their login.</p>
      </div>
    </div>}
  </section>;
}
