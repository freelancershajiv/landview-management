"use client";

import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";

type Row=Record<string,any>;
type PermissionDef={key:string;label:string;group:string;description?:string};
type ResetResult={userId:string;username:string;temporaryPassword:string}|null;

const permissions:PermissionDef[]=[
  {key:"dashboard.view",label:"Dashboard",group:"Workspace tabs",description:"See the shared LAND VIEW command center."},
  {key:"projects.view",label:"Projects · View",group:"Workspace tabs"},{key:"projects.edit",label:"Projects · Edit",group:"Projects"},
  {key:"workflow.view",label:"Workflow · View",group:"Workspace tabs"},{key:"workflow.edit",label:"Workflow · Edit",group:"Workflow"},{key:"workflow.assign",label:"Workflow · Assign team",group:"Workflow"},
  {key:"employees.view",label:"Employees · View",group:"Workspace tabs"},{key:"employees.manage",label:"Employees · Manage",group:"Employees"},
  {key:"requests.view",label:"Requests",group:"Workspace tabs"},
  {key:"certificates.view",label:"Certificates · View",group:"Workspace tabs"},{key:"certificates.process",label:"Certificates · Process",group:"Certificates"},{key:"certificates.issue",label:"Certificates · Issue",group:"Certificates"},
  {key:"finance.view",label:"Finance · View",group:"Workspace tabs"},{key:"finance.edit",label:"Finance · Edit",group:"Finance"},
  {key:"accounts.view",label:"Accounts",group:"Workspace tabs"},{key:"accounts.edit",label:"Accounts · Create entries",group:"Accounts"},
  {key:"ledger.view",label:"Ledger",group:"Workspace tabs"},
  {key:"proposals.view",label:"Proposals · View",group:"Workspace tabs"},{key:"proposals.create",label:"Proposals · Add client",group:"Proposals"},{key:"proposals.edit",label:"Proposals · Edit",group:"Proposals"},{key:"proposals.print",label:"Proposals · Print / Save PDF",group:"Proposals"},{key:"proposals.view_all",label:"Proposals · View all staff",group:"Proposals"},{key:"proposals.convert",label:"Proposals · Convert",group:"Proposals"},
  {key:"documents.view",label:"Documents · View",group:"Project records"},{key:"documents.edit",label:"Documents · Upload / Edit",group:"Project records"},
  {key:"site.view",label:"Site Supervision · View",group:"Project records"},{key:"site.edit",label:"Site Supervision · Add / Edit",group:"Project records"},
  {key:"attendance.view",label:"Attendance · View",group:"People operations"},{key:"attendance.edit",label:"Attendance · Edit",group:"People operations"},
  {key:"expenses.submit",label:"Expenses · Submit",group:"Accounts"},{key:"expenses.view_all",label:"Expenses · View all",group:"Accounts"},{key:"expenses.approve",label:"Expenses · Approve / Reject",group:"Accounts"},
  {key:"public.view",label:"Public Website · View",group:"Website"},{key:"public.edit",label:"Public Website · Edit",group:"Website"},{key:"reports.view",label:"Reports · View / Export",group:"Reports"},
];
const groupOrder=["Workspace tabs","Proposals","Projects","Workflow","Employees","Certificates","Finance","Accounts","Project records","People operations","Website","Reports"];
function text(v:any){return String(v??"").trim()}
function latestPermission(rows:Row[],userId:string,key:string){const matches=rows.filter(r=>text(r.User_ID||r["User ID"])===userId&&text(r.Permission)===key).sort((a,b)=>new Date(text(a.Created_At||a["Created At"])||0).getTime()-new Date(text(b.Created_At||b["Created At"])||0).getTime());const last=matches[matches.length-1];return !!last&&text(last.Status).toLowerCase()==="active"}
function role(row:Row){return text(row.Role||row.role).toLowerCase()}
function roleLabel(value:string){if(value==="manager")return "Management";if(value==="employee")return "Employees";if(value==="client")return "Clients";if(value==="admin")return "Admin";return value||"User"}

