from pathlib import Path

path = Path("components/certificate-document.tsx")
text = path.read_text()

old_css = '''.lv-cert .lv-cert-signatures{position:relative;display:grid;grid-template-columns:118px 285px 1fr;gap:24px;align-items:start;margin-top:26px;break-inside:avoid}
.lv-cert .lv-cert-verify{text-align:left;font-size:9px;padding-top:4px}
.lv-cert .lv-cert-verify img{display:block;width:78px;height:78px;padding:2px;background:white;object-fit:contain;margin:0 0 5px}
.lv-cert .lv-cert-verify strong{display:block;font-size:10px}.lv-cert .lv-cert-verify span{display:block;color:#555!important;line-height:1.25;margin-top:2px}
.lv-cert .lv-cert-signature{font-size:11px;line-height:1.35;padding-top:10px}
.lv-cert .lv-cert-authorized{font:italic 23px/1.2 Georgia,serif;min-height:46px;display:flex;align-items:flex-end}
.lv-cert .lv-cert-signature-line{border-top:1px solid #171717;width:245px;padding-top:5px;font-size:12px;font-weight:700}
.lv-cert .lv-cert-firm{display:block;font-size:17px;font-weight:800;color:#bc1118!important;margin-top:1px}
.lv-cert .lv-cert-seal{position:relative;width:116px;height:116px;border:2px solid #174c91;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#174c91!important;text-align:center;font-size:7px;font-weight:800;margin-top:11px;margin-left:55px;background:radial-gradient(circle at center,#fff 0 46%,transparent 47%)}
.lv-cert .lv-cert-seal:before,.lv-cert .lv-cert-seal:after{content:"";position:absolute;border:1px solid #174c91;border-radius:50%}.lv-cert .lv-cert-seal:before{inset:5px}.lv-cert .lv-cert-seal:after{inset:11px}
.lv-cert .lv-cert-seal b{font-size:14px;letter-spacing:1.2px;white-space:nowrap;z-index:1}.lv-cert .lv-cert-seal small{font-size:6px;letter-spacing:.7px;z-index:1}.lv-cert .lv-cert-seal .lv-cert-mark{width:31px;height:35px;margin:3px 0;z-index:1}
.lv-cert .lv-cert-signature-block{display:flex;flex-direction:column;align-items:flex-start}
.lv-cert .lv-cert-signature-note{font-size:8px;color:#666!important;margin-top:3px}'''

new_css = '''.lv-cert .lv-cert-signatures{position:relative;display:flex;justify-content:center;align-items:center;margin-top:30px;break-inside:avoid;text-align:center}
.lv-cert .lv-cert-verify{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-size:9px;min-width:130px}
.lv-cert .lv-cert-verify img{display:block;width:82px;height:82px;padding:0;background:#fff;object-fit:contain;margin:0 auto 6px}
.lv-cert .lv-cert-verify strong{display:block;font-size:10px;font-weight:800}.lv-cert .lv-cert-verify span{display:block;color:#666!important;line-height:1.25;margin-top:2px}'''

if old_css not in text:
    raise SystemExit("Certificate lower-layout CSS target not found")
text = text.replace(old_css, new_css, 1)

old_jsx = '''    <div className="lv-cert-signatures">
      <div className="lv-cert-verify">{issued.qrUrl && <img src={issued.qrUrl} alt="Certificate verification QR"/>}<strong>Verify Certificate</strong><span>Scan to verify this certificate.</span></div>
      <div className="lv-cert-signature-block"><div className="lv-cert-signature"><div className="lv-cert-authorized">Authorized</div><div className="lv-cert-signature-line">Managing Director &amp; CEO</div><b className="lv-cert-firm">LAND VIEW</b><span>Engineering &amp; Architectural Consultancy</span><div className="lv-cert-signature-note">Sign above the line · Official seal below</div></div><div className="lv-cert-seal"><b>LAND VIEW</b><BrandMark/><small>ENGINEERING &amp; ARCHITECTURAL</small><small>CONSULTANCY</small></div></div>
      <div/>
    </div>'''

new_jsx = '''    <div className="lv-cert-signatures">
      <div className="lv-cert-verify">{issued.qrUrl && <img src={issued.qrUrl} alt="Certificate verification QR"/>}<strong>Verify Certificate</strong><span>Scan to verify.</span></div>
    </div>'''

if old_jsx not in text:
    raise SystemExit("Certificate lower-layout JSX target not found")
text = text.replace(old_jsx, new_jsx, 1)

path.write_text(text)
print("Removed certificate seal/signature and centered a simplified QR block.")
# trigger
