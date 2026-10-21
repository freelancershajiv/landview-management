"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;
type ServiceGroup = { key: string; label: string; matches: (name: string) => boolean };

const GROUPS: ServiceGroup[] = [
  { key: "architectural", label: "Architectural", matches: (name) => /architectural design/i.test(name) },
  { key: "structural", label: "Structural", matches: (name) => /structural design/i.test(name) },
  { key: "3d", label: "3D Design", matches: (name) => /3d design/i.test(name) },
  { key: "electrical", label: "Electrical", matches: (name) => /electrical design/i.test(name) },
  { key: "fire", label: "Fire Safety", matches: (name) => /fire safety/i.test(name) },
  { key: "plumbing", label: "Plumbing", matches: (name) => /plumbing design/i.test(name) },
  { key: "plan", label: "Plan Approval", matches: (name) => /plan approval/i.test(name) },
  { key: "estimate", label: "Est & Cost", matches: (name) => /estimate|costing/i.test(name) },
  { key: "books", label: "Design Books", matches: (name) => /design books?/i.test(name) },
  { key: "municipality", label: "Municipality", matches: (name) => /municipality/i.test(name) },
  { key: "soil", label: "Soil Test", matches: (name) => /soil test/i.test(name) },
  { key: "survey", label: "Digital Survey", matches: (name) => /digital survey/i.test(name) },
];

function money(value: unknown) {
  const n = Number(value || 0);
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);
}

async function parse(response: Response, fallback: string) {
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || fallback));
  return json.data;
}

async function loadWorkflow() {
  return parse(await fetch("/api/service-workflow?mode=project", { credentials: "same-origin", cache: "no-store" }), "Could not load service operations.");
}

async function post(payload: Row) {
  return parse(await fetch("/api/service-workflow", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }), "Could not update service operations.");
}

function finalStatus(row: Row) {
  const statuses: string[] = row.statuses || [];
  return statuses.length > 0 && String(row.status || "") === String(statuses[statuses.length - 1] || "");
}

function reopenedPhase(row: Row) {
  const workflowType = String(row.workflowType || "").toLowerCase();
  const serviceName = String(row.serviceName || "").toLowerCase();
  if (workflowType === "municipality") return "Approval Stage";
  if (serviceName.includes("supervision")) return "Supervision / Construction Stage";
  return "Design Stage";
}

function sortProjectDesc(a: Row, b: Row) {
  return String(b.projectId || "").localeCompare(String(a.projectId || ""), undefined, { numeric: true });
}

function sortCompleted(a: Row, b: Row) {
  const aTime = Date.parse(String(a.updatedAt || "")) || 0;
  const bTime = Date.parse(String(b.updatedAt || "")) || 0;
  if (aTime !== bTime) return bTime - aTime;
  return sortProjectDesc(a, b);
}

