"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { landViewApi, type BillingBookData } from "@/lib/api";

type Row = Record<string, any>;
type FinanceHealth = {
  generatedAt: string;
  projectManagement: { supplierAdvance: number; chequeOnHold: number; projects: number };
  payments: { total: number; unreconciledCount: number; unreconciledAmount: number; sample: Array<{ paymentCode: string; date: string; amount: number }> };
  transactions: { total: number; duplicateGroups: number; duplicateExtraRows: number; duplicates: Array<{ count: number; amount: number; date: string; projectCode: string; description: string; transactionCodes: string[] }> };
  billingIntegrity: { totalBills: number; mismatchCount: number; mismatchAmount: number; mismatches: Array<{ billCode: string; date: string; description: string; gross: number; discount: number; expected: number; stored: number; difference: number }> };
  accountBalances: { rows: number; mismatchCount: number; mismatchAmount: number; mismatches: Array<{ accountCode: string; accountName: string; calculated: number; snapshot: number; difference: number }> };
  whatsapp: { pending: number; failed: number; lastSentAt: string; latestLedgerBalance: number | null; latestLedgerTransaction: string; latestLedgerMessageId: string; failedSample: Array<{ id: string; error: string; attempts: number }> };
};
type BalanceOverview = { currentBalance: number; municipalityBalance: number; mainEntries: number; municipalityEntries: number; generatedAt: string };
type ExceptionItem = { severity: "critical" | "warning" | "info"; title: string; detail: string; amount?: number; href: string; action: string };

function number(value: unknown) {
  const n = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function money(value: number) {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);
}
function when(value: string) {
  if (!value) return "No successful update yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-BD", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Dhaka" }).format(date);
}
async function apiJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  const raw = await response.text();
  let json: any = null;
  try { json = raw ? JSON.parse(raw) : null; } catch {}
  if (!response.ok || !json?.success) throw new Error(String(json?.error || `Request failed (${response.status}).`));
  return json.data as T;
}
async function getWriteOffs(): Promise<Row[]> {
  return apiJson<Row[]>("/api/billing/writeoffs");
}

