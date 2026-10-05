"use client";

import { useEffect, useMemo, useState } from "react";

type PairState = {
  connection: string;
  paired: boolean;
  qrAvailable: boolean;
  qrDataUrl?: string | null;
};

export default function WhatsAppPairingPage() {
  const [state, setState] = useState<PairState | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const response = await fetch("/api/admin/whatsapp", { cache: "no-store" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not load WhatsApp pairing status.");
      setState(json.data);
      setError("");
    } catch (err: any) {
      setError(String(err?.message || "Could not load WhatsApp pairing status."));
    } finally {
      setLoading(false);
    }
  }

  async function resetPairing() {
    if (!confirm("Reset the LAND VIEW WhatsApp linked-device session and generate a new QR code?")) return;
    setResetting(true);
    setError("");
    try {
      const response = await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not reset WhatsApp pairing.");
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await load();
    } catch (err: any) {
      setError(String(err?.message || "Could not reset WhatsApp pairing."));
    } finally {
      setResetting(false);
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const statusText = useMemo(() => {
    if (loading && !state) return "Checking…";
    if (!state) return "Unavailable";
    if (state.paired) return "Connected";
    if (state.qrAvailable) return "Waiting for QR scan";
    if (state.connection === "logged_out") return "Pairing reset required";
    return "Preparing connection";
  }, [loading, state]);

  return (
    <main style={{ maxWidth: 920, margin: "0 auto", padding: "32px 20px 56px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: "#64748b" }}>LAND VIEW</div>
          <h1 style={{ margin: "6px 0 8px", fontSize: 30 }}>WhatsApp Site Visit Automation</h1>
          <p style={{ margin: 0, color: "#64748b", lineHeight: 1.6 }}>
            Pair the LAND VIEW WhatsApp account once. The bot token stays server-side and is never shown in this page.
          </p>
        </div>
        <button
          onClick={() => load()}
          disabled={loading}
          style={{ border: "1px solid #cbd5e1", background: "white", borderRadius: 10, padding: "10px 14px", cursor: "pointer", fontWeight: 700 }}
        >
          {loading ? "Checking…" : "Refresh"}
        </button>
      </div>

      <section style={{ marginTop: 24, border: "1px solid #e2e8f0", borderRadius: 16, background: "white", padding: 24, boxShadow: "0 8px 30px rgba(15,23,42,.05)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 5 }}>Connection Status</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{statusText}</div>
          </div>
          <div
            style={{
              padding: "8px 12px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 800,
              background: state?.paired ? "#dcfce7" : state?.qrAvailable ? "#fef3c7" : "#e2e8f0",
              color: state?.paired ? "#166534" : state?.qrAvailable ? "#92400e" : "#334155",
            }}
          >
            {state?.paired ? "READY" : state?.qrAvailable ? "PAIR NOW" : "STARTING"}
          </div>
        </div>

        {error ? (
          <div style={{ marginTop: 18, padding: 14, borderRadius: 10, background: "#fef2f2", color: "#991b1b", lineHeight: 1.5 }}>{error}</div>
        ) : null}

        {state?.paired ? (
          <div style={{ marginTop: 24, padding: 20, borderRadius: 14, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
            <strong>WhatsApp is connected.</strong>
            <div style={{ marginTop: 6, color: "#166534", lineHeight: 1.6 }}>
              New Site Visit announcements can now be sent automatically to the configured LAND VIEW WhatsApp group.
            </div>
          </div>
        ) : state?.qrDataUrl ? (
          <div style={{ marginTop: 26, display: "grid", gridTemplateColumns: "minmax(280px, 380px) 1fr", gap: 28, alignItems: "center" }}>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 14, textAlign: "center", background: "#fff" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={state.qrDataUrl} alt="WhatsApp pairing QR" style={{ width: "100%", maxWidth: 360, height: "auto" }} />
            </div>
            <div style={{ color: "#334155", lineHeight: 1.75 }}>
              <h2 style={{ color: "#0f172a", marginTop: 0 }}>Scan with the sender WhatsApp account</h2>
              <ol style={{ paddingLeft: 22 }}>
                <li>Open WhatsApp on the phone.</li>
                <li>Open <strong>Linked devices</strong>.</li>
                <li>Tap <strong>Link a device</strong>.</li>
                <li>Scan this QR code.</li>
              </ol>
              <p>The page checks the connection automatically every 5 seconds. The QR may refresh if it expires.</p>
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 24, padding: 20, borderRadius: 14, background: "#f8fafc", color: "#475569" }}>
            The WhatsApp service is preparing a secure pairing session. This page will refresh automatically.
          </div>
        )}

        <div style={{ marginTop: 26, paddingTop: 20, borderTop: "1px solid #e2e8f0", display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            onClick={resetPairing}
            disabled={resetting}
            style={{ border: "1px solid #fecaca", color: "#991b1b", background: "#fff", borderRadius: 10, padding: "10px 14px", cursor: "pointer", fontWeight: 700 }}
          >
            {resetting ? "Resetting…" : "Reset Pairing"}
          </button>
        </div>
      </section>
    </main>
  );
}
