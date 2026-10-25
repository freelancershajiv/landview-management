import Link from "next/link";

const groups = [
  {
    title: "Billing & Commercial Documents",
    note: "Create, revise and control the client-facing value of services.",
    items: [
      { href: "/admin/finance/direct-bill", title: "New Full Bill", detail: "Create a multi-service commercial bill for one project.", accent: true },
      { href: "/admin/finance/full-bill-editor", title: "Edit Full Bill", detail: "Edit the whole bill, service rows and discounts from one screen.", accent: true },
      { href: "/admin/finance/bills", title: "Bill Items / Audit", detail: "Inspect individual bill rows, draft items and audit-level details." },
      { href: "/admin/finance/due-bills", title: "Due Bills", detail: "Focus on unpaid and partially paid client bills." },
    ],
  },
  {
    title: "Collections & Client Documents",
    note: "Receive money once, allocate it correctly, then generate the right client document.",
    items: [
      { href: "/admin/finance/service-payments", title: "Receive Payment", detail: "Record collections against projects and services.", accent: true },
      { href: "/admin/finance/payment-lifecycle", title: "Invoices / Receipts", detail: "Follow payment allocation and client receipt lifecycle." },
      { href: "/admin/finance/workspace", title: "Billing Workspace", detail: "Project-focused billing and payment operations." },
    ],
  },
  {
    title: "Corrections & Financial Control",
    note: "Never silently rewrite posted money; correct it with a traceable financial action.",
    items: [
      { href: "/admin/finance/adjustments", title: "Credit / Debit Notes", detail: "Discount, reduce, increase or reverse issued billing safely.", accent: true },
      { href: "/admin/finance/billing-control", title: "Billing Controls", detail: "Review billing rules and operational controls." },
      { href: "/admin/finance/control", title: "Finance Control Center", detail: "Reconcile billing, payments, allocations, ledger and project balances.", accent: true },
      { href: "/admin/accounts", title: "Accounts / Ledger", detail: "Review the effective accounting ledger and financial postings." },
    ],
  },
];

const workflow = [
  ["01", "Prepare Bill", "Build the full service bill before collection."],
  ["02", "Review / Discount", "Edit service rows and negotiated discounts."],
  ["03", "Issue", "Lock the commercial value into an auditable issued bill."],
  ["04", "Receive", "Record the client payment only once."],
  ["05", "Allocate", "Connect payment to the correct bill/service."],
  ["06", "Receipt", "Generate the client-facing proof of payment."],
  ["07", "Reconcile", "Confirm billing, due, payment and ledger agree."],
];

export default function FinanceHomePage() {
  return <main className="finance-home">
    <style>{`
      .finance-home{max-width:1500px;margin:0 auto;color:var(--lv-text-primary)}
      .finance-home *{box-sizing:border-box}.fh-hero{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;padding:19px;border:1px solid var(--lv-border-default);border-radius:13px;background:linear-gradient(135deg,var(--lv-surface-panel),var(--lv-surface-muted));margin-bottom:13px}
      .fh-eyebrow{font-size:8px;font-weight:950;letter-spacing:.14em;color:var(--lv-brand-text);text-transform:uppercase}.fh-hero h1{font-size:31px;margin:5px 0 5px}.fh-hero p{margin:0;max-width:760px;font-size:10px;color:var(--lv-text-muted);line-height:1.5}.fh-hero-actions{display:flex;gap:7px;flex-wrap:wrap}.fh-button{display:inline-flex;align-items:center;justify-content:center;min-height:39px;padding:0 13px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px;font-weight:950;text-decoration:none}.fh-button.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}
      .fh-workflow{display:grid;grid-template-columns:repeat(7,1fr);gap:7px;margin-bottom:13px}.fh-step{position:relative;padding:11px;border:1px solid var(--lv-border-default);border-radius:9px;background:var(--lv-surface-panel);min-height:94px}.fh-step b{display:block;font-size:7px;color:var(--lv-brand-text)}.fh-step strong{display:block;margin:6px 0 4px;font-size:10px}.fh-step span{font-size:7px;line-height:1.45;color:var(--lv-text-muted)}
      .fh-sections{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.fh-section{border:1px solid var(--lv-border-default);border-radius:11px;background:var(--lv-surface-panel);overflow:hidden}.fh-section-head{padding:12px 13px;border-bottom:1px solid var(--lv-border-default);background:var(--lv-surface-muted)}.fh-section-head h2{font-size:12px;margin:0 0 4px}.fh-section-head p{font-size:8px;margin:0;color:var(--lv-text-muted);line-height:1.45}.fh-list{padding:7px}.fh-card{display:block;padding:11px;border:1px solid transparent;border-radius:8px;color:var(--lv-text-primary);text-decoration:none;margin-bottom:5px}.fh-card:last-child{margin-bottom:0}.fh-card:hover{border-color:var(--lv-border-default);background:var(--lv-surface-muted)}.fh-card.accent{border-color:var(--lv-brand-border);background:var(--lv-brand-soft)}.fh-card strong{display:flex;justify-content:space-between;gap:8px;font-size:9px}.fh-card strong:after{content:'→';color:var(--lv-text-muted)}.fh-card span{display:block;margin-top:4px;font-size:7px;line-height:1.45;color:var(--lv-text-muted)}.fh-rule{margin-top:13px;padding:11px 13px;border:1px solid var(--lv-border-default);border-radius:9px;background:var(--lv-surface-muted);font-size:8px;color:var(--lv-text-muted);line-height:1.5}.fh-rule strong{color:var(--lv-text-primary)}
      @media(max-width:1050px){.fh-workflow{grid-template-columns:repeat(4,1fr)}.fh-sections{grid-template-columns:1fr 1fr}}@media(max-width:700px){.fh-hero{align-items:flex-start;flex-direction:column}.fh-hero-actions{width:100%}.fh-button{flex:1}.fh-workflow{grid-template-columns:1fr 1fr}.fh-sections{grid-template-columns:1fr}.fh-hero h1{font-size:25px}}
    `}</style>

    <section className="fh-hero">
      <div><div className="fh-eyebrow">LAND VIEW Financial Operations</div><h1>Finance Command Center</h1><p>One workflow for commercial bills, service discounts, collections, receipts, corrections and the accounting ledger. Use the commercial layer to change what the client owes; use the ledger layer to verify what actually happened.</p></div>
      <div className="fh-hero-actions"><Link className="fh-button primary" href="/admin/finance/direct-bill">+ New Full Bill</Link><Link className="fh-button" href="/admin/finance/full-bill-editor">Edit Existing Bill</Link><Link className="fh-button" href="/admin/finance/service-payments">Receive Payment</Link></div>
    </section>

    <section className="fh-workflow" aria-label="Finance workflow">
      {workflow.map(([number,title,detail]) => <div className="fh-step" key={number}><b>{number}</b><strong>{title}</strong><span>{detail}</span></div>)}
    </section>

    <section className="fh-sections">
      {groups.map((group) => <article className="fh-section" key={group.title}><header className="fh-section-head"><h2>{group.title}</h2><p>{group.note}</p></header><div className="fh-list">{group.items.map((item) => <Link href={item.href} className={`fh-card ${item.accent ? "accent" : ""}`} key={item.href}><strong>{item.title}</strong><span>{item.detail}</span></Link>)}</div></article>)}
    </section>

    <div className="fh-rule"><strong>Finance rule:</strong> Draft bills may be edited directly. Once issued, money-changing corrections should remain auditable through credit/debit notes rather than silently rewriting historical amounts. This keeps client dues, receipts and the accounting ledger reconcilable.</div>
  </main>;
}
