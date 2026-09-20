"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";

type PeriodMode = "month" | "year" | "range";
type LedgerRow = {
  id: string;
  date: string;
  type: string;
  projectId: string;
  category: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  account: string;
  method: string;
  reference: string;
  sourceType: string;
  status: string;
};

const LIVE_LEDGER_START = "2026-09-01";
const DHAKA_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Dhaka",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
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

function num(value: unknown) {
  const parsed = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
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
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : dhakaDateKey(parsed);
}

function displayDate(value: string) {
  const key = dateKey(value);
  const [year, month, day] = key.split("-").map(Number);
  if (!year || !month || !day) return value || "—";
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function money(value: number) {
  return new Intl.NumberFormat("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
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

function endOfMonth(monthKey: string) {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthKey;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = new Date(year, month, 0).getDate();
  return `${match[1]}-${match[2]}-${String(day).padStart(2, "0")}`;
}

function periodLabel(start: string, end: string, mode: PeriodMode) {
  if (mode === "month") {
    const [year, month] = start.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  }
  if (mode === "year") return start.slice(0, 4);
  return `${displayDate(start)} to ${displayDate(end)}`;
}

function safeFileName(value: string) {
  return value.replace(/[^A-Za-z0-9._ -]+/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-") || "LAND-VIEW-Ledger";
}

function csvCell(value: unknown) {
  const raw = String(value ?? "");
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

export default function LedgerExportPage() {
  const today = dhakaDateKey(new Date());
  const currentMonth = today.slice(0, 7);
  const currentYear = today.slice(0, 4);

  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<PeriodMode>("month");
  const [month, setMonth] = useState(currentMonth);
  const [year, setYear] = useState(currentYear);
  const [from, setFrom] = useState(`${currentYear}-01-01`);
  const [to, setTo] = useState(today);
  const [applied, setApplied] = useState({ mode: "month" as PeriodMode, month: currentMonth, year: currentYear, from: `${currentYear}-01-01`, to: today });
  const [validationError, setValidationError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    landViewApi.getFinanceSheet("Transactions")
      .then((sheet) => {
        if (active) setRecords(financeSheetToRecords(sheet));
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Could not load ledger transactions.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const allRows = useMemo<LedgerRow[]>(() => {
    const normalized = records.map((record) => {
      const id = text(field(record, ["Transaction_ID", "Transaction ID", "TransactionId"]));
      const date = dateKey(field(record, ["Transaction_Date", "Transaction Date", "Date"]));
      const transactionType = normalizeStatus(field(record, ["Transaction_Type", "Transaction Type", "Type"]));
      const direction = text(field(record, ["Direction"])).toUpperCase();
      const status = text(field(record, ["Status"])) || "Posted";
      const fallbackAmount = num(field(record, ["Amount"]));
      let debit = num(field(record, ["Debit"]));
      let credit = num(field(record, ["Credit"]));
      if (!debit && !credit && fallbackAmount > 0) {
        if (direction === "DEBIT" || transactionType === "expense") debit = fallbackAmount;
        if (direction === "CREDIT" || transactionType === "income") credit = fallbackAmount;
      }
      return {
        id,
        date,
        type: transactionType,
        projectId: text(field(record, ["Project_ID", "Project ID", "ProjectId"])),
        category: text(field(record, ["Category"])) || "Uncategorized",
        description: text(field(record, ["Description", "Particulars"])) || "Transaction",
        debit,
        credit,
        account: text(field(record, ["Account", "Account_Name", "Account Name"])),
        method: text(field(record, ["Payment_Method", "Payment Method", "Method"])),
        reference: text(field(record, ["Reference_No", "Reference No", "Reference"])),
        sourceType: text(field(record, ["Source_Type", "Source Type"])),
        status,
        isHistory: id.startsWith("TXN-LEDGER-2025-") || id.startsWith("TXN-HIST-2026-"),
      };
    }).filter((row) => {
      if (!row.id || !row.date || (!row.debit && !row.credit)) return false;
      if (row.isHistory) return true;
      if (normalizeStatus(row.status) !== "posted") return false;
      if (row.type === "transfer") return false;
      return row.date >= LIVE_LEDGER_START;
    }).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

    let balance = 0;
    return normalized.map((row) => {
      balance += row.credit - row.debit;
      return {
        id: row.id,
        date: row.date,
        type: row.type,
        projectId: row.projectId,
        category: row.category,
        description: row.description,
        debit: row.debit,
        credit: row.credit,
        balance,
        account: row.account,
        method: row.method,
        reference: row.reference,
        sourceType: row.sourceType,
        status: row.status,
      };
    });
  }, [records]);

  const range = useMemo(() => {
    if (applied.mode === "month") return { start: `${applied.month}-01`, end: endOfMonth(applied.month) };
    if (applied.mode === "year") return { start: `${applied.year}-01-01`, end: `${applied.year}-12-31` };
    return { start: applied.from, end: applied.to };
  }, [applied]);

  const selectedRows = useMemo(
    () => allRows.filter((row) => row.date >= range.start && row.date <= range.end),
    [allRows, range],
  );

  const openingBalance = useMemo(() => {
    const before = allRows.filter((row) => row.date < range.start);
    return before.length ? before[before.length - 1].balance : 0;
  }, [allRows, range.start]);

  const totalIncome = selectedRows.reduce((sum, row) => sum + row.credit, 0);
  const totalExpense = selectedRows.reduce((sum, row) => sum + row.debit, 0);
  const netMovement = totalIncome - totalExpense;
  const closingBalance = selectedRows.length ? selectedRows[selectedRows.length - 1].balance : openingBalance;
  const label = periodLabel(range.start, range.end, applied.mode);
  const generatedOn = displayDate(today);

  function generate() {
    setValidationError("");
    if (mode === "month" && !/^\d{4}-\d{2}$/.test(month)) return setValidationError("Choose a valid month.");
    if (mode === "year" && !/^\d{4}$/.test(year)) return setValidationError("Enter a valid year.");
    if (mode === "range") {
      if (!from || !to) return setValidationError("Choose both From and To dates.");
      if (from > to) return setValidationError("From date cannot be after To date.");
    }
    setApplied({ mode, month, year, from, to });
  }

  function printPdf() {
    const previousTitle = document.title;
    document.title = safeFileName(`LAND-VIEW-Ledger-${label}`);
    const restore = () => {
      document.title = previousTitle;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore, { once: true });
    window.setTimeout(restore, 60000);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.print()));
  }

  function downloadCsv() {
    const header = ["Date","Transaction ID","Project ID","Category","Details","Account","Reference","Expense (Debit)","Income (Credit)","Running Balance"];
    const body = selectedRows.map((row) => [
      row.date,row.id,row.projectId,row.category,row.description,row.account || row.method,row.reference,
      row.debit ? row.debit.toFixed(2) : "",row.credit ? row.credit.toFixed(2) : "",row.balance.toFixed(2),
    ]);
    body.unshift([range.start,"OPENING BALANCE","","","Previous balance","","","","",openingBalance.toFixed(2)]);
    const csv = [header, ...body].map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${safeFileName(`LAND-VIEW-Ledger-${label}`)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="ledger-export-page">
      <style>{`
        .ledger-export-page{color:#eef2f5;padding-bottom:50px}.export-top{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:18px}.export-top a{color:#e9b620;text-decoration:none;font-size:11px;font-weight:800}.export-top h1{margin:8px 0 5px;font-size:34px;letter-spacing:-.03em}.export-top p{margin:0;color:#8b99a2;font-size:11px}.export-actions{display:flex;gap:8px;flex-wrap:wrap}.export-btn{border:1px solid #3a4751;border-radius:8px;background:#121b22;color:#edf2f5;padding:10px 14px;font-size:10px;font-weight:900;cursor:pointer}.export-btn.primary{background:#c83d3f;border-color:#d24a4c;color:#fff}.export-btn.gold{background:#e9b620;border-color:#e9b620;color:#081116}.export-btn:disabled{opacity:.55;cursor:not-allowed}.export-builder{display:grid;grid-template-columns:150px repeat(2,minmax(180px,1fr)) auto;gap:10px;align-items:end;padding:15px;border:1px solid #2d3a44;border-radius:12px;background:#101820;margin-bottom:16px}.export-builder label{display:grid;gap:6px;color:#8d9aa3;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.07em}.export-builder input,.export-builder select{height:38px;border:1px solid #384650;border-radius:7px;background:#091117;color:#edf2f5;padding:0 10px;font-size:10px}.builder-range{display:grid;grid-template-columns:1fr 1fr;gap:10px}.export-alert{margin-bottom:14px;padding:10px 12px;border:1px solid #6b373a;border-radius:8px;background:#321b1e;color:#ffaaa5;font-size:10px}.ledger-export-report{border:1px solid #303d47;border-radius:14px;background:#0f171d;overflow:hidden}.report-screen-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:17px 18px;border-bottom:1px solid #293640;background:#111b22}.report-screen-head h2{margin:3px 0 0;font-size:23px}.report-screen-head small{color:#e26762;font-size:9px;font-weight:900;letter-spacing:.12em}.report-screen-head p{margin:6px 0 0;color:#82909a;font-size:10px}.report-screen-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;padding:12px;background:#0b1318;border-bottom:1px solid #293640}.report-stat{padding:12px;border:1px solid #2b3943;border-radius:9px;background:#111a21}.report-stat span{display:block;color:#82909a;font-size:8px;text-transform:uppercase;letter-spacing:.08em}.report-stat strong{display:block;margin-top:7px;font-size:16px;font-variant-numeric:tabular-nums}.positive{color:#91e2ae}.negative{color:#ff958f}.export-table-wrap{overflow:auto}.export-table{width:100%;min-width:980px;border-collapse:collapse}.export-table th,.export-table td{padding:10px 11px;border-bottom:1px solid #26323b;text-align:left;font-size:9px;vertical-align:top}.export-table th{background:#111a21;color:#8b98a1;font-size:8px;text-transform:uppercase;letter-spacing:.06em;position:sticky;top:0}.export-table .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.export-table .tx{display:block;font-weight:800;color:#e4eaed;overflow-wrap:anywhere}.export-table .project-tag{display:inline-block;margin-top:4px;padding:2px 6px;border:1px solid #3b4852;border-radius:999px;color:#b9c3c9;font-size:8px;font-weight:800}.export-table .detail-main{display:block;color:#e3e9ec;font-weight:800}.export-table .sub{display:block;color:#74818a;font-size:8px;margin-top:3px;line-height:1.35}.opening-line{background:#182229}.opening-line td{font-weight:800}.print-only{display:none}.empty-report{text-align:center;padding:34px;color:#7c8992;font-size:10px}@media(max-width:900px){.export-top{flex-direction:column}.export-builder{grid-template-columns:1fr}.builder-range{grid-template-columns:1fr}.report-screen-stats{grid-template-columns:1fr 1fr}}@media(max-width:600px){.report-screen-stats{grid-template-columns:1fr}.export-actions{width:100%}.export-btn{flex:1}}
        @media print{
          @page{size:A4 portrait;margin:9mm 8mm 20mm}
          html,body{margin:0!important;padding:0!important;background:#fff!important;color:#111!important;width:auto!important}
          body *{visibility:hidden!important}
          .ledger-export-report,.ledger-export-report *{visibility:visible!important}
          .ledger-export-report{position:absolute!important;left:0!important;top:0!important;width:100%!important;border:0!important;border-radius:0!important;background:#fff!important;color:#111!important;overflow:visible!important}
          .report-screen-head,.report-screen-stats{display:none!important}
          .print-only{display:block!important}
          .print-ledger-header{border-bottom:.7mm solid #d61f26!important;padding:0 0 3.8mm!important;margin:0 0 3.8mm!important}
          .print-brand-row{display:grid!important;grid-template-columns:1.05fr 1.15fr .95fr!important;gap:4.5mm!important;align-items:start!important}
          .print-brand{display:flex!important;align-items:center!important;gap:2.6mm!important;min-width:0!important}
          .print-brand img{display:block!important;width:15mm!important;height:15mm!important;object-fit:contain!important;flex:0 0 15mm!important}
          .print-brand strong{display:block!important;font-size:15pt!important;line-height:.95!important;letter-spacing:-.4px!important;color:#111!important;white-space:nowrap!important}
          .print-brand strong span{color:#d61f26!important}
          .print-brand small{display:block!important;margin-top:1.2mm!important;font-size:5.8pt!important;letter-spacing:.75px!important;color:#666!important;white-space:nowrap!important}
          .print-contact{font-size:6.4pt!important;line-height:1.45!important;color:#333!important;padding-top:.8mm!important}
          .print-contact strong{display:block!important;font-size:6.7pt!important;color:#111!important;margin-bottom:.4mm!important}
          .print-title{text-align:right!important;min-width:0!important}
          .print-title small{display:block!important;font-size:5.9pt!important;color:#666!important;line-height:1.35!important}
          .print-title b{display:block!important;margin-top:1.1mm!important;font-size:10.5pt!important;color:#d61f26!important;line-height:1.05!important}
          .print-title strong{display:block!important;margin-top:1.2mm!important;font-size:12pt!important;color:#111!important;line-height:1.05!important}
          .print-summary{display:grid!important;grid-template-columns:1fr 1fr!important;border:.35mm solid #cfd5d9!important;margin:0 0 3.8mm!important;background:#fff!important}
          .print-summary div{min-height:14mm!important;padding:2.5mm 3mm!important;border-right:.3mm solid #cfd5d9!important;border-bottom:.3mm solid #cfd5d9!important;display:flex!important;flex-direction:column!important;justify-content:center!important;box-sizing:border-box!important}
          .print-summary div:nth-child(2n){border-right:0!important}
          .print-summary div:nth-last-child(-n+2){border-bottom:0!important}
          .print-summary span{display:block!important;font-size:6.5pt!important;color:#555!important;text-transform:uppercase!important;letter-spacing:.35px!important}
          .print-summary strong{display:block!important;margin-top:1.2mm!important;font-size:10.2pt!important;color:#111!important;font-variant-numeric:tabular-nums!important}
          .print-summary .closing{background:#d61f26!important}
          .print-summary .closing span,.print-summary .closing strong{color:#fff!important}
          .export-table-wrap{overflow:visible!important}
          .export-table{width:100%!important;min-width:0!important;border-collapse:collapse!important;table-layout:fixed!important}
          .export-table thead{display:table-header-group!important}
          .export-table th{position:static!important;background:#34393d!important;color:#fff!important;font-size:6.5pt!important;padding:1.75mm 1.35mm!important;border:.25mm solid #34393d!important;line-height:1.05!important;vertical-align:middle!important}
          .export-table td{font-size:6.55pt!important;color:#111!important;background:#fff!important;padding:1.55mm 1.35mm!important;border:.25mm solid #cfd5d9!important;line-height:1.18!important;vertical-align:top!important;overflow-wrap:break-word!important;word-break:normal!important}
          .export-table tr{break-inside:avoid!important;page-break-inside:avoid!important}
          .export-table th:nth-child(1),.export-table td:nth-child(1){width:12%!important}
          .export-table th:nth-child(2),.export-table td:nth-child(2){width:19%!important}
          .export-table th:nth-child(3),.export-table td:nth-child(3){width:35%!important}
          .export-table th:nth-child(4),.export-table td:nth-child(4){width:11%!important}
          .export-table th:nth-child(5),.export-table td:nth-child(5){width:11%!important}
          .export-table th:nth-child(6),.export-table td:nth-child(6){width:12%!important}
          .export-table .num{text-align:right!important;white-space:nowrap!important;font-variant-numeric:tabular-nums!important}
          .export-table .tx{display:block!important;font-size:6.15pt!important;font-weight:800!important;color:#111!important;overflow-wrap:anywhere!important;line-height:1.12!important}
          .export-table .project-tag{display:inline-block!important;margin-top:.7mm!important;padding:.45mm 1mm!important;border:.25mm solid #c9cfd3!important;border-radius:2mm!important;font-size:5.7pt!important;font-weight:800!important;color:#333!important;background:#f5f6f7!important}
          .export-table .detail-main{display:block!important;font-size:6.7pt!important;font-weight:700!important;color:#111!important;line-height:1.17!important}
          .export-table .sub{display:block!important;font-size:5.65pt!important;line-height:1.18!important;color:#555!important;margin-top:.6mm!important}
          .opening-line td{background:#f1f3f4!important;font-weight:800!important;vertical-align:middle!important}
          .opening-line .detail-main{font-weight:800!important}
          .print-ledger-footer{position:static!important;left:auto!important;right:auto!important;bottom:auto!important;min-height:7mm!important;margin-top:4mm!important;border-top:.45mm solid #d61f26!important;padding:1.8mm .8mm 0!important;display:flex!important;align-items:flex-start!important;justify-content:space-between!important;gap:5mm!important;font-size:6pt!important;line-height:1.25!important;color:#555!important;background:#fff!important;box-sizing:border-box!important;break-inside:avoid!important;page-break-inside:avoid!important}
          .print-ledger-footer strong{color:#111!important;font-weight:800!important}
          .empty-report{color:#444!important}
          *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
        }
      `}</style>

      <header className="export-top">
        <div>
          <Link href="/admin/accounts">← Accounts</Link>
          <h1>Ledger Export</h1>
          <p>Generate a branded ledger statement by month, full year, or any selected date range.</p>
        </div>
        <div className="export-actions">
          <button className="export-btn" type="button" disabled={loading || !selectedRows.length} onClick={downloadCsv}>Download CSV</button>
          <button className="export-btn gold" type="button" disabled={loading} onClick={printPdf}>Print / Save PDF</button>
        </div>
      </header>

      <section className="export-builder">
        <label>Period type
          <select value={mode} onChange={(event) => setMode(event.target.value as PeriodMode)}>
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
            <option value="range">Selected range</option>
          </select>
        </label>

        {mode === "month" && <label>Month<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>}
        {mode === "year" && <label>Year<input type="number" min="2025" max="2100" value={year} onChange={(event) => setYear(event.target.value.replace(/\D/g, "").slice(0, 4))} /></label>}
        {mode === "range" && <div className="builder-range">
          <label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        </div>}

        <div />
        <button className="export-btn primary" type="button" onClick={generate}>Generate Ledger</button>
      </section>

      {(error || validationError) && <div className="export-alert">{validationError || error}</div>}

      <section className="ledger-export-report">
        <div className="report-screen-head">
          <div>
            <small>LAND VIEW / LEDGER STATEMENT</small>
            <h2>{label}</h2>
            <p>{displayDate(range.start)} - {displayDate(range.end)} · {selectedRows.length} transaction{selectedRows.length === 1 ? "" : "s"}</p>
          </div>
          <div style={{ textAlign: "right", color: "#81909a", fontSize: 10 }}>Generated {generatedOn}</div>
        </div>

        <div className="report-screen-stats">
          <div className="report-stat"><span>Opening Balance</span><strong className={openingBalance < 0 ? "negative" : "positive"}>BDT {money(openingBalance)}</strong></div>
          <div className="report-stat"><span>Total Income</span><strong className="positive">BDT {money(totalIncome)}</strong></div>
          <div className="report-stat"><span>Total Expense</span><strong className="negative">BDT {money(totalExpense)}</strong></div>
          <div className="report-stat"><span>Closing Balance</span><strong className={closingBalance < 0 ? "negative" : "positive"}>BDT {money(closingBalance)}</strong></div>
        </div>

        <div className="print-only print-ledger-header">
          <div className="print-brand-row">
            <div className="print-brand">
              <img src="/land-view-logo.svg" alt="LAND VIEW logo" />
              <div><strong>LAND <span>VIEW</span></strong><small>ENGINEERS AND ARCHITECTS</small></div>
            </div>
            <div className="print-contact">
              <strong>F. Rahman AC Market (2nd Floor)</strong><br />
              SSK Road, Feni Sadar, Feni<br />
              +88 0140 80 80 400 · +88 01902 500 400
            </div>
            <div className="print-title">
              <small>Generated {generatedOn}</small>
              <b>Financial Ledger Statement</b>
              <strong>{label}</strong>
              <small>{displayDate(range.start)} — {displayDate(range.end)}</small>
            </div>
          </div>
        </div>

        <div className="print-only print-summary">
          <div><span>Opening Balance</span><strong>BDT {money(openingBalance)}</strong></div>
          <div><span>Total Income</span><strong>BDT {money(totalIncome)}</strong></div>
          <div><span>Total Expense</span><strong>BDT {money(totalExpense)}</strong></div>
          <div className="closing"><span>Closing Balance</span><strong>BDT {money(closingBalance)}</strong></div>
        </div>

        {loading ? <div className="empty-report">Loading ledger…</div> : selectedRows.length === 0 ? <div className="empty-report">No ledger transactions found for this period.</div> : (
          <div className="export-table-wrap">
            <table className="export-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Transaction / Project</th>
                  <th>Details</th>
                  <th className="num">Expense</th>
                  <th className="num">Income</th>
                  <th className="num">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="opening-line">
                  <td>{displayDate(range.start)}</td>
                  <td><span className="tx">OPENING</span></td>
                  <td><span className="detail-main">Opening Balance</span><span className="sub">Balance brought forward before selected period</span></td>
                  <td className="num">—</td>
                  <td className="num">—</td>
                  <td className="num">{money(openingBalance)}</td>
                </tr>
                {selectedRows.map((row) => <tr key={row.id}>
                  <td>{displayDate(row.date)}</td>
                  <td>
                    <span className="tx">{row.id}</span>
                    {row.projectId ? <span className="project-tag">{row.projectId}</span> : <span className="sub">{row.sourceType || row.type}</span>}
                  </td>
                  <td>
                    <span className="detail-main">{row.description}</span>
                    <span className="sub">{row.category}</span>
                    <span className="sub">{[row.account || row.method, row.reference].filter(Boolean).join(" · ") || "—"}</span>
                  </td>
                  <td className="num">{row.debit ? money(row.debit) : "—"}</td>
                  <td className="num">{row.credit ? money(row.credit) : "—"}</td>
                  <td className="num">{money(row.balance)}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}

        <div className="print-only print-ledger-footer">
          <span><strong>LAND VIEW Engineers and Architects</strong> · Financial Ledger</span>
          <span>{selectedRows.length} transactions · Net movement BDT {money(netMovement)}</span>
        </div>
      </section>
    </div>
  );
}
