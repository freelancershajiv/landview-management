"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;
type Data = {
  summary: { agreed: number; paid: number; due: number; activeJobs: number; parties: number };
  parties: Row[];
  jobs: Row[];
  payments: Row[];
  projects: Row[];
};

type Panel = "party" | "job" | "payment" | null;

const SERVICES = [
  "Architectural Design",
  "Structural Design",
  "3D Design – Exterior",
  "3D Design – Interior",
  "Electrical Design",
  "Fire Safety Design",
  "Plumbing Design",
  "Plan Approval Design",
  "Estimate & Costing",
  "Design Books",
  "Digital Survey",
  "Soil Test",
  "Municipality File Pass",
];

const METHODS = ["Cash", "Bank", "bKash", "Nagad", "Cheque", "Card", "Other"];
const STATUSES = ["Assigned", "In Progress", "Submitted", "Completed", "Cancelled"];

function money(value: unknown) {
  const amount = Number(value || 0);
  return `BDT ${amount.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isMunicipalityService(value: unknown) {
  const service = normalize(value);
  return service.includes("municipality") || service.includes("file pass");
}

function StatusPill({ status }: { status: string }) {
  const key = normalize(status).replace(/\s+/g, "-");
  return <span className={`out-status ${key}`}>{status || "—"}</span>;
}

export default function OutsourcingPaymentsPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<"jobs" | "payments" | "parties">("jobs");
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [partyForm, setPartyForm] = useState({ name: "", partyType: "Individual", phone: "", email: "", expertise: "", preferredPaymentMethod: "Cash", notes: "" });
  const [jobForm, setJobForm] = useState({ projectCode: "", partyId: "", serviceType: "Structural Design", agreedAmount: "", assignedDate: dateToday(), targetDate: "", scopeDescription: "", notes: "" });
  const [paymentForm, setPaymentForm] = useState({ jobId: "", amount: "", paymentDate: dateToday(), paymentMethod: "Cash", referenceNo: "", notes: "" });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/outsourcing", { credentials: "same-origin", cache: "no-store" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load outsourcing payments."));
      setData(json.data as Data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load outsourcing payments.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function post(action: string, payload: Row) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/outsourcing", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Request failed."));
      await load();
      return json.data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed.");
      throw err;
    } finally {
      setBusy(false);
    }
  }

  const jobs = data?.jobs || [];
  const payments = data?.payments || [];
  const parties = data?.parties || [];
  const activeParties = parties.filter((row) => row.active !== false);
  const payableJobs = jobs.filter((row) => normalize(row.status) !== "cancelled" && Number(row.due_amount || 0) > 0.009);
  const selectedPaymentJob = jobs.find((row) => String(row.id) === paymentForm.jobId);

  const visibleJobs = useMemo(() => {
    const term = normalize(query);
    if (!term) return jobs;
    return jobs.filter((row) => [row.job_code, row.project_code, row.project_name, row.client_name, row.service_type, row.party_name, row.status].join(" ").toLowerCase().includes(term));
  }, [jobs, query]);

  const visiblePayments = useMemo(() => {
    const term = normalize(query);
    if (!term) return payments;
    return payments.filter((row) => [row.payment_code, row.project_code, row.service_type, row.party_name, row.payment_method, row.reference_no, row.status].join(" ").toLowerCase().includes(term));
  }, [payments, query]);

  const visibleParties = useMemo(() => {
    const term = normalize(query);
    if (!term) return parties;
    return parties.filter((row) => [row.party_code, row.name, row.party_type, row.phone, row.email, row.expertise].join(" ").toLowerCase().includes(term));
  }, [parties, query]);

  function openPayment(job?: Row) {
    const target = job || payableJobs[0];
    setPaymentForm({
      jobId: target?.id ? String(target.id) : "",
      amount: target?.due_amount ? String(Number(target.due_amount).toFixed(2)) : "",
      paymentDate: dateToday(),
      paymentMethod: target?.preferred_payment_method || "Cash",
      referenceNo: "",
      notes: "",
    });
    setPanel("payment");
  }

  async function submitParty(event: FormEvent) {
    event.preventDefault();
    try {
      await post("addParty", partyForm);
      setPartyForm({ name: "", partyType: "Individual", phone: "", email: "", expertise: "", preferredPaymentMethod: "Cash", notes: "" });
      setPanel(null);
      setMessage("Outsource person / firm added.");
    } catch {}
  }

  async function submitJob(event: FormEvent) {
    event.preventDefault();
    try {
      await post("addJob", jobForm);
      setJobForm({ projectCode: "", partyId: "", serviceType: "Structural Design", agreedAmount: "", assignedDate: dateToday(), targetDate: "", scopeDescription: "", notes: "" });
      setPanel(null);
      setMessage("Outsourced work added to the payable register.");
    } catch {}
  }

  async function submitPayment(event: FormEvent) {
    event.preventDefault();
    try {
      await post("addPayment", paymentForm);
      setPanel(null);
      setMessage(isMunicipalityService(selectedPaymentJob?.service_type)
        ? "Payment saved to the Municipality ledger."
        : "Payment saved and posted to Main Accounts.");
    } catch {}
  }

  async function changeStatus(job: Row, status: string) {
    try {
      await post("updateJob", { id: job.id, status });
      setMessage(`Work status updated to ${status}.`);
    } catch {}
  }

  async function voidPayment(payment: Row) {
    if (normalize(payment.status) === "void") return;
    if (!window.confirm(`Void ${payment.payment_code} for ${money(payment.amount)}? This will reverse its ledger effect.`)) return;
    try {
      await post("voidPayment", { id: payment.id });
      setMessage("Outsourcing payment voided and ledger effect reversed.");
    } catch {}
  }

  const summary = data?.summary || { agreed: 0, paid: 0, due: 0, activeJobs: 0, parties: 0 };

  return (
    <main className="outsource-page">
      <style>{`
        .outsource-page{display:grid;gap:16px;padding-bottom:40px;color:var(--lv-text,#dbe3e8)}
        .out-hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:22px;border:1px solid var(--lv-border,#313b44);border-radius:16px;background:linear-gradient(135deg,var(--lv-surface-1,#11181e),var(--lv-surface-2,#151d24))}
        .out-kicker{font-size:9px;font-weight:950;letter-spacing:.16em;text-transform:uppercase;color:var(--lv-brand-primary,#d94b45)}
        .out-hero h1{margin:5px 0 6px;font-size:26px;color:var(--lv-text-strong,#fff)}.out-hero p{margin:0;max-width:680px;color:var(--lv-text-muted,#9da8b0);font-size:11px;line-height:1.6}
        .out-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.out-btn{min-height:38px;padding:0 12px;border:1px solid var(--lv-border,#36414a);border-radius:8px;background:var(--lv-surface-2,#151d24);color:var(--lv-text,#dbe3e8);font-size:10px;font-weight:900;cursor:pointer}.out-btn.primary{border-color:var(--lv-brand-primary,#d94b45);background:var(--lv-brand-primary,#d94b45);color:white}.out-btn.danger{color:#ffb5b0;border-color:rgba(255,92,85,.35)}.out-btn:disabled{opacity:.55;cursor:wait}
        .out-cards{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.out-card{padding:14px;border:1px solid var(--lv-border,#313b44);border-radius:12px;background:var(--lv-surface-1,#11181e)}.out-card span{display:block;color:var(--lv-text-muted,#9da8b0);font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.out-card strong{display:block;margin-top:7px;font-size:17px;color:var(--lv-text-strong,#fff)}.out-card.due strong{color:#ffb84d}.out-card.paid strong{color:#78d6a2}
        .out-workspace{border:1px solid var(--lv-border,#313b44);border-radius:14px;background:var(--lv-surface-1,#11181e);overflow:hidden}.out-toolbar{display:flex;gap:10px;align-items:center;padding:12px;border-bottom:1px solid var(--lv-border,#313b44);background:var(--lv-surface-2,#151d24)}.out-tabs{display:flex;gap:6px;flex-wrap:wrap}.out-tabs button{min-height:34px;padding:0 10px;border:1px solid var(--lv-border,#36414a);border-radius:7px;background:transparent;color:var(--lv-text-muted,#9da8b0);font-size:9px;font-weight:900;cursor:pointer}.out-tabs button.active{background:var(--lv-brand-primary,#d94b45);border-color:var(--lv-brand-primary,#d94b45);color:white}.out-search{margin-left:auto;min-width:280px;height:34px;padding:0 10px;border:1px solid var(--lv-border,#36414a);border-radius:7px;background:var(--lv-bg,#0d1318);color:var(--lv-text,#dbe3e8);font-size:10px;outline:none}
        .out-table-wrap{overflow:auto}.out-table{width:100%;min-width:1000px;border-collapse:collapse}.out-table th{padding:10px 12px;border-bottom:1px solid var(--lv-border,#313b44);background:rgba(255,255,255,.02);color:var(--lv-text-muted,#9da8b0);font-size:8px;text-transform:uppercase;letter-spacing:.06em;text-align:left;white-space:nowrap}.out-table td{padding:11px 12px;border-bottom:1px solid rgba(255,255,255,.055);font-size:10px;vertical-align:middle}.out-table tr:last-child td{border-bottom:0}.out-table strong{color:var(--lv-text-strong,#fff)}.out-sub{display:block;margin-top:3px;color:var(--lv-text-muted,#9da8b0);font-size:8px}.num{text-align:right!important;font-variant-numeric:tabular-nums}.due-text{color:#ffb84d}.paid-text{color:#78d6a2}.void-text{text-decoration:line-through;color:var(--lv-text-muted,#9da8b0)}
        .out-status{display:inline-flex;align-items:center;min-height:24px;padding:0 7px;border-radius:999px;border:1px solid var(--lv-border,#36414a);font-size:8px;font-weight:900;white-space:nowrap}.out-status.completed,.out-status.posted{color:#78d6a2;border-color:rgba(120,214,162,.35)}.out-status.cancelled,.out-status.void{color:#ff9b95;border-color:rgba(255,92,85,.35)}.out-status.in-progress,.out-status.submitted{color:#7cc4ff;border-color:rgba(124,196,255,.35)}
        .out-select{height:32px;min-width:120px;padding:0 7px;border:1px solid var(--lv-border,#36414a);border-radius:7px;background:var(--lv-bg,#0d1318);color:var(--lv-text,#dbe3e8);font-size:9px}.out-ledger-chip{display:inline-flex;margin-top:4px;padding:3px 6px;border-radius:999px;background:rgba(217,75,69,.11);color:#ef8d87;font-size:7px;font-weight:900}.out-ledger-chip.special{background:rgba(255,184,77,.12);color:#ffbf59}
        .out-empty{padding:32px;text-align:center;color:var(--lv-text-muted,#9da8b0);font-size:11px}.out-alert{padding:11px 13px;border-radius:9px;font-size:10px}.out-alert.error{border:1px solid rgba(255,92,85,.35);background:rgba(255,92,85,.08);color:#ffaaa5}.out-alert.ok{border:1px solid rgba(120,214,162,.3);background:rgba(120,214,162,.07);color:#92e0b4}
        .out-modal-backdrop{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:18px;background:rgba(3,7,10,.78);backdrop-filter:blur(5px)}.out-modal{width:min(720px,100%);max-height:90vh;overflow:auto;border:1px solid var(--lv-border,#36414a);border-radius:15px;background:var(--lv-surface-1,#11181e);box-shadow:0 24px 80px rgba(0,0,0,.45)}.out-modal-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:17px;border-bottom:1px solid var(--lv-border,#313b44)}.out-modal-head h2{margin:0 0 4px;font-size:18px;color:var(--lv-text-strong,#fff)}.out-modal-head p{margin:0;color:var(--lv-text-muted,#9da8b0);font-size:9px;line-height:1.5}.out-close{border:0;background:none;color:var(--lv-text-muted,#9da8b0);font-size:20px;cursor:pointer}.out-form{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:17px}.out-field{display:grid;gap:5px}.out-field.full{grid-column:1/-1}.out-field label{font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;color:var(--lv-text-muted,#9da8b0)}.out-field input,.out-field select,.out-field textarea{width:100%;border:1px solid var(--lv-border,#36414a);border-radius:8px;background:var(--lv-bg,#0d1318);color:var(--lv-text,#dbe3e8);font:inherit;font-size:10px;outline:none}.out-field input,.out-field select{height:38px;padding:0 10px}.out-field textarea{min-height:84px;padding:10px;resize:vertical}.out-field input:focus,.out-field select:focus,.out-field textarea:focus{border-color:var(--lv-brand-primary,#d94b45)}.out-form-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:8px;padding-top:4px}.out-due-preview{grid-column:1/-1;display:flex;justify-content:space-between;gap:10px;padding:11px;border:1px solid var(--lv-border,#313b44);border-radius:9px;background:var(--lv-surface-2,#151d24);font-size:10px}.out-due-preview strong{color:#ffb84d}
        @media(max-width:1050px){.out-cards{grid-template-columns:repeat(3,minmax(0,1fr))}}
        @media(max-width:760px){.out-hero{display:grid;padding:16px}.out-actions{justify-content:flex-start}.out-cards{grid-template-columns:1fr 1fr}.out-card:first-child{grid-column:1/-1}.out-toolbar{display:grid}.out-search{margin:0;width:100%;min-width:0}.out-form{grid-template-columns:1fr}.out-field.full,.out-form-actions,.out-due-preview{grid-column:1}.out-table{min-width:900px}}
      `}</style>

      <section className="out-hero">
        <div>
          <span className="out-kicker">Finance · Accounts Payable</span>
          <h1>Outsourcing Payments</h1>
          <p>Track outsourced design and consultancy work by project, service and person/firm. Agreed amounts create a payable only; Main Accounts changes only when you actually make a payment.</p>
        </div>
        <div className="out-actions">
          <button className="out-btn" type="button" onClick={() => setPanel("party")}>+ Person / Firm</button>
          <button className="out-btn primary" type="button" onClick={() => setPanel("job")}>+ New Outsource Work</button>
          <button className="out-btn primary" type="button" disabled={!payableJobs.length} onClick={() => openPayment()}>+ Pay Outsource</button>
        </div>
      </section>

      {error && <div className="out-alert error">{error}</div>}
      {message && <div className="out-alert ok">{message}</div>}

      <section className="out-cards">
        <div className="out-card"><span>Total Agreed</span><strong>{money(summary.agreed)}</strong></div>
        <div className="out-card paid"><span>Total Paid</span><strong>{money(summary.paid)}</strong></div>
        <div className="out-card due"><span>Total Due</span><strong>{money(summary.due)}</strong></div>
        <div className="out-card"><span>Active Work</span><strong>{summary.activeJobs}</strong></div>
        <div className="out-card"><span>People / Firms</span><strong>{summary.parties}</strong></div>
      </section>

      <section className="out-workspace">
        <div className="out-toolbar">
          <div className="out-tabs">
            <button type="button" className={tab === "jobs" ? "active" : ""} onClick={() => setTab("jobs")}>Work Register</button>
            <button type="button" className={tab === "payments" ? "active" : ""} onClick={() => setTab("payments")}>Payment History</button>
            <button type="button" className={tab === "parties" ? "active" : ""} onClick={() => setTab("parties")}>People & Firms</button>
          </div>
          <input className="out-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search File ID, service, person, payment…" />
        </div>

        {loading ? <div className="out-empty">Loading outsourcing register…</div> : tab === "jobs" ? (
          <div className="out-table-wrap">
            <table className="out-table">
              <thead><tr><th>Work / File</th><th>Service</th><th>Outsource To</th><th className="num">Agreed</th><th className="num">Paid</th><th className="num">Due</th><th>Status</th><th>Target</th><th>Action</th></tr></thead>
              <tbody>
                {!visibleJobs.length && <tr><td colSpan={9}><div className="out-empty">No outsourcing work found.</div></td></tr>}
                {visibleJobs.map((job) => (
                  <tr key={job.id}>
                    <td><strong>{job.job_code}</strong><span className="out-sub">{job.project_code || "General"}{job.client_name ? ` · ${job.client_name}` : ""}</span></td>
                    <td><strong>{job.service_type}</strong><span className={`out-ledger-chip ${job.finance_scope === "municipality_file_pass" ? "special" : ""}`}>{job.finance_scope === "municipality_file_pass" ? "Municipality Ledger" : "Main Accounts"}</span></td>
                    <td><strong>{job.party_name || "—"}</strong><span className="out-sub">{job.party_type || ""}</span></td>
                    <td className="num">{money(job.agreed_amount)}</td>
                    <td className="num paid-text">{money(job.paid_amount)}</td>
                    <td className="num due-text"><strong>{money(job.due_amount)}</strong></td>
                    <td>
                      <select className="out-select" value={job.status || "Assigned"} disabled={busy} onChange={(event) => void changeStatus(job, event.target.value)}>
                        {STATUSES.map((status) => <option key={status}>{status}</option>)}
                      </select>
                    </td>
                    <td>{job.target_date || "—"}<span className="out-sub">Assigned {job.assigned_date || "—"}</span></td>
                    <td><button className="out-btn primary" type="button" disabled={busy || Number(job.due_amount || 0) <= .009 || normalize(job.status) === "cancelled"} onClick={() => openPayment(job)}>Pay</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : tab === "payments" ? (
          <div className="out-table-wrap">
            <table className="out-table">
              <thead><tr><th>Date / Payment</th><th>File</th><th>Service</th><th>Paid To</th><th>Method / Reference</th><th>Ledger</th><th className="num">Amount</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {!visiblePayments.length && <tr><td colSpan={9}><div className="out-empty">No outsourcing payments found.</div></td></tr>}
                {visiblePayments.map((payment) => {
                  const job = jobs.find((row) => String(row.id) === String(payment.job_id));
                  const voided = normalize(payment.status) === "void";
                  return <tr key={payment.id}>
                    <td className={voided ? "void-text" : ""}><strong>{payment.payment_code}</strong><span className="out-sub">{payment.payment_date || "—"}</span></td>
                    <td>{payment.project_code || "General"}</td>
                    <td>{payment.service_type || "—"}</td>
                    <td>{payment.party_name || "—"}</td>
                    <td>{payment.payment_method || "—"}<span className="out-sub">{payment.reference_no || "No reference"}</span></td>
                    <td><span className={`out-ledger-chip ${job?.finance_scope === "municipality_file_pass" ? "special" : ""}`}>{job?.finance_scope === "municipality_file_pass" ? "Municipality" : "Main"}</span></td>
                    <td className={`num ${voided ? "void-text" : ""}`}><strong>{money(payment.amount)}</strong></td>
                    <td><StatusPill status={payment.status || "POSTED"} /></td>
                    <td>{!voided && <button className="out-btn danger" type="button" disabled={busy} onClick={() => void voidPayment(payment)}>Void</button>}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="out-table-wrap">
            <table className="out-table">
              <thead><tr><th>Person / Firm</th><th>Expertise</th><th>Contact</th><th className="num">Agreed</th><th className="num">Paid</th><th className="num">Due</th><th>Active Work</th><th>Status</th></tr></thead>
              <tbody>
                {!visibleParties.length && <tr><td colSpan={8}><div className="out-empty">No outsource people or firms found.</div></td></tr>}
                {visibleParties.map((party) => <tr key={party.id}>
                  <td><strong>{party.name}</strong><span className="out-sub">{party.party_code} · {party.party_type}</span></td>
                  <td>{party.expertise || "—"}</td>
                  <td>{party.phone || "—"}<span className="out-sub">{party.email || ""}</span></td>
                  <td className="num">{money(party.agreed_amount)}</td>
                  <td className="num paid-text">{money(party.paid_amount)}</td>
                  <td className="num due-text"><strong>{money(party.due_amount)}</strong></td>
                  <td>{party.active_jobs || 0}</td>
                  <td><StatusPill status={party.active === false ? "Inactive" : "Active"} /></td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {panel && <div className="out-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy) setPanel(null); }}>
        <section className="out-modal">
          <div className="out-modal-head">
            <div>
              <h2>{panel === "party" ? "Add Outsource Person / Firm" : panel === "job" ? "New Outsourced Work" : "Pay Outsource"}</h2>
              <p>{panel === "party" ? "Create a reusable outsource party for future projects." : panel === "job" ? "Create the payable without affecting cash balance." : "This payment will post to the correct LAND VIEW ledger immediately."}</p>
            </div>
            <button className="out-close" type="button" disabled={busy} onClick={() => setPanel(null)}>×</button>
          </div>

          {panel === "party" && <form className="out-form" onSubmit={submitParty}>
            <div className="out-field"><label>Name</label><input required value={partyForm.name} onChange={(e) => setPartyForm({ ...partyForm, name: e.target.value })} /></div>
            <div className="out-field"><label>Type</label><select value={partyForm.partyType} onChange={(e) => setPartyForm({ ...partyForm, partyType: e.target.value })}><option>Individual</option><option>Firm</option></select></div>
            <div className="out-field"><label>Phone</label><input value={partyForm.phone} onChange={(e) => setPartyForm({ ...partyForm, phone: e.target.value })} /></div>
            <div className="out-field"><label>Email</label><input type="email" value={partyForm.email} onChange={(e) => setPartyForm({ ...partyForm, email: e.target.value })} /></div>
            <div className="out-field"><label>Expertise</label><input placeholder="Structural, 3D, Electrical…" value={partyForm.expertise} onChange={(e) => setPartyForm({ ...partyForm, expertise: e.target.value })} /></div>
            <div className="out-field"><label>Preferred Payment</label><select value={partyForm.preferredPaymentMethod} onChange={(e) => setPartyForm({ ...partyForm, preferredPaymentMethod: e.target.value })}>{METHODS.map((method) => <option key={method}>{method}</option>)}</select></div>
            <div className="out-field full"><label>Notes</label><textarea value={partyForm.notes} onChange={(e) => setPartyForm({ ...partyForm, notes: e.target.value })} /></div>
            <div className="out-form-actions"><button className="out-btn" type="button" disabled={busy} onClick={() => setPanel(null)}>Cancel</button><button className="out-btn primary" disabled={busy}>{busy ? "Saving…" : "Add Person / Firm"}</button></div>
          </form>}

          {panel === "job" && <form className="out-form" onSubmit={submitJob}>
            <div className="out-field"><label>Project / File ID</label><select value={jobForm.projectCode} onChange={(e) => setJobForm({ ...jobForm, projectCode: e.target.value })}><option value="">General / No Project</option>{(data?.projects || []).map((project) => <option key={project.id} value={project.project_code}>{project.project_code} — {project.client_name || project.project_name || "Project"}</option>)}</select></div>
            <div className="out-field"><label>Outsource To</label><select required value={jobForm.partyId} onChange={(e) => setJobForm({ ...jobForm, partyId: e.target.value })}><option value="">Choose person / firm</option>{activeParties.map((party) => <option key={party.id} value={party.id}>{party.name} — {party.party_type}</option>)}</select></div>
            <div className="out-field"><label>Service</label><input required list="outsource-services" value={jobForm.serviceType} onChange={(e) => setJobForm({ ...jobForm, serviceType: e.target.value })} /><datalist id="outsource-services">{SERVICES.map((service) => <option key={service} value={service} />)}</datalist></div>
            <div className="out-field"><label>Agreed Amount</label><input required inputMode="decimal" value={jobForm.agreedAmount} onChange={(e) => setJobForm({ ...jobForm, agreedAmount: e.target.value })} placeholder="0.00" /></div>
            <div className="out-field"><label>Assigned Date</label><input required type="date" value={jobForm.assignedDate} onChange={(e) => setJobForm({ ...jobForm, assignedDate: e.target.value })} /></div>
            <div className="out-field"><label>Target Date</label><input type="date" value={jobForm.targetDate} onChange={(e) => setJobForm({ ...jobForm, targetDate: e.target.value })} /></div>
            <div className="out-field full"><label>Scope / Deliverable</label><textarea placeholder="What exactly is being outsourced?" value={jobForm.scopeDescription} onChange={(e) => setJobForm({ ...jobForm, scopeDescription: e.target.value })} /></div>
            <div className="out-field full"><label>Notes</label><textarea value={jobForm.notes} onChange={(e) => setJobForm({ ...jobForm, notes: e.target.value })} /></div>
            {isMunicipalityService(jobForm.serviceType) && <div className="out-due-preview"><span>This service is isolated from Main Accounts.</span><strong>Municipality Ledger</strong></div>}
            <div className="out-form-actions"><button className="out-btn" type="button" disabled={busy} onClick={() => setPanel(null)}>Cancel</button><button className="out-btn primary" disabled={busy || !activeParties.length}>{busy ? "Saving…" : "Create Outsourced Work"}</button></div>
          </form>}

          {panel === "payment" && <form className="out-form" onSubmit={submitPayment}>
            <div className="out-field full"><label>Outsourcing Work</label><select required value={paymentForm.jobId} onChange={(e) => { const job = jobs.find((row) => String(row.id) === e.target.value); setPaymentForm({ ...paymentForm, jobId: e.target.value, amount: job ? String(Number(job.due_amount || 0).toFixed(2)) : "" }); }}><option value="">Choose work item</option>{payableJobs.map((job) => <option key={job.id} value={job.id}>{job.project_code || "General"} — {job.service_type} — {job.party_name} — Due {money(job.due_amount)}</option>)}</select></div>
            {selectedPaymentJob && <div className="out-due-preview"><span>{selectedPaymentJob.project_code || "General"} · {selectedPaymentJob.service_type} · {selectedPaymentJob.party_name}</span><strong>Due {money(selectedPaymentJob.due_amount)}</strong></div>}
            <div className="out-field"><label>Payment Amount</label><input required inputMode="decimal" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} /></div>
            <div className="out-field"><label>Payment Date</label><input required type="date" value={paymentForm.paymentDate} onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} /></div>
            <div className="out-field"><label>Payment Method</label><select value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}>{METHODS.map((method) => <option key={method}>{method}</option>)}</select></div>
            <div className="out-field"><label>Reference</label><input value={paymentForm.referenceNo} onChange={(e) => setPaymentForm({ ...paymentForm, referenceNo: e.target.value })} placeholder="Cheque / bank / transaction ref" /></div>
            <div className="out-field full"><label>Notes</label><textarea value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} /></div>
            {selectedPaymentJob && <div className="out-due-preview"><span>Ledger destination</span><strong>{selectedPaymentJob.finance_scope === "municipality_file_pass" ? "Municipality Ledger" : "Main Accounts"}</strong></div>}
            <div className="out-form-actions"><button className="out-btn" type="button" disabled={busy} onClick={() => setPanel(null)}>Cancel</button><button className="out-btn primary" disabled={busy || !paymentForm.jobId}>{busy ? "Posting…" : "Save Payment"}</button></div>
          </form>}
        </section>
      </div>}
    </main>
  );
}
