"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;
type Data = {
  summary: { agreed: number; paid: number; due: number; activeJobs: number; parties: number };
  parties: Row[];
  jobs: Row[];
  payments: Row[];
  projects: Row[];
};

type ServiceKey = "3d" | "electrical" | "soil-test" | "digital-survey";
type Panel = "job" | "payment" | null;

type ServiceConfig = {
  key: ServiceKey;
  title: string;
  shortTitle: string;
  href: string;
  description: string;
  serviceOptions: string[];
  matches: (value: unknown) => boolean;
};

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

const SERVICE_CONFIGS: Record<ServiceKey, ServiceConfig> = {
  "3d": {
    key: "3d",
    title: "3D Outsourcing",
    shortTitle: "3D",
    href: "/admin/finance/outsourcing/3d",
    description: "Exterior and interior 3D design outsourcing, vendor status and balances.",
    serviceOptions: ["3D Design – Exterior", "3D Design – Interior"],
    matches: (value) => normalize(value).includes("3d design"),
  },
  electrical: {
    key: "electrical",
    title: "Electrical Outsourcing",
    shortTitle: "Electrical",
    href: "/admin/finance/outsourcing/electrical",
    description: "Electrical design outsourcing work, releases, payments and due balances.",
    serviceOptions: ["Electrical Design"],
    matches: (value) => normalize(value) === "electrical design",
  },
  "soil-test": {
    key: "soil-test",
    title: "Soil Test Outsourcing",
    shortTitle: "Soil Test",
    href: "/admin/finance/outsourcing/soil-test",
    description: "Soil test outsourcing register with work status, vendor and payment balance.",
    serviceOptions: ["Soil Test"],
    matches: (value) => normalize(value) === "soil test",
  },
  "digital-survey": {
    key: "digital-survey",
    title: "Digital Survey Outsourcing",
    shortTitle: "Digital Survey",
    href: "/admin/finance/outsourcing/digital-survey",
    description: "Digital survey outsourcing register with work status, vendor and payment balance.",
    serviceOptions: ["Digital Survey"],
    matches: (value) => normalize(value) === "digital survey",
  },
};

const SERVICE_ORDER: ServiceKey[] = ["3d", "electrical", "soil-test", "digital-survey"];
const STATUSES = ["Assigned", "In Progress", "Submitted", "Completed", "Cancelled"];
const METHODS = ["Cash", "Bank", "bKash", "Nagad", "Cheque", "Card", "Other"];

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

function releaseState(job: Row) {
  if (normalize(job.status) === "cancelled") return "Cancelled";
  if (Number(job.due_amount || 0) <= 0.009) return "Released";
  const notes = normalize(job.notes);
  if (notes.includes("on hold")) return "On Hold";
  if (notes.includes("for release")) return "For Release";
  return "Due";
}

function releaseClass(value: string) {
  return normalize(value).replace(/\s+/g, "-");
}

function useOutsourcingData() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/outsourcing", { credentials: "same-origin", cache: "no-store" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load outsourcing data."));
      setData(json.data as Data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load outsourcing data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  return { data, loading, error, setError, load };
}