export default function ByServiceOperationsPage() {
  const [data, setData] = useState<Row>({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await loadWorkflow()); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load service operations."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function updateService(row: Row, status: string) {
    if (busy) return;
    setBusy(`S:${row.id}`); setError(""); setMessage("");
    try {
      const updated = await post({ action: "updateProjectServiceStatus", id: row.id, status });
      const statuses: string[] = row.statuses || [];
      const final = String(statuses[statuses.length - 1] || "");
      const reopened = String(row.lifecyclePhase || "") === "Completed" && status !== final;
      const nextPhase = reopened ? reopenedPhase(row) : String(row.lifecyclePhase || "");
      const updatedAt = updated?.updated_at || new Date().toISOString();
      setData((current) => ({
        ...current,
        workflows: (current.workflows || []).map((item: Row) => {
          if (item.projectId !== row.projectId) return item;
          const projectUpdate = reopened ? { lifecyclePhase: nextPhase } : {};
          return item.id === row.id ? { ...item, ...projectUpdate, status, updatedAt } : { ...item, ...projectUpdate };
        }),
      }));
      setMessage(`${row.projectId} · ${row.serviceName} moved to ${status}.${reopened ? " The completed project was reopened automatically for correction." : ""}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update service."); }
    finally { setBusy(""); }
  }

  const workflows: Row[] = data.workflows || [];
  const availableGroups = useMemo(() => GROUPS.filter((group) => workflows.some((row) => group.matches(String(row.serviceName || "")))), [workflows]);

  useEffect(() => {
    if (!selected && availableGroups.length) setSelected(availableGroups[0].key);
    if (selected && availableGroups.length && !availableGroups.some((group) => group.key === selected)) setSelected(availableGroups[0].key);
  }, [availableGroups, selected]);

  const activeGroup = availableGroups.find((group) => group.key === selected) || availableGroups[0];
  const rows = useMemo(() => {
    if (!activeGroup) return [];
    const q = query.trim().toLowerCase();
    return workflows
      .filter((row) => activeGroup.matches(String(row.serviceName || "")))
      .filter((row) => !q || [row.projectId, row.ownerName, row.story, row.location, row.serviceName, row.status, row.billingCategory].join(" ").toLowerCase().includes(q));
  }, [activeGroup, workflows, query]);

  const runningRows = useMemo(() => rows.filter((row) => !finalStatus(row)).sort(sortProjectDesc), [rows]);
  const completedRows = useMemo(() => rows.filter(finalStatus).sort(sortCompleted), [rows]);

  const counts = useMemo(() => Object.fromEntries(availableGroups.map((group) => [group.key, workflows.filter((row) => group.matches(String(row.serviceName || ""))).length])), [availableGroups, workflows]);

  function renderRows(sectionRows: Row[], emptyLabel: string) {
    return <>
      {sectionRows.map((row) => <tr key={row.id}>
        <td className="bys-project"><strong>{row.projectId}</strong><span>{row.location || "Location —"}</span></td>
        <td className="bys-owner"><strong>{row.ownerName || "Owner"}</strong><span>{row.story || "Story —"}</span></td>
        <td className="bys-service"><strong>{row.serviceName}</strong><span>{row.billingCategory}</span></td>
        <td><span className={`bys-status ${finalStatus(row) ? "done" : ""}`}>{row.status}</span></td>
        <td className="bys-money">Paid / Net<strong>{money(row.paidAmount)} / {money(row.netAmount)}</strong></td>
        <td><select value={row.status} disabled={busy === `S:${row.id}`} onChange={(e) => void updateService(row, e.target.value)}>{(row.statuses || []).map((status: string) => <option key={status}>{status}</option>)}</select></td>
        <td><Link className="bys-open" href={`/admin/projects/${encodeURIComponent(row.projectId)}`}>Open →</Link></td>
      </tr>)}
      {!sectionRows.length && <tr><td colSpan={7}><div className="bys-empty">{emptyLabel}</div></td></tr>}
    </>;
  }

  function serviceTable(sectionRows: Row[], emptyLabel: string) {
    return <div className="bys-table-wrap"><table className="bys-table">
      <thead><tr><th>Project</th><th>Owner / Story</th><th>Service</th><th>Status</th><th>Paid / Net</th><th>Update Status</th><th></th></tr></thead>
      <tbody>{renderRows(sectionRows, emptyLabel)}</tbody>
    </table></div>;
  }

  return (
    <main className="bys-shell">
      <style>{`
        .bys-shell{max-width:100%;color:var(--lv-text-primary)}.bys-shell *{box-sizing:border-box}
        .bys-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin-bottom:12px}.bys-head h2{margin:0;font-size:22px}.bys-head p{margin:4px 0 0;font-size:8px;color:var(--lv-text-secondary)}.bys-actions{display:flex;gap:7px;flex-wrap:wrap}.bys-btn{display:inline-flex;align-items:center;justify-content:center;min-height:35px;padding:0 11px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);text-decoration:none;font-size:8px;font-weight:900}.bys-btn.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}
        .bys-tabs{display:flex;gap:6px;overflow:auto;padding-bottom:5px;margin-bottom:11px}.bys-tab{flex:0 0 auto;min-height:35px;padding:0 10px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-panel);color:var(--lv-text-primary);font-size:7px;font-weight:900;cursor:pointer;white-space:nowrap}.bys-tab span{margin-left:5px;opacity:.65}.bys-tab.active{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}
        .bys-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:11px}.bys-kpi{padding:11px 12px;border:1px solid var(--lv-border-default);border-radius:9px;background:var(--lv-surface-panel)}.bys-kpi span{display:block;font-size:7px;text-transform:uppercase;font-weight:900;color:var(--lv-text-muted)}.bys-kpi strong{display:block;margin-top:4px;font-size:18px}.bys-search{width:100%;min-height:40px;margin-bottom:11px;padding:0 12px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:9px}.bys-msg{margin-bottom:10px;padding:9px 11px;border-radius:8px;font-size:8px}.bys-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.bys-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}
        .bys-section{margin-top:12px}.bys-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px;padding:0 2px}.bys-section-head h3{margin:0;font-size:12px;color:var(--lv-text-strong)}.bys-section-head p{margin:2px 0 0;font-size:7px;color:var(--lv-text-muted)}.bys-count{display:inline-flex;align-items:center;justify-content:center;min-width:28px;height:24px;padding:0 8px;border-radius:999px;background:var(--lv-brand-soft);color:var(--lv-brand-text);font-size:8px;font-weight:950}.bys-running-head{padding:10px 12px;border:1px solid var(--lv-border-default);border-bottom:0;border-radius:11px 11px 0 0;background:var(--lv-surface-muted)}.bys-running-head + .bys-table-wrap{border-radius:0 0 11px 11px}.bys-completed{margin-top:13px;border:1px solid var(--lv-border-default);border-radius:11px;background:var(--lv-surface-panel);overflow:hidden}.bys-completed>summary{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:48px;padding:10px 13px;cursor:pointer;list-style:none;background:var(--lv-surface-muted);user-select:none}.bys-completed>summary::-webkit-details-marker{display:none}.bys-completed-title{display:flex;align-items:center;gap:9px}.bys-completed-title strong{font-size:10px}.bys-completed-title small{display:block;margin-top:2px;font-size:7px;color:var(--lv-text-muted)}.bys-chevron{font-size:14px;transition:transform .18s ease}.bys-completed[open] .bys-chevron{transform:rotate(90deg)}.bys-completed .bys-table-wrap{border:0;border-top:1px solid var(--lv-border-default);border-radius:0;box-shadow:none}
        .bys-table-wrap{overflow:auto;border:1px solid var(--lv-border-default);border-radius:11px;background:var(--lv-surface-panel);box-shadow:var(--lv-shadow-sm)}.bys-table{width:100%;border-collapse:collapse;min-width:860px}.bys-table th{padding:10px 12px;background:var(--lv-surface-muted);border-bottom:1px solid var(--lv-border-default);font-size:7px;text-align:left;text-transform:uppercase;color:var(--lv-text-muted)}.bys-table td{padding:11px 12px;border-bottom:1px solid var(--lv-border-subtle);font-size:8px;vertical-align:middle}.bys-table tr:last-child td{border-bottom:0}.bys-project strong{display:block;font-size:9px;color:var(--lv-text-strong)}.bys-project span{display:block;margin-top:3px;font-size:7px;color:var(--lv-text-muted)}.bys-owner strong{display:block;font-size:8px}.bys-owner span{display:block;margin-top:3px;font-size:7px;color:var(--lv-text-muted)}.bys-service strong{display:block;font-size:8px}.bys-service span{display:block;margin-top:3px;font-size:6px;color:var(--lv-text-muted)}.bys-status{display:inline-flex;padding:4px 7px;border-radius:999px;background:var(--lv-brand-soft);color:var(--lv-brand-text);font-size:7px;font-weight:950}.bys-status.done{background:var(--lv-success-soft);color:var(--lv-success)}.bys-money{font-size:7px;color:var(--lv-text-muted)}.bys-money strong{display:block;margin-top:3px;font-size:8px;color:var(--lv-text-primary)}.bys-table select{width:100%;min-width:135px;min-height:30px;padding:5px;border:1px solid var(--lv-border-default);border-radius:6px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:7px}.bys-open{display:inline-flex;align-items:center;min-height:28px;padding:0 8px;border:1px solid var(--lv-border-default);border-radius:6px;background:var(--lv-surface-input);color:var(--lv-text-primary);text-decoration:none;font-size:7px;font-weight:900}.bys-empty{padding:30px;text-align:center;color:var(--lv-text-muted);font-size:9px}
        @media(max-width:800px){.bys-head{align-items:flex-start;flex-direction:column}.bys-summary{grid-template-columns:1fr}.bys-actions{width:100%}.bys-btn{flex:1}}
      `}</style>

      <header className="bys-head">
        <div><h2>By Service</h2><p>Select one service. Running files stay open at the top; delivered or approved files move into the collapsed completed section below. Completed files can still be corrected.</p></div>
        <div className="bys-actions"><Link className="bys-btn" href="/admin/finance/service-payments">Pay / Allocate Services</Link><Link className="bys-btn primary" href="/admin/projects">Open Projects</Link></div>
      </header>

      <div className="bys-tabs">
        {availableGroups.map((group) => <button type="button" key={group.key} className={`bys-tab ${activeGroup?.key === group.key ? "active" : ""}`} onClick={() => setSelected(group.key)}>{group.label}<span>{counts[group.key] || 0}</span></button>)}
      </div>

      <section className="bys-summary">
        <div className="bys-kpi"><span>Selected Service</span><strong>{activeGroup?.label || "—"}</strong></div>
        <div className="bys-kpi"><span>Running</span><strong>{runningRows.length}</strong></div>
        <div className="bys-kpi"><span>Delivered / Approved</span><strong>{completedRows.length}</strong></div>
      </section>

      <input className="bys-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${activeGroup?.label || "service"} projects by ID, owner, story, location or status…`} />
      {error && <div className="bys-msg bad">{error}</div>}{message && <div className="bys-msg good">{message}</div>}

      {loading ? <div className="bys-empty">Loading service operations…</div> : !activeGroup ? <div className="bys-empty">No service workflows are open yet.</div> : <>
        <section className="bys-section" aria-label={`${activeGroup.label} running files`}>
          <div className="bys-section-head bys-running-head">
            <div><h3>Running</h3><p>Active files stay visible here until the service reaches its final status.</p></div>
            <span className="bys-count">{runningRows.length}</span>
          </div>
          {serviceTable(runningRows, `No running ${activeGroup.label} files.`)}
        </section>

        <details className="bys-completed">
          <summary>
            <div className="bys-completed-title"><span className="bys-chevron">›</span><div><strong>Delivered / Approved</strong><small>Completed files are kept at the bottom and collapsed by default.</small></div></div>
            <span className="bys-count">{completedRows.length}</span>
          </summary>
          {serviceTable(completedRows, `No delivered or approved ${activeGroup.label} files yet.`)}
        </details>
      </>}
    </main>
  );
}