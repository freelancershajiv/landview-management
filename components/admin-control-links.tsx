"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { landViewApi } from "@/lib/api";

export default function AdminControlLinks(){
  const [role,setRole]=useState("");
  useEffect(()=>{void landViewApi.getSession().then(s=>setRole(String(s?.user?.role||s?.user?.Role||"").toLowerCase())).catch(()=>{})},[]);
  if(role!=="admin"&&role!=="manager") return null;
  const linkStyle={padding:"8px 11px",borderRadius:7,background:"var(--lv-surface-muted)",color:"var(--lv-text-primary)",border:"1px solid var(--lv-border)",fontSize:11,fontWeight:800,textDecoration:"none"} as const;
  return <nav aria-label="Administration controls" style={{display:"flex",gap:8,flexWrap:"wrap",margin:"0 0 18px",padding:"10px 12px",border:"1px solid var(--lv-border)",borderRadius:10,background:"var(--lv-surface)"}}>
    <span style={{alignSelf:"center",marginRight:4,color:"var(--lv-text-muted)",fontSize:9,fontWeight:800,letterSpacing:".12em"}}>ADMIN CONTROLS</span>
    <Link href="/admin/accounts" style={{...linkStyle,color:"var(--lv-action-text)",border:"1px solid var(--lv-action-primary-border)",background:"var(--lv-action-primary-soft)"}}>Accounts Ledger</Link>
    <Link href="/admin/accounts/entry" style={linkStyle}>New Ledger Entry</Link>
    <Link href="/admin/access" style={linkStyle}>Employee Permissions</Link>
    <Link href="/admin/expenses" style={linkStyle}>Office Expenses</Link>
    {role==="admin" ? <Link href="/admin/audit-log" style={{...linkStyle,border:"1px solid var(--lv-action-primary-border)",background:"var(--lv-action-primary-soft)",color:"var(--lv-action-text)"}}>Audit Log</Link> : null}
  </nav>
}
