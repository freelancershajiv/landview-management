"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { landViewApi, type BillingBookData } from "@/lib/api";

const CATEGORIES = ["Engineering Bill", "Supervision Bill", "Other Services Bill"] as const;
type Category = typeof CATEGORIES[number];

type DiscountForm = {
  projectId: string;
  category: Category;
  amount: string;
  date: string;
  notes: string;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}
function amount(value: unknown) {
  const n = Number(text(value).replace(/,/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}
function money(value: number) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(value || 0);
}
function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
function normalize(value: unknown) {
  return text(value).toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}
function categoryMatches(key: string, category: Category) {
  const value = normalize(key);
  if (category === "Engineering Bill") return ["engineering bill", "engineering", "design bill"].includes(value);
  if (category === "Supervision Bill") return ["supervision bill", "supervision"].includes(value);
  return ["other services bill", "others bill", "other services", "others"].includes(value);
}
function categoryDue(project: BillingBookData["projects"][number] | undefined, category: Category) {
  if (!project) return 0;
  const match = Object.entries(project.categories || {}).find(([key]) => categoryMatches(key, category));
  return match ? amount(match[1]?.due) : 0;
}

async function postDiscount(form: DiscountForm) {
  const response = await fetch("/api/billing/write", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({
      action: "saveDiscount",
      Project_ID: form.projectId,
      Billing_Category: form.category,
      Amount: amount(form.amount),
      Discount_Date: form.date,
      Notes: form.notes.trim(),
      Idempotency_Key: `web-discount-${crypto.randomUUID()}`,
    }),
  });
  const raw = await response.text();
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(/^\s*</.test(raw) ? "The server returned HTML instead of JSON." : "The discount response was invalid.");
  }
  if (!response.ok || !json?.success) throw new Error(String(json?.error || "Could not add discount."));
  return json.data;
}

