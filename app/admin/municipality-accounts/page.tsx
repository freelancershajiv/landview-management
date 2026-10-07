"use client";

import { useEffect, useMemo, useState } from "react";

type LedgerRow = {
  id: string;
  date: string;
  type: "Income" | "Expense" | "Transfer";
  sourceType: string;
  projectId: string;
  category: string;
  description: string;
  debit: number;
  credit: number;
  account: string;
  method: string;
  reference: string;
  createdBy: string;
};
type ProjectOption = { id: string; name: string; client: string };
type AccountOption = { code: string; name: string };
type LoadData = { transactions: LedgerRow[]; projects: ProjectOption[]; accounts: AccountOption[] };
type ExpenseForm = { projectId: string; date: string; category: string; description: string; amount: string; paidTo: string; account: string; reference: string; notes: string };
type ProjectSummary = ProjectOption & { income: number; expenses: number; transferred: number; balance: number; entries: number };

const EXPENSE_CATEGORIES = ["Municipality Fee", "Submission Fee", "Land NOC", "Approval Fee", "Vetting / Committee Fee", "Transport", "Printing / Documentation", "Staff Commission / Bonus", "Other"];

function today() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value || "";
  const month = parts.find((part) => part.type === "month")?.value || "";
  const day = parts.find((part) => part.type === "day")?.value || "";
  return year && month && day ? `${year}-${month}-${day}` : new Date().toISOString().slice(0, 10);
}
function amount(value: unknown) {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function money(value: number) {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);
}
function displayDate(value: string) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
async function requestJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Request failed."));
  return json.data;
}
function blankExpense(account = ""): ExpenseForm {
  return { projectId: "", date: today(), category: "Municipality Fee", description: "", amount: "", paidTo: "", account, reference: "", notes: "" };
}

