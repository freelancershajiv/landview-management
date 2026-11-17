"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import EmployeeWhatsAppConnect from "@/components/employee-whatsapp-connect";

type PairState = {
  connection: string;
  paired: boolean;
  qrAvailable: boolean;
  qrDataUrl?: string | null;
  lastError?: string | null;
  retryAfterMs?: number;
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
  if (state.connection === "service_waking") return "Server waking / temporarily unreachable";
  if (state.connection === "status_unavailable") return "Could not check connection";
  if (state.connection === "service_error") return "Service unavailable";
  if (state.connection === "error") return "Connection failed — retrying";
  if (state.connection === "conflict_backoff") return "Connection overlap — reconnecting safely";
  if (state.connection === "disconnected") return "Reconnecting…";
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
  const offlineStates = ["service_error", "status_unavailable", "error"];
  const badgeLabel = state?.paired ? "READY"
    : state?.qrAvailable ? "PAIR NOW"
    : state?.connection === "service_waking" ? "WAKING"
    : state?.connection === "conflict_backoff" ? "WAITING"
    : state?.connection === "logged_out" ? "PAIRING"
    : offlineStates.includes(state?.connection || "") ? "OFFLINE" : "STARTING";
  const details = error || (!state?.paired && offlineStates.includes(state?.connection || "") ? String(state?.lastError || "").slice(0, 300) : "");
  const canReset = Boolean(state?.paired || state?.qrAvailable || state?.connection === "logged_out");
  return (
    <section className="lv-wa-card lv-wa-bot-card" style={{ border: "1px solid var(--lv-border-default)", borderRadius: 16, background: "var(--lv-surface-panel)", padding: 22, boxShadow: "0 8px 30px rgba(15,23,42,.05)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>{title}</h2>
          <p style={{ margin: "7px 0 0", color: "var(--lv-text-muted)", lineHeight: 1.55 }}>{description}</p>
        </div>
        <span className={`lv-wa-badge ${state?.paired ? "is-success" : state?.qrAvailable ? "is-warning" : "is-muted"}`} style={{ padding: "7px 11px", borderRadius: 999, fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", background: state?.paired ? "#dcfce7" : state?.qrAvailable ? "#fef3c7" : "#e2e8f0", color: state?.paired ? "#166534" : state?.qrAvailable ? "#92400e" : "#334155" }}>
          {badgeLabel}
        </span>
      </div>

      <div style={{ marginTop: 18, fontSize: 13, color: "var(--lv-text-muted)" }}>Connection Status</div>
      <div style={{ marginTop: 3, fontSize: 20, fontWeight: 800 }}>{label}</div>

      {details ? <div className="lv-wa-alert is-danger" role="alert" style={{ marginTop: 15, padding: 12, borderRadius: 10, background: "#fef2f2", color: "var(--lv-danger)" }}>{details}</div> : null}

      {state?.paired ? (
        <div className="lv-wa-alert is-success" style={{ marginTop: 18, padding: 14, borderRadius: 12, background: "#f0fdf4", border: "1px solid #bbf7d0", color: "var(--lv-success)", lineHeight: 1.55 }}>
          <strong>Connected.</strong> {dedicated ? "Clients can message this LAND VIEW number and queued client updates can be delivered." : "Admin, EMP-0002, client updates, project finance and Site Visit messaging are ready."}
        </div>
      ) : state?.qrDataUrl ? (
        <div className="lv-wa-qr-row" style={{ marginTop: 20, display: "grid", gridTemplateColumns: "minmax(210px, 300px) 1fr", gap: 20, alignItems: "center" }}>
          <div className="lv-wa-qr-frame" style={{ border: "1px solid var(--lv-border-default)", borderRadius: 14, padding: 10, textAlign: "center" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={state.qrDataUrl} alt={`${title} pairing QR`} style={{ width: "100%", maxWidth: 280, height: "auto" }} />
          </div>
          <div className="lv-wa-qr-help" style={{ color: "var(--lv-text-primary)", lineHeight: 1.7 }}>
            <strong>{dedicated ? "Scan using the dedicated LAND VIEW client WhatsApp number." : "Scan using your Admin / EMP-0002 WhatsApp number."}</strong>
            <div style={{ marginTop: 7 }}>WhatsApp → Linked devices → Link a device → scan the QR.</div>
            {dedicated ? <div style={{ marginTop: 8, color: "var(--lv-warning)" }}>Do not scan this client QR from the same account used for the internal Site Visit bot.</div> : null}
          </div>
        </div>
      ) : (
        <div className="lv-wa-alert is-muted" style={{ marginTop: 18, padding: 14, borderRadius: 12, background: "var(--lv-surface-muted)", color: "var(--lv-text-secondary)" }}>
          {state?.connection === "service_waking"
            ? "The WhatsApp server is starting or briefly unreachable. Status refreshes automatically; do not reset pairing."
            : state?.connection === "conflict_backoff"
              ? "Another WhatsApp connection was detected. Retrying with a delay to avoid repeatedly disconnecting your account. Your pairing remains saved."
              : state?.connection === "logged_out"
                ? "The linked device was logged out. Re-pair only after confirming the device is no longer linked in WhatsApp."
                : state?.connection === "status_unavailable"
                  ? "Could not retrieve the server status. Try Refresh. Your saved pairing has not been changed."
                  : "Preparing a secure WhatsApp session. Status updates automatically."}
        </div>
      )}

      <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--lv-border-default)" }}>
        <button className="lv-wa-btn lv-wa-btn-danger-soft" data-lv-button="danger" type="button" onClick={onReset} disabled={resetting || !canReset} title={!canReset ? "Reset is unavailable until the linked-device state is confirmed." : "Reset the linked WhatsApp device"} style={{ border: "1px solid #fecaca", color: "var(--lv-danger)", background: "var(--lv-surface-panel)", borderRadius: 9, padding: "9px 12px", cursor: "pointer", fontWeight: 700 }}>
          {resetting ? "Resetting…" : "Reset Pairing"}
        </button>
      </div>
    </section>
  );
}

export default function WhatsAppPage() {
  const [siteState, setSiteState] = useState<PairState | null>(null);
  const [accountRole, setAccountRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [siteError, setSiteError] = useState("");
  const [resetting, setResetting] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [inboxError, setInboxError] = useState("");
  const statusRequestInFlight = useRef(false);

  const selected = useMemo(() => conversations.find((row) => row.id === selectedId) || null, [conversations, selectedId]);
  const unreadTotal = useMemo(() => conversations.reduce((sum, row) => sum + Number(row.unread_count || 0), 0), [conversations]);

  async function loadStatus() {
    // The status endpoint may need to wake a sleeping Render instance. Never
    // start another poll while the previous request is still in flight.
    if (statusRequestInFlight.current) return;
    statusRequestInFlight.current = true;

    const requestStatus = async (url: string, label: string, setState: (value: PairState) => void, setError: (value: string) => void) => {
      try {
        const response = await fetch(url, {
          cache: "no-store",
          credentials: "same-origin",
          signal: AbortSignal.timeout(55_000),
        });
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success) throw new Error(json?.error || `Could not load ${label}.`);
        setState(json.data);
        setError("");
      } catch (err: any) {
        const message = String(err?.message || `Could not load ${label}.`);
        setState({ connection: "status_unavailable", paired: false, qrAvailable: false, lastError: message });
        setError(message);
      }
    };

    try {
      // All client, finance and Site Visit messaging uses one central Admin session.
      await requestStatus("/api/admin/whatsapp", "Admin bot", setSiteState, setSiteError);
    } finally {
      setLoading(false);
      statusRequestInFlight.current = false;
    }
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

  async function resetPairing() {
    if (!confirm("Reset the central Admin WhatsApp linked device? This also disconnects client replies, finance, and Site Visit notifications until it reconnects.")) return;
    setResetting(true);
    try {
      const response = await fetch("/api/admin/whatsapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reset" }) });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw Error(json?.error || "Could not reset pairing.");
      await new Promise((resolve) => setTimeout(resolve, 900));
      await loadStatus();
    } catch (err: any) {
      setSiteError(String(err?.message || err));
    } finally { setResetting(false); }
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
    fetch("/api/account", { credentials: "same-origin", cache: "no-store" })
      .then((response) => response.json())
      .then((json) => setAccountRole(String(json?.data?.role || "").trim().toLowerCase()))
      .catch(() => setAccountRole(""));
    loadStatus(); loadConversations();
    const statusTimer = window.setInterval(loadStatus, 15000);
    const inboxTimer = window.setInterval(loadConversations, 12000);
    return () => { window.clearInterval(statusTimer); window.clearInterval(inboxTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    loadMessages(selectedId);
    const timer = window.setInterval(() => loadMessages(selectedId), 12000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return (
    <main className="lv-wa-page lv-wa-pair-page" style={{ maxWidth: 1240, margin: "0 auto", padding: "32px 20px 60px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--lv-text-muted)" }}>LAND VIEW</div>
          <h1 style={{ margin: "6px 0 8px", fontSize: 30 }}>WhatsApp Center</h1>
          <p style={{ margin: 0, color: "var(--lv-text-muted)", lineHeight: 1.6 }}>{accountRole === "manager" ? "Connect the WhatsApp linked to your Management employee profile for Site Visit group messages. The central EMP-0002 session remains available below for client-facing operations." : "One centralized Admin WhatsApp session powers Admin, EMP-0002, client updates/replies, project finance and Site Visit messaging. Other employees keep their own WhatsApp sessions."}</p>
        </div>
        <button className="lv-wa-btn" data-lv-button="secondary" type="button" onClick={() => { loadStatus(); loadConversations(); }} disabled={loading} style={{ border: "1px solid #cbd5e1", background: "var(--lv-surface-panel)", borderRadius: 10, padding: "10px 14px", cursor: "pointer", fontWeight: 700 }}>
          {loading ? "Checking…" : "Refresh"}
        </button>
      </div>

      {accountRole === "manager" ? (
        <section style={{ marginTop: 24 }}>
          <div style={{ marginBottom: 10 }}>
            <h2 style={{ margin: 0, fontSize: 20 }}>Management WhatsApp Connection</h2>
            <p style={{ margin: "6px 0 0", color: "var(--lv-text-muted)", lineHeight: 1.55 }}>This connection uses the employee ID linked to the Management account, so Site Visit group messages are sent from the Manager&apos;s own WhatsApp session.</p>
          </div>
          <EmployeeWhatsAppConnect />
        </section>
      ) : null}

      <div className="lv-wa-bot-grid" style={{ marginTop: 24, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(360px,1fr))", gap: 18 }}>
        <BotCard title="Admin Bot · EMP-0002" description="Your WhatsApp number. This single session sends Admin and EMP-0002 messages, client project updates/replies, project finance updates and Site Visit announcements." state={siteState} loading={loading} error={siteError} onReset={resetPairing} resetting={resetting} />
      </div>

      <section className="lv-wa-card lv-wa-inbox-card" style={{ marginTop: 22, border: "1px solid var(--lv-border-default)", borderRadius: 16, background: "var(--lv-surface-panel)", overflow: "hidden", boxShadow: "0 8px 30px rgba(15,23,42,.05)" }}>
        <div style={{ padding: "18px 20px", borderBottom: "1px solid var(--lv-border-default)", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20 }}>Client Inbox</h2>
            <div style={{ marginTop: 4, color: "var(--lv-text-muted)", fontSize: 13 }}>{unreadTotal ? `${unreadTotal} unread message${unreadTotal === 1 ? "" : "s"}` : "No unread messages"}</div>
          </div>
          <div style={{ fontSize: 12, color: "var(--lv-text-muted)" }}>Auto-refreshes</div>
        </div>

        {inboxError ? <div className="lv-wa-alert is-danger" role="alert" style={{ margin: 16, padding: 12, borderRadius: 10, background: "#fef2f2", color: "var(--lv-danger)" }}>{inboxError}</div> : null}

        <div className="lv-wa-inbox-grid" style={{ display: "grid", gridTemplateColumns: "minmax(260px,340px) minmax(0,1fr)", minHeight: 520 }}>
          <aside className="lv-wa-conversations" aria-label="Client conversations" style={{ borderRight: "1px solid var(--lv-border-default)", background: "var(--lv-surface-muted)", overflowY: "auto", maxHeight: 680 }}>
            {!conversations.length ? <div style={{ padding: 22, color: "var(--lv-text-muted)", lineHeight: 1.6 }}>No client conversations yet. Once the central Admin number is paired, incoming client messages will appear here.</div> : conversations.map((row) => (
              <button className={`lv-wa-conversation ${row.id === selectedId ? "is-selected" : ""}`} type="button" aria-pressed={row.id === selectedId} key={row.id} onClick={() => setSelectedId(row.id)} style={{ width: "100%", textAlign: "left", border: 0, borderBottom: "1px solid var(--lv-border-default)", padding: "14px 16px", cursor: "pointer", background: row.id === selectedId ? "#fff" : "transparent" }}>
                <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ color: "var(--lv-text-strong)" }}>{row.client_name || row.phone_number || "Unknown client"}</strong>
                  {Number(row.unread_count || 0) > 0 ? <span style={{ minWidth: 22, height: 22, borderRadius: 999, background: "#0f172a", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>{row.unread_count}</span> : null}
                </div>
                <div style={{ marginTop: 5, color: "var(--lv-text-muted)", fontSize: 12 }}>{row.project_code || "Unverified project"} · {row.phone_number || "No phone"}</div>
                <div style={{ marginTop: 4, color: row.human_handoff ? "#92400e" : row.verified_at ? "#166534" : "#64748b", fontSize: 11, fontWeight: 700 }}>{row.human_handoff ? "HUMAN HANDOFF" : row.verified_at ? "VERIFIED" : "UNVERIFIED"}</div>
                <div style={{ marginTop: 4, color: "var(--lv-text-muted)", fontSize: 11 }}>{when(row.last_message_at)}</div>
              </button>
            ))}
          </aside>

          <div className="lv-wa-chat" style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            {!selected ? (
              <div style={{ padding: 28, color: "var(--lv-text-muted)" }}>Select a conversation.</div>
            ) : (
              <>
                <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--lv-border-default)", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <strong>{selected.client_name || selected.phone_number || "Client"}</strong>
                    <div style={{ marginTop: 3, fontSize: 12, color: "var(--lv-text-muted)" }}>{selected.project_code || "Project not verified"} · {selected.phone_number}</div>
                  </div>
                  <button className="lv-wa-btn" data-lv-button="secondary" type="button" onClick={() => setHandoff(!selected.human_handoff)} style={{ border: "1px solid #cbd5e1", background: selected.human_handoff ? "#fef3c7" : "#fff", borderRadius: 9, padding: "8px 11px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
                    {selected.human_handoff ? "Return to Bot" : "Take Over Conversation"}
                  </button>
                </div>

                <div className="lv-wa-messages" style={{ flex: 1, padding: 18, background: "var(--lv-surface-muted)", overflowY: "auto", maxHeight: 500 }}>
                  {!messages.length ? <div style={{ color: "var(--lv-text-muted)" }}>No messages yet.</div> : messages.map((message) => (
                    <div key={message.id} style={{ display: "flex", justifyContent: message.direction === "outbound" ? "flex-end" : "flex-start", marginBottom: 10 }}>
                      <div className={`lv-wa-bubble ${message.direction === "outbound" ? "is-outbound" : "is-inbound"}`} style={{ maxWidth: "78%", borderRadius: 13, padding: "10px 12px", background: message.direction === "outbound" ? "#dcfce7" : "#fff", border: "1px solid var(--lv-border-default)", color: "var(--lv-text-strong)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                        <div>{message.body || `[${message.message_type || "message"}]`}</div>
                        <div style={{ marginTop: 5, fontSize: 10, color: "var(--lv-text-muted)", textAlign: "right" }}>{when(message.sent_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="lv-wa-composer" style={{ padding: 14, borderTop: "1px solid var(--lv-border-default)", display: "flex", gap: 10, alignItems: "flex-end" }}>
                  <textarea className="lv-wa-field lv-wa-reply" aria-label="Reply to selected WhatsApp conversation" value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Reply to this client on WhatsApp…" rows={3} maxLength={4000} style={{ flex: 1, resize: "vertical", minHeight: 70, border: "1px solid #cbd5e1", borderRadius: 10, padding: 11, font: "inherit" }} />
                  <button className="lv-wa-btn lv-wa-send" data-lv-button="primary" type="button" onClick={sendReply} disabled={sending || !reply.trim()} style={{ border: 0, background: "#0f172a", color: "#fff", borderRadius: 10, padding: "11px 16px", fontWeight: 800, cursor: "pointer", opacity: sending || !reply.trim() ? .55 : 1 }}>
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
