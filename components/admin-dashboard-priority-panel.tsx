"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

type Row = Record<string, unknown>;
type Severity = "critical" | "warning" | "info";
type ActionAlert = {
  alert_key?: string;
  category?: string;
  severity?: Severity;
  title?: string;
  detail?: string;
  entity_type?: string | null;
  status?: string;
  metadata?: Row;
};
type Brief = {
  actionCenter?: {
    counts?: { total?: number; critical?: number; warning?: number; info?: number };
    alerts?: ActionAlert[];
  };
};

const text = (value: unknown) => String(value ?? "").trim();
const num = (value: unknown) => {
  const parsed = Number(String(value ?? 0).replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value: unknown) => `৳ ${num(value).toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
const rank = (severity?: string) => severity === "critical" ? 0 : severity === "warning" ? 1 : 2;

function areaMeta(value: unknown) {
  const category = text(value).toLowerCase();
  if (category.includes("finance") || category.includes("account") || category.includes("billing")) return { key: "finance", label: "Finance", icon: "৳" };
  if (category.includes("delivery") || category.includes("project") || category.includes("supervision") || category.includes("site")) return { key: "delivery", label: "Project Delivery", icon: "▣" };
  if (category.includes("communication") || category.includes("whatsapp") || category.includes("message")) return { key: "communications", label: "Communications", icon: "●" };
  if (category.includes("client") || category.includes("lead") || category.includes("follow")) return { key: "clients", label: "CRM", icon: "◎" };
  if (category.includes("workforce") || category.includes("employee") || category.includes("staff")) return { key: "workforce", label: "Team", icon: "♙" };
  if (category.includes("workflow")) return { key: "workflow", label: "Workflow", icon: "↗" };
  return { key: category || "operations", label: category ? category.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Operations", icon: "!" };
}

function alertDomId(value: unknown) {
  return `alert-${text(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

function affected(alert: ActionAlert) {
  const meta = alert.metadata || {};
  const count = Math.max(0, num(meta.count ?? meta.groups));
  const entity = text(alert.entity_type).toLowerCase();
  const amount = num(meta.amount);
  if (entity === "payment") return `${count || "—"} payment${count === 1 ? "" : "s"}${amount ? ` · ${money(amount)}` : ""}`;
  if (entity === "account") return `${count || "—"} account${count === 1 ? "" : "s"}`;
  if (entity === "bill") return `${count || "—"} bill${count === 1 ? "" : "s"}`;
  if (entity === "project") return `${count || "—"} project${count === 1 ? "" : "s"}`;
  if (entity === "whatsapp_outbox") return `${count || "—"} message${count === 1 ? "" : "s"}`;
  if (entity === "task") return `${count || "—"} task${count === 1 ? "" : "s"}`;
  if (entity === "proposal") return `${count || "—"} proposal${count === 1 ? "" : "s"}`;
  if (entity === "transaction") return `${count || num(meta.extraRows) || "—"} duplicate group${count === 1 ? "" : "s"}`;
  return count ? `${count} affected` : "Review details";
}

export default function AdminDashboardPriorityPanel() {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/daily-brief", { credentials: "same-origin", cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(String(payload?.error || "Could not load priority work."));
      setBrief(payload.data || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load priority work.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let replacement: HTMLElement | null = null;
    let legacy: HTMLElement | null = null;

    const attach = () => {
      if (replacement) return true;
      legacy = document.querySelector<HTMLElement>(".lv2-priority-grid");
      if (!legacy || !legacy.parentElement) return false;
      replacement = document.createElement("div");
      replacement.className = "lv3-priority-mount";
      legacy.insertAdjacentElement("afterend", replacement);
      legacy.style.display = "none";
      setMountNode(replacement);
      return true;
    };

    if (!attach()) {
      const observer = new MutationObserver(() => {
        if (attach()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      return () => observer.disconnect();
    }

    return () => {
      if (legacy) legacy.style.display = "";
      replacement?.remove();
    };
  }, []);

  const activeAlerts = useMemo(() => (brief?.actionCenter?.alerts || [])
    .filter((item) => !["resolved", "dismissed"].includes(text(item.status).toLowerCase()))
    .sort((a, b) => rank(a.severity) - rank(b.severity)), [brief?.actionCenter?.alerts]);

  const priority = useMemo(() => activeAlerts.slice(0, 6).map((alert, index) => ({
    id: alert.alert_key || `alert-${index}`,
    severity: alert.severity || "info" as Severity,
    area: areaMeta(alert.category || alert.entity_type).label,
    issue: alert.title || "Review action",
    affected: affected(alert),
    detail: alert.detail || "",
    href: alert.alert_key ? `/admin/action-center#${alertDomId(alert.alert_key)}` : "/admin/action-center",
  })), [activeAlerts]);

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; icon: string; count: number; severity: Severity }>();
    for (const alert of activeAlerts) {
      const area = areaMeta(alert.category || alert.entity_type);
      const severity = (alert.severity || "info") as Severity;
      const current = map.get(area.key);
      if (!current) map.set(area.key, { ...area, count: 1, severity });
      else {
        current.count += 1;
        if (rank(severity) < rank(current.severity)) current.severity = severity;
      }
    }
    return [...map.values()].sort((a, b) => rank(a.severity) - rank(b.severity) || b.count - a.count);
  }, [activeAlerts]);

  if (!mountNode) return null;

  return createPortal(
    <div className="lv3-priority-grid">
      <style>{`
        .lv3-priority-grid{display:grid;grid-template-columns:minmax(0,1.9fr) minmax(280px,.72fr);gap:14px;margin-bottom:14px;color:var(--lv-text-primary,#171c24)}
        .lv3-priority-grid *{box-sizing:border-box}.lv3-priority-grid a{text-decoration:none}
        .lv3-card{border:1px solid var(--lv-border-default,#e4e7eb);border-radius:16px;background:var(--lv-surface-panel,#fff);box-shadow:var(--lv-shadow-sm,0 8px 24px rgba(30,36,43,.04));overflow:hidden}
        .lv3-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 16px}.lv3-title h2{margin:0;color:var(--lv-text-strong,#191e25)!important;font-size:15px}.lv3-title p{margin:4px 0 0;color:var(--lv-text-muted,#808995)!important;font-size:9.5px}.lv3-badge{display:inline-grid;place-items:center;min-width:24px;height:20px;margin-left:5px;padding:0 7px;border-radius:999px;background:var(--lv-danger-primary,#d71920);color:#fff;font-size:9px;vertical-align:1px}.lv3-all{color:var(--lv-brand-text,#c4141b);font-size:9.5px;font-weight:900;white-space:nowrap}
        .lv3-table{padding:0 14px 12px;overflow-x:auto}.lv3-table-head,.lv3-row{display:grid;grid-template-columns:88px 118px minmax(230px,1.5fr) minmax(150px,.8fr) 74px;gap:10px;align-items:center;min-width:690px}.lv3-table-head{min-height:34px;padding:0 10px;border-radius:8px;background:var(--lv-surface-muted,#f5f6f8);color:var(--lv-text-muted,#737c87);font-size:8.5px;font-weight:900}.lv3-row{min-height:54px;padding:8px 10px;border-bottom:1px solid var(--lv-border-default,#eceef1);color:var(--lv-text-primary,#303740)}.lv3-row:last-child{border-bottom:0}.lv3-row:hover{background:var(--lv-action-primary-soft,#fff9f9)}.lv3-row>span{min-width:0;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lv3-issue{font-weight:850;color:var(--lv-text-strong,#343a42)}.lv3-affected{color:var(--lv-text-secondary,#5e6772);font-weight:750}.lv3-open{justify-self:end;color:var(--lv-brand-text,#c4141b);font-size:9px;font-weight:900}.lv3-pill{display:inline-flex!important;align-items:center;gap:6px;width:max-content;max-width:100%;padding:5px 8px;border-radius:8px;background:var(--lv-danger-soft,#fff0f1);color:var(--lv-danger-primary,#cb151c)!important;font-size:9px!important;font-weight:900}.lv3-pill::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--lv-danger-primary,#d71920)}.lv3-row.warning .lv3-pill{background:var(--lv-warning-soft,#fff4eb);color:var(--lv-warning,#d8600b)!important}.lv3-row.warning .lv3-pill::before{background:var(--lv-warning,#f07a21)}.lv3-row.info .lv3-pill{background:var(--lv-info-soft,#eef5ff);color:var(--lv-info,#2d68ad)!important}.lv3-row.info .lv3-pill::before{background:var(--lv-info,#3677b8)}
        .lv3-groups{display:grid;gap:8px;padding:0 14px 14px}.lv3-group{min-height:46px;display:grid;grid-template-columns:34px minmax(0,1fr) 30px 16px;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;background:var(--lv-danger-soft,#fff2f3);color:var(--lv-text-primary,#303740)}.lv3-group.warning{background:var(--lv-warning-soft,#fff7ec)}.lv3-group.info{background:var(--lv-info-soft,#eef6ff)}.lv3-icon{width:30px;height:30px;display:grid;place-items:center;border-radius:9px;background:color-mix(in srgb,var(--lv-danger-primary,#d71920) 13%,var(--lv-surface-panel,#fff));color:var(--lv-danger-primary,#d71920);font-size:11px;font-weight:900}.lv3-group strong{color:var(--lv-text-strong,#333a43)!important;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.lv3-count{display:grid;place-items:center;min-width:25px;height:24px;padding:0 6px;border-radius:999px;background:color-mix(in srgb,var(--lv-surface-panel,#fff) 82%,transparent);font-size:9px;font-weight:900;color:var(--lv-text-strong,#333a43)}.lv3-arrow{color:var(--lv-text-muted,#8d949d);font-size:14px}.lv3-empty,.lv3-error{padding:26px 18px;color:var(--lv-text-muted,#818995);font-size:10px}.lv3-error{color:var(--lv-danger-primary,#d71920)}
        html[data-theme="dark"] .lv3-card{background:var(--lv-surface-panel,#11151a)}
        @media(max-width:980px){.lv3-priority-grid{grid-template-columns:1fr}}@media(max-width:560px){.lv3-table,.lv3-groups{padding-left:10px;padding-right:10px}.lv3-head{padding:13px 12px}}
      `}</style>

      <section className="lv3-card">
        <div className="lv3-head">
          <div className="lv3-title"><h2>Priority Works <span className="lv3-badge">{activeAlerts.length}</span></h2><p>Highest-priority live issues with the affected records clearly identified.</p></div>
          <Link href="/admin/action-center" className="lv3-all">Action Center →</Link>
        </div>
        <div className="lv3-table">
          <div className="lv3-table-head" aria-hidden="true"><span>Priority</span><span>Area</span><span>Issue</span><span>Affected</span><span>Action</span></div>
          {error ? <div className="lv3-error">{error}</div> : loading && !brief ? <div className="lv3-empty">Checking organization health…</div> : priority.length ? priority.map((item) => (
            <div className={`lv3-row ${item.severity}`} key={item.id} title={item.detail}>
              <span className="lv3-pill">{item.severity === "critical" ? "Urgent" : item.severity === "warning" ? "High" : "Normal"}</span>
              <span>{item.area}</span>
              <span className="lv3-issue">{item.issue}</span>
              <span className="lv3-affected">{item.affected}</span>
              <Link className="lv3-open" href={item.href}>Review →</Link>
            </div>
          )) : <div className="lv3-empty">No priority work is waiting right now.</div>}
        </div>
      </section>

      <section className="lv3-card">
        <div className="lv3-head"><div className="lv3-title"><h2>Needs Attention <span className="lv3-badge">{activeAlerts.length}</span></h2><p>Open alerts grouped by operational area.</p></div></div>
        <div className="lv3-groups">
          {groups.length ? groups.map((group) => <Link href="/admin/action-center" className={`lv3-group ${group.severity}`} key={group.key}>
            <span className="lv3-icon">{group.icon}</span><strong>{group.label}</strong><span className="lv3-count">{group.count}</span><span className="lv3-arrow">›</span>
          </Link>) : <div className="lv3-empty">Everything is clear at the moment.</div>}
        </div>
      </section>
    </div>,
    mountNode,
  );
}
