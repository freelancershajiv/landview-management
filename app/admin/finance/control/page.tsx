"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { landViewApi, type BillingBookData } from "@/lib/api";

type Row = Record<string, any>;
type Check = { count: number; amount: number; sample: Row[] };
type LedgerCheck = { billingPaymentTotal: number; linkedLedgerTotal: number; difference: number; mismatchCount: number; sample: Row[] };
type FinanceHealth = {
  generatedAt: string;
  projectManagement: { supplierAdvance: number; chequeOnHold: number; projects: number };
  payments: { total: number; unreconciledCount: number; unreconciledAmount: number; sample: Row[] };
  transactions: { total: number; duplicateGroups: number; duplicateExtraRows: number; duplicates: Row[] };
  billingIntegrity: { totalBills: number; mismatchCount: number; mismatchAmount: number; mismatches: Row[] };
  accountBalances: { rows: number; mismatchCount: number; mismatchAmount: number; mismatches: Row[] };
  whatsapp: { pending: number; failed: number; lastSentAt: string; latestLedgerBalance: number | null; latestLedgerTransaction: string; latestLedgerMessageId: string; failedSample: Row[] };
  reconciliation: {
    paymentWithoutInvoice: Check;
    invoiceWithoutAllocation: Check;
    advances: Check;
    invoiceDueMismatch: Check;
    paymentSnapshotMismatch: Check;
    adjustmentMismatch: Check;
    completedWithDue: Check;
    ledgerVsBilling: LedgerCheck;
    totals: { invoices: number; allocations: number; effectiveProjectPayments: number; adjustments: number; completedProjects: number };
  };
};
type BalanceOverview = { currentBalance: number; municipalityBalance: number; mainEntries: number; municipalityEntries: number; generatedAt: string };
type ExceptionItem = { severity: "critical" | "warning" | "info"; title: string; detail: string; amount?: number; href: string; action: string };

function n(value: unknown) {
  const parsed = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}
