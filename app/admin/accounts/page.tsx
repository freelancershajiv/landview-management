"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { landViewApi, type FinanceSheetData } from "@/lib/api";

type LedgerType = "Income" | "Expense";
type ViewMode = "ledger" | "income" | "expenses" | "reports";

type LedgerRow = {
  id: string;
  type: LedgerType;
  date: string;
  fileId: string;
  projectName: string;
  category: string;
  description: string;
  amount: number;
  status: string;
  person: string;
  paymentMethod: string;
  reference: string;
  search: string;
};

type Filters = {
  query: string;
  year: string;
  fileId: string;
  category: string;
  status: string;
  from: string;
  to: string;
};

type Summary = {
  income: number;
  expense: number;
  pending: number;
  net: number;
  incomeCount: number;
  expenseCount: number;
  pendingCount: number;
};

const EMPTY_FILTERS: Filters = {
  query: "",
  year: "",
  fileId: "",
  category: "",
  status: "",
  from: "",
  to: "",
};

const t = (value: unknown) => String(value ?? "").trim();
const number = (value: unknown) => {
  const parsed = Number(String(value ?? 0).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value: number) =>
  new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 2,
  }).format(value);

function records(data: FinanceSheetData | null) {
  if (!data) return [] as Record<string, string>[];
  return (data.rows || []).map((row) => {
    const result: Record<string, string> = {};
    (data.headers || []).forEach((header, index) => {
      const key = t(header);
      if (key) result[key] = t(row[index]);
    });
    return result;
  });
}

function parseDate(value: unknown) {
  const raw = t(value);
  if (!raw) return null;
  if (/^\d{5}(?:\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
      return new Date(1899, 11, 30 + Math.floor(serial));
    }
  }
  const direct = Date.parse(raw);
  if (!Number.isNaN(direct)) return new Date(direct);
  const match = raw.match(/^(\d{1,2})[-/ ]([A-Za-z]{3}|\d{1,2})[-/ ](\d{4})$/);
  if (!match) return null;
  const months: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
  };
  const month = /^\d+$/.test(match[2]) ? Number(match[2]) - 1 : months[match[2].toLowerCase()];
  if (month === undefined || month < 0 || month > 11) return null;
  return new Date(Number(match[3]), month, Number(match[1]));
}

