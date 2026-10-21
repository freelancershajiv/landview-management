"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Row = Record<string, any>;

const DOCUMENT_STATUSES = ["Working", "Ready", "Sent", "Approved", "Ready to Print", "Printed", "Delivered"];

async function parse(response: Response, fallback: string) {
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.success) throw new Error(String(json?.error || fallback));
  return json;
}

async function loadRegister(workflowId: string) {
  const json = await parse(await fetch(`/api/document-register?workflowId=${encodeURIComponent(workflowId)}`, { credentials: "same-origin", cache: "no-store" }), "Could not load Document Register.");
  return json.data;
}

async function postRegister(payload: Row) {
  const json = await parse(await fetch("/api/document-register", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }), "Could not update Document Register.");
  return json;
}

function money(value: unknown) {
  const n = Number(value || 0);
  return new Intl.NumberFormat("en-BD", { style: "currency", currency: "BDT", maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);
}

function dateText(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return "—";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function emptyDraft() {
  return {
    documentName: "",
    drawingNo: "",
    revisionNo: "R0",
    revisionDate: new Date().toISOString().slice(0, 10),
    paperSize: "A3",
    status: "Working",
    isRequired: true,
    printQuantity: 0,
    deliveredQuantity: 0,
    deliveredTo: "",
    deliveredBy: "",
    fileUrl: "",
    remarks: "",
  };
}

function DocumentCard({ row, workflowId, busy, onSave, onArchive }: {
  row: Row;
  workflowId: string;
  busy: string;
  onSave: (payload: Row) => Promise<void>;
  onArchive: (row: Row) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Row>({
    documentName: row.document_name || "",
    drawingNo: row.drawing_no || "",
    revisionNo: row.revision_no || "R0",
    revisionDate: row.revision_date || "",
    paperSize: row.paper_size || "",
    status: row.status || "Working",
    isRequired: row.is_required !== false,
    printQuantity: row.print_quantity ?? 0,
    deliveredQuantity: row.delivered_quantity ?? 0,
    deliveredTo: row.delivered_to || "",
    deliveredBy: row.delivered_by || "",
    fileUrl: row.file_url || "",
    remarks: row.remarks || "",
  });

  useEffect(() => {
    setDraft({
      documentName: row.document_name || "",
      drawingNo: row.drawing_no || "",
      revisionNo: row.revision_no || "R0",
      revisionDate: row.revision_date || "",
      paperSize: row.paper_size || "",
      status: row.status || "Working",
      isRequired: row.is_required !== false,
      printQuantity: row.print_quantity ?? 0,
      deliveredQuantity: row.delivered_quantity ?? 0,
      deliveredTo: row.delivered_to || "",
      deliveredBy: row.delivered_by || "",
      fileUrl: row.file_url || "",
      remarks: row.remarks || "",
    });
  }, [row]);

  const locked = busy === row.id;
  const field = (key: string, value: unknown) => setDraft((current) => ({ ...current, [key]: value }));

  return <article className="wdr-doc">
    <div className="wdr-doc-main">
      <div className="wdr-doc-name">
        <strong>{row.document_name}</strong>
        <span>{row.drawing_no || "No drawing no."} · {row.revision_no || "R0"}{row.is_required === false ? " · Previous / optional revision" : " · Required"}</span>
      </div>
      <span className={`wdr-status ${row.status === "Delivered" ? "done" : ""}`}>{row.status}</span>
      <div className="wdr-doc-mini"><span>Print</span><strong>{Number(row.print_quantity || 0)}</strong></div>
      <div className="wdr-doc-mini"><span>Delivered</span><strong>{Number(row.delivered_quantity || 0)}</strong></div>
      <div className="wdr-row-actions">
        {row.file_url && <a className="wdr-small" href={row.file_url} target="_blank" rel="noreferrer">Open File</a>}
      </div>
    </div>

    <details className="wdr-edit">
      <summary>Edit document / revision</summary>
      <div className="wdr-form-grid">
        <label><span>Document / Drawing Name</span><input value={draft.documentName} onChange={(e) => field("documentName", e.target.value)} /></label>
        <label><span>Drawing No.</span><input value={draft.drawingNo} onChange={(e) => field("drawingNo", e.target.value)} /></label>
        <label><span>Revision</span><input value={draft.revisionNo} onChange={(e) => field("revisionNo", e.target.value)} /></label>
        <label><span>Revision Date</span><input type="date" value={draft.revisionDate} onChange={(e) => field("revisionDate", e.target.value)} /></label>
        <label><span>Paper Size</span><select value={draft.paperSize} onChange={(e) => field("paperSize", e.target.value)}><option value="">—</option><option>A4</option><option>A3</option><option>A2</option><option>A1</option><option>A0</option><option>Digital</option></select></label>
        <label><span>Status</span><select value={draft.status} onChange={(e) => field("status", e.target.value)}>{DOCUMENT_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
        <label><span>Print Quantity</span><input type="number" min="0" value={draft.printQuantity} onChange={(e) => field("printQuantity", e.target.value)} /></label>
        <label><span>Delivered Quantity</span><input type="number" min="0" value={draft.deliveredQuantity} onChange={(e) => field("deliveredQuantity", e.target.value)} /></label>
        <label><span>Delivered To</span><input value={draft.deliveredTo} onChange={(e) => field("deliveredTo", e.target.value)} /></label>
        <label><span>Delivered By</span><input value={draft.deliveredBy} onChange={(e) => field("deliveredBy", e.target.value)} /></label>
        <label className="wdr-wide"><span>PDF / Drive File URL</span><input value={draft.fileUrl} onChange={(e) => field("fileUrl", e.target.value)} placeholder="https://..." /></label>
        <label className="wdr-wide"><span>Remarks</span><textarea value={draft.remarks} onChange={(e) => field("remarks", e.target.value)} /></label>
        <label className="wdr-check"><input type="checkbox" checked={Boolean(draft.isRequired)} onChange={(e) => field("isRequired", e.target.checked)} /><span>Required for service completion</span></label>
      </div>
      <div className="wdr-edit-actions">
        <button type="button" className="wdr-btn primary" disabled={locked} onClick={() => void onSave({ action: "updateDocument", workflowId, id: row.id, ...draft })}>{locked ? "Saving…" : "Save Changes"}</button>
        <button type="button" className="wdr-btn danger" disabled={locked} onClick={() => void onArchive(row)}>Archive</button>
      </div>
    </details>
  </article>;
}

export default function DocumentRegisterPage() {
  const [workflowId, setWorkflowId] = useState("");
  const [data, setData] = useState<Row>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState<Row>(emptyDraft());

  useEffect(() => { setWorkflowId(new URLSearchParams(window.location.search).get("workflowId") || ""); }, []);

  const load = useCallback(async () => {
    if (!workflowId) return;
    setLoading(true); setError("");
    try { setData(await loadRegister(workflowId)); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not load Document Register."); }
    finally { setLoading(false); }
  }, [workflowId]);

  useEffect(() => { if (workflowId) void load(); }, [workflowId, load]);

  async function run(payload: Row, busyKey: string, successMessage: string) {
    if (busy) return;
    setBusy(busyKey); setError(""); setMessage("");
    try {
      const json = await postRegister(payload);
      setData(json.data || {});
      setMessage(successMessage);
    } catch (e) { setError(e instanceof Error ? e.message : "Document Register update failed."); throw e; }
    finally { setBusy(""); }
  }

  async function initialize() {
    if (!workflowId || busy) return;
    const confirmed = window.confirm("Initialize the standard required-document checklist for this service?\n\nBecause the checklist starts at Working, a service currently marked Delivered will reopen into active workflow. Existing register history will not be deleted.");
    if (!confirmed) return;
    try { await run({ action: "initializeChecklist", workflowId }, "init", "Checklist initialized. Workflow status now follows the required documents."); } catch {}
  }

  async function createDocument() {
    if (!workflowId || busy) return;
    if (!String(draft.documentName || "").trim()) { setError("Document / drawing name is required."); return; }
    try {
      await run({ action: "createDocument", workflowId, ...draft }, "new", `${draft.documentName} added to the register.`);
      setDraft(emptyDraft()); setShowAdd(false);
    } catch {}
  }

  async function saveDocument(payload: Row) {
    try { await run(payload, String(payload.id), `${payload.documentName} updated. Service workflow was synchronized.`); } catch {}
  }

  async function archiveDocument(row: Row) {
    if (!window.confirm(`Archive ${row.document_name} ${row.revision_no || ""}?\n\nHistory stays in the database, but it will stop affecting workflow completion.`)) return;
    try { await run({ action: "archiveDocument", workflowId, id: row.id }, String(row.id), `${row.document_name} archived.`); } catch {}
  }

  const workflow = data.workflow || {};
  const stats = data.stats || {};
  const documents: Row[] = data.documents || [];
  const legacyBooks: Row[] = data.legacy?.designBooks || [];
  const legacyDrawings: Row[] = data.legacy?.drawings || [];
  const sortedDocs = useMemo(() => [...documents].sort((a, b) => {
    const aRequired = a.is_required === false ? 1 : 0;
    const bRequired = b.is_required === false ? 1 : 0;
    if (aRequired !== bRequired) return aRequired - bRequired;
    return String(a.document_name || "").localeCompare(String(b.document_name || ""));
  }), [documents]);

  if (!workflowId && !loading) return <main className="wdr-shell"><div className="wdr-empty">Open Document Register from a service in Project Operations.</div></main>;

  return <main className="wdr-shell">
    <style>{`
      .wdr-shell{max-width:1280px;margin:0 auto;color:var(--lv-text-primary)}.wdr-shell *{box-sizing:border-box}.wdr-shell input,.wdr-shell select,.wdr-shell textarea,.wdr-shell button{font:inherit}
      .wdr-top{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;margin-bottom:14px}.wdr-kicker{font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;color:var(--lv-brand-primary)}.wdr-top h2{margin:4px 0 2px;font-size:24px}.wdr-top p{margin:0;color:var(--lv-text-secondary);font-size:12px}.wdr-top-actions{display:flex;gap:8px;flex-wrap:wrap}.wdr-btn,.wdr-small{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:0 12px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);text-decoration:none;font-size:11px;font-weight:900;cursor:pointer}.wdr-btn.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}.wdr-btn.danger{color:var(--lv-danger);border-color:var(--lv-danger-border);background:var(--lv-danger-soft)}.wdr-btn:disabled{opacity:.55;cursor:not-allowed}.wdr-small{min-height:30px;padding:0 9px;font-size:10px}
      .wdr-identity{display:grid;grid-template-columns:1.2fr 1fr 1fr 1fr;gap:9px;margin-bottom:11px}.wdr-box{padding:12px 13px;border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-panel)}.wdr-box span{display:block;color:var(--lv-text-muted);font-size:10px;font-weight:850;text-transform:uppercase}.wdr-box strong{display:block;margin-top:4px;font-size:13px}.wdr-status{display:inline-flex;width:max-content;padding:5px 8px;border-radius:999px;background:var(--lv-brand-soft);color:var(--lv-brand-text);font-size:10px;font-weight:950}.wdr-status.done{background:var(--lv-success-soft);color:var(--lv-success)}
      .wdr-kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:12px}.wdr-kpi{padding:10px 11px;border:1px solid var(--lv-border-default);border-radius:9px;background:var(--lv-surface-panel)}.wdr-kpi span{display:block;font-size:9px;text-transform:uppercase;font-weight:900;color:var(--lv-text-muted)}.wdr-kpi strong{display:block;margin-top:3px;font-size:18px}.wdr-msg{margin-bottom:11px;padding:10px 12px;border-radius:8px;font-size:11px}.wdr-msg.bad{background:var(--lv-danger-soft);color:var(--lv-danger)}.wdr-msg.good{background:var(--lv-success-soft);color:var(--lv-success)}
      .wdr-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:12px 0 8px}.wdr-toolbar h3{margin:0;font-size:15px}.wdr-toolbar p{margin:2px 0 0;font-size:10px;color:var(--lv-text-muted)}.wdr-toolbar-actions{display:flex;gap:7px;flex-wrap:wrap}.wdr-init{padding:13px;border:1px dashed var(--lv-brand-border);border-radius:10px;background:var(--lv-brand-soft);margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:12px}.wdr-init strong{font-size:12px}.wdr-init p{margin:3px 0 0;font-size:10px;color:var(--lv-text-secondary)}
      .wdr-docs{display:grid;gap:8px}.wdr-doc{border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-panel);overflow:hidden}.wdr-doc-main{display:grid;grid-template-columns:minmax(230px,1fr) 120px 80px 85px auto;gap:10px;align-items:center;padding:11px 12px}.wdr-doc-name strong{display:block;font-size:12px}.wdr-doc-name span{display:block;margin-top:3px;font-size:10px;color:var(--lv-text-muted)}.wdr-doc-mini span{display:block;font-size:9px;color:var(--lv-text-muted);text-transform:uppercase}.wdr-doc-mini strong{display:block;margin-top:2px;font-size:12px}.wdr-row-actions{display:flex;justify-content:flex-end}.wdr-edit{border-top:1px solid var(--lv-border-subtle);background:var(--lv-surface-muted)}.wdr-edit>summary{padding:9px 12px;cursor:pointer;font-size:10px;font-weight:900;list-style:none}.wdr-form-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;padding:4px 12px 12px}.wdr-form-grid label{display:block}.wdr-form-grid label>span{display:block;margin-bottom:4px;font-size:9px;font-weight:850;color:var(--lv-text-secondary)}.wdr-form-grid input,.wdr-form-grid select,.wdr-form-grid textarea{width:100%;min-height:36px;padding:7px 9px;border:1px solid var(--lv-border-default);border-radius:7px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:11px}.wdr-form-grid textarea{min-height:66px;resize:vertical}.wdr-wide{grid-column:span 2}.wdr-check{display:flex!important;align-items:center;gap:8px;grid-column:span 2}.wdr-check input{width:16px!important;min-height:auto!important}.wdr-check span{margin:0!important}.wdr-edit-actions{display:flex;gap:8px;padding:0 12px 12px}
      .wdr-add{padding:12px;border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-panel);margin-bottom:10px}.wdr-add h4{margin:0 0 9px;font-size:13px}.wdr-empty{padding:32px;text-align:center;border:1px dashed var(--lv-border-default);border-radius:10px;color:var(--lv-text-muted);font-size:12px}.wdr-legacy{margin-top:14px;border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-panel);overflow:hidden}.wdr-legacy>summary{padding:11px 13px;cursor:pointer;font-size:11px;font-weight:900}.wdr-legacy-list{border-top:1px solid var(--lv-border-subtle)}.wdr-legacy-row{display:grid;grid-template-columns:140px 1fr 130px 150px;gap:10px;padding:9px 12px;border-bottom:1px solid var(--lv-border-subtle);font-size:10px}.wdr-legacy-row:last-child{border-bottom:0}.wdr-legacy-row strong{font-size:11px}.wdr-legacy-row span{color:var(--lv-text-muted)}
      @media(max-width:900px){.wdr-identity{grid-template-columns:1fr 1fr}.wdr-kpis{grid-template-columns:repeat(3,1fr)}.wdr-doc-main{grid-template-columns:1fr 110px 70px 70px}.wdr-row-actions{grid-column:1/-1;justify-content:flex-start}.wdr-form-grid{grid-template-columns:1fr 1fr}}@media(max-width:600px){.wdr-top{flex-direction:column}.wdr-identity,.wdr-kpis,.wdr-form-grid{grid-template-columns:1fr}.wdr-wide,.wdr-check{grid-column:auto}.wdr-doc-main{grid-template-columns:1fr 1fr}.wdr-doc-name{grid-column:1/-1}.wdr-legacy-row{grid-template-columns:1fr 1fr}.wdr-toolbar,.wdr-init{align-items:flex-start;flex-direction:column}}
    `}</style>

    <header className="wdr-top">
      <div>
        <div className="wdr-kicker">Workflow Document Register</div>
        <h2>{workflow.projectId || "Service"} · {workflow.serviceName || "Documents"}</h2>
        <p>{workflow.ownerName || ""}{workflow.story ? ` · ${workflow.story}` : ""}{workflow.location ? ` · ${workflow.location}` : ""}</p>
      </div>
      <div className="wdr-top-actions"><Link className="wdr-btn" href="/admin/project-operations/by-project">← By Project</Link><Link className="wdr-btn" href="/admin/project-operations/by-service">By Service</Link>{workflow.projectId && <Link className="wdr-btn primary" href={`/admin/projects/${encodeURIComponent(workflow.projectId)}`}>Open Project</Link>}</div>
    </header>

    {loading ? <div className="wdr-empty">Loading Document Register…</div> : error && !workflow.id ? <div className="wdr-msg bad">{error}</div> : <>
      <section className="wdr-identity">
        <div className="wdr-box"><span>Service</span><strong>{workflow.serviceName || "—"}</strong></div>
        <div className="wdr-box"><span>Workflow Status</span><strong><span className={`wdr-status ${workflow.status === "Delivered" || workflow.status === "Delivered to Client" ? "done" : ""}`}>{workflow.status || "—"}</span></strong></div>
        <div className="wdr-box"><span>Paid / Net</span><strong>{money(workflow.paidAmount)} / {money(workflow.netAmount)}</strong></div>
        <div className="wdr-box"><span>Required Deliverables</span><strong>{stats.required || 0}</strong></div>
      </section>

      <section className="wdr-kpis">
        <div className="wdr-kpi"><span>Documents</span><strong>{stats.total || 0}</strong></div>
        <div className="wdr-kpi"><span>Approved+</span><strong>{stats.approved || 0}</strong></div>
        <div className="wdr-kpi"><span>Ready to Print+</span><strong>{stats.readyToPrint || 0}</strong></div>
        <div className="wdr-kpi"><span>Printed+</span><strong>{stats.printed || 0}</strong></div>
        <div className="wdr-kpi"><span>Delivered</span><strong>{stats.delivered || 0}</strong></div>
        <div className="wdr-kpi"><span>Pending Required</span><strong>{stats.pending || 0}</strong></div>
      </section>

      {error && <div className="wdr-msg bad">{error}</div>}{message && <div className="wdr-msg good">{message}</div>}

      {!documents.length && (data.templates || []).length > 0 && <div className="wdr-init"><div><strong>Standard checklist is available for {workflow.serviceName}.</strong><p>Initialize it only when you are ready to reopen/manage this service. Existing legacy register records remain untouched.</p></div><button type="button" className="wdr-btn primary" disabled={busy === "init"} onClick={() => void initialize()}>{busy === "init" ? "Initializing…" : `Initialize ${(data.templates || []).length} Items`}</button></div>}

      <div className="wdr-toolbar"><div><h3>Current Deliverables & Revisions</h3><p>Only required current revisions control the service workflow. Older revisions remain as history.</p></div><div className="wdr-toolbar-actions"><button type="button" className="wdr-btn primary" onClick={() => setShowAdd((value) => !value)}>{showAdd ? "Close Form" : "+ Add Document / Revision"}</button></div></div>

      {showAdd && <section className="wdr-add">
        <h4>Add a new deliverable or revision</h4>
        <div className="wdr-form-grid">
          <label><span>Document / Drawing Name</span><input value={draft.documentName} onChange={(e) => setDraft({ ...draft, documentName: e.target.value })} placeholder="e.g. Ground Floor Plan" /></label>
          <label><span>Drawing No.</span><input value={draft.drawingNo} onChange={(e) => setDraft({ ...draft, drawingNo: e.target.value })} placeholder="A-101" /></label>
          <label><span>Revision</span><input value={draft.revisionNo} onChange={(e) => setDraft({ ...draft, revisionNo: e.target.value })} /></label>
          <label><span>Revision Date</span><input type="date" value={draft.revisionDate} onChange={(e) => setDraft({ ...draft, revisionDate: e.target.value })} /></label>
          <label><span>Paper Size</span><select value={draft.paperSize} onChange={(e) => setDraft({ ...draft, paperSize: e.target.value })}><option>A4</option><option>A3</option><option>A2</option><option>A1</option><option>A0</option><option>Digital</option></select></label>
          <label><span>Status</span><select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}>{DOCUMENT_STATUSES.map((status) => <option key={status}>{status}</option>)}</select></label>
          <label><span>Print Quantity</span><input type="number" min="0" value={draft.printQuantity} onChange={(e) => setDraft({ ...draft, printQuantity: e.target.value })} /></label>
          <label><span>Delivered Quantity</span><input type="number" min="0" value={draft.deliveredQuantity} onChange={(e) => setDraft({ ...draft, deliveredQuantity: e.target.value })} /></label>
          <label className="wdr-wide"><span>PDF / Drive File URL</span><input value={draft.fileUrl} onChange={(e) => setDraft({ ...draft, fileUrl: e.target.value })} placeholder="https://..." /></label>
          <label className="wdr-wide"><span>Remarks</span><textarea value={draft.remarks} onChange={(e) => setDraft({ ...draft, remarks: e.target.value })} /></label>
          <label className="wdr-check"><input type="checkbox" checked={Boolean(draft.isRequired)} onChange={(e) => setDraft({ ...draft, isRequired: e.target.checked })} /><span>Required for service completion</span></label>
        </div>
        <button type="button" className="wdr-btn primary" disabled={busy === "new"} onClick={() => void createDocument()}>{busy === "new" ? "Adding…" : "Add to Register"}</button>
      </section>}

      {sortedDocs.length ? <section className="wdr-docs">{sortedDocs.map((row) => <DocumentCard key={row.id} row={row} workflowId={workflowId} busy={busy} onSave={saveDocument} onArchive={archiveDocument} />)}</section> : <div className="wdr-empty">No workflow deliverables have been added yet.</div>}

      {(legacyBooks.length > 0 || legacyDrawings.length > 0) && <details className="wdr-legacy">
        <summary>Existing Register History · {legacyBooks.length + legacyDrawings.length} matching record{legacyBooks.length + legacyDrawings.length === 1 ? "" : "s"}</summary>
        <div className="wdr-legacy-list">
          {legacyDrawings.map((row) => <div className="wdr-legacy-row" key={`D-${row.drawing_code}`}><span>Drawing Submission</span><strong>{row.drawing_title || row.drawing_code}</strong><span>{row.revision || "Revision —"}</span><span>{row.status || "Status —"}</span></div>)}
          {legacyBooks.map((row) => <div className="wdr-legacy-row" key={`B-${row.id}`}><span>Design Book</span><strong>{row.book_type || row.book_code}</strong><span>{row.revision || "Revision —"}</span><span>{row.delivery_status || row.printing_status || row.preparation_status}</span></div>)}
        </div>
      </details>}
    </>}
  </main>;
}
