import Link from "next/link";
import BillingLocationTagCleaner from "@/components/billing-location-tag-cleaner";
import "./invoices/invoice-revamp-print-fix.css";
import "./invoices/invoice-column-alignment-fix.css";

export default function FinanceLayout({ children }: { children: React.ReactNode }) {
  return <>
    <BillingLocationTagCleaner />
    <nav className="finance-section-nav" aria-label="Finance sections">
      <style>{`
        .finance-section-nav{display:flex;gap:7px;flex-wrap:wrap;margin:0 0 18px;padding:9px;border:1px solid var(--theme-line-_313b44,#313b44);border-radius:10px;background:var(--theme-bg-_11181e,#11181e)}
        .finance-section-nav a{display:inline-flex;align-items:center;min-height:36px;padding:8px 11px;border:1px solid var(--theme-line-_36414a,#36414a);border-radius:7px;background:var(--theme-bg-_151d24,#151d24);color:var(--theme-ink-_dbe3e8,#dbe3e8);font-size:11px;font-weight:900;text-decoration:none}
        .finance-section-nav a.primary{border-color:#8b4039;background:#3a211f;color:#ffd0cc}
        .finance-section-nav a:hover{border-color:var(--theme-line-_67737d,#67737d)}
        @media(max-width:720px){.finance-section-nav{display:grid;grid-template-columns:1fr 1fr}.finance-section-nav a{justify-content:center;text-align:center}}
      `}</style>
      <Link className="primary" href="/admin/finance/workspace">Billing 2.0</Link>
      <Link className="primary" href="/admin/finance/service-payments">Receive Payment</Link>
      <Link href="/admin/finance/payment-lifecycle">Invoices / Receipts</Link>
      <Link href="/admin/finance/adjustments">Credit / Debit Notes</Link>
      <Link href="/admin/finance/billing-control">Billing Controls</Link>
      <Link href="/admin/finance/control">Control Center</Link>
      <Link href="/admin/accounts">Accounts</Link>
    </nav>
    {children}
  </>;
}
