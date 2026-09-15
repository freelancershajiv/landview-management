"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { landViewApi, type FinanceSheetData } from "@/lib/api";

type Tx = {
  type: "Income" | "Expense";
  date: string;
  description: string;
  amount: number;
  status: string;
  fileId: string;
};

type MonthRow = {
  key: string;
  label: string;
  income: number;
  expense: number;
  pending: number;
  net: number;
  records: number;
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const text = (value: unknown) => String(value ?? "").trim();
const number = (value: unknown) => {
  const parsed = Number(String(value ?? 0).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value: number) => new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 2 }).format(value);

function asRecords(data: FinanceSheetData | null) {
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

function parseDate(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  if (/^\d{5}(?:\.\d+)?$/.test(raw)) {
    const serial = Number(raw);
    if (serial > 20000 && serial < 80000) return new Date(1899, 11, 30 + Math.floor(serial));
  }
  const direct = Date.parse(raw);
  if (!Number.isNaN(direct)) return new Date(direct);
  const match = raw.match(/^(\d{1,2})[-/ ]([A-Za-z]{3}|\d{1,2})[-/ ](\d{4})$/);
  if (!match) return null;
  const names: Record<string, number> = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11 };
  const month = /^\d+$/.test(match[2]) ? Number(match[2]) - 1 : names[match[2].toLowerCase()];
  if (month === undefined || month < 0 || month > 11) return null;
  return new Date(Number(match[3]), month, Number(match[1]));
}

function incomeRows(data: FinanceSheetData | null): Tx[] {
  return asRecords(data).map((row) => ({
    type: "Income" as const,
    date: text(row.Payment_Date || row.Date || row.Income_Date),
    description: text(row.Payment_For || row.Description || row.Client_Name || "Income received"),
    amount: number(row.Amount),
    status: "Received",
    fileId: text(row.File_ID || row.Project_ID),
  })).filter((row) => row.date && row.amount !== 0);
}

function expenseRows(data: FinanceSheetData | null): Tx[] {
  return asRecords(data).map((row) => ({
    type: "Expense" as const,
    date: text(row.Expense_Date || row.Date),
    description: text(row.Description || row.Category || "Expense"),
    amount: number(row.Amount),
    status: text(row.Approval_Status || row.Status || "Pending"),
    fileId: text(row.File_ID || row.Project_ID),
  })).filter((row) => row.date && row.amount !== 0);
}

function esc(value: unknown) {
  return text(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function formatStatementDate(value: string) {
  const d = parseDate(value);
  return d ? d.toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }) : value;
}

