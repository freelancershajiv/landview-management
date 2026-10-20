"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Health = {
  connected: boolean;
  sentToday: number;
  queued: number;
  failed: number;
};

export default function WhatsAppHealthCard() {
  const [health, setHealth] = useState<Health | null>(null);
  const [hidden, setHidden] = useState(false);

  async function load() {
    try {
      const [statusResponse, opsResponse] = await Promise.all([
        fetch("/api/admin/whatsapp", { cache: "no-store" }),
        fetch("/api/admin/whatsapp?mode=ops", { cache: "no-store" }),
      ]);
      if (statusResponse.status === 401 || statusResponse.status === 403 || opsResponse.status === 401 || opsResponse.status === 403) {
        setHidden(true);
        return;
      }
      const [statusJson, opsJson] = await Promise.all([
        statusResponse.json().catch(() => null),
        opsResponse.json().catch(() => null),
      ]);
      if (!statusResponse.ok || !statusJson?.success || !opsResponse.ok || !opsJson?.success) return;
      setHealth({
        connected: Boolean(statusJson.data?.paired),
        sentToday: Number(opsJson.data?.stats?.sentToday || 0),
        queued: Number(opsJson.data?.stats?.queued || 0),
        failed: Number(opsJson.data?.stats?.failed || 0),
      });
    } catch {
      // The dashboard remains usable while the external WhatsApp service wakes up.
    }
  }

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 20000);
    return () => window.clearInterval(timer);
  }, []);

  if (hidden) return null;

  return (
    <div style={{ maxWidth: 1240, margin: "16px auto 0", padding: "0 20px" }}>
      <Link href="/admin/whatsapp/operations" style={{ textDecoration: "none", color: "inherit" }}>
        <section style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", flexWrap: "wrap", border: health?.failed ? "1px solid #fecaca" : "1px solid #e2e8f0", borderRadius: 14, background: "#fff", padding: "13px 16px", boxShadow: "0 6px 22px rgba(15,23,42,.04)" }}>
          <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
            <span style={{ width: 10, height: 10, borderRadius: 999, background: !health ? "#94a3b8" : health.connected ? "#16a34a" : "#dc2626", boxShadow: health?.connected ? "0 0 0 4px #dcfce7" : "0 0 0 4px #fee2e2" }} />
            <div>
              <div style={{ fontWeight: 900, color: "#0f172a", fontSize: 13 }}>WhatsApp {health ? (health.connected ? "Connected" : "Needs Attention") : "Checking…"}</div>
              <div style={{ marginTop: 2, color: "#64748b", fontSize: 11 }}>Central delivery health · click to open Operations Center</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#475569" }}>
            <span><strong style={{ color: "#0f172a" }}>{health?.sentToday ?? "—"}</strong> sent today</span>
            <span><strong style={{ color: "#0f172a" }}>{health?.queued ?? "—"}</strong> queued</span>
            <span style={{ color: health?.failed ? "#b91c1c" : "#475569" }}><strong>{health?.failed ?? "—"}</strong> failed</span>
          </div>
        </section>
      </Link>
    </div>
  );
}
