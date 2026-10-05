"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { landViewApi } from "@/lib/api";

export default function AdminControlLinks(){
  const [role,setRole]=useState("");
  useEffect(()=>{void landViewApi.getSession().then(s=>setRole(String(s?.user?.role||s?.user?.Role||"").toLowerCase())).catch(()=>{})},[]);
  if(role!=="admin"&&role!=="manager") return null;
  const linkStyle={padding:"8px 11px",borderRadius:7,background:"var(--theme-bg-_18232c, #18232c)",color:"var(--theme-ink-_eef2f5, #eef2f5)",fontSize:11,fontWeight:800,textDecoration:"none"} as const;
  return <nav aria-label="Administration controls" style={{display:"flex",gap:8,flexWrap:"wrap",margin:"0 0 18px",padding:"10px 12px",border:"1px solid var(--theme-line-rgba_255_255_255__1_, rgba(255,255,255,.1))",borderRadius:10,background:"var(--theme-bg-_101820, #101820)"}}>
    <span style={{alignSelf:"center",marginRight:4,color:"var(--theme-ink-_7f8c96, #7f8c96)",fontSize:9,fontWeight:800,letterSpacing:".12em"}}>ADMIN CONTROLS</span>
    <Link href="/admin/accounts" style={{...linkStyle,background:"var(--theme-bg-_3a1719, #3a1719)",color:"var(--theme-ink-_ffaaa5, #ffaaa5)",border:"1px solid var(--theme-line-_6b292d, #6b292d)"}}>Accounts Ledger</Link>
    <Link href="/admin/accounts/entry" style={{...linkStyle,background:"var(--theme-bg-_182d24, #182d24)",color:"var(--theme-ink-_a7e4be, #a7e4be)",border:"1px solid var(--theme-line-_2e5c45, #2e5c45)"}}>New Ledger Entry</Link>
    <Link href="/admin/access" style={linkStyle}>Employee Permissions</Link>
    <Link href="/admin/expenses" style={linkStyle}>Office Expenses</Link>
  </nav>
}
