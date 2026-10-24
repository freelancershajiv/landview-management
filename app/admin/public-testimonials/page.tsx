"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Testimonial = {
  id?: string;
  client_name: string;
  client_role: string;
  project_code: string;
  location: string;
  service_label: string;
  quote: string;
  published: boolean;
  featured: boolean;
  display_order: number;
};

const emptyTestimonial = (): Testimonial => ({
  client_name: "",
  client_role: "",
  project_code: "",
  location: "",
  service_label: "",
  quote: "",
  published: false,
  featured: false,
  display_order: 0,
});

const css = `
.testimonial-admin{padding:28px;max-width:1320px;margin:0 auto}.testimonial-admin *{box-sizing:border-box}.ta-head{display:flex;align-items:flex-end;justify-content:space-between;gap:22px;margin-bottom:24px}.ta-head h1{margin:4px 0 0;font-size:30px}.ta-kicker{font-size:11px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--lv-brand-text,#ef4a50)}.ta-head p{margin:8px 0 0;max-width:680px;color:var(--lv-text-muted,#7a8791);line-height:1.6}.ta-link{font-size:12px;font-weight:800}.ta-layout{display:grid;grid-template-columns:minmax(300px,.72fr) minmax(0,1.28fr);gap:20px}.ta-panel{border:1px solid var(--lv-border,#d9dee3);border-radius:12px;background:var(--lv-surface,#fff);overflow:hidden}.ta-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px;border-bottom:1px solid var(--lv-border,#d9dee3)}.ta-toolbar strong{font-size:14px}.ta-button{min-height:38px;padding:0 14px;border:1px solid var(--lv-brand-primary,#d61f26);border-radius:7px;background:var(--lv-brand-primary,#d61f26);color:#fff;font-weight:800;cursor:pointer}.ta-button.secondary{background:transparent;color:var(--lv-brand-primary,#d61f26)}.ta-button.danger{background:transparent;border-color:#b42318;color:#b42318}.ta-list{display:grid;max-height:690px;overflow:auto}.ta-row{padding:15px 16px;border:0;border-bottom:1px solid var(--lv-border,#e4e7ea);background:transparent;text-align:left;cursor:pointer;color:inherit}.ta-row:hover,.ta-row.active{background:var(--lv-brand-soft,rgba(214,31,38,.06))}.ta-row strong,.ta-row span{display:block}.ta-row strong{font-size:14px}.ta-row span{margin-top:5px;color:var(--lv-text-muted,#71808b);font-size:11px}.ta-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.ta-badge{display:inline-flex!important;padding:3px 7px;border-radius:999px;border:1px solid var(--lv-border,#d9dee3);font-size:10px!important;font-weight:800!important}.ta-badge.live{border-color:#14804a;color:#14804a}.ta-badge.featured{border-color:var(--lv-brand-primary,#d61f26);color:var(--lv-brand-primary,#d61f26)}.ta-form{padding:20px}.ta-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.ta-field{display:grid;gap:7px}.ta-field.full{grid-column:1/-1}.ta-field label{font-size:11px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:var(--lv-text-muted,#71808b)}.ta-field input,.ta-field textarea{width:100%;border:1px solid var(--lv-border,#ccd3d9);border-radius:7px;background:var(--lv-input-bg,#fff);color:inherit;padding:10px 11px;font:inherit}.ta-field textarea{min-height:150px;resize:vertical;line-height:1.6}.ta-checks{display:flex;gap:18px;flex-wrap:wrap;padding:14px 0}.ta-checks label{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700}.ta-actions{display:flex;gap:10px;align-items:center;padding-top:10px;border-top:1px solid var(--lv-border,#e1e5e8)}.ta-status{margin-left:auto;font-size:12px;color:var(--lv-text-muted,#71808b)}.ta-error{padding:12px 14px;margin-bottom:16px;border:1px solid #d92d20;border-radius:7px;color:#b42318;background:rgba(217,45,32,.06)}.ta-empty{padding:28px;color:var(--lv-text-muted,#71808b);text-align:center}.ta-note{padding:14px 16px;border-top:1px solid var(--lv-border,#e1e5e8);color:var(--lv-text-muted,#71808b);font-size:12px;line-height:1.6}@media(max-width:900px){.testimonial-admin{padding:18px 14px}.ta-head{align-items:flex-start;flex-direction:column}.ta-layout{grid-template-columns:1fr}.ta-list{max-height:360px}.ta-grid{grid-template-columns:1fr}.ta-field.full{grid-column:auto}}`;

function payload(row: Testimonial) {
  return {
    id: row.id,
    clientName: row.client_name,
    clientRole: row.client_role,
    projectCode: row.project_code,
    location: row.location,
    serviceLabel: row.service_label,
    quote: row.quote,
    published: row.published,
    featured: row.featured,
    displayOrder: row.display_order,
  };
}

