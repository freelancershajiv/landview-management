"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { landViewApi } from "@/lib/api";

export default function AdminControlLinks(){
  const [role,setRole]=useState("");
  useEffect(()=>{void landViewApi.getSession().then(s=>setRole(String(s?.user?.role||s?.user?.Role||"").toLowerCase())).catch(()=>{})},[]);
  if(role!=="admin"&&role!=="manager") return null;
  return <nav aria-label="Administration controls" style={{display:"flex",gap:8,flexWrap:"wrap",margin:"0 0 18px",padding:"10px 12px",border:"1px solid rgba(255,255,255,.1)",borderRadius:10,background:"#101820"}}>
    <span style={{alignSelf:"center",marginRight:4,color:"#7f8c96",fontSize:9,fontWeight:800,letterSpacing:".12em"}}>ADMIN CONTROLS</span>
    <Link href="/admin/access" style={{padding:"8px 11px",borderRadius:7,background:"#18232c",color:"#eef2f5",fontSize:11,fontWeight:800}}>Employee Permissions</Link>
    <Link href="/admin/expenses" style={{padding:"8px 11px",borderRadius:7,background:"#18232c",color:"#eef2f5",fontSize:11,fontWeight:800}}>Office Expenses</Link>
  </nav>
}
