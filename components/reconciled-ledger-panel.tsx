"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { landViewApi, type FinanceSheetData } from "@/lib/api";

type LedgerTx = {
  id: string;
  date: string;
  type: "Income" | "Expense";
  reference: string;
  description: string;
  amount: number;
  scope: "OFF" | "PER" | string;
  status: string;
};

type RunningRow = LedgerTx & { debit: number; credit: number; balance: number };

const OPENING_DATE = "2026-08-31";
const OPENING_BALANCE = -63847.54;
const CHECKPOINTS = [
  { date: "30 Jul 2026", balance: -246501.04, scope: "Office + Personal + Private Car", note: "Different scope — private car costs were included." },
  { date: "31 Jul 2026", balance: -31634.04, scope: "Office + Personal", note: "Private car costs were excluded from this checkpoint." },
  { date: "31 Aug 2026", balance: -63847.54, scope: "Office + Personal", note: "Authoritative opening balance for the current running ledger." },
] as const;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const text = (value: unknown) => String(value ?? "").trim();
const amount = (value: unknown) => {
  const parsed = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value: number) => `${value < 0 ? "-" : ""}৳${Math.abs(value).toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function rowsToRecords(data: FinanceSheetData | null) {
  if (!data) return [] as Record<string, string>[];
  return (data.rows || []).map((row) => {
    const record: Record<string, string> = {};
    (data.headers || []).forEach((header, index) => {
      const key = text(header);
      if (key) record[key] = text(row[index]);
    });
    return record;
  });
}

function isoDate(value: unknown) {
  const raw = text(value);
  if (!raw) return "";
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;
  const dmy = raw.match(/^(\d{1,2})[-/ ]([A-Za-z]{3}|\d{1,2})[-/ ](\d{4})$/);
  if (dmy) {
    const names: Record<string, number> = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6, jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };
    const month = /^\d+$/.test(dmy[2]) ? Number(dmy[2]) : names[dmy[2].toLowerCase()];
    if (month) return `${dmy[3]}-${String(month).padStart(2, "0")}-${String(Number(dmy[1])).padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function prettyDate(value: string) {
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return value;
  return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function scopeFor(record: Record<string, string>, reference: string) {
  const createdBy = text(record.Created_By).toUpperCase();
  if (createdBy === "PER" || /-PER-/.test(reference)) return "PER";
  if (createdBy === "OFF" || /-OFF-/.test(reference)) return "OFF";
  return createdBy || "OFF";
}

function cleanTransactions(income: FinanceSheetData | null, expenses: FinanceSheetData | null) {
  const result: LedgerTx[] = [];
  const seen = new Set<string>();

  for (const record of rowsToRecords(income)) {
    const id = text(record.Income_ID);
    if (!id.startsWith("SRC-I-")) continue;
    const reference = text(record.Reference_No) || id;
    const date = isoDate(record.Payment_Date || record.Date || record.Income_Date);
    const value = amount(record.Amount);
    const status = text(record.Approval_Status || "Approved");
    if (!date || !value || status.toLowerCase() !== "approved" || seen.has(`I:${reference}`)) continue;
    seen.add(`I:${reference}`);
    result.push({
      id,
      date,
      type: "Income",
      reference,
      description: text(record.Payment_For || record.Description || record.Client_Name || "Income received"),
      amount: value,
      scope: scopeFor(record, reference),
      status,
    });
  }

  for (const record of rowsToRecords(expenses)) {
    const id = text(record.Expense_ID);
    if (!id.startsWith("SRC-E-")) continue;
    const reference = text(record.Reference_No) || id;
    const date = isoDate(record.Expense_Date || record.Date);
    const value = amount(record.Amount);
    const status = text(record.Approval_Status || record.Status || "Pending");
    if (!date || !value || status.toLowerCase() !== "approved" || seen.has(`E:${reference}`)) continue;
    seen.add(`E:${reference}`);
    result.push({
      id,
      date,
      type: "Expense",
      reference,
      description: text(record.Description || record.Category || "Expense"),
      amount: value,
      scope: scopeFor(record, reference),
      status,
    });
  }

  return result.sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference));
}

