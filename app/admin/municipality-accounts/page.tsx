"use client";

import { useEffect, useMemo, useState } from "react";

type LedgerRow = {
  id: string;
  sourceId: string;
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
  paidTo: string;
  notes: string;
  createdBy: string;
};
type ProjectOption = { id: string; name: string; client: string };
type AccountOption = { code: string; name: string };
type LoadData = {
  transactions: LedgerRow[];
  projects: ProjectOption[];
  accounts: AccountOption[];
  canAddExpense?: boolean;
  canEditExpenses?: boolean;
  canSendToMainLedger?: boolean;
};
type ExpenseForm = { projectId: string; date: string; category: string; description: string; amount: string; paidTo: string; account: string; reference: string; notes: string };
type ProjectSummary = ProjectOption & { income: number; expenses: number; transferred: number; balance: number; entries: number };

const EXPENSE_CATEGORIES = [
  "Floor Fees", "Extra for 6 Storied", "Boundary Wall", "Boundary Wall Ex", "VAT 15% (1-4)", "Mayor Fund",
  "Heart Foundation", "Draftsman", "Surveyor", "Assistant Engineer", "Helpers", "Municipality Book", "Ammonia Print",
  "Mouza Map", "Stamp Bond", "Ex-Cn Passing", "Water Demand", "Bank Draft", "Architect Sign", "Consultancy", "Other",
];

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
function blankExpense(account = "", projectId = ""): ExpenseForm {
  return { projectId, date: today(), category: "Floor Fees", description: "Floor Fees", amount: "", paidTo: "", account, reference: "", notes: "" };
}

