"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";

type Tab = "overview" | "log" | "failed" | "rules" | "templates" | "groups";
type MessageRow = {
  id: string;
  queue: "finance" | "site" | "client";
  module: string;
  eventKey: string;
  priority: "critical" | "important" | "routine";
  status: string;
  attempts: number;
  message: string;
  dedupeKey?: string | null;
  recipientGroup?: string | null;
  destination?: string | null;
  clientName?: string | null;
  projectCode?: string | null;
  source?: string | null;
  templateKey?: string | null;
  error?: string | null;
  nextAttemptAt?: string | null;
  createdAt?: string | null;
  sentAt?: string | null;
};
type Rule = {
  event_key: string;
  label: string;
  module: string;
  enabled: boolean;
  priority: "critical" | "important" | "routine";
  recipient_group_slug?: string | null;
  template_key?: string | null;
};
type Template = {
  template_key: string;
  label: string;
  module: string;
  description?: string | null;
  body: string;
  enabled: boolean;
};
type RecipientGroup = {
  slug: string;
  name: string;
  destination_kind: string;
  target?: string | null;
  sender_employee_id?: string | null;
  enabled: boolean;
};
type OpsState = {
  stats: { pending: number; sending: number; queued: number; failed: number; suppressed: number; sentToday: number; retrying: number };
  messages: MessageRow[];
  rules: Rule[];
  templates: Template[];
  groups: RecipientGroup[];
  generatedAt?: string;
};

const card: CSSProperties = { border: "1px solid #e2e8f0", borderRadius: 16, background: "#fff", boxShadow: "0 8px 30px rgba(15,23,42,.05)" };
const button: CSSProperties = { border: "1px solid #cbd5e1", background: "#fff", color: "#334155", borderRadius: 9, padding: "8px 11px", cursor: "pointer", fontWeight: 800, fontSize: 12 };
const redButton: CSSProperties = { ...button, border: "1px solid #dc2626", background: "#dc2626", color: "#fff" };

function when(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString();
}

function StatusBadge({ value }: { value: string }) {
  const key = String(value || "pending").toLowerCase();
  const map: Record<string, { bg: string; color: string; label: string }> = {
    sent: { bg: "#dcfce7", color: "#166534", label: "Sent" },
    pending: { bg: "#fef3c7", color: "#92400e", label: "Queued" },
    sending: { bg: "#dbeafe", color: "#1d4ed8", label: "Sending" },
    failed: { bg: "#fee2e2", color: "#991b1b", label: "Failed" },
    suppressed: { bg: "#f1f5f9", color: "#475569", label: "Suppressed" },
  };
  const state = map[key] || { bg: "#f1f5f9", color: "#475569", label: value || "Unknown" };
  return <span style={{ display: "inline-flex", padding: "5px 8px", borderRadius: 999, background: state.bg, color: state.color, fontSize: 11, fontWeight: 900 }}>{state.label}</span>;
}

function PriorityBadge({ value }: { value: string }) {
  const key = String(value || "routine").toLowerCase();
  const state = key === "critical"
    ? { bg: "#fee2e2", color: "#991b1b" }
    : key === "important"
      ? { bg: "#ffedd5", color: "#9a3412" }
      : { bg: "#f1f5f9", color: "#475569" };
  return <span style={{ display: "inline-flex", padding: "4px 7px", borderRadius: 999, background: state.bg, color: state.color, fontSize: 10, fontWeight: 900, textTransform: "uppercase" }}>{key}</span>;
}

