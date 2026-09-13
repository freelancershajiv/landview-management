"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { landViewApi, type FinanceSheetData } from "@/lib/api";

type Row = Record<string, string>;

type SeptemberStatus = {
  openingBalance: number;
  officeIncome: number;
  officeExpense: number;
  officeNet: number;
  personalIncome: number;
  personalExpense: number;
  personalNet: number;
  combinedIncome: number;
  combinedExpense: number;
  septemberNet: number;
  closingPosition: number;
  approvedExpense: number;
  pendingExpense: number;
  approvedCount: number;
  pendingCount: number;
  duplicateIncome: number;
  duplicateExpense: number;
  duplicateReceiptCount: number;
  duplicateExpenseCount: number;
};

const TARGET_YEAR = 2026;
const TARGET_MONTH = 9;
const SEPTEMBER_OPENING_BALANCE = -63847.5419;

const text = (value: unknown) => String(value ?? "").trim();
const amount = (value: unknown) => {
  const cleaned = text(value).replace(/,/g, "").replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned || 0);
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
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

function dateKey(value: unknown) {
  const date = parseDate(value);
  if (!date) return text(value);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function isSeptember2026(value: unknown) {
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
  return ["sep-2026", dateKey(row.Expense_Date), text(row.File_ID), text(row.Category), amount(row.Amount)].join("|");
}

function statusRank(row: Row) {
  const status = text(row.Approval_Status).toLowerCase();
  if (status === "approved") return 3;
  if (status === "pending") return 2;
  if (status === "rejected") return 1;
  return 0;
}

function isPersonalIncome(row: Row) {
  return (
    /eng rony income \/ recovery/i.test(text(row.Income_Category)) ||
    /eng rony ledger/i.test(text(row.Created_By)) ||
    /^RONY-SIDE-/i.test(text(row.Income_ID))
  );
}

function isPersonalExpense(row: Row) {
  return (
    /^RONY-SEP-2026-/i.test(text(row.Reference_No)) ||
    /eng rony personal cost \/ salary draw/i.test(text(row.Notes)) ||
    /^EXP-000[1-7]$/i.test(text(row.Expense_ID))
  );
}

function buildStatus(incomeData: FinanceSheetData | null, expenseData: FinanceSheetData | null): SeptemberStatus {
  const incomeRows = records(incomeData).filter((row) => isSeptember2026(row.Payment_Date));
  const expenseRows = records(expenseData).filter((row) => isSeptember2026(row.Expense_Date));

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

  const cleanIncomeRows = [...uniqueIncome.values()];
  const cleanExpenseRows = [...uniqueExpense.values()];

  const rawIncome = incomeRows.reduce((sum, row) => sum + amount(row.Amount), 0);
  const rawExpense = expenseRows.reduce((sum, row) => sum + amount(row.Amount), 0);
  const combinedIncome = cleanIncomeRows.reduce((sum, row) => sum + amount(row.Amount), 0);

  const officeIncome = cleanIncomeRows
    .filter((row) => !isPersonalIncome(row))
    .reduce((sum, row) => sum + amount(row.Amount), 0);
  const personalIncome = cleanIncomeRows
    .filter(isPersonalIncome)
    .reduce((sum, row) => sum + amount(row.Amount), 0);

  let officeExpense = 0;
  let personalExpense = 0;
  let approvedExpense = 0;
  let pendingExpense = 0;
  let approvedCount = 0;
  let pendingCount = 0;

  cleanExpenseRows.forEach((row) => {
    const value = amount(row.Amount);
    const status = text(row.Approval_Status).toLowerCase();
    if (isPersonalExpense(row)) personalExpense += value;
    else officeExpense += value;

    if (status === "approved") {
      approvedExpense += value;
      approvedCount += 1;
    } else if (status === "pending" || !status) {
      pendingExpense += value;
      pendingCount += 1;
    }
  });

  const combinedExpense = officeExpense + personalExpense;
  const officeNet = officeIncome - officeExpense;
  const personalNet = personalIncome - personalExpense;
  const septemberNet = combinedIncome - combinedExpense;
  const closingPosition = SEPTEMBER_OPENING_BALANCE + septemberNet;

  return {
    openingBalance: SEPTEMBER_OPENING_BALANCE,
    officeIncome,
    officeExpense,
    officeNet,
    personalIncome,
    personalExpense,
    personalNet,
    combinedIncome,
    combinedExpense,
    septemberNet,
    closingPosition,
    approvedExpense,
    pendingExpense,
    approvedCount,
    pendingCount,
    duplicateIncome: Math.max(0, rawIncome - combinedIncome),
    duplicateExpense: Math.max(0, rawExpense - combinedExpense),
    duplicateReceiptCount: Math.max(0, incomeRows.length - cleanIncomeRows.length),
    duplicateExpenseCount: Math.max(0, expenseRows.length - cleanExpenseRows.length),
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

  return (
    <section className="accounts-status-control" aria-label="September 2026 LAND VIEW official and personal reconciliation">
      <style>{`
        .accounts-status-control{max-width:1680px;margin:0 auto 14px;padding:16px;border:1px solid #2d3b45;border-radius:15px;background:linear-gradient(145deg,#111b22,#0c141a);color:#eef3f6;box-shadow:0 14px 34px rgba(0,0,0,.12)}
        .asc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:13px}.asc-kicker{display:block;color:#ef7771;font-size:9px;font-weight:900;letter-spacing:.15em}.asc-head h2{margin:5px 0 4px;font-size:18px;letter-spacing:-.015em}.asc-head p{margin:0;color:#8898a3;font-size:10.5px;line-height:1.55}.asc-refresh{border:1px solid #3b4b57;background:#17222b;color:#edf2f5;border-radius:9px;padding:9px 12px;font-size:9.5px;font-weight:900;cursor:pointer}.asc-groups{display:grid;grid-template-columns:1fr 1fr;gap:10px}.asc-group{border:1px solid #273640;border-radius:12px;background:#0b141a;padding:11px}.asc-group-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.asc-group-title strong{font-size:10px;letter-spacing:.08em;text-transform:uppercase}.asc-group-title span{font-size:9px;color:#75858f}.asc-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.asc-card{position:relative;min-height:96px;padding:12px 13px;border:1px solid #293842;border-radius:10px;background:#0e181f;overflow:hidden}.asc-card:before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:#536472}.asc-card.income:before{background:#42ad70}.asc-card.expense:before{background:#d39a4a}.asc-card.negative:before{background:#d8454a}.asc-card.positive:before{background:#42ad70}.asc-label{display:block;color:#81909a;font-size:8px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.asc-value{display:block;margin-top:8px;color:#fff;font-size:18px;line-height:1.1;font-weight:900;font-variant-numeric:tabular-nums}.asc-card.income .asc-value,.asc-card.positive .asc-value{color:#8ce3ad}.asc-card.expense .asc-value{color:#efc078}.asc-card.negative .asc-value{color:#ffaaa7}.asc-combined{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px}.asc-combined .asc-card{min-height:100px}.asc-flags{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.asc-flag{display:inline-flex;align-items:center;gap:6px;padding:6px 8px;border:1px solid #33434e;border-radius:999px;background:#101a21;color:#9eadb6;font-size:8.5px}.asc-flag.warning{border-color:#634a2f;background:rgba(190,128,54,.08);color:#e9bd7a}.asc-flag strong{color:#f2f5f7}.asc-error{padding:10px;border:1px solid #73383d;border-radius:9px;background:#301b1e;color:#ffb3af;font-size:10px}.asc-loading{padding:17px;color:#82919b;font-size:10px}@media(max-width:1100px){.asc-groups{grid-template-columns:1fr}.asc-combined{grid-template-columns:repeat(2,1fr)}}@media(max-width:640px){.accounts-status-control{padding:13px}.asc-head{flex-direction:column}.asc-grid,.asc-combined{grid-template-columns:1fr}.asc-value{font-size:17px}}
      `}</style>

      <div className="asc-head">
        <div>
          <span className="asc-kicker">SEPTEMBER 2026 / SOURCE-RECONCILED</span>
          <h2>Office, personal and combined LAND VIEW position</h2>
          <p>Official office transactions and Eng Rony/personal transactions remain separate. Only the combined section rolls both into the final cash position.</p>
        </div>
        <button className="asc-refresh" onClick={() => setRevision((value) => value + 1)} disabled={loading}>↻ Recalculate</button>
      </div>

      {error ? (
        <div className="asc-error">{error}</div>
      ) : loading ? (
        <div className="asc-loading">Reconciling September official and personal ledgers…</div>
      ) : (
        <>
          <div className="asc-groups">
            <section className="asc-group">
              <div className="asc-group-title"><strong>Official office ledger</strong><span>LAND VIEW operations</span></div>
              <div className="asc-grid">
                <article className="asc-card income"><span className="asc-label">Office income</span><strong className="asc-value">{money(status.officeIncome)}</strong><span className="asc-meta">Official September collections only</span></article>
                <article className="asc-card expense"><span className="asc-label">Office expenses</span><strong className="asc-value">{money(status.officeExpense)}</strong><span className="asc-meta">Operating, project and staff commission costs</span></article>
                <article className={`asc-card ${status.officeNet >= 0 ? "positive" : "negative"}`}><span className="asc-label">Office net</span><strong className="asc-value">{money(status.officeNet)}</strong><span className="asc-meta">Office income minus office expenses</span></article>
              </div>
            </section>

            <section className="asc-group">
              <div className="asc-group-title"><strong>Personal / Eng Rony ledger</strong><span>kept separate from office P&amp;L</span></div>
              <div className="asc-grid">
                <article className="asc-card income"><span className="asc-label">Personal income</span><strong className="asc-value">{money(status.personalIncome)}</strong><span className="asc-meta">Hazari Road Shop Rent</span></article>
                <article className="asc-card expense"><span className="asc-label">Personal expenses</span><strong className="asc-value">{money(status.personalExpense)}</strong><span className="asc-meta">Eng Rony linked September cash outflow</span></article>
                <article className={`asc-card ${status.personalNet >= 0 ? "positive" : "negative"}`}><span className="asc-label">Personal net</span><strong className="asc-value">{money(status.personalNet)}</strong><span className="asc-meta">Personal income minus personal expenses</span></article>
              </div>
            </section>
          </div>

          <div className="asc-combined">
            <article className="asc-card"><span className="asc-label">31 Aug opening balance</span><strong className="asc-value">{money(status.openingBalance)}</strong><span className="asc-meta">Official balance carried into September</span></article>
            <article className="asc-card income"><span className="asc-label">Combined September income</span><strong className="asc-value">{money(status.combinedIncome)}</strong><span className="asc-meta">Office + personal-side receipts</span></article>
            <article className={`asc-card ${status.septemberNet >= 0 ? "positive" : "negative"}`}><span className="asc-label">Combined September net</span><strong className="asc-value">{money(status.septemberNet)}</strong><span className="asc-meta">{money(status.combinedIncome)} − {money(status.combinedExpense)}</span></article>
            <article className={`asc-card ${status.closingPosition >= 0 ? "positive" : "negative"}`}><span className="asc-label">Closing cash position</span><strong className="asc-value">{money(status.closingPosition)}</strong><span className="asc-meta">Opening balance + combined September net</span></article>
          </div>

          <div className="asc-flags">
            <span className="asc-flag"><strong>Expense status</strong> {money(status.approvedExpense)} approved across {status.approvedCount} unique entries; {money(status.pendingExpense)} pending across {status.pendingCount} unique entries.</span>
            {status.duplicateIncome > 0 && <span className="asc-flag warning"><strong>Income duplicates excluded</strong> {money(status.duplicateIncome)} across {status.duplicateReceiptCount} repeated rows.</span>}
            {status.duplicateExpense > 0 && <span className="asc-flag warning"><strong>Expense duplicates excluded</strong> {money(status.duplicateExpense)} across {status.duplicateExpenseCount} repeated historical/seed rows.</span>}
          </div>
        </>
      )}
    </section>
  );
}
