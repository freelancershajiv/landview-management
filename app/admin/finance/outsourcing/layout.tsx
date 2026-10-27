import Link from "next/link";

export default function OutsourcingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="outsource-ledger-nav">
        <style>{`
          .outsource-ledger-nav{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 14px;padding:10px 12px;border:1px solid var(--lv-border,#313b44);border-radius:12px;background:var(--lv-surface-1,#11181e)}
          .outsource-ledger-nav a{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:0 11px;border:1px solid var(--lv-border,#36414a);border-radius:8px;color:var(--lv-text,#dbe3e8);text-decoration:none;font-size:9px;font-weight:900;letter-spacing:.02em;background:var(--lv-surface-2,#151d24)}
          .outsource-ledger-nav a:hover{border-color:var(--lv-brand-primary,#d94b45);color:var(--lv-text-strong,#fff)}
          .outsource-ledger-nav a.vendor-ledger-link{background:rgba(217,75,69,.10);border-color:rgba(217,75,69,.45);color:#f0a29d}
          .outsource-ledger-nav span{margin-left:auto;color:var(--lv-text-muted,#9da8b0);font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}
          @media(max-width:700px){.outsource-ledger-nav span{width:100%;margin-left:0}}
        `}</style>
        <Link href="/admin/finance/outsourcing">Outsourcing</Link>
        <Link className="vendor-ledger-link" href="/admin/finance/outsourcing/ledgers">Vendor Ledgers</Link>
        <span>Separate ledger for every person / firm</span>
      </div>
      {children}
    </>
  );
}
