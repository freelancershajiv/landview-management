"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type LedgerEntry = {
  id?: string; entry_date?: string; created_at?: string; details?: string;
  category?: string; paid_to?: string; received_from?: string; supplier?: string;
  debit?: number | string; credit?: number | string;
};
type Filter = "all" | "income" | "expenses";

function amount(value: unknown): number {
  const parsed = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}
function money(value: unknown): string {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 2 }).format(amount(value));
}
function dateLabel(value: unknown): string {
  const date = new Date(String(value || "").slice(0, 10) + "T00:00:00");
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function percentage(value: number, max: number): string {
  return (max > 0 ? Math.max(2, Math.min(100, value / max * 100)) : 0).toFixed(1) + "%";
}
function partyCount(rows: any[], partyType: "Contractor" | "Supplier"): number {
  return new Set(rows.filter(row => (String(row.party_type || "Contractor") === partyType))
    .map(row => String(row.contractor_name || "").trim().toLowerCase()).filter(Boolean)).size;
}

export default function ProjectManagementRedesign() {
  const params = useSearchParams();
  const selectedFromQuery = String(params.get("projectId") || "").trim();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  async function load(projectCode: string, signal?: AbortSignal) {
    setLoading(true);
    setData(null); // Do not show stale finance data when switching projects.
    setError("");
    try {
      const endpoint = projectCode
        ? "/api/project-management?projectId=" + encodeURIComponent(projectCode)
        : "/api/project-management";
      const response = await fetch(endpoint, { cache: "no-store", credentials: "same-origin", signal });
      const result = await response.json();
      if (!response.ok || !result?.success) throw new Error(result?.error || "Unable to load Project Management.");
      if (!signal?.aborted) setData(result.data);
    } catch (err: any) {
      if (!signal?.aborted) setError(err?.message || "Unable to load Project Management.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void load(selectedFromQuery, controller.signal);
    return () => controller.abort();
  }, [selectedFromQuery]);

  const project = data?.selectedProject;
  const projectCode = String(project?.projectCode || selectedFromQuery || "");
  const entries: LedgerEntry[] = useMemo(() => Array.isArray(data?.entries) ? data.entries : [], [data]);
  const contracts: any[] = useMemo(() => Array.isArray(data?.contractorBills?.contracts) ? data.contractorBills.contracts : [], [data]);
  const transactionRows = useMemo(() => entries.slice().sort((a, b) =>
    String(b.entry_date || "").localeCompare(String(a.entry_date || "")) ||
    String(b.created_at || "").localeCompare(String(a.created_at || "")) ||
    String(b.id || "").localeCompare(String(a.id || ""))), [entries]);
  const lastRows = useMemo(() => transactionRows.filter(row => {
    if (filter === "income" && amount(row.debit) <= 0) return false;
    if (filter === "expenses" && amount(row.credit) <= 0) return false;
    const query = search.trim().toLowerCase();
    return !query || [row.details, row.category, row.paid_to, row.received_from, row.supplier, row.entry_date]
      .some(value => String(value || "").toLowerCase().includes(query));
  }).slice(0, 8), [transactionRows, filter, search]);

  const categories = useMemo(() => {
    const byCategory = new Map<string, number>();
    for (const entry of entries) {
      const debit = amount(entry.credit);
      if (debit <= 0) continue;
      const label = String(entry.category || "Other Expenses").trim() || "Other Expenses";
      byCategory.set(label, (byCategory.get(label) || 0) + debit);
    }
    return Array.from(byCategory, ([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value).slice(0, 6);
  }, [entries]);
  const peakExpense = categories[0]?.value || 0;
  const deposited = amount(data?.totals?.debit);
  const expenses = amount(data?.totals?.credit);
  const supplierAdvance = amount(data?.summary?.supplierAdvance);
  const onHold = amount(data?.summary?.chequeOnHold);
  const availableBalance = data?.summary?.engShajivBalance == null
    ? deposited - expenses - onHold : amount(data.summary.engShajivBalance);
  const contractorNames = partyCount(contracts, "Contractor");
  const supplierNames = partyCount(contracts, "Supplier");
  const billRows: any[] = Array.isArray(data?.contractorBills?.bills) ? data.contractorBills.bills : [];
  const financialSnapshot = [
    { label: "Total Deposit", value: deposited, subtitle: "Income recorded in the project ledger", icon: "↙", tone: "blue" },
    { label: "Total Expense", value: expenses, subtitle: "Posted project outflows", icon: "↗", tone: "red" },
    { label: "Supplier Advance", value: supplierAdvance, subtitle: "From configured supplier advance rules", icon: "▣", tone: "neutral" },
    { label: "Cheque on Hold", value: onHold, subtitle: "Amounts awaiting release", icon: "◷", tone: "amber" },
    { label: "Eng Shajiv Balance", value: availableBalance, subtitle: "As calculated by the finance ledger", icon: "৳", tone: "primary" },
  ];
  const withProject = (href: string) => projectCode ? href + "?projectId=" + encodeURIComponent(projectCode) : href;
  const isEmpty = !project;
  const delta = deposited > 0 ? Math.min(100, Math.max(0, expenses / deposited * 100)) : 0;

  return (
    <main className="pmx-dashboard">
      {error && <div className="pmx-notice pmx-notice-error" role="alert">
        <span>{error}</span>
        <button type="button" onClick={() => void load(selectedFromQuery)}>Try again</button>
      </div>}

      {loading && !data ? (
        <div className="pmx-loading" aria-live="polite">
          <div className="pmx-loading-bar" />
          <div className="pmx-loading-panels"><span /><span /><span /><span /></div>
          <p>Loading the project finance workspace…</p>
        </div>
      ) : isEmpty ? (
        <section className="pmx-empty-project">
          <span className="pmx-big-icon" aria-hidden="true">▦</span>
          <h2>Select a project to open its management dashboard</h2>
          <p>Use the Active Project selector above. Your existing finance records, suppliers and contractor bills remain in their original database.</p>
          {Array.isArray(data?.projects) && <span>{data.projects.length} project(s) configured for this workspace</span>}
        </section>
      ) : (
        <>
          <section className="pmx-overview-intro">
            <div>
              <span className="pmx-section-kicker">PROJECT FINANCIAL OVERVIEW</span>
              <h2>{project.projectName || projectCode}</h2>
              <p><strong>{projectCode}</strong> · {project.location || "Project Management"} · {project.status || "Current project"}</p>
            </div>
            <div className="pmx-overview-actions">
              <button className="pmx-quiet-button" type="button" disabled={loading} onClick={() => void load(projectCode)}>
                <span aria-hidden="true">↻</span> {loading ? "Refreshing…" : "Refresh data"}
              </button>
              <Link className="pmx-primary-button" href={withProject("/projectmanagement/expenses")}>Record expense <span aria-hidden="true">↗</span></Link>
            </div>
          </section>

          <section aria-label="Project financial metrics" className="pmx-metrics">
            {financialSnapshot.map(metric => (
              <article className={"pmx-metric pmx-metric-" + metric.tone} key={metric.label}>
                <div className="pmx-metric-top"><span>{metric.label}</span><span className="pmx-metric-icon" aria-hidden="true">{metric.icon}</span></div>
                <strong className={metric.value < 0 ? "pmx-negative" : ""}>{money(metric.value)}</strong>
                <p>{metric.subtitle}</p>
              </article>
            ))}
          </section>

          <section className="pmx-content-grid">
            <article className="pmx-panel pmx-spending-panel">
              <div className="pmx-panel-heading"><div><span className="pmx-section-kicker">COST ANALYSIS</span><h3>Expenses by category</h3><p>Top expense categories from the current ledger</p></div><Link href={withProject("/projectmanagement/expenses")}>Explore expenses <span aria-hidden="true">→</span></Link></div>
              {categories.length ? <div className="pmx-category-list">
                {categories.map((category, index) => (
                  <div className="pmx-category-row" key={category.name}>
                    <div className="pmx-category-name"><span className="pmx-category-number">{String(index + 1).padStart(2, "0")}</span><span title={category.name}>{category.name}</span><strong>{money(category.value)}</strong></div>
                    <div className="pmx-track"><span style={{ width: percentage(category.value, peakExpense) }} /></div>
                  </div>
                ))}
              </div> : <div className="pmx-panel-empty">No expense categories have been recorded yet.</div>}
            </article>

            <div className="pmx-right-column">
              <article className="pmx-panel pmx-utilization-panel">
                <div className="pmx-panel-heading"><div><span className="pmx-section-kicker">CASH MOVEMENT</span><h3>Deposits vs expenses</h3></div></div>
                <div className="pmx-utilization-row"><span>Funds received</span><strong>{money(deposited)}</strong></div>
                <div className="pmx-utilization-row"><span>Expense posted</span><strong>{money(expenses)}</strong></div>
                <div className="pmx-utilization-track"><span style={{ width: delta.toFixed(1) + "%" }} /></div>
                <p className="pmx-utilization-caption">{deposited > 0 ? (expenses / deposited * 100).toFixed(1) + "% of recorded deposits spent" : "No deposits have been recorded"}</p>
                {onHold > 0 && <p className="pmx-hold-note"><span aria-hidden="true">◷</span> {money(onHold)} currently marked as cheque on hold</p>}
              </article>

              <article className="pmx-panel pmx-people-panel">
                <div className="pmx-panel-heading"><div><span className="pmx-section-kicker">PROJECT PARTIES</span><h3>Suppliers & contractors</h3></div><Link href={withProject("/projectmanagement/parties")}>Manage <span aria-hidden="true">→</span></Link></div>
                <div className="pmx-people-stats">
                  <div><span>Registered suppliers</span><strong>{supplierNames}</strong></div>
                  <div><span>Registered contractors</span><strong>{contractorNames}</strong></div>
                  <div><span>Contract records</span><strong>{contracts.length}</strong></div>
                </div>
                <div className="pmx-people-footer"><span>Certified contractor bills</span><strong>{billRows.filter(row => String(row.status || "").toLowerCase() === "certified").length}</strong></div>
                <Link className="pmx-subtle-link" href={withProject("/projectmanagement/bills")}>Open contracts and bills <span aria-hidden="true">→</span></Link>
              </article>
            </div>
          </section>

          <section className="pmx-panel pmx-activity-panel" aria-labelledby="pmx-activity-heading">
            <div className="pmx-panel-heading pmx-activity-heading">
              <div><span className="pmx-section-kicker">RECENT ACTIVITY</span><h3 id="pmx-activity-heading">Latest ledger entries</h3><p>The eight most recent matching transactions</p></div>
              <Link href={withProject("/projectmanagement/ledger")}>Full ledger <span aria-hidden="true">→</span></Link>
            </div>
            <div className="pmx-activity-controls">
              <div className="pmx-filter-pills" role="group" aria-label="Filter recent transactions">
                {(["all", "income", "expenses"] as const).map(choice => <button type="button"
                  key={choice} className={filter === choice ? "is-active" : ""} aria-pressed={filter === choice}
                  onClick={() => setFilter(choice)}>{choice === "all" ? "All activity" : choice === "income" ? "Income" : "Expenses"}</button>)}
              </div>
              <input aria-label="Search recent ledger entries" placeholder="Search entries, category, recipient…" value={search}
                onChange={event => setSearch(event.target.value)} />
            </div>
            <div className="pmx-table-scroll">
              <table className="pmx-table">
                <thead><tr><th>Date</th><th>Details / party</th><th>Category</th><th>Type</th><th className="pmx-money-cell">Amount</th></tr></thead>
                <tbody>
                  {lastRows.map((entry, index) => {
                    const isIncome = amount(entry.debit) > 0;
                    return <tr key={entry.id || String(index)}>
                      <td className="pmx-muted-cell">{dateLabel(entry.entry_date)}</td>
                      <td><strong>{entry.details || "Project transaction"}</strong><small>{isIncome ? entry.received_from || "Received" : entry.paid_to || entry.supplier || "Payment recipient not recorded"}</small></td>
                      <td className="pmx-muted-cell">{entry.category || "Other Expenses"}</td>
                      <td><span className={"pmx-type-pill " + (isIncome ? "pmx-type-income" : "pmx-type-expense")}>{isIncome ? "Income" : "Expense"}</span></td>
                      <td className={"pmx-money-cell " + (isIncome ? "pmx-amount-income" : "pmx-amount-expense")}>{isIncome ? "+" : "−"}{money(isIncome ? entry.debit : entry.credit)}</td>
                    </tr>;
                  })}
                  {!lastRows.length && <tr><td colSpan={5} className="pmx-no-transactions">No transactions match these filters.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="pmx-shortcuts" aria-label="Project Management shortcuts">
            <Link href={withProject("/projectmanagement/income")}><span className="pmx-shortcut-icon">↙</span><strong>Income Ledger</strong><small>Add and review deposits</small><span className="pmx-shortcut-arrow" aria-hidden="true">→</span></Link>
            <Link href={withProject("/projectmanagement/expenses")}><span className="pmx-shortcut-icon">↗</span><strong>Expense Ledger</strong><small>Payees and outgoing cash</small><span className="pmx-shortcut-arrow" aria-hidden="true">→</span></Link>
            <Link href={withProject("/projectmanagement/parties")}><span className="pmx-shortcut-icon">♧</span><strong>Project Parties</strong><small>Suppliers and contractors</small><span className="pmx-shortcut-arrow" aria-hidden="true">→</span></Link>
            <Link href={withProject("/projectmanagement/reports")}><span className="pmx-shortcut-icon">▥</span><strong>Reports</strong><small>Monthly finance statements</small><span className="pmx-shortcut-arrow" aria-hidden="true">→</span></Link>
          </section>
          {!data?.readOnly && <section className="pmx-operations" aria-label="Connected project operations">
            <div className="pmx-operations-title"><span className="pmx-section-kicker">BEYOND FINANCE</span><h3>Continue managing the project</h3><p>Go directly to existing project operations tools without duplicating records.</p></div>
            <div className="pmx-operations-grid">
              <Link href="/admin/projects"><strong>Project records</strong><span>Details, status and project documents</span><b aria-hidden="true">→</b></Link>
              <Link href="/admin/todo"><strong>To Do</strong><span>Daily tasks and assignments</span><b aria-hidden="true">→</b></Link>
              <Link href="/admin/workflow"><strong>Service workflow</strong><span>Design, approval and construction stages</span><b aria-hidden="true">→</b></Link>
              <Link href="/admin/site-visits"><strong>Site visits</strong><span>Inspection reports and field updates</span><b aria-hidden="true">→</b></Link>
            </div>
          </section>}
        </>
      )}
    </main>
  );
}
