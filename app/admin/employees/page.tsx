"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";
import { EmptyState, Field, LoadingState, PageHeader, StatusBadge, pick } from "@/components/lv-ui";

const DESIGNATIONS = ["Dr.", "Engr.", "Arch."];
const DEPARTMENTS = [
  "Structural Engineers",
  "Architects",
  "Electrical Engineers",
  "Project Management & Supervision",
];
const PUBLIC_POSITION_PREFIX = "__POSITION__:";

function normalizeDesignation(value: unknown) {
  const raw = String(value || "").trim();
  if (raw === "Dr." || raw === "Dr") return "Dr.";
  if (raw === "Engr." || raw === "Engineer" || raw === "Engr") return "Engr.";
  if (raw === "Arch." || raw === "Architect" || raw === "Arch") return "Arch.";
  return "";
}

function stripPublicPositionMarker(value: unknown) {
  return String(value || "")
    .split(/\r?\n/)
    .filter(line => !line.trim().startsWith(PUBLIC_POSITION_PREFIX))
    .join("\n")
    .trim();
}

function buildPublicBio(position: unknown, bio: unknown) {
  const cleanBio = stripPublicPositionMarker(bio);
  const cleanPosition = String(position || "").trim();
  return [cleanPosition ? `${PUBLIC_POSITION_PREFIX}${cleanPosition}` : "", cleanBio]
    .filter(Boolean)
    .join("\n");
}

const blank = {
  Employee_Name: "",
  Phone: "",
  Email: "",
  Public_Title: "",
  Position: "",
  Department: "",
  Joining_Date: "",
  Status: "Active",
  Public_Display: "FALSE",
  Public_Bio: "",
  Photo_URL: "",
  LinkedIn_URL: "",
  Display_Order: "",
};

