"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { landViewApi, type FinanceSheetData } from "@/lib/api";
import styles from "./finance.module.css";

const tabs = ["Summary", "Project Billing", "File List", "Design Bill", "Design Deposit", "Supervision Bill", "S Deposit", "Others Bill", "Others Bill Deposit"];
const money = (value: number) => new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(value);
type SummaryStatus = "all" | "due" | "full-paid";
const normalizeStatus = (value: string | undefined) => String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

const summaryGroups = [
  { label: "Project Details", span: 3 },
  { label: "Design", span: 4 },
  { label: "Supervision", span: 4 },
  { label: "Others", span: 4 },
  { label: "Account Status", span: 2 },
];

export default function FinancePage() {
  const [tab, setTab] = useState("Summary");
  const [data, setData] = useState<FinanceSheetData | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SummaryStatus>("all");
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const request = useRef(0);

  useEffect(() => {
    const id = ++request.current;
    setBusy(true); setError(""); setData(null);
    landViewApi.getFinanceSheet(tab).then(result => {
      if (request.current === id) setData(result);
    }).catch(err => {
      if (request.current === id) setError(err instanceof Error ? err.message : "Could not load Finance.");
    }).finally(() => { if (request.current === id) setBusy(false); });
    return () => { request.current++; };
  }, [tab, revision]);

  const statusColumn = tab === "Summary" ? 16 : -1;
  const searchedRows = (data?.rows || []).filter(row => row.some(cell => cell.toLowerCase().includes(query.trim().toLowerCase())));
  const rows = searchedRows.filter(row => {
    if (tab !== "Summary" || status === "all") return true;
    const value = normalizeStatus(row[statusColumn]);
    if (status === "due") return value === "due";
    if (status === "full-paid") return value === "full paid" || value === "fully paid" || value === "paid";
    return true;
  });

  const pages = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pages - 1);
  const totals = data?.totals;

  const setSummaryStatus = (next: Exclude<SummaryStatus,"all">) => {
    setStatus(current => current === next ? "all" : next);
    setPage(0);
  };

  return <div className={styles.finance}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>LAND VIEW / ACCOUNTS</span><h1>Finance<span>.</span></h1></div>
      <div className={styles.actions}>
        {data && <a href={data.url} target="_blank" rel="noopener noreferrer">Open Google Sheet ↗</a>}
        <button disabled={busy} onClick={() => setRevision(value => value + 1)}>{busy ? "Loading…" : "↻ Refresh"}</button>
      </div>
    </header>

    <section className={styles.metrics} aria-label="Workbook balances">
      {[["Net billed", totals?.billed], ["Discounts", totals?.discount], ["Collected", totals?.paid], ["Outstanding", totals?.due]].map(([label,value]) => <article key={String(label)}><span>{label}</span><strong>{typeof value === "number" ? money(value) : "—"}</strong></article>)}
    </section>

    <section className={styles.book}>
      <nav className={styles.tabs} aria-label="Finance worksheets">{tabs.map(name => name === "Project Billing" ? <Link key={name} href="/admin/finance/invoices" style={{padding:"19px 15px",whiteSpace:"nowrap",color:"#e9b620",fontSize:12}}>Project Billing ↗</Link> : <button key={name} aria-current={tab === name ? "page" : undefined} onClick={() => { setTab(name); setQuery(""); setStatus("all"); setPage(0); }}>{name === "S Deposit" ? "Supervision Deposit" : name}</button>)}</nav>

      <div className={styles.toolbar}>
        <div><h2>{tab}</h2><span>{data ? `${rows.length} rows · Updated ${new Date(data.updatedAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}` : "Google Sheets"}</span></div>
        <div className={styles.toolbarRight}>
          {tab === "Summary" && <div className={styles.filters} aria-label="Project status filter">
            <button aria-pressed={status === "due"} onClick={() => setSummaryStatus("due")}>DUE</button>
            <button aria-pressed={status === "full-paid"} onClick={() => setSummaryStatus("full-paid")}>FULL PAID</button>
          </div>}
          <input aria-label="Search worksheet" type="search" placeholder="Search file, name or amount…" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} />
        </div>
      </div>

      {error && <div role="alert" className={styles.message}>{error}<button onClick={() => setRevision(value => value + 1)}>Try again</button></div>}
      {busy && <div role="status" className={styles.message}>Loading {tab}…</div>}

      {!busy && data && <>
        <div className={`${styles.table} ${tab === "Summary" ? styles.summaryTable : ""}`} tabIndex={0} role="region" aria-label={`${tab} table`}>
          <table>
            <thead>
              {tab === "Summary" && data.headers.length >= 17 && <tr className={styles.groupHeader}>
                {summaryGroups.map(group => <th key={group.label} colSpan={group.span} scope="colgroup">{group.label}</th>)}
              </tr>}
              <tr>{data.headers.map((heading,i) => <th key={i} scope="col">{heading || "—"}</th>)}</tr>
            </thead>
            <tbody>
              {rows.slice(currentPage*50, (currentPage+1)*50).map((row,i) => <tr key={currentPage*50+i}>{row.map((cell,j) => <td key={j}>{tab === "Summary" && j === 16 ? <span className={`${styles.statusBadge} ${normalizeStatus(cell) === "due" ? styles.statusDue : styles.statusPaid}`}>{cell || "—"}</span> : (cell || "—")}</td>)}</tr>)}
            </tbody>
          </table>
          {!rows.length && <p className={styles.message}>No matching records.</p>}
        </div>
        <footer className={styles.footer}><span>Page {currentPage+1} of {pages}</span><div><button disabled={currentPage === 0} onClick={() => setPage(currentPage-1)}>Previous</button><button disabled={currentPage+1 === pages} onClick={() => setPage(currentPage+1)}>Next</button></div></footer>
      </>}
    </section>
  </div>;
}
