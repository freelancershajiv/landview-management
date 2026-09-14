from pathlib import Path

page_path = Path('app/admin/finance/invoices/page.tsx')
css_path = Path('app/admin/finance/invoices/invoice.module.css')

page = page_path.read_text()

old_contact = '<div className={styles.sheetContact}><span>Feni Sadar, Feni, Bangladesh</span><span>+88 01902 500 400</span><span>landviewcivil@gmail.com</span><span>www.landview.com.bd</span></div>\n        <div className={styles.sheetTitle}><small>Page {page} of 3</small><b>Project Billing Statement</b><strong>{title}</strong></div>'
new_header = '''<div className={styles.sheetTitle}><small>Page {page} of 3</small><b>Project Billing Statement</b><strong>{title}</strong></div>
        <div className={styles.sheetHeaderQr}>
          {qrUrl ? <img className={styles.sheetHeaderQrImage} src={qrUrl} alt={`Verify ${result?.id || "project"}`} width={96} height={96}/> : <div className={styles.sheetHeaderQrPlaceholder}>QR</div>}
          <small>Scan to verify</small>
        </div>'''
if old_contact not in page:
    raise SystemExit('Header contact block not found')
page = page.replace(old_contact, new_header, 1)

old_footer = '<footer className={styles.sheetFooter}><strong>LAND VIEW</strong><span>A SAFER BUILT ENVIRONMENT FOR A BETTER TOMORROW</span></footer>'
new_footer = '<footer className={styles.sheetFooter}><strong>LAND VIEW</strong><span>Feni Sadar, Feni · +88 01902 500 400 · landviewcivil@gmail.com · www.landview.com.bd</span></footer>'
page = page.replace(old_footer, new_footer)

old_bottom = '<div className={styles.sheetBottom}><div className={styles.sheetThanks}>Thank you for your trust in LAND VIEW.<br/>For any query, please contact us.</div><div className={styles.sheetSignature}>Authorized Signature<br/><strong>LAND VIEW</strong></div><div className={styles.sheetQr}>{qrUrl?<img src={qrUrl} alt={`Permanent QR code for ${result.id}`} width={220} height={220}/>:<div className={styles.qrPlaceholder}>{verificationError||"Preparing QR…"}</div>}<div><strong>Scan for live billing</strong><span>Permanent project QR</span><b>{result.id}</b></div></div></div>'
new_bottom = '<div className={styles.sheetBottom}><div className={styles.sheetThanks}>Thank you for your trust in LAND VIEW.<br/>For any query, please contact us.</div><div className={styles.sheetSignature}>Authorized Signature<br/><strong>LAND VIEW</strong></div></div>'
if old_bottom in page:
    page = page.replace(old_bottom, new_bottom, 1)

page_path.write_text(page)

css = css_path.read_text()
marker = '/* LAND VIEW print header QR + footer contacts v10 */'
if marker not in css:
    css += r'''

/* LAND VIEW print header QR + footer contacts v10 */
@media print{
  .sheetHeader{
    grid-template-columns:minmax(0,1.55fr) minmax(0,1fr) 25mm!important;
    align-items:center!important;
    gap:4mm!important;
    padding:0 0 3mm!important;
    margin-bottom:3mm!important;
    border-bottom:.8mm solid #e12b31!important;
  }
  .sheetBrand{margin-left:4mm!important;align-self:center!important}
  .sheetBrandLockup{align-items:center!important;gap:2.8mm!important}
  .sheetBrandLogo{width:18mm!important;height:18mm!important;flex:0 0 18mm!important;object-fit:contain!important}
  .sheetBrandWords>strong{font-size:16.5pt!important;line-height:1!important}
  .sheetBrandWords small{font-size:8.2pt!important;letter-spacing:.8px!important;margin-top:1mm!important}
  .sheetBrand>em{margin-left:20.8mm!important;margin-top:.8mm!important;font-size:8.2pt!important;color:#555!important}
  .sheetTitle{align-self:center!important;justify-self:end!important;min-width:0!important}
  .sheetTitle small{font-size:8.2pt!important;margin-bottom:1mm!important}
  .sheetTitle b{font-size:10.5pt!important;border-top:0!important;padding-top:0!important;color:#111!important;white-space:nowrap!important}
  .sheetTitle strong{font-size:13pt!important;margin-top:.8mm!important;color:#e12b31!important}
  .sheetHeaderQr{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:.7mm!important}
  .sheetHeaderQrImage,.sheetHeaderQrPlaceholder{width:22mm!important;height:22mm!important;box-sizing:border-box!important}
  .sheetHeaderQrImage{display:block!important;background:#fff!important;border:1px solid #d7dadd!important;padding:.8mm!important}
  .sheetHeaderQrPlaceholder{display:grid!important;place-items:center!important;border:1px dashed #bbb!important;color:#777!important;font-size:8pt!important}
  .sheetHeaderQr small{font-size:7.6pt!important;color:#555!important;white-space:nowrap!important}
  .sheetContact{display:none!important}

  /* Red is an accent, not a frame around every cell. */
  .sheetInfoBoard{border:.35mm solid #333!important}
  .sheetMetaPair span,.sheetMetaPair strong,.sheetPanelTitles strong,.sheetInfoRow span,.sheetInfoRow strong{border-color:#cfd3d6!important}
  .sheetPanelTitles strong:first-child{border-right-color:#cfd3d6!important}
  .sheetMetaPair span,.sheetPanelTitles strong,.sheetInfoRow span{background:#232629!important;color:#fff!important}
  .sheetMain .tableWrap{border:1px solid #c9ced2!important;border-top:0!important}
  .sheetMain th{background:#25282b!important;color:#fff!important;border:0!important;border-bottom:.6mm solid #e12b31!important;box-shadow:none!important}
  .sheetMain thead tr{border-top:0!important}
  .sheetMain table{border-top:0!important}

  .sheetFooter{
    left:10mm!important;right:10mm!important;bottom:4.5mm!important;
    display:grid!important;grid-template-columns:auto 1fr!important;gap:4mm!important;
    align-items:center!important;border-top:.55mm solid #e12b31!important;padding-top:1.7mm!important;
    font-size:8.2pt!important;color:#4b4f52!important;
  }
  .sheetFooter strong{font-size:8.8pt!important;color:#111!important;white-space:nowrap!important}
  .sheetFooter span{text-align:right!important;white-space:nowrap!important}
  .sheetBottom{grid-template-columns:1fr .85fr!important;right:10mm!important;bottom:17mm!important;gap:9mm!important}
  .sheetThanks,.sheetSignature{font-size:8.5pt!important}
  .sheetQr{display:none!important}
}
'''
css_path.write_text(css)
print('Patched print header, top QR, footer contact details, and border cleanup.')
