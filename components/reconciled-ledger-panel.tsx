"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { landViewApi, type FinanceSheetData } from "@/lib/api";

type LedgerTx = {
  id: string;
  date: string;
  type: "Income" | "Expense";
  reference: string;
  description: string;
  amount: number;
  scope: "OFF" | "PER" | string;
};

type RunningRow = LedgerTx & { debit: number; credit: number; balance: number };

const OPENING_DATE = "2026-08-31";
const OPENING_BALANCE = -63847.54;
const text = (value: unknown) => String(value ?? "").trim();
const numeric = (value: unknown) => {
  const parsed = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value: number) => `${value < 0 ? "-" : ""}৳${Math.abs(value).toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function records(data: FinanceSheetData | null) {
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
  const direct = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function prettyDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return value;
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function scopeFor(row: Record<string, string>, reference: string) {
  const createdBy = text(row.Created_By).toUpperCase();
  if (createdBy === "PER" || /-PER-/.test(reference)) return "PER";
  if (createdBy === "OFF" || /-OFF-/.test(reference)) return "OFF";
  return createdBy || "OFF";
}

function cleanTransactions(income: FinanceSheetData | null, expenses: FinanceSheetData | null) {
  const out: LedgerTx[] = [];
  const seen = new Set<string>();

  for (const row of records(income)) {
    const id = text(row.Income_ID);
    if (!id.startsWith("SRC-I-")) continue;
    const reference = text(row.Reference_No) || id;
    const date = isoDate(row.Payment_Date || row.Date || row.Income_Date);
    const amount = numeric(row.Amount);
    const status = text(row.Approval_Status || "Approved").toLowerCase();
    const key = `I:${reference}`;
    if (!date || !amount || status !== "approved" || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id,
      date,
      type: "Income",
      reference,
      description: text(row.Payment_For || row.Description || row.Client_Name || "Income received"),
      amount,
      scope: scopeFor(row, reference),
    });
  }

  for (const row of records(expenses)) {
    const id = text(row.Expense_ID);
    if (!id.startsWith("SRC-E-")) continue;
    const reference = text(row.Reference_No) || id;
    const date = isoDate(row.Expense_Date || row.Date);
    const amount = numeric(row.Amount);
    const status = text(row.Approval_Status || row.Status || "Pending").toLowerCase();
    const key = `E:${reference}`;
    if (!date || !amount || status !== "approved" || seen.has(key)) continue;
    seen.add(key);
    out.push({
      id,
      date,
      type: "Expense",
      reference,
      description: text(row.Description || row.Category || "Expense"),
      amount,
      scope: scopeFor(row, reference),
    });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.reference.localeCompare(b.reference));
}

function esc(value: unknown) {
  return text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

export default function ReconciledLedgerPanel() {
  const [income, setIncome] = useState<FinanceSheetData | null>(null);
  const [expenses, setExpenses] = useState<FinanceSheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [scope, setScope] = useState("ALL");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [incomeData, expenseData] = await Promise.all([
        landViewApi.getFinanceSheet("Accounting Income"),
        landViewApi.getFinanceSheet("Accounting Expenses"),
      ]);
      setIncome(incomeData);
      setExpenses(expenseData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not load the ledger.");
    } finally {
      setLoading(false);
    }
  }, []);

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

  const totalCredit = useMemo(() => runningRows.reduce((sum, row) => sum + row.credit, 0), [runningRows]);
  const totalDebit = useMemo(() => runningRows.reduce((sum, row) => sum + row.debit, 0), [runningRows]);
  const currentBalance = OPENING_BALANCE + totalCredit - totalDebit;
  const latestDate = runningRows.length ? runningRows[runningRows.length - 1].date : OPENING_DATE;

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return runningRows.filter((row) => {
      if (scope !== "ALL" && row.scope !== scope) return false;
      if (!q) return true;
      return `${row.date} ${row.reference} ${row.description} ${row.scope} ${row.type}`.toLowerCase().includes(q);
    });
  }, [runningRows, scope, query]);

  const monthly = useMemo(() => {
    const map = new Map<string, { label: string; income: number; expense: number; net: number; count: number }>();
    for (const row of postOpening) {
      const key = row.date.slice(0, 7);
      const [year, month] = key.split("-").map(Number);
      const label = new Date(year, month - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
      const item = map.get(key) || { label, income: 0, expense: 0, net: 0, count: 0 };
      if (row.type === "Income") item.income += row.amount;
      else item.expense += row.amount;
      item.net = item.income - item.expense;
      item.count += 1;
      map.set(key, item);
    }
    return [...map.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [postOpening]);

  function generateStatement() {
    const rows = [
      `<tr class="opening"><td>${prettyDate(OPENING_DATE)}</td><td>Opening balance</td><td>Authoritative closing balance carried forward</td><td></td><td></td><td class="num">${esc(money(OPENING_BALANCE))}</td></tr>`,
      ...runningRows.map((row) => `<tr><td>${esc(prettyDate(row.date))}</td><td>${esc(row.reference)}</td><td>${esc(row.description)}</td><td class="num debit">${row.debit ? esc(money(row.debit)) : ""}</td><td class="num credit">${row.credit ? esc(money(row.credit)) : ""}</td><td class="num balance">${esc(money(row.balance))}</td></tr>`),
      `<tr class="closing"><td colspan="5">CURRENT RECONCILED BALANCE — ${esc(prettyDate(latestDate))}</td><td class="num">${esc(money(currentBalance))}</td></tr>`,
    ].join("");
    const generated = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
    const origin = window.location.origin;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>LAND VIEW Ledger Statement</title><style>
      *{box-sizing:border-box}body{margin:0;background:#e7e9ec;color:#14171b;font-family:Arial,Helvetica,sans-serif}.sheet{width:210mm;min-height:297mm;margin:12px auto;background:#fff;padding:15mm 15mm 18mm;box-shadow:0 18px 50px rgba(0,0,0,.13)}.bar{height:4px;background:#d61f26;margin:-15mm -15mm 10mm}.head{display:flex;justify-content:space-between;gap:24px}.brand{display:flex;align-items:center;gap:11px}.brand img{width:55px;height:55px}.brand h1{margin:0;font-size:23px}.brand h1 span{color:#d61f26}.brand p,.doc p{margin:4px 0 0;font-size:8px;color:#606870}.doc{text-align:right}.doc h2{margin:0;font-size:22px}.rule{height:1px;background:#d61f26;margin:8mm 0 6mm}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:0 0 7mm}.card{border:1px solid #dfe2e5;border-radius:7px;padding:9px}.card span{display:block;font-size:7px;font-weight:800;letter-spacing:.08em;color:#737b84}.card b{display:block;margin-top:6px;font-size:12px}.card.current{background:#171a1f;color:#fff;border-color:#171a1f}.card.current span{color:#c7ccd1}.title{font-size:9px;font-weight:900;letter-spacing:.1em;color:#d61f26;margin-bottom:3mm}table{width:100%;border-collapse:collapse;font-size:7.4px}th{background:#171a1f;color:#fff;text-align:left;padding:7px 6px;font-size:6.5px}td{padding:6px;border-bottom:1px solid #e6e8ea;vertical-align:top}.num{text-align:right;white-space:nowrap}.debit{color:#a3282e}.credit{color:#257241}.balance{font-weight:900}.opening td{background:#f3f4f5;font-weight:700}.closing td{background:#171a1f;color:#fff;font-weight:900;border:0}.note{margin-top:8mm;padding:8px 10px;border-left:3px solid #d61f26;background:#f6f7f8;font-size:7.5px;line-height:1.5;color:#555d65}.footer{margin-top:10mm;border-top:1px solid #d61f26;padding-top:6px;display:flex;justify-content:space-between;font-size:6.5px;color:#666d74}.actions{position:fixed;top:18px;right:18px}.actions button{border:0;border-radius:7px;background:#d61f26;color:#fff;font-weight:800;padding:10px 14px}@media print{body{background:#fff}.sheet{margin:0;box-shadow:none}.actions{display:none}@page{size:A4;margin:0}}</style></head><body><div class="actions"><button onclick="window.print()">Print / Save PDF</button></div><main class="sheet"><div class="bar"></div><header class="head"><div class="brand"><img src="${origin}/land-view-logo.svg" alt="LAND VIEW"><div><h1>LAND <span>VIEW</span></h1><p>ENGINEERS &amp; ARCHITECTS</p></div></div><div class="doc"><h2>LEDGER STATEMENT</h2><p>As of ${esc(prettyDate(latestDate))}</p><p>Generated ${esc(generated)}</p></div></header><div class="rule"></div><section class="summary"><div class="card"><span>OPENING BALANCE</span><b>${esc(money(OPENING_BALANCE))}</b></div><div class="card"><span>TOTAL INCOME</span><b>${esc(money(totalCredit))}</b></div><div class="card"><span>TOTAL EXPENSE</span><b>${esc(money(totalDebit))}</b></div><div class="card current"><span>CURRENT BALANCE</span><b>${esc(money(currentBalance))}</b></div></section><div class="title">DETAILED RUNNING LEDGER</div><table><thead><tr><th>Date</th><th>Reference</th><th>Details</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr></thead><tbody>${rows}</tbody></table><div class="note">Every balance shown is the running LAND VIEW balance immediately after that transaction. The statement starts from the verified 31 August 2026 closing balance and includes only approved clean SRC source rows.</div><footer class="footer"><span>Feni, Bangladesh</span><span>www.landview.com.bd</span><span>info@landview.com.bd</span><span>+88 0140 80 80 400 · +88 01902 500 400</span></footer></main></body></html>`;
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) return window.alert("Please allow pop-ups to generate the ledger statement.");
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  return <>
    <style>{`
      .lv-ledger{max-width:1480px;margin:0 auto;padding:2px 0 24px;color:#eef3f6}.lv-ledger *{box-sizing:border-box}.lv-ledger-card{border:1px solid #2b343d;border-radius:16px;background:linear-gradient(145deg,#10161c,#0a0f14);box-shadow:0 18px 48px rgba(0,0,0,.2);overflow:hidden}.lv-ledger-head{display:flex;justify-content:space-between;gap:22px;padding:22px 24px;border-bottom:1px solid #273039;background:radial-gradient(circle at 88% 0,rgba(214,31,38,.17),transparent 34%)}.lv-kicker{font-size:9px;font-weight:900;letter-spacing:.18em;color:#ef6a67}.lv-ledger h1{margin:5px 0 6px;font-size:26px;letter-spacing:-.02em}.lv-sub{margin:0;color:#82909a;font-size:10px;line-height:1.5}.lv-actions{display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap}.lv-actions button,.lv-actions select,.lv-actions input{height:39px;border:1px solid #35414a;border-radius:9px;background:#101820;color:#eef2f5;padding:0 12px;font-size:10px;font-weight:800}.lv-actions input{min-width:240px;font-weight:600}.lv-actions button{cursor:pointer}.lv-actions .primary{border-color:#d61f26;background:linear-gradient(180deg,#df2b32,#b9151c);box-shadow:0 8px 20px rgba(214,31,38,.17)}.lv-stats{display:grid;grid-template-columns:1.3fr repeat(3,1fr);gap:10px;padding:16px 20px}.lv-stat{border:1px solid #2c3740;border-radius:11px;background:#0d1419;padding:14px}.lv-stat span{display:block;color:#7d8a94;font-size:8px;font-weight:900;letter-spacing:.09em}.lv-stat strong{display:block;margin-top:7px;font-size:17px;font-variant-numeric:tabular-nums}.lv-stat small{display:block;margin-top:5px;color:#68757f;font-size:8px}.lv-stat.current{background:linear-gradient(140deg,rgba(214,31,38,.16),#10161b);border-color:rgba(214,31,38,.52)}.lv-stat.current strong{font-size:29px}.lv-stat.credit strong{color:#83d7a0}.lv-stat.debit strong{color:#ff9995}.lv-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 18px;border-top:1px solid #252e36;border-bottom:1px solid #252e36;background:#0c1217}.lv-toolbar-copy b{display:block;font-size:12px}.lv-toolbar-copy span{display:block;margin-top:3px;color:#6f7c86;font-size:8.5px}.lv-filter{display:flex;gap:8px;flex-wrap:wrap}.lv-error{margin:14px 20px 0;padding:10px 12px;border:1px solid #6b3035;border-radius:9px;background:#311a1d;color:#ffaaa6;font-size:10px}.lv-table-wrap{overflow:auto;max-height:62vh}.lv-bank{width:100%;border-collapse:separate;border-spacing:0;min-width:980px}.lv-bank th{position:sticky;top:0;z-index:2;background:#172027!important;color:#8b98a2!important;padding:10px 11px!important;font-size:8px!important;letter-spacing:.07em!important;text-align:left;border-bottom:1px solid #313b44}.lv-bank td{background:#0d1419!important;padding:10px 11px!important;border-bottom:1px solid #222c34!important;font-size:9.5px!important;vertical-align:top}.lv-bank tr:hover td{background:#111a20!important}.lv-bank .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.lv-bank .debit{color:#ff9c98}.lv-bank .credit{color:#84d8a0}.lv-bank .balance{font-weight:900;color:#f2f5f7}.lv-bank .scope{font-size:8px;font-weight:900;color:#8a98a2}.lv-type{display:inline-flex;padding:3px 7px;border-radius:999px;font-size:7px;font-weight:900;letter-spacing:.05em}.lv-type.income{background:rgba(65,171,102,.13);color:#8adba5}.lv-type.expense{background:rgba(214,31,38,.13);color:#ffaaa6}.lv-opening td{background:#121a20!important;font-weight:800}.lv-closing td{background:linear-gradient(90deg,rgba(214,31,38,.14),#11181e)!important;border-top:1px solid rgba(214,31,38,.5)!important;font-weight:900}.lv-empty{padding:28px!important;text-align:center;color:#71808b}.lv-note{padding:11px 18px;border-top:1px solid #283139;color:#6e7b85;font-size:8.5px;line-height:1.5}.lv-months{margin-top:14px;border:1px solid #2b343d;border-radius:14px;background:#0c1217;overflow:hidden}.lv-month-head{padding:14px 18px;border-bottom:1px solid #273039}.lv-month-head b{font-size:13px}.lv-month-head span{display:block;margin-top:3px;color:#74818b;font-size:8.5px}.lv-month-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:14px}.lv-month{border:1px solid #2b353e;border-radius:10px;background:#0e151a;padding:12px}.lv-month span{font-size:8px;font-weight:900;color:#7c8993}.lv-month strong{display:block;margin-top:7px;font-size:14px}.lv-month small{display:block;margin-top:5px;color:#6b7882;font-size:8px}.lv-positive{color:#84d8a0}.lv-negative{color:#ff9c98}@media(max-width:1000px){.lv-ledger-head{flex-direction:column}.lv-stats{grid-template-columns:repeat(2,1fr)}.lv-month-grid{grid-template-columns:1fr 1fr}.lv-actions{width:100%}.lv-actions input{flex:1;min-width:180px}}@media(max-width:620px){.lv-stats{grid-template-columns:1fr;padding:12px}.lv-ledger-head{padding:17px 14px}.lv-toolbar{align-items:flex-start;flex-direction:column}.lv-month-grid{grid-template-columns:1fr}.lv-actions input{width:100%}}
    `}</style>
    <section className="lv-ledger">
      <div className="lv-ledger-card">
        <header className="lv-ledger-head">
          <div><span className="lv-kicker">LAND VIEW FINANCE</span><h1>Running Ledger</h1><p className="lv-sub">Bank-style income and expense ledger. Every transaction row shows the balance immediately after that transaction.</p></div>
          <div className="lv-actions"><button onClick={() => void load()} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button><button className="primary" onClick={generateStatement} disabled={loading || !runningRows.length}>Generate Statement</button></div>
        </header>
        {error && <div className="lv-error"><b>Ledger could not load.</b> {error}</div>}
        <div className="lv-stats">
          <div className="lv-stat current"><span>CURRENT BALANCE</span><strong>{money(currentBalance)}</strong><small>Reconciled through {prettyDate(latestDate)}</small></div>
          <div className="lv-stat"><span>OPENING BALANCE</span><strong>{money(OPENING_BALANCE)}</strong><small>31 Aug 2026 verified closing</small></div>
          <div className="lv-stat credit"><span>INCOME SINCE OPENING</span><strong>{money(totalCredit)}</strong><small>{runningRows.filter(r => r.credit).length} credit entries</small></div>
          <div className="lv-stat debit"><span>EXPENSE SINCE OPENING</span><strong>{money(totalDebit)}</strong><small>{runningRows.filter(r => r.debit).length} debit entries</small></div>
        </div>
        <div className="lv-toolbar">
          <div className="lv-toolbar-copy"><b>Detailed ledger</b><span>{filteredRows.length} visible transaction{filteredRows.length === 1 ? "" : "s"} · balance column always uses the full running ledger</span></div>
          <div className="lv-filter"><select value={scope} onChange={(e) => setScope(e.target.value)}><option value="ALL">All scopes</option><option value="OFF">Office</option><option value="PER">Personal</option></select><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search details or reference…" /></div>
        </div>
        <div className="lv-table-wrap"><table className="lv-bank"><thead><tr><th>Date</th><th>Details / Reference</th><th>Type</th><th className="num">Expense (Debit)</th><th className="num">Income (Credit)</th><th className="num">Balance</th><th>Scope</th></tr></thead><tbody>
          <tr className="lv-opening"><td>{prettyDate(OPENING_DATE)}</td><td><b>Opening balance</b><br/><span className="lv-sub">31 Aug verified closing carried forward</span></td><td>—</td><td className="num">—</td><td className="num">—</td><td className="num balance">{money(OPENING_BALANCE)}</td><td className="scope">OFF + PER</td></tr>
          {filteredRows.map((row) => <tr key={`${row.type}-${row.reference}`}><td>{prettyDate(row.date)}</td><td><b>{row.description}</b><br/><span className="lv-sub">{row.reference}</span></td><td><span className={`lv-type ${row.type.toLowerCase()}`}>{row.type}</span></td><td className="num debit">{row.debit ? money(row.debit) : "—"}</td><td className="num credit">{row.credit ? money(row.credit) : "—"}</td><td className="num balance">{money(row.balance)}</td><td className="scope">{row.scope === "PER" ? "PERSONAL" : row.scope === "OFF" ? "OFFICE" : row.scope}</td></tr>)}
          {!loading && !filteredRows.length && <tr><td colSpan={7} className="lv-empty">No transactions match the current filters.</td></tr>}
          <tr className="lv-closing"><td colSpan={5}>CURRENT RECONCILED BALANCE · {prettyDate(latestDate)}</td><td className="num balance">{money(currentBalance)}</td><td className="scope">LIVE</td></tr>
        </tbody></table></div>
        <div className="lv-note">Only approved clean <b>SRC-I-*</b> income and <b>SRC-E-*</b> expense records are included. Duplicate historical/import rows are ignored. Filtering rows does not recalculate the balance column, so each displayed balance remains the true balance after that transaction.</div>
      </div>
      <section className="lv-months"><div className="lv-month-head"><b>Monthly movement</b><span>Compact month-by-month view from the same reconciled transactions.</span></div><div className="lv-month-grid">{monthly.map(([key, item]) => <div className="lv-month" key={key}><span>{item.label.toUpperCase()}</span><strong className={item.net >= 0 ? "lv-positive" : "lv-negative"}>{money(item.net)}</strong><small>Income {money(item.income)} · Expense {money(item.expense)} · {item.count} records</small></div>)}</div></section>
    </section>
  </>;
}
