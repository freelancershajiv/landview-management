"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import EmployeeWhatsAppConnect from "@/components/employee-whatsapp-connect";

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
    <section className="lv-wa-card lv-wa-bot-card" style={{ border: "1px solid var(--lv-border-default)", borderRadius: 16, background: "var(--lv-surface-panel)", padding: 22, boxShadow: "0 8px 30px rgba(15,23,42,.05)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>{title}</h2>
          <p style={{ margin: "7px 0 0", color: "var(--lv-text-muted)", lineHeight: 1.55 }}>{description}</p>
        </div>
        <span className={`lv-wa-badge ${state?.paired ? "is-success" : state?.qrAvailable ? "is-warning" : "is-muted"}`} style={{ padding: "7px 11px", borderRadius: 999, fontSize: 12, fontWeight: 800, whiteSpace: "nowrap", background: state?.paired ? "#dcfce7" : state?.qrAvailable ? "#fef3c7" : "#e2e8f0", color: state?.paired ? "#166534" : state?.qrAvailable ? "#92400e" : "#334155" }}>
          {state?.paired ? "READY" : state?.qrAvailable ? "PAIR NOW" : "STARTING"}
        </span>
      </div>

      <div style={{ marginTop: 18, fontSize: 13, color: "var(--lv-text-muted)" }}>Connection Status</div>
      <div style={{ marginTop: 3, fontSize: 20, fontWeight: 800 }}>{label}</div>

      {error ? <div className="lv-wa-alert is-danger" role="alert" style={{ marginTop: 15, padding: 12, borderRadius: 10, background: "#fef2f2", color: "var(--lv-danger)" }}>{error}</div> : null}

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
        <div className="lv-wa-alert is-muted" style={{ marginTop: 18, padding: 14, borderRadius: 12, background: "var(--lv-surface-muted)", color: "var(--lv-text-secondary)" }}>Preparing a secure pairing session. This page refreshes automatically.</div>
      )}

      <details className="lv-wa-v2-repair">
        <summary>Advanced connection troubleshooting</summary>
        <p>Only reset the linked device when connecting normally has failed. You will need to scan a new QR code.</p>
        <button className="lv-wa-btn lv-wa-btn-danger-soft" data-lv-button="danger" type="button" onClick={onReset} disabled={resetting}>
          {resetting ? "Resetting…" : "Reset pairing"}
        </button>
      </details>
    </section>
  );
}

