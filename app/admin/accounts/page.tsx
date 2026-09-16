"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";

type ViewMode = "dashboard" | "income" | "expenses" | "ledger" | "reports";
type LedgerType = "Income" | "Expense";
type Row = {
  id: string;
  type: LedgerType;
  date: string;
  projectId: string;
  category: string;
  description: string;
  amount: number;
  status: string;
  method: string;
  account: string;
  reference: string;
  party: string;
  search: string;
};
type RunningRow = Row & { debit: number; credit: number; balance: number };

const FINANCE_URL = "https://docs.google.com/spreadsheets/d/1RDbzIr4aaysiB-UTZQKRK6m60HLg3zSZVzNrdgnGHBc/edit";
const LEDGER_YEAR = "2026";
const LEDGER_OPENING_BALANCE = -389456;
const LEDGER_LIVE_START = "2026-09-01";
const LEDGER_END = "2026-12-31";
const DHAKA_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Dhaka",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function text(value: unknown) { return String(value ?? "").trim(); }
function field(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
}
function amount(value: unknown) {
  const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function money(value: number) {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(value || 0);
}
function ledgerMoney(value: number) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}
function normalizeStatus(value: unknown) {
  return text(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}
function paymentEffective(record: Record<string, unknown>) {
  const type = normalizeStatus(field(record, ["Transaction_Type", "Transaction Type"]));
  if (type === "personal income") return false;
  const impact = normalizeStatus(field(record, ["Affects_Business_Balance", "Affects Business Balance"]));
  if (["false", "no", "0"].includes(impact)) return false;
  const status = normalizeStatus(field(record, ["Approval_Status", "Approval Status", "Status"]));
  return !status || ["approved", "received", "paid", "verified", "complete", "completed", "full paid", "fully paid"].includes(status);
}
function expensePostedStatus(value: unknown) {
  const status = normalizeStatus(value);
  return !status || ["approved", "paid", "complete", "completed"].includes(status);
}
function dhakaDateKey(date: Date) {
  const parts = DHAKA_DATE.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";
  return year && month && day ? `${year}-${month}-${day}` : "";
}
function dateKey(value: unknown) {
  const raw = text(value);
  if (!raw) return "";

  const exactIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (exactIso) return `${exactIso[1]}-${exactIso[2]}-${exactIso[3]}`;

  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\D|$)/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return dhakaDateKey(parsed);

  const prefixedIso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (prefixedIso) return `${prefixedIso[1]}-${prefixedIso[2]}-${prefixedIso[3]}`;
  return raw;
}
function displayDate(value: string) {
  const key = dateKey(value);
  if (!key) return "—";
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month || !day) return value || "—";
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
function financeSheetToRecords(data: { headers?: string[]; rows?: string[][] }) {
  return (data.rows || []).map((cells) => {
    const record: Record<string, unknown> = {};
    (data.headers || []).forEach((header, index) => {
      const key = text(header);
      if (key) record[key] = cells[index] ?? "";
    });
    return record;
  });
}

