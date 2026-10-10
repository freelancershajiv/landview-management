import { certificateContent } from "../lib/certificate-content";

type Certificate = {
  type: "employee" | "intern" | "project" | "building";
  name: string; address: string; position: string; subject: string;
  reference: string; certificateId: string; issuedAt: string;
  description: string; fatherName?: string; motherName?: string; nidNo?: string; qrUrl?: string; verificationUrl?: string;
  institution?: string; department?: string; studentId?: string; supervisor?: string; trainingArea?: string; serviceFrom?: string; serviceTo?: string;
};

export const certificateStyles = `
@font-face{font-family:"Certificate Bengali";src:url("/fonts/noto-sans-bengali-400.woff2") format("woff2");font-style:normal;font-weight:400;font-display:block}
.lv-cert-scroll{overflow-x:auto;width:100%}
.lv-cert{box-sizing:border-box!important;position:relative;isolation:isolate;width:794px;min-height:1123px;margin:0 auto;background:var(--theme-bg-_fff,#fff)!important;color:#171717!important;border:3px solid var(--theme-line-_d71920,#d71920);padding:172px 48px 100px;font:14px/1.5 Arial,Helvetica,"Certificate Bengali",sans-serif!important;box-shadow:0 18px 60px var(--theme-shadow-_0004,#0004);overflow:hidden;color-scheme:light}
.lv-cert *{box-sizing:border-box;color:inherit!important;font-family:inherit;letter-spacing:normal;text-shadow:none!important}
.lv-cert p{font-size:14px!important;line-height:1.53!important;margin:0 0 13px;text-align:justify;text-justify:inter-word;font-weight:400}
.lv-cert strong{font-weight:700!important}
.lv-cert .lv-cert-corner{position:absolute;z-index:-1;top:0;right:0;width:330px;height:165px;background:#df1920;clip-path:polygon(0 0,100% 0,100% 100%)}
.lv-cert .lv-cert-corner:before{content:"";position:absolute;inset:0 0 6px;background:linear-gradient(125deg,var(--theme-bg-_191919e6,#191919e6),var(--theme-bg-_090909ec,#090909ec));clip-path:polygon(0 0,100% 0,100% 100%)}
.lv-cert .lv-cert-brand{position:absolute;top:28px;left:42px;width:330px}
.lv-cert .lv-cert-lockup{display:flex;align-items:center;gap:11px}
.lv-cert .lv-cert-logo{display:block;width:58px;height:58px;object-fit:contain;flex:none}
.lv-cert .lv-cert-brandwords{display:flex;flex-direction:column;gap:4px}
.lv-cert .lv-cert-brandwords strong{font-size:30px!important;line-height:1;font-weight:900!important;letter-spacing:-1.1px!important;white-space:nowrap}
.lv-cert .lv-cert-brandwords strong span{color:#c9141b!important}
.lv-cert .lv-cert-brandwords small{font-size:8px;font-weight:800;letter-spacing:1.55px;white-space:nowrap}
.lv-cert .lv-cert-slogan{text-align:center;margin-top:9px;font-size:10.5px;line-height:1.45;max-width:305px}
.lv-cert .lv-cert-slogan small{display:flex;align-items:center;gap:9px;white-space:nowrap;font-size:7.7px;letter-spacing:1.7px;margin-top:2px}
.lv-cert .lv-cert-slogan small:before,.lv-cert .lv-cert-slogan small:after{content:"";height:2px;background:#d71920;flex:1}
.lv-cert .lv-cert-manifesto{position:absolute;right:20px;top:22px;border-left:1px solid var(--theme-line-_888,#888);padding-left:8px;color:var(--theme-ink-_eee,#eee)!important;font-size:9px;line-height:1.4;letter-spacing:1.45px}
.lv-cert .lv-cert-ref{display:flex;justify-content:space-between;gap:20px;position:relative;font-size:13.5px;margin-bottom:22px}
.lv-cert .lv-cert-ref span{background:var(--theme-bg-_fff,#fff);max-width:58%;overflow-wrap:anywhere}
.lv-cert .lv-cert-title{font-size:31px!important;font-weight:800!important;text-align:center;line-height:1.08!important;margin:0 0 14px!important;letter-spacing:-.8px;text-transform:uppercase}
.lv-cert .lv-cert-red{color:#c9141b!important}
.lv-cert .lv-cert-concern{display:flex;align-items:center;gap:15px;font-size:10.5px;font-weight:800;letter-spacing:3.5px;white-space:nowrap;margin-bottom:22px}
.lv-cert .lv-cert-concern:before,.lv-cert .lv-cert-concern:after{content:"";flex:1;height:1.5px;background:linear-gradient(90deg,var(--theme-bg-_171717,#171717) 55%,#d71920 55%)}
.lv-cert .lv-cert-concern:after{transform:rotate(180deg)}
.lv-cert .lv-cert-body{position:relative;z-index:1;overflow-wrap:anywhere;max-width:100%}
.lv-cert .lv-cert-body>p:last-child{margin-bottom:0}
.lv-cert .lv-cert-duty{display:grid;grid-template-columns:14px 1fr;gap:10px;margin:0 0 5px}
.lv-cert .lv-cert-duty:before{content:"";width:8px;height:8px;border:2px solid var(--theme-line-_df111c,#df111c);border-radius:50%;margin:7px 0 0 2px}
.lv-cert .lv-cert-duty p{margin:0;text-align:justify;text-justify:inter-word}
.lv-cert .lv-cert-space{height:0}.lv-cert .lv-cert-duty + .lv-cert-space{height:10px}
.lv-cert .lv-cert-identity{display:grid;grid-template-columns:1fr 1fr;border:1px solid var(--theme-line-_d6d9dc,#d6d9dc);border-radius:5px;overflow:hidden;margin:12px 0 14px;background:#fafafa}
.lv-cert .lv-cert-identity div{display:grid;grid-template-columns:108px 1fr;gap:8px;padding:7px 10px;border-bottom:1px solid var(--theme-line-_e1e3e5,#e1e3e5);font-size:11.3px;line-height:1.25}
.lv-cert .lv-cert-identity div:nth-child(odd){border-right:1px solid var(--theme-line-_e1e3e5,#e1e3e5)}
.lv-cert .lv-cert-identity b{font-weight:800}
.lv-cert .lv-cert-signatures{position:relative;display:flex;justify-content:space-between;align-items:flex-end;gap:30px;margin-top:26px;break-inside:avoid;text-align:center}
.lv-cert .lv-cert-verify{display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;font-size:10px;min-width:150px}
.lv-cert .lv-cert-verify img{display:block;width:100px;height:100px;padding:5px;background:var(--theme-bg-_fff,#fff);object-fit:contain;margin:0 auto 6px;image-rendering:auto}
.lv-cert .lv-cert-verify strong{display:block;font-size:10.5px;font-weight:800}.lv-cert .lv-cert-verify span{display:block;color:var(--theme-ink-_555,#555)!important;line-height:1.25;margin-top:2px;font-size:8.5px}
.lv-cert .lv-cert-signatory{min-width:205px;padding-top:32px}
.lv-cert .lv-cert-signatory:before{content:"";display:block;border-top:1px solid #555;margin-bottom:7px}
.lv-cert .lv-cert-signatory strong{display:block;font-size:11px!important}.lv-cert .lv-cert-signatory span{display:block;font-size:9px;color:#555!important;margin-top:2px}
.lv-cert .lv-cert-footer{position:absolute;bottom:0;left:0;right:0;height:78px;display:grid;grid-template-columns:1fr 1.15fr 1.15fr 1.25fr;align-items:center;padding:18px 22px 8px;background:var(--theme-bg-_101010,#101010);color:var(--theme-ink-_fff,#fff)!important;border-top:2px solid var(--theme-line-_d71920,#d71920);font-size:9.5px;font-weight:700;overflow:visible}
.lv-cert .lv-cert-footer:before{content:"";position:absolute;left:-2px;top:-24px;width:190px;height:27px;background:#d71920;clip-path:polygon(0 0,100% 62%,0 100%)}
.lv-cert .lv-cert-footer div{min-width:0;line-height:1.25;text-align:center;padding:0 8px;border-right:1px solid var(--theme-line-_ffffff2b,#ffffff2b)}
.lv-cert .lv-cert-footer div:last-child{border-right:0}
.lv-cert .lv-cert-footer strong{display:block;color:var(--theme-ink-_fff,#fff)!important;font-size:9.5px!important;line-height:1.25;white-space:nowrap}
.lv-cert .lv-cert-footer small{display:block;font-size:6.2px;line-height:1.25;letter-spacing:.3px;color:var(--theme-ink-_d6d6d6,#d6d6d6)!important;margin-top:3px;font-weight:500;white-space:nowrap}
.lv-cert .lv-cert-footer .lv-cert-phone strong,.lv-cert .lv-cert-footer .lv-cert-phone small{white-space:nowrap}
@media print{@page{size:A4 portrait;margin:0}html,body{margin:0!important;padding:0!important;background:#fff!important}.lv-cert-scroll{overflow:visible}.lv-cert{width:210mm!important;min-height:297mm!important;margin:0!important;box-shadow:none!important;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}.lv-cert .lv-cert-verify img{width:26mm!important;height:26mm!important;padding:1.2mm!important}.lv-cert .lv-cert-footer{height:78px!important;padding:18px 22px 8px!important;font-size:9.5px!important}.lv-cert .lv-cert-footer strong{font-size:9.5px!important}.lv-cert .lv-cert-footer small{font-size:6.2px!important}}
`;

