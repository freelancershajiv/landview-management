"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ProjectReceiptHistory from "@/components/project-receipt-history";

type Row = Record<string, any>;
type Category = "Engineering Bill" | "Other Services Bill" | "Supervision Bill";
const CATEGORY_ORDER: Category[] = ["Engineering Bill", "Other Services Bill", "Supervision Bill"];

function money(v: unknown) {
  const n = Number(v || 0);
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);
}
function num(v: unknown) {
  const n = Number(String(v ?? "").replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function today() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
async function readJson(response: Response, fallback: string) {
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || fallback));
  return json.data;
}
async function workflowGet(query: string) {
  return readJson(await fetch(`/api/service-workflow?${query}`, { credentials: "same-origin", cache: "no-store" }), "Could not load service billing data.");
}
async function savePayment(payload: Row) {
  return readJson(await fetch("/api/billing/write", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "savePayment", ...payload }),
  }), "Could not save payment.");
}

export default function ReceivePaymentPage() {
  const [projects, setProjects] = useState<Row[]>([]);
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState<Row | null>(null);
  const [category, setCategory] = useState<Category>("Engineering Bill");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [selectedService, setSelectedService] = useState("");
  const [paymentDate, setPaymentDate] = useState(today());
  const [method, setMethod] = useState("Bank Transfer");
  const [account, setAccount] = useState("Bank Account");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [receiptPaymentCode, setReceiptPaymentCode] = useState("");
  const [advanceMode, setAdvanceMode] = useState(false);
  const [pendingCheck, setPendingCheck] = useState(false);
  const pendingSubmission = useRef<{ key: string; fingerprint: string; projectId: string } | null>(null);
  const pendingStorageKey = "lv-billing-payment-v4";
  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(pendingStorageKey);
      const item = stored ? JSON.parse(stored) : null;
      if (item && typeof item.key === "string" && typeof item.fingerprint === "string" &&
          typeof item.projectId === "string" && item.createdAt > Date.now() - 24 * 60 * 60 * 1000) {
        pendingSubmission.current = item;
        window.setTimeout(() => setPendingCheck(true), 0);
      }
    } catch { /* Private mode may disable session storage. The in-memory key still works. */ }
  }, []);
  async function fingerprint(payload: Row) {
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  function forgetPending() {
    pendingSubmission.current = null;
    setPendingCheck(false);
    try { window.sessionStorage.removeItem(pendingStorageKey); } catch { /* Storage disabled. */ }
  }
  async function checkPending() {
    const pending = pendingSubmission.current;
    if (!pending) return;
    setBusy(true); setError("");
    try {
      const url = `/api/billing/submission-status?projectId=${encodeURIComponent(pending.projectId)}&key=${encodeURIComponent(pending.key)}`;
      const result = await readJson(await fetch(url, { credentials: "same-origin", cache: "no-store" }), "Could not confirm the previous payment.");
      if (result.found) {
        forgetPending();
        setProjectId(pending.projectId);
        await loadProject(pending.projectId);
        setReceiptPaymentCode(String(result.paymentCode || ""));
        setMessage(`Previously submitted payment ${result.paymentCode || ""} was recorded. No duplicate was created.`);
      } else {
        setError("No recorded payment was found for the previous submission. Retry the same unchanged payment to reuse its protected submission ID, or verify the payment register before starting a different payment.");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not check previous payment."); }
    finally { setBusy(false); }
  }
  function resetAfterReview() {
    if (!window.confirm("Confirm that you checked the previous payment and receipt register. Start a DIFFERENT submission?")) return;
    forgetPending();
    setError(""); setMessage("New payment submission is ready. Confirm the amount and project before saving.");
  }

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("fileId")?.toUpperCase() || "";
    if (requested) setProjectId(requested);
    void workflowGet("mode=billing-projects")
      .then((r) => {
        setProjects(r.projects || []);
        if (requested) void loadProject(requested);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProject(id = projectId) {
    if (!id) { setData(null); return; }
    setLoading(true); setError(""); setMessage("");
    try {
      const next = await workflowGet(`mode=billing&projectId=${encodeURIComponent(id)}`);
      const loadedServices: Row[] = Array.isArray(next?.services) ? next.services : [];
      const nextCategory = loadedServices.some((service) => service.billingCategory === category)
        ? category
        : CATEGORY_ORDER.find((item) => loadedServices.some((service) => service.billingCategory === item)) || "Engineering Bill";
      setData(next);
      setCategory(nextCategory);
      setAllocations({});
      setPaymentAmount("");
      setSelectedService("");
      const url = new URL(window.location.href);
      url.searchParams.set("fileId", id);
      window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load project services.");
    } finally { setLoading(false); }
  }

  const services: Row[] = data?.services || [];
  const categoryServices = useMemo(() => services.filter((s) => s.billingCategory === category), [services, category]);
  const activeSelectedService = categoryServices.find((s) => s.serviceKey === selectedService) || categoryServices[0] || null;

  function serviceNet(service: Row) { return Math.max(0, num(service.gross) - Math.max(0, num(service.discount))); }
  function serviceDue(service: Row) { return Math.max(0, serviceNet(service) - Math.max(0, num(service.paid))); }

  const categorySummary = useMemo(() => categoryServices.reduce((acc, service) => {
    acc.gross += Math.max(0, num(service.gross));
    acc.discount += Math.max(0, num(service.discount));
    acc.net += serviceNet(service);
    acc.paid += Math.max(0, num(service.paid));
    acc.due += serviceDue(service);
    return acc;
  }, { gross: 0, discount: 0, net: 0, paid: 0, due: 0 }), [categoryServices]);

  const allocatedTotal = Object.values(allocations).reduce((sum, value) => sum + Math.max(0, num(value)), 0);

  function autoAllocate(raw: string) {
    setPaymentAmount(raw);
    if (category !== "Engineering Bill") return;
    let remaining = Math.max(0, num(raw));
    const next: Record<string, string> = {};
    for (const service of categoryServices) {
      const applied = Math.min(serviceDue(service), remaining);
      next[service.serviceKey] = applied > 0 ? String(applied) : "";
      remaining = Math.max(0, remaining - applied);
    }
    setAllocations(next);
  }

  async function pay() {
    if (busy) return;
    if (!projectId || !data) return setError("Choose a project first.");
    if (!paymentDate) return setError("Choose a payment date.");
    const amount = Math.max(0, num(paymentAmount));
    if (!(amount > 0)) return setError("Enter a payment amount.");
    if (!advanceMode && amount > categorySummary.due + 0.01) {
      return setError(`Payment cannot exceed ${money(categorySummary.due)} due. Use Receive Advance to record extra money.`);
    }

    setBusy(true); setError(""); setMessage("");
    try {
      let serviceType = "";
      let serviceAllocations: Array<{ serviceName: string; amount: number }> = [];
      if (!advanceMode && category === "Engineering Bill") {
        if (Math.abs(allocatedTotal - amount) > 0.01) throw new Error("Allocated service amounts must exactly equal the payment amount.");
        for (const service of categoryServices) {
          const allocated = Math.max(0, num(allocations[service.serviceKey]));
          if (allocated > serviceDue(service) + 0.01) throw new Error(`${service.serviceName} allocation cannot exceed its due of ${money(serviceDue(service))}.`);
        }
        serviceAllocations = categoryServices.map((service) => ({
          serviceName: String(service.serviceName), amount: Math.max(0, num(allocations[service.serviceKey])),
        })).filter((item) => item.amount > 0);
      } else if (!advanceMode) {
        const service = activeSelectedService;
        if (!service) throw new Error("Choose a billed service first.");
        if (amount > serviceDue(service) + 0.01) throw new Error(`${service.serviceName} has only ${money(serviceDue(service))} due.`);
        serviceType = category === "Other Services Bill"
          ? service.serviceName === "Municipality Approval Contract" ? "Municipality File Pass" : String(service.serviceName)
          : "";
      }
      const payload: Row = {
        Project_ID: projectId, Payment_Date: paymentDate, Amount: amount,
        Payment_Method: method, Deposit_Account: account, Reference_No: reference.trim(),
        Payment_For: category, Income_Category: category, Service_Type: serviceType,
        Transaction_Type: "Business Income", Affects_Business_Balance: "Yes",
        Received_From: data?.project?.ownerName || "", Notes: notes.trim(),
        Service_Allocations: serviceAllocations, Receive_Advance: advanceMode,
      };
      const hash = await fingerprint(payload);
      const prior = pendingSubmission.current;
      if (prior && (prior.fingerprint !== hash || prior.projectId !== projectId)) {
        throw new Error("An earlier payment submission is unresolved. Check its status first; do not accidentally submit the same money again with a different amount or project.");
      }
      const key = prior?.key || `receive-payment-${crypto.randomUUID()}`;
      if (!prior) {
        pendingSubmission.current = { key, fingerprint: hash, projectId };
        setPendingCheck(true);
        try { window.sessionStorage.setItem(pendingStorageKey, JSON.stringify({ key, fingerprint: hash, projectId, createdAt: Date.now() })); }
        catch { /* In-memory key is retained until reload. */ }
      }
      const savedPayment = await savePayment({ ...payload, Idempotency_Key: key });
      const paymentCode = String(savedPayment?.Payment_ID || savedPayment?.paymentCode || "").trim();
      forgetPending();
      await loadProject(projectId);
      setReceiptPaymentCode(paymentCode);
      setMessage(paymentCode
        ? `Payment ${paymentCode} saved. Open the linked receipt below.`
        : "Payment saved. Refresh receipts to view its recorded details.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save payment. Check the payment status before retrying.");
    } finally { setBusy(false); }
  }

  return <main className="rp">
    <style>{`
      .rp{max-width:1450px;margin:0 auto;color:var(--lv-text-primary)}.rp *{box-sizing:border-box}.rp-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:15px}.rp-head small{font-size:8px;font-weight:950;letter-spacing:.12em;color:var(--lv-brand-text)}.rp-head h1{margin:5px 0 0;font-size:27px}.rp-head p{margin:5px 0 0;font-size:12px;color:var(--lv-text-secondary)}.rp-card{border:1px solid var(--lv-border-default);border-radius:12px;background:var(--lv-surface-panel)}.rp-select{display:grid;grid-template-columns:1fr;gap:9px;padding:13px;margin-bottom:12px}.rp-field label{display:block;margin-bottom:5px;font-size:12px;font-weight:900;text-transform:uppercase;color:var(--lv-text-muted)}.rp-field input,.rp-field select,.rp-field textarea{width:100%;min-height:38px;padding:8px 10px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:13px}.rp-tabs{display:flex;gap:6px;margin-bottom:12px}.rp-tab{padding:9px 12px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-panel);color:var(--lv-text-secondary);font-size:12px;font-weight:900;cursor:pointer}.rp-tab.active{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.rp-summary{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:12px;margin-bottom:12px}.rp-stat{padding:11px;border:1px solid var(--lv-border-subtle);border-radius:9px;background:var(--lv-surface-muted)}.rp-stat span{display:block;font-size:7px;text-transform:uppercase;color:var(--lv-text-muted)}.rp-stat strong{display:block;margin-top:6px;font-size:15px}.rp-layout{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(330px,.7fr);gap:12px}.rp-table{overflow:auto}.rp-table table{width:100%;border-collapse:collapse;min-width:800px}.rp-table th,.rp-table td{padding:10px;border-bottom:1px solid var(--lv-border-subtle);font-size:12px;text-align:left}.rp-table th{background:var(--lv-surface-muted);color:var(--lv-text-muted);text-transform:uppercase}.rp-table input{width:115px;padding:7px;border:1px solid var(--lv-border-default);border-radius:6px;background:var(--lv-surface-input);color:var(--lv-text-primary)}.rp-form{display:grid;gap:9px;padding:13px}.rp-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}.rp-btn{min-height:39px;border:1px solid var(--lv-brand-border);border-radius:8px;background:var(--lv-brand-primary);color:var(--lv-text-inverse);font-size:13px;font-weight:950;cursor:pointer}.rp-btn:disabled{opacity:.5}.rp-msg{margin-bottom:12px;padding:10px 12px;border-radius:8px;font-size:12px}.rp-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.rp-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}.rp-empty{padding:28px;text-align:center;color:var(--lv-text-muted);font-size:9px}.rp-due{color:var(--lv-danger);font-weight:900}.rp-paid{color:var(--lv-success);font-weight:900}@media(max-width:950px){.rp-summary{grid-template-columns:repeat(2,1fr)}.rp-layout{grid-template-columns:1fr}}@media(max-width:600px){.rp-two{grid-template-columns:1fr}.rp-summary{grid-template-columns:1fr 1fr}.rp-head{align-items:flex-start;flex-direction:column}}
    `}</style>

    <header className="rp-head"><div><small>LAND VIEW / BILLING</small><h1>Receive Payment</h1><p>Receive and allocate client money only. Discounts and posted bill corrections are handled elsewhere.</p></div></header>
    {error && <div className="rp-msg bad" role="alert">{error}</div>}{message && <div className="rp-msg good" role="status">{message}</div>}
    {pendingCheck && <section className="rp-card" style={{ padding: 14, marginBottom: 12, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 9 }}>
      <strong style={{ fontSize: 13 }}>Previous payment submission requires confirmation</strong>
      <button type="button" className="rp-btn" data-lv-button="primary" style={{ padding: "0 12px" }} onClick={() => void checkPending()} disabled={busy}>Check recorded payment</button>
      <button type="button" className="rp-btn" data-lv-button="secondary" style={{ padding: "0 12px", background: "var(--lv-surface-input)", color: "var(--lv-text-primary)", borderColor: "var(--lv-border-default)" }} onClick={resetAfterReview} disabled={busy}>Start different payment after review</button>
    </section>}

    <section className="rp-card rp-select">
      <div className="rp-field"><label>Project / File ID</label><select value={projectId} onChange={(e) => { setProjectId(e.target.value); setReceiptPaymentCode(""); void loadProject(e.target.value); }}><option value="">Choose project</option>{projects.map((p) => <option key={p.projectId || p.project_code} value={p.projectId || p.project_code}>{p.projectId || p.project_code} · {p.ownerName || p.projectName || p.project_name || "Project"}</option>)}</select></div>
    </section>

    <div className="rp-tabs">{CATEGORY_ORDER.map((item) => <button key={item} className={`rp-tab ${category === item ? "active" : ""}`} data-lv-button={category===item?"primary":"secondary"} onClick={() => { setCategory(item); setAllocations({}); setPaymentAmount(""); setSelectedService(""); }}>{item}</button>)}</div>

    {data ? <>
      <section className="rp-card rp-summary"><div className="rp-stat"><span>Gross</span><strong>{money(categorySummary.gross)}</strong></div><div className="rp-stat"><span>Discount</span><strong>{money(categorySummary.discount)}</strong></div><div className="rp-stat"><span>Net</span><strong>{money(categorySummary.net)}</strong></div><div className="rp-stat"><span>Paid</span><strong className="rp-paid">{money(categorySummary.paid)}</strong></div><div className="rp-stat"><span>Due</span><strong className="rp-due">{money(categorySummary.due)}</strong></div></section>
      <div className="rp-layout">
        <section className="rp-card rp-table"><table><thead><tr><th>Service</th><th>Net</th><th>Paid</th><th>Due</th>{category === "Engineering Bill" && <th>Allocate</th>}</tr></thead><tbody>{categoryServices.map((service) => <tr key={service.serviceKey}><td><strong>{service.serviceName}</strong></td><td>{money(serviceNet(service))}</td><td className="rp-paid">{money(service.paid)}</td><td className="rp-due">{money(serviceDue(service))}</td>{category === "Engineering Bill" && <td><input inputMode="decimal" value={allocations[service.serviceKey] || ""} onChange={(e) => setAllocations((current) => ({ ...current, [service.serviceKey]: e.target.value }))} /></td>}</tr>)}</tbody></table>{!categoryServices.length && <div className="rp-empty">No billed services in this category.</div>}</section>
        <section className="rp-card rp-form">
          {category !== "Engineering Bill" && !advanceMode && <div className="rp-field"><label>Service</label><select value={selectedService} onChange={(e) => setSelectedService(e.target.value)}><option value="">Choose service</option>{categoryServices.map((service) => <option key={service.serviceKey} value={service.serviceKey}>{service.serviceName} · Due {money(serviceDue(service))}</option>)}</select></div>}
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13, lineHeight: 1.5 }}>
            <input type="checkbox" checked={advanceMode} onChange={(e) => { setAdvanceMode(e.target.checked); setAllocations({}); setSelectedService(""); }} style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0 }} />
            <span><strong>Receive Advance / Extra Payment</strong><small style={{ display: "block", color: "var(--lv-text-secondary)", fontSize: 12 }}>Automatically applies to open invoices in this category first; any remaining amount stays as a project advance. Verify the payment receipt.</small></span>
          </label>
          <div className="rp-two">
            <div className="rp-field"><label>Payment Amount</label><input inputMode="decimal" value={paymentAmount} onChange={(e) => autoAllocate(e.target.value)} placeholder="0" /></div>
            <div className="rp-field"><label>Payment Date</label><input type="date" required value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></div>
          </div>
          {category === "Engineering Bill" && !advanceMode && <div className="rp-field"><label>Allocated</label><input readOnly value={money(allocatedTotal)} /></div>}
          <div className="rp-two">
            <div className="rp-field"><label>Payment Method</label><select value={method} onChange={(e) => setMethod(e.target.value)}><option>Bank Transfer</option><option>Cash</option><option>bKash</option><option>Nagad</option><option>Cheque</option><option>Card</option><option>Other</option></select></div>
            <div className="rp-field"><label>Deposit Account</label><input value={account} onChange={(e) => setAccount(e.target.value)} /></div>
          </div>
          <div className="rp-two"><div className="rp-field"><label>Reference</label><input value={reference} onChange={(e) => setReference(e.target.value)} /></div><div className="rp-field"><label>Category Due</label><input readOnly value={money(categorySummary.due)} /></div></div>
          <div className="rp-field"><label>Notes</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <button type="button" className="rp-btn" data-lv-button="primary" disabled={busy || loading || (!advanceMode && !categoryServices.length)} onClick={() => void pay()}>{busy ? "Saving…" : advanceMode ? "Save Advance Payment" : "Save Payment"}</button>
        </section>
      </div>
      <div style={{marginTop:14}}><ProjectReceiptHistory projectId={projectId} highlightPaymentCode={receiptPaymentCode} /></div>
    </> : !loading && <div className="rp-empty">Choose a project to receive payment.</div>}
  </main>;
}