function BaseStyles() {
  return <style>{`
    .os-page{display:grid;gap:16px;padding-bottom:42px;color:var(--lv-text,#dbe3e8)}
    .os-hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:22px;border:1px solid var(--lv-border,#313b44);border-radius:16px;background:linear-gradient(135deg,var(--lv-surface-1,#11181e),var(--lv-surface-2,#151d24))}
    .os-kicker{font-size:9px;font-weight:950;letter-spacing:.16em;text-transform:uppercase;color:var(--lv-brand-primary,#d94b45)}
    .os-hero h1{margin:5px 0 6px;font-size:26px;color:var(--lv-text-strong,#fff)}
    .os-hero p{margin:0;max-width:720px;color:var(--lv-text-muted,#9da8b0);font-size:11px;line-height:1.6}
    .os-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    .os-btn{display:inline-flex;align-items:center;justify-content:center;min-height:38px;padding:0 12px;border:1px solid var(--lv-border,#36414a);border-radius:8px;background:var(--lv-surface-2,#151d24);color:var(--lv-text,#dbe3e8);font-size:10px;font-weight:900;text-decoration:none;cursor:pointer}
    .os-btn.primary{border-color:var(--lv-brand-primary,#d94b45);background:var(--lv-brand-primary,#d94b45);color:#fff}.os-btn:disabled{opacity:.5;cursor:not-allowed}
    .os-jumps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .os-jump{display:grid;gap:12px;padding:18px;border:1px solid var(--lv-border,#313b44);border-radius:14px;background:var(--lv-surface-1,#11181e);text-decoration:none;color:inherit;transition:.15s ease}
    .os-jump:hover{border-color:var(--lv-brand-primary,#d94b45);transform:translateY(-1px)}.os-jump.active{border-color:var(--lv-brand-primary,#d94b45);box-shadow:inset 0 0 0 1px rgba(217,75,69,.2)}
    .os-jump h2{margin:0;font-size:16px;color:var(--lv-text-strong,#fff)}.os-jump p{margin:0;color:var(--lv-text-muted,#9da8b0);font-size:9px;line-height:1.5}
    .os-jump-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.os-mini{padding:8px;border-radius:8px;background:var(--lv-bg,#0d1318)}.os-mini span{display:block;font-size:7px;text-transform:uppercase;color:var(--lv-text-muted,#9da8b0);font-weight:900}.os-mini strong{display:block;margin-top:4px;font-size:10px;color:var(--lv-text-strong,#fff)}.os-mini.due strong{color:#ffb84d}.os-mini.paid strong{color:#78d6a2}
    .os-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}.os-card{padding:14px;border:1px solid var(--lv-border,#313b44);border-radius:12px;background:var(--lv-surface-1,#11181e)}.os-card span{display:block;color:var(--lv-text-muted,#9da8b0);font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.os-card strong{display:block;margin-top:7px;font-size:17px;color:var(--lv-text-strong,#fff)}.os-card.due strong{color:#ffb84d}.os-card.paid strong{color:#78d6a2}
    .os-panel{border:1px solid var(--lv-border,#313b44);border-radius:14px;background:var(--lv-surface-1,#11181e);overflow:hidden}.os-toolbar{display:flex;align-items:center;gap:10px;padding:12px;border-bottom:1px solid var(--lv-border,#313b44);background:var(--lv-surface-2,#151d24)}.os-toolbar strong{font-size:11px;color:var(--lv-text-strong,#fff)}.os-search{margin-left:auto;min-width:280px;height:34px;padding:0 10px;border:1px solid var(--lv-border,#36414a);border-radius:7px;background:var(--lv-bg,#0d1318);color:var(--lv-text,#dbe3e8);font-size:10px}
    .os-table-wrap{overflow:auto}.os-table{width:100%;min-width:1100px;border-collapse:collapse}.os-table th{padding:10px 12px;border-bottom:1px solid var(--lv-border,#313b44);background:rgba(255,255,255,.02);color:var(--lv-text-muted,#9da8b0);font-size:8px;text-transform:uppercase;letter-spacing:.06em;text-align:left;white-space:nowrap}.os-table td{padding:11px 12px;border-bottom:1px solid rgba(255,255,255,.055);font-size:10px;vertical-align:middle}.os-table tr:last-child td{border-bottom:0}.os-table strong{color:var(--lv-text-strong,#fff)}.os-sub{display:block;margin-top:3px;color:var(--lv-text-muted,#9da8b0);font-size:8px}.num{text-align:right!important;font-variant-numeric:tabular-nums}.due-text{color:#ffb84d}.paid-text{color:#78d6a2}
    .os-select{height:32px;min-width:120px;padding:0 7px;border:1px solid var(--lv-border,#36414a);border-radius:7px;background:var(--lv-bg,#0d1318);color:var(--lv-text,#dbe3e8);font-size:9px}
    .os-release{display:inline-flex;align-items:center;min-height:24px;padding:0 8px;border-radius:999px;border:1px solid var(--lv-border,#36414a);font-size:8px;font-weight:900;white-space:nowrap}.os-release.released{color:#78d6a2;border-color:rgba(120,214,162,.35)}.os-release.for-release,.os-release.due{color:#ffbf59;border-color:rgba(255,191,89,.35)}.os-release.on-hold{color:#ff9b95;border-color:rgba(255,92,85,.35)}
    .os-empty{padding:32px;text-align:center;color:var(--lv-text-muted,#9da8b0);font-size:11px}.os-alert{padding:11px 13px;border-radius:9px;font-size:10px}.os-alert.error{border:1px solid rgba(255,92,85,.35);background:rgba(255,92,85,.08);color:#ffaaa5}.os-alert.ok{border:1px solid rgba(120,214,162,.3);background:rgba(120,214,162,.07);color:#92e0b4}
    .os-modal-backdrop{position:fixed;inset:0;z-index:1300;display:grid;place-items:center;padding:18px;background:rgba(3,7,10,.78);backdrop-filter:blur(5px)}.os-modal{width:min(720px,100%);max-height:90vh;overflow:auto;border:1px solid var(--lv-border,#36414a);border-radius:15px;background:var(--lv-surface-1,#11181e);box-shadow:0 24px 80px rgba(0,0,0,.45)}.os-modal-head{display:flex;justify-content:space-between;gap:12px;padding:17px;border-bottom:1px solid var(--lv-border,#313b44)}.os-modal-head h2{margin:0 0 4px;font-size:18px;color:var(--lv-text-strong,#fff)}.os-modal-head p{margin:0;color:var(--lv-text-muted,#9da8b0);font-size:9px}.os-close{border:0;background:none;color:var(--lv-text-muted,#9da8b0);font-size:20px;cursor:pointer}.os-form{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:17px}.os-field{display:grid;gap:6px}.os-field.full{grid-column:1/-1}.os-field label{font-size:8px;font-weight:900;text-transform:uppercase;color:var(--lv-text-muted,#9da8b0)}.os-field input,.os-field select,.os-field textarea{width:100%;border:1px solid var(--lv-border,#36414a);border-radius:8px;background:var(--lv-bg,#0d1318);color:var(--lv-text,#dbe3e8);font:inherit;font-size:10px;padding:9px}.os-field textarea{min-height:80px;resize:vertical}.os-form-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:8px;padding-top:4px}.os-due-box{grid-column:1/-1;display:flex;justify-content:space-between;gap:10px;padding:11px;border:1px solid rgba(255,184,77,.25);border-radius:9px;background:rgba(255,184,77,.07);font-size:10px}.os-due-box strong{color:#ffbf59}
    @media(max-width:980px){.os-jumps{grid-template-columns:1fr 1fr}.os-summary{grid-template-columns:1fr 1fr}.os-summary .os-card:first-child{grid-column:1/-1}}
    @media(max-width:720px){.os-hero{display:grid;padding:16px}.os-actions{justify-content:flex-start}.os-jumps{grid-template-columns:1fr}.os-toolbar{display:grid}.os-search{margin:0;width:100%;min-width:0}.os-form{grid-template-columns:1fr}.os-field.full,.os-form-actions,.os-due-box{grid-column:1}.os-table{min-width:980px}}
  `}</style>;
}