export default function PermissionMatrixV2(){
  const [users,setUsers]=useState<Row[]>([]),[rows,setRows]=useState<Row[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [resetResult,setResetResult]=useState<ResetResult>(null);
  const [copied,setCopied]=useState(false);
  const [expandedUserId,setExpandedUserId]=useState("");
  const [form,setForm]=useState({Name:"",Username:"",Role:"Manager",Password:""});
  async function load(){setLoading(true);setError("");try{const [u,p]=await Promise.all([landViewApi.getUsers(),landViewApi.getPermissions()]);setUsers(u||[]);setRows(p||[])}catch(e:any){setError(e?.message||"Could not load user permissions.")}finally{setLoading(false)}}
  useEffect(()=>{void load()},[]);
  const staff=useMemo(()=>users.filter(u=>["admin","manager","employee","client"].includes(role(u))),[users]);
  const grouped=useMemo(()=>groupOrder.map(group=>({group,items:permissions.filter(p=>p.group===group)})).filter(g=>g.items.length),[]);
  async function toggle(user:Row,key:string){const userId=text(user.User_ID||user.userId);const enabled=latestPermission(rows,userId,key);const marker=`${userId}:${key}`;setSaving(marker);setError("");try{const record={Permission_ID:`ACL-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,User_ID:userId,Role:text(user.Role||user.role),Permission:key,Status:enabled?"Inactive":"Active",Created_At:new Date().toISOString()};await landViewApi.createPermission(record);setRows(prev=>[...prev,record])}catch(e:any){setError(e?.message||"Could not update permission.")}finally{setSaving("")}}
  async function createAccount(e:React.FormEvent){e.preventDefault();setError("");setNotice("");setResetResult(null);const name=form.Name.trim(),username=form.Username.trim(),password=form.Password;if(!name||!username||password.length<10){setError("Name, username and a password of at least 10 characters are required.");return}setSaving("create-user");try{const created:any=await landViewApi.createUser({Name:name,Username:username,Role:form.Role,Password:password,Active:"TRUE",Must_Change_Password:"TRUE",Created_Date:new Date().toISOString()});setNotice(`${name} was created successfully.`);setForm({Name:"",Username:"",Role:"Manager",Password:""});await load();}catch(e:any){try{const fresh:any[]=await landViewApi.getUsers();const saved=(fresh||[]).find(u=>text(u.Username||u.username).toLowerCase()===username.toLowerCase());if(saved){setUsers(fresh);setNotice(`${name} was created successfully. The server response was interrupted, but the saved account was verified in the Users database.`);setError("");setForm({Name:"",Username:"",Role:"Manager",Password:""});return}}catch{}setError(e?.message||"Could not create account.")}finally{setSaving("")}}
  async function deleteAccount(user:Row){
    const userId=text(user.User_ID||user.userId); const name=text(user.Name||user.name)||userId; const userRole=role(user);
    if(!userId)return setError("This account has no User ID and cannot be deleted.");
    if(userRole==="admin")return setError("Admin accounts cannot be deleted from Access Control.");
    if(!window.confirm(`Delete the account for ${name} (${userId})?\\n\\nThis permanently removes the LAND VIEW login and its access-control permissions. This cannot be undone.`))return;
    setError("");setNotice("");setResetResult(null);setSaving(`delete:${userId}`);
    try{await landViewApi.deleteUser(userId);setNotice(`Account ${userId} was deleted successfully.`);await load();}catch(e:any){setError(e?.message||"Could not delete this account.")}finally{setSaving("")}
  }
  async function resetPassword(user:Row){
    const userId=text(user.User_ID||user.userId);
    const name=text(user.Name||user.name)||userId;
    if(!userId)return setError("This account has no User ID and cannot be reset.");
    if(!window.confirm(`Reset the password for ${name} (${userId})?\n\nThis creates a new temporary password, requires a password change at next login, and revokes the user's existing sessions.`))return;
    setError("");setNotice("");setResetResult(null);setCopied(false);setSaving(`reset:${userId}`);
    try{
      const result=await landViewApi.resetUserPassword(userId);
      setResetResult(result);
      setNotice(`Password reset completed for ${name}. Copy the temporary password below before leaving this page.`);
      await load();
    }catch(e:any){setError(e?.message||"Could not reset this user's password.")}
    finally{setSaving("")}
  }
  async function copyTemporaryPassword(){
    if(!resetResult?.temporaryPassword)return;
    try{await navigator.clipboard.writeText(resetResult.temporaryPassword);setCopied(true)}catch{setCopied(false)}
  }
  return <div className="pm-page"><style>{`
    .pm-page{color:var(--theme-ink-_eef2f5, #eef2f5)}.pm-head{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:18px}.pm-head h1{margin:5px 0 0;font-size:34px}.pm-head p{max-width:700px;color:var(--theme-ink-_97a3ad, #97a3ad);font-size:12px;line-height:1.65}.pm-note{padding:12px 14px;border:1px solid var(--theme-line-_3a4650, #3a4650);border-radius:9px;background:var(--theme-bg-_121b23, #121b23);color:var(--theme-ink-_aab5be, #aab5be);font-size:11px;margin-bottom:18px}.pm-error,.pm-ok{padding:12px 14px;border-radius:8px;margin-bottom:16px}.pm-error{background:var(--theme-bg-_35191a, #35191a);border:1px solid var(--theme-line-_6f2b2e, #6f2b2e);color:var(--theme-ink-_ff9b9b, #ff9b9b)}.pm-ok{background:var(--theme-bg-_15301f, #15301f);border:1px solid var(--theme-line-_2e6541, #2e6541);color:var(--theme-ink-_a9deb8, #a9deb8)}.pm-reset-result{margin:0 0 18px;padding:15px;border:1px solid var(--theme-line-_704146, #704146);border-radius:11px;background:var(--theme-bg-_211416, #211416)}.pm-reset-result>strong{display:block;font-size:13px;color:var(--theme-ink-_fff, #fff)}.pm-reset-result>p{margin:5px 0 11px;color:var(--theme-ink-_c7aeb0, #c7aeb0);font-size:10px;line-height:1.5}.pm-reset-secret{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.pm-reset-secret code{display:block;min-width:260px;padding:11px 13px;border:1px solid var(--theme-line-_4c3437, #4c3437);border-radius:8px;background:var(--theme-bg-_0b0f12, #0b0f12);color:var(--theme-ink-_fff, #fff);font:700 14px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.04em}.pm-copy{border:1px solid var(--theme-line-_d61f26, #d61f26);border-radius:8px;background:#d61f26;color:#fff;padding:10px 13px;font-size:10px;font-weight:900;cursor:pointer}.pm-create{display:grid;grid-template-columns:1.4fr 1.2fr .8fr 1.1fr auto;gap:9px;margin:0 0 18px;padding:14px;border:1px solid var(--theme-line-_34414b, #34414b);border-radius:12px;background:var(--theme-bg-_101820, #101820)}.pm-create input,.pm-create select{min-width:0;border:1px solid var(--theme-line-_34414b, #34414b);border-radius:8px;background:var(--theme-bg-_0b1218, #0b1218);color:var(--theme-ink-_eef2f5, #eef2f5);padding:10px}.pm-create button{border:1px solid var(--theme-line-_e22d34, #e22d34);border-radius:8px;background:#d61f26;color:#fff;font-weight:900;padding:10px 15px;cursor:pointer}.pm-list{display:grid;gap:16px}.pm-user{border:1px solid var(--theme-line-_34414b, #34414b);border-radius:12px;background:var(--theme-bg-_101820, #101820);overflow:hidden;box-shadow:0 8px 24px var(--theme-shadow-rgba_0_0_0__10_, rgba(0,0,0,.10))}.pm-user-body{border-top:1px solid var(--theme-line-_28333c, #28333c)}.pm-user-head{padding:15px 17px;background:var(--theme-bg-_16212a, #16212a);display:flex;justify-content:space-between;gap:12px;align-items:center;cursor:pointer;transition:background .16s ease}.pm-user-head:hover{background:var(--theme-bg-_1a2630, #1a2630)}.pm-user-head.expanded{background:linear-gradient(90deg,var(--theme-bg-_1a2630, #1a2630),var(--theme-bg-_16212a, #16212a))}.pm-user-head:focus-visible{outline:2px solid var(--theme-line-_d61f26, #d61f26);outline-offset:-2px}.pm-user-identity{min-width:0;display:flex;align-items:center;gap:10px}.pm-user-chevron{width:24px;height:24px;display:grid;place-items:center;flex:0 0 24px;border:1px solid var(--theme-line-_394650, #394650);border-radius:6px;background:var(--theme-bg-_0d151c, #0d151c);color:var(--theme-ink-_aab5be, #aab5be);font-size:16px;line-height:1;transition:transform .16s ease,color .16s ease,border-color .16s ease}.pm-user-chevron.open{transform:rotate(90deg);color:var(--theme-ink-_ff777b, #ff777b);border-color:var(--theme-line-_7a2d31, #7a2d31)}.pm-user-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}.pm-user-head strong{display:block;font-size:14px}.pm-user-head small{display:block;margin-top:3px;color:var(--theme-ink-_8b99a4, #8b99a4)}.pm-role{padding:5px 8px;border-radius:999px;background:var(--theme-bg-_242f38, #242f38);color:var(--theme-ink-_bec8cf, #bec8cf);font-size:8px;font-weight:900;text-transform:uppercase}.pm-role.admin{background:var(--theme-bg-_4a1619, #4a1619);color:var(--theme-ink-_ffaaa5, #ffaaa5)}.pm-delete{border:1px solid var(--theme-line-_6b3035, #6b3035);border-radius:7px;background:var(--theme-bg-_211315, #211315);color:var(--theme-ink-_ff8f8f, #ff8f8f);padding:7px 10px;font-size:9px;font-weight:900;cursor:pointer}.pm-delete:hover{border-color:var(--theme-line-_b84b54, #b84b54);background:var(--theme-bg-_32191c, #32191c)}.pm-delete:disabled{opacity:.45;cursor:not-allowed}.pm-reset{border:1px solid var(--theme-line-_754048, #754048);border-radius:7px;background:var(--theme-bg-_2a171a, #2a171a);color:var(--theme-ink-_ffb1ad, #ffb1ad);padding:7px 10px;font-size:9px;font-weight:900;cursor:pointer}.pm-reset:hover{border-color:#b85a63;background:var(--theme-bg-_371c20, #371c20)}.pm-reset:disabled{opacity:.45;cursor:not-allowed}.pm-group{padding:12px 14px;border-top:1px solid var(--theme-line-_28333c, #28333c)}.pm-group-title{display:flex;align-items:center;gap:9px;margin-bottom:8px;color:var(--theme-ink-_ef746d, #ef746d);font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.pm-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.pm-toggle{min-height:58px;padding:10px 12px;border:1px solid var(--theme-line-_2e3942, #2e3942);border-radius:8px;background:var(--theme-bg-_0d151c, #0d151c);color:var(--theme-ink-_c7d0d7, #c7d0d7);text-align:left;display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer}.pm-toggle:hover{border-color:var(--theme-line-_4a5964, #4a5964)}.pm-toggle span{font-size:10px;font-weight:800}.pm-toggle b{flex:0 0 auto;width:36px;height:20px;border-radius:999px;background:var(--theme-bg-_39444d, #39444d);position:relative}.pm-toggle b:after{content:"";position:absolute;width:14px;height:14px;left:3px;top:3px;border-radius:50%;background:var(--theme-bg-_fff, #fff);transition:.18s}.pm-toggle.on{border-color:var(--theme-line-_63282c, #63282c);background:var(--theme-bg-_201416, #201416);color:var(--theme-ink-_fff, #fff)}.pm-toggle.on b{background:#d61f26}.pm-toggle.on b:after{transform:translateX(16px)}.pm-toggle:disabled{opacity:.5}@media(max-width:1000px){.pm-grid{grid-template-columns:repeat(2,1fr)}.pm-create{grid-template-columns:1fr 1fr}}@media(max-width:650px){.pm-head{align-items:start;flex-direction:column}.pm-grid,.pm-create{grid-template-columns:1fr}.pm-user-head{align-items:flex-start;flex-direction:column}.pm-user-actions{justify-content:flex-start}.pm-reset-secret code{min-width:100%;width:100%}}
  `}</style>
  <div className="pm-head"><div><small>MAIN ADMIN CONTROL</small><h1>Users & permissions</h1></div><p>Create and manage LAND VIEW Admin, Management, Employees and Clients accounts from the same source of truth. New accounts are reloaded from the backend immediately after creation.</p></div>
  <div className="pm-note"><strong>Important:</strong> Admin and Management accounts have full workspace access. Detailed permission switches apply to Employees. Clients accounts are managed here for portal access and password resets. Use <strong>Reset password</strong> to issue a one-time temporary password; the user must change it after signing in and all existing sessions are revoked.</div>
  <form className="pm-create" onSubmit={createAccount}><input aria-label="Full name" placeholder="Full name" value={form.Name} onChange={e=>setForm(v=>({...v,Name:e.target.value}))}/><input aria-label="Username" placeholder="Username / login ID" value={form.Username} onChange={e=>setForm(v=>({...v,Username:e.target.value}))}/><select aria-label="Role" value={form.Role} onChange={e=>setForm(v=>({...v,Role:e.target.value}))}><option value="Admin">Admin</option><option value="Manager">Management</option><option value="Employee">Employees</option><option value="Client">Clients</option></select><input aria-label="Temporary password" type="password" placeholder="Temporary password" value={form.Password} onChange={e=>setForm(v=>({...v,Password:e.target.value}))}/><button disabled={saving==="create-user"}>{saving==="create-user"?"Creating…":"Add user"}</button></form>
  {error&&<div className="pm-error">{error}</div>}{notice&&<div className="pm-ok">{notice}</div>}
  {resetResult&&<div className="pm-reset-result" role="status"><strong>Temporary password for {resetResult.userId}{resetResult.username?` · ${resetResult.username}`:""}</strong><p>This password is shown only from the reset response. Copy it now and send it securely to the user. They will be required to change it after login.</p><div className="pm-reset-secret"><code>{resetResult.temporaryPassword}</code><button type="button" className="pm-copy" onClick={()=>void copyTemporaryPassword()}>{copied?"Copied":"Copy password"}</button></div></div>}
  {loading?<div>Loading users and permissions…</div>:<div className="pm-list">{staff.map(user=>{
    const userId=text(user.User_ID||user.userId);
    const userRole=role(user);
    const full=userRole==="admin"||userRole==="manager";
    const client=userRole==="client";
    const expanded=expandedUserId===userId;
    const displayName=text(user.Name||user.name)||userId;
    return <section className="pm-user" key={userId||text(user.Username)}>
      <div
        className={`pm-user-head ${expanded?"expanded":""}`}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={()=>setExpandedUserId(expanded?"":userId)}
        onKeyDown={(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setExpandedUserId(expanded?"":userId)}}}
      >
        <div className="pm-user-identity">
          <span className={`pm-user-chevron ${expanded?"open":""}`} aria-hidden="true">›</span>
          <div>
            <strong>{displayName}</strong>
            <small>{userId}{text(user.Username)?` · ${text(user.Username)}`:""}{text(user.Employee_ID)?` · ${text(user.Employee_ID)}`:""}{client&&text(user.Project_ID)?` · ${text(user.Project_ID)}`:""}</small>
          </div>
        </div>
        <div className="pm-user-actions" onClick={(event)=>event.stopPropagation()}>
          <span className={`pm-role ${userRole}`}>{roleLabel(userRole)}</span>
          {userRole!=="admin"&&<button type="button" className="pm-delete" disabled={!userId||saving===`delete:${userId}`} onClick={()=>void deleteAccount(user)}>{saving===`delete:${userId}`?"Deleting…":"Delete"}</button>}
          <button type="button" className="pm-reset" disabled={!userId||saving===`reset:${userId}`} onClick={()=>void resetPassword(user)}>{saving===`reset:${userId}`?"Resetting…":"Reset password"}</button>
        </div>
      </div>
      {expanded&&<div className="pm-user-body">
        {full?<div className="pm-group"><div className="pm-group-title">Full workspace access</div><div style={{color:"var(--theme-ink-_aab5be, #aab5be)",fontSize:11,lineHeight:1.6}}>This role has full management access by policy. It remains visible here for account administration but does not need individual permission switches.</div></div>:client?<div className="pm-group"><div className="pm-group-title">Client portal account</div><div style={{color:"var(--theme-ink-_aab5be, #aab5be)",fontSize:11,lineHeight:1.6}}>Client portal login is controlled here. Use <strong>Reset password</strong> to issue a temporary password and revoke the client’s existing sessions. The client must change the temporary password after signing in.</div></div>:grouped.map(group=><div className="pm-group" key={group.group}><div className="pm-group-title">{group.group}</div><div className="pm-grid">{group.items.map(item=>{const on=latestPermission(rows,userId,item.key);return <button type="button" key={item.key} className={`pm-toggle ${on?"on":""}`} disabled={saving===`${userId}:${item.key}`} title={item.description||item.key} onClick={()=>void toggle(user,item.key)}><span>{item.label}</span><b/></button>})}</div></div>)}
      </div>}
    </section>
  })}{!staff.length&&<div>No LAND VIEW management users found.</div>}</div>}
  </div>
}