export default function FinanceControlCenterPage() {
  const [health, setHealth] = useState<FinanceHealth | null>(null);
  const [balance, setBalance] = useState<BalanceOverview | null>(null);
  const [billing, setBilling] = useState<BillingBookData | null>(null);
  const [writeOffs, setWriteOffs] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [healthData, balanceData, billingData, writeOffData] = await Promise.all([
        apiJson<FinanceHealth>("/api/admin/finance-control"),
        apiJson<BalanceOverview>("/api/admin-balance-overview"),
        landViewApi.getBillingBook(),
        getWriteOffs(),
      ]);
      setHealth(healthData);
      setBalance(balanceData);
      setBilling(billingData);
      setWriteOffs(writeOffData || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load finance reconciliation data.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, revision]);

  const activeWriteOff = useMemo(() => writeOffs.reduce((sum, row) => {
    const event = String(row.eventType ?? row.event_type ?? row.Event_Type ?? "").toLowerCase();
    const value = Math.abs(number(row.amount ?? row.Amount));
    return sum + (event === "recovery" ? -value : event === "write_off" || event === "write off" ? value : 0);
  }, 0), [writeOffs]);

  const receivables = Math.max(0, number(billing?.totals?.due) - Math.max(0, activeWriteOff));
  const projectAdvance = useMemo(() => (billing?.projects || []).reduce((sum, row) => sum + Math.max(0, number(row.paid) - number(row.billed)), 0), [billing]);
  const mainBalance = number(balance?.currentBalance);
  const whatsappBalance = health?.whatsapp.latestLedgerBalance;
  const whatsappDifference = whatsappBalance === null || whatsappBalance === undefined ? null : mainBalance - number(whatsappBalance);

  const exceptions = useMemo<ExceptionItem[]>(() => {
    if (!health || !balance) return [];
    const rows: ExceptionItem[] = [];
    if (whatsappDifference !== null && Math.abs(whatsappDifference) > 0.01) rows.push({ severity: "critical", title: "WhatsApp balance does not match the Main Account", detail: `Ledger ${money(mainBalance)} vs latest WhatsApp ${money(number(whatsappBalance))}.`, amount: Math.abs(whatsappDifference), href: "/admin/accounts", action: "Open Accounts" });
    if (health.whatsapp.failed > 0) rows.push({ severity: "critical", title: `${health.whatsapp.failed} finance WhatsApp update${health.whatsapp.failed === 1 ? "" : "s"} failed`, detail: "A finance entry may have been saved without being delivered to WhatsApp.", href: "/admin/whatsapp", action: "Open WhatsApp" });
    if (health.billingIntegrity.mismatchCount > 0) rows.push({ severity: "warning", title: `${health.billingIntegrity.mismatchCount} bill calculation mismatch${health.billingIntegrity.mismatchCount === 1 ? "" : "es"}`, detail: "Stored net bill does not equal gross amount minus discount. Review before changing historical billing.", amount: health.billingIntegrity.mismatchAmount, href: "/admin/finance/bills", action: "Review Bills" });
    if (health.payments.unreconciledCount > 0) rows.push({ severity: "warning", title: `${health.payments.unreconciledCount} payment${health.payments.unreconciledCount === 1 ? "" : "s"} not linked to a ledger transaction`, detail: "These are approved/business-balance payments without a matching transaction source link. They are flagged for review, not auto-posted.", amount: health.payments.unreconciledAmount, href: "/admin/accounts", action: "Review Ledger" });
    if (health.transactions.duplicateGroups > 0) rows.push({ severity: "warning", title: `${health.transactions.duplicateGroups} possible duplicate transaction group${health.transactions.duplicateGroups === 1 ? "" : "s"}`, detail: `${health.transactions.duplicateExtraRows} extra row(s) share the same date, account/project, amount, reference and description.`, href: "/admin/accounts", action: "Inspect Transactions" });
    if (health.accountBalances.mismatchCount > 0) rows.push({ severity: "warning", title: `${health.accountBalances.mismatchCount} account balance snapshot mismatch${health.accountBalances.mismatchCount === 1 ? "" : "es"}`, detail: "Stored account snapshot differs from the calculated account balance.", amount: health.accountBalances.mismatchAmount, href: "/admin/accounts", action: "Review Accounts" });
    if (health.whatsapp.pending > 0) rows.push({ severity: "info", title: `${health.whatsapp.pending} finance WhatsApp update${health.whatsapp.pending === 1 ? "" : "s"} pending`, detail: "Queued messages have not failed, but delivery is not complete yet.", href: "/admin/whatsapp", action: "View Queue" });
    return rows;
  }, [health, balance, mainBalance, whatsappBalance, whatsappDifference]);

  const criticalCount = exceptions.filter((item) => item.severity === "critical").length;
  const warningCount = exceptions.filter((item) => item.severity === "warning").length;
  const overall = criticalCount ? "Critical" : warningCount ? "Needs Review" : exceptions.length ? "Monitoring" : "Healthy";
  const overallClass = criticalCount ? "critical" : warningCount ? "warning" : exceptions.length ? "info" : "healthy";

  return <main className="fcc-page">
    <style>{`
      .fcc-page{color:var(--theme-ink-_e8edf1,#e8edf1);max-width:1500px;margin:0 auto}.fcc-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:18px}.fcc-kicker{font-size:11px;font-weight:900;letter-spacing:.12em;color:#ef6c66}.fcc-head h1{font-size:32px;margin:5px 0 5px;color:var(--theme-ink-_f8fafc,#f8fafc)}.fcc-sub{margin:0;color:var(--theme-ink-_98a5af,#98a5af);font-size:12px}.fcc-head-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.fcc-status{display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:8px 11px;font-size:11px;font-weight:900;border:1px solid}.fcc-status.healthy{color:#9fd7ae;border-color:#31513d;background:#18281f}.fcc-status.warning{color:#ffd49a;border-color:#7b572c;background:#34291b}.fcc-status.critical{color:#ffaaa3;border-color:#713d38;background:#321f1d}.fcc-status.info{color:#b8d7ef;border-color:#3c6077;background:#172a36}.fcc-dot{width:7px;height:7px;border-radius:50%;background:currentColor}.fcc-btn{border:1px solid var(--theme-line-_3b454e,#3b454e);background:var(--theme-bg-_151d24,#151d24);color:var(--theme-ink-_edf1f4,#edf1f4);padding:9px 12px;border-radius:8px;font-weight:800;text-decoration:none;cursor:pointer}.fcc-btn:disabled{opacity:.55}.fcc-note{border:1px solid var(--theme-line-_31513d,#31513d);background:var(--theme-bg-_18281f,#18281f);color:var(--theme-ink-_bfe7ca,#bfe7ca);padding:11px 13px;border-radius:9px;margin-bottom:14px;font-size:12px}.fcc-note.error{border-color:#713d38;background:#321f1d;color:#ffaaa3}.fcc-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:14px}.fcc-card{background:var(--theme-bg-_151d24,#151d24);border:1px solid var(--theme-line-_313b44,#313b44);border-radius:11px;padding:16px;min-width:0}.fcc-card-label{font-size:10px;text-transform:uppercase;letter-spacing:.09em;color:var(--theme-ink-_89959e,#89959e);font-weight:900}.fcc-card-value{display:block;font-size:22px;margin-top:7px;color:var(--theme-ink-_f8fafc,#f8fafc);overflow-wrap:anywhere}.fcc-card-meta{font-size:10px;color:var(--theme-ink-_96a2ab,#96a2ab);margin-top:6px;line-height:1.4}.fcc-negative{color:#ff8f87!important}.fcc-positive{color:#9fd7ae!important}.fcc-reconcile{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:15px;background:var(--theme-bg-_11181e,#11181e);border:1px solid var(--theme-line-_313b44,#313b44);border-radius:11px;padding:16px;margin-bottom:14px}.fcc-reconcile-side span{display:block;color:var(--theme-ink-_89959e,#89959e);font-size:10px;text-transform:uppercase;letter-spacing:.08em}.fcc-reconcile-side strong{display:block;margin-top:5px;font-size:19px}.fcc-reconcile-center{text-align:center}.fcc-match{font-size:11px;font-weight:900;border-radius:999px;padding:7px 10px;display:inline-block}.fcc-match.ok{color:#9fd7ae;background:#18281f;border:1px solid #31513d}.fcc-match.bad{color:#ffaaa3;background:#321f1d;border:1px solid #713d38}.fcc-section{background:var(--theme-bg-_11181e,#11181e);border:1px solid var(--theme-line-_313b44,#313b44);border-radius:11px;overflow:hidden;margin-bottom:14px}.fcc-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--theme-line-_313b44,#313b44)}.fcc-section-head h2{font-size:15px;margin:0}.fcc-section-head small{color:var(--theme-ink-_89959e,#89959e)}.fcc-exception{display:grid;grid-template-columns:9px minmax(0,1fr) auto;gap:12px;padding:14px 16px;border-bottom:1px solid var(--theme-line-_27313a,#27313a);align-items:start}.fcc-exception:last-child{border-bottom:0}.fcc-severity{width:9px;height:9px;border-radius:50%;margin-top:5px}.fcc-severity.critical{background:#ef6c66}.fcc-severity.warning{background:#d7a24d}.fcc-severity.info{background:#69a7d1}.fcc-exception strong{display:block;font-size:12px}.fcc-exception p{margin:4px 0 0;color:var(--theme-ink-_96a2ab,#96a2ab);font-size:11px;line-height:1.45}.fcc-exception-amount{display:block;margin-top:5px;color:#f3b26f;font-size:11px;font-weight:900}.fcc-table-wrap{overflow:auto}.fcc-table{width:100%;border-collapse:collapse;min-width:720px}.fcc-table th,.fcc-table td{text-align:left;padding:10px 13px;border-bottom:1px solid var(--theme-line-_27313a,#27313a);font-size:11px}.fcc-table th{color:var(--theme-ink-_89959e,#89959e);font-size:9px;text-transform:uppercase;letter-spacing:.07em}.fcc-empty{padding:22px 16px;text-align:center;color:#9fd7ae;font-size:12px}.fcc-source{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;color:var(--theme-ink-_89959e,#89959e);font-size:10px;padding:4px 2px 12px}@media(max-width:1000px){.fcc-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:700px){.fcc-head{align-items:flex-start;flex-direction:column}.fcc-head-actions{width:100%}.fcc-btn{flex:1;text-align:center}.fcc-grid{grid-template-columns:1fr}.fcc-reconcile{grid-template-columns:1fr}.fcc-reconcile-center{text-align:left}.fcc-exception{grid-template-columns:9px minmax(0,1fr)}.fcc-exception .fcc-btn{grid-column:2;width:max-content}.fcc-card-value{font-size:20px}}
    `}</style>

    <header className="fcc-head">
      <div><div className="fcc-kicker">LAND VIEW / FINANCE OPERATIONS</div><h1>Finance Control Center</h1><p className="fcc-sub">Read-only reconciliation. Exceptions are surfaced for review; financial records are never auto-corrected here.</p></div>
      <div className="fcc-head-actions"><span className={`fcc-status ${overallClass}`}><span className="fcc-dot" />{loading ? "Checking…" : overall}</span><button className="fcc-btn" disabled={loading} onClick={() => setRevision((value) => value + 1)}>{loading ? "Refreshing…" : "Refresh"}</button></div>
    </header>

    {error && <div className="fcc-note error">{error}</div>}
    {!error && <div className="fcc-note">Finance reconciliation is live. Current ledger, billing, project finance and WhatsApp delivery are checked independently.</div>}

    <section className="fcc-grid" aria-label="Finance control metrics">
      <Metric label="Main Account Balance" value={money(mainBalance)} meta={`${balance?.mainEntries || 0} ledger entries`} negative={mainBalance < 0} />
      <Metric label="Total Receivables" value={money(receivables)} meta={`After active write-offs of ${money(Math.max(0, activeWriteOff))}`} />
      <Metric label="Project Advances" value={money(projectAdvance)} meta="Client/project payments above billed value" positive={projectAdvance > 0} />
      <Metric label="Supplier Advances" value={money(number(health?.projectManagement.supplierAdvance))} meta={`${health?.projectManagement.projects || 0} managed project(s)`} />
      <Metric label="Cheque on Hold" value={money(number(health?.projectManagement.chequeOnHold))} meta="Project management hold balance" />
      <Metric label="Unreconciled Payments" value={String(health?.payments.unreconciledCount ?? 0)} meta={money(number(health?.payments.unreconciledAmount)) + " requires review"} />
    </section>

    <section className="fcc-reconcile" aria-label="WhatsApp balance reconciliation">
      <div className="fcc-reconcile-side"><span>Authoritative Main Ledger</span><strong>{money(mainBalance)}</strong><div className="fcc-card-meta">Supabase finance ledger</div></div>
      <div className="fcc-reconcile-center"><span className={`fcc-match ${whatsappDifference !== null && Math.abs(whatsappDifference) <= 0.01 ? "ok" : "bad"}`}>{whatsappDifference === null ? "No WhatsApp balance" : Math.abs(whatsappDifference) <= 0.01 ? "MATCHED" : `DIFF ${money(Math.abs(whatsappDifference))}`}</span></div>
      <div className="fcc-reconcile-side"><span>Latest WhatsApp-Published Balance</span><strong>{whatsappBalance === null || whatsappBalance === undefined ? "—" : money(number(whatsappBalance))}</strong><div className="fcc-card-meta">{health?.whatsapp.latestLedgerTransaction || "No transaction reference"} · {when(health?.whatsapp.lastSentAt || "")}</div></div>
    </section>

    <section className="fcc-section">
      <div className="fcc-section-head"><h2>Actionable Exceptions</h2><small>{exceptions.length ? `${criticalCount} critical · ${warningCount} warning` : "No exceptions detected"}</small></div>
      {exceptions.length === 0 ? <div className="fcc-empty">All monitored finance controls are currently reconciled.</div> : exceptions.map((item, index) => <div className="fcc-exception" key={`${item.title}-${index}`}><span className={`fcc-severity ${item.severity}`} /><div><strong>{item.title}</strong><p>{item.detail}</p>{item.amount !== undefined && <span className="fcc-exception-amount">Exposure: {money(item.amount)}</span>}</div><Link className="fcc-btn" href={item.href}>{item.action}</Link></div>)}
    </section>

    {(health?.billingIntegrity.mismatches?.length || 0) > 0 && <section className="fcc-section"><div className="fcc-section-head"><h2>Billing Integrity — Sample</h2><small>{health?.billingIntegrity.mismatchCount} mismatches · {money(number(health?.billingIntegrity.mismatchAmount))}</small></div><div className="fcc-table-wrap"><table className="fcc-table"><thead><tr><th>Bill</th><th>Date</th><th>Description</th><th>Expected Net</th><th>Stored Net</th><th>Difference</th></tr></thead><tbody>{health?.billingIntegrity.mismatches.map((row) => <tr key={row.billCode}><td>{row.billCode || "—"}</td><td>{row.date || "—"}</td><td>{row.description || "—"}</td><td>{money(row.expected)}</td><td>{money(row.stored)}</td><td>{money(row.difference)}</td></tr>)}</tbody></table></div></section>}

    {(health?.payments.sample?.length || 0) > 0 && <section className="fcc-section"><div className="fcc-section-head"><h2>Unreconciled Payments — Sample</h2><small>Review only; no automatic posting</small></div><div className="fcc-table-wrap"><table className="fcc-table"><thead><tr><th>Payment</th><th>Date</th><th>Amount</th><th>Ledger Link</th></tr></thead><tbody>{health?.payments.sample.map((row, index) => <tr key={`${row.paymentCode}-${index}`}><td>{row.paymentCode || "Legacy payment"}</td><td>{row.date || "—"}</td><td>{money(row.amount)}</td><td>Missing source transaction link</td></tr>)}</tbody></table></div></section>}

    {(health?.transactions.duplicates?.length || 0) > 0 && <section className="fcc-section"><div className="fcc-section-head"><h2>Possible Duplicate Transactions</h2><small>Same financial fingerprint</small></div><div className="fcc-table-wrap"><table className="fcc-table"><thead><tr><th>Date</th><th>Project</th><th>Description</th><th>Amount</th><th>Rows</th><th>Transaction IDs</th></tr></thead><tbody>{health?.transactions.duplicates.map((row, index) => <tr key={`${row.date}-${index}`}><td>{row.date}</td><td>{row.projectCode || "—"}</td><td>{row.description || "—"}</td><td>{money(row.amount)}</td><td>{row.count}</td><td>{row.transactionCodes.join(", ")}</td></tr>)}</tbody></table></div></section>}

    <div className="fcc-source"><span>Supabase: payments · transactions · bills · project finance · account snapshots · WhatsApp outbox</span><span>Last control snapshot: {when(health?.generatedAt || balance?.generatedAt || "")}</span></div>
  </main>;
}

function Metric({ label, value, meta, negative = false, positive = false }: { label: string; value: string; meta: string; negative?: boolean; positive?: boolean }) {
  return <div className="fcc-card"><span className="fcc-card-label">{label}</span><strong className={`fcc-card-value ${negative ? "fcc-negative" : positive ? "fcc-positive" : ""}`}>{value}</strong><div className="fcc-card-meta">{meta}</div></div>;
}
