"use client";

import { useState } from "react";

export default function ReceiptPrintActions() {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true); setError("");
    } catch { setError("Copy unavailable. Share this page address instead."); }
  }
  return <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
    <button type="button" onClick={() => window.print()} style={primary}>Print / Save PDF</button>
    <button type="button" onClick={() => void copyLink()} style={secondary}>{copied ? "Link copied" : "Copy verification link"}</button>
    {error && <small role="alert" style={{color:"#b42318"}}>{error}</small>}
  </div>;
}

const primary = {border:0,borderRadius:8,padding:"11px 14px",background:"#b4232c",color:"#fff",fontWeight:800,cursor:"pointer",fontSize:12};
const secondary = {border:"1px solid #d1d9e0",borderRadius:8,padding:"10px 13px",background:"#fff",color:"#1c2730",fontWeight:800,cursor:"pointer",fontSize:12};
