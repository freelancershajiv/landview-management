from pathlib import Path
import re

path = Path('app/admin/finance/invoices/invoice.module.css')
css = path.read_text(encoding='utf-8')
marker = '/* Invoice print-layout repair v3 */'

# Make the patch idempotent when the workflow is re-run.
css = re.sub(r'\n/\* Invoice print-layout repair v3 \*/[\s\S]*$', '', css).rstrip() + '\n\n'

patch = r'''/* Invoice print-layout repair v3 */
@media print {
  /* Keep every page inside a true A4 box and reserve a footer-safe zone. */
  .printPage {
    padding: 9mm 10mm 15mm !important;
    overflow: hidden !important;
  }

  .portraitSection {
    gap: 2.4mm !important;
    min-height: 0 !important;
  }

  .sheetInfoBoard {
    margin-bottom: 3mm !important;
  }

  .sheetMain h2 {
    margin: 0 0 1.2mm !important;
    line-height: 1.05 !important;
  }

  .depositHeading {
    margin-top: 2.6mm !important;
  }

  /* One row system for every printed invoice table. */
  .sheetMain .billTable,
  .sheetMain .depositTable,
  .sheetMain .supervisionBillTable {
    border-collapse: collapse !important;
    border-spacing: 0 !important;
    table-layout: fixed !important;
  }

  .sheetMain .billTable thead tr,
  .sheetMain .depositTable thead tr,
  .sheetMain .supervisionBillTable thead tr {
    height: 6.5mm !important;
  }

  .sheetMain .billTable tbody tr,
  .sheetMain .depositTable tbody tr,
  .sheetMain .supervisionBillTable tbody tr {
    height: 7mm !important;
    min-height: 7mm !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
  }

  .sheetMain .billTable th,
  .sheetMain .depositTable th,
  .sheetMain .supervisionBillTable th {
    height: 6.5mm !important;
    min-height: 6.5mm !important;
    padding: .9mm 1.8mm !important;
    line-height: 1.05 !important;
    vertical-align: middle !important;
    box-sizing: border-box !important;
  }

  .sheetMain .billTable td,
  .sheetMain .depositTable td,
  .sheetMain .supervisionBillTable td {
    height: 7mm !important;
    min-height: 7mm !important;
    padding: .75mm 1.8mm !important;
    line-height: 1.05 !important;
    vertical-align: middle !important;
    box-sizing: border-box !important;
  }

  /* Keep row baselines visually aligned even when verification uses two lines. */
  .verificationCell {
    display: table-cell !important;
    vertical-align: middle !important;
    padding-top: .45mm !important;
    padding-bottom: .45mm !important;
  }

  .verificationVerified,
  .verificationUnverified {
    line-height: 1 !important;
    margin: 0 !important;
  }

  .verificationRef {
    margin-top: .25mm !important;
    font-size: 5.6pt !important;
    line-height: 1 !important;
  }

  .dateCell,
  .moneyCell {
    white-space: nowrap !important;
  }

  /* Summary blocks stay together and all summary cells share one row height. */
  .sheetSummary {
    flex: 0 0 auto !important;
    break-inside: avoid !important;
    page-break-inside: avoid !important;
    margin: 0 !important;
  }

  .sheetSummary h3 {
    min-height: 8.5mm !important;
    padding: 1.7mm 2.5mm !important;
    display: flex !important;
    align-items: center !important;
    box-sizing: border-box !important;
  }

  .sheetSummary > div {
    min-height: 9mm !important;
    padding: 1.5mm 2.5mm !important;
    align-items: center !important;
    box-sizing: border-box !important;
    line-height: 1.05 !important;
  }

  /* Page 2 has the densest content: compact only the harmless vertical gaps. */
  .printPage:nth-child(2) .sheetHeader {
    padding-bottom: 2.4mm !important;
    margin-bottom: 2.4mm !important;
  }

  .printPage:nth-child(2) .sheetInfoBoard {
    margin-bottom: 2.5mm !important;
  }

  .printPage:nth-child(2) .portraitSection {
    gap: 1.8mm !important;
  }

  .printPage:nth-child(2) .sheetMain h2 {
    margin-bottom: .9mm !important;
  }

  .printPage:nth-child(2) .depositHeading {
    margin-top: 1.8mm !important;
  }

  .printPage:nth-child(2) .sheetMain .supervisionBillTable tbody tr,
  .printPage:nth-child(2) .sheetMain .depositTable tbody tr {
    height: 6.6mm !important;
    min-height: 6.6mm !important;
  }

  .printPage:nth-child(2) .sheetMain .supervisionBillTable td,
  .printPage:nth-child(2) .sheetMain .depositTable td {
    height: 6.6mm !important;
    min-height: 6.6mm !important;
    padding-top: .45mm !important;
    padding-bottom: .45mm !important;
  }

  .printPage:nth-child(2) .sheetSummary h3 {
    min-height: 7.5mm !important;
    padding-top: 1.2mm !important;
    padding-bottom: 1.2mm !important;
  }

  .printPage:nth-child(2) .sheetSummary > div {
    min-height: 8mm !important;
    padding-top: 1.1mm !important;
    padding-bottom: 1.1mm !important;
  }

  /* Footer always owns its own clean band and can no longer be overlapped. */
  .sheetFooter {
    bottom: 5mm !important;
    min-height: 6mm !important;
    background: #fff !important;
    z-index: 20 !important;
    box-sizing: border-box !important;
  }

  /* Page 3 bottom cards must also remain above the footer-safe zone. */
  .sheetBottom {
    bottom: 17mm !important;
  }
}
'''

path.write_text(css + patch, encoding='utf-8')
print('Patched invoice print layout v3')
