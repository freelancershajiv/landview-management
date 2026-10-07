"use client";

import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";
import {
  PERMISSION_DEFINITIONS,
  PERMISSION_GROUP_ORDER,
  ROLE_TEMPLATE_SUMMARIES,
  roleDefaultPermissions,
  type WorkspaceRole,
} from "@/lib/role-permissions";

type Row = Record<string, any>;
type ResetResult = { userId: string; username: string; temporaryPassword: string } | null;

function text(value: unknown) { return String(value ?? "").trim(); }
function role(row: Row): WorkspaceRole | "" {
  const value = text(row.Role || row.role).toLowerCase();
  return (["admin", "manager", "employee", "client"] as string[]).includes(value) ? value as WorkspaceRole : "";
}
function roleLabel(value: string) {
  if (value === "manager") return "Management";
  if (value === "employee") return "Employees";
  if (value === "client") return "Clients";
  if (value === "admin") return "Admin";
  return value || "User";
}
function latestOverride(rows: Row[], userId: string, key: string): boolean | undefined {
  const matches = rows
    .filter((row) => text(row.User_ID || row["User ID"]) === userId && text(row.Permission) === key)
    .sort((a, b) => new Date(text(a.Created_At || a["Created At"]) || 0).getTime() - new Date(text(b.Created_At || b["Created At"]) || 0).getTime());
  if (!matches.length) return undefined;
  return text(matches[matches.length - 1].Status).toLowerCase() === "active";
}

