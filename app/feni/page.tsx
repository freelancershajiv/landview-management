import type { Metadata } from "next";
import Link from "next/link";
import PublicHeader from "@/components/public-header";
import { business, jsonLd, siteUrl } from "@/lib/site-info";

export const metadata: Metadata = {
  title: { absolute: "Engineering & Architectural Consultancy in Feni | LAND VIEW" },
  description: "LAND VIEW Engineers & Architects is based in Feni Sadar, providing architectural design, structural engineering, survey, costing and site support for suitable building projects.",
  alternates: { canonical: `${siteUrl}/feni` },
  openGraph: {
    title: "Engineering & Architectural Consultancy in Feni | LAND VIEW",
    description: "Visit or contact LAND VIEW Engineers & Architects in Feni Sadar for architecture and engineering consultancy.",
    url: `${siteUrl}/feni`,
    siteName: business.name,
    locale: "en_BD",
    type: "website",
  },
  robots: { index: true, follow: true },
};

const focus = [
  ["Architectural design", "Building planning, floor plans, elevations and coordinated architectural drawings.", "/services/architectural-design"],
  ["Structural design", "Structural analysis, reinforced-concrete design, foundation coordination and detailing.", "/services/structural-design"],
  ["Survey & soil investigation", "Site measurement, digital survey and soil investigation support for planning and foundation decisions.", "/services/digital-survey"],
  ["Estimate & costing", "Quantity takeoff, BOQ preparation and construction cost estimation.", "/services/estimate-costing"],
  ["Site supervision", "Scheduled site visits, construction observations and drawing-to-site coordination.", "/services/site-supervision"],
  ["Building services", "Electrical and plumbing layouts coordinated with the building design.", "/services/electrical-design"],
] as const;

const css = `
.feni-page{min-height:100vh;background:#07101a;color:#fff}.feni-wrap{width:min(100% - 44px,1160px);margin:0 auto}.feni-hero{padding:78px 0 58px;background:radial-gradient(circle at 80% 16%,rgba(214,31,38,.14),transparent 28%),#07101a;border-bottom:1px solid rgba(255,255,255,.1)}.feni-kicker{display:block;margin-bottom:14px;color:#ef4a50;font-size:12px;font-weight:900;letter-spacing:.16em}.feni-hero h1{max-width:980px;margin:0;font:500 clamp(43px,6vw,74px)/.98 Georgia,"Times New Roman",serif;letter-spacing:-.04em}.feni-hero p{max-width:820px;margin:24px 0 0;color:#c9d1d7;font-size:16px;line-height:1.85}.feni-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:26px}.feni-btn{min-height:46px;display:inline-flex;align-items:center;justify-content:center;padding:0 18px;border-radius:7px;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.05em}.feni-primary{background:#d61f26;color:#fff}.feni-outline{border:1px solid rgba(239,74,80,.65);color:#fff}.feni-section{padding:66px 0}.feni-section h2{margin:0;font:500 clamp(30px,4vw,48px)/1.08 Georgia,"Times New Roman",serif}.feni-section>div>p{max-width:820px;color:#aeb8c0;font-size:15px;line-height:1.85}.feni-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-top:28px}.feni-card{min-height:215px;display:flex;flex-direction:column;padding:24px;border:1px solid rgba(255,255,255,.1);border-radius:12px;background:#0d1721;color:#fff}.feni-card strong{font-size:20px}.feni-card p{color:#aeb8c0;font-size:13px;line-height:1.75}.feni-card span{margin-top:auto;color:#ef4a50;font-size:12px;font-weight:900}.feni-office{background:#0d1721;border-top:1px solid rgba(255,255,255,.08);border-bottom:1px solid rgba(255,255,255,.08)}.feni-facts{display:grid;grid-template-columns:1.3fr .85fr .85fr;gap:14px;margin-top:28px}.feni-fact{padding:24px;border:1px solid rgba(255,255,255,.1);border-radius:10px;background:#0a131c}.feni-fact small{display:block;color:#ef4a50;font-size:12px;font-weight:900;letter-spacing:.08em;margin-bottom:8px}.feni-fact strong,.feni-fact a{color:#fff;font-size:14px;line-height:1.65}.feni-note{margin-top:28px;padding:22px;border-left:3px solid #ef4a50;background:#0a131c;color:#bac3ca;line-height:1.8}@media(max-width:820px){.feni-grid,.feni-facts{grid-template-columns:1fr 1fr}.feni-facts .feni-fact:first-child{grid-column:1/-1}}@media(max-width:620px){.feni-wrap{width:min(100% - 28px,1160px)}.feni-grid,.feni-facts{grid-template-columns:1fr}.feni-facts .feni-fact:first-child{grid-column:auto}.feni-hero{padding:54px 0 46px}}
`;

