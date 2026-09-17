"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";

type ViewMode = "dashboard" | "income" | "expenses" | "ledger" | "reports";
type LedgerType = "Income" | "Expense";
type QuickType = "income" | "expense";
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
type QuickEntry = {
  date: string;
  category: string;
  description: string;
  amount: string;
  method: string;
  projectId: string;
  party: string;
  reference: string;
  notes: string;
};

const FINANCE_URL = "https://docs.google.com/spreadsheets/d/1RDbzIr4aaysiB-UTZQKRK6m60HLg3zSZVzNrdgnGHBc/edit";
const LEDGER_LIVE_START = "2026-09-01";
const LEDGER_END = "2026-12-31";
const DHAKA_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Dhaka",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const DHAKA_MONTH = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dhaka",
  month: "long",
  year: "numeric",
});
const INCOME_CATEGORIES = [
  "Design Bill", "Supervision Bill", "Soil Test", "Digital Survey", "3D Design",
  "Estimate & Costing", "Plan Approval", "Site Visit", "Rent Income",
  "Material / Product Sale", "Commission Income", "Other Income",
];
const EXPENSE_CATEGORIES = [
  "Office Rent", "Salary / Wages", "Staff Commission / Bonus", "Utility", "Internet / Phone",
  "Transport", "Site Visit", "Printing / Stationery", "Software / Subscription", "Equipment",
  "Design Outsourcing", "Soil Test / Survey Cost", "Municipality / Approval Cost", "Marketing",
  "Government Fee", "Refreshment", "Maintenance", "Staff Welfare / Gifts", "Miscellaneous",
];
const PAYMENT_METHODS = ["Cash", "bKash", "Nagad", "Bank", "Card", "Cheque", "Other"];

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
function displayDate(value: string, compact = false) {
  const key = dateKey(value);
  if (!key) return "—";
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month || !day) return value || "—";
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", compact
    ? { day: "2-digit", month: "short" }
    : { day: "2-digit", month: "short", year: "numeric" });
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
function blankEntry(type: QuickType): QuickEntry {
  return {
    date: dhakaDateKey(new Date()),
    category: type === "income" ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0],
    description: "",
    amount: "",
    method: "Cash",
    projectId: "",
    party: "",
    reference: "",
    notes: "",
  };
}

