"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";
import { EmptyState, Field, LoadingState, PageHeader, StatusBadge, pick } from "@/components/lv-ui";

const DESIGNATIONS = [
  "Architect",
  "Engr.",
  "Civil Engr.",
  "Structural Engr.",
  "Electrical Engr.",
  "Mechanical Engr.",
  "Interior Designer",
  "Draftsman",
  "Project Manager",
  "Site Engineer",
  "Surveyor",
  "Administrator",
];

const blank = {
  Employee_Name: "",
  Phone: "",
  Email: "",
  Designation: "",
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

  function startEdit(r: any) {
    setEditing(pick(r, ["Employee_ID", "Employee ID", "EmployeeId"]));
    setForm({ ...blank, ...r });
    setOpen(true);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      if (editing) {
        await landViewApi.updateEmployee(editing, form);
      } else {
        const result = await landViewApi.createEmployee(form);
        const account = result.account;

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
      }
      setOpen(false);
      setEditing("");
      setForm(blank);
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not save employee.");
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
        const designation = pick(r, ["Designation", "designation"], "");
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

    {open && <div className="modal-backdrop" onMouseDown={() => setOpen(false)}>
      <form className="modal card" onSubmit={submit} onMouseDown={e => e.stopPropagation()}>
        <div className="section-title"><div><span>{editing ? "EDIT" : "NEW"}</span><h2>{editing ? "Edit employee" : "Add employee"}</h2></div><button type="button" className="icon-button" onClick={() => setOpen(false)}>×</button></div>
        <div className="form-grid">
          <Field label="EMPLOYEE NAME"><input type="text" value={form.Employee_Name} onChange={e => setForm(v => ({ ...v, Employee_Name: e.target.value }))} /></Field>

          <Field label="DESIGNATION">
            <select value={form.Designation} onChange={e => setForm(v => ({ ...v, Designation: e.target.value }))}>
              <option value="">Select designation</option>
              {DESIGNATIONS.map(item => <option value={item} key={item}>{item}</option>)}
            </select>
          </Field>

          {Object.entries({
            Phone: "PHONE",
            Email: "EMAIL",
            Position: "POSITION",
            Department: "DEPARTMENT",
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
        <div className="form-actions"><button type="button" className="btn btn-light" onClick={() => setOpen(false)}>Cancel</button><button className="btn btn-dark">Save employee</button></div>
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
