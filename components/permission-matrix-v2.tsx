"use client";

import { useEffect, useMemo, useState } from "react";
import { landViewApi } from "@/lib/api";

type Row=Record<string,any>;
type PermissionDef={key:string;label:string;group:string;description?:string};

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

export default function PermissionMatrixV2(){
  const [users,setUsers]=useState<Row[]>([]),[rows,setRows]=useState<Row[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(""),[error,setError]=useState("");
  async function load(){setLoading(true);setError("");try{const [u,p]=await Promise.all([landViewApi.getUsers(),landViewApi.getPermissions()]);setUsers(u||[]);setRows(p||[])}catch(e:any){setError(e?.message||"Could not load employee permissions.")}finally{setLoading(false)}}
  useEffect(()=>{void load()},[]);
  const staff=useMemo(()=>users.filter(u=>["employee","manager","accounts"].includes(text(u.Role||u.role).toLowerCase())),[users]);
  const grouped=useMemo(()=>groupOrder.map(group=>({group,items:permissions.filter(p=>p.group===group)})).filter(g=>g.items.length),[]);
  async function toggle(user:Row,key:string){const userId=text(user.User_ID||user.userId);const enabled=latestPermission(rows,userId,key);const marker=`${userId}:${key}`;setSaving(marker);setError("");try{const record={Permission_ID:`ACL-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,User_ID:userId,Role:text(user.Role||user.role),Permission:key,Status:enabled?"Inactive":"Active",Created_At:new Date().toISOString()};await landViewApi.createPermission(record);setRows(prev=>[...prev,record])}catch(e:any){setError(e?.message||"Could not update permission.")}finally{setSaving("")}}
  return <div className="pm-page"><style>{`
    .pm-page{color:#eef2f5}.pm-head{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:18px}.pm-head h1{margin:5px 0 0;font-size:34px}.pm-head p{max-width:700px;color:#97a3ad;font-size:12px;line-height:1.65}.pm-note{padding:12px 14px;border:1px solid #3a4650;border-radius:9px;background:#121b23;color:#aab5be;font-size:11px;margin-bottom:18px}.pm-error{padding:12px 14px;background:#35191a;border:1px solid #6f2b2e;border-radius:8px;color:#ff9b9b;margin-bottom:16px}.pm-list{display:grid;gap:16px}.pm-user{border:1px solid #34414b;border-radius:12px;background:#101820;overflow:hidden}.pm-user-head{padding:15px 17px;background:#16212a;display:flex;justify-content:space-between;gap:12px;align-items:center}.pm-user-head strong{display:block;font-size:14px}.pm-user-head small{display:block;margin-top:3px;color:#8b99a4}.pm-role{padding:5px 8px;border-radius:999px;background:#242f38;color:#bec8cf;font-size:8px;font-weight:900;text-transform:uppercase}.pm-group{padding:12px 14px;border-top:1px solid #28333c}.pm-group-title{display:flex;align-items:center;gap:9px;margin-bottom:8px;color:#ef746d;font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.pm-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.pm-toggle{min-height:58px;padding:10px 12px;border:1px solid #2e3942;border-radius:8px;background:#0d151c;color:#c7d0d7;text-align:left;display:flex;align-items:center;justify-content:space-between;gap:10px;cursor:pointer}.pm-toggle:hover{border-color:#4a5964}.pm-toggle span{font-size:10px;font-weight:800}.pm-toggle b{flex:0 0 auto;width:36px;height:20px;border-radius:999px;background:#39444d;position:relative}.pm-toggle b:after{content:"";position:absolute;width:14px;height:14px;left:3px;top:3px;border-radius:50%;background:#fff;transition:.18s}.pm-toggle.on{border-color:#63282c;background:#201416;color:#fff}.pm-toggle.on b{background:#d61f26}.pm-toggle.on b:after{transform:translateX(16px)}.pm-toggle:disabled{opacity:.5}@media(max-width:1000px){.pm-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:650px){.pm-head{align-items:start;flex-direction:column}.pm-grid{grid-template-columns:1fr}}
  `}</style>
  <div className="pm-head"><div><small>MAIN ADMIN CONTROL</small><h1>Employee permissions</h1></div><p>Employees use the same LAND VIEW management interface as Admin. You decide which tabs and functions each account can see or use. Permission changes are append-only and remain auditable.</p></div>
  <div className="pm-note"><strong>Workspace tabs</strong> controls navigation visibility. Detailed permissions such as Edit, Print, Issue or View all control actions inside those tabs. The Permission tab itself remains Main Admin-only.</div>
  {error&&<div className="pm-error">{error}</div>}
  {loading?<div>Loading permissions…</div>:<div className="pm-list">{staff.map(user=>{const userId=text(user.User_ID||user.userId);const role=text(user.Role||user.role);return <section className="pm-user" key={userId}><div className="pm-user-head"><div><strong>{text(user.Name||user.name)||userId}</strong><small>{userId}{text(user.Employee_ID)?` · ${text(user.Employee_ID)}`:""}</small></div><span className="pm-role">{role}</span></div>{grouped.map(group=><div className="pm-group" key={group.group}><div className="pm-group-title">{group.group}</div><div className="pm-grid">{group.items.map(item=>{const on=latestPermission(rows,userId,item.key);return <button key={item.key} className={`pm-toggle ${on?"on":""}`} disabled={saving===`${userId}:${item.key}`} title={item.description||item.key} onClick={()=>void toggle(user,item.key)}><span>{item.label}</span><b/></button>})}</div></div>)}</section>})}{!staff.length&&<div>No employee, manager or accounts users found.</div>}</div>}
  </div>
}
