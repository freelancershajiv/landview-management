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
};

const OPENING_BALANCE = -63847.5419;

const text = (value: unknown) => String(value ?? "").trim();
const amount = (value: unknown) => {
  const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, "") || 0);
  return Number.isFinite(n) ? n : 0;
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

function isSeptember2026(value: unknown) {
  const raw = text(value);
  if (!raw) return false;
  if (/^2026-09-\d{1,2}/.test(raw)) return true;
  const m = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (!m) return false;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  return Number(m[2]) === 9 && year === 2026;
}

function money(value: number) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function sourceTag(row: Row) {
  const direct = text(row.Created_By).toUpperCase();
  if (direct === "OFF" || direct === "PER") return direct;
  const notes = `${text(row.Notes)} ${text(row.Reference_No)} ${text(row.Income_ID)} ${text(row.Expense_ID)}`.toUpperCase();
  if (notes.includes("/SEPT/") && notes.includes(" PER")) return "PER";
  if (notes.includes("/SEPT/") && notes.includes(" OFF")) return "OFF";
  return "";
}

function buildStatus(incomeData: FinanceSheetData | null, expenseData: FinanceSheetData | null): SeptemberStatus {
  // Canonical rebuilt database rows are explicitly tagged OFF/PER.
  // Ignore every untagged legacy/mirrored row so the same source transaction
  // can never be counted twice by the September summary.
  const incomeRows = records(incomeData).filter((row) => isSeptember2026(row.Payment_Date) && sourceTag(row));
  const expenseRows = records(expenseData).filter((row) => isSeptember2026(row.Expense_Date) && sourceTag(row));

  const officeIncome = incomeRows.filter((r) => sourceTag(r) === "OFF").reduce((s, r) => s + amount(r.Amount), 0);
  const personalIncome = incomeRows.filter((r) => sourceTag(r) === "PER").reduce((s, r) => s + amount(r.Amount), 0);
  const officeExpense = expenseRows.filter((r) => sourceTag(r) === "OFF").reduce((s, r) => s + amount(r.Amount), 0);
  const personalExpense = expenseRows.filter((r) => sourceTag(r) === "PER").reduce((s, r) => s + amount(r.Amount), 0);

  let approvedExpense = 0;
  let pendingExpense = 0;
  let approvedCount = 0;
  let pendingCount = 0;
  expenseRows.forEach((row) => {
    const value = amount(row.Amount);
    const status = text(row.Approval_Status).toLowerCase();
    if (status === "approved") {
      approvedExpense += value;
      approvedCount += 1;
    } else if (status === "pending" || !status) {
      pendingExpense += value;
      pendingCount += 1;
    }
  });

  const officeNet = officeIncome - officeExpense;
  const personalNet = personalIncome - personalExpense;
  const combinedIncome = officeIncome + personalIncome;
  const combinedExpense = officeExpense + personalExpense;
  const septemberNet = combinedIncome - combinedExpense;
  const closingPosition = OPENING_BALANCE + septemberNet;

  return {
    openingBalance: OPENING_BALANCE,
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
    return () => { cancelled = true; };
  }, [active, revision]);

  const status = useMemo(() => buildStatus(incomeData, expenseData), [incomeData, expenseData]);
  if (!active) return null;

  const card = (label: string, value: number, meta: string, kind = "") => (
    <article className={`asc-card ${kind}`}>
      <span className="asc-label">{label}</span>
      <strong className="asc-value">{money(value)}</strong>
      <span className="asc-meta">{meta}</span>
    </article>
  );

  return (
    <section className="accounts-status-control" aria-label="September 2026 LAND VIEW official and personal reconciliation">
      <style>{`
        .accounts-status-control{max-width:1680px;margin:0 auto 14px;padding:16px;border:1px solid #2d3b45;border-radius:15px;background:linear-gradient(145deg,#111b22,#0c141a);color:#eef3f6}
        .asc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;margin-bottom:13px}.asc-kicker{display:block;color:#ef7771;font-size:9px;font-weight:900;letter-spacing:.15em}.asc-head h2{margin:5px 0 4px;font-size:18px}.asc-head p{margin:0;color:#8898a3;font-size:10.5px}.asc-refresh{border:1px solid #3b4b57;background:#17222b;color:#edf2f5;border-radius:9px;padding:9px 12px;font-size:9.5px;font-weight:900;cursor:pointer}.asc-groups{display:grid;grid-template-columns:1fr 1fr;gap:10px}.asc-group{border:1px solid #273640;border-radius:12px;background:#0b141a;padding:11px}.asc-group-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}.asc-group-title strong{font-size:10px;letter-spacing:.08em;text-transform:uppercase}.asc-group-title span{font-size:9px;color:#75858f}.asc-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.asc-card{position:relative;min-height:96px;padding:12px 13px;border:1px solid #293842;border-radius:10px;background:#0e181f}.asc-card:before{content:"";position:absolute;inset:0 auto 0 0;width:3px;background:#536472}.asc-card.income:before,.asc-card.positive:before{background:#42ad70}.asc-card.expense:before{background:#d39a4a}.asc-card.negative:before{background:#d8454a}.asc-label{display:block;color:#81909a;font-size:8px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.asc-value{display:block;margin-top:8px;color:#fff;font-size:18px;font-weight:900}.asc-card.income .asc-value,.asc-card.positive .asc-value{color:#8ce3ad}.asc-card.expense .asc-value{color:#efc078}.asc-card.negative .asc-value{color:#ffaaa7}.asc-meta{display:block;margin-top:4px;font-size:10px;line-height:1.35}.asc-combined{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:10px}.asc-flags{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.asc-flag{padding:6px 8px;border:1px solid #33434e;border-radius:999px;background:#101a21;color:#9eadb6;font-size:8.5px}.asc-flag strong{color:#f2f5f7}.asc-error{padding:10px;border:1px solid #73383d;border-radius:9px;background:#301b1e;color:#ffb3af;font-size:10px}.asc-loading{padding:17px;color:#82919b;font-size:10px}@media(max-width:1100px){.asc-groups{grid-template-columns:1fr}.asc-combined{grid-template-columns:repeat(2,1fr)}}@media(max-width:640px){.asc-head{flex-direction:column}.asc-grid,.asc-combined{grid-template-columns:1fr}}
      `}</style>

      <div className="asc-head">
        <div>
          <span className="asc-kicker">SEPTEMBER 2026 / CANONICAL SOURCE ROWS</span>
          <h2>Office, personal and combined LAND VIEW position</h2>
          <p>Only rebuilt database rows tagged OFF or PER are included. Legacy and mirrored rows are ignored.</p>
        </div>
        <button className="asc-refresh" onClick={() => setRevision((v) => v + 1)} disabled={loading}>↻ Recalculate</button>
      </div>

      {error ? <div className="asc-error">{error}</div> : loading ? <div className="asc-loading">Calculating September position…</div> : <>
        <div className="asc-groups">
          <section className="asc-group">
            <div className="asc-group-title"><strong>Official office ledger</strong><span>LAND VIEW operations</span></div>
            <div className="asc-grid">
              {card("Office income", status.officeIncome, "Official September collections only", "income")}
              {card("Office expenses", status.officeExpense, "Operating, project and staff commission costs", "expense")}
              {card("Office net", status.officeNet, "Office income minus office expenses", status.officeNet >= 0 ? "positive" : "negative")}
            </div>
          </section>
          <section className="asc-group">
            <div className="asc-group-title"><strong>Personal / Eng Rony ledger</strong><span>kept separate from office P&L</span></div>
            <div className="asc-grid">
              {card("Personal income", status.personalIncome, "Hazari Road Shop Rent", "income")}
              {card("Personal expenses", status.personalExpense, "Eng Rony linked September cash outflow", "expense")}
              {card("Personal net", status.personalNet, "Personal income minus personal expenses", status.personalNet >= 0 ? "positive" : "negative")}
            </div>
          </section>
        </div>
        <div className="asc-combined">
          {card("31 Aug opening balance", status.openingBalance, "Official balance carried into September")}
          {card("Combined September income", status.combinedIncome, "Office + personal-side receipts", "income")}
          {card("Combined September net", status.septemberNet, `${money(status.combinedIncome)} − ${money(status.combinedExpense)}`, status.septemberNet >= 0 ? "positive" : "negative")}
          {card("Closing cash position", status.closingPosition, "Opening balance + combined September net", status.closingPosition >= 0 ? "positive" : "negative")}
        </div>
        <div className="asc-flags">
          <span className="asc-flag"><strong>Expense status</strong> {money(status.approvedExpense)} approved across {status.approvedCount} canonical entries; {money(status.pendingExpense)} pending across {status.pendingCount} canonical entries.</span>
        </div>
      </>}
    </section>
  );
}