function StatCard({ label, value, detail, danger }: { label: string; value: number | string; detail: string; danger?: boolean }) {
  return (
    <div style={{ ...card, padding: 18, borderColor: danger ? "#fecaca" : "#e2e8f0" }}>
      <div style={{ color: "#64748b", fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</div>
      <div style={{ marginTop: 7, color: danger ? "#b91c1c" : "#0f172a", fontSize: 28, fontWeight: 900 }}>{value}</div>
      <div style={{ marginTop: 5, color: "#64748b", fontSize: 12 }}>{detail}</div>
    </div>
  );
}

export default function WhatsAppOperationsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [ops, setOps] = useState<OpsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [working, setWorking] = useState("");
  const [templateDrafts, setTemplateDrafts] = useState<Record<string, string>>({});
  const [groupDrafts, setGroupDrafts] = useState<Record<string, string>>({});

  async function loadOps(silent = false) {
    if (!silent) setLoading(true);
    try {
      const response = await fetch("/api/admin/whatsapp?mode=ops", { cache: "no-store" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not load WhatsApp operations.");
      const data = json.data as OpsState;
      setOps(data);
      setError("");
      setTemplateDrafts((prev) => {
        const next = { ...prev };
        for (const row of data.templates || []) if (next[row.template_key] === undefined) next[row.template_key] = row.body || "{{message}}";
        return next;
      });
      setGroupDrafts((prev) => {
        const next = { ...prev };
        for (const row of data.groups || []) if (next[row.slug] === undefined) next[row.slug] = row.target || "";
        return next;
      });
    } catch (err: any) {
      setError(String(err?.message || "Could not load WhatsApp operations."));
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function post(action: string, payload: Record<string, unknown> = {}, workKey = action) {
    setWorking(workKey);
    try {
      const response = await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(json?.error || "WhatsApp action failed.");
      await loadOps(true);
      setError("");
      return json.data;
    } catch (err: any) {
      setError(String(err?.message || "WhatsApp action failed."));
      return null;
    } finally {
      setWorking("");
    }
  }

  useEffect(() => {
    loadOps();
    const timer = window.setInterval(() => loadOps(true), 15000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const failed = useMemo(() => (ops?.messages || []).filter((row) => row.status === "failed"), [ops]);
  const recent = useMemo(() => (ops?.messages || []).slice(0, 10), [ops]);

  const tabs: Array<{ key: Tab; label: string; count?: number }> = [
    { key: "overview", label: "Overview" },
    { key: "log", label: "Message Log" },
    { key: "failed", label: "Failed", count: ops?.stats.failed || 0 },
    { key: "rules", label: "Notification Rules" },
    { key: "templates", label: "Templates" },
    { key: "groups", label: "Recipient Groups" },
  ];

  function messageTable(rows: MessageRow[]) {
    return (
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1000 }}>
          <thead>
            <tr style={{ background: "#f8fafc", color: "#64748b", fontSize: 11, textTransform: "uppercase", letterSpacing: ".05em" }}>
              <th style={{ textAlign: "left", padding: "11px 12px" }}>Time</th>
              <th style={{ textAlign: "left", padding: "11px 12px" }}>Module / Event</th>
              <th style={{ textAlign: "left", padding: "11px 12px" }}>Message</th>
              <th style={{ textAlign: "left", padding: "11px 12px" }}>Priority</th>
              <th style={{ textAlign: "left", padding: "11px 12px" }}>Status</th>
              <th style={{ textAlign: "left", padding: "11px 12px" }}>Attempts</th>
              <th style={{ textAlign: "right", padding: "11px 12px" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length ? (
              <tr><td colSpan={7} style={{ padding: 26, textAlign: "center", color: "#64748b" }}>No messages in this view.</td></tr>
            ) : rows.map((row) => (
              <tr key={`${row.queue}:${row.id}`} style={{ borderTop: "1px solid #e2e8f0", verticalAlign: "top" }}>
                <td style={{ padding: 12, color: "#64748b", fontSize: 12, whiteSpace: "nowrap" }}>{when(row.sentAt || row.createdAt)}</td>
                <td style={{ padding: 12 }}>
                  <div style={{ fontWeight: 900, color: "#0f172a", fontSize: 13 }}>{row.module}</div>
                  <div style={{ marginTop: 4, color: "#64748b", fontSize: 11 }}>{row.eventKey}</div>
                  {row.projectCode ? <div style={{ marginTop: 3, color: "#991b1b", fontWeight: 800, fontSize: 11 }}>{row.projectCode}</div> : null}
                </td>
                <td style={{ padding: 12, maxWidth: 430 }}>
                  <div style={{ color: "#334155", fontSize: 12, lineHeight: 1.5, whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 78, overflow: "hidden" }}>{row.message || "—"}</div>
                  {row.error ? <div style={{ marginTop: 6, color: "#b91c1c", fontSize: 11, lineHeight: 1.4 }}>{row.error}</div> : null}
                </td>
                <td style={{ padding: 12 }}><PriorityBadge value={row.priority} /></td>
                <td style={{ padding: 12 }}><StatusBadge value={row.status} /></td>
                <td style={{ padding: 12, fontSize: 12, color: "#475569" }}>{row.attempts}</td>
                <td style={{ padding: 12, textAlign: "right" }}>
                  {row.status === "failed" ? (
                    <button style={button} disabled={working === `retry:${row.queue}:${row.id}`} onClick={() => post("retry", { queue: row.queue, id: row.id }, `retry:${row.queue}:${row.id}`)}>
                      {working === `retry:${row.queue}:${row.id}` ? "Retrying…" : "Retry"}
                    </button>
                  ) : row.status === "pending" && row.attempts > 0 ? <span style={{ color: "#92400e", fontSize: 11, fontWeight: 800 }}>AUTO RETRY</span> : <span style={{ color: "#94a3b8", fontSize: 11 }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <main style={{ maxWidth: 1240, margin: "0 auto", padding: "24px 20px 60px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 900, color: "#b91c1c", letterSpacing: ".12em", textTransform: "uppercase" }}>LAND VIEW · WHATSAPP</div>
          <h1 style={{ margin: "5px 0 7px", fontSize: 30, color: "#0f172a" }}>Operations Center</h1>
          <p style={{ margin: 0, color: "#64748b", lineHeight: 1.6, maxWidth: 760 }}>One control layer for Project Management, Finance, Billing, Site Visit and client WhatsApp delivery. Queue failures no longer need to be hunted down in separate modules.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {ops?.stats.failed ? <button style={redButton} disabled={working === "retry-all"} onClick={() => post("retry_all_failed", {}, "retry-all")}>{working === "retry-all" ? "Retrying…" : `Retry ${ops.stats.failed} Failed`}</button> : null}
          <button style={button} disabled={loading} onClick={() => loadOps()}>{loading ? "Refreshing…" : "Refresh"}</button>
        </div>
      </div>

      {error ? <div style={{ marginTop: 18, border: "1px solid #fecaca", borderRadius: 12, background: "#fef2f2", color: "#991b1b", padding: 13 }}>{error}</div> : null}

      <div style={{ marginTop: 22, display: "flex", gap: 8, overflowX: "auto", paddingBottom: 3 }}>
        {tabs.map((item) => (
          <button key={item.key} onClick={() => setTab(item.key)} style={{ border: tab === item.key ? "1px solid #b91c1c" : "1px solid #e2e8f0", background: tab === item.key ? "#fef2f2" : "#fff", color: tab === item.key ? "#991b1b" : "#475569", borderRadius: 999, padding: "8px 12px", fontWeight: 800, fontSize: 12, whiteSpace: "nowrap", cursor: "pointer" }}>
            {item.label}{item.count ? ` · ${item.count}` : ""}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <>
          <div style={{ marginTop: 18, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
            <StatCard label="Sent Today" value={ops?.stats.sentToday || 0} detail="Delivered across all queues" />
            <StatCard label="In Queue" value={ops?.stats.queued || 0} detail={`${ops?.stats.retrying || 0} currently retrying`} />
            <StatCard label="Failed" value={ops?.stats.failed || 0} detail="Needs admin attention" danger={Boolean(ops?.stats.failed)} />
            <StatCard label="Suppressed" value={ops?.stats.suppressed || 0} detail="Blocked by notification rules" />
          </div>

          <section style={{ ...card, marginTop: 18, overflow: "hidden" }}>
            <div style={{ padding: "16px 18px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div><h2 style={{ margin: 0, fontSize: 18 }}>Recent Delivery Activity</h2><div style={{ marginTop: 4, color: "#64748b", fontSize: 12 }}>Finance, Site Visit and client queues in one timeline.</div></div>
              <button style={button} onClick={() => setTab("log")}>Open Full Log</button>
            </div>
            {messageTable(recent)}
          </section>

          <section style={{ ...card, marginTop: 18, padding: 18 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>How delivery works now</h2>
            <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10 }}>
              {["Event created", "Rule + duplicate check", "Queue", "WhatsApp sender", "Sent / retry / failed", "Activity log"].map((label, index) => (
                <div key={label} style={{ border: "1px solid #e2e8f0", borderRadius: 11, background: "#f8fafc", padding: 12 }}>
                  <div style={{ fontSize: 10, color: "#b91c1c", fontWeight: 900 }}>0{index + 1}</div>
                  <div style={{ marginTop: 4, fontWeight: 800, color: "#0f172a", fontSize: 13 }}>{label}</div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {tab === "log" ? <section style={{ ...card, marginTop: 18, overflow: "hidden" }}>{messageTable(ops?.messages || [])}</section> : null}

      {tab === "failed" ? (
        <section style={{ ...card, marginTop: 18, overflow: "hidden" }}>
          <div style={{ padding: "16px 18px", borderBottom: "1px solid #e2e8f0" }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Failed Messages</h2>
            <p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 12 }}>Automatic retries use exponential backoff. Items shown here exhausted the normal retry policy and can be requeued manually.</p>
          </div>
          {messageTable(failed)}
        </section>
      ) : null}

      {tab === "rules" ? (
        <section style={{ ...card, marginTop: 18, overflow: "hidden" }}>
          <div style={{ padding: "16px 18px", borderBottom: "1px solid #e2e8f0" }}><h2 style={{ margin: 0, fontSize: 18 }}>Notification Rules</h2><p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 12 }}>Turn event types on/off and set delivery priority. Disabled events are recorded as suppressed and are never handed to WhatsApp.</p></div>
          <div>
            {(ops?.rules || []).map((row) => (
              <div key={row.event_key} style={{ padding: "14px 18px", borderTop: "1px solid #e2e8f0", display: "grid", gridTemplateColumns: "minmax(220px,1fr) 160px 160px", gap: 14, alignItems: "center" }}>
                <div><div style={{ fontWeight: 900, color: "#0f172a" }}>{row.label}</div><div style={{ marginTop: 4, color: "#64748b", fontSize: 11 }}>{row.module} · {row.event_key} · {row.recipient_group_slug || "default recipient"}</div></div>
                <select value={row.priority} disabled={working === `rule:${row.event_key}`} onChange={(event) => post("update_rule", { eventKey: row.event_key, priority: event.target.value }, `rule:${row.event_key}`)} style={{ border: "1px solid #cbd5e1", borderRadius: 9, padding: 9, background: "#fff" }}>
                  <option value="critical">Critical</option><option value="important">Important</option><option value="routine">Routine</option>
                </select>
                <label style={{ display: "flex", gap: 9, alignItems: "center", justifyContent: "flex-end", fontSize: 12, fontWeight: 800, color: row.enabled ? "#166534" : "#991b1b" }}>
                  <input type="checkbox" checked={row.enabled} disabled={working === `rule:${row.event_key}`} onChange={(event) => post("update_rule", { eventKey: row.event_key, enabled: event.target.checked }, `rule:${row.event_key}`)} />
                  {row.enabled ? "Enabled" : "Disabled"}
                </label>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "templates" ? (
        <div style={{ marginTop: 18, display: "grid", gap: 14 }}>
          <div style={{ ...card, padding: 16, background: "#fff7ed", borderColor: "#fed7aa", color: "#9a3412", fontSize: 12, lineHeight: 1.6 }}><strong>Live wrapper templates.</strong> Keep <code>{"{{message}}"}</code> in the template. LAND VIEW injects the event-specific finance/site/client content at that position, so you can safely add a short header or footer without rebuilding each formatter.</div>
          {(ops?.templates || []).map((row) => {
            const draft = templateDrafts[row.template_key] ?? row.body;
            const valid = draft.includes("{{message}}");
            return (
              <section key={row.template_key} style={{ ...card, padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div><h3 style={{ margin: 0, fontSize: 16 }}>{row.label}</h3><div style={{ marginTop: 4, color: "#64748b", fontSize: 11 }}>{row.module} · {row.template_key}</div></div>
                  <StatusBadge value={row.enabled ? "sent" : "suppressed"} />
                </div>
                <textarea value={draft} onChange={(event) => setTemplateDrafts((prev) => ({ ...prev, [row.template_key]: event.target.value }))} rows={5} maxLength={4000} style={{ width: "100%", boxSizing: "border-box", marginTop: 12, border: valid ? "1px solid #cbd5e1" : "1px solid #ef4444", borderRadius: 10, padding: 11, resize: "vertical", font: "inherit", lineHeight: 1.5 }} />
                <div style={{ marginTop: 9, display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                  <span style={{ color: valid ? "#64748b" : "#b91c1c", fontSize: 11 }}>{valid ? "Ready — event content will be injected at {{message}}." : "Template must contain {{message}}."}</span>
                  <button style={redButton} disabled={!valid || working === `template:${row.template_key}`} onClick={() => post("update_template", { templateKey: row.template_key, body: draft }, `template:${row.template_key}`)}>{working === `template:${row.template_key}` ? "Saving…" : "Save Template"}</button>
                </div>
              </section>
            );
          })}
        </div>
      ) : null}

      {tab === "groups" ? (
        <section style={{ ...card, marginTop: 18, overflow: "hidden" }}>
          <div style={{ padding: "16px 18px", borderBottom: "1px solid #e2e8f0" }}><h2 style={{ margin: 0, fontSize: 18 }}>Recipient Groups</h2><p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 12 }}>Static LAND VIEW destinations are managed here. Project and client destinations stay dynamic and continue using each project/client record.</p></div>
          {(ops?.groups || []).map((row) => {
            const editable = row.destination_kind === "group";
            return (
              <div key={row.slug} style={{ padding: "14px 18px", borderTop: "1px solid #e2e8f0", display: "grid", gridTemplateColumns: "minmax(220px,.8fr) minmax(260px,1.3fr) 120px", gap: 14, alignItems: "center" }}>
                <div><div style={{ fontWeight: 900 }}>{row.name}</div><div style={{ marginTop: 4, color: "#64748b", fontSize: 11 }}>{row.slug} · {row.destination_kind} · sender {row.sender_employee_id || "default"}</div></div>
                <input value={editable ? (groupDrafts[row.slug] ?? row.target ?? "") : "Resolved from project/client"} disabled={!editable} onChange={(event) => setGroupDrafts((prev) => ({ ...prev, [row.slug]: event.target.value }))} style={{ border: "1px solid #cbd5e1", borderRadius: 9, padding: 9, background: editable ? "#fff" : "#f8fafc", color: editable ? "#0f172a" : "#94a3b8" }} />
                {editable ? <button style={button} disabled={working === `group:${row.slug}`} onClick={() => post("update_group", { slug: row.slug, target: groupDrafts[row.slug] ?? row.target ?? "" }, `group:${row.slug}`)}>{working === `group:${row.slug}` ? "Saving…" : "Save"}</button> : <span style={{ color: "#166534", fontWeight: 800, fontSize: 11, textAlign: "right" }}>DYNAMIC</span>}
              </div>
            );
          })}
        </section>
      ) : null}

      <div style={{ marginTop: 16, color: "#94a3b8", fontSize: 11, textAlign: "right" }}>{ops?.generatedAt ? `Last refreshed ${when(ops.generatedAt)}` : ""}</div>
    </main>
  );
}
