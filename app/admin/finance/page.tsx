import Link from "next/link";

const primaryActions = [
  { href: "/admin/finance/add-bill", title: "Add Bill", detail: "Add one service bill quickly for an existing project.", number: "01" },
  { href: "/admin/finance/direct-bill", title: "New Full Bill", detail: "Create one complete multi-service bill in a single screen.", number: "02" },
  { href: "/admin/finance/full-bill-editor", title: "Edit Full Bill", detail: "Open an existing bill and edit all service rows and discounts together.", number: "03" },
  { href: "/admin/finance/invoices", title: "Generate Invoice", detail: "Generate the live client invoice, due bill, PDF or JPG.", number: "04" },
  { href: "/admin/finance/service-payments", title: "Add Payment", detail: "Record a client payment and connect it to the project billing.", number: "05" },
];

const supportActions = [
  { href: "/admin/finance/due-bills", title: "Due Bills", detail: "See unpaid and partially paid bills that need collection." },
  { href: "/admin/accounts", title: "Accounts / Ledger", detail: "Review the accounting ledger after billing and payment entry." },
];

export default function FinanceHomePage() {
  return <main className="finance-home">
    <style>{`
      .finance-home{max-width:1450px;margin:0 auto;color:var(--lv-text-primary)}.finance-home *{box-sizing:border-box}
      .fh-hero{display:flex;justify-content:space-between;align-items:flex-end;gap:18px;padding:20px;border:1px solid var(--lv-border-default);border-radius:13px;background:linear-gradient(135deg,var(--lv-surface-panel),var(--lv-surface-muted));margin-bottom:14px}
      .fh-eyebrow{font-size:8px;font-weight:950;letter-spacing:.14em;color:var(--lv-brand-text);text-transform:uppercase}.fh-hero h1{font-size:31px;margin:5px 0}.fh-hero p{margin:0;max-width:760px;font-size:10px;color:var(--lv-text-muted);line-height:1.55}.fh-hero-actions{display:flex;gap:7px;flex-wrap:wrap}.fh-button{display:inline-flex;align-items:center;justify-content:center;min-height:39px;padding:0 13px;border:1px solid var(--lv-border-default);border-radius:8px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:8px;font-weight:950;text-decoration:none}.fh-button.primary{background:var(--lv-brand-primary);border-color:var(--lv-brand-border);color:var(--lv-text-inverse)}
      .fh-title-row{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin:18px 0 9px}.fh-title-row h2{font-size:13px;margin:0}.fh-title-row p{font-size:8px;margin:0;color:var(--lv-text-muted)}
      .fh-primary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px}.fh-action{position:relative;display:block;min-height:155px;padding:14px;border:1px solid var(--lv-border-default);border-radius:10px;background:var(--lv-surface-panel);color:var(--lv-text-primary);text-decoration:none;overflow:hidden}.fh-action:hover{border-color:var(--lv-brand-border);background:var(--lv-brand-soft)}.fh-action b{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:8px;background:var(--lv-brand-soft);color:var(--lv-brand-text);font-size:9px}.fh-action strong{display:block;margin:18px 0 6px;font-size:13px}.fh-action span{display:block;font-size:8px;line-height:1.55;color:var(--lv-text-muted)}.fh-action:after{content:'→';position:absolute;right:13px;bottom:11px;color:var(--lv-text-muted);font-size:14px}
      .fh-support{display:grid;grid-template-columns:1fr 1fr;gap:9px}.fh-support-card{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:13px 14px;border:1px solid var(--lv-border-default);border-radius:9px;background:var(--lv-surface-panel);color:var(--lv-text-primary);text-decoration:none}.fh-support-card:hover{border-color:var(--lv-border-default);background:var(--lv-surface-muted)}.fh-support-card strong{display:block;font-size:10px}.fh-support-card span{display:block;margin-top:4px;font-size:8px;line-height:1.4;color:var(--lv-text-muted)}.fh-support-card i{font-style:normal;color:var(--lv-text-muted)}
      .fh-flow{display:grid;grid-template-columns:repeat(5,1fr);gap:7px;margin-top:14px;padding:11px;border:1px solid var(--lv-border-subtle);border-radius:10px;background:var(--lv-surface-muted)}.fh-flow div{position:relative;padding:8px 10px;border-radius:7px;background:var(--lv-surface-panel);font-size:8px;color:var(--lv-text-muted)}.fh-flow strong{display:block;margin-bottom:3px;color:var(--lv-text-primary);font-size:9px}.fh-flow div:not(:last-child):after{content:'→';position:absolute;right:-8px;top:50%;transform:translateY(-50%);z-index:2;color:var(--lv-brand-text);font-weight:900}
      .fh-note{margin-top:12px;padding:10px 12px;border-left:3px solid var(--lv-brand-primary);background:var(--lv-brand-soft);font-size:8px;line-height:1.5;color:var(--lv-text-muted)}.fh-note strong{color:var(--lv-text-primary)}
      @media(max-width:1100px){.fh-primary{grid-template-columns:repeat(3,1fr)}.fh-flow{grid-template-columns:repeat(3,1fr)}.fh-flow div:after{display:none}}
      @media(max-width:720px){.fh-hero{align-items:flex-start;flex-direction:column}.fh-hero-actions{width:100%}.fh-button{flex:1}.fh-primary{grid-template-columns:1fr 1fr}.fh-support{grid-template-columns:1fr}.fh-flow{grid-template-columns:1fr 1fr}.fh-title-row{align-items:flex-start;flex-direction:column;gap:4px}}
      @media(max-width:460px){.fh-primary,.fh-flow{grid-template-columns:1fr}.fh-hero h1{font-size:26px}}
    `}</style>

    <section className="fh-hero">
      <div><div className="fh-eyebrow">LAND VIEW Finance</div><h1>Finance</h1><p>A clean billing workflow: add the bill, edit it if needed, generate the invoice, then record the payment. Advanced accounting and audit utilities stay behind the system instead of crowding everyday work.</p></div>
      <div className="fh-hero-actions"><Link className="fh-button primary" href="/admin/finance/add-bill">+ Add Bill</Link><Link className="fh-button" href="/admin/finance/direct-bill">New Full Bill</Link><Link className="fh-button" href="/admin/finance/service-payments">Add Payment</Link></div>
    </section>

    <div className="fh-title-row"><h2>Main Finance Work</h2><p>These are the normal actions you should need day to day.</p></div>
    <section className="fh-primary">
      {primaryActions.map((item) => <Link className="fh-action" href={item.href} key={item.href}><b>{item.number}</b><strong>{item.title}</strong><span>{item.detail}</span></Link>)}
    </section>

    <section className="fh-flow" aria-label="Finance workflow">
      <div><strong>1. Bill</strong>Add one bill or a complete full bill.</div>
      <div><strong>2. Edit</strong>Adjust services and direct discounts together.</div>
      <div><strong>3. Invoice</strong>Generate the current client document.</div>
      <div><strong>4. Payment</strong>Add the client payment once.</div>
      <div><strong>5. Review</strong>Check due bills and the ledger when needed.</div>
    </section>

    <div className="fh-title-row"><h2>Review & Follow-up</h2><p>Useful secondary pages, without cluttering the main workflow.</p></div>
    <section className="fh-support">
      {supportActions.map((item) => <Link className="fh-support-card" href={item.href} key={item.href}><div><strong>{item.title}</strong><span>{item.detail}</span></div><i>→</i></Link>)}
    </section>

    <div className="fh-note"><strong>Simplified Finance:</strong> Billing Workspace, Billing Controls, Finance Control Center, Credit/Debit Notes, Bill Items/Audit and Payment Lifecycle are no longer exposed in the normal Finance menu. Their underlying system routes remain available for compatibility and audit history, so no financial records are deleted.</div>
  </main>;
}
