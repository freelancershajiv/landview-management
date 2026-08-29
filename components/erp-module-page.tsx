"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";
import type { ErpModule } from "@/lib/api";
import { ErrorState, LoadingState, PageHeader, StatusBadge } from "@/components/lv-ui";

export type ErpField = {
  key: string;
  label: string;
  type?: "text" | "date" | "time" | "number" | "select" | "textarea" | "url";
  options?: string[];
  required?: boolean;
};

type Props = {
  module: ErpModule;
  eyebrow: string;
  title: string;
  description: string;
  idKey: string;
  fields: ErpField[];
  columns: string[];
  labels?: Record<string, string>;
  statusOptions?: string[];
};

function valueText(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export default function ErpModulePage({
  module, eyebrow, title, description, idKey, fields, columns, labels = {},
  statusOptions = ["Draft", "Pending", "In Progress", "Approved", "Completed", "Cancelled"],
}: Props) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    await Promise.resolve();
    setError("");
    try {
      setRows(await landViewApi.getErpRecords(module));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not load records.");
    } finally {
      setLoading(false);
    }
  }, [module]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => rows.filter((row) => {
    const haystack = Object.values(row).join(" ").toLowerCase();
    const rowStatus = valueText(row.Status).toLowerCase();
    return haystack.includes(query.toLowerCase()) && (status === "All" || rowStatus === status.toLowerCase());
  }), [query, rows, status]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await landViewApi.createErpRecord(module, form);
      setForm({});
      setFormOpen(false);
      await load();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not save the record.");
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(row: Record<string, unknown>, nextStatus: string) {
    const id = valueText(row[idKey]);
    if (id === "—") return;
    setError("");
    try {
      await landViewApi.updateErpRecord(module, id, { Status: nextStatus });
      setRows((current) => current.map((item) => item[idKey] === row[idKey] ? { ...item, Status: nextStatus } : item));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Could not update status.");
    }
  }

  if (loading) return <LoadingState label={`Loading ${title.toLowerCase()}...`} />;
  if (error && !rows.length) return <ErrorState message={error} onRetry={load} />;

  return <>
    <PageHeader eyebrow={eyebrow} title={title} description={description} action={
      <button className="btn btn-dark" onClick={() => setFormOpen(true)}>+ New record</button>
    } />

    {error && <div className="erp-alert">{error}</div>}

    <section className="erp-summary-grid">
      <article><span>TOTAL RECORDS</span><strong>{rows.length}</strong><small>All entries</small></article>
      <article><span>ACTIVE WORK</span><strong>{rows.filter((row) => ["active", "in progress", "pending"].includes(valueText(row.Status).toLowerCase())).length}</strong><small>Needs attention</small></article>
      <article><span>COMPLETED</span><strong>{rows.filter((row) => ["approved", "completed", "paid"].includes(valueText(row.Status).toLowerCase())).length}</strong><small>Closed records</small></article>
    </section>

    <section className="card table-card erp-table-card">
      <div className="erp-toolbar">
        <input aria-label="Search records" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${title.toLowerCase()}...`} />
        <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option>All</option>{statusOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
        <span>{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>
      </div>
      {filtered.length ? <div className="table-scroll"><table><thead><tr>
        {columns.map((column) => <th key={column}>{labels[column] || column.replaceAll("_", " ")}</th>)}<th>Workflow</th>
      </tr></thead><tbody>{filtered.map((row, index) => <tr key={valueText(row[idKey]) + index}>
        {columns.map((column) => <td key={column}>{column === "Status" ? <StatusBadge value={valueText(row[column])} /> : <span>{valueText(row[column])}</span>}</td>)}
        <td><select className="erp-status-select" value={valueText(row.Status) === "—" ? "Draft" : valueText(row.Status)} onChange={(event) => void changeStatus(row, event.target.value)}>
          {statusOptions.map((option) => <option key={option}>{option}</option>)}
        </select></td>
      </tr>)}</tbody></table></div> : <div className="empty-inline">No matching records yet.</div>}
    </section>

    {formOpen && <div className="modal-backdrop" onMouseDown={() => setFormOpen(false)}>
      <form className="modal card erp-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="section-title"><div><span>{eyebrow}</span><h2>Add {title.toLowerCase()} record</h2></div><button type="button" className="icon-button" onClick={() => setFormOpen(false)}>×</button></div>
        <div className="form-grid">{fields.map((field) => <label className={`form-field ${field.type === "textarea" ? "full" : ""}`} key={field.key}>
          <span>{field.label}</span>
          {field.type === "select" ? <select required={field.required} value={form[field.key] || ""} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}><option value="">Select</option>{field.options?.map((option) => <option key={option}>{option}</option>)}</select>
            : field.type === "textarea" ? <textarea required={field.required} value={form[field.key] || ""} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} rows={4} />
            : <input type={field.type || "text"} required={field.required} value={form[field.key] || ""} onChange={(event) => setForm({ ...form, [field.key]: event.target.value })} />}
        </label>)}</div>
        <div className="form-actions"><button type="button" className="btn btn-light" onClick={() => setFormOpen(false)}>Cancel</button><button className="btn btn-dark" disabled={saving}>{saving ? "Saving..." : "Save record"}</button></div>
      </form>
    </div>}
  </>;
}
