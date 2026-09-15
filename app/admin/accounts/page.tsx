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
  reference: string;
  party: string;
  search: string;
};

const FINANCE_URL = "https://docs.google.com/spreadsheets/d/1RDbzIr4aaysiB-UTZQKRK6m60HLg3zSZVzNrdgnGHBc/edit";

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
function expenseEffective(record: Record<string, unknown>) {
  const status = normalizeStatus(field(record, ["Approval_Status", "Approval Status", "Status"]));
  return !status || ["approved", "paid", "complete", "completed"].includes(status);
}
function dateKey(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}
function displayDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value || "—" : parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AccountsPage() {
  const [payments, setPayments] = useState<Record<string, unknown>[]>([]);
  const [expenses, setExpenses] = useState<Record<string, unknown>[]>([]);
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
    ])
      .then(([paymentRows, expenseRows]) => {
        if (cancelled) return;
        setPayments(paymentRows || []);
        setExpenses(expenseRows || []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load Accounts.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
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
      reference: text(field(record, ["Reference_No", "Reference No", "Reference"])),
      party: text(field(record, ["Received_From", "Received From", "Payer"])),
      search: "",
    };
    row.search = Object.values(row).join(" ").toLowerCase();
    return row;
  }).filter((row) => row.id && row.amount > 0), [payments]);

  const expenseRows = useMemo<Row[]>(() => expenses.map((record) => {
    const effective = expenseEffective(record);
    const status = text(field(record, ["Approval_Status", "Approval Status", "Status"])) || "Pending";
    const row: Row = {
      id: text(field(record, ["Expense_ID", "Expense ID", "ExpenseId"])),
      type: "Expense",
      date: text(field(record, ["Expense_Date", "Expense Date", "Date"])),
      projectId: text(field(record, ["Project_ID", "Project ID", "ProjectId"])),
      category: text(field(record, ["Category", "Expense_Category", "Expense Category"])) || "Miscellaneous",
      description: text(field(record, ["Description", "Particulars", "Expense"])) || "Expense",
      amount: amount(field(record, ["Amount", "Expense_Amount", "Expense Amount"])),
      status: effective ? (status || "Approved") : status,
      method: text(field(record, ["Payment_Method", "Payment Method", "Method"])),
      reference: text(field(record, ["Reference_No", "Reference No", "Reference"])),
      party: text(field(record, ["Paid_To", "Paid To", "Payee", "Vendor"])),
      search: "",
    };
    row.search = Object.values(row).join(" ").toLowerCase();
    return row;
  }).filter((row) => row.id && row.amount > 0), [expenses]);

  const allRows = useMemo(() => [...incomeRows, ...expenseRows].sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date))), [incomeRows, expenseRows]);
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

  const totals = useMemo(() => {
    const income = incomeRows.reduce((sum, row) => sum + row.amount, 0);
    const approvedExpense = expenseRows.filter((row) => ["approved", "paid", "complete", "completed"].includes(normalizeStatus(row.status)) || !normalizeStatus(row.status)).reduce((sum, row) => sum + row.amount, 0);
    const pendingExpense = expenseRows.filter((row) => normalizeStatus(row.status) === "pending").reduce((sum, row) => sum + row.amount, 0);
    return { income, approvedExpense, pendingExpense, net: income - approvedExpense };
  }, [incomeRows, expenseRows]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { category: string; income: number; expense: number }>();
    allRows.forEach((row) => {
      const current = map.get(row.category) || { category: row.category, income: 0, expense: 0 };
      if (row.type === "Income") current.income += row.amount;
      else if (expenseEffective({ Approval_Status: row.status })) current.expense += row.amount;
      map.set(row.category, current);
    });
    return [...map.values()].sort((a, b) => (b.income + b.expense) - (a.income + a.expense));
  }, [allRows]);

  return <div className="accounts-page">
    <style>{`
      .accounts-page{color:#e8edf1}.accounts-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:20px}.accounts-head small{display:block;color:#ef6c66;font-weight:900;letter-spacing:.11em}.accounts-head h1{font-size:34px;margin:5px 0 0}.accounts-actions{display:flex;gap:8px;flex-wrap:wrap}.accounts-btn{border:1px solid #3b454e;background:#151d24;color:#edf1f4;padding:9px 13px;border-radius:8px;font-weight:800;text-decoration:none;cursor:pointer}.accounts-btn.primary{background:#d94b45;border-color:#d94b45}.accounts-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:16px}.accounts-card{background:#151d24;border:1px solid #313b44;border-radius:10px;padding:15px}.accounts-card span{display:block;color:#89959e;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.accounts-card strong{display:block;margin-top:7px;font-size:20px}.accounts-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.accounts-tabs button{border:1px solid #35404a;background:#151d24;color:#aeb8bf;border-radius:999px;padding:8px 12px;font-weight:800;cursor:pointer}.accounts-tabs button.active{background:#d94b45;border-color:#d94b45;color:#fff}.accounts-panel{border:1px solid #313b44;background:#11181e;border-radius:10px;overflow:hidden}.accounts-toolbar{display:flex;gap:10px;padding:14px;border-bottom:1px solid #313b44}.accounts-toolbar input,.accounts-toolbar select{background:#0d141a;color:#fff;border:1px solid #36414a;border-radius:7px;padding:10px}.accounts-toolbar input{flex:1}.accounts-table{overflow:auto}.accounts-table table{width:100%;border-collapse:collapse;min-width:940px}.accounts-table th,.accounts-table td{padding:11px 12px;border-bottom:1px solid #27313a;text-align:left;font-size:12px}.accounts-table th{font-size:11px;text-transform:uppercase;color:#8f9aa3;letter-spacing:.06em}.accounts-income{color:#9fd7ae;font-weight:900}.accounts-expense{color:#ff938b;font-weight:900}.accounts-pending{color:#e4c36f}.accounts-empty{padding:26px;text-align:center;color:#8f9aa3}.accounts-note{padding:11px 13px;border:1px solid #31513d;background:#18281f;color:#a9deb8;border-radius:8px;margin-bottom:14px}.accounts-note.error{border-color:#67352f;background:#34201e;color:#ffaaa3}.accounts-report{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}.accounts-report table{width:100%;border-collapse:collapse}.accounts-report th,.accounts-report td{padding:9px;border-bottom:1px solid #2b353d;text-align:left;font-size:12px}@media(max-width:900px){.accounts-metrics{grid-template-columns:1fr 1fr}.accounts-head{align-items:flex-start;flex-direction:column}.accounts-report{grid-template-columns:1fr}}@media(max-width:560px){.accounts-metrics{grid-template-columns:1fr}.accounts-toolbar{flex-direction:column}}
    `}</style>

    <header className="accounts-head">
      <div><small>LAND VIEW / FINANCIAL ACCOUNTS</small><h1>Accounts</h1></div>
      <div className="accounts-actions">
        <Link className="accounts-btn" href="/admin/finance">Billing</Link>
        <Link className="accounts-btn primary" href="/admin/accounts/entry">Add Expense</Link>
        <a className="accounts-btn" href={FINANCE_URL} target="_blank" rel="noreferrer">Open Finance Database</a>
        <button className="accounts-btn" type="button" onClick={() => setRevision((value) => value + 1)}>Refresh</button>
      </div>
    </header>

    {error && <div className="accounts-note error">{error}</div>}
    <div className="accounts-note">Income is calculated from financially effective Payments. Expenses remain visible while pending, but only approved/posted expenses reduce net operating balance.</div>

    <section className="accounts-metrics">
      <div className="accounts-card"><span>Approved income</span><strong className="accounts-income">{money(totals.income)}</strong></div>
      <div className="accounts-card"><span>Approved expenses</span><strong className="accounts-expense">{money(totals.approvedExpense)}</strong></div>
      <div className="accounts-card"><span>Pending expenses</span><strong className="accounts-pending">{money(totals.pendingExpense)}</strong></div>
      <div className="accounts-card"><span>Operating net</span><strong>{money(totals.net)}</strong></div>
    </section>

    <nav className="accounts-tabs" aria-label="Accounts views">
      {(["dashboard", "income", "expenses", "ledger", "reports"] as ViewMode[]).map((item) => <button key={item} type="button" className={mode === item ? "active" : ""} onClick={() => setMode(item)}>{item === "dashboard" ? "Overview" : item[0].toUpperCase() + item.slice(1)}</button>)}
    </nav>

    {mode === "dashboard" && <section className="accounts-report">
      <div className="accounts-card"><span>Transaction counts</span><strong>{incomeRows.length + expenseRows.length}</strong><p>{incomeRows.length} effective income records · {expenseRows.length} expense records</p></div>
      <div className="accounts-card"><span>Canonical accounting</span><strong>Payments → Transactions → Accounts</strong><p>Approved payments credit accounts; approved expenses debit accounts; transfers create balanced debit/credit entries.</p></div>
    </section>}

    {mode === "reports" && <section className="accounts-card" style={{marginBottom:16}}><h3 style={{marginTop:0}}>Category breakdown</h3><div className="accounts-table"><table><thead><tr><th>Category</th><th>Income</th><th>Approved expense</th><th>Net</th></tr></thead><tbody>{categoryBreakdown.map((item) => <tr key={item.category}><td>{item.category}</td><td className="accounts-income">{money(item.income)}</td><td className="accounts-expense">{money(item.expense)}</td><td>{money(item.income - item.expense)}</td></tr>)}</tbody></table></div></section>}

    {mode !== "dashboard" || query || year ? <section className="accounts-panel">
      <div className="accounts-toolbar"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ID, project, category, party or reference..."/><select value={year} onChange={(event) => setYear(event.target.value)}><option value="">All years</option>{years.map((item) => <option key={item}>{item}</option>)}</select></div>
      {loading ? <div className="accounts-empty">Loading canonical finance records…</div> : filtered.length === 0 ? <div className="accounts-empty">No matching transactions.</div> : <div className="accounts-table"><table><thead><tr><th>Date</th><th>Type</th><th>ID / Project</th><th>Category</th><th>Description / Party</th><th>Method / Reference</th><th>Status</th><th>Amount</th></tr></thead><tbody>{filtered.map((row) => <tr key={`${row.type}-${row.id}`}><td>{displayDate(row.date)}</td><td className={row.type === "Income" ? "accounts-income" : "accounts-expense"}>{row.type}</td><td><strong>{row.id}</strong><br/>{row.projectId || "—"}</td><td>{row.category}</td><td>{row.description}<br/><span style={{color:"#89959e"}}>{row.party || "—"}</span></td><td>{row.method || "—"}<br/><span style={{color:"#89959e"}}>{row.reference || "—"}</span></td><td className={normalizeStatus(row.status) === "pending" ? "accounts-pending" : ""}>{row.status}</td><td className={row.type === "Income" ? "accounts-income" : "accounts-expense"}>{money(row.amount)}</td></tr>)}</tbody></table></div>}
    </section> : null}
  </div>;
}