export function OutsourcingHub() {
  const { data, loading, error } = useOutsourcingData();
  const jobs = data?.jobs || [];

  return <main className="os-page">
    <BaseStyles />
    <section className="os-hero">
      <div>
        <span className="os-kicker">Finance · Outsourcing</span>
        <h1>Outsourcing Control Center</h1>
        <p>Jump directly to the outsourcing type you need. Each register has its own work status, vendor, agreed amount, paid amount and current due balance.</p>
      </div>
      <div className="os-actions">
        <Link className="os-btn" href="/admin/projects">Projects</Link>
        <Link className="os-btn primary" href="/admin/finance/outsourcing/new">+ Add Outsourcing</Link>
      </div>
    </section>
    {error && <div className="os-alert error">{error}</div>}
    {loading ? <div className="os-empty">Loading outsourcing balances…</div> : <section className="os-jumps">
      {SERVICE_ORDER.map((key) => {
        const config = SERVICE_CONFIGS[key];
        const rows = jobs.filter((job) => config.matches(job.service_type) && normalize(job.status) !== "cancelled");
        const agreed = rows.reduce((sum, row) => sum + Number(row.agreed_amount || 0), 0);
        const paid = rows.reduce((sum, row) => sum + Number(row.paid_amount || 0), 0);
        const due = rows.reduce((sum, row) => sum + Number(row.due_amount || 0), 0);
        return <Link key={key} href={config.href} className="os-jump">
          <div><h2>{config.title}</h2><p>{config.description}</p></div>
          <div className="os-jump-metrics">
            <div className="os-mini"><span>Agreed</span><strong>{money(agreed)}</strong></div>
            <div className="os-mini paid"><span>Paid</span><strong>{money(paid)}</strong></div>
            <div className="os-mini due"><span>Due</span><strong>{money(due)}</strong></div>
          </div>
          <div className="os-sub">{rows.length} work item{rows.length === 1 ? "" : "s"} · Open register →</div>
        </Link>;
      })}
    </section>}
  </main>;
}

