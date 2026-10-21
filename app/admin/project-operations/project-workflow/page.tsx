"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;
type ServiceColumn = { key: string; label: string; matches: (name: string) => boolean };

const SERVICE_COLUMNS: ServiceColumn[] = [
  { key: "architectural", label: "Architectural", matches: (name) => /architectural design/i.test(name) },
  { key: "structural", label: "Structural", matches: (name) => /structural design/i.test(name) },
  { key: "3d", label: "3D Design", matches: (name) => /3d design/i.test(name) },
  { key: "electrical", label: "Electrical", matches: (name) => /electrical design/i.test(name) },
  { key: "plumbing", label: "Plumbing", matches: (name) => /plumbing design/i.test(name) },
  { key: "estimate", label: "Est & Cost", matches: (name) => /estimate|costing/i.test(name) },
  { key: "books", label: "Design Books", matches: (name) => /design books?/i.test(name) },
  { key: "municipality", label: "Municipality", matches: (name) => /municipality/i.test(name) },
  { key: "soil", label: "Soil Test", matches: (name) => /soil test/i.test(name) },
  { key: "survey", label: "Digital Survey", matches: (name) => /digital survey/i.test(name) },
];

function money(value: unknown) {
  const n = Number(value || 0);
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}

async function parse(response: Response, fallback: string) {
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || fallback));
  return json.data;
}

async function loadWorkflow() {
  return parse(
    await fetch("/api/service-workflow?mode=project", {
      credentials: "same-origin",
      cache: "no-store",
    }),
    "Could not load Project Workflow.",
  );
}

