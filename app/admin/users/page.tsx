"use client";

import { FormEvent, useEffect, useState } from "react";
import { landViewApi } from "@/lib/api";
import { EmptyState, Field, LoadingState, PageHeader, StatusBadge, pick } from "@/components/lv-ui";

const blank = { User_ID: "", Name: "", Username: "", Password: "", Role: "Admin", Active: "TRUE" };

type ResetResult = { userId: string; username: string; temporaryPassword: string };

export default function UsersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<"user" | "permission" | null>(null);
  const [form, setForm] = useState<any>(blank);
  const [error, setError] = useState("");
  const [resetResult, setResetResult] = useState<ResetResult | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [u, p] = await Promise.all([landViewApi.getUsers(), landViewApi.getPermissions()]);
      setUsers(u);
      setPermissions(p);
    } catch (e: any) {
      setError(e?.message || "Could not load access records.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      if (open === "user") await landViewApi.createUser(form);
      else await landViewApi.createPermission(form);
      setOpen(null);
      setForm(blank);
      await load();
    } catch (e: any) {
      setError(e?.message || "Could not save record.");
    }
  }

  async function resetPassword(userId: string) {
    if (!confirm(`Generate a new temporary password for ${userId}?`)) return;
    try {
      const result = await landViewApi.resetUserPassword(userId);
      setResetResult(result);
      await load();
    } catch (e: any) {
      setError(e?.message || "Password reset failed.");
    }
  }

  async function copyReset() {
    if (!resetResult) return;
    const text = `LAND VIEW Login\nUser: ${resetResult.username || resetResult.userId}\nTemporary Password: ${resetResult.temporaryPassword}`;
    try { await navigator.clipboard.writeText(text); } catch {}
  }

  if (loading) return <LoadingState />;

  return <>
    <PageHeader
      eyebrow="ACCESS CONTROL"
      title="Users & permissions"
      description="Employee and client accounts are normally created automatically. Use this page to manage access and reset passwords."
      action={<div className="button-row"><button className="btn btn-light" onClick={() => { setForm({ User_ID: "", Permission: "", Value: "TRUE" }); setOpen("permission"); }}>+ Permission</button><button className="btn btn-dark" onClick={() => { setForm(blank); setOpen("user"); }}>+ Manual user</button></div>}
    />

    {error && <div className="notice error"><strong>Notice</strong><span>{error}</span></div>}

    <section className="card table-card">
      <div className="section-title"><div><span>USERS</span><h2>System accounts</h2></div></div>
      {users.length ? <div className="table-scroll"><table>
        <thead><tr><th>User</th><th>Login</th><th>Role</th><th>Linked access</th><th>Active</th><th>Action</th></tr></thead>
        <tbody>{users.map((u: any, i) => {
          const id = pick(u, ["User_ID"], String(i));
          const role = pick(u, ["Role"], "—");
          const linked = String(role).toLowerCase() === "employee"
            ? pick(u, ["Employee_ID"], "—")
            : String(role).toLowerCase() === "client"
              ? pick(u, ["Project_IDs"], "No projects")
              : "Full system";
          return <tr key={id}>
            <td><strong>{pick(u, ["Name"], "Unnamed")}</strong><small>{id}</small></td>
            <td>{pick(u, ["Username"], "—")}</td>
            <td>{role}</td>
            <td>{linked}</td>
            <td><StatusBadge value={pick(u, ["Active", "Status"], "TRUE")} /></td>
            <td><button className="btn btn-light" type="button" onClick={() => resetPassword(id)}>Reset password</button></td>
          </tr>;
        })}</tbody>
      </table></div> : <EmptyState title="No users" text="Create the first login account." />}
    </section>

    <section className="card table-card">
      <div className="section-title"><div><span>PERMISSIONS</span><h2>Permission records</h2></div></div>
      {permissions.length ? <div className="table-scroll"><table><thead><tr><th>ID</th><th>User</th><th>Permission</th><th>Value</th></tr></thead><tbody>{permissions.map((p: any, i) => <tr key={pick(p, ["Permission_ID"], String(i))}><td><strong>{pick(p, ["Permission_ID"], "—")}</strong></td><td>{pick(p, ["User_ID", "User ID"], "—")}</td><td>{pick(p, ["Permission", "Module", "Feature"], "—")}</td><td>{pick(p, ["Value", "Allowed", "Access"], "—")}</td></tr>)}</tbody></table></div> : <div className="empty-inline">No permission records.</div>}
    </section>

    {open && <div className="modal-backdrop" onMouseDown={() => setOpen(null)}><form className="modal card" onSubmit={submit} onMouseDown={e => e.stopPropagation()}>
      <div className="section-title"><div><span>ACCESS CONTROL</span><h2>{open === "user" ? "Create manual user" : "Create permission"}</h2></div><button type="button" className="icon-button" onClick={() => setOpen(null)}>×</button></div>
      {open === "user" && <div className="notice"><strong>Usually not needed</strong><span>Employee accounts are created when you add an employee. Client accounts are created when you add a project with a client phone number.</span></div>}
      <div className="form-grid">{open === "user" ? <>
        {Object.entries({ User_ID: "USER ID", Name: "NAME", Username: "USERNAME", Password: "PASSWORD", Role: "ROLE", Active: "ACTIVE" }).map(([k, l]) => <Field key={k} label={l}><input type={k === "Password" ? "password" : "text"} value={String(form[k] || "")} onChange={e => setForm((v: any) => ({ ...v, [k]: e.target.value }))} /></Field>)}
      </> : <>
        {Object.entries({ User_ID: "USER ID", Permission: "PERMISSION / MODULE", Value: "VALUE" }).map(([k, l]) => <Field key={k} label={l}><input value={String(form[k] || "")} onChange={e => setForm((v: any) => ({ ...v, [k]: e.target.value }))} /></Field>)}
      </>}</div>
      <div className="form-actions"><button type="button" className="btn btn-light" onClick={() => setOpen(null)}>Cancel</button><button className="btn btn-dark">Create</button></div>
    </form></div>}

    {resetResult && <div className="modal-backdrop" onMouseDown={() => setResetResult(null)}><div className="modal card" onMouseDown={e => e.stopPropagation()}>
      <div className="section-title"><div><span>PASSWORD RESET</span><h2>New temporary password</h2></div><button type="button" className="icon-button" onClick={() => setResetResult(null)}>×</button></div>
      <div className="notice"><strong>Share this securely</strong><span>This temporary password is shown here once. The user can change it after login.</span></div>
      <div className="form-grid"><Field label="LOGIN"><input readOnly value={resetResult.username || resetResult.userId} /></Field><Field label="TEMPORARY PASSWORD"><input readOnly value={resetResult.temporaryPassword} /></Field></div>
      <div className="form-actions"><button className="btn btn-light" type="button" onClick={copyReset}>Copy credentials</button><button className="btn btn-dark" type="button" onClick={() => setResetResult(null)}>Done</button></div>
    </div></div>}
  </>;
}
