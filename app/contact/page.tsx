import type { Metadata } from "next";
import Link from "next/link";
import PublicHeader from "@/components/public-header";
import PublicContactEnquiry from "@/components/public-contact-enquiry";
import { business, siteUrl, jsonLd } from "@/lib/site-info";
import { getWebsiteContent } from "@/lib/website-content-server";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Contact LAND VIEW | Architecture & Engineering Consultancy in Feni",
  description: "Discuss your building project with LAND VIEW Engineers & Architects in Feni, Bangladesh. Submit a project enquiry, contact architecture or engineering, send details on WhatsApp or get office directions.",
  alternates: { canonical: "/contact" },
  openGraph: { title: "Start a Project with LAND VIEW Engineers & Architects", description: "Share your project location, building type, proposed floors and required services with LAND VIEW in Feni, Bangladesh.", url: `${siteUrl}/contact`, siteName: business.name, type: "website" },
  twitter: { card: "summary_large_image", title: "Start a Project with LAND VIEW", description: "Architecture, engineering, approval and site-support enquiries from Feni, Bangladesh." },
};

function digits(value:string){return value.replace(/\D/g,"");}
function displayBd(value:string){const d=digits(value).replace(/^88/,""); return d.length===11?`+88 ${d.slice(0,5)} ${d.slice(5,8)} ${d.slice(8)}`:value;}

export default async function ContactPage() {
  const content = await getWebsiteContent();
  const g = content.general;
  const quickWhatsapp = `https://wa.me/${digits(g.whatsappPhone)}?text=${encodeURIComponent("Hello LAND VIEW, I would like to discuss a building project.")}`;
  const officeLines = g.officeAddress.split(",").map(x=>x.trim()).filter(Boolean);
  const schema = {
    "@context": "https://schema.org", "@type": "ContactPage", "@id": `${siteUrl}/contact#page`, url: `${siteUrl}/contact`, name: `Contact ${g.businessName}`,
    description: `Project enquiry and contact information for ${g.businessName} in Feni, Bangladesh.`, about: { "@id": `${siteUrl}/#organization` },
    breadcrumb: { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: siteUrl }, { "@type": "ListItem", position: 2, name: "Contact", item: `${siteUrl}/contact` }] },
  };

  return <main className={`${styles.page} public-site`}>
    <PublicHeader />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} />
    <section className={styles.hero}><div className={styles.wrap}><nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Home</Link><span> / Contact</span></nav><div className={styles.heroGrid}><div className={styles.heroCopy}><span className={styles.eyebrow}>LAND VIEW · FENI, BANGLADESH</span><h1>Start with the project. We’ll help define the next step.</h1><p>Whether you are planning a new building, redesigning an existing one, preparing for approval or moving into construction, share the essential project information with our architecture and engineering team.</p><div className={styles.heroActions}><a className={styles.primaryButton} href="#project-enquiry">Start project enquiry</a><a className={styles.whatsappButton} href={quickWhatsapp} target="_blank" rel="noopener noreferrer">WhatsApp {displayBd(g.whatsappPhone).replace(/^\+88\s*/,"")}</a></div></div><div className={styles.heroAside}><span>CONTACT PATH</span><ol><li><b>01</b><div><strong>Share your project</strong><p>Location, project type, floors, land area and required services.</p></div></li><li><b>02</b><div><strong>Technical review</strong><p>We identify the relevant architecture, engineering, approval or site-support scope.</p></div></li><li><b>03</b><div><strong>Next-step discussion</strong><p>LAND VIEW follows up for drawings, site information, meeting or quotation as needed.</p></div></li></ol></div></div></div></section>
    <section className={styles.contactStrip}><div className={`${styles.wrap} ${styles.contactStripGrid}`}><article className={styles.contactCard}><span className={styles.cardIndex}>01 / WHATSAPP</span><h2>Project enquiries</h2><a className={styles.contactValue} href={quickWhatsapp} target="_blank" rel="noopener noreferrer">{displayBd(g.whatsappPhone).replace(/^\+88\s*/,"")}</a><p>Best for sending a project brief, drawings, location details and follow-up messages.</p></article><article className={styles.contactCard}><span className={styles.cardIndex}>02 / ARCHITECTURE</span><h2>Architecture team</h2><a className={styles.contactValue} href={`tel:${g.architecturePhone}`}>{displayBd(g.architecturePhone)}</a><p>Architectural planning, 3D design, interior coordination and design discussions.</p></article><article className={styles.contactCard}><span className={styles.cardIndex}>03 / ENGINEERING</span><h2>Engineering team</h2><a className={styles.contactValue} href={`tel:${g.engineeringPhone}`}>{displayBd(g.engineeringPhone)}</a><p>Structural, technical building services, construction and engineering coordination.</p></article><article className={styles.contactCard}><span className={styles.cardIndex}>04 / EMAIL</span><h2>Documents & email</h2><a className={styles.contactValueSmall} href={`mailto:${g.email}`}>{g.email}</a><p>Useful for formal documents, larger drawing sets and written project correspondence.</p></article></div></section>
    <section className={styles.enquirySection}><div className={styles.wrap}><PublicContactEnquiry /></div></section>
    <section className={styles.visitSection}><div className={`${styles.wrap} ${styles.visitGrid}`}><div className={styles.officePanel}><span className={styles.eyebrow}>VISIT LAND VIEW</span><h2>Meet the team at our Feni office.</h2><address>{officeLines.map((line,index)=><span key={`${line}-${index}`}>{line}{index<officeLines.length-1?<br/>:null}</span>)}</address><p>For a project meeting, calling or messaging first helps us arrange the relevant architect or engineer for your discussion.</p><div className={styles.officeActions}><a className={styles.primaryButton} href={g.mapsUrl} target="_blank" rel="noopener noreferrer">Get office directions</a><a className={styles.secondaryButton} href={`tel:${g.architecturePhone}`}>Call architecture</a></div></div><div className={styles.briefPanel}><span className={styles.cardIndex}>WHAT HELPS US RESPOND FASTER</span><h3>Bring the information you already have.</h3><ul><li><b>Site:</b> project location, land measurements and any existing survey.</li><li><b>Building:</b> intended use, approximate floor count and space requirements.</li><li><b>Technical:</b> soil report, existing drawings or previous approval documents if available.</li><li><b>Scope:</b> which design, approval, estimate or supervision services you need.</li><li><b>Timeline:</b> any important approval, design or construction target you are working toward.</li></ul></div></div></section>
    <section className={styles.exploreSection}><div className={`${styles.wrap} ${styles.exploreGrid}`}><div><span className={styles.eyebrow}>BEFORE YOU ENQUIRE</span><h2>Explore how LAND VIEW works.</h2><p>Review our services and published projects first if you want a clearer idea of the disciplines LAND VIEW can coordinate for your project.</p></div><div className={styles.exploreLinks}><Link href="/services"><span>Services</span><b>Architecture, engineering & project support →</b></Link><Link href="/projects"><span>Projects</span><b>Browse published LAND VIEW work →</b></Link><Link href="/case-studies"><span>Case Studies</span><b>Selected featured project stories →</b></Link><Link href="/projects/map"><span>Project Map</span><b>Explore projects geographically →</b></Link><Link href="/team"><span>Team</span><b>Meet LAND VIEW professionals →</b></Link></div></div></section>
  </main>;
}
