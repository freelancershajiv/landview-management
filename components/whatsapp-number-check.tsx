"use client";

import { useEffect, useState } from "react";

type CheckState =
  | { kind: "idle"; text: string }
  | { kind: "checking"; text: string }
  | { kind: "ok"; text: string }
  | { kind: "bad"; text: string }
  | { kind: "error"; text: string };

function cleanPhone(value: string) {
  return String(value || "").trim();
}

export default function WhatsAppNumberCheck({ phoneNumber }: { phoneNumber: string }) {
  const phone = cleanPhone(phoneNumber);
  const [state, setState] = useState<CheckState>({ kind: "idle", text: "" });
  const [checkedPhone, setCheckedPhone] = useState("");

  useEffect(() => {
    if (checkedPhone && phone !== checkedPhone) {
      setCheckedPhone("");
      setState({ kind: "idle", text: "" });
    }
  }, [phone, checkedPhone]);

  async function check() {
    if (!phone) {
      setState({ kind: "bad", text: "Enter the client's mobile number first." });
      return;
    }
    setState({ kind: "checking", text: "Checking WhatsApp…" });
    try {
      const response = await fetch("/api/admin/whatsapp/client", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check-number", phoneNumber: phone }),
      });
      const json = await response.json().catch(() => null) as any;
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "WhatsApp check failed."));
      const data = json.data || {};
      setCheckedPhone(phone);
      if (data.registered) {
        setState({ kind: "ok", text: `✓ WhatsApp enabled${data.normalizedPhone ? ` · ${data.normalizedPhone}` : ""}` });
      } else {
        setState({ kind: "bad", text: "✕ This number is not registered on WhatsApp." });
      }
    } catch (error: any) {
      setState({ kind: "error", text: error?.message || "Could not check WhatsApp right now." });
    }
  }

  const tone = state.kind === "ok" ? "#45c884" : state.kind === "bad" || state.kind === "error" ? "#ff7474" : "#8997a3";

  return <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 7 }}>
    <button
      type="button"
      onClick={check}
      disabled={state.kind === "checking" || !phone}
      style={{ minHeight: 30, padding: "0 10px", borderRadius: 7, border: "1px solid rgba(255,255,255,.16)", background: "#14202a", color: "#f3f6f8", fontSize: 10, fontWeight: 800, cursor: state.kind === "checking" || !phone ? "not-allowed" : "pointer", opacity: !phone ? .55 : 1 }}
    >
      {state.kind === "checking" ? "Checking…" : "Check WhatsApp"}
    </button>
    {state.text ? <span style={{ color: tone, fontSize: 10, fontWeight: 700 }}>{state.text}</span> : <span style={{ color: "#6f7d88", fontSize: 9 }}>Verify before enabling client updates.</span>}
  </div>;
}
