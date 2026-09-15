"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { landViewApi, type BillingBookData, type FinanceSheetData } from "@/lib/api";
import styles from "./finance.module.css";

const BILL_CATEGORIES = ["Engineering Bill", "Supervision Bill", "Other Services Bill"] as const;
type BillCategory = typeof BILL_CATEGORIES[number];
type SummaryStatus = "all" | "due" | "full-paid";
type CategoryTotals = { bill: number; discount: number; collected: number; due: number };

const sheetTabs = [
  { key: "Summary", label: "Overview" },
  { key: "Design Bill", label: "Engineering Bills" },
  { key: "Supervision Bill", label: "Supervision Bills" },
  { key: "Others Bill", label: "Other Services Bills" },
  { key: "File List", label: "File List" },
] as const;

const money = (value: number) => new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(value || 0);
const amount = (value: unknown) => {
  const n = Number(String(value ?? 0).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const normalizeStatus = (value: unknown) => String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
const field = (record: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return "";
};
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const summaryGroups = [
  { label: "Project Details", span: 3 },
  { label: "Engineering", span: 4 },
  { label: "Supervision", span: 4 },
  { label: "Other Services", span: 4 },
  { label: "Account Status", span: 2 },
];

function buildCategoryTotals(rows: string[][]) {
  const engineering: CategoryTotals = { bill: 0, discount: 0, collected: 0, due: 0 };
  const supervision: CategoryTotals = { bill: 0, discount: 0, collected: 0, due: 0 };
  const others: CategoryTotals = { bill: 0, discount: 0, collected: 0, due: 0 };

  rows.forEach((row) => {
    engineering.bill += amount(row[3]); engineering.discount += amount(row[4]); engineering.collected += amount(row[5]); engineering.due += amount(row[6]);
    supervision.bill += amount(row[7]); supervision.discount += amount(row[8]); supervision.collected += amount(row[9]); supervision.due += amount(row[10]);
    others.bill += amount(row[11]); others.discount += amount(row[12]); others.collected += amount(row[13]); others.due += amount(row[14]);
  });
  return { engineering, supervision, others };
}

function paymentStatus(record: Record<string, unknown>) {
  return normalizeStatus(field(record, ["Approval_Status", "Approval Status", "Status"]));
}
function paymentIsVisible(record: Record<string, unknown>) {
  const status = paymentStatus(record);
  if (["rejected", "declined", "cancelled", "canceled"].includes(status)) return false;
  return amount(field(record, ["Amount", "Payment_Amount", "Payment Amount"])) > 0;
}
function normalizeProjectId(value: unknown) {
  const raw = String(value || "").trim().toUpperCase();
  const digits = raw.replace(/\D/g, "");
  return digits ? `LV-${Number(digits)}` : raw;
}
function operationalStatus(value: unknown) {
  const text = normalizeStatus(value);
  if (/cancel|abandon/.test(text)) return "cancelled";
  if (/complete|done|closed|finish/.test(text)) return "completed";
  if (/pause|hold|inactive/.test(text)) return "paused";
  return "running";
}
function categoryMatches(value: unknown, category: BillCategory) {
  const text = normalizeStatus(value);
  if (category === "Engineering Bill") return text.includes("engineering") || text.includes("design");
  if (category === "Supervision Bill") return text.includes("supervision");
  return text.includes("other");
}

export default function BillingPage() {
  const [tab, setTab] = useState<(typeof sheetTabs)[number]["key"]>("Summary");
  const [data, setData] = useState<FinanceSheetData | null>(null);
  const [summaryData, setSummaryData] = useState<FinanceSheetData | null>(null);
  const [payments, setPayments] = useState<Record<string, unknown>[]>([]);
  const [projects, setProjects] = useState<Record<string, unknown>[]>([]);
  const [billingBook, setBillingBook] = useState<BillingBookData | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SummaryStatus>("all");
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);

  const [billOpen, setBillOpen] = useState(false);
  const [billSaving, setBillSaving] = useState(false);
  const [billMessage, setBillMessage] = useState("");
  const [billForm, setBillForm] = useState({ projectId: "", category: "Engineering Bill" as BillCategory, service: "", amount: "", date: today(), notes: "" });

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [paymentForm, setPaymentForm] = useState({
    projectId: "", category: "Engineering Bill" as BillCategory, amount: "", date: today(), method: "Bank Transfer", account: "Bank Account", reference: "", notes: "",
  });

  const request = useRef(0);

  useEffect(() => {
    const id = ++request.current;
    setBusy(true);
    setError("");
    const currentRequest = landViewApi.getFinanceSheet(tab);
    const summaryRequest = tab === "Summary" ? currentRequest : landViewApi.getFinanceSheet("Summary");

    Promise.allSettled([currentRequest, summaryRequest, landViewApi.getPayments(), landViewApi.getProjects(), landViewApi.getBillingBook()]).then((results) => {
      if (request.current !== id) return;
      const [current, summary, paymentResult, projectResult, bookResult] = results;
      if (current.status === "fulfilled") setData(current.value);
      else setError(current.reason instanceof Error ? current.reason.message : "Could not load Billing.");
      if (summary.status === "fulfilled") setSummaryData(summary.value);
      setPayments(paymentResult.status === "fulfilled" ? paymentResult.value : []);
      setProjects(projectResult.status === "fulfilled" ? projectResult.value : []);
      setBillingBook(bookResult.status === "fulfilled" ? bookResult.value : null);
    }).finally(() => { if (request.current === id) setBusy(false); });

    return () => { request.current++; };
  }, [tab, revision]);

  const categoryTotals = buildCategoryTotals(summaryData?.rows || []);
  const projectStatusMap = useMemo(() => {
    const map = new Map<string, string>();
    projects.forEach((project) => {
      const id = normalizeProjectId(field(project, ["Project_ID", "Project ID", "ProjectId"]));
      if (id) map.set(id, operationalStatus(field(project, ["Status", "Project_Status", "Project Status"])));
    });
    return map;
  }, [projects]);
  const projectOptions = useMemo(() => (summaryData?.rows || []).map((row) => {
    const id = String(row[0] || "").trim();
    return { id, client: String(row[1] || "").trim(), row, status: projectStatusMap.get(normalizeProjectId(id)) || "running" };
  }).filter((item) => item.id), [summaryData, projectStatusMap]);
  const legacyBilled = categoryTotals.engineering.bill + categoryTotals.supervision.bill + categoryTotals.others.bill - categoryTotals.engineering.discount - categoryTotals.supervision.discount - categoryTotals.others.discount;
  const legacyCollected = categoryTotals.engineering.collected + categoryTotals.supervision.collected + categoryTotals.others.collected;
  const legacyDue = categoryTotals.engineering.due + categoryTotals.supervision.due + categoryTotals.others.due;
  const newAppBills = billingBook?.totals?.billed || 0;
  const activeProjectOptions = projectOptions.filter((item) => item.status === "running");
  const appCategoryDue = (projectId: string, category: BillCategory) => {
    const bookProject = billingBook?.projects?.find((item) => normalizeProjectId(item.projectId) === normalizeProjectId(projectId));
    if (!bookProject) return 0;
    const match = Object.entries(bookProject.categories || {}).find(([key]) => categoryMatches(key, category));
    return match ? amount(match[1]?.due) : 0;
  };
  const categoryDueForProject = (item: { id: string; row: string[][][number] }, category: BillCategory) => {
    const legacy = category === "Engineering Bill" ? amount(item.row[6]) : category === "Supervision Bill" ? amount(item.row[10]) : amount(item.row[14]);
    return legacy + appCategoryDue(item.id, category);
  };
  const dueProjectOptions = projectOptions.map((item) => ({
    ...item,
    totalDue: BILL_CATEGORIES.reduce((sum, category) => sum + Math.max(0, categoryDueForProject(item, category)), 0),
  })).filter((item) => item.totalDue > 0.009);

  const searchedRows = (data?.rows || []).filter((row) => row.some((cell) => cell.toLowerCase().includes(query.trim().toLowerCase())));
  const rows = searchedRows.filter((row) => {
    if (tab !== "Summary" || status === "all") return true;
    const value = normalizeStatus(row[16]);
    if (status === "due") return value === "due";
    return value === "full paid" || value === "fully paid" || value === "paid";
  });
  const pages = Math.max(1, Math.ceil(rows.length / 50));
  const currentPage = Math.min(page, pages - 1);

  const recentPayments = useMemo(() => payments.filter(paymentIsVisible).sort((a, b) => String(field(b, ["Payment_Date", "Date", "Created_At"])).localeCompare(String(field(a, ["Payment_Date", "Date", "Created_At"])))).slice(0, 8), [payments]);

  function openBill(category: BillCategory = "Engineering Bill") {
    setBillForm({ projectId: "", category, service: "", amount: "", date: today(), notes: "" });
    setBillMessage("");
    setBillOpen(true);
  }

  async function saveBill() {
    const value = amount(billForm.amount);
    if (!billForm.projectId) return setBillMessage("Choose a project first.");
    if (!billForm.service.trim()) return setBillMessage("Enter the service or bill description.");
    if (value <= 0) return setBillMessage("Enter a valid bill amount.");
    setBillSaving(true); setBillMessage("");
    try {
      await landViewApi.saveBill({
        Project_ID: billForm.projectId,
        Bill_Date: billForm.date,
        Description: `[${billForm.category}] ${billForm.service.trim()}`,
        Amount: value,
        Status: "Issued",
        Notes: `Billing Workspace${billForm.notes.trim() ? ` — ${billForm.notes.trim()}` : ""}`,
        Billing_Category: billForm.category,
        Category: billForm.category,
        Created_Via: "Billing Workspace",
      });
      setBillMessage("Bill added. The existing invoice generator will include this Billing Workspace entry for the selected project.");
      setRevision((value) => value + 1);
    } catch (err) {
      setBillMessage(err instanceof Error ? err.message : "Could not add the bill.");
    } finally { setBillSaving(false); }
  }

  function openPayment(category: BillCategory = "Engineering Bill") {
    setPaymentForm({ projectId: "", category, amount: "", date: today(), method: "Bank Transfer", account: "Bank Account", reference: "", notes: "" });
    setPaymentMessage("");
    setPaymentOpen(true);
  }

  const selectedPaymentProject = dueProjectOptions.find((item) => item.id === paymentForm.projectId);
  const selectedDue = selectedPaymentProject ? Math.max(0, categoryDueForProject(selectedPaymentProject, paymentForm.category)) : 0;

  async function savePayment() {
    const received = amount(paymentForm.amount);
    if (!paymentForm.projectId) return setPaymentMessage("Choose a project first.");
    if (selectedDue <= 0) return setPaymentMessage("The selected billing category has no outstanding amount.");
    if (received <= 0) return setPaymentMessage("Enter a valid payment amount.");
    if (received > selectedDue + 0.01) return setPaymentMessage(`Payment cannot exceed the current due of ${money(selectedDue)}.`);
    setPaymentSaving(true); setPaymentMessage("");
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
        Received_From: selectedPaymentProject?.client || "",
        Notes: `Billing Workspace${paymentForm.notes.trim() ? ` — ${paymentForm.notes.trim()}` : ""}`,
      });
      setPaymentMessage("Payment recorded. It will flow automatically to Accounts → Income and the income/expense ledger under the existing approval rules.");
      setRevision((value) => value + 1);
    } catch (err) {
      setPaymentMessage(err instanceof Error ? err.message : "Could not record payment.");
    } finally { setPaymentSaving(false); }
  }

  const categoryCards = [
    { title: "Engineering Bill" as BillCategory, data: categoryTotals.engineering },
    { title: "Supervision Bill" as BillCategory, data: categoryTotals.supervision },
    { title: "Other Services Bill" as BillCategory, data: categoryTotals.others },
  ];

  return <div className={styles.finance}>
    <header className={styles.header}>
      <div><span className={styles.eyebrow}>LAND VIEW / CLIENT BILLING</span><h1>Billing<span>.</span></h1></div>
      <div className={styles.actions}>
        <Link href="/admin/accounts">Accounts</Link>
        <button disabled={busy} onClick={() => setRevision((value) => value + 1)}>{busy ? "Loading…" : "↻ Refresh"}</button>
      </div>
    </header>

    <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12,marginBottom:18}} aria-label="Billing actions">
      <button onClick={() => openBill()} style={{textAlign:"left",padding:18,border:"1px solid #314038",borderRadius:14,background:"linear-gradient(145deg,#122018,#0c1510)",color:"#eef5f0",cursor:"pointer"}}><small style={{color:"#72d996",fontWeight:900,letterSpacing:'.12em'}}>STEP 1</small><strong style={{display:"block",fontSize:18,marginTop:7}}>+ Add Bill</strong><span style={{display:"block",fontSize:11,color:"#84968b",marginTop:5}}>Only ongoing projects are available for new bills.</span></button>
      <Link href="/admin/finance/invoices" style={{padding:18,border:"1px solid #3d3740",borderRadius:14,background:"linear-gradient(145deg,#1b171d,#100e12)",color:"#eef2f5",textDecoration:"none"}}><small style={{color:"#e9b620",fontWeight:900,letterSpacing:'.12em'}}>STEP 2</small><strong style={{display:"block",fontSize:18,marginTop:7}}>Generate Invoice →</strong><span style={{display:"block",fontSize:11,color:"#948c98",marginTop:5}}>Uses the existing LAND VIEW invoice system and layout.</span></Link>
      <button onClick={() => openPayment()} style={{textAlign:"left",padding:18,border:"1px solid #244450",borderRadius:14,background:"linear-gradient(145deg,#102028,#0b151b)",color:"#eef5f7",cursor:"pointer"}}><small style={{color:"#6fc6e8",fontWeight:900,letterSpacing:'.12em'}}>STEP 3</small><strong style={{display:"block",fontSize:18,marginTop:7}}>+ Add Payment</strong><span style={{display:"block",fontSize:11,color:"#8297a0",marginTop:5}}>Only projects with an outstanding balance are shown.</span></button>
    </section>

    <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))",gap:12,marginBottom:16}}>
      {[["Invoiced", legacyBilled, "Existing invoice workbook"],["Collected", legacyCollected, "Verified legacy billing deposits"],["Receivables", legacyDue, "Outstanding client billing"],["New App Bills", newAppBills, "Bills entered from this Billing workspace"]].map(([label,value,hint]) => <article key={String(label)} style={{border:"1px solid #28323a",borderRadius:14,padding:"17px 18px",background:"linear-gradient(145deg,#11171c,#0b1015)"}}><span style={{display:"block",fontSize:9,letterSpacing:'.1em',textTransform:"uppercase",color:"#87939c",fontWeight:900}}>{label}</span><strong style={{display:"block",fontSize:25,marginTop:8}}>{money(Number(value))}</strong><small style={{display:"block",marginTop:7,color:"#6f7b84"}}>{hint}</small></article>)}
    </section>

    <section className={styles.metrics} aria-label="Billing categories" style={{gridTemplateColumns:"repeat(3,minmax(0,1fr))"}}>
      {categoryCards.map((category) => <article key={category.title} style={{display:"grid",gap:10}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center"}}><span style={{color:"#ef493b",fontWeight:800}}>{category.title}</span><button onClick={() => openBill(category.title)} style={{border:"1px solid #3b454c",background:"transparent",color:"#b2bbc1",borderRadius:7,padding:"5px 8px",fontSize:9,cursor:"pointer"}}>+ BILL</button></div>
        <strong>{money(category.data.due)}</strong>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:8,fontSize:10,color:"#8f9aa3"}}><div><span style={{display:"block",fontSize:8}}>ISSUED</span><b style={{color:"#e8ecef"}}>{money(category.data.bill-category.data.discount)}</b></div><div><span style={{display:"block",fontSize:8}}>COLLECTED</span><b style={{color:"#e8ecef"}}>{money(category.data.collected)}</b></div><div><span style={{display:"block",fontSize:8}}>DUE</span><b style={{color:category.data.due>0?"#ff8c83":"#a7dfba"}}>{money(category.data.due)}</b></div></div>
      </article>)}
    </section>

    {tab === "Summary" && <section style={{border:"1px solid #28323a",borderRadius:14,overflow:"hidden",margin:"16px 0",background:"#0b1015"}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:16,alignItems:"center",padding:"15px 18px",borderBottom:"1px solid #242d34"}}><div><strong style={{display:"block",fontSize:14}}>Recent Client Payments</strong><small style={{color:"#78858e"}}>Payments entered here feed the Accounts income/expense ledger automatically.</small></div><Link href="/admin/accounts" style={{color:"#e9b620",fontSize:11}}>Open Accounts →</Link></div>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}><thead><tr style={{color:"#7d8992",textAlign:"left"}}><th style={{padding:"11px 14px"}}>Date</th><th style={{padding:"11px 14px"}}>Project</th><th style={{padding:"11px 14px"}}>Payment For</th><th style={{padding:"11px 14px"}}>Method</th><th style={{padding:"11px 14px"}}>Status</th><th style={{padding:"11px 14px",textAlign:"right"}}>Amount</th></tr></thead><tbody>{recentPayments.map((record,index)=><tr key={String(field(record,["Payment_ID"])||index)} style={{borderTop:"1px solid #1f282f"}}><td style={{padding:"11px 14px"}}>{String(field(record,["Payment_Date","Date"])||"—")}</td><td style={{padding:"11px 14px"}}>{String(field(record,["Project_ID","Project ID"])||"—")}</td><td style={{padding:"11px 14px"}}>{String(field(record,["Payment_For","Income_Category"])||"Client Payment")}</td><td style={{padding:"11px 14px"}}>{String(field(record,["Payment_Method"])||"—")}</td><td style={{padding:"11px 14px"}}>{String(field(record,["Approval_Status","Status"])||"Recorded")}</td><td style={{padding:"11px 14px",textAlign:"right",color:"#a7dfba",fontWeight:800}}>{money(amount(field(record,["Amount"])))}</td></tr>)}{!recentPayments.length&&<tr><td colSpan={6} style={{padding:24,textAlign:"center",color:"#6f7b84"}}>No client payments recorded yet.</td></tr>}</tbody></table></div>
    </section>}

    <section className={styles.book}>
      <nav className={styles.tabs} aria-label="Billing views"><Link href="/admin/finance/invoices" style={{padding:"19px 15px",whiteSpace:"nowrap",color:"#e9b620",fontSize:12}}>Invoices ↗</Link>{sheetTabs.map((item)=><button key={item.key} aria-current={tab===item.key?"page":undefined} onClick={()=>{setTab(item.key);setQuery("");setStatus("all");setPage(0)}}>{item.label}</button>)}</nav>
      <div className={styles.toolbar}><div><h2>{sheetTabs.find((item)=>item.key===tab)?.label||tab}</h2><span>{data?`${rows.length} rows · Updated ${new Date(data.updatedAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}`:"Billing database"}</span></div><div className={styles.toolbarRight}>{tab==="Summary"&&<div className={styles.filters}><button aria-pressed={status==="due"} onClick={()=>{setStatus((current)=>current==="due"?"all":"due");setPage(0)}}>DUE</button><button aria-pressed={status==="full-paid"} onClick={()=>{setStatus((current)=>current==="full-paid"?"all":"full-paid");setPage(0)}}>FULL PAID</button></div>}<input aria-label="Search billing" type="search" placeholder="Search project, service or amount…" value={query} onChange={(event)=>{setQuery(event.target.value);setPage(0)}}/></div></div>
      {error&&<div role="alert" className={styles.message}>{error}<button onClick={()=>setRevision((value)=>value+1)}>Try again</button></div>}
      {busy&&<div role="status" className={styles.message}>Loading Billing…</div>}
      {!busy&&data&&<><div className={`${styles.table} ${tab==="Summary"?styles.summaryTable:""}`} tabIndex={0} role="region" aria-label={`${tab} table`}><table><thead>{tab==="Summary"&&data.headers.length>=17&&<tr className={styles.groupHeader}>{summaryGroups.map((group)=><th key={group.label} colSpan={group.span} scope="colgroup">{group.label}</th>)}</tr>}<tr>{data.headers.map((heading,i)=><th key={i}>{heading||"—"}</th>)}</tr></thead><tbody>{rows.slice(currentPage*50,(currentPage+1)*50).map((row,i)=><tr key={currentPage*50+i}>{row.map((cell,j)=><td key={j}>{tab==="Summary"&&j===16?<span className={`${styles.statusBadge} ${normalizeStatus(cell)==="due"?styles.statusDue:styles.statusPaid}`}>{cell||"—"}</span>:(cell||"—")}</td>)}</tr>)}</tbody></table>{!rows.length&&<p className={styles.message}>No matching records.</p>}</div><footer className={styles.footer}><span>Page {currentPage+1} of {pages}</span><div><button disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Previous</button><button disabled={currentPage+1===pages} onClick={()=>setPage(currentPage+1)}>Next</button></div></footer></>}
    </section>

    {billOpen&&<div role="dialog" aria-modal="true" aria-label="Add bill" style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,.72)",display:"grid",placeItems:"center",padding:18}} onMouseDown={(event)=>{if(event.currentTarget===event.target)setBillOpen(false)}}><div style={{width:"min(650px,100%)",border:"1px solid #35424b",borderRadius:16,background:"#0c1217",boxShadow:"0 28px 90px rgba(0,0,0,.5)"}}><div style={{display:"flex",justifyContent:"space-between",padding:"18px 20px",borderBottom:"1px solid #28323a"}}><div><small style={{color:"#72d996",fontWeight:900}}>BILLING / NEW BILL</small><h2 style={{margin:"5px 0 0"}}>Add Client Bill</h2></div><button onClick={()=>setBillOpen(false)} style={{border:0,background:"transparent",color:"#9aa5ad",fontSize:24}}>×</button></div><div style={{padding:20,display:"grid",gap:13}}><label style={{fontSize:10,color:"#98a3ab"}}>Project / Client<select value={billForm.projectId} onChange={(e)=>setBillForm((current)=>({...current,projectId:e.target.value}))} style={inputStyle}><option value="">Choose ongoing project…</option>{activeProjectOptions.map((item)=><option key={item.id} value={item.id}>{item.id}{item.client?` — ${item.client}`:""}</option>)}</select></label><label style={{fontSize:10,color:"#98a3ab"}}>Bill Category<select value={billForm.category} onChange={(e)=>setBillForm((current)=>({...current,category:e.target.value as BillCategory}))} style={inputStyle}>{BILL_CATEGORIES.map((category)=><option key={category}>{category}</option>)}</select></label><label style={{fontSize:10,color:"#98a3ab"}}>Service / Description<input value={billForm.service} onChange={(e)=>setBillForm((current)=>({...current,service:e.target.value}))} placeholder="e.g. Structural Design" style={inputStyle}/></label><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}><label style={{fontSize:10,color:"#98a3ab"}}>Amount (BDT)<input value={billForm.amount} onChange={(e)=>setBillForm((current)=>({...current,amount:e.target.value}))} inputMode="decimal" style={inputStyle}/></label><label style={{fontSize:10,color:"#98a3ab"}}>Bill Date<input type="date" value={billForm.date} onChange={(e)=>setBillForm((current)=>({...current,date:e.target.value}))} style={inputStyle}/></label></div><label style={{fontSize:10,color:"#98a3ab"}}>Notes<input value={billForm.notes} onChange={(e)=>setBillForm((current)=>({...current,notes:e.target.value}))} placeholder="Optional" style={inputStyle}/></label>{billMessage&&<div style={messageStyle}>{billMessage}</div>}<div style={{display:"flex",justifyContent:"flex-end",gap:9}}><button onClick={()=>setBillOpen(false)} style={secondaryButton}>Close</button><button disabled={billSaving} onClick={saveBill} style={primaryButton}>{billSaving?"Adding…":"Add Bill"}</button></div></div></div></div>}

    {paymentOpen&&<div role="dialog" aria-modal="true" aria-label="Add payment" style={{position:"fixed",inset:0,zIndex:1000,background:"rgba(0,0,0,.72)",display:"grid",placeItems:"center",padding:18}} onMouseDown={(event)=>{if(event.currentTarget===event.target)setPaymentOpen(false)}}><div style={{width:"min(680px,100%)",border:"1px solid #35424b",borderRadius:16,background:"#0c1217",boxShadow:"0 28px 90px rgba(0,0,0,.5)"}}><div style={{display:"flex",justifyContent:"space-between",padding:"18px 20px",borderBottom:"1px solid #28323a"}}><div><small style={{color:"#6fc6e8",fontWeight:900}}>PAYMENT → ACCOUNTS INCOME</small><h2 style={{margin:"5px 0 0"}}>Add Client Payment</h2></div><button onClick={()=>setPaymentOpen(false)} style={{border:0,background:"transparent",color:"#9aa5ad",fontSize:24}}>×</button></div><div style={{padding:20,display:"grid",gap:13}}><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:12}}><label style={{fontSize:10,color:"#98a3ab"}}>Project / Client<select value={paymentForm.projectId} onChange={(e)=>{const project=dueProjectOptions.find((item)=>item.id===e.target.value);const firstDue=project?BILL_CATEGORIES.find((category)=>categoryDueForProject(project,category)>0):undefined;setPaymentForm((current)=>({...current,projectId:e.target.value,category:firstDue||current.category,amount:""}))}} style={inputStyle}><option value="">Choose project with due…</option>{dueProjectOptions.map((item)=><option key={item.id} value={item.id}>{item.id}{item.client?` — ${item.client}`:""} — Due ${money(item.totalDue)}</option>)}</select></label><label style={{fontSize:10,color:"#98a3ab"}}>Billing Category<select value={paymentForm.category} onChange={(e)=>setPaymentForm((current)=>({...current,category:e.target.value as BillCategory}))} style={inputStyle}>{BILL_CATEGORIES.map((category)=><option key={category} disabled={selectedPaymentProject ? categoryDueForProject(selectedPaymentProject,category)<=0 : false}>{category}{selectedPaymentProject?` — Due ${money(Math.max(0,categoryDueForProject(selectedPaymentProject,category)))}`:""}</option>)}</select></label><label style={{fontSize:10,color:"#98a3ab"}}>Amount Received (BDT)<input value={paymentForm.amount} onChange={(e)=>setPaymentForm((current)=>({...current,amount:e.target.value}))} inputMode="decimal" placeholder={selectedDue?String(selectedDue):"0"} style={inputStyle}/>{selectedPaymentProject&&<small style={{display:"block",marginTop:5,color:"#6f7b84"}}>Current category due: {money(selectedDue)}</small>}</label><label style={{fontSize:10,color:"#98a3ab"}}>Payment Date<input type="date" value={paymentForm.date} onChange={(e)=>setPaymentForm((current)=>({...current,date:e.target.value}))} style={inputStyle}/></label><label style={{fontSize:10,color:"#98a3ab"}}>Method<select value={paymentForm.method} onChange={(e)=>setPaymentForm((current)=>({...current,method:e.target.value}))} style={inputStyle}><option>Bank Transfer</option><option>Cash</option><option>bKash</option><option>Nagad</option><option>Cheque</option><option>Other</option></select></label><label style={{fontSize:10,color:"#98a3ab"}}>Deposit Account<select value={paymentForm.account} onChange={(e)=>setPaymentForm((current)=>({...current,account:e.target.value}))} style={inputStyle}><option>Bank Account</option><option>Office Cash</option><option>bKash</option><option>Nagad</option><option>Other Account</option></select></label><label style={{fontSize:10,color:"#98a3ab"}}>Reference No.<input value={paymentForm.reference} onChange={(e)=>setPaymentForm((current)=>({...current,reference:e.target.value}))} style={inputStyle}/></label><label style={{fontSize:10,color:"#98a3ab"}}>Notes<input value={paymentForm.notes} onChange={(e)=>setPaymentForm((current)=>({...current,notes:e.target.value}))} style={inputStyle}/></label></div>{paymentMessage&&<div style={messageStyle}>{paymentMessage}</div>}<div style={{display:"flex",justifyContent:"flex-end",gap:9}}><button onClick={()=>setPaymentOpen(false)} style={secondaryButton}>Close</button><button disabled={paymentSaving} onClick={savePayment} style={primaryButton}>{paymentSaving?"Recording…":"Add Payment"}</button></div></div></div></div>}
  </div>;
}

const inputStyle: React.CSSProperties = { width:"100%",marginTop:6,padding:11,borderRadius:8,border:"1px solid #334049",background:"#11181d",color:"#eef3f6" };
const messageStyle: React.CSSProperties = { padding:"10px 12px",border:"1px solid #39454c",borderRadius:8,color:"#c9d0d5",fontSize:11 };
const primaryButton: React.CSSProperties = { padding:"10px 15px",borderRadius:8,border:0,background:"#1e9f55",color:"white",fontWeight:800,cursor:"pointer" };
const secondaryButton: React.CSSProperties = { padding:"10px 14px",borderRadius:8,border:"1px solid #35414a",background:"transparent",color:"#c2cbd1",cursor:"pointer" };
