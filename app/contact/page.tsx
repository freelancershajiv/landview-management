import type { Metadata } from "next";
import Link from "next/link";
import PublicHeader from "@/components/public-header";
import { business, siteUrl, jsonLd } from "@/lib/site-info";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Contact Our Engineering & Architecture Team in Feni",
  description: "Contact LAND VIEW Engineers & Architects at S.S.K Road, Feni, Bangladesh. Call engineering or architecture, email your project brief, or get office directions.",
  alternates: { canonical: "/contact" },
  openGraph: { title: "Contact LAND VIEW Engineers & Architects", description: "Discuss building design, structural engineering and site supervision with our Feni office.", url: `${siteUrl}/contact` },
  twitter: { title: "Contact LAND VIEW Engineers & Architects", description: "Discuss your project with LAND VIEW in Feni, Bangladesh." },
};

export default function ContactPage() {
  const schema = { "@context": "https://schema.org", "@type": "ContactPage", "@id": `${siteUrl}/contact#page`, url: `${siteUrl}/contact`, name: "Contact LAND VIEW", about: { "@id": `${siteUrl}/#organization` }, breadcrumb: { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: siteUrl }, { "@type": "ListItem", position: 2, name: "Contact", item: `${siteUrl}/contact` }] } };
  return <main className={styles.page}>
    <PublicHeader />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} />
    <div className={styles.wrap}>
      <nav aria-label="Breadcrumb"><Link href="/">Home</Link><span> / Contact</span></nav>
      <header className={styles.hero}><span className={styles.eyebrow}>FENI OFFICE · BANGLADESH</span><h1>Let’s discuss your building project.</h1><p>Talk to LAND VIEW Engineers &amp; Architects about architectural planning, structural design, building services or site supervision. Start with your project location and the support you need.</p></header>
      <div className={styles.grid}>
        <section className={styles.panel}><h2>Contact our team</h2><dl><dt>Engineering enquiries</dt><dd><a href={`tel:${business.telephone}`}>+88 0140 8080 400</a></dd><dt>Architecture enquiries</dt><dd><a href={`tel:${business.architecturePhone}`}>+88 01902 500 400</a></dd><dt>Email</dt><dd><a href={`mailto:${business.email}`}>{business.email}</a></dd></dl></section>
        <section className={styles.panel}><h2>Visit LAND VIEW in Feni</h2><address>F. Rahman AC Market (2nd Floor)<br />S.S.K Road, Feni Sadar<br />Feni-3900, Bangladesh</address><p>Call before visiting to arrange a discussion with the relevant team.</p><a className={styles.button} href={business.mapUrl} target="_blank" rel="noopener noreferrer">Get office directions</a></section>
        <section className={styles.panel}><h2>What to include in your brief</h2><ul><li>Project location and site measurements</li><li>Building use and proposed number of floors</li><li>Available survey, soil report or existing drawings</li><li>Design services, site support and timeline needed</li></ul><p>These details help us define deliverables, coordination and a project-specific quotation.</p></section>
        <section className={styles.panel}><h2>Projects across Bangladesh</h2><p>Our office is in Feni. For projects elsewhere in Bangladesh, contact us with the location and service requirements so we can confirm design coordination and any travel or site attendance arrangements.</p><div className={styles.links}><Link href="/services">Explore our services</Link><Link href="/projects">See published projects</Link><Link href="/team">Meet the team</Link></div></section>
      </div>
    </div>
  </main>;
}
