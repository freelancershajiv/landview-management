import { certificateContent } from "../lib/certificate-content";

type Certificate = {
  type: "employee" | "project" | "building";
  name: string; address: string; position: string; subject: string;
  reference: string; certificateId: string; issuedAt: string;
  description: string; qrUrl?: string; verificationUrl?: string;
};

export const certificateStyles = `
@font-face{font-family:"Certificate Bengali";src:url("/fonts/noto-sans-bengali-400.woff2") format("woff2");font-style:normal;font-weight:400;font-display:block}
.lv-cert-scroll{overflow-x:auto;width:100%}
.lv-cert{box-sizing:border-box!important;position:relative;isolation:isolate;width:794px;min-height:1123px;margin:0 auto;background:#fff!important;color:#171717!important;border:3px solid #d71920;padding:194px 48px 130px;font:14px/1.4 Arial,Helvetica,"Certificate Bengali",sans-serif!important;box-shadow:0 18px 60px #0004;overflow:hidden;color-scheme:light}
.lv-cert *{box-sizing:border-box; color:inherit!important;font-family:inherit;letter-spacing:normal;text-shadow:none!important}
.lv-cert p{font-size:14px!important;line-height:1.4!important;margin:0 0 12px;text-align:left;font-weight:400}
.lv-cert strong{font-weight:700!important}
.lv-cert .lv-cert-corner{position:absolute;z-index:-1;top:0;right:0;width:440px;height:217px;background:#df1920;clip-path:polygon(0 0,100% 0,100% 100%)}
.lv-cert .lv-cert-corner:before{content:"";position:absolute;inset:0 0 8px;background:linear-gradient(125deg,#191919e6,#090909ec),repeating-linear-gradient(90deg,transparent 0 27px,#777 28px 30px),repeating-linear-gradient(0deg,#333 0 24px,#888 25px 27px);clip-path:polygon(0 0,100% 0,100% 100%)}
.lv-cert .lv-cert-brand{position:absolute;top:34px;left:48px;width:310px}
.lv-cert .lv-cert-lockup{display:flex;align-items:center;gap:12px}
.lv-cert .lv-cert-mark{width:66px;height:82px;flex:none}
.lv-cert .lv-cert-wordmark{font-size:33px;line-height:1;white-space:nowrap;font-weight:900;letter-spacing:-1.2px}
.lv-cert .lv-cert-red{color:#c9141b!important}
.lv-cert .lv-cert-tagline{display:block;font-size:7.6px;font-weight:800;margin-top:5px;white-space:nowrap}
.lv-cert .lv-cert-profession{display:block;font-size:8px;letter-spacing:3px;margin-top:5px;white-space:nowrap}
.lv-cert .lv-cert-slogan{text-align:center;margin-top:8px;font-size:11px;line-height:1.5}
.lv-cert .lv-cert-slogan small{display:flex;align-items:center;gap:9px;white-space:nowrap;font-size:8px;letter-spacing:1.8px}
.lv-cert .lv-cert-slogan small:before,.lv-cert .lv-cert-slogan small:after{content:"";height:2px;background:#d71920;flex:1}
.lv-cert .lv-cert-manifesto{position:absolute;right:28px;top:28px;border-left:1px solid #888;padding-left:10px;color:#eee!important;font-size:10px;line-height:1.45;letter-spacing:1.8px}
.lv-cert .lv-cert-ref{display:flex;justify-content:space-between;gap:20px;position:relative;font-size:14px;margin-bottom:28px}
.lv-cert .lv-cert-ref span{background:#fff;max-width:55%;overflow-wrap:anywhere}
.lv-cert .lv-cert-title{font-size:40px!important;font-weight:800!important;text-align:center;line-height:1.08!important;margin:0 0 17px!important;letter-spacing:-1.3px;text-transform:uppercase}
.lv-cert .lv-cert-concern{display:flex;align-items:center;gap:15px;font-size:11px;font-weight:800;letter-spacing:4px;white-space:nowrap;margin-bottom:32px}
.lv-cert .lv-cert-concern:before,.lv-cert .lv-cert-concern:after{content:"";flex:1;height:1.5px;background:linear-gradient(90deg,#171717 55%,#d71920 55%)}
.lv-cert .lv-cert-concern:after{transform:rotate(180deg)}
.lv-cert .lv-cert-body{position:relative;z-index:1;overflow-wrap:anywhere}
.lv-cert .lv-cert-duty{display:grid;grid-template-columns:14px 1fr;gap:10px;margin:0 0 3px}
.lv-cert .lv-cert-duty:before{content:"";width:8px;height:8px;border:2px solid #df111c;border-radius:50%;margin:6px 0 0 2px}
.lv-cert .lv-cert-duty p{margin:0}
.lv-cert .lv-cert-space{height:0}.lv-cert .lv-cert-duty + .lv-cert-space{height:10px}
.lv-cert .lv-cert-subject{font-weight:700;border-left:3px solid #d71920;padding-left:10px}
.lv-cert .lv-cert-signatures{position:relative;display:grid;grid-template-columns:1.8fr 1fr .85fr;gap:22px;align-items:end;margin-top:20px;break-inside:avoid}
.lv-cert .lv-cert-signature{font-size:11px;line-height:1.4}
.lv-cert .lv-cert-authorized{font:italic 24px/1.5 Georgia,serif;min-height:43px}
.lv-cert .lv-cert-signature-line{border-top:1px solid #171717;width:230px;padding-top:4px;font-size:14px;font-weight:700}
.lv-cert .lv-cert-firm{display:block;font-size:19px;font-weight:800;color:#bc1118!important}
.lv-cert .lv-cert-seal{width:132px;height:132px;border:3px double #154b9b;border-radius:50%;padding:9px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#154b9b!important;outline:1px solid #154b9b;outline-offset:3px;text-align:center;font-size:9px;font-weight:800;transform:rotate(-8deg)}
.lv-cert .lv-cert-seal b{font-size:16px;letter-spacing:1px;white-space:nowrap}
.lv-cert .lv-cert-seal .lv-cert-mark{width:38px;height:43px;margin:4px 0}
.lv-cert .lv-cert-verify{text-align:center;font-size:10px;justify-self:end}
.lv-cert .lv-cert-motto{border-left:1px solid #111;padding-left:10px;text-align:left;letter-spacing:1px;font-size:9px;line-height:1.25;margin-bottom:14px}
.lv-cert .lv-cert-motto:after{content:"";display:block;width:38px;height:2px;background:#d71920;margin-top:7px}
.lv-cert .lv-cert-verify img{display:block;width:90px;height:90px;padding:3px;background:white;object-fit:contain;margin-bottom:3px}
.lv-cert .lv-cert-verify strong{display:block}
.lv-cert .lv-cert-watermark{position:absolute;z-index:-1;right:-8px;bottom:130px;width:175px;height:510px;opacity:.045;transform:skewY(-17deg);border:7px solid #111;background:repeating-linear-gradient(90deg,#111 0 2px,transparent 2px 27px),repeating-linear-gradient(0deg,#111 0 2px,transparent 2px 36px)}
.lv-cert .lv-cert-footer{position:absolute;bottom:0;left:0;right:0;height:114px;display:grid;grid-template-columns:1fr 1.2fr 1.2fr;gap:18px;align-items:end;padding:0 45px 17px;color:#fff!important;background:linear-gradient(165deg,#ba1018 0 26%,#272727 26% 42%,#111 42%);clip-path:polygon(0 0,43% 48%,100% 0,100% 100%,0 100%);font-size:9px}
.lv-cert .lv-cert-footer small{display:block;font-size:5.7px;letter-spacing:.6px;color:#ccc!important;margin-top:5px}
@media print{@page{size:A4 portrait;margin:0}html,body{margin:0!important;padding:0!important;background:#fff!important}.lv-cert-scroll{overflow:visible}.lv-cert{width:210mm!important;min-height:297mm!important;margin:0!important;box-shadow:none!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}
`;

