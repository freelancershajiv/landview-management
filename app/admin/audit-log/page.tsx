import Link from "next/link";
import { requirePortalSession } from "@/lib/server-auth";
import { selectRows } from "@/lib/supabase-data";
import styles from "./audit-log.module.css";

type Row = Record<string, any>;

type SearchParams = Promise<{
  action?: string;
  entity?: string;
  actor?: string;
  outcome?: string;
}>;

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function pretty(value: unknown) {
  if (value === null || value === undefined) return "—";
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function dhakaDate(value: unknown) {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-BD", {
    timeZone: "Asia/Dhaka",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default async function AuditLogPage({ searchParams }: { searchParams: SearchParams }) {
  await requirePortalSession(["admin"]);
  const params = await searchParams;
  const actionFilter = text(params.action, 180);
  const entityFilter = text(params.entity, 120);
  const actorFilter = text(params.actor, 200);
  const outcomeFilter = text(params.outcome, 40);

  const rows = await selectRows("app_audit_log", { order: "created_at:desc", limit: 500 });
  const filtered = rows.filter((row: Row) => {
    if (actionFilter && !text(row.action).toLowerCase().includes(actionFilter.toLowerCase())) return false;
    if (entityFilter && !text(row.entity_type).toLowerCase().includes(entityFilter.toLowerCase())) return false;
    if (actorFilter) {
      const haystack = `${text(row.actor_user_key)} ${text(row.actor_name)} ${text(row.actor_role)}`.toLowerCase();
      if (!haystack.includes(actorFilter.toLowerCase())) return false;
    }
    if (outcomeFilter && text(row.outcome).toLowerCase() !== outcomeFilter.toLowerCase()) return false;
    return true;
  });

  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const todayCount = rows.filter((row: Row) => {
    const date = new Date(String(row.created_at || ""));
    if (Number.isNaN(date.getTime())) return false;
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(date) === todayKey;
  }).length;
  const failedCount = rows.filter((row: Row) => ["failure", "denied", "warning"].includes(text(row.outcome).toLowerCase())).length;

  return <main className={styles.page}>
    <section className={styles.hero}>
      <div>
        <span className={styles.kicker}>LAND VIEW / DATA INTEGRITY</span>
        <h1>Audit Log</h1>
        <p>Append-only history of sensitive changes. Records identify who performed the action, the affected entity, the outcome, and sanitized before/after snapshots.</p>
      </div>
      <div className={styles.stats}>
        <div className={styles.stat}><span>Loaded</span><strong>{rows.length}</strong></div>
        <div className={styles.stat}><span>Today</span><strong>{todayCount}</strong></div>
        <div className={styles.stat}><span>Needs Review</span><strong>{failedCount}</strong></div>
      </div>
    </section>

    <form className={styles.filters} method="get">
      <input name="action" defaultValue={actionFilter} placeholder="Action, e.g. accounts.ledger.edit" />
      <input name="entity" defaultValue={entityFilter} placeholder="Entity, e.g. transaction" />
      <input name="actor" defaultValue={actorFilter} placeholder="Actor / role / user ID" />
      <select name="outcome" defaultValue={outcomeFilter}>
        <option value="">All outcomes</option>
        <option value="success">Success</option>
        <option value="failure">Failure</option>
        <option value="denied">Denied</option>
        <option value="warning">Warning</option>
      </select>
      <button type="submit">Apply Filters</button>
      <Link href="/admin/audit-log">Clear</Link>
    </form>

    <section className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Outcome</th><th>Request</th><th>Details</th></tr></thead>
        <tbody>
          {filtered.map((row: Row) => {
            const outcome = text(row.outcome || "success").toLowerCase();
            const payload = {
              before: row.before_data ?? null,
              after: row.after_data ?? null,
              details: row.details ?? {},
            };
            return <tr key={String(row.id)}>
              <td><strong>{dhakaDate(row.created_at)}</strong></td>
              <td>
                <strong>{text(row.actor_name) || text(row.actor_user_key) || "System"}</strong><br />
                <span className={styles.muted}>{[text(row.actor_user_key), text(row.actor_role)].filter(Boolean).join(" · ") || "—"}</span>
              </td>
              <td className={styles.action}>{text(row.action) || "—"}</td>
              <td><span className={styles.entity}>{[text(row.entity_type), text(row.entity_id || row.target)].filter(Boolean).join(" · ") || "—"}</span></td>
              <td className={styles[outcome as keyof typeof styles] || ""}>{outcome || "—"}</td>
              <td><span className={styles.entity}>{text(row.request_path) || "—"}</span><br /><span className={styles.muted}>{text(row.request_id) || text(row.source) || "—"}</span></td>
              <td>
                <details className={styles.details}>
                  <summary>Inspect</summary>
                  <pre>{pretty(payload)}</pre>
                </details>
              </td>
            </tr>;
          })}
          {!filtered.length ? <tr><td colSpan={7} className={styles.empty}>No audit records match these filters.</td></tr> : null}
        </tbody>
      </table>
    </section>
  </main>;
}
