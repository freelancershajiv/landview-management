import Link from "next/link";

export default function WhatsAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "18px 20px 0" }}>
        <nav style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 6, width: "fit-content", border: "1px solid #e2e8f0", borderRadius: 12, background: "#fff", boxShadow: "0 4px 18px rgba(15,23,42,.04)" }}>
          <Link href="/admin/whatsapp/operations" style={{ textDecoration: "none", color: "#991b1b", background: "#fef2f2", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 800 }}>Operations</Link>
          <Link href="/admin/whatsapp" style={{ textDecoration: "none", color: "#334155", borderRadius: 8, padding: "8px 12px", fontSize: 13, fontWeight: 800 }}>Pairing & Client Inbox</Link>
        </nav>
      </div>
      {children}
    </>
  );
}
