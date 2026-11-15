"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./writeoffs.css";

type Category = "Engineering Bill" | "Supervision Bill" | "Other Services Bill";
type Action = "saveWriteOff" | "recoverWriteOff";
type Entry = {
  id: string; writeoffCode: string; projectId: string; projectName: string; clientName: string;
  category: string; eventType: "write_off" | "recovery"; amount: number; date: string;
  reason: string; notes: string; createdBy: string; paymentId: string;
};
type Due = {
  projectId: string; projectName: string; clientName: string; engineeringDue: number;
  supervisionDue: number; otherDue: number; totalDue: number; writeoffTotal: number;
};
const CATEGORIES: Category[] = ["Engineering Bill", "Supervision Bill", "Other Services Bill"];
const money = (v: number) => new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 2 }).format(v || 0);
function normalized(value: string) {
  const raw = value.trim().toUpperCase();
  const found = /^(?:LV[\s_-]*)?0*(\d+)$/.exec(raw);
  return found ? "LV-" + String(Number(found[1])).padStart(3, "0") : raw;
}
function localDate() {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
async function readJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load write-off data."));
  return json.data;
}
function categoryDue(row: Due | undefined, category: Category) {
  if (!row) return 0;
  return category === "Engineering Bill" ? row.engineeringDue :
    category === "Supervision Bill" ? row.supervisionDue : row.otherDue;
}

