"use client";

import { useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;
type Category = "Engineering Bill" | "Other Services Bill" | "Supervision Bill";
type OutsourcingConfig = { enabled: boolean; partyId: string; amount: string };

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
async function outsourcingGet() {
  return readJson(await fetch("/api/outsourcing", { credentials: "same-origin", cache: "no-store" }), "Could not load outsourcers.");
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
  const [parties, setParties] = useState<Row[]>([]);
  const [partyWarning, setPartyWarning] = useState("");
  const [projectId, setProjectId] = useState("");
  const [data, setData] = useState<Row | null>(null);
  const [category, setCategory] = useState<Category>("Engineering Bill");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [outsourcing, setOutsourcing] = useState<Record<string, OutsourcingConfig>>({});
  const [selectedService, setSelectedService] = useState("");
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState("Bank Transfer");
  const [account, setAccount] = useState("Bank Account");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [submissionKey, setSubmissionKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("fileId")?.toUpperCase() || "";
    if (requested) setProjectId(requested);
    setLoading(true);
    void Promise.all([
      workflowGet("mode=billing-projects").then((r) => {
        setProjects(r.projects || []);
        if (requested) void loadProject(requested);
      }),
      outsourcingGet().then((r) => {
        setParties((r.parties || []).filter((party: Row) => party.active !== false));
        setPartyWarning("");
      }).catch((e) => {
        setParties([]);
        setPartyWarning(e instanceof Error ? e.message : "Could not load outsourcers.");
      }),
    ]).catch((e) => setError(e instanceof Error ? e.message : "Could not load payment data."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadProject(id = projectId) {
    if (!id) { setData(null); return; }
    setLoading(true); setError(""); setMessage("");
    try {
      const next = await workflowGet(`mode=billing&projectId=${encodeURIComponent(id)}`);
      setData(next);
      setAllocations({});
      setOutsourcing({});
      setPaymentAmount("");
      setSelectedService("");
      setSubmissionKey("");
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
  function outsourcingConfig(serviceKey: string): OutsourcingConfig {
    return outsourcing[serviceKey] || { enabled: false, partyId: "", amount: "" };
  }
  function updateOutsourcing(serviceKey: string, changes: Partial<OutsourcingConfig>) {
    setOutsourcing((current) => ({
      ...current,
      [serviceKey]: { ...outsourcingConfig(serviceKey), ...changes },
    }));
  }

  const categorySummary = useMemo(() => categoryServices.reduce((acc, service) => {
    acc.gross += Math.max(0, num(service.gross));
    acc.discount += Math.max(0, num(service.discount));
    acc.net += serviceNet(service);
    acc.paid += Math.max(0, num(service.paid));
    acc.due += serviceDue(service);
    return acc;
  }, { gross: 0, discount: 0, net: 0, paid: 0, due: 0 }), [categoryServices]);

  const allocatedTotal = Object.values(allocations).reduce((sum, value) => sum + Math.max(0, num(value)), 0);
  const outsourcingTotal = (category === "Engineering Bill" ? categoryServices : activeSelectedService ? [activeSelectedService] : [])
    .reduce((sum, service) => {
      const config = outsourcingConfig(service.serviceKey);
      return sum + (config.enabled ? Math.max(0, num(config.amount)) : 0);
    }, 0);

  function autoAllocate(raw: string) {
    setPaymentAmount(raw);
    setSubmissionKey("");
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

  function buildOutsourcingAllocations() {
    const targetServices = category === "Engineering Bill"
      ? categoryServices
      : activeSelectedService ? [activeSelectedService] : [];

    return targetServices.flatMap((service) => {
      const config = outsourcingConfig(service.serviceKey);
      if (!config.enabled) return [];
      const amount = Math.max(0, num(config.amount));
      if (!config.partyId) throw new Error(`${service.serviceName}: choose an outsourcer.`);
      if (!(amount > 0)) throw new Error(`${service.serviceName}: enter the outsourcing bill amount.`);
      if (category === "Engineering Bill" && Math.max(0, num(allocations[service.serviceKey])) <= 0) {
        throw new Error(`Allocate client payment to ${service.serviceName} before creating its outsourcing bill.`);
      }
      return [{
        serviceName: service.serviceName,
        serviceKey: service.serviceKey,
        partyId: config.partyId,
        amount,
      }];
    });
  }

  async function pay() {
    if (!projectId || !data) return setError("Choose a project first.");
    const amount = Math.max(0, num(paymentAmount));
    if (!(amount > 0)) return setError("Enter a payment amount.");
    if (amount > categorySummary.due + 0.01) return setError(`Payment cannot exceed ${money(categorySummary.due)} due.`);

    setBusy(true); setError(""); setMessage("");
    try {
      const outsourcingAllocations = buildOutsourcingAllocations();
      const idempotencyKey = submissionKey || `receive-payment-${crypto.randomUUID()}`;
      if (!submissionKey) setSubmissionKey(idempotencyKey);
      let result: Row;

      if (category === "Engineering Bill") {
        if (Math.abs(allocatedTotal - amount) > 0.01) throw new Error("Allocated service amounts must exactly equal the payment amount.");
        for (const service of categoryServices) {
          const allocated = Math.max(0, num(allocations[service.serviceKey]));
          if (allocated > serviceDue(service) + 0.01) throw new Error(`${service.serviceName} allocation cannot exceed its due of ${money(serviceDue(service))}.`);
        }
        result = await savePayment({
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
          Outsourcing_Allocations: outsourcingAllocations,
          Idempotency_Key: idempotencyKey,
        });
      } else {
        const service = activeSelectedService;
        if (!service) throw new Error("Choose a billed service first.");
        if (amount > serviceDue(service) + 0.01) throw new Error(`${service.serviceName} has only ${money(serviceDue(service))} due.`);
        const serviceType = service.serviceName === "Municipality Approval Contract" ? "Municipality File Pass" : service.serviceName;
        result = await savePayment({
          Project_ID: projectId,
          Payment_Date: date,
          Amount: amount,
          Payment_Method: method,
          Deposit_Account: account,
          Reference_No: reference.trim(),
          Payment_For: category,
          Income_Category: category,
          Service_Type: serviceType,
          Transaction_Type: "Business Income",
          Affects_Business_Balance: "Yes",
          Received_From: data?.project?.ownerName || "",
          Notes: notes.trim(),
          Outsourcing_Allocations: outsourcingAllocations,
          Idempotency_Key: idempotencyKey,
        });
      }

      const count = Number(result?.Outsourcing_Count || 0);
      const warning = String(result?.Outsourcing_Warning || "").trim();
      if (warning) {
        setMessage(`Payment saved as income. Outsourcing automation warning: ${warning}`);
      } else if (count > 0) {
        setMessage(`Payment saved as income. ${count} outsourcing bill${count === 1 ? "" : "s"} booked as expense and added to Outsourcing.`);
      } else {
        setMessage("Payment saved. Full receipt posted as income.");
      }
      setSubmissionKey("");
      await loadProject(projectId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save payment.");
    } finally { setBusy(false); }
  }

  const selectedOutsourcing = activeSelectedService ? outsourcingConfig(activeSelectedService.serviceKey) : null;

  return <main className="rp">
    <style>{`
      .rp{max-width:1500px;margin:0 auto;color:var(--lv-text-primary)}.rp *{box-sizing:border-box}.rp-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:15px}.rp-head small{font-size:8px;font-weight:950;letter-spacing:.12em;color:var(--lv-brand-text)}.rp-head h1{margin:5px 0 0;font-size:27px}.rp-head p{margin:5px 0 0;font-size:9px;color:var(--lv-text-secondary);max-width:820px}.rp-card{border:1px solid var(--lv-border-default);border-radius:12px;background:var(--lv-surface-panel)}.rp-select{display:grid;grid-template-columns:1.5fr repeat(3,minmax(150px,.55fr));gap:9px;padding:13px;margin-bottom:12px}.rp-field label{display:block;margin-bottom:5px;font-size:7px;font-weight:900;text-transform:uppercase;color:var(--lv-text-muted)}.rp-field input,.rp-field select,.rp-field textarea{width:100%;min-height:38px;padding:8px 10px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:9px}.rp-tabs{display:flex;gap:6px;margin-bottom:12px}.rp-tab{padding:9px 12px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-panel);color:var(--lv-text-secondary);font-size:8px;font-weight:900;cursor:pointer}.rp-tab.active{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.rp-summary{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;padding:12px;margin-bottom:12px}.rp-stat{padding:11px;border:1px solid var(--lv-border-subtle);border-radius:9px;background:var(--lv-surface-muted)}.rp-stat span{display:block;font-size:7px;text-transform:uppercase;color:var(--lv-text-muted)}.rp-stat strong{display:block;margin-top:6px;font-size:15px}.rp-layout{display:grid;grid-template-columns:minmax(0,1.85fr) minmax(350px,.65fr);gap:12px}.rp-table{overflow:auto}.rp-table table{width:100%;border-collapse:collapse;min-width:1040px}.rp-table th,.rp-table td{padding:9px;border-bottom:1px solid var(--lv-border-subtle);font-size:8px;text-align:left;vertical-align:middle}.rp-table th{background:var(--lv-surface-muted);color:var(--lv-text-muted);text-transform:uppercase}.rp-table input,.rp-table select{min-height:32px;padding:6px 7px;border:1px solid var(--lv-border-default);border-radius:6px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px}.rp-money-input{width:105px}.rp-party-select{width:150px}.rp-check{display:inline-flex;align-items:center;gap:6px;font-size:8px;font-weight:900;white-space:nowrap}.rp-check input{width:15px;height:15px;min-height:0}.rp-form{display:grid;gap:9px;padding:13px}.rp-two{display:grid;grid-template-columns:1fr 1fr;gap:8px}.rp-btn{min-height:39px;border:1px solid var(--lv-brand-border);border-radius:8px;background:var(--lv-brand-primary);color:var(--lv-text-inverse);font-size:9px;font-weight:950;cursor:pointer}.rp-btn:disabled{opacity:.5}.rp-msg{margin-bottom:12px;padding:10px 12px;border-radius:8px;font-size:9px}.rp-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.rp-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}.rp-msg.warn{background:var(--lv-warning-soft,var(--lv-surface-muted));color:var(--lv-warning,var(--lv-text-secondary))}.rp-empty{padding:28px;text-align:center;color:var(--lv-text-muted);font-size:9px}.rp-due{color:var(--lv-danger);font-weight:900}.rp-paid{color:var(--lv-success);font-weight:900}.rp-outbox{display:grid;gap:8px;padding:10px;border:1px solid var(--lv-border-subtle);border-radius:9px;background:var(--lv-surface-muted)}.rp-outbox h3{margin:0;font-size:10px}.rp-outbox p{margin:0;font-size:8px;line-height:1.5;color:var(--lv-text-secondary)}.rp-out-total{display:flex;justify-content:space-between;gap:10px;align-items:center;font-size:8px}.rp-out-total strong{font-size:13px}.rp-help{font-size:7px;color:var(--lv-text-muted);line-height:1.45}@media(max-width:1050px){.rp-select{grid-template-columns:1fr 1fr}.rp-summary{grid-template-columns:repeat(3,1fr)}.rp-layout{grid-template-columns:1fr}}@media(max-width:600px){.rp-select,.rp-two{grid-template-columns:1fr}.rp-summary{grid-template-columns:1fr 1fr}.rp-head{align-items:flex-start;flex-direction:column}}
    `}</style>

    <header className="rp-head"><div><small>LAND VIEW / FINANCE</small><h1>Receive Payment</h1><p>Register the client receipt service-wise. The full receipt posts as income; any outsourcing bill selected here is booked immediately as an expense and added to the outsourcer payable register.</p></div></header>
    {error && <div className="rp-msg bad">{error}</div>}{message && <div className="rp-msg good">{message}</div>}{partyWarning && <div className="rp-msg warn">Outsourcing is temporarily unavailable: {partyWarning}</div>}

    <section className="rp-card rp-select">
      <div className="rp-field"><label>Project / File ID</label><select value={projectId} onChange={(e) => { setProjectId(e.target.value); void loadProject(e.target.value); }}><option value="">Choose project</option>{projects.map((p) => <option key={p.projectId || p.project_code} value={p.projectId || p.project_code}>{p.projectId || p.project_code} · {p.ownerName || p.projectName || p.project_name || "Project"}</option>)}</select></div>
      <div className="rp-field"><label>Date</label><input type="date" value={date} onChange={(e) => { setDate(e.target.value); setSubmissionKey(""); }} /></div>
      <div className="rp-field"><label>Method</label><select value={method} onChange={(e) => { setMethod(e.target.value); setSubmissionKey(""); }}><option>Bank Transfer</option><option>Cash</option><option>bKash</option><option>Nagad</option><option>Cheque</option><option>Card</option><option>Other</option></select></div>
      <div className="rp-field"><label>Deposit Account</label><input value={account} onChange={(e) => { setAccount(e.target.value); setSubmissionKey(""); }} /></div>
    </section>

    <div className="rp-tabs">{(["Engineering Bill","Other Services Bill","Supervision Bill"] as Category[]).map((item) => <button key={item} className={`rp-tab ${category === item ? "active" : ""}`} onClick={() => { setCategory(item); setAllocations({}); setOutsourcing({}); setPaymentAmount(""); setSelectedService(""); setSubmissionKey(""); }}>{item}</button>)}</div>

    {data ? <>
      <section className="rp-card rp-summary">
        <div className="rp-stat"><span>Gross</span><strong>{money(categorySummary.gross)}</strong></div>
        <div className="rp-stat"><span>Discount</span><strong>{money(categorySummary.discount)}</strong></div>
        <div className="rp-stat"><span>Net</span><strong>{money(categorySummary.net)}</strong></div>
        <div className="rp-stat"><span>Paid</span><strong className="rp-paid">{money(categorySummary.paid)}</strong></div>
        <div className="rp-stat"><span>Due</span><strong className="rp-due">{money(categorySummary.due)}</strong></div>
        <div className="rp-stat"><span>Outsourcing Expense</span><strong>{money(outsourcingTotal)}</strong></div>
      </section>
      <div className="rp-layout">
        <section className="rp-card rp-table"><table><thead><tr><th>Service</th><th>Net</th><th>Paid</th><th>Due</th>{category === "Engineering Bill" && <><th>Client Allocate</th><th>Outsource</th><th>Outsourcer</th><th>Outsource Bill</th></>}</tr></thead><tbody>{categoryServices.map((service) => {
          const config = outsourcingConfig(service.serviceKey);
          return <tr key={service.serviceKey}>
            <td><strong>{service.serviceName}</strong></td><td>{money(serviceNet(service))}</td><td className="rp-paid">{money(service.paid)}</td><td className="rp-due">{money(serviceDue(service))}</td>
            {category === "Engineering Bill" && <>
              <td><input className="rp-money-input" inputMode="decimal" value={allocations[service.serviceKey] || ""} onChange={(e) => { setAllocations((current) => ({ ...current, [service.serviceKey]: e.target.value })); setSubmissionKey(""); }} /></td>
              <td><label className="rp-check"><input type="checkbox" checked={config.enabled} disabled={!parties.length} onChange={(e) => { updateOutsourcing(service.serviceKey, { enabled: e.target.checked }); setSubmissionKey(""); }} /> Yes</label></td>
              <td><select className="rp-party-select" disabled={!config.enabled} value={config.partyId} onChange={(e) => { updateOutsourcing(service.serviceKey, { partyId: e.target.value }); setSubmissionKey(""); }}><option value="">Choose</option>{parties.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}</select></td>
              <td><input className="rp-money-input" disabled={!config.enabled} inputMode="decimal" value={config.amount} onChange={(e) => { updateOutsourcing(service.serviceKey, { amount: e.target.value }); setSubmissionKey(""); }} placeholder="0" /></td>
            </>}
          </tr>;
        })}</tbody></table>{!categoryServices.length && <div className="rp-empty">No billed services in this category.</div>}</section>

        <section className="rp-card rp-form">
          {category !== "Engineering Bill" && <div className="rp-field"><label>Service</label><select value={activeSelectedService?.serviceKey || ""} onChange={(e) => { setSelectedService(e.target.value); setOutsourcing({}); setSubmissionKey(""); }}><option value="">Choose service</option>{categoryServices.map((service) => <option key={service.serviceKey} value={service.serviceKey}>{service.serviceName} · Due {money(serviceDue(service))}</option>)}</select></div>}

          {category !== "Engineering Bill" && activeSelectedService && <div className="rp-outbox">
            <h3>{activeSelectedService.serviceName} · Outsourcing</h3>
            <label className="rp-check"><input type="checkbox" checked={Boolean(selectedOutsourcing?.enabled)} disabled={!parties.length} onChange={(e) => { updateOutsourcing(activeSelectedService.serviceKey, { enabled: e.target.checked }); setSubmissionKey(""); }} /> Create outsourcing bill with this payment</label>
            {selectedOutsourcing?.enabled && <>
              <div className="rp-field"><label>Outsourcer</label><select value={selectedOutsourcing.partyId} onChange={(e) => { updateOutsourcing(activeSelectedService.serviceKey, { partyId: e.target.value }); setSubmissionKey(""); }}><option value="">Choose person / firm</option>{parties.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}</select></div>
              <div className="rp-field"><label>Outsourcing Bill</label><input inputMode="decimal" value={selectedOutsourcing.amount} onChange={(e) => { updateOutsourcing(activeSelectedService.serviceKey, { amount: e.target.value }); setSubmissionKey(""); }} placeholder="0" /></div>
            </>}
            <p>The outsourcing bill is an expense now. Paying the outsourcer later only settles the payable and will not create another expense.</p>
          </div>}

          <div className="rp-field"><label>Payment Amount</label><input inputMode="decimal" value={paymentAmount} onChange={(e) => autoAllocate(e.target.value)} placeholder="0" /></div>
          {category === "Engineering Bill" && <div className="rp-field"><label>Client Amount Allocated</label><input readOnly value={money(allocatedTotal)} /></div>}
          <div className="rp-two"><div className="rp-field"><label>Reference</label><input value={reference} onChange={(e) => { setReference(e.target.value); setSubmissionKey(""); }} /></div><div className="rp-field"><label>Category Due</label><input readOnly value={money(categorySummary.due)} /></div></div>
          <div className="rp-out-total"><span>Outsourcing expense created with this receipt</span><strong>{money(outsourcingTotal)}</strong></div>
          <div className="rp-field"><label>Notes</label><textarea value={notes} onChange={(e) => { setNotes(e.target.value); setSubmissionKey(""); }} /></div>
          <div className="rp-help">Client receipt = income. Outsourcing bill = expense + outsourcer payable. Later outsourcer payment = settlement only.</div>
          <button className="rp-btn" disabled={busy || loading || !categoryServices.length} onClick={() => void pay()}>{busy ? "Saving…" : "Add Payment"}</button>
        </section>
      </div>
    </> : !loading && <div className="rp-empty">Choose a project to receive payment.</div>}
  </main>;
}
