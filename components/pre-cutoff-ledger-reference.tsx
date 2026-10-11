"use client";

import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";
import { MAIN_LEDGER_COUNT_START, ledgerDateKey } from "@/lib/ledger-policy";

type ReferenceRow = {
  id: string;
  date: string;
  projectId: string;
  category: string;
  description: string;
  debit: number;
  credit: number;
  account: string;
  method: string;
  reference: string;
  sourceType: string;
  status: string;
  search: string;
};

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
  const parsed = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeStatus(value: unknown) {
  return text(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function normalizeProjectCode(value: unknown) {
  const raw = text(value).toUpperCase();
  const match = raw.match(/^(?:LV[\s_-]*)?0*(\d+)$/i);
  return match ? `LV-${String(Number(match[1])).padStart(3, "0")}` : raw;
}

function displayDate(value: string) {
  const key = ledgerDateKey(value);
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
    style: "currency",
    currency: "BDT",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function csvCell(value: unknown) {
  const raw = String(value ?? "");
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
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

export default function PreCutoffLedgerReference() {
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    landViewApi.getFinanceSheet("Transactions")
      .then((sheet) => {
        if (active) setRecords(financeSheetToRecords(sheet));
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Could not load historical reference entries.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const rows = useMemo<ReferenceRow[]>(() => records
    .map((record) => {
      const id = text(field(record, ["Transaction_ID", "Transaction ID", "TransactionId"]));
      const date = ledgerDateKey(field(record, ["Transaction_Date", "Transaction Date", "Date"]));
      const projectId = normalizeProjectCode(field(record, ["Project_ID", "Project ID", "ProjectId"]));
      const category = text(field(record, ["Category"])) || "Uncategorized";
      const description = text(field(record, ["Description", "Particulars"])) || category;
      const direction = text(field(record, ["Direction"])).toUpperCase();
      const transactionType = normalizeStatus(field(record, ["Transaction_Type", "Transaction Type", "Type"]));
      const fallbackAmount = amount(field(record, ["Amount"]));
      let debit = amount(field(record, ["Debit"]));
      let credit = amount(field(record, ["Credit"]));
      if (!debit && !credit && fallbackAmount > 0) {
        if (direction === "DEBIT" || transactionType === "expense") debit = fallbackAmount;
        if (direction === "CREDIT" || transactionType === "income") credit = fallbackAmount;
      }
      const account = text(field(record, ["Account", "Account_Name", "Account Name"]));
      const method = text(field(record, ["Payment_Method", "Payment Method", "Method"]));
      const reference = text(field(record, ["Reference_No", "Reference No", "Reference"]));
      const sourceType = text(field(record, ["Source_Type", "Source Type"]));
      const status = text(field(record, ["Status"])) || "Posted";
      return {
        id,
        date,
        projectId,
        category,
        description,
        debit,
        credit,
        account,
        method,
        reference,
        sourceType,
        status,
        search: [id, date, projectId, category, description, account, method, reference, sourceType, status].join(" ").toLowerCase(),
      };
    })
    .filter((row) => Boolean(row.id && row.date && row.date < MAIN_LEDGER_COUNT_START))
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: "base" })), [records]);

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? rows.filter((row) => row.search.includes(term)) : rows;
  }, [query, rows]);

  const totalDebit = rows.reduce((sum, row) => sum + row.debit, 0);
  const totalCredit = rows.reduce((sum, row) => sum + row.credit, 0);

  function downloadCsv() {
    const header = ["Date", "Transaction ID", "File ID", "Category", "Description", "Account", "Method", "Reference", "Expense Debit", "Income Credit", "Ledger Impact", "Status"];
    const body = filteredRows.map((row) => [
      row.date,
      row.id,
      row.projectId,
      row.category,
      row.description,
      row.account,
      row.method,
      row.reference,
      row.debit ? row.debit.toFixed(2) : "",
      row.credit ? row.credit.toFixed(2) : "",
      "REFERENCE ONLY - EXCLUDED FROM LEDGER BALANCE",
      row.status,
    ]);
    const csv = [header, ...body].map((line) => line.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `LAND-VIEW-Reference-Ledger-before-${MAIN_LEDGER_COUNT_START}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function printReference() {
    document.body.classList.add("print-ledger-reference");
    const cleanup = () => {
      document.body.classList.remove("print-ledger-reference");
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(cleanup, 60000);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.print()));
  }

  return (
    <section className="precutoff-reference" aria-label="Pre-cutoff ledger reference">
      <style>{`
        .precutoff-reference{margin:18px 0 30px;border:1px solid var(--lv-border-default,#d7dde2);border-radius:14px;background:var(--lv-surface-panel,#fff);color:var(--lv-text-primary,#17212b);overflow:hidden;box-shadow:var(--lv-shadow-sm,0 4px 18px rgba(0,0,0,.05))}
        .precutoff-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:16px 18px;border-bottom:1px solid var(--lv-border-default,#d7dde2);background:var(--lv-surface-muted,#f7f9fa)}
        .precutoff-kicker{display:block;font-size:9px;font-weight:900;letter-spacing:.11em;color:var(--lv-danger,#b42318);text-transform:uppercase}
        .precutoff-head h2{margin:4px 0 5px;font-size:21px;line-height:1.1;color:var(--lv-text-strong,#111827)}
        .precutoff-head p{margin:0;max-width:780px;color:var(--lv-text-secondary,#5f6b76);font-size:10px;line-height:1.5}
        .precutoff-actions{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}
        .precutoff-btn{border:1px solid var(--lv-border-strong,#b9c2ca);border-radius:8px;background:var(--lv-surface-panel,#fff);color:var(--lv-text-primary,#17212b);padding:8px 10px;font-size:9px;font-weight:900;cursor:pointer;white-space:nowrap}
        .precutoff-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;padding:10px 12px;border-bottom:1px solid var(--lv-border-default,#d7dde2)}
        .precutoff-metric{padding:10px 12px;border:1px solid var(--lv-border-default,#d7dde2);border-radius:9px;background:var(--lv-surface-muted,#f7f9fa)}
        .precutoff-metric span{display:block;color:var(--lv-text-muted,#7b8791);font-size:8px;text-transform:uppercase;letter-spacing:.07em;font-weight:900}
        .precutoff-metric strong{display:block;margin-top:5px;color:var(--lv-text-strong,#111827);font-size:15px;font-variant-numeric:tabular-nums}
        .precutoff-tools{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;border-bottom:1px solid var(--lv-border-default,#d7dde2)}
        .precutoff-tools small{color:var(--lv-text-secondary,#5f6b76);font-size:9px}
        .precutoff-search{width:min(320px,48vw);border:1px solid var(--lv-border-default,#d7dde2);border-radius:7px;background:var(--lv-surface-panel,#fff);color:var(--lv-text-primary,#17212b);padding:8px 10px;font-size:9px}
        .precutoff-table-wrap{overflow:auto;max-height:520px}
        .precutoff-table{width:100%;min-width:1050px;border-collapse:collapse}
        .precutoff-table th,.precutoff-table td{padding:9px 10px;border-bottom:1px solid var(--lv-border-default,#e3e7ea);text-align:left;vertical-align:top;font-size:9px}
        .precutoff-table th{position:sticky;top:0;z-index:2;background:var(--lv-surface-muted,#f4f6f8);color:var(--lv-text-muted,#6d7780);font-size:8px;text-transform:uppercase;letter-spacing:.06em}
        .precutoff-table .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
        .precutoff-table .tx{font-weight:800;color:var(--lv-text-strong,#111827);overflow-wrap:anywhere}
        .precutoff-table .sub{display:block;margin-top:3px;color:var(--lv-text-muted,#7b8791);font-size:8px;line-height:1.35}
        .reference-chip{display:inline-flex;padding:4px 7px;border:1px solid #d7a82f;border-radius:999px;background:#fff8df;color:#735a0b;font-size:7px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}
        .precutoff-empty{padding:26px;text-align:center;color:var(--lv-text-muted,#7b8791);font-size:10px}
        @media(max-width:760px){.precutoff-head{flex-direction:column}.precutoff-actions{justify-content:flex-start}.precutoff-metrics{grid-template-columns:1fr}.precutoff-tools{align-items:flex-start;flex-direction:column}.precutoff-search{width:100%;max-width:none}}
        @media print{
          body.print-ledger-reference *{visibility:hidden!important}
          body.print-ledger-reference .ledger-export-report{display:none!important}
          body.print-ledger-reference .precutoff-reference,body.print-ledger-reference .precutoff-reference *{visibility:visible!important}
          body.print-ledger-reference .precutoff-reference{position:absolute!important;left:0!important;top:0!important;width:100%!important;margin:0!important;border:0!important;border-radius:0!important;box-shadow:none!important;background:#fff!important;color:#111!important;overflow:visible!important}
          body.print-ledger-reference .precutoff-actions,body.print-ledger-reference .precutoff-tools{display:none!important}
          body.print-ledger-reference .precutoff-table-wrap{max-height:none!important;overflow:visible!important}
          body.print-ledger-reference .precutoff-table{min-width:0!important;table-layout:fixed!important}
          body.print-ledger-reference .precutoff-table th,body.print-ledger-reference .precutoff-table td{font-size:6.5pt!important;padding:1.5mm!important;color:#111!important;background:#fff!important;border:.25mm solid #cfd5d9!important}
          body.print-ledger-reference .precutoff-table th{background:#34393d!important;color:#fff!important;position:static!important}
          body.print-ledger-reference .precutoff-head{background:#fff!important;border-bottom:.6mm solid #d61f26!important;padding:0 0 3mm!important;margin-bottom:3mm!important}
          body.print-ledger-reference .precutoff-head h2{font-size:15pt!important;color:#111!important}
          body.print-ledger-reference .precutoff-head p{font-size:7pt!important;color:#444!important}
          body.print-ledger-reference .precutoff-metrics{grid-template-columns:repeat(3,1fr)!important;padding:0 0 3mm!important;border-bottom:0!important}
          body.print-ledger-reference .precutoff-metric{background:#fff!important;border:.3mm solid #cfd5d9!important}
          body.print-ledger-reference .precutoff-metric strong{color:#111!important}
        }
      `}</style>

      <div className="precutoff-head">
        <div>
          <small className="precutoff-kicker">Historical reference · zero ledger impact</small>
          <h2>Reference Ledger — before 26 Dec 2024</h2>
          <p>Every transaction dated before 26 Dec 2024 is shown here with its original amount, File ID and reference so project finances can be cross-verified. These rows are <strong>not included</strong> in the Accounts Ledger running balance, income/expense totals or current balance. 26 Dec 2024 is the first counted ledger date.</p>
        </div>
        <div className="precutoff-actions">
          <button type="button" className="precutoff-btn" disabled={loading || filteredRows.length === 0} onClick={downloadCsv}>Download reference CSV</button>
          <button type="button" className="precutoff-btn" disabled={loading || filteredRows.length === 0} onClick={printReference}>Print reference</button>
        </div>
      </div>

      <div className="precutoff-metrics">
        <div className="precutoff-metric"><span>Reference entries</span><strong>{rows.length}</strong></div>
        <div className="precutoff-metric"><span>Reference income · not counted</span><strong>{money(totalCredit)}</strong></div>
        <div className="precutoff-metric"><span>Reference expense · not counted</span><strong>{money(totalDebit)}</strong></div>
      </div>

      <div className="precutoff-tools">
        <small>{filteredRows.length} shown · dates up to 25 Dec 2024 · ledger impact BDT 0.00</small>
        <input className="precutoff-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search File ID, transaction, client/details or reference…" />
      </div>

      {error ? <div className="precutoff-empty">{error}</div> : loading ? <div className="precutoff-empty">Loading historical reference entries…</div> : filteredRows.length === 0 ? <div className="precutoff-empty">No reference entries found before 26 Dec 2024.</div> : (
        <div className="precutoff-table-wrap">
          <table className="precutoff-table">
            <thead><tr><th>Date</th><th>Transaction / File ID</th><th>Details</th><th>Account / Reference</th><th className="num">Expense</th><th className="num">Income</th><th>Ledger treatment</th></tr></thead>
            <tbody>
              {filteredRows.map((row) => <tr key={row.id}>
                <td>{displayDate(row.date)}</td>
                <td><span className="tx">{row.id}</span><span className="sub">{row.projectId || "General account"}</span></td>
                <td><span className="tx">{row.description}</span><span className="sub">{row.category} · {row.sourceType || row.status}</span></td>
                <td>{row.account || row.method || "—"}<span className="sub">{row.reference || row.method || "No reference"}</span></td>
                <td className="num">{row.debit ? money(row.debit) : "—"}</td>
                <td className="num">{row.credit ? money(row.credit) : "—"}</td>
                <td><span className="reference-chip">Reference only</span><span className="sub">Excluded from balance</span></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