export default function AccountsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [income, setIncome] = useState<FinanceSheetData | null>(null);
  const [expenses, setExpenses] = useState<FinanceSheetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");

  useEffect(() => {
    if (pathname !== "/admin/accounts") return;
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.all([
      landViewApi.getFinanceSheet("Accounting Income"),
      landViewApi.getFinanceSheet("Accounting Expenses"),
    ]).then(([incomeData, expenseData]) => {
      if (cancelled) return;
      setIncome(incomeData);
      setExpenses(expenseData);
    }).catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Could not load monthly ledger summary.");
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [pathname]);

  const transactions = useMemo(() => [...incomeRows(income), ...expenseRows(expenses)], [income, expenses]);
  const years = useMemo(() => [...new Set(transactions.map((row) => parseDate(row.date)?.getFullYear()).filter((v): v is number => Boolean(v)))].sort((a,b) => b-a), [transactions]);

  useEffect(() => {
    if (!year && years.length) setYear(String(years[0]));
  }, [year, years]);

  const monthly = useMemo<MonthRow[]>(() => {
    const y = Number(year || years[0] || new Date().getFullYear());
    return MONTHS.map((label, index) => {
      const rows = transactions.filter((row) => {
        const d = parseDate(row.date);
        return d && d.getFullYear() === y && d.getMonth() === index;
      });
      const incomeTotal = rows.filter((row) => row.type === "Income").reduce((sum,row) => sum + row.amount, 0);
      const approved = rows.filter((row) => row.type === "Expense" && row.status.toLowerCase() === "approved").reduce((sum,row) => sum + row.amount, 0);
      const pending = rows.filter((row) => row.type === "Expense" && row.status.toLowerCase() === "pending").reduce((sum,row) => sum + row.amount, 0);
      return { key: String(index + 1).padStart(2,"0"), label, income: incomeTotal, expense: approved, pending, net: incomeTotal - approved, records: rows.length };
    });
  }, [transactions, year, years]);

  const annual = useMemo(() => monthly.reduce((acc,row) => ({
    income: acc.income + row.income,
    expense: acc.expense + row.expense,
    pending: acc.pending + row.pending,
    net: acc.net + row.net,
    records: acc.records + row.records,
  }), { income:0, expense:0, pending:0, net:0, records:0 }), [monthly]);

  const selectedRows = useMemo(() => transactions.filter((row) => {
    const d = parseDate(row.date);
    if (!d || String(d.getFullYear()) !== year) return false;
    if (month && String(d.getMonth() + 1).padStart(2,"0") !== month) return false;
    return true;
  }).sort((a,b) => (parseDate(a.date)?.getTime() || 0) - (parseDate(b.date)?.getTime() || 0)), [transactions, year, month]);

  function generateStatement() {
    const selectedMonth = month ? monthly.find((item) => item.key === month) : null;
    const period = selectedMonth ? `${selectedMonth.label} ${year}` : `Year ${year}`;
    const summary = selectedMonth ? selectedMonth : annual;
    const ref = `LV-ACC-${year}${month ? `-${month}` : "-ANNUAL"}`;
    const rowsHtml = (month ? selectedRows : monthly.map((row) => ({
      type: "Summary" as const,
      date: `${row.label} ${year}`,
      description: `${row.records} transaction${row.records === 1 ? "" : "s"}`,
      amount: row.net,
      status: "",
      fileId: "",
      income: row.income,
      expense: row.expense,
    }))).map((row: any) => month
      ? `<tr><td>${esc(formatStatementDate(row.date))}</td><td><span class="kind ${row.type === "Income" ? "in" : "out"}">${esc(row.type)}</span></td><td>${esc(row.fileId || "—")}</td><td>${esc(row.description)}</td><td class="num">${esc(money(row.amount))}</td><td>${esc(row.status)}</td></tr>`
      : `<tr><td>${esc(row.date)}</td><td class="num">${esc(money(row.income))}</td><td class="num">${esc(money(row.expense))}</td><td class="num strong">${esc(money(row.amount))}</td><td>${esc(row.description)}</td></tr>`
    ).join("");

    const origin = window.location.origin;
    const generated = new Date().toLocaleString("en-GB", { dateStyle:"medium", timeStyle:"short" });
    const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(ref)} - LAND VIEW</title><style>
      *{box-sizing:border-box}body{margin:0;background:#e9ecef;color:#17191d;font-family:Arial,Helvetica,sans-serif}.sheet{width:210mm;min-height:297mm;margin:12px auto;background:#fff;padding:16mm 16mm 18mm;position:relative;box-shadow:0 18px 50px rgba(0,0,0,.14)}.topline{height:4px;background:#d61f26;margin:-16mm -16mm 12mm}.head{display:flex;justify-content:space-between;align-items:flex-start;gap:25px}.brand{display:flex;align-items:center;gap:12px}.brand img{width:62px;height:62px;object-fit:contain}.brand strong{display:block;font-size:23px;letter-spacing:.04em}.brand strong span{color:#d61f26}.brand small{display:block;margin-top:4px;font-weight:700;letter-spacing:.14em;font-size:7px;color:#5f646b}.doc-title{text-align:right}.doc-title h1{font-size:25px;margin:2px 0 7px;letter-spacing:.02em}.doc-title p{margin:3px 0;font-size:10px;color:#676d75}.accent{height:1px;background:#d61f26;margin:10mm 0 6mm}.period{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:6mm}.period h2{margin:0;font-size:18px}.period p{margin:4px 0 0;font-size:10px;color:#687079}.badge{border:1px solid #d7dadd;border-radius:6px;padding:8px 12px;text-align:right;font-size:9px;color:#555c64}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:6mm 0}.sum{border:1px solid #dfe2e5;border-radius:7px;padding:10px}.sum span{display:block;font-size:7px;font-weight:800;letter-spacing:.1em;color:#747b84}.sum b{display:block;margin-top:7px;font-size:13px}.sum.net{background:#15181c;color:#fff;border-color:#15181c}.sum.net span{color:#c9cdd1}.sum.pending b{color:#b96f00}.table-title{font-size:10px;font-weight:800;letter-spacing:.11em;margin:7mm 0 3mm;color:#d61f26}table{width:100%;border-collapse:collapse;font-size:9px}th{padding:8px 7px;background:#171a1f;color:#fff;text-align:left;font-size:7px;letter-spacing:.08em}td{padding:8px 7px;border-bottom:1px solid #e4e6e8;vertical-align:top}tr:nth-child(even) td{background:#fafafa}.num{text-align:right;white-space:nowrap}.strong{font-weight:800}.kind{display:inline-block;padding:3px 6px;border-radius:9px;font-size:7px;font-weight:800}.kind.in{background:#e9f7ee;color:#257542}.kind.out{background:#fdecee;color:#a62b30}.note{margin-top:9mm;padding:9px 11px;border-left:3px solid #d61f26;background:#f7f7f8;font-size:8.5px;line-height:1.55;color:#555d65}.footer{position:absolute;left:16mm;right:16mm;bottom:10mm;border-top:1px solid #d61f26;padding-top:7px;display:flex;justify-content:space-between;font-size:7px;color:#656c74}.actions{position:fixed;right:18px;top:18px}.actions button{border:0;border-radius:7px;background:#d61f26;color:#fff;font-weight:800;padding:10px 15px;cursor:pointer}@media print{body{background:#fff}.sheet{margin:0;box-shadow:none;width:210mm;min-height:297mm}.actions{display:none}@page{size:A4;margin:0}}
    </style></head><body><div class="actions"><button onclick="window.print()">Print / Save PDF</button></div><main class="sheet"><div class="topline"></div><header class="head"><div class="brand"><img src="${origin}/land-view-logo.svg" alt="LAND VIEW"><div><strong>LAND <span>VIEW</span></strong><small>ENGINEERS &amp; ARCHITECTS</small></div></div><div class="doc-title"><h1>ACCOUNT STATEMENT</h1><p>Statement No: <b>${esc(ref)}</b></p><p>Generated: ${esc(generated)}</p></div></header><div class="accent"></div><section class="period"><div><h2>Monthly Income &amp; Expense Statement</h2><p>Reporting period: ${esc(period)}</p></div><div class="badge">LAND VIEW<br><b>Internal Accounts Ledger</b></div></section><section class="summary"><div class="sum"><span>INCOME</span><b>${esc(money(summary.income))}</b></div><div class="sum"><span>APPROVED EXPENSE</span><b>${esc(money(summary.expense))}</b></div><div class="sum pending"><span>PENDING EXPENSE</span><b>${esc(money(summary.pending))}</b></div><div class="sum net"><span>NET POSITION</span><b>${esc(money(summary.net))}</b></div></section><div class="table-title">${month ? "TRANSACTION DETAILS" : "MONTH-BY-MONTH SUMMARY"}</div><table><thead><tr>${month ? "<th>Date</th><th>Type</th><th>File</th><th>Description</th><th class=\"num\">Amount</th><th>Status</th>" : "<th>Month</th><th class=\"num\">Income</th><th class=\"num\">Expense</th><th class=\"num\">Net</th><th>Records</th>"}</tr></thead><tbody>${rowsHtml || `<tr><td colspan="6">No transactions recorded for this period.</td></tr>`}</tbody></table><div class="note">This statement is generated from the LAND VIEW management ledger. Expense totals include approved expenses; pending expenses are shown separately and are not deducted from the net position until approved.</div><footer class="footer"><span>Feni, Bangladesh</span><span>www.landview.com.bd</span><span>info@landview.com.bd</span><span>+88 0140 80 80 400 · +88 01902 500 400</span></footer></main></body></html>`;
    const win = window.open("", "_blank", "noopener,noreferrer");
    if (!win) return window.alert("Please allow pop-ups to generate the statement.");
    win.document.open();
    win.document.write(doc);
    win.document.close();
  }

  if (pathname !== "/admin/accounts") return <>{children}</>;

  const selectedLabel = month ? monthly.find((item) => item.key === month)?.label : "All months";

  return <>
    <style>{`
      .lv-monthly{max-width:1500px;margin:0 auto 18px;border:1px solid #303842;border-radius:14px;background:linear-gradient(145deg,#11171d,#0c1116);overflow:hidden;color:#eef2f5}.lv-monthly-head{display:flex;justify-content:space-between;gap:18px;align-items:center;padding:18px 20px;border-bottom:1px solid #29323b;background:radial-gradient(circle at 92% 0,rgba(214,31,38,.13),transparent 34%)}.lv-monthly-kicker{font-size:9px;font-weight:900;letter-spacing:.16em;color:#ef6964}.lv-monthly h2{margin:5px 0 4px;font-size:20px}.lv-monthly-head p{margin:0;color:#7f8c97;font-size:10px}.lv-monthly-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.lv-monthly select,.lv-monthly button{height:38px;border:1px solid #35414b;border-radius:8px;background:#101820;color:#eef2f5;padding:0 11px;font-size:10px;font-weight:800}.lv-monthly button{cursor:pointer}.lv-monthly button.primary{border-color:#d61f26;background:linear-gradient(180deg,#df2b32,#b9151c);box-shadow:0 7px 20px rgba(214,31,38,.17)}.lv-monthly-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;padding:14px 20px}.lv-monthly-stat{border:1px solid #2d3740;border-radius:10px;background:#0d141a;padding:12px}.lv-monthly-stat span{display:block;color:#75838e;font-size:8px;font-weight:900;letter-spacing:.08em}.lv-monthly-stat strong{display:block;margin-top:6px;font-size:16px}.lv-monthly-stat.net{border-color:rgba(214,31,38,.45);background:linear-gradient(145deg,rgba(214,31,38,.12),#0d141a)}.lv-monthly-table-wrap{overflow:auto;padding:0 20px 18px}.lv-monthly table{width:100%;border-collapse:separate;border-spacing:0;min-width:720px;border:1px solid #2d3740;border-radius:10px;overflow:hidden}.lv-monthly th{background:#182129!important;color:#8996a0!important;padding:9px 11px!important;font-size:8px!important;letter-spacing:.08em!important}.lv-monthly td{background:#0f161c!important;padding:10px 11px!important;border-top:1px solid #27313a!important;font-size:10px!important}.lv-monthly tbody tr{cursor:pointer}.lv-monthly tbody tr:hover td,.lv-monthly tbody tr.selected td{background:#151e25!important}.lv-monthly tbody tr.selected td:first-child{box-shadow:inset 3px 0 #d61f26}.lv-monthly .num{text-align:right;font-variant-numeric:tabular-nums}.lv-monthly .positive{color:#85d8a1}.lv-monthly .negative{color:#ff9692}.lv-monthly .empty{color:#63717c}.lv-monthly-error{margin:0 20px 14px;padding:9px 11px;border:1px solid #6e3035;background:#321b1e;color:#ffaaa6;border-radius:8px;font-size:10px}@media(max-width:900px){.lv-monthly-head{align-items:flex-start;flex-direction:column}.lv-monthly-summary{grid-template-columns:repeat(2,1fr)}}@media(max-width:560px){.lv-monthly-summary{grid-template-columns:1fr}.lv-monthly-head,.lv-monthly-summary,.lv-monthly-table-wrap{padding-left:12px;padding-right:12px}}
    `}</style>
    <section className="lv-monthly" aria-label="Monthly income and expense summary">
      <div className="lv-monthly-head">
        <div><span className="lv-monthly-kicker">MONTHLY ACCOUNTS</span><h2>Income &amp; expense by month</h2><p>Choose a year or month, then generate a billing-style LAND VIEW statement.</p></div>
        <div className="lv-monthly-controls">
          <select value={year} onChange={(e) => { setYear(e.target.value); setMonth(""); }} aria-label="Statement year">{years.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Statement month"><option value="">All months</option>{monthly.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select>
          <button className="primary" disabled={loading || !year} onClick={generateStatement}>Generate Statement</button>
        </div>
      </div>
      {error && <div className="lv-monthly-error">{error}</div>}
      <div className="lv-monthly-summary">
        <div className="lv-monthly-stat"><span>{selectedLabel?.toUpperCase()} INCOME</span><strong>{money(month ? (monthly.find((item) => item.key === month)?.income || 0) : annual.income)}</strong></div>
        <div className="lv-monthly-stat"><span>APPROVED EXPENSE</span><strong>{money(month ? (monthly.find((item) => item.key === month)?.expense || 0) : annual.expense)}</strong></div>
        <div className="lv-monthly-stat"><span>PENDING EXPENSE</span><strong>{money(month ? (monthly.find((item) => item.key === month)?.pending || 0) : annual.pending)}</strong></div>
        <div className="lv-monthly-stat net"><span>NET POSITION</span><strong>{money(month ? (monthly.find((item) => item.key === month)?.net || 0) : annual.net)}</strong></div>
      </div>
      <div className="lv-monthly-table-wrap">
        <table><thead><tr><th>Month</th><th className="num">Income</th><th className="num">Approved Expense</th><th className="num">Pending</th><th className="num">Net</th><th className="num">Records</th></tr></thead><tbody>{monthly.map((item) => <tr key={item.key} className={month === item.key ? "selected" : ""} onClick={() => setMonth((current) => current === item.key ? "" : item.key)}><td><b>{item.label}</b></td><td className="num positive">{money(item.income)}</td><td className="num negative">{money(item.expense)}</td><td className="num">{money(item.pending)}</td><td className={`num ${item.net >= 0 ? "positive" : "negative"}`}>{money(item.net)}</td><td className="num">{item.records || <span className="empty">—</span>}</td></tr>)}</tbody></table>
      </div>
    </section>
    {children}
  </>;
}