async function post(payload: Row) {
  return parse(
    await fetch("/api/service-workflow", {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
    "Could not update Project Workflow.",
  );
}

export default function ProjectWorkflowPage() {
  const [data, setData] = useState<Row>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await loadWorkflow());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load Project Workflow.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function updateService(row: Row, status: string) {
    const key = `S:${row.id}`;
    if (busy) return;
    setBusy(key);
    setError("");
    setMessage("");
    try {
      const updated = await post({ action: "updateProjectServiceStatus", id: row.id, status });
      setData((current) => ({
        ...current,
        workflows: (current.workflows || []).map((item: Row) =>
          item.id === row.id ? { ...item, status, updatedAt: updated?.updated_at || item.updatedAt } : item,
        ),
      }));
      setMessage(`${row.projectId} · ${row.serviceName} moved to ${status}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update service workflow.");
    } finally {
      setBusy("");
    }
  }

  async function markProjectComplete(projectId: string, ownerName: string) {
    const key = `C:${projectId}`;
    if (busy) return;
    const confirmed = window.confirm(
      `Mark ${projectId}${ownerName ? ` · ${ownerName}` : ""} fully completed?\n\n` +
        "This is mainly for older / legacy projects. It closes the project and all open service workflows without changing billing, payment, discount or ledger history.",
    );
    if (!confirmed) return;

    setBusy(key);
    setError("");
    setMessage("");
    try {
      const result = await post({
        action: "markProjectComplete",
        projectId,
        reason: "Manually marked complete from Project Workflow matrix for legacy project close-out.",
      });
      await load();
      setMessage(
        `${projectId} marked fully Completed. ${Number(result?.servicesClosed || 0)} open service workflow${Number(result?.servicesClosed || 0) === 1 ? " was" : "s were"} closed.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not mark project complete.");
    } finally {
      setBusy("");
    }
  }

  const workflows: Row[] = data.workflows || [];

  const groupedProjects = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of workflows) {
      const projectId = String(row.projectId || "").trim();
      if (!projectId) continue;
      const list = map.get(projectId) || [];
      list.push(row);
      map.set(projectId, list);
    }

    const q = query.trim().toLowerCase();
    return Array.from(map.entries())
      .filter(([projectId, rows]) => {
        if (!q) return true;
        const first = rows[0] || {};
        return [projectId, first.ownerName, first.story, first.location, ...rows.flatMap((row) => [row.serviceName, row.status, row.billingCategory])]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => b[0].localeCompare(a[0], undefined, { numeric: true }));
  }, [workflows, query]);

  const completedStatuses = new Set(["Approved", "Delivered", "Delivered to Client"]);
  const activeServices = workflows.filter((row) => !completedStatuses.has(String(row.status || ""))).length;
  const completedServices = workflows.length - activeServices;

  function renderServiceCell(rows: Row[], column: ServiceColumn, projectCompleted: boolean) {
    const matches = rows.filter((row) => column.matches(String(row.serviceName || "")));
    if (!matches.length) return <div className="pwm-empty-cell">—</div>;

    return (
      <div className="pwm-cell-stack">
        {matches.map((row) => (
          <div className="pwm-service-card" key={row.id}>
            {matches.length > 1 && <strong className="pwm-service-title">{row.serviceName}</strong>}
            <span className="pwm-status">{row.status}</span>
            <small>{money(row.paidAmount)} / {money(row.netAmount)}</small>
            <select
              value={row.status}
              disabled={projectCompleted || busy === `S:${row.id}`}
              onChange={(e) => void updateService(row, e.target.value)}
              aria-label={`${row.projectId} ${row.serviceName} status`}
            >
              {(row.statuses || []).map((status: string) => <option key={status}>{status}</option>)}
            </select>
          </div>
        ))}
      </div>
    );
  }

  return (
    <main className="pwm-shell">
      <style>{`
        .pwm-shell{max-width:100%;color:var(--lv-text-primary)}.pwm-shell *{box-sizing:border-box}
        .pwm-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:14px}.pwm-eyebrow{font-size:8px;font-weight:950;letter-spacing:.14em;color:var(--lv-brand-text)}.pwm-head h1{margin:4px 0 0;font-size:28px}.pwm-head p{max-width:900px;margin:5px 0 0;font-size:9px;line-height:1.5;color:var(--lv-text-secondary)}
        .pwm-actions{display:flex;gap:7px;flex-wrap:wrap}.pwm-btn{display:inline-flex;align-items:center;justify-content:center;min-height:37px;padding:0 12px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);text-decoration:none;font-size:8px;font-weight:900}.pwm-btn.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}
        .pwm-kpis{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:9px;margin-bottom:12px}.pwm-kpi{padding:12px 13px;border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-panel)}.pwm-kpi span{display:block;font-size:7px;text-transform:uppercase;letter-spacing:.06em;color:var(--lv-text-muted);font-weight:900}.pwm-kpi strong{display:block;margin-top:5px;font-size:20px}.pwm-kpi small{display:block;margin-top:3px;font-size:7px;color:var(--lv-text-muted)}
        .pwm-search{width:100%;min-height:41px;margin-bottom:12px;padding:0 12px;border:1px solid var(--lv-border-default);border-radius:9px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:9px}.pwm-msg{margin-bottom:12px;padding:10px 12px;border-radius:8px;font-size:9px}.pwm-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.pwm-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}
        .pwm-wrap{width:100%;overflow:auto;border:1px solid var(--lv-border-default);border-radius:11px;background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm)}.pwm-table{width:max-content;min-width:100%;border-collapse:separate;border-spacing:0}.pwm-table th,.pwm-table td{border-right:1px solid var(--lv-border-subtle);border-bottom:1px solid var(--lv-border-subtle);vertical-align:top}.pwm-table th:last-child,.pwm-table td:last-child{border-right:0}.pwm-table tbody tr:last-child td{border-bottom:0}
        .pwm-table thead th{position:sticky;top:0;z-index:4;min-width:152px;padding:11px 9px;background:var(--lv-surface-muted);font-size:8px;font-weight:950;text-align:center;white-space:nowrap}.pwm-table thead th:first-child{left:0;z-index:6;min-width:245px;text-align:left}.pwm-project{position:sticky;left:0;z-index:3;width:245px;min-width:245px;padding:11px;background:var(--lv-surface-panel)}.pwm-project strong{display:block;font-size:10px;color:var(--lv-text-strong)}.pwm-project p{margin:4px 0 0;font-size:8px;line-height:1.45;color:var(--lv-text-secondary)}.pwm-project-tools{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}.pwm-project-tools a,.pwm-complete{display:inline-flex;align-items:center;justify-content:center;min-height:27px;padding:0 8px;border:1px solid var(--lv-border-default);border-radius:6px;background:var(--lv-surface-input);color:var(--lv-text-primary);text-decoration:none;font-size:7px;font-weight:900;cursor:pointer}.pwm-complete{border-color:var(--lv-success-border);background:var(--lv-success-soft);color:var(--lv-success)}.pwm-complete:disabled{opacity:.55;cursor:not-allowed}.pwm-done{display:inline-flex;align-items:center;min-height:27px;padding:0 8px;border:1px solid var(--lv-success-border);border-radius:999px;background:var(--lv-success-soft);color:var(--lv-success);font-size:7px;font-weight:950}
        .pwm-service{width:152px;min-width:152px;padding:7px;background:var(--lv-surface-panel)}.pwm-cell-stack{display:grid;gap:6px}.pwm-service-card{display:grid;gap:5px;padding:7px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-muted)}.pwm-service-title{font-size:7px;line-height:1.3}.pwm-status{display:inline-flex;width:max-content;max-width:100%;padding:3px 6px;border-radius:999px;background:var(--lv-brand-soft);color:var(--lv-brand-text);font-size:7px;font-weight:950}.pwm-service-card small{font-size:6px;line-height:1.35;color:var(--lv-text-muted)}.pwm-service-card select{width:100%;min-height:27px;padding:4px;border:1px solid var(--lv-border-default);border-radius:5px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:7px}.pwm-empty-cell{display:flex;min-height:66px;align-items:center;justify-content:center;color:var(--lv-text-muted);font-size:10px;opacity:.45}.pwm-no-data{padding:32px;text-align:center;color:var(--lv-text-muted);font-size:9px}
        @media(max-width:900px){.pwm-head{align-items:flex-start;flex-direction:column}.pwm-kpis{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){.pwm-kpis{grid-template-columns:1fr}.pwm-actions{width:100%}.pwm-btn{flex:1}.pwm-project,.pwm-table thead th:first-child{width:205px;min-width:205px}}
      `}</style>

      <header className="pwm-head">
        <div>
          <div className="pwm-eyebrow">PROJECT OPERATIONS · PROJECT WORKFLOW</div>
          <h1>Project Workflow</h1>
          <p>
            One row per project. A service appears only in its own column when that billed service has actually opened in workflow. If the project has no 3D Design, Soil Test, Digital Survey or any other service, that cell stays empty.
          </p>
        </div>
        <div className="pwm-actions">
          <Link className="pwm-btn" href="/admin/project-operations">Project Operations</Link>
          <Link className="pwm-btn" href="/admin/finance/service-payments">Pay / Allocate Services</Link>
          <Link className="pwm-btn primary" href="/admin/projects">Open Projects</Link>
        </div>
      </header>

      <section className="pwm-kpis">
        <div className="pwm-kpi"><span>Projects</span><strong>{groupedProjects.length}</strong><small>With opened service workflow</small></div>
        <div className="pwm-kpi"><span>Opened Services</span><strong>{workflows.length}</strong><small>From billing/payment</small></div>
        <div className="pwm-kpi"><span>Active Services</span><strong>{activeServices}</strong><small>Still being worked</small></div>
        <div className="pwm-kpi"><span>Completed Services</span><strong>{completedServices}</strong><small>Approved / delivered</small></div>
      </section>

      <input
        className="pwm-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search project ID, owner, story, location, service or status…"
      />

      {error && <div className="pwm-msg bad">{error}</div>}
      {message && <div className="pwm-msg good">{message}</div>}

      {loading ? <div className="pwm-no-data">Loading Project Workflow…</div> : (
        <div className="pwm-wrap">
          <table className="pwm-table">
            <thead>
              <tr>
                <th>Project</th>
                {SERVICE_COLUMNS.map((column) => <th key={column.key}>{column.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {groupedProjects.map(([projectId, rows]) => {
                const first = rows[0] || {};
                const projectCompleted = first.lifecyclePhase === "Completed";
                return (
                  <tr key={projectId}>
                    <td className="pwm-project">
                      <strong>{projectId} · {first.ownerName || "Owner"}</strong>
                      <p>{first.story || "Story —"}</p>
                      <p>{first.location || "Location —"}</p>
                      <div className="pwm-project-tools">
                        {projectCompleted ? (
                          <span className="pwm-done">✓ Completed</span>
                        ) : (
                          <button
                            type="button"
                            className="pwm-complete"
                            disabled={busy === `C:${projectId}`}
                            onClick={() => void markProjectComplete(projectId, first.ownerName || "")}
                          >
                            {busy === `C:${projectId}` ? "Completing…" : "✓ Complete"}
                          </button>
                        )}
                        <Link href={`/admin/projects/${encodeURIComponent(projectId)}`}>Open →</Link>
                      </div>
                    </td>
                    {SERVICE_COLUMNS.map((column) => (
                      <td className="pwm-service" key={`${projectId}:${column.key}`}>
                        {renderServiceCell(rows, column, projectCompleted)}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {!groupedProjects.length && (
                <tr><td className="pwm-no-data" colSpan={SERVICE_COLUMNS.length + 1}>No opened project service workflows found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
