import type { Metadata } from "next";
import Link from "next/link";
import PublicHeader from "@/components/public-header";
import { getPublicCaseStudies } from "@/lib/public-case-studies-server";
import { getPublicTestimonials } from "@/lib/public-testimonials-server";
import { business, jsonLd, siteUrl } from "@/lib/site-info";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Building Project Case Studies | LAND VIEW",
  description: "Explore selected LAND VIEW architecture, engineering and construction-support case studies from Feni and across Bangladesh, with project scope, location, stage and published client feedback where available.",
  alternates: { canonical: "/case-studies" },
  openGraph: {
    title: "LAND VIEW Project Case Studies",
    description: "Selected architecture and engineering work from LAND VIEW Engineers & Architects.",
    url: `${siteUrl}/case-studies`,
  },
  twitter: {
    title: "LAND VIEW Project Case Studies",
    description: "Selected architecture and engineering work from LAND VIEW Engineers & Architects.",
  },
};

function projectHref(id?: string) {
  return id ? `/projects/${encodeURIComponent(id)}` : "/projects";
}

export default async function CaseStudiesPage() {
  const [studies, testimonials] = await Promise.all([getPublicCaseStudies(), getPublicTestimonials()]);
  const serviceCount = new Set(studies.flatMap((study) => study.services || [])).size;
  const locations = new Set(studies.map((study) => study.district || study.location || "").filter(Boolean)).size;
  const whatsappText = "Hello LAND VIEW, I reviewed your project case studies and would like to discuss a building project.";
  const whatsappUrl = `https://wa.me/${business.architecturePhone.replace(/\D/g, "")}?text=${encodeURIComponent(whatsappText)}`;

  const schema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${siteUrl}/case-studies#page`,
    url: `${siteUrl}/case-studies`,
    name: "LAND VIEW Project Case Studies",
    about: { "@id": `${siteUrl}/#organization` },
    mainEntity: {
      "@type": "ItemList",
      itemListElement: studies.map((study, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: `${siteUrl}${projectHref(study.projectId)}`,
        name: study.title || study.projectId,
      })),
    },
  };

  return <main className={styles.page}>
    <PublicHeader />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(schema) }} />

    <section className={styles.hero}>
      <div className={`${styles.container} ${styles.heroGrid}`}>
        <div>
          <span className={styles.kicker}>SELECTED PROJECT STORIES · LAND VIEW</span>
          <h1>Real projects. Real scope. Clear technical context.</h1>
          <p>These case studies are drawn from LAND VIEW projects that have been deliberately featured in the public portfolio. Each study uses the project information maintained by our team—location, project stage, services, drawings and imagery—rather than generic marketing examples.</p>
        </div>
        <div className={styles.heroStats}>
          <div><strong>{studies.length}</strong><span>Curated case studies</span></div>
          <div><strong>{serviceCount}</strong><span>Services represented</span></div>
          <div><strong>{locations}</strong><span>Locations represented</span></div>
          <div><strong>{testimonials.length}</strong><span>Published testimonials</span></div>
        </div>
      </div>
    </section>

    <section className={styles.section}>
      <div className={styles.container}>
        <div className={styles.sectionHead}>
          <div><span className={styles.kicker}>FEATURED CASE STUDIES</span><h2>From project requirement to coordinated delivery.</h2></div>
          <p>Featured projects are controlled from LAND VIEW's Public Portfolio admin area, so this page stays aligned with the projects the team has intentionally selected for public presentation.</p>
        </div>

        {studies.length ? <div className={styles.studies}>
          {studies.map((study) => {
            const meta = [study.category, study.currentStage, study.stories ? `${study.stories} Storey` : "", study.area, study.completionYear].filter(Boolean);
            return <article className={styles.study} key={study.projectId}>
              {study.coverImageUrl
                ? <div className={styles.image} style={{ backgroundImage: `url(${study.coverImageUrl})` }} role="img" aria-label={`${study.title || study.projectId} project`} />
                : <div className={styles.imageFallback}>LAND VIEW</div>}
              <div className={styles.copy}>
                <div className={styles.meta}>{meta.map((item) => <span key={String(item)}>{item}</span>)}</div>
                <h3>{study.title || study.projectId}</h3>
                <div className={styles.id}>{study.projectId}{study.location ? ` · ${study.location}` : ""}</div>
                <p className={styles.description}>{study.description || "Open the full public project record for available project details, services and imagery."}</p>
                {study.services?.length ? <div className={styles.scope}><strong>LAND VIEW scope</strong><div className={styles.services}>{study.services.map((service) => <span className={styles.service} key={service}>{service}</span>)}</div></div> : null}
                <div className={styles.actions}>
                  <Link className={styles.button} href={projectHref(study.projectId)}>Open Full Project</Link>
                  {study.mapEnabled ? <Link className={`${styles.button} ${styles.secondary}`} href="/projects/map">View on Project Map</Link> : null}
                </div>
              </div>
            </article>;
          })}
        </div> : <div className={styles.empty}>No project is currently marked as a featured website case study. Feature a published project from Admin → Website → Website Projects and it will appear here automatically.</div>}
      </div>
    </section>

    {testimonials.length ? <section className={`${styles.section} ${styles.sectionAlt}`}>
      <div className={styles.container}>
        <div className={styles.sectionHead}>
          <div><span className={styles.kicker}>CLIENT FEEDBACK</span><h2>Published feedback from LAND VIEW clients.</h2></div>
          <p>Only testimonials explicitly entered and published by LAND VIEW are shown here. We do not generate or infer client reviews.</p>
        </div>
        <div className={styles.testimonials}>
          {testimonials.map((item) => <article className={styles.quote} key={item.id}>
            <span className={styles.quoteMark}>“</span>
            <blockquote>{item.quote}</blockquote>
            <footer><strong>{item.clientName}</strong><span>{[item.clientRole, item.projectCode, item.location, item.serviceLabel].filter(Boolean).join(" · ")}</span></footer>
          </article>)}
        </div>
      </div>
    </section> : null}

    <section className={styles.cta}>
      <div className={`${styles.container} ${styles.ctaInner}`}>
        <div><span className={styles.kicker}>START YOUR PROJECT</span><h2>Have a site or building requirement of your own?</h2><p>Share the location, proposed building use, number of floors and services you need. LAND VIEW can then help define the appropriate design and engineering scope.</p></div>
        <div className={styles.ctaActions}><a className={styles.button} href={whatsappUrl} target="_blank" rel="noopener noreferrer">Discuss on WhatsApp</a><Link className={`${styles.button} ${styles.secondary}`} href="/contact">Project Enquiry</Link><Link className={`${styles.button} ${styles.secondary}`} href="/projects">All Projects</Link></div>
      </div>
    </section>
  </main>;
}
