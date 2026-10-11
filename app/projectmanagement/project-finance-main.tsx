"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./project-finance-main.module.css";

type Tab = "overview" | "cash" | "suppliers" | "contractors" | "ledger";
type Action =
  | "cash_in"
  | "cash_out"
  | "supplier_funding"
  | "supplier_delivery"
  | "supplier_direct_purchase"
  | "supplier_refund"
  | "contractor_payment"
  | "contractor_bill"
  | "create_supplier"
  | "create_contractor";

type FormState = Record<string, string | boolean>;

const money = (value: unknown) => new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
  maximumFractionDigits: 2,
}).format(Number(value || 0));

const number = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const dateText = (value: unknown) => {
  const raw = String(value || "").slice(0, 10);
  if (!raw) return "—";
  const date = new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

const today = () => new Date().toISOString().slice(0, 10);

const ACTION_LABELS: Record<Action, string> = {
  cash_in: "Cash In",
  cash_out: "Cash Out",
  supplier_funding: "Pay / Fund Supplier",
  supplier_delivery: "Record Supplier Delivery",
  supplier_direct_purchase: "Direct Supplier Purchase",
  supplier_refund: "Supplier Refund",
  contractor_payment: "Pay Contractor",
  contractor_bill: "Certify Contractor Bill",
  create_supplier: "Add Supplier",
  create_contractor: "Add Contractor",
};

function blank(action: Action): FormState {
  const common: FormState = {
    date: today(),
    amount: "",
    details: "",
    category: "",
    paymentMethod: "cash",
    referenceNo: "",
    memo: "",
    chequeStatus: "cashed",
  };
  if (action === "cash_in") return { ...common, receivedFrom: "Mr. Mahi Bhai", heldBy: "Eng Shajiv" };
  if (action === "cash_out") return { ...common, paidTo: "", category: "Other Expenses" };
  if (action === "supplier_funding") return { ...common, supplierId: "", fundingMode: "project_cash", receivedFrom: "Mr. Mahi Bhai" };
  if (action === "supplier_delivery") return { ...common, supplierId: "", quantity: "", rate: "", paymentMethod: "unspecified" };
  if (action === "supplier_direct_purchase") return { ...common, supplierId: "", applyAdvance: true };
  if (action === "supplier_refund") return { ...common, supplierId: "" };
  if (action === "contractor_payment") return { ...common, contractorId: "" };
  if (action === "contractor_bill") return { ...common, contractorId: "", quantity: "1", rate: "", deduction: "0", paymentMethod: "unspecified" };
  if (action === "create_supplier") return { name: "", category: "", unit: "SFT", memo: "" };
  return { name: "", category: "", pricingType: "rate", unit: "SFT", quantity: "", rate: "", contractAmount: "", scope: "", memo: "" };
}

function Metric({ label, value, hint, tone = "neutral" }: { label: string; value: string; hint: string; tone?: "neutral" | "good" | "warn" | "gold" }) {
  return (
    <article className={`${styles.metric} ${styles[`metric_${tone}`] || ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function StatusPill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "gold" }) {
  return <span className={`${styles.pill} ${styles[`pill_${tone}`] || ""}`}>{children}</span>;
}

export default function ProjectFinanceMain() {
  const [data, setData] = useState<any>(null);
  const [project, setProject] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [form, setForm] = useState<FormState>({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  async function load(code = project) {
    setLoading(true);
    setError("");
    try {
      const url = code ? `/api/project-finance?projectId=${encodeURIComponent(code)}` : "/api/project-finance";
      const response = await fetch(url, { credentials: "same-origin", cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not load Project Management.");
      setData(json.data);
      if (json.data?.selectedProject?.projectCode) setProject(json.data.selectedProject.projectCode);
    } catch (err: any) {
      setError(err?.message || "Could not load Project Management.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryProject = params.get("projectId") || "";
    const queryTab = params.get("section") as Tab | null;
    if (queryProject) setProject(queryProject);
    if (queryTab && ["overview", "cash", "suppliers", "contractors", "ledger"].includes(queryTab)) setTab(queryTab);
    void load(queryProject);
  }, []);

  const admin = Boolean(data && !data.readOnly);
  const totals = data?.totals || {};
  const entries: any[] = data?.entries || [];
  const suppliers: any[] = data?.suppliers || [];
  const contractors: any[] = data?.contractors || [];
  const heldCheques: any[] = data?.heldCheques || [];

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((row: any) => {
      const matchesType = typeFilter === "all" || String(row.type || "") === typeFilter;
      const matchesSearch = !q || [row.date, row.type, row.party, row.details, row.category, row.referenceNo].join(" ").toLowerCase().includes(q);
      return matchesType && matchesSearch;
    });
  }, [entries, search, typeFilter]);

  const transactionTypes = useMemo(() => Array.from(new Set(entries.map((row: any) => String(row.type || "")).filter(Boolean))).sort(), [entries]);
  const cashEntries = useMemo(() => entries.filter((row: any) => number(row.cashIn) > 0 || number(row.cashOut) > 0), [entries]);
  const sattapur = useMemo(() => suppliers.find((row: any) => String(row.name || "").toLowerCase().includes("sattapur")), [suppliers]);

  function chooseProject(code: string) {
    setProject(code);
    setTab("overview");
    setSearch("");
    setTypeFilter("all");
    window.history.replaceState(null, "", `/projectmanagement?projectId=${encodeURIComponent(code)}`);
    void load(code);
  }

  function chooseTab(next: Tab) {
    setTab(next);
    const code = project || data?.selectedProject?.projectCode || "";
    window.history.replaceState(null, "", `/projectmanagement?projectId=${encodeURIComponent(code)}&section=${next}`);
  }

  function openAction(next: Action, defaults: Record<string, string | boolean> = {}) {
    setAction(next);
    setForm({ ...blank(next), ...defaults });
    setError("");
  }

  function field(name: string, value: string | boolean) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit() {
    if (!action || !data?.selectedProject) return;
    setSaving(true);
    setError("");
    try {
      const payload: any = { action, projectId: data.selectedProject.projectCode, ...form };
      const response = await fetch("/api/project-finance", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not save Project Finance transaction.");
      setAction(null);
      setMessage(`${ACTION_LABELS[action]} saved.`);
      await load(data.selectedProject.projectCode);
    } catch (err: any) {
      setError(err?.message || "Could not save Project Finance transaction.");
    } finally {
      setSaving(false);
    }
  }

  async function cashHeldCheque(row: any) {
    if (!confirm(`Mark this cheque as cashed?\n\n${row.details || row.referenceNo || "Held cheque"}\n${money(row.amount)}`)) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/project-finance", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cash_held_cheque", projectId: data.selectedProject.projectCode, ledgerId: row.id }),
      });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not clear held cheque.");
      setMessage("Cheque marked as cashed. Available Cash has been updated without adding Project Funding twice.");
      await load(data.selectedProject.projectCode);
    } catch (err: any) {
      setError(err?.message || "Could not clear held cheque.");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !data) {
    return <main className={styles.loading}><div><i /><strong>Loading Project Management</strong><span>Preparing cash, supplier and contractor positions…</span></div></main>;
  }

  if (data && !data.selectedProject) {
    return (
      <main className={styles.page}>
        <section className={styles.chooser}>
          <span>LAND VIEW · PROJECT MANAGEMENT</span>
          <h1>Select a Project</h1>
          <p>Open a project to manage its cash, recognized cost, supplier accounts and contractor accounts.</p>
          <div className={styles.projectGrid}>
            {(data.projects || []).map((item: any) => (
              <button key={item.id} onClick={() => chooseProject(item.projectCode)}>
                <small>{item.projectCode}</small>
                <strong>{item.projectName}</strong>
                <span>{item.clientName || "Client not recorded"}</span>
                <em>{item.lifecyclePhase || "Project Management"} →</em>
              </button>
            ))}
          </div>
          {error && <div className={styles.error}>{error}</div>}
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>LAND VIEW · PROJECT MANAGEMENT</span>
            <h1>Project Management</h1>
            <p>Cash control, actual project cost, supplier advances/payables and contractor accounts — one real event, one entry.</p>
          </div>
          <div className={styles.headerActions}>
            <button onClick={() => window.location.assign(`/projectmanagement/report?projectId=${encodeURIComponent(project)}`)}>Monthly Report</button>
            <button onClick={() => window.location.assign(`/projectmanagement/contractors?projectId=${encodeURIComponent(project)}`)}>Billing & Bills</button>
            <button onClick={() => void load(project)}>Refresh</button>
          </div>
        </header>

        {error && <div className={`${styles.notice} ${styles.noticeError}`}><strong>!</strong><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
        {message && <div className={`${styles.notice} ${styles.noticeSuccess}`}><strong>✓</strong><span>{message}</span><button onClick={() => setMessage("")}>×</button></div>}

        <section className={styles.projectBar}>
          <label>
            <span>PROJECT</span>
            <select value={data?.selectedProject?.projectCode || project} onChange={(event) => chooseProject(event.target.value)}>
              {(data?.projects || []).map((item: any) => <option key={item.id} value={item.projectCode}>{item.projectCode} — {item.projectName}</option>)}
            </select>
          </label>
          <div><small>ACTIVE PROJECT</small><strong>{data?.selectedProject?.projectName}</strong><span>{data?.selectedProject?.location || "Location not recorded"}</span></div>
          <div><small>STAGE</small><strong>{data?.selectedProject?.lifecyclePhase || "Project Management"}</strong><span>{entries.length.toLocaleString("en-BD")} finance records</span></div>
          <div className={styles.cashPosition}><small>AVAILABLE CASH</small><strong>{money(totals.availableCash)}</strong><span>Spendable project cash</span></div>
        </section>

        <nav className={styles.nav}>
          {(["overview", "cash", "suppliers", "contractors", "ledger"] as Tab[]).map((item) => (
            <button key={item} className={tab === item ? styles.active : ""} onClick={() => chooseTab(item)}>{item[0].toUpperCase() + item.slice(1)}</button>
          ))}
        </nav>

        {tab === "overview" && (
          <div className={styles.stack}>
            <section className={styles.metrics}>
              <Metric label="Project Funding" value={money(totals.projectFunding)} hint="All owner/project funding recorded" tone="good" />
              <Metric label="Available Cash" value={money(totals.availableCash)} hint="Opening cash + cash in − cash out" tone="gold" />
              <Metric label="Recognized Project Cost" value={money(totals.recognizedProjectCost)} hint="Materials + certified work + actual costs" />
              <Metric label="Cheque on Hold" value={money(totals.chequeOnHold)} hint={`${heldCheques.length} cheque${heldCheques.length === 1 ? "" : "s"} not yet cleared`} tone="warn" />
            </section>

            <section className={styles.positionGrid}>
              <article className={styles.positionCard}>
                <div><span>SUPPLIERS</span><strong>Commercial Position</strong></div>
                <dl>
                  <div><dt>Supplier Advance</dt><dd>{money(totals.supplierAdvance)}</dd></div>
                  <div><dt>Supplier Payable</dt><dd>{money(totals.supplierPayable)}</dd></div>
                  <div><dt>Active Suppliers</dt><dd>{suppliers.length}</dd></div>
                </dl>
                <button onClick={() => chooseTab("suppliers")}>Open Supplier Accounts →</button>
              </article>
              <article className={styles.positionCard}>
                <div><span>CONTRACTORS</span><strong>Certified Work Position</strong></div>
                <dl>
                  <div><dt>Contractor Advance</dt><dd>{money(totals.contractorAdvance)}</dd></div>
                  <div><dt>Contractor Payable</dt><dd>{money(totals.contractorPayable)}</dd></div>
                  <div><dt>Certified Work</dt><dd>{money(totals.contractorCertified)}</dd></div>
                </dl>
                <button onClick={() => chooseTab("contractors")}>Open Contractor Accounts →</button>
              </article>
              {sattapur && (
                <article className={styles.positionCard}>
                  <div><span>SATTAPUR BRICK FIELD</span><strong>Supplier Account</strong></div>
                  <dl>
                    <div><dt>Funded / Paid</dt><dd>{money(sattapur.funded)}</dd></div>
                    <div><dt>Recognized Brick Cost</dt><dd>{money(sattapur.cost)}</dd></div>
                    <div><dt>{sattapur.payable > 0 ? "Payable" : "Advance"}</dt><dd>{money(sattapur.payable > 0 ? sattapur.payable : sattapur.advance)}</dd></div>
                  </dl>
                  <button onClick={() => chooseTab("suppliers")}>View Sattapur in Suppliers →</button>
                </article>
              )}
            </section>

            {admin && (
              <section className={styles.quickActions}>
                <div><span>QUICK ENTRY</span><strong>Record a real project event</strong><small>The system creates the accounting effect automatically.</small></div>
                <div>
                  <button onClick={() => openAction("cash_in")}>+ Cash In</button>
                  <button onClick={() => openAction("cash_out")}>− Cash Out</button>
                  <button onClick={() => openAction("supplier_funding")}>Pay Supplier</button>
                  <button onClick={() => openAction("supplier_delivery")}>Supplier Delivery</button>
                  <button onClick={() => openAction("contractor_payment")}>Pay Contractor</button>
                  <button onClick={() => openAction("contractor_bill")}>Certify Work</button>
                </div>
              </section>
            )}

            <section className={styles.panel}>
              <div className={styles.sectionHead}><div><span>RECENT ACTIVITY</span><strong>Latest project finance events</strong></div><button onClick={() => chooseTab("ledger")}>Full Ledger →</button></div>
              <TransactionTable rows={entries.slice(0, 10)} />
            </section>
          </div>
        )}

        {tab === "cash" && (
          <div className={styles.stack}>
            <section className={styles.metrics}>
              <Metric label="Opening Cash" value={money(totals.openingCash)} hint="Verified cutover cash position" />
              <Metric label="Cash In Since Cutover" value={money(totals.cashInSinceCutover)} hint="Cash actually received after cutover" tone="good" />
              <Metric label="Cash Out Since Cutover" value={money(totals.cashOutSinceCutover)} hint="Cash actually paid after cutover" tone="warn" />
              <Metric label="Available Cash" value={money(totals.availableCash)} hint="Current spendable project cash" tone="gold" />
            </section>

            {admin && <div className={styles.actionRow}><button onClick={() => openAction("cash_in")}>+ Cash In</button><button onClick={() => openAction("cash_out")}>− Cash Out</button></div>}

            <section className={styles.panel}>
              <div className={styles.sectionHead}><div><span>HELD CHEQUES</span><strong>Not yet part of available cash</strong></div><StatusPill tone={heldCheques.length ? "warn" : "good"}>{heldCheques.length} OPEN</StatusPill></div>
              <div className={styles.cardList}>
                {heldCheques.map((row: any) => (
                  <article key={row.id}>
                    <div><small>{dateText(row.date)}</small><strong>{row.details || row.referenceNo || "Held cheque"}</strong><span>{row.party || "—"}{row.referenceNo ? ` · ${row.referenceNo}` : ""}</span></div>
                    <b>{money(row.amount)}</b>
                    {admin && <button disabled={saving} onClick={() => void cashHeldCheque(row)}>Mark Cashed</button>}
                  </article>
                ))}
                {!heldCheques.length && <div className={styles.empty}>No held cheques.</div>}
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.sectionHead}><div><span>CASH REGISTER</span><strong>Only transactions that moved cash</strong></div></div>
              <TransactionTable rows={cashEntries} />
            </section>
          </div>
        )}

        {tab === "suppliers" && (
          <div className={styles.stack}>
            <div className={styles.sectionToolbar}>
              <div><span>SUPPLIER CONTROL</span><strong>Payments, deliveries, advance and payable</strong><small>A supplier payment changes cash; a delivery changes project cost. They are not the same event.</small></div>
              {admin && <button onClick={() => openAction("create_supplier")}>+ Add Supplier</button>}
            </div>
            <section className={styles.metrics}>
              <Metric label="Supplier Advance" value={money(totals.supplierAdvance)} hint="Money/material value still held by suppliers" tone="good" />
              <Metric label="Supplier Payable" value={money(totals.supplierPayable)} hint="Materials received but not yet funded" tone="warn" />
              <Metric label="Recognized Supplier Cost" value={money(suppliers.reduce((sum: number, row: any) => sum + number(row.cost), 0))} hint="Delivered/direct-purchase material value" />
              <Metric label="Active Suppliers" value={String(suppliers.length)} hint="Project supplier accounts" />
            </section>
            <section className={styles.partyGrid}>
              {suppliers.map((row: any) => (
                <article key={row.id} className={styles.partyCard}>
                  <div className={styles.partyTop}><div><span>{row.category || "SUPPLIER"}</span><strong>{row.name}</strong></div><StatusPill tone={row.payable > 0 ? "warn" : row.advance > 0 ? "good" : "neutral"}>{row.payable > 0 ? "PAYABLE" : row.advance > 0 ? "ADVANCE" : "SETTLED"}</StatusPill></div>
                  <dl>
                    <div><dt>Funded / Paid</dt><dd>{money(row.funded)}</dd></div>
                    <div><dt>Project Cost</dt><dd>{money(row.cost)}</dd></div>
                    <div><dt>Advance</dt><dd>{money(row.advance)}</dd></div>
                    <div><dt>Payable</dt><dd>{money(row.payable)}</dd></div>
                  </dl>
                  {admin && <div className={styles.partyActions}>
                    <button onClick={() => openAction("supplier_funding", { supplierId: row.id })}>Pay / Fund</button>
                    <button onClick={() => openAction("supplier_delivery", { supplierId: row.id, category: row.category || "" })}>Delivery</button>
                    <button onClick={() => openAction("supplier_direct_purchase", { supplierId: row.id, category: row.category || "" })}>Direct Purchase</button>
                    <button onClick={() => openAction("supplier_refund", { supplierId: row.id })}>Refund</button>
                  </div>}
                </article>
              ))}
              {!suppliers.length && <div className={styles.empty}>No suppliers have been configured for this project.</div>}
            </section>
          </div>
        )}

        {tab === "contractors" && (
          <div className={styles.stack}>
            <div className={styles.sectionToolbar}>
              <div><span>CONTRACTOR CONTROL</span><strong>Certified work, payments, advance and payable</strong><small>Payments reduce cash. Certified work recognizes project cost and creates contractor payable where necessary.</small></div>
              {admin && <button onClick={() => openAction("create_contractor")}>+ Add Contractor</button>}
            </div>
            <section className={styles.metrics}>
              <Metric label="Certified Work" value={money(totals.contractorCertified)} hint="Recognized contractor cost" />
              <Metric label="Contractor Advance" value={money(totals.contractorAdvance)} hint="Payments above certified work" tone="good" />
              <Metric label="Contractor Payable" value={money(totals.contractorPayable)} hint="Certified work not yet paid" tone="warn" />
              <Metric label="Active Contractors" value={String(contractors.length)} hint="Project contractor accounts" />
            </section>
            <section className={styles.partyGrid}>
              {contractors.map((row: any) => (
                <article key={row.id} className={styles.partyCard}>
                  <div className={styles.partyTop}><div><span>{row.category || "CONTRACTOR"}</span><strong>{row.name}</strong></div><StatusPill tone={row.payable > 0 ? "warn" : row.advance > 0 ? "good" : "neutral"}>{row.payable > 0 ? "PAYABLE" : row.advance > 0 ? "ADVANCE" : "SETTLED"}</StatusPill></div>
                  <dl>
                    <div><dt>Contract Value</dt><dd>{money(row.contractValue)}</dd></div>
                    <div><dt>Certified Work</dt><dd>{money(row.certified)}</dd></div>
                    <div><dt>Paid</dt><dd>{money(row.paid)}</dd></div>
                    <div><dt>{row.payable > 0 ? "Payable" : "Advance"}</dt><dd>{money(row.payable > 0 ? row.payable : row.advance)}</dd></div>
                  </dl>
                  {admin && <div className={styles.partyActions}>
                    <button onClick={() => openAction("contractor_payment", { contractorId: row.id, category: row.category || "" })}>Pay Contractor</button>
                    <button onClick={() => openAction("contractor_bill", { contractorId: row.id })}>Certify Work</button>
                  </div>}
                </article>
              ))}
              {!contractors.length && <div className={styles.empty}>No contractors have been configured for this project.</div>}
            </section>
          </div>
        )}

        {tab === "ledger" && (
          <section className={styles.panel}>
            <div className={styles.ledgerToolbar}>
              <div><span>UNIFIED EVENT REGISTER</span><strong>Project Finance Ledger</strong><small>No debit/credit interpretation is required — each row shows its business effect.</small></div>
              <div>
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}><option value="all">All Types</option>{transactionTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select>
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search party, details, category…" />
              </div>
            </div>
            <TransactionTable rows={filteredEntries} />
          </section>
        )}
      </div>

      {action && admin && (
        <div className={styles.modalShell} role="dialog" aria-modal="true">
          <button className={styles.backdrop} onClick={() => !saving && setAction(null)} aria-label="Close" />
          <div className={styles.modal}>
            <div className={styles.modalHead}><div><span>PROJECT FINANCE</span><strong>{ACTION_LABELS[action]}</strong></div><button onClick={() => setAction(null)} disabled={saving}>×</button></div>
            <ActionForm action={action} form={form} onChange={field} suppliers={suppliers} contractors={contractors} />
            <div className={styles.modalFoot}><button onClick={() => setAction(null)} disabled={saving}>Cancel</button><button className={styles.primary} onClick={() => void submit()} disabled={saving}>{saving ? "Saving…" : `Save ${ACTION_LABELS[action]}`}</button></div>
          </div>
        </div>
      )}
    </main>
  );
}

function TransactionTable({ rows }: { rows: any[] }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr><th>Date</th><th>Type</th><th>Party</th><th>Details</th><th>Category</th><th className={styles.numeric}>Cash In</th><th className={styles.numeric}>Cash Out</th><th className={styles.numeric}>Project Cost</th></tr></thead>
        <tbody>
          {rows.map((row: any) => (
            <tr key={row.id}>
              <td>{dateText(row.date)}</td>
              <td><StatusPill tone={number(row.cashIn) > 0 ? "good" : number(row.cashOut) > 0 ? "warn" : row.type === "Material Delivery" ? "gold" : "neutral"}>{row.type || "Adjustment"}</StatusPill></td>
              <td><strong>{row.party || "—"}</strong></td>
              <td><span className={styles.detail}>{row.details || "—"}</span>{row.referenceNo && <small className={styles.reference}>{row.referenceNo}</small>}</td>
              <td>{row.category || "—"}</td>
              <td className={`${styles.numeric} ${styles.in}`}>{number(row.cashIn) > 0 ? money(row.cashIn) : "—"}</td>
              <td className={`${styles.numeric} ${styles.out}`}>{number(row.cashOut) > 0 ? money(row.cashOut) : "—"}</td>
              <td className={styles.numeric}>{number(row.projectCost) > 0 ? money(row.projectCost) : "—"}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={8} className={styles.empty}>No matching transactions.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ActionForm({ action, form, onChange, suppliers, contractors }: { action: Action; form: FormState; onChange: (name: string, value: string | boolean) => void; suppliers: any[]; contractors: any[] }) {
  const dateAndDetails = !["create_supplier", "create_contractor"].includes(action);
  const monetary = !["supplier_delivery", "contractor_bill", "create_supplier", "create_contractor"].includes(action);
  const payment = ["cash_in", "cash_out", "supplier_funding", "supplier_direct_purchase", "supplier_refund", "contractor_payment"].includes(action);
  return (
    <div className={styles.form}>
      {action === "create_supplier" && <>
        <label><span>Supplier Name</span><input value={String(form.name || "")} onChange={(e) => onChange("name", e.target.value)} /></label>
        <label><span>Primary Category</span><input value={String(form.category || "")} onChange={(e) => onChange("category", e.target.value)} placeholder="Bricks, Steel, Cement…" /></label>
        <label><span>Billing Unit</span><input value={String(form.unit || "")} onChange={(e) => onChange("unit", e.target.value)} placeholder="SFT / CFT / KG / PCS" /></label>
        <label className={styles.full}><span>Notes</span><textarea value={String(form.memo || "")} onChange={(e) => onChange("memo", e.target.value)} /></label>
      </>}

      {action === "create_contractor" && <>
        <label><span>Contractor Name</span><input value={String(form.name || "")} onChange={(e) => onChange("name", e.target.value)} /></label>
        <label><span>Category</span><input value={String(form.category || "")} onChange={(e) => onChange("category", e.target.value)} placeholder="Masonry, Electrical…" /></label>
        <label><span>Pricing</span><select value={String(form.pricingType || "rate")} onChange={(e) => onChange("pricingType", e.target.value)}><option value="rate">Rate Based</option><option value="lump_sum">Lump Sum</option></select></label>
        {form.pricingType === "lump_sum" ? <label><span>Contract Amount</span><input type="number" value={String(form.contractAmount || "")} onChange={(e) => onChange("contractAmount", e.target.value)} /></label> : <>
          <label><span>Unit</span><input value={String(form.unit || "")} onChange={(e) => onChange("unit", e.target.value)} /></label>
          <label><span>Contract Quantity</span><input type="number" value={String(form.quantity || "")} onChange={(e) => onChange("quantity", e.target.value)} /></label>
          <label><span>Agreed Rate</span><input type="number" value={String(form.rate || "")} onChange={(e) => onChange("rate", e.target.value)} /></label>
        </>}
        <label className={styles.full}><span>Scope</span><textarea value={String(form.scope || "")} onChange={(e) => onChange("scope", e.target.value)} /></label>
      </>}

      {dateAndDetails && <label><span>Date</span><input type="date" value={String(form.date || "")} onChange={(e) => onChange("date", e.target.value)} /></label>}
      {action === "cash_in" && <><label><span>Received From</span><select value={String(form.receivedFrom || "")} onChange={(e) => onChange("receivedFrom", e.target.value)}><option>Mr. Mahi Bhai</option><option>Scrap Selling</option><option>Mr. Jamaluddin</option></select></label><label><span>Held By / Paid To</span><input value={String(form.heldBy || "")} onChange={(e) => onChange("heldBy", e.target.value)} /></label></>}
      {action === "cash_out" && <label><span>Paid To</span><input value={String(form.paidTo || "")} onChange={(e) => onChange("paidTo", e.target.value)} /></label>}
      {["supplier_funding", "supplier_delivery", "supplier_direct_purchase", "supplier_refund"].includes(action) && <label><span>Supplier</span><select value={String(form.supplierId || "")} onChange={(e) => onChange("supplierId", e.target.value)}><option value="">Select supplier</option>{suppliers.map((row: any) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
      {["contractor_payment", "contractor_bill"].includes(action) && <label><span>Contractor</span><select value={String(form.contractorId || "")} onChange={(e) => onChange("contractorId", e.target.value)}><option value="">Select contractor</option>{contractors.map((row: any) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
      {action === "supplier_funding" && <><label><span>Funding Source</span><select value={String(form.fundingMode || "project_cash")} onChange={(e) => onChange("fundingMode", e.target.value)}><option value="project_cash">Pay from Project Cash</option><option value="owner_direct">Owner Pays Supplier Directly</option></select></label>{form.fundingMode === "owner_direct" && <label><span>Received From</span><select value={String(form.receivedFrom || "")} onChange={(e) => onChange("receivedFrom", e.target.value)}><option>Mr. Mahi Bhai</option><option>Mr. Jamaluddin</option></select></label>}</>}
      {action === "supplier_delivery" && <><label><span>Quantity</span><input type="number" value={String(form.quantity || "")} onChange={(e) => onChange("quantity", e.target.value)} /></label><label><span>Rate</span><input type="number" value={String(form.rate || "")} onChange={(e) => onChange("rate", e.target.value)} /></label><label><span>Delivery Value</span><input type="number" value={String(form.amount || "")} onChange={(e) => onChange("amount", e.target.value)} placeholder="Optional if Qty × Rate is used" /></label></>}
      {action === "contractor_bill" && <><label><span>Quantity</span><input type="number" value={String(form.quantity || "")} onChange={(e) => onChange("quantity", e.target.value)} /></label><label><span>Rate</span><input type="number" value={String(form.rate || "")} onChange={(e) => onChange("rate", e.target.value)} /></label><label><span>Certified Amount</span><input type="number" value={String(form.amount || "")} onChange={(e) => onChange("amount", e.target.value)} placeholder="Optional if Qty × Rate is used" /></label><label><span>Deduction</span><input type="number" value={String(form.deduction || "0")} onChange={(e) => onChange("deduction", e.target.value)} /></label></>}
      {monetary && <label><span>Amount</span><input type="number" value={String(form.amount || "")} onChange={(e) => onChange("amount", e.target.value)} /></label>}
      {action === "supplier_direct_purchase" && <label className={styles.check}><input type="checkbox" checked={Boolean(form.applyAdvance)} onChange={(e) => onChange("applyAdvance", e.target.checked)} /><span>Apply available supplier advance first</span></label>}
      {dateAndDetails && <label><span>Category</span><input value={String(form.category || "")} onChange={(e) => onChange("category", e.target.value)} placeholder="Project category" /></label>}
      {payment && <label><span>Payment Method</span><select value={String(form.paymentMethod || "cash")} onChange={(e) => onChange("paymentMethod", e.target.value)}><option value="cash">Cash</option><option value="bank_transfer">Bank Transfer</option><option value="cheque">Cheque</option><option value="mobile_banking">Mobile Banking</option><option value="other">Other</option></select></label>}
      {payment && form.paymentMethod === "cheque" && <label><span>Cheque Status</span><select value={String(form.chequeStatus || "cashed")} onChange={(e) => onChange("chequeStatus", e.target.value)}><option value="cashed">Cashed</option><option value="on_hold">On Hold</option></select></label>}
      {payment && <label><span>Reference No.</span><input value={String(form.referenceNo || "")} onChange={(e) => onChange("referenceNo", e.target.value)} /></label>}
      {dateAndDetails && <label className={styles.full}><span>Details</span><textarea value={String(form.details || "")} onChange={(e) => onChange("details", e.target.value)} /></label>}
      {dateAndDetails && <label className={styles.full}><span>Memo / Notes</span><textarea value={String(form.memo || "")} onChange={(e) => onChange("memo", e.target.value)} /></label>}
    </div>
  );
}