export default function MunicipalityAccountsPage() {
  const [data, setData] = useState<LoadData>({ transactions: [], projects: [], accounts: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [transferBusy, setTransferBusy] = useState("");
  const [formError, setFormError] = useState("");
  const [expense, setExpense] = useState<ExpenseForm>(blankExpense());
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    requestJson("/api/municipality-file-pass")
      .then((result: LoadData) => {
        if (cancelled) return;
        setData(result);
        setExpense((current) => current.account ? current : { ...current, account: result.accounts[0]?.name || "" });
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load Municipality Accounts."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [revision]);

  const projectMap = useMemo(() => new Map(data.projects.map((project) => [project.id, project])), [data.projects]);

  const projectSummaries = useMemo<ProjectSummary[]>(() => {
    const map = new Map<string, ProjectSummary>();
    for (const row of data.transactions) {
      if (!row.projectId) continue;
      const meta = projectMap.get(row.projectId) || { id: row.projectId, name: "", client: "" };
      const current = map.get(row.projectId) || { ...meta, income: 0, expenses: 0, transferred: 0, balance: 0, entries: 0 };
      current.income += amount(row.credit);
      if (row.sourceType === "MUNICIPALITY_TRANSFER_OUT") current.transferred += amount(row.debit);
      else current.expenses += amount(row.debit);
      current.balance += amount(row.credit) - amount(row.debit);
      current.entries += 1;
      map.set(row.projectId, current);
    }
    return [...map.values()].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  }, [data.transactions, projectMap]);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return [...data.transactions]
      .filter((row) => !term || [row.id, row.date, row.projectId, row.category, row.description, row.account, row.reference, row.createdBy].join(" ").toLowerCase().includes(term))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }, [data.transactions, query]);

  const totalIncome = data.transactions.reduce((sum, row) => sum + amount(row.credit), 0);
  const totalExpense = data.transactions.reduce((sum, row) => row.sourceType === "MUNICIPALITY_TRANSFER_OUT" ? sum : sum + amount(row.debit), 0);
  const totalTransferred = data.transactions.reduce((sum, row) => row.sourceType === "MUNICIPALITY_TRANSFER_OUT" ? sum + amount(row.debit) : sum, 0);
  const balance = data.transactions.reduce((sum, row) => sum + amount(row.credit) - amount(row.debit), 0);
  const unassignedBalance = data.transactions.filter((row) => !row.projectId).reduce((sum, row) => sum + amount(row.credit) - amount(row.debit), 0);

  async function saveExpense() {
    const value = amount(expense.amount);
    if (!expense.projectId) return setFormError("Choose a project.");
    if (!expense.date) return setFormError("Choose the expense date.");
    if (!(value > 0)) return setFormError("Enter a valid expense amount.");
    if (!expense.account) return setFormError("Choose the account used for payment.");
    if (!expense.description.trim()) return setFormError("Enter the expense details.");
    setSaving(true);
    setFormError("");
    try {
      await requestJson("/api/municipality-file-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addExpense",
          Project_ID: expense.projectId,
          Expense_Date: expense.date,
          Category: expense.category,
          Description: expense.description.trim(),
          Amount: value,
          Paid_To: expense.paidTo.trim(),
          Account: expense.account,
          Reference_No: expense.reference.trim(),
          Notes: expense.notes.trim(),
        }),
      });
      setExpenseOpen(false);
      setExpense(blankExpense(data.accounts[0]?.name || ""));
      setMessage(`Municipality expense for ${expense.projectId} added successfully.`);
      setRevision((value) => value + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save municipality expense.");
    } finally {
      setSaving(false);
    }
  }

  async function sendToMain(project: ProjectSummary) {
    if (project.balance <= 0.009 || transferBusy) return;
    const confirmed = window.confirm(`Send the remaining ${money(project.balance)} municipality balance for ${project.id} to the Main Accounts Ledger?\n\nThe Main Ledger entry date will be today's click date (${displayDate(today())}).`);
    if (!confirmed) return;
    setTransferBusy(project.id);
    setError("");
    setMessage("");
    try {
      const result = await requestJson("/api/municipality-file-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sendToMainLedger", Project_ID: project.id }),
      });
      setMessage(`${money(amount(result.amount))} from ${project.id} was sent to the Main Accounts Ledger on ${displayDate(String(result.date || today()))}.`);
      setRevision((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send municipality balance to Main Ledger.");
    } finally {
      setTransferBusy("");
    }
  }

  return <div className="mun-page">
    <style>{`
      .mun-page{color:var(--theme-ink-_edf2f5,#edf2f5);padding-bottom:28px}.mun-page *{box-sizing:border-box}.mun-head{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin-bottom:18px}.mun-kicker{display:block;color:#ed6963;font-size:10px;font-weight:900;letter-spacing:.14em}.mun-head h1{margin:5px 0 4px;font-size:34px;letter-spacing:-.03em}.mun-head p{margin:0;max-width:760px;color:var(--theme-ink-_8d99a2,#8d99a2);font-size:11px;line-height:1.55}.mun-actions{display:flex;gap:8px}.mun-btn{border:1px solid var(--theme-line-_3b4650,#3b4650);background:var(--theme-bg-_151d24,#151d24);color:var(--theme-ink-_eef3f6,#eef3f6);border-radius:9px;padding:9px 12px;font-size:11px;font-weight:900;cursor:pointer}.mun-btn.primary{background:#d94b45;border-color:#d94b45;color:#fff}.mun-btn.transfer{border-color:#355d45;background:#17271e;color:#a9deb8}.mun-btn.deficit{border-color:#713d38;background:#321f1d;color:#ffaaa3}.mun-btn:disabled{opacity:.45;cursor:not-allowed}.mun-note{padding:10px 12px;border-radius:9px;margin-bottom:12px;border:1px solid var(--theme-line-_31513d,#31513d);background:var(--theme-bg-_18281f,#18281f);color:var(--theme-ink-_a9deb8,#a9deb8);font-size:11px}.mun-note.error{border-color:#713d38;background:#321f1d;color:#ffaaa3}.mun-note.warn{border-color:#6b5b32;background:#2b2518;color:#ecd080}.mun-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}.mun-card{border:1px solid var(--theme-line-_303d47,#303d47);background:var(--theme-bg-_111920,#111920);border-radius:12px;padding:16px}.mun-card span{display:block;color:var(--theme-ink-_8d99a2,#8d99a2);font-size:9px;text-transform:uppercase;letter-spacing:.08em}.mun-card strong{display:block;margin-top:7px;font-size:21px}.mun-card.income strong{color:#9fd7ae}.mun-card.expense strong{color:#ff9e98}.mun-card.transfer strong{color:#9fc3e7}.mun-section{margin-top:14px;border:1px solid var(--theme-line-_303d47,#303d47);background:var(--theme-bg-_10181f,#10181f);border-radius:12px;overflow:hidden}.mun-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 15px;border-bottom:1px solid var(--theme-line-_27313a,#27313a)}.mun-section-head h2{margin:0;font-size:17px}.mun-section-head p{margin:3px 0 0;color:#84919a;font-size:10px}.mun-search{width:min(390px,100%);background:#0d141a;color:#fff;border:1px solid #36414a;border-radius:8px;padding:9px 10px}.mun-table-wrap{overflow:auto}.mun-table{width:100%;border-collapse:collapse;min-width:1050px}.mun-table th,.mun-table td{padding:11px 12px;border-bottom:1px solid var(--theme-line-_27313a,#27313a);text-align:left;font-size:11px}.mun-table th{font-size:9px;color:var(--theme-ink-_8f9aa3,#8f9aa3);text-transform:uppercase;letter-spacing:.06em;background:#111a21}.mun-table .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.mun-positive{color:#9fd7ae;font-weight:900}.mun-negative{color:#ff9e98;font-weight:900}.mun-blue{color:#9fc3e7;font-weight:900}.mun-type{display:inline-flex;border:1px solid;border-radius:999px;padding:4px 8px;font-size:9px;font-weight:900}.mun-type.income{color:#9fd7ae;border-color:#31513d;background:#18281f}.mun-type.expense{color:#ffaaa3;border-color:#713d38;background:#321f1d}.mun-type.transfer{color:#9fc3e7;border-color:#34506b;background:#172331}.mun-sub{display:block;margin-top:3px;color:#84919a;font-size:9px}.mun-empty{padding:26px;text-align:center;color:#8f9aa3}.mun-backdrop{position:fixed;inset:0;z-index:110;background:rgba(0,0,0,.72);display:grid;place-items:center;padding:16px}.mun-modal{width:min(700px,100%);max-height:92vh;overflow:auto;border:1px solid #3a4650;background:#151d24;border-radius:12px;padding:20px}.mun-modal h2{margin:0 0 4px}.mun-modal>p{margin:0 0 16px;color:#9ba7b0;font-size:11px}.mun-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.mun-field{display:flex;flex-direction:column;gap:6px}.mun-field.full{grid-column:1/-1}.mun-field label{font-size:9px;font-weight:900;text-transform:uppercase;color:#c7d0d7}.mun-field input,.mun-field select,.mun-field textarea{background:#0d141a;color:#fff;border:1px solid #36414a;border-radius:8px;padding:10px;min-height:42px;color-scheme:dark}.mun-field textarea{min-height:78px;resize:vertical}.mun-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}@media(max-width:900px){.mun-metrics{grid-template-columns:1fr 1fr}.mun-head{align-items:flex-start;flex-direction:column}.mun-section-head{align-items:stretch;flex-direction:column}.mun-grid{grid-template-columns:1fr}.mun-field.full{grid-column:auto}}@media(max-width:620px){.mun-metrics{grid-template-columns:1fr}.mun-actions{width:100%}.mun-actions .mun-btn{flex:1}}
    `}</style>

    <header className="mun-head">
      <div><span className="mun-kicker">LAND VIEW / CONTROLLED PROJECT FUNDS</span><h1>Municipality Accounts</h1><p>Municipality client payments stay here first. Record the project&apos;s municipality-related expenses here, then send only the remaining project balance to the Main Accounts Ledger when the work is settled.</p></div>
      <div className="mun-actions"><button className="mun-btn primary" onClick={() => { setMessage(""); setFormError(""); setExpense(blankExpense(data.accounts[0]?.name || "")); setExpenseOpen(true); }}>+ Municipality Expense</button></div>
    </header>

    {message && <div className="mun-note">{message}</div>}
    {error && <div className="mun-note error">{error}</div>}
    {Math.abs(unassignedBalance) > 0.009 && <div className="mun-note warn">Legacy municipality entries without a project currently have a net balance of {money(unassignedBalance)}. They are shown in the ledger but cannot be sent to Main Ledger until they are assigned to a project.</div>}

    <section className="mun-metrics">
      <div className="mun-card income"><span>Municipality money received</span><strong>{money(totalIncome)}</strong></div>
      <div className="mun-card expense"><span>Municipality expenses</span><strong>{money(totalExpense)}</strong></div>
      <div className="mun-card transfer"><span>Sent to Main Ledger</span><strong>{money(totalTransferred)}</strong></div>
      <div className="mun-card"><span>Available municipality balance</span><strong className={balance < 0 ? "mun-negative" : "mun-positive"}>{money(balance)}</strong></div>
    </section>

    <section className="mun-section">
      <div className="mun-section-head"><div><h2>Project balances</h2><p>Send to Main Ledger transfers the entire remaining balance for that project using the click date.</p></div></div>
      {loading ? <div className="mun-empty">Loading project municipality balances…</div> : projectSummaries.length === 0 ? <div className="mun-empty">No project municipality balances yet.</div> : <div className="mun-table-wrap"><table className="mun-table"><thead><tr><th>File ID / Project</th><th className="num">Received</th><th className="num">Expenses</th><th className="num">Sent Main</th><th className="num">Remaining</th><th>Action</th></tr></thead><tbody>{projectSummaries.map((project) => <tr key={project.id}><td><strong>{project.id} — {project.client || project.name || project.id}</strong><span className="mun-sub">{project.name && project.name !== project.client ? project.name : `${project.entries} municipality entr${project.entries === 1 ? "y" : "ies"}`}</span></td><td className="num mun-positive">{money(project.income)}</td><td className="num mun-negative">{money(project.expenses)}</td><td className="num mun-blue">{money(project.transferred)}</td><td className={`num ${project.balance < 0 ? "mun-negative" : "mun-positive"}`}>{money(project.balance)}</td><td><button className={`mun-btn ${project.balance < -0.009 ? "deficit" : "transfer"}`} disabled={project.balance <= 0.009 || Boolean(transferBusy)} onClick={() => void sendToMain(project)}>{transferBusy === project.id ? "Sending…" : project.balance > 0.009 ? "Send to Main Ledger" : project.balance < -0.009 ? "Deficit" : "Settled"}</button></td></tr>)}</tbody></table></div>}
    </section>

    <section className="mun-section">
      <div className="mun-section-head"><div><h2>Municipality ledger</h2><p>Billing receipts, project municipality expenses and transfers to Main Ledger.</p></div><input className="mun-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search file ID, details, reference or account…" /></div>
      {loading ? <div className="mun-empty">Loading Municipality Accounts…</div> : rows.length === 0 ? <div className="mun-empty">No municipality transactions found.</div> : <div className="mun-table-wrap"><table className="mun-table"><thead><tr><th>Date</th><th>Type</th><th>File ID</th><th>Particulars</th><th>Account / Reference</th><th className="num">Expense / Out</th><th className="num">Income</th><th>Added By</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{displayDate(row.date)}</td><td><span className={`mun-type ${row.type.toLowerCase()}`}>{row.type}</span></td><td><strong>{row.projectId || "—"}</strong><span className="mun-sub">{row.id}</span></td><td><strong>{row.description}</strong><span className="mun-sub">{row.category}</span></td><td>{row.account || row.method || "—"}<span className="mun-sub">{row.reference || "No reference"}</span></td><td className={`num ${row.type === "Transfer" ? "mun-blue" : "mun-negative"}`}>{row.debit > 0 ? money(row.debit) : "—"}</td><td className="num mun-positive">{row.credit > 0 ? money(row.credit) : "—"}</td><td>{row.createdBy || "—"}</td></tr>)}</tbody></table></div>}
    </section>

    {expenseOpen && <div className="mun-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setExpenseOpen(false); }}><div className="mun-modal" role="dialog" aria-modal="true" aria-label="Add Municipality Expense"><h2>Add Municipality Expense</h2><p>This expense stays inside Municipality Accounts and reduces that project&apos;s remaining municipality balance.</p>{formError && <div className="mun-note error">{formError}</div>}<div className="mun-grid">
      <div className="mun-field full"><label>Project</label><select value={expense.projectId} onChange={(e) => setExpense((f) => ({ ...f, projectId: e.target.value }))}><option value="">Choose project</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.id} — {project.client || project.name || project.id}{project.name && project.name !== project.client ? ` — ${project.name}` : ""}</option>)}</select></div>
      <div className="mun-field"><label>Expense date</label><input type="date" value={expense.date} onChange={(e) => setExpense((f) => ({ ...f, date: e.target.value }))}/></div>
      <div className="mun-field"><label>Category</label><select value={expense.category} onChange={(e) => setExpense((f) => ({ ...f, category: e.target.value }))}>{EXPENSE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></div>
      <div className="mun-field full"><label>Expense details</label><input value={expense.description} onChange={(e) => setExpense((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. Municipality approval fee"/></div>
      <div className="mun-field"><label>Amount (BDT)</label><input inputMode="decimal" value={expense.amount} onChange={(e) => setExpense((f) => ({ ...f, amount: e.target.value.replace(/[^0-9.]/g, "") }))}/></div>
      <div className="mun-field"><label>Paid to</label><input value={expense.paidTo} onChange={(e) => setExpense((f) => ({ ...f, paidTo: e.target.value }))} placeholder="Municipality / person / office"/></div>
      <div className="mun-field"><label>Paid from account</label><select value={expense.account} onChange={(e) => setExpense((f) => ({ ...f, account: e.target.value }))}><option value="">Choose account</option>{data.accounts.map((account) => <option key={`${account.code}-${account.name}`} value={account.name}>{account.name}</option>)}</select></div>
      <div className="mun-field"><label>Reference</label><input value={expense.reference} onChange={(e) => setExpense((f) => ({ ...f, reference: e.target.value }))} placeholder="Receipt / memo / transaction ref"/></div>
      <div className="mun-field full"><label>Notes</label><textarea value={expense.notes} onChange={(e) => setExpense((f) => ({ ...f, notes: e.target.value }))}/></div>
    </div><div className="mun-modal-actions"><button className="mun-btn" disabled={saving} onClick={() => setExpenseOpen(false)}>Cancel</button><button className="mun-btn primary" disabled={saving} onClick={() => void saveExpense()}>{saving ? "Saving…" : "Save Expense"}</button></div></div></div>}
  </div>;
}