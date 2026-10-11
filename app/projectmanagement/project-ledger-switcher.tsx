"use client";

import { useEffect, useMemo, useState } from "react";
import ProjectFinanceMain from "./project-finance-main";
import styles from "./project-ledger-switcher.module.css";

type LedgerMode = "main" | "income" | "sattapur";

const num = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};
const money = (value: unknown) => new Intl.NumberFormat("en-BD", {
  style: "currency",
  currency: "BDT",
  maximumFractionDigits: 2,
}).format(num(value));
const qty = (value: unknown) => new Intl.NumberFormat("en-BD", { maximumFractionDigits: 3 }).format(num(value));
const dateText = (value: unknown) => {
  const raw = String(value || "").slice(0, 10);
  if (!raw) return "—";
  const date = new Date(`${raw}T00:00:00`);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};
const today = () => new Date().toISOString().slice(0, 10);

export default function ProjectLedgerSwitcher() {
  const [mode, setMode] = useState<LedgerMode>("main");
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ date: today(), details: "", quantity: "", rate: "14.50", amount: "", memo: "" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const section = params.get("section");
    const id = params.get("projectId") || "";
    setProjectId(id);
    if (section === "income") setMode("income");
    else if (section === "sattapur") setMode("sattapur");
    else setMode("main");
  }, []);

  useEffect(() => {
    if (mode === "main" || !projectId) return;
    void load(mode, projectId);
  }, [mode, projectId]);

  async function load(nextMode = mode, id = projectId) {
    if (!id || nextMode === "main") return;
    setLoading(true);
    setError("");
    try {
      const endpoint = nextMode === "income"
        ? `/api/project-management?projectId=${encodeURIComponent(id)}`
        : `/api/project-management/sattapur?projectId=${encodeURIComponent(id)}`;
      const response = await fetch(endpoint, { credentials: "same-origin", cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not load the project ledger.");
      setData(json.data);
    } catch (err: any) {
      setError(err?.message || "Could not load the project ledger.");
    } finally {
      setLoading(false);
    }
  }

  function open(next: LedgerMode) {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("projectId") || projectId;
    if (next !== "main" && !id) {
      window.alert("Select a Project Management project first.");
      return;
    }
    setProjectId(id || "");
    setData(null);
    setError("");
    setMessage("");
    setMode(next);
    if (id) {
      if (next === "main") params.set("section", "overview");
      else params.set("section", next);
      params.set("projectId", id);
      window.history.replaceState(null, "", `/projectmanagement?${params.toString()}`);
    }
  }

  async function saveDelivery() {
    if (!projectId) return;
    const quantity = num(form.quantity);
    const rate = num(form.rate);
    const amount = num(form.amount);
    if (!form.details.trim()) { setError("Delivery details are required."); return; }
    if (!(quantity > 0)) { setError("Delivery quantity must be greater than zero."); return; }
    if (!(rate > 0) && !(amount > 0)) { setError("Enter a rate or delivery value."); return; }
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/project-management/sattapur", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ...form }),
      });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(json?.error || "Could not save Sattapur delivery.");
      setForm({ date: today(), details: "", quantity: "", rate: form.rate || "14.50", amount: "", memo: "" });
      setDeliveryOpen(false);
      setMessage("Sattapur delivery saved to the Delivery Ledger. The Income Ledger was not changed.");
      await load("sattapur", projectId);
    } catch (err: any) {
      setError(err?.message || "Could not save Sattapur delivery.");
    } finally {
      setSaving(false);
    }
  }

  if (mode === "main") {
    return (
      <>
        <div className={styles.ledgerLauncher}>
          <div>
            <span>PROJECT LEDGERS</span>
            <strong>Keep funding and material deliveries separate</strong>
          </div>
          <div>
            <button onClick={() => open("income")}>Income Ledger</button>
            <button onClick={() => open("sattapur")}>Sattapur Delivery Ledger</button>
          </div>
        </div>
        <ProjectFinanceMain />
      </>
    );
  }

  const title = mode === "income" ? "Income Ledger" : "Sattapur Delivery Ledger";
  const project = mode === "income" ? data?.selectedProject : data?.project;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <div>
            <span>LAND VIEW · PROJECT MANAGEMENT</span>
            <h1>{title}</h1>
            <p>{mode === "income"
              ? "All project funding stays in the Income Ledger, including Sattapur Brick Field deposits."
              : "Materials received from Sattapur are recorded here separately. Delivery value reduces supplier advance without removing the original deposits from Income."}</p>
          </div>
          <div className={styles.headerActions}>
            <button onClick={() => open("main")}>← Project Management</button>
            {mode === "income" && <button onClick={() => open("sattapur")}>Sattapur Delivery Ledger</button>}
            {mode === "sattapur" && <button onClick={() => open("income")}>Income Ledger</button>}
            <button onClick={() => void load()}>Refresh</button>
          </div>
        </header>

        {project && (
          <section className={styles.projectStrip}>
            <div><small>PROJECT</small><strong>{project.projectCode}</strong></div>
            <div><small>PROJECT NAME</small><strong>{project.projectName}</strong></div>
            <div><small>LEDGER</small><strong>{title}</strong></div>
          </section>
        )}

        {error && <div className={`${styles.notice} ${styles.error}`}><strong>!</strong><span>{error}</span><button onClick={() => setError("")}>×</button></div>}
        {message && <div className={`${styles.notice} ${styles.success}`}><strong>✓</strong><span>{message}</span><button onClick={() => setMessage("")}>×</button></div>}

        {loading && !data ? <div className={styles.loading}>Loading {title}…</div> : mode === "income" ? (
          <IncomeLedger data={data} onOpenSattapur={() => open("sattapur")} />
        ) : (
          <SattapurLedger data={data} deliveryOpen={deliveryOpen} setDeliveryOpen={setDeliveryOpen} form={form} setForm={setForm} saving={saving} saveDelivery={saveDelivery} />
        )}
      </div>
    </main>
  );
}

