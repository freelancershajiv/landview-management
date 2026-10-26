"use client";

import Link from "next/link";

export default function AccountsDashboardPolish() {
  return (
    <>
      <style>{`
        .accounts-command-bar{margin:0 0 16px;padding:18px 20px;border:1px solid var(--lv-border-default);border-radius:16px;background:linear-gradient(135deg,var(--lv-surface-panel),var(--lv-surface-muted));display:flex;align-items:center;justify-content:space-between;gap:18px;box-shadow:0 14px 36px rgba(0,0,0,.08)}
        .accounts-command-copy{min-width:0}.accounts-command-kicker{display:flex;align-items:center;gap:7px;color:var(--lv-brand-text);font-size:9px;font-weight:950;letter-spacing:.13em;text-transform:uppercase}.accounts-live-dot{width:7px;height:7px;border-radius:999px;background:var(--lv-success-solid);box-shadow:0 0 0 4px var(--lv-success-soft)}
        .accounts-command-copy h1{margin:7px 0 4px;font-size:31px;line-height:1;letter-spacing:-.035em;color:var(--lv-text-primary)}.accounts-command-copy p{margin:0;max-width:680px;color:var(--lv-text-muted);font-size:10px;line-height:1.55}
        .accounts-command-actions{display:flex;align-items:center;justify-content:flex-end;gap:7px;flex-wrap:wrap}.accounts-command-btn{min-height:38px;padding:0 12px;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1px solid var(--lv-border-default);border-radius:9px;background:var(--lv-surface-input);color:var(--lv-text-primary);font-size:9px;font-weight:950;text-decoration:none;cursor:pointer;white-space:nowrap}.accounts-command-btn:hover{border-color:var(--lv-border-strong);transform:translateY(-1px)}.accounts-command-btn.income{background:var(--lv-success-solid);border-color:var(--lv-success-solid);color:#fff}.accounts-command-btn.expense{background:var(--lv-danger-solid);border-color:var(--lv-danger-solid);color:#fff}.accounts-command-btn.secondary{background:transparent}.accounts-command-btn.refresh{width:38px;padding:0;font-size:15px}

        .bank-accounts-page{max-width:1540px;margin:0 auto!important;padding-bottom:32px!important}.bank-accounts-page>.bank-head{display:none!important}
        .bank-accounts-page .bank-metrics{grid-template-columns:2fr repeat(3,minmax(0,1fr))!important;gap:10px!important;margin-bottom:12px!important}.bank-accounts-page .bank-metric{min-height:112px!important;padding:16px 17px!important;border-radius:14px!important;box-shadow:none!important;transition:border-color .18s ease,transform .18s ease}.bank-accounts-page .bank-metric:hover{border-color:var(--lv-border-strong)!important;transform:translateY(-1px)}
        .bank-accounts-page .bank-metric:nth-child(4){order:-4;background:linear-gradient(135deg,var(--lv-brand-soft),var(--lv-surface-panel))!important;border-color:var(--lv-brand-border)!important}.bank-accounts-page .bank-metric:nth-child(4) strong{font-size:28px!important}.bank-accounts-page .bank-metric:nth-child(2){order:-3}.bank-accounts-page .bank-metric:nth-child(3){order:-2}.bank-accounts-page .bank-metric:nth-child(1){order:-1;opacity:.88}.bank-accounts-page .bank-metric span{font-size:8px!important;letter-spacing:.105em!important}.bank-accounts-page .bank-metric p{font-size:8.5px!important;line-height:1.5!important}.bank-accounts-page .bank-metric strong{font-size:20px!important}

        .bank-accounts-page .bank-statement{border-radius:16px!important;box-shadow:0 15px 42px rgba(0,0,0,.08)!important}.bank-accounts-page .statement-head{padding:19px 20px 17px!important}.bank-accounts-page .statement-title h2{font-size:24px!important}.bank-accounts-page .statement-title p{max-width:820px;font-size:9.5px!important}.bank-accounts-page .statement-head-stats{gap:10px!important}.bank-accounts-page .head-stat{min-width:112px;padding:9px 10px;border:1px solid var(--lv-border-subtle);border-radius:9px;background:var(--lv-surface-muted)}.bank-accounts-page .head-stat span{font-size:7px!important}.bank-accounts-page .head-stat strong{font-size:13px!important}
        .bank-accounts-page .bank-tabs{padding:9px 10px!important;gap:5px!important}.bank-accounts-page .bank-tabs button{min-height:32px;padding:7px 12px!important;border:1px solid transparent!important}.bank-accounts-page .bank-tabs button:hover{border-color:var(--lv-border-default)!important;color:var(--lv-text-primary)!important}.bank-accounts-page .bank-tabs button.active{background:var(--lv-brand-primary)!important;box-shadow:none!important}.bank-accounts-page .statement-search{min-height:34px;width:min(330px,34vw)!important;font-size:9px!important}
        .bank-accounts-page .bank-table-wrap{scrollbar-width:thin;-webkit-overflow-scrolling:touch}.bank-accounts-page .bank-table{min-width:1020px!important}.bank-accounts-page .bank-table th{font-size:7.5px!important}.bank-accounts-page .bank-table td{font-size:9.5px!important}.bank-accounts-page .bank-table th,.bank-accounts-page .bank-table td{padding:10px 11px!important}.bank-accounts-page .transaction-row:nth-child(even){background:color-mix(in srgb,var(--lv-surface-muted) 35%,transparent)}.bank-accounts-page .transaction-row:hover{background:var(--lv-brand-soft)!important}.bank-accounts-page .tx-id,.bank-accounts-page .particular{font-size:9.5px!important}.bank-accounts-page .subline{font-size:7.8px!important}.bank-accounts-page .type-pill{min-width:58px!important}.bank-accounts-page .statement-footer{padding:11px 14px!important}
        .bank-accounts-page .report-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}.bank-accounts-page .report-card{min-height:90px!important;padding:16px!important}.bank-accounts-page .report-card strong{font-size:21px!important}

        @media(max-width:1100px){.accounts-command-bar{align-items:flex-start;flex-direction:column}.accounts-command-actions{justify-content:flex-start;width:100%}.bank-accounts-page .bank-metrics{grid-template-columns:repeat(2,minmax(0,1fr))!important}.bank-accounts-page .bank-metric:nth-child(4){grid-column:1/-1}.bank-accounts-page .statement-head-stats{width:100%;display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))}.bank-accounts-page .head-stat{text-align:left!important;min-width:0}}
        @media(max-width:720px){.accounts-command-bar{padding:15px;border-radius:13px}.accounts-command-copy h1{font-size:27px}.accounts-command-actions{display:grid;grid-template-columns:1fr 1fr}.accounts-command-btn{width:100%}.accounts-command-btn.refresh{width:100%;font-size:12px}.bank-accounts-page .bank-metrics{grid-template-columns:1fr!important}.bank-accounts-page .bank-metric:nth-child(4){grid-column:auto}.bank-accounts-page .bank-metric{min-height:94px!important}.bank-accounts-page .statement-head{padding:15px!important}.bank-accounts-page .statement-head-stats{grid-template-columns:1fr 1fr!important}.bank-accounts-page .head-stat:last-child{grid-column:1/-1}.bank-accounts-page .bank-tabs{flex-wrap:nowrap!important;overflow-x:auto!important}.bank-accounts-page .bank-tabs .tab-spacer{display:none!important}.bank-accounts-page .statement-search{min-width:220px!important;width:220px!important}.bank-accounts-page .bank-table{min-width:900px!important}.bank-accounts-page .statement-footer{align-items:flex-start!important;flex-direction:column!important}.bank-accounts-page .report-grid{grid-template-columns:1fr!important}}
      `}</style>

      <section className="accounts-command-bar" aria-label="Accounts command center">
        <div className="accounts-command-copy">
          <span className="accounts-command-kicker"><i className="accounts-live-dot" /> LAND VIEW ACCOUNTS</span>
          <h1>Cashbook & Ledger</h1>
          <p>Keep daily income and expenses simple here. Billing, invoices and client payments stay in Finance; this page focuses on cash movement, running balance and the official accounts ledger.</p>
        </div>
        <div className="accounts-command-actions">
          <Link className="accounts-command-btn income" href="/admin/accounts/entry?type=income">＋ Add Income</Link>
          <Link className="accounts-command-btn expense" href="/admin/accounts/entry?type=expense">＋ Add Expense</Link>
          <Link className="accounts-command-btn secondary" href="/admin/accounts/export">Export Ledger</Link>
          <Link className="accounts-command-btn secondary" href="/admin/finance">Finance</Link>
          <button className="accounts-command-btn refresh" type="button" title="Refresh Accounts" aria-label="Refresh Accounts" onClick={() => window.location.reload()}>↻</button>
        </div>
      </section>
    </>
  );
}
