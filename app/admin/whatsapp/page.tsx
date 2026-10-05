"use client";

import { useEffect, useMemo, useState } from "react";

type PairState = {
  connection: string;
  paired: boolean;
  qrAvailable: boolean;
  qrDataUrl?: string | null;
};
type Conversation = {
  id: string;
  phone_number?: string;
  client_name?: string;
  project_code?: string;
  human_handoff?: boolean;
  verified_at?: string | null;
  unread_count?: number;
  last_message_at?: string | null;
};
type Message = {
  id: string;
  direction: "inbound" | "outbound";
  message_type?: string;
  body?: string;
  sent_at?: string;
};

function statusText(state: PairState | null, loading: boolean) {
  if (loading && !state) return "Checking…";
  if (!state) return "Unavailable";
  if (state.paired) return "Connected";
  if (state.qrAvailable) return "Waiting for QR scan";
  if (state.connection === "logged_out") return "Pairing reset required";
  return "Preparing connection";
}
function when(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleString();
}

function BotCard({
  title,
  description,
  state,
  loading,
  error,
  onReset,
  resetting,
  dedicated,
}: {
  title: string;
  description: string;
  state: PairState | null;
  loading: boolean;
  error: string;
  onReset: () => void;
  resetting: boolean;
  dedicated?: boolean;
}) {
  const label = statusText(state, loading);
  return (
    <section style={{ border: "1px solid #e2e8f0", borderRadius: 16, background: "white", padding: 22, boxShadow: "0 8px 30px rgba(15,23,42,.05)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>{title}</h2>
          <p style={{ margin: "7px 0 0", color: "#64748b", lineHeight: 1.55 }}>{description}</p>
        </div>
        <span style={{ padding: "7px 11px", borderRadius: 999, fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", background: state?.paired ? "#dcfce7" : state?.qrAvailable ? "#fef3c7" : "#e2e8f0", color: state?.paired ? "#166534" : state?.qrAvailable ? "#92400e" : "#334155" }}>
          {state?.paired ? "READY" : state?.qrAvailable ? "PAIR NOW" : "STARTING"}
        </span>
      </div>

      <div style={{ marginTop: 18, fontSize: 13, color: "#64748b" }}>Connection Status</div>
      <div style={{ marginTop: 3, fontSize: 20, fontWeight: 800 }}>{label}</div>

      {error ? <div style={{ marginTop: 15, padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b" }}>{error}</div> : null}

      {state?.paired ? (
        <div style={{ marginTop: 18, padding: 14, borderRadius: 12, background: "#f0fdf4", border: "1px solid #bbf7d0", color: "#166534", lineHeight: 1.55 }}>
          <strong>Connected.</strong> {dedicated ? "Clients can message this LAND VIEW number and queued client updates can be delivered." : "Site Visit group announcements are ready."}
        </div>
      ) : state?.qrDataUrl ? (
        <div style={{ marginTop: 20, display: "grid", gridTemplateColumns: "minmax(210px, 300px) 1fr", gap: 20, alignItems: "center" }}>
          <div style={{ border: "1px solid #e2e8f0", borderRadius: 14, padding: 10, textAlign: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={state.qrDataUrl} alt={`${title} pairing QR`} style={{ width: "100%", maxWidth: 280, height: "auto" }} />
          </div>
          <div style={{ color: "#334155", lineHeight: 1.7 }}>
            <strong>{dedicated ? "Scan using the dedicated LAND VIEW client WhatsApp number." : "Scan using the internal LAND VIEW sender account."}</strong>
            <div style={{ marginTop: 7 }}>WhatsApp → Linked devices → Link a device → scan the QR.</div>
            {dedicated ? <div style={{ marginTop: 8, color: "#92400e" }}>Do not scan this client QR from the same account used for the internal Site Visit bot.</div> : null}
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 18, padding: 14, borderRadius: 12, background: "#f8fafc", color: "#475569" }}>Preparing a secure pairing session. This page refreshes automatically.</div>
      )}

      <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid #e2e8f0" }}>
        <button onClick={onReset} disabled={resetting} style={{ border: "1px solid #fecaca", color: "#991b1b", background: "#fff", borderRadius: 9, padding: "9px 12px", cursor: "pointer", fontWeight: 700 }}>
          {resetting ? "Resetting…" : "Reset Pairing"}
        </button>
      </div>
    </section>
  );
}

export default function WhatsAppPage() {
  const [siteState, setSiteState] = useState<PairState | null>(null);
  const [clientState, setClientState] = useState<PairState | null>(null);
  const [loading, setLoading] = useState(true);
  const [siteError, setSiteError] = useState("");
  const [clientError, setClientError] = useState("");
  const [resetting, setResetting] = useState<"site" | "client" | "">("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [inboxError, setInboxError] = useState("");

  const selected = useMemo(() => conversations.find((row) => row.id === selectedId) || null, [conversations, selectedId]);
  const unreadTotal = useMemo(() => conversations.reduce((sum, row) => sum + Number(row.unread_count || 0), 0), [conversations]);

  async function loadStatus() {
    setLoading(true);
    await Promise.all([
      fetch("/api/admin/whatsapp", { cache: "no-store" }).then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success) throw new Error(json?.error || "Could not load Site Visit bot.");
        setSiteState(json.data); setSiteError("");
      }).catch((err) => setSiteError(String(err?.message || err))),
      fetch("/api/admin/whatsapp/client?mode=status", { cache: "no-store" }).then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success) throw new Error(json?.error || "Could not load client bot.");
        setClientState(json.data); setClientError("");
      }).catch((err) => setClientError(String(err?.message || err))),
    ]);
    setLoading(false);
  }

  async function loadConversations() {
    try {
      const response = await fetch("/api/admin/whatsapp/client?mode=conversations", { cache: "no-store" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not load client conversations.");
      const rows = Array.isArray(json.data) ? json.data : [];
      setConversations(rows);
      setInboxError("");
      if (!selectedId && rows[0]?.id) setSelectedId(rows[0].id);
    } catch (err: any) {
      setInboxError(String(err?.message || "Could not load client conversations."));
    }
  }

  async function loadMessages(id = selectedId) {
    if (!id) { setMessages([]); return; }
    try {
      const response = await fetch(`/api/admin/whatsapp/client?mode=messages&conversationId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not load messages.");
      setMessages(Array.isArray(json.data) ? json.data : []);
      setInboxError("");
      setConversations((rows) => rows.map((row) => row.id === id ? { ...row, unread_count: 0 } : row));
    } catch (err: any) {
      setInboxError(String(err?.message || "Could not load messages."));
    }
  }

  async function resetPairing(which: "site" | "client") {
    const name = which === "site" ? "internal Site Visit bot" : "dedicated client bot";
    if (!confirm(`Reset the ${name} linked-device session and generate a new QR code?`)) return;
    setResetting(which);
    try {
      const url = which === "site" ? "/api/admin/whatsapp" : "/api/admin/whatsapp/client";
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reset" }) });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not reset pairing.");
      await new Promise((resolve) => setTimeout(resolve, 900));
      await loadStatus();
    } catch (err: any) {
      if (which === "site") setSiteError(String(err?.message || err)); else setClientError(String(err?.message || err));
    } finally { setResetting(""); }
  }

  async function sendReply() {
    const body = reply.trim();
    if (!selectedId || !body || sending) return;
    setSending(true);
    try {
      const response = await fetch("/api/admin/whatsapp/client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reply", conversationId: selectedId, message: body }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not queue WhatsApp reply.");
      setReply("");
      await new Promise((resolve) => setTimeout(resolve, 700));
      await loadMessages();
    } catch (err: any) { setInboxError(String(err?.message || "Could not send reply.")); }
    finally { setSending(false); }
  }

  async function setHandoff(enabled: boolean) {
    if (!selectedId) return;
    try {
      const response = await fetch("/api/admin/whatsapp/client", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "handoff", conversationId: selectedId, enabled }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not update handoff.");
      setConversations((rows) => rows.map((row) => row.id === selectedId ? { ...row, human_handoff: enabled } : row));
    } catch (err: any) { setInboxError(String(err?.message || "Could not update handoff.")); }
  }

  useEffect(() => {
    loadStatus(); loadConversations();
    const statusTimer = window.setInterval(loadStatus, 6000);
    const inboxTimer = window.setInterval(loadConversations, 8000);
    return () => { window.clearInterval(statusTimer); window.clearInterval(inboxTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    loadMessages(selectedId);
    const timer = window.setInterval(() => loadMessages(selectedId), 6000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: "32px 20px 60px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: "#64748b" }}>LAND VIEW</div>
          <h1 style={{ margin: "6px 0 8px", fontSize: 30 }}>WhatsApp Center</h1>
          <p style={{ margin: 0, color: "#64748b", lineHeight: 1.6 }}>Internal Site Visit automation plus a dedicated two-way client WhatsApp bot and inbox.</p>
        </div>
        <button onClick={() => { loadStatus(); loadConversations(); }} disabled={loading} style={{ border: "1px solid #cbd5e1", background: "white", borderRadius: 10, padding: "10px 14px", cursor: "pointer", fontWeight: 700 }}>
          {loading ? "Checking…" : "Refresh"}
        </button>
      </div>

      <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(360px,1fr))", gap: 18 }}>
        <BotCard title="Internal Site Visit Bot" description="Existing LAND VIEW account used for automatic Site Visit announcements to the internal WhatsApp group." state={siteState} loading={loading} error={siteError} onReset={() => resetPairing("site")} resetting={resetting === "site"} />
        <BotCard title="Client WhatsApp Bot" description="Pair a separate LAND VIEW WhatsApp number for client messages, project updates and human replies." state={clientState} loading={loading} error={clientError} onReset={() => resetPairing("client")} resetting={resetting === "client"} dedicated />
      </div>

      <section style={{ marginTop: 22, border: "1px solid #e2e8f0", borderRadius: 16, background: "white", overflow: "hidden", boxShadow: "0 8px 30px rgba(15,23,42,.05)" }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>Client Inbox</h2>
            <div style={{ marginTop: 4, color: "#64748b", fontSize: 13 }}>{unreadTotal ? `${unreadTotal} unread message${unreadTotal === 1 ? "" : "s"}` : "No unread messages"}</div>
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>Auto-refreshes</div>
        </div>

        {inboxError ? <div style={{ margin: 16, padding: 12, borderRadius: 10, background: "#fef2f2", color: "#991b1b" }}>{inboxError}</div> : null}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,340px) minmax(0,1fr)", minHeight: 520 }}>
          <aside style={{ borderRight: "1px solid #e2e8f0", background: "#f8fafc", overflowY: "auto", maxHeight: 680 }}>
            {!conversations.length ? <div style={{ padding: 22, color: "#64748b", lineHeight: 1.6 }}>No client conversations yet. Once the dedicated number is paired, incoming client messages will appear here.</div> : conversations.map((row) => (
              <button key={row.id} onClick={() => setSelectedId(row.id)} style={{ width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid #e2e8f0", padding: "14px 16px", cursor: "pointer", background: row.id === selectedId ? "#fff" : "transparent" }}>
                <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ color: "#0f172a" }}>{row.client_name || row.phone_number || "Unknown client"}</strong>
                  {Number(row.unread_count || 0) > 0 ? <span style={{ minWidth: 22, height: 22, borderRadius: 999, background: "#0f172a", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>{row.unread_count}</span> : null}
                </div>
                <div style={{ marginTop: 5, color: "#64748b", fontSize: 12 }}>{row.project_code || "Unverified project"} · {row.phone_number || "No phone"}</div>
                <div style={{ marginTop: 4, color: row.human_handoff ? "#92400e" : row.verified_at ? "#166534" : "#64748b", fontSize: 11, fontWeight: 700 }}>{row.human_handoff ? "HUMAN HANDOFF" : row.verified_at ? "VERIFIED" : "UNVERIFIED"}</div>
                <div style={{ marginTop: 4, color: "#94a3b8", fontSize: 11 }}>{when(row.last_message_at)}</div>
              </button>
            ))}
          </aside>

          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            {!selected ? (
              <div style={{ padding: 28, color: "#64748b" }}>Select a conversation.</div>
            ) : (
              <>
                <div style={{ padding: "14px 18px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <strong>{selected.client_name || selected.phone_number || "Client"}</strong>
                    <div style={{ marginTop: 3, fontSize: 12, color: "#64748b" }}>{selected.project_code || "Project not verified"} · {selected.phone_number}</div>
                  </div>
                  <button onClick={() => setHandoff(!selected.human_handoff)} style={{ border: "1px solid #cbd5e1", background: selected.human_handoff ? "#fef3c7" : "#fff", borderRadius: 9, padding: "8px 11px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
                    {selected.human_handoff ? "Return to Bot" : "Take Over Conversation"}
                  </button>
                </div>

                <div style={{ flex: 1, padding: 18, background: "#f8fafc", overflowY: "auto", maxHeight: 500 }}>
                  {!messages.length ? <div style={{ color: "#64748b" }}>No messages yet.</div> : messages.map((message) => (
                    <div key={message.id} style={{ display: "flex", justifyContent: message.direction === "outbound" ? "flex-end" : "flex-start", marginBottom: 10 }}>
                      <div style={{ maxWidth: "78%", borderRadius: 13, padding: "10px 12px", background: message.direction === "outbound" ? "#dcfce7" : "#fff", border: "1px solid #e2e8f0", color: "#0f172a", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                        <div>{message.body || `[${message.message_type || "message"}]`}</div>
                        <div style={{ marginTop: 5, fontSize: 10, color: "#64748b", textAlign: "right" }}>{when(message.sent_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ padding: 14, borderTop: "1px solid #e2e8f0", display: "flex", gap: 10, alignItems: "flex-end" }}>
                  <textarea value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Reply to this client on WhatsApp…" rows={3} maxLength={4000} style={{ flex: 1, resize: "vertical", minHeight: 70, border: "1px solid #cbd5e1", borderRadius: 10, padding: 11, font: "inherit" }} />
                  <button onClick={sendReply} disabled={sending || !reply.trim()} style={{ border: 0, background: "#0f172a", color: "#fff", borderRadius: 10, padding: "11px 16px", fontWeight: 800, cursor: "pointer", opacity: sending || !reply.trim() ? .55 : 1 }}>
                    {sending ? "Sending…" : "Send"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