export default function AccountsPage() {
  const [payments, setPayments] = useState<Record<string, unknown>[]>([]);
  const [expenses, setExpenses] = useState<Record<string, unknown>[]>([]);
  const [transactions, setTransactions] = useState<Record<string, unknown>[]>([]);
  const [mode, setMode] = useState<ViewMode>("dashboard");
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      landViewApi.getPayments(),
      landViewApi.getErpRecords("expenses"),
      landViewApi.getFinanceSheet("Transactions"),
    ])
      .then(([paymentRows, expenseRows, transactionSheet]) => {
        if (cancelled) return;
        setPayments(paymentRows || []);
        setExpenses(expenseRows || []);
        setTransactions(financeSheetToRecords(transactionSheet));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load Accounts.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [revision]);

  const incomeRows = useMemo<Row[]>(() => payments.filter(paymentEffective).map((record) => {
    const row: Row = {
      id: text(field(record, ["Payment_ID", "Payment ID", "PaymentId"])),
      type: "Income",
      date: text(field(record, ["Payment_Date", "Payment Date", "Date"])),
      projectId: text(field(record, ["Project_ID", "Project ID", "ProjectId"])),
      category: text(field(record, ["Income_Category", "Income Category", "Payment_For", "Payment For", "Category"])) || "Other Income",
      description: text(field(record, ["Payment_For", "Payment For", "Description"])) || "Client payment",
      amount: amount(field(record, ["Amount", "Payment_Amount", "Payment Amount"])),
      status: text(field(record, ["Approval_Status", "Approval Status", "Status"])) || "Received",
      method: text(field(record, ["Payment_Method", "Payment Method", "Method"])),
      account: text(field(record, ["Deposit_Account", "Deposit Account", "Account", "Account_Name", "Account Name"])),
      reference: text(field(record, ["Reference_No", "Reference No", "Reference"])),
      party: text(field(record, ["Received_From", "Received From", "Payer", "Client_Name", "Client Name"])),
      search: "",
    };
    row.search = Object.values(row).join(" ").toLowerCase();
    return row;
  }).filter((row) => row.id && row.date && row.amount > 0), [payments]);

  const expenseRows = useMemo<Row[]>(() => expenses.map((record) => {
    const status = text(field(record, ["Approval_Status", "Approval Status", "Status"])) || "Pending";
    const row: Row = {
      id: text(field(record, ["Expense_ID", "Expense ID", "ExpenseId"])),
      type: "Expense",
      date: text(field(record, ["Expense_Date", "Expense Date", "Date"])),
      projectId: text(field(record, ["Project_ID", "Project ID", "ProjectId"])),
      category: text(field(record, ["Category", "Expense_Category", "Expense Category"])) || "Miscellaneous",
      description: text(field(record, ["Description", "Particulars", "Expense"])) || "Expense",
      amount: amount(field(record, ["Amount", "Expense_Amount", "Expense Amount"])),
      status,
      method: text(field(record, ["Payment_Method", "Payment Method", "Method"])),
      account: text(field(record, ["Paid_From", "Paid From", "Account", "Account_Name", "Account Name"])),
      reference: text(field(record, ["Reference_No", "Reference No", "Reference"])),
      party: text(field(record, ["Paid_To", "Paid To", "Payee", "Vendor"])),
      search: "",
    };
    row.search = Object.values(row).join(" ").toLowerCase();
    return row;
  }).filter((row) => row.id && row.date && row.amount > 0), [expenses]);

  const postedExpenses = useMemo(() => expenseRows.filter((row) => expensePostedStatus(row.status)), [expenseRows]);
  const allRows = useMemo(() => [...incomeRows, ...expenseRows].sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)) || b.id.localeCompare(a.id)), [incomeRows, expenseRows]);

  const ledgerRows = useMemo<RunningRow[]>(() => {
    const normalized = transactions.map((record) => {
      const id = text(field(record, ["Transaction_ID", "Transaction ID", "TransactionId"]));
      const date = text(field(record, ["Transaction_Date", "Transaction Date", "Date"]));
      const projectId = text(field(record, ["Project_ID", "Project ID", "ProjectId"]));
      const category = text(field(record, ["Category"])) || "Uncategorized";
      const description = text(field(record, ["Description", "Particulars"])) || category;
      const status = text(field(record, ["Status"])) || "Posted";
      const method = text(field(record, ["Payment_Method", "Payment Method", "Method"]));
      const account = text(field(record, ["Account", "Account_Name", "Account Name"]));
      const reference = text(field(record, ["Reference_No", "Reference No", "Reference"]));
      const transactionType = normalizeStatus(field(record, ["Transaction_Type", "Transaction Type", "Type"]));
      const direction = text(field(record, ["Direction"])).toUpperCase();
      const fallbackAmount = amount(field(record, ["Amount"]));
      let debit = amount(field(record, ["Debit"]));
      let credit = amount(field(record, ["Credit"]));

      if (!debit && !credit && fallbackAmount > 0) {
        if (direction === "DEBIT" || transactionType === "expense") debit = fallbackAmount;
        if (direction === "CREDIT" || transactionType === "income") credit = fallbackAmount;
      }

      const row: Row = {
        id,
        type: credit >= debit ? "Income" : "Expense",
        date,
        projectId,
        category,
        description,
        amount: Math.max(debit, credit, fallbackAmount),
        status,
        method,
        account,
        reference,
        party: "",
        search: "",
      };
      row.search = [
        ...Object.values(row),
        field(record, ["Source_Type", "Source Type"]),
        field(record, ["Source_ID", "Source ID"]),
        field(record, ["Created_By", "Created By"]),
      ].join(" ").toLowerCase();

      return {
        row,
        debit,
        credit,
        transactionType,
        isHistory: id.startsWith("TXN-HIST-2026-"),
      };
    }).filter((item) => item.row.id && item.row.date && (item.debit > 0 || item.credit > 0));

    const history = normalized
      .filter((item) => item.isHistory && dateKey(item.row.date).startsWith(`${LEDGER_YEAR}-`))
      .sort((a, b) => a.row.id.localeCompare(b.row.id));

    const live = normalized
      .filter((item) => {
        if (item.isHistory) return false;
        if (normalizeStatus(item.row.status) !== "posted") return false;
        if (item.transactionType === "transfer") return false;
        const key = dateKey(item.row.date);
        return key >= LEDGER_LIVE_START && key <= LEDGER_END;
      })
      .sort((a, b) => dateKey(a.row.date).localeCompare(dateKey(b.row.date)) || a.row.id.localeCompare(b.row.id));

    let balance = LEDGER_OPENING_BALANCE;
    return [...history, ...live].map((item) => {
      balance += item.credit - item.debit;
      return { ...item.row, debit: item.debit, credit: item.credit, balance };
    });
  }, [transactions]);

  const years = useMemo(() => [...new Set(allRows.map((row) => dateKey(row.date).slice(0, 4)).filter(Boolean))].sort((a, b) => b.localeCompare(a)), [allRows]);
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    return allRows.filter((row) => {
      if (mode === "income" && row.type !== "Income") return false;
      if (mode === "expenses" && row.type !== "Expense") return false;
      if (term && !row.search.includes(term)) return false;
      if (year && dateKey(row.date).slice(0, 4) !== year) return false;
      return true;
    });
  }, [allRows, mode, query, year]);
  const filteredLedger = useMemo(() => {
    const term = query.trim().toLowerCase();
    return ledgerRows.filter((row) => !term || row.search.includes(term));
  }, [ledgerRows, query]);

  const totals = useMemo(() => {
    const income = incomeRows.reduce((sum, row) => sum + row.amount, 0);
    const approvedExpense = postedExpenses.reduce((sum, row) => sum + row.amount, 0);
    const pendingExpense = expenseRows.filter((row) => normalizeStatus(row.status) === "pending").reduce((sum, row) => sum + row.amount, 0);
    return { income, approvedExpense, pendingExpense, net: income - approvedExpense };
  }, [incomeRows, expenseRows, postedExpenses]);

  const ledgerTotals = useMemo(() => {
    const credit = ledgerRows.reduce((sum, row) => sum + row.credit, 0);
    const debit = ledgerRows.reduce((sum, row) => sum + row.debit, 0);
    const balance = ledgerRows.length ? ledgerRows[ledgerRows.length - 1].balance : LEDGER_OPENING_BALANCE;
    return { credit, debit, balance };
  }, [ledgerRows]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { category: string; income: number; expense: number }>();
    incomeRows.forEach((row) => {
      const current = map.get(row.category) || { category: row.category, income: 0, expense: 0 };
      current.income += row.amount;
      map.set(row.category, current);
    });
    postedExpenses.forEach((row) => {
      const current = map.get(row.category) || { category: row.category, income: 0, expense: 0 };
      current.expense += row.amount;
      map.set(row.category, current);
    });
    return [...map.values()].sort((a, b) => (b.income + b.expense) - (a.income + a.expense));
  }, [incomeRows, postedExpenses]);

  return <div className="accounts-page">
    <style>{`
      .accounts-page{color:#e8edf1}.accounts-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:20px}.accounts-head small{display:block;color:#ef6c66;font-weight:900;letter-spacing:.11em}.accounts-head h1{font-size:34px;margin:5px 0 0}.accounts-actions{display:flex;gap:8px;flex-wrap:wrap}.accounts-btn{border:1px solid #3b454e;background:#151d24;color:#edf1f4;padding:9px 13px;border-radius:8px;font-weight:800;text-decoration:none;cursor:pointer}.accounts-btn.primary{background:#d94b45;border-color:#d94b45}.accounts-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}.accounts-card{background:#151d24;border:1px solid #313b44;border-radius:10px;padding:15px}.accounts-card span{display:block;color:#89959e;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.accounts-card strong{display:block;margin-top:7px;font-size:20px}.accounts-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.accounts-tabs button{border:1px solid #35404a;background:#151d24;color:#aeb8bf;border-radius:999px;padding:8px 12px;font-weight:800;cursor:pointer}.accounts-tabs button.active{background:#d94b45;border-color:#d94b45;color:#fff}.accounts-panel{border:1px solid #313b44;background:#11181e;border-radius:10px;overflow:hidden}.accounts-toolbar{display:flex;gap:10px;padding:14px;border-bottom:1px solid #313b44;align-items:center}.accounts-toolbar input,.accounts-toolbar select{background:#0d141a;color:#fff;border:1px solid #36414a;border-radius:7px;padding:10px}.accounts-toolbar input{flex:1}.accounts-year-lock{background:#0d141a;color:#aeb8bf;border:1px solid #36414a;border-radius:7px;padding:9px 12px;font-size:12px;font-weight:900;white-space:nowrap}.accounts-table{overflow:auto}.accounts-table table{width:100%;border-collapse:collapse;min-width:980px}.accounts-table th,.accounts-table td{padding:11px 12px;border-bottom:1px solid #27313a;text-align:left;font-size:12px}.accounts-table th{font-size:11px;text-transform:uppercase;color:#8f9aa3;letter-spacing:.06em;position:sticky;top:0;background:#11181e;z-index:1}.accounts-income{color:#9fd7ae;font-weight:900}.accounts-expense{color:#ff938b;font-weight:900}.accounts-pending{color:#e4c36f}.accounts-balance{font-weight:900;font-variant-numeric:tabular-nums}.accounts-num{text-align:right!important;white-space:nowrap;font-variant-numeric:tabular-nums}.accounts-empty{padding:26px;text-align:center;color:#8f9aa3}.accounts-note{padding:11px 13px;border:1px solid #31513d;background:#18281f;color:#a9deb8;border-radius:8px;margin-bottom:14px}.accounts-note.error{border-color:#67352f;background:#34201e;color:#ffaaa3}.accounts-report{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}.accounts-report table{width:100%;border-collapse:collapse}.accounts-report th,.accounts-report td{padding:9px;border-bottom:1px solid #2b353d;text-align:left;font-size:12px}@media(max-width:900px){.accounts-metrics{grid-template-columns:1fr 1fr}.accounts-head{align-items:flex-start;flex-direction:column}.accounts-report{grid-template-columns:1fr}}@media(max-width:560px){.accounts-metrics{grid-template-columns:1fr}.accounts-toolbar{flex-direction:column;align-items:stretch}}
    `}</style>

    <header className="accounts-head">
      <div><small>LAND VIEW / FINANCIAL ACCOUNTS</small><h1>Accounts</h1></div>
      <div className="accounts-actions">
        <Link className="accounts-btn" href="/admin/finance">Billing</Link>
        <Link className="accounts-btn primary" href="/admin/accounts/entry">Add Expense</Link>
        <a className="accounts-btn" href={FINANCE_URL} target="_blank" rel="noreferrer">Open Finance Database</a>
        <button className="accounts-btn" type="button" onClick={() => setRevision((value) => value + 1)} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
      </div>
    </header>

    {error && <div className="accounts-note error">{error}</div>}
    <div className="accounts-note">
      {mode === "ledger"
        ? "2026 ledger only. Opening balance on 01 Jan 2026 is −৳389,456. Jan–Aug comes from the approved 2026 ledger import; Sep–Dec continues from posted Transactions. Older and duplicate Jan–Aug canonical rows are excluded."
        : "Canonical cashbook: financially effective Payments are credits; only approved/posted Expenses are debits. Pending expenses remain visible but do not reduce the canonical operating balance."}
    </div>

    <section className="accounts-metrics">
      {mode === "ledger" ? <>
        <div className="accounts-card"><span>Opening balance · 01 Jan 2026</span><strong>{ledgerMoney(LEDGER_OPENING_BALANCE)}</strong></div>
        <div className="accounts-card"><span>2026 credits</span><strong className="accounts-income">{ledgerMoney(ledgerTotals.credit)}</strong></div>
        <div className="accounts-card"><span>2026 debits</span><strong className="accounts-expense">{ledgerMoney(ledgerTotals.debit)}</strong></div>
        <div className="accounts-card"><span>Current balance</span><strong>{ledgerMoney(ledgerTotals.balance)}</strong></div>
      </> : <>
        <div className="accounts-card"><span>Approved income</span><strong className="accounts-income">{money(totals.income)}</strong></div>
        <div className="accounts-card"><span>Approved expenses</span><strong className="accounts-expense">{money(totals.approvedExpense)}</strong></div>
        <div className="accounts-card"><span>Pending expenses</span><strong className="accounts-pending">{money(totals.pendingExpense)}</strong></div>
        <div className="accounts-card"><span>Operating balance</span><strong>{money(totals.net)}</strong></div>
      </>}
    </section>

    <nav className="accounts-tabs" aria-label="Accounts views">
      {(["dashboard", "income", "expenses", "ledger", "reports"] as ViewMode[]).map((item) => <button key={item} type="button" className={mode === item ? "active" : ""} onClick={() => setMode(item)}>{item === "dashboard" ? "Overview" : item[0].toUpperCase() + item.slice(1)}</button>)}
    </nav>

    {mode === "dashboard" && <section className="accounts-report">
      <div className="accounts-card"><span>2026 ledger transactions</span><strong>{ledgerRows.length}</strong><p>Jan–Aug imported from the approved 2026 workbook; Sep–Dec is read from posted finance transactions.</p></div>
      <div className="accounts-card"><span>Ledger baseline</span><strong>{ledgerMoney(LEDGER_OPENING_BALANCE)}</strong><p>The website ledger is isolated to 2026 so old migrated records cannot change the displayed running balance.</p></div>
    </section>}

    {mode === "reports" && <section className="accounts-card" style={{marginBottom:16}}><h3 style={{marginTop:0}}>Category breakdown</h3><div className="accounts-table"><table><thead><tr><th>Category</th><th className="accounts-num">Income</th><th className="accounts-num">Approved expense</th><th className="accounts-num">Net</th></tr></thead><tbody>{categoryBreakdown.map((item) => <tr key={item.category}><td>{item.category}</td><td className="accounts-income accounts-num">{money(item.income)}</td><td className="accounts-expense accounts-num">{money(item.expense)}</td><td className="accounts-num">{money(item.income - item.expense)}</td></tr>)}</tbody></table></div></section>}

    {mode === "ledger" && <>
      <section className="accounts-panel">
        <div className="accounts-toolbar">
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search 2026 transaction, project, category or reference..."/>
          <span className="accounts-year-lock">2026 only</span>
        </div>
        {loading ? <div className="accounts-empty">Loading 2026 ledger…</div> : filteredLedger.length === 0 ? <div className="accounts-empty">No matching 2026 transactions.</div> : <div className="accounts-table"><table><thead><tr><th>Date</th><th>Transaction / Project</th><th>Account</th><th>Details</th><th className="accounts-num">Debit</th><th className="accounts-num">Credit</th><th className="accounts-num">Balance</th></tr></thead><tbody>{filteredLedger.map((row) => <tr key={`${row.type}-${row.id}`}><td>{displayDate(row.date)}</td><td><strong>{row.id}</strong><br/><span style={{color:"#89959e"}}>{row.projectId || "—"}</span></td><td>{row.account || row.method || "—"}</td><td>{row.description}<br/><span style={{color:"#89959e"}}>{row.category}{row.reference ? ` · ${row.reference}` : ""}</span></td><td className="accounts-expense accounts-num">{row.debit ? ledgerMoney(row.debit) : "—"}</td><td className="accounts-income accounts-num">{row.credit ? ledgerMoney(row.credit) : "—"}</td><td className="accounts-balance accounts-num">{ledgerMoney(row.balance)}</td></tr>)}</tbody></table></div>}
      </section>
      <div style={{marginTop:10,color:"#7f8b94",fontSize:11}}>Running balances are calculated from the full authoritative 2026 ledger before search filtering, so searching never changes the historical balance.</div>
    </>}

    {(mode === "income" || mode === "expenses") && <section className="accounts-panel">
      <div className="accounts-toolbar"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ID, project, category, party or reference..."/><select value={year} onChange={(event) => setYear(event.target.value)}><option value="">All years</option>{years.map((item) => <option key={item}>{item}</option>)}</select></div>
      {loading ? <div className="accounts-empty">Loading canonical finance records…</div> : filtered.length === 0 ? <div className="accounts-empty">No matching transactions.</div> : <div className="accounts-table"><table><thead><tr><th>Date</th><th>Type</th><th>ID / Project</th><th>Category</th><th>Description / Party</th><th>Account / Reference</th><th>Status</th><th className="accounts-num">Amount</th></tr></thead><tbody>{filtered.map((row) => <tr key={`${row.type}-${row.id}`}><td>{displayDate(row.date)}</td><td className={row.type === "Income" ? "accounts-income" : "accounts-expense"}>{row.type}</td><td><strong>{row.id}</strong><br/>{row.projectId || "—"}</td><td>{row.category}</td><td>{row.description}<br/><span style={{color:"#89959e"}}>{row.party || "—"}</span></td><td>{row.account || row.method || "—"}<br/><span style={{color:"#89959e"}}>{row.reference || "—"}</span></td><td className={normalizeStatus(row.status) === "pending" ? "accounts-pending" : ""}>{row.status}</td><td className={`${row.type === "Income" ? "accounts-income" : "accounts-expense"} accounts-num`}>{money(row.amount)}</td></tr>)}</tbody></table></div>}
    </section>}
  </div>;
}