function EmphasizedText({ value, issued }: { value: string; issued: Certificate }) {
  const terms = [issued.name, issued.position, issued.institution || "", "Land View Engineer & Architects", "LAND VIEW — Engineering & Architectural Consultancy"].filter(Boolean);
  const escaped = terms.map(term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = new RegExp(`(${escaped.join("|")}|\\b\\d{1,2}(?:st|nd|rd|th)? [A-Z][a-z]+ \\d{4}\\b)`, "gi");
  return <>{value.split(pattern).map((part, index) => index % 2 ? <strong key={index}>{part}</strong> : part)}</>;
}

function certificateTitle(issued: Certificate) {
  const subject = String(issued.subject || "").trim();
  if (subject) return subject.replace(/\s+certificate$/i, "").trim();
  if (issued.type === "intern") return "Internship";
  if (issued.type === "employee") return "Employee";
  if (issued.type === "project") return "Project";
  return "Building";
}

function dateOnly(value?: string) {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00+06:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Dhaka" });
}

export function CertificateDocument({ issued }: { issued: Certificate }) {
  const content = certificateContent(issued);
  const date = new Date(issued.issuedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Dhaka" });
  const title = certificateTitle(issued);
  const showEmployeeIdentity = issued.type === "employee" && (issued.fatherName || issued.motherName || issued.nidNo || issued.reference);
  const showInternIdentity = issued.type === "intern" && (issued.institution || issued.department || issued.studentId || issued.serviceFrom || issued.serviceTo);

  return <div className="lv-cert-scroll"><article className="lv-cert" id="landview-certificate-document">
    <style>{certificateStyles}</style>
    <div className="lv-cert-corner"/>
    <div className="lv-cert-brand">
      <div className="lv-cert-lockup"><img className="lv-cert-logo" src="/land-view-logo.svg" alt="LAND VIEW logo"/><div className="lv-cert-brandwords"><strong>LAND <span>VIEW</span></strong><small>ENGINEERS AND ARCHITECTS</small></div></div>
      <div className="lv-cert-slogan">স্থাপত্য নির্মাণ হোক নিরাপদ<small>BUILD A SAFER TOMORROW</small></div>
    </div>
    <div className="lv-cert-manifesto">DESIGN<br/>PLAN<br/>SUPERVISE<br/>BUILD<br/>FOR A BETTER<br/>BANGLADESH</div>
    <div className="lv-cert-ref"><span>Certificate No.: {issued.certificateId}</span><span>Date: {date}</span></div>
    {issued.reference && <div className="lv-cert-ref" style={{marginTop:-15,marginBottom:17,fontSize:11.5}}><span>Reference: {issued.reference}</span><span/></div>}
    <h2 className="lv-cert-title">{title} <span className="lv-cert-red">Certificate</span></h2>
    <div className="lv-cert-concern">TO WHOM IT MAY CONCERN</div>
    <div className="lv-cert-body">
      {content.opening !== "complete" && <p>This is to certify that <strong>{issued.name}</strong>{issued.address && <>, of {issued.address}</>}{content.opening === "continuation" ? <>, <EmphasizedText value={content.continuation} issued={issued}/></> : issued.type === "employee" ? <>, has served in the capacity of <strong>{issued.position}</strong> at <strong>LAND VIEW — Engineering &amp; Architectural Consultancy</strong>.</> : issued.type === "intern" ? <>, has completed practical training / internship with <strong>LAND VIEW — Engineering &amp; Architectural Consultancy</strong>{issued.position ? <> in the role of <strong>{issued.position}</strong></> : null}.</> : <> is the {issued.position.toLowerCase()} associated with the subject stated below.</>}</p>}
      {showEmployeeIdentity && <div className="lv-cert-identity">
        <div><b>Father's Name:</b><span>{issued.fatherName || "—"}</span></div>
        <div><b>Mother's Name:</b><span>{issued.motherName || "—"}</span></div>
        <div><b>NID No:</b><span>{issued.nidNo || "—"}</span></div>
        <div><b>Employee ID:</b><span>{issued.reference || "—"}</span></div>
      </div>}
      {showInternIdentity && <div className="lv-cert-identity">
        <div><b>Institute:</b><span>{issued.institution || "—"}</span></div>
        <div><b>Department:</b><span>{issued.department || "—"}</span></div>
        <div><b>Student ID:</b><span>{issued.studentId || issued.reference || "—"}</span></div>
        <div><b>Internship:</b><span>{dateOnly(issued.serviceFrom)} – {dateOnly(issued.serviceTo)}</span></div>
      </div>}
      {content.lines.map((line, i) => !line ? <div className="lv-cert-space" key={i}/> : /^[•●▪-]\s*/.test(line) ? <div className="lv-cert-duty" key={i}><p><EmphasizedText value={line.replace(/^[•●▪-]\s*/, "")} issued={issued}/></p></div> : <p key={i}><EmphasizedText value={line} issued={issued}/></p>)}
    </div>
    <div className="lv-cert-signatures">
      <div className="lv-cert-verify">{issued.qrUrl && <img src={issued.qrUrl} alt="Certificate verification QR"/>}<strong>Verify Certificate</strong><span>Scan to verify authenticity and current status.</span></div>
      <div className="lv-cert-signatory"><strong>Authorized Signatory</strong><span>LAND VIEW — Engineers and Architects</span></div>
    </div>
    <footer className="lv-cert-footer"><div><strong>● &nbsp; Feni, Bangladesh</strong><small>LOCAL EXPERTISE · SAFER TOMORROW</small></div><div><strong>◎ &nbsp; www.landview.com.bd</strong><small>ENGINEERING &amp; ARCHITECTURAL CONSULTANCY</small></div><div><strong>✉ &nbsp; info@landview.com.bd</strong><small>DESIGN · ENGINEER · SUPERVISE</small></div><div className="lv-cert-phone"><strong>☎ &nbsp; +88 0140 80 80 400</strong><small>+88 01902 500 400</small></div></footer>
  </article></div>;
}

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
