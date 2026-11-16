import Link from "next/link";
import "./whatsapp-workspace.css";

/** Shared WhatsApp navigation; parent Admin layout supplies private-theme.css. */
export default function WhatsAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="lv-wa-nav-wrap">
        <nav className="lv-wa-nav" aria-label="WhatsApp management">
          <Link className="lv-wa-nav-link lv-wa-nav-pairing" href="/admin/whatsapp">
            <span aria-hidden="true">✉</span> Inbox & connection
          </Link>
          <Link className="lv-wa-nav-link lv-wa-nav-operations" href="/admin/whatsapp/operations">
            <span aria-hidden="true">▤</span> Delivery & rules
          </Link>
        </nav>
      </div>
      <div className="lv-wa-workspace">{children}</div>
    </>
  );
}
