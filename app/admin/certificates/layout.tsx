import Link from "next/link";
import { ReactNode } from "react";

export default function CertificateLayout({ children }: { children: ReactNode }) {
  return <>
    <nav style={{maxWidth:1500,margin:"0 auto",padding:"14px 22px 0",display:"flex",gap:8,flexWrap:"wrap"}}>
      <Link href="/admin/certificates" style={linkStyle}>Certificates</Link>
      <Link href="/admin/certificates/templates" style={linkStyle}>Templates</Link>
      <Link href="/admin/certificates/audit" style={linkStyle}>Audit History</Link>
    </nav>
    {children}
  </>;
}

const linkStyle = { textDecoration:"none", color:"#171717", background:"#fff", border:"1px solid #d0d5dd", borderRadius:9, padding:"8px 12px", fontSize:12, fontWeight:800 } as const;
