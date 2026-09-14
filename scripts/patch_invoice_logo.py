from pathlib import Path

page = Path('app/admin/finance/invoices/page.tsx')
css = Path('app/admin/finance/invoices/invoice.module.css')

page_text = page.read_text(encoding='utf-8')
old = '<div className={styles.sheetBrand}><strong>LAND <span>VIEW</span></strong><small>ENGINEERS AND ARCHITECTS</small><em>Building a safer tomorrow</em></div>'
new = '''<div className={styles.sheetBrand}>
          <div className={styles.sheetBrandLockup}>
            <img className={styles.sheetBrandLogo} src="/land-view-logo.svg" alt="LAND VIEW logo" />
            <div className={styles.sheetBrandWords}>
              <strong>LAND <span>VIEW</span></strong>
              <small>ENGINEERS AND ARCHITECTS</small>
            </div>
          </div>
          <em>Building a safer tomorrow</em>
        </div>'''

if old not in page_text:
    if 'className={styles.sheetBrandLogo}' not in page_text:
        raise SystemExit('Print brand block not found')
else:
    page_text = page_text.replace(old, new, 1)
    page.write_text(page_text, encoding='utf-8')

css_text = css.read_text(encoding='utf-8')
marker = '/* Invoice print logo repair v4 */'
block = r'''

/* Invoice print logo repair v4 */
@media print {
  .sheetBrand {
    display:flex!important;
    flex-direction:column!important;
    justify-content:flex-start!important;
    min-width:0!important;
  }
  .sheetBrandLockup {
    display:flex!important;
    align-items:center!important;
    gap:2.2mm!important;
    min-height:12mm!important;
  }
  .sheetBrandLogo {
    display:block!important;
    width:12mm!important;
    height:12mm!important;
    flex:0 0 12mm!important;
    object-fit:contain!important;
  }
  .sheetBrandWords {
    display:flex!important;
    flex-direction:column!important;
    min-width:0!important;
  }
  .sheetBrandWords>strong {
    font-size:14.2pt!important;
    line-height:.95!important;
    color:#111!important;
    white-space:nowrap!important;
  }
  .sheetBrandWords>strong span {
    color:#d61f26!important;
  }
  .sheetBrandWords small {
    display:block!important;
    font-size:6.2pt!important;
    letter-spacing:.9px!important;
    margin-top:1.2mm!important;
    color:#222!important;
    white-space:nowrap!important;
  }
  .sheetBrand>em {
    margin-top:.8mm!important;
    margin-left:14.2mm!important;
    font-size:6.1pt!important;
    line-height:1!important;
    color:#666!important;
    white-space:nowrap!important;
  }
}
'''
if marker not in css_text:
    css.write_text(css_text.rstrip() + block + '\n', encoding='utf-8')
