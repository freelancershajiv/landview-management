"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type LinkStatus = "linked" | "unlinked" | "needs_review" | "general";
type Filter = "all" | LinkStatus;
type RecordType = "bill" | "payment" | "transaction";

type ProjectOption = {
  id: string;
  projectCode: string;
  projectName: string;
  clientName: string;
  phoneNumber: string;
};

type ReconciliationRow = {
  key: string;
  recordType: RecordType;
  recordId: string;
  sourceId: string;
  date: string;
  amount: number;
  details: string;
  category: string;
  rowStatus: string;
  projectCode: string;
  projectName: string;
  clientName: string;
  phoneNumber: string;
  linkStatus: LinkStatus;
  search: string;
};

type ReconciliationData = {
  rows: ReconciliationRow[];
  projects: ProjectOption[];
  canEdit: boolean;
};

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "All" },
  { value: "unlinked", label: "Unlinked" },
  { value: "linked", label: "Linked" },
  { value: "needs_review", label: "Needs Review" },
  { value: "general", label: "General Transactions" },
];

function money(value: number) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function displayDate(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  const parsed = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function statusLabel(status: LinkStatus) {
  if (status === "needs_review") return "Needs Review";
  if (status === "general") return "General";
  return status.slice(0, 1).toUpperCase() + status.slice(1);
}

function typeLabel(type: RecordType) {
  if (type === "bill") return "Bill";
  if (type === "payment") return "Payment";
  return "Ledger";
}

export default function BillReconciliationPage() {
  const [data, setData] = useState<ReconciliationData>({ rows: [], projects: [], canEdit: false });
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyKey, setBusyKey] = useState("");
  const [selectedProjects, setSelectedProjects] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/accounts/reconciliation", {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load reconciliation data."));
      const next = json.data as ReconciliationData;
      setData(next);
      setSelectedProjects(Object.fromEntries(next.rows.map((row) => [row.key, row.projectCode || ""])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load reconciliation data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const next: Record<Filter, number> = { all: data.rows.length, linked: 0, unlinked: 0, needs_review: 0, general: 0 };
    for (const row of data.rows) next[row.linkStatus] += 1;
    return next;
  }, [data.rows]);

  const visibleRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return data.rows.filter((row) => {
      if (filter !== "all" && row.linkStatus !== filter) return false;
      if (!term) return true;
      return row.search.includes(term) || String(row.amount).includes(term);
    });
  }, [data.rows, filter, query]);

  async function updateLink(row: ReconciliationRow, mode: "link" | "general") {
    const projectCode = selectedProjects[row.key] || "";
    if (mode === "link" && !projectCode) {
      setError("Choose a project before saving the link.");
      return;
    }
    if (mode === "general" && row.recordType !== "transaction") return;

    setBusyKey(row.key);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/accounts/reconciliation", {
        method: "PATCH",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recordType: row.recordType,
          recordId: row.recordId,
          projectCode,
          mode,
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not update the project link."));
      setMessage(mode === "general"
        ? `${row.recordId} is now General / No Project.`
        : `${row.recordId} is now linked to ${projectCode}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the project link.");
    } finally {
      setBusyKey("");
    }
  }

  return (
    <section className="reconciliation-page">
      <style>{`
        .reconciliation-page{display:grid;gap:18px;color:var(--theme-ink,#1f2933)}
        .recon-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:22px;border:1px solid var(--theme-line,#d9e0e6);border-radius:14px;background:var(--theme-bg,#fff)}
        .recon-hero h1{margin:0 0 6px;font-size:25px;line-height:1.15}.recon-hero p{margin:0;max-width:760px;color:var(--theme-muted,#66737f);font-size:13px;line-height:1.6}
        .recon-refresh{min-height:38px;padding:8px 14px;border:1px solid #8b4039;border-radius:8px;background:#8b4039;color:#fff;font-weight:900;cursor:pointer}.recon-refresh:disabled{opacity:.55;cursor:not-allowed}
        .recon-alert{padding:12px 14px;border-radius:9px;font-size:13px;font-weight:750}.recon-alert.error{border:1px solid #e7b5b0;background:#fff1ef;color:#8b2f28}.recon-alert.success{border:1px solid #a9d6bb;background:#effaf3;color:#23653b}
        .recon-controls{display:grid;grid-template-columns:minmax(260px,1fr) auto;gap:12px;align-items:center}.recon-search{width:100%;min-height:42px;padding:9px 12px;border:1px solid var(--theme-line,#cfd8df);border-radius:9px;background:var(--theme-bg,#fff);color:inherit;font:inherit}.recon-search:focus{outline:2px solid rgba(139,64,57,.18);border-color:#8b4039}
        .recon-filters{display:flex;flex-wrap:wrap;gap:7px}.recon-filter{min-height:38px;padding:7px 10px;border:1px solid var(--theme-line,#d4dce2);border-radius:8px;background:var(--theme-bg,#fff);color:inherit;font-size:11px;font-weight:900;cursor:pointer}.recon-filter.active{border-color:#8b4039;background:#3a211f;color:#ffd0cc}.recon-filter span{opacity:.72;margin-left:5px}
        .recon-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.recon-card{padding:14px 16px;border:1px solid var(--theme-line,#d9e0e6);border-radius:11px;background:var(--theme-bg,#fff)}.recon-card small{display:block;margin-bottom:5px;color:var(--theme-muted,#6b7780);font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.recon-card strong{font-size:22px}.recon-card.warn strong{color:#a45a19}.recon-card.bad strong{color:#a2352d}.recon-card.good strong{color:#287347}
        .recon-table-wrap{overflow:auto;border:1px solid var(--theme-line,#d9e0e6);border-radius:12px;background:var(--theme-bg,#fff)}.recon-table{width:100%;min-width:1120px;border-collapse:collapse;font-size:12px}.recon-table th{position:sticky;top:0;z-index:1;padding:10px 11px;background:var(--theme-bg-soft,#f2f5f7);border-bottom:1px solid var(--theme-line,#d9e0e6);text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em}.recon-table td{padding:11px;border-bottom:1px solid var(--theme-line-soft,#e9eef2);vertical-align:top}.recon-table tr:last-child td{border-bottom:0}.recon-id{display:block;font-weight:900}.recon-sub{display:block;margin-top:3px;color:var(--theme-muted,#6c7882);font-size:10px}.recon-money{white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums;font-weight:850}.recon-type,.recon-status{display:inline-flex;align-items:center;min-height:25px;padding:4px 7px;border-radius:999px;font-size:9px;font-weight:950;text-transform:uppercase;letter-spacing:.05em}.recon-type{background:#edf1f4;color:#44515c}.recon-status.linked{background:#e8f6ed;color:#23653b}.recon-status.unlinked{background:#fff3e5;color:#8a4b10}.recon-status.needs_review{background:#ffebe8;color:#9a3129}.recon-status.general{background:#eef1f5;color:#4f5d68}
        .recon-project{min-width:170px}.recon-project strong{display:block}.recon-actions{display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:7px;min-width:310px}.recon-select{min-height:36px;width:100%;padding:6px 8px;border:1px solid var(--theme-line,#cfd8df);border-radius:7px;background:var(--theme-bg,#fff);color:inherit;font-size:11px}.recon-save,.recon-general{min-height:36px;padding:7px 10px;border-radius:7px;font-size:10px;font-weight:900;cursor:pointer}.recon-save{border:1px solid #8b4039;background:#8b4039;color:white}.recon-general{grid-column:1/-1;border:1px solid var(--theme-line,#c8d1d8);background:transparent;color:inherit}.recon-save:disabled,.recon-general:disabled{opacity:.5;cursor:not-allowed}.recon-readonly{color:var(--theme-muted,#6c7882);font-size:11px;font-weight:800}.recon-empty{padding:34px!important;text-align:center;color:var(--theme-muted,#6c7882)}
        .recon-note{padding:12px 14px;border-left:3px solid #8b4039;background:var(--theme-bg-soft,#f4f6f8);color:var(--theme-muted,#5f6c75);font-size:12px;line-height:1.55}
        @media(max-width:900px){.recon-controls{grid-template-columns:1fr}.recon-summary{grid-template-columns:1fr 1fr}.recon-hero{flex-direction:column}.recon-refresh{width:100%}}
        @media(max-width:560px){.recon-summary{grid-template-columns:1fr 1fr}.recon-hero{padding:17px}.recon-hero h1{font-size:21px}.recon-filters{display:grid;grid-template-columns:1fr 1fr}.recon-filter:last-child{grid-column:1/-1}}
      `}</style>

      <header className="recon-hero">
        <div>
          <h1>Bill Reconciliation</h1>
          <p>Review which bills, client payments and ledger transactions belong to each LAND VIEW project. Link or relink records without changing their amount, date or accounting values.</p>
        </div>
        <button type="button" className="recon-refresh" onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh Data"}</button>
      </header>

      {error && <div className="recon-alert error">{error}</div>}
      {message && <div className="recon-alert success">{message}</div>}

      <div className="recon-summary">
        <div className="recon-card"><small>Total Records</small><strong>{counts.all}</strong></div>
        <div className="recon-card good"><small>Linked</small><strong>{counts.linked}</strong></div>
        <div className="recon-card warn"><small>Unlinked</small><strong>{counts.unlinked}</strong></div>
        <div className="recon-card bad"><small>Needs Review</small><strong>{counts.needs_review}</strong></div>
      </div>

      <div className="recon-controls">
        <input
          className="recon-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search File ID, bill/payment/transaction ID, source/reference, client, phone or amount…"
          aria-label="Search reconciliation records"
        />
        <div className="recon-filters" aria-label="Reconciliation filters">
          {FILTERS.map((item) => (
            <button key={item.value} type="button" className={`recon-filter ${filter === item.value ? "active" : ""}`} onClick={() => setFilter(item.value)}>
              {item.label}<span>{counts[item.value]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="recon-note">
        Bills and client payments should remain linked to a project. Only standalone ledger transactions can intentionally be marked <strong>General / No Project</strong>. “Needs Review” is reserved for an actual broken project FK or a transaction whose stored project snapshot disagrees with its FK.
      </div>

      <div className="recon-table-wrap">
        <table className="recon-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Record</th>
              <th>Details</th>
              <th>Amount</th>
              <th>Current Project</th>
              <th>Status</th>
              <th>Link / Relink</th>
            </tr>
          </thead>
          <tbody>
            {!loading && visibleRows.length === 0 && (
              <tr><td className="recon-empty" colSpan={7}>No records match this filter.</td></tr>
            )}
            {loading && (
              <tr><td className="recon-empty" colSpan={7}>Loading finance records…</td></tr>
            )}
            {!loading && visibleRows.map((row) => {
              const selected = selectedProjects[row.key] || "";
              const busy = busyKey === row.key;
              return (
                <tr key={row.key}>
                  <td>{displayDate(row.date)}{row.rowStatus && <span className="recon-sub">{row.rowStatus}</span>}</td>
                  <td><span className="recon-type">{typeLabel(row.recordType)}</span><strong className="recon-id">{row.recordId}</strong>{row.sourceId && <span className="recon-sub">Source / ref: {row.sourceId}</span>}</td>
                  <td><strong>{row.details || "—"}</strong><span className="recon-sub">{row.category || "Uncategorized"}</span></td>
                  <td className="recon-money">{money(row.amount)}</td>
                  <td className="recon-project">
                    <strong>{row.projectCode || (row.linkStatus === "general" ? "General / No Project" : "—")}</strong>
                    {(row.projectName || row.clientName) && <span className="recon-sub">{[row.projectName, row.clientName].filter(Boolean).join(" · ")}</span>}
                    {row.phoneNumber && <span className="recon-sub">{row.phoneNumber}</span>}
                  </td>
                  <td><span className={`recon-status ${row.linkStatus}`}>{statusLabel(row.linkStatus)}</span></td>
                  <td>
                    {data.canEdit ? (
                      <div className="recon-actions">
                        <select
                          className="recon-select"
                          value={selected}
                          onChange={(event) => setSelectedProjects((current) => ({ ...current, [row.key]: event.target.value }))}
                          disabled={busy}
                          aria-label={`Project for ${row.recordId}`}
                        >
                          <option value="">Choose project…</option>
                          {data.projects.map((project) => (
                            <option key={project.id} value={project.projectCode}>
                              {project.projectCode}{project.clientName ? ` — ${project.clientName}` : project.projectName ? ` — ${project.projectName}` : ""}
                            </option>
                          ))}
                        </select>
                        <button type="button" className="recon-save" disabled={busy || !selected || (row.linkStatus === "linked" && selected === row.projectCode)} onClick={() => void updateLink(row, "link")}>
                          {busy ? "Saving…" : row.projectCode ? "Relink" : "Link"}
                        </button>
                        {row.recordType === "transaction" && row.linkStatus !== "general" && (
                          <button type="button" className="recon-general" disabled={busy} onClick={() => void updateLink(row, "general")}>Mark General / No Project</button>
                        )}
                      </div>
                    ) : <span className="recon-readonly">Read-only for Accounts role</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
