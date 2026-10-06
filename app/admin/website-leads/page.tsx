"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Lead = {
  id: string;
  lead_code?: string;
  created_at?: string;
  updated_at?: string;
  status?: string;
  priority?: string;
  name?: string;
  phone?: string;
  email?: string;
  project_location?: string;
  project_type?: string;
  proposed_floors?: string;
  services?: string[];
  message?: string;
  source_path?: string;
  source_referrer?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  assigned_to?: string;
  admin_notes?: string;
  contacted_at?: string;
  follow_up_at?: string;
  next_action?: string;
  converted_project_code?: string;
  converted_proposal_code?: string;
};

type Summary = { total?: number; newCount?: number; overdueFollowUps?: number; dueToday?: number; qualified?: number; converted?: number };

const STATUS_OPTIONS = ["New", "Contacted", "Qualified", "Converted", "Closed"];
const PRIORITY_OPTIONS = ["Low", "Normal", "High", "Urgent"];

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("en-BD", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" });
}

function toLocalInput(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

function whatsapp(phone?: string, name?: string, leadCode?: string) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  const normalized = digits.startsWith("880") ? digits : digits.startsWith("0") ? `88${digits}` : digits;
  const message = `Hello ${name || "there"}, thank you for contacting LAND VIEW Engineers & Architects${leadCode ? ` regarding enquiry ${leadCode}` : ""}. We are reviewing your project requirements. Please let us know a convenient time to discuss the next steps.`;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

function dueState(lead: Lead) {
  if (!lead.follow_up_at || ["Converted", "Closed"].includes(lead.status || "")) return "";
  const due = new Date(lead.follow_up_at);
  if (Number.isNaN(due.getTime())) return "";
  const now = new Date();
  const day = (date: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  if (day(due) === day(now)) return "today";
  if (due.getTime() < now.getTime()) return "overdue";
  return "future";
}

export default function WebsiteLeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [summary, setSummary] = useState<Summary>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [followFilter, setFollowFilter] = useState("All");
  const [savingId, setSavingId] = useState("");
  const [convertingId, setConvertingId] = useState("");
  const [drafts, setDrafts] = useState<Record<string, Partial<Lead>>>({});

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/website-leads", { cache: "no-store", credentials: "same-origin" });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load website enquiries."));
      const rows = Array.isArray(json.data) ? json.data : [];
      setLeads(rows);
      setSummary(json.summary || {});
      setDrafts(Object.fromEntries(rows.map((lead: Lead) => [lead.id, { ...lead }])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load website enquiries.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((lead) => {
      if (statusFilter !== "All" && (lead.status || "New") !== statusFilter) return false;
      const due = dueState(lead);
      if (followFilter === "Overdue" && due !== "overdue") return false;
      if (followFilter === "Due Today" && due !== "today") return false;
      if (followFilter === "Scheduled" && !["future", "today"].includes(due)) return false;
      if (!q) return true;
      return [lead.lead_code, lead.name, lead.phone, lead.email, lead.project_location, lead.project_type, lead.next_action, lead.converted_proposal_code, ...(lead.services || [])]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });
  }, [leads, query, statusFilter, followFilter]);

  function patchDraft(id: string, changes: Partial<Lead>) {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] || {}), ...changes } }));
  }

  async function refreshSummary() {
    try {
      const response = await fetch("/api/admin/website-leads?summary=1", { cache: "no-store", credentials: "same-origin" });
      const json = await response.json();
      if (response.ok && json?.success) setSummary(json.data || {});
    } catch {}
  }

  async function saveLead(id: string) {
    const draft = drafts[id] || {};
    setSavingId(id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/website-leads", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id, status: draft.status, priority: draft.priority, assignedTo: draft.assigned_to, adminNotes: draft.admin_notes, nextAction: draft.next_action, followUpAt: draft.follow_up_at || "", convertedProjectCode: draft.converted_project_code, convertedProposalCode: draft.converted_proposal_code }),
      });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not save lead."));
      setLeads((current) => current.map((lead) => lead.id === id ? json.data : lead));
      setDrafts((current) => ({ ...current, [id]: { ...json.data } }));
      setMessage(`${json.data?.lead_code || "Website enquiry"} updated.`);
      void refreshSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save lead.");
    } finally { setSavingId(""); }
  }

  async function createProposal(lead: Lead) {
    if (convertingId) return;
    if (lead.converted_proposal_code) {
      window.location.href = `/admin/proposals/${encodeURIComponent(lead.converted_proposal_code)}`;
      return;
    }
    setConvertingId(lead.id); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/website-leads/convert-proposal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id: lead.id }),
      });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not create proposal."));
      const proposalId = String(json?.data?.proposalId || "");
      if (!proposalId) throw new Error("Proposal ID was not returned.");
      window.location.href = `/admin/proposals/${encodeURIComponent(proposalId)}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create proposal.");
      setConvertingId("");
    }
  }

  return (
    <main className="wl-page">
      <style>{`
        .wl-page{min-height:100vh;padding:28px;background:#f4f6f8;color:#17212b}.wl-wrap{width:min(100% - 28px,1540px);margin:0 auto}.wl-head{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:20px}.wl-kicker{display:block;margin-bottom:7px;color:#c6252b;font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.wl-head h1{margin:0;font-size:clamp(28px,4vw,44px);line-height:1}.wl-head p{max-width:760px;margin:10px 0 0;color:#667581;line-height:1.6}.wl-actions{display:flex;gap:8px;flex-wrap:wrap}.wl-btn{min-height:40px;display:inline-flex;align-items:center;justify-content:center;padding:0 14px;border:1px solid #cbd2d9;border-radius:8px;background:#fff;color:#17212b!important;text-decoration:none;font-size:12px;font-weight:800;cursor:pointer}.wl-btn.primary{border-color:#c6252b;background:#c6252b;color:#fff!important}.wl-stats{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:16px}.wl-stat{padding:15px;border:1px solid #dde3e8;border-radius:12px;background:#fff}.wl-stat small{display:block;color:#7a8792;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.07em}.wl-stat strong{display:block;margin-top:6px;font-size:26px}.wl-stat.alert strong{color:#c6252b}.wl-toolbar{display:grid;grid-template-columns:minmax(260px,1fr) 180px 180px auto;gap:9px;margin-bottom:14px;padding:12px;border:1px solid #dde3e8;border-radius:12px;background:#fff}.wl-toolbar input,.wl-toolbar select{min-height:40px;border:1px solid #ccd4db;border-radius:8px;background:#fff;padding:0 11px;color:#1c2730}.wl-error,.wl-message{margin-bottom:14px;padding:12px 14px;border-radius:8px}.wl-error{border-left:3px solid #c6252b;background:#fff1f1;color:#8f2626}.wl-message{border-left:3px solid #31895b;background:#eefaf3;color:#256b48}.wl-grid{display:grid;gap:12px}.wl-card{display:grid;grid-template-columns:minmax(215px,.78fr) minmax(270px,1fr) minmax(320px,1.15fr);border:1px solid #dce2e7;border-radius:13px;background:#fff;overflow:hidden}.wl-col{padding:16px;border-right:1px solid #edf0f2}.wl-col:last-child{border-right:0}.wl-code{display:flex;align-items:center;justify-content:space-between;gap:10px}.wl-code strong{font-size:13px}.wl-badge{padding:5px 8px;border-radius:999px;background:#f1f3f5;font-size:9px;font-weight:900}.wl-badge.New{background:#fff1d9;color:#8a5a00}.wl-badge.Qualified{background:#e6f2ff;color:#155e9c}.wl-badge.Converted{background:#e6f6ec;color:#19703a}.wl-follow{display:inline-flex;margin-top:9px;padding:5px 7px;border-radius:6px;font-size:9px;font-weight:900}.wl-follow.overdue{background:#ffe7e7;color:#a82424}.wl-follow.today{background:#fff2d4;color:#875600}.wl-follow.future{background:#edf4ff;color:#315f94}.wl-card h2{margin:12px 0 4px;font-size:19px}.wl-meta{display:grid;gap:5px;color:#667581;font-size:12px;line-height:1.45}.wl-links{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.wl-links a,.wl-links button{padding:7px 9px;border:1px solid #d8dee4;border-radius:6px;background:#fff;color:#24313c!important;text-decoration:none;font-size:10px;font-weight:800;cursor:pointer}.wl-links .proposal{border-color:#c6252b;background:#c6252b;color:#fff!important}.wl-details{display:grid;grid-template-columns:1fr 1fr;gap:9px}.wl-item{padding:10px;border-radius:8px;background:#f7f9fa}.wl-item small{display:block;color:#7b8893;font-size:9px;font-weight:900;letter-spacing:.07em;text-transform:uppercase}.wl-item strong,.wl-item span{display:block;margin-top:4px;font-size:12px;line-height:1.45}.wl-services{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}.wl-chip{padding:4px 6px;border-radius:5px;background:#edf1f4;color:#52606b;font-size:10px;font-weight:700}.wl-form{display:grid;grid-template-columns:1fr 1fr;gap:9px}.wl-form label{display:grid;gap:5px;color:#6e7b86;font-size:9px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.wl-form select,.wl-form input,.wl-form textarea{width:100%;border:1px solid #ccd4db;border-radius:7px;background:#fff;padding:9px 10px;color:#19242d;font:inherit}.wl-form textarea{grid-column:1/-1;min-height:72px;resize:vertical}.wl-form .wide{grid-column:1/-1}.wl-save{grid-column:1/-1;min-height:39px;border:0;border-radius:8px;background:#c6252b;color:#fff;font-weight:900;cursor:pointer}.wl-save:disabled{opacity:.55}.wl-empty{padding:36px;border:1px dashed #cfd7de;border-radius:12px;background:#fff;text-align:center;color:#687681}@media(max-width:1200px){.wl-stats{grid-template-columns:repeat(3,1fr)}.wl-card{grid-template-columns:1fr 1fr}.wl-card .wl-col:last-child{grid-column:1/-1;border-top:1px solid #edf0f2}.wl-col:nth-child(2){border-right:0}}@media(max-width:760px){.wl-page{padding:20px 0}.wl-head{align-items:flex-start;flex-direction:column}.wl-stats{grid-template-columns:1fr 1fr}.wl-toolbar{grid-template-columns:1fr}.wl-card{grid-template-columns:1fr}.wl-col{border-right:0;border-bottom:1px solid #edf0f2}.wl-card .wl-col:last-child{grid-column:auto;border-bottom:0}.wl-details{grid-template-columns:1fr}.wl-form{grid-template-columns:1fr}.wl-form textarea,.wl-form .wide,.wl-save{grid-column:auto}}
      `}</style>
      <div className="wl-wrap">
        <header className="wl-head">
          <div><span className="wl-kicker">Website Enquiry CRM</span><h1>Project Enquiries</h1><p>Qualify public website enquiries, schedule follow-ups, prepare WhatsApp replies and convert a qualified enquiry into a draft LAND VIEW proposal without retyping the client details.</p></div>
          <div className="wl-actions"><Link className="wl-btn" href="/admin/website-analytics">Conversion Analytics</Link><Link className="wl-btn" href="/admin/projects/website-curation">Website Curation</Link><Link className="wl-btn primary" href="/admin/proposals">Proposals</Link></div>
        </header>
        <section className="wl-stats">
          <article className="wl-stat"><small>Total</small><strong>{summary.total ?? leads.length}</strong></article><article className="wl-stat alert"><small>New</small><strong>{summary.newCount ?? 0}</strong></article><article className="wl-stat alert"><small>Overdue</small><strong>{summary.overdueFollowUps ?? 0}</strong></article><article className="wl-stat"><small>Due Today</small><strong>{summary.dueToday ?? 0}</strong></article><article className="wl-stat"><small>Qualified</small><strong>{summary.qualified ?? 0}</strong></article><article className="wl-stat"><small>Converted</small><strong>{summary.converted ?? 0}</strong></article>
        </section>
        <div className="wl-toolbar"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone, location, service, proposal or lead code"/><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option>All</option>{STATUS_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select><select value={followFilter} onChange={(e) => setFollowFilter(e.target.value)}><option>All</option><option>Overdue</option><option>Due Today</option><option>Scheduled</option></select><button className="wl-btn" onClick={() => void load()} disabled={loading}>Refresh</button></div>
        {error ? <div className="wl-error">{error}</div> : null}{message ? <div className="wl-message">{message}</div> : null}
        <section className="wl-grid">
          {loading ? <div className="wl-empty">Loading website enquiries…</div> : filtered.length ? filtered.map((lead) => {
            const draft = drafts[lead.id] || lead; const wa = whatsapp(lead.phone, lead.name, lead.lead_code); const due = dueState(lead);
            return <article className="wl-card" key={lead.id}>
              <div className="wl-col"><div className="wl-code"><strong>{lead.lead_code || "Website Lead"}</strong><span className={`wl-badge ${lead.status || "New"}`}>{lead.status || "New"}</span></div><h2>{lead.name || "Unnamed enquiry"}</h2><div className="wl-meta"><span>{formatDate(lead.created_at)}</span><span>{lead.project_location || "Location not supplied"}</span><span>Source: {lead.source_path || "/"}</span></div>{due ? <span className={`wl-follow ${due}`}>{due === "overdue" ? `OVERDUE · ${formatDate(lead.follow_up_at)}` : due === "today" ? `DUE TODAY · ${formatDate(lead.follow_up_at)}` : `FOLLOW-UP · ${formatDate(lead.follow_up_at)}`}</span> : null}<div className="wl-links">{lead.phone ? <a href={`tel:${lead.phone}`}>Call</a> : null}{wa ? <a href={wa} target="_blank" rel="noreferrer">WhatsApp Reply</a> : null}{lead.email ? <a href={`mailto:${lead.email}`}>Email</a> : null}<button className="proposal" onClick={() => void createProposal(lead)} disabled={convertingId === lead.id}>{convertingId === lead.id ? "Creating…" : lead.converted_proposal_code ? `Open ${lead.converted_proposal_code}` : "Create Draft Proposal"}</button></div></div>
              <div className="wl-col"><div className="wl-details"><div className="wl-item"><small>Project Type</small><strong>{lead.project_type || "—"}</strong></div><div className="wl-item"><small>Proposed Floors</small><strong>{lead.proposed_floors || "—"}</strong></div><div className="wl-item" style={{gridColumn:"1/-1"}}><small>Services</small><div className="wl-services">{lead.services?.length ? lead.services.map((service) => <span className="wl-chip" key={service}>{service}</span>) : <span>Not selected</span>}</div></div><div className="wl-item" style={{gridColumn:"1/-1"}}><small>Client Message</small><span>{lead.message || "No additional message."}</span></div>{lead.next_action ? <div className="wl-item" style={{gridColumn:"1/-1"}}><small>Next Action</small><strong>{lead.next_action}</strong></div> : null}{lead.converted_proposal_code ? <div className="wl-item"><small>Proposal</small><strong>{lead.converted_proposal_code}</strong></div> : null}{lead.converted_project_code ? <div className="wl-item"><small>Project</small><strong>{lead.converted_project_code}</strong></div> : null}{lead.utm_source ? <div className="wl-item" style={{gridColumn:"1/-1"}}><small>Campaign</small><span>{[lead.utm_source, lead.utm_medium, lead.utm_campaign].filter(Boolean).join(" · ")}</span></div> : null}</div></div>
              <div className="wl-col"><div className="wl-form"><label>Status<select value={draft.status || "New"} onChange={(e) => patchDraft(lead.id, { status: e.target.value })}>{STATUS_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select></label><label>Priority<select value={draft.priority || "Normal"} onChange={(e) => patchDraft(lead.id, { priority: e.target.value })}>{PRIORITY_OPTIONS.map((item) => <option key={item}>{item}</option>)}</select></label><label>Assigned To<input value={draft.assigned_to || ""} onChange={(e) => patchDraft(lead.id, { assigned_to: e.target.value })} placeholder="Employee / manager"/></label><label>Follow-up<input type="datetime-local" value={toLocalInput(draft.follow_up_at)} onChange={(e) => patchDraft(lead.id, { follow_up_at: e.target.value })}/></label><label className="wide">Next Action<input value={draft.next_action || ""} onChange={(e) => patchDraft(lead.id, { next_action: e.target.value })} placeholder="Call client, prepare proposal, request land documents…"/></label><label>Project Code<input value={draft.converted_project_code || ""} onChange={(e) => patchDraft(lead.id, { converted_project_code: e.target.value.toUpperCase() })} placeholder="LV-000"/></label><label>Proposal Code<input value={draft.converted_proposal_code || ""} onChange={(e) => patchDraft(lead.id, { converted_proposal_code: e.target.value.toUpperCase() })} placeholder="Auto-filled on conversion"/></label><textarea value={draft.admin_notes || ""} onChange={(e) => patchDraft(lead.id, { admin_notes: e.target.value })} placeholder="Follow-up notes, requirements, quotation discussion, client response…"/><button className="wl-save" onClick={() => void saveLead(lead.id)} disabled={savingId === lead.id}>{savingId === lead.id ? "Saving…" : "Save CRM Update"}</button></div></div>
            </article>;
          }) : <div className="wl-empty">No enquiries match the current filters.</div>}
        </section>
      </div>
    </main>
  );
}
