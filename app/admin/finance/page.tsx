import Link from "next/link";
import BillingProjectJump from "@/components/billing-project-jump";

const actions = [
  { n: "01", title: "Project Billing", href: "/admin/billing/workspace", detail: "Services, contract progress, invoices, payments, due and transaction history in one project." },
  { n: "02", title: "Bill Manager", href: "/admin/billing/bills", detail: "Review issued bills, draft line items, discounts and supported corrections." },
  { n: "03", title: "Invoice Center", href: "/admin/billing/invoice-center", detail: "Search invoices and identify outstanding, partially paid and fully settled bills." },
  { n: "04", title: "Receive Payment", href: "/admin/billing/service-payments", detail: "Record a client receipt, allocate services, or receive an advance with protected retries." },
  { n: "05", title: "Due Bills", href: "/admin/billing/due-bills", detail: "Track receivables by project and billing category. Review due amounts before reminders." },
  { n: "06", title: "Invoice Print & Share", href: "/admin/billing/invoices", detail: "Create branded individual invoices and printable documents." },
  { n: "07", title: "Project Statements & Receipts", href: "/admin/billing/project-statement", detail: "Current client ledger, advances, verified receipts and A4 PDF statements." },
];
const quick = [
  { title: "Add Bill", href: "/admin/billing/add-bill", detail: "One service bill" },
  { title: "Create Full Bill", href: "/admin/billing/direct-bill", detail: "Atomic multi-service batch" },
  { title: "Full Bill Editor", href: "/admin/billing/full-bill-editor", detail: "Revise drafts and approved adjustments" },
];
const reviews = [
  { title: "Billing Reconciliation 4.1", href: "/admin/billing/reconciliation", description: "Receipt, ledger and advance evidence review worklist" },
  { title: "Payment Lifecycle", href: "/admin/billing/payment-lifecycle", description: "Receipt and advance review" },
  { title: "Financial Integrity", href: "/admin/billing/integrity", description: "Allocation and missing-reference exceptions" },
  { title: "Allocation Corrections", href: "/admin/billing/allocation-corrections", description: "Audited two-person approval" },
  { title: "Credit / Debit Notes", href: "/admin/billing/adjustments", description: "Preserve original issued bills" },
  { title: "Write-Offs & Recoveries", href: "/admin/billing/writeoffs", description: "Audited uncollectible dues and recovered payments" },
  { title: "Billing Controls", href: "/admin/billing/billing-control", description: "Financial gates and approval overrides" },
];

export default function BillingDashboard() {
  return <main className="bv4">
    <style>{`
      .bv4{max-width:1500px;margin:0 auto;display:grid;gap:17px;color:var(--lv-text-primary)}
      .bv4 *{box-sizing:border-box}
      .bv4-hero{padding:22px;border:1px solid var(--lv-border-default);border-radius:14px;background:linear-gradient(125deg,var(--lv-surface-panel),var(--lv-surface-muted));display:flex;gap:22px;align-items:flex-end;justify-content:space-between;flex-wrap:wrap}
      .bv4-eyebrow{display:block;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:var(--lv-brand-text)}
      .bv4 h1{margin:6px 0;font-size:30px;line-height:1.14}.bv4-hero p{max-width:710px;margin:0;font-size:13px;line-height:1.6;color:var(--lv-text-secondary)}
      .bv4-head-actions{display:flex;gap:8px;flex-wrap:wrap}.bv4-head-actions a{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:10px 14px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:12px;font-weight:750;text-decoration:none}
      .bv4-head-actions a.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}
      .bv4-section{display:grid;gap:9px}.bv4-section h2{margin:0;font-size:17px}.bv4-section p{margin:0;font-size:12px;line-height:1.5;color:var(--lv-text-secondary)}
      .bv4-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}
      .bv4-card{display:flex;flex-direction:column;min-height:155px;padding:16px;border-radius:12px;border:1px solid var(--lv-border-default);background:var(--lv-surface-panel);color:var(--lv-text-primary);text-decoration:none}
      .bv4-card:hover,.bv4-small:hover{border-color:var(--lv-brand-border);background:var(--lv-surface-muted)}
      .bv4-card .n{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:9px;background:var(--lv-brand-soft);color:var(--lv-brand-text);font-size:12px;font-weight:850}
      .bv4-card strong{display:block;margin:14px 0 6px;font-size:15px}.bv4-card span:last-child{font-size:12px;color:var(--lv-text-secondary);line-height:1.5}
      .bv4-mini{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .bv4-small{min-height:72px;padding:13px;border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-panel);color:var(--lv-text-primary);text-decoration:none}
      .bv4-small strong{display:block;font-size:13px}.bv4-small span{display:block;margin-top:4px;font-size:12px;line-height:1.4;color:var(--lv-text-secondary)}
      .bv4-audit{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .bv4-accounting{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;border-top:1px solid var(--lv-border-default);padding-top:13px;font-size:13px}
      .bv4-accounting a{color:var(--lv-brand-text);font-weight:800}
      @media(max-width:950px){.bv4-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:620px){.bv4-hero{padding:16px}.bv4 h1{font-size:25px}.bv4-grid,.bv4-mini,.bv4-audit{grid-template-columns:1fr}.bv4-card{min-height:120px}.bv4-head-actions a{flex:1}.bv4-head-actions{width:100%}}
    `}</style>
    <header className="bv4-hero">
      <div><span className="bv4-eyebrow">LAND VIEW / BILLING 4.0</span><h1>Client Billing</h1>
        <p>One reliable place for service bills, invoices, payments, receipts, advances and receivables. Project Management expenses and general accounting remain separate.</p></div>
      <div className="bv4-head-actions">
        <Link className="primary" href="/admin/billing/direct-bill">+ Full Bill</Link>
        <Link href="/admin/billing/service-payments">+ Receive Payment</Link>
      </div>
    </header>
    <BillingProjectJump />
    <section className="bv4-section">
      <div><h2>Everyday Billing</h2><p>Choose a workflow; each tool uses the same project and canonical payment records.</p></div>
      <div className="bv4-grid">{actions.map((item) => <Link className="bv4-card" href={item.href} key={item.href}>
        <span className="n">{item.n}</span><strong>{item.title}</strong><span>{item.detail}</span></Link>)}</div>
    </section>
    <section className="bv4-section">
      <div><h2>Create and edit</h2><p>New full bills are recorded in one atomic batch; issued bill revisions are separately audited.</p></div>
      <div className="bv4-mini">{quick.map((item) => <Link className="bv4-small" href={item.href} key={item.href}>
        <strong>{item.title}</strong><span>{item.detail}</span></Link>)}</div>
    </section>
    <section className="bv4-section">
      <div><h2>Controls and reconciliation</h2><p>Correction tools are deliberately separate from receiving money.</p></div>
      <div className="bv4-audit">{reviews.map((item) => <Link className="bv4-small" key={item.href} href={item.href}>
        <strong>{item.title}</strong><span>{item.description}</span></Link>)}</div>
    </section>
    <footer className="bv4-accounting">
      <div>Accounting, cash/bank ledger, municipality accounts and vendor payables are separate financial workspaces.</div>
      <Link href="/admin/accounts">Open Accounts & Ledger</Link>
    </footer>
  </main>;
}
