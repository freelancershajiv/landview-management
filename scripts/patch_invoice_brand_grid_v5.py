from pathlib import Path

page_path = Path('app/admin/finance/invoices/page.tsx')
css_path = Path('app/admin/finance/invoices/invoice.module.css')

page = page_path.read_text(encoding='utf-8')
old = '<span>Receipts</span><strong>{verifiedPayments}/{allPayments.length} verified{unverifiedPayments > 0 ? ` · ${unverifiedPayments} pending` : ""}</strong>'
new = '<span>Receipts</span><strong>Verified: {verifiedPayments}/{allPayments.length}{unverifiedPayments > 0 ? ` · Pending: ${unverifiedPayments}` : ""}</strong>'
if old in page:
    page = page.replace(old, new)
elif new not in page:
    raise SystemExit('Could not locate receipts status markup')
page_path.write_text(page, encoding='utf-8')

css = css_path.read_text(encoding='utf-8')
marker = '/* Invoice brand + master-grid repair v5 */'
if marker not in css:
    css += r'''

/* Invoice brand + master-grid repair v5 */
@media print {
  /* LAND VIEW brand palette: navy + gold */
  .sheetHeader {
    grid-template-columns: 1.18fr .86fr 1fr !important;
    align-items: center !important;
    gap: 5mm !important;
    border-bottom-color: #d7a11b !important;
  }

  .sheetBrand {
    justify-content: center !important;
    min-width: 0 !important;
  }

  .sheetBrandLockup {
    display: flex !important;
    align-items: center !important;
    gap: 2.5mm !important;
    min-width: 0 !important;
  }

  .sheetBrandLogo {
    width: 12mm !important;
    height: 12mm !important;
    flex: 0 0 12mm !important;
    object-fit: contain !important;
  }

  .sheetBrandWords {
    display: flex !important;
    flex-direction: column !important;
    justify-content: center !important;
    min-width: 0 !important;
  }

  .sheetBrandWords > strong {
    color: #062653 !important;
    font-size: 14.5pt !important;
    line-height: 1 !important;
    white-space: nowrap !important;
  }

  .sheetBrandWords > strong span {
    color: #d7a11b !important;
  }

  .sheetBrandWords small {
    color: #062653 !important;
    font-size: 6.3pt !important;
    letter-spacing: 1px !important;
    margin-top: 1mm !important;
    white-space: nowrap !important;
  }

  .sheetBrand > em {
    color: #475569 !important;
    font-size: 5.9pt !important;
    margin-top: .8mm !important;
    padding-left: 14.5mm !important;
  }

  .sheetContact {
    justify-content: center !important;
    color: #1f2937 !important;
    font-size: 6.3pt !important;
    line-height: 1.25 !important;
  }

  .sheetTitle {
    justify-content: center !important;
  }

  .sheetTitle b {
    border-top-color: #d7a11b !important;
    color: #062653 !important;
  }

  .sheetTitle strong {
    color: #062653 !important;
  }

  /* One master grid: 20 + 75 + 20 + 75 = 190mm printable width. */
  .sheetInfoBoard {
    border-color: #062653 !important;
  }

  .sheetMetaRow {
    display: grid !important;
    grid-template-columns: 95mm 95mm !important;
    width: 100% !important;
  }

  .sheetMetaPair {
    display: grid !important;
    grid-template-columns: 20mm minmax(0,75mm) !important;
    width: 95mm !important;
    min-width: 0 !important;
  }

  .sheetPanelTitles {
    display: grid !important;
    grid-template-columns: 95mm 95mm !important;
    width: 100% !important;
  }

  .sheetInfoRow {
    display: grid !important;
    grid-template-columns: 20mm minmax(0,75mm) 20mm minmax(0,75mm) !important;
    width: 100% !important;
  }

  .sheetMetaPair span,
  .sheetPanelTitles strong,
  .sheetInfoRow span {
    background: #062653 !important;
    color: #fff !important;
    border-color: #062653 !important;
  }

  .sheetMetaPair strong,
  .sheetInfoRow strong {
    color: #111827 !important;
    background: #fff !important;
    border-color: #062653 !important;
    min-width: 0 !important;
  }

  .sheetMetaPair span,
  .sheetMetaPair strong,
  .sheetInfoRow span,
  .sheetInfoRow strong {
    min-height: 7.4mm !important;
    padding: 1.25mm 1.8mm !important;
    box-sizing: border-box !important;
  }

  .sheetInfoRow strong {
    overflow-wrap: normal !important;
    word-break: normal !important;
  }

  .sheetInfoRow:last-child strong:last-child {
    font-size: 6.9pt !important;
    white-space: nowrap !important;
  }

  /* Bill tables follow the same navy/gold identity. */
  .sheetMain h2 {
    color: #062653 !important;
  }

  .sheetMain h2 span {
    color: #d7a11b !important;
  }

  .sheetMain th {
    background: #062653 !important;
    color: #fff !important;
    border-color: #062653 !important;
  }

  .sheetMain td {
    border-color: #c7d2dd !important;
  }

  .sheetSummary {
    border-color: #d8c486 !important;
  }

  .sheetSummary h3 {
    background: #fff8df !important;
    color: #062653 !important;
  }

  .sheetSummary > div.sheetDue,
  .sheetSummary > div.sheetGrandDue {
    background: #d7a11b !important;
    color: #062653 !important;
  }

  .sheetSummary > div.sheetDue span,
  .sheetSummary > div.sheetDue strong,
  .sheetSummary > div.sheetGrandDue span,
  .sheetSummary > div.sheetGrandDue strong {
    color: #062653 !important;
  }

  .sheetFooter {
    border-top-color: #d7a11b !important;
  }

  .sheetQr {
    border-color: #d7a11b !important;
  }

  .sheetQr > div:last-child strong {
    color: #062653 !important;
  }
}
'''
    css_path.write_text(css, encoding='utf-8')