function esc(value: unknown) {
  return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

export default function ReconciledLedgerPanel() {
  const pathname = usePathname();
  const [income, setIncome] = useState<FinanceSheetData | null>(null);
  const [expenses, setExpenses] = useState<FinanceSheetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [year, setYear] = useState("2026");

  const load = useCallback(async () => {
    if (pathname !== "/admin/accounts") return;
    setLoading(true);
    setError("");
    try {
      const [incomeData, expenseData] = await Promise.all([
        landViewApi.getFinanceSheet("Income"),
        landViewApi.getFinanceSheet("Accounting Expenses"),
      ]);
      setIncome(incomeData);
      setExpenses(expenseData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not load the reconciled ledger.");
    } finally {
      setLoading(false);
    }
  }, [pathname]);

  useEffect(() => { void load(); }, [load]);

  const transactions = useMemo(() => cleanTransactions(income, expenses), [income, expenses]);
  const postOpening = useMemo(() => transactions.filter((row) => row.date > OPENING_DATE), [transactions]);

  const runningRows = useMemo<RunningRow[]>(() => {
    let balance = OPENING_BALANCE;
    return postOpening.map((row) => {
      const debit = row.type === "Expense" ? row.amount : 0;
      const credit = row.type === "Income" ? row.amount : 0;
      balance += credit - debit;
      return { ...row, debit, credit, balance };
    });
  }, [postOpening]);

  const credits = useMemo(() => postOpening.filter((row) => row.type === "Income").reduce((sum, row) => sum + row.amount, 0), [postOpening]);
  const debits = useMemo(() => postOpening.filter((row) => row.type === "Expense").reduce((sum, row) => sum + row.amount, 0), [postOpening]);
  const currentBalance = OPENING_BALANCE + credits - debits;
  const latestDate = postOpening.length ? postOpening[postOpening.length - 1].date : OPENING_DATE;

  const years = useMemo(() => [...new Set(transactions.map((row) => row.date.slice(0, 4)))].filter(Boolean).sort((a, b) => b.localeCompare(a)), [transactions]);
  useEffect(() => {
    if (years.length && !years.includes(year)) setYear(years[0]);
  }, [year, years]);

  const monthly = useMemo(() => MONTHS.map((label, index) => {
    const prefix = `${year}-${String(index + 1).padStart(2, "0")}-`;
    const rows = transactions.filter((row) => row.date.startsWith(prefix));
    const incomeTotal = rows.filter((row) => row.type === "Income").reduce((sum, row) => sum + row.amount, 0);
    const expenseTotal = rows.filter((row) => row.type === "Expense").reduce((sum, row) => sum + row.amount, 0);
    return { label, income: incomeTotal, expense: expenseTotal, net: incomeTotal - expenseTotal, count: rows.length };
  }), [transactions, year]);

  function generateStatement() {
    const statementRows = [
      `<tr class="opening"><td>${prettyDate(OPENING_DATE)}</td><td>Opening balance</td><td>Authoritative 31 Aug closing balance</td><td></td><td></td><td class="num">${esc(money(OPENING_BALANCE))}</td></tr>`,
      ...runningRows.map((row) => `<tr><td>${esc(prettyDate(row.date))}</td><td>${esc(row.reference)}</td><td>${esc(row.description)}</td><td class="num debit">${row.debit ? esc(money(row.debit)) : ""}</td><td class="num credit">${row.credit ? esc(money(row.credit)) : ""}</td><td class="num strong">${esc(money(row.balance))}</td></tr>`),
      `<tr class="closing"><td colspan="5">CURRENT RECONCILED BALANCE — ${esc(prettyDate(latestDate))}</td><td class="num">${esc(money(currentBalance))}</td></tr>`,
    ].join("");
    const origin = window.location.origin;
    const generated = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>LAND VIEW Ledger Statement</title><style>
      *{box-sizing:border-box}body{margin:0;background:#e9ecef;color:#16191d;font-family:Arial,Helvetica,sans-serif}.sheet{width:210mm;min-height:297mm;margin:12px auto;background:#fff;padding:15mm 15mm 20mm;box-shadow:0 18px 50px rgba(0,0,0,.14)}.redline{height:4px;background:#d61f26;margin:-15mm -15mm 10mm}.head{display:flex;justify-content:space-between;gap:30px;align-items:flex-start}.brand{display:flex;gap:12px;align-items:center}.brand img{width:58px;height:58px}.brand h1{margin:0;font-size:24px;letter-spacing:.03em}.brand h1 span{color:#d61f26}.brand p{margin:4px 0 0;font-size:7px;font-weight:800;letter-spacing:.14em}.title{text-align:right}.title h2{margin:0 0 6px;font-size:22px}.title p{margin:3px 0;font-size:9px;color:#687078}.rule{height:1px;background:#d61f26;margin:9mm 0 6mm}.period{display:flex;justify-content:space-between;align-items:flex-end}.period h3{margin:0;font-size:16px}.period p{margin:4px 0 0;font-size:9px;color:#626a72}.status{border:1px solid #dadde0;border-radius:6px;padding:7px 10px;text-align:right;font-size:8px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:6mm 0}.card{border:1px solid #dfe2e5;border-radius:7px;padding:9px}.card span{font-size:7px;font-weight:800;letter-spacing:.08em;color:#777f87}.card b{display:block;margin-top:6px;font-size:12px}.card.balance{background:#171a1f;color:#fff;border-color:#171a1f}.card.balance span{color:#c7ccd1}.section{margin:7mm 0 3mm;font-size:9px;font-weight:900;letter-spacing:.1em;color:#d61f26}table{width:100%;border-collapse:collapse;font-size:7.5px}th{padding:7px 6px;text-align:left;background:#171a1f;color:#fff;font-size:6.5px;letter-spacing:.05em}td{padding:6px;border-bottom:1px solid #e5e7e9;vertical-align:top}.num{text-align:right;white-space:nowrap}.strong{font-weight:800}.debit{color:#9d292e}.credit{color:#21713d}.opening td{background:#f4f5f6;font-weight:700}.closing td{background:#171a1f;color:#fff!important;font-weight:900;border:0}.note{margin-top:8mm;padding:8px 10px;background:#f6f7f8;border-left:3px solid #d61f26;font-size:7.5px;line-height:1.5;color:#555d65}.footer{margin-top:10mm;border-top:1px solid #d61f26;padding-top:6px;display:flex;justify-content:space-between;font-size:6.5px;color:#666d74}.actions{position:fixed;right:18px;top:18px}.actions button{border:0;border-radius:7px;background:#d61f26;color:#fff;font-weight:800;padding:10px 14px;cursor:pointer}@media print{body{background:#fff}.sheet{margin:0;box-shadow:none}.actions{display:none}@page{size:A4;margin:0}}
    </style></head><body><div class="actions"><button onclick="window.print()">Print / Save PDF</button></div><main class="sheet"><div class="redline"></div><header class="head"><div class="brand"><img src="${origin}/land-view-logo.svg" alt="LAND VIEW"><div><h1>LAND <span>VIEW</span></h1><p>ENGINEERS &amp; ARCHITECTS</p></div></div><div class="title"><h2>LEDGER STATEMENT</h2><p>Reference: <b>LV-LEDGER-${latestDate.replaceAll("-", "")}</b></p><p>Generated: ${esc(generated)}</p></div></header><div class="rule"></div><section class="period"><div><h3>Reconciled Running Balance</h3><p>${prettyDate(OPENING_DATE)} to ${prettyDate(latestDate)}</p></div><div class="status">STATUS<br><b>RECONCILED</b></div></section><section class="summary"><div class="card"><span>OPENING BALANCE</span><b>${esc(money(OPENING_BALANCE))}</b></div><div class="card"><span>TOTAL CREDIT</span><b>${esc(money(credits))}</b></div><div class="card"><span>TOTAL DEBIT</span><b>${esc(money(debits))}</b></div><div class="card balance"><span>CURRENT BALANCE</span><b>${esc(money(currentBalance))}</b></div></section><div class="section">BANK-STYLE TRANSACTION LEDGER</div><table><thead><tr><th>Date</th><th>Reference</th><th>Description</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr></thead><tbody>${statementRows}</tbody></table><div class="note"><b>Reconciliation basis:</b> The 31 August 2026 closing balance of ${esc(money(OPENING_BALANCE))} is treated as the authoritative opening checkpoint. Only clean SRC-* approved source transactions are posted after that checkpoint; duplicate legacy/management import rows are excluded. The 30 July checkpoint had private-car costs included and therefore has a different scope.</div><footer class="footer"><span>Feni, Bangladesh</span><span>www.landview.com.bd</span><span>info@landview.com.bd</span><span>+88 0140 80 80 400 · +88 01902 500 400</span></footer></main></body></html>`;
    const win = window.open("", "_blank");
    if (!win) return window.alert("Please allow pop-ups to generate the ledger statement.");
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  if (pathname !== "/admin/accounts") return null;

  return <>
    <style>{`
      .portal-admin .lv-monthly{display:none!important}
      .lv-reconciled{max-width:1500px;margin:0 auto 20px;color:#edf2f5}.lv-ledger-hero{border:1px solid #303941;border-radius:16px;overflow:hidden;background:linear-gradient(145deg,#11171d,#090e12);box-shadow:0 18px 44px rgba(0,0,0,.22)}.lv-ledger-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:20px 22px;border-bottom:1px solid #29323a;background:radial-gradient(circle at 91% 0,rgba(214,31,38,.18),transparent 36%)}.lv-ledger-kicker{font-size:9px;font-weight:900;letter-spacing:.17em;color:#ef6662}.lv-ledger-head h2{margin:5px 0 5px;font-size:24px}.lv-ledger-head p{margin:0;color:#85929d;font-size:10px;line-height:1.5}.lv-ledger-actions{display:flex;gap:8px;flex-wrap:wrap}.lv-ledger-actions button,.lv-ledger-actions select{height:38px;border:1px solid #35414a;border-radius:8px;background:#101820;color:#eef2f5;padding:0 12px;font-size:10px;font-weight:800}.lv-ledger-actions button{cursor:pointer}.lv-ledger-actions .primary{background:linear-gradient(180deg,#df2b32,#b9151c);border-color:#d61f26;box-shadow:0 8px 20px rgba(214,31,38,.16)}.lv-current{display:grid;grid-template-columns:1.4fr repeat(3,1fr);gap:9px;padding:15px 20px}.lv-balance-card,.lv-ledger-stat{border:1px solid #2d3740;border-radius:11px;background:#0d1419;padding:14px}.lv-balance-card{background:linear-gradient(140deg,rgba(214,31,38,.14),#10161b);border-color:rgba(214,31,38,.48)}.lv-balance-card span,.lv-ledger-stat span{display:block;color:#7f8c96;font-size:8px;font-weight:900;letter-spacing:.09em}.lv-balance-card strong{display:block;margin-top:8px;font-size:27px;letter-spacing:-.02em}.lv-balance-card small,.lv-ledger-stat small{display:block;margin-top:5px;color:#68757f;font-size:8px}.lv-ledger-stat strong{display:block;margin-top:8px;font-size:16px}.lv-ledger-stat.credit strong{color:#84d7a0}.lv-ledger-stat.debit strong{color:#ff9692}.lv-checkpoints{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:0 20px 16px}.lv-checkpoint{border-top:1px solid #2a343d;padding:10px 4px 0}.lv-checkpoint b{display:block;font-size:11px}.lv-checkpoint span{display:block;margin-top:3px;color:#75828c;font-size:8px;line-height:1.35}.lv-ledger-error{margin:0 20px 14px;padding:9px 11px;border:1px solid #6e3035;background:#321b1e;color:#ffaaa6;border-radius:8px;font-size:10px}.lv-ledger-section{margin-top:12px;border:1px solid #303941;border-radius:14px;background:#0c1217;overflow:hidden}.lv-ledger-section-head{display:flex;justify-content:space-between;gap:15px;align-items:center;padding:14px 18px;border-bottom:1px solid #29323a}.lv-ledger-section-head h3{margin:0;font-size:14px}.lv-ledger-section-head p{margin:3px 0 0;color:#71808b;font-size:9px}.lv-ledger-table-wrap{overflow:auto}.lv-bank-table,.lv-month-table{width:100%;border-collapse:separate;border-spacing:0;min-width:950px}.lv-bank-table th,.lv-month-table th{background:#172027!important;color:#87949e!important;padding:9px 10px!important;font-size:8px!important;letter-spacing:.07em!important;text-align:left}.lv-bank-table td,.lv-month-table td{background:#0d1419!important;border-top:1px solid #27313a!important;padding:9px 10px!important;font-size:9.5px!important;vertical-align:top}.lv-bank-table .num,.lv-month-table .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}.lv-bank-table .debit{color:#ff9692}.lv-bank-table .credit,.lv-month-table .positive{color:#84d7a0}.lv-bank-table .balance{font-weight:900}.lv-bank-table .scope{font-size:8px;font-weight:900;color:#85939e}.lv-bank-table tr.opening td{background:#131b21!important;font-weight:800}.lv-bank-table tr.current td{background:linear-gradient(90deg,rgba(214,31,38,.13),#11181e)!important;border-top:1px solid rgba(214,31,38,.55)!important;font-weight:900}.lv-month-table .negative{color:#ff9692}.lv-empty{padding:28px;text-align:center;color:#76838d;font-size:10px}.lv-ledger-note{padding:11px 18px;border-top:1px solid #29323a;color:#6f7c86;font-size:8.5px;line-height:1.55;background:#0b1014}@media(max-width:980px){.lv-current{grid-template-columns:repeat(2,1fr)}.lv-checkpoints{grid-template-columns:1fr}.lv-ledger-head{flex-direction:column}}@media(max-width:560px){.lv-current{grid-template-columns:1fr;padding:12px}.lv-ledger-head{padding:16px 14px}.lv-checkpoints{padding:0 14px 14px}.lv-ledger-section-head{padding:12px 14px}}
    `}</style>
    <section className="lv-reconciled" aria-label="LAND VIEW reconciled ledger">
      <div className="lv-ledger-hero">
        <div className="lv-ledger-head">
          <div><span className="lv-ledger-kicker">RECONCILED LEDGER</span><h2>LAND VIEW running balance</h2><p>Bank-statement style balance anchored to your verified 31 August 2026 closing balance. Duplicate legacy imports are excluded automatically.</p></div>
          <div className="lv-ledger-actions"><button onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button><button className="primary" onClick={generateStatement} disabled={loading || !postOpening.length}>Generate Statement</button></div>
        </div>
        {error && <div className="lv-ledger-error">{error}</div>}
        <div className="lv-current">
          <div className="lv-balance-card"><span>CURRENT RECONCILED BALANCE</span><strong>{money(currentBalance)}</strong><small>As of {prettyDate(latestDate)} · {postOpening.length} clean posted transaction{postOpening.length === 1 ? "" : "s"}</small></div>
          <div className="lv-ledger-stat"><span>OPENING BALANCE</span><strong>{money(OPENING_BALANCE)}</strong><small>31 Aug 2026</small></div>
          <div className="lv-ledger-stat credit"><span>CREDITS SINCE OPENING</span><strong>{money(credits)}</strong><small>Income / recovery posted</small></div>
          <div className="lv-ledger-stat debit"><span>DEBITS SINCE OPENING</span><strong>{money(debits)}</strong><small>Approved expenses posted</small></div>
        </div>
        <div className="lv-checkpoints">{CHECKPOINTS.map((item) => <div className="lv-checkpoint" key={item.date}><b>{item.date} · {money(item.balance)}</b><span>{item.scope}</span><span>{item.note}</span></div>)}</div>
      </div>

      <div className="lv-ledger-section">
        <div className="lv-ledger-section-head"><div><h3>Running transaction ledger</h3><p>Debit decreases the balance; credit increases it. The closing row always shows the latest reconciled balance.</p></div></div>
        <div className="lv-ledger-table-wrap">
          <table className="lv-bank-table"><thead><tr><th>Date</th><th>Reference</th><th>Description</th><th className="num">Debit</th><th className="num">Credit</th><th className="num">Balance</th><th>Scope</th></tr></thead><tbody>
            <tr className="opening"><td>{prettyDate(OPENING_DATE)}</td><td>OPENING</td><td>Authoritative closing balance carried forward</td><td className="num"></td><td className="num"></td><td className="num balance">{money(OPENING_BALANCE)}</td><td className="scope">OFF + PER</td></tr>
            {runningRows.map((row) => <tr key={`${row.type}-${row.reference}`}><td>{prettyDate(row.date)}</td><td>{row.reference}</td><td>{row.description}</td><td className="num debit">{row.debit ? money(row.debit) : ""}</td><td className="num credit">{row.credit ? money(row.credit) : ""}</td><td className="num balance">{money(row.balance)}</td><td className="scope">{row.scope === "PER" ? "PERSONAL" : row.scope === "OFF" ? "OFFICE" : row.scope}</td></tr>)}
            {!loading && !runningRows.length && <tr><td colSpan={7} className="lv-empty">No clean source transactions are posted after the opening checkpoint.</td></tr>}
            <tr className="current"><td colSpan={5}>CURRENT BALANCE · {prettyDate(latestDate)}</td><td className="num balance">{money(currentBalance)}</td><td className="scope">RECONCILED</td></tr>
          </tbody></table>
        </div>
        <div className="lv-ledger-note">Revalidation rule: only approved <b>SRC-I-*</b> income and <b>SRC-E-*</b> expense rows are counted. This removes the duplicate SEP-2026-* management-import rows that were inflating the previous ledger totals. The 30 July checkpoint is retained for history but is not chained into the current balance because its scope included private-car costs.</div>
      </div>

      <div className="lv-ledger-section">
        <div className="lv-ledger-section-head"><div><h3>Monthly movement</h3><p>Clean-source income and approved expense totals by month.</p></div><div className="lv-ledger-actions"><select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Ledger year">{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></div></div>
        <div className="lv-ledger-table-wrap"><table className="lv-month-table"><thead><tr><th>Month</th><th className="num">Income</th><th className="num">Expense</th><th className="num">Net Movement</th><th className="num">Records</th></tr></thead><tbody>{monthly.map((item) => <tr key={item.label}><td><b>{item.label}</b></td><td className="num positive">{money(item.income)}</td><td className="num negative">{money(item.expense)}</td><td className={`num ${item.net >= 0 ? "positive" : "negative"}`}>{money(item.net)}</td><td className="num">{item.count || "—"}</td></tr>)}</tbody></table></div>
      </div>
    </section>
  </>;
}