export default function MunicipalityAccountsPage() {
  const [data, setData] = useState<LoadData>({ transactions: [], projects: [], accounts: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [expenseQuery, setExpenseQuery] = useState("");
  const [expenseProject, setExpenseProject] = useState("");
  const [expenseCategory, setExpenseCategory] = useState("");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [editSourceId, setEditSourceId] = useState("");
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
      .filter((row) => !term || [row.id, row.sourceId, row.date, row.projectId, row.category, row.description, row.account, row.reference, row.paidTo, row.notes, row.createdBy].join(" ").toLowerCase().includes(term))
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }, [data.transactions, query]);

  const expenseRows = useMemo(() => {
    const term = expenseQuery.trim().toLowerCase();
    return data.transactions
      .filter((row) => row.type === "Expense" && row.sourceType === "EXPENSE" && row.sourceId)
      .filter((row) => !expenseProject || row.projectId === expenseProject)
      .filter((row) => !expenseCategory || row.category === expenseCategory)
      .filter((row) => !term || [row.sourceId, row.projectId, row.category, row.description, row.account, row.reference, row.paidTo, row.notes, row.createdBy].join(" ").toLowerCase().includes(term))
      .sort((a, b) => b.date.localeCompare(a.date) || b.sourceId.localeCompare(a.sourceId));
  }, [data.transactions, expenseQuery, expenseProject, expenseCategory]);

  const totalIncome = data.transactions.reduce((sum, row) => sum + amount(row.credit), 0);
  const totalExpense = data.transactions.reduce((sum, row) => row.sourceType === "MUNICIPALITY_TRANSFER_OUT" ? sum : sum + amount(row.debit), 0);
  const totalTransferred = data.transactions.reduce((sum, row) => row.sourceType === "MUNICIPALITY_TRANSFER_OUT" ? sum + amount(row.debit) : sum, 0);
  const balance = data.transactions.reduce((sum, row) => sum + amount(row.credit) - amount(row.debit), 0);
  const unassignedBalance = data.transactions.filter((row) => !row.projectId).reduce((sum, row) => sum + amount(row.credit) - amount(row.debit), 0);
  const filteredExpenseTotal = expenseRows.reduce((sum, row) => sum + amount(row.debit), 0);

  function openNewExpense(projectId = "") {
    setMessage("");
    setFormError("");
    setEditSourceId("");
    setExpense(blankExpense(data.accounts[0]?.name || "", projectId));
    setExpenseOpen(true);
  }

  function openExpenseEditor(row: LedgerRow) {
    if (!data.canEditExpenses || row.type !== "Expense" || row.sourceType !== "EXPENSE" || !row.sourceId) return;
    setMessage("");
    setFormError("");
    setEditSourceId(row.sourceId);
    setExpense({
      projectId: row.projectId,
      date: row.date,
      category: row.category || "Floor Fees",
      description: row.description || "",
      amount: String(row.debit || ""),
      paidTo: row.paidTo || "",
      account: row.account || row.method || data.accounts[0]?.name || "",
      reference: row.reference || "",
      notes: row.notes || "",
    });
    setExpenseOpen(true);
  }

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
          action: editSourceId ? "updateExpense" : "addExpense",
          Source_ID: editSourceId || undefined,
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
      const savedId = editSourceId;
      setExpenseOpen(false);
      setExpense(blankExpense(data.accounts[0]?.name || ""));
      setEditSourceId("");
      setMessage(savedId ? `Municipality expense ${savedId} updated successfully.` : `Municipality expense for ${expense.projectId} added successfully.`);
      setRevision((value) => value + 1);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save municipality expense.");
    } finally {
      setSaving(false);
    }
  }

  async function sendToMain(project: ProjectSummary) {
    if (!data.canSendToMainLedger || project.balance <= 0.009 || transferBusy) return;
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
      .mun-page{color:var(--lv-text);padding-bottom:28px}.mun-page *{box-sizing:border-box}.mun-head{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;margin-bottom:18px}.mun-kicker{display:block;color:#ed6963;font-size:10px;font-weight:900;letter-spacing:.14em}.mun-head h1{margin:5px 0 4px;font-size:34px;letter-spacing:-.03em}.mun-head p{margin:0;max-width:780px;color:var(--lv-muted);font-size:11px;line-height:1.55}.mun-actions{display:flex;gap:8px;flex-wrap:wrap}.mun-btn{border:1px solid var(--lv-border-strong);background:var(--lv-white);color:var(--lv-text);border-radius:9px;padding:9px 12px;font-size:11px;font-weight:900;cursor:pointer}.mun-btn.primary{background:#d94b45;border-color:#d94b45;color:#fff}.mun-btn.small{padding:7px 10px;font-size:10px}.mun-btn.transfer{border-color:rgba(79,124,89,.35);background:rgba(79,124,89,.08);color:var(--lv-good)}.mun-btn.deficit{border-color:rgba(191,75,75,.35);background:rgba(191,75,75,.08);color:var(--lv-danger)}.mun-btn:disabled{opacity:.45;cursor:not-allowed}.mun-note{padding:10px 12px;border-radius:9px;margin-bottom:12px;border:1px solid rgba(79,124,89,.28);background:rgba(79,124,89,.08);color:var(--lv-good);font-size:11px}.mun-note.error{border-color:rgba(191,75,75,.28);background:rgba(191,75,75,.08);color:var(--lv-danger)}.mun-note.warn{border-color:rgba(180,122,39,.3);background:rgba(180,122,39,.08);color:var(--lv-warning)}.mun-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}.mun-card{border:1px solid var(--lv-border);background:var(--lv-surface);border-radius:12px;padding:16px}.mun-card span{display:block;color:var(--lv-muted);font-size:9px;text-transform:uppercase;letter-spacing:.08em}.mun-card strong{display:block;margin-top:7px;font-size:21px}.mun-card.income strong{color:var(--lv-good)}.mun-card.expense strong{color:var(--lv-danger)}.mun-card.transfer strong{color:#4c78a8}.mun-section{margin-top:14px;border:1px solid var(--lv-border);background:var(--lv-surface);border-radius:12px;overflow:hidden}.mun-section.expense-workspace{border-color:rgba(217,75,69,.28)}.mun-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 15px;border-bottom:1px solid var(--lv-border)}.mun-section-head h2{margin:0;font-size:17px}.mun-section-head p{margin:3px 0 0;color:var(--lv-muted);font-size:10px}.mun-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.mun-search,.mun-filter{background:var(--lv-white);color:var(--lv-text);border:1px solid var(--lv-border-strong);border-radius:8px;padding:9px 10px;color-scheme:light}.mun-search{width:min(350px,100%)}.mun-filter{min-width:150px}.mun-work-summary{display:flex;gap:16px;align-items:center;padding:10px 15px;background:var(--lv-paper);border-bottom:1px solid var(--lv-border);font-size:10px;color:var(--lv-muted)}.mun-work-summary strong{color:var(--lv-text)}.mun-table-wrap{overflow:auto}.mun-table{width:100%;border-collapse:collapse;min-width:1120px}.mun-table.expenses{min-width:1180px}.mun-table th,.mun-table td{padding:11px 12px;border-bottom:1px solid var(--lv-border);text-align:left;font-size:11px;vertical-align:middle}.mun-table th{font-size:9px;color:var(--lv-muted);text-transform:uppercase;letter-spacing:.06em;background:var(--lv-paper)}.mun-table tr:hover td{background:rgba(127,139,150,.04)}.mun-table .num{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.mun-positive{color:var(--lv-good);font-weight:900}.mun-negative{color:var(--lv-danger);font-weight:900}.mun-blue{color:#4c78a8;font-weight:900}.mun-type{display:inline-flex;border:1px solid;border-radius:999px;padding:4px 8px;font-size:9px;font-weight:900}.mun-type.income{color:var(--lv-good);border-color:rgba(79,124,89,.28);background:rgba(79,124,89,.08)}.mun-type.expense{color:var(--lv-danger);border-color:rgba(191,75,75,.28);background:rgba(191,75,75,.08)}.mun-type.transfer{color:#4c78a8;border-color:rgba(76,120,168,.28);background:rgba(76,120,168,.08)}.mun-sub{display:block;margin-top:3px;color:var(--lv-muted);font-size:9px}.mun-file-link{color:var(--lv-text);text-decoration:none;font-weight:900}.mun-file-link:hover{color:#d94b45;text-decoration:underline}.mun-empty{padding:26px;text-align:center;color:var(--lv-muted)}.mun-action-cell{display:flex;gap:6px;white-space:nowrap}.mun-backdrop{position:fixed;inset:0;z-index:110;background:rgba(0,0,0,.48);display:grid;place-items:center;padding:16px}.mun-modal{width:min(720px,100%);max-height:92vh;overflow:auto;border:1px solid var(--lv-border-strong);background:var(--lv-surface);color:var(--lv-text);border-radius:12px;padding:20px}.mun-modal h2{margin:0 0 4px}.mun-modal>p{margin:0 0 16px;color:var(--lv-muted);font-size:11px}.mun-edit-id{display:inline-flex;margin:0 0 14px;padding:5px 8px;border-radius:7px;background:var(--lv-paper);border:1px solid var(--lv-border);font-size:9px;font-weight:900}.mun-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.mun-field{display:flex;flex-direction:column;gap:6px}.mun-field.full{grid-column:1/-1}.mun-field label{font-size:9px;font-weight:900;text-transform:uppercase;color:var(--lv-text)}.mun-field input,.mun-field select,.mun-field textarea{background:var(--lv-white);color:var(--lv-text);border:1px solid var(--lv-border-strong);border-radius:8px;padding:10px;min-height:42px;color-scheme:light}.mun-field textarea{min-height:78px;resize:vertical}.mun-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}@media(max-width:1000px){.mun-metrics{grid-template-columns:1fr 1fr}.mun-head{align-items:flex-start;flex-direction:column}.mun-section-head{align-items:stretch;flex-direction:column}.mun-toolbar>*{flex:1;min-width:180px}.mun-grid{grid-template-columns:1fr}.mun-field.full{grid-column:auto}}@media(max-width:620px){.mun-metrics{grid-template-columns:1fr}.mun-actions{width:100%}.mun-actions .mun-btn{flex:1}.mun-work-summary{align-items:flex-start;flex-direction:column;gap:4px}.mun-toolbar>*{min-width:100%;width:100%}}
    `}</style>

    <header className="mun-head">
      <div><span className="mun-kicker">LAND VIEW / CONTROLLED PROJECT FUNDS</span><h1>Municipality Accounts</h1><p>Manage municipality receipts, project expenses and remaining balances from one place. Expense records can be opened, corrected and saved back to the original entry without creating duplicates.</p></div>
      <div className="mun-actions">{data.canAddExpense !== false && <button className="mun-btn primary" onClick={() => openNewExpense()}>+ Municipality Expense</button>}</div>
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

    <section className="mun-section expense-workspace">
      <div className="mun-section-head">
        <div><h2>Municipality Expenses</h2><p>Dedicated expense workspace. Filter records, review payee/reference details and edit the original expense directly.</p></div>
        <div className="mun-toolbar">
          <input className="mun-search" type="search" value={expenseQuery} onChange={(event) => setExpenseQuery(event.target.value)} placeholder="Search expense, payee, reference…" />
          <select className="mun-filter" value={expenseProject} onChange={(event) => setExpenseProject(event.target.value)}><option value="">All projects</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.id}</option>)}</select>
          <select className="mun-filter" value={expenseCategory} onChange={(event) => setExpenseCategory(event.target.value)}><option value="">All categories</option>{EXPENSE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select>
        </div>
      </div>
      <div className="mun-work-summary"><span><strong>{expenseRows.length}</strong> expense entr{expenseRows.length === 1 ? "y" : "ies"}</span><span>Filtered total: <strong className="mun-negative">{money(filteredExpenseTotal)}</strong></span>{(expenseProject || expenseCategory || expenseQuery) && <button className="mun-btn small" onClick={() => { setExpenseProject(""); setExpenseCategory(""); setExpenseQuery(""); }}>Clear filters</button>}</div>
      {loading ? <div className="mun-empty">Loading municipality expenses…</div> : expenseRows.length === 0 ? <div className="mun-empty">No municipality expenses match the current filters.</div> : <div className="mun-table-wrap"><table className="mun-table expenses"><thead><tr><th>Date</th><th>File ID</th><th>Category / Details</th><th>Paid To</th><th>Account</th><th>Reference</th><th className="num">Amount</th><th>Added By</th><th>Action</th></tr></thead><tbody>{expenseRows.map((row) => <tr key={row.sourceId}><td>{displayDate(row.date)}</td><td><a className="mun-file-link" href={`/admin/municipality-accounts/${encodeURIComponent(row.projectId)}`}>{row.projectId || "—"}</a><span className="mun-sub">{row.sourceId}</span></td><td><strong>{row.category}</strong><span className="mun-sub">{row.description}</span>{row.notes && <span className="mun-sub">Note: {row.notes}</span>}</td><td>{row.paidTo || "—"}</td><td>{row.account || row.method || "—"}</td><td>{row.reference || "—"}</td><td className="num mun-negative">{money(row.debit)}</td><td>{row.createdBy || "—"}</td><td><div className="mun-action-cell">{data.canEditExpenses ? <button type="button" className="mun-btn small" onClick={() => openExpenseEditor(row)}>Edit Expense</button> : "—"}</div></td></tr>)}</tbody></table></div>}
    </section>

    <section className="mun-section">
      <div className="mun-section-head"><div><h2>Project balances</h2><p>Review each project balance, add a project-specific expense or send the settled remaining balance to Main Ledger.</p></div></div>
      {loading ? <div className="mun-empty">Loading project municipality balances…</div> : projectSummaries.length === 0 ? <div className="mun-empty">No project municipality balances yet.</div> : <div className="mun-table-wrap"><table className="mun-table"><thead><tr><th>File ID / Project</th><th className="num">Received</th><th className="num">Expenses</th><th className="num">Sent Main</th><th className="num">Remaining</th><th>Action</th></tr></thead><tbody>{projectSummaries.map((project) => <tr key={project.id}><td><a className="mun-file-link" href={`/admin/municipality-accounts/${encodeURIComponent(project.id)}`}>{project.id} — {project.client || project.name || project.id}</a><span className="mun-sub">{project.name && project.name !== project.client ? project.name : `${project.entries} municipality entr${project.entries === 1 ? "y" : "ies"}`}</span></td><td className="num mun-positive">{money(project.income)}</td><td className="num mun-negative">{money(project.expenses)}</td><td className="num mun-blue">{money(project.transferred)}</td><td className={`num ${project.balance < 0 ? "mun-negative" : "mun-positive"}`}>{money(project.balance)}</td><td><div className="mun-action-cell">{data.canAddExpense !== false && <button className="mun-btn small" onClick={() => openNewExpense(project.id)}>+ Expense</button>}{data.canSendToMainLedger && <button className={`mun-btn small ${project.balance < -0.009 ? "deficit" : "transfer"}`} disabled={project.balance <= 0.009 || Boolean(transferBusy)} onClick={() => void sendToMain(project)}>{transferBusy === project.id ? "Sending…" : project.balance > 0.009 ? "Send Main" : project.balance < -0.009 ? "Deficit" : "Settled"}</button>}</div></td></tr>)}</tbody></table></div>}
    </section>

    <section className="mun-section">
      <div className="mun-section-head"><div><h2>Complete Municipality Ledger</h2><p>All receipts, expenses and Main Ledger transfers remain available here for audit and reconciliation.</p></div><input className="mun-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search file ID, details, reference or account…" /></div>
      {loading ? <div className="mun-empty">Loading Municipality Accounts…</div> : rows.length === 0 ? <div className="mun-empty">No municipality transactions found.</div> : <div className="mun-table-wrap"><table className="mun-table"><thead><tr><th>Date</th><th>Type</th><th>File ID</th><th>Particulars</th><th>Account / Reference</th><th className="num">Expense / Out</th><th className="num">Income</th><th>Added By</th><th>Action</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{displayDate(row.date)}</td><td><span className={`mun-type ${row.type.toLowerCase()}`}>{row.type}</span></td><td>{row.projectId ? <a className="mun-file-link" href={`/admin/municipality-accounts/${encodeURIComponent(row.projectId)}`}>{row.projectId}</a> : <strong>—</strong>}<span className="mun-sub">{row.id}</span></td><td><strong>{row.description}</strong><span className="mun-sub">{row.category}</span></td><td>{row.account || row.method || "—"}<span className="mun-sub">{row.reference || "No reference"}</span></td><td className={`num ${row.type === "Transfer" ? "mun-blue" : "mun-negative"}`}>{row.debit > 0 ? money(row.debit) : "—"}</td><td className="num mun-positive">{row.credit > 0 ? money(row.credit) : "—"}</td><td>{row.createdBy || "—"}</td><td>{data.canEditExpenses && row.type === "Expense" && row.sourceType === "EXPENSE" && row.sourceId ? <button type="button" className="mun-btn small" onClick={() => openExpenseEditor(row)}>Edit</button> : "—"}</td></tr>)}</tbody></table></div>}
    </section>

    {expenseOpen && <div className="mun-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setExpenseOpen(false); }}><div className="mun-modal" role="dialog" aria-modal="true" aria-label={editSourceId ? "Edit Municipality Expense" : "Add Municipality Expense"}>
      <h2>{editSourceId ? "Edit Municipality Expense" : "Add Municipality Expense"}</h2>
      <p>{editSourceId ? "Saving changes updates the original municipality expense and its linked ledger transaction; it does not create a duplicate." : "Record a municipality-related project expense. The amount immediately reduces that project's municipality balance."}</p>
      {editSourceId && <div className="mun-edit-id">Editing {editSourceId}</div>}
      {formError && <div className="mun-note error">{formError}</div>}
      <div className="mun-grid">
        <div className="mun-field full"><label>Project</label><select value={expense.projectId} onChange={(e) => setExpense((f) => ({ ...f, projectId: e.target.value }))}><option value="">Choose project</option>{data.projects.map((project) => <option key={project.id} value={project.id}>{project.id} — {project.client || project.name || project.id}{project.name && project.name !== project.client ? ` — ${project.name}` : ""}</option>)}</select></div>
        <div className="mun-field"><label>Expense date</label><input type="date" value={expense.date} onChange={(e) => setExpense((f) => ({ ...f, date: e.target.value }))}/></div>
        <div className="mun-field"><label>Category</label><select value={expense.category} onChange={(e) => setExpense((f) => ({ ...f, category: e.target.value, description: !f.description || EXPENSE_CATEGORIES.includes(f.description) ? e.target.value : f.description }))}>{EXPENSE_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></div>
        <div className="mun-field full"><label>Expense details</label><input value={expense.description} onChange={(e) => setExpense((f) => ({ ...f, description: e.target.value }))} placeholder="e.g. Floor Fees for approval file"/></div>
        <div className="mun-field"><label>Amount (BDT)</label><input inputMode="decimal" value={expense.amount} onChange={(e) => setExpense((f) => ({ ...f, amount: e.target.value.replace(/[^0-9.]/g, "") }))}/></div>
        <div className="mun-field"><label>Paid to</label><input value={expense.paidTo} onChange={(e) => setExpense((f) => ({ ...f, paidTo: e.target.value }))} placeholder="Municipality / person / office"/></div>
        <div className="mun-field"><label>Paid from account</label><select value={expense.account} onChange={(e) => setExpense((f) => ({ ...f, account: e.target.value }))}><option value="">Choose account</option>{data.accounts.map((account) => <option key={`${account.code}-${account.name}`} value={account.name}>{account.name}</option>)}</select></div>
        <div className="mun-field"><label>Reference</label><input value={expense.reference} onChange={(e) => setExpense((f) => ({ ...f, reference: e.target.value }))} placeholder="Receipt / memo / transaction ref"/></div>
        <div className="mun-field full"><label>Notes</label><textarea value={expense.notes} onChange={(e) => setExpense((f) => ({ ...f, notes: e.target.value }))} placeholder="Optional internal notes"/></div>
      </div>
      <div className="mun-modal-actions"><button className="mun-btn" disabled={saving} onClick={() => setExpenseOpen(false)}>Cancel</button><button className="mun-btn primary" disabled={saving} onClick={() => void saveExpense()}>{saving ? "Saving…" : editSourceId ? "Save Changes" : "Save Expense"}</button></div>
    </div></div>}
  </div>;
}