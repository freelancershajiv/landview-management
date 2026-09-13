"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { landViewApi, type FinanceSheetData } from "@/lib/api";

type Row = Record<string, string>;

type SeptemberStatus = {
  openingBalance: number;
  cleanIncome: number;
  rawIncome: number;
  duplicateIncome: number;
  approvedExpense: number;
  pendingExpense: number;
  duplicateExpense: number;
  confirmedNet: number;
  projectedNet: number;
  pendingCount: number;
  approvedCount: number;
  receiptCount: number;
  duplicateReceiptCount: number;
  expenseCount: number;
  duplicateExpenseCount: number;
};

const TARGET_YEAR = 2026;
const TARGET_MONTH = 9;
const SEPTEMBER_OPENING_BALANCE = -63847.5419;

const text = (value: unknown) => String(value ?? "").trim();
const amount = (value: unknown) => {
  const valueText = text(value).replace(/,/g, "").replace(/[^0-9.-]/g, "");
  const parsed = Number(valueText || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

function records(data: FinanceSheetData | null): Row[] {
  if (!data) return [];
  return (data.rows || []).map((row) => {
    const result: Row = {};
    (data.headers || []).forEach((header, index) => {
      const key = text(header);
      if (key) result[key] = text(row[index]);
    });
    return result;
  });
}

function parseDate(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  if (/^\d{5}(?:\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (Number.isFinite(serial) && serial > 20000 && serial < 80000) {
      return new Date(1899, 11, 30 + Math.floor(serial));
    }
  }
  const parsed = Date.parse(raw);
  if (!Number.isNaN(parsed)) return new Date(parsed);
  return null;
}

function dateKey(value: unknown) {
  const date = parseDate(value);
  if (!date) return text(value);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function isTargetMonth(value: unknown) {
  const date = parseDate(value);
  return !!date && date.getFullYear() === TARGET_YEAR && date.getMonth() + 1 === TARGET_MONTH;
}

function money(value: number) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 2,
  }).format(value);
}

function incomeKey(row: Row) {
  const reference = text(row.Reference_No);
  return reference
    ? [reference, text(row.File_ID), dateKey(row.Payment_Date), amount(row.Amount), text(row.Payment_For)].join("|")
    : text(row.Income_ID) || JSON.stringify(row);
}

function expenseKey(row: Row) {
  const id = text(row.Expense_ID);
  const duplicatedSeptemberSeed = /^HIST-2026-09-R\d+$/i.test(id) || /^SEP-2026-EXP-\d+$/i.test(id);
  if (!duplicatedSeptemberSeed) return `id:${id || JSON.stringify(row)}`;
  return [
    "sep-2026",
    dateKey(row.Expense_Date),
    text(row.File_ID),
    text(row.Category),
    amount(row.Amount),
  ].join("|");
}

function statusRank(row: Row) {
  const status = text(row.Approval_Status).toLowerCase();
  if (status === "approved") return 3;
  if (status === "pending") return 2;
  if (status === "rejected") return 1;
  return 0;
}

function buildStatus(incomeData: FinanceSheetData | null, expenseData: FinanceSheetData | null): SeptemberStatus {
  const incomeRows = records(incomeData).filter((row) => isTargetMonth(row.Payment_Date));
  const expenseRows = records(expenseData).filter((row) => isTargetMonth(row.Expense_Date));

  const uniqueIncome = new Map<string, Row>();
  incomeRows.forEach((row) => {
    const key = incomeKey(row);
    if (!uniqueIncome.has(key)) uniqueIncome.set(key, row);
  });

  const uniqueExpense = new Map<string, Row>();
  expenseRows.forEach((row) => {
    const key = expenseKey(row);
    const current = uniqueExpense.get(key);
    if (!current || statusRank(row) > statusRank(current)) uniqueExpense.set(key, row);
  });

  const rawIncome = incomeRows.reduce((sum, row) => sum + amount(row.Amount), 0);
  const cleanIncome = [...uniqueIncome.values()].reduce((sum, row) => sum + amount(row.Amount), 0);
  const rawExpense = expenseRows.reduce((sum, row) => sum + amount(row.Amount), 0);

  let approvedExpense = 0;
  let pendingExpense = 0;
  let pendingCount = 0;
  let approvedCount = 0;

  [...uniqueExpense.values()].forEach((row) => {
    const status = text(row.Approval_Status).toLowerCase();
    if (status === "approved") {
      approvedExpense += amount(row.Amount);
      approvedCount += 1;
      return;
    }
    if (status === "pending" || !status) {
      pendingExpense += amount(row.Amount);
      pendingCount += 1;
    }
  });

  const confirmedNet = SEPTEMBER_OPENING_BALANCE + cleanIncome - approvedExpense;

  return {
    openingBalance: SEPTEMBER_OPENING_BALANCE,
    cleanIncome,
    rawIncome,
    duplicateIncome: Math.max(0, rawIncome - cleanIncome),
    approvedExpense,
    pendingExpense,
    duplicateExpense: Math.max(0, rawExpense - approvedExpense - pendingExpense),
    confirmedNet,
    projectedNet: confirmedNet - pendingExpense,
    pendingCount,
    approvedCount,
    receiptCount: uniqueIncome.size,
    duplicateReceiptCount: Math.max(0, incomeRows.length - uniqueIncome.size),
    expenseCount: uniqueExpense.size,
    duplicateExpenseCount: Math.max(0, expenseRows.length - uniqueExpense.size),
  };
}

export default function AccountsStatusPanel() {
  const pathname = usePathname();
  const [incomeData, setIncomeData] = useState<FinanceSheetData | null>(null);
  const [expenseData, setExpenseData] = useState<FinanceSheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  const active = pathname === "/admin/accounts" || pathname?.startsWith("/admin/accounts/");

  useEffect(() => {
    if (!active) return;
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
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not calculate the September position.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, revision]);

  const status = useMemo(() => buildStatus(incomeData, expenseData), [incomeData, expenseData]);

  if (!active) return null;

  const netNegative = status.projectedNet < 0;

  return (
    <section className="accounts-status-control" aria-label="September 2026 reconciled LAND VIEW account status">
      <style>{`
        .accounts-status-control{max-width:1680px;margin:0 auto 14px;padding:15px;border:1px solid #2d3b45;border-radius:15px;background:linear-gradient(145deg,#111b22,#0c141a);color:#eef3f6;box-shadow:0 14px 34px rgba(0,0,0,.12)}
        .asc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:12px}.asc-kicker{display:block;color:#ef7771;font-size:9px;font-weight:900;letter-spacing:.15em}.asc-head h2{margin:5px 0 4px;font-size:18px;letter-spacing:-.015em}.asc-head p{margin:0;color:#8898a3;font-size:10.5px;line-height:1.55}.asc-refresh{border:1px solid #3b4b57;background:#17222b;color:#edf2f5;border-radius:9px;padding:9px 12px;font-size:9.5px;font-weight:900;cursor:pointer}.asc-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.asc-card{position:relative;min-height:104px;padding:13px 14px;border:1px solid #293842;border-radius:11px;background:#0d161c;overflow:hidden}.asc-card:before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:#536472}.asc-card.opening:before{background:#7e8b95}.asc-card.income:before{background:#42ad70}.asc-card.approved:before{background:#6c8ebf}.asc-card.pending:before{background:#d39a4a}.asc-card.net:before{background:#d8454a}.asc-card.net.positive:before{background:#42ad70}.asc-label{display:block;color:#81909a;font-size:8.5px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.asc-value{display:block;margin-top:8px;color:#fff;font-size:20px;line-height:1.1;font-weight:900;font-variant-numeric:tabular-nums}.asc-card.income .asc-value{color:#8ce3ad}.asc-card.pending .asc-value{color:#efc078}.asc-card.net:not(.positive) .asc-value{color:#ffaaa7}.asc-card.net.positive .asc-value{color:#8ce3ad}.asc-meta{display:block;margin-top:7px;color:#73848f;font-size:8.5px;line-height:1.45}.asc-flags{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.asc-flag{display:inline-flex;align-items:center;gap:6px;padding:6px 8px;border:1px solid #33434e;border-radius:999px;background:#101a21;color:#9eadb6;font-size:8.5px}.asc-flag.warning{border-color:#634a2f;background:rgba(190,128,54,.08);color:#e9bd7a}.asc-flag strong{color:#f2f5f7}.asc-error{padding:10px;border:1px solid #73383d;border-radius:9px;background:#301b1e;color:#ffb3af;font-size:10px}.asc-loading{padding:17px;color:#82919b;font-size:10px}@media(max-width:1150px){.asc-grid{grid-template-columns:repeat(3,1fr)}}@media(max-width:760px){.accounts-status-control{padding:13px}.asc-head{flex-direction:column}.asc-grid{grid-template-columns:1fr 1fr}.asc-value{font-size:17px}}@media(max-width:500px){.asc-grid{grid-template-columns:1fr}}
      `}</style>

      <div className="asc-head">
        <div>
          <span className="asc-kicker">SEPTEMBER 2026 / RECONCILED POSITION</span>
          <h2>LAND VIEW closing balance after September approvals</h2>
          <p>Uses the confirmed 31 August opening balance, unique September receipts and unique approved expenses. Duplicate import/seed rows are excluded automatically.</p>
        </div>
        <button className="asc-refresh" onClick={() => setRevision((value) => value + 1)} disabled={loading}>
          ↻ Recalculate
        </button>
      </div>

      {error ? (
        <div className="asc-error">{error}</div>
      ) : loading ? (
        <div className="asc-loading">Reconciling September income, approvals and duplicate rows…</div>
      ) : (
        <>
          <div className="asc-grid">
            <article className="asc-card opening">
              <span className="asc-label">31 Aug opening balance</span>
              <strong className="asc-value">{money(status.openingBalance)}</strong>
              <span className="asc-meta">Confirmed reconciled office closing balance carried into September</span>
            </article>
            <article className="asc-card income">
              <span className="asc-label">September income</span>
              <strong className="asc-value">{money(status.cleanIncome)}</strong>
              <span className="asc-meta">{status.receiptCount} unique receipts, including Hazari Road Shop Rent</span>
            </article>
            <article className="asc-card approved">
              <span className="asc-label">Approved September expenses</span>
              <strong className="asc-value">{money(status.approvedExpense)}</strong>
              <span className="asc-meta">{status.approvedCount} unique approved entries</span>
            </article>
            <article className="asc-card pending">
              <span className="asc-label">Pending September expenses</span>
              <strong className="asc-value">{money(status.pendingExpense)}</strong>
              <span className="asc-meta">{status.pendingCount} unique entries still awaiting approval</span>
            </article>
            <article className={`asc-card net ${netNegative ? "" : "positive"}`}>
              <span className="asc-label">LAND VIEW net position</span>
              <strong className="asc-value">{money(status.projectedNet)}</strong>
              <span className="asc-meta">{status.pendingExpense > 0 ? `Confirmed now ${money(status.confirmedNet)} · after pending ${money(status.projectedNet)}` : "All unique September expenses are approved; this is the reconciled closing position."}</span>
            </article>
          </div>
          <div className="asc-flags">
            <span className="asc-flag"><strong>Formula</strong> opening balance + September income − approved expenses − pending expenses.</span>
            {status.duplicateIncome > 0 && (
              <span className="asc-flag warning"><strong>Income duplicates excluded</strong> {money(status.duplicateIncome)} across {status.duplicateReceiptCount} repeated receipt rows.</span>
            )}
            {status.duplicateExpense > 0 && (
              <span className="asc-flag warning"><strong>Expense duplicates excluded</strong> {money(status.duplicateExpense)} across {status.duplicateExpenseCount} repeated historical/seed rows.</span>
            )}
          </div>
        </>
      )}
    </section>
  );
}