export default function WhatsAppPage() {
  const [siteState, setSiteState] = useState<PairState | null>(null);
  const [accountRole, setAccountRole] = useState("");
  const [loading, setLoading] = useState(true);
  const [siteError, setSiteError] = useState("");
  const [resetting, setResetting] = useState<"site" | "client" | "">("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [inboxError, setInboxError] = useState("");
  const statusRequestInFlight = useRef(false);
  const activeConversationRef = useRef("");
  const [view, setView] = useState<"inbox" | "connection">("inbox");
  const [conversationQuery, setConversationQuery] = useState("");
  const [conversationFilter, setConversationFilter] = useState<"all" | "unread" | "handoff">("all");
  const [deliveryStats, setDeliveryStats] = useState<{ sentToday: number; queued: number; failed: number } | null>(null);

  const selected = useMemo(() => conversations.find((row) => row.id === selectedId) || null, [conversations, selectedId]);
  const unreadTotal = useMemo(() => conversations.reduce((sum, row) => sum + Number(row.unread_count || 0), 0), [conversations]);
  const visibleConversations = useMemo(() => conversations.filter((row) => {
    if (conversationFilter === "unread" && !Number(row.unread_count || 0)) return false;
    if (conversationFilter === "handoff" && !row.human_handoff) return false;
    const query = conversationQuery.trim().toLowerCase();
    return !query || [row.client_name, row.phone_number, row.project_code]
      .some((value) => String(value || "").toLowerCase().includes(query));
  }), [conversations, conversationFilter, conversationQuery]);

  async function loadDeliveryStats() {
    try {
      const response = await fetch("/api/admin/whatsapp?mode=ops", { cache: "no-store", credentials: "same-origin" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success || !json.data?.stats) throw new Error("Delivery summary unavailable");
      const stats = json.data.stats;
      setDeliveryStats({ sentToday: Number(stats.sentToday || 0), queued: Number(stats.queued || 0), failed: Number(stats.failed || 0) });
    } catch {
      setDeliveryStats(null);
    }
  }

  async function loadStatus() {
    // The status endpoint may need to wake a sleeping Render instance. Never
    // start another poll while the previous request is still in flight.
    if (statusRequestInFlight.current) return;
    statusRequestInFlight.current = true;
    if (!siteState) setLoading(true);

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
        setError(String(err?.message || `Could not load ${label}.`));
      }
    };

    try {
      // Shared Admin/EMP-0002 session is the sole pairing state.
      await requestStatus("/api/admin/whatsapp", "Admin WhatsApp", setSiteState, setSiteError);
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
      setSelectedId((current) => current || rows[0]?.id || "");
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
      if (activeConversationRef.current !== id) return;
      setMessages(Array.isArray(json.data) ? json.data : []);
      setInboxError("");
      setConversations((rows) => rows.map((row) => row.id === id ? { ...row, unread_count: 0 } : row));
    } catch (err: any) {
      if (activeConversationRef.current === id) setInboxError(String(err?.message || "Could not load messages."));
    }
  }

  async function resetPairing(which: "site" | "client") {
    const name = which === "site" ? "central Admin bot" : "central Admin bot";
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
      setSiteError(String(err?.message || err));
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
    fetch("/api/account", { credentials: "same-origin", cache: "no-store" })
      .then((response) => response.json())
      .then((json) => setAccountRole(String(json?.data?.role || "").trim().toLowerCase()))
      .catch(() => setAccountRole(""));
    loadStatus(); loadConversations(); loadDeliveryStats();
    const statusTimer = window.setInterval(loadStatus, 15000);
    const inboxTimer = window.setInterval(loadConversations, 15000);
    const deliveryTimer = window.setInterval(loadDeliveryStats, 60000);
    return () => { window.clearInterval(statusTimer); window.clearInterval(inboxTimer); window.clearInterval(deliveryTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    activeConversationRef.current = selectedId;
    setMessages([]);
    if (!selectedId) return;
    loadMessages(selectedId);
    const timer = window.setInterval(() => loadMessages(selectedId), 6000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  return (
    <main className="lv-wa-page lv-wa-pair-page lv-wa-v2-home">
      <header className="lv-wa-v2-hero">
        <div>
          <span className="lv-wa-v2-eyebrow">LAND VIEW / COMMUNICATIONS</span>
          <h1>WhatsApp workspace</h1>
          <p>Read client messages, check the phone connection, and resolve delivery issues from one place.</p>
        </div>
        <div className="lv-wa-v2-actions">
          <button className="lv-wa-btn" type="button" data-lv-button="secondary" disabled={loading}
            onClick={() => { void loadStatus(); void loadConversations(); void loadDeliveryStats(); }}>
            {loading ? "Checking…" : "Refresh status"}
          </button>
          <Link className="lv-wa-v2-action-link" href="/admin/whatsapp/operations">Delivery center <span aria-hidden="true">↗</span></Link>
        </div>
      </header>

      <section className="lv-wa-v2-summary" aria-label="WhatsApp at a glance">
        <button type="button" className={"lv-wa-v2-metric" + (siteError ? " is-danger" : siteState?.paired ? " is-success" : " is-warning")} onClick={() => setView("connection")}>
          <span>Phone connection</span>
          <strong>{siteError ? "Check needed" : statusText(siteState, loading)}</strong>
          <small>{siteError ? "Open to inspect the error" : siteState?.paired ? "WhatsApp connected" : "Open to connect or troubleshoot"}</small>
        </button>
        <button type="button" className={"lv-wa-v2-metric" + (unreadTotal ? " is-attention" : "")} onClick={() => { setConversationFilter("unread"); setView("inbox"); }}>
          <span>Unread conversations</span>
          <strong>{inboxError ? "—" : unreadTotal}</strong>
          <small>{inboxError ? "Inbox connection needs attention" : unreadTotal ? "Open unread clients" : "No unread messages"}</small>
        </button>
        <Link className={"lv-wa-v2-metric" + (deliveryStats?.failed ? " is-danger" : "")} href="/admin/whatsapp/operations?tab=failed">
          <span>Failed deliveries</span>
          <strong>{deliveryStats ? deliveryStats.failed : "—"}</strong>
          <small>{deliveryStats ? deliveryStats.failed ? "Review failed messages" : "No failures reported" : "Delivery data unavailable"}</small>
        </Link>
        <Link className="lv-wa-v2-metric" href="/admin/whatsapp/operations?tab=log">
          <span>Queued messages</span>
          <strong>{deliveryStats ? deliveryStats.queued : "—"}</strong>
          <small>{deliveryStats ? deliveryStats.sentToday + " sent today" : "Open delivery history"}</small>
        </Link>
      </section>

      <div className="lv-wa-v2-section-tabs" role="group" aria-label="Workspace views">
        <button type="button" aria-pressed={view === "inbox"} className={view === "inbox" ? "is-active" : ""} onClick={() => setView("inbox")}>
          <span aria-hidden="true">✉</span> Client inbox {unreadTotal > 0 && <b>{unreadTotal}</b>}
        </button>
        <button type="button" aria-pressed={view === "connection"} className={view === "connection" ? "is-active" : ""} onClick={() => setView("connection")}>
          <span aria-hidden="true">▣</span> Phone & pairing {siteError && <b>!</b>}
        </button>
      </div>

      {view === "inbox" ? (
        <section className="lv-wa-card lv-wa-inbox-card lv-wa-v2-inbox" aria-label="Client inbox">
          <div className="lv-wa-v2-panel-header">
            <div><h2>Client conversations</h2><p>{conversations.length} conversations · {unreadTotal} unread · replies use the existing linked phone</p></div>
            <span className="lv-wa-v2-auto-refresh">Auto-refreshing</span>
          </div>
          {inboxError && <div className="lv-wa-alert is-danger" role="alert">{inboxError}</div>}
          <div className="lv-wa-inbox-grid lv-wa-v2-inbox-grid">
            <aside className="lv-wa-conversations lv-wa-v2-contact-list" aria-label="Client conversations">
              <div className="lv-wa-v2-contact-tools">
                <input type="search" className="lv-wa-v2-search" aria-label="Search client conversations" placeholder="Search client, file ID or number" value={conversationQuery} onChange={(event) => setConversationQuery(event.target.value)} />
                <div className="lv-wa-v2-contact-filters" aria-label="Conversation filters">
                  {(["all", "unread", "handoff"] as const).map((filter) => (
                    <button type="button" key={filter} aria-pressed={conversationFilter === filter} className={conversationFilter === filter ? "is-active" : ""} onClick={() => setConversationFilter(filter)}>
                      {filter === "all" ? "All" : filter === "unread" ? "Unread" : "Human replies"}
                    </button>
                  ))}
                </div>
              </div>
              {!visibleConversations.length ? (
                <div className="lv-wa-v2-empty">
                  {conversations.length ? "No conversations match this filter." : "No conversations yet. New client messages will appear here after WhatsApp is connected."}
                  {!!conversations.length && <button className="lv-wa-v2-clear" type="button" onClick={() => { setConversationFilter("all"); setConversationQuery(""); }}>Clear filters</button>}
                </div>
              ) : visibleConversations.map((row) => (
                <button className={"lv-wa-conversation lv-wa-v2-contact" + (row.id === selectedId ? " is-selected" : "")} key={row.id} type="button" aria-pressed={row.id === selectedId} onClick={() => setSelectedId(row.id)}>
                  <span className="lv-wa-v2-avatar" aria-hidden="true">{String(row.client_name || row.phone_number || "?").trim().slice(0,1).toUpperCase()}</span>
                  <span className="lv-wa-v2-contact-text">
                    <span className="lv-wa-v2-contact-title"><strong>{row.client_name || row.phone_number || "Unknown client"}</strong>{Number(row.unread_count || 0) > 0 && <b className="lv-wa-v2-unread">{row.unread_count}</b>}</span>
                    <small>{row.project_code || "Unverified project"} · {row.phone_number || "No phone"}</small>
                    <span className={row.human_handoff ? "lv-wa-v2-contact-state is-handoff" : row.verified_at ? "lv-wa-v2-contact-state is-verified" : "lv-wa-v2-contact-state"}>
                      {row.human_handoff ? "Human reply active" : row.verified_at ? "Verified client" : "Not verified"}
                    </span>
                  </span>
                </button>
              ))}
            </aside>
            <div className="lv-wa-chat lv-wa-v2-chat">
              {!selected ? (
                <div className="lv-wa-v2-empty lv-wa-v2-chat-placeholder"><strong>Choose a conversation</strong><span>Client messages and reply controls will appear here.</span></div>
              ) : (
                <>
                  <div className="lv-wa-v2-chat-header">
                    <div><strong>{selected.client_name || selected.phone_number || "Client"}</strong><small>{selected.project_code || "Project not verified"} · {selected.phone_number}</small></div>
                    <button className="lv-wa-btn" data-lv-button="secondary" type="button" onClick={() => void setHandoff(!selected.human_handoff)}>
                      {selected.human_handoff ? "Return to bot" : "Take over reply"}
                    </button>
                  </div>
                  <div className="lv-wa-messages lv-wa-v2-message-list" role="log" aria-label="Conversation messages">
                    {!messages.length ? <div className="lv-wa-v2-empty">No messages here yet.</div> : messages.map((message) => (
                      <div key={message.id} className={"lv-wa-v2-message-row" + (message.direction === "outbound" ? " is-outbound" : "")}>
                        <div className={"lv-wa-bubble lv-wa-v2-message" + (message.direction === "outbound" ? " is-outbound" : " is-inbound")}>
                          <span>{message.body || "[" + (message.message_type || "message") + "]"}</span><small>{when(message.sent_at)}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                  <form className="lv-wa-composer lv-wa-v2-composer" onSubmit={(event) => { event.preventDefault(); void sendReply(); }}>
                    <label htmlFor="lv-wa-v2-reply">Reply to {selected.client_name || selected.phone_number || "client"}</label>
                    <textarea id="lv-wa-v2-reply" className="lv-wa-field lv-wa-reply" value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Write a WhatsApp reply…" rows={3} maxLength={4000} />
                    <button className="lv-wa-btn lv-wa-send" type="submit" data-lv-button="primary" disabled={sending || !reply.trim()}>{sending ? "Sending…" : "Send reply"}</button>
                  </form>
                </>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="lv-wa-v2-connection" aria-label="Phone connection settings">
          <div className="lv-wa-v2-panel-header">
            <div><h2>Phone & pairing</h2><p>Use the existing WhatsApp number. A QR scan is only needed when connecting or repairing the session.</p></div>
            <Link className="lv-wa-v2-action-link" href="/admin/whatsapp/operations">View delivery health</Link>
          </div>
          {accountRole === "manager" && <div className="lv-wa-v2-manager-connect"><h3>Management personal connection</h3><p>Site Visit group messages use the Management account's linked WhatsApp session.</p><EmployeeWhatsAppConnect /></div>}
          <BotCard title="Admin / EMP-0002 WhatsApp" description="The current central connection sends client updates and replies, project finance notifications, and Site Visit announcements." state={siteState} loading={loading} error={siteError} onReset={() => resetPairing("site")} resetting={resetting === "site"} />
          <div className="lv-wa-v2-guidance"><strong>Reset only when needed</strong><p>Resetting signs out the linked device and requires another QR scan. Your finance records and message history are not changed by this screen.</p></div>
        </section>
      )}
    </main>
  );
}