function IncomeLedger({ data, onOpenSattapur }: { data: any; onOpenSattapur: () => void }) {
  const entries: any[] = data?.entries || [];
  const sattapurDeposits: any[] = data?.sattapurBricks?.deposits || [];
  const depositIds = useMemo(() => new Set(sattapurDeposits.map((row:any) => String(row.id))), [sattapurDeposits]);
  const income = useMemo(() => entries
    .filter((row:any) => num(row.debit) > 0)
    .slice()
    .sort((a:any,b:any) => String(b.entry_date || "").localeCompare(String(a.entry_date || "")) || num(b.serial_no) - num(a.serial_no)), [entries]);
  const totalIncome = num(data?.totals?.debit);
  const sattapurAmount = num(data?.sattapurBricks?.depositAmount);

  return (
    <div className={styles.stack}>
      <section className={styles.metrics}>
        <Metric label="Total Income / Deposit" value={money(totalIncome)} note={`${income.length} income records`} />
        <Metric label="Sattapur Deposits" value={money(sattapurAmount)} note={`${sattapurDeposits.length} deposits — retained in Income`} accent />
        <Metric label="Other Project Income" value={money(totalIncome - sattapurAmount)} note="Income excluding Sattapur deposits" />
      </section>

      <section className={styles.explainer}>
        <div><strong>Sattapur deposits remain Income.</strong><span>They are not converted to Expense. The money is shown as supplier-held funding, while received bricks are recorded only in the Delivery Ledger.</span></div>
        <button onClick={onOpenSattapur}>Open Delivery Ledger →</button>
      </section>

      <section className={styles.panel}>
        <div className={styles.panelHead}><div><span>INCOME REGISTER</span><strong>Project Income Ledger</strong></div></div>
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>SL</th><th>Date</th><th>Received From</th><th>Paid To / Held By</th><th>Details</th><th>Category</th><th className={styles.numeric}>Income</th><th className={styles.numeric}>Income Balance</th></tr></thead>
            <tbody>
              {income.map((row:any) => {
                const isSattapur = depositIds.has(String(row.id));
                return (
                  <tr key={row.id} className={isSattapur ? styles.sattapurRow : ""}>
                    <td>{row.serial_no || "—"}</td>
                    <td>{dateText(row.entry_date)}</td>
                    <td>{row.received_from || "—"}</td>
                    <td><strong>{row.paid_to || row.supplier || "Eng Shajiv"}</strong>{isSattapur && <small className={styles.tag}>SATTAPUR DEPOSIT</small>}</td>
                    <td>{row.details || "—"}</td>
                    <td>{row.category || "—"}</td>
                    <td className={`${styles.numeric} ${styles.income}`}>{money(row.debit)}</td>
                    <td className={styles.numeric}>{money(row.income_balance)}</td>
                  </tr>
                );
              })}
              {!income.length && <tr><td colSpan={8} className={styles.empty}>No income entries found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SattapurLedger({ data, deliveryOpen, setDeliveryOpen, form, setForm, saving, saveDelivery }: any) {
  const totals = data?.totals || {};
  const deliveries: any[] = data?.deliveries || [];
  const readOnly = Boolean(data?.readOnly);
  const calculated = num(form.quantity) * num(form.rate);

  return (
    <div className={styles.stack}>
      <section className={styles.metrics}>
        <Metric label="Deposits in Income Ledger" value={money(totals.depositAmount)} note={`${totals.depositCount || 0} Sattapur funding entries`} accent />
        <Metric label="Materials Received" value={money(totals.deliveredValue)} note={`${totals.deliveryCount || 0} delivery records · Qty ${qty(totals.deliveredQuantity)}`} />
        <Metric label="Supplier Advance" value={money(totals.supplierAdvance)} note="Deposit value still held by Sattapur" />
        <Metric label="Supplier Payable" value={money(totals.supplierPayable)} note="Delivery value above deposits" />
      </section>

      <section className={styles.explainer}>
        <div><strong>Delivery ledger only.</strong><span>Adding a delivery reduces the Sattapur supplier balance and records material received. It does not create another Income or cash Expense entry.</span></div>
        {!readOnly && <button onClick={() => setDeliveryOpen(!deliveryOpen)}>{deliveryOpen ? "Close Entry" : "+ Add Delivery"}</button>}
      </section>

      {deliveryOpen && !readOnly && (
        <section className={styles.deliveryForm}>
          <div className={styles.panelHead}><div><span>NEW MATERIAL RECEIPT</span><strong>Add Sattapur Delivery</strong></div></div>
          <div className={styles.formGrid}>
            <label><span>Delivery Date</span><input type="date" value={form.date} onChange={(e) => setForm((current:any) => ({ ...current, date: e.target.value }))} /></label>
            <label><span>Quantity</span><input type="number" value={form.quantity} onChange={(e) => setForm((current:any) => ({ ...current, quantity: e.target.value }))} placeholder="e.g. 5000" /></label>
            <label><span>Rate</span><input type="number" step="0.01" value={form.rate} onChange={(e) => setForm((current:any) => ({ ...current, rate: e.target.value }))} /></label>
            <label><span>Delivery Value</span><input type="number" step="0.01" value={form.amount} onChange={(e) => setForm((current:any) => ({ ...current, amount: e.target.value }))} placeholder={calculated > 0 ? String(calculated.toFixed(2)) : "Auto: Qty × Rate"} /></label>
            <label className={styles.full}><span>Details</span><input value={form.details} onChange={(e) => setForm((current:any) => ({ ...current, details: e.target.value }))} placeholder="e.g. 3rd Floor Masonry Bricks" /></label>
            <label className={styles.full}><span>Memo / Notes</span><textarea value={form.memo} onChange={(e) => setForm((current:any) => ({ ...current, memo: e.target.value }))} /></label>
          </div>
          <div className={styles.formFoot}><span>Calculated value: <strong>{money(form.amount || calculated)}</strong></span><button disabled={saving} onClick={() => void saveDelivery()}>{saving ? "Saving…" : "Save Delivery"}</button></div>
        </section>
      )}

      <section className={styles.panel}>
        <div className={styles.panelHead}><div><span>SATTAPUR BRICK FIELD</span><strong>Material Delivery Ledger</strong><small>Funding stays in Income; only materials received are listed here.</small></div></div>
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>SL</th><th>Date</th><th>Details</th><th>Category</th><th className={styles.numeric}>Quantity</th><th className={styles.numeric}>Rate</th><th className={styles.numeric}>Delivery Value</th><th className={styles.numeric}>Supplier Balance After</th></tr></thead>
            <tbody>
              {deliveries.map((row:any) => (
                <tr key={row.id}>
                  <td>{row.serialNo || "—"}</td>
                  <td>{dateText(row.date)}</td>
                  <td><strong>{row.details || "—"}</strong>{row.memo && <small className={styles.memo}>{row.memo}</small>}</td>
                  <td>{row.category || "Bricks"}</td>
                  <td className={styles.numeric}>{qty(row.quantity)}</td>
                  <td className={styles.numeric}>{money(row.rate)}</td>
                  <td className={`${styles.numeric} ${styles.delivery}`}>{money(row.value)}</td>
                  <td className={`${styles.numeric} ${num(row.supplierBalanceAfter) < 0 ? styles.payable : styles.advance}`}>{money(Math.abs(num(row.supplierBalanceAfter)))}{num(row.supplierBalanceAfter) < 0 ? " Payable" : " Advance"}</td>
                </tr>
              ))}
              {!deliveries.length && <tr><td colSpan={8} className={styles.empty}>No Sattapur deliveries recorded.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, note, accent = false }: { label: string; value: string; note: string; accent?: boolean }) {
  return <article className={`${styles.metric} ${accent ? styles.metricAccent : ""}`}><span>{label}</span><strong>{value}</strong><small>{note}</small></article>;
}
