import type { Metadata } from "next";
import Link from "next/link";
import PublicHeader from "@/components/public-header";
import { business, jsonLd, siteUrl } from "@/lib/site-info";
import styles from "./page.module.css";

const canonical = "https://www.landview.com.bd/guides/building-design-feni";

export const metadata: Metadata = {
  title: { absolute: "Building Design in Feni: Planning Checklist | LAND VIEW" },
  description: "Planning a building in Feni? Prepare your plot information, room requirements, survey, soil investigation, structural design, approval drawings and estimate with this practical checklist from LAND VIEW.",
  alternates: { canonical },
  openGraph: {
    type: "article",
    url: canonical,
    siteName: business.name,
    title: "Building Design in Feni: A Practical Planning Checklist",
    description: "A practical first-step guide to architectural planning, structural coordination, soil investigation, approval documents and project costing in Feni.",
  },
  robots: { index: true, follow: true },
};

const preparation = [
  {
    title: "1. Gather reliable plot and location information",
    text: "Start with the location, available plot measurements, road access and the land documents you already have. If a reliable survey or boundary drawing is available, bring it. Where measurements or site conditions are uncertain, identify the need for verification before committing to a building layout.",
    links: [{ label: "Digital land survey support", href: "/services/digital-survey" }],
  },
  {
    title: "2. Define how the building should work",
    text: "Record the proposed building use, intended number of floors, approximate floor area, room requirements, circulation, access, ventilation, daylight and future expansion needs. These priorities help an architectural designer prepare a useful first concept without treating an early sketch as an approved final plan.",
    links: [{ label: "Architectural design services", href: "/services/architectural-design" }],
  },
  {
    title: "3. Coordinate structure and ground conditions early",
    text: "Floor layouts, column positions, foundation options and the intended building use affect each other. A structural engineer needs dependable architectural information and appropriate site or soil data. Do not select a footing or pile type from a nearby project's drawing alone; the correct solution depends on the actual site and design loads.",
    links: [
      { label: "Structural engineering", href: "/services/structural-design" },
      { label: "Soil investigation coordination", href: "/services/soil-test" },
    ],
  },
  {
    title: "4. Check applicable approval requirements",
    text: "Building approval requirements depend on the responsible local authority, land and road conditions, building use and project scope. Discuss which drawings, surveys, certificates or other supporting documents are required with the appropriate authority or qualified project consultant before treating a design as ready for submission.",
    links: [{ label: "Plan approval drawing support", href: "/services/plan-approval" }],
  },
  {
    title: "5. Budget for design, construction and site coordination",
    text: "Ask for a clear written scope: which drawings are included, what revisions are expected, and whether engineering, services, approval support or site visits are separate items. A quantity takeoff or cost estimate is more useful once a defined design and technical assumptions are available. Review changes before construction decisions are finalized.",
    links: [
      { label: "Estimate and costing", href: "/services/estimate-costing" },
      { label: "Site supervision", href: "/services/site-supervision" },
    ],
  },
];

const checklist = [
  "Plot location and available land measurements",
  "Any existing survey, site plan or boundary information",
  "Intended building use and approximate floor count",
  "Room, access, parking and circulation requirements",
  "Available soil information or a plan for investigation",
  "Known authority or approval-document requirements",
  "Target budget, schedule and expected consultancy deliverables",
];

const questions = [
  {
    question: "Can architectural planning start before a soil report is available?",
    answer: "An initial discussion about the room requirements and site can begin. However, structural and foundation design should use appropriate ground information. Confirm when soil investigation is required in the agreed design process.",
  },
  {
    question: "Does the same building plan work on two different plots?",
    answer: "Not necessarily. Site dimensions, boundaries, access, orientation, authority requirements, soil conditions and the client's needs can differ. Even similar buildings should be assessed for their own site.",
  },
  {
    question: "Who determines the documents needed for building approval in Feni?",
    answer: "The responsible approving authority determines its current requirements. LAND VIEW can discuss drawing and documentation support for the agreed project scope; approval itself is subject to the authority's review.",
  },
];

export default function BuildingDesignFeniGuide() {
  const pageSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": canonical + "#webpage",
        url: canonical,
        name: "Building Design in Feni: Planning Checklist",
        inLanguage: "en-BD",
        about: { "@id": siteUrl + "/#organization" },
        publisher: { "@id": siteUrl + "/#organization" },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: siteUrl },
          { "@type": "ListItem", position: 2, name: "Feni Office", item: siteUrl + "/feni" },
          { "@type": "ListItem", position: 3, name: "Building Design Planning Guide", item: canonical },
        ],
      },
    ],
  };

  return (
    <div className={styles.page}>
      <PublicHeader />
      <main id="main-content" className={styles.main}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(pageSchema) }} />
        <div className={styles.wrap}>
          <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
            <Link href="/">Home</Link><span aria-hidden="true">/</span>
            <Link href="/feni">Feni office</Link><span aria-hidden="true">/</span>
            <span>Building planning guide</span>
          </nav>
          <header className={styles.hero}>
            <p className={styles.kicker}>LAND VIEW · PRACTICAL PLANNING GUIDE</p>
            <h1>Planning a building in Feni? Start with the right information.</h1>
            <p className={styles.lead}>Before paying for detailed drawings or starting construction, define the site, building requirements and technical scope. This checklist explains how architectural planning, structural engineering, soil information, approvals and costing connect.</p>
            <div className={styles.actions}>
              <Link href="/contact" className={styles.primary}>Discuss your project</Link>
              <Link href="/services" className={styles.secondary}>Explore design services</Link>
            </div>
          </header>

          <section className={styles.intro} aria-labelledby="guide-intro">
            <h2 id="guide-intro">What to prepare before the first design meeting</h2>
            <p>Not every project begins with a complete set of documents. Use this checklist to distinguish what you know, what needs confirmation and which specialist input may be needed before moving to detailed drawings.</p>
            <ul className={styles.checklist}>
              {checklist.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>

          <section className={styles.section} aria-labelledby="guide-steps">
            <h2 id="guide-steps">Five decisions that shape a buildable plan</h2>
            <div className={styles.steps}>
              {preparation.map((step) => (
                <article className={styles.step} key={step.title}>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                  <div className={styles.links}>
                    {step.links.map((link) => <Link key={link.href} href={link.href}>{link.label} →</Link>)}
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className={styles.section} aria-labelledby="guide-questions">
            <h2 id="guide-questions">Questions clients commonly ask</h2>
            <div className={styles.faq}>
              {questions.map((item) => <details key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
              </details>)}
            </div>
          </section>

          <section className={styles.cta} aria-labelledby="guide-next">
            <div>
              <p className={styles.kicker}>YOUR NEXT STEP</p>
              <h2 id="guide-next">Bring the site details. We can help define the scope.</h2>
              <p>LAND VIEW works from Feni Sadar and discusses suitable architecture and engineering projects in Feni and elsewhere in Bangladesh. The actual services, site attendance and deliverables depend on the agreed appointment.</p>
            </div>
            <div className={styles.actions}>
              <Link href="/feni" className={styles.secondary}>Feni office details</Link>
              <Link href="/contact" className={styles.primary}>Contact LAND VIEW</Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
