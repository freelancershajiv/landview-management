"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;
type Data = { projects?: Row[]; jobs?: Row[]; parties?: Row[] };
type PaymentStage = "Advance" | "Partial" | "Final";

const GENERAL = "__GENERAL__";
const METHODS = ["Cash", "bKash", "Nagad", "Bank", "Card", "Cheque", "Other"];
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
  "Soil Test",
  "Digital Survey",
  "Other",
];
const text = (value: unknown) => String(value ?? "").trim();
const money = (value: unknown) =>
  Number(value || 0).toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function requestOutsourcing(body?: Row) {
  const response = await fetch("/api/outsourcing", {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) {
    throw new Error(String(json?.error || "Outsourcing request failed."));
  }
  return json.data;
}

export default function AccountsOutsourcingPaymentOverlay() {
  const [open, setOpen] = useState(false);
  const [loadKey, setLoadKey] = useState(0);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [jobId, setJobId] = useState("");
  const [newJobOpen, setNewJobOpen] = useState(false);
  const [partyId, setPartyId] = useState("");
  const [service, setService] = useState("Structural Design");
  const [agreedAmount, setAgreedAmount] = useState("");
  const [jobBusy, setJobBusy] = useState(false);
  const [paymentStage, setPaymentStage] = useState<PaymentStage>("Advance");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState("Cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const button = target?.closest<HTMLButtonElement>("button");
      if (!button || button.textContent?.trim() !== "Outsourcing Payment") return;
      if (!button.closest(".accounts-entry-panel")) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setError("");
      setMessage("");
      setOpen(true);
      setLoadKey((value) => value + 1);
    };

    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    void requestOutsourcing()
      .then((snapshot) => {
        if (!cancelled) setData(snapshot as Data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load outsourcing data.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, loadKey]);

  const projects = data?.projects || [];
  const parties = useMemo(() => (data?.parties || []).filter((row) => row.active !== false), [data]);
  const openJobs = useMemo(() => (data?.jobs || []).filter((job) => {
    const due = Number(job.due_amount || 0);
    const status = text(job.status).toLowerCase();
    const scope = text(job.finance_scope).toLowerCase();
    return due > 0 && status !== "cancelled" && status !== "canceled" && scope !== "municipality_file_pass";
  }), [data]);

  const projectJobs = useMemo(() => {
    if (!projectCode) return [];
    if (projectCode === GENERAL) return openJobs.filter((job) => !text(job.project_code));
    const normalized = projectCode.toUpperCase();
    return openJobs.filter((job) => text(job.project_code).toUpperCase() === normalized);
  }, [openJobs, projectCode]);

  const selectedJob = useMemo(
    () => openJobs.find((job) => String(job.id) === jobId) || null,
    [openJobs, jobId],
  );

  function clearJobSelection(nextProject = projectCode) {
    setProjectCode(nextProject);
    setJobId("");
    setNewJobOpen(false);
    setPartyId("");
    setService("Structural Design");
    setAgreedAmount("");
    setPaymentStage("Advance");
    setAmount("");
    setReference("");
    setNotes("");
    setMessage("");
    setError("");
  }

  function selectJob(nextJobId: string) {
    setJobId(nextJobId);
    const job = openJobs.find((row) => String(row.id) === nextJobId);
    if (!job) return;
    setProjectCode(text(job.project_code) || GENERAL);
    setPaymentStage(Number(job.paid_amount || 0) > 0 ? "Partial" : "Advance");
    setAmount("");
    setMessage("");
    setError("");
  }

  function selectStage(stage: PaymentStage) {
    setPaymentStage(stage);
    if (stage === "Final" && selectedJob) setAmount(Number(selectedJob.due_amount || 0).toFixed(2));
  }

  async function refreshAndSelect(createdId?: string) {
    const snapshot = await requestOutsourcing() as Data;
    setData(snapshot);
    if (createdId) {
      const created = (snapshot.jobs || []).find((row) => String(row.id) === createdId);
      if (created) {
        setJobId(String(created.id));
        setProjectCode(text(created.project_code) || GENERAL);
        setPaymentStage("Advance");
      }
    }
    return snapshot;
  }

  async function createJob() {
    setError("");
    setMessage("");
    if (!projectCode) return setError("Choose a Project / File ID first.");
    if (!partyId) return setError("Choose the outsourced person or firm.");
    if (!service.trim()) return setError("Choose the outsourced service.");
    const agreed = Number(agreedAmount || 0);
    if (!Number.isFinite(agreed) || agreed <= 0) return setError("Enter an agreed amount greater than zero.");

    setJobBusy(true);
    try {
      const created = await requestOutsourcing({
        action: "addJob",
        projectCode: projectCode === GENERAL ? "" : projectCode,
        partyId,
        serviceType: service.trim(),
        agreedAmount: agreed,
        assignedDate: date,
        notes: "Created from Main Accounts → Outsourcing Payment",
      });
      const createdId = String(created?.id || "");
      await refreshAndSelect(createdId);
      setNewJobOpen(false);
      setPartyId("");
      setService("Structural Design");
      setAgreedAmount("");
      setMessage("Outsourcing job created. Enter the payment amount below.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create outsourcing job.");
    } finally {
      setJobBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!projectCode) return setError("Choose a Project / File ID.");
    if (!selectedJob) return setError("Choose or create an outsourcing job.");

    const payment = Number(amount || 0);
    if (!Number.isFinite(payment) || payment <= 0) return setError("Enter a payment amount greater than zero.");
    const due = Number(selectedJob.due_amount || 0);
    if (payment > due + 0.005) return setError(`Payment cannot exceed the current due of BDT ${money(due)}.`);
    if (paymentStage === "Final" && Math.abs(payment - due) > 0.005) {
      return setError(`Final payment must equal the current due of BDT ${money(due)}.`);
    }

    setBusy(true);
    try {
      const stageNote = `Payment Stage: ${paymentStage}`;
      const paymentNotes = [stageNote, notes.trim()].filter(Boolean).join("\n");
      await requestOutsourcing({
        action: "addPayment",
        jobId: String(selectedJob.id),
        amount: payment,
        paymentDate: date,
        paymentMethod: method,
        referenceNo: reference.trim(),
        notes: paymentNotes,
      });
      setMessage("Outsourcing payment posted once to Main Accounts. Paid and due balances were updated.");
      window.setTimeout(() => window.location.reload(), 700);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post outsourcing payment.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="aop-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !busy && !jobBusy) setOpen(false); }}>
      <style>{`
        .aop-backdrop{position:fixed;inset:0;z-index:1700;background:rgba(0,0,0,.78);display:grid;place-items:center;padding:16px;overflow:auto}
        .aop-card{width:min(980px,100%);max-height:94vh;overflow:auto;border:1px solid #3b4650;border-radius:14px;background:linear-gradient(180deg,#121b22,#0b1217);box-shadow:0 30px 100px rgba(0,0,0,.55)}
        .aop-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:14px 16px;border-bottom:1px solid #293640}.aop-head small{display:block;color:#e9bd52;font-size:8px;font-weight:900;letter-spacing:.13em}.aop-head h2{margin:4px 0 0;font-size:20px}.aop-close{border:1px solid #3a4751;border-radius:8px;background:#111920;color:#c6d0d6;padding:8px 11px;font-size:9px;font-weight:900;cursor:pointer}
        .aop-body{padding:14px 16px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.aop-body label{display:grid;gap:5px;color:#87929a;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.03em}.aop-body label.wide2{grid-column:span 2}.aop-body label.wide4,.aop-msg,.aop-error,.aop-loading,.aop-empty,.aop-job-card,.aop-new-job,.aop-note,.aop-submit{grid-column:1/-1}
        .aop-body input,.aop-body select,.aop-body textarea{width:100%;min-width:0;border:1px solid #35424b;border-radius:7px;background:#091016;color:#edf1f4;padding:9px 10px;font-size:10px}.aop-body textarea{min-height:62px;resize:vertical}
        .aop-error,.aop-msg,.aop-loading,.aop-empty{padding:10px 11px;border-radius:8px;font-size:9px}.aop-error{border:1px solid #73363a;background:#351b1d;color:#ffaaa5}.aop-msg{border:1px solid #315f42;background:#152a1e;color:#9ee5b7}.aop-loading,.aop-empty{border:1px solid #4d4632;background:#17150f;color:#c1b89e}.aop-empty{display:flex;align-items:center;justify-content:space-between;gap:10px}
        .aop-job-card{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;border:1px solid #5a4a22;border-radius:9px;overflow:hidden;background:#5a4a22}.aop-job-card>div{padding:10px 11px;background:#17150f}.aop-job-card span{display:block;color:#9b927b;font-size:7px;font-weight:900;text-transform:uppercase}.aop-job-card strong{display:block;margin-top:4px;color:#f2e6c4;font-size:12px}.aop-job-card .due strong{color:#ffd978}
        .aop-new-job{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;padding:11px;border:1px solid #5a4a22;border-radius:10px;background:#15130d}.aop-new-job h3,.aop-new-actions{grid-column:1/-1}.aop-new-job h3{margin:0;color:#f1d98a;font-size:11px}.aop-new-actions{display:flex;justify-content:flex-end;gap:7px}
        .aop-btn{border:1px solid #4c5660;border-radius:7px;background:#111920;color:#c8d1d7;padding:7px 10px;font-size:8px;font-weight:900;cursor:pointer}.aop-btn.gold{border-color:#8a7128;background:#3b3011;color:#ffe39a}.aop-btn.green{border-color:#315f42;background:#193523;color:#a9edc0}.aop-btn:disabled{opacity:.5;cursor:not-allowed}
        .aop-note{color:#78858e;font-size:8px;line-height:1.5}.aop-note a{color:#ffd978;text-decoration:none;font-weight:900}.aop-submit{min-height:42px;border:0;border-radius:8px;background:#c7262d;color:#fff;font-size:10px;font-weight:900;cursor:pointer}.aop-submit:disabled{opacity:.5;cursor:not-allowed}
        @media(max-width:760px){.aop-body{grid-template-columns:repeat(2,minmax(0,1fr))}.aop-new-job{grid-template-columns:1fr 1fr}}
        @media(max-width:520px){.aop-backdrop{padding:8px}.aop-head{align-items:flex-start}.aop-body,.aop-new-job{grid-template-columns:1fr}.aop-body label.wide2,.aop-body label.wide4,.aop-msg,.aop-error,.aop-loading,.aop-empty,.aop-job-card,.aop-new-job,.aop-note,.aop-submit,.aop-new-job h3,.aop-new-actions{grid-column:auto}.aop-job-card{grid-template-columns:1fr}.aop-empty{align-items:flex-start;flex-direction:column}}
      `}</style>

      <form className="aop-card" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="aop-head">
          <div><small>MAIN ACCOUNTS · OUTSOURCING</small><h2>Outsourcing Payment</h2></div>
          <button type="button" className="aop-close" disabled={busy || jobBusy} onClick={() => setOpen(false)}>Close</button>
        </div>

        <div className="aop-body">
          {loading && <div className="aop-loading">Loading all LAND VIEW projects and outsourcing work…</div>}
          {error && <div className="aop-error">{error}</div>}
          {message && <div className="aop-msg">{message}</div>}

          <label className="wide4">Project / File ID
            <select value={projectCode} disabled={loading || !data} onChange={(event) => clearJobSelection(event.target.value)}>
              <option value="">Choose project / file</option>
              <option value={GENERAL}>General / No Project</option>
              {projects.map((project) => <option key={project.id} value={text(project.project_code)}>{text(project.project_code)} — {text(project.client_name || project.client_name_snapshot || project.project_name) || "Project"}</option>)}
            </select>
          </label>

          {projectCode && projectJobs.length > 0 && <>
            <label className="wide4">Outsourcing Job
              <select value={jobId} onChange={(event) => selectJob(event.target.value)}>
                <option value="">Choose service and outsourced person / firm</option>
                {projectJobs.map((job) => <option key={job.id} value={String(job.id)}>{text(job.service_type) || "Outsourcing"} — {text(job.party_name) || "Unknown"} — Due BDT {money(job.due_amount)}</option>)}
              </select>
            </label>
            <div className="aop-note"><button type="button" className="aop-btn gold" onClick={() => setNewJobOpen((value) => !value)}>+ New Outsourcing Job</button></div>
          </>}

          {projectCode && !loading && projectJobs.length === 0 && <div className="aop-empty">
            <span>No unpaid outsourcing job exists for {projectCode === GENERAL ? "General" : projectCode}. Create a new outsourcing job first.</span>
            <button type="button" className="aop-btn gold" onClick={() => setNewJobOpen(true)}>+ Create Job</button>
          </div>}

          {projectCode && newJobOpen && <div className="aop-new-job">
            <h3>Create Outsourcing Job</h3>
            {parties.length ? <label>Outsourced To
              <select value={partyId} onChange={(event) => setPartyId(event.target.value)}>
                <option value="">Choose person / firm</option>
                {parties.map((party) => <option key={party.id} value={String(party.id)}>{text(party.name)} — {text(party.party_type) || "Individual"}</option>)}
              </select>
            </label> : <div className="aop-empty">No active outsourced person / firm. <a href="/admin/finance/outsourcing">Add one in Outsourcing Register</a>.</div>}
            <label>Service<select value={service} onChange={(event) => setService(event.target.value)}>{SERVICES.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Agreed / Contract Amount<input inputMode="decimal" value={agreedAmount} onChange={(event) => setAgreedAmount(event.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" /></label>
            <div className="aop-new-actions">
              <button type="button" className="aop-btn" disabled={jobBusy} onClick={() => setNewJobOpen(false)}>Cancel</button>
              <button type="button" className="aop-btn green" disabled={jobBusy || !parties.length} onClick={() => void createJob()}>{jobBusy ? "Creating…" : "Create Job"}</button>
            </div>
          </div>}

          {selectedJob && <div className="aop-job-card">
            <div><span>Agreed / Contract</span><strong>BDT {money(selectedJob.agreed_amount)}</strong></div>
            <div><span>Previously Paid</span><strong>BDT {money(selectedJob.paid_amount)}</strong></div>
            <div className="due"><span>Current Due</span><strong>BDT {money(selectedJob.due_amount)}</strong></div>
          </div>}

          {selectedJob && <>
            <label>Payment Stage<select value={paymentStage} onChange={(event) => selectStage(event.target.value as PaymentStage)}><option>Advance</option><option>Partial</option><option>Final</option></select></label>
            <label>Service<input value={text(selectedJob.service_type)} disabled /></label>
            <label className="wide2">Outsourced To<input value={text(selectedJob.party_name)} disabled /></label>
          </>}

          <label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
          <label>Payment Amount<input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} placeholder="0.00" /></label>
          <label>Payment Method<select value={method} onChange={(event) => setMethod(event.target.value)}>{METHODS.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>Reference<input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Cheque / bank / transaction ref" /></label>
          <label className="wide4">Notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional payment note" /></label>

          <div className="aop-note">Project/File ID always comes from the full project register. A payment is allowed only against an unpaid outsourcing job. If none exists, create the job here; the payment then creates one linked Main Accounts expense and updates Paid/Due automatically.</div>
          <button className="aop-submit" disabled={!selectedJob || busy || jobBusy || Number(amount || 0) <= 0}>{busy ? "POSTING OUTSOURCING PAYMENT…" : "POST OUTSOURCING PAYMENT"}</button>
        </div>
      </form>
    </div>
  );
}
