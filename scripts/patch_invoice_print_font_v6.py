from pathlib import Path

path = Path('app/admin/finance/invoices/invoice.module.css')
text = path.read_text(encoding='utf-8')
marker = '/* Invoice universal print typography v6 */'
if marker in text:
    print('Invoice universal print typography v6 already applied')
    raise SystemExit(0)

patch = r'''

/* Invoice universal print typography v6 */
@media print {
  /* Universal readable body size for A4 output. */
  .printPage {
    font-size: 9pt !important;
    line-height: 1.25 !important;
  }

  .printPage .sheetContact,
  .printPage .sheetContact *,
  .printPage .sheetBrandWords small,
  .printPage .sheetBrand > em,
  .printPage .sheetTitle small,
  .printPage .sheetMetaPair span,
  .printPage .sheetMetaPair strong,
  .printPage .sheetPanelTitles strong,
  .printPage .sheetInfoRow span,
  .printPage .sheetInfoRow strong,
  .printPage .sheetMain th,
  .printPage .sheetMain td,
  .printPage .verificationVerified,
  .printPage .verificationUnverified,
  .printPage .verificationRef,
  .printPage .sheetSummary > div,
  .printPage .sheetFooter,
  .printPage .sheetFooter *,
  .printPage .sheetThanks,
  .printPage .sheetSignature,
  .printPage .sheetSignature *,
  .printPage .sheetQr > div:last-child span,
  .printPage .sheetQr > div:last-child b,
  .printPage .sheetQr > div:last-child strong,
  .printPage .empty {
    font-size: 9pt !important;
  }

  /* Keep readable line spacing without wasting vertical space. */
  .printPage .sheetMetaPair span,
  .printPage .sheetMetaPair strong,
  .printPage .sheetInfoRow span,
  .printPage .sheetInfoRow strong,
  .printPage .sheetMain th,
  .printPage .sheetMain td,
  .printPage .verificationVerified,
  .printPage .verificationUnverified,
  .printPage .verificationRef {
    line-height: 1.15 !important;
  }

  /* Hierarchy: only headings and brand text exceed the universal size. */
  .printPage .sheetBrandWords > strong {
    font-size: 15pt !important;
    line-height: 1 !important;
  }

  .printPage .sheetTitle b {
    font-size: 11pt !important;
  }

  .printPage .sheetTitle strong,
  .printPage .sheetMain h2 {
    font-size: 13pt !important;
  }

  .printPage .sheetSummary h3 {
    font-size: 10.5pt !important;
  }

  /* The dense second page keeps its protected geometry while using 9pt text. */
  .printPage:nth-child(2) .sheetMain .supervisionBillTable td,
  .printPage:nth-child(2) .sheetMain .depositTable td {
    font-size: 9pt !important;
    line-height: 1.08 !important;
  }

  .printPage:nth-child(2) .verificationRef {
    line-height: 1 !important;
    margin-top: .45mm !important;
  }
}
'''

path.write_text(text.rstrip() + patch + '\n', encoding='utf-8')
print('Applied invoice universal print typography v6')