function dateKey(value: unknown) {
  const d = parseDate(value);
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function yearKey(value: unknown) {
  const key = dateKey(value);
  return key ? key.slice(0, 4) : "";
}
function displayDate(value: unknown) {
  const d = parseDate(value);
  return d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : t(value) || "—";
}

function toIncomeRows(data: FinanceSheetData | null): LedgerRow[] {
  return records(data)
    .map((record) => {
      const row: LedgerRow = {
        id: t(record.Income_ID || record.Payment_ID),
        type: "Income",
        date: t(record.Payment_Date || record.Date),
        fileId: t(record.File_ID || record.Project_ID),
        projectName: t(record.Project_Name),
        category: t(record.Income_Category || record.Category) || "Other Income",
        description: t(record.Payment_For || record.Description) || "Income received",
        amount: number(record.Amount),
        status: t(record.Approval_Status || record.Status) || "Received",
        person: t(record.Received_From || record.Client_Name || record.Received_By),
        paymentMethod: t(record.Payment_Method),
        reference: t(record.Reference_No || record.Reference),
        search: "",
      };
      row.search = Object.values(row).join(" ").toLowerCase();
      return row;
    })
    .filter((row) => row.id);
}

function toExpenseRows(data: FinanceSheetData | null): LedgerRow[] {
  return records(data)
    .map((record) => {
      const row: LedgerRow = {
        id: t(record.Expense_ID),
        type: "Expense",
        date: t(record.Expense_Date || record.Date),
        fileId: t(record.File_ID || record.Project_ID),
        projectName: t(record.Project_Name),
        category: t(record.Category || record.Expense_Category) || "Miscellaneous",
        description: t(record.Description || record.Particulars) || "Office expense",
        amount: number(record.Amount),
        status: t(record.Approval_Status || record.Status) || "Approved",
        person: t(record.Paid_To || record.Requested_By || record.Created_By),
        paymentMethod: t(record.Payment_Method),
        reference: t(record.Reference_No || record.Reference),
        search: "",
      };
      row.search = Object.values(row).join(" ").toLowerCase();
      return row;
    })
    .filter((row) => row.id);
}

function summarize(rows: LedgerRow[]): Summary {
  const effectiveIncome = rows.filter((row) => row.type === "Income" && !["pending", "rejected", "returned"].includes(row.status.toLowerCase()));
  const approvedExpense = rows.filter((row) => row.type === "Expense" && row.status.toLowerCase() === "approved");
  const pendingRows = rows.filter((row) => row.status.toLowerCase() === "pending");
  const income = effectiveIncome.reduce((sum, row) => sum + row.amount, 0);
  const expense = approvedExpense.reduce((sum, row) => sum + row.amount, 0);
  return {
    income,
    expense,
    pending: pendingRows.reduce((sum, row) => sum + row.amount, 0),
    net: income - expense,
    incomeCount: effectiveIncome.length,
    expenseCount: approvedExpense.length,
    pendingCount: pendingRows.length,
  };
}

export default function AccountsLedgerPage() {
  const [incomeData, setIncomeData] = useState<FinanceSheetData | null>(null);
  const [expenseData, setExpenseData] = useState<FinanceSheetData | null>(null);
  const [mode, setMode] = useState<ViewMode>("ledger");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      landViewApi.getFinanceSheet("Accounting Income"),
      landViewApi.getFinanceSheet("Accounting Expenses"),
    ])
      .then(([income, expenses]) => {
        if (cancelled) return;
        setIncomeData(income);
        setExpenseData(expenses);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the accounts ledger.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [revision]);

  const allRows = useMemo(() => {
    return [...toIncomeRows(incomeData), ...toExpenseRows(expenseData)].sort(
      (a, b) => (parseDate(b.date)?.getTime() || 0) - (parseDate(a.date)?.getTime() || 0),
    );
  }, [incomeData, expenseData]);

  const years = useMemo(() => [...new Set(allRows.map((row) => yearKey(row.date)).filter(Boolean))].sort((a, b) => b.localeCompare(a)), [allRows]);
  const fileIds = useMemo(() => [...new Set(allRows.map((row) => row.fileId).filter(Boolean))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), [allRows]);
  const categories = useMemo(() => [...new Set(allRows.map((row) => row.category).filter(Boolean))].sort(), [allRows]);
  const statuses = useMemo(() => [...new Set(allRows.map((row) => row.status).filter(Boolean))].sort(), [allRows]);

  const filteredRows = useMemo(() => allRows.filter((row) => {
    if (mode === "income" && row.type !== "Income") return false;
    if (mode === "expenses" && row.type !== "Expense") return false;
    const query = filters.query.trim().toLowerCase();
    if (query && !row.search.includes(query)) return false;
    if (filters.year && yearKey(row.date) !== filters.year) return false;
    if (filters.fileId && row.fileId !== filters.fileId) return false;
    if (filters.category && row.category !== filters.category) return false;
    if (filters.status && row.status !== filters.status) return false;
    const key = dateKey(row.date);
    if (filters.from && (!key || key < filters.from)) return false;
    if (filters.to && (!key || key > filters.to)) return false;
    return true;
  }), [allRows, filters, mode]);

  const summary = useMemo(() => summarize(filteredRows), [filteredRows]);
  const overall = useMemo(() => summarize(allRows), [allRows]);
  const yearly = useMemo(() => years.map((year) => {
    const rows = allRows.filter((row) => yearKey(row.date) === year);
    return { year, rows: rows.length, ...summarize(rows) };
  }), [allRows, years]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { category: string; income: number; expense: number; count: number }>();
    filteredRows.forEach((row) => {
      const item = map.get(row.category) || { category: row.category, income: 0, expense: 0, count: 0 };
      if (row.type === "Income" && !["pending", "rejected", "returned"].includes(row.status.toLowerCase())) item.income += row.amount;
      if (row.type === "Expense" && row.status.toLowerCase() === "approved") item.expense += row.amount;
      item.count += 1;
      map.set(row.category, item);
    });
    return [...map.values()].sort((a, b) => Math.max(b.income, b.expense) - Math.max(a.income, a.expense)).slice(0, 12);
  }, [filteredRows]);

  const pages = Math.max(1, Math.ceil(filteredRows.length / 40));
  const currentPage = Math.min(page, pages - 1);
  const shown = filteredRows.slice(currentPage * 40, (currentPage + 1) * 40);

  function patchFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(0);
  }
  function selectMode(next: ViewMode) {
    setMode(next);
    setPage(0);
  }
  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setPage(0);
  }
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <main className="accounts-page">
      <style>{`
        .accounts-page{max-width:1480px;margin:0 auto;color:#edf1f4}.accounts-page *{box-sizing:border-box}
        .ac-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:20px}.ac-eyebrow{display:block;color:#e65555;font-size:10px;font-weight:900;letter-spacing:.16em}.ac-head h1{margin:6px 0 7px;font-size:34px;line-height:1}.ac-head p{margin:0;max-width:700px;color:#85919a;font-size:11px;line-height:1.65}.ac-actions{display:flex;gap:8px;flex-wrap:wrap}.ac-btn{display:inline-flex;align-items:center;justify-content:center;min-height:38px;border:1px solid #35424b;border-radius:8px;background:#131c23;color:#edf1f4;padding:0 12px;font-size:10px;font-weight:900;text-decoration:none;cursor:pointer}.ac-btn.primary{background:#c9242b;border-color:#c9242b}.ac-btn:disabled{opacity:.45;cursor:not-allowed}
        .ac-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}.ac-card{padding:15px;border:1px solid #28343d;border-radius:11px;background:#0f171e}.ac-card span{display:block;color:#7a8790;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.07em}.ac-card strong{display:block;margin-top:7px;font-size:22px}.ac-card small{display:block;margin-top:5px;color:#687680;font-size:9px}.ac-card.income strong{color:#8bd9a7}.ac-card.expense strong{color:#ffaaa5}.ac-card.pending strong{color:#e9c37b}
        .ac-toolbar{display:flex;align-items:center;gap:9px;padding:10px;border:1px solid #28343d;border-radius:11px;background:#0f171e;margin-bottom:12px}.ac-search{flex:1;min-width:220px}.ac-toolbar input,.ac-toolbar select,.ac-advanced input,.ac-advanced select{width:100%;border:1px solid #33414b;border-radius:7px;background:#0a1116;color:#ecf1f4;padding:9px 10px;font-size:10px}.ac-toolbar input::placeholder,.ac-advanced input::placeholder{color:#65737c}.ac-year{width:125px}.ac-filter-toggle{white-space:nowrap}.ac-filter-count{display:inline-flex;align-items:center;justify-content:center;min-width:17px;height:17px;margin-left:5px;border-radius:999px;background:#c9242b;color:#fff;font-size:8px}.ac-advanced{display:grid;grid-template-columns:1fr 1.2fr 1fr 140px 140px auto;gap:8px;padding:11px;border:1px solid #28343d;border-radius:11px;background:#0d151b;margin:-3px 0 12px}.ac-advanced .ac-btn{height:35px}
        .ac-tabs{display:flex;gap:4px;border-bottom:1px solid #28343d;margin-bottom:12px;overflow:auto}.ac-tabs button{white-space:nowrap;border:0;border-bottom:2px solid transparent;background:transparent;color:#73808a;padding:10px 13px;font-size:10px;font-weight:900;cursor:pointer}.ac-tabs button.active{color:#fff;border-bottom-color:#cf3036}
        .ac-panel{overflow:hidden;border:1px solid #28343d;border-radius:11px;background:#0f171e}.ac-panel-head{display:flex;justify-content:space-between;gap:15px;align-items:center;padding:13px 14px;border-bottom:1px solid #28343d}.ac-panel-head h2{margin:0;font-size:15px}.ac-panel-head span{color:#74818a;font-size:9px}.ac-table-wrap{overflow:auto}.ac-table{width:100%;border-collapse:collapse;min-width:930px}.ac-table th{position:sticky;top:0;background:#151f27;color:#7c8992;text-align:left;font-size:8px;text-transform:uppercase;letter-spacing:.06em;padding:9px 11px;border-bottom:1px solid #33404a}.ac-table td{padding:11px;border-bottom:1px solid #222d35;font-size:10px;vertical-align:top}.ac-table tbody tr:hover td{background:#121c23}.ac-table .detail{max-width:470px}.ac-table .detail strong{display:block;font-size:11px}.ac-sub{display:block;margin-top:4px;color:#6f7d87;font-size:8px;line-height:1.5}.ac-project{font-weight:800;color:#e07b78}.ac-type{display:inline-flex;padding:3px 6px;border-radius:999px;font-size:8px;font-weight:900}.ac-type.income{background:#153523;color:#93deb0}.ac-type.expense{background:#3a1e20;color:#ffaaa6}.ac-status{display:inline-flex;padding:3px 6px;border-radius:999px;background:#202b33;color:#bac4ca;font-size:8px}.ac-status.pending{background:#3b321c;color:#efd28e}.ac-status.rejected,.ac-status.returned{background:#3b1f21;color:#ffaca8}.ac-amount{font-size:11px;font-weight:900;white-space:nowrap}.ac-amount.income{color:#8bd9a7}.ac-amount.expense{color:#ffaaa5}.ac-empty{padding:34px;text-align:center;color:#74818a;font-size:10px}.ac-footer{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 13px;color:#6f7c85;font-size:9px}.ac-footer div{display:flex;gap:6px}.ac-footer button{border:1px solid #33404a;border-radius:6px;background:#151f27;color:#d9e0e4;padding:6px 9px;font-size:9px;cursor:pointer}.ac-footer button:disabled{opacity:.35}
        .ac-report-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ac-report{border:1px solid #28343d;border-radius:11px;background:#0f171e;padding:15px}.ac-report h3{margin:0 0 12px;font-size:14px}.ac-year-row,.ac-category-row{display:grid;grid-template-columns:80px 1fr 1fr 1fr;gap:8px;align-items:center;padding:9px 0;border-bottom:1px solid #222d35;font-size:9px}.ac-category-row{grid-template-columns:minmax(150px,1.5fr) 1fr 1fr 70px}.ac-year-row:last-child,.ac-category-row:last-child{border-bottom:0}.ac-report .positive{color:#8bd9a7}.ac-report .negative{color:#ffaaa5}.ac-error{margin-bottom:12px;padding:10px 12px;border:1px solid #6f3337;border-radius:8px;background:#351c1e;color:#ffb3af;font-size:10px}.ac-loading{padding:32px;text-align:center;color:#75828b;font-size:10px}.ac-print{display:none}
        @media(max-width:1050px){.ac-summary{grid-template-columns:repeat(2,1fr)}.ac-advanced{grid-template-columns:repeat(3,1fr)}.ac-report-grid{grid-template-columns:1fr}}
        @media(max-width:720px){.ac-head{align-items:flex-start;flex-direction:column}.ac-head h1{font-size:30px}.ac-summary{grid-template-columns:1fr 1fr}.ac-toolbar{align-items:stretch;flex-wrap:wrap}.ac-search{flex-basis:100%}.ac-year{width:auto;flex:1}.ac-advanced{grid-template-columns:1fr}.ac-tabs{margin-top:4px}}
        @media(max-width:480px){.ac-summary{grid-template-columns:1fr}}
        @media print{.ac-actions,.ac-toolbar,.ac-advanced,.ac-tabs,.ac-footer{display:none!important}.accounts-page{color:#111}.ac-card,.ac-panel,.ac-report{background:#fff;border-color:#ccc}.ac-table th{background:#eee;color:#333}.ac-table td{color:#111}.ac-sub{color:#555}.ac-print{display:block}}
      `}</style>

      <header className="ac-head">
        <div>
          <span className="ac-eyebrow">LAND VIEW · ACCOUNTS</span>
          <h1>Accounts ledger</h1>
          <p>Review money in, approved money out, and items still waiting for approval. Search first; use detailed filters only when you need them.</p>
        </div>
        <div className="ac-actions">
          <button className="ac-btn" disabled={loading} onClick={() => setRevision((value) => value + 1)}>↻ Refresh</button>
          <button className="ac-btn" disabled={loading || !filteredRows.length} onClick={() => window.print()}>Print / PDF</button>
          <Link className="ac-btn primary" href="/admin/accounts/entry">+ New transaction</Link>
        </div>
      </header>

      {error && <div className="ac-error">{error}</div>}

      <section className="ac-summary">
        <article className="ac-card income"><span>Income</span><strong>{money(summary.income)}</strong><small>{summary.incomeCount.toLocaleString("en-BD")} effective receipts</small></article>
        <article className="ac-card expense"><span>Approved expenses</span><strong>{money(summary.expense)}</strong><small>{summary.expenseCount.toLocaleString("en-BD")} approved records</small></article>
        <article className="ac-card"><span>Net movement</span><strong>{money(summary.net)}</strong><small>Income minus approved expenses</small></article>
        <article className="ac-card pending"><span>Waiting approval</span><strong>{money(summary.pending)}</strong><small>{summary.pendingCount.toLocaleString("en-BD")} pending transactions</small></article>
      </section>

      <nav className="ac-tabs" aria-label="Accounts views">
        {(["ledger", "income", "expenses", "reports"] as ViewMode[]).map((item) => (
          <button key={item} className={mode === item ? "active" : ""} onClick={() => selectMode(item)}>
            {item === "ledger" ? "All ledger" : item === "income" ? "Income" : item === "expenses" ? "Expenses" : "Reports"}
          </button>
        ))}
      </nav>

      <section className="ac-toolbar">
        <input className="ac-search" type="search" value={filters.query} placeholder="Search ID, project, description, person, reference…" onChange={(event) => patchFilter("query", event.target.value)} />
        <select className="ac-year" value={filters.year} onChange={(event) => patchFilter("year", event.target.value)}>
          <option value="">All years</option>
          {years.map((year) => <option key={year}>{year}</option>)}
        </select>
        <button className="ac-btn ac-filter-toggle" onClick={() => setShowAdvanced((value) => !value)}>
          Filters{activeFilterCount > (filters.query ? 1 : 0) + (filters.year ? 1 : 0) ? <span className="ac-filter-count">{activeFilterCount - (filters.query ? 1 : 0) - (filters.year ? 1 : 0)}</span> : null}
        </button>
        {activeFilterCount > 0 && <button className="ac-btn" onClick={clearFilters}>Clear</button>}
      </section>

      {showAdvanced && (
        <section className="ac-advanced">
          <select value={filters.fileId} onChange={(event) => patchFilter("fileId", event.target.value)}><option value="">All projects</option>{fileIds.map((id) => <option key={id}>{id}</option>)}</select>
          <select value={filters.category} onChange={(event) => patchFilter("category", event.target.value)}><option value="">All categories</option>{categories.map((value) => <option key={value}>{value}</option>)}</select>
          <select value={filters.status} onChange={(event) => patchFilter("status", event.target.value)}><option value="">All statuses</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select>
          <input type="date" value={filters.from} aria-label="From date" onChange={(event) => patchFilter("from", event.target.value)} />
          <input type="date" value={filters.to} aria-label="To date" onChange={(event) => patchFilter("to", event.target.value)} />
          <button className="ac-btn" onClick={clearFilters}>Reset filters</button>
        </section>
      )}

      {mode === "reports" ? (
        <section className="ac-report-grid">
          <article className="ac-report">
            <h3>Yearly performance</h3>
            <div className="ac-year-row"><b>Year</b><b>Income</b><b>Expense</b><b>Net</b></div>
            {yearly.map((item) => (
              <div className="ac-year-row" key={item.year}>
                <b>{item.year}</b><span className="positive">{money(item.income)}</span><span className="negative">{money(item.expense)}</span><span>{money(item.net)}</span>
              </div>
            ))}
            {!yearly.length && <div className="ac-empty">No yearly data available.</div>}
          </article>
          <article className="ac-report">
            <h3>Top categories in current view</h3>
            <div className="ac-category-row"><b>Category</b><b>Income</b><b>Expense</b><b>Entries</b></div>
            {categoryBreakdown.map((item) => (
              <div className="ac-category-row" key={item.category}>
                <b>{item.category}</b><span className="positive">{money(item.income)}</span><span className="negative">{money(item.expense)}</span><span>{item.count}</span>
              </div>
            ))}
            {!categoryBreakdown.length && <div className="ac-empty">No category data in this view.</div>}
          </article>
          <article className="ac-report" style={{ gridColumn: "1 / -1" }}>
            <h3>Current ledger position</h3>
            <div className="ac-category-row"><b>Scope</b><b>Income</b><b>Expense</b><b>Net</b></div>
            <div className="ac-category-row"><b>Filtered view</b><span className="positive">{money(summary.income)}</span><span className="negative">{money(summary.expense)}</span><span>{money(summary.net)}</span></div>
            <div className="ac-category-row"><b>All records</b><span className="positive">{money(overall.income)}</span><span className="negative">{money(overall.expense)}</span><span>{money(overall.net)}</span></div>
          </article>
        </section>
      ) : (
        <section className="ac-panel">
          <div className="ac-panel-head"><h2>{mode === "income" ? "Income register" : mode === "expenses" ? "Expense register" : "All transactions"}</h2><span>{filteredRows.length.toLocaleString("en-BD")} matching records</span></div>
          {loading ? <div className="ac-loading">Loading accounts…</div> : (
            <>
              <div className="ac-table-wrap">
                <table className="ac-table">
                  <thead><tr><th>Date</th><th>Details</th><th>Project</th><th>Category</th><th>Status</th><th>Amount</th></tr></thead>
                  <tbody>
                    {shown.map((row) => {
                      const statusClass = row.status.toLowerCase().replace(/\s+/g, "-");
                      return (
                        <tr key={`${row.type}-${row.id}`}>
                          <td>{displayDate(row.date)}<span className={`ac-type ${row.type.toLowerCase()}`}>{row.type}</span></td>
                          <td className="detail"><strong>{row.description}</strong><span className="ac-sub">{row.id}{row.person ? ` · ${row.person}` : ""}{row.paymentMethod ? ` · ${row.paymentMethod}` : ""}{row.reference ? ` · Ref ${row.reference}` : ""}</span></td>
                          <td><span className="ac-project">{row.fileId || "—"}</span>{row.projectName && <span className="ac-sub">{row.projectName}</span>}</td>
                          <td>{row.category}</td>
                          <td><span className={`ac-status ${statusClass}`}>{row.status}</span></td>
                          <td><span className={`ac-amount ${row.type.toLowerCase()}`}>{row.type === "Income" ? "+" : "−"}{money(row.amount)}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {!shown.length && <div className="ac-empty">No transactions match this view.</div>}
              </div>
              <div className="ac-footer"><span>Showing {shown.length ? currentPage * 40 + 1 : 0}–{Math.min((currentPage + 1) * 40, filteredRows.length)} of {filteredRows.length}</span><div><button disabled={currentPage <= 0} onClick={() => setPage((value) => Math.max(0, value - 1))}>Previous</button><button disabled={currentPage >= pages - 1} onClick={() => setPage((value) => Math.min(pages - 1, value + 1))}>Next</button></div></div>
            </>
          )}
        </section>
      )}

      <div className="ac-print">LAND VIEW Engineers & Architects · Accounts Ledger</div>
    </main>
  );
}
