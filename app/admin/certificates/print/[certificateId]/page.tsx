"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CertificateDocument, printCertificate } from "@/components/certificate-document";

type CertificateRecord = {
  certificateId:string; verificationUrl?:string; qrUrl?:string; issuedAt:string; type:"project"|"employee"|"intern"|"building"; category?:string;
  name:string; address:string; position:string; subject:string; reference:string; description:string; fatherName?:string; motherName?:string; nidNo?:string;
  expiresAt?:string; status?:string; revision?:number; parentId?:string; supersededBy?:string; revokedAt?:string; revokedReason?:string; deletedAt?:string; deletedReason?:string;
  institution?:string; department?:string; studentId?:string; supervisor?:string; trainingArea?:string; serviceFrom?:string; serviceTo?:string;
};

export default function CertificateRegistryPrintPage() {
  const params = useParams<{ certificateId: string }>();
  const router = useRouter();
  const certificateId = decodeURIComponent(String(params?.certificateId || ""));
  const [certificate, setCertificate] = useState<CertificateRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError("");
      try {
        const response = await fetch("/api/certificates", { cache:"no-store", credentials:"same-origin" });
        const json = await response.json();
        if (!response.ok || !json?.success) throw new Error(json?.error || "Could not load certificate registry.");
        const records = Array.isArray(json?.data?.certificates) ? json.data.certificates as CertificateRecord[] : [];
        const found = records.find(item => item.certificateId === certificateId);
        if (!found) throw new Error(`Certificate ${certificateId} was not found in the registry.`);
        if (!cancelled) setCertificate(found);
      } catch (err:any) {
        if (!cancelled) setError(err?.message || "Could not load certificate.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [certificateId]);

  async function handlePrint() {
    try { await printCertificate(); }
    catch (err:any) { setError(err?.message || "Could not print certificate."); }
  }

  return <main style={{maxWidth:1000,margin:"0 auto",padding:"22px"}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",marginBottom:14}}>
      <div><h1 style={{margin:0,fontSize:24}}>Registry Certificate</h1><p style={{margin:"4px 0 0",color:"#667085",fontSize:12}}>{certificateId}</p></div>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <button onClick={()=>router.push("/admin/certificates")} style={buttonStyle}>Back to Registry</button>
        {certificate?.verificationUrl && <button onClick={()=>window.open(certificate.verificationUrl,"_blank")} style={buttonStyle}>Verify</button>}
        {certificate && <button onClick={handlePrint} style={printStyle}>Print / Save PDF</button>}
      </div>
    </div>
    {error && <div style={{background:"#fef3f2",color:"#b42318",padding:"10px 12px",borderRadius:9,marginBottom:12,fontSize:13}}>{error}</div>}
    {loading ? <div style={panelStyle}>Loading certificate…</div> : certificate ? <>
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10,fontSize:12,color:"#475467"}}>
        <strong>Status: {certificate.status || "Active"}</strong><span>•</span><span>Revision {certificate.revision || 1}</span>
      </div>
      <div style={{...panelStyle,overflow:"auto"}}><CertificateDocument issued={certificate}/></div>
    </> : !error ? <div style={panelStyle}>Certificate not found.</div> : null}
  </main>;
}

const buttonStyle={border:"1px solid #d0d5dd",background:"#fff",borderRadius:9,padding:"9px 13px",fontWeight:800,cursor:"pointer"} as const;
const printStyle={...buttonStyle,background:"#171717",color:"#fff",borderColor:"#171717"} as const;
const panelStyle={background:"#f2f4f7",border:"1px solid #e4e7ec",borderRadius:12,padding:15} as const;