export default function BillingWriteoffsPage() {
  const [events, setEvents] = useState<Entry[]>([]);
  const [dues, setDues] = useState<Due[]>([]);
  const [projectId, setProjectId] = useState("");
  const [category, setCategory] = useState<Category>("Engineering Bill");
  const [action, setAction] = useState<Action>("saveWriteOff");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localDate);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [method, setMethod] = useState("Bank Transfer");
  const [account, setAccount] = useState("Bank Account");
  const [reference, setReference] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const requestKey = useRef("");
  const posting = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [history, receivables] = await Promise.all([
        readJson("/api/billing/writeoffs"),
        readJson("/api/billing/due-bills"),
      ]);
      setEvents(Array.isArray(history) ? history : []);
      setDues(Array.isArray(receivables?.rows) ? receivables.rows : []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load write-offs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = params.get("fileId") || params.get("projectId");
    if (initial) setProjectId(normalized(initial));
    void refresh();
  }, [refresh]);

  const code = normalized(projectId);
  const matchingDue = dues.find((item) => normalized(item.projectId) === code);
  const projectEvents = events.filter((item) => normalized(item.projectId) === code);
  const activeByCategory = useMemo(() => {
    const balances = new Map<string, number>();
    for (const row of events) {
      const key = normalized(row.projectId) + "|" + row.category;
      balances.set(key, (balances.get(key) || 0) + (row.eventType === "recovery" ? -Number(row.amount) : Number(row.amount)));
    }
    return balances;
  }, [events]);
  const recoverable = Math.max(0, activeByCategory.get(code + "|" + category) || 0);
  const collectible = Math.max(0, categoryDue(matchingDue, category));
  const limit = action === "saveWriteOff" ? collectible : recoverable;
  const value = Number(amount);
  const grossWritten = events.filter((item) => item.eventType === "write_off").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const totalRecovered = events.filter((item) => item.eventType === "recovery").reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const activeWritten = [...activeByCategory.values()].reduce((sum, val) => sum + Math.max(0, val), 0);
  const projectChoices = useMemo(() => {
    const choices = new Map<string, string>();
    for (const row of dues) choices.set(normalized(row.projectId), row.clientName || row.projectName || "");
    for (const row of events) if (!choices.has(normalized(row.projectId))) choices.set(normalized(row.projectId), row.clientName || row.projectName || "");
    return [...choices.entries()].sort((a, b) => b[0].localeCompare(a[0], undefined, { numeric: true }));
  }, [dues, events]);
  const history = (code ? projectEvents : events).slice().reverse();

  function edit(change: () => void) {
    requestKey.current = "";
    setError("");
    setSuccess("");
    change();
  }

  async function submit() {
    if (posting.current) return;
    if (!code || !/^LV-\d+$/.test(code)) return setError("Choose a valid LAND VIEW project ID.");
    if (!Number.isFinite(value) || value <= 0 || !/^\d+(\.\d{1,2})?$/.test(amount.trim())) return setError("Enter a positive amount with up to two decimal places.");
    if (!Number.isFinite(limit) || limit <= 0) return setError(action === "saveWriteOff" ? "No collectible due in this category. Check Due Bills." : "No active write-off to recover in this category.");
    if (value > limit + 0.009) return setError("Amount cannot exceed the available " + (action === "saveWriteOff" ? "collectible due" : "write-off balance") + " of " + money(limit) + ".");
    if (action === "saveWriteOff" && (!reason.trim() || !notes.trim())) return setError("A reason and explanation are required.");
    if (action === "recoverWriteOff" && (!method.trim() || !account.trim())) return setError("Enter the payment method and receiving account.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError("Choose a valid date.");

    const doingRecovery = action === "recoverWriteOff";
    const prompt = doingRecovery
      ? "Record " + money(value) + " as an actual received payment for " + code + " (" + category + ")? This creates a payment and an audited recovery record."
      : "Write off " + money(value) + " from the collectible due of " + code + " (" + category + ")? No payment will be recorded, and the original bill will remain intact.";
    if (!window.confirm(prompt)) return;

    posting.current = true;
    setBusy(true); setError(""); setSuccess("");
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
    try {
      const result = await readJson("/api/billing/writeoffs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action, projectId: code, category, amount: value, date,
          reason: reason.trim(), notes: notes.trim(), method: method.trim(),
          account: account.trim(), reference: reference.trim(), idempotencyKey: requestKey.current,
        }),
      });
      requestKey.current = "";
      setAmount(""); setReason(""); setNotes(""); setReference("");
      await refresh();
      setSuccess((doingRecovery ? "Recovery and payment recorded" : "Write-off recorded") + " — " + String(result?.writeoffCode || "saved") + ". Historical bills were not deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The action could not be completed. You can retry safely.");
    } finally {
      posting.current = false; setBusy(false);
    }
  }

  return <main className="wo-page">
    <header className="wo-header">
      <div>
        <small>LAND VIEW / BILLING CONTROLS</small>
        <h1>Write-Offs & Recoveries</h1>
        <p>Remove genuinely uncollectible balances from active dues without deleting issued bills, altering payments, or erasing the audit trail.</p>
      </div>
      <div className="wo-header-actions">
        <Link href="/admin/billing/due-bills">Due Bills</Link>
        <button type="button" disabled={loading || busy} onClick={() => void refresh()}>{loading ? "Loading…" : "Refresh"}</button>
      </div>
    </header>

    {error && <div className="wo-alert wo-error" role="alert">{error}</div>}
    {success && <div className="wo-alert wo-success" role="status">{success}</div>}
    <section className="wo-stats" aria-label="Write-off overview">
      <div><span>Lifetime Written Off</span><strong>{money(grossWritten)}</strong></div>
      <div><span>Recovered</span><strong>{money(totalRecovered)}</strong></div>
      <div><span>Currently Written Off</span><strong>{money(activeWritten)}</strong></div>
    </section>

    <div className="wo-layout">
      <section className="wo-card">
        <h2>New Transaction</h2>
        <p className="wo-hint">Only Admin, Manager and Accounts roles may post these transactions. No existing financial records are overwritten.</p>
        <div className="wo-toggle" role="group" aria-label="Transaction type">
          <button type="button" className={action === "saveWriteOff" ? "active" : ""} aria-pressed={action === "saveWriteOff"} onClick={() => edit(() => setAction("saveWriteOff"))}>Write Off Due</button>
          <button type="button" className={action === "recoverWriteOff" ? "active" : ""} aria-pressed={action === "recoverWriteOff"} onClick={() => edit(() => setAction("recoverWriteOff"))}>Recover Payment</button>
        </div>
        <div className="wo-fields">
          <label>Project / File ID
            <input list="wo-project-choices" value={projectId} onChange={(e) => edit(() => setProjectId(e.target.value))} onBlur={() => setProjectId(normalized(projectId))} placeholder="LV-072" autoComplete="off" />
            <datalist id="wo-project-choices">{projectChoices.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</datalist>
          </label>
          <label>Billing Category
            <select value={category} onChange={(e) => edit(() => setCategory(e.target.value as Category))}>
              {CATEGORIES.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </label>
        </div>
        <div className="wo-balance">
          <div><span>Current collectible due (category)</span><strong>{money(collectible)}</strong></div>
          <div><span>Active write-off (category)</span><strong>{money(recoverable)}</strong></div>
          {projectId && !matchingDue && <small>No open collectible due found for this project. Previously written-off projects may still have a recoverable balance.</small>}
        </div>
        <div className="wo-fields">
          <label>Amount (BDT)
            <input inputMode="decimal" value={amount} onChange={(e) => edit(() => setAmount(e.target.value))} placeholder="0.00" />
          </label>
          <label>{action === "saveWriteOff" ? "Write-Off Date" : "Actual Payment Date"}
            <input type="date" value={date} onChange={(e) => edit(() => setDate(e.target.value))} />
          </label>
        </div>
        <div className="wo-hint">Maximum {action === "saveWriteOff" ? "new write-off" : "recovery"}: <strong>{money(limit)}</strong>. Amounts are checked again by the database before posting.</div>
        {action === "saveWriteOff" ? <>
          <label className="wo-field">Reason
            <input value={reason} maxLength={160} onChange={(e) => edit(() => setReason(e.target.value))} placeholder="Uncollectible balance / approved settlement" />
          </label>
          <label className="wo-field">Explanation / Approval Notes
            <textarea value={notes} maxLength={1000} rows={3} onChange={(e) => edit(() => setNotes(e.target.value))} placeholder="Explain why this due cannot be collected and who approved it." />
          </label>
          <p className="wo-warning">A write-off is not a payment or a discount. The original billed and paid figures remain unchanged.</p>
        </> : <>
          <div className="wo-fields">
            <label>Actual Payment Method
              <select value={method} onChange={(e) => edit(() => setMethod(e.target.value))}>
                {["Bank Transfer", "Cash", "bKash", "Nagad", "Cheque"].map((v) => <option key={v}>{v}</option>)}
              </select>
            </label>
            <label>Deposit Account
              <input value={account} onChange={(e) => edit(() => setAccount(e.target.value))} placeholder="Account that received the funds" />
            </label>
          </div>
          <label className="wo-field">Transaction Reference
            <input value={reference} onChange={(e) => edit(() => setReference(e.target.value))} placeholder="Bank reference / receipt number" />
          </label>
          <label className="wo-field">Notes
            <textarea rows={2} value={notes} onChange={(e) => edit(() => setNotes(e.target.value))} placeholder="Details of the actual payment received" />
          </label>
          <p className="wo-warning">Recovery creates a real client payment and a matching reversal entry. Use it only after money has actually arrived.</p>
        </>}
        <button className="wo-submit" type="button" disabled={loading || busy || !code || limit <= 0} onClick={() => void submit()}>{busy ? "Saving…" : action === "saveWriteOff" ? "Record Write-Off" : "Record Recovered Payment"}</button>
      </section>

      <section className="wo-card">
        <h2>Project Write-Off History</h2>
        <p className="wo-hint">{code ? "Showing " + code + " history. Clear the File ID to view all projects." : "Showing all written-off balances and payment recoveries."}</p>
        <div className="wo-timeline">
          {loading && events.length === 0 ? <p>Loading history…</p> : history.length === 0 ? <p>No write-off transactions found for this selection.</p> : history.map((item) =>
            <button type="button" className="wo-event" key={item.id} onClick={() => { edit(() => { setProjectId(normalized(item.projectId)); if (CATEGORIES.includes(item.category as Category)) setCategory(item.category as Category); }); }}>
              <span className="wo-event-head"><strong>{item.writeoffCode}</strong><span className={item.eventType === "recovery" ? "wo-recovery" : "wo-written"}>{item.eventType === "recovery" ? "Recovery" : "Written Off"}</span></span>
              <span className="wo-event-amount">{money(item.amount)}</span>
              <span>{item.projectId} · {item.category}</span>
              <span>{item.date || "Date not recorded"} · {item.createdBy || "Unknown author"}</span>
              {item.reason && <span>{item.reason}</span>}
              {item.notes && <span className="wo-notes">{item.notes}</span>}
              {item.paymentId && <span>Linked payment: {item.paymentId}</span>}
            </button>
          )}
        </div>
        <div className="wo-bottom-link"><Link href="/admin/billing/reconciliation">Open Billing Reconciliation</Link></div>
      </section>
    </div>
  </main>;
}
