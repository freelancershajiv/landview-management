from pathlib import Path

PAGE = Path('app/admin/finance/invoices/page.tsx')
CSS = Path('app/admin/finance/invoices/invoice.module.css')

page = PAGE.read_text(encoding='utf-8')
old = '<span>Receipts verified</span><strong>{verifiedPayments}/{allPayments.length}{unverifiedPayments > 0 ? ` · ${unverifiedPayments} pending` : ""}</strong>'
new = '<span>Receipts</span><strong>{verifiedPayments}/{allPayments.length} verified{unverifiedPayments > 0 ? ` · ${unverifiedPayments} pending` : ""}</strong>'
if old in page:
    page = page.replace(old, new)
PAGE.write_text(page, encoding='utf-8')

css = CSS.read_text(encoding='utf-8')
marker = '/* Invoice print contrast repair v3 */'
if marker not in css:
    css += r'''

/* Invoice print contrast repair v3 */
@media print {
  :global(html),
  :global(body),
  .printSheets,
  .printPage,
  .portraitSection,
  .sheetMain,
  .sheetMain .tableWrap,
  .sheetMain table,
  .sheetMain tbody,
  .sheetMain tr,
  .sheetMain td {
    background:#fff!important;
    color:#111!important;
  }

  .sheetMain tbody tr:nth-child(odd),
  .sheetMain tbody tr:nth-child(even),
  .sheetMain tbody tr:nth-child(odd) td,
  .sheetMain tbody tr:nth-child(even) td {
    background:#fff!important;
    color:#111!important;
  }

  .sheetMain td {
    border-color:#cfd5d9!important;
    -webkit-print-color-adjust:exact!important;
    print-color-adjust:exact!important;
  }

  .sheetMain th {
    background:#34393d!important;
    color:#fff!important;
    border-color:#34393d!important;
    -webkit-print-color-adjust:exact!important;
    print-color-adjust:exact!important;
  }

  .sheetMain .verificationVerified {
    color:#16733a!important;
  }

  .sheetMain .verificationUnverified {
    color:#b42318!important;
  }

  .sheetMain .verificationRef {
    color:#666!important;
  }

  .sheetInfoBoard,
  .sheetMetaPair span,
  .sheetPanelTitles strong,
  .sheetInfoRow span {
    -webkit-print-color-adjust:exact!important;
    print-color-adjust:exact!important;
  }

  .sheetMetaPair strong,
  .sheetInfoRow strong {
    background:#fff!important;
    color:#111!important;
  }

  .sheetSummary>div.sheetDue,
  .sheetSummary>div.sheetGrandDue {
    background:#d61f26!important;
    -webkit-print-color-adjust:exact!important;
    print-color-adjust:exact!important;
  }

  .sheetSummary>div.sheetDue span,
  .sheetSummary>div.sheetDue strong,
  .sheetSummary>div.sheetGrandDue span,
  .sheetSummary>div.sheetGrandDue strong {
    color:#fff!important;
  }

  .sheetSummary>div.sheetGrandDue span {
    font-size:6.3pt!important;
    line-height:1.1!important;
  }

  .sheetSummary>div.sheetGrandDue strong {
    white-space:nowrap!important;
  }
}
'''
CSS.write_text(css, encoding='utf-8')