export default function EmployeesPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState("");
  const [credentials, setCredentials] = useState<{ username: string; password: string } | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setRows(await landViewApi.getEmployees());
    } catch (e: any) {
      setError(e?.message || "Could not load employees.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(
    () => rows.filter((r) => JSON.stringify(r).toLowerCase().includes(query.toLowerCase())),
    [rows, query]
  );

  function closeEditor() {
    setOpen(false);
    setEditing("");
    setForm(blank);
  }

  function startEdit(r: any) {
    setEditing(pick(r, ["Employee_ID", "Employee ID", "EmployeeId"]));
    setForm({
      ...blank,
      ...r,
      Public_Title: normalizeDesignation(
        pick(r, ["Public_Title", "Public Title", "Designation", "designation"], "")
      ),
      Public_Bio: stripPublicPositionMarker(pick(r, ["Public_Bio", "Public Bio", "Bio"], "")),
    });
    setOpen(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (saving) return;

    const editingId = editing;
    const draft = form;
    const payload = {
      ...draft,
      Public_Bio: buildPublicBio(draft.Position, draft.Public_Bio),
    };

    setSaving(true);
    setError("");

    // Existing employees close immediately when Save is pressed.
    // If the request fails, the exact draft is restored and reopened.
    if (editingId) closeEditor();

    try {
      if (editingId) {
        await landViewApi.updateEmployee(editingId, payload);
        void load();
        return;
      }

      const result = await landViewApi.createEmployee(payload);
      const account = result.account;

      closeEditor();
      void load();

      if (account?.created && account.temporaryPassword) {
        setCredentials({
          username: account.username || result.Employee_ID || "",
          password: account.temporaryPassword,
        });
      } else if (account?.userId) {
        const reset = await landViewApi.resetUserPassword(account.userId);
        setCredentials({
          username: reset.username || account.username || result.Employee_ID || "",
          password: reset.temporaryPassword,
        });
      } else {
        throw new Error(
          "Employee was created, but login credentials were not returned. Check the Users sheet and Apps Script deployment."
        );
      }
    } catch (e: any) {
      setError(e?.message || "Could not save employee.");
      if (editingId) {
        setEditing(editingId);
        setForm(draft);
        setOpen(true);
      }
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm(`Delete employee ${id}?`)) return;
    try {
      await landViewApi.deleteEmployee(id);
      await load();
    } catch (e: any) {
      setError(e?.message || "Delete failed.");
    }
  }

  return <>
    <PageHeader
      eyebrow="TEAM"
      title="Employees"
      description="Create and manage LAND VIEW employee records."
      action={<button className="btn btn-dark" onClick={() => { setForm(blank); setEditing(""); setOpen(true); }}>+ Add employee</button>}
    />

    <div className="toolbar">
      <div className="search-box"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search employees..." /></div>
      <div className="toolbar-count">{filtered.length} people</div>
    </div>

    {error && <div className="notice error"><strong>Notice</strong><span>{error}</span></div>}

    {loading ? <LoadingState label="Loading employees..." /> : !rows.length ?
      <EmptyState title="No employees" text="Add the first team member to LAND VIEW." /> :
      <div className="employee-grid">{filtered.map((r: any) => {
        const id = pick(r, ["Employee_ID", "Employee ID", "EmployeeId"]);
        const designation = normalizeDesignation(
          pick(r, ["Public_Title", "Public Title", "Designation", "designation"], "")
        );
        const name = pick(r, ["Employee_Name", "Employee Name", "Name"], id);
        return <div className="employee-card" key={id}>
          <div className="employee-avatar">{name.slice(0, 2).toUpperCase()}</div>
          <div className="employee-main">
            <div className="employee-top"><div><h3>{designation ? `${designation} ${name}` : name}</h3><p>{pick(r, ["Position"], pick(r, ["Department"], "Team member"))}</p></div><StatusBadge value={pick(r, ["Status", "status"], "Active")} /></div>
            <div className="employee-lines"><span>{id}</span><span>{pick(r, ["Phone", "Phone_Number"], "No phone")}</span><span>{pick(r, ["Email"], "No email")}</span></div>
            <div className="employee-actions"><button onClick={() => startEdit(r)}>Edit</button><button onClick={() => remove(id)}>Delete</button></div>
          </div>
        </div>;
      })}</div>
    }

    {open && <div className="modal-backdrop" onMouseDown={() => !saving && closeEditor()}>
      <form className="modal card" onSubmit={submit} onMouseDown={e => e.stopPropagation()}>
        <div className="section-title"><div><span>{editing ? "EDIT" : "NEW"}</span><h2>{editing ? "Edit employee" : "Add employee"}</h2></div><button type="button" className="icon-button" disabled={saving} onClick={closeEditor}>×</button></div>
        <div className="form-grid">
          <Field label="EMPLOYEE NAME"><input type="text" value={form.Employee_Name} onChange={e => setForm(v => ({ ...v, Employee_Name: e.target.value }))} /></Field>

          <Field label="DESIGNATION">
            <select value={form.Public_Title} onChange={e => setForm(v => ({ ...v, Public_Title: e.target.value }))}>
              <option value="">None</option>
              {DESIGNATIONS.map(item => <option value={item} key={item}>{item}</option>)}
            </select>
          </Field>

          <Field label="PHONE"><input type="text" value={form.Phone} onChange={e => setForm(v => ({ ...v, Phone: e.target.value }))} /></Field>
          <Field label="EMAIL"><input type="text" value={form.Email} onChange={e => setForm(v => ({ ...v, Email: e.target.value }))} /></Field>
          <Field label="POSITION"><input type="text" value={form.Position} onChange={e => setForm(v => ({ ...v, Position: e.target.value }))} /></Field>

          <Field label="DEPARTMENT">
            <select
              value={form.Department}
              onChange={e => setForm(v => ({ ...v, Department: e.target.value }))}
              style={{ textAlign: "center", textAlignLast: "center" }}
            >
              <option value="" style={{ textAlign: "center" }}>Select department</option>
              {DEPARTMENTS.map(item => <option value={item} key={item} style={{ textAlign: "center" }}>{item}</option>)}
            </select>
          </Field>

          {Object.entries({
            Joining_Date: "JOINING DATE",
            Status: "STATUS",
            Photo_URL: "PHOTO URL",
            LinkedIn_URL: "LINKEDIN / PROFILE URL",
            Display_Order: "PUBLIC DISPLAY ORDER",
          }).map(([k, l]) =>
            <Field key={k} label={l}><input type={k === "Joining_Date" ? "date" : k === "Display_Order" ? "number" : "text"} value={String((form as any)[k] || "")} onChange={e => setForm(v => ({ ...v, [k]: e.target.value }))} /></Field>
          )}
          <Field label="PUBLIC BIO"><textarea rows={4} value={String((form as any).Public_Bio || "")} onChange={e => setForm(v => ({ ...v, Public_Bio: e.target.value }))} /></Field>
          <Field label="PUBLIC WEBSITE"><label className="public-employee-toggle"><input type="checkbox" checked={String((form as any).Public_Display || "").toUpperCase() === "TRUE"} onChange={e => setForm(v => ({ ...v, Public_Display: e.target.checked ? "TRUE" : "FALSE" }))} /><span>Show this employee on the public website</span></label></Field>
        </div>
        <div className="form-actions"><button type="button" className="btn btn-light" disabled={saving} onClick={closeEditor}>Cancel</button><button className="btn btn-dark" disabled={saving}>{saving ? "Saving..." : "Save employee"}</button></div>
      </form>
    </div>}

    {credentials && <div className="modal-backdrop">
      <div className="modal card" onMouseDown={e => e.stopPropagation()}>
        <div className="section-title"><div><span>LOGIN CREATED</span><h2>Employee temporary password</h2></div></div>
        <div className="notice"><strong>Save these credentials now</strong><span>The temporary password is shown only once. The employee must change it after signing in.</span></div>
        <div className="form-grid">
          <Field label="LOGIN ID"><input readOnly value={credentials.username} /></Field>
          <Field label="TEMPORARY PASSWORD"><input readOnly value={credentials.password} /></Field>
        </div>
        <div className="form-actions">
          <button type="button" className="btn btn-light" onClick={() => navigator.clipboard.writeText(`Login ID: ${credentials.username}\nTemporary Password: ${credentials.password}`)}>Copy credentials</button>
          <button type="button" className="btn btn-dark" onClick={() => setCredentials(null)}>I saved it</button>
        </div>
      </div>
    </div>}
  </>;
}
