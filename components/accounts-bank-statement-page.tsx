"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";

type ViewMode = "statement" | "income" | "expenses" | "ledger" | "personal" | "reports";
type Row = {
  id: string;
  type: "Income" | "Expense";
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
type HistoricalEditForm = {
  id: string;
  date: string;
  type: "Income" | "Expense";
  projectId: string;
  category: string;
  description: string;
  amount: string;
  method: string;
  account: string;
  reference: string;
};

type NormalizedLedgerItem = {
  row: Row;
  debit: number;
  credit: number;
  transactionType: string;
  is2025Ledger: boolean;
  is2026History: boolean;
};

const FINANCE_URL = "https://docs.google.com/spreadsheets/d/1RDbzIr4aaysiB-UTZQKRK6m60HLg3zSZVzNrdgnGHBc/edit";
const LEDGER_LIVE_START = "2026-09-01";
const LEDGER_END = "2026-12-31";
const HISTORICAL_EDIT_CUTOFF = "2026-09-01";
const LEDGER_METHODS = ["Cash", "bKash", "Nagad", "Bank", "Card", "Cheque", "Other"];
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

function text(value: unknown) {
  return String(value ?? "").trim();
}

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

function normalizeStatus(value: unknown) {
  return text(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
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
  return new Date(year, month - 1, day).toLocaleDateString(
    "en-GB",
    compact
      ? { day: "2-digit", month: "short" }
      : { day: "2-digit", month: "short", year: "numeric" },
  );
}

function money(value: number) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
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

function pendingExpense(record: Record<string, unknown>) {
  return normalizeStatus(field(record, ["Approval_Status", "Approval Status", "Status"])) === "pending";
}

function editableLedgerTransaction(id: string, date: string) {
  return Boolean(id && date);
}

function ledgerEntryRank(debit: number, credit: number) {
  if (credit > 0 && debit <= 0) return 0;
  if (debit > 0 && credit <= 0) return 1;
  return credit >= debit ? 0 : 1;
}

function ledgerWording(row: Pick<Row, "description" | "category" | "projectId" | "party" | "id">) {
  return [row.description, row.category, row.projectId, row.party, row.id]
    .map((value) => text(value))
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function compareNormalizedLedger(a: NormalizedLedgerItem, b: NormalizedLedgerItem) {
  const dateOrder = dateKey(a.row.date).localeCompare(dateKey(b.row.date));
  if (dateOrder) return dateOrder;

  const entryOrder = ledgerEntryRank(a.debit, a.credit) - ledgerEntryRank(b.debit, b.credit);
  if (entryOrder) return entryOrder;

  const wordingOrder = ledgerWording(a.row).localeCompare(ledgerWording(b.row), undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (wordingOrder) return wordingOrder;

  return a.row.id.localeCompare(b.row.id, undefined, { numeric: true, sensitivity: "base" });
}

function compareRunningRows(a: RunningRow, b: RunningRow, newestDateFirst = false) {
  const dateOrder = dateKey(a.date).localeCompare(dateKey(b.date));
  if (dateOrder) return newestDateFirst ? -dateOrder : dateOrder;

  const entryOrder = ledgerEntryRank(a.debit, a.credit) - ledgerEntryRank(b.debit, b.credit);
  if (entryOrder) return entryOrder;

  const wordingOrder = ledgerWording(a).localeCompare(ledgerWording(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (wordingOrder) return wordingOrder;

  return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: "base" });
}

function StatementTable({
  rows,
  openingBalance,
  monthKey,
  showOpening,
  emptyText,
  onEdit,
}: {
  rows: RunningRow[];
  openingBalance?: number;
  monthKey?: string;
  showOpening?: boolean;
  emptyText: string;
  onEdit?: (row: RunningRow) => void;
}) {
  return (
    <div className="bank-table-wrap">
      <table className="bank-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Type</th>
            <th>Transaction / Project</th>
            <th>Particulars</th>
            <th>Account / Reference</th>
            <th className="num">Expense · Debit</th>
            <th className="num">Income · Credit</th>
            <th className="num">Balance</th>
            {onEdit && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr className="empty-row">
              <td colSpan={onEdit ? 9 : 8}>{emptyText}</td>
            </tr>
          )}
          {rows.map((row) => {
            const isExpense = row.debit > 0;
            return (
              <tr key={row.id} className="transaction-row">
                <td className="date-cell">{displayDate(row.date)}</td>
                <td>
                  <span className={`type-pill ${isExpense ? "expense" : "income"}`}>
                    {isExpense ? "Expense" : "Income"}
                  </span>
                </td>
                <td>
                  <strong className="tx-id">{row.id}</strong>
                  <span className="subline">{row.projectId || "General account"}</span>
                </td>
                <td>
                  <strong className="particular">{row.description}</strong>
                  <span className="subline">{row.category || "Uncategorized"}{row.party ? ` · ${row.party}` : ""}</span>
                </td>
                <td>
                  <span>{row.account || row.method || "—"}</span>
                  <span className="subline">{row.reference || row.method || "No reference"}</span>
                </td>
                <td className="num debit">{row.debit ? money(row.debit) : "—"}</td>
                <td className="num credit">{row.credit ? money(row.credit) : "—"}</td>
                <td className={`num balance ${row.balance < 0 ? "negative" : "positive"}`}>{money(row.balance)}</td>
                {onEdit && <td><button className="ledger-edit-btn" type="button" disabled={!editableLedgerTransaction(row.id, row.date)} onClick={() => onEdit(row)}>Edit</button></td>}
              </tr>
            );
          })}
          {showOpening && (
            <tr className="opening-row">
              <td className="date-cell">{monthKey ? displayDate(`${monthKey}-01`) : "—"}</td>
              <td><span className="type-pill opening">Opening</span></td>
              <td><strong className="tx-id">Previous balance</strong><span className="subline">Brought forward</span></td>
              <td><strong className="particular">Balance from previous month</strong><span className="subline">Starting point for this month&apos;s running balance</span></td>
              <td><span>Opening position</span><span className="subline">No debit or credit</span></td>
              <td className="num">—</td>
              <td className="num">—</td>
              <td className={`num balance ${(openingBalance || 0) < 0 ? "negative" : "positive"}`}>{money(openingBalance || 0)}</td>
              {onEdit && <td>—</td>}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function AccountsBankStatementPage() {
  const [transactions, setTransactions] = useState<Record<string, unknown>[]>([]);
  const [expenses, setExpenses] = useState<Record<string, unknown>[]>([]);
  const [mode, setMode] = useState<ViewMode>("statement");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editError, setEditError] = useState("");
  const [edit, setEdit] = useState<HistoricalEditForm | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      landViewApi.getFinanceSheet("Transactions"),
      landViewApi.getErpRecords("expenses"),
    ])
      .then(([transactionSheet, expenseRows]) => {
        if (cancelled) return;
        setTransactions(financeSheetToRecords(transactionSheet));
        setExpenses(expenseRows || []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load Accounts.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [revision]);

  const ledgerRows = useMemo<RunningRow[]>(() => {
    const normalized: NormalizedLedgerItem[] = transactions
      .map((record) => {
        const id = text(field(record, ["Transaction_ID", "Transaction ID", "TransactionId"]));
        const date = text(field(record, ["Transaction_Date", "Transaction Date", "Date"]));
        const projectId = text(field(record, ["Project_ID", "Project ID", "ProjectId"]));
        const category = text(field(record, ["Category"])) || "Uncategorized";
        const description = text(field(record, ["Description", "Particulars"])) || category;
        const status = text(field(record, ["Status"])) || "Posted";
        const method = text(field(record, ["Payment_Method", "Payment Method", "Method"]));
        const account = text(field(record, ["Account", "Account_Name", "Account Name"]));
        const reference = text(field(record, ["Reference_No", "Reference No", "Reference"]));
        const party = text(field(record, ["Party", "Received_From", "Received From", "Paid_To", "Paid To", "Payee", "Payer"]));
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
          party,
          search: "",
        };
        row.search = [
          ...Object.values(row),
          field(record, ["Source_Type", "Source Type"]),
          field(record, ["Source_ID", "Source ID"]),
          field(record, ["Created_By", "Created By"]),
        ]
          .join(" ")
          .toLowerCase();
        return {
          row,
          debit,
          credit,
          transactionType,
          is2025Ledger: id.startsWith("TXN-LEDGER-2025-"),
          is2026History: id.startsWith("TXN-HIST-2026-"),
        };
      })
      .filter((item) => item.row.id && item.row.date && (item.debit > 0 || item.credit > 0));

    const history = normalized
      .filter((item) => item.is2025Ledger || item.is2026History)
      .sort(compareNormalizedLedger);

    const live = normalized
      .filter((item) => {
        if (item.is2025Ledger || item.is2026History) return false;
        if (normalizeStatus(item.row.status) !== "posted") return false;
        if (item.transactionType === "transfer" || item.transactionType === "personal income" || item.transactionType === "personal expense") return false;
        const key = dateKey(item.row.date);
        return key >= LEDGER_LIVE_START && key <= LEDGER_END;
      })
      .sort(compareNormalizedLedger);

    let balance = 0;
    return [...history, ...live].map((item) => {
      balance += item.credit - item.debit;
      return {
        ...item.row,
        debit: item.debit,
        credit: item.credit,
        balance,
      };
    });
  }, [transactions]);

  const personalRows = useMemo<RunningRow[]>(() => {
    const rows = transactions
      .map((record) => {
        const transactionType = normalizeStatus(field(record, ["Transaction_Type", "Transaction Type", "Type"]));
        const sourceType = normalizeStatus(field(record, ["Source_Type", "Source Type"]));
        if (sourceType !== "personal") return null;
        const id = text(field(record, ["Transaction_ID", "Transaction ID", "TransactionId"]));
        const date = text(field(record, ["Transaction_Date", "Transaction Date", "Date"]));
        const projectId = text(field(record, ["Project_ID", "Project ID", "ProjectId"]));
        const category = text(field(record, ["Category"])) || "Eng Rony Personal";
        const description = text(field(record, ["Description", "Particulars"])) || category;
        const method = text(field(record, ["Payment_Method", "Payment Method", "Method"]));
        const account = text(field(record, ["Account", "Account_Name", "Account Name"]));
        const reference = text(field(record, ["Reference_No", "Reference No", "Reference"]));
        let debit = amount(field(record, ["Debit"]));
        let credit = amount(field(record, ["Credit"]));
        const fallbackAmount = amount(field(record, ["Amount"]));
        if (!debit && !credit && fallbackAmount > 0) {
          if (transactionType === "expense") debit = fallbackAmount;
          else credit = fallbackAmount;
        }
        const row: RunningRow = {
          id,
          type: credit >= debit ? "Income" : "Expense",
          date,
          projectId,
          category,
          description,
          amount: Math.max(debit, credit, fallbackAmount),
          status: text(field(record, ["Status"])) || "Posted",
          method,
          account,
          reference,
          party: "",
          search: [id, date, projectId, category, description, method, account, reference].join(" ").toLowerCase(),
          debit,
          credit,
          balance: 0,
        };
        return row;
      })
      .filter((row): row is RunningRow => Boolean(row?.id && row?.date))
      .sort((a, b) => compareRunningRows(a, b));

    let balance = 0;
    return rows.map((row) => {
      balance += row.credit - row.debit;
      return { ...row, balance };
    });
  }, [transactions]);

  const personalIncome = personalRows.reduce((sum, row) => sum + row.credit, 0);
  const personalExpense = personalRows.reduce((sum, row) => sum + row.debit, 0);
  const personalNet = personalIncome - personalExpense;

  const cashLedgerRows = ledgerRows;

  const monthKey = dhakaDateKey(new Date()).slice(0, 7);
  const monthLabel = DHAKA_MONTH.format(new Date());
  const monthStart = `${monthKey}-01`;

  const officialMonthChronological = useMemo(
    () => ledgerRows.filter((row) => dateKey(row.date).startsWith(monthKey)),
    [ledgerRows, monthKey],
  );

  const cashMonthChronological = useMemo(
    () => cashLedgerRows.filter((row) => dateKey(row.date).startsWith(monthKey)),
    [cashLedgerRows, monthKey],
  );

  const monthStatementRows = useMemo(
    () => [...cashMonthChronological].sort((a, b) => compareRunningRows(a, b, true)),
    [cashMonthChronological],
  );

  const previousBalance = useMemo(() => {
    const previous = cashLedgerRows.filter((row) => dateKey(row.date) < monthStart);
    return previous.length ? previous[previous.length - 1].balance : 0;
  }, [cashLedgerRows, monthStart]);

  const currentBalance = cashMonthChronological.length
    ? cashMonthChronological[cashMonthChronological.length - 1].balance
    : previousBalance;
  const officialMonthIncome = officialMonthChronological.reduce((sum, row) => sum + row.credit, 0);
  const officialMonthExpense = officialMonthChronological.reduce((sum, row) => sum + row.debit, 0);
  const officialMonthNet = officialMonthIncome - officialMonthExpense;
  const monthIncome = cashMonthChronological.reduce((sum, row) => sum + row.credit, 0);
  const monthExpense = cashMonthChronological.reduce((sum, row) => sum + row.debit, 0);
  const monthNet = monthIncome - monthExpense;
  const cashMonthNet = monthNet;

  const pendingThisMonth = useMemo(
    () => expenses.filter((record) => pendingExpense(record) && dateKey(field(record, ["Expense_Date", "Expense Date", "Date"])).startsWith(monthKey)),
    [expenses, monthKey],
  );
  const pendingAmount = pendingThisMonth.reduce((sum, record) => sum + amount(field(record, ["Amount", "Expense_Amount", "Expense Amount"])), 0);

  const filteredLedger = useMemo(() => {
    const term = query.trim().toLowerCase();
    return [...cashLedgerRows]
      .filter((row) => !term || row.search.includes(term))
      .sort((a, b) => compareRunningRows(a, b, true));
  }, [cashLedgerRows, query]);

  const modeRows = useMemo(() => {
    if (mode === "statement") return monthStatementRows;
    if (mode === "income") return [...cashMonthChronological].filter((row) => row.credit > 0).sort((a, b) => compareRunningRows(a, b, true));
    if (mode === "expenses") return [...cashMonthChronological].filter((row) => row.debit > 0).sort((a, b) => compareRunningRows(a, b, true));
    if (mode === "personal") return [...personalRows].sort((a, b) => compareRunningRows(a, b, true));
    return filteredLedger;
  }, [filteredLedger, mode, monthStatementRows, cashMonthChronological, personalRows]);

  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { category: string; income: number; expense: number }>();
    officialMonthChronological.forEach((row) => {
      const key = row.category || "Uncategorized";
      const current = map.get(key) || { category: key, income: 0, expense: 0 };
      current.income += row.credit;
      current.expense += row.debit;
      map.set(key, current);
    });
    return [...map.values()].sort((a, b) => b.income + b.expense - (a.income + a.expense));
  }, [officialMonthChronological]);

  const allCredit = ledgerRows.reduce((sum, row) => sum + row.credit, 0);
  const allDebit = ledgerRows.reduce((sum, row) => sum + row.debit, 0);

  function beginLedgerEdit(row: RunningRow) {
    setMessage("");
    setEditError("");
    setEdit({
      id: row.id,
      date: dateKey(row.date),
      type: row.debit > 0 ? "Expense" : "Income",
      projectId: row.projectId,
      category: row.category,
      description: row.description,
      amount: String(row.debit || row.credit || row.amount || ""),
      method: row.method,
      account: row.account,
      reference: row.reference,
    });
  }

  async function saveLedgerEdit() {
    if (!edit) return;
    const value = Number(edit.amount.replace(/,/g, ""));
    if (!edit.date) return setEditError("Choose a transaction date.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(edit.date)) return setEditError("Choose a valid transaction date.");
    if (!edit.description.trim()) return setEditError("Description is required.");
    if (!Number.isFinite(value) || value <= 0) return setEditError("Enter a valid amount greater than zero.");

    setSavingEdit(true);
    setEditError("");
    try {
      const response = await fetch("/api/accounts/ledger", {
        method: "PATCH",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          Transaction_ID: edit.id,
          Transaction_Date: edit.date,
          Entry_Type: edit.type,
          Project_ID: edit.projectId.trim(),
          Category: edit.category.trim(),
          Description: edit.description.trim(),
          Amount: value,
          Payment_Method: edit.method,
          Account: edit.account.trim(),
          Reference_No: edit.reference.trim(),
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not update ledger entry."));
      const id = edit.id;
      setEdit(null);
      setMessage(`${id} updated successfully. Running balances were recalculated.`);
      setRevision((value) => value + 1);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Could not update historical ledger entry.");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="bank-accounts-page">
      <style>{`
        .bank-accounts-page{--bg:#0b1116;--panel:#10181f;--panel2:#131d25;--line:#293640;--line2:#35434e;--text:#edf2f5;--muted:#84919a;--green:#8fe0ad;--green-bg:#12291c;--red:#ff958f;--red-bg:#30191c;--amber:#e8c66f;color:var(--text);padding-bottom:24px}.bank-accounts-page *{box-sizing:border-box}.bank-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin:0 0 16px}.bank-kicker{display:block;color:#ed6963;font-size:10px;font-weight:900;letter-spacing:.14em}.bank-head h1{margin:5px 0 2px;font-size:36px;line-height:1;letter-spacing:-.035em}.bank-head p{margin:7px 0 0;color:var(--muted);font-size:11px}.bank-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}.bank-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:35px;padding:8px 12px;border:1px solid #3a4751;border-radius:9px;background:#131b22;color:#e8eef1;text-decoration:none;font-size:10px;font-weight:900;cursor:pointer}.bank-btn:hover{border-color:#5a6872}.bank-btn.primary{background:#c83d3f;border-color:#d44c4e;color:#fff}.bank-btn:disabled{opacity:.55;cursor:not-allowed}.bank-alert{margin-bottom:12px;padding:10px 13px;border:1px solid #65363a;border-radius:9px;background:#321c1e;color:#ffaaa5;font-size:10px}.bank-alert.success{border-color:#2e6345;background:#183524;color:#a2e6b8}.bank-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}.bank-metric{position:relative;overflow:hidden;min-height:105px;padding:15px 16px;border:1px solid #303d47;border-radius:13px;background:linear-gradient(145deg,#151f27,#0f171d)}.bank-metric:after{content:"";position:absolute;right:-24px;bottom:-38px;width:100px;height:100px;border-radius:50%;background:rgba(255,255,255,.025)}.bank-metric span{display:block;color:#8b98a1;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.09em}.bank-metric strong{position:relative;display:block;margin-top:10px;font-size:21px;font-variant-numeric:tabular-nums;white-space:nowrap}.bank-metric p{position:relative;margin:7px 0 0;color:#73808a;font-size:9px;line-height:1.45}.positive{color:var(--green)!important}.negative{color:var(--red)!important}.bank-statement{overflow:hidden;border:1px solid #303d47;border-radius:15px;background:linear-gradient(180deg,#10181f,#0b1217);box-shadow:0 18px 50px rgba(0,0,0,.12)}.statement-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:17px 18px 15px;border-bottom:1px solid #293640;background:radial-gradient(circle at 88% -40%,rgba(211,65,64,.16),transparent 42%)}.statement-title small{display:block;color:#ee6b65;font-size:9px;font-weight:900;letter-spacing:.14em}.statement-title h2{margin:4px 0 4px;font-size:23px;letter-spacing:-.02em}.statement-title p{margin:0;color:#7e8b94;font-size:10px;line-height:1.5}.statement-head-stats{display:flex;gap:18px}.head-stat{text-align:right}.head-stat span{display:block;color:#75828b;font-size:8px;text-transform:uppercase;letter-spacing:.08em}.head-stat strong{display:block;margin-top:4px;font-size:14px;font-variant-numeric:tabular-nums}.bank-tabs{display:flex;align-items:center;gap:5px;padding:8px 10px;border-bottom:1px solid #28343d;background:#0d151b;overflow:auto}.bank-tabs button{border:0;border-radius:7px;background:transparent;color:#89969e;padding:7px 11px;font-size:9px;font-weight:900;white-space:nowrap;cursor:pointer}.bank-tabs button.active{background:#c83d3f;color:white;box-shadow:0 4px 14px rgba(200,61,63,.18)}.bank-tabs .tab-spacer{flex:1}.statement-search{width:min(280px,35vw);border:1px solid #33414b;border-radius:7px;background:#091117;color:#edf2f5;padding:8px 10px;font-size:9px;outline:none}.statement-search:focus{border-color:#596873}.bank-table-wrap{max-width:100%;overflow:auto}.bank-table{width:100%;min-width:1120px;border-collapse:collapse}.bank-table th,.bank-table td{padding:11px 12px;border-bottom:1px solid #25313a;vertical-align:middle;text-align:left}.bank-table th{position:sticky;top:0;z-index:2;background:#111a21;color:#8a969f;font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.075em}.bank-table td{font-size:10px}.bank-table .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.transaction-row:hover{background:#121c23}.date-cell{color:#a5afb5;white-space:nowrap}.tx-id{display:block;color:#e5ebee;font-size:10px}.particular{display:block;color:#dfe6e9;font-size:10px}.subline{display:block;margin-top:3px;color:#73808a;font-size:8px;line-height:1.35}.type-pill{display:inline-flex;align-items:center;justify-content:center;min-width:61px;padding:5px 7px;border:1px solid;border-radius:999px;font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.05em}.type-pill.income{border-color:#315f42;background:#152a1e;color:#9ee5b7}.type-pill.expense{border-color:#6e3439;background:#321b1d;color:#ffaaa5}.type-pill.opening{border-color:#4d5b66;background:#1b252d;color:#bdc8ce}.ledger-edit-btn{border:1px solid #4b5963;border-radius:7px;background:#17222b;color:#edf2f5;padding:6px 9px;font-size:8px;font-weight:900;cursor:pointer}.ledger-edit-btn:hover{border-color:#77858f}.ledger-source-lock{color:#66737c;font-size:8px;white-space:nowrap}.debit{color:var(--red);font-weight:900}.credit{color:var(--green);font-weight:900}.balance{font-weight:900}.opening-row{background:#182229}.opening-row td{border-top:2px solid #45535e;border-bottom:0}.opening-row .balance{font-size:11px}.empty-row td{text-align:center;color:#75828b;padding:30px}.statement-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 13px;border-top:1px solid #293640;background:#0c141a;color:#74818a;font-size:9px}.footer-note strong{color:#aeb8be}.pending-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid #5b4d2c;border-radius:999px;background:#251f12;color:#e5c46d;padding:5px 8px;font-weight:900}.report-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;padding:12px}.report-card{border:1px solid #2c3943;border-radius:11px;background:#101820;padding:14px}.report-card span{display:block;color:#7f8c95;font-size:9px;text-transform:uppercase;letter-spacing:.08em}.report-card strong{display:block;margin-top:8px;font-size:19px}.category-table{padding:0}.category-table table{width:100%;border-collapse:collapse}.category-table th,.category-table td{padding:11px 13px;border-bottom:1px solid #25313a;font-size:10px}.category-table th{text-align:left;color:#89969f;font-size:8px;text-transform:uppercase;letter-spacing:.07em}.category-table .num{text-align:right;font-variant-numeric:tabular-nums}.category-table tr:last-child td{border-bottom:0}.ledger-modal-backdrop{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:18px;background:rgba(0,0,0,.72)}.ledger-modal{width:min(720px,100%);max-height:90vh;overflow:auto;border:1px solid #3a4751;border-radius:14px;background:#101820;padding:18px;box-shadow:0 24px 80px rgba(0,0,0,.5)}.ledger-modal h2{margin:0 0 4px;font-size:21px}.ledger-modal-intro{margin:0 0 14px;color:#839099;font-size:9px;line-height:1.5}.ledger-modal-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ledger-modal-grid label{display:grid;gap:5px;color:#8f9ba4;font-size:9px;font-weight:800;text-transform:uppercase}.ledger-modal-grid label.wide{grid-column:1/-1}.ledger-modal-grid input,.ledger-modal-grid select,.ledger-modal-grid textarea{width:100%;border:1px solid #35424b;border-radius:7px;background:#091016;color:#edf1f4;padding:10px;font-size:10px}.ledger-modal-grid textarea{min-height:84px;resize:vertical}.ledger-modal-note{grid-column:1/-1;padding:9px 10px;border:1px solid #5a4d2f;border-radius:8px;background:#251f12;color:#dfc576;font-size:9px;line-height:1.5}.ledger-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}.ledger-modal-error{margin:0 0 12px;padding:9px 10px;border:1px solid #73363a;border-radius:8px;background:#351b1d;color:#ffaaa5;font-size:9px}@media(max-width:1000px){.bank-metrics{grid-template-columns:1fr 1fr}.bank-head{align-items:flex-start;flex-direction:column}.bank-actions{justify-content:flex-start}.statement-head{flex-direction:column}.statement-head-stats{width:100%;justify-content:space-between}.head-stat{text-align:left}.report-grid{grid-template-columns:1fr}}@media(max-width:700px){.bank-metrics{grid-template-columns:1fr}.bank-head h1{font-size:31px}.bank-actions{width:100%}.bank-btn{flex:1}.bank-tabs{align-items:stretch;flex-wrap:wrap}.bank-tabs .tab-spacer{display:none}.statement-search{width:100%;max-width:none}.statement-head-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px}.statement-footer{align-items:flex-start;flex-direction:column}}
      `}</style>

      <header className="bank-head">
        <div>
          <small className="bank-kicker">LAND VIEW / FINANCIAL ACCOUNTS</small>
          <h1>Accounts</h1>
          <p>Current-month cashflow first, with every posted transaction shown in one bank-statement format.</p>
        </div>
        <div className="bank-actions">
          <Link className="bank-btn primary" href="/admin/accounts/entry">＋ Record transaction</Link>
          <Link className="bank-btn" href="/admin/accounts/export">Export Ledger</Link>
          <Link className="bank-btn" href="/admin/finance">Billing</Link>
          <a className="bank-btn" href={FINANCE_URL} target="_blank" rel="noreferrer">Finance Database</a>
          <button className="bank-btn" type="button" disabled={loading} onClick={() => setRevision((value) => value + 1)}>{loading ? "Refreshing…" : "Refresh"}</button>
        </div>
      </header>

      {error && <div className="bank-alert">{error}</div>}
      {message && <div className="bank-alert success">{message}</div>}

      <section className="bank-metrics" aria-label={`${monthLabel} summary`}>
        <article className="bank-metric">
          <span>Previous balance</span>
          <strong className={previousBalance < 0 ? "negative" : "positive"}>{money(previousBalance)}</strong>
          <p>Balance carried forward into {monthLabel}.</p>
        </article>
        <article className="bank-metric">
          <span>Total income this month</span>
          <strong className="positive">{money(monthIncome)}</strong>
          <p>{cashMonthChronological.filter((row) => row.credit > 0).length} credit transaction{cashMonthChronological.filter((row) => row.credit > 0).length === 1 ? "" : "s"} · official {money(officialMonthIncome)}.</p>
        </article>
        <article className="bank-metric">
          <span>Total expense this month</span>
          <strong className="negative">{money(monthExpense)}</strong>
          <p>{cashMonthChronological.filter((row) => row.debit > 0).length} debit transaction{cashMonthChronological.filter((row) => row.debit > 0).length === 1 ? "" : "s"} · official {money(officialMonthExpense)}.</p>
        </article>
        <article className="bank-metric">
          <span>Current balance</span>
          <strong className={currentBalance < 0 ? "negative" : "positive"}>{money(currentBalance)}</strong>
          <p>All cash movements, including Eng Rony personal entries. Month movement: {money(cashMonthNet)}.</p>
        </article>
      </section>

      <section className="bank-statement">
        <div className="statement-head">
          <div className="statement-title">
            <small>{mode === "ledger" ? "AUTHORITATIVE LEDGER" : mode === "personal" ? "ENG RONY / PERSONAL" : mode === "reports" ? "CURRENT MONTH ANALYSIS" : "CURRENT MONTH STATEMENT"}</small>
            <h2>{mode === "ledger" ? "Full running ledger" : mode === "personal" ? "Eng Rony personal ledger" : mode === "reports" ? `${monthLabel} report` : `${monthLabel} statement`}</h2>
            <p>{mode === "ledger" ? "Full official running balance, newest date first; within each date income is listed before that date's expenses." : mode === "personal" ? "Eng Rony personal-source expenses are posted officially as Eng Rony Salary; this tab is only a filtered view of those same records." : mode === "reports" ? "Official income and expenditure summarized by category for this month." : "Newest date stays at the top; within each date income is listed first, followed by that date's expenses. Eng Rony personal expenses are included in official expense as Eng Rony Salary."}</p>
          </div>
          <div className="statement-head-stats">
            {mode === "personal" ? <>
              <div className="head-stat"><span>Personal income</span><strong className="positive">{money(personalIncome)}</strong></div>
              <div className="head-stat"><span>Personal expense</span><strong className="negative">{money(personalExpense)}</strong></div>
              <div className="head-stat"><span>Personal net</span><strong className={personalNet < 0 ? "negative" : "positive"}>{money(personalNet)}</strong></div>
            </> : <>
              <div className="head-stat"><span>Opening</span><strong className={previousBalance < 0 ? "negative" : "positive"}>{money(previousBalance)}</strong></div>
              <div className="head-stat"><span>Cash movement</span><strong className={cashMonthNet < 0 ? "negative" : "positive"}>{money(cashMonthNet)}</strong></div>
              <div className="head-stat"><span>Closing / live</span><strong className={currentBalance < 0 ? "negative" : "positive"}>{money(currentBalance)}</strong></div>
            </>}
          </div>
        </div>

        <nav className="bank-tabs" aria-label="Accounts views">
          <button type="button" className={mode === "statement" ? "active" : ""} onClick={() => { setMode("statement"); setQuery(""); }}>Current Month</button>
          <button type="button" className={mode === "income" ? "active" : ""} onClick={() => { setMode("income"); setQuery(""); }}>Income</button>
          <button type="button" className={mode === "expenses" ? "active" : ""} onClick={() => { setMode("expenses"); setQuery(""); }}>Expenses</button>
          <button type="button" className={mode === "ledger" ? "active" : ""} onClick={() => setMode("ledger")}>Full Ledger</button>
          <button type="button" className={mode === "personal" ? "active" : ""} onClick={() => { setMode("personal"); setQuery(""); }}>Eng Rony Personal</button>
          <button type="button" className={mode === "reports" ? "active" : ""} onClick={() => { setMode("reports"); setQuery(""); }}>Reports</button>
          <span className="tab-spacer" />
          {mode === "ledger" && <input className="statement-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search transaction, project, category or reference…" />}
        </nav>

        {loading ? (
          <div className="empty-row" style={{ padding: 34, textAlign: "center", color: "#75828b" }}>Loading financial statement…</div>
        ) : mode === "reports" ? (
          <>
            <div className="report-grid">
              <article className="report-card"><span>Ledger credits · all history</span><strong className="positive">{money(allCredit)}</strong></article>
              <article className="report-card"><span>Ledger debits · all history</span><strong className="negative">{money(allDebit)}</strong></article>
            </div>
            <div className="category-table">
              <table>
                <thead><tr><th>Category</th><th className="num">Income</th><th className="num">Expense</th><th className="num">Net</th></tr></thead>
                <tbody>
                  {categoryBreakdown.length === 0 ? <tr><td colSpan={4} style={{ textAlign: "center", color: "#75828b", padding: 28 }}>No posted transactions for {monthLabel}.</td></tr> : categoryBreakdown.map((item) => <tr key={item.category}><td>{item.category}</td><td className="num positive">{money(item.income)}</td><td className="num negative">{money(item.expense)}</td><td className={`num ${item.income - item.expense < 0 ? "negative" : "positive"}`}>{money(item.income - item.expense)}</td></tr>)}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <StatementTable
            rows={modeRows}
            openingBalance={mode === "personal" ? 0 : previousBalance}
            monthKey={monthKey}
            showOpening={mode !== "ledger" && mode !== "personal"}
            emptyText={mode === "ledger" ? "No matching ledger transactions." : mode === "personal" ? "No Eng Rony personal transactions." : mode === "income" ? `No posted income in ${monthLabel}.` : mode === "expenses" ? `No posted expenses in ${monthLabel}.` : `No posted transactions in ${monthLabel}.`}
            onEdit={mode === "ledger" ? beginLedgerEdit : undefined}
          />
        )}

        <div className="statement-footer">
          <span className="footer-note"><strong>Statement order:</strong> newest at top → oldest at bottom{mode === "personal" || mode === "ledger" ? "." : " → previous balance as the final opening row."}</span>
          {mode === "personal" ? <span>These are official Accounts entries; personal expenses are categorized as Eng Rony Salary.</span> : pendingThisMonth.length > 0 ? <span className="pending-chip">{pendingThisMonth.length} pending expense{pendingThisMonth.length === 1 ? "" : "s"} · {money(pendingAmount)} not deducted</span> : <span>No pending expenses affecting this month&apos;s posted balance.</span>}
        </div>
      </section>

      {edit && <div className="ledger-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !savingEdit) setEdit(null); }}>
        <section className="ledger-modal">
          <h2>Edit ledger entry</h2>
          <p className="ledger-modal-intro">{edit.id} · Admins can correct the date, type, category, description, amount, project, account, payment method and reference for any posted ledger entry.</p>
          {editError && <div className="ledger-modal-error">{editError}</div>}
          <div className="ledger-modal-grid">
            <label>Date<input type="date" value={edit.date} onChange={(event) => setEdit({ ...edit, date: event.target.value })}/></label>
            <label>Type<select value={edit.type} onChange={(event) => setEdit({ ...edit, type: event.target.value as "Income" | "Expense" })}><option>Income</option><option>Expense</option></select></label>
            <label>Category<input value={edit.category} onChange={(event) => setEdit({ ...edit, category: event.target.value })}/></label>
            <label>Amount (BDT)<input inputMode="decimal" value={edit.amount} onChange={(event) => setEdit({ ...edit, amount: event.target.value.replace(/[^0-9.]/g, "") })}/></label>
            <label className="wide">Description<input value={edit.description} onChange={(event) => setEdit({ ...edit, description: event.target.value })}/></label>
            <label>Project / File ID<input value={edit.projectId} onChange={(event) => setEdit({ ...edit, projectId: event.target.value })} placeholder="Optional LV-xxx"/></label>
            <label>Account<input value={edit.account} onChange={(event) => setEdit({ ...edit, account: event.target.value })} placeholder="Cash / Bank / account name"/></label>
            <label>Payment method<select value={edit.method} onChange={(event) => setEdit({ ...edit, method: event.target.value })}><option value="">Not specified</option>{LEDGER_METHODS.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Reference<input value={edit.reference} onChange={(event) => setEdit({ ...edit, reference: event.target.value })} placeholder="Optional reference"/></label>
            <div className="ledger-modal-note">Saving updates this ledger transaction and writes an audit-log entry. The running balance is rebuilt automatically after the correction.</div>
          </div>
          <div className="ledger-modal-actions">
            <button className="bank-btn" type="button" disabled={savingEdit} onClick={() => setEdit(null)}>Cancel</button>
            <button className="bank-btn primary" type="button" disabled={savingEdit} onClick={() => void saveLedgerEdit()}>{savingEdit ? "Saving…" : "Save correction"}</button>
          </div>
        </section>
      </div>}
    </div>
  );
}
