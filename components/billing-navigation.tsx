"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const main = [
  { href: "/admin/billing", label: "Overview" },
  { href: "/admin/billing/workspace", label: "Project Billing" },
  { href: "/admin/billing/bills", label: "Bill Manager" },
  { href: "/admin/billing/invoice-center", label: "Invoice Center" },
  { href: "/admin/billing/service-payments", label: "Receive Payment" },
  { href: "/admin/billing/due-bills", label: "Due Bills" },
];
const advanced = [
  { href: "/admin/billing/add-bill", label: "Add Single Bill" },
  { href: "/admin/billing/direct-bill", label: "Create Full Bill" },
  { href: "/admin/billing/full-bill-editor", label: "Edit Full Bill" },
  { href: "/admin/billing/invoices", label: "Print / Generate Invoice" },
  { href: "/admin/billing/payment-lifecycle", label: "Payment Lifecycle & Advances" },
  { href: "/admin/billing/adjustments", label: "Credit / Debit Notes" },
  { href: "/admin/billing/allocation-corrections", label: "Allocation Corrections" },
  { href: "/admin/billing/integrity", label: "Financial Integrity" },
  { href: "/admin/billing/billing-control", label: "Billing Controls" },
];
export default function BillingNavigation() {
  const pathname = usePathname();
  const active = (href: string) => pathname === href || href !== "/admin/billing" && pathname.startsWith(href + "/");
  return <div className="billing-nav-shell">
    <style>{`
      .billing-nav-shell{margin-bottom:17px;display:grid;gap:7px;color:var(--lv-text-primary)}
      .billing-nav-core{display:flex;flex-wrap:wrap;gap:7px;padding:10px;border:1px solid var(--lv-border-default);border-radius:12px;background:var(--lv-surface-panel)}
      .billing-nav-core a,.billing-nav-advanced a,.billing-nav-tools a{display:inline-flex;justify-content:center;align-items:center;min-height:42px;padding:9px 12px;border-radius:8px;border:1px solid var(--lv-border-default);background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:12px;font-weight:750;text-decoration:none}
      .billing-nav-core a[aria-current=page],.billing-nav-advanced a[aria-current=page]{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}
      .billing-nav-core a:hover,.billing-nav-advanced a:hover,.billing-nav-tools a:hover{border-color:var(--lv-brand-border)}
      .billing-nav-tools{display:flex;gap:12px;flex-wrap:wrap;align-items:center;padding:0 2px}
      .billing-nav-tools details{flex:1;min-width:0;border:1px solid var(--lv-border-default);background:var(--lv-surface-muted);border-radius:9px;padding:9px 11px}
      .billing-nav-tools summary{cursor:pointer;font-size:12px;font-weight:800;min-height:24px;list-style-position:inside}
      .billing-nav-advanced{display:flex;flex-wrap:wrap;gap:7px;padding:10px 0 4px}
      .billing-nav-tools>.billing-ledger-link{white-space:nowrap;font-size:12px;font-weight:750;color:var(--lv-brand-text);background:var(--lv-surface-muted)}
      @media(max-width:720px){.billing-nav-core{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.billing-nav-core a{min-width:0;padding:9px 6px;font-size:12px}.billing-nav-tools{align-items:stretch}.billing-nav-tools details{flex-basis:100%}.billing-nav-tools>.billing-ledger-link{width:100%}}
      @media(max-width:390px){.billing-nav-core{grid-template-columns:1fr 1fr}}
    `}</style>
    <nav className="billing-nav-core" aria-label="Billing main sections">
      {main.map((item) => <Link key={item.href} href={item.href} aria-current={active(item.href) ? "page" : undefined}>{item.label}</Link>)}
    </nav>
    <div className="billing-nav-tools">
      <details>
        <summary>Additional billing tools, corrections and reports</summary>
        <nav className="billing-nav-advanced" aria-label="Additional billing tools">
          {advanced.map((item) => <Link key={item.href} href={item.href} aria-current={active(item.href) ? "page" : undefined}>{item.label}</Link>)}
        </nav>
      </details>
      <Link className="billing-ledger-link" href="/admin/accounts">Accounts & Ledger (separate)</Link>
    </div>
  </div>;
}
