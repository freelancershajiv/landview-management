"use client";

import { useEffect, useMemo, useState } from "react";

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
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState("Bank Transfer");
  const [account, setAccount] = useState("Bank Account");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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
    if (!projectId || !data) return setError("Choose a project first.");
    const amount = Math.max(0, num(paymentAmount));
    if (!(amount > 0)) return setError("Enter a payment amount.");
    if (amount > categorySummary.due + 0.01) return setError(`Payment cannot exceed ${money(categorySummary.due)} due.`);

    setBusy(true); setError(""); setMessage("");
    try {
      if (category === "Engineering Bill") {
        if (Math.abs(allocatedTotal - amount) > 0.01) throw new Error("Allocated service amounts must exactly equal the payment amount.");
        for (const service of categoryServices) {
          const allocated = Math.max(0, num(allocations[service.serviceKey]));
          if (allocated > serviceDue(service) + 0.01) throw new Error(`${service.serviceName} allocation cannot exceed its due of ${money(serviceDue(service))}.`);
        }
        await savePayment({
          Project_ID: projectId,
          Payment_Date: date,
          Amount: amount,
          Payment_Method: method,
          Deposit_Account: account,
          Reference_No: reference.trim(),
          Payment_For: category,
          Income_Category: category,
          Transaction_Type: "Business Income",
          Affects_Business_Balance: "Yes",
          Received_From: data?.project?.ownerName || "",
          Notes: notes.trim(),
          Service_Allocations: categoryServices.map((service) => ({
            serviceName: service.serviceName,
            amount: Math.max(0, num(allocations[service.serviceKey])),
          })).filter((row) => row.amount > 0),
          Idempotency_Key: `receive-payment-${crypto.randomUUID()}`,
        });
      } else {
        const service = activeSelectedService;
        if (!service) throw new Error("Choose a billed service first.");
        if (amount > serviceDue(service) + 0.01) throw new Error(`${service.serviceName} has only ${money(serviceDue(service))} due.`);
        const serviceType = service.serviceName === "Municipality Approval Contract" ? "Municipality File Pass" : service.serviceName;
        await savePayment({
          Project_ID: projectId,
          Payment_Date: date,
          Amount: amount,
          Payment_Method: method,
          Deposit_Account: account,
          Reference_No: reference.trim(),
          Payment_For: category,
          Income_Category: category,
          Service_Type: category === "Other Services Bill" ? serviceType : "",
          Transaction_Type: "Business Income",
          Affects_Business_Balance: "Yes",
          Received_From: data?.project?.ownerName || "",
          Notes: notes.trim(),
          Idempotency_Key: `receive-payment-${crypto.randomUUID()}`,
        });
      }
      setMessage("Payment saved. Invoice allocation and receipt lifecycle will reconcile automatically.");
      await loadProject(projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save payment.");
    } finally { setBusy(false); }
  }

  return <main className="rp">
    <style>{`
      .rp{max-width:1450px;margin:0 auto;color:var(--lv-text-primary)}.rp *{box-sizing:border-box}.rp-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:15px}.rp-head small{font-size:8px;font-weight:950;letter-spacing:.12em;color:var(--lv-brand-text)}.rp-head h1{margin:5px 0 0;font-size:27px}.rp-head p{margin:5px 0 0;font-size:9px;color:var(--lv-text-secondary)}.rp-card{border:1px solid var(--lv-border-default);border-radius:12px;background:var(--lv-surface-panel)}.rp-select{display:grid;grid-template-columns:1.5fr repeat(3,minmax(150px,.55fr));gap:9px;padding:13px;margin-bottom:12px}.rp-field label{display:block;margin-bottom:5px;font-size:7px;font-weight:900;text-transform:uppercase;color:var(--lv-text-muted)}.rp-field input,.rp-field select,.rp-field textarea{width:100%;min-height:38px;padding:8px 10px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:9px}.rp-tabs{display:flex;gap:6px;margin-bottom:12px}.rp-tab{padding:9px 12px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-panel);color:var(--lv-text-secondary);font-size:8px;font-weight:900;cursor:pointer}.rp-tab.active{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.rp-summary{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:12px;margin-bottom:12px}.rp-stat{padding:11px;border:1px solid var(--lv-border-subtle);border-radius:9px;background:var(--lv-surface-muted)}.rp-stat span{display:block;font-size:7px;text-transform:uppercase;color:var(--lv-text-muted)}.rp-stat strong{display:block;margin-top:6px;font-size:15px}.rp-layout{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(330px,.7fr);gap:12px}.rp-table{overflow:auto}.rp-table table{width:100%;border-collapse:collapse;min-width:800px}.rp-table th,.rp-table td{padding:10px;border-bottom:1px solid var(--lv-border-subtle);font-size:8px;text-align:left}.rp-table th{background:var(--lv-surface-muted);color:var(--lv-text-muted);text-transform:uppercase}.rp-table input{width:115px;padding:7px;border:1px solid var(--lv-border-default);border-radius:6px;background:var(--lv-surface-input);color:var(--lv-text-primary)}.rp-form{display:grid;gap:9px;padding:13px}.rp-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}.rp-btn{min-height:39px;border:1px solid var(--lv-brand-border);border-radius:8px;background:var(--lv-brand-primary);color:var(--lv-text-inverse);font-size:9px;font-weight:950;cursor:pointer}.rp-btn:disabled{opacity:.5}.rp-msg{margin-bottom:12px;padding:10px 12px;border-radius:8px;font-size:9px}.rp-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.rp-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}.rp-empty{padding:28px;text-align:center;color:var(--lv-text-muted);font-size:9px}.rp-due{color:var(--lv-danger);font-weight:900}.rp-paid{color:var(--lv-success);font-weight:900}@media(max-width:950px){.rp-select{grid-template-columns:1fr 1fr}.rp-summary{grid-template-columns:repeat(2,1fr)}.rp-layout{grid-template-columns:1fr}}@media(max-width:600px){.rp-select,.rp-two{grid-template-columns:1fr}.rp-summary{grid-template-columns:1fr 1fr}.rp-head{align-items:flex-start;flex-direction:column}}
    `}</style>

    <header className="rp-head"><div><small>LAND VIEW / FINANCE</small><h1>Receive Payment</h1><p>Receive and allocate client money only. Discounts and posted bill corrections are handled elsewhere.</p></div></header>
    {error && <div className="rp-msg bad">{error}</div>}{message && <div className="rp-msg good">{message}</div>}

    <section className="rp-card rp-select">
      <div className="rp-field"><label>Project / File ID</label><select value={projectId} onChange={(e) => { setProjectId(e.target.value); void loadProject(e.target.value); }}><option value="">Choose project</option>{projects.map((p) => <option key={p.projectId || p.project_code} value={p.projectId || p.project_code}>{p.projectId || p.project_code} · {p.ownerName || p.projectName || p.project_name || "Project"}</option>)}</select></div>
      <div className="rp-field"><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <div className="rp-field"><label>Method</label><select value={method} onChange={(e) => setMethod(e.target.value)}><option>Bank Transfer</option><option>Cash</option><option>bKash</option><option>Nagad</option><option>Cheque</option><option>Card</option><option>Other</option></select></div>
      <div className="rp-field"><label>Deposit Account</label><input value={account} onChange={(e) => setAccount(e.target.value)} /></div>
    </section>

    <div className="rp-tabs">{CATEGORY_ORDER.map((item) => <button key={item} className={`rp-tab ${category === item ? "active" : ""}`} onClick={() => { setCategory(item); setAllocations({}); setPaymentAmount(""); setSelectedService(""); }}>{item}</button>)}</div>

    {data ? <>
      <section className="rp-card rp-summary"><div className="rp-stat"><span>Gross</span><strong>{money(categorySummary.gross)}</strong></div><div className="rp-stat"><span>Discount</span><strong>{money(categorySummary.discount)}</strong></div><div className="rp-stat"><span>Net</span><strong>{money(categorySummary.net)}</strong></div><div className="rp-stat"><span>Paid</span><strong className="rp-paid">{money(categorySummary.paid)}</strong></div><div className="rp-stat"><span>Due</span><strong className="rp-due">{money(categorySummary.due)}</strong></div></section>
      <div className="rp-layout">
        <section className="rp-card rp-table"><table><thead><tr><th>Service</th><th>Net</th><th>Paid</th><th>Due</th>{category === "Engineering Bill" && <th>Allocate</th>}</tr></thead><tbody>{categoryServices.map((service) => <tr key={service.serviceKey}><td><strong>{service.serviceName}</strong></td><td>{money(serviceNet(service))}</td><td className="rp-paid">{money(service.paid)}</td><td className="rp-due">{money(serviceDue(service))}</td>{category === "Engineering Bill" && <td><input inputMode="decimal" value={allocations[service.serviceKey] || ""} onChange={(e) => setAllocations((current) => ({ ...current, [service.serviceKey]: e.target.value }))} /></td>}</tr>)}</tbody></table>{!categoryServices.length && <div className="rp-empty">No billed services in this category.</div>}</section>
        <section className="rp-card rp-form">
          {category !== "Engineering Bill" && <div className="rp-field"><label>Service</label><select value={selectedService} onChange={(e) => setSelectedService(e.target.value)}><option value="">Choose service</option>{categoryServices.map((service) => <option key={service.serviceKey} value={service.serviceKey}>{service.serviceName} · Due {money(serviceDue(service))}</option>)}</select></div>}
          <div className="rp-field"><label>Payment Amount</label><input inputMode="decimal" value={paymentAmount} onChange={(e) => autoAllocate(e.target.value)} placeholder="0" /></div>
          {category === "Engineering Bill" && <div className="rp-field"><label>Allocated</label><input readOnly value={money(allocatedTotal)} /></div>}
          <div className="rp-two"><div className="rp-field"><label>Reference</label><input value={reference} onChange={(e) => setReference(e.target.value)} /></div><div className="rp-field"><label>Category Due</label><input readOnly value={money(categorySummary.due)} /></div></div>
          <div className="rp-field"><label>Notes</label><textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <button className="rp-btn" disabled={busy || loading || !categoryServices.length} onClick={() => void pay()}>{busy ? "Saving…" : "Save Payment"}</button>
        </section>
      </div>
    </> : !loading && <div className="rp-empty">Choose a project to receive payment.</div>}
  </main>;
}
