"use client";

import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";

type Row = Record<string, any>;
const modules = [
  ["projects.view","Projects · View"],["projects.edit","Projects · Edit"],
  ["workflow.view","Workflow · View"],["workflow.edit","Workflow · Edit"],["workflow.assign","Workflow · Assign team"],
  ["documents.view","Documents · View"],["documents.edit","Documents · Upload / Edit"],
  ["site.view","Site Supervision · View"],["site.edit","Site Supervision · Add / Edit"],
  ["certificates.view","Certificates · View"],["certificates.process","Certificates · Process"],["certificates.issue","Certificates · Issue"],
  ["finance.view","Finance · View"],["finance.edit","Finance · Edit"],
  ["employees.view","Employees · View"],["employees.manage","Employees · Manage"],
  ["attendance.view","Attendance · View"],["attendance.edit","Attendance · Edit"],
  ["expenses.submit","Expenses · Submit"],["expenses.view_all","Expenses · View all"],["expenses.approve","Expenses · Approve / Reject"],
  ["public.view","Public Website · View"],["public.edit","Public Website · Edit"],
  ["reports.view","Reports · View / Export"],
] as const;

function text(v:any){return String(v??"").trim()}
function latestPermission(rows:Row[], userId:string, key:string){
  const matches=rows.filter(r=>text(r.User_ID||r["User ID"])===userId && text(r.Permission)===key)
    .sort((a,b)=>new Date(text(a.Created_At||a["Created At"])||0).getTime()-new Date(text(b.Created_At||b["Created At"])||0).getTime());
  const last=matches[matches.length-1];
  return !!last && text(last.Status).toLowerCase()==="active";
}

export default function AccessControlPage(){
  const [users,setUsers]=useState<Row[]>([]),[permissions,setPermissions]=useState<Row[]>([]);
  const [loading,setLoading]=useState(true),[saving,setSaving]=useState(""),[error,setError]=useState("");
  async function load(){setLoading(true);setError("");try{const [u,p]=await Promise.all([landViewApi.getUsers(),landViewApi.getPermissions()]);setUsers(u||[]);setPermissions(p||[]);}catch(e:any){setError(e?.message||"Could not load access control.");}finally{setLoading(false)}}
  useEffect(()=>{void load()},[]);
  const staff=useMemo(()=>users.filter(u=>["employee","manager","accounts"].includes(text(u.Role||u.role).toLowerCase())),[users]);
  async function toggle(user:Row,key:string){
    const userId=text(user.User_ID||user.userId); const enabled=latestPermission(permissions,userId,key); const marker=`${userId}:${key}`; setSaving(marker);
    try{
      const record={Permission_ID:`ACL-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,User_ID:userId,Role:text(user.Role||user.role),Permission:key,Status:enabled?"Inactive":"Active",Created_At:new Date().toISOString()};
      await landViewApi.createPermission(record); setPermissions(prev=>[...prev,record]);
    }catch(e:any){setError(e?.message||"Could not update permission.");}finally{setSaving("")}
  }
  return <div className="acl-page"><style>{`
    .acl-page{color:#eef2f5}.acl-head{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:22px}.acl-head h1{margin:5px 0 0;font-size:34px}.acl-head p{max-width:620px;color:#97a3ad;font-size:12px;line-height:1.6}.acl-note{padding:12px 14px;border:1px solid #3a4650;border-radius:9px;background:#121b23;color:#aab5be;font-size:11px;margin-bottom:18px}.acl-error{padding:12px 14px;background:#35191a;border:1px solid #6f2b2e;border-radius:8px;color:#ff9b9b;margin-bottom:16px}.acl-list{display:grid;gap:14px}.acl-user{border:1px solid #34414b;border-radius:12px;background:#101820;overflow:hidden}.acl-user-head{padding:15px 17px;background:#16212a;display:flex;justify-content:space-between;gap:12px}.acl-user-head strong{font-size:13px}.acl-user-head small{color:#8b99a4}.acl-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:#2a343d}.acl-toggle{min-height:62px;padding:11px 13px;border:0;background:#101820;color:#c7d0d7;text-align:left;display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer}.acl-toggle span{font-size:11px}.acl-toggle b{width:36px;height:20px;border-radius:999px;background:#39444d;position:relative}.acl-toggle b:after{content:"";position:absolute;width:14px;height:14px;left:3px;top:3px;border-radius:50%;background:white;transition:.18s}.acl-toggle.on b{background:#d61f26}.acl-toggle.on b:after{transform:translateX(16px)}.acl-toggle:disabled{opacity:.5}@media(max-width:900px){.acl-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:600px){.acl-head{align-items:start;flex-direction:column}.acl-grid{grid-template-columns:1fr}}
  `}</style><div className="acl-head"><div><small>MAIN ADMIN CONTROL</small><h1>Employee permissions</h1></div><p>You remain unrestricted. Toggle exactly what each employee, manager or accounts user may see or change. Every change is written to the Permissions log.</p></div><div className="acl-note">View and Edit are separate. Expense approval can be granted without giving full finance or admin access.</div>{error&&<div className="acl-error">{error}</div>}{loading?<div>Loading permissions…</div>:<div className="acl-list">{staff.map(user=>{const userId=text(user.User_ID||user.userId);return <section className="acl-user" key={userId}><div className="acl-user-head"><div><strong>{text(user.Name||user.name)||userId}</strong><small>{userId} · {text(user.Role||user.role)}</small></div></div><div className="acl-grid">{modules.map(([key,label])=>{const on=latestPermission(permissions,userId,key);return <button key={key} className={`acl-toggle ${on?"on":""}`} disabled={saving===`${userId}:${key}`} onClick={()=>void toggle(user,key)}><span>{label}</span><b/></button>})}</div></section>})}{!staff.length&&<div>No staff accounts found.</div>}</div>}</div>
}