export default function AccountsPage() {
  const [payments, setPayments] = useState<Record<string, unknown>[]>([]);
  const [expenses, setExpenses] = useState<Record<string, unknown>[]>([]);
  const [transactions, setTransactions] = useState<Record<string, unknown>[]>([]);
  const [projects, setProjects] = useState<Record<string, unknown>[]>([]);
  const [mode, setMode] = useState<ViewMode>("dashboard");
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [revision, setRevision] = useState(0);
  const [quickType, setQuickType] = useState<QuickType | null>(null);
  const [quickEntry, setQuickEntry] = useState<QuickEntry>(() => blankEntry("income"));
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickError, setQuickError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      landViewApi.getPayments(),
      landViewApi.getErpRecords("expenses"),
      landViewApi.getFinanceSheet("Transactions"),
      landViewApi.getProjects(),
    ])
      .then(([paymentRows, expenseRows, transactionSheet, projectRows]) => {
        if (cancelled) return;
        setPayments(paymentRows || []);
        setExpenses(expenseRows || []);
        setTransactions(financeSheetToRecords(transactionSheet));
        setProjects(projectRows || []);
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
        is2025Ledger: id.startsWith("TXN-LEDGER-2025-"),
        is2026History: id.startsWith("TXN-HIST-2026-"),
      };
    }).filter((item) => item.row.id && item.row.date && (item.debit > 0 || item.credit > 0));

    const history = normalized
      .filter((item) => item.is2025Ledger || item.is2026History)
      .sort((a, b) => dateKey(a.row.date).localeCompare(dateKey(b.row.date)) || a.row.id.localeCompare(b.row.id));
    const live = normalized
      .filter((item) => {
        if (item.is2025Ledger || item.is2026History) return false;
        if (normalizeStatus(item.row.status) !== "posted") return false;
        if (item.transactionType === "transfer") return false;
        const key = dateKey(item.row.date);
        return key >= LEDGER_LIVE_START && key <= LEDGER_END;
      })
      .sort((a, b) => dateKey(a.row.date).localeCompare(dateKey(b.row.date)) || a.row.id.localeCompare(b.row.id));
    let balance = 0;
    return [...history, ...live].map((item) => {
      balance += item.credit - item.debit;
      return { ...item.row, debit: item.debit, credit: item.credit, balance };
    });
  }, [transactions]);

  const years = useMemo(() => Array.from(new Set<string>(allRows.map((row) => dateKey(row.date).slice(0, 4)).filter(Boolean))).sort((a, b) => b.localeCompare(a)), [allRows]);
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
    const balance = ledgerRows.length ? ledgerRows[ledgerRows.length - 1].balance : 0;
    return { credit, debit, balance };
  }, [ledgerRows]);
  const ledger2025Closing = useMemo(() => {
    const rows = ledgerRows.filter((row) => dateKey(row.date) < "2026-01-01");
    return rows.length ? rows[rows.length - 1].balance : 0;
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

  const monthKey = dhakaDateKey(new Date()).slice(0, 7);
  const monthLabel = DHAKA_MONTH.format(new Date());
  const monthIncome = useMemo(() => incomeRows
    .filter((row) => dateKey(row.date).startsWith(monthKey))
    .sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)) || b.id.localeCompare(a.id)), [incomeRows, monthKey]);
  const monthExpenses = useMemo(() => postedExpenses
    .filter((row) => dateKey(row.date).startsWith(monthKey))
    .sort((a, b) => dateKey(b.date).localeCompare(dateKey(a.date)) || b.id.localeCompare(a.id)), [postedExpenses, monthKey]);
  const monthPendingExpenses = useMemo(() => expenseRows
    .filter((row) => dateKey(row.date).startsWith(monthKey) && normalizeStatus(row.status) === "pending"), [expenseRows, monthKey]);
  const monthIncomeTotal = monthIncome.reduce((sum, row) => sum + row.amount, 0);
  const monthExpenseTotal = monthExpenses.reduce((sum, row) => sum + row.amount, 0);
  const monthNet = monthIncomeTotal - monthExpenseTotal;
  const sortedProjects = useMemo(() => [...projects].sort((a, b) => text(field(a, ["Project_ID"])).localeCompare(text(field(b, ["Project_ID"])), undefined, { numeric: true })), [projects]);

  function openQuick(type: QuickType) {
    setQuickType(type);
    setQuickEntry(blankEntry(type));
    setQuickError("");
    setNotice("");
  }
  function closeQuick() {
    if (quickBusy) return;
    setQuickType(null);
    setQuickError("");
  }
  async function saveQuick(event: FormEvent) {
    event.preventDefault();
    if (!quickType) return;
    setQuickError("");
    const value = Number(quickEntry.amount || 0);
    if (!quickEntry.date) return setQuickError("Choose a transaction date.");
    if (!quickEntry.description.trim()) return setQuickError("Enter a short description.");
    if (!Number.isFinite(value) || value <= 0) return setQuickError("Enter an amount greater than zero.");
    if (quickType === "income" && !quickEntry.projectId) return setQuickError("Select a project for this income entry.");
    setQuickBusy(true);
    try {
      if (quickType === "income") {
        await landViewApi.createPayment({
          Payment_Date: quickEntry.date,
          Project_ID: quickEntry.projectId,
          Income_Category: quickEntry.category,
          Payment_For: quickEntry.description.trim(),
          Amount: value,
          Payment_Method: quickEntry.method,
          Deposit_Account: quickEntry.method === "Cash" ? "Office Cash" : quickEntry.method,
          Reference_No: quickEntry.reference.trim(),
          Received_From: quickEntry.party.trim(),
          Notes: quickEntry.notes.trim(),
          Transaction_Type: "Office Income",
          Affects_Business_Balance: true,
          Idempotency_Key: `accounts-quick-income-${Date.now()}`,
        });
      } else {
        await landViewApi.createErpRecord("expenses", {
          Expense_Date: quickEntry.date,
          Project_ID: quickEntry.projectId,
          Category: quickEntry.category,
          Description: quickEntry.description.trim(),
          Amount: value,
          Payment_Method: quickEntry.method,
          Reference_No: quickEntry.reference.trim(),
          Paid_To: quickEntry.party.trim(),
          Notes: quickEntry.notes.trim(),
        });
      }
      setNotice(`${quickType === "income" ? "Income" : "Expense"} saved successfully.`);
      setQuickType(null);
      setRevision((value) => value + 1);
    } catch (err: unknown) {
      setQuickError(err instanceof Error ? err.message : `Could not save ${quickType}.`);
    } finally {
      setQuickBusy(false);
    }
  }

  const quickCategories = quickType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return <div className="accounts-page">
    <style>{`
      .accounts-page{color:#e8edf1;--panel:#10171d;--panel2:#151d24;--line:#2c3740;--muted:#88949d;--green:#8fe0ad;--green-bg:#14281e;--red:#ff928c;--red-bg:#2d1819;--amber:#e4c36f}.accounts-page *{box-sizing:border-box}.accounts-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-end;margin-bottom:18px}.accounts-kicker{display:block;color:#ef6c66;font-size:10px;font-weight:900;letter-spacing:.14em}.accounts-head h1{font-size:36px;margin:5px 0 0;letter-spacing:-.03em}.accounts-head p{margin:5px 0 0;color:var(--muted);font-size:11px}.accounts-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.accounts-btn{border:1px solid #3b454e;background:#151d24;color:#edf1f4;padding:9px 13px;border-radius:9px;font-weight:800;text-decoration:none;cursor:pointer;font-size:11px}.accounts-btn:hover{border-color:#59656e}.accounts-btn.income{background:#173322;border-color:#28553b;color:#b5efc7}.accounts-btn.expense{background:#3a1b1d;border-color:#693137;color:#ffb2ae}.accounts-btn.primary{background:#d94b45;border-color:#d94b45}.accounts-note{padding:11px 13px;border:1px solid #31513d;background:#18281f;color:#a9deb8;border-radius:9px;margin-bottom:14px;font-size:11px}.accounts-note.error{border-color:#67352f;background:#34201e;color:#ffaaa3}.accounts-note.success{border-color:#345f46;background:#173222;color:#a8e8bb}.accounts-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:15px}.accounts-card{position:relative;background:linear-gradient(145deg,#151d24,#10171d);border:1px solid #313b44;border-radius:13px;padding:16px;overflow:hidden}.accounts-card:after{content:"";position:absolute;right:-28px;bottom:-38px;width:92px;height:92px;border-radius:50%;background:rgba(255,255,255,.025)}.accounts-card span{display:block;color:#89959e;font-size:10px;text-transform:uppercase;letter-spacing:.09em}.accounts-card strong{display:block;margin-top:8px;font-size:21px}.accounts-card p{position:relative;margin:7px 0 0;color:#7e8992;font-size:10px;line-height:1.5}.accounts-income{color:var(--green);font-weight:900}.accounts-expense{color:var(--red);font-weight:900}.accounts-pending{color:var(--amber)}.accounts-balance{font-weight:900;font-variant-numeric:tabular-nums}.accounts-num{text-align:right!important;white-space:nowrap;font-variant-numeric:tabular-nums}.month-shell{margin:0 0 16px;border:1px solid #2d3942;border-radius:15px;background:linear-gradient(180deg,#0f171d,#0b1217);overflow:hidden}.month-summary{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:16px 18px;border-bottom:1px solid #28343d;background:radial-gradient(circle at 80% -20%,rgba(217,75,69,.12),transparent 40%)}.month-summary small{display:block;color:#e56b66;font-size:9px;font-weight:900;letter-spacing:.14em}.month-summary h2{margin:4px 0 0;font-size:22px}.month-summary-right{display:flex;align-items:center;gap:18px}.month-summary-stat{text-align:right}.month-summary-stat span{display:block;color:#7f8b94;font-size:9px;text-transform:uppercase;letter-spacing:.08em}.month-summary-stat strong{display:block;margin-top:3px;font-size:17px}.month-columns{display:grid;grid-template-columns:1fr 1fr;gap:0}.month-card{min-width:0;padding:16px 18px}.month-card+.month-card{border-left:1px solid #28343d}.month-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px}.month-title{display:flex;align-items:center;gap:9px}.month-icon{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;font-size:15px;font-weight:900}.month-icon.income{background:#173322;color:#9de3b6}.month-icon.expense{background:#371c1e;color:#ff9f99}.month-title strong{display:block;font-size:13px}.month-title span{display:block;margin-top:2px;color:#7f8b94;font-size:9px}.month-add{border:1px solid #38454e;background:#121a20;color:#eaf0f3;border-radius:8px;padding:7px 10px;font-size:9px;font-weight:900;cursor:pointer}.month-add.income{border-color:#28553b;color:#aee9c1}.month-add.expense{border-color:#653139;color:#ffaaa5}.month-total{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:11px;padding:11px 12px;border-radius:10px;background:#0c1318}.month-total strong{font-size:20px}.month-total span{color:#7e8992;font-size:9px}.month-list{display:grid;gap:7px}.month-row{display:grid;grid-template-columns:58px minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 10px;border:1px solid #28333b;border-radius:9px;background:#11191f}.month-date{color:#7d8992;font-size:9px}.month-desc{min-width:0}.month-desc strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}.month-desc span{display:block;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#74808a;font-size:8px}.month-amount{font-size:10px;font-weight:900;white-space:nowrap}.month-empty{padding:22px 10px;text-align:center;border:1px dashed #2c3841;border-radius:9px;color:#72808a;font-size:10px}.month-footer{display:flex;justify-content:space-between;align-items:center;margin-top:11px;color:#75818a;font-size:9px}.month-link{border:0;background:transparent;color:#b8c2c8;font-size:9px;font-weight:900;cursor:pointer}.accounts-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;padding:4px;border:1px solid #2e3941;background:#0f161c;border-radius:11px}.accounts-tabs button{border:0;background:transparent;color:#9ca7af;border-radius:8px;padding:8px 12px;font-weight:800;font-size:10px;cursor:pointer}.accounts-tabs button.active{background:#c93437;color:#fff;box-shadow:0 4px 16px rgba(201,52,55,.18)}.accounts-panel{border:1px solid #313b44;background:#11181e;border-radius:11px;overflow:hidden}.accounts-toolbar{display:flex;gap:10px;padding:14px;border-bottom:1px solid #313b44;align-items:center}.accounts-toolbar input,.accounts-toolbar select{background:#0d141a;color:#fff;border:1px solid #36414a;border-radius:7px;padding:10px}.accounts-toolbar input{flex:1}.accounts-year-lock{background:#0d141a;color:#aeb8bf;border:1px solid #36414a;border-radius:7px;padding:9px 12px;font-size:10px;font-weight:900;white-space:nowrap}.accounts-table{overflow:auto}.accounts-table table{width:100%;border-collapse:collapse;min-width:980px}.accounts-table th,.accounts-table td{padding:11px 12px;border-bottom:1px solid #27313a;text-align:left;font-size:11px}.accounts-table th{font-size:9px;text-transform:uppercase;color:#8f9aa3;letter-spacing:.07em;position:sticky;top:0;background:#11181e;z-index:1}.accounts-empty{padding:26px;text-align:center;color:#8f9aa3}.accounts-report{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px}.accounts-report table{width:100%;border-collapse:collapse}.accounts-report th,.accounts-report td{padding:9px;border-bottom:1px solid #2b353d;text-align:left;font-size:11px}.quick-backdrop{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;padding:22px;background:rgba(2,7,10,.78);backdrop-filter:blur(6px)}.quick-modal{width:min(720px,100%);max-height:calc(100vh - 44px);overflow:auto;border:1px solid #394750;border-radius:16px;background:#0f171d;box-shadow:0 28px 80px rgba(0,0,0,.5)}.quick-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;padding:17px 18px;border-bottom:1px solid #2b363f}.quick-head small{display:block;font-size:9px;font-weight:900;letter-spacing:.12em}.quick-head h3{margin:4px 0 0;font-size:22px}.quick-head p{margin:5px 0 0;color:#7e8a93;font-size:10px}.quick-close{border:1px solid #35414a;background:#121a20;color:#cbd3d8;width:31px;height:31px;border-radius:8px;cursor:pointer}.quick-body{padding:17px 18px}.quick-error{margin-bottom:12px;padding:10px;border:1px solid #66343a;background:#321c1e;color:#ffaaa5;border-radius:8px;font-size:10px}.quick-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.quick-grid label{display:grid;gap:5px;color:#87939c;font-size:9px}.quick-grid label.wide{grid-column:1/-1}.quick-grid input,.quick-grid select,.quick-grid textarea{width:100%;border:1px solid #35424b;border-radius:8px;background:#091016;color:#edf1f4;padding:10px;font-size:10px}.quick-grid textarea{min-height:72px;resize:vertical}.quick-help{color:#75818a;font-size:8px;line-height:1.5}.quick-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.quick-actions button,.quick-actions a{border:1px solid #3a4650;background:#131b21;color:#e8edf1;border-radius:8px;padding:9px 12px;font-size:9px;font-weight:900;text-decoration:none;cursor:pointer}.quick-actions .save-income{background:#1e5b3b;border-color:#2c7450;color:#d9ffe7}.quick-actions .save-expense{background:#a93639;border-color:#c54b4f;color:#fff}.quick-actions button:disabled{opacity:.5;cursor:not-allowed}@media(max-width:960px){.accounts-metrics{grid-template-columns:1fr 1fr}.accounts-head{align-items:flex-start;flex-direction:column}.accounts-actions{justify-content:flex-start}.month-summary{align-items:flex-start}.month-summary-right{flex-wrap:wrap;justify-content:flex-end}.accounts-report{grid-template-columns:1fr}}@media(max-width:760px){.month-columns{grid-template-columns:1fr}.month-card+.month-card{border-left:0;border-top:1px solid #28343d}.month-summary{flex-direction:column}.month-summary-right{width:100%;justify-content:space-between}.quick-grid{grid-template-columns:1fr}.quick-grid label.wide{grid-column:auto}}@media(max-width:560px){.accounts-metrics{grid-template-columns:1fr}.accounts-toolbar{flex-direction:column;align-items:stretch}.month-summary-right{display:grid;grid-template-columns:1fr 1fr}.month-summary-stat{text-align:left}.accounts-head h1{font-size:30px}.accounts-actions{width:100%}.accounts-btn{flex:1;text-align:center}.month-row{grid-template-columns:50px minmax(0,1fr);}.month-amount{grid-column:2;text-align:left}}
    `}</style>

    <header className="accounts-head">
      <div><small className="accounts-kicker">LAND VIEW / FINANCIAL ACCOUNTS</small><h1>Accounts</h1><p>Cashflow, monthly activity and the authoritative running ledger in one workspace.</p></div>
      <div className="accounts-actions">
        <button className="accounts-btn income" type="button" onClick={() => openQuick("income")}>＋ Add Income</button>
        <button className="accounts-btn expense" type="button" onClick={() => openQuick("expense")}>− Add Expense</button>
        <Link className="accounts-btn" href="/admin/finance">Billing</Link>
        <a className="accounts-btn" href={FINANCE_URL} target="_blank" rel="noreferrer">Finance Database</a>
        <button className="accounts-btn" type="button" onClick={() => setRevision((value) => value + 1)} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button>
      </div>
    </header>

    {error && <div className="accounts-note error">{error}</div>}
    {notice && <div className="accounts-note success">{notice}</div>}
    <div className="accounts-note">
      {mode === "ledger"
        ? "Authoritative running cashbook: the full 2025 ledger flows into the approved Jan–Aug 2026 ledger, then Sep–Dec continues from posted finance transactions."
        : "Operating balance comes from the authoritative running ledger. Monthly panels below show only approved income and posted expenditure for the current month."}
    </div>

    <section className="accounts-metrics">
      {mode === "ledger" ? <>
        <div className="accounts-card"><span>2025 closing balance</span><strong className={ledger2025Closing < 0 ? "accounts-expense" : "accounts-income"}>{ledgerMoney(ledger2025Closing)}</strong></div>
        <div className="accounts-card"><span>Ledger credits</span><strong className="accounts-income">{ledgerMoney(ledgerTotals.credit)}</strong></div>
        <div className="accounts-card"><span>Ledger debits</span><strong className="accounts-expense">{ledgerMoney(ledgerTotals.debit)}</strong></div>
        <div className="accounts-card"><span>Current balance</span><strong className={ledgerTotals.balance < 0 ? "accounts-expense" : "accounts-income"}>{ledgerMoney(ledgerTotals.balance)}</strong></div>
      </> : <>
        <div className="accounts-card"><span>Approved income</span><strong className="accounts-income">{money(totals.income)}</strong><p>All approved business receipts.</p></div>
        <div className="accounts-card"><span>Approved expenses</span><strong className="accounts-expense">{money(totals.approvedExpense)}</strong><p>All posted business expenditure.</p></div>
        <div className="accounts-card"><span>Pending expenses</span><strong className="accounts-pending">{money(totals.pendingExpense)}</strong><p>Visible but not deducted yet.</p></div>
        <div className="accounts-card"><span>Operating balance</span><strong className={ledgerTotals.balance < 0 ? "accounts-expense" : "accounts-income"}>{ledgerMoney(ledgerTotals.balance)}</strong><p>Live balance from the running ledger.</p></div>
      </>}
    </section>

    {mode === "dashboard" && <section className="month-shell">
      <div className="month-summary">
        <div><small>THIS MONTH</small><h2>{monthLabel} cashflow</h2></div>
        <div className="month-summary-right">
          <div className="month-summary-stat"><span>Income</span><strong className="accounts-income">{money(monthIncomeTotal)}</strong></div>
          <div className="month-summary-stat"><span>Expenditure</span><strong className="accounts-expense">{money(monthExpenseTotal)}</strong></div>
          <div className="month-summary-stat"><span>Net movement</span><strong className={monthNet < 0 ? "accounts-expense" : "accounts-income"}>{money(monthNet)}</strong></div>
        </div>
      </div>
      <div className="month-columns">
        <article className="month-card">
          <div className="month-card-head"><div className="month-title"><span className="month-icon income">↗</span><div><strong>Income details</strong><span>{monthIncome.length} approved receipt{monthIncome.length === 1 ? "" : "s"}</span></div></div><button className="month-add income" type="button" onClick={() => openQuick("income")}>＋ Add income</button></div>
          <div className="month-total"><div><span>Received this month</span><strong className="accounts-income">{money(monthIncomeTotal)}</strong></div><span>{monthIncome.length} entries</span></div>
          <div className="month-list">{monthIncome.length === 0 ? <div className="month-empty">No approved income recorded this month.</div> : monthIncome.slice(0, 7).map((row) => <div className="month-row" key={`month-income-${row.id}`}><div className="month-date">{displayDate(row.date, true)}</div><div className="month-desc"><strong>{row.description}</strong><span>{row.projectId || row.category}{row.party ? ` · ${row.party}` : ""}</span></div><div className="month-amount accounts-income">+{money(row.amount)}</div></div>)}</div>
          <div className="month-footer"><span>{monthIncome.length > 7 ? `${monthIncome.length - 7} more entries` : "Up to date"}</span><button className="month-link" type="button" onClick={() => setMode("income")}>View all income →</button></div>
        </article>
        <article className="month-card">
          <div className="month-card-head"><div className="month-title"><span className="month-icon expense">↘</span><div><strong>Expenditure details</strong><span>{monthExpenses.length} posted expense{monthExpenses.length === 1 ? "" : "s"}</span></div></div><button className="month-add expense" type="button" onClick={() => openQuick("expense")}>− Add expense</button></div>
          <div className="month-total"><div><span>Spent this month</span><strong className="accounts-expense">{money(monthExpenseTotal)}</strong></div><span>{monthPendingExpenses.length ? `${monthPendingExpenses.length} pending` : `${monthExpenses.length} entries`}</span></div>
          <div className="month-list">{monthExpenses.length === 0 ? <div className="month-empty">No posted expenditure recorded this month.</div> : monthExpenses.slice(0, 7).map((row) => <div className="month-row" key={`month-expense-${row.id}`}><div className="month-date">{displayDate(row.date, true)}</div><div className="month-desc"><strong>{row.description}</strong><span>{row.projectId || row.category}{row.party ? ` · ${row.party}` : ""}</span></div><div className="month-amount accounts-expense">−{money(row.amount)}</div></div>)}</div>
          <div className="month-footer"><span>{monthPendingExpenses.length ? `${money(monthPendingExpenses.reduce((sum, row) => sum + row.amount, 0))} pending approval` : "No pending expense"}</span><button className="month-link" type="button" onClick={() => setMode("expenses")}>View all expenses →</button></div>
        </article>
      </div>
    </section>}

    <nav className="accounts-tabs" aria-label="Accounts views">
      {(["dashboard", "income", "expenses", "ledger", "reports"] as ViewMode[]).map((item) => <button key={item} type="button" className={mode === item ? "active" : ""} onClick={() => setMode(item)}>{item === "dashboard" ? "Overview" : item[0].toUpperCase() + item.slice(1)}</button>)}
    </nav>

    {mode === "dashboard" && <section className="accounts-report">
      <div className="accounts-card"><span>2025–2026 ledger transactions</span><strong>{ledgerRows.length}</strong><p>Full 2025 ledger book, approved Jan–Aug 2026 ledger, and current posted finance transactions.</p></div>
      <div className="accounts-card"><span>2025 closing balance</span><strong className={ledger2025Closing < 0 ? "accounts-expense" : "accounts-income"}>{ledgerMoney(ledger2025Closing)}</strong><p>The 2025 cashbook closes directly into 2026, so no duplicate opening baseline is added.</p></div>
    </section>}

    {mode === "reports" && <section className="accounts-card" style={{marginBottom:16}}><h3 style={{marginTop:0}}>Category breakdown</h3><div className="accounts-table"><table><thead><tr><th>Category</th><th className="accounts-num">Income</th><th className="accounts-num">Approved expense</th><th className="accounts-num">Net</th></tr></thead><tbody>{categoryBreakdown.map((item) => <tr key={item.category}><td>{item.category}</td><td className="accounts-income accounts-num">{money(item.income)}</td><td className="accounts-expense accounts-num">{money(item.expense)}</td><td className="accounts-num">{money(item.income - item.expense)}</td></tr>)}</tbody></table></div></section>}

    {mode === "ledger" && <>
      <section className="accounts-panel">
        <div className="accounts-toolbar"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ledger transaction, project, category or reference..."/><span className="accounts-year-lock">2025–2026</span></div>
        {loading ? <div className="accounts-empty">Loading ledger…</div> : filteredLedger.length === 0 ? <div className="accounts-empty">No matching ledger transactions.</div> : <div className="accounts-table"><table><thead><tr><th>Date</th><th>Transaction / Project</th><th>Account</th><th>Details</th><th className="accounts-num">Debit</th><th className="accounts-num">Credit</th><th className="accounts-num">Balance</th></tr></thead><tbody>{filteredLedger.map((row) => <tr key={`${row.type}-${row.id}`}><td>{displayDate(row.date)}</td><td><strong>{row.id}</strong><br/><span style={{color:"#89959e"}}>{row.projectId || "—"}</span></td><td>{row.account || row.method || "—"}</td><td>{row.description}<br/><span style={{color:"#89959e"}}>{row.category}{row.reference ? ` · ${row.reference}` : ""}</span></td><td className="accounts-expense accounts-num">{row.debit ? ledgerMoney(row.debit) : "—"}</td><td className="accounts-income accounts-num">{row.credit ? ledgerMoney(row.credit) : "—"}</td><td className="accounts-balance accounts-num">{ledgerMoney(row.balance)}</td></tr>)}</tbody></table></div>}
      </section>
      <div style={{marginTop:10,color:"#7f8b94",fontSize:10}}>Running balances are calculated from the full authoritative 2025–2026 ledger before search filtering, so searching never changes the historical balance.</div>
    </>}

    {(mode === "income" || mode === "expenses") && <section className="accounts-panel">
      <div className="accounts-toolbar"><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search ID, project, category, party or reference..."/><select value={year} onChange={(event) => setYear(event.target.value)}><option value="">All years</option>{years.map((item) => <option key={item}>{item}</option>)}</select><button className={`accounts-btn ${mode === "income" ? "income" : "expense"}`} type="button" onClick={() => openQuick(mode === "income" ? "income" : "expense")}>{mode === "income" ? "＋ Add Income" : "− Add Expense"}</button></div>
      {loading ? <div className="accounts-empty">Loading canonical finance records…</div> : filtered.length === 0 ? <div className="accounts-empty">No matching transactions.</div> : <div className="accounts-table"><table><thead><tr><th>Date</th><th>Type</th><th>ID / Project</th><th>Category</th><th>Description / Party</th><th>Account / Reference</th><th>Status</th><th className="accounts-num">Amount</th></tr></thead><tbody>{filtered.map((row) => <tr key={`${row.type}-${row.id}`}><td>{displayDate(row.date)}</td><td className={row.type === "Income" ? "accounts-income" : "accounts-expense"}>{row.type}</td><td><strong>{row.id}</strong><br/>{row.projectId || "—"}</td><td>{row.category}</td><td>{row.description}<br/><span style={{color:"#89959e"}}>{row.party || "—"}</span></td><td>{row.account || row.method || "—"}<br/><span style={{color:"#89959e"}}>{row.reference || "—"}</span></td><td className={normalizeStatus(row.status) === "pending" ? "accounts-pending" : ""}>{row.status}</td><td className={`${row.type === "Income" ? "accounts-income" : "accounts-expense"} accounts-num`}>{money(row.amount)}</td></tr>)}</tbody></table></div>}
    </section>}

    {quickType && <div className="quick-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeQuick(); }}>
      <form className="quick-modal" onSubmit={saveQuick}>
        <div className="quick-head"><div><small className={quickType === "income" ? "accounts-income" : "accounts-expense"}>QUICK TRANSACTION</small><h3>{quickType === "income" ? "Add income" : "Add expense"}</h3><p>Record it without leaving the Accounts dashboard.</p></div><button className="quick-close" type="button" onClick={closeQuick} aria-label="Close">×</button></div>
        <div className="quick-body">
          {quickError && <div className="quick-error">{quickError}</div>}
          <div className="quick-grid">
            <label>Date<input type="date" value={quickEntry.date} onChange={(event) => setQuickEntry({...quickEntry,date:event.target.value})}/></label>
            <label>Category<select value={quickEntry.category} onChange={(event) => setQuickEntry({...quickEntry,category:event.target.value})}>{quickCategories.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="wide">Description<input autoFocus value={quickEntry.description} onChange={(event) => setQuickEntry({...quickEntry,description:event.target.value})} placeholder={quickType === "income" ? "e.g. Design payment received" : "e.g. Office electricity bill"}/></label>
            <label>Amount (BDT)<input inputMode="decimal" value={quickEntry.amount} onChange={(event) => setQuickEntry({...quickEntry,amount:event.target.value.replace(/[^0-9.]/g,"")})} placeholder="0.00"/></label>
            <label>Payment method<select value={quickEntry.method} onChange={(event) => setQuickEntry({...quickEntry,method:event.target.value})}>{PAYMENT_METHODS.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Project {quickType === "income" ? "*" : "(optional)"}<select value={quickEntry.projectId} onChange={(event) => setQuickEntry({...quickEntry,projectId:event.target.value})}><option value="">{quickType === "income" ? "Select project" : "No project"}</option>{sortedProjects.map((project) => { const id=text(field(project,["Project_ID"])); const name=text(field(project,["Project_Name"])); return <option key={id} value={id}>{id}{name ? ` · ${name}` : ""}</option>; })}</select>{quickType === "income" && <span className="quick-help">Income records currently require a linked project.</span>}</label>
            <label>{quickType === "income" ? "Received from" : "Paid to"}<input value={quickEntry.party} onChange={(event) => setQuickEntry({...quickEntry,party:event.target.value})} placeholder={quickType === "income" ? "Client / payer" : "Employee / vendor"}/></label>
            <label className="wide">Reference<input value={quickEntry.reference} onChange={(event) => setQuickEntry({...quickEntry,reference:event.target.value})} placeholder="Receipt, bKash, bank or cheque reference"/></label>
            <label className="wide">Notes<textarea value={quickEntry.notes} onChange={(event) => setQuickEntry({...quickEntry,notes:event.target.value})} placeholder="Optional internal note"/></label>
          </div>
          <div className="quick-actions"><Link href="/admin/accounts/entry">Open full entry form</Link><button type="button" onClick={closeQuick}>Cancel</button><button className={quickType === "income" ? "save-income" : "save-expense"} disabled={quickBusy}>{quickBusy ? "Saving…" : quickType === "income" ? "Save income" : "Save expense"}</button></div>
        </div>
      </form>
    </div>}
  </div>;
}
