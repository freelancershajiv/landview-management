"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { landViewApi, type FinanceSheetData } from "@/lib/api";
import styles from "./finance.module.css";

const tabs = ["Summary", "Project Billing", "File List", "Design Bill", "Design Deposit", "Supervision Bill", "S Deposit", "Others Bill", "Others Bill Deposit"];
const BILL_CATEGORIES = ["Engineering Bill", "Supervision Bill", "Other Services Bill"] as const;
type BillCategory = typeof BILL_CATEGORIES[number];
type SummaryStatus = "all" | "due" | "full-paid";
type CategoryTotals = { bill: number; discount: number; collected: number; due: number };
type LedgerRow = { id: string; date: string; type: "Income" | "Expense"; description: string; reference: string; amount: number };

const money = (value: number) => new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(value || 0);
const normalizeStatus = (value: unknown) => String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
const amount = (value: unknown) => {
  const n = Number(String(value ?? 0).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const field = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
};
const isoDate = (value: unknown) => {
  const text = String(value || "").trim();
  const direct = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (direct) return `${direct[1]}-${direct[2]}-${direct[3]}`;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};
const currentMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const summaryGroups = [
  { label: "Project Details", span: 3 },
  { label: "Design", span: 4 },
  { label: "Supervision", span: 4 },
  { label: "Others", span: 4 },
  { label: "Account Status", span: 2 },
];

function buildCategoryTotals(rows: string[][]) {
  const engineering: CategoryTotals = { bill: 0, discount: 0, collected: 0, due: 0 };
  const supervision: CategoryTotals = { bill: 0, discount: 0, collected: 0, due: 0 };
  const others: CategoryTotals = { bill: 0, discount: 0, collected: 0, due: 0 };

  rows.forEach(row => {
    engineering.bill += amount(row[3]);
    engineering.discount += amount(row[4]);
    engineering.collected += amount(row[5]);
    engineering.due += amount(row[6]);
    supervision.bill += amount(row[7]);
    supervision.discount += amount(row[8]);
    supervision.collected += amount(row[9]);
    supervision.due += amount(row[10]);
    others.bill += amount(row[11]);
    others.discount += amount(row[12]);
    others.collected += amount(row[13]);
    others.due += amount(row[14]);
  });

  return { engineering, supervision, others };
}

function isEffectivePayment(record: Record<string, unknown>) {
  const status = normalizeStatus(field(record, ["Approval_Status", "Approval Status", "Status"]));
  const affects = normalizeStatus(field(record, ["Affects_Business_Balance", "Affects Business Balance"]));
  if (["rejected", "declined", "cancelled", "canceled", "pending"].includes(status)) return false;
  if (["no", "false", "0", "personal"].includes(affects)) return false;
  return amount(field(record, ["Amount", "Payment_Amount", "Payment Amount"])) > 0;
}

function isEffectiveExpense(record: Record<string, unknown>) {
  const status = normalizeStatus(field(record, ["Approval_Status", "Approval Status", "Status"]));
  if (status && !["approved", "paid", "verified", "complete", "completed"].includes(status)) return false;
  return amount(field(record, ["Amount", "Expense_Amount", "Expense Amount"])) > 0;
}

export default function FinancePage() {
  const [tab, setTab] = useState("Summary");
  const [data, setData] = useState<FinanceSheetData | null>(null);
  const [summaryData, setSummaryData] = useState<FinanceSheetData | null>(null);
  const [payments, setPayments] = useState<Record<string, unknown>[]>([]);
  const [expenses, setExpenses] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SummaryStatus>("all");
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [paymentForm, setPaymentForm] = useState({
    projectId: "",
    category: "Engineering Bill" as BillCategory,
    amount: "",
    date: today(),
    method: "Bank Transfer",
    account: "Bank Account",
    reference: "",
    notes: "",
  });
  const request = useRef(0);

  useEffect(() => {
    const id = ++request.current;
    setBusy(true);
    setError("");
    setData(null);

    const currentRequest = landViewApi.getFinanceSheet(tab);
    const summaryRequest = tab === "Summary" ? currentRequest : landViewApi.getFinanceSheet("Summary");

    Promise.allSettled([
      currentRequest,
      summaryRequest,
      landViewApi.getPayments(),
      landViewApi.getErpRecords("expenses"),
    ]).then(results => {
      if (request.current !== id) return;
      const [current, summary, paymentResult, expenseResult] = results;
      if (current.status === "fulfilled") setData(current.value);
      else setError(current.reason instanceof Error ? current.reason.message : "Could not load Finance.");
      if (summary.status === "fulfilled") setSummaryData(summary.value);
      else if (!error) setError(summary.reason instanceof Error ? summary.reason.message : "Could not load billing summary.");
      setPayments(paymentResult.status === "fulfilled" ? paymentResult.value : []);
      setExpenses(expenseResult.status === "fulfilled" ? expenseResult.value : []);
    }).finally(() => {
      if (request.current === id) setBusy(false);
    });

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
  const categoryTotals = buildCategoryTotals(summaryData?.rows || []);
  const categoryCards = [
    { title: "Engineering Bill", data: categoryTotals.engineering },
    { title: "Supervision Bill", data: categoryTotals.supervision },
    { title: "Other Services Bill", data: categoryTotals.others },
  ];

  const projectOptions = useMemo(() => (summaryData?.rows || []).map(row => ({
    id: String(row[0] || "").trim(),
    client: String(row[1] || "").trim(),
    row,
  })).filter(item => item.id), [summaryData]);

  const selectedProject = projectOptions.find(item => item.id === paymentForm.projectId);
  const selectedDue = selectedProject ? (
    paymentForm.category === "Engineering Bill" ? amount(selectedProject.row[6]) :
    paymentForm.category === "Supervision Bill" ? amount(selectedProject.row[10]) :
    amount(selectedProject.row[14])
  ) : 0;

  const effectivePayments = useMemo(() => payments.filter(isEffectivePayment), [payments]);
  const effectiveExpenses = useMemo(() => expenses.filter(isEffectiveExpense), [expenses]);
  const monthKey = currentMonthKey();
  const monthIncome = effectivePayments.reduce((sum, record) => {
    const date = isoDate(field(record, ["Payment_Date", "Payment Date", "Date", "Created_At"]));
    return date.startsWith(monthKey) ? sum + amount(field(record, ["Amount", "Payment_Amount", "Payment Amount"])) : sum;
  }, 0);
  const monthExpense = effectiveExpenses.reduce((sum, record) => {
    const date = isoDate(field(record, ["Expense_Date", "Expense Date", "Date", "Created_At"]));
    return date.startsWith(monthKey) ? sum + amount(field(record, ["Amount", "Expense_Amount", "Expense Amount"])) : sum;
  }, 0);
  const outstanding = categoryTotals.engineering.due + categoryTotals.supervision.due + categoryTotals.others.due;

  const ledgerRows = useMemo<LedgerRow[]>(() => {
    const incomeRows: LedgerRow[] = effectivePayments.map((record, index) => ({
      id: String(field(record, ["Payment_ID", "Payment ID"]) || `payment-${index}`),
      date: isoDate(field(record, ["Payment_Date", "Payment Date", "Date", "Created_At"])),
      type: "Income",
      description: String(field(record, ["Payment_For", "Income_Category", "Description"]) || "Client payment"),
      reference: String(field(record, ["Project_ID", "Project ID", "Reference_No", "Reference No"]) || "—"),
      amount: amount(field(record, ["Amount", "Payment_Amount", "Payment Amount"])),
    }));
    const expenseRows: LedgerRow[] = effectiveExpenses.map((record, index) => ({
      id: String(field(record, ["Expense_ID", "Expense ID"]) || `expense-${index}`),
      date: isoDate(field(record, ["Expense_Date", "Expense Date", "Date", "Created_At"])),
      type: "Expense",
      description: String(field(record, ["Description", "Category", "Expense_Category"]) || "Expense"),
      reference: String(field(record, ["Project_ID", "Project ID", "Reference_No", "Reference No"]) || "—"),
      amount: amount(field(record, ["Amount", "Expense_Amount", "Expense Amount"])),
    }));
    return [...incomeRows, ...expenseRows]
      .filter(item => item.date.startsWith(monthKey) && item.amount > 0)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
      .slice(0, 12);
  }, [effectivePayments, effectiveExpenses, monthKey]);

  const setSummaryStatus = (next: Exclude<SummaryStatus, "all">) => {
    setStatus(current => current === next ? "all" : next);
    setPage(0);
  };

  const openPayment = (projectId = "", category: BillCategory = "Engineering Bill") => {
    const project = projectOptions.find(item => item.id === projectId);
    const due = project ? (category === "Engineering Bill" ? amount(project.row[6]) : category === "Supervision Bill" ? amount(project.row[10]) : amount(project.row[14])) : 0;
    setPaymentForm(current => ({ ...current, projectId, category, amount: due > 0 ? String(due) : "", date: today(), reference: "", notes: "" }));
    setPaymentMessage("");
    setPaymentOpen(true);
  };

  const savePayment = async () => {
    const received = amount(paymentForm.amount);
    if (!paymentForm.projectId) return setPaymentMessage("Choose a project first.");
    if (received <= 0) return setPaymentMessage("Enter a valid payment amount.");
    setPaymentSaving(true);
    setPaymentMessage("");
    try {
      await landViewApi.savePayment({
        Project_ID: paymentForm.projectId,
        Payment_Date: paymentForm.date,
        Amount: received,
        Payment_Method: paymentForm.method,
        Deposit_Account: paymentForm.account,
        Reference_No: paymentForm.reference,
        Payment_For: paymentForm.category,
        Income_Category: paymentForm.category,
        Transaction_Type: "Business Income",
        Affects_Business_Balance: "Yes",
        Received_From: selectedProject?.client || "",
        Notes: paymentForm.notes,
      });
      setPaymentMessage("Payment recorded. It is now part of the Payments → Income workflow; approval rules still apply where configured.");
      setRevision(value => value + 1);
    } catch (err) {
      setPaymentMessage(err instanceof Error ? err.message : "Could not record payment.");
    } finally {
      setPaymentSaving(false);
    }
  };

  return <div className={styles.finance}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>LAND VIEW / ACCOUNTS</span><h1>Finance<span>.</span></h1></div>
      <div className={styles.actions}>
        <Link href="/admin/accounts">Accounts Ledger</Link>
        <Link href="/admin/expenses">Expenses</Link>
        {data && <a href={data.url} target="_blank" rel="noopener noreferrer">Open Google Sheet ↗</a>}
        <button disabled={busy} onClick={() => setRevision(value => value + 1)}>{busy ? "Loading…" : "↻ Refresh"}</button>
        <button onClick={() => openPayment()} style={{background:"#1e9f55",color:"white",borderColor:"#1e9f55"}}>+ Record Client Payment</button>
      </div>
    </header>

    <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12,marginBottom:16}} aria-label="Monthly finance overview">
      {[
        ["Income This Month", money(monthIncome), "Received client/business payments"],
        ["Expenses This Month", money(monthExpense), "Approved business expenses"],
        ["Net Cash Flow", money(monthIncome - monthExpense), "Income minus approved expenses"],
        ["Outstanding Bills", money(outstanding), "From the existing invoicing workbook"],
      ].map(([label, value, hint]) => <article key={label} style={{border:"1px solid #28323a",borderRadius:14,padding:"17px 18px",background:"linear-gradient(145deg,#11171c,#0b1015)"}}>
        <span style={{display:"block",fontSize:10,letterSpacing:'.08em',textTransform:"uppercase",color:"#87939c",fontWeight:800}}>{label}</span>
        <strong style={{display:"block",fontSize:25,marginTop:8,color:"#eef3f6"}}>{value}</strong>
        <small style={{display:"block",marginTop:7,color:"#6f7b84"}}>{hint}</small>
      </article>)}
    </section>

    <section className={styles.metrics} aria-label="Finance categories" style={{gridTemplateColumns:"repeat(3,minmax(0,1fr))"}}>
      {categoryCards.map(category => <article key={category.title} style={{display:"grid",gap:10}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center"}}>
          <span style={{color:"#ef493b",fontWeight:800}}>{category.title}</span>
          <button onClick={() => openPayment("", category.title as BillCategory)} style={{border:"1px solid #3b454c",background:"transparent",color:"#aeb7bd",borderRadius:7,padding:"5px 8px",fontSize:9,cursor:"pointer"}}>RECORD PAYMENT</button>
        </div>
        <strong>{money(category.data.due)}</strong>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8,fontSize:10,color:"#8f9aa3"}}>
          <div><span style={{display:"block",fontSize:8}}>ISSUED</span><b style={{color:"#e8ecef"}}>{money(category.data.bill - category.data.discount)}</b></div>
          <div><span style={{display:"block",fontSize:8}}>COLLECTED</span><b style={{color:"#e8ecef"}}>{money(category.data.collected)}</b></div>
          <div><span style={{display:"block",fontSize:8}}>DUE</span><b style={{color:category.data.due>0?"#ff8c83":"#a7dfba"}}>{money(category.data.due)}</b></div>
        </div>
      </article>)}
    </section>

    {tab === "Summary" && <section style={{border:"1px solid #28323a",borderRadius:14,overflow:"hidden",margin:"16px 0",background:"#0b1015"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",padding:"15px 18px",borderBottom:"1px solid #242d34"}}>
        <div><strong style={{display:"block",fontSize:14}}>Monthly Debit / Credit</strong><small style={{color:"#78858e"}}>Automatically built from approved payments and expenses</small></div>
        <Link href="/admin/accounts" style={{color:"#e9b620",fontSize:11}}>Full ledger →</Link>
      </div>
      <div style={{overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
          <thead><tr style={{color:"#7d8992",textAlign:"left"}}><th style={{padding:"11px 14px"}}>Date</th><th style={{padding:"11px 14px"}}>Type</th><th style={{padding:"11px 14px"}}>Reference</th><th style={{padding:"11px 14px"}}>Description</th><th style={{padding:"11px 14px",textAlign:"right"}}>Debit</th><th style={{padding:"11px 14px",textAlign:"right"}}>Credit</th></tr></thead>
          <tbody>
            {ledgerRows.map(item => <tr key={`${item.type}-${item.id}`} style={{borderTop:"1px solid #1f282f"}}>
              <td style={{padding:"11px 14px",whiteSpace:"nowrap"}}>{item.date}</td><td style={{padding:"11px 14px"}}>{item.type}</td><td style={{padding:"11px 14px"}}>{item.reference}</td><td style={{padding:"11px 14px"}}>{item.description}</td>
              <td style={{padding:"11px 14px",textAlign:"right",color:"#ff8c83"}}>{item.type === "Expense" ? money(item.amount) : "—"}</td><td style={{padding:"11px 14px",textAlign:"right",color:"#a7dfba"}}>{item.type === "Income" ? money(item.amount) : "—"}</td>
            </tr>)}
            {!ledgerRows.length && <tr><td colSpan={6} style={{padding:24,textAlign:"center",color:"#6f7b84"}}>No approved debit / credit transactions found for this month.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>}

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

    {paymentOpen && <div role="dialog" aria-modal="true" aria-label="Record client payment" style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,.72)",display:"grid",placeItems:"center",padding:18}} onMouseDown={event => { if (event.currentTarget === event.target) setPaymentOpen(false); }}>
      <div style={{width:"min(680px,100%)",maxHeight:"92vh",overflowY:"auto",border:"1px solid #35424b",borderRadius:16,background:"#0c1217",boxShadow:"0 28px 90px rgba(0,0,0,.5)"}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:16,padding:"18px 20px",borderBottom:"1px solid #28323a"}}>
          <div><span style={{fontSize:9,fontWeight:900,letterSpacing:'.16em',color:"#ef6a67"}}>PAYMENT → INCOME</span><h2 style={{margin:"5px 0 0",fontSize:20}}>Record Client Payment</h2></div>
          <button onClick={() => setPaymentOpen(false)} aria-label="Close" style={{border:0,background:"transparent",color:"#9aa5ad",fontSize:24,cursor:"pointer"}}>×</button>
        </div>
        <div style={{padding:20}}>
          <p style={{margin:"0 0 16px",padding:"11px 12px",border:"1px solid #2c3c34",borderRadius:9,background:"#101c16",fontSize:11,lineHeight:1.55,color:"#a6b5ac"}}>This records money received in the LAND VIEW Payments database so it can flow into Income and the debit/credit ledger. Your existing invoice generator and invoice layout are not changed.</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}>
            <label style={{fontSize:10,color:"#98a3ab"}}>Project / Client<select value={paymentForm.projectId} onChange={e => setPaymentForm(current => ({...current,projectId:e.target.value}))} style={{width:"100%",marginTop:6,padding:11,borderRadius:8,border:"1px solid #334049",background:"#11181d",color:"#eef3f6"}}><option value="">Choose project…</option>{projectOptions.map(item => <option key={item.id} value={item.id}>{item.id}{item.client ? ` — ${item.client}` : ""}</option>)}</select></label>
            <label style={{fontSize:10,color:"#98a3ab"}}>Billing Category<select value={paymentForm.category} onChange={e => setPaymentForm(current => ({...current,category:e.target.value as BillCategory}))} style={{width:"100%",marginTop:6,padding:11,borderRadius:8,border:"1px solid #334049",background:"#11181d",color:"#eef3f6"}}>{BILL_CATEGORIES.map(category => <option key={category}>{category}</option>)}</select></label>
            <label style={{fontSize:10,color:"#98a3ab"}}>Amount Received (BDT)<input value={paymentForm.amount} inputMode="decimal" onChange={e => setPaymentForm(current => ({...current,amount:e.target.value}))} placeholder={selectedDue ? String(selectedDue) : "0"} style={{width:"100%",marginTop:6,padding:11,borderRadius:8,border:"1px solid #334049",background:"#11181d",color:"#eef3f6"}} />{selectedProject && <small style={{display:"block",marginTop:5,color:"#6f7b84"}}>Current invoice due for this category: {money(selectedDue)}</small>}</label>
            <label style={{fontSize:10,color:"#98a3ab"}}>Payment Date<input type="date" value={paymentForm.date} onChange={e => setPaymentForm(current => ({...current,date:e.target.value}))} style={{width:"100%",marginTop:6,padding:11,borderRadius:8,border:"1px solid #334049",background:"#11181d",color:"#eef3f6"}} /></label>
            <label style={{fontSize:10,color:"#98a3ab"}}>Payment Method<select value={paymentForm.method} onChange={e => setPaymentForm(current => ({...current,method:e.target.value}))} style={{width:"100%",marginTop:6,padding:11,borderRadius:8,border:"1px solid #334049",background:"#11181d",color:"#eef3f6"}}><option>Bank Transfer</option><option>Cash</option><option>bKash</option><option>Nagad</option><option>Cheque</option><option>Other</option></select></label>
            <label style={{fontSize:10,color:"#98a3ab"}}>Deposit Account<select value={paymentForm.account} onChange={e => setPaymentForm(current => ({...current,account:e.target.value}))} style={{width:"100%",marginTop:6,padding:11,borderRadius:8,border:"1px solid #334049",background:"#11181d",color:"#eef3f6"}}><option>Bank Account</option><option>Office Cash</option><option>bKash</option><option>Nagad</option><option>Other Account</option></select></label>
            <label style={{fontSize:10,color:"#98a3ab"}}>Reference No.<input value={paymentForm.reference} onChange={e => setPaymentForm(current => ({...current,reference:e.target.value}))} placeholder="Transaction / cheque reference" style={{width:"100%",marginTop:6,padding:11,borderRadius:8,border:"1px solid #334049",background:"#11181d",color:"#eef3f6"}} /></label>
            <label style={{fontSize:10,color:"#98a3ab"}}>Notes<input value={paymentForm.notes} onChange={e => setPaymentForm(current => ({...current,notes:e.target.value}))} placeholder="Optional" style={{width:"100%",marginTop:6,padding:11,borderRadius:8,border:"1px solid #334049",background:"#11181d",color:"#eef3f6"}} /></label>
          </div>
          {paymentMessage && <div style={{marginTop:14,padding:"10px 12px",border:"1px solid #39454c",borderRadius:8,color:"#c9d0d5",fontSize:11}}>{paymentMessage}</div>}
          <div style={{display:"flex",justifyContent:"flex-end",gap:9,marginTop:18}}><button onClick={() => setPaymentOpen(false)} style={{padding:"10px 14px",borderRadius:8,border:"1px solid #35414a",background:"transparent",color:"#c2cbd1",cursor:"pointer"}}>Close</button><button disabled={paymentSaving} onClick={savePayment} style={{padding:"10px 15px",borderRadius:8,border:0,background:"#1e9f55",color:"white",fontWeight:800,cursor:"pointer",opacity:paymentSaving?.65:1}}>{paymentSaving ? "Recording…" : "Record Payment"}</button></div>
        </div>
      </div>
    </div>}
  </div>;
}