export default function PermissionMatrixV3() {
  const [users, setUsers] = useState<Row[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState("");
  const [resetResult, setResetResult] = useState<ResetResult>(null);
  const [copied, setCopied] = useState(false);
  const [form, setForm] = useState({ Name: "", Username: "", Role: "Manager", Password: "" });

  async function load() {
    setLoading(true); setError("");
    try {
      const [userRows, permissionRows] = await Promise.all([landViewApi.getUsers(), landViewApi.getPermissions()]);
      setUsers(userRows || []); setRows(permissionRows || []);
    } catch (err: any) { setError(err?.message || "Could not load users and permissions."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const staff = useMemo(() => users.filter((user) => role(user)), [users]);
  const groups = useMemo(() => PERMISSION_GROUP_ORDER.map((group) => ({
    group,
    items: PERMISSION_DEFINITIONS.filter((item) => item.group === group),
  })).filter((group) => group.items.length), []);

  async function toggleEmployee(user: Row, key: string) {
    const userId = text(user.User_ID || user.userId);
    if (!userId || role(user) !== "employee") return;
    const defaults = roleDefaultPermissions("employee");
    const currentOverride = latestOverride(rows, userId, key);
    const current = currentOverride === undefined ? Boolean(defaults[key]) : currentOverride;
    const record = {
      Permission_ID: `ACL-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      User_ID: userId,
      Role: text(user.Role || user.role),
      Permission: key,
      Status: current ? "Inactive" : "Active",
      Created_At: new Date().toISOString(),
    };
    setSaving(`${userId}:${key}`); setError("");
    try { await landViewApi.createPermission(record); setRows((previous) => [...previous, record]); }
    catch (err: any) { setError(err?.message || "Could not update permission."); }
    finally { setSaving(""); }
  }

  async function changeStaffRole(user: Row, nextRole: "employee" | "manager") {
    const userId = text(user.User_ID || user.userId);
    const employeeId = text(user.Employee_ID || user.employeeId);
    const currentRole = role(user);
    const name = text(user.Name || user.name) || employeeId || userId;
    if (!userId || (currentRole !== "employee" && currentRole !== "manager")) return;
    if (!employeeId) return setError(`${name} is not linked to an employee record, so the staff role cannot be changed here.`);
    if (currentRole === nextRole) return;

    const nextLabel = nextRole === "manager" ? "Manager" : "Employee";
    if (!window.confirm(`${nextRole === "manager" ? "Promote" : "Demote"} ${name} (${employeeId}) to ${nextLabel}?`)) return;

    setSaving(`role:${userId}`); setError(""); setNotice(""); setResetResult(null);
    try {
      const response = await fetch("/api/admin/user-role", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ userId, role: nextRole }),
      });
      const result = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!response.ok || !result?.success) throw new Error(String(result?.error || `Role update failed with HTTP ${response.status}.`));
      setNotice(`${name} is now ${nextLabel}. The new authority applies on the next session refresh or sign-in.`);
      await load();
    } catch (err: any) { setError(err?.message || "Could not update this staff role."); }
    finally { setSaving(""); }
  }

  async function createAccount(event: React.FormEvent) {
    event.preventDefault(); setError(""); setNotice(""); setResetResult(null);
    const name = form.Name.trim(), username = form.Username.trim(), password = form.Password;
    if (!name || !username || password.length < 10) return setError("Name, username and a password of at least 10 characters are required.");
    setSaving("create-user");
    try {
      await landViewApi.createUser({ Name: name, Username: username, Role: form.Role, Password: password, Active: "TRUE", Must_Change_Password: "TRUE", Created_Date: new Date().toISOString() });
      setNotice(`${name} was created successfully with the ${roleLabel(form.Role.toLowerCase())} role.`);
      setForm({ Name: "", Username: "", Role: "Manager", Password: "" });
      await load();
    } catch (err: any) { setError(err?.message || "Could not create account."); }
    finally { setSaving(""); }
  }

  async function resetPassword(user: Row) {
    const userId = text(user.User_ID || user.userId); const name = text(user.Name || user.name) || userId;
    if (!userId) return setError("This account has no User ID.");
    if (!window.confirm(`Reset the password for ${name} (${userId})? Existing sessions will be revoked.`)) return;
    setSaving(`reset:${userId}`); setError(""); setNotice(""); setResetResult(null); setCopied(false);
    try { const result = await landViewApi.resetUserPassword(userId); setResetResult(result); setNotice(`Password reset completed for ${name}.`); }
    catch (err: any) { setError(err?.message || "Could not reset this password."); }
    finally { setSaving(""); }
  }

  async function deleteAccount(user: Row) {
    const userId = text(user.User_ID || user.userId); const name = text(user.Name || user.name) || userId;
    if (!userId) return setError("This account has no User ID.");
    if (role(user) === "admin") return setError("Admin accounts cannot be deleted here.");
    if (!window.confirm(`Delete ${name} (${userId})? This removes the login and its permission overrides.`)) return;
    setSaving(`delete:${userId}`); setError(""); setNotice("");
    try { await landViewApi.deleteUser(userId); setNotice(`${name} was deleted.`); await load(); }
    catch (err: any) { setError(err?.message || "Could not delete this account."); }
    finally { setSaving(""); }
  }

  async function copyPassword() {
    if (!resetResult?.temporaryPassword) return;
    try { await navigator.clipboard.writeText(resetResult.temporaryPassword); setCopied(true); } catch { setCopied(false); }
  }

  return <div className="rbac-page">
    <style>{`
      .rbac-page{color:var(--theme-ink-_edf2f5,#edf2f5);padding-bottom:30px}.rbac-page *{box-sizing:border-box}.rbac-head{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:16px}.rbac-head small{color:#ef6b65;font-size:9px;font-weight:900;letter-spacing:.14em}.rbac-head h1{margin:5px 0 0;font-size:34px}.rbac-head p{max-width:720px;margin:0;color:#94a1aa;font-size:11px;line-height:1.65}.role-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:18px}.role-card{border:1px solid #303d47;border-radius:12px;background:#101820;padding:15px}.role-card strong{display:block;font-size:15px}.role-card em{display:block;margin:4px 0 9px;color:#ef746d;font-size:9px;font-style:normal;font-weight:900;text-transform:uppercase;letter-spacing:.07em}.role-card p{margin:0;color:#8c99a2;font-size:10px;line-height:1.55}.rbac-note{padding:12px 14px;border:1px solid #3a4650;border-radius:9px;background:#121b23;color:#aab5be;font-size:10px;line-height:1.6;margin-bottom:16px}.rbac-note strong{color:#fff}.rbac-create{display:grid;grid-template-columns:1.4fr 1.2fr .85fr 1.15fr auto;gap:8px;padding:13px;border:1px solid #34414b;border-radius:11px;background:#101820;margin-bottom:16px}.rbac-create input,.rbac-create select{min-width:0;border:1px solid #34414b;border-radius:8px;background:#0b1218;color:#eef2f5;padding:10px}.rbac-create button,.rbac-action{border:1px solid #d61f26;border-radius:8px;background:#d61f26;color:#fff;padding:9px 12px;font-size:9px;font-weight:900;cursor:pointer}.rbac-action.secondary{border-color:#4a5862;background:#172129}.rbac-action.role-change{border-color:#8a5a18;background:#3a2811;color:#ffd58b}.rbac-action.danger{border-color:#6b3035;background:#211315;color:#ff9b9b}.rbac-action:disabled,.rbac-create button:disabled{opacity:.45;cursor:not-allowed}.rbac-msg{padding:11px 13px;border-radius:8px;margin-bottom:12px;font-size:10px}.rbac-msg.error{border:1px solid #6f2b2e;background:#35191a;color:#ff9b9b}.rbac-msg.ok{border:1px solid #2e6541;background:#15301f;color:#a9deb8}.reset-box{padding:13px;border:1px solid #704146;border-radius:10px;background:#211416;margin-bottom:15px}.reset-box code{display:inline-block;margin:7px 8px 0 0;padding:9px 11px;border-radius:7px;background:#090e12;font-weight:800}.users{display:grid;gap:10px}.user-card{border:1px solid #34414b;border-radius:11px;background:#101820;overflow:hidden}.user-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 15px;background:#16212a;cursor:pointer}.user-id strong{display:block;font-size:13px}.user-id small{display:block;margin-top:3px;color:#8b99a4;font-size:9px}.user-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end}.role-pill{padding:5px 8px;border-radius:999px;background:#242f38;color:#bec8cf;font-size:8px;font-weight:900;text-transform:uppercase}.role-pill.admin{background:#4a1619;color:#ffaaa5}.role-pill.manager{background:#493516;color:#ffd58b}.user-body{border-top:1px solid #28333c}.policy-summary{padding:13px 15px;color:#aab5be;font-size:10px;line-height:1.6}.policy-summary strong{color:#fff}.perm-group{padding:12px 14px;border-top:1px solid #28333c}.perm-title{margin-bottom:8px;color:#ef746d;font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.1em}.perm-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.perm{min-height:52px;padding:9px 10px;border:1px solid #2e3942;border-radius:8px;background:#0d151c;color:#c7d0d7;display:flex;justify-content:space-between;align-items:center;gap:8px;text-align:left;font-size:9px;font-weight:800}.perm.on{border-color:#315d42;background:#14271c;color:#b8e8c5}.perm.locked{opacity:.72}.switch{flex:0 0 auto;width:32px;height:18px;border-radius:999px;background:#39444d;position:relative}.switch:after{content:"";position:absolute;width:12px;height:12px;left:3px;top:3px;border-radius:50%;background:white;transition:.16s}.perm.on .switch{background:#2d8652}.perm.on .switch:after{transform:translateX(14px)}button.perm{cursor:pointer}button.perm:disabled{cursor:not-allowed}.empty{padding:24px;text-align:center;color:#8d99a2}@media(max-width:1050px){.role-grid{grid-template-columns:1fr 1fr}.rbac-create{grid-template-columns:1fr 1fr}.perm-grid{grid-template-columns:1fr 1fr}}@media(max-width:650px){.rbac-head{align-items:flex-start;flex-direction:column}.role-grid,.rbac-create,.perm-grid{grid-template-columns:1fr}.user-head{align-items:flex-start;flex-direction:column}.user-actions{justify-content:flex-start}}
    `}</style>

    <header className="rbac-head"><div><small>LAND VIEW / ACCESS CONTROL</small><h1>Roles & permissions</h1></div><p>Roles now define the normal authority level. Admin keeps critical system control, Management runs office operations, Employees work only with assigned resources, and Clients stay inside their own project portal.</p></header>

    <section className="role-grid">{ROLE_TEMPLATE_SUMMARIES.map((template) => <article className="role-card" key={template.role}><strong>{template.label}</strong><em>{template.subtitle}</em><p>{template.summary}</p></article>)}</section>

    <div className="rbac-note"><strong>Role changes:</strong> Employee-linked accounts can be promoted to Manager or demoted back to Employee directly below. <strong>Financial protection:</strong> Management can view the Main Ledger and operate billing, but Main Accounts entry, historical Ledger editing/reordering, Municipality history editing, sending Municipality balance to Main Ledger, employee account administration and Access Control remain Admin-only.</div>

    <form className="rbac-create" onSubmit={createAccount}><input aria-label="Full name" placeholder="Full name" value={form.Name} onChange={(e) => setForm((v) => ({ ...v, Name: e.target.value }))}/><input aria-label="Username" placeholder="Username / login ID" value={form.Username} onChange={(e) => setForm((v) => ({ ...v, Username: e.target.value }))}/><select aria-label="Role" value={form.Role} onChange={(e) => setForm((v) => ({ ...v, Role: e.target.value }))}><option value="Admin">Admin</option><option value="Manager">Management</option><option value="Employee">Employees</option><option value="Client">Clients</option></select><input aria-label="Temporary password" type="password" placeholder="Temporary password" value={form.Password} onChange={(e) => setForm((v) => ({ ...v, Password: e.target.value }))}/><button disabled={saving === "create-user"}>{saving === "create-user" ? "Creating…" : "Add user"}</button></form>

    {error && <div className="rbac-msg error">{error}</div>}{notice && <div className="rbac-msg ok">{notice}</div>}
    {resetResult && <div className="reset-box"><strong>Temporary password for {resetResult.username}</strong><div><code>{resetResult.temporaryPassword}</code><button type="button" className="rbac-action secondary" onClick={() => void copyPassword()}>{copied ? "Copied" : "Copy password"}</button></div></div>}

    {loading ? <div className="empty">Loading role assignments…</div> : <div className="users">{staff.map((user) => {
      const userId = text(user.User_ID || user.userId); const userRole = role(user); const isOpen = expanded === userId; const defaults = roleDefaultPermissions(userRole);
      const employeeId = text(user.Employee_ID || user.employeeId);
      const template = ROLE_TEMPLATE_SUMMARIES.find((item) => item.role === userRole);
      const roleChanging = saving === `role:${userId}`;
      return <section className="user-card" key={userId || text(user.Username)}>
        <div className="user-head" role="button" tabIndex={0} onClick={() => setExpanded(isOpen ? "" : userId)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpanded(isOpen ? "" : userId); }}>
          <div className="user-id"><strong>{text(user.Name || user.name) || userId}</strong><small>{userId} · {text(user.Username || user.username)}{employeeId ? ` · ${employeeId}` : ""}</small></div>
          <div className="user-actions" onClick={(e) => e.stopPropagation()}>
            <span className={`role-pill ${userRole}`}>{roleLabel(userRole)}</span>
            {userRole === "employee" && employeeId && <button type="button" className="rbac-action role-change" disabled={roleChanging} onClick={() => void changeStaffRole(user, "manager")}>{roleChanging ? "Updating…" : "Promote to Manager"}</button>}
            {userRole === "manager" && employeeId && <button type="button" className="rbac-action role-change" disabled={roleChanging} onClick={() => void changeStaffRole(user, "employee")}>{roleChanging ? "Updating…" : "Demote to Employee"}</button>}
            <button type="button" className="rbac-action secondary" disabled={saving === `reset:${userId}`} onClick={() => void resetPassword(user)}>{saving === `reset:${userId}` ? "Resetting…" : "Reset password"}</button>
            {userRole !== "admin" && <button type="button" className="rbac-action danger" disabled={saving === `delete:${userId}`} onClick={() => void deleteAccount(user)}>{saving === `delete:${userId}` ? "Deleting…" : "Delete"}</button>}
          </div>
        </div>
        {isOpen && <div className="user-body">
          <div className="policy-summary"><strong>{template?.label || roleLabel(userRole)} template:</strong> {template?.summary || "Role policy."}{userRole === "employee" ? " Admin may customize the Employee permissions below." : userRole === "manager" ? " This Management template is deliberately fixed so critical Admin-only authority cannot drift over time." : ""}</div>
          {(userRole === "admin" || userRole === "client") ? null : groups.map((group) => <div className="perm-group" key={group.group}><div className="perm-title">{group.group}</div><div className="perm-grid">{group.items.map((item) => {
            const override = latestOverride(rows, userId, item.key); const effective = override === undefined ? Boolean(defaults[item.key]) : override;
            const editable = userRole === "employee" && !item.adminOnly;
            const className = `perm ${effective ? "on" : ""} ${editable ? "" : "locked"}`;
            return editable ? <button type="button" key={item.key} className={className} disabled={saving === `${userId}:${item.key}`} title={item.description || item.key} onClick={() => void toggleEmployee(user, item.key)}><span>{item.label}</span><b className="switch"/></button> : <div key={item.key} className={className} title={item.adminOnly ? "Admin-only permission" : "Defined by the Management role template"}><span>{item.label}</span><b className="switch"/></div>;
          })}</div></div>)}
        </div>}
      </section>;
    })}{!staff.length && <div className="empty">No LAND VIEW role accounts found.</div>}</div>}
  </div>;
}