function BrandMark() {
  return <svg className="lv-cert-mark" viewBox="0 0 70 86" aria-label="LAND VIEW" role="img"><path d="M4 29 16 25v39l20-10v15L4 84zM24 44l12-6 6 19L59 25h11L40 82z" fill="currentColor"/><path d="M23 8v31M28 3v34M33 0v34M38 10v22" stroke="#d71920" strokeWidth="2.5"/></svg>;
}

function EmphasizedText({ value, issued }: { value: string; issued: Certificate }) {
  const terms = [issued.name, issued.position, "Land View Engineer & Architects", "LAND VIEW — Engineering & Architectural Consultancy"].filter(Boolean);
  const escaped = terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")}|\\b\\d{1,2}(?:st|nd|rd|th)? [A-Z][a-z]+ \\d{4}\\b)`, "gi");
  return <>{value.split(pattern).map((part, index) => index % 2 ? <strong key={index}>{part}</strong> : part)}</>;
}

export function CertificateDocument({ issued }: { issued: Certificate }) {
  const content = certificateContent(issued);
  const date = new Date(issued.issuedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Dhaka" });
  const title = issued.type === "employee" ? "Experience" : issued.type === "project" ? "Project" : "Building";
  return <div className="lv-cert-scroll"><article className="lv-cert" id="landview-certificate-document">
    <style>{certificateStyles}</style>
    <div className="lv-cert-corner"/><div className="lv-cert-watermark"/>
    <div className="lv-cert-brand"><div className="lv-cert-lockup"><BrandMark/><div><div className="lv-cert-wordmark">LAND <span className="lv-cert-red">VIEW</span></div><span className="lv-cert-tagline">ENGINEERING &amp; ARCHITECTURAL CONSULTANCY</span><span className="lv-cert-profession">ARCHITECTS AND ENGINEERS</span></div></div><div className="lv-cert-slogan">স্থাপত্য নির্মাণ হোক নিরাপদ<small>BUILD A SAFER TOMORROW</small></div></div>
    <div className="lv-cert-manifesto">DESIGN<br/>PLAN<br/>SUPERVISE<br/>BUILD<br/>FOR A BETTER<br/>BANGLADESH</div>
    <div className="lv-cert-ref"><span>Ref: {issued.reference || issued.certificateId}</span><span>Date: {date}</span></div>
    <h2 className="lv-cert-title">{title} <span className="lv-cert-red">Certificate</span></h2>
    <div className="lv-cert-concern">TO WHOM IT MAY CONCERN</div>
    <div className="lv-cert-body">
      {content.opening !== "complete" && <p>This is to certify that <strong>{issued.name}</strong>{issued.address && <>, of {issued.address}</>}{content.opening === "continuation" ? <>, <EmphasizedText value={content.continuation} issued={issued}/></> : issued.type === "employee" ? <>, has served in the capacity of <strong>{issued.position}</strong> at <strong>LAND VIEW — Engineering &amp; Architectural Consultancy</strong>.</> : <> is the {issued.position.toLowerCase()} associated with the subject stated below.</>}</p>}
      {issued.type !== "employee" && <p className="lv-cert-subject">{issued.subject}</p>}
      {content.lines.map((line, i) => !line ? <div className="lv-cert-space" key={i}/> : /^[•●▪-]\s*/.test(line) ? <div className="lv-cert-duty" key={i}><p><EmphasizedText value={line.replace(/^[•●▪-]\s*/, "")} issued={issued}/></p></div> : <p key={i}><EmphasizedText value={line} issued={issued}/></p>)}
    </div>
    <div className="lv-cert-signatures"><div className="lv-cert-signature"><div className="lv-cert-authorized">Authorized</div><div className="lv-cert-signature-line">Managing Director &amp; CEO</div><b className="lv-cert-firm">LAND VIEW</b><span>Engineering &amp; Architectural Consultancy</span></div><div className="lv-cert-seal"><b>LAND VIEW</b><BrandMark/><span>BUILD<br/>SAFER SPACES</span></div><div className="lv-cert-verify"><div className="lv-cert-motto">PEOPLE<br/>PLANS<br/>PLACES<br/>POSSIBILITIES</div>{issued.qrUrl && <img src={issued.qrUrl} alt="Certificate verification QR"/>}<strong>Verify Certificate</strong></div></div>
    <footer className="lv-cert-footer"><div>● &nbsp; Feni, Bangladesh<small>LOCAL EXPERTISE. A SAFER TOMORROW.</small></div><div>◎ &nbsp; www.landview.com.bd<small>BUILDING BETTER SPACES TOGETHER</small></div><div>✉ &nbsp; info@landview.com.bd<small>DESIGN | ENGINEER | SUPERVISE</small></div></footer>
  </article></div>;
}

// Print an isolated document so dashboard styles and layout cannot affect the PDF.
export async function printCertificate() {
  const source = document.getElementById("landview-certificate-document");
  if (!source) throw new Error("Open a certificate before printing.");
  const popup = window.open("", "_blank");
  if (!popup) throw new Error("Allow pop-ups to print this certificate.");
  popup.document.open();
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><base href="${window.location.origin}/"><title>LAND VIEW Certificate</title></head><body>${source.outerHTML}</body></html>`);
  popup.document.close();
  try {
    await Promise.all(Array.from(popup.document.images).map(image => image.decode()));
    await popup.document.fonts.ready;
    // Keep the certificate, including long statements, together on one A4 page.
    const paper = popup.document.getElementById("landview-certificate-document")!;
    const height = paper.getBoundingClientRect().height;
    if (height > 1123) {
      const scale = 1123 / height;
      if (scale < .8) throw new Error("The certificate statement is too long for a readable A4 page. Shorten it before printing.");
      paper.style.zoom = String(scale);
    }
    popup.focus();
    popup.print();
  } catch (error) {
    popup.close();
    throw new Error(error instanceof Error && error.message.includes("too long") ? error.message : "The certificate images could not load. Please retry before printing.");
  }
}