function money(value: unknown) {
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n(value));
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
        apiJson<Row[]>("/api/billing/writeoffs"),
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
    const value = Math.abs(n(row.amount ?? row.Amount));
    return sum + (event === "recovery" ? -value : event === "write_off" || event === "write off" ? value : 0);
  }, 0), [writeOffs]);

  const receivables = Math.max(0, n(billing?.totals?.due) - Math.max(0, activeWriteOff));
  const projectAdvance = n(health?.reconciliation?.advances?.amount);
  const mainBalance = n(balance?.currentBalance);
  const whatsappBalance = health?.whatsapp.latestLedgerBalance;
  const whatsappDifference = whatsappBalance === null || whatsappBalance === undefined ? null : mainBalance - n(whatsappBalance);
  const reconciliation = health?.reconciliation;

  const exceptions = useMemo<ExceptionItem[]>(() => {
    if (!health || !balance || !reconciliation) return [];
    const rows: ExceptionItem[] = [];
    if (whatsappDifference !== null && Math.abs(whatsappDifference) > 0.01) rows.push({ severity: "critical", title: "WhatsApp balance does not match Main Account", detail: `Ledger ${money(mainBalance)} vs latest WhatsApp ${money(whatsappBalance)}.`, amount: Math.abs(whatsappDifference), href: "/admin/accounts", action: "Open Accounts" });
    if (Math.abs(reconciliation.ledgerVsBilling.difference) > 0.01 || reconciliation.ledgerVsBilling.mismatchCount > 0) rows.push({ severity: "critical", title: "Billing payments do not fully match payment-linked ledger rows", detail: `Billing payments ${money(reconciliation.ledgerVsBilling.billingPaymentTotal)} vs linked ledger ${money(reconciliation.ledgerVsBilling.linkedLedgerTotal)} across ${reconciliation.ledgerVsBilling.mismatchCount} payment(s).`, amount: Math.abs(reconciliation.ledgerVsBilling.difference), href: "/admin/accounts", action: "Review Ledger" });
    if (health.whatsapp.failed > 0) rows.push({ severity: "critical", title: `${health.whatsapp.failed} finance WhatsApp update${health.whatsapp.failed === 1 ? "" : "s"} failed`, detail: "A finance entry may have been saved without a successful WhatsApp delivery.", href: "/admin/whatsapp", action: "Open WhatsApp" });
    if (reconciliation.invoiceDueMismatch.count > 0) rows.push({ severity: "warning", title: `${reconciliation.invoiceDueMismatch.count} invoice snapshot mismatch${reconciliation.invoiceDueMismatch.count === 1 ? "" : "es"}`, detail: "Invoice paid/due/status snapshot does not equal the actual invoice allocations.", amount: reconciliation.invoiceDueMismatch.amount, href: "/admin/finance/payment-lifecycle", action: "Review Invoices" });
    if (reconciliation.paymentSnapshotMismatch.count > 0) rows.push({ severity: "warning", title: `${reconciliation.paymentSnapshotMismatch.count} payment allocation snapshot mismatch${reconciliation.paymentSnapshotMismatch.count === 1 ? "" : "es"}`, detail: "Stored allocated/unallocated payment amounts do not equal allocation rows.", amount: reconciliation.paymentSnapshotMismatch.amount, href: "/admin/finance/payment-lifecycle", action: "Review Payments" });
    if (reconciliation.paymentWithoutInvoice.count > 0) rows.push({ severity: "warning", title: `${reconciliation.paymentWithoutInvoice.count} payment${reconciliation.paymentWithoutInvoice.count === 1 ? "" : "s"} unallocated despite open invoice due`, detail: "These are not normal advances: the project already has invoice due available for allocation.", amount: reconciliation.paymentWithoutInvoice.amount, href: "/admin/finance/payment-lifecycle", action: "Review Allocation" });
    if (reconciliation.invoiceWithoutAllocation.count > 0) rows.push({ severity: "warning", title: `${reconciliation.invoiceWithoutAllocation.count} invoice${reconciliation.invoiceWithoutAllocation.count === 1 ? "" : "s"} show paid without allocation`, detail: "Invoice payment snapshots/status indicate collection but no invoice allocation rows exist.", amount: reconciliation.invoiceWithoutAllocation.amount, href: "/admin/finance/payment-lifecycle", action: "Review Invoices" });
    if (reconciliation.adjustmentMismatch.count > 0) rows.push({ severity: "warning", title: `${reconciliation.adjustmentMismatch.count} Credit/Debit Note integrity issue${reconciliation.adjustmentMismatch.count === 1 ? "" : "s"}`, detail: "Original bill, mirror bill, status, or adjustment amount is inconsistent.", amount: reconciliation.adjustmentMismatch.amount, href: "/admin/finance/adjustments", action: "Review Notes" });
    if (reconciliation.completedWithDue.count > 0) rows.push({ severity: "warning", title: `${reconciliation.completedWithDue.count} completed project${reconciliation.completedWithDue.count === 1 ? "" : "s"} still have invoice due`, detail: "Operationally completed projects remain financially open and need collection or an approved adjustment.", amount: reconciliation.completedWithDue.amount, href: "/admin/finance/due-bills", action: "Open Due Bills" });
    if (health.billingIntegrity.mismatchCount > 0) rows.push({ severity: "warning", title: `${health.billingIntegrity.mismatchCount} legacy bill calculation mismatch${health.billingIntegrity.mismatchCount === 1 ? "" : "es"}`, detail: "Stored bill net does not equal gross minus discount.", amount: health.billingIntegrity.mismatchAmount, href: "/admin/finance/workspace", action: "Open Billing 2.0" });
    if (health.payments.unreconciledCount > 0) rows.push({ severity: "warning", title: `${health.payments.unreconciledCount} payment${health.payments.unreconciledCount === 1 ? "" : "s"} not linked to a ledger transaction`, detail: "Approved business-balance payments are missing a canonical transaction source link.", amount: health.payments.unreconciledAmount, href: "/admin/accounts", action: "Review Ledger" });
    if (health.transactions.duplicateGroups > 0) rows.push({ severity: "warning", title: `${health.transactions.duplicateGroups} possible duplicate transaction group${health.transactions.duplicateGroups === 1 ? "" : "s"}`, detail: `${health.transactions.duplicateExtraRows} extra row(s) share the same financial fingerprint.`, href: "/admin/accounts", action: "Inspect Transactions" });
    if (health.accountBalances.mismatchCount > 0) rows.push({ severity: "warning", title: `${health.accountBalances.mismatchCount} account balance snapshot mismatch${health.accountBalances.mismatchCount === 1 ? "" : "es"}`, detail: "Stored account snapshot differs from the calculated account balance.", amount: health.accountBalances.mismatchAmount, href: "/admin/accounts", action: "Review Accounts" });
    if (reconciliation.advances.count > 0) rows.push({ severity: "info", title: `${reconciliation.advances.count} payment${reconciliation.advances.count === 1 ? "" : "s"} hold project advance`, detail: "Unallocated money is intentionally retained as project advance unless a matching invoice is available.", amount: reconciliation.advances.amount, href: "/admin/finance/payment-lifecycle", action: "View Advances" });
    if (health.whatsapp.pending > 0) rows.push({ severity: "info", title: `${health.whatsapp.pending} finance WhatsApp update${health.whatsapp.pending === 1 ? "" : "s"} pending`, detail: "Queued messages have not failed, but delivery is not complete yet.", href: "/admin/whatsapp", action: "View Queue" });
    return rows;
  }, [health, balance, reconciliation, mainBalance, whatsappBalance, whatsappDifference]);

  const criticalCount = exceptions.filter((item) => item.severity === "critical").length;
  const warningCount = exceptions.filter((item) => item.severity === "warning").length;
  const overall = criticalCount ? "Critical" : warningCount ? "Needs Review" : exceptions.length ? "Monitoring" : "Healthy";
  const overallClass = criticalCount ? "critical" : warningCount ? "warning" : exceptions.length ? "info" : "healthy";

  return <main className="fcc-page">
    <style>{`
      .fcc-page{color:var(--theme-ink-_e8edf1,#e8edf1);max-width:1540px;margin:0 auto}.fcc-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;margin-bottom:18px}.fcc-kicker{font-size:10px;font-weight:900;letter-spacing:.13em;color:#ef6c66}.fcc-head h1{font-size:31px;margin:5px 0;color:var(--theme-ink-_f8fafc,#f8fafc)}.fcc-sub{margin:0;max-width:850px;color:var(--theme-ink-_98a5af,#98a5af);font-size:11px;line-height:1.55}.fcc-head-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.fcc-status{display:inline-flex;align-items:center;gap:7px;border-radius:999px;padding:8px 11px;font-size:10px;font-weight:900;border:1px solid}.fcc-status.healthy{color:#9fd7ae;border-color:#31513d;background:#18281f}.fcc-status.warning{color:#ffd49a;border-color:#7b572c;background:#34291b}.fcc-status.critical{color:#ffaaa3;border-color:#713d38;background:#321f1d}.fcc-status.info{color:#b8d7ef;border-color:#3c6077;background:#172a36}.fcc-dot{width:7px;height:7px;border-radius:50%;background:currentColor}.fcc-btn{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--theme-line-_3b454e,#3b454e);background:var(--theme-bg-_151d24,#151d24);color:var(--theme-ink-_edf1f4,#edf1f4);padding:8px 11px;border-radius:8px;font-size:10px;font-weight:850;text-decoration:none;cursor:pointer}.fcc-btn:disabled{opacity:.55}.fcc-note{border:1px solid var(--theme-line-_31513d,#31513d);background:var(--theme-bg-_18281f,#18281f);color:var(--theme-ink-_bfe7ca,#bfe7ca);padding:10px 12px;border-radius:9px;margin-bottom:13px;font-size:11px}.fcc-note.error{border-color:#713d38;background:#321f1d;color:#ffaaa3}.fcc-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-bottom:13px}.fcc-card{background:var(--theme-bg-_151d24,#151d24);border:1px solid var(--theme-line-_313b44,#313b44);border-radius:10px;padding:14px;min-width:0}.fcc-card-label{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--theme-ink-_89959e,#89959e);font-weight:900}.fcc-card-value{display:block;font-size:20px;margin-top:6px;color:var(--theme-ink-_f8fafc,#f8fafc);overflow-wrap:anywhere}.fcc-card-meta{font-size:9px;color:var(--theme-ink-_96a2ab,#96a2ab);margin-top:5px;line-height:1.4}.fcc-negative{color:#ff8f87!important}.fcc-positive{color:#9fd7ae!important}.fcc-checks{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin-bottom:13px}.fcc-check{border:1px solid var(--theme-line-_313b44,#313b44);border-radius:10px;background:var(--theme-bg-_11181e,#11181e);padding:12px}.fcc-check-top{display:flex;justify-content:space-between;gap:8px;align-items:center}.fcc-check-title{font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;color:var(--theme-ink-_9aa5ad,#9aa5ad)}.fcc-check-count{font-size:17px;font-weight:950}.fcc-check.ok .fcc-check-count{color:#9fd7ae}.fcc-check.warn .fcc-check-count{color:#ffd49a}.fcc-check.bad .fcc-check-count{color:#ff9189}.fcc-check p{margin:6px 0 0;color:var(--theme-ink-_88959e,#88959e);font-size:9px;line-height:1.4}.fcc-reconcile{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:15px;background:var(--theme-bg-_11181e,#11181e);border:1px solid var(--theme-line-_313b44,#313b44);border-radius:10px;padding:14px;margin-bottom:13px}.fcc-reconcile-side span{display:block;color:var(--theme-ink-_89959e,#89959e);font-size:9px;text-transform:uppercase;letter-spacing:.08em}.fcc-reconcile-side strong{display:block;margin-top:5px;font-size:18px}.fcc-reconcile-center{text-align:center}.fcc-match{font-size:10px;font-weight:900;border-radius:999px;padding:6px 9px;display:inline-block}.fcc-match.ok{color:#9fd7ae;background:#18281f;border:1px solid #31513d}.fcc-match.bad{color:#ffaaa3;background:#321f1d;border:1px solid #713d38}.fcc-section{background:var(--theme-bg-_11181e,#11181e);border:1px solid var(--theme-line-_313b44,#313b44);border-radius:10px;overflow:hidden;margin-bottom:13px}.fcc-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 14px;border-bottom:1px solid var(--theme-line-_313b44,#313b44)}.fcc-section-head h2{font-size:14px;margin:0}.fcc-section-head small{color:var(--theme-ink-_89959e,#89959e);font-size:9px}.fcc-exception{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:11px;padding:12px 14px;border-bottom:1px solid var(--theme-line-_27313a,#27313a);align-items:start}.fcc-exception:last-child{border-bottom:0}.fcc-severity{width:8px;height:8px;border-radius:50%;margin-top:4px}.fcc-severity.critical{background:#ef6c66}.fcc-severity.warning{background:#d7a24d}.fcc-severity.info{background:#69a7d1}.fcc-exception strong{display:block;font-size:11px}.fcc-exception p{margin:3px 0 0;color:var(--theme-ink-_96a2ab,#96a2ab);font-size:10px;line-height:1.45}.fcc-exception-amount{display:block;margin-top:4px;color:#f3b26f;font-size:10px;font-weight:900}.fcc-table-wrap{overflow:auto}.fcc-table{width:100%;border-collapse:collapse;min-width:760px}.fcc-table th,.fcc-table td{text-align:left;padding:9px 11px;border-bottom:1px solid var(--theme-line-_27313a,#27313a);font-size:10px}.fcc-table th{color:var(--theme-ink-_89959e,#89959e);font-size:8px;text-transform:uppercase;letter-spacing:.07em}.fcc-empty{padding:20px 14px;text-align:center;color:#9fd7ae;font-size:11px}.fcc-source{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;color:var(--theme-ink-_89959e,#89959e);font-size:9px;padding:3px 2px 12px}@media(max-width:1100px){.fcc-grid,.fcc-checks{grid-template-columns:repeat(2,1fr)}}@media(max-width:700px){.fcc-head{align-items:flex-start;flex-direction:column}.fcc-head-actions{width:100%}.fcc-btn{flex:1}.fcc-grid,.fcc-checks{grid-template-columns:1fr}.fcc-reconcile{grid-template-columns:1fr}.fcc-reconcile-center{text-align:left}.fcc-exception{grid-template-columns:8px minmax(0,1fr)}.fcc-exception .fcc-btn{grid-column:2;width:max-content}.fcc-card-value{font-size:18px}}
    `}</style>

    <header className="fcc-head">
      <div><div className="fcc-kicker">LAND VIEW / FINANCE RECONCILIATION</div><h1>Finance Control Center</h1><p className="fcc-sub">One read-only health screen comparing Billing 2.0, invoices, payment allocations, project advances, adjustments, completed projects and the canonical ledger. Nothing is auto-corrected here.</p></div>
      <div className="fcc-head-actions"><span className={`fcc-status ${overallClass}`}><span className="fcc-dot" />{loading ? "Checking…" : overall}</span><button className="fcc-btn" disabled={loading} onClick={() => setRevision((value) => value + 1)}>{loading ? "Refreshing…" : "Run Reconciliation"}</button></div>
    </header>

    {error && <div className="fcc-note error">{error}</div>}
    {!error && <div className="fcc-note">Reconciliation is read-only. Exceptions are review queues; historical finance data is never silently changed.</div>}

    <section className="fcc-grid" aria-label="Finance control metrics">
      <Metric label="Main Account Balance" value={money(mainBalance)} meta={`${balance?.mainEntries || 0} canonical ledger entries`} negative={mainBalance < 0} />
      <Metric label="Collectible Receivables" value={money(receivables)} meta={`After active write-offs ${money(Math.max(0, activeWriteOff))}`} />
      <Metric label="Project Advances" value={money(projectAdvance)} meta={`${reconciliation?.advances.count || 0} payment(s) with unallocated money`} positive={projectAdvance > 0} />
      <Metric label="Completed With Due" value={money(reconciliation?.completedWithDue.amount)} meta={`${reconciliation?.completedWithDue.count || 0} completed project(s)`} negative={n(reconciliation?.completedWithDue.amount) > 0} />
      <Metric label="Supplier Advances" value={money(health?.projectManagement.supplierAdvance)} meta={`${health?.projectManagement.projects || 0} managed project(s)`} />
      <Metric label="Cheque on Hold" value={money(health?.projectManagement.chequeOnHold)} meta="Project-management hold balance" />
      <Metric label="Invoices" value={String(reconciliation?.totals.invoices ?? 0)} meta={`${reconciliation?.totals.allocations || 0} invoice allocation rows`} />
      <Metric label="Project Payments" value={String(reconciliation?.totals.effectiveProjectPayments ?? 0)} meta={money(reconciliation?.ledgerVsBilling.billingPaymentTotal) + " eligible billing payments"} />
    </section>

    <section className="fcc-checks" aria-label="Billing 2.0 reconciliation checks">
      <CheckCard title="Payment → Invoice" count={reconciliation?.paymentWithoutInvoice.count || 0} amount={reconciliation?.paymentWithoutInvoice.amount || 0} okText="All allocatable payments connected" />
      <CheckCard title="Invoice → Allocation" count={reconciliation?.invoiceWithoutAllocation.count || 0} amount={reconciliation?.invoiceWithoutAllocation.amount || 0} okText="Paid invoices have allocation rows" />
      <CheckCard title="Invoice Due Snapshot" count={reconciliation?.invoiceDueMismatch.count || 0} amount={reconciliation?.invoiceDueMismatch.amount || 0} okText="Paid / due / status snapshots match" />
      <CheckCard title="Payment Snapshot" count={reconciliation?.paymentSnapshotMismatch.count || 0} amount={reconciliation?.paymentSnapshotMismatch.amount || 0} okText="Allocated / advance snapshots match" />
      <CheckCard title="Credit / Debit Notes" count={reconciliation?.adjustmentMismatch.count || 0} amount={reconciliation?.adjustmentMismatch.amount || 0} okText="Adjustment documents are consistent" />
      <CheckCard title="Ledger Link" count={reconciliation?.ledgerVsBilling.mismatchCount || 0} amount={Math.abs(n(reconciliation?.ledgerVsBilling.difference))} okText="Project payments match linked ledger" critical />
      <CheckCard title="Legacy Bill Arithmetic" count={health?.billingIntegrity.mismatchCount || 0} amount={health?.billingIntegrity.mismatchAmount || 0} okText="Gross - discount = stored net" />
      <CheckCard title="Duplicate Ledger Rows" count={health?.transactions.duplicateGroups || 0} amount={0} okText="No duplicate financial fingerprints" />
    </section>

    <section className="fcc-reconcile" aria-label="Billing payment to ledger reconciliation">
      <div className="fcc-reconcile-side"><span>Billing 2.0 Project Payments</span><strong>{money(reconciliation?.ledgerVsBilling.billingPaymentTotal)}</strong><div className="fcc-card-meta">Eligible project payments only</div></div>
      <div className="fcc-reconcile-center"><span className={`fcc-match ${Math.abs(n(reconciliation?.ledgerVsBilling.difference)) <= 0.01 ? "ok" : "bad"}`}>{Math.abs(n(reconciliation?.ledgerVsBilling.difference)) <= 0.01 ? "MATCHED" : `DIFF ${money(Math.abs(n(reconciliation?.ledgerVsBilling.difference)))}`}</span></div>
      <div className="fcc-reconcile-side"><span>Payment-Linked Canonical Ledger</span><strong>{money(reconciliation?.ledgerVsBilling.linkedLedgerTotal)}</strong><div className="fcc-card-meta">Compared by payment source / ledger transaction link</div></div>
    </section>

    <section className="fcc-section">
      <div className="fcc-section-head"><h2>Actionable Exceptions</h2><small>{exceptions.length ? `${criticalCount} critical · ${warningCount} warning · ${exceptions.length - criticalCount - warningCount} info` : "No exceptions detected"}</small></div>
      {exceptions.length === 0 ? <div className="fcc-empty">All monitored finance controls are currently reconciled.</div> : exceptions.map((item, index) => <div className="fcc-exception" key={`${item.title}-${index}`}><span className={`fcc-severity ${item.severity}`} /><div><strong>{item.title}</strong><p>{item.detail}</p>{item.amount !== undefined && item.amount > 0.009 && <span className="fcc-exception-amount">Exposure: {money(item.amount)}</span>}</div><Link className="fcc-btn" href={item.href}>{item.action}</Link></div>)}
    </section>

    {(reconciliation?.advances.sample?.length || 0) > 0 && <section className="fcc-section"><div className="fcc-section-head"><h2>Project Advance / Unallocated Queue</h2><small>{reconciliation?.advances.count} payment(s) · {money(reconciliation?.advances.amount)}</small></div><div className="fcc-table-wrap"><table className="fcc-table"><thead><tr><th>Payment</th><th>Project</th><th>Date</th><th>Payment</th><th>Allocated</th><th>Advance</th></tr></thead><tbody>{reconciliation?.advances.sample.map((row, index) => <tr key={`${row.paymentCode}-${index}`}><td>{row.paymentCode || "—"}</td><td>{row.projectCode || "—"}</td><td>{row.date || "—"}</td><td>{money(row.amount)}</td><td>{money(row.allocated)}</td><td>{money(row.unallocated)}</td></tr>)}</tbody></table></div></section>}

    {(reconciliation?.completedWithDue.sample?.length || 0) > 0 && <section className="fcc-section"><div className="fcc-section-head"><h2>Completed Projects Still Financially Open</h2><small>{reconciliation?.completedWithDue.count} project(s) · {money(reconciliation?.completedWithDue.amount)}</small></div><div className="fcc-table-wrap"><table className="fcc-table"><thead><tr><th>File ID</th><th>Project</th><th>Client</th><th>Invoice Due</th><th>Action</th></tr></thead><tbody>{reconciliation?.completedWithDue.sample.map((row, index) => <tr key={`${row.projectCode}-${index}`}><td>{row.projectCode}</td><td>{row.projectName || "—"}</td><td>{row.clientName || "—"}</td><td>{money(row.due)}</td><td><Link className="fcc-btn" href={`/admin/finance/workspace?fileId=${encodeURIComponent(row.projectCode || "")}`}>Open Billing</Link></td></tr>)}</tbody></table></div></section>}

    {(reconciliation?.ledgerVsBilling.sample?.length || 0) > 0 && <section className="fcc-section"><div className="fcc-section-head"><h2>Billing Payment ↔ Ledger Mismatches</h2><small>{reconciliation?.ledgerVsBilling.mismatchCount} payment(s)</small></div><div className="fcc-table-wrap"><table className="fcc-table"><thead><tr><th>Payment</th><th>Project</th><th>Billing Amount</th><th>Ledger Amount</th><th>Difference</th><th>Ledger IDs</th></tr></thead><tbody>{reconciliation?.ledgerVsBilling.sample.map((row, index) => <tr key={`${row.paymentCode}-${index}`}><td>{row.paymentCode || "—"}</td><td>{row.projectCode || "—"}</td><td>{money(row.paymentAmount)}</td><td>{money(row.ledgerAmount)}</td><td>{money(row.difference)}</td><td>{Array.isArray(row.linkedTransactions) && row.linkedTransactions.length ? row.linkedTransactions.join(", ") : "No linked transaction"}</td></tr>)}</tbody></table></div></section>}

    {(reconciliation?.invoiceDueMismatch.sample?.length || 0) > 0 && <section className="fcc-section"><div className="fcc-section-head"><h2>Invoice Snapshot Mismatches</h2><small>Allocation is the calculation source</small></div><div className="fcc-table-wrap"><table className="fcc-table"><thead><tr><th>Invoice</th><th>Project</th><th>Amount</th><th>Allocated</th><th>Stored Due</th><th>Expected Due</th><th>Status</th></tr></thead><tbody>{reconciliation?.invoiceDueMismatch.sample.map((row, index) => <tr key={`${row.invoiceCode}-${index}`}><td>{row.invoiceCode}</td><td>{row.projectCode}</td><td>{money(row.amount)}</td><td>{money(row.allocated)}</td><td>{money(row.storedDue)}</td><td>{money(row.expectedDue)}</td><td>{row.status} → {row.expectedStatus}</td></tr>)}</tbody></table></div></section>}

    {(health?.transactions.duplicates?.length || 0) > 0 && <section className="fcc-section"><div className="fcc-section-head"><h2>Possible Duplicate Transactions</h2><small>Same financial fingerprint</small></div><div className="fcc-table-wrap"><table className="fcc-table"><thead><tr><th>Date</th><th>Project</th><th>Description</th><th>Amount</th><th>Rows</th><th>Transaction IDs</th></tr></thead><tbody>{health?.transactions.duplicates.map((row, index) => <tr key={`${row.date}-${index}`}><td>{row.date}</td><td>{row.projectCode || "—"}</td><td>{row.description || "—"}</td><td>{money(row.amount)}</td><td>{row.count}</td><td>{Array.isArray(row.transactionCodes) ? row.transactionCodes.join(", ") : "—"}</td></tr>)}</tbody></table></div></section>}

    <div className="fcc-source"><span>Sources: Billing 2.0 invoices · payment allocations · payments · bills · adjustments · projects · canonical transactions · account snapshots · WhatsApp outbox</span><span>Last control snapshot: {when(health?.generatedAt || balance?.generatedAt || "")}</span></div>
  </main>;
}

function Metric({ label, value, meta, negative = false, positive = false }: { label: string; value: string; meta: string; negative?: boolean; positive?: boolean }) {
  return <div className="fcc-card"><span className="fcc-card-label">{label}</span><strong className={`fcc-card-value ${negative ? "fcc-negative" : positive ? "fcc-positive" : ""}`}>{value}</strong><div className="fcc-card-meta">{meta}</div></div>;
}
function CheckCard({ title, count, amount, okText, critical = false }: { title: string; count: number; amount: number; okText: string; critical?: boolean }) {
  const state = count > 0 ? critical ? "bad" : "warn" : "ok";
  return <div className={`fcc-check ${state}`}><div className="fcc-check-top"><span className="fcc-check-title">{title}</span><strong className="fcc-check-count">{count}</strong></div><p>{count > 0 ? `${money(amount)} flagged for review` : okText}</p></div>;
}