export function OutsourcingServicePage({ serviceKey }: { serviceKey: ServiceKey }) {
  const config = SERVICE_CONFIGS[serviceKey];
  const { data, loading, error, setError, load } = useOutsourcingData();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [jobForm, setJobForm] = useState({ projectCode: "", partyId: "", serviceType: config.serviceOptions[0], agreedAmount: "", assignedDate: dateToday(), targetDate: "", scopeDescription: "", notes: "" });
  const [paymentForm, setPaymentForm] = useState({ jobId: "", amount: "", paymentDate: dateToday(), paymentMethod: "Cash", referenceNo: "", notes: "" });

  const jobs = useMemo(() => (data?.jobs || []).filter((job) => config.matches(job.service_type)), [data?.jobs, config]);
  const parties = (data?.parties || []).filter((party) => party.active !== false);
  const projects = data?.projects || [];
  const payableJobs = jobs.filter((job) => normalize(job.status) !== "cancelled" && Number(job.due_amount || 0) > .009);
  const selectedPaymentJob = jobs.find((job) => String(job.id) === paymentForm.jobId);
  const jobIds = new Set(jobs.map((job) => String(job.id)));
  const payments = (data?.payments || []).filter((payment) => jobIds.has(String(payment.job_id)));

  const visibleJobs = useMemo(() => {
    const term = normalize(query);
    if (!term) return jobs;
    return jobs.filter((row) => [row.project_code, row.project_name, row.client_name, row.service_type, row.party_name, row.status, row.notes].join(" ").toLowerCase().includes(term));
  }, [jobs, query]);

  const effectiveJobs = jobs.filter((job) => normalize(job.status) !== "cancelled");
  const agreed = effectiveJobs.reduce((sum, row) => sum + Number(row.agreed_amount || 0), 0);
  const paid = effectiveJobs.reduce((sum, row) => sum + Number(row.paid_amount || 0), 0);
  const due = effectiveJobs.reduce((sum, row) => sum + Number(row.due_amount || 0), 0);
  const active = effectiveJobs.filter((row) => normalize(row.status) !== "completed").length;
  const vendors = new Set(effectiveJobs.map((row) => row.party_name).filter(Boolean)).size;

  async function post(action: string, payload: Row) {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/outsourcing", {
        method: "POST", credentials: "same-origin", cache: "no-store",
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
    } finally { setBusy(false); }
  }

  async function changeStatus(job: Row, status: string) {
    try { await post("updateJob", { id: job.id, status }); setMessage(`Status changed to ${status}.`); } catch {}
  }

  function openPayment(job?: Row) {
    const target = job || payableJobs[0];
    setPaymentForm({ jobId: target?.id ? String(target.id) : "", amount: target ? String(Number(target.due_amount || 0).toFixed(2)) : "", paymentDate: dateToday(), paymentMethod: target?.preferred_payment_method || "Cash", referenceNo: "", notes: "" });
    setPanel("payment");
  }

  async function submitPayment(event: FormEvent) {
    event.preventDefault();
    try { await post("addPayment", paymentForm); setPanel(null); setMessage("Outsourcing payment saved."); } catch {}
  }

  async function submitJob(event: FormEvent) {
    event.preventDefault();
    try {
      await post("addJob", jobForm);
      setJobForm({ projectCode: "", partyId: "", serviceType: config.serviceOptions[0], agreedAmount: "", assignedDate: dateToday(), targetDate: "", scopeDescription: "", notes: "" });
      setPanel(null); setMessage(`${config.title} work added.`);
    } catch {}
  }

  return <main className="os-page">
    <BaseStyles />
    <section className="os-hero">
      <div>
        <span className="os-kicker">Finance · Outsourcing</span>
        <h1>{config.title}</h1>
        <p>{config.description}</p>
      </div>
      <div className="os-actions">
        <Link className="os-btn" href="/admin/finance/outsourcing">← All Outsourcing</Link>
        <button className="os-btn" type="button" onClick={() => setPanel("job")}>+ Add {config.shortTitle} Work</button>
        <button className="os-btn primary" type="button" disabled={!payableJobs.length} onClick={() => openPayment()}>+ Pay {config.shortTitle}</button>
      </div>
    </section>

    <section className="os-jumps">
      {SERVICE_ORDER.map((key) => {
        const item = SERVICE_CONFIGS[key];
        return <Link key={key} href={item.href} className={`os-jump ${key === serviceKey ? "active" : ""}`}><div><h2>{item.title}</h2><p>{key === serviceKey ? "Current register" : "Jump to register"}</p></div></Link>;
      })}
    </section>

    {error && <div className="os-alert error">{error}</div>}
    {message && <div className="os-alert ok">{message}</div>}

    <section className="os-summary">
      <div className="os-card"><span>Total Agreed</span><strong>{money(agreed)}</strong></div>
      <div className="os-card paid"><span>Total Paid</span><strong>{money(paid)}</strong></div>
      <div className="os-card due"><span>Total Due</span><strong>{money(due)}</strong></div>
      <div className="os-card"><span>Active Work</span><strong>{active}</strong></div>
      <div className="os-card"><span>Vendors</span><strong>{vendors}</strong></div>
    </section>

    <section className="os-panel">
      <div className="os-toolbar"><strong>{config.title} Register</strong><input className="os-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search File ID, client, vendor, status…" /></div>
      {loading ? <div className="os-empty">Loading register…</div> : <div className="os-table-wrap"><table className="os-table">
        <thead><tr><th>File / Client</th><th>Service</th><th>Outsource To</th><th className="num">Agreed</th><th className="num">Paid</th><th className="num">Due</th><th>Work Status</th><th>Work / Target Date</th><th>Release</th><th>Action</th></tr></thead>
        <tbody>
          {!visibleJobs.length && <tr><td colSpan={10}><div className="os-empty">No {config.title.toLowerCase()} work found.</div></td></tr>}
          {visibleJobs.map((job) => {
            const released = releaseState(job);
            return <tr key={job.id}>
              <td><strong>{job.project_code || "General"}</strong><span className="os-sub">{job.client_name || job.project_name || job.job_code}</span></td>
              <td><strong>{job.service_type}</strong><span className="os-sub">{job.job_code}</span></td>
              <td><strong>{job.party_name || "—"}</strong><span className="os-sub">{job.party_type || ""}</span></td>
              <td className="num">{money(job.agreed_amount)}</td>
              <td className="num paid-text">{money(job.paid_amount)}</td>
              <td className="num due-text"><strong>{money(job.due_amount)}</strong></td>
              <td><select className="os-select" value={job.status || "Assigned"} disabled={busy} onChange={(e) => void changeStatus(job, e.target.value)}>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select></td>
              <td><strong>{job.assigned_date || "—"}</strong><span className="os-sub">Target / release {job.target_date || "—"}</span></td>
              <td><span className={`os-release ${releaseClass(released)}`}>{released}</span></td>
              <td><button className="os-btn primary" type="button" disabled={busy || Number(job.due_amount || 0) <= .009 || normalize(job.status) === "cancelled"} onClick={() => openPayment(job)}>Pay</button></td>
            </tr>;
          })}
        </tbody>
      </table></div>}
    </section>

    <section className="os-panel">
      <div className="os-toolbar"><strong>Recent {config.shortTitle} Payments</strong><span className="os-sub">{payments.length} payment record{payments.length === 1 ? "" : "s"}</span></div>
      <div className="os-table-wrap"><table className="os-table">
        <thead><tr><th>Date</th><th>File</th><th>Vendor</th><th>Method</th><th>Reference</th><th className="num">Amount</th><th>Status</th></tr></thead>
        <tbody>{!payments.length && <tr><td colSpan={7}><div className="os-empty">No payments in this register.</div></td></tr>}{payments.map((payment) => <tr key={payment.id}><td>{payment.payment_date || "—"}<span className="os-sub">{payment.payment_code}</span></td><td>{payment.project_code || "General"}</td><td>{payment.party_name || "—"}</td><td>{payment.payment_method || "—"}</td><td>{payment.reference_no || "—"}</td><td className="num"><strong>{money(payment.amount)}</strong></td><td>{payment.status || "POSTED"}</td></tr>)}</tbody>
      </table></div>
    </section>

    {panel && <div className="os-modal-backdrop" onMouseDown={(e) => { if (e.currentTarget === e.target && !busy) setPanel(null); }}><section className="os-modal">
      <div className="os-modal-head"><div><h2>{panel === "job" ? `Add ${config.title} Work` : `Pay ${config.title}`}</h2><p>{panel === "job" ? "Add a project-linked outsourcing payable." : "Record the payment against the selected outsourcing work."}</p></div><button className="os-close" type="button" disabled={busy} onClick={() => setPanel(null)}>×</button></div>
      {panel === "job" ? <form className="os-form" onSubmit={submitJob}>
        <div className="os-field"><label>Project / File ID</label><select required value={jobForm.projectCode} onChange={(e) => setJobForm({ ...jobForm, projectCode: e.target.value })}><option value="">Choose project</option>{projects.map((project) => <option key={project.id} value={project.project_code}>{project.project_code} — {project.client_name || project.project_name || "Project"}</option>)}</select></div>
        <div className="os-field"><label>Outsource To</label><select required value={jobForm.partyId} onChange={(e) => setJobForm({ ...jobForm, partyId: e.target.value })}><option value="">Choose person / firm</option>{parties.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}</select></div>
        <div className="os-field"><label>Service</label><select value={jobForm.serviceType} onChange={(e) => setJobForm({ ...jobForm, serviceType: e.target.value })}>{config.serviceOptions.map((service) => <option key={service}>{service}</option>)}</select></div>
        <div className="os-field"><label>Agreed Amount</label><input required inputMode="decimal" value={jobForm.agreedAmount} onChange={(e) => setJobForm({ ...jobForm, agreedAmount: e.target.value })} placeholder="0.00" /></div>
        <div className="os-field"><label>Work / Assigned Date</label><input required type="date" value={jobForm.assignedDate} onChange={(e) => setJobForm({ ...jobForm, assignedDate: e.target.value })} /></div>
        <div className="os-field"><label>Target Date</label><input type="date" value={jobForm.targetDate} onChange={(e) => setJobForm({ ...jobForm, targetDate: e.target.value })} /></div>
        <div className="os-field full"><label>Scope</label><textarea value={jobForm.scopeDescription} onChange={(e) => setJobForm({ ...jobForm, scopeDescription: e.target.value })} /></div>
        <div className="os-field full"><label>Notes</label><textarea value={jobForm.notes} onChange={(e) => setJobForm({ ...jobForm, notes: e.target.value })} /></div>
        <div className="os-form-actions"><button className="os-btn" type="button" disabled={busy} onClick={() => setPanel(null)}>Cancel</button><button className="os-btn primary" disabled={busy || !parties.length}>{busy ? "Saving…" : "Create Work"}</button></div>
      </form> : <form className="os-form" onSubmit={submitPayment}>
        <div className="os-field full"><label>Outsourcing Work</label><select required value={paymentForm.jobId} onChange={(e) => { const job = jobs.find((row) => String(row.id) === e.target.value); setPaymentForm({ ...paymentForm, jobId: e.target.value, amount: job ? String(Number(job.due_amount || 0).toFixed(2)) : "" }); }}><option value="">Choose work item</option>{payableJobs.map((job) => <option key={job.id} value={job.id}>{job.project_code || "General"} — {job.party_name} — Due {money(job.due_amount)}</option>)}</select></div>
        {selectedPaymentJob && <div className="os-due-box"><span>{selectedPaymentJob.project_code} · {selectedPaymentJob.party_name}</span><strong>Due {money(selectedPaymentJob.due_amount)}</strong></div>}
        <div className="os-field"><label>Amount</label><input required inputMode="decimal" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} /></div>
        <div className="os-field"><label>Payment Date</label><input required type="date" value={paymentForm.paymentDate} onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })} /></div>
        <div className="os-field"><label>Method</label><select value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm({ ...paymentForm, paymentMethod: e.target.value })}>{METHODS.map((method) => <option key={method}>{method}</option>)}</select></div>
        <div className="os-field"><label>Reference</label><input value={paymentForm.referenceNo} onChange={(e) => setPaymentForm({ ...paymentForm, referenceNo: e.target.value })} /></div>
        <div className="os-field full"><label>Notes</label><textarea value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} /></div>
        <div className="os-form-actions"><button className="os-btn" type="button" disabled={busy} onClick={() => setPanel(null)}>Cancel</button><button className="os-btn primary" disabled={busy}>{busy ? "Saving…" : "Save Payment"}</button></div>
      </form>}
    </section></div>}
  </main>;
}
