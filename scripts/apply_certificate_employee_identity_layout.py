from pathlib import Path


def must_replace(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing patch target: {label}")
    return text.replace(old, new, 1)

# -----------------------------------------------------------------------------
# Admin certificate form
# -----------------------------------------------------------------------------
path = Path("app/admin/certificates/page.tsx")
text = path.read_text()
text = must_replace(text,
'''  description: string;\n  expiresAt?: string;''',
'''  description: string;\n  fatherName?: string;\n  motherName?: string;\n  nidNo?: string;\n  expiresAt?: string;''', "admin record identity fields")
text = must_replace(text,
'''  const [address, setAddress] = useState("");\n  const [position, setPosition] = useState(meta.project.position);''',
'''  const [address, setAddress] = useState("");\n  const [fatherName, setFatherName] = useState("");\n  const [motherName, setMotherName] = useState("");\n  const [nidNo, setNidNo] = useState("");\n  const [position, setPosition] = useState(meta.project.position);''', "admin states")
text = must_replace(text,
'''    setType(next); setName(""); setAddress(""); setPosition(meta[next].position); setSubject(""); setReference(""); setDescription(meta[next].statement); setIssueDate(today()); setExpiryDate(""); setReissueOf(""); setIssued(null); setError("");''',
'''    setType(next); setName(""); setAddress(""); setFatherName(""); setMotherName(""); setNidNo(""); setPosition(meta[next].position); setSubject(""); setReference(""); setDescription(meta[next].statement); setIssueDate(today()); setExpiryDate(""); setReissueOf(""); setIssued(null); setError("");''', "admin reset")
text = must_replace(text,
'''    setType(item.type); setName(item.name || ""); setAddress(item.address || ""); setPosition(item.position || meta[item.type].position); setSubject(item.subject || ""); setReference(item.reference || ""); setDescription(item.description || meta[item.type].statement); setIssueDate(today()); setExpiryDate(localDate(item.expiresAt)); setReissueOf(item.certificateId); setIssued(null); setError(""); window.scrollTo({ top: 0, behavior: "smooth" });''',
'''    setType(item.type); setName(item.name || ""); setAddress(item.address || ""); setFatherName(item.fatherName || ""); setMotherName(item.motherName || ""); setNidNo(item.nidNo || ""); setPosition(item.position || meta[item.type].position); setSubject(item.subject || ""); setReference(item.reference || ""); setDescription(item.description || meta[item.type].statement); setIssueDate(today()); setExpiryDate(localDate(item.expiresAt)); setReissueOf(item.certificateId); setIssued(null); setError(""); window.scrollTo({ top: 0, behavior: "smooth" });''', "admin reissue")
text = must_replace(text,
'''        body: JSON.stringify({ type, name, address, position, subject, reference, description, reissueOf, issuedAt:''',
'''        body: JSON.stringify({ type, name, address, fatherName, motherName, nidNo, position, subject, reference, description, reissueOf, issuedAt:''', "admin post payload")
text = must_replace(text,
'''            <label className="cert-field full"><span>ADDRESS</span><input value={address} onChange={(e) => setAddress(e.target.value)} /></label>\n            <label className="cert-field full"><span>CERTIFICATE SUBJECT</span>''',
'''            <label className="cert-field full"><span>ADDRESS</span><input value={address} onChange={(e) => setAddress(e.target.value)} /></label>\n            {type === "employee" && <>\n              <label className="cert-field"><span>FATHER'S NAME</span><input value={fatherName} onChange={(e) => setFatherName(e.target.value)} /></label>\n              <label className="cert-field"><span>MOTHER'S NAME</span><input value={motherName} onChange={(e) => setMotherName(e.target.value)} /></label>\n              <label className="cert-field full"><span>NID NO.</span><input inputMode="numeric" value={nidNo} onChange={(e) => setNidNo(e.target.value)} /></label>\n            </>}\n            <label className="cert-field full"><span>CERTIFICATE SUBJECT</span>''', "admin identity inputs")
path.write_text(text)

# -----------------------------------------------------------------------------
# Verification payload
# -----------------------------------------------------------------------------
path = Path("lib/certificate-verification.ts")
text = path.read_text()
text = must_replace(text,
'''  d: string;\n  i: string;''',
'''  d: string;\n  f?: string;\n  m?: string;\n  nid?: string;\n  i: string;''', "token type fields")
text = must_replace(text,
'''    d: String(input.d ?? "").trim().replace(/\\r\\n?/g, "\\n"),\n    i: clean(input.i, 40),''',
'''    d: String(input.d ?? "").trim().replace(/\\r\\n?/g, "\\n"),\n    ...(input.f ? { f: clean(input.f, 120) } : {}),\n    ...(input.m ? { m: clean(input.m, 120) } : {}),\n    ...(input.nid ? { nid: clean(input.nid, 40) } : {}),\n    i: clean(input.i, 40),''', "token serialization")
path.write_text(text)

# -----------------------------------------------------------------------------
# Certificate API
# -----------------------------------------------------------------------------
path = Path("app/api/certificates/route.ts")
text = path.read_text()
text = must_replace(text,
'''import { CertificateType, signCertificate } from "@/lib/certificate-verification";''',
'''import { CertificateType, signCertificate, verifyCertificate } from "@/lib/certificate-verification";''', "api verify import")
text = must_replace(text,
'''    const certificates = (Array.isArray(data?.certificates) ? data.certificates : []).map((item: any) => ({ ...item, ...certificateUrls(request, clean(item?.token, 5000)), token: undefined }));''',
'''    const certificates = (Array.isArray(data?.certificates) ? data.certificates : []).map((item: any) => {\n      const signed = clean(item?.token, 5000);\n      const verified = signed ? verifyCertificate(signed) : null;\n      return {\n        ...item,\n        fatherName: clean(item?.fatherName || item?.Father_Name || verified?.f, 120),\n        motherName: clean(item?.motherName || item?.Mother_Name || verified?.m, 120),\n        nidNo: clean(item?.nidNo || item?.NID_No || item?.NID || verified?.nid, 40),\n        ...certificateUrls(request, signed),\n        token: undefined,\n      };\n    });''', "api registry normalization")
text = must_replace(text,
'''    const address = clean(input?.address, 220);\n    const position = clean(input?.position, 120);''',
'''    const address = clean(input?.address, 220);\n    const fatherName = clean(input?.fatherName, 120);\n    const motherName = clean(input?.motherName, 120);\n    const nidNo = clean(input?.nidNo, 40);\n    const position = clean(input?.position, 120);''', "api identity inputs")
text = must_replace(text,
'''    const signedToken = signCertificate({ id: certificateId, t: type, n: name, a: address, p: position, s: subject, r: reference, d: description, i: issuedAt, x: expiresAt || undefined });''',
'''    const signedToken = signCertificate({ id: certificateId, t: type, n: name, a: address, p: position, s: subject, r: reference, d: description, f: fatherName || undefined, m: motherName || undefined, nid: nidNo || undefined, i: issuedAt, x: expiresAt || undefined });''', "api signed token")
text = must_replace(text,
'''      Name: name, Address: address, Position: position, Subject: subject, Reference: reference, Description: description,''',
'''      Name: name, Address: address, Father_Name: fatherName, Mother_Name: motherName, NID_No: nidNo, Position: position, Subject: subject, Reference: reference, Description: description,''', "api registry payload")
text = must_replace(text,
'''name, address, position, subject, reference, description, expiresAt:''',
'''name, address, fatherName, motherName, nidNo, position, subject, reference, description, expiresAt:''', "api response identity")
path.write_text(text)

# -----------------------------------------------------------------------------
# QR verification page
# -----------------------------------------------------------------------------
path = Path("app/certificate/verify/[token]/page.tsx")
text = path.read_text()
text = must_replace(text,
'''          <div><span>Address</span><strong>{certificate.a || "—"}</strong></div>\n          <div><span>Position / Designation</span>''',
'''          <div><span>Address</span><strong>{certificate.a || "—"}</strong></div>\n          {certificate.t === "employee" && <div><span>Father's Name</span><strong>{certificate.f || "—"}</strong></div>}\n          {certificate.t === "employee" && <div><span>Mother's Name</span><strong>{certificate.m || "—"}</strong></div>}\n          {certificate.t === "employee" && <div><span>NID No.</span><strong>{certificate.nid || "—"}</strong></div>}\n          <div><span>Position / Designation</span>''', "verification identity display")
path.write_text(text)

# -----------------------------------------------------------------------------
# Printable certificate component
# -----------------------------------------------------------------------------
path = Path("components/certificate-document.tsx")
text = path.read_text()
text = must_replace(text,
'''  description: string; qrUrl?: string; verificationUrl?: string;''',
'''  description: string; fatherName?: string; motherName?: string; nidNo?: string; qrUrl?: string; verificationUrl?: string;''', "document identity type")
text = must_replace(text,
'''.lv-cert .lv-cert-signatures{position:relative;display:grid;grid-template-columns:1.8fr 1fr .85fr;gap:22px;align-items:end;margin-top:20px;break-inside:avoid}\n.lv-cert .lv-cert-signature{font-size:11px;line-height:1.4}\n.lv-cert .lv-cert-authorized{font:italic 24px/1.5 Georgia,serif;min-height:43px}\n.lv-cert .lv-cert-signature-line{border-top:1px solid #171717;width:230px;padding-top:4px;font-size:14px;font-weight:700}\n.lv-cert .lv-cert-firm{display:block;font-size:19px;font-weight:800;color:#bc1118!important}\n.lv-cert .lv-cert-seal{width:132px;height:132px;border:3px double #154b9b;border-radius:50%;padding:9px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#154b9b!important;outline:1px solid #154b9b;outline-offset:3px;text-align:center;font-size:9px;font-weight:800;transform:rotate(-8deg)}\n.lv-cert .lv-cert-seal b{font-size:16px;letter-spacing:1px;white-space:nowrap}\n.lv-cert .lv-cert-seal .lv-cert-mark{width:38px;height:43px;margin:4px 0}\n.lv-cert .lv-cert-verify{text-align:center;font-size:10px;justify-self:end}\n.lv-cert .lv-cert-motto{border-left:1px solid #111;padding-left:10px;text-align:left;letter-spacing:1px;font-size:9px;line-height:1.25;margin-bottom:14px}\n.lv-cert .lv-cert-motto:after{content:"";display:block;width:38px;height:2px;background:#d71920;margin-top:7px}\n.lv-cert .lv-cert-verify img{display:block;width:90px;height:90px;padding:3px;background:white;object-fit:contain;margin-bottom:3px}\n.lv-cert .lv-cert-verify strong{display:block}''',
'''.lv-cert .lv-cert-identity{display:grid;grid-template-columns:1fr 1fr;border:1px solid #d6d9dc;border-radius:5px;overflow:hidden;margin:13px 0 15px;background:#fafafa}\n.lv-cert .lv-cert-identity div{display:grid;grid-template-columns:112px 1fr;gap:8px;padding:7px 10px;border-bottom:1px solid #e1e3e5;font-size:11.5px;line-height:1.25}\n.lv-cert .lv-cert-identity div:nth-child(odd){border-right:1px solid #e1e3e5}.lv-cert .lv-cert-identity div:nth-last-child(-n+2){border-bottom:0}\n.lv-cert .lv-cert-identity b{font-weight:800}\n.lv-cert .lv-cert-signatures{position:relative;display:grid;grid-template-columns:118px 285px 1fr;gap:24px;align-items:start;margin-top:26px;break-inside:avoid}\n.lv-cert .lv-cert-verify{text-align:left;font-size:9px;padding-top:4px}\n.lv-cert .lv-cert-verify img{display:block;width:78px;height:78px;padding:2px;background:white;object-fit:contain;margin:0 0 5px}\n.lv-cert .lv-cert-verify strong{display:block;font-size:10px}.lv-cert .lv-cert-verify span{display:block;color:#555!important;line-height:1.25;margin-top:2px}\n.lv-cert .lv-cert-signature{font-size:11px;line-height:1.35;padding-top:10px}\n.lv-cert .lv-cert-authorized{font:italic 23px/1.2 Georgia,serif;min-height:46px;display:flex;align-items:flex-end}\n.lv-cert .lv-cert-signature-line{border-top:1px solid #171717;width:245px;padding-top:5px;font-size:12px;font-weight:700}\n.lv-cert .lv-cert-firm{display:block;font-size:17px;font-weight:800;color:#bc1118!important;margin-top:1px}\n.lv-cert .lv-cert-seal{position:relative;width:116px;height:116px;border:2px solid #174c91;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#174c91!important;text-align:center;font-size:7px;font-weight:800;margin-top:11px;margin-left:55px;background:radial-gradient(circle at center,#fff 0 46%,transparent 47%)}\n.lv-cert .lv-cert-seal:before,.lv-cert .lv-cert-seal:after{content:"";position:absolute;border:1px solid #174c91;border-radius:50%}.lv-cert .lv-cert-seal:before{inset:5px}.lv-cert .lv-cert-seal:after{inset:11px}\n.lv-cert .lv-cert-seal b{font-size:14px;letter-spacing:1.2px;white-space:nowrap;z-index:1}.lv-cert .lv-cert-seal small{font-size:6px;letter-spacing:.7px;z-index:1}.lv-cert .lv-cert-seal .lv-cert-mark{width:31px;height:35px;margin:3px 0;z-index:1}\n.lv-cert .lv-cert-signature-block{display:flex;flex-direction:column;align-items:flex-start}\n.lv-cert .lv-cert-signature-note{font-size:8px;color:#666!important;margin-top:3px}''', "document lower layout css")
text = must_replace(text,
'''      {issued.type !== "employee" && <p className="lv-cert-subject">{issued.subject}</p>}\n      {content.lines.map''',
'''      {issued.type === "employee" && (issued.fatherName || issued.motherName || issued.nidNo) && <div className="lv-cert-identity">\n        <div><b>Father's Name:</b><span>{issued.fatherName || "—"}</span></div>\n        <div><b>Mother's Name:</b><span>{issued.motherName || "—"}</span></div>\n        <div><b>NID No:</b><span>{issued.nidNo || "—"}</span></div>\n        <div><b>Employee ID:</b><span>{issued.reference || "—"}</span></div>\n      </div>}\n      {issued.type !== "employee" && <p className="lv-cert-subject">{issued.subject}</p>}\n      {content.lines.map''', "document identity table")
text = must_replace(text,
'''    <div className="lv-cert-signatures"><div className="lv-cert-signature"><div className="lv-cert-authorized">Authorized</div><div className="lv-cert-signature-line">Managing Director &amp; CEO</div><b className="lv-cert-firm">LAND VIEW</b><span>Engineering &amp; Architectural Consultancy</span></div><div className="lv-cert-seal"><b>LAND VIEW</b><BrandMark/><span>BUILD<br/>SAFER SPACES</span></div><div className="lv-cert-verify"><div className="lv-cert-motto">PEOPLE<br/>PLANS<br/>PLACES<br/>POSSIBILITIES</div>{issued.qrUrl && <img src={issued.qrUrl} alt="Certificate verification QR"/>}<strong>Verify Certificate</strong></div></div>''',
'''    <div className="lv-cert-signatures">\n      <div className="lv-cert-verify">{issued.qrUrl && <img src={issued.qrUrl} alt="Certificate verification QR"/>}<strong>Verify Certificate</strong><span>Scan to verify this certificate.</span></div>\n      <div className="lv-cert-signature-block"><div className="lv-cert-signature"><div className="lv-cert-authorized">Authorized</div><div className="lv-cert-signature-line">Managing Director &amp; CEO</div><b className="lv-cert-firm">LAND VIEW</b><span>Engineering &amp; Architectural Consultancy</span><div className="lv-cert-signature-note">Sign above the line · Official seal below</div></div><div className="lv-cert-seal"><b>LAND VIEW</b><BrandMark/><small>ENGINEERING &amp; ARCHITECTURAL</small><small>CONSULTANCY</small></div></div>\n      <div/>\n    </div>''', "document lower markup")
path.write_text(text)

print("Applied employee identity fields and redesigned certificate lower layout.")
