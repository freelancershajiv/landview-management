"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Entry = {
  id: string; code: string; projectId: string; requirementKey: string; name: string;
  identityType: string; owner: string; receivedFrom: string; receivedBy: string;
  receivedDate: string; form: string; quantity: number; location: string;
  reference: string; collectionStatus: string; verificationStatus: string;
  verificationNotes: string; verifiedAt: string; returnStatus: string;
  returnedTo: string; returnedDate: string; returnedBy: string; remarks: string;
};
type Event = { id: string; registerId: string; action: string; actor: string; date: string };
type Registry = {
  projectCode: string; records: Entry[]; events: Event[];
  historyAvailable: boolean; migrationReady: boolean; writeEnabled: boolean;
  writeBlockReason: string;
};
type Kind = "photo" | "identity" | "ownership" | "khotian" | "tax";
const REQUIREMENTS: { key: Kind; name: string }[] = [
  { key: "photo", name: "Photo" },
  { key: "identity", name: "NID / Passport / Birth Certificate" },
  { key: "ownership", name: "Ownership Registry Paper" },
  { key: "khotian", name: "Khotian" },
  { key: "tax", name: "Land Tax Slip" },
];
const FORMATS = ["Original", "Copy", "Digital"];
const identityTypes = ["NID", "Passport", "Birth Certificate"];
function todayInDhaka(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (name: string) => parts.find((part) => part.type === name)?.value || "";
  return get("year") + "-" + get("month") + "-" + get("day");
}
function defaultDraft() {
  return {
    requirementKey: "photo" as Kind, identityType: "NID", ownerName: "",
    form: "Copy", quantity: 1, receivedFrom: "", receivedDate: todayInDhaka(),
    storageLocation: "", documentReference: "", remarks: "",
  };
}
function categoryOf(entry: Entry): Kind | "" {
  const source = (entry.requirementKey || "").toLowerCase();
  if (REQUIREMENTS.some((item) => item.key === source)) return source as Kind;
  const name = entry.name.toLowerCase();
  if (/photo|photograph/.test(name)) return "photo";
  if (/nid|passport|birth certificate|identity|national id/.test(name)) return "identity";
  if (/ownership|registry|land deed/.test(name)) return "ownership";
  if (/khotian|khatian/.test(name)) return "khotian";
  if (/land tax|tax slip|tax receipt|dakhila/.test(name)) return "tax";
  return "";
}
function formatDate(value: string) { return value ? value.slice(0, 10) : "—"; }
function statusClass(status: string) {
  if (/verified|received|returned/i.test(status)) return "good";
  if (/reject|missing|not recorded/i.test(status)) return "bad";
  return "warn";
}
function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || "");
}
function printReceipt(project: string, record: Entry, mode: "receive" | "return") {
  const isReturn = mode === "return";
  const rows: Array<[string, unknown]> = [
    ["Project", project], ["Register ID", record.code],
    ["Document", record.name], ["Identity type", record.identityType],
    ["Owner", record.owner], ["Form", record.form], ["Quantity", record.quantity],
    ["Received from", record.receivedFrom], ["Received by", record.receivedBy],
    ["Received on", record.receivedDate],
    ...(isReturn ? [
      ["Returned to", record.returnedTo], ["Returned on", record.returnedDate],
      ["Returned by", record.returnedBy],
    ] as Array<[string,unknown]> : [
      ["Office custody", record.returnStatus], ["Storage location", record.location],
    ] as Array<[string,unknown]>),
  ];
  const paper = window.open("", "_blank", "width=780,height=800");
  if (!paper) return false;
  paper.document.open();
  paper.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <title>LAND VIEW — ${isReturn ? "Document Return Receipt" : "Document Receiving Receipt"}</title>
  <style>body{font:14px Arial,sans-serif;max-width:720px;margin:38px auto;color:#222}
  h1{font-size:22px;margin:0;color:#ca382e}h2{font-size:17px;margin-top:8px}
  p{font-size:12px;color:#666}table{width:100%;border-collapse:collapse;margin-top:22px}
  td{border-bottom:1px solid #ddd;padding:10px}td:first-child{width:34%;color:#555}
  .sign{display:flex;justify-content:space-between;gap:60px;margin-top:90px}
  .sign>div{flex:1;border-top:1px solid #333;padding-top:8px;font-size:12px}
  @page{size:A4 portrait;margin:18mm}</style></head><body>
  <h1>LAND VIEW</h1><p>Architects & Engineers · Internal Project Documents</p>
  <h2>${isReturn ? "Document Return / Handover Receipt" : "Client Document Receiving Receipt"}</h2>
  <table>${rows.filter((row) => row[1] !== "" && row[1] !== null && row[1] !== undefined).map((row) =>
    "<tr><td>" + escapeHtml(row[0]) + "</td><td>" + escapeHtml(row[1]) + "</td></tr>"
  ).join("")}</table>
  <p>Receipt generated from the project register. Physical handover requires the relevant signatures.</p>
  <div class="sign"><div>LAND VIEW authorized signature</div><div>Client / recipient signature</div></div>
  <script>window.addEventListener('load',function(){window.print()})<\/script></body></html>`);
  paper.document.close();
  return true;
}

export default function ProjectClientDocumentRegistry({
  projectCode, onChanged,
}: { projectCode: string; onChanged?: () => void }) {
  const [registry, setRegistry] = useState<Registry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [view, setView] = useState<"requirements" | "received" | "history">("requirements");
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState(defaultDraft);
  const [activeId, setActiveId] = useState("");
  const [action, setAction] = useState<"verify" | "reject" | "return">("verify");
  const [notes, setNotes] = useState("");
  const [returnTo, setReturnTo] = useState("");
  const [returnDate, setReturnDate] = useState(todayInDhaka);
  const requestKey = useRef("");

  const load = useCallback(async () => {
    const response = await fetch("/api/admin/projects/client-documents?projectId=" + encodeURIComponent(projectCode), {
      cache: "no-store", credentials: "same-origin",
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || !result?.success) throw new Error(String(result?.error || "Document register is unavailable."));
    return result.data as Registry;
  }, [projectCode]);

  useEffect(() => {
    let mounted = true;
    load().then((value) => { if (mounted) setRegistry(value); })
      .catch((cause: unknown) => { if (mounted) setError(cause instanceof Error ? cause.message : "Could not load document records."); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, [load]);

  async function submit(payload: Record<string, unknown>, success: string) {
    if (!registry?.writeEnabled || saving) return;
    setSaving(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/admin/projects/client-documents", {
        method: "POST", headers: { "Content-Type": "application/json" },
        credentials: "same-origin", cache: "no-store",
        body: JSON.stringify({ projectId: projectCode, ...payload }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) throw new Error(String(data?.error || "Document action failed."));
      setRegistry(await load());
      setMessage(success);
      setShowForm(false); setActiveId(""); setNotes("");
      if (payload.action === "receive") { setDraft(defaultDraft()); requestKey.current = ""; }
      onChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Document action could not be completed.");
    } finally { setSaving(false); }
  }

  const records = registry?.projectCode === projectCode ? registry.records : [];
  const verified = REQUIREMENTS.filter(({key}) => records.some(
    (record) => categoryOf(record) === key && record.verificationStatus === "Verified" &&
      record.collectionStatus !== "Returned",
  )).length;
  const recorded = REQUIREMENTS.filter(({key}) => records.some((record) =>
    categoryOf(record) === key && ["Received", "Partial"].includes(record.collectionStatus)
  )).length;
  const active = records.find((record) => record.id === activeId);

  return <div className="lv4-doc-workspace">
    <style>{`
      .lv4-doc-workspace{display:grid;gap:13px}
      .lv4-doc-banner{background:var(--lv-surface-muted);border:1px solid var(--lv-border-default);border-radius:10px;padding:13px;display:grid;gap:3px;font-size:12px}
      .lv4-doc-banner strong{color:var(--lv-text-strong);font-size:13px}
      .lv4-doc-steps{display:flex;gap:7px;flex-wrap:wrap;align-items:center}
      .lv4-doc-steps button{padding:8px 12px;border-radius:8px;border:1px solid var(--lv-border-default);background:var(--lv-surface-muted);color:var(--lv-text-primary);font-weight:700;cursor:pointer}
      .lv4-doc-steps button[aria-pressed="true"]{background:var(--lv-brand-primary);color:var(--lv-text-inverse)}
      .lv4-doc-list-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:13px;border-radius:10px;border:1px solid var(--lv-border-subtle)}
      .lv4-doc-list-row strong{font-size:12px}
      .lv4-doc-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .lv4-doc-form label{display:grid;gap:5px;font-size:11px;font-weight:750;color:var(--lv-text-secondary)}
      .lv4-doc-form input,.lv4-doc-form select,.lv4-doc-form textarea{width:100%;padding:10px;border-radius:8px;border:1px solid var(--lv-border-default);background:var(--lv-surface-input);color:var(--lv-text-primary);font:inherit;font-size:12px}
      .lv4-doc-form textarea{min-height:68px}
      .lv4-doc-form .full{grid-column:1/-1}
      .lv4-doc-actions{display:flex;flex-wrap:wrap;gap:8px}
      .lv4-doc-actions button{padding:8px 10px;border:1px solid var(--lv-border-default);background:var(--lv-surface-muted);color:var(--lv-text-primary);border-radius:8px;font-size:11px;font-weight:700;cursor:pointer}
      .lv4-doc-actions button:disabled{opacity:.45;cursor:not-allowed}
      .lv4-doc-actions button.primary{color:var(--lv-text-inverse);background:var(--lv-brand-primary)}
      .lv4-doc-message{background:var(--lv-success-soft);padding:10px;border-radius:8px;color:var(--lv-success);font-size:12px}
      .lv4-doc-error{background:var(--lv-danger-soft);padding:10px;border-radius:8px;color:var(--lv-danger);font-size:12px}
      @media(max-width:650px){.lv4-doc-form{grid-template-columns:1fr}}
    `}</style>
    <div className="lv4-section-head"><h2>Project-Wide Client Document Registry</h2><span className="lv4-chip">{verified}/5 verified</span></div>
    <div className="lv4-doc-banner">
      <strong>One permanent registry for {projectCode}</strong>
      <span>Photo · Identity document · Ownership Registry Paper · Khotian · Land Tax Slip. Multiple owners and multiple copies are supported.</span>
      <span>Client receiving, verification and original-document returns are separate from design deliverables.</span>
    </div>
    {error && <div className="lv4-doc-error" role="alert">{error}</div>}
    {message && <div className="lv4-doc-message" role="status">{message}</div>}
    {(loading || !registry || registry.projectCode !== projectCode) && !error && <div className="lv4-panel">Loading existing client document records…</div>}
    {registry?.projectCode === projectCode && <>
      {!registry.writeEnabled && <div className="lv4-doc-banner">
        <strong>Development preview — document changes locked</strong>
        <span>{registry.writeBlockReason || "Editing is disabled until the safe release gates pass."}</span>
        <span>Read-only receiving records and printable historical receipts remain available.</span>
      </div>}
      <div className="lv4-doc-steps" aria-label="Document registry views">
        <button type="button" aria-pressed={view === "requirements"} onClick={() => setView("requirements")}>Requirements (5)</button>
        <button type="button" aria-pressed={view === "received"} onClick={() => setView("received")}>Receiving & Returns ({records.length})</button>
        <button type="button" aria-pressed={view === "history"} onClick={() => setView("history")}>Custody History</button>
        <button type="button" disabled={!registry.writeEnabled} className="lv4-button" onClick={() => { setShowForm(true); setView("received"); }}>+ Receive document</button>
      </div>
      <div className="lv4-grid">
        <div className="lv4-panel"><h3>Received categories</h3><div className="lv4-stat-value">{recorded} / 5</div>
          <div className="lv4-progress"><span style={{width: recorded/5*100+"%"}}/></div>
          <p className="lv4-quiet">On record, regardless of verification.</p></div>
        <div className="lv4-panel"><h3>Verified categories</h3><div className="lv4-stat-value">{verified} / 5</div>
          <div className="lv4-progress"><span style={{width: verified/5*100+"%"}}/></div>
          <p className="lv4-quiet">Only formally verified items count. Returned originals are excluded.</p></div>
      </div>
      {view === "requirements" && <section className="lv4-panel">
        <h3>Required document checklist</h3>
        <div className="lv4-doc-list">{REQUIREMENTS.map(({key,name},index) => {
          const matches = records.filter((row) => categoryOf(row) === key);
          const verifiedCopy = matches.some((row) => row.verificationStatus === "Verified" && row.collectionStatus !== "Returned");
          const receivedCopy = matches.some((row) => ["Received","Partial"].includes(row.collectionStatus));
          const status = verifiedCopy ? "Verified" : receivedCopy ? "Awaiting verification" : matches.length ? "Returned / not available" : "Missing";
          return <div className="lv4-doc-list-row" key={key}><div>
            <strong>{String(index + 1).padStart(2,"0")}. {name}</strong>
            <div className="lv4-quiet">{matches.length} registered copy/copies · {matches.filter((row) => row.returnStatus === "Returned").length} returned</div>
          </div><span className={"lv4-chip "+statusClass(status)}>{status}</span></div>;
        })}</div>
        <p className="lv4-muted">This is the standard checklist. Actual service requirements may be different; a missing document must not block unrelated services.</p>
      </section>}
      {view === "received" && <>
        {showForm && <section className="lv4-panel"><h3>Receive client document</h3>
          <form onSubmit={(event) => {
            event.preventDefault();
            if (!registry.writeEnabled) return;
            if (!requestKey.current) requestKey.current = crypto.randomUUID();
            void submit({action:"receive",...draft,requestKey:requestKey.current},"Document received and registered.");
          }}>
            <div className="lv4-doc-form">
              <label>Requirement<select value={draft.requirementKey} onChange={(e) => setDraft((v)=>({...v,requirementKey:e.target.value as Kind}))}>{REQUIREMENTS.map((d)=><option key={d.key} value={d.key}>{d.name}</option>)}</select></label>
              {draft.requirementKey === "identity" && <label>Accepted identity type<select value={draft.identityType} onChange={(e)=>setDraft((v)=>({...v,identityType:e.target.value}))}>{identityTypes.map((v)=><option key={v}>{v}</option>)}</select></label>}
              <label>Owner / landowner name<input value={draft.ownerName} onChange={(e)=>setDraft((v)=>({...v,ownerName:e.target.value}))} maxLength={150}/></label>
              <label>Document form<select value={draft.form} onChange={(e)=>setDraft((v)=>({...v,form:e.target.value}))}>{FORMATS.map((v)=><option key={v}>{v}</option>)}</select></label>
              <label>Quantity<input required type="number" min={1} max={100} value={draft.quantity} onChange={(e)=>setDraft((v)=>({...v,quantity:Number(e.target.value)}))}/></label>
              <label>Received from<input required maxLength={150} value={draft.receivedFrom} onChange={(e)=>setDraft((v)=>({...v,receivedFrom:e.target.value}))}/></label>
              <label>Received date<input required type="date" value={draft.receivedDate} onChange={(e)=>setDraft((v)=>({...v,receivedDate:e.target.value}))}/></label>
              <label>Physical storage location<input maxLength={160} value={draft.storageLocation} onChange={(e)=>setDraft((v)=>({...v,storageLocation:e.target.value}))} placeholder="Rack A / File LV-..."/></label>
              <label>Document reference (optional)<input maxLength={120} value={draft.documentReference} onChange={(e)=>setDraft((v)=>({...v,documentReference:e.target.value}))}/></label>
              <label className="full">Remarks<textarea value={draft.remarks} onChange={(e)=>setDraft((v)=>({...v,remarks:e.target.value}))}/></label>
            </div>
            <p className="lv4-muted">Do not enter NID/passport numbers here. Private scanned-file upload will require a separately secured storage flow.</p>
            <div className="lv4-doc-actions">
              <button type="submit" className="primary" disabled={!registry.writeEnabled || saving}>{saving?"Saving…":"Save receiving record"}</button>
              <button type="button" onClick={()=>setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </section>}
        <section className="lv4-panel"><h3>Document receiving and custody</h3>
          {!records.length && <div className="lv4-empty">No receiving entries yet. All five requirements remain available on the checklist.</div>}
          <div className="lv4-doc-list">{records.map((entry) => <div key={entry.id} className="lv4-doc-list-row">
            <div><strong>{entry.name} {entry.identityType && entry.name.includes("NID /") ? "— " + entry.identityType : ""}</strong>
              <div className="lv4-quiet">{entry.code} · {entry.owner || "Owner not specified"} · {entry.form} × {entry.quantity} · {formatDate(entry.receivedDate)}</div>
              <div className="lv4-quiet">Received from: {entry.receivedFrom || "Not recorded"} · Custody: {entry.returnStatus}</div>
              <div className="lv4-doc-actions" style={{marginTop:8}}>
                <button type="button" onClick={()=>{ if(!printReceipt(projectCode,entry,"receive"))setError("Print popup was blocked.");}}>Print receiving receipt</button>
                {entry.returnStatus === "Returned" && <button type="button" onClick={()=>{if(!printReceipt(projectCode,entry,"return"))setError("Print popup was blocked.");}}>Print return receipt</button>}
                {registry.writeEnabled && entry.collectionStatus === "Received" && entry.returnStatus !== "Returned" && <>
                  <button type="button" onClick={()=>{setActiveId(entry.id);setAction("verify");setNotes("");}}>Verify</button>
                  <button type="button" onClick={()=>{setActiveId(entry.id);setAction("reject");setNotes("");}}>Reject</button>
                  {entry.returnStatus === "Held by LAND VIEW" && <button type="button" onClick={()=>{setActiveId(entry.id);setAction("return");setReturnTo("");}}>Return original</button>}
                </>}
              </div>
            </div>
            <span className={"lv4-chip "+statusClass(entry.verificationStatus)}>{entry.verificationStatus || "Unverified"}</span>
          </div>)}</div>
        </section>
        {active && registry.writeEnabled && <section className="lv4-panel">
          <h3>{action === "return" ? "Return physical document" : action === "verify" ? "Verify received document" : "Reject / request correction"}</h3>
          <p className="lv4-muted">{active.code} · {active.name}</p>
          <form onSubmit={(event)=>{
            event.preventDefault();
            if(!window.confirm("Record this document action in the project audit history?"))return;
            void submit({
              action,registerId:active.id,
              ...(action === "return" ? {returnedTo:returnTo,returnedDate:returnDate} : {notes}),
            },action === "return" ? "Original returned; handover receipt available." : action === "verify" ? "Document verified." : "Document rejected with correction notes.");
          }}>
            <div className="lv4-doc-form">
              {action === "return" ? <>
                <label>Returned to<input required maxLength={150} value={returnTo} onChange={(e)=>setReturnTo(e.target.value)}/></label>
                <label>Return date<input required type="date" value={returnDate} onChange={(e)=>setReturnDate(e.target.value)}/></label>
              </> : <label className="full">Verification / rejection notes<textarea required={action==="reject"} value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder={action==="reject"?"State what needs correction":"Optional verification notes"}/></label>}
            </div>
            <div className="lv4-doc-actions"><button className="primary" type="submit" disabled={saving}>{saving?"Saving…":"Confirm " + action}</button><button type="button" onClick={()=>setActiveId("")}>Cancel</button></div>
          </form>
        </section>}
      </>}
      {view === "history" && <section className="lv4-panel"><h3>Document custody and verification history</h3>
        {!registry.historyAvailable && <p className="lv4-muted">Append-only custody history will become available after the additive schema and gateway changes are verified. Existing receiving and return fields remain accessible.</p>}
        {registry.historyAvailable && !registry.events.length && <div className="lv4-empty">No recorded custody events yet. Old receipts are preserved without invented history.</div>}
        <div className="lv4-doc-list">{registry.events.map((event) => {
          const entry = records.find((record)=>record.id===event.registerId);
          return <div key={event.id} className="lv4-doc-list-row"><div>
            <strong>{event.action.toUpperCase()} · {entry?.name||event.registerId}</strong>
            <div className="lv4-quiet">{formatDate(event.date)} · By {event.actor||"System"}</div>
          </div><span className="lv4-chip">{entry?.code||""}</span></div>;
        })}</div>
      </section>}
    </>}
  </div>;
}
