"use client";

import { useEffect, useMemo, useState } from "react";
import { landViewApi, type FinanceSheetData } from "@/lib/api";

type LedgerType = "Income" | "Expense";
type ViewMode = "dashboard" | "income" | "expenses" | "reports";
type LedgerRow = {
  id: string;
  type: LedgerType;
  date: string;
  fileId: string;
  projectName: string;
  clientName: string;
  category: string;
  description: string;
  amount: number;
  status: string;
  requestedBy: string;
  approvedBy: string;
  paidTo: string;
  paymentMethod: string;
  reference: string;
  receivedFrom: string;
  receivedBy: string;
  source: string;
  search: string;
};

type Filters = {
  query: string;
  fileId: string;
  category: string;
  status: string;
  person: string;
  from: string;
  to: string;
};

const LEDGER_URL = "https://docs.google.com/spreadsheets/d/1E1hCMKn3fGl7LUov1FS60IJNVnZTJUlf6CCO4pFMQw4/edit";
const EMPTY_FILTERS: Filters = { query: "", fileId: "", category: "", status: "", person: "", from: "", to: "" };
const t = (value: unknown) => String(value ?? "").trim();
const amount = (value: unknown) => {
  const n = Number(String(value ?? 0).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const money = (value: number) => new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 2 }).format(value);

function records(data: FinanceSheetData | null) {
  if (!data) return [] as Record<string, string>[];
  return (data.rows || []).map(row => {
    const result: Record<string, string> = {};
    (data.headers || []).forEach((header, index) => {
      const key = t(header);
      if (key) result[key] = t(row[index]);
    });
    return result;
  });
}

function parseDate(value: unknown) {
  const raw = t(value);
  if (!raw) return null;
  const iso = Date.parse(raw);
  if (!Number.isNaN(iso)) return new Date(iso);
  const match = raw.match(/^(\d{1,2})[-/ ]([A-Za-z]{3}|\d{1,2})[-/ ](\d{4})$/);
  if (!match) return null;
  const months: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const month = /^\d+$/.test(match[2]) ? Number(match[2]) - 1 : months[match[2].toLowerCase()];
  if (month === undefined || month < 0 || month > 11) return null;
  return new Date(Number(match[3]), month, Number(match[1]));
}