export default function FeniOfficePage() {
  const pageSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${siteUrl}/feni#webpage`,
        url: `${siteUrl}/feni`,
        name: "LAND VIEW Engineers & Architects in Feni",
        inLanguage: "en-BD",
        about: { "@id": `${siteUrl}/#organization` },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
          { "@type": "ListItem", position: 2, name: "Feni Office", item: `${siteUrl}/feni` },
        ],
      },
    ],
  };

  return <main className="feni-page">
    <style dangerouslySetInnerHTML={{ __html: css }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(pageSchema) }} />
    <PublicHeader />
    <section className="feni-hero"><div className="feni-wrap">
      <span className="feni-kicker">FENI SADAR · BANGLADESH</span>
      <h1>Engineering &amp; architectural consultancy in Feni.</h1>
      <p>LAND VIEW Engineers &amp; Architects is based in Feni Sadar. We coordinate architectural design, structural engineering and related technical services for residential and commercial building projects, with project scope agreed according to the site, requirements and required level of site involvement.</p>
      <div className="feni-actions"><Link className="feni-btn feni-primary" href="/contact">Contact the Feni office</Link><a className="feni-btn feni-outline" href={business.mapUrl} rel="noopener noreferrer">Open map location ↗</a><Link className="feni-btn feni-outline" href="/bn">বাংলা</Link></div>
    </div></section>

    <section className="feni-section feni-office"><div className="feni-wrap">
      <h2>LAND VIEW office information</h2>
      <p>Use the published contact details below when discussing a new project, an existing LAND VIEW project or a required consultancy service.</p>
      <div className="feni-facts">
        <div className="feni-fact"><small>OFFICE ADDRESS</small><strong>F. Rahman AC Market (2nd Floor), S.S.K Road, Feni Sadar, Feni-3900, Bangladesh</strong></div>
        <div className="feni-fact"><small>ENGINEERING</small><a href={`tel:${business.telephone}`}>+88 0140 8080 400</a></div>
        <div className="feni-fact"><small>ARCHITECTURE</small><a href={`tel:${business.architecturePhone}`}>+88 01902 500 400</a></div>
      </div>
      <div className="feni-note">For projects outside Feni, share the project location when contacting LAND VIEW so design coordination, travel and any required site attendance can be considered before the service scope is agreed.</div>
    </div></section>

    <section className="feni-section"><div className="feni-wrap">
      <h2>Architecture and engineering services available from Feni</h2>
      <p>These links describe the published LAND VIEW service scope in more detail. Actual deliverables depend on the project and agreed consultancy appointment.</p>
      <div className="feni-grid">{focus.map(([name, description, href]) => <Link className="feni-card" href={href} key={href}><strong>{name}</strong><p>{description}</p><span>Service details →</span></Link>)}</div>
      <div className="feni-actions"><Link className="feni-btn feni-primary" href="/team">Meet the team</Link><Link className="feni-btn feni-outline" href="/projects">View published projects</Link><Link className="feni-btn feni-outline" href="/services">All services</Link></div>
    </div></section>
  </main>;
}
