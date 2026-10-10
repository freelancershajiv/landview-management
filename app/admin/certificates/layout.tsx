import Link from "next/link";
import { ReactNode } from "react";
import CertificateRegistryPrintBridge from "@/components/certificate-registry-print-bridge";

export default function CertificateLayout({ children }: { children: ReactNode }) {
  return <>
    <CertificateRegistryPrintBridge />
    <style>{`
      .previewWrap {
        container-type: inline-size;
        overflow-x: hidden !important;
        overflow-y: auto !important;
      }
      .previewWrap .lv-cert-scroll {
        overflow: visible !important;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        min-width: 0;
      }
      .previewWrap .lv-cert {
        zoom: .92;
        margin-left: auto !important;
        margin-right: auto !important;
      }
      @container (max-width: 760px) { .previewWrap .lv-cert { zoom: .88; } }
      @container (max-width: 720px) { .previewWrap .lv-cert { zoom: .84; } }
      @container (max-width: 680px) { .previewWrap .lv-cert { zoom: .79; } }
      @container (max-width: 620px) { .previewWrap .lv-cert { zoom: .71; } }
      @container (max-width: 560px) { .previewWrap .lv-cert { zoom: .63; } }
      @container (max-width: 500px) { .previewWrap .lv-cert { zoom: .55; } }
      @container (max-width: 430px) { .previewWrap .lv-cert { zoom: .47; } }
      @container (max-width: 370px) { .previewWrap .lv-cert { zoom: .40; } }
    `}</style>
    <nav style={{maxWidth:1500,margin:"0 auto",padding:"14px 22px 0",display:"flex",gap:8,flexWrap:"wrap"}}>
      <Link href="/admin/certificates" style={linkStyle}>Certificates</Link>
      <Link href="/admin/certificates/templates" style={linkStyle}>Templates</Link>
      <Link href="/admin/certificates/audit" style={linkStyle}>Audit History</Link>
    </nav>
    {children}
  </>;
}

const linkStyle = { textDecoration:"none", color:"#171717", background:"#fff", border:"1px solid #d0d5dd", borderRadius:9, padding:"8px 12px", fontSize:12, fontWeight:800 } as const;