export default function FinanceDiscountAction() {
  const [actionTarget, setActionTarget] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [book, setBook] = useState<BillingBookData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<DiscountForm>({ projectId: "", category: "Engineering Bill", amount: "", date: today(), notes: "" });

  useEffect(() => {
    let observer: MutationObserver | null = null;
    const resolveTarget = () => {
      const target = document.querySelector<HTMLElement>(".billing-actions");
      if (target) {
        setActionTarget(target);
        observer?.disconnect();
        observer = null;
        return true;
      }
      return false;
    };
    if (!resolveTarget()) {
      observer = new MutationObserver(resolveTarget);
      observer.observe(document.body, { childList: true, subtree: true });
    }
    return () => observer?.disconnect();
  }, []);

  const projects = useMemo(
    () => (book?.projects || [])
      .filter((project) => project.due > 0.009)
      .slice()
      .sort((a, b) => a.projectId.localeCompare(b.projectId, undefined, { numeric: true })),
    [book]
  );

  const selectedProject = projects.find((project) => project.projectId === form.projectId);
  const selectedDue = selectedProject ? categoryDue(selectedProject, form.category) : 0;

  async function start() {
    setOpen(true);
    setLoading(true);
    setError("");
    setForm({ projectId: "", category: "Engineering Bill", amount: "", date: today(), notes: "" });
    try {
      setBook(await landViewApi.getBillingBook());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load current billing balances.");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    const value = amount(form.amount);
    if (!form.projectId) return setError("Choose a project first.");
    if (!(selectedDue > 0.009)) return setError("This category has no outstanding amount to discount.");
    if (!(value > 0)) return setError("Enter a valid discount amount.");
    if (value > selectedDue + 0.009) return setError(`Discount cannot exceed the category due of ${money(selectedDue)}.`);

    setSaving(true);
    setError("");
    try {
      await postDiscount(form);
      setOpen(false);
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add discount.");
    } finally {
      setSaving(false);
    }
  }

  const button = (
    <button className="billing-btn finance-discount-trigger" type="button" onClick={start}>
      + Add Discount
    </button>
  );

  return <>
    <style>{`
      .billing-actions > *{order:10}
      .billing-actions > :nth-child(1){order:1}
      .billing-actions > :nth-child(2){order:3}
      .billing-actions > :nth-child(3){order:4}
      .billing-actions > :nth-child(4){order:5}
      .billing-actions .finance-discount-trigger{order:2;background:#d99a38!important;border:1px solid #f0b557!important;color:#14100a!important;font-weight:900!important;opacity:1!important;text-shadow:none!important}
      .billing-actions .finance-discount-trigger:hover{background:#e8aa47!important;border-color:#ffc86f!important;color:#0c0905!important}
      .billing-actions .billing-btn:not(.finance-discount-trigger){background:#182129!important;border-color:#4c5b66!important;color:#f7fafc!important;text-shadow:none!important}
      .billing-actions .billing-btn.primary{background:#e6534e!important;border-color:#ff736d!important;color:#fff!important}
      .billing-actions .billing-btn:hover:not(:disabled):not(.finance-discount-trigger){background:#22303a!important;border-color:#71808b!important;color:#fff!important}
      .billing-actions .billing-btn.primary:hover:not(:disabled){background:#f05f59!important;border-color:#ff827c!important;color:#fff!important}
      .billing-actions .billing-btn:disabled{opacity:.68!important;color:#f7fafc!important;filter:none!important}
      .finance-discount-backdrop{position:fixed;inset:0;z-index:140;background:rgba(0,0,0,.76);display:grid;place-items:center;padding:18px}
      .finance-discount-modal{width:min(620px,100%);max-height:92vh;overflow:auto;background:#151d24;border:1px solid #46535e;border-radius:12px;padding:20px;color:#f4f7f9;box-shadow:0 28px 90px rgba(0,0,0,.55)}
      .finance-discount-modal h2{margin:0 0 6px;font-size:22px;color:#fff}
      .finance-discount-modal>p{margin:0 0 18px;color:#aeb9c1;font-size:12px;line-height:1.5}
      .finance-discount-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
      .finance-discount-field{display:flex;flex-direction:column;gap:6px}
      .finance-discount-field.full{grid-column:1/-1}
      .finance-discount-field label{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#c8d1d8;font-weight:900}
      .finance-discount-field input,.finance-discount-field select,.finance-discount-field textarea{min-height:44px;border:1px solid #3d4a54;border-radius:8px;background:#0c141a;color:#fff;padding:10px;color-scheme:dark}
      .finance-discount-field textarea{min-height:82px;resize:vertical}
      .finance-discount-balance{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:12px;border:1px solid #5b4726;background:#241d12;border-radius:8px;padding:12px 14px}
      .finance-discount-balance span{font-size:11px;color:#d9c39c;text-transform:uppercase;font-weight:900}
      .finance-discount-balance strong{font-size:18px;color:#ffc76a}
      .finance-discount-error{margin:0 0 14px;border:1px solid #8c433d;background:#35211f;color:#ffd2ce;padding:10px 12px;border-radius:8px;font-size:12px;font-weight:800}
      .finance-discount-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:18px}
      .finance-discount-actions button{min-height:42px;border-radius:8px;padding:10px 15px;font-weight:900;cursor:pointer}
      .finance-discount-cancel{border:1px solid #56636d;background:#1a242c;color:#fff}
      .finance-discount-save{border:1px solid #ffc46a;background:#d99a38;color:#140f08}
      .finance-discount-actions button:disabled{opacity:.55;cursor:not-allowed}
      @media(max-width:640px){.finance-discount-grid{grid-template-columns:1fr}.finance-discount-field.full,.finance-discount-balance{grid-column:auto}.finance-discount-actions button{flex:1}.billing-actions .finance-discount-trigger{flex:1 1 calc(50% - 6px)}}
    `}</style>

    {actionTarget && createPortal(button, actionTarget)}

    {open && <div className="finance-discount-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target && !saving) setOpen(false); }}>
      <section className="finance-discount-modal" role="dialog" aria-modal="true" aria-label="Add discount">
        <h2>Add Discount</h2>
        <p>Apply a discount to an existing project/category balance. Gross billing stays unchanged; Net Billed and Due are reduced and the adjustment is recorded in the discount audit log.</p>
        {error && <div className="finance-discount-error" role="alert">{error}</div>}
        <div className="finance-discount-grid">
          <div className="finance-discount-field full">
            <label>Project with receivable</label>
            <select disabled={loading || saving} value={form.projectId} onChange={(event) => setForm((current) => ({ ...current, projectId: event.target.value, amount: "" }))}>
              <option value="">{loading ? "Loading projects…" : "Choose project"}</option>
              {projects.map((project) => <option key={project.projectId} value={project.projectId}>{project.projectId} — {project.projectName || project.clientName || "Project"} — Due {money(project.due)}</option>)}
            </select>
          </div>
          <div className="finance-discount-field">
            <label>Category</label>
            <select disabled={saving} value={form.category} onChange={(event) => setForm((current) => ({ ...current, category: event.target.value as Category, amount: "" }))}>
              {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>
          <div className="finance-discount-field">
            <label>Discount date</label>
            <input disabled={saving} type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}/>
          </div>
          <div className="finance-discount-balance">
            <span>Current category due</span>
            <strong>{money(selectedDue)}</strong>
          </div>
          <div className="finance-discount-field full">
            <label>Discount amount (BDT)</label>
            <input disabled={saving || !form.projectId} inputMode="decimal" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0"/>
          </div>
          <div className="finance-discount-field full">
            <label>Reason / note</label>
            <textarea disabled={saving} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Optional reason for this discount"/>
          </div>
        </div>
        <div className="finance-discount-actions">
          <button className="finance-discount-cancel" type="button" disabled={saving} onClick={() => setOpen(false)}>Cancel</button>
          <button className="finance-discount-save" type="button" disabled={saving || loading} onClick={save}>{saving ? "Applying…" : "Apply Discount"}</button>
        </div>
      </section>
    </div>}
  </>;
}