function dateKey(value: unknown) {
  const d = parseDate(value);
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function displayDate(value: unknown) {
  const d = parseDate(value);
  return d ? d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : (t(value) || "—");
}

function toIncomeRows(data: FinanceSheetData | null): LedgerRow[] {
  return records(data).map(record => {
    const row: LedgerRow = {
      id: t(record.Income_ID), type: "Income", date: t(record.Payment_Date), fileId: t(record.File_ID),
      projectName: t(record.Project_Name), clientName: t(record.Client_Name), category: t(record.Income_Category) || "Other Income",
      description: t(record.Payment_For) || "Income received", amount: amount(record.Amount), status: "Received",
      requestedBy: "", approvedBy: "", paidTo: "", paymentMethod: t(record.Payment_Method), reference: t(record.Reference_No),
      receivedFrom: t(record.Received_From), receivedBy: t(record.Received_By), source: t(record.Created_By), search: ""
    };
    row.search = Object.values(row).join(" ").toLowerCase();
    return row;
  }).filter(row => row.id);
}

function toExpenseRows(data: FinanceSheetData | null): LedgerRow[] {
  return records(data).map(record => {
    const row: LedgerRow = {
      id: t(record.Expense_ID), type: "Expense", date: t(record.Expense_Date), fileId: t(record.File_ID),
      projectName: t(record.Project_Name), clientName: "", category: t(record.Category) || "Miscellaneous",
      description: t(record.Description) || "Office expense", amount: amount(record.Amount), status: t(record.Approval_Status) || "Pending",
      requestedBy: t(record.Requested_By), approvedBy: t(record.Approved_By), paidTo: t(record.Paid_To),
      paymentMethod: t(record.Payment_Method), reference: t(record.Reference_No), receivedFrom: "", receivedBy: "",
      source: t(record.Created_By), search: ""
    };
    row.search = Object.values(row).join(" ").toLowerCase();
    return row;
  }).filter(row => row.id);
}

function ascii(value: unknown) {
  return t(value).normalize("NFKD").replace(/[^\x20-\x7E]/g, " ").replace(/\s+/g, " ").trim();
}
function pdfEscape(value: string) { return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)"); }
function clip(value: string, max: number) { return value.length <= max ? value : value.slice(0, Math.max(0, max - 3)) + "..."; }

function buildPdf(title: string, rows: LedgerRow[], summary: { income: number; expense: number; pending: number; net: number }, filterText: string) {
  const lines: string[] = [];
  lines.push(`Generated: ${new Date().toLocaleString("en-GB")}`);
  if (filterText) lines.push(`Filters: ${filterText}`);
  lines.push(`Income: BDT ${summary.income.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
  lines.push(`Approved expense: BDT ${summary.expense.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
  lines.push(`Pending expense: BDT ${summary.pending.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
  lines.push(`Net: BDT ${summary.net.toLocaleString("en-US", { maximumFractionDigits: 2 })}`);
  lines.push(`Transactions: ${rows.length}`);
  lines.push("");
  lines.push("DATE | TYPE | FILE | CATEGORY | AMOUNT | STATUS");
  rows.forEach(row => {
    lines.push(clip(`${displayDate(row.date)} | ${row.type.toUpperCase()} | ${row.fileId || "-"} | ${row.category} | BDT ${row.amount.toLocaleString("en-US", { maximumFractionDigits: 2 })} | ${row.status}`, 105));
    lines.push(clip(`  ${row.description}${row.type === "Expense" && row.paidTo ? ` | Paid to: ${row.paidTo}` : ""}${row.type === "Income" && row.receivedFrom ? ` | From: ${row.receivedFrom}` : ""}`, 110));
  });

  const printable = lines.map(ascii);
  const perPage = 43;
  const pages: string[][] = [];
  for (let i = 0; i < printable.length; i += perPage) pages.push(printable.slice(i, i + perPage));
  if (!pages.length) pages.push(["No matching transactions."]);

  const objects: string[] = [""];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  const pageIds: number[] = [];
  pages.forEach((pageLines, pageIndex) => {
    const pageId = 5 + pageIndex * 2;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    let stream = "BT\n/F2 16 Tf\n50 798 Td\n";
    stream += `(${pdfEscape("LAND VIEW ENGINEERS & ARCHITECTS")}) Tj\n0 -22 Td\n/F2 12 Tf\n(${pdfEscape(clip(ascii(title), 78))}) Tj\n`;
    stream += "0 -18 Td\n/F1 8.5 Tf\n";
    pageLines.forEach((line, lineIndex) => {
      if (lineIndex) stream += "0 -15 Td\n";
      stream += `(${pdfEscape(clip(line, 118))}) Tj\n`;
    });
    stream += `0 -19 Td\n/F1 7 Tf\n(Page ${pageIndex + 1} of ${pages.length}) Tj\nET`;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}\nendstream`;
  });
  objects[2] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] >>`;

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = new TextEncoder().encode(pdf).length;
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = new TextEncoder().encode(pdf).length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objects.length; i++) pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([pdf], { type: "application/pdf" });
}

export default function AccountsLedgerPage() {
  const [incomeData, setIncomeData] = useState<FinanceSheetData | null>(null);
  const [expenseData, setExpenseData] = useState<FinanceSheetData | null>(null);
  const [mode, setMode] = useState<ViewMode>("dashboard");
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    Promise.all([
      landViewApi.getFinanceSheet("Accounting Income"),
      landViewApi.getFinanceSheet("Accounting Expenses")
    ]).then(([income, expenses]) => {
      if (cancelled) return;
      setIncomeData(income); setExpenseData(expenses);
    }).catch((err: unknown) => {
      if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the accounting ledger.");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [revision]);

  const allRows = useMemo(() => {
    const combined = [...toIncomeRows(incomeData), ...toExpenseRows(expenseData)];
    return combined.sort((a, b) => (parseDate(b.date)?.getTime() || 0) - (parseDate(a.date)?.getTime() || 0));
  }, [incomeData, expenseData]);

  const categories = useMemo(() => [...new Set(allRows.map(row => row.category).filter(Boolean))].sort(), [allRows]);
  const statuses = useMemo(() => [...new Set(allRows.map(row => row.status).filter(Boolean))].sort(), [allRows]);
  const fileIds = useMemo(() => [...new Set(allRows.map(row => row.fileId).filter(Boolean))].sort((a,b) => a.localeCompare(b, undefined, { numeric: true })), [allRows]);

  const filteredRows = useMemo(() => allRows.filter(row => {
    if (mode === "income" && row.type !== "Income") return false;
    if (mode === "expenses" && row.type !== "Expense") return false;
    const query = filters.query.trim().toLowerCase();
    if (query && !row.search.includes(query)) return false;
    if (filters.fileId && row.fileId !== filters.fileId) return false;
    if (filters.category && row.category !== filters.category) return false;
    if (filters.status && row.status !== filters.status) return false;
    const person = filters.person.trim().toLowerCase();
    if (person && ![row.requestedBy,row.approvedBy,row.paidTo,row.receivedFrom,row.receivedBy].join(" ").toLowerCase().includes(person)) return false;
    const key = dateKey(row.date);
    if (filters.from && (!key || key < filters.from)) return false;
    if (filters.to && (!key || key > filters.to)) return false;
    return true;
  }), [allRows, filters, mode]);

  const summary = useMemo(() => {
    const income = filteredRows.filter(row => row.type === "Income").reduce((sum,row) => sum + row.amount, 0);
    const approvedExpenses = filteredRows.filter(row => row.type === "Expense" && row.status.toLowerCase() === "approved").reduce((sum,row) => sum + row.amount, 0);
    const pending = filteredRows.filter(row => row.type === "Expense" && row.status.toLowerCase() === "pending").reduce((sum,row) => sum + row.amount, 0);
    return { income, expense: approvedExpenses, pending, net: income - approvedExpenses };
  }, [filteredRows]);

  const currentMonth = useMemo(() => {
    const now = new Date();
    const prefix = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}`;
    const monthRows = allRows.filter(row => dateKey(row.date).startsWith(prefix));
    const income = monthRows.filter(r=>r.type==="Income").reduce((s,r)=>s+r.amount,0);
    const expense = monthRows.filter(r=>r.type==="Expense"&&r.status.toLowerCase()==="approved").reduce((s,r)=>s+r.amount,0);
    return { income, expense, net: income-expense };
  }, [allRows]);

  const pages = Math.max(1, Math.ceil(filteredRows.length / 50));
  const currentPage = Math.min(page, pages - 1);
  const shown = filteredRows.slice(currentPage * 50, (currentPage + 1) * 50);

  function patchFilter<K extends keyof Filters>(key: K, value: Filters[K]) { setFilters(current => ({ ...current, [key]: value })); setPage(0); }
  function clearFilters() { setFilters(EMPTY_FILTERS); setPage(0); }
  function selectMode(next: ViewMode) { setMode(next); setPage(0); }
  function recallFile(fileId: string) { setMode("reports"); setFilters({ ...EMPTY_FILTERS, fileId }); setPage(0); }

  function reportTitle() {
    if (filters.fileId) return `Project Accounts Statement - ${filters.fileId}`;
    if (mode === "income") return "Income Statement";
    if (mode === "expenses") return "Expense Statement";
    if (filters.category) return `${filters.category} Statement`;
    return "Income & Expense Statement";
  }

  function downloadPdf() {
    const parts = [filters.fileId, filters.category, filters.status, filters.person, filters.from && `from ${filters.from}`, filters.to && `to ${filters.to}`, filters.query && `search: ${filters.query}`].filter(Boolean);
    const blob = buildPdf(reportTitle(), filteredRows, summary, parts.join("; "));
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `LAND-VIEW-${reportTitle().replace(/[^A-Za-z0-9]+/g,"-").replace(/^-|-$/g,"")}.pdf`;
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  return <main className="ledger-page">
    <style>{`
      .ledger-page{color:#eef2f5;max-width:1500px;margin:0 auto}.hero{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:18px}.eyebrow{font-size:10px;letter-spacing:.18em;color:#ef6c66;font-weight:900}.hero h1{font-size:38px;line-height:1;margin:7px 0 8px}.hero p{margin:0;color:#8997a2;max-width:720px;font-size:12px;line-height:1.6}.hero-actions{display:flex;gap:8px;flex-wrap:wrap}.btn,.hero-actions a{border:1px solid #3a4853;background:#151f27;color:#eef2f5;border-radius:8px;padding:10px 13px;font-size:10px;font-weight:900;text-decoration:none;cursor:pointer}.btn.primary{background:#d61f26;border-color:#d61f26}.btn:disabled{opacity:.45;cursor:not-allowed}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}.metric{background:#101820;border:1px solid #2d3943;border-radius:12px;padding:15px}.metric span{display:block;color:#7e8b95;font-size:9px;font-weight:800;letter-spacing:.08em}.metric strong{display:block;margin-top:7px;font-size:22px}.metric small{display:block;color:#687681;margin-top:4px;font-size:9px}.tabs{display:flex;gap:4px;border-bottom:1px solid #29343d;margin:8px 0 14px}.tabs button{border:0;background:transparent;color:#7e8b95;padding:11px 15px;font-size:11px;font-weight:900;cursor:pointer;border-bottom:2px solid transparent}.tabs button.active{color:#fff;border-bottom-color:#d61f26}.filters{display:grid;grid-template-columns:minmax(220px,2fr) repeat(3,minmax(130px,1fr)) minmax(130px,1fr) repeat(2,140px) auto;gap:8px;padding:12px;background:#101820;border:1px solid #29343d;border-radius:11px;margin-bottom:14px}.filters input,.filters select{min-width:0;background:#0b1117;border:1px solid #34414b;color:#eef2f5;border-radius:7px;padding:9px 10px;font-size:10px}.filters input::placeholder{color:#65737e}.panel{background:#101820;border:1px solid #2d3943;border-radius:12px;overflow:hidden}.panel-head{display:flex;justify-content:space-between;gap:14px;align-items:center;padding:14px 15px;border-bottom:1px solid #29343d}.panel-head h2{margin:0;font-size:16px}.panel-head span{color:#71808b;font-size:10px}.table-wrap{overflow:auto}.ledger-table{width:100%;border-collapse:collapse;min-width:1100px}.ledger-table th{position:sticky;top:0;background:#17222b;color:#81909a;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.05em;padding:10px 12px;border-bottom:1px solid #34404a}.ledger-table td{padding:11px 12px;border-bottom:1px solid #253039;font-size:10px;vertical-align:top}.ledger-table tr:hover td{background:#131d25}.desc{font-weight:800;max-width:390px}.sub{display:block;color:#71808b;font-size:9px;margin-top:4px}.type{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:8px;font-weight:900}.type.income{background:#163c2a;color:#8ce3ad}.type.expense{background:#3e2022;color:#ffaaa7}.status{display:inline-flex;padding:4px 7px;border-radius:999px;background:#27343d;color:#b8c2c9;font-size:8px}.file-button{border:0;background:transparent;color:#ef7a72;padding:0;font-size:10px;font-weight:900;cursor:pointer}.amount.income{color:#8ce3ad}.amount.expense{color:#ff9e98}.footer{display:flex;justify-content:space-between;align-items:center;padding:11px 14px;color:#71808b;font-size:9px}.footer div{display:flex;gap:6px}.footer button{background:#17222b;border:1px solid #34414b;color:#dce2e6;border-radius:6px;padding:6px 9px;font-size:9px}.footer button:disabled{opacity:.35}.error{margin-bottom:12px;padding:11px 13px;border:1px solid #74373b;border-radius:8px;background:#351c1e;color:#ffb1ad;font-size:11px}.loading{padding:28px;color:#84919b}.report-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:12px;margin-bottom:14px}.report-box{border:1px solid #2d3943;background:#101820;border-radius:12px;padding:16px}.report-box h3{margin:0 0 6px}.report-box p{margin:0 0 12px;color:#7e8b95;font-size:10px;line-height:1.55}.report-presets{display:flex;gap:7px;flex-wrap:wrap}.report-presets button{background:#17222b;border:1px solid #34414b;color:#e8edf0;border-radius:7px;padding:8px 9px;font-size:9px;cursor:pointer}.month-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.month-stats div{padding:10px;background:#0c1319;border-radius:8px}.month-stats span{display:block;color:#70808b;font-size:8px}.month-stats b{display:block;margin-top:5px;font-size:12px}@media(max-width:1100px){.metrics{grid-template-columns:repeat(2,1fr)}.filters{grid-template-columns:repeat(2,minmax(0,1fr))}.report-grid{grid-template-columns:1fr}}@media(max-width:700px){.hero{align-items:flex-start;flex-direction:column}.hero h1{font-size:31px}.metrics{grid-template-columns:1fr}.filters{grid-template-columns:1fr}.tabs{overflow:auto}.report-grid{grid-template-columns:1fr}}
    `}</style>

    <header className="hero">
      <div><span className="eyebrow">LAND VIEW / ACCOUNTS LEDGER</span><h1>Income & expenses.</h1><p>Recall every payment and expenditure from one place, including the migrated 2026 ledger and new live transactions. Filter by file, date, category or person, then export exactly what you are viewing as a PDF statement.</p></div>
      <div className="hero-actions"><a href={LEDGER_URL} target="_blank" rel="noopener noreferrer">Open database ↗</a><button className="btn" disabled={loading} onClick={()=>setRevision(v=>v+1)}>↻ Refresh</button><button className="btn primary" disabled={loading || !filteredRows.length} onClick={downloadPdf}>Generate PDF</button></div>
    </header>

    {error && <div className="error">{error}</div>}
    <section className="metrics">
      <article className="metric"><span>FILTERED INCOME</span><strong>{money(summary.income)}</strong><small>{filteredRows.filter(r=>r.type==="Income").length} receipts</small></article>
      <article className="metric"><span>APPROVED EXPENSES</span><strong>{money(summary.expense)}</strong><small>{filteredRows.filter(r=>r.type==="Expense"&&r.status.toLowerCase()==="approved").length} records</small></article>
      <article className="metric"><span>NET POSITION</span><strong>{money(summary.net)}</strong><small>Income minus approved expenses</small></article>
      <article className="metric"><span>LEDGER RECORDS</span><strong>{filteredRows.length.toLocaleString("en-BD")}</strong><small>{summary.pending ? `${money(summary.pending)} pending` : `${allRows.length.toLocaleString("en-BD")} total loaded`}</small></article>
    </section>

    <nav className="tabs" aria-label="Accounts ledger sections">
      {(["dashboard","income","expenses","reports"] as ViewMode[]).map(item=><button key={item} className={mode===item?"active":""} onClick={()=>selectMode(item)}>{item==="dashboard"?"Dashboard":item==="income"?"Income":item==="expenses"?"Expenses":"Reports & PDF"}</button>)}
    </nav>

    <section className="filters" aria-label="Recall and filter transactions">
      <input type="search" value={filters.query} placeholder="Recall transaction, ID, description…" onChange={e=>patchFilter("query",e.target.value)} />
      <select value={filters.fileId} onChange={e=>patchFilter("fileId",e.target.value)}><option value="">All file IDs</option>{fileIds.map(id=><option key={id}>{id}</option>)}</select>
      <select value={filters.category} onChange={e=>patchFilter("category",e.target.value)}><option value="">All categories</option>{categories.map(value=><option key={value}>{value}</option>)}</select>
      <select value={filters.status} onChange={e=>patchFilter("status",e.target.value)}><option value="">All statuses</option>{statuses.map(value=><option key={value}>{value}</option>)}</select>
      <input value={filters.person} placeholder="Person / employee…" onChange={e=>patchFilter("person",e.target.value)} />
      <input type="date" value={filters.from} aria-label="From date" onChange={e=>patchFilter("from",e.target.value)} />
      <input type="date" value={filters.to} aria-label="To date" onChange={e=>patchFilter("to",e.target.value)} />
      <button className="btn" onClick={clearFilters}>Clear</button>
    </section>

    {mode === "reports" && <section className="report-grid">
      <article className="report-box"><h3>Report builder</h3><p>The PDF uses the active filters above. Choose a preset, refine the result, then generate the branded statement.</p><div className="report-presets"><button onClick={()=>{setFilters(EMPTY_FILTERS);setPage(0)}}>Full ledger</button><button onClick={()=>{setFilters({...EMPTY_FILTERS,category:"Salary / Wages"});setPage(0)}}>Salary & wages</button><button onClick={()=>{setFilters({...EMPTY_FILTERS,category:"Staff Commission / Bonus"});setPage(0)}}>Staff commission</button><button onClick={()=>{setFilters({...EMPTY_FILTERS,category:"Municipality / Approval Cost"});setPage(0)}}>Approval costs</button><button onClick={()=>{const now=new Date();setFilters({...EMPTY_FILTERS,from:`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-01`,to:dateKey(now)});setPage(0)}}>This month</button></div></article>
      <article className="report-box"><h3>Current month</h3><p>Quick operational snapshot from the complete ledger.</p><div className="month-stats"><div><span>INCOME</span><b>{money(currentMonth.income)}</b></div><div><span>EXPENSE</span><b>{money(currentMonth.expense)}</b></div><div><span>NET</span><b>{money(currentMonth.net)}</b></div></div></article>
    </section>}

    <section className="panel">
      <div className="panel-head"><div><h2>{mode==="income"?"Income register":mode==="expenses"?"Expense register":mode==="reports"?reportTitle():"Recent ledger activity"}</h2><span>{filteredRows.length.toLocaleString("en-BD")} matching transactions</span></div>{filters.fileId&&<span>Project recall: <b style={{color:"#ef7a72"}}>{filters.fileId}</b></span>}</div>
      {loading ? <div className="loading">Loading income and expense database…</div> : <div className="table-wrap"><table className="ledger-table"><thead><tr><th>Date</th><th>Type</th><th>File</th><th>Transaction</th><th>Category</th><th>Amount</th><th>Status</th><th>Person / source</th><th>Reference</th></tr></thead><tbody>{shown.map(row=><tr key={`${row.type}-${row.id}`}><td>{displayDate(row.date)}<span className="sub">{row.id}</span></td><td><span className={`type ${row.type.toLowerCase()}`}>{row.type}</span></td><td>{row.fileId?<button className="file-button" onClick={()=>recallFile(row.fileId)}>{row.fileId}</button>:"—"}<span className="sub">{row.projectName}</span></td><td><div className="desc">{row.description}</div><span className="sub">{row.clientName}</span></td><td>{row.category}</td><td><b className={`amount ${row.type.toLowerCase()}`}>{money(row.amount)}</b><span className="sub">{row.paymentMethod}</span></td><td><span className="status">{row.status}</span></td><td>{row.type==="Income"?(row.receivedFrom||row.receivedBy||"Not recorded"):(row.paidTo||row.requestedBy||"Not recorded")}<span className="sub">{row.type==="Expense"&&row.approvedBy?`Approved: ${row.approvedBy}`:row.source}</span></td><td>{row.reference||"—"}</td></tr>)}</tbody></table>{!shown.length&&<div className="loading">No transactions match the current filters.</div>}</div>}
      <footer className="footer"><span>Page {currentPage+1} of {pages}</span><div><button disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Previous</button><button disabled={currentPage+1>=pages} onClick={()=>setPage(currentPage+1)}>Next</button></div></footer>
    </section>
  </main>;
}