export default function PublicTestimonialsAdminPage() {
  const [rows, setRows] = useState<Testimonial[]>([]);
  const [draft, setDraft] = useState<Testimonial>(emptyTestimonial());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load(preferId?: string) {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin/website-testimonials", { credentials: "same-origin", cache: "no-store" });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not load testimonials."));
      const next = (Array.isArray(json.data) ? json.data : []) as Testimonial[];
      setRows(next);
      if (preferId) setDraft({ ...(next.find((item) => item.id === preferId) || emptyTestimonial()) });
      else if (draft.id) setDraft({ ...(next.find((item) => item.id === draft.id) || emptyTestimonial()) });
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load testimonials."); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);
  const published = useMemo(() => rows.filter((row) => row.published).length, [rows]);

  function patch(changes: Partial<Testimonial>) { setDraft((current) => ({ ...current, ...changes })); setMessage(""); }
  function startNew() { setDraft(emptyTestimonial()); setError(""); setMessage(""); }

  async function save() {
    if (saving) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/website-testimonials", {
        method: draft.id ? "PATCH" : "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload(draft)),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not save testimonial."));
      const id = String(json.data?.id || draft.id || "");
      setMessage(draft.id ? "Testimonial updated." : "Testimonial created.");
      await load(id);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not save testimonial."); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!draft.id || saving || !window.confirm("Delete this testimonial permanently?")) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/website-testimonials", {
        method: "DELETE", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: draft.id }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not delete testimonial."));
      setDraft(emptyTestimonial()); setMessage("Testimonial deleted."); await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not delete testimonial."); }
    finally { setSaving(false); }
  }

  return <div className="testimonial-admin">
    <style dangerouslySetInnerHTML={{ __html: css }} />
    <header className="ta-head"><div><span className="ta-kicker">PUBLIC WEBSITE · CLIENT FEEDBACK</span><h1>Testimonials</h1><p>Add genuine client feedback here. Nothing appears publicly until <strong>Published</strong> is enabled, and the public case-studies page never invents missing reviews.</p></div><Link className="ta-link" href="/case-studies" target="_blank">Open public Case Studies ↗</Link></header>
    {error ? <div className="ta-error">{error}</div> : null}
    <div className="ta-layout">
      <section className="ta-panel"><div className="ta-toolbar"><strong>{loading ? "Loading…" : `${rows.length} testimonials · ${published} published`}</strong><button className="ta-button" type="button" onClick={startNew}>+ New</button></div><div className="ta-list">{rows.length ? rows.map((row) => <button type="button" className={`ta-row${draft.id === row.id ? " active" : ""}`} key={row.id} onClick={() => { setDraft({ ...row }); setMessage(""); setError(""); }}><strong>{row.client_name || "Unnamed client"}</strong><span>{[row.project_code,row.location,row.service_label].filter(Boolean).join(" · ") || "No project context"}</span><div className="ta-badges">{row.published ? <span className="ta-badge live">Published</span> : <span className="ta-badge">Draft</span>}{row.featured ? <span className="ta-badge featured">Featured</span> : null}</div></button>) : <div className="ta-empty">No testimonials yet. Add the first genuine client quote when you have permission to publish it.</div>}</div><div className="ta-note">Tip: link the testimonial to a Project ID such as LV-157 when the feedback relates to a specific published project.</div></section>
      <section className="ta-panel"><div className="ta-toolbar"><strong>{draft.id ? "Edit testimonial" : "New testimonial"}</strong><span className="ta-kicker">{draft.id ? "EXISTING" : "DRAFT"}</span></div><div className="ta-form"><div className="ta-grid">
        <div className="ta-field"><label>Client name *</label><input value={draft.client_name} onChange={(e) => patch({ client_name:e.target.value })} placeholder="Client name" /></div>
        <div className="ta-field"><label>Role / context</label><input value={draft.client_role || ""} onChange={(e) => patch({ client_role:e.target.value })} placeholder="Owner, Developer, Organization…" /></div>
        <div className="ta-field"><label>Project ID</label><input value={draft.project_code || ""} onChange={(e) => patch({ project_code:e.target.value.toUpperCase() })} placeholder="LV-157" /></div>
        <div className="ta-field"><label>Location</label><input value={draft.location || ""} onChange={(e) => patch({ location:e.target.value })} placeholder="Feni, Bangladesh" /></div>
        <div className="ta-field full"><label>Service / project context</label><input value={draft.service_label || ""} onChange={(e) => patch({ service_label:e.target.value })} placeholder="Architectural Design · Structural Design · Site Supervision" /></div>
        <div className="ta-field full"><label>Client testimonial *</label><textarea value={draft.quote || ""} onChange={(e) => patch({ quote:e.target.value })} placeholder="Enter the client's approved words exactly as they should appear publicly." /></div>
        <div className="ta-field"><label>Display order</label><input type="number" min="0" max="9999" value={draft.display_order || 0} onChange={(e) => patch({ display_order:Number(e.target.value) || 0 })} /></div>
      </div><div className="ta-checks"><label><input type="checkbox" checked={draft.published} onChange={(e) => patch({ published:e.target.checked })} /> Published</label><label><input type="checkbox" checked={draft.featured} onChange={(e) => patch({ featured:e.target.checked })} /> Featured</label></div><div className="ta-actions"><button className="ta-button" type="button" disabled={saving} onClick={() => void save()}>{saving ? "Saving…" : draft.id ? "Save Changes" : "Create Testimonial"}</button>{draft.id ? <button className="ta-button danger" type="button" disabled={saving} onClick={() => void remove()}>Delete</button> : <button className="ta-button secondary" type="button" onClick={startNew}>Clear</button>}<span className="ta-status">{message}</span></div></div></section>
    </div>
  </div>;
}
