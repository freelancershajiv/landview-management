from pathlib import Path

path = Path('app/admin/finance/invoices/invoice.module.css')
css = path.read_text(encoding='utf-8')
start = '/* Invoice red/black theme sync v8 */'
end = '/* End invoice red/black theme sync v8 */'
if start in css and end in css:
    before, rest = css.split(start, 1)
    _, after = rest.split(end, 1)
    css = before.rstrip() + '\n' + after.lstrip('\n')

block = r'''
/* Invoice red/black theme sync v8 */
.workspace {
  --inv-red: #e12b31;
  --inv-red-bright: #ff4b51;
  --inv-red-dark: #b6131b;
  --inv-ink: #0f1419;
  --inv-panel: #111920;
  --inv-panel-2: #172129;
  --inv-border: #2d3a43;
  --inv-text: #f3f6f8;
  --inv-muted: #95a3ad;
  color: var(--inv-text) !important;
}
.header a,
.verificationLabel,
.verificationBlock a { color: var(--inv-red-bright) !important; }
.header h1 { color: #fff !important; }
.header p,.eyebrow { color: var(--inv-muted) !important; }
.printButton,
.lookup button {
  background: linear-gradient(180deg,var(--inv-red-bright),var(--inv-red)) !important;
  color: #fff !important;
  border: 1px solid #f05a5f !important;
  box-shadow: 0 8px 20px rgba(225,43,49,.18) !important;
}
.printButton:hover,
.lookup button:hover:not(:disabled) { background: var(--inv-red) !important; }
.lookup,
.category,
.verificationBlock {
  background: linear-gradient(160deg,var(--inv-panel-2),var(--inv-panel)) !important;
  border-color: var(--inv-border) !important;
}
.lookup input {
  background: #0a1015 !important;
  border-color: #394852 !important;
  color: #fff !important;
}
.lookup input:focus {
  border-color: var(--inv-red) !important;
  box-shadow: 0 0 0 3px rgba(225,43,49,.10) !important;
  outline: none !important;
}
.projectCard > div {
  background: linear-gradient(145deg,#151f27,#0e151b) !important;
  border-color: var(--inv-border) !important;
}
.projectCard span,.metrics span,.grandSummary span { color: var(--inv-muted) !important; }
.totalDueCard { border-top-color: var(--inv-red) !important; }
.totalDueCard strong,.metrics > div:last-child strong,.formula strong { color: var(--inv-red-bright) !important; }
.categoryHeader { border-bottom-color: #2c3942 !important; }
.categoryHeader h2,.split h3 { color: #f4f7f9 !important; }
.categoryHeader span { color: #94a2ac !important; }
.metrics { border-bottom-color: #2c3942 !important; }
.metrics > div { border-right-color: #2c3942 !important; }
.tableWrap { border-color: #33424c !important; }
.tableWrap th {
  background: #1b252d !important;
  color: #cbd4da !important;
  border-top: 2px solid var(--inv-red) !important;
}
.tableWrap td { border-top-color: #293740 !important; color: #e3e9ed !important; }
.formula { background: #0b1116 !important; border-top-color: #2b3942 !important; }
.formula span { color: #a4b0b8 !important; }
.grandSummary {
  background: #0c1217 !important;
  border-color: #313f48 !important;
}
.grandSummary > div { border-right-color: #313f48 !important; }
.grandDue {
  background: linear-gradient(180deg,var(--inv-red-bright),var(--inv-red-dark)) !important;
}
.grandDue span,.grandDue strong { color: #fff !important; }
.verificationBlock { box-shadow: inset 3px 0 var(--inv-red) !important; }
.verificationBlock p { color: #a9b5bd !important; }
.dueBadge { background: rgba(225,43,49,.15) !important; color: #ffaaa7 !important; border-color: rgba(225,43,49,.42) !important; }

@media print {
  .sheetHeader {
    border-bottom-color: #e12b31 !important;
  }
  .sheetBrandWords > strong { color: #111820 !important; }
  .sheetBrandWords > strong span { color: #e12b31 !important; }
  .sheetBrandWords small { color: #111820 !important; }
  .sheetBrand > em,.sheetContact,.sheetTitle small { color: #4b5560 !important; }
  .sheetTitle b {
    border-top-color: #e12b31 !important;
    color: #111820 !important;
  }
  .sheetTitle strong { color: #e12b31 !important; }

  .sheetInfoBoard { border-color: #171d22 !important; }
  .sheetMetaPair span,
  .sheetInfoRow span {
    background: #171d22 !important;
    color: #fff !important;
    border-color: #171d22 !important;
  }
  .sheetPanelTitles strong {
    background: #e12b31 !important;
    color: #fff !important;
    border-color: #b6131b !important;
  }
  .sheetMetaPair strong,
  .sheetInfoRow strong {
    background: #fff !important;
    color: #111820 !important;
    border-color: #171d22 !important;
  }

  .sheetMain h2 { color: #111820 !important; }
  .sheetMain h2 span { color: #e12b31 !important; }
  .sheetMain th {
    background: #171d22 !important;
    color: #fff !important;
    border-color: #171d22 !important;
    box-shadow: inset 0 1mm #e12b31 !important;
  }
  .sheetMain td {
    color: #111820 !important;
    background: #fff !important;
    border-color: #cfd4d8 !important;
  }

  .sheetSummary { border-color: #dfc7c9 !important; }
  .sheetSummary h3 {
    background: #fff1f2 !important;
    color: #b6131b !important;
    border-color: #efc9cc !important;
  }
  .sheetSummary > div { border-color: #dedede !important; }
  .sheetSummary > div span { color: #4b5055 !important; }
  .sheetSummary > div strong { color: #111820 !important; }
  .sheetSummary > div.sheetDue,
  .sheetSummary > div.sheetGrandDue {
    background: #e12b31 !important;
    color: #fff !important;
  }
  .sheetSummary > div.sheetDue span,
  .sheetSummary > div.sheetDue strong,
  .sheetSummary > div.sheetGrandDue span,
  .sheetSummary > div.sheetGrandDue strong { color: #fff !important; }

  .sheetFooter { border-top-color: #e12b31 !important; }
  .sheetQr { border-color: #e12b31 !important; }
  .sheetQr > div:last-child strong { color: #e12b31 !important; }
  .sheetThanks { border-left: 1mm solid #e12b31 !important; background: #fafafa !important; }
  .verificationVerified { color: #1f7a3f !important; }
  .verificationUnverified { color: #b6131b !important; }
}
/* End invoice red/black theme sync v8 */
'''

path.write_text(css.rstrip() + '\n\n' + block.strip() + '\n', encoding='utf-8')
print('invoice red/black theme v8 applied')
