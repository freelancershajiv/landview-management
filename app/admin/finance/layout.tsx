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
        .finance-section-nav a{display:inline-flex;align-items:center;justify-content:center;min-height:36px;padding:8px 11px;border:1px solid var(--theme-line-_36414a,#36414a);border-radius:7px;background:var(--theme-bg-_151d24,#151d24);color:var(--theme-ink-_dbe3e8,#dbe3e8);font-size:11px;font-weight:900;text-decoration:none}
        .finance-section-nav a.primary{border-color:var(--lv-brand-border,#d94b45);background:var(--lv-brand-primary,#d94b45);color:#fff;box-shadow:0 5px 18px rgba(217,75,69,.18)}
        .finance-section-nav a:hover{border-color:var(--theme-line-_67737d,#67737d)}
        @media(max-width:760px){.finance-section-nav{display:grid;grid-template-columns:1fr 1fr}.finance-section-nav a{min-width:0;text-align:center}.finance-section-nav a.primary{grid-column:auto}}
        @media(max-width:440px){.finance-section-nav{grid-template-columns:1fr}}
      `}</style>
      <Link href="/admin/finance">Finance Home</Link>
      <Link href="/admin/finance/projects">Finance Projects</Link>
      <Link className="primary" href="/admin/finance/add-bill">+ Add Bill</Link>
      <Link className="primary" href="/admin/finance/direct-bill">+ New Full Bill</Link>
      <Link className="primary" href="/admin/finance/full-bill-editor">Edit Full Bill</Link>
      <Link href="/admin/finance/invoices">Generate Invoice</Link>
      <Link href="/admin/finance/service-payments">Add Payment</Link>
      <Link href="/admin/finance/due-bills">Due Bills</Link>
      <Link href="/admin/accounts">Ledger</Link>
    </nav>
    {children}
  </>;
